// What the visitor can do — select, play, skip, plot a route, jump through a wormhole. UI modules call
// these; these change the state and the camera and ask the UI to refresh.
import type { Sel, TrackRef } from "../core/types";
import { pad } from "../core/util";
import { $ } from "../core/dom";
import { beacons, chunk, dead, flightLog, galaxy, motion, state, tracks } from "./state";
import { orbitR } from "../model/galaxy";
import { HITCHHIKE_TRACKS, pickStopTracks, planLightYears, planRoute, planSystemTour, starEnd } from "../model/routes";
import { cam, LOD_PLANETS, LOD_TITLES, LOD_TRACKS, MAX_SCALE } from "../render/camera";
import { renderDossier } from "../ui/dossier";
import { decodeDossier } from "../ui/glitch";
import { loadInDock, player } from "../ui/dock";
import { denyPick, hidePickHint, renderRoutePanel, routePanelWidth, showPickHint } from "../ui/routePanel";
import { ticker } from "../ui/ticker";
import { wormhole } from "../ui/wormhole";

export const trackCode = (s: number, i: number) => `TR-${pad(s, 2)}.${pad(i, 5)}`;
const replaceHash = (h: string) => { try { history.replaceState(null, "", h); } catch { /* sandboxed */ } };

// ---------- selection ----------
/** the star system an object belongs to */
const starOf = (o: NonNullable<Sel>) => (o.kind === "planet" ? galaxy.planets[o.p].s : o.s);
/** while picking an odyssey's destination, the origin's own system is off limits */
export function pickBlocked(o: Sel): boolean {
  const rp = state.routePick; if (!rp || !o) return false;
  return starOf(o) === (rp.kind === "star" ? rp.i : galaxy.planets[rp.i].s);
}

export function select(o: Sel, go = true, autoplay = false) {
  // a satellite clicked a moment after it appeared: wait for its title and artist
  if (o?.kind === "track" && !chunk(o.s)) { tracks.load(o.s).then(() => select(o, go, autoplay)); return; }
  if (pickBlocked(o)) { denyPick(galaxy.stars[starOf(o!)].name); return; }
  // while picking an odyssey's destination, a planet, a track's planet or a whole star finishes it;
  // a star at either end is entered through its gate facing the other end
  const rp = state.routePick;
  if (rp && o) {
    const P = galaxy.planets, fromStar = rp.kind === "star" ? rp.i : P[rp.i].s;
    let pb = o.kind === "planet" ? o.p : o.kind === "track" ? chunk(o.s)!.p[o.i] : -1;
    if (o.kind === "star") pb = starEnd(galaxy, o.s, fromStar, rp.kind === "planet" ? new Set([rp.i]) : new Set());
    if (pb >= 0) {
      const pa = rp.kind === "planet" ? rp.i : starEnd(galaxy, rp.i, P[pb].s, new Set([pb]));
      if (pa >= 0 && pa !== pb) { endPick(); buildRoute(pa, pb); return; }
    }
  }
  const { stars, planets } = galaxy, { W, H } = cam;
  state.sel = o; state.dirty = true;
  cam.setFollow(o?.kind === "planet" ? o.p : o?.kind === "track" ? chunk(o.s)!.p[o.i] : null);
  if (o?.kind === "star") { const s = stars[o.s]; if (go) cam.fly(s.x, s.y, Math.min(MAX_SCALE, Math.max(LOD_PLANETS * 1.3, (Math.min(W, H) * 0.46) / s.R))); }
  else if (o?.kind === "planet") { const p = planets[o.p], q = motion.planetPos(o.p); if (go) cam.fly(q.x, q.y, Math.max(LOD_TRACKS * 1.6, Math.min(8, Math.min(W, H) * 0.16 / (p.r + 4 + 1.5 * Math.sqrt(p.t1 - p.t0))))); }
  else if (o?.kind === "track") {
    const ch = chunk(o.s)!;
    if (go) {
      const pi = ch.p[o.i];
      if (pi >= 0) { const q = motion.planetPos(pi); cam.fly(q.x, q.y, Math.max(LOD_TITLES * 1.1, Math.min(8, Math.min(W, H) * 0.42 / orbitR(planets[pi])))); }
      else cam.fly(ch.x[o.i], ch.y[o.i], Math.max(cam.s, LOD_TITLES * 1.3));
    }
    if (autoplay) playTrack(o);
    replaceHash(`#t${o.s}-${o.i}`);
  }
  renderDossier();
  decodeDossier(state.warping ? 900 : 380);
}

// ---------- playback ----------
export function playTrack(ref: TrackRef) {
  if (galaxy.meta.sample) return;
  const ch = chunk(ref.s)!;
  // a track off the orbiting planet ends the orbit
  if (state.orbit !== null && ch.p[ref.i] !== state.orbit) state.orbit = null;
  state.nowPlaying = ref; state.played.add(ch.yt[ref.i]);
  const h = state.history, last = h[h.length - 1];
  if (!last || last.i !== ref.i || last.s !== ref.s) h.push(ref);
  loadInDock(ref);
  flightLog.add(ref, Date.now(), { b: galaxy.meta.build, y: ch.yt[ref.i], st: galaxy.stars[ref.s].name }); ticker(); state.dirty = true;
}

/** the k nearest tracks of the same system, optionally skipping YouTube ids */
export function nearestTracks(ref: TrackRef, k: number, skip?: Set<string>): TrackRef[] {
  const ch = chunk(ref.s); if (!ch) return [];
  const x = ch.x[ref.i], y = ch.y[ref.i], best: { i: number; d: number }[] = [];
  for (let i = 0; i < ch.x.length; i++) {
    if (i === ref.i || skip?.has(ch.yt[i]) || dead.has(ch.yt[i])) continue;
    const d = (ch.x[i] - x) ** 2 + (ch.y[i] - y) ** 2;
    if (best.length < k || d < best[best.length - 1].d) { best.push({ i, d }); best.sort((a, b) => a.d - b.d); if (best.length > k) best.pop(); }
  }
  return best.map((b) => ({ s: ref.s, i: b.i }));
}

/** next along the route if one is playing, otherwise the nearest unheard track */
export function next() {
  const np = state.nowPlaying, route = state.route; if (!np) return;
  if (route && state.routeIdx >= 0) {
    const cur = route.flat[state.routeIdx];
    if (cur && cur.s === np.s && cur.i === np.i) {
      if (state.routeIdx + 1 < route.flat.length) { playRouteAt(state.routeIdx + 1); return; }
      // the end of the line: 2001 for odysseys, the Guide for hitchhikers
      state.routeIdx = -1; renderRoutePanel();
      const lastYear = galaxy.meta.years?.[1] ?? new Date().getFullYear();
      $("routeMeta").textContent = route.years
        ? (route.years[1] >= lastYear - 1 ? `NOW PLAYING · ${route.years[1]} · AUTOPILOT RESUMES` : `LAST TRANSMISSION · ${route.years[1]} · AUTOPILOT RESUMES`)
        : route.star !== undefined ? "SO LONG, AND THANKS FOR ALL THE TRACKS · AUTOPILOT RESUMES" : "MY GOD, IT'S FULL OF STARS · ODYSSEY COMPLETE, AUTOPILOT RESUMES";
    } else { state.routeIdx = -1; renderRoutePanel(); }
  }
  if (state.orbit !== null) { playOrbit(state.orbit); return; }
  const n = nearestTracks(np, 1, state.played)[0]; if (n) select({ kind: "track", ...n }, true, true);
}
export function prev() {
  const h = state.history;
  if (h.length > 1) { h.pop(); const r = h.pop()!; select({ kind: "track", ...r }, true, true); }
}
/** a random satellite of the planet, preferring ones not heard yet this session */
export function playOrbit(pi: number) {
  const p = galaxy.planets[pi], ch = chunk(p.s); if (p.t1 <= p.t0) return;
  if (!ch) { tracks.load(p.s).then(() => playOrbit(pi)); return; }
  const np = state.nowPlaying;
  const all = Array.from({ length: p.t1 - p.t0 }, (_, k) => p.t0 + k).filter((i) => !dead.has(ch.yt[i]));
  if (!all.length) { state.orbit = null; return; } // every signal here has gone dark
  const fresh = all.filter((i) => !state.played.has(ch.yt[i]) && !(np && np.s === p.s && np.i === i));
  const pool = fresh.length ? fresh : all, i = pool[Math.floor(Math.random() * pool.length)];
  if (state.routeIdx >= 0) { state.routeIdx = -1; renderRoutePanel(); }
  if (state.orbit !== pi) state.orbitSince = Date.now(); // a new station starts its clock
  state.orbit = pi;
  select({ kind: "track", s: p.s, i }, true, true);
}
export function toggleBeacon(r: TrackRef | null) { beacons.toggle(r, r ? galaxy.stars[r.s]?.name : undefined); }

// ---------- routes ----------
export async function buildRoute(a: number, b: number) {
  // the course itself is instant; show it and fly out at once, then tune in the stops' tracks
  // (their systems' track files may still be on the way)
  const plan = planRoute(galaxy, a, b), pending = { ...plan, tracks: plan.stops.map(() => []), flat: [], loading: true };
  state.route = pending; state.routeIdx = -1;
  replaceHash(`#r${a}-${b}`);
  renderRoutePanel(); fitRoute(); state.dirty = true;
  await Promise.all([...new Set(plan.stops.map((i) => galaxy.planets[i].s))].map((s) => tracks.load(s)));
  if (state.route !== pending) return; // replaced or closed meanwhile
  const t = pickStopTracks(galaxy, plan, (s) => chunk(s)!, state.played, Math.random, undefined, dead);
  state.route = { ...plan, tracks: t, flat: t.flat() };
  renderRoutePanel();
}
/** frame the whole route, clear of the route panel */
export function fitRoute() {
  const route = state.route; if (!route) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of route.stops) { const q = motion.planetPos(i); x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
  const w = Math.max(200, x1 - x0), h = Math.max(200, y1 - y0);
  cam.setFollow(null); state.sel = null; renderDossier();
  const pw = routePanelWidth();
  const k = Math.max(cam.minS(), Math.min((cam.W - pw) / w, cam.H / h) * 0.78);
  cam.fly((x0 + x1) / 2 - pw / 2 / k, (y0 + y1) / 2, k, 1600);
}
/** start an odyssey from a planet (default) or from a whole star system */
export function startPick(i: number, kind: "planet" | "star" = "planet") {
  state.routePick = { kind, i }; showPickHint((kind === "star" ? galaxy.stars[i] : galaxy.planets[i]).name);
  // pull back far enough to see where to go: the home system with the nearest systems around it
  const st = kind === "star" ? i : galaxy.planets[i].s, S = galaxy.stars[st];
  const near = galaxy.stars.map((n, k) => ({ k, d: k === st ? Infinity : Math.hypot(n.x - S.x, n.y - S.y) + n.R })).sort((a, b) => a.d - b.d);
  const r = Math.max(S.R * 2.2, near[Math.min(3, near.length - 1)]?.d ?? S.R * 3);
  const k = Math.min(cam.s, Math.max(cam.minS(), Math.min(cam.W, cam.H) / (2 * r) * 0.92));
  cam.setFollow(null); cam.fly(S.x, S.y, k, 1100);
}
export function endPick() { state.routePick = null; hidePickHint(); }
/** TIME WARP: a label's history from first release to last, played at once */
export async function playLightYears(pi: number) {
  if (galaxy.meta.sample) return;
  const s = galaxy.planets[pi].s, ch = await tracks.load(s);
  const r = planLightYears(galaxy, pi, ch, state.played, Math.random, dead); if (!r) return;
  state.route = r; state.routeIdx = -1; renderRoutePanel(); state.dirty = true;
  playRouteAt(0);
}

/** a tour round one star system, played at once */
export async function playSystem(st: number) {
  if (galaxy.meta.sample) return;
  const plan = planSystemTour(galaxy, st); if (!plan.stops.length) return;
  await tracks.load(st);
  const t = pickStopTracks(galaxy, plan, (s) => chunk(s)!, state.played, Math.random, HITCHHIKE_TRACKS, dead);
  state.route = { ...plan, tracks: t, flat: t.flat() }; state.routeIdx = -1;
  replaceHash(`#s${st}`);
  renderRoutePanel(); state.dirty = true;
  playRouteAt(0);
}
async function openSystemTour(st: number) {
  const plan = planSystemTour(galaxy, st); if (!plan.stops.length) return;
  await tracks.load(st);
  const t = pickStopTracks(galaxy, plan, (s) => chunk(s)!, state.played, Math.random, HITCHHIKE_TRACKS, dead);
  state.route = { ...plan, tracks: t, flat: t.flat() }; state.routeIdx = -1;
  renderRoutePanel(); fitRoute(); state.dirty = true;
}
export function clearRoute() {
  state.route = null; state.routeIdx = -1; renderRoutePanel(); state.dirty = true;
  if (/^#[rs]/.test(location.hash)) replaceHash(location.pathname + location.search);
}
export function playRouteAt(k: number) {
  const route = state.route; if (!route || !route.flat[k]) return;
  state.routeIdx = k; state.orbit = null; renderRoutePanel();
  select({ kind: "track", ...route.flat[k] }, true, true);
  $("routeList").querySelector(".rt.on")?.scrollIntoView({ block: "nearest" });
}
export function toggleRoutePlayback() {
  if (state.routeIdx >= 0) { state.routeIdx = -1; renderRoutePanel(); if (player.playing) player.toggle(); }
  else playRouteAt(0);
}
/** #r<a>-<b> in the address bar opens that odyssey, #s<star> that system tour */
export function routeFromHash() {
  const sm = location.hash.match(/^#s(\d+)$/);
  if (sm && galaxy.stars[+sm[1]] && state.route?.star !== +sm[1]) { openSystemTour(+sm[1]); return true; }
  const rm = location.hash.match(/^#r(\d+)-(\d+)$/), P = galaxy.planets;
  if (!rm) return false;
  const a = +rm[1], b = +rm[2], r = state.route;
  if (P[a] && P[b] && a !== b && !(r && r.a === a && r.b === b)) { buildRoute(a, b); return true; }
  return false;
}

// ---------- navigation ----------
export function goHome() { select(null); const b = galaxy.bounds; cam.fly(b.x, b.y, cam.homeScale()); }
function nearestStarToCam() { let b = 0, bd = Infinity; galaxy.stars.forEach((s, i) => { const d = (s.x - cam.x) ** 2 + (s.y - cam.y) ** 2; if (d < bd) { bd = d; b = i; } }); return b; }
/** jump to a random track, weighted by system size */
export async function warp() {
  if (state.warping) return;
  const { stars } = galaxy;
  let r = Math.random() * galaxy.totalTracks, s = 0;
  while (s < stars.length - 1 && r > stars[s].tracks) { r -= stars[s].tracks; s++; }
  const ch = await tracks.load(s);
  let i = Math.floor(Math.random() * ch.yt.length);
  for (let k = 0; k < 20 && dead.has(ch.yt[i]); k++) i = Math.floor(Math.random() * ch.yt.length); // not into a dead signal
  const sel = state.sel, from = !sel ? nearestStarToCam() : sel.kind === "planet" ? galaxy.planets[sel.p].s : sel.s;
  const autoplay = !!state.nowPlaying;
  wormhole(from, s, `${trackCode(s, i)} · ${stars[s].name.toUpperCase()}`, () => {
    const pi = ch.p[i], q = pi >= 0 ? motion.planetPos(pi) : { x: ch.x[i], y: ch.y[i] };
    cam.stop(); cam.x = q.x; cam.y = q.y; cam.s = cam.clampS(LOD_TITLES * 1.3);
    select({ kind: "track", s, i }, false, autoplay);
  });
}
/** fly to a galaxy (sector) so it fills the view */
export function flyToNebula(k: number) {
  const n = galaxy.nebulae[k]; if (!n) return;
  select(null);
  const pw = routePanelWidth();
  cam.fly(n.x - pw / 2 / cam.s, n.y, Math.min((cam.W - pw) / (n.r * 2.5), cam.H / (n.r * 2.5)), 1500);
}
export function zoomBy(k: number) { cam.s = cam.clampS(cam.s * k); state.dirty = true; }
