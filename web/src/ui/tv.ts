// TIME WARP on an old broadcast console: while a label's history plays, the map gives way to a worn
// control desk with a small CRT monitor in the middle, where a dancer keeps time with the style's tempo
// behind a test-card grid. The year on air glows on a red LED read-out, faders and needles move with the
// beat, and the knobs along the bottom work: PREV, MEMORY (a beacon), NEXT and DISCONNECT (back to map).
// Drawn like the rest of the cosmos: a small grey picture, ordered dithering into the system's phosphor
// colour, dark scanlines, scaled up in big pixels. The YouTube player stays above it, uncovered.
import { reduce } from "../core/dom";
import { beacons, chunk, galaxy, state } from "../app/state";
import { BG, FONT_LBL, SC, sc } from "../render/palette";
import { cam } from "../render/camera";
import { onFrame, viewportEl } from "../render/scene";
import { routePanelWidth } from "./routePanel";
import { next, prev, toggleBeacon } from "../app/actions";

const LW = 232, LH = 132; // the console, in picture cells
const SX0 = 92, SY0 = 14, SX1 = 154, SY1 = 86; // its monitor's screen
/** the working knobs along the bottom (picture cells) */
const KNOBS = [{ x: 98, label: "◂ PREV", act: "prev" }, { x: 122, label: "MEMORY", act: "beacon" }, { x: 146, label: "NEXT ▸", act: "next" }, { x: 176, label: "DISCONNECT", act: "exit" }] as const;
const KY = 112, KR = 8;
/** where the printed labels sit (centre x, centre y, strip width), in picture cells */
const LABELS: [number, number, number][] = [[66, 32, 30], [66, 56, 20], [123, 7.5, 30], [180, 59, 24], [214, 126, 24], [23, 122, 26],
  ...KNOBS.map((n): [number, number, number] => [n.x, 125.5, n.act === "exit" ? 34 : 22])];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const ON_MS = 900, OFF_MS = 520;

let cv: HTMLCanvasElement, g: CanvasRenderingContext2D, low: HTMLCanvasElement, lg: CanvasRenderingContext2D, back: HTMLButtonElement, reopen: HTMLButtonElement;
let open = false, phase: "on" | "off" | "" = "", t0 = 0, lastKey = "", switchAt = -1e9, tuning = 0;
let rect = { x: 0, y: 0, k: 1 }, bgCol = [7, 6, 14];
const turned: Record<string, number> = {};
const beaconOn = () => beacons.has(state.nowPlaying);

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
  low = document.createElement("canvas"); low.width = LW; low.height = LH; lg = low.getContext("2d", { willReadFrequently: true })!;
  back = document.createElement("button"); back.type = "button"; back.className = "key tv-back"; back.hidden = true;
  back.textContent = "◂ BACK TO MAP"; back.onclick = closeTv; viewportEl().appendChild(back);
  reopen = document.getElementById("dockTv") as HTMLButtonElement; reopen.onclick = openTv;
  onFrame(frame);
  // the knobs: click one to use it
  const hit = (e: MouseEvent) => {
    const b = cv.getBoundingClientRect(), z = b.width / cv.offsetWidth || 1, x = ((e.clientX - b.left) / z - rect.x) / rect.k, y = ((e.clientY - b.top) / z - rect.y) / rect.k;
    return KNOBS.find((n) => Math.hypot(x - n.x, y - KY) <= KR + 2);
  };
  cv.addEventListener("mousemove", (e) => { cv.style.cursor = hit(e) ? "pointer" : ""; });
  cv.addEventListener("click", (e) => {
    const n = hit(e); if (!n) return;
    turned[n.act] = performance.now();
    if (n.act === "prev") prev(); else if (n.act === "next") next(); else if (n.act === "beacon") toggleBeacon(state.nowPlaying); else closeTv();
  });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && open && phase !== "off") { e.stopImmediatePropagation(); closeTv(); } }, true);
}

// ---------- the dancer ----------
type Pose = { sway: number; tilt: number; leg: [number, number]; knee: [number, number]; arm: [number, number]; fore: [number, number]; head: number };
const smooth = (x: number) => x * x * (3 - 2 * x);
/** four moves, two bars each; angles from straight down, positive = outwards */
function move(m: number, beat: number): Pose {
  const b = beat % 1, s = Math.sin(Math.PI * beat), bounce = Math.abs(Math.sin(Math.PI * beat)), w = Math.sin(2 * Math.PI * b);
  switch (m) {
    case 0: // step-touch, clapping overhead and at the hips
      return { sway: 4 * s, tilt: -0.08 * s, leg: [0.12 + 0.22 * Math.max(0, -s), 0.12 + 0.22 * Math.max(0, s)], knee: [0.35 * bounce, 0.35 * bounce],
        arm: [1.1 + 1.4 * (0.5 + 0.5 * w), 1.1 + 1.4 * (0.5 + 0.5 * w)], fore: [0.6, 0.6], head: 0.1 * s };
    case 1: { // the disco point: one arm up to the sky, then down across, other hand on the hip
      const up = Math.floor(beat / 2) % 2 === 0, k = smooth(Math.min(1, (beat % 2) * 2));
      const a = up ? 0.5 + 2.2 * k : 2.7 - 2.2 * k;
      return { sway: 3 * s, tilt: 0.1 * s, leg: [0.25, 0.15], knee: [0.25 * bounce, 0.1], arm: [0.7, a], fore: [-2.1, 0.1], head: 0.18 * (up ? -1 : 1) };
    }
    case 2: // arms overhead, waving side to side
      return { sway: 5 * Math.sin(Math.PI * beat / 2), tilt: -0.12 * Math.sin(Math.PI * beat / 2), leg: [0.18, 0.18], knee: [0.2 * bounce, 0.2 * bounce],
        arm: [2.6 + 0.25 * w, 2.6 - 0.25 * w], fore: [0.35 + 0.3 * w, 0.35 - 0.3 * w], head: 0.15 * Math.sin(Math.PI * beat / 2) };
    default: // the twist: knees low, elbows out, swinging opposite ways
      return { sway: 2 * s, tilt: 0.14 * s, leg: [0.3, 0.3], knee: [0.55 + 0.25 * bounce, 0.55 + 0.25 * bounce],
        arm: [1.2 + 0.5 * s, 1.2 - 0.5 * s], fore: [-1.3 - 0.4 * s, -1.3 + 0.4 * s], head: -0.1 * s };
  }
}
function pose(beat: number): Pose {
  if (reduce) return move(0, 0.25);
  const m = Math.floor(beat / 8) % 4, into = smooth(Math.min(1, (beat % 8) / 1)), cur = move(m, beat);
  if (into >= 1) return cur;
  const prev = move((m + 3) % 4, beat), mix = (a: number, b: number) => a + (b - a) * into;
  const pair = (a: [number, number], b: [number, number]): [number, number] => [mix(a[0], b[0]), mix(a[1], b[1])];
  return { sway: mix(prev.sway, cur.sway), tilt: mix(prev.tilt, cur.tilt), leg: pair(prev.leg, cur.leg), knee: pair(prev.knee, cur.knee),
    arm: pair(prev.arm, cur.arm), fore: pair(prev.fore, cur.fore), head: mix(prev.head, cur.head) };
}
function drawDancer(c: CanvasRenderingContext2D, cx: number, floor: number, beat: number) {
  const P = pose(beat), at = (x: number, y: number, a: number, len: number, side: number) => ({ x: x + Math.sin(a) * len * side, y: y + Math.cos(a) * len });
  // legs first, to find how high the hips sit with the feet on the floor
  const hip = { x: cx + P.sway, y: 0 }, legs = [-1, 1].map((side, k) => {
    const h = { x: hip.x + side * 3, y: 0 }, kn = at(h.x, 0, P.leg[k] + P.knee[k] * 0.5, 13, side), ft = at(kn.x, kn.y, P.leg[k] - P.knee[k] * 0.6, 13, side);
    return { h, kn, ft };
  });
  const lift = floor - Math.max(legs[0].ft.y, legs[1].ft.y);
  const Y = (p: { x: number; y: number }) => ({ x: p.x, y: p.y + lift });
  c.strokeStyle = "#fff"; c.fillStyle = "#fff"; c.lineCap = "round"; c.lineJoin = "round";
  // shadow on the floor
  c.fillStyle = "rgba(255,255,255,.22)"; c.beginPath(); c.ellipse(cx + P.sway * 0.5, floor + 1, 13, 2.5, 0, 0, 7); c.fill(); c.fillStyle = "#fff";
  c.lineWidth = 3.2;
  for (const L of legs) { const a = Y(L.h), b = Y(L.kn), f = Y(L.ft); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(f.x, f.y); c.stroke(); c.fillRect(f.x - 2, f.y - 1, 4, 2); }
  const H = Y(hip), N = { x: H.x + Math.sin(P.tilt) * 19, y: H.y - Math.cos(P.tilt) * 19 };
  // dress: from the waist, flaring out with the swing of the hips
  const wx = H.x + Math.sin(P.tilt) * 7, wy = H.y - Math.cos(P.tilt) * 7, flare = 9 + Math.abs(P.sway) * 0.4;
  c.beginPath(); c.moveTo(wx - 4, wy); c.lineTo(wx + 4, wy); c.lineTo(H.x + flare + P.sway * 0.3, H.y + 8); c.lineTo(H.x - flare + P.sway * 0.3, H.y + 8); c.closePath(); c.fill();
  c.lineWidth = 6.5; c.beginPath(); c.moveTo(wx, wy); c.lineTo(N.x, N.y + 2); c.stroke(); // torso
  // arms
  c.lineWidth = 2.8;
  [-1, 1].forEach((side, k) => {
    const S = { x: N.x + side * 4.5, y: N.y + 2 }, E = at(S.x, S.y, P.arm[k], 10, side), Hd = at(E.x, E.y, P.arm[k] + P.fore[k], 9, side);
    c.beginPath(); c.moveTo(S.x, S.y); c.lineTo(E.x, E.y); c.lineTo(Hd.x, Hd.y); c.stroke();
  });
  // head and a ponytail that swings behind
  const hx = N.x + Math.sin(P.tilt + P.head) * 6, hy = N.y - Math.cos(P.tilt + P.head) * 6;
  c.beginPath(); c.arc(hx, hy, 4.6, 0, 7); c.fill();
  const sw = Math.sin(Math.PI * beat + 0.8) * 0.9;
  c.lineWidth = 2.2; c.beginPath(); c.moveTo(hx + 1, hy - 4); c.quadraticCurveTo(hx + 6 + sw * 3, hy - 4, hx + 5 + sw * 5, hy + 4); c.stroke();
  c.fillStyle = "#000"; c.fillRect(hx - 2, hy - 1, 1, 1); c.fillRect(hx + 1, hy - 1, 1, 1); // eyes
}

// ---------- the picture on the screen ----------
function drawPicture(c: CanvasRenderingContext2D, now: number, beat: number) {
  const w = SX1 - SX0, cx = SX0 + w / 2;
  // a soft spotlight from above, swaying on the bar
  const sw = Math.sin(Math.PI * beat / 4) * 6;
  const gl = c.createRadialGradient(cx + sw, SY0 + 34, 2, cx + sw, SY0 + 40, 34);
  gl.addColorStop(0, "rgba(255,255,255,.3)"); gl.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = gl; c.fillRect(SX0, SY0, w, SY1 - SY0);
  // the test-card grid behind her, like a monitor's graticule
  c.strokeStyle = "rgba(255,255,255,.45)"; c.lineWidth = 1; c.beginPath();
  for (let x = SX0 + 3; x < SX1; x += 7) { c.moveTo(x + 0.5, SY0); c.lineTo(x + 0.5, SY1); }
  for (let y = SY0 + 4; y < SY1; y += 7) { c.moveTo(SX0, y + 0.5); c.lineTo(SX1, y + 0.5); }
  c.stroke();
  drawDancer(c, cx, SY1 - 6, beat);
  // a rolling bar of interference
  if (!reduce) { const y = SY0 + ((now / 25) % (SY1 - SY0 + 20)) - 10; c.fillStyle = "rgba(255,255,255,.1)"; c.fillRect(SX0, y, w, 5); }
}

/** the console: four worn panels with seams and screws, a monitor in a deep bezel, faders, switches, knobs */
function drawSet(c: CanvasRenderingContext2D, now: number, beat: number) {
  const rr = (x: number, y: number, w: number, h: number, r: number) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
  const panel = (x: number, y: number, w: number, h: number) => {
    rr(x, y, w, h, 3); c.fillStyle = "rgba(255,255,255,.07)"; c.fill(); c.strokeStyle = "rgba(255,255,255,.75)"; c.lineWidth = 1; c.stroke();
    c.fillStyle = "rgba(255,255,255,.8)"; for (const [sx, sy] of [[x + 3, y + 3], [x + w - 4, y + 3], [x + 3, y + h - 4], [x + w - 4, y + h - 4]]) c.fillRect(sx, sy, 1, 1);
  };
  const knob = (x: number, y: number, r: number, a: number, lit = 0.55) => {
    c.fillStyle = `rgba(255,255,255,${lit * 0.55})`; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    c.strokeStyle = "rgba(255,255,255,.95)"; c.lineWidth = 1; c.stroke();
    c.fillStyle = "rgba(255,255,255,.7)"; c.beginPath(); c.arc(x - r * 0.35, y - r * 0.35, r * 0.22, 0, 7); c.fill(); // shine
    c.strokeStyle = "#fff"; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.sin(a) * r * 0.9, y - Math.cos(a) * r * 0.9); c.stroke();
    c.fillStyle = "rgba(255,255,255,.5)"; for (let k = -3; k <= 3; k++) { const t = k * 0.55; c.fillRect(Math.round(x + Math.sin(t) * (r + 3)), Math.round(y - Math.cos(t) * (r + 3)), 1, 1); } // scale
  };
  // left: vents and a big dial
  panel(3, 3, 40, 126);
  c.fillStyle = "rgba(255,255,255,.6)"; for (let k = 0; k < 4; k++) { c.fillRect(10 + k * 7, 12, 1, 52); c.fillRect(14 + k * 7, 12, 1, 52); } // vents
  knob(23, 100, 12, tuning + now / 9000); // the tuning dial turns when the year changes
  // left-centre: the LED read-out (drawn in red over the picture), a keypad, a small dial
  panel(46, 3, 40, 126);
  rr(50, 13, 32, 14, 2); c.fillStyle = "#000"; c.fill(); c.strokeStyle = "rgba(255,255,255,.6)"; c.stroke();
  rr(50, 40, 32, 12, 2); c.fillStyle = "rgba(0,0,0,.9)"; c.fill(); c.stroke(); // a dark meter window
  const lvl = Math.exp(-(beat % 1) * 3); c.fillStyle = "rgba(255,255,255,.75)"; c.fillRect(52, 44, Math.round(28 * (0.25 + 0.75 * lvl)), 4); // level bar
  for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) {
    const on = !reduce && (Math.floor(beat) + r * 4 + k) % 7 === 0;
    c.fillStyle = on ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.45)"; c.fillRect(51 + k * 8, 62 + r * 8, 6, 6);
  }
  knob(66, 112, 7, 0.4 + Math.sin(beat * Math.PI / 8) * 0.2);
  // the monitor in its deep bezel, with a name plate under the screen
  panel(89 - 4, 3, 76, 96);
  rr(SX0 - 5, SY0 - 6, SX1 - SX0 + 10, SY1 - SY0 + 12, 8); c.fillStyle = "rgba(255,255,255,.18)"; c.fill(); c.strokeStyle = "rgba(255,255,255,.95)"; c.lineWidth = 1.5; c.stroke();
  rr(SX0 - 1, SY0 - 1, SX1 - SX0 + 2, SY1 - SY0 + 2, 7); c.fillStyle = "#000"; c.fill();
  c.fillStyle = "rgba(255,255,255,.8)"; c.fillRect(SX0 - 2, 6, 2, 2); c.fillRect(SX1, 6, 2, 2);
  // the working knobs under the monitor
  panel(85, 100, 106, 29);
  KNOBS.forEach((n) => { const spin = Math.max(0, 1 - (now - (turned[n.act] ?? -1e9)) / 500); knob(n.x, KY, KR, -0.6 + spin * 1.2 + (n.act === "beacon" && state.nowPlaying && beaconOn() ? 0.9 : 0), n.act === "exit" ? 0.4 : 0.55); });
  // right: faders that ride the beat, and switches
  panel(164, 3, 32, 96);
  for (let k = 0; k < 3; k++) {
    const x = 170 + k * 9; c.fillStyle = "#000"; c.fillRect(x + 1, 10, 2, 44);
    const lv = reduce ? 0.5 : 0.5 + 0.45 * Math.sin(beat * Math.PI * (k + 1) / 2 + k);
    c.fillStyle = "rgba(255,255,255,.9)"; c.fillRect(x - 2, Math.round(48 - lv * 36), 8, 5);
  }
  for (let k = 0; k < 3; k++) { const up = !reduce && (Math.floor(beat / 2) + k) % 3 === 0; c.fillStyle = "rgba(255,255,255,.6)"; c.fillRect(170 + k * 9, 66, 6, 14); c.fillStyle = "#fff"; c.fillRect(171 + k * 9, up ? 67 : 74, 4, 5); }
  // far right: three big dials
  panel(199, 3, 30, 126);
  for (let k = 0; k < 3; k++) knob(214, 24 + k * 40, 10, -0.8 + k * 0.7 + Math.sin(now / 4000 + k) * 0.15);
  // dark strips where the panel labels are printed
  c.fillStyle = "#000";
  for (const [x, y, w] of LABELS) c.fillRect(Math.round(x - w / 2), Math.round(y - 2.5), Math.round(w), 5);
}

/** grey picture → dithered phosphor, with dark scanlines (the planets' style) */
function phosphor(si: number) {
  const img = lg.getImageData(0, 0, LW, LH), d = img.data, [r, gg, b] = SC[si];
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    const k = (y * LW + x) * 4, v = d[k] / 255;
    if (v > BAYER[(y % 4) * 4 + (x % 4)] / 16 + 0.02) { d[k] = r; d[k + 1] = gg; d[k + 2] = b; d[k + 3] = y % 3 === 2 ? 150 : 255; }
    else { d[k] = bgCol[0]; d[k + 1] = bgCol[1]; d[k + 2] = bgCol[2]; d[k + 3] = 255; }
  }
  lg.putImageData(img, 0, 0);
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
  // the room covers the map once the set is on; turning it off lets the map back in
  const roomA = phase === "on" ? Math.min(1, p * 4) : phase === "off" ? 1 - p : 1;
  state.mapHidden = roomA >= 1;
  const h = BG.replace("#", ""); bgCol = [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16));

  // size: the free part of the viewport (clear of the odyssey panel and the player)
  const dpr = Math.min(1.5, cam.DPR), W = cam.W, Hh = cam.H;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(Hh * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, Hh);
  const left = routePanelWidth(), dock = document.getElementById("playerBox"), right = dock && !dock.hidden && W > 860 ? dock.offsetWidth + 20 : 0;
  const availW = Math.max(160, W - left - right - 30), availH = Math.max(140, Hh - 70);
  let k = Math.min(availW / LW, availH / LH); if (k >= 2) k = Math.floor(k * 2) / 2;
  rect = { x: Math.round(left + (W - left - right - LW * k) / 2), y: Math.round(40 + (Hh - 40 - LH * k) / 2), k };
  g.globalAlpha = roomA; g.fillStyle = BG; g.fillRect(0, 0, W, Hh);
  // the set's glow on the room
  const gl = g.createRadialGradient(rect.x + 123 * k, rect.y + 50 * k, 10, rect.x + 123 * k, rect.y + 50 * k, 150 * k);
  gl.addColorStop(0, sc(si, 0.16)); gl.addColorStop(1, sc(si, 0)); g.fillStyle = gl; g.fillRect(0, 0, W, Hh);

  // the year on air is the channel: a burst of snow and a turn of the knob when it changes
  const yr = ch ? ch.yr[np!.i] : 0, key = `${np?.s}-${np?.i}`;
  if (key !== lastKey) { if (lastKey) { switchAt = now; tuning += 0.9; } lastKey = key; }
  const beat = (now / 1000) * galaxy.bpm[si] / 60 + galaxy.phase0[si];

  lg.setTransform(1, 0, 0, 1, 0, 0); lg.clearRect(0, 0, LW, LH); lg.fillStyle = "#000"; lg.fillRect(0, 0, LW, LH);
  drawSet(lg, now, beat);
  lg.save(); lg.beginPath(); lg.roundRect(SX0, SY0, SX1 - SX0, SY1 - SY0, 7); lg.clip();
  // switching on: a line across the middle, then the picture opens up; off: the reverse, to a dot
  let open01 = 1, lineW = 1;
  if (phase === "on") { open01 = Math.min(1, Math.max(0, (p - 0.3) / 0.35)); lineW = Math.min(1, p / 0.3); }
  if (phase === "off") { open01 = Math.max(0, 1 - p / 0.55); lineW = p < 0.55 ? 1 : Math.max(0, 1 - (p - 0.55) / 0.4); }
  const cy = (SY0 + SY1) / 2, ph = (SY1 - SY0) * open01;
  if (open01 > 0) {
    lg.save(); lg.beginPath(); lg.rect(SX0, cy - ph / 2, SX1 - SX0, ph); lg.clip();
    drawPicture(lg, now, beat);
    const snow = Math.max(phase === "on" ? 1 - (p - 0.3) / 0.7 : 0, 1 - (now - switchAt) / 320);
    if (snow > 0 && !reduce) for (let n = 0; n < 900 * snow; n++) { lg.fillStyle = `rgba(255,255,255,${Math.random()})`; lg.fillRect(SX0 + Math.random() * (SX1 - SX0), SY0 + Math.random() * (SY1 - SY0), 1, 1); }
    lg.restore();
  }
  if (open01 < 1 && lineW > 0) { const lw = (SX1 - SX0) * lineW; lg.fillStyle = "#fff"; lg.fillRect((SX0 + SX1) / 2 - lw / 2, cy - 1, lw, 2); }
  lg.restore();
  phosphor(si);
  g.imageSmoothingEnabled = false; g.drawImage(low, rect.x, rect.y, LW * k, LH * k);

  // crisp type over the picture: the red LED year, the panel labels, the label's name plate, the track
  const X = (x: number) => rect.x + x * k, Yp = (y: number) => rect.y + y * k, px = (n: number) => `${Math.round(Math.max(8, n * k))}px ${FONT_LBL}`;
  g.textBaseline = "middle"; g.textAlign = "center";
  // the LED read-out: the year on air, in red seven-segment glow
  g.font = px(10); g.fillStyle = "#ff4d6d"; g.shadowColor = "#ff4d6d"; g.shadowBlur = 8;
  g.fillText(open01 > 0 && yr ? String(yr) : "----", X(66), Yp(20.5));
  g.shadowBlur = 0; g.fillStyle = sc(si, 0.75);
  g.font = px(3.4);
  g.fillText("YEAR ON AIR", X(66), Yp(32)); g.fillText("LEVEL", X(66), Yp(56)); g.fillText("TIME WARP", X(123), Yp(7.5));
  g.fillText("LEVELS", X(180), Yp(59)); g.fillText("SIGNAL", X(214), Yp(126)); g.fillText("TUNING", X(23), Yp(122));
  KNOBS.forEach((n) => g.fillText(n.label, X(n.x), Yp(KY + KR + 5.5)));
  if (open01 >= 1 && ch && route) {
    // the label's name plate at the foot of the screen
    g.font = px(5); const name = galaxy.planets[route.a].name.toUpperCase(), nw = Math.min(g.measureText(name).width + 10, (SX1 - SX0 - 6) * k);
    g.fillStyle = BG; g.fillRect(X((SX0 + SX1) / 2) - nw / 2, Yp(SY1 - 11), nw, 7 * k);
    g.strokeStyle = sc(si, 0.9); g.lineWidth = 1; g.strokeRect(X((SX0 + SX1) / 2) - nw / 2 + 0.5, Yp(SY1 - 11) + 0.5, nw - 1, 7 * k - 1);
    g.fillStyle = sc(si, 1); g.shadowColor = sc(si, 0.8); g.shadowBlur = 6;
    g.save(); g.beginPath(); g.rect(X((SX0 + SX1) / 2) - nw / 2, Yp(SY1 - 11), nw, 7 * k); g.clip(); g.fillText(name, X((SX0 + SX1) / 2), Yp(SY1 - 7.5)); g.restore();
    // the track, running along the top of the screen
    g.font = px(3.6); g.textAlign = "left";
    const text = `${ch.an[ch.a[np!.i]]} — ${ch.t[np!.i]}`.toUpperCase(), boxW = (SX1 - SX0 - 6) * k;
    g.save(); g.beginPath(); g.rect(X(SX0 + 3), Yp(SY0 + 1), boxW, 6 * k); g.clip();
    const tw = g.measureText(text).width, off = tw > boxW && !reduce ? ((now / 40) % (tw + 60)) : 0;
    g.fillText(text, X(SX0 + 3) - off, Yp(SY0 + 4)); if (off) g.fillText(text, X(SX0 + 3) - off + tw + 60, Yp(SY0 + 4));
    g.restore(); g.shadowBlur = 0;
  }
  g.globalAlpha = 1;
  // the way back, just above the set
  if (!back.hidden) { back.style.left = `${rect.x}px`; back.style.top = `${Math.max(6, rect.y - 34)}px`; }
}
