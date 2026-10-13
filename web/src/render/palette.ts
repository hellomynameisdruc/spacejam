// Colours: the terminal phosphor (theme) and each star system's own colour, plus cached sprites.
import { galaxy } from "../app/state";

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
