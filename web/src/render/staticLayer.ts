// The static layer: grid, nebulae, dust, system outlines, style links, belt tracks, star labels and
// star markers. Repainted only when the camera settles somewhere new; in between it slides/scales.
import { $ } from "../core/dom";
import { clipSeg, lcg } from "../core/util";
import { chunk, galaxy, sameSel, state, tracks } from "../app/state";
import { BG, glowS, nc, nebulaS, ph, sc } from "./palette";
import { cam, LOD_PLANETS, LOD_TITLES, LOD_TRACKS } from "./camera";
import { inView, MARGIN, updateStaticView, view } from "./view";
import { eachTrack } from "./beltGrid";
import { labels } from "./labels";
import { starSize } from "./pulsar";
import { drawMarker, isMoving } from "./markers";

const rnd = lcg(11);
const dust = Array.from({ length: 420 }, () => ({ x: rnd(), y: rnd(), d: 0.15 + rnd() * 0.7, b: rnd() }));

/** the camera the static layer was last painted for */
export const painted = { x: 0, y: 0, s: 0, at: 0 };
let gridStep = 1, lastReadout = "";
const sg = (n: number) => (n < 0 ? "−" : "+") + Math.abs(n).toFixed(1).padStart(6, "0");

export function readout() {
  const c = cam.toWorld(cam.W / 2, cam.H / 2), st = gridStep;
  const txt = `X ${sg(c.x)}  Y ${sg(c.y)}  ×${cam.s.toFixed(2)}  GRID ${st >= 1 ? st : st.toFixed(1)}`;
  if (txt !== lastReadout) { $("readout").textContent = txt; lastReadout = txt; }
}

/** wobbly dotted outline of a system */
function drawSystemShape(lc: CanvasRenderingContext2D, si: number) {
  const s = galaxy.stars[si], p = cam.toScreen(s.x, s.y), h = s.hull;
  lc.setLineDash([1, 5]); lc.lineWidth = 1; lc.strokeStyle = sc(si, 0.26);
  lc.beginPath();
  if (h && h.length > 2) {
    const n = h.length, pt = (k: number) => { const a = (k % n) / n * Math.PI * 2, r = h[k % n] * cam.s; return [p.x + Math.cos(a) * r, p.y + Math.sin(a) * r]; };
    const [x0, y0] = pt(0), [x1, y1] = pt(1);
    lc.moveTo((x0 + x1) / 2, (y0 + y1) / 2);
    for (let k = 1; k <= n; k++) { const [ax, ay] = pt(k), [bx, by] = pt(k + 1); lc.quadraticCurveTo(ax, ay, (ax + bx) / 2, (ay + by) / 2); }
  } else lc.arc(p.x, p.y, s.R * cam.s, 0, 7);
  lc.stroke(); lc.setLineDash([]);
}

const SHOW_LINKS = false;

/** looking at whole galaxies: their names speak, not the stars' */
export const farView = () => galaxy.nebulae.length > 0 && cam.s < cam.homeScale() * 1.8;

export function drawStatic(lc: CanvasRenderingContext2D) {
  const { W, H } = cam, { stars, links } = galaxy;
  Object.assign(painted, { x: cam.x, y: cam.y, s: cam.s, at: performance.now() });
  labels.reset(); labels.g = lc;
  updateStaticView();
  const { V0, V1 } = view;
  const far = farView();
  lc.fillStyle = BG; lc.fillRect(-MARGIN, -MARGIN, W + 2 * MARGIN, H + 2 * MARGIN);

  // coordinate grid
  const step = Math.pow(10, Math.ceil(Math.log10(70 / cam.s)));
  const st = step * cam.s < 140 ? step : step / 2;
  lc.strokeStyle = ph(0.06); lc.lineWidth = 1; lc.beginPath();
  for (let x = Math.floor(V0.x / st) * st; x < V1.x; x += st) { const p = cam.toScreen(x, 0).x; lc.moveTo(Math.round(p) + 0.5, -MARGIN); lc.lineTo(Math.round(p) + 0.5, H + MARGIN); }
  for (let y = Math.floor(V0.y / st) * st; y < V1.y; y += st) { const p = cam.toScreen(0, y).y; lc.moveTo(-MARGIN, Math.round(p) + 0.5); lc.lineTo(W + MARGIN, Math.round(p) + 0.5); }
  lc.stroke();

  // galaxies: a big dithered cloud per sector, fading as you fly into its systems
  lc.globalCompositeOperation = "lighter";
  const gA = Math.min(1, 0.035 / cam.s) * 0.85;
  if (gA > 0.03) galaxy.nebulae.forEach((n, k) => {
    const R = n.r * 1.3; if (!inView(n.x, n.y, R)) return;
    const p = cam.toScreen(n.x, n.y), Rs = R * cam.s;
    lc.globalAlpha = gA; lc.imageSmoothingQuality = "low"; lc.drawImage(nebulaS[k], p.x - Rs, p.y - Rs, Rs * 2, Rs * 2);
  });

  // system nebulae (a glow sprite, no blur)
  stars.forEach((s, si) => {
    if (!inView(s.x, s.y, s.R)) return;
    const p = cam.toScreen(s.x, s.y), R = s.R * cam.s, al = 0.16 * Math.min(1, 0.6 / cam.s);
    if (al < 0.02) return;
    lc.globalAlpha = al; lc.drawImage(glowS[si], p.x - R, p.y - R, R * 2, R * 2);
  });
  lc.globalAlpha = 1; lc.globalCompositeOperation = "source-over";

  // dust (parallax; streaks during long flights)
  for (const d of dust) {
    const DW = W + 2 * MARGIN, DH = H + 2 * MARGIN;
    let x = (d.x * DW * 4 - cam.x * cam.s * d.d * 0.04) % DW, y = (d.y * DH * 4 - cam.y * cam.s * d.d * 0.04) % DH;
    if (x < 0) x += DW; if (y < 0) y += DH; x -= MARGIN; y -= MARGIN;
    lc.fillStyle = ph(0.1 + d.b * 0.3);
    if (cam.warpFx > 0.05) lc.fillRect(x, y, 1 + (x - W / 2) * cam.warpFx * 0.25, 1);
    else lc.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  // system outlines and style links
  lc.setLineDash([1, 5]); lc.lineWidth = 1;
  if (!far) stars.forEach((s, si) => { if (inView(s.x, s.y, s.R)) drawSystemShape(lc, si); });
  lc.setLineDash([2, 5]);
  // from afar only the stronger links: hundreds of faint lines just make a haze, and cost the most to draw
  const wMin = far ? 0.08 : 0;
  // dashed style links are switched off for now; flip SHOW_LINKS to bring them back
  if (SHOW_LINKS) for (const [a, b, w] of links) {
    if (w < wMin) continue;
    const A = cam.toScreen(stars[a].x, stars[a].y), B = cam.toScreen(stars[b].x, stars[b].y), al = Math.min(0.75, 0.12 + w * 1.4);
    // skip links that can't cross the painted area (most of them once zoomed in)
    if (Math.max(A.x, B.x) < -MARGIN || Math.min(A.x, B.x) > W + MARGIN || Math.max(A.y, B.y) < -MARGIN || Math.min(A.y, B.y) > H + MARGIN) continue;
    // only the part inside the painted area: zoomed in, a link between two far stars is tens of
    // thousands of pixels long and every dash of it costs, seen or not
    const c = clipSeg(A.x, A.y, B.x, B.y, -MARGIN, -MARGIN, W + MARGIN, H + MARGIN); if (!c) continue;
    const len = Math.hypot(B.x - A.x, B.y - A.y);
    // flat colour of the first star (a gradient per line was the most expensive thing on the layer)
    lc.strokeStyle = sc(a, al); lc.lineWidth = w > 0.15 ? 1.6 : 1;
    lc.lineDashOffset = c[0] * len; // dashes stay where they were on the whole line
    lc.beginPath(); lc.moveTo(A.x + (B.x - A.x) * c[0], A.y + (B.y - A.y) * c[0]); lc.lineTo(A.x + (B.x - A.x) * c[1], A.y + (B.y - A.y) * c[1]); lc.stroke();
  }
  lc.setLineDash([]); lc.lineDashOffset = 0;

  // asteroid-belt tracks (planet satellites move, so the live layer draws those)
  const titles: { x: number; y: number; t: string; si: number }[] = [];
  if (cam.s >= LOD_TRACKS) {
    const sz = Math.max(1, Math.min(3, Math.round(cam.s * 0.9)));
    stars.forEach((s, si) => {
      if (!inView(s.x, s.y, s.R)) return;
      const ch = chunk(si); if (!ch) { tracks.load(si); return; }
      lc.fillStyle = sc(si, 0.9);
      eachTrack(si, V0.x, V0.y, V1.x, V1.y, (i) => {
        if (ch.p[i] >= 0) return;
        const x = ch.x[i], y = ch.y[i];
        if (x < V0.x || x > V1.x || y < V0.y || y > V1.y) return;
        const p = cam.toScreen(x, y);
        lc.fillRect(Math.round(p.x - sz / 2), Math.round(p.y - sz / 2), sz, sz);
        if (cam.s >= LOD_TITLES && titles.length < 240) titles.push({ x: p.x, y: p.y, t: ch.t[i], si });
      });
    });
  }

  // galaxy names, spaced out, just above each galaxy's own stars (until you are among its systems)
  if (cam.s < LOD_PLANETS * 1.6) galaxy.nebulae.forEach((n, k) => {
    if (!inView(n.x, n.y, n.r * 1.3)) return;
    const at = galaxy.nebulaLabelAt(k), p = cam.toScreen(at.x, at.y), a = Math.min(1, (LOD_PLANETS * 1.6 - cam.s) / (LOD_PLANETS * 0.8));
    labels.label(n.name.toUpperCase().split("").join(" "), p.x, p.y - 26, W < 600 ? 13 : 17, nc(k, 0.9 * a), "center", true);
  });

  // star labels (the pulsars themselves are drawn live, every frame)
  if (!far) stars.map((s, si) => ({ s, si })).sort((a, b) => b.s.n - a.s.n).forEach(({ s, si }) => {
    if (!inView(s.x, s.y, 300 / cam.s)) return;
    const p = cam.toScreen(s.x, s.y);
    labels.label(s.name.toUpperCase(), p.x, p.y - starSize(si) * 3.4 - 6, W < 600 ? 12 : 14, sc(si, 1), "center", galaxy.starRank[si] < 12);
  });
  for (const t of titles) labels.label(t.t, t.x + 6, t.y + 4, 11, sc(t.si, 0.75), "left");

  // star selection / hover (moving objects are marked on the live layer)
  if (state.hover && !sameSel(state.hover, state.sel) && !isMoving(state.hover)) drawMarker(state.hover, false);
  if (!isMoving(state.sel)) drawMarker(state.sel, true);

  gridStep = st; readout();
  $("scaleName").textContent = cam.s < LOD_PLANETS ? (galaxy.nebulae.length ? "UNIVERSE" : "GALAXY") : cam.s < LOD_TRACKS ? "SYSTEMS" : cam.s < LOD_TITLES ? "ORBITS" : "SIGNALS";
}
