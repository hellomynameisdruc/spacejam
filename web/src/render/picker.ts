// What's under the pointer: a planet's body wins over passing satellites; then satellites/belt tracks;
// then stars.
import type { Sel } from "../core/types";
import { chunk, galaxy, motion } from "../app/state";
import { orbitR } from "../model/galaxy";
import { cam, LOD_PLANETS, LOD_TRACKS } from "./camera";
import { eachTrack } from "./beltGrid";
import { starSize } from "./pulsar";

export function pick(sx: number, sy: number): Sel {
  const { stars, planets, planetsByStar } = galaxy;
  let best: Sel = null, bd = Infinity;
  const consider = (o: Sel, x: number, y: number, thr: number) => { const p = cam.toScreen(x, y), d = Math.hypot(p.x - sx, p.y - sy); if (d < thr && d < bd) { bd = d; best = o; } };
  if (cam.s >= LOD_PLANETS) {
    let hit = -1, hd = Infinity;
    const w0 = cam.toWorld(sx, sy);
    stars.forEach((st, si) => {
      if (Math.hypot(w0.x - st.x, w0.y - st.y) > st.R + 40 / cam.s) return;
      for (const i of planetsByStar[si]) {
        const pl = planets[i], q = motion.planetPos(i), p = cam.toScreen(q.x, q.y), d = Math.hypot(p.x - sx, p.y - sy), r = pl.r * cam.s;
        const reach = Math.max(10, (galaxy.ringed[i] ? r * 1.4 : r) + 6);
        if (d < reach && d - r < hd) { hd = d - r; hit = i; }
      }
    });
    if (hit >= 0) return { kind: "planet", p: hit };
  }
  if (cam.s >= LOD_TRACKS) {
    const w = cam.toWorld(sx, sy), rad = 10 / cam.s;
    stars.forEach((st, s) => {
      const ch = chunk(s); if (!ch || Math.hypot(w.x - st.x, w.y - st.y) > st.R + rad) return;
      eachTrack(s, w.x - rad, w.y - rad, w.x + rad, w.y + rad, (i) => { if (ch.p[i] < 0) consider({ kind: "track", s, i }, ch.x[i], ch.y[i], 10); });
      if (!motion.orbitOf(s)) return;
      for (const pi of planetsByStar[s]) {
        const pl = planets[pi], c = motion.planetPos(pi); if (Math.hypot(w.x - c.x, w.y - c.y) > orbitR(pl) + rad) continue;
        for (let i = pl.t0; i < pl.t1; i++) { const q = motion.trackPos(s, i); if (!motion.hiddenBehind(s, i, q)) consider({ kind: "track", s, i }, q.x, q.y, 10); }
      }
    });
  }
  stars.forEach((st, s) => consider({ kind: "star", s }, st.x, st.y, Math.max(16, starSize(s) * 3 + 4)));
  return best;
}
