// Route planning: a flight from one planet (label) to another. Pure functions over the galaxy.
//
// Rules: 10 planets in 5 systems, 2 planets each. Between start and finish the flight always crosses
// 3 neighbouring systems (if the two systems are close, it detours through neighbours); among all
// 5-system paths it takes the one with the strongest style links and the shortest jumps.
// In each system: in through a gate facing the previous system, out through a gate facing the next.
// Start and finish in the same system → a round trip out through 3 neighbours and back.
// Planning uses catalogue positions (orbits at t=0), so the same pair always gives the same route.
import type { Chunk, TrackRef } from "../core/types";
import { hash } from "../core/util";
import { type Galaxy, midYear, shareOf } from "./galaxy";

export const ROUTE_SYSTEMS = 5;
export const MIN_ROUTE_TRACKS = 20;

export type RoutePlan = { a: number; b: number; stops: number[]; hops: number[] };
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

/**
 * Tracks for each stop: at least MIN_ROUTE_TRACKS overall — one per stop, then round-robin with the
 * origin and destination first — spread across each label's years (chunks store tracks oldest first).
 * `chunk(s)` must return a loaded chunk for every star the route visits.
 */
export function pickRouteTracks(g: Galaxy, plan: RoutePlan, chunk: (s: number) => Chunk): TrackRef[][] {
  const N = plan.stops.length, avail = plan.stops.map((pi) => g.planets[pi].t1 - g.planets[pi].t0);
  const cnt = avail.map((n) => Math.min(1, n)), order = [0, N - 1, ...Array.from({ length: Math.max(0, N - 2) }, (_, k) => k + 1)];
  let total = cnt.reduce((x, y) => x + y, 0), grew = true;
  while (total < Math.max(MIN_ROUTE_TRACKS, N) && grew) {
    grew = false;
    for (const k of order) { if (total >= Math.max(MIN_ROUTE_TRACKS, N)) break; if (cnt[k] < avail[k]) { cnt[k]++; total++; grew = true; } }
  }
  const seen = new Set<string>();
  return plan.stops.map((pi, k) => {
    const p = g.planets[pi], ch = chunk(p.s), n = avail[k], c = cnt[k], off = hash(p.name + ":" + g.planets[plan.b].name) % Math.max(1, n);
    const out: TrackRef[] = [];
    for (let j = 0; j < c; j++) {
      for (let tries = 0; tries < n; tries++) {
        const i = p.t0 + ((Math.floor((j + 0.5) * n / c) + off + tries) % n);
        if (seen.has(ch.yt[i])) continue; seen.add(ch.yt[i]); out.push({ s: p.s, i }); break;
      }
    }
    return out.sort((x, y) => x.i - y.i);
  });
}

/** label of a stop in the route list */
export function stopKind(g: Galaxy, r: RoutePlan, k: number): "ORIGIN" | "DESTINATION" | "EXIT" | "ENTRY" | "WAYPOINT" {
  const st = (j: number) => g.planets[r.stops[j]]?.s, s = st(k);
  return k === 0 ? "ORIGIN" : k === r.stops.length - 1 ? "DESTINATION" : st(k + 1) !== s ? "EXIT" : st(k - 1) !== s ? "ENTRY" : "WAYPOINT";
}
