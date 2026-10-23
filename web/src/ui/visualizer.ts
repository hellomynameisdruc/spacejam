// The visualiser in the player: a strip of LED bars under the title. The music itself plays inside
// YouTube's player, which a page cannot listen to, so the bars are driven by the style's tempo instead —
// a kick in the low bands on every beat, the snare in the mids on two and four, hats in the highs on the
// eighths — shaped by the track (its own mix of bands), building up from the intro, and falling to rest
// on pause. Drawn like the rest: segments in the system's phosphor, peak caps that drift down.
import { reduce } from "../core/dom";
import { chunk, galaxy, state } from "../app/state";
import { sc } from "../render/palette";
import { cam } from "../render/camera";
import { player } from "./dock";

const BANDS = 28, SEG = 2, GAP = 1; // bars; segment height and gap, css px
let cv: HTMLCanvasElement, g: CanvasRenderingContext2D;
const level = new Float32Array(BANDS), peak = new Float32Array(BANDS), mix = new Float32Array(BANDS);
let mixKey = "", lastT = 0, still = false;
const hash = (n: number) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

/** each track gets its own balance of bands, from its YouTube id */
function shapeFor(yt: string) {
  if (yt === mixKey) return; mixKey = yt;
  let h = 7; for (let k = 0; k < yt.length; k++) h = (h * 31 + yt.charCodeAt(k)) | 0;
  for (let k = 0; k < BANDS; k++) mix[k] = 0.55 + 0.45 * hash(h + k * 3.1);
}

export function initVisualizer() {
  cv = document.getElementById("viz") as HTMLCanvasElement; g = cv.getContext("2d")!;
  // its own clock: the map only redraws while something on it moves, the meter must keep running
  const tick = (t: number) => { frame(t); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

function frame(now: number) {
  const np = state.nowPlaying, dock = document.getElementById("playerBox");
  if (!np || !dock || dock.hidden || document.hidden) { lastT = now; return; }
  const W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
  const dpr = Math.min(2, cam.DPR);
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { still = false; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  const si = np.s, ch = chunk(si); if (ch) shapeFor(ch.yt[np.i]);
  const playing = state.onAir && !reduce;
  const rest = !playing && peak.every((v) => v < 0.005);
  if (rest && still) { lastT = now; return; } // at rest and already drawn so: nothing to redraw
  still = rest;
  // the beat clock: the style's tempo
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
  // draw: bars of segments, a peak cap above each, the top segments brighter
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const bw = W / BANDS, segs = Math.floor(H / (SEG + GAP));
  for (let k = 0; k < BANDS; k++) {
    const x = Math.round(k * bw) + 0.5, w = Math.max(1, Math.round(bw) - 2), n = Math.round(level[k] * segs);
    for (let s = 0; s < segs; s++) {
      const y = H - (s + 1) * (SEG + GAP);
      if (s < n) { g.fillStyle = sc(si, 0.45 + 0.55 * (s / segs)); g.fillRect(x, y, w, SEG); }
      else if (s % 2 === 0 && k % 2 === 0) { g.fillStyle = sc(si, 0.07); g.fillRect(x, y, w, SEG); } // the unlit grid, faintly
    }
    const py = H - Math.max(1, Math.round(peak[k] * segs)) * (SEG + GAP);
    if (peak[k] > 0.02) { g.fillStyle = "rgba(255,255,255,.85)"; g.fillRect(x, py, w, 1); }
  }
}
