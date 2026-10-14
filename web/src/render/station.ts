// SOLARIS: while a planet's orbit is playing, a small probe circles it just outside its satellites
// and listens. It is drawn like the planets — solid phosphor, ordered dithering, dark scanlines —
// on a tiny grid that is re-shaded every frame, so its parts can move: a dish that turns, panels
// that tilt to the light, lights that blink. Signal pulses travel down to the planet on the beat.
import { BG, FONT_LBL, sc, SC } from "./palette";
import { galaxy, motion, state } from "../app/state";
import { orbitR } from "../model/galaxy";
import { cam, LOD_PLANETS } from "./camera";
import { pulseOf } from "./pulsar";

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const GW = 44, GH = 28; // the craft's grid, in cells
type Grid = { tone: Float32Array; light: [number, number, string][] };
const grid: Grid = { tone: new Float32Array(GW * GH), light: [] };
// tone > 0: lit share of the cell's dither (0…1); -1: a dark cell (shadow, window, panel seam)
const put = (x: number, y: number, v: number) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < GW && y < GH) grid.tone[y * GW + x] = v; };
const rect = (x0: number, y0: number, x1: number, y1: number, f: (x: number, y: number) => number) => {
  for (let y = Math.round(y0); y <= Math.round(y1); y++) for (let x = Math.round(x0); x <= Math.round(x1); x++) put(x, y, f(x, y));
};
const ellipse = (cx: number, cy: number, rx: number, ry: number, f: (u: number, v: number) => number) => {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const u = (x - cx) / Math.max(0.5, rx), v = (y - cy) / Math.max(0.5, ry); if (u * u + v * v <= 1) put(x, y, f(u, v));
  }
};
const line = (x0: number, y0: number, x1: number, y1: number, v: number) => {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let k = 0; k <= n; k++) put(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, v);
};
const lit = (u: number, v: number, base = 1) => base * Math.max(0.18, Math.min(1, 0.62 - u * 0.38 - v * 0.3)); // light from the upper left

/**
 * The probe, drawn into the grid for time t (ms), facing left (its dish toward the planet): a big
 * dish that slowly swings, an instrument bus with two wings of solar cells that tilt to the light,
 * a long sensor boom with a blinking tip and a power arm. Everything moves slowly.
 */
function probe(t: number) {
  const swing = Math.sin(t / 9000) * 0.45, rx = 3.2 + 4 * Math.cos(swing); // the dish turns on its mount
  const tilt = Math.cos(t / 11000), pw = Math.max(0.6, 2.6 * Math.abs(tilt)), back = tilt < 0;
  // solar wings above and below the bus, cell seams every third row; the back side is dull
  const wing = (y0: number, y1: number) => rect(19.5 - pw, y0, 19.5 + pw, y1, (x, y) => ((y - y0) % 3 === 2 ? -1 : back ? 0.3 : lit((x - 19) / 6, (y - 14) / 14, 0.95)));
  line(19.5, 9, 19.5, 7, 0.7); line(19.5, 19, 19.5, 21, 0.7); // wing masts
  wing(0, 6); wing(22, 27);
  line(23, 14, 42, 7, 0.75); rect(40, 5, 43, 8, (x, y) => lit((x - 41) / 2, (y - 6) / 2)); // boom and its sensor
  line(17, 18, 10, 26, 0.6); rect(8, 24, 11, 27, (x, y) => lit((x - 9) / 2, (y - 25) / 2, 0.85)); // power arm
  rect(16, 10, 23, 18, (x, y) => ((x + y) % 3 === 0 ? -1 : lit((x - 19) / 4, (y - 14) / 4, 0.8))); // bus, foil panels
  // the dish, its edge softened by coverage so the swing reads smoothly in the dither
  ellipse(11, 14, rx, 10, (u, v) => { const d = u * u + v * v, edge = Math.min(1, (1 - d) / 0.22 + 0.25); return (d > 0.78 ? 0.95 : lit(-u, v, 0.75)) * edge; });
  line(11, 14, 3 - 3 * Math.cos(swing), 14, 0.9); // feed horn
  grid.light.push([42, 6, Math.floor(t / 900) % 2 ? "#ff4d6d" : ""]);
}

let canvas: HTMLCanvasElement | null = null;
/** shade the grid into a canvas: `px` device pixels per cell, dithered per device pixel */
function render(si: number, px: number, mirror: boolean) {
  const W = GW * px, H = GH * px;
  if (!canvas) canvas = document.createElement("canvas");
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const g = canvas.getContext("2d")!, img = g.createImageData(W, H), d = img.data, [r, gg, b] = SC[si];
  const bg = BG.replace("#", ""), br = parseInt(bg.slice(0, 2), 16), bgg = parseInt(bg.slice(2, 4), 16), bb = parseInt(bg.slice(4, 6), 16);
  for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) {
    const v = grid.tone[cy * GW + cx]; if (!v) continue;
    const ox = (mirror ? GW - 1 - cx : cx) * px;
    for (let sy = 0; sy < px; sy++) for (let sx = 0; sx < px; sx++) {
      const X = ox + sx, Y = cy * px + sy, k = (Y * W + X) * 4;
      if (v < 0) { d[k] = br; d[k + 1] = bgg; d[k + 2] = bb; d[k + 3] = 255; continue; }
      if (BAYER[(Y % 4) * 4 + (X % 4)] / 16 >= v) continue;
      const scan = Y % 3 === 2 ? 0.55 : 1;
      d[k] = r; d[k + 1] = gg; d[k + 2] = b; d[k + 3] = Math.round(255 * scan);
    }
  }
  g.putImageData(img, 0, 0);
  for (const [x, y, c] of grid.light) if (c) { g.fillStyle = c; g.fillRect((mirror ? GW - 1 - x : x) * px - px, y * px - px, px * 3, px * 3); }
  return canvas;
}

export function drawStation(ctx: CanvasRenderingContext2D, t: number) {
  const pi = state.orbit; if (pi === null || cam.s < LOD_PLANETS) return;
  const pl = galaxy.planets[pi], q = motion.planetPos(pi, t), c = cam.toScreen(q.x, q.y);
  const R = Math.max(orbitR(pl) * cam.s + 22, pl.r * cam.s + 40), a = (t / 42000) * Math.PI * 2; // one slow lap in ~40 s
  const x = c.x + Math.cos(a) * R, y = c.y + Math.sin(a) * R * 0.92;
  if (x < -90 || y < -90 || x > cam.W + 90 || y > cam.H + 90) return;
  const { bar } = pulseOf(pl.s, t), col = (al: number) => sc(pl.s, al);

  // its orbit, faintly
  ctx.strokeStyle = col(0.16); ctx.lineWidth = 1; ctx.setLineDash([2, 6]);
  ctx.beginPath(); ctx.ellipse(c.x, c.y, R, R * 0.92, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  // the link to the planet: a faint line with signal pulses running down it, one per bar
  const pr = Math.max(2, pl.r * cam.s), dx = c.x - x, dy = c.y - y, dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl;
  const ex = c.x - ux * pr, ey = c.y - uy * pr, span = Math.max(1, dl - pr);
  ctx.strokeStyle = col(0.14); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
  for (let k = 0; k < 3; k++) {
    const f = ((1 - bar) + k / 3) % 1, px0 = x + ux * span * f, py0 = y + uy * span * f, rr = 2 + 5 * f;
    ctx.strokeStyle = col(0.75 * (1 - f)); ctx.beginPath(); ctx.arc(px0, py0, rr, Math.atan2(uy, ux) - 0.9, Math.atan2(uy, ux) + 0.9); ctx.stroke();
  }

  // the craft: re-shaded every frame, its front toward the planet
  grid.tone.fill(0); grid.light.length = 0;
  probe(t);
  const px = Math.max(2, Math.min(3, Math.round(cam.DPR))), sp = render(pl.s, px, c.x > x);
  const scale = cam.s > 2 ? 1.25 : 1, w = (sp.width / cam.DPR) * scale, h = (sp.height / cam.DPR) * scale;
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(sp, Math.round(x - w / 2), Math.round(y - h / 2), w, h); ctx.restore();

  // a schematic call-out, like a diagnostic screen
  const left = x < c.x, lx = x + (left ? -1 : 1) * (w * 0.5 + 10), ly = y - h * 0.5 - 10;
  ctx.strokeStyle = col(0.6); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x + (left ? -1 : 1) * w * 0.3, y - h * 0.3); ctx.lineTo(lx, ly); ctx.lineTo(lx + (left ? -46 : 46), ly); ctx.stroke();
  ctx.fillStyle = col(0.9); ctx.font = `9px ${FONT_LBL}`; ctx.textAlign = left ? "right" : "left";
  ctx.fillText("SOLARIS · LISTENING", lx + (left ? -2 : 2), ly - 3);
}
