// The visualiser: a ring of LED bars round the planet that is playing, rising off its surface. The
// music itself plays inside YouTube's player, which a page cannot listen to, so the bars are driven by the
// style's tempo instead — a kick in the low bands on every beat, the snare in the mids on two and four,
// hats in the highs on the eighths — shaped by the track (its own mix of bands), building up from the
// intro, and falling to rest on pause. The spectrum runs lows to highs round each half and mirrors, so the
// ring stays symmetric; drawn in segments of the system's phosphor, like the rest.
import { reduce } from "../core/dom";
import { baseChunk, chunk, galaxy, motion, state } from "../app/state";
import { sc } from "../render/palette";
import { cam, LOD_PLANETS } from "../render/camera";
import { player } from "./dock";

const BANDS = 24; // per half of the ring
const level = new Float32Array(BANDS), peak = new Float32Array(BANDS), mix = new Float32Array(BANDS);
let mixKey = "", lastT = 0;
const hash = (n: number) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

/** each track gets its own balance of bands, from its YouTube id */
function shapeFor(yt: string) {
  if (yt === mixKey) return; mixKey = yt;
  let h = 7; for (let k = 0; k < yt.length; k++) h = (h * 31 + yt.charCodeAt(k)) | 0;
  for (let k = 0; k < BANDS; k++) mix[k] = 0.55 + 0.45 * hash(h + k * 3.1);
}

/** the meter's levels for this moment */
function tick(now: number, si: number) {
  const dt = Math.min(0.1, Math.max(0, (now - lastT) / 1000)); lastT = now;
  const playing = state.onAir && !reduce;
  const beat = (now / 1000) * galaxy.bpm[si] / 60 + galaxy.phase0[si], ph = beat % 1, eighth = (beat * 2) % 1;
  const kick = Math.exp(-ph * 7), snare = Math.floor(beat) % 2 === 1 ? Math.exp(-ph * 9) : 0, hat = Math.exp(-eighth * 14);
  const pos = player?.time() ?? 0, build = Math.min(1, 0.7 + pos / 60); // the intro builds up
  for (let k = 0; k < BANDS; k++) {
    const f = k / (BANDS - 1); // 0 = lows, 1 = highs
    const lows = Math.max(0, 1 - f * 3.2) * (0.35 + 0.65 * kick);
    const mids = Math.exp(-((f - 0.45) ** 2) / 0.03) * (0.3 + 0.55 * snare + 0.15 * kick);
    const highs = Math.max(0, f * 1.6 - 0.5) * (0.25 + 0.6 * hat);
    const flutter = 0.12 * hash(k * 13 + Math.floor(now / 70)); // a little life in every band
    const target = playing ? 1 - Math.exp(-3 * (lows + mids + highs + flutter) * mix[k] * build) : 0; // soft ceiling
    // quick to rise, slower to fall, like a meter's ballistics
    level[k] += (target - level[k]) * (target > level[k] ? 0.6 : Math.min(1, dt * 7));
    peak[k] = Math.max(level[k], peak[k] - dt * 0.6);
  }
}

/** drawn on the live layer, after the planets */
export function drawVisualizer(ctx: CanvasRenderingContext2D, t: number) {
  const np = state.nowPlaying; if (!np || cam.s < LOD_PLANETS) { lastT = t; return; }
  const pi = baseChunk(np.s)?.p[np.i] ?? -1; if (pi < 0) { lastT = t; return; }
  const ch = chunk(np.s); if (ch) shapeFor(ch.yt[np.i]);
  tick(t, np.s);
  const pl = galaxy.planets[pi], q = motion.planetPos(pi, t), c = cam.toScreen(q.x, q.y), r = pl.r * cam.s;
  if (r < 4) return;
  const L = Math.max(8, Math.min(r * 0.24, 44)); // tall enough to read, reaching out into the belt
  if (c.x < -r - L || c.y < -r - L || c.x > cam.W + r + L || c.y > cam.H + r + L) return;
  const seg = L >= 24 ? 4 : L >= 12 ? 3 : 2, segs = Math.max(2, Math.floor(L / seg)), r0 = r + 2;
  const n = BANDS * 2, w = Math.max(1, Math.min(7, ((2 * Math.PI * r0) / n) * 0.42));
  ctx.save(); ctx.translate(c.x, c.y); ctx.lineCap = "butt"; ctx.lineWidth = w;
  for (let j = 0; j < n; j++) {
    const k = j < BANDS ? j : n - 1 - j; // mirrored: lows at the top, highs at the bottom
    const a = -Math.PI / 2 + ((j + 0.5) / n) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    const lit = Math.round(level[k] * segs);
    for (let s = 0; s < segs; s++) {
      const d0 = r0 + s * seg, d1 = d0 + seg - 1;
      if (s < lit) ctx.strokeStyle = sc(np.s, 0.4 + 0.6 * (s / segs));
      else if (s % 2 === 0 && j % 2 === 0) ctx.strokeStyle = sc(np.s, 0.06); // the unlit grid, faintly
      else continue;
      ctx.beginPath(); ctx.moveTo(ca * d0, sa * d0); ctx.lineTo(ca * d1, sa * d1); ctx.stroke();
    }
    if (peak[k] > 0.02) { // the peak cap drifts down
      const d = r0 + Math.max(1, Math.round(peak[k] * segs)) * seg - 1;
      ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.beginPath(); ctx.moveTo(ca * d, sa * d); ctx.lineTo(ca * (d + 1), sa * (d + 1)); ctx.stroke();
    }
  }
  ctx.restore();
}
