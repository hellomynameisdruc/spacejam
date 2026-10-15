// The plotted route on the map: gradient dashes between stops, a travelling pulse, numbered stops.
import { pad } from "../core/util";
import { reduce } from "../core/dom";
import { baseChunk, galaxy, motion, state } from "../app/state";
import { BG, FONT_LBL, glowS, sc } from "./palette";
import { cam } from "./camera";

export function drawRoute(ctx: CanvasRenderingContext2D, t: number) {
  const route = state.route; if (!route) return;
  const { planets } = galaxy;
  const pts = route.stops.map((i) => { const q = motion.planetPos(i, t); return cam.toScreen(q.x, q.y); });
  ctx.save(); ctx.lineCap = "round";
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1], ca = planets[route.stops[k]].s, cb = planets[route.stops[k + 1]].s;
    const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y); g.addColorStop(0, sc(ca, 1)); g.addColorStop(1, sc(cb, 1));
    ctx.strokeStyle = g; ctx.globalAlpha = 0.18; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.globalAlpha = 0.9; ctx.lineWidth = 1.5; ctx.setLineDash([6, 5]); ctx.lineDashOffset = reduce ? 0 : -t / 60;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
  }
  // a pulse travels the whole route
  if (!reduce && pts.length > 1) {
    const segs = pts.slice(1).map((p, k) => Math.hypot(p.x - pts[k].x, p.y - pts[k].y)), tot = segs.reduce((x, y) => x + y, 0) || 1;
    let d = ((t / 4000) % 1) * tot, k = 0; while (k < segs.length - 1 && d > segs[k]) { d -= segs[k]; k++; }
    const f = segs[k] ? d / segs[k] : 0, px = pts[k].x + (pts[k + 1].x - pts[k].x) * f, py = pts[k].y + (pts[k + 1].y - pts[k].y) * f;
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(glowS[planets[route.stops[k]].s], px - 14, py - 14, 28, 28); ctx.globalCompositeOperation = "source-over";
  }
  // stop markers
  ctx.globalAlpha = 1; ctx.font = `11px ${FONT_LBL}`; ctx.textAlign = "center";
  const cur = state.routeIdx >= 0 ? route.flat[state.routeIdx] : null;
  pts.forEach((p, k) => {
    const pi = route.stops[k], si = planets[pi].s, r = Math.max(7, planets[pi].r * cam.s + 6);
    const active = !!cur && baseChunk(cur.s)?.p[cur.i] === pi;
    ctx.strokeStyle = sc(si, active ? 1 : 0.85); ctx.lineWidth = active ? 2 : 1;
    ctx.strokeRect(Math.round(p.x - r) + 0.5, Math.round(p.y - r) + 0.5, Math.round(r * 2), Math.round(r * 2));
    const tag = pad(k + 1, 2), tw = 18;
    ctx.fillStyle = sc(si, 1); ctx.fillRect(Math.round(p.x - r), Math.round(p.y - r) - 13, tw, 12);
    ctx.fillStyle = BG; ctx.fillText(tag, Math.round(p.x - r) + tw / 2, Math.round(p.y - r) - 3);
  });
  ctx.restore();
}
