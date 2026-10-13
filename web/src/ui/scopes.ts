// Small CRT "scopes" in the dossier: dithered planet sphere, sector radar, signal wave, star pulsar.
import type { PType } from "../core/types";
import { galaxy } from "../app/state";
import { BG, FONT_LBL, ph, sc } from "../render/palette";
import { drawPulsar } from "../render/pulsar";

export function fitCanvas(c: HTMLCanvasElement) {
  const r = c.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  c.width = Math.max(1, r.width * dpr); c.height = Math.max(1, r.height * dpr);
  const g = c.getContext("2d")!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = false;
  return { g, w: r.width, h: r.height };
}
const fits = new WeakMap<HTMLCanvasElement, ReturnType<typeof fitCanvas>>();
/** fitted context of a canvas, measured once per canvas element */
export const fitted = (c: HTMLCanvasElement) => { let f = fits.get(c); if (!f) fits.set(c, (f = fitCanvas(c))); return f; };

// dithered sphere (ordered Bayer raster)
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
export function drawSphere(g: CanvasRenderingContext2D, w: number, h: number, seedN: number, t: number, col: (a?: number) => string = ph, type: PType = "rocky", ringed = true) {
  g.fillStyle = BG; g.fillRect(0, 0, w, h);
  const px = 3, cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.36, rot = t / 4000 + seedN;
  const lx = Math.cos(rot) * 0.7, ly = -0.5, lz = Math.sqrt(Math.max(0, 1 - lx * lx - ly * ly));
  g.fillStyle = col(1);
  for (let y = 0; y < h; y += px) for (let x = 0; x < w; x += px) {
    const nx = (x - cx) / r, ny = (y - cy) / r, d = nx * nx + ny * ny;
    if (d > 1) continue;
    const nz = Math.sqrt(1 - d);
    let l = Math.max(0, nx * lx + ny * ly + nz * lz);
    l *= 0.85 + 0.15 * Math.sin((ny * 6 + seedN) * 2 + Math.sin(nx * 3));
    if (type === "giant") l *= Math.sin(ny * 9 + seedN + Math.sin(nx * 2 + t / 3000) * 0.4) > 0 ? 1.1 : 0.45;
    if (type === "young") l *= 0.62;
    if (type === "ancient") {
      l *= 0.8;
      for (let k = 0; k < 5; k++) { const ax = Math.sin(seedN * 3.1 + k * 2.3) * 0.55, ay = Math.cos(seedN * 1.7 + k * 1.9) * 0.55, cr = 0.12 + (k % 3) * 0.06, dd = Math.hypot(nx - ax, ny - ay); if (dd < cr) l *= dd > cr * 0.75 ? 1.4 : 0.25; }
    }
    if (l * 16 > BAYER[(y / px) & 3][(x / px) & 3] + 0.5) g.fillRect(x, y, px - 1, px - 1);
  }
  if (ringed) { g.strokeStyle = col(0.8); g.lineWidth = 1.5; g.beginPath(); g.ellipse(cx, cy, r * 1.55, r * 0.36, -0.35, 0, Math.PI * 2); g.stroke(); g.lineWidth = 1; }
}

export function drawRadar(g: CanvasRenderingContext2D, w: number, h: number, t: number) {
  g.fillStyle = BG; g.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.42, b = galaxy.bounds;
  g.strokeStyle = ph(0.35); g.lineWidth = 1;
  for (const k of [1, 0.66, 0.33]) { g.beginPath(); g.arc(cx, cy, r * k, 0, 7); g.stroke(); }
  g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.moveTo(cx, cy - r); g.lineTo(cx, cy + r); g.stroke();
  const a = (t / 1600) % (Math.PI * 2);
  for (let k = 0; k < 24; k++) { g.strokeStyle = ph(0.5 * (1 - k / 24)); g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a - k * 0.03) * r, cy + Math.sin(a - k * 0.03) * r); g.stroke(); }
  const s = Math.max(b.w, b.h) / 2 / r;
  galaxy.stars.forEach((st, si) => { const x = cx + (st.x - b.x) / s, y = cy + (st.y - b.y) / s; g.fillStyle = sc(si, 1); g.shadowColor = sc(si, 1); g.shadowBlur = 5; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3); g.shadowBlur = 0; });
}

export type WaveMode = { scrub: number; sync: boolean; label?: string };
const waveState = new WeakMap<CanvasRenderingContext2D, { amp: number; ph: number; last: number }>();
/** the signal trace of a track; glides between states, tears like tape while seeking */
export function drawWave(g: CanvasRenderingContext2D, w: number, h: number, t: number, seedN: number, live: boolean, col: (a?: number) => string = ph, mode: WaveMode = { scrub: 0, sync: false }) {
  const st = waveState.get(g) ?? { amp: live ? 0.36 : 0.08, ph: 0, last: t };
  const dt = Math.min(100, t - st.last); st.last = t;
  const target = mode.sync ? 0.05 : mode.scrub ? 0.42 : live ? 0.36 : 0.08;
  st.amp += (target - st.amp) * Math.min(1, dt / 160);
  st.ph += dt * (mode.scrub ? mode.scrub * 0.045 : live ? 1 / 280 : 1 / 1400);
  waveState.set(g, st);
  g.fillStyle = BG; g.fillRect(0, 0, w, h);
  g.strokeStyle = ph(0.12); g.lineWidth = 1; g.beginPath();
  for (let x = 0; x < w; x += 12) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); }
  for (let y = 0; y < h; y += 12) { g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); }
  g.stroke();
  const amp = st.amp, f1 = 2 + (seedN % 5), f2 = 7 + (seedN % 11), sp = st.ph;
  const noise = mode.scrub ? 0.22 : 0;
  g.strokeStyle = col(1); g.lineWidth = 1.5; g.shadowColor = col(0.8); g.shadowBlur = 6; g.beginPath();
  for (let x = 0; x <= w; x += 2) {
    const u = x / w * Math.PI * 2;
    let y = h / 2 + h * amp * (Math.sin(u * f1 + sp) * 0.7 + Math.sin(u * f2 - sp * 1.7) * 0.3) * (live ? 0.75 + 0.25 * Math.sin(sp * 0.3) : 1);
    if (noise) y += (Math.random() - 0.5) * h * noise;
    x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
  }
  g.stroke(); g.shadowBlur = 0;
  if (mode.scrub) {
    // tape-scrub tearing: a few horizontal slices shoved in the seek direction
    for (let k = 0; k < 3; k++) {
      const y0 = Math.floor(Math.random() * h), sh = 2 + Math.floor(Math.random() * 6), dx = mode.scrub * (6 + Math.random() * 18);
      g.drawImage(g.canvas, 0, y0 * (g.canvas.width / w), g.canvas.width, sh * (g.canvas.width / w), dx, y0, w, sh);
    }
  }
  if (mode.sync) { const x = (t / 6 % 1) * w; g.fillStyle = col(0.25); g.fillRect(x - 10, 0, 20, h); }
  if (mode.label) {
    g.font = `11px ${FONT_LBL}`; g.textAlign = mode.scrub < 0 ? "left" : "right";
    const blink = Math.floor(t / 250) % 2 === 0, txt = mode.label;
    const tw = g.measureText(txt).width + 10, tx = mode.scrub < 0 ? 6 : w - 6;
    g.fillStyle = col(blink ? 1 : 0.85); g.fillRect(mode.scrub < 0 ? tx - 4 : tx - tw + 4, 6, tw, 15);
    g.fillStyle = BG; g.fillText(txt, tx + (mode.scrub < 0 ? 1 : -1), 18);
  }
}

/** the big pulsar in a star's dossier */
export function drawPulsarHero(g: CanvasRenderingContext2D, w: number, h: number, si: number, t: number) {
  g.fillStyle = BG; g.fillRect(0, 0, w, h);
  drawPulsar(g, si, w / 2, h / 2 - 6, w * 0.1, t);
  g.font = `10px ${FONT_LBL}`; g.textAlign = "center"; g.fillStyle = sc(si, 1);
  g.fillText(`${galaxy.bpm[si]} BPM`, w / 2, h - 7);
}
