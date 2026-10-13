// Selection and hover markers: corner brackets plus a leader line with the object's name.
import type { Sel } from "../core/types";
import { chunk, galaxy, motion } from "../app/state";
import { sc } from "./palette";
import { cam } from "./camera";
import { labels } from "./labels";
import { starSize } from "./pulsar";
import { tempoLabel } from "../model/tempo";

/** stars sit still (drawn on the static layer); planets and tracks move (live layer) */
export const isMoving = (o: Sel) => !!o && (o.kind === "planet" || o.kind === "track");

export function drawMarker(o: Sel, strong: boolean) {
  if (!o) return;
  const G = labels.g;
  let x = 0, y = 0, r = 8, name = "", si = 0;
  if (o.kind === "star") { const s = galaxy.stars[o.s], p = cam.toScreen(s.x, s.y); x = p.x; y = p.y; r = starSize(o.s) * 2.6 + 6; name = `${tempoLabel(galaxy.tempo[o.s])} · PEAK ${galaxy.peakYear[o.s]}`; si = o.s; }
  else if (o.kind === "planet") { const pl = galaxy.planets[o.p], q = motion.planetPos(o.p), p = cam.toScreen(q.x, q.y); x = p.x; y = p.y; r = Math.max(9, pl.r * cam.s + 6); name = pl.name; si = pl.s; }
  else { const ch = chunk(o.s); if (!ch) return; const q = motion.trackPos(o.s, o.i), p = cam.toScreen(q.x, q.y); x = p.x; y = p.y; r = 7; name = ch.t[o.i]; si = o.s; }
  labels.brackets(x, y, r, sc(si, strong ? 1 : 0.65), strong ? 7 : 4);
  if (strong) {
    const lx = x + r + 26, ly = y - r - 18;
    G.strokeStyle = sc(si, 0.95); G.lineWidth = 1; G.beginPath(); G.moveTo(x + r, y - r); G.lineTo(x + r + 12, ly + 4); G.lineTo(lx - 4, ly + 4); G.stroke();
    labels.label(name.toUpperCase(), lx, ly + 8, 12, sc(si, 1), "left", true, true);
  }
}
