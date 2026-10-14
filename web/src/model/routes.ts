// Route planning: a flight from one planet (label) to another. Pure functions over the galaxy.
//
// Rules: 10 planets in 5 systems, 2 planets each. Between start and finish the flight always crosses
// 3 neighbouring systems (if the two systems are close, it detours through neighbours); among all
// 5-system paths it takes the one with the strongest style links and the shortest jumps.
// In each system: in through a gate facing the previous system, out through a gate facing the next.
// Start and finish in the same system → a round trip out through 3 neighbours and back.
// Planning uses catalogue positions (orbits at t=0), so the same pair always gives the same route.
import type { Chunk, TrackRef } from "../core/types";
import { type Galaxy, midYear, shareOf } from "./galaxy";

export const ROUTE_SYSTEMS = 5;
export const MIN_ROUTE_TRACKS = 20;

/** `star` is set on a system tour: a loop round one star instead of a flight between two planets */
export type RoutePlan = { a: number; b: number; stops: number[]; hops: number[]; star?: number };
export type Route = RoutePlan & { tracks: TrackRef[][]; flat: TrackRef[] };

/** strongest-link path between two styles (Dijkstra; strong links are short) */
export function starPath(g: Galaxy, a: number, b: number): number[] {
  const n = g.stars.length, dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
  dist[a] = 0;
  for (;;) {
    let u = -1; for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === b) break; done[u] = true;
    for (const { s: v, w } of g.adj[u]) { const d = dist[u] + 0.6 + 0.08 / Math.max(w, 0.01); if (d < dist[v]) { dist[v] = d; prev[v] = u; } }
  }
  if (dist[b] === Infinity) return [a, b];
  const out = [b]; while (out[0] !== a) out.unshift(prev[out[0]]);
  return out;
}

const edgeCost = (g: Galaxy, u: number, v: number, w: number) =>
  0.6 + 0.08 / Math.max(w, 0.01) + 0.35 * Math.hypot(g.stars[u].x - g.stars[v].x, g.stars[u].y - g.stars[v].y) / (g.meanLink || 1);

/** cheapest simple path a → … → b through exactly n systems (a may equal b: a loop), or null */
export function pathOfLen(g: Galaxy, a: number, b: number, n: number): number[] | null {
  let best: number[] | null = null, bc = Infinity;
  const path = [a];
  const dfs = (u: number, cost: number) => {
    if (cost >= bc) return;
    if (path.length === n - 1) {
      const w = g.link(u, b);
      if (w !== undefined) { const c = cost + edgeCost(g, u, b, w); if (c < bc) { bc = c; best = [...path, b]; } }
      return;
    }
    for (const { s: v, w } of g.adj[u]) {
      if (v === b || path.includes(v)) continue;
      path.push(v); dfs(v, cost + edgeCost(g, u, v, w)); path.pop();
    }
  };
  dfs(a, 0);
  return best;
}

const poolOf = (g: Galaxy, st: number, used: Set<number>) => g.planetsByStar[st].filter((i) => !used.has(i) && g.planets[i].t1 > g.planets[i].t0);
const medianN = (g: Galaxy, pool: number[]) => { const ns = pool.map((i) => g.planets[i].n).sort((x, y) => x - y); return ns[ns.length >> 1] ?? 0; };

/** an outer planet of `inStar` on the side facing `toward`, preferring labels that release both styles */
export function gate(g: Galaxy, inStar: number, toward: number, used: Set<number>): number {
  const S = g.stars[inStar], T = g.stars[toward], dx = T.x - S.x, dy = T.y - S.y, dl = Math.hypot(dx, dy) || 1;
  const pool = poolOf(g, inStar, used); if (!pool.length) return -1;
  const os = pool.map((i) => g.planets[i].o ?? 0).sort((x, y) => x - y), oCut = os[Math.floor(os.length * 0.55)] ?? 0;
  let best = -1, bs = -Infinity;
  for (const i of pool) {
    const p = g.planets[i]; if ((p.o ?? 0) < oCut) continue;
    const px = p.x - S.x, py = p.y - S.y, facing = (px * dx + py * dy) / ((Math.hypot(px, py) || 1) * dl);
    const score = facing + Math.min(1, shareOf(p, toward) * 4) * 0.8 + Math.log10(2 + p.n) * 0.15;
    if (score > bs) { bs = score; best = i; }
  }
  return best;
}

/**
 * a waypoint near a point on the arc from planet `a` to planet `b` around their star
 * (polar interpolation; `dip` pulls the arc toward the star; `sweep` forces the long way round)
 */
export function via(g: Galaxy, st: number, a: number, b: number, t: number, used: Set<number>, dip = 0.35, sweep = false, era?: [number, number]): number {
  const S = g.stars[st], A = g.planets[a], B = g.planets[b];
  const ra = Math.hypot(A.x - S.x, A.y - S.y), rb = Math.hypot(B.x - S.x, B.y - S.y);
  const ta = Math.atan2(A.y - S.y, A.x - S.x), tb = Math.atan2(B.y - S.y, B.x - S.x);
  let d = ((tb - ta + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  if (sweep && Math.abs(d) < Math.PI * 0.75) d = d >= 0 ? d - Math.PI * 2 : d + Math.PI * 2;
  const rr = (ra + (rb - ra) * t) * (1 - dip * Math.sin(Math.PI * t)), th = ta + d * t;
  const tx = S.x + Math.cos(th) * rr, ty = S.y + Math.sin(th) * rr, scale = Math.max(80, (ra + rb) / 2);
  const pool = poolOf(g, st, used); if (!pool.length) return -1;
  const nMed = medianN(g, pool);
  let best = -1, bd = Infinity;
  for (const i of pool) {
    const p = g.planets[i];
    let dd = Math.hypot(p.x - tx, p.y - ty) / scale + (p.n < nMed ? 0.18 : 0);
    if (era) dd += Math.abs(midYear(p) - (era[0] + (era[1] - era[0]) * t)) / Math.max(8, Math.abs(era[1] - era[0])) * 0.6;
    if (dd < bd) { bd = dd; best = i; }
  }
  return best;
}

function anyPlanet(g: Galaxy, st: number, used: Set<number>): number {
  const pool = poolOf(g, st, used); if (!pool.length) return -1;
  return pool.reduce((x, y) => (g.planets[y].n > g.planets[x].n ? y : x));
}

/** the planet that stands for a whole star at one end of an odyssey: its gate toward the other end */
export function starEnd(g: Galaxy, st: number, toward: number, used: Set<number>): number {
  const pi = st !== toward ? gate(g, st, toward, used) : -1;
  return pi >= 0 ? pi : anyPlanet(g, st, used);
}

export const TOUR_STOPS = 10;
/**
 * A tour of one star system, different every time: up to 10 labels drawn at random from the inner,
 * middle and outer orbits (the outer edge, where the smaller labels live, gets the most), then flown
 * once round the star from a random bearing. `rnd` is injectable for tests.
 */
export function planSystemTour(g: Galaxy, st: number, rnd: () => number = Math.random): RoutePlan {
  const S = g.stars[st], pool = poolOf(g, st, new Set());
  if (!pool.length) return { a: -1, b: -1, stops: [], hops: [st], star: st };
  const byOrbit = [...pool].sort((x, y) => (g.planets[x].o ?? 0) - (g.planets[y].o ?? 0));
  const third = Math.ceil(byOrbit.length / 3), rings = [byOrbit.slice(0, third), byOrbit.slice(third, 2 * third), byOrbit.slice(2 * third)];
  const n = Math.min(TOUR_STOPS, pool.length), quota = [Math.round(n * 0.3), Math.round(n * 0.3)];
  quota.push(n - quota[0] - quota[1]);
  const take = (from: number[], k: number, out: number[]) => {
    const left = from.filter((i) => !out.includes(i));
    for (let j = 0; j < k && left.length; j++) out.push(left.splice(Math.floor(rnd() * left.length), 1)[0]);
  };
  const picked: number[] = [];
  rings.forEach((ring, k) => take(ring, quota[k], picked));
  take(pool, n - picked.length, picked); // a small system: fill up from anywhere
  const start = rnd() * Math.PI * 2;
  const turn = (i: number) => ((Math.atan2(g.planets[i].y - S.y, g.planets[i].x - S.x) - start) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  const stops = picked.sort((x, y) => turn(x) - turn(y));
  return { a: stops[0], b: stops[stops.length - 1], stops, hops: [st], star: st };
}

/** random tracks for each stop of an odyssey or tour, ones not heard yet first; at least MIN_ROUTE_TRACKS overall */
export function pickStopTracks(g: Galaxy, plan: RoutePlan, chunk: (s: number) => Chunk, heard: Set<string>, rnd: () => number = Math.random): TrackRef[][] {
  const per = Math.max(2, Math.ceil(MIN_ROUTE_TRACKS / Math.max(1, plan.stops.length))), seen = new Set<string>();
  return plan.stops.map((pi) => {
    const p = g.planets[pi], ch = chunk(p.s), all = Array.from({ length: p.t1 - p.t0 }, (_, k) => p.t0 + k);
    const fresh = all.filter((i) => !heard.has(ch.yt[i])), out: TrackRef[] = [];
    for (const src of [fresh, all]) {
      const left = src.filter((i) => !seen.has(ch.yt[i]));
      while (out.length < per && left.length) { const i = left.splice(Math.floor(rnd() * left.length), 1)[0]; seen.add(ch.yt[i]); out.push({ s: p.s, i }); }
    }
    return out.sort((x, y) => x.i - y.i);
  });
}

export function planRoute(g: Galaxy, a: number, b: number): RoutePlan {
  const A = g.planets[a], B = g.planets[b], used = new Set([a, b]);
  const take = (i: number) => { if (i >= 0) used.add(i); return i; };
  let hops: number[];
  if (A.s === B.s) hops = pathOfLen(g, A.s, A.s, ROUTE_SYSTEMS) ?? [A.s];
  else {
    const short = starPath(g, A.s, B.s);
    hops = short.length >= ROUTE_SYSTEMS ? short : pathOfLen(g, A.s, B.s, ROUTE_SYSTEMS) ?? short;
  }
  if (hops.length === 1) {
    // isolated system (no neighbours): tour around the star instead
    const stops = [a], era: [number, number] = [midYear(A), midYear(B)];
    for (let k = 1; k <= 8; k++) { const w = take(via(g, A.s, a, b, k / 9, used, 0.25, true, era)); if (w >= 0) stops.push(w); }
    stops.push(b);
    return { a, b, stops, hops };
  }
  const stops: number[] = [];
  for (let k = 0; k < hops.length; k++) {
    const st = hops[k], isFirst = k === 0, isLast = k === hops.length - 1;
    let first = isFirst ? a : take(gate(g, st, hops[k - 1], used));
    let second = isLast ? b : take(gate(g, st, hops[k + 1], used));
    if (first < 0) first = take(anyPlanet(g, st, used));
    if (second < 0) second = take(anyPlanet(g, st, used));
    for (const p of [first, second]) if (p >= 0) stops.push(p);
  }
  return { a, b, stops, hops };
}

/** label of a stop in the route list */
export function stopKind(g: Galaxy, r: RoutePlan, k: number): "ORIGIN" | "DESTINATION" | "EXIT" | "ENTRY" | "WAYPOINT" | "ORBIT" {
  if (r.star !== undefined) return "ORBIT";
  const st = (j: number) => g.planets[r.stops[j]]?.s, s = st(k);
  return k === 0 ? "ORIGIN" : k === r.stops.length - 1 ? "DESTINATION" : st(k + 1) !== s ? "EXIT" : st(k - 1) !== s ? "ENTRY" : "WAYPOINT";
}
