// TIME WARP as found summer footage: while a label's history plays, the map gives way to a full-screen
// monitor cutting between cameras on the bar — a chrome android DJ at the decks (scratching, riding the
// mixer, a hand in the air, a hand to her headphones), a girl floating on a ring in a pool, two girls dancing
// on the beach, a close-up, and all four at once — under a camcorder's REC, timecode, the year on air and
// TAPE END. Drawn like the rest of the cosmos: grey shapes, ordered dithering into the system's phosphor
// colour, dark scanlines. The player and the odyssey panel stay above it; Esc or "back to map" switches it off.
import { reduce } from "../core/dom";
import { chunk, galaxy, state } from "../app/state";
import { BG, SC, sc } from "../render/palette";
import { cam } from "../render/camera";
import { onFrame, viewportEl } from "../render/scene";
import { routePanelWidth } from "./routePanel";
import { lampLit } from "../core/util";
import { player } from "./dock";

const PIC = 5, FH = 72; // picture cells per screen cell, and the screen's height in cells
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
  initMini(); onFrame(mini);
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
  // neck and bare shoulders, the straps of her swimsuit
  c.fillStyle = Gr(0.5); c.beginPath(); c.moveTo(-5, 10); c.lineTo(5, 10); c.lineTo(6, 22); c.lineTo(-6, 22); c.closePath(); c.fill();
  const sh = c.createLinearGradient(-20, 20, 20, 40); sh.addColorStop(0, Gr(0.7)); sh.addColorStop(1, Gr(0.4));
  c.fillStyle = sh; c.beginPath(); c.moveTo(-6, 20); c.bezierCurveTo(-14, 22, -26, 26, -30, 40); c.lineTo(30, 40); c.bezierCurveTo(26, 26, 14, 22, 6, 20); c.closePath(); c.fill();
  c.fillStyle = Gr(0.12); c.beginPath(); c.moveTo(-14, 40); c.quadraticCurveTo(-8, 35, -2, 40); c.closePath(); c.moveTo(2, 40); c.quadraticCurveTo(8, 35, 14, 40); c.closePath(); c.fill(); // the top of her bikini, at the edge of the frame
  c.strokeStyle = Gr(0.12); c.lineWidth = 1.4; c.beginPath(); c.moveTo(-11, 24); c.lineTo(-8, 37); c.moveTo(11, 24); c.lineTo(8, 37); c.stroke(); // straps
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
  // sunglasses pushed up on her head
  c.fillStyle = Gr(0.06); c.beginPath(); c.ellipse(-4.2 + ox * 0.5, -15.2, 3.6, 1.8, -0.08, 0, 7); c.ellipse(4.2 + ox * 0.5, -15.2, 3.6, 1.8, 0.08, 0, 7); c.fill();
  c.fillStyle = Gr(0.8); c.fillRect(-6 + ox * 0.5, -16, 1.2, 0.6); c.fillRect(2.4 + ox * 0.5, -16, 1.2, 0.6);
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
/** the cut: the DJ gets every other turn; four bars a shot */
const ORDER = [0, 1, 0, 2, 0, 4, 0, 3] as const;
const CAMS = ["CAM 1 · DJ", "CAM 2 · POOL", "CAM 3 · BEACH", "CAM 4", "QUAD"] as const;
const camOf = (beat: number) => (reduce ? 0 : ORDER[Math.floor(beat / 16) % ORDER.length]);

function sceneFace(c: CanvasRenderingContext2D, now: number, beat: number) {
  const glow = 0.2 + 0.08 * Math.exp(-(beat % 1) * 4);
  const gl = c.createRadialGradient(FW / 2, 32, 2, FW / 2, 34, 38);
  gl.addColorStop(0, W1(glow)); gl.addColorStop(1, W1(0)); c.fillStyle = gl; c.fillRect(0, 0, FW, FH);
  drawPortrait(c, FW / 2, 37, now, beat);
}
// ---------- the DJ: a chrome android behind the decks ----------
/** a chrome shine across a part, from (x0,y0) to (x1,y1): bright and dark bands like polished metal */
function chrome(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, lift = 0) {
  const gr = c.createLinearGradient(x0, y0, x1, y1), v = (a: number) => Gr(Math.min(1, a + lift));
  gr.addColorStop(0, v(0.35)); gr.addColorStop(0.18, v(0.95)); gr.addColorStop(0.38, v(0.45)); gr.addColorStop(0.6, v(0.8)); gr.addColorStop(0.82, v(0.22)); gr.addColorStop(1, v(0.5));
  return gr;
}
/** two-bone reach: the elbow for a hand at t from a shoulder at s (bend: which side the elbow goes) */
function reach(s: { x: number; y: number }, t: { x: number; y: number }, l1: number, l2: number, bend: number) {
  const dx = t.x - s.x, dy = t.y - s.y, d = Math.min(l1 + l2 - 0.01, Math.max(0.5, Math.hypot(dx, dy)));
  const a = Math.atan2(dy, dx), k = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const e = { x: s.x + Math.cos(a + bend * k) * l1, y: s.y + Math.sin(a + bend * k) * l1 };
  const h = { x: s.x + Math.cos(a) * d, y: s.y + Math.sin(a) * d };
  return { e, h };
}
function limb(c: CanvasRenderingContext2D, a: { x: number; y: number }, b: { x: number; y: number }, w: number) {
  const nx = -(b.y - a.y), ny = b.x - a.x, l = Math.hypot(nx, ny) || 1, ux = (nx / l) * w / 2, uy = (ny / l) * w / 2;
  c.fillStyle = chrome(c, a.x + ux, a.y + uy, a.x - ux, a.y - uy);
  c.beginPath(); c.moveTo(a.x + ux, a.y + uy); c.lineTo(b.x + ux * 0.85, b.y + uy * 0.85); c.lineTo(b.x - ux * 0.85, b.y - uy * 0.85); c.lineTo(a.x - ux, a.y - uy); c.closePath(); c.fill();
  c.fillStyle = Gr(0.9); c.beginPath(); c.arc(a.x, a.y, w * 0.55, 0, 7); c.fill(); // joint
  c.strokeStyle = Gr(0.15); c.lineWidth = 0.4; c.stroke();
}
function hand(c: CanvasRenderingContext2D, h: { x: number; y: number }, ang: number, open: number) {
  c.save(); c.translate(h.x, h.y); c.rotate(ang);
  c.fillStyle = chrome(c, -1.5, -1.5, 1.5, 1.5, 0.05); c.beginPath(); c.ellipse(0, 0, 1.7, 1.3, 0, 0, 7); c.fill();
  c.strokeStyle = Gr(0.85); c.lineWidth = 0.55; c.lineCap = "round"; c.beginPath();
  for (let f = -1; f <= 2; f++) { const a = f * (0.25 + open * 0.2); c.moveTo(1.2, f * 0.45); c.lineTo(1.2 + Math.cos(a) * 2.2, f * 0.45 + Math.sin(a) * 2.2); }
  c.stroke(); c.restore();
}

/** the booth: light fanning from above, two turntables and a mixer, speakers thumping in the desk */
function sceneDJ(c: CanvasRenderingContext2D, now: number, beat: number) {
  const t = reduce ? 0 : now / 1000, b = reduce ? 0.5 : beat, kick = reduce ? 0 : Math.exp(-(b % 1) * 5), cx = FW / 2;
  // the room: rays from a lamp above pulsing with the kick, a laser, specks of light from a mirror ball
  for (let k = 0; k < 11; k++) {
    const a0 = Math.PI * (0.14 + k * 0.066 + Math.sin(t * 0.3) * 0.01), a1 = a0 + 0.03, r = FH * 1.5;
    c.fillStyle = W1((k % 2 ? 0.07 : 0.15) + kick * 0.07);
    c.beginPath(); c.moveTo(cx, -8); c.lineTo(cx + Math.cos(a0) * r, -8 + Math.sin(a0) * r); c.lineTo(cx + Math.cos(a1) * r, -8 + Math.sin(a1) * r); c.closePath(); c.fill();
  }
  c.strokeStyle = W1(0.6); c.lineWidth = 0.35; c.beginPath(); c.moveTo(0, 41); c.lineTo(FW, 21 + Math.sin(t * 0.5) * 3); c.stroke();
  for (let k = 0; k < 24; k++) { const x = (k * 41.3 + t * (3 + (k % 3))) % FW, y = (k * 17.9) % 44; if ((k + Math.floor(t * 4)) % 5) { c.fillStyle = W1(0.7); c.fillRect(x, y, 0.45, 0.45); } }

  // ---- her, from the hips up ----
  const sway = reduce ? 0 : Math.sin(Math.PI * b / 2) * 1.6, bob = kick * 0.9, phase = Math.floor((b % 16) / 4);
  const bang = phase === 3 ? Math.abs(Math.sin(Math.PI * b)) * 1.4 : 0, nod = kick * 0.8 + bang;
  const hipY = 50, chestY = 25 + bob, x = cx + sway;
  const hx = x + sway * 0.25, hy = chestY - 10 + nod, tilt = (phase === 3 ? 0.16 : 0) + sway * 0.03;
  // ponytail: a braided chrome cable swinging behind
  const sw = reduce ? 0 : Math.sin(Math.PI * b + 0.6) * 3.2;
  const tail = (q: number) => ({ x: hx + 3 + (5.5 + sw * q) * Math.sin(q * 1.6) * 1.2, y: hy - 4 + 17 * q * q + q * 2 });
  for (let k = 0; k <= 14; k++) { const q = k / 14, p = tail(q), r = 1.25 - q * 0.6; c.fillStyle = chrome(c, p.x - r, p.y - r, p.x + r, p.y + r, 0.05); c.beginPath(); c.arc(p.x, p.y, r, 0, 7); c.fill(); }
  // torso: a slim chrome shell, panel seams, vents, a glowing core
  c.fillStyle = chrome(c, x - 9, chestY, x + 9, chestY + 3);
  c.beginPath(); c.moveTo(x - 7.6, chestY); c.quadraticCurveTo(x - 8.4, chestY + 8, x - 4.2, chestY + 15); c.quadraticCurveTo(x - 3.9, chestY + 19, x - 6.8, hipY); c.lineTo(x + 6.8, hipY); c.quadraticCurveTo(x + 3.9, chestY + 19, x + 4.2, chestY + 15); c.quadraticCurveTo(x + 8.4, chestY + 8, x + 7.6, chestY); c.closePath(); c.fill();
  c.strokeStyle = Gr(0.15); c.lineWidth = 0.3; c.beginPath();
  c.moveTo(x - 6.5, chestY + 1.2); c.quadraticCurveTo(x, chestY + 4, x + 6.5, chestY + 1.2); // collar
  c.moveTo(x - 6.2, chestY + 5); c.quadraticCurveTo(x - 2, chestY + 12, x - 4.2, chestY + 15); c.moveTo(x + 6.2, chestY + 5); c.quadraticCurveTo(x + 2, chestY + 12, x + 4.2, chestY + 15); // side panels
  c.moveTo(x - 4.2, chestY + 15); c.lineTo(x + 4.2, chestY + 15);
  for (let k = 0; k < 4; k++) { const y = chestY + 17 + k * 2, w = 4 + k * 0.6; c.moveTo(x - w, y); c.lineTo(x + w, y); } // waist rings
  c.stroke();
  c.fillStyle = Gr(0.08); for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) c.fillRect(x + sd * 4.8 - 0.25, chestY + 6.5 + k * 1.1, sd * 1.6, 0.45); // vents
  c.fillStyle = Gr(0.06); c.beginPath(); c.arc(x, chestY + 9.5, 2.5, 0, 7); c.fill();
  c.fillStyle = W1(0.55 + kick * 0.45); c.beginPath(); c.arc(x, chestY + 9.5, 1.3 + kick * 0.6, 0, 7); c.fill(); // the core
  c.strokeStyle = Gr(0.95); c.lineWidth = 0.3; c.beginPath(); c.arc(x, chestY + 9.5, 2.7, 0, 7); c.stroke();
  c.fillStyle = Gr(0.1); c.fillRect(x - 6.8, hipY - 1.6, 13.6, 1); c.fillStyle = W1(0.9); c.fillRect(x - 0.8, hipY - 1.7, 1.6, 1.2); // a belt and its buckle
  // neck: stacked rings
  for (let k = 0; k < 4; k++) { c.fillStyle = chrome(c, x - 2.2, 0, x + 2.2, 0, 0.05); c.fillRect(x - 1.9 + k * 0.12, chestY - 1.2 - k * 1.05, 3.8 - k * 0.24, 0.85); }
  // head: helmet, visor with LED eyes, a smile, headphones
  c.save(); c.translate(hx, hy); c.rotate(tilt);
  c.fillStyle = chrome(c, -6, -7, 6, 6); c.beginPath(); c.ellipse(0, -0.2, 5.2, 6.4, 0, 0, 7); c.fill();
  c.fillStyle = chrome(c, -3, 2, 3, 6, 0.08); c.beginPath(); c.moveTo(-3.6, 2.4); c.quadraticCurveTo(0, 7.6, 3.6, 2.4); c.closePath(); c.fill(); // chin
  c.strokeStyle = Gr(0.2); c.lineWidth = 0.25; c.beginPath(); c.moveTo(0, -6.5); c.lineTo(0, -2.2); c.moveTo(-4.6, 2.8); c.quadraticCurveTo(-3.6, 5, -1.6, 5.6); c.moveTo(4.6, 2.8); c.quadraticCurveTo(3.6, 5, 1.6, 5.6); c.stroke(); // seams
  c.fillStyle = Gr(0.04); c.beginPath(); c.roundRect(-4.5, -1.6, 9, 3.2, 1.6); c.fill(); // visor
  c.fillStyle = W1(0.25); c.fillRect(-4, -1.2, 8, 0.35); // its glint
  const blinkD = !reduce && now % 3700 < 130;
  c.strokeStyle = W1(1); c.lineWidth = 0.5; c.lineCap = "round";
  for (const ex of [-1.9, 1.9]) {
    c.beginPath();
    if (blinkD) { c.moveTo(ex - 1, 0.2); c.lineTo(ex + 1, 0.2); } else c.arc(ex, 0.75, 1.05, Math.PI * 1.1, Math.PI * 1.9);
    c.moveTo(ex + Math.sign(ex) * 1.05, -0.05); c.lineTo(ex + Math.sign(ex) * 1.6, -0.6); c.stroke();
  }
  c.fillStyle = Gr(0.25); c.beginPath(); c.ellipse(0, 4.1 + kick * 0.15, 1.3, 0.55 + kick * 0.25, 0, 0, 7); c.fill(); // lips, opening a little on the kick
  c.fillStyle = Gr(1); c.beginPath(); c.ellipse(-2.3, -4.4, 1.3, 0.7, -0.5, 0, 7); c.fill(); // a glint on the dome
  c.strokeStyle = Gr(0.1); c.lineWidth = 1; c.beginPath(); c.arc(0, -0.6, 6.2, Math.PI * 1.06, Math.PI * 1.94); c.stroke(); // headband
  c.strokeStyle = Gr(0.85); c.lineWidth = 0.25; c.beginPath(); c.arc(0, -0.6, 6.7, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
  for (const sd of [-1, 1]) {
    c.fillStyle = Gr(0.08); c.beginPath(); c.ellipse(sd * 5.7, 0.4, 1.9, 2.9, 0, 0, 7); c.fill();
    c.strokeStyle = Gr(0.9); c.lineWidth = 0.3; c.stroke();
    c.fillStyle = W1(0.45 + kick * 0.55); c.beginPath(); c.arc(sd * 6, 0.4, 0.8, 0, 7); c.fill(); // speaker lights on the cups
  }
  c.restore();
  // arms: on the decks scratching and mixing; a hand up in the air; a hand pressing the headphone to her ear
  const shL = { x: x - 8, y: chestY + 1.6 }, shR = { x: x + 8, y: chestY + 1.6 }, deckL = { x: FW * 0.3, y: 52.6 }, deckR = { x: FW * 0.7, y: 52.6 }, mix = { x: cx, y: 53 };
  const scratch = reduce ? 0 : Math.sin(b * Math.PI * 4) * 2.8 * (phase === 0 || phase === 2 ? 1 : 0.3);
  const tL = phase === 3 ? { x: hx - 6.6, y: hy + 0.6 } : { x: deckL.x + 3 + scratch, y: deckL.y - 0.6 };
  const pump = Math.exp(-(b % 1) * 4);
  const tR = phase === 2 ? { x: shR.x + 5, y: chestY - 15 - pump * 3 } : phase === 1 ? { x: mix.x + 2.5 + Math.sin(b * Math.PI) * 2, y: mix.y - 0.6 } : { x: deckR.x - 3, y: deckR.y - 0.6 - kick * 0.6 };
  for (const [s, tg, bend] of [[shL, tL, -1], [shR, tR, 1]] as const) {
    const r = reach(s, tg, 9.6, 9.6, bend);
    limb(c, s, r.e, 3); limb(c, r.e, r.h, 2.4);
    c.strokeStyle = Gr(0.15); c.lineWidth = 0.3; c.beginPath(); // cuff rings on the forearm
    for (const q of [0.62, 0.72]) { const px = r.e.x + (r.h.x - r.e.x) * q, py = r.e.y + (r.h.y - r.e.y) * q, a = Math.atan2(r.h.y - r.e.y, r.h.x - r.e.x) + Math.PI / 2; c.moveTo(px + Math.cos(a) * 1.2, py + Math.sin(a) * 1.2); c.lineTo(px - Math.cos(a) * 1.2, py - Math.sin(a) * 1.2); }
    c.stroke();
    hand(c, r.h, Math.atan2(r.h.y - r.e.y, r.h.x - r.e.x), phase === 2 && tg === tR ? 1 : 0.2);
  }
  for (const s of [shL, shR]) { c.fillStyle = chrome(c, s.x - 3, s.y - 3, s.x + 3, s.y + 3, 0.05); c.beginPath(); c.arc(s.x, s.y, 2.9, 0, 7); c.fill(); c.strokeStyle = Gr(0.2); c.lineWidth = 0.3; c.beginPath(); c.arc(s.x, s.y, 2, 0.4, 2.6); c.stroke(); } // shoulders

  // ---- the desk, in front of her ----
  c.fillStyle = Gr(0.2); c.fillRect(6, 50, FW - 12, 7); c.fillStyle = W1(0.9); c.fillRect(6, 50, FW - 12, 0.4); // top
  for (const dx of [0.3, 0.7]) { // turntables
    const px = FW * dx, py = 53.4, spin = (reduce ? 0 : t * 3.5) + (dx < 0.5 ? scratch * 0.35 : 0);
    c.fillStyle = Gr(0.32); c.fillRect(px - 13.5, 50.5, 27, 6); c.fillStyle = W1(0.6); c.fillRect(px - 13.5, 50.5, 27, 0.3);
    c.fillStyle = Gr(0.55); c.beginPath(); c.ellipse(px, py, 10.6, 2.9, 0, 0, 7); c.fill(); // platter
    for (let k = 0; k < 24; k++) { const a = spin * 0.5 + k * 0.2618; if (Math.sin(a) > 0) { c.fillStyle = W1(0.95); c.fillRect(px + Math.cos(a) * 10.6 - 0.15, py + Math.sin(a) * 2.9 - 0.1, 0.3, 0.25); } } // strobe dots on the rim
    c.fillStyle = Gr(0.04); c.beginPath(); c.ellipse(px, py, 9.6, 2.5, 0, 0, 7); c.fill(); // the record
    c.strokeStyle = Gr(0.22); c.lineWidth = 0.2; c.beginPath(); for (const r of [8.2, 6.8, 5.4, 4]) c.ellipse(px, py, r, r * 0.26, 0, 0, 7); c.stroke(); // grooves
    c.strokeStyle = W1(0.5); c.lineWidth = 0.3; c.beginPath(); c.ellipse(px, py, 7.5, 1.95, 0, Math.PI * 1.15, Math.PI * 1.45); c.stroke(); // light on the vinyl
    c.fillStyle = W1(0.85); c.beginPath(); c.ellipse(px, py, 2.4, 0.66, 0, 0, 7); c.fill(); // label
    c.fillStyle = Gr(0); c.fillRect(px + Math.cos(spin) * 1.5 - 0.3, py + Math.sin(spin) * 0.4 - 0.18, 0.6, 0.36); // a mark on it, turning
    c.strokeStyle = Gr(0.95); c.lineWidth = 0.45; c.beginPath(); c.moveTo(px + 11.5, 51.2); c.lineTo(px + 10, 54.8); c.lineTo(px + 6.8, 54.6); c.stroke(); // tonearm
    c.fillStyle = Gr(0.95); c.fillRect(px + 6, 54.2, 1.2, 0.8); c.beginPath(); c.arc(px + 11.5, 51.2, 0.8, 0, 7); c.fill(); // headshell, pivot
    c.fillStyle = Gr(0.1); c.fillRect(px + 12, 52.6, 0.6, 3); c.fillStyle = W1(0.9); c.fillRect(px + 11.8, 53.6 + Math.sin(dx * 9) * 0.6, 1, 0.4); // pitch fader
  }
  c.fillStyle = Gr(0.28); c.fillRect(cx - 6.5, 50.3, 13, 6.4); c.fillStyle = W1(0.6); c.fillRect(cx - 6.5, 50.3, 13, 0.3); // mixer
  for (let k = 0; k < 4; k++) for (let r = 0; r < 2; r++) { c.fillStyle = W1(0.8); c.beginPath(); c.arc(cx - 4.5 + k * 3, 51.4 + r * 1.2, 0.4, 0, 7); c.fill(); } // knobs
  for (let ch = 0; ch < 2; ch++) { // channel VU meters and faders
    const lv = reduce ? 0.5 : Math.min(1, 0.4 + kick * 0.6 + Math.sin(t * 7 + ch) * 0.1);
    for (let k = 0; k < 5; k++) { c.fillStyle = k < lv * 5 ? W1(0.95) : Gr(0.15); c.fillRect(cx - 1.4 + ch * 2.2, 55.4 - k * 0.55, 0.6, 0.35); }
    c.fillStyle = Gr(0.08); c.fillRect(cx - 4.6 + ch * 8.6, 53, 0.4, 2.8); c.fillStyle = W1(0.95); c.fillRect(cx - 5 + ch * 8.6, 53.6 + Math.sin(b * 0.5 + ch * 2) * 0.8, 1.2, 0.45);
  }
  c.fillStyle = Gr(0.08); c.fillRect(cx - 3.5, 56.1, 7, 0.4); c.fillStyle = W1(0.95); c.fillRect(cx - 0.8 + Math.sin(b * Math.PI / 8) * 2.6, 55.9, 1.6, 0.8); // crossfader
  c.fillStyle = Gr(0.09); c.fillRect(6, 57, FW - 12, FH - 57); // the front
  c.fillStyle = W1(0.2); for (let x0 = 7; x0 < FW - 7; x0 += 1.2) c.fillRect(x0, 57, 0.25, FH - 57); // its grille
  for (const dx of [0.2, 0.5, 0.8]) { // speakers in the front, cones thumping
    const sx = FW * dx, sy = 64.6, r = 4.8 + kick * 0.6;
    c.fillStyle = Gr(0.05); c.beginPath(); c.arc(sx, sy, 6, 0, 7); c.fill();
    c.strokeStyle = W1(0.8); c.lineWidth = 0.35; c.beginPath(); c.arc(sx, sy, 6, 0, 7); c.stroke();
    const cone = c.createRadialGradient(sx - 1, sy - 1, 0.3, sx, sy, r); cone.addColorStop(0, W1(0.85)); cone.addColorStop(0.35, W1(0.3)); cone.addColorStop(1, W1(0.12));
    c.fillStyle = cone; c.beginPath(); c.arc(sx, sy, r, 0, 7); c.fill();
    c.fillStyle = W1(0.9); c.beginPath(); c.arc(sx, sy, r * 0.28, 0, 7); c.fill();
  }
}

/** a camera on the pool's edge, looking down: she floats on a ring, ripples spreading, and waves up at it */
function scenePool(c: CanvasRenderingContext2D, now: number, beat: number) {
  const t = reduce ? 0 : now / 1000;
  c.fillStyle = W1(0.42); c.fillRect(0, 0, FW, FH); // water
  // light dancing on the water: wavy bright lines drifting
  c.strokeStyle = W1(0.7); c.lineWidth = 0.6;
  for (let k = 0; k < 9; k++) {
    c.beginPath();
    for (let x = 0; x <= FW; x += 3) { const y = k * 8 + 4 + Math.sin(x / 7 + t * 1.3 + k) * 2 + Math.sin(x / 3.1 - t * 0.9 + k * 2) * 0.8; if (x) c.lineTo(x, y); else c.moveTo(x, y); }
    c.stroke();
  }
  // the pool's edge: tiles along the top and the left, a ladder on the right
  c.fillStyle = W1(0.85); c.fillRect(0, 0, FW, 7); c.fillRect(0, 0, 7, FH);
  c.fillStyle = Gr(0.5); for (let x = 0; x < FW; x += 4) c.fillRect(x, 0, 0.5, 7); for (let y = 0; y < FH; y += 4) c.fillRect(0, y, 7, 0.5);
  c.strokeStyle = W1(0.95); c.lineWidth = 1.1; c.beginPath();
  for (const lx of [FW - 14, FW - 8]) { c.moveTo(lx, 0); c.quadraticCurveTo(lx + 1, 10, lx, 24); }
  for (const ry of [8, 14, 20]) { c.moveTo(FW - 14, ry); c.lineTo(FW - 8, ry); }
  c.stroke();
  // she drifts slowly round the pool, bobbing on the beat
  const x = FW * 0.48 + Math.sin(t / 5) * 10, y = FH * 0.55 + Math.cos(t / 6.3) * 6 + Math.exp(-(beat % 1) * 4) * 0.6, rot = Math.sin(t / 7) * 0.4;
  for (let k = 0; k < 3; k++) { const r = 14 + ((t * 6 + k * 9) % 27); c.strokeStyle = W1(0.55 * (1 - (r - 14) / 27)); c.lineWidth = 0.6; c.beginPath(); c.ellipse(x, y, r, r * 0.85, 0, 0, 7); c.stroke(); } // ripples
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(1.5, 1.5);
  c.fillStyle = W1(0.2); c.beginPath(); c.ellipse(1.5, 1.5, 10, 8.5, 0, 0, 7); c.fill(); // shadow on the water
  c.fillStyle = W1(0.95); c.beginPath(); c.ellipse(0, 0, 9, 7.5, 0, 0, 7); c.ellipse(0, 0, 4.8, 3.8, 0, 0, 7, true); c.fill("evenodd"); // the ring
  c.fillStyle = Gr(0.35); for (let k = 0; k < 6; k++) { const a = k * 1.047; c.save(); c.rotate(a); c.fillRect(5, -1.3, 4.5, 2.6); c.restore(); } // its stripes
  // her, lying back across it: legs over one side, head and arms over the other
  c.fillStyle = Gr(0.66); c.strokeStyle = Gr(0.66); c.lineCap = "round"; c.lineWidth = 2.1;
  c.beginPath(); c.moveTo(3, 1); c.lineTo(15, -2); c.moveTo(3, 3); c.lineTo(15, 4); c.stroke(); // legs
  c.fillStyle = Gr(0.7); c.beginPath(); c.ellipse(0, 1, 4.6, 3.2, 0, 0, 7); c.fill(); // body
  c.fillStyle = Gr(0.12); c.fillRect(-3.8, -1.6, 1.6, 5.2); c.beginPath(); c.ellipse(3.6, 1.6, 1.4, 2, 0, 0, 7); c.fill(); // bikini
  c.fillStyle = Gr(0.66); c.beginPath(); c.ellipse(-6, 0.5, 2.4, 2.2, 0, 0, 7); c.fill(); // shoulders
  c.fillStyle = Gr(0.08); c.beginPath(); c.ellipse(-11.5, 0.8, 3.6, 3.4, 0, 0, 7); c.fill(); // hair, spread on the water
  c.fillStyle = Gr(0.68); c.beginPath(); c.ellipse(-10, 0.6, 2.1, 2.3, 0, 0, 7); c.fill(); // face
  c.fillStyle = Gr(0.05); c.fillRect(-10.6, -0.7, 0.6, 0.6); c.fillRect(-10.6, 1.1, 0.6, 0.6); // sunglasses
  // one arm trails in the water; every other phrase the other lifts and waves at the camera
  c.strokeStyle = Gr(0.66); c.lineWidth = 1.6; c.beginPath(); c.moveTo(-6, 2.5); c.lineTo(-9, 9); c.stroke();
  const wb = reduce ? 0 : (beat % 8) - 4, up = wb > 0 ? Math.min(1, wb * 2, (4 - wb) * 2) : 0, wave = Math.sin(beat * Math.PI * 2) * 2 * up;
  c.beginPath(); c.moveTo(-6, -1.5); c.lineTo(-8 - up * 3 + wave * 0.3, -6 - up * 4 + wave); c.stroke();
  c.restore();
}

/** a bather in a one-piece, dancing: x at her feet, h tall, on her own phase of the beat */
function bather(c: CanvasRenderingContext2D, x: number, foot: number, h: number, beat: number, ph: number) {
  const b = beat + ph, s = Math.sin(Math.PI * b), bounce = Math.abs(Math.sin(Math.PI * b)), u = h / 30;
  const hip = { x: x + s * 1.6 * u, y: foot - 14 * u + bounce * 0.8 * u }, neck = { x: hip.x - s * 0.6 * u, y: hip.y - 11 * u };
  c.lineCap = "round"; c.lineJoin = "round";
  c.fillStyle = W1(0.22); c.beginPath(); c.ellipse(x, foot + 0.5 * u, 6 * u, 1.3 * u, 0, 0, 7); c.fill(); // shadow on the sand
  // legs, stepping side to side
  c.strokeStyle = Gr(0.88); c.lineWidth = 2 * u;
  c.beginPath(); c.moveTo(hip.x - 1.3 * u, hip.y); c.lineTo(x - 2.6 * u - Math.max(0, -s) * 1.5 * u, foot - 6.5 * u + bounce * 0.5 * u); c.lineTo(x - 2.5 * u - Math.max(0, -s) * 2 * u, foot);
  c.moveTo(hip.x + 1.3 * u, hip.y); c.lineTo(x + 2.6 * u + Math.max(0, s) * 1.5 * u, foot - 6.5 * u + bounce * 0.5 * u); c.lineTo(x + 2.5 * u + Math.max(0, s) * 2 * u, foot); c.stroke();
  // body, then a bikini: a top and bottoms
  const quad = (a: number, b: number, w0: number, w1: number) => {
    const ya = neck.y + (hip.y - neck.y) * a, yb = neck.y + (hip.y - neck.y) * b, xa = neck.x + (hip.x - neck.x) * a, xb = neck.x + (hip.x - neck.x) * b;
    c.beginPath(); c.moveTo(xa - w0 * u, ya); c.lineTo(xa + w0 * u, ya); c.lineTo(xb + w1 * u, yb); c.lineTo(xb - w1 * u, yb); c.closePath(); c.fill();
  };
  c.fillStyle = Gr(0.88); c.beginPath(); c.moveTo(neck.x - 2.6 * u, neck.y + 2 * u); c.lineTo(neck.x + 2.6 * u, neck.y + 2 * u); c.lineTo(hip.x + 2.6 * u, hip.y + 1.2 * u); c.lineTo(hip.x - 2.6 * u, hip.y + 1.2 * u); c.closePath(); c.fill();
  c.fillStyle = Gr(0.1); quad(0.2, 0.42, 2.7, 2.4); // top
  c.beginPath(); c.moveTo(hip.x - 2.7 * u, hip.y - 0.8 * u); c.lineTo(hip.x + 2.7 * u, hip.y - 0.8 * u); c.lineTo(hip.x + 1.2 * u, hip.y + 1.6 * u); c.lineTo(hip.x - 1.2 * u, hip.y + 1.6 * u); c.closePath(); c.fill(); // bottoms
  c.strokeStyle = Gr(0.1); c.lineWidth = 0.35 * u; c.beginPath(); c.moveTo(neck.x - 1.6 * u, neck.y + 2 * u); c.lineTo(neck.x - 0.6 * u, neck.y + 0.6 * u); c.moveTo(neck.x + 1.6 * u, neck.y + 2 * u); c.lineTo(neck.x + 0.6 * u, neck.y + 0.6 * u); c.stroke(); // straps
  c.strokeStyle = Gr(0.88); c.lineWidth = 1.6 * u; c.beginPath(); c.moveTo(neck.x, neck.y - 0.5 * u); c.lineTo(neck.x, neck.y + 1.5 * u); c.stroke(); // neck
  // arms: up and waving on even bars, swinging at the hips on odd ones
  const up = Math.floor(b / 4) % 2 === 0, w = Math.sin(Math.PI * 2 * b);
  c.lineWidth = 1.5 * u; c.beginPath();
  for (const sd of [-1, 1]) {
    const sx = neck.x + sd * 2.6 * u, sy = neck.y + 2 * u;
    if (up) { c.moveTo(sx, sy); c.lineTo(sx + sd * 2.5 * u, sy - 4.5 * u); c.lineTo(sx + sd * (1.5 + w * sd * 1.5) * u, sy - 9.5 * u); }
    else { c.moveTo(sx, sy); c.lineTo(sx + sd * 2 * u + s * u, sy + 4.5 * u); c.lineTo(sx + sd * 0.8 * u + s * 2 * u, sy + 8.5 * u); }
  }
  c.stroke();
  // head with long hair swinging behind
  const hx = neck.x + s * 0.4 * u, hy = neck.y - 2.6 * u;
  c.fillStyle = Gr(0.08); c.beginPath(); c.moveTo(hx - 2.2 * u, hy - 0.5 * u); c.quadraticCurveTo(hx - 3 * u + s * u, hy + 4 * u, hx - 1.4 * u + s * 1.2 * u, hy + 4 * u);
  c.lineTo(hx + 1.4 * u + s * 1.2 * u, hy + 4 * u); c.quadraticCurveTo(hx + 3 * u + s * u, hy + 4 * u, hx + 2.2 * u, hy - 0.5 * u); c.fill();
  c.beginPath(); c.arc(hx, hy - 0.4 * u, 2.3 * u, 0, 7); c.fill();
  c.fillStyle = Gr(0.88); c.beginPath(); c.ellipse(hx, hy + 0.2 * u, 1.6 * u, 1.9 * u, 0, 0, 7); c.fill(); // face
}

/** the beach at noon: sea, a palm, two girls dancing on the sand */
function sceneBeach(c: CanvasRenderingContext2D, now: number, beat: number) {
  const t = reduce ? 0 : now / 1000, hz = 26;
  const sky = c.createLinearGradient(0, 0, 0, hz); sky.addColorStop(0, W1(0.2)); sky.addColorStop(1, W1(0.55)); c.fillStyle = sky; c.fillRect(0, 0, FW, hz);
  c.fillStyle = W1(0.95); c.beginPath(); c.arc(FW * 0.72, 9, 4.5, 0, 7); c.fill(); // the sun
  c.fillStyle = W1(0.18); c.fillRect(0, hz, FW, 12); // the sea
  c.strokeStyle = W1(0.75); c.lineWidth = 0.6; c.beginPath();
  for (let k = 0; k < 4; k++) for (let x = (k * 7 + t * 4) % 14 - 14; x < FW; x += 14) { const y = hz + 2 + k * 2.8; c.moveTo(x, y); c.lineTo(x + 5 + k, y); }
  c.stroke();
  const fl = 38 + Math.sin(t * 0.8) * 1; c.fillStyle = W1(0.6); c.beginPath(); c.moveTo(0, fl); for (let x = 0; x <= FW; x += 4) c.lineTo(x, fl + Math.sin(x / 6 + t * 1.5) * 0.7); c.lineTo(FW, fl + 2); c.lineTo(0, fl + 2); c.fill(); // surf
  c.fillStyle = W1(0.3); c.fillRect(0, fl + 2, FW, FH - fl - 2); // sand
  c.fillStyle = W1(0.5); for (let k = 0; k < 60; k++) c.fillRect((k * 37.7) % FW, fl + 4 + ((k * 13.3) % (FH - fl - 5)), 0.6, 0.6);
  // a palm leaning in from the left
  const px0 = FW - 8; c.strokeStyle = Gr(0.06); c.lineWidth = 2.4; c.lineCap = "round"; c.beginPath(); c.moveTo(px0, FH); c.quadraticCurveTo(px0 + 2, 30, px0 - 7, 8); c.stroke();
  c.lineWidth = 1.4;
  for (let k = 0; k < 6; k++) { const a = -0.55 - k * 0.6 + Math.sin(t + k) * 0.05, x0 = px0 - 7; c.beginPath(); c.moveTo(x0, 8); c.quadraticCurveTo(x0 + Math.cos(a) * 9, 8 + Math.sin(a) * 9 - 3, x0 + Math.cos(a) * 15, 8 + Math.sin(a) * 15 + 3); c.stroke(); }
  // a towel and an umbrella's shade
  c.fillStyle = Gr(0.15); c.fillRect(FW * 0.68, FH - 8, 16, 5); c.fillStyle = W1(0.9); for (let k = 0; k < 4; k++) c.fillRect(FW * 0.68 + k * 4 + 1, FH - 8, 1.5, 5);
  bather(c, FW * 0.4, FH - 4, 40, beat, 0);
  bather(c, FW * 0.57, FH - 8, 34, beat, 0.5);
}

const SCENES = [sceneDJ, scenePool, sceneBeach, sceneFace];

function drawPicture(c: CanvasRenderingContext2D, now: number, beat: number) {
  const cam = camOf(beat);
  c.save();
  if (cam < 4) SCENES[cam](c, now, beat);
  else {
    // all four cameras at once, with a frame between them
    [0, 1, 2, 3].forEach((q) => {
      c.save(); c.translate((q % 2) * FW / 2, Math.floor(q / 2) * FH / 2); c.beginPath(); c.rect(0, 0, FW / 2, FH / 2); c.clip(); c.scale(0.5, 0.5);
      SCENES[q](c, now, beat);
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
function phosphor(c: CanvasRenderingContext2D, W: number, H: number, si: number, gamma = 1) {
  const img = c.getImageData(0, 0, W, H), d = img.data, [r, gg, b] = SC[si];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = (y * W + x) * 4, v = gamma === 1 ? d[k] / 255 : Math.pow(d[k] / 255, gamma);
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
      if (cam === 4) { g.textAlign = "left"; ["CAM 1", "CAM 2", "CAM 3", "CAM 4"].forEach((n, q) => g.fillText(n, (q % 2) * W / 2 + (q % 2 ? 22 : L), Math.floor(q / 2) * H / 2 + (q < 2 ? T + fs * 3 : 30))); }
    }
    g.shadowBlur = 0;
  }
  g.globalAlpha = 1;
  if (!back.hidden) { back.style.left = ""; back.style.right = "16px"; back.style.top = "16px"; }
}

// ---------- the SOLARIS monitor ----------
let mbox: HTMLElement, mc: HTMLCanvasElement, mg: CanvasRenderingContext2D, mlabel: HTMLElement;
function initMini() {
  mbox = document.createElement("div"); mbox.className = "solaris-tv"; mbox.hidden = true; mbox.setAttribute("aria-hidden", "true");
  mbox.innerHTML = `<div class="stv-head"><span class="stv-live">● LIVE</span><span class="stv-name"></span></div><canvas></canvas>`;
  viewportEl().appendChild(mbox);
  mc = mbox.querySelector("canvas")!; mg = mc.getContext("2d", { willReadFrequently: true })!; mlabel = mbox.querySelector(".stv-name")!;
}
/** while a SOLARIS station listens, a monitor in the corner shows the DJ playing the planet's records */
function mini(now: number) {
  const on = state.orbit !== null && !open && !state.mapHidden;
  if (mbox.hidden === on) mbox.hidden = !on;
  if (!on) return;
  const pl = galaxy.planets[state.orbit!], si = pl.s, W = mc.clientWidth, H = mc.clientHeight; if (!W || !H) return;
  // one picture cell per css pixel: fine grain, still dithered like everything else
  if (mc.width !== W || mc.height !== H) { mc.width = W; mc.height = H; }
  const name = pl.name.toUpperCase(); if (mlabel.textContent !== name) mlabel.textContent = name;
  mbox.classList.toggle("blink", state.onAir && !lampLit(now));
  mbox.style.setProperty("--stv", sc(si, 0.85));
  const beat = (now / 1000) * galaxy.bpm[si] / 60 + galaxy.phase0[si], keepFW = FW;
  // framed closer than the big screen: her and the decks, a little of the light above
  const k = H / 66; FW = W / k;
  mg.setTransform(1, 0, 0, 1, 0, 0); mg.fillStyle = "#000"; mg.fillRect(0, 0, W, H);
  mg.setTransform(k, 0, 0, k, 0, -5 * k);
  sceneDJ(mg, now, beat);
  FW = keepFW;
  mg.setTransform(1, 0, 0, 1, 0, 0);
  const h = BG.replace("#", ""); bgCol = [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16));
  phosphor(mg, W, H, si, 0.75);
}
