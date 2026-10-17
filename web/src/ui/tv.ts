// TIME WARP as found footage: while a label's history plays, the map gives way to a full-screen security
// monitor. It cuts between cameras on the bar — a portrait of her swaying to the style's tempo, a camera
// high above as she looks up into it, a corridor someone walks across on the beat, then all four at once —
// under a camcorder's on-screen display: REC, the timecode of the track, the date in the year on air, tape
// left, and TAPE END when the history is over. Drawn like the rest of the cosmos: a small grey picture,
// ordered dithering into the system's phosphor colour, dark scanlines, big pixels.
// The YouTube player and the odyssey panel stay above it, uncovered; Esc or "back to map" switches it off.
import { reduce } from "../core/dom";
import { chunk, galaxy, state } from "../app/state";
import { BG, SC, sc } from "../render/palette";
import { cam } from "../render/camera";
import { onFrame, viewportEl } from "../render/scene";
import { routePanelWidth } from "./routePanel";
import { lampLit } from "../core/util";
import { player } from "./dock";

const PIC = 4, FH = 72; // picture cells per screen cell, and the screen's height in cells
let FW = 108; // its width follows the viewport's shape
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const ON_MS = 900, OFF_MS = 520;

let cv: HTMLCanvasElement, g: CanvasRenderingContext2D, pic: HTMLCanvasElement, pg: CanvasRenderingContext2D, back: HTMLButtonElement, reopen: HTMLButtonElement;
let open = false, phase: "on" | "off" | "" = "", t0 = 0, lastKey = "", switchAt = -1e9, lastCam = -1, bgCol = [7, 6, 14];

export const tvOpen = () => open;
const timeWarpOn = () => !!state.route?.years;

export function openTv() {
  if (open && phase !== "off") return;
  open = true; phase = "on"; t0 = performance.now(); cv.style.display = "block"; back.hidden = false; reopen.hidden = true;
}
export function closeTv() {
  if (!open || phase === "off") return;
  phase = "off"; t0 = performance.now(); state.mapHidden = false; state.dirty = true; back.hidden = true;
}

export function initTv() {
  cv = document.createElement("canvas"); cv.className = "tv"; cv.setAttribute("aria-hidden", "true"); viewportEl().appendChild(cv);
  g = cv.getContext("2d")!;
  pic = document.createElement("canvas"); pg = pic.getContext("2d", { willReadFrequently: true })!;
  back = document.createElement("button"); back.type = "button"; back.className = "key tv-back"; back.hidden = true;
  back.textContent = "◂ BACK TO MAP"; back.onclick = closeTv; viewportEl().appendChild(back);
  reopen = document.getElementById("dockTv") as HTMLButtonElement; reopen.onclick = openTv;
  onFrame(frame);
  addEventListener("keydown", (e) => { if (e.key === "Escape" && open && phase !== "off") { e.stopImmediatePropagation(); closeTv(); } }, true);
}

// ---------- the face on the monitor ----------
const W1 = (a: number) => `rgba(255,255,255,${a})`;
/** an opaque grey, for the dark features drawn over the lit face */
const Gr = (v: number) => { const n = Math.round(v * 255); return `rgb(${n},${n},${n})`; };
/**
 * A close-up in soft grey, dithered like everything else: long dark hair, a calm face. She sways with the
 * bar and nods on the beat, turns her head away and back, blinks, and every few bars tucks her hair back.
 */
function drawPortrait(c: CanvasRenderingContext2D, cx: number, cy: number, now: number, beat: number) {
  const bar = beat / 4, tilt = reduce ? 0 : Math.sin(Math.PI * bar) * 0.09, nod = reduce ? 0 : Math.exp(-(beat % 1) * 5) * 1.2;
  const drift = (k: number) => (reduce ? 0 : Math.sin(now / 1300 + k * 1.7) * 1.2 + Math.sin(Math.PI * bar + k) * 0.8);
  c.save(); c.translate(cx, cy + nod); c.rotate(tilt); c.scale(1.2, 1.2);
  // hair behind: a long dark fall down past the shoulders, with lighter strands
  c.fillStyle = Gr(0.13); c.beginPath();
  c.moveTo(-15, -6); c.bezierCurveTo(-18, -26, 18, -26, 15, -6);
  c.bezierCurveTo(19, 10, 20 + drift(1), 26, 22 + drift(2), 40); c.lineTo(-22 + drift(3), 40); c.bezierCurveTo(-20 + drift(4), 26, -19, 10, -15, -6); c.fill();
  c.strokeStyle = Gr(0.3); c.lineWidth = 1;
  for (let k = 0; k < 7; k++) {
    const side = k % 2 ? 1 : -1, x0 = side * (9 + (k % 3) * 2.5);
    c.beginPath(); c.moveTo(x0, -10); c.quadraticCurveTo(x0 + side * 6, 12, x0 + side * (8 + k * 0.6) + drift(k), 36); c.stroke();
  }
  // neck and shoulders, in shadow
  c.fillStyle = W1(0.4); c.beginPath(); c.moveTo(-5, 10); c.lineTo(5, 10); c.lineTo(6, 22); c.lineTo(-6, 22); c.closePath(); c.fill();
  const sh = c.createLinearGradient(0, 20, 0, 40); sh.addColorStop(0, W1(0.5)); sh.addColorStop(1, W1(0.12));
  c.fillStyle = sh; c.beginPath(); c.moveTo(-6, 20); c.bezierCurveTo(-14, 22, -26, 26, -30, 40); c.lineTo(30, 40); c.bezierCurveTo(26, 26, 14, 22, 6, 20); c.closePath(); c.fill();
  // the face: lit from the upper left, falling off to the jaw
  const fg = c.createRadialGradient(-4, -6, 2, 0, 0, 17); fg.addColorStop(0, W1(0.85)); fg.addColorStop(0.6, W1(0.62)); fg.addColorStop(1, W1(0.3));
  c.fillStyle = fg; c.beginPath(); c.moveTo(0, -15); c.bezierCurveTo(10, -15, 11.5, -5, 10.5, 2); c.bezierCurveTo(9.5, 9, 4, 14, 0, 14); c.bezierCurveTo(-4, 14, -9.5, 9, -10.5, 2); c.bezierCurveTo(-11.5, -5, -10, -15, 0, -15); c.fill();
  // she turns her head away and back: the features slide over and the far eye narrows
  const sm = (x: number) => x * x * (3 - 2 * x), seg = reduce ? 0 : (beat / 8) % 4, q = seg % 1, side = Math.floor(seg) === 1 ? -1 : Math.floor(seg) === 3 ? 1 : 0;
  const turn = side * 0.65 * (q < 0.25 ? sm(q / 0.25) : q > 0.75 ? sm((1 - q) / 0.25) : 1), ox = turn * 3.4;
  // eyes: almonds that blink now and then and sometimes look aside
  const blink = !reduce && now % 4300 < 140, look = reduce ? 0 : Math.round(Math.sin(now / 3100) * 1.2) * 0.6 + turn;
  for (const ex0 of [-4.6, 4.6]) {
    const far = Math.max(0, -Math.sign(ex0) * turn), wk = 1 - 0.55 * far, ex = ex0 * (1 - 0.25 * far) + ox;
    c.fillStyle = Gr(0.5); c.beginPath(); c.ellipse(ex, -2.4, 3.4 * wk, 1.4, 0, Math.PI, 0); c.fill(); // lid shadow
    if (blink) { c.fillStyle = Gr(0); c.fillRect(ex - 3.2 * wk, -1.6, 6.4 * wk, 1.1); continue; }
    c.fillStyle = Gr(0); c.beginPath(); c.ellipse(ex, -1.2, 2.9 * wk, 1.25, 0, 0, 7); c.fill(); // the eye, dark
    c.fillStyle = Gr(0.9); c.beginPath(); c.arc(ex + look * wk + 0.7, -1.7, 0.6, 0, 7); c.fill(); // glint
  }
  c.strokeStyle = Gr(0.08); c.lineWidth = 1.1; // brows
  c.beginPath(); c.moveTo(-8 + ox, -5.6); c.quadraticCurveTo(-5 + ox, -7.4, -2 + ox, -6); c.moveTo(2 + ox, -6); c.quadraticCurveTo(5 + ox, -7.4, 8 + ox, -5.6); c.stroke();
  const nx = ox * 1.25, nd = turn > 0.2 ? 1 : turn < -0.2 ? -1 : 1; // the nose points the way she turns
  c.strokeStyle = Gr(0.3); c.lineWidth = 0.9; c.beginPath(); c.moveTo(0.8 * nd + nx, -0.5); c.lineTo(1.6 * nd + nx + turn * 1.5, 4); c.lineTo(-0.6 * nd + nx, 4.7); c.stroke(); // nose
  c.fillStyle = Gr(0.32); c.beginPath(); c.ellipse(ox * 0.9, 8.2, 3.1 * (1 - 0.3 * Math.abs(turn)), 1.3, 0, 0, 7); c.fill(); // lips
  c.strokeStyle = Gr(0); c.lineWidth = 0.7; c.beginPath(); c.moveTo(-3 + ox * 0.9, 8); c.quadraticCurveTo(ox * 0.9, 8.7, 3 + ox * 0.9, 8); c.stroke();
  // fringe: two locks falling over the forehead, swinging a little with the turn
  c.fillStyle = Gr(0.14); c.beginPath(); c.moveTo(ox * 0.4, -16); c.bezierCurveTo(-8, -15, -11, -9, -11.5 + Math.min(0, ox), 2); c.bezierCurveTo(-9, -6, -5, -11, 1 + ox * 0.4, -12); c.fill();
  c.beginPath(); c.moveTo(ox * 0.4, -16); c.bezierCurveTo(8, -15, 11, -9, 11.5 + Math.max(0, ox), 2); c.bezierCurveTo(9.5, -7, 5, -11, -1 + ox * 0.4, -12); c.fill();
  // every few bars she lifts a hand and tucks her hair behind her ear
  const hb = reduce ? 0 : (beat % 16) - 11;
  if (hb > 0 && hb < 5) {
    const up = hb < 1 ? sm(hb) : hb > 4 ? sm(5 - hb) : 1, hx = -10.5 + Math.sin(hb * Math.PI) * 0.8, hy = 4 + (1 - up) * 30;
    c.strokeStyle = Gr(0.18); c.lineWidth = 4.2; c.lineCap = "round"; c.beginPath(); c.moveTo(-20, 44); c.quadraticCurveTo(-19, 22, hx - 1, hy + 4); c.stroke(); // sleeve
    c.fillStyle = Gr(0.66); c.beginPath(); c.ellipse(hx, hy, 2.8, 3.8, -0.3, 0, 7); c.fill(); // hand
    c.strokeStyle = Gr(0.66); c.lineWidth = 1.1; c.beginPath();
    for (let f = 0; f < 3; f++) { c.moveTo(hx - 1 + f * 1.2, hy - 3); c.lineTo(hx - 0.5 + f * 1.4, hy - 6.5 + Math.abs(f - 1)); }
    c.stroke();
  }
  c.restore();
}

// ---------- the feeds: the monitor cycles through security cameras ----------

/** which feed is on: four bars each — her portrait, the camera above her, the corridor, then all four at once */
const CAMS = ["CAM 1", "CAM 2", "CAM 3", "QUAD"] as const;
const camOf = (beat: number) => (reduce ? 0 : Math.floor(beat / 16) % 4);

function sceneFace(c: CanvasRenderingContext2D, now: number, beat: number) {
  const glow = 0.2 + 0.08 * Math.exp(-(beat % 1) * 4);
  const gl = c.createRadialGradient(FW / 2, 32, 2, FW / 2, 34, 38);
  gl.addColorStop(0, W1(glow)); gl.addColorStop(1, W1(0)); c.fillStyle = gl; c.fillRect(0, 0, FW, FH);
  drawPortrait(c, FW / 2, 37, now, beat);
}
/** a camera high in a corner, looking down on her: she looks straight up into it */
function sceneAbove(c: CanvasRenderingContext2D, now: number, beat: number) {
  c.fillStyle = W1(0.42); c.fillRect(0, 0, FW, FH); // floor
  c.fillStyle = Gr(0.22); c.beginPath(); c.moveTo(0, 0); c.lineTo(15, 0); c.lineTo(9, FH); c.lineTo(0, FH); c.fill(); // walls, bent by the lens
  c.fillStyle = Gr(0.3); c.beginPath(); c.moveTo(FW, 0); c.lineTo(FW - 12, 0); c.lineTo(FW - 6, FH); c.lineTo(FW, FH); c.fill();
  c.strokeStyle = W1(0.75); c.lineWidth = 1.2; c.beginPath(); c.moveTo(FW - 18, FH); c.quadraticCurveTo(FW - 6, FH - 14, FW - 4, FH - 34); c.stroke(); // a handrail
  c.strokeStyle = Gr(0.08); c.lineWidth = 0.8; c.beginPath(); c.moveTo(13, 0); c.quadraticCurveTo(16, 30, 12, 56); c.stroke(); // a cable
  const sway = reduce ? 0 : Math.sin(Math.PI * beat / 2) * 1.2, x = FW / 2 + sway, nod = reduce ? 0 : Math.exp(-(beat % 1) * 5) * 0.8;
  c.fillStyle = W1(0.25); c.beginPath(); c.ellipse(x + 2, 60, 9, 4, 0, 0, 7); c.fill(); // her shadow
  // seen from above: big head, shoulders, the body falling away to small feet
  c.fillStyle = Gr(0.1); c.beginPath(); c.moveTo(x - 13, 34); c.quadraticCurveTo(x, 28, x + 13, 34); c.lineTo(x + 5, 62); c.lineTo(x - 5, 62); c.closePath(); c.fill();
  c.strokeStyle = Gr(0.32); c.lineWidth = 0.9; c.beginPath(); c.moveTo(x - 4, 32); c.lineTo(x - 2, 48); c.moveTo(x + 4, 32); c.lineTo(x + 2, 48); c.stroke(); // lapels
  c.fillStyle = Gr(0.06); c.beginPath(); c.ellipse(x, 22 + nod, 8.5, 9.5, 0, 0, 7); c.fill(); // hair
  c.fillStyle = Gr(0.68); c.beginPath(); c.ellipse(x, 24 + nod, 5.2, 6.4, 0, 0, 7); c.fill(); // face
  c.fillStyle = Gr(0.05); for (const ex of [-2.1, 2.1]) { c.beginPath(); c.ellipse(x + ex, 22.6 + nod, 1.1, 0.8, 0, 0, 7); c.fill(); }
  c.strokeStyle = Gr(0.25); c.lineWidth = 0.7; c.beginPath(); c.moveTo(x - 1.6, 27.4 + nod); c.quadraticCurveTo(x, 28.2 + nod, x + 1.6, 27.4 + nod); c.stroke();
  // every other phrase she raises a hand and waves up at the camera
  const wb = reduce ? 0 : (beat % 8) - 4;
  if (wb > 0) {
    const up = Math.min(1, wb * 2, (4 - wb) * 2), wave = Math.sin(beat * Math.PI * 2) * 2.5 * up;
    const hx = x + 11 + wave, hy = 34 - up * 20;
    c.strokeStyle = Gr(0.1); c.lineWidth = 3.4; c.lineCap = "round"; c.beginPath(); c.moveTo(x + 10, 34); c.lineTo(hx, hy + 3); c.stroke();
    c.fillStyle = Gr(0.66); c.beginPath(); c.ellipse(hx, hy, 2.2, 2.8, wave * 0.08, 0, 7); c.fill();
  }
}
/** a corridor, one point perspective, someone walking across it on the beat */
function sceneHall(c: CanvasRenderingContext2D, now: number, beat: number) {
  const vx = FW / 2, bx0 = vx - 9, bx1 = vx + 9, by0 = 24, by1 = 42;
  const poly = (v: number, pts: number[]) => { c.fillStyle = W1(v); c.beginPath(); c.moveTo(pts[0], pts[1]); for (let k = 2; k < pts.length; k += 2) c.lineTo(pts[k], pts[k + 1]); c.closePath(); c.fill(); };
  poly(0.3, [0, 0, FW, 0, bx1, by0, bx0, by0]); poly(0.62, [0, 0, bx0, by0, bx0, by1, 0, FH]); poly(0.5, [FW, 0, bx1, by0, bx1, by1, FW, FH]);
  poly(0.8, [bx0, by1, bx1, by1, FW, FH, 0, FH]); poly(0.18, [bx0, by0, bx1, by0, bx1, by1, bx0, by1]);
  c.fillStyle = W1(1); for (const z of [0.25, 0.5, 0.75]) { const y = by0 * z, hw = (1 - z) * 14 + 2; c.fillRect(vx - hw / 2, y, hw, 1); } // ceiling lights
  c.fillStyle = Gr(0.15); c.fillRect(6, 22, 6, 30); c.fillRect(FW - 11, 26, 4, 22); // doors
  // the walker: across the floor and back, a step on every beat
  const lap = reduce ? 0.5 : (beat / 16) % 2, p = lap < 1 ? lap : 2 - lap, wx = 8 + p * (FW - 16), wy = 58, st = Math.sin(Math.PI * beat) * 0.45;
  // her: long dark hair swinging as she walks, a jacket, arms and legs keeping step
  const dir = lap < 1 ? 1 : -1, hairSw = Math.sin(Math.PI * beat) * 0.8;
  c.fillStyle = Gr(0.06); c.beginPath(); c.moveTo(wx - 2.4, wy - 15); c.quadraticCurveTo(wx - 3.2 - dir * 1.2 + hairSw, wy - 10, wx - 2.6 - dir * 1.5 + hairSw, wy - 8.5);
  c.lineTo(wx + 2.6 - dir * 1.5 + hairSw, wy - 8.5); c.quadraticCurveTo(wx + 3.2 - dir * 1.2 + hairSw, wy - 10, wx + 2.4, wy - 15); c.fill(); // hair
  c.lineCap = "round"; c.strokeStyle = Gr(0.1); c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(wx, wy - 6); c.lineTo(wx + Math.sin(st) * 5, wy); c.moveTo(wx, wy - 6); c.lineTo(wx - Math.sin(st) * 5, wy); c.stroke(); // legs
  c.fillStyle = Gr(0.12); c.beginPath(); c.moveTo(wx - 3, wy - 12.5); c.lineTo(wx + 3, wy - 12.5); c.lineTo(wx + 2.3, wy - 5.5); c.lineTo(wx - 2.3, wy - 5.5); c.closePath(); c.fill(); // jacket
  c.lineWidth = 1.2; c.beginPath(); c.moveTo(wx - 2.6, wy - 12); c.lineTo(wx - 2.6 - Math.sin(st) * 3, wy - 7); c.moveTo(wx + 2.6, wy - 12); c.lineTo(wx + 2.6 + Math.sin(st) * 3, wy - 7); c.stroke(); // arms
  c.fillStyle = Gr(0.08); c.beginPath(); c.arc(wx, wy - 15, 2.3, 0, 7); c.fill(); // head
  // halfway across she glances at the camera
  if (Math.abs(p - 0.5) < 0.07) { c.fillStyle = Gr(0.62); c.beginPath(); c.ellipse(wx, wy - 14.6, 1.4, 1.8, 0, 0, 7); c.fill(); c.fillStyle = Gr(0.05); c.fillRect(wx - 0.9, wy - 15.2, 0.6, 0.5); c.fillRect(wx + 0.3, wy - 15.2, 0.6, 0.5); }
  c.fillStyle = W1(0.15); c.beginPath(); c.ellipse(wx, wy + 0.5, 4, 1, 0, 0, 7); c.fill();
}
function sceneNoSignal(c: CanvasRenderingContext2D) {
  for (let n = 0; n < 500; n++) { c.fillStyle = W1(Math.random() * 0.6); c.fillRect(Math.random() * FW, Math.random() * FH, 1.2, 0.6); }
}
const SCENES = [sceneFace, sceneAbove, sceneHall];

function drawPicture(c: CanvasRenderingContext2D, now: number, beat: number) {
  const cam = camOf(beat);
  c.save();
  if (cam < 3) SCENES[cam](c, now, beat);
  else {
    // all four cameras at once, with a frame between them
    [0, 1, 2, 3].forEach((q) => {
      c.save(); c.translate((q % 2) * FW / 2, Math.floor(q / 2) * FH / 2); c.beginPath(); c.rect(0, 0, FW / 2, FH / 2); c.clip(); c.scale(0.5, 0.5);
      if (q < 3) SCENES[q](c, now, beat); else sceneNoSignal(c);
      c.restore();
    });
    c.fillStyle = W1(0.9); c.fillRect(FW / 2 - 0.5, 0, 1, FH); c.fillRect(0, FH / 2 - 0.5, FW, 1);
  }
  // a darker edge, as through a cheap lens
  const vg = c.createRadialGradient(FW / 2, FH / 2, FH * 0.35, FW / 2, FH / 2, FH * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.55)"); c.fillStyle = vg; c.fillRect(0, 0, FW, FH);
  // a rolling bar of interference, and a white tear across the picture now and then
  if (!reduce) {
    const y = ((now / 25) % (FH + 20)) - 10; c.fillStyle = W1(0.1); c.fillRect(0, y, FW, 5);
    if (now % 3700 < 110) { c.fillStyle = W1(0.5); c.fillRect(0, (now / 3) % FH, FW, 0.7); }
  }
  c.restore();
}

/** grey picture → dithered phosphor, with dark scanlines (the planets' style) */
function phosphor(c: CanvasRenderingContext2D, W: number, H: number, si: number) {
  const img = c.getImageData(0, 0, W, H), d = img.data, [r, gg, b] = SC[si];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = (y * W + x) * 4, v = d[k] / 255;
    if (v > BAYER[(y % 4) * 4 + (x % 4)] / 16 + 0.02) { d[k] = r; d[k + 1] = gg; d[k + 2] = b; d[k + 3] = y % 3 === 2 ? 150 : 255; }
    else { d[k] = bgCol[0]; d[k + 1] = bgCol[1]; d[k + 2] = bgCol[2]; d[k + 3] = 255; }
  }
  c.putImageData(img, 0, 0);
}

function frame(now: number) {
  if (open && !timeWarpOn()) closeTv(); // the history ended or something else took over
  reopen.hidden = open || !timeWarpOn();
  if (!open) return;
  const np = state.nowPlaying, route = state.route, ch = np && chunk(np.s);
  const si = np?.s ?? (route ? galaxy.planets[route.a].s : 0);
  const p = Math.min(1, (now - t0) / (phase === "off" ? OFF_MS : phase === "on" ? ON_MS : 1));
  if (phase === "off" && p >= 1) { open = false; phase = ""; cv.style.display = "none"; return; }
  if (phase === "on" && p >= 1) phase = "";
  // the screen covers the map once it is on; switching it off lets the map back in
  const coverA = phase === "on" ? Math.min(1, p * 4) : phase === "off" ? 1 - p : 1;
  state.mapHidden = coverA >= 1;
  const h = BG.replace("#", ""); bgCol = [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16));

  // the whole viewport is the monitor; the picture's cells follow its shape
  const dpr = Math.min(1.5, cam.DPR), W = cam.W, H = cam.H;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  FW = Math.round(FH * W / H);
  if (pic.width !== FW * PIC || pic.height !== FH * PIC) { pic.width = FW * PIC; pic.height = FH * PIC; }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  g.globalAlpha = coverA; g.fillStyle = BG; g.fillRect(0, 0, W, H);

  // the year on air: a burst of snow when the track changes, and when the picture cuts to another camera
  const yr = ch ? ch.yr[np!.i] : 0, key = `${np?.s}-${np?.i}`;
  if (key !== lastKey) { if (lastKey) switchAt = now; lastKey = key; }
  const beat = (now / 1000) * galaxy.bpm[si] / 60 + galaxy.phase0[si];
  const camNow = camOf(beat); if (camNow !== lastCam) { if (lastCam >= 0) switchAt = now; lastCam = camNow; }

  const PW = pic.width, PH = pic.height;
  pg.setTransform(1, 0, 0, 1, 0, 0); pg.fillStyle = "#000"; pg.fillRect(0, 0, PW, PH);
  pg.setTransform(PIC, 0, 0, PIC, 0, 0);
  // switching on: a line across the middle, then the picture opens up; off: the reverse, to a dot
  let open01 = 1, lineW = 1;
  if (phase === "on") { open01 = Math.min(1, Math.max(0, (p - 0.3) / 0.35)); lineW = Math.min(1, p / 0.3); }
  if (phase === "off") { open01 = Math.max(0, 1 - p / 0.55); lineW = p < 0.55 ? 1 : Math.max(0, 1 - (p - 0.55) / 0.4); }
  const cy = FH / 2, ph = FH * open01;
  if (open01 > 0) {
    pg.save(); pg.beginPath(); pg.rect(0, cy - ph / 2, FW, ph); pg.clip();
    drawPicture(pg, now, beat);
    const snow = Math.max(phase === "on" ? 1 - (p - 0.3) / 0.7 : 0, 1 - (now - switchAt) / 320);
    if (snow > 0 && !reduce) for (let n = 0; n < 6000 * snow; n++) { pg.fillStyle = `rgba(255,255,255,${Math.random()})`; pg.fillRect(Math.random() * FW, Math.random() * FH, 1 / PIC, 1 / PIC); }
    pg.restore();
    // now and then a strip of the picture slips sideways
    if (!reduce && now % 2900 < 90) { const ty = Math.round(((now / 7) % (PH - 12))); pg.setTransform(1, 0, 0, 1, 0, 0); pg.drawImage(pic, 0, ty, PW, 12, 10, ty, PW, 12); }
  }
  if (open01 < 1 && lineW > 0) { const lw = FW * lineW; pg.setTransform(PIC, 0, 0, PIC, 0, 0); pg.fillStyle = "#fff"; pg.fillRect(FW / 2 - lw / 2, cy - 0.5, lw, 1); }
  pg.setTransform(1, 0, 0, 1, 0, 0);
  phosphor(pg, PW, PH, si);
  g.save(); g.beginPath(); g.roundRect(4, 4, W - 8, H - 8, 22); g.clip();
  g.imageSmoothingEnabled = false; g.drawImage(pic, 4, 4, W - 8, H - 8);
  // the tube's curve: darker towards the corners
  const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.hypot(W, H) * 0.6);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.6)"); g.fillStyle = vg; g.fillRect(0, 0, W, H);
  g.restore();

  // the camcorder's on-screen display, clear of the odyssey panel and the player
  if (open01 >= 1 && ch && route) {
    const dock = document.getElementById("playerBox"), dockW = dock && !dock.hidden && W > 860 ? dock.offsetWidth + 20 : 0;
    const L = routePanelWidth() + 22, R = W - 22, Rb = W - dockW - 22, T = 30, B = H - 30, fs = Math.round(Math.max(13, Math.min(22, H / 34)));
    const two = (n: number) => String(n).padStart(2, "0"), cam = camOf(beat);
    g.font = `600 ${fs}px "Martian Mono", monospace`; g.textBaseline = "middle"; g.shadowColor = "rgba(0,0,0,.9)"; g.shadowBlur = 4;
    if (state.routeIdx < 0) {
      g.fillStyle = sc(si, 1); g.font = `600 ${fs * 3}px "Martian Mono", monospace`; g.textAlign = "center"; g.fillText("TAPE END", W / 2, H / 2);
    } else {
      g.textAlign = "left";
      if (!state.onAir || lampLit(now)) { g.fillStyle = state.onAir ? "#ff4d6d" : sc(si, 1); g.fillText(state.onAir ? "● REC" : "▮▮ PAUSE", L, T); }
      g.fillStyle = sc(si, 1);
      g.fillText(`${galaxy.planets[route.a].name.toUpperCase()}`, L, T + fs * 1.5);
      const sec = Math.floor(player?.time() ?? 0), d = new Date(), left = Math.max(1, route.flat.length - Math.max(0, state.routeIdx)) * 4;
      g.textAlign = "right"; g.fillText(`0:${two(Math.floor(sec / 60))}:${two(sec % 60)}`, R, T); g.fillText(CAMS[cam], R, T + fs * 1.5);
      g.textAlign = "left"; g.fillText(`▭ ${left}min  SP`, L, B); g.fillText(`${two(d.getDate())}.${two(d.getMonth() + 1)}.${yr || "----"}`, L, B - fs * 1.5);
      g.textAlign = "right"; g.fillText(`${(ch.an[ch.a[np!.i]] + " — " + ch.t[np!.i]).toUpperCase().slice(0, 48)}`, Rb, B);
      if (cam === 3) { g.textAlign = "left"; ["CAM 1", "CAM 2", "CAM 3", "CAM 4"].forEach((n, q) => g.fillText(n, (q % 2) * W / 2 + (q % 2 ? 22 : L), Math.floor(q / 2) * H / 2 + (q < 2 ? T + fs * 3 : 30))); }
    }
    g.shadowBlur = 0;
  }
  g.globalAlpha = 1;
  if (!back.hidden) { back.style.left = ""; back.style.right = "16px"; back.style.top = "16px"; }
}
