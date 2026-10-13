// Planets: how each type looks, cached sprites, and drawing them at their moving positions.
import { hash } from "../core/util";
import { galaxy, motion } from "../app/state";
import { BG, planetDither, sc } from "./palette";
import { cam, LOD_PLANETS } from "./camera";
import { inView, inLive } from "./view";
import { labels } from "./labels";

/** banded giants, ringed long-runners, cratered retired labels, icy newcomers */
export function drawPlanetBody(G: CanvasRenderingContext2D, i: number, x: number, y: number, r: number) {
  const pl = galaxy.planets[i], si = pl.s, ty = galaxy.ptype[i], h = hash(pl.name), ringed = galaxy.ringed[i];
  const tilt = -0.5 + (h % 100) / 100 * 0.45, rx = r * 1.95, ry = r * 0.5;
  if (ringed) { G.strokeStyle = sc(si, 0.5); G.lineWidth = Math.max(1, r * 0.12); G.beginPath(); G.ellipse(x, y, rx, ry, tilt, Math.PI, Math.PI * 2); G.stroke(); }
  G.save(); G.beginPath(); G.arc(x, y, r, 0, 7); G.clip();
  G.fillStyle = BG; G.fillRect(x - r, y - r, r * 2, r * 2);
  G.globalAlpha = ty === "young" ? 0.35 : 1; G.fillStyle = planetDither(G, si); G.fillRect(x - r, y - r, r * 2, r * 2); G.globalAlpha = 1;
  if (ty === "giant") {
    const nb = 5;
    for (let k = 0; k < nb; k++) {
      const yy = y - r + (k + 0.5) * (2 * r / nb) + Math.sin(k * 1.7 + h) * r * 0.06;
      G.fillStyle = sc(si, k % 2 ? 0.9 : 0.3); G.fillRect(x - r, yy - r * 0.1, r * 2, r * (k % 2 ? 0.2 : 0.13));
    }
  }
  if (ty === "ancient") {
    G.globalAlpha = 0.55; G.fillStyle = BG; G.fillRect(x - r, y - r, r * 2, r * 2); G.globalAlpha = 1;
    G.strokeStyle = sc(si, 0.85); G.lineWidth = 1;
    for (let k = 0; k < 4; k++) {
      const a = ((h >>> (k * 3)) % 628) / 100, d = r * 0.12 + (((h >>> (k * 5)) % 100) / 100) * r * 0.55, cr = r * (0.12 + ((h >>> (k * 2)) % 10) / 70);
      G.beginPath(); G.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, cr, 0, 7); G.stroke();
    }
  } else {
    G.fillStyle = sc(si, 0.95); G.beginPath(); G.arc(x - r * 0.35, y - r * 0.35, r * (ty === "young" ? 0.45 : 0.62), 0, 7); G.fill();
    G.globalAlpha = 0.55; G.fillStyle = BG; G.beginPath(); G.arc(x + r * 0.05, y + r * 0.05, r * 0.72, 0, 7); G.fill(); G.globalAlpha = 1;
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
function planetSprite(i: number, r: number) {
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

export function drawPlanets(ctx: CanvasRenderingContext2D, t: number) {
  if (cam.s < LOD_PLANETS) return;
  const { stars, planets, planetsByStar } = galaxy;
  const vis: number[] = [];
  stars.forEach((st, si) => {
    if (!inView(st.x, st.y, st.R)) return;
    for (const i of planetsByStar[si]) { const q = motion.planetPos(i, t); if (inLive(q.x, q.y, planets[i].r * 3)) vis.push(i); }
  });
  for (const i of vis) {
    const pl = planets[i], q = motion.planetPos(i, t), p = cam.toScreen(q.x, q.y), r = Math.max(1.5, pl.r * cam.s);
    if (r < 3) { ctx.fillStyle = sc(pl.s, 0.95); ctx.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 2, 2); continue; }
    if (r > 180) { drawPlanetBody(ctx, i, p.x, p.y, r); continue; }
    const { c, k } = planetSprite(i, r), w = c.width / cam.DPR * k;
    ctx.drawImage(c, p.x - w / 2, p.y - w / 2, w, w);
  }
  vis.sort((a, b) => planets[b].n - planets[a].n);
  for (const i of vis) {
    const pl = planets[i], r = pl.r * cam.s; if (r < 4) continue;
    const q = motion.planetPos(i, t), p = cam.toScreen(q.x, q.y);
    labels.label(pl.name.toUpperCase(), p.x, p.y + r + 14, 11, sc(pl.s, 0.85));
  }
}
