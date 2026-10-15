// Satellites (tracks) swarming around their planets, with beacons blinking around marked ones.
import { reduce } from "../core/dom";
import { baseChunk, beacons, chunk, dead, galaxy, motion } from "../app/state";
import { orbitR } from "../model/galaxy";
import { mixW, sc } from "./palette";
import { cam, LOD_TITLES, LOD_TRACKS } from "./camera";
import { inLive } from "./view";
import { labels } from "./labels";

export function drawSatellites(ctx: CanvasRenderingContext2D, t: number) {
  if (cam.s < LOD_TRACKS) return;
  const { W, H } = cam;
  const sz = Math.max(1, Math.min(3, Math.round(cam.s * 0.9))), titles = cam.s >= LOD_TITLES, half = sz / 2;
  const ts = reduce ? 0 : t / 1000, k = cam.s, ox = W / 2 - cam.x * k, oy = H / 2 - cam.y * k;
  let nT = 0;
  galaxy.stars.forEach((st, si) => {
    if (!inLive(st.x, st.y, st.R)) return;
    const ch = baseChunk(si), o = ch && motion.orbitOf(si); if (!ch || !o) return;
    const named = titles && !!chunk(si); // titles may arrive a moment after the satellites
    const back = new Path2D(), front = new Path2D(), marked = new Path2D(), dark = new Path2D();
    for (const pi of galaxy.planetsByStar[si]) {
      const pl = galaxy.planets[pi], c = motion.planetPos(pi, t), cx = c.x, cy = c.y, rr = pl.r * pl.r;
      if (!inLive(cx, cy, orbitR(pl)) || !motion.ensurePlanet(pi)) continue;
      for (let i = pl.t0; i < pl.t1; i++) {
        const d = o.d[i]; if (!d) continue;
        const th = o.th[i] + ts * o.w[i], cs = Math.cos(th), sn = Math.sin(th);
        const X = d * cs, Y = d * sn * o.ci[i], z = d * sn * o.si[i];
        const dx = X * o.cO[i] - Y * o.sO[i], dy = X * o.sO[i] + Y * o.cO[i];
        if (z < 0 && dx * dx + dy * dy < rr) continue; // behind the planet
        const sx = (cx + dx) * k + ox, sy = (cy + dy) * k + oy;
        if (sx < -4 || sx > W + 4 || sy < -4 || sy > H + 4) continue;
        // a dead signal (its video is gone) is only a dim outline of a dot, and has no title
        if (dead.size && dead.has(ch.yt[i])) { dark.rect(Math.round(sx - half) + 0.5, Math.round(sy - half) + 0.5, Math.max(1, sz - 1), Math.max(1, sz - 1)); continue; }
        (z >= 0 ? front : back).rect(Math.round(sx - half), Math.round(sy - half), sz, sz);
        if (beacons.size && beacons.hasId(ch.yt[i])) {
          const r = sz / 2 + 4.5, cx2 = Math.round(sx) + 0.5, cy2 = Math.round(sy) + 0.5;
          marked.moveTo(cx2, cy2 - r); marked.lineTo(cx2 + r, cy2); marked.lineTo(cx2, cy2 + r); marked.lineTo(cx2 - r, cy2); marked.closePath();
        }
        if (named && z > 0 && nT < 160 && labels.label(ch.t[i], sx + 6, sy + 4, 11, sc(si, 0.75), "left")) nT++;
      }
    }
    ctx.fillStyle = sc(si, 0.35); ctx.fill(back);
    ctx.fillStyle = sc(si, 0.95); ctx.fill(front);
    ctx.strokeStyle = sc(si, 0.22); ctx.lineWidth = 1; ctx.stroke(dark);
    ctx.strokeStyle = mixW(si, 0.55, reduce ? 0.95 : 0.55 + 0.45 * Math.abs(Math.sin(t / 420))); ctx.lineWidth = 1; ctx.stroke(marked);
  });
}
