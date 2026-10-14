// SOLARIS: while a planet's orbit is playing, a small pixel ship circles it just outside its
// satellites, drawn like the planets: solid phosphor, dithered shading, dark scanlines. A faint
// beam reaches down to the planet on the beat and the engines flicker.
import { BG, FONT_LBL, sc } from "./palette";
import { galaxy, motion, state } from "../app/state";
import { orbitR } from "../model/galaxy";
import { cam, LOD_PLANETS } from "./camera";
import { pulseOf } from "./pulsar";

// # hull · + half-tone · - quarter-tone · o window · e engine · . empty. Noses point right.
const SHIPS: Record<string, string[]> = {
  cruiser: [
    ".....###.............",
    "...##+++##...........",
    "..#++---++#####......",
    "e##+++++++++++####...",
    "ee#+o+o+o++++++++###.",
    "e##+++++++++++####...",
    "..#++---++#####......",
    "...##+++##...........",
    ".....###.............",
  ],
  rocket: [
    "....##.........",
    "....#+#........",
    "e..##-+###.....",
    "ee#+++++++####.",
    "ee#+o+o+++++++#",
    "ee#+++++++####.",
    "e..##-+###.....",
    "....#+#........",
    "....##.........",
  ],
  saucer: [
    ".....#####.....",
    "....#ooooo#....",
    "..###########..",
    ".#+-+-+-+-+-+#.",
    "###############",
    ".#++++++++++++.",
    "...e...e...e...",
  ],
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** the variant on the map (picked from three; see SHIPS) */
export let shipVariant = "cruiser";
export const setShipVariant = (v: string) => { if (SHIPS[v]) shipVariant = v; };

const cache = new Map<string, HTMLCanvasElement>();
/** the ship as a crisp sprite in a system's colour: cells of `px` device pixels */
function sprite(si: number, px: number, flick: boolean) {
  const key = `${shipVariant}|${si}|${px}|${flick}`; let c = cache.get(key); if (c) return c;
  const rows = SHIPS[shipVariant], w = rows[0].length, h = rows.length;
  c = document.createElement("canvas"); c.width = w * px; c.height = h * px;
  const g = c.getContext("2d")!;
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === ".") return;
    for (let sy = 0; sy < px; sy++) for (let sx = 0; sx < px; sx++) {
      const X = x * px + sx, Y = y * px + sy, b = BAYER[(Y % 4) * 4 + (X % 4)] / 16, scan = Y % 3 === 2;
      let fill: string | null;
      if (ch === "o") fill = BG;
      else if (ch === "e") fill = flick ? (b < 0.6 ? "#ff8a3d" : "#ff4d6d") : (b < 0.35 ? "#ff4d6d" : null);
      else { const tone = ch === "#" ? 1 : ch === "+" ? 0.55 : 0.3; fill = b < tone ? sc(si, scan ? 0.55 : 1) : null; }
      if (fill) { g.fillStyle = fill; g.fillRect(X, Y, 1, 1); }
    }
  }));
  if (cache.size > 200) cache.clear();
  cache.set(key, c); return c;
}

export function drawStation(ctx: CanvasRenderingContext2D, t: number) {
  const pi = state.orbit; if (pi === null || cam.s < LOD_PLANETS) return;
  const pl = galaxy.planets[pi], q = motion.planetPos(pi, t), c = cam.toScreen(q.x, q.y);
  const R = Math.max(orbitR(pl) * cam.s + 18, pl.r * cam.s + 34), a = (t / 16000) * Math.PI * 2;
  const x = c.x + Math.cos(a) * R, y = c.y + Math.sin(a) * R * 0.92;
  if (x < -90 || y < -90 || x > cam.W + 90 || y > cam.H + 90) return;
  const { bar } = pulseOf(pl.s, t), col = (al: number) => sc(pl.s, al);

  // its orbit, faintly, and the listening beam down to the planet
  ctx.strokeStyle = col(0.16); ctx.lineWidth = 1; ctx.setLineDash([2, 6]);
  ctx.beginPath(); ctx.ellipse(c.x, c.y, R, R * 0.92, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  const pr = Math.max(2, pl.r * cam.s), dx = c.x - x, dy = c.y - y, dl = Math.hypot(dx, dy) || 1;
  ctx.strokeStyle = col(0.2 + 0.35 * (1 - bar));
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(c.x - dx / dl * pr, c.y - dy / dl * pr); ctx.stroke();

  // the ship stays level and crisp, like pixel art should: it only turns to face the way it flies
  const px = Math.max(2, Math.min(3, Math.round(cam.DPR * (cam.s > 2 ? 1.5 : 1.1))));
  const sp = sprite(pl.s, px, Math.floor(t / 90) % 2 === 0), w = sp.width / cam.DPR, h = sp.height / cam.DPR;
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.translate(Math.round(x), Math.round(y));
  if (shipVariant !== "saucer" && -Math.sin(a) < 0) ctx.scale(-1, 1); // moving left: face left
  ctx.drawImage(sp, -w / 2, -h / 2, w, h); ctx.restore();

  // a schematic call-out, like a diagnostic screen
  const left = x < c.x, lx = x + (left ? -1 : 1) * (w * 0.5 + 14), ly = y - h - 10;
  ctx.strokeStyle = col(0.6); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y - h * 0.4); ctx.lineTo(lx, ly); ctx.lineTo(lx + (left ? -46 : 46), ly); ctx.stroke();
  ctx.fillStyle = col(0.9); ctx.font = `9px ${FONT_LBL}`; ctx.textAlign = left ? "right" : "left";
  ctx.fillText("SOLARIS · LISTENING", lx + (left ? -2 : 2), ly - 3);
}
