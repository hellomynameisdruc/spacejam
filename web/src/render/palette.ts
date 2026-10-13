// Colours: the terminal phosphor (theme) and each star system's own colour, plus cached sprites.
import { galaxy } from "../app/state";
import { hash, lcg } from "../core/util";

let PH = [190, 184, 255];
/** background colour of the current theme */
export let BG = "#07060e";
export const ph = (a = 1) => `rgba(${PH[0]},${PH[1]},${PH[2]},${a})`;
/** read the theme colours from CSS (call after switching phosphor) */
export function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  PH = cs.getPropertyValue("--ph").trim().split(/\s+/).map(Number);
  BG = cs.getPropertyValue("--bg").trim() || BG;
  return { rgb: `rgb(${PH.join(",")})`, bg: BG };
}

export const SC = galaxy.stars.map((s) => { const h = s.color.replace("#", ""); return [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16)); });
/** star system colour with alpha */
export const sc = (si: number, a = 1) => `rgba(${SC[si][0]},${SC[si][1]},${SC[si][2]},${a})`;
/** star colour mixed toward white by k */
export const mixW = (si: number, k: number, a: number) => `rgba(${SC[si].map((v) => Math.round(v + (255 - v) * k)).join(",")},${a})`;

export function sprite(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; paint(c.getContext("2d")!); return c;
}
/** soft glow per star (used instead of shadowBlur, which is slow) */
export const glowS = galaxy.stars.map((_, si) => sprite(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.16, sc(si, 1)); gr.addColorStop(0.42, sc(si, 0.32)); gr.addColorStop(1, sc(si, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
}));
export const starDither = galaxy.stars.map((_, si) => sprite(3, 3, (g) => { g.fillStyle = sc(si, 1); g.fillRect(0, 0, 1, 1); g.fillRect(2, 1, 1, 1); g.fillStyle = sc(si, 0.5); g.fillRect(1, 2, 1, 1); }));
const ditherPats: (CanvasPattern | null)[] = [];
/** planets' dithered fill */
export function planetDither(g: CanvasRenderingContext2D, si: number) {
  if (ditherPats[si]) return ditherPats[si]!;
  const c = sprite(3, 3, (x) => { x.fillStyle = sc(si, 0.95); x.fillRect(0, 0, 1, 1); x.fillStyle = sc(si, 0.45); x.fillRect(2, 2, 1, 1); });
  return (ditherPats[si] = g.createPattern(c, "repeat"))!;
}

export const FONT_LBL = "DotGothic16, 'Martian Mono', monospace";

const rgbOf = (hex: string) => [0, 2, 4].map((k) => parseInt(hex.replace("#", "").slice(k, k + 2), 16));
/** a galaxy's cloud: soft noise in its colour, dithered like the rest of the screen (seeded by name) */
export const nebulaS = galaxy.nebulae.map((n) => {
  const N = 128, rnd = lcg(hash(n.id) || 1), [r, g, b] = rgbOf(n.color);
  // value noise: a few octaves of random grids, smoothly interpolated
  const oct = [4, 8, 16, 32].map((m) => ({ m, v: Array.from({ length: (m + 1) * (m + 1) }, () => rnd()) }));
  const sm = (t: number) => t * t * (3 - 2 * t);
  const noise = (x: number, y: number) => oct.reduce((acc, { m, v }, k) => {
    const fx = x * m, fy = y * m, ix = Math.min(m - 1, Math.floor(fx)), iy = Math.min(m - 1, Math.floor(fy)), tx = sm(fx - ix), ty = sm(fy - iy);
    const at = (a: number, c: number) => v[c * (m + 1) + a];
    const top = at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx, bot = at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx;
    return acc + (top * (1 - ty) + bot * ty) / 2 ** k;
  }, 0) / 1.875;
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  // a few lobes, so clouds aren't perfect discs
  const lobes = Array.from({ length: 3 }, () => ({ a: rnd() * 6.283, d: 0.12 + rnd() * 0.18, w: 0.5 + rnd() * 0.5 }));
  return sprite(N, N, (G) => {
    const img = G.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N, dx = u - 0.5, dy = v - 0.5;
      let fall = Math.max(0, 1 - Math.hypot(dx, dy) / 0.5);
      for (const l of lobes) fall = Math.max(fall, l.w * Math.max(0, 1 - Math.hypot(dx - Math.cos(l.a) * l.d, dy - Math.sin(l.a) * l.d) / 0.3));
      const d = Math.max(0, noise(u, v) * 1.3 - 0.28) * fall ** 1.2;
      const k = (y * N + x) * 4, q = bayer[(y % 4) * 4 + (x % 4)] / 16;
      const on = d > q * 0.9 ? 1 : 0.35;
      img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = Math.min(255, d * 620 * on);
    }
    G.putImageData(img, 0, 0);
  });
});
export const NC = galaxy.nebulae.map((n) => rgbOf(n.color));
/** galaxy colour with alpha */
export const nc = (k: number, a = 1) => `rgba(${NC[k][0]},${NC[k][1]},${NC[k][2]},${a})`;
