// Planets: how each type looks, cached sprites, and drawing them at their moving positions.
import { hash } from "../core/util";
import { chunk, galaxy, motion, state } from "../app/state";
import { BG, planetDither, sc } from "./palette";
import { cam, LOD_PLANETS } from "./camera";
import { inView, inLive } from "./view";
import { labels } from "./labels";

/** a planet's surface marks (craters, spots, storms) as points on the sphere, from its name */
function surfaceMarks(h: number) {
  return Array.from({ length: 5 }, (_, k) => ({
    lon: ((h >>> (k * 3)) % 628) / 100, lat: (((h >>> (k * 5)) % 100) / 100 - 0.5) * 1.6, size: 0.12 + ((h >>> (k * 2)) % 10) / 70,
  }));
}

/**
 * banded giants, ringed long-runners, cratered retired labels, icy newcomers. `spin` (radians)
 * turns the surface marks round the planet's axis; light, shadow and rings stay where they are.
 */
export function drawPlanetBody(G: CanvasRenderingContext2D, i: number, x: number, y: number, r: number, spin = 0) {
  const pl = galaxy.planets[i], si = pl.s, ty = galaxy.ptype[i], h = hash(pl.name), ringed = galaxy.ringed[i];
  const tilt = -0.5 + (h % 100) / 100 * 0.45, rx = r * 1.95, ry = r * 0.5;
  if (ringed) { G.strokeStyle = sc(si, 0.5); G.lineWidth = Math.max(1, r * 0.12); G.beginPath(); G.ellipse(x, y, rx, ry, tilt, Math.PI, Math.PI * 2); G.stroke(); }
  G.save(); G.beginPath(); G.arc(x, y, r, 0, 7); G.clip();
  G.fillStyle = BG; G.fillRect(x - r, y - r, r * 2, r * 2);
  // the dither pattern is pinned to the planet (not the canvas), so it travels with it instead of crawling
  G.globalAlpha = ty === "young" ? 0.35 : 1; G.fillStyle = planetDither(G, si);
  G.translate(Math.round(x - r), Math.round(y - r)); G.fillRect(0, 0, r * 2, r * 2); G.translate(-Math.round(x - r), -Math.round(y - r)); G.globalAlpha = 1;
  if (ty === "giant") {
    const nb = 5;
    for (let k = 0; k < nb; k++) {
      const yy = y - r + (k + 0.5) * (2 * r / nb) + Math.sin(k * 1.7 + h) * r * 0.06;
      G.fillStyle = sc(si, k % 2 ? 0.9 : 0.3); G.fillRect(x - r, yy - r * 0.1, r * 2, r * (k % 2 ? 0.2 : 0.13));
    }
  }
  // marks on the turning sphere: only the near side shows, squeezed toward the limb
  const marks = surfaceMarks(h).map((m) => {
    const lon = m.lon + spin, c = Math.cos(lon), f = Math.max(0, Math.min(1, c / 0.4));
    return { fade: f * f * (3 - 2 * f), x: x + Math.sin(lon) * Math.cos(m.lat) * r * 0.92, y: y + Math.sin(m.lat) * r * 0.92, rx: m.size * r * Math.max(0, c), ry: m.size * r };
  }).filter((m) => m.fade > 0.01);
  if (ty === "ancient") {
    G.globalAlpha = 0.55; G.fillStyle = BG; G.fillRect(x - r, y - r, r * 2, r * 2); G.globalAlpha = 1;
    G.strokeStyle = sc(si, 0.85); G.lineWidth = 1;
    for (const m of marks) { G.globalAlpha = m.fade; G.beginPath(); G.ellipse(m.x, m.y, Math.max(0.5, m.rx), m.ry, 0, 0, 7); G.stroke(); } // craters
    G.globalAlpha = 1;
  } else {
    G.fillStyle = sc(si, 0.95); G.beginPath(); G.arc(x - r * 0.35, y - r * 0.35, r * (ty === "young" ? 0.45 : 0.62), 0, 7); G.fill();
    G.globalAlpha = 0.55; G.fillStyle = BG; G.beginPath(); G.arc(x + r * 0.05, y + r * 0.05, r * 0.72, 0, 7); G.fill(); G.globalAlpha = 1;
    // storms and spots drifting with the turn (on gas giants: a couple of big storms)
    for (const [k, m] of marks.entries()) {
      if (ty !== "giant" && k > 2) break;
      G.globalAlpha = (ty === "giant" ? 0.75 : 0.5) * m.fade; G.fillStyle = k % 2 ? BG : sc(si, 0.95);
      G.beginPath(); G.ellipse(m.x, m.y, Math.max(0.5, m.rx * (ty === "giant" ? 1.3 : 0.8)), m.ry * (ty === "giant" ? 0.55 : 0.8), 0, 0, 7); G.fill();
    }
    G.globalAlpha = 1;
  }
  G.restore();
  G.strokeStyle = sc(si, 0.95); G.lineWidth = 1;
  if (ty === "young") G.setLineDash([2, 2]);
  G.beginPath(); G.arc(x, y, r, 0, 7); G.stroke(); G.setLineDash([]);
  if (ringed) { G.strokeStyle = sc(si, 0.95); G.lineWidth = Math.max(1, r * 0.12); G.beginPath(); G.ellipse(x, y, rx, ry, tilt, 0, Math.PI); G.stroke(); }
  if (ty === "young" && r > 5) {
    const sx = x - r * 0.42, sy = y - r * 0.42, k = Math.max(1, Math.round(r * 0.08));
    G.fillStyle = "#fff"; G.fillRect(sx - k * 3, sy - k / 2, k * 6, k); G.fillRect(sx - k / 2, sy - k * 3, k, k * 6);
  }
}

// Planet bodies are cached as sprites at bucketed sizes (~12% steps) and scaled to the exact size,
// so zooming doesn't repaint every planet on every wheel tick. Unused sprites are dropped.
const pSprite: ({ c: HTMLCanvasElement; rb: number; used: number } | null)[] = galaxy.planets.map(() => null);
let frameNo = 0, spriteCount = 0;
function planetSprite(i: number, r: number): { c: HTMLCanvasElement; k: number } {
  const rb = Math.pow(2, Math.round(Math.log2(r) * 6) / 6), DPR = cam.DPR;
  let e = pSprite[i];
  if (!e || e.rb !== rb) {
    const half = Math.ceil((galaxy.ringed[i] ? rb * 2.05 : rb) + 3), w = half * 2;
    const c = e?.c ?? document.createElement("canvas"), px = Math.ceil(w * DPR);
    if (c.width !== px) { c.width = c.height = px; } else c.getContext("2d")!.clearRect(0, 0, px, px);
    const g = c.getContext("2d")!; g.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawPlanetBody(g, i, half, half, rb);
    if (!e) spriteCount++;
    e = pSprite[i] = { c, rb, used: frameNo };
  }
  e.used = frameNo;
  return { c: e.c, k: r / rb };
}
/** call once per frame */
export function tickSprites() {
  frameNo++;
  if (frameNo % 120 !== 0 || spriteCount < 600) return;
  for (let i = 0; i < pSprite.length; i++) { const e = pSprite[i]; if (e && frameNo - e.used > 240) { pSprite[i] = null; spriteCount--; } }
}

/** the planets in focus: selected, playing, or with a Solaris station in orbit */
function focusPlanets() {
  const out = new Set<number>(), sel = state.sel, np = state.nowPlaying;
  if (sel?.kind === "planet") out.add(sel.p);
  if (sel?.kind === "track") { const p = chunk(sel.s)?.p[sel.i] ?? -1; if (p >= 0) out.add(p); }
  if (np) { const p = chunk(np.s)?.p[np.i] ?? -1; if (p >= 0) out.add(p); }
  if (state.orbit !== null) out.add(state.orbit);
  return out;
}
/**
 * How far a planet has turned: a label still releasing turns once in ~25 s, one that went quiet
 * turns slower the longer ago that was, down to once in ~2.5 minutes.
 */
const spinFrom = new Map<number, number>(); // when each planet came into focus: its turn starts from the still picture
function spinOf(i: number, t: number) {
  let t0 = spinFrom.get(i); if (t0 === undefined) { t0 = t; spinFrom.set(i, t); }
  const p = galaxy.planets[i], last = galaxy.meta.years?.[1] ?? 2026, gap = Math.max(0, last - (p.yr[1] || last - 20));
  const period = Math.min(150, 25 + gap * 7) * 1000;
  return ((t - t0) / period) * Math.PI * 2;
}

export function drawPlanets(ctx: CanvasRenderingContext2D, t: number) {
  if (cam.s < LOD_PLANETS) return;
  const { stars, planets, planetsByStar } = galaxy;
  const vis: number[] = [];
  stars.forEach((st, si) => {
    if (!inView(st.x, st.y, st.R)) return;
    for (const i of planetsByStar[si]) { const q = motion.planetPos(i, t); if (inLive(q.x, q.y, planets[i].r * 3)) vis.push(i); }
  });
  const focus = focusPlanets();
  for (const k of spinFrom.keys()) if (!focus.has(k)) spinFrom.delete(k);
  for (const i of vis) {
    const pl = planets[i], q = motion.planetPos(i, t), p = cam.toScreen(q.x, q.y), r = Math.max(1.5, pl.r * cam.s);
    if (r < 3) { ctx.fillStyle = sc(pl.s, 0.95); ctx.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 2, 2); continue; }
    // the planet you are at turns (drawn live, a handful at most); the rest stay still as cached sprites
    if (r > 180 || focus.has(i)) { drawPlanetBody(ctx, i, p.x, p.y, r, focus.has(i) ? spinOf(i, t) : 0); continue; }
    const sp = planetSprite(i, r), w = sp.c.width / cam.DPR * sp.k;
    ctx.drawImage(sp.c, p.x - w / 2, p.y - w / 2, w, w);
  }
  vis.sort((a, b) => planets[b].n - planets[a].n);
  for (const i of vis) {
    const pl = planets[i], r = pl.r * cam.s; if (r < 4) continue;
    const q = motion.planetPos(i, t), p = cam.toScreen(q.x, q.y);
    labels.label(pl.name.toUpperCase(), p.x, p.y + r + 14, 11, sc(pl.s, 0.85));
  }
}
