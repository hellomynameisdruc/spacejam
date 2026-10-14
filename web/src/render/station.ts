// SOLARIS: while a planet's orbit is playing, a small craft circles it just outside its satellites
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

/** the craft, drawn into the grid for time t (ms); faces left (its dish/front toward the planet) */
const CRAFTS: Record<string, (t: number) => void> = {
  // a deep-space probe: big dish, instrument bus, long boom, power arm — the dish turns slowly
  probe: (t) => {
    const turn = Math.sin(t / 2600) * 0.5, rx = 3 + 4.2 * Math.cos(turn);
    line(16, 14, 42, 6, 0.75); rect(40, 4, 43, 7, (x, y) => lit((x - 41) / 2, (y - 5) / 2)); // boom and its sensor
    line(18, 17, 10, 26, 0.6); rect(8, 24, 11, 27, (x, y) => lit((x - 9) / 2, (y - 25) / 2, 0.85)); // power arm
    rect(16, 10, 23, 18, (x, y) => ((x + y) % 3 === 0 ? -1 : lit((x - 19) / 4, (y - 14) / 4, 0.8))); // bus, foil panels
    ellipse(12, 14, rx, 10, (u, v) => (u * u + v * v > 0.8 ? 0.95 : lit(-u, v, 0.75))); // the dish, rim bright, bowl in shade
    line(12, 14, 4 - 3 * Math.cos(turn), 14, 0.9); // feed horn
    grid.light.push([42, 5, Math.floor(t / 700) % 2 ? "#ff4d6d" : ""]);
  },
  // a satellite: drum body with bands that roll past, two wings of cells that tilt to the sun
  satellite: (t) => {
    const tilt = Math.cos(t / 3200), h = Math.max(1, Math.round(7 * Math.abs(tilt))), back = tilt < 0;
    const wing = (x0: number, x1: number) => rect(x0, 14 - h, x1, 14 + h, (x, y) => (x % 4 === 0 || (y - 14) % 3 === 0 ? -1 : back ? 0.32 : lit((x - 22) / 22, (y - 14) / 8, 0.95)));
    wing(1, 14); wing(30, 43);
    line(14, 14, 18, 14, 0.8); line(26, 14, 30, 14, 0.8); // arms
    const roll = Math.floor(t / 160);
    rect(18, 6, 26, 22, (x, y) => ((y + roll) % 4 === 0 ? -1 : lit((x - 22) / 5, (y - 14) / 9))); // body
    ellipse(22, 5, 4, 1.5, (u) => lit(u, -0.5)); ellipse(22, 23, 4, 1.5, (u) => lit(u, 0.5, 0.6)); // caps
    line(22, 3, 22, 0, 0.9); // antenna
    grid.light.push([22, 0, Math.floor(t / 500) % 3 === 0 ? "#ff4d6d" : ""]);
  },
  // a station: modules in a cross round a node, long panels that turn, docking lights in turn
  station: (t) => {
    const tilt = Math.cos(t / 3600), h = Math.max(1, Math.round(4 * Math.abs(tilt))), back = tilt < 0;
    const panel = (x0: number, x1: number, cy: number) => rect(x0, cy - h, x1, cy + h, (x, y) => ((x - x0) % 3 === 2 ? -1 : back ? 0.3 : lit((x - 22) / 22, (y - cy) / 6, 0.95)));
    line(2, 14, 42, 14, 0.7); // truss
    panel(1, 9, 8); panel(1, 9, 20); panel(35, 43, 8); panel(35, 43, 20);
    line(5, 8, 5, 20, 0.6); line(39, 8, 39, 20, 0.6);
    rect(12, 12, 32, 16, (x, y) => (x % 5 === 0 ? -1 : lit((x - 22) / 10, (y - 14) / 2))); // main module
    rect(20, 3, 24, 25, (x, y) => (y % 5 === 0 ? -1 : lit((x - 22) / 2, (y - 14) / 11))); // cross module
    ellipse(22, 14, 3.5, 3.5, (u, v) => lit(u, v)); // node
    const k = Math.floor(t / 400) % 4, ends: [number, number][] = [[12, 14], [32, 14], [22, 3], [22, 25]];
    grid.light.push([ends[k][0], ends[k][1], "#ff4d6d"]);
  },
};

/** the craft on the map (one of CRAFTS) */
export let shipVariant = "probe";
export const setShipVariant = (v: string) => { if (CRAFTS[v]) shipVariant = v; };

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
  const R = Math.max(orbitR(pl) * cam.s + 22, pl.r * cam.s + 40), a = (t / 16000) * Math.PI * 2;
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

  (window as unknown as { __shipXY: number[] }).__shipXY = [x, y]; // DEBUG
  // the craft: re-shaded every frame, its front toward the planet
  grid.tone.fill(0); grid.light.length = 0;
  CRAFTS[shipVariant](t);
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
