// SOLARIS: while a planet's orbit is playing, a small pixel station circles it just outside its
// satellites, with a blinking beacon and a faint beam down to the planet it is listening to.
import { galaxy, motion, state } from "../app/state";
import { orbitR } from "../model/galaxy";
import { cam, LOD_PLANETS } from "./camera";
import { ph, sc } from "./palette";
import { pulseOf } from "./pulsar";

// X = hull (phosphor), P = solar panel (system colour), . = empty
const SPRITE = [
  "PPP.......PPP",
  "PPP..XXX..PPP",
  "PPPXX...XXPPP",
  "PPP.X.X.X.PPP",
  "PPPXX...XXPPP",
  "PPP..XXX..PPP",
  "PPP.......PPP",
];

export function drawStation(ctx: CanvasRenderingContext2D, t: number) {
  const pi = state.orbit; if (pi === null || cam.s < LOD_PLANETS) return;
  const pl = galaxy.planets[pi], q = motion.planetPos(pi, t), c = cam.toScreen(q.x, q.y);
  const R = Math.max(orbitR(pl) * cam.s + 18, pl.r * cam.s + 34), a = (t / 14000) * Math.PI * 2;
  const x = c.x + Math.cos(a) * R, y = c.y + Math.sin(a) * R * 0.92;
  if (x < -40 || y < -40 || x > cam.W + 40 || y > cam.H + 40) return;
  const { bar } = pulseOf(pl.s, t);
  // the station's own orbit, faintly
  ctx.strokeStyle = sc(pl.s, 0.18); ctx.lineWidth = 1; ctx.setLineDash([2, 6]);
  ctx.beginPath(); ctx.ellipse(c.x, c.y, R, R * 0.92, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  // listening beam down to the planet, breathing with the beat
  const pr = Math.max(2, pl.r * cam.s), dx = c.x - x, dy = c.y - y, dl = Math.hypot(dx, dy) || 1;
  ctx.strokeStyle = sc(pl.s, 0.25 + 0.35 * (1 - bar)); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(c.x - dx / dl * pr, c.y - dy / dl * pr); ctx.stroke();
  // the station, pixel by pixel
  const cell = Math.max(2, Math.min(3, Math.round(cam.s * 1.2))), w = SPRITE[0].length * cell, h = SPRITE.length * cell;
  const x0 = Math.round(x - w / 2), y0 = Math.round(y - h / 2);
  SPRITE.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === ".") return;
    ctx.fillStyle = ch === "X" ? ph(0.95) : sc(pl.s, (i + j) % 2 ? 0.95 : 0.6);
    ctx.fillRect(x0 + i * cell, y0 + j * cell, cell, cell);
  }));
  // beacon: one red blink per bar
  if (bar > 0.75) { ctx.fillStyle = "#ff4d6d"; ctx.fillRect(Math.round(x - cell / 2), y0 - cell * 2, cell, cell); }
}
