// The two canvases and the frame loop. The static layer (under) is repainted rarely and slid/scaled by
// CSS in between; the live layer (over) is cleared and redrawn every frame with everything that moves.
import { $, uiZoom } from "../core/dom";
import { chunk, galaxy, motion, sameSel, state } from "../app/state";
import { sc } from "./palette";
import { cam, LOD_TRACKS } from "./camera";
import { inView, MARGIN, updateLiveView } from "./view";
import { labels } from "./labels";
import { drawPulsar, pulseOf, starSize } from "./pulsar";
import { drawPlanets, tickSprites } from "./planets";
import { drawSatellites } from "./satellites";
import { drawRoute } from "./routeLine";
import { drawMarker } from "./markers";
import { drawNames, drawStatic, farView, painted, readout } from "./staticLayer";

let vp: HTMLElement, cv: HTMLCanvasElement, ctx: CanvasRenderingContext2D;
let layer: HTMLCanvasElement, lc: CanvasRenderingContext2D;
let layerShift = "", lastScale = 0, lastScaleT = 0, frameNo = 0;
const perFrame: ((t: number) => void)[] = [];

export const sceneCanvas = () => cv;
export const viewportEl = () => vp;
/** run fn(now) every frame after drawing (dossier animations etc.) */
export const onFrame = (fn: (t: number) => void) => { perFrame.push(fn); };

function resize() {
  // sizes in the page's own px; DPR counts the page zoom so the canvases stay pixel-sharp
  const r = vp.getBoundingClientRect(), z = uiZoom(vp), dpr = Math.min(2, devicePixelRatio || 1) * z;
  cam.W = Math.max(1, r.width / z); cam.H = Math.max(1, r.height / z); cam.DPR = dpr;
  cv.width = cam.W * dpr; cv.height = cam.H * dpr;
  layer.width = (cam.W + 2 * MARGIN) * dpr; layer.height = (cam.H + 2 * MARGIN) * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); lc.setTransform(dpr, 0, 0, dpr, MARGIN * dpr, MARGIN * dpr); ctx.imageSmoothingEnabled = false;
  state.dirty = true;
}

export function initScene() {
  vp = $("viewport"); cv = $<HTMLCanvasElement>("sky"); ctx = cv.getContext("2d")!;
  layer = $<HTMLCanvasElement>("skyBg"); lc = layer.getContext("2d")!;
  labels.g = lc;
  new ResizeObserver(resize).observe(vp); resize();
  const b = galaxy.bounds; cam.x = b.x; cam.y = b.y; cam.s = cam.homeScale();
}

function paintStatic() {
  drawStatic(lc);
  if (layerShift) { layer.style.transform = ""; layerShift = ""; }
}

function drawLive(t: number) {
  // While the wheel is turning, let the browser scale the old layer between repaints; panning just slides it.
  const now = performance.now(), { W, H } = cam;
  if (cam.s !== lastScale) { lastScale = cam.s; lastScaleT = now; }
  let k = cam.s / painted.s, ox = (cam.x - painted.x) * cam.s, oy = (cam.y - painted.y) * cam.s;
  // Where belt tracks are drawn (orbit level and closer) repaint a few times a second so they stay
  // with their planets; further out, and during flights, only when zooming rests or drifts far.
  const stale = k !== 1 && (farView() || cam.flying || cam.s < LOD_TRACKS
    ? now - lastScaleT > 160 || k < 0.62 || k > 1.6
    : now - painted.at > 110 || now - lastScaleT > 140 || k < 0.84 || k > 1.2);
  if (stale || Math.abs(ox) > MARGIN - 4 || Math.abs(oy) > MARGIN - 4) { paintStatic(); k = 1; ox = oy = 0; }
  let shift = "";
  if (k !== 1) {
    const tx = (W / 2 + MARGIN) * (1 - k) + (painted.x - cam.x) * cam.s, ty = (H / 2 + MARGIN) * (1 - k) + (painted.y - cam.y) * cam.s;
    shift = `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${k.toFixed(4)})`;
  } else if (ox || oy) shift = `translate(${(-ox).toFixed(1)}px,${(-oy).toFixed(1)}px)`;
  if (shift !== layerShift) { layer.style.transform = shift; layerShift = shift; }

  ctx.clearRect(0, 0, W, H);
  updateLiveView();
  labels.reset(); labels.g = ctx;
  drawNames();
  drawRoute(ctx, t);
  tickSprites(); if (++frameNo % 6 === 0) readout();
  drawPlanets(ctx, t);
  drawSatellites(ctx, t);
  galaxy.stars.forEach((s, si) => {
    if (!inView(s.x, s.y, starSize(si) * 9 / cam.s)) return;
    const p = cam.toScreen(s.x, s.y);
    drawPulsar(ctx, si, p.x, p.y, starSize(si), t);
  });
  const np = state.nowPlaying;
  if (np && chunk(np.s)) {
    const q = motion.trackPos(np.s, np.i, t), p = cam.toScreen(q.x, q.y), { bar } = pulseOf(np.s, t);
    ctx.strokeStyle = sc(np.s, 0.9 * (1 - bar)); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 6 + bar * 26, 0, 7); ctx.stroke();
  }
  if (state.hover && !sameSel(state.hover, state.sel)) drawMarker(state.hover, false);
  drawMarker(state.sel, true);
  labels.g = lc;
}

function frame(now: number) {
  motion.now = now;
  // a flight doesn't repaint the background every frame (the costliest thing we draw): drawLive slides
  // and stretches the last picture and repaints it only now and then, and once the flight lands
  cam.update(now);
  if (state.dirty) { state.dirty = false; paintStatic(); }
  drawLive(now);
  for (const f of perFrame) f(now);
  requestAnimationFrame(frame);
}
export const startLoop = () => requestAnimationFrame(frame);
