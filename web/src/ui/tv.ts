// TIME WARP on an old television: while a label's history plays, the map gives way to a little CRT set
// in a dark room, with a dancer on a disco floor keeping time with the style's tempo. The year of the
// track on air is the channel. Drawn like the rest of the cosmos: a small grey picture, then ordered
// dithering into the system's phosphor colour and dark scanlines, scaled up in big pixels.
// The YouTube player stays above it, uncovered; "back to map" turns the set off, the music plays on.
import { reduce } from "../core/dom";
import { chunk, galaxy, state } from "../app/state";
import { BG, FONT_LBL, SC, sc } from "../render/palette";
import { cam } from "../render/camera";
import { onFrame, viewportEl } from "../render/scene";
import { routePanelWidth } from "./routePanel";

const LW = 160, LH = 142; // the set, in picture cells
const SX0 = 11, SY0 = 31, SX1 = 115, SY1 = 117; // its screen
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const ON_MS = 900, OFF_MS = 520;

let cv: HTMLCanvasElement, g: CanvasRenderingContext2D, low: HTMLCanvasElement, lg: CanvasRenderingContext2D, back: HTMLButtonElement, reopen: HTMLButtonElement;
let open = false, phase: "on" | "off" | "" = "", t0 = 0, lastKey = "", switchAt = -1e9, knob = 0;
let rect = { x: 0, y: 0, k: 1 }, bgCol = [7, 6, 14];

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
  const w = SX1 - SX0, h = SY1 - SY0, hz = SY0 + h * 0.5, cx = SX0 + w / 2;
  // spotlights from the top corners, swinging on the bar
  const sw = Math.sin(Math.PI * beat / 4);
  c.fillStyle = "rgba(255,255,255,.1)";
  for (const [x0, d] of [[SX0 + 8, 1], [SX1 - 8, -1]] as const) {
    const fx = cx + d * (-8 + sw * 22 * d);
    c.beginPath(); c.moveTo(x0 - 2, SY0); c.lineTo(x0 + 2, SY0); c.lineTo(fx + 13, SY1); c.lineTo(fx - 13, SY1); c.closePath(); c.fill();
  }
  // a mirror ball, its sparkles turning
  const bx = cx, by = SY0 + 9;
  c.fillStyle = "rgba(255,255,255,.75)"; c.beginPath(); c.arc(bx, by, 4.5, 0, 7); c.fill();
  c.fillRect(bx, SY0, 1, 4);
  for (let k = 0; k < 7; k++) {
    const a = k * 0.9 + now / 1500, r = 12 + (k % 3) * 9, x = bx + Math.cos(a) * r * 1.6, y = by + 6 + Math.abs(Math.sin(a)) * r * 0.9;
    if ((Math.floor(now / 120) + k) % 3) { c.fillStyle = "rgba(255,255,255,.8)"; c.fillRect(Math.round(x), Math.round(y), 1, 1); }
  }
  // the floor: a grid running towards you on the beat
  c.strokeStyle = "rgba(255,255,255,.35)"; c.lineWidth = 1;
  c.beginPath();
  for (let k = -7; k <= 7; k++) { c.moveTo(cx + k * 2, hz); c.lineTo(cx + k * 15, SY1); }
  const n = 6, run = reduce ? 0 : (beat % 1);
  for (let k = 0; k < n; k++) { const z = (k + run) / n, y = Math.round(hz + (SY1 - hz) * z * z) + 0.5; c.moveTo(SX0, y); c.lineTo(SX1, y); }
  c.stroke();
  // lit tiles flashing with the beat
  const lit = Math.floor(beat) % 4;
  c.fillStyle = "rgba(255,255,255,.3)";
  for (let k = 0; k < 4; k++) {
    const col = (k * 3 + lit * 2) % 7 - 3, row = (k + lit) % 3 + 1;
    const z0 = row / n, z1 = (row + 1) / n, y0 = hz + (SY1 - hz) * z0 * z0, y1 = hz + (SY1 - hz) * z1 * z1;
    const xa = (z: number, kk: number) => cx + kk * (2 + 13 * Math.sqrt(z * z * 1));
    c.beginPath(); c.moveTo(xa(z0, col), y0); c.lineTo(xa(z0, col + 1), y0); c.lineTo(xa(z1, col + 1), y1); c.lineTo(xa(z1, col), y1); c.closePath(); c.fill();
  }
  drawDancer(c, cx, SY1 - 13, beat);
}

/** the television itself: a boxy set with rabbit ears, two knobs and a speaker grille */
function drawSet(c: CanvasRenderingContext2D) {
  const rr = (x: number, y: number, w: number, h: number, r: number) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
  c.strokeStyle = "rgba(255,255,255,.85)"; c.lineWidth = 1.5; c.lineCap = "round";
  c.beginPath(); c.moveTo(78, 22); c.lineTo(50, 3); c.moveTo(82, 22); c.lineTo(112, 5); c.stroke(); // antenna
  c.fillStyle = "rgba(255,255,255,.85)"; c.fillRect(48, 1, 3, 3); c.fillRect(111, 3, 3, 3);
  rr(68, 18, 24, 6, 3); c.fill();
  rr(2, 23, 156, 108, 9); c.fillStyle = "rgba(255,255,255,.2)"; c.fill(); c.lineWidth = 2; c.strokeStyle = "rgba(255,255,255,.9)"; c.stroke(); // cabinet
  rr(6, 27, 114, 96, 6); c.fillStyle = "rgba(0,0,0,1)"; c.fill(); c.lineWidth = 1; c.strokeStyle = "rgba(255,255,255,.55)"; c.stroke(); // bezel
  // knobs: the channel one turns when the year changes
  for (const [y, a] of [[46, knob], [72, 0.6]] as const) {
    c.fillStyle = "rgba(255,255,255,.45)"; c.beginPath(); c.arc(138, y, 8, 0, 7); c.fill();
    c.strokeStyle = "rgba(255,255,255,.95)"; c.lineWidth = 1; c.stroke();
    c.lineWidth = 2; c.beginPath(); c.moveTo(138, y); c.lineTo(138 + Math.sin(a) * 7, y - Math.cos(a) * 7); c.stroke();
  }
  c.fillStyle = "rgba(255,255,255,.6)"; for (let y = 90; y < 120; y += 4) c.fillRect(127, y, 22, 2); // speaker
  c.fillStyle = "rgba(255,255,255,.7)"; c.fillRect(14, 131, 8, 9); c.fillRect(138, 131, 8, 9); // feet
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
  const gl = g.createRadialGradient(rect.x + 63 * k, rect.y + 74 * k, 10, rect.x + 63 * k, rect.y + 74 * k, 120 * k);
  gl.addColorStop(0, sc(si, 0.16)); gl.addColorStop(1, sc(si, 0)); g.fillStyle = gl; g.fillRect(0, 0, W, Hh);

  // the year on air is the channel: a burst of snow and a turn of the knob when it changes
  const yr = ch ? ch.yr[np!.i] : 0, key = `${np?.s}-${np?.i}`;
  if (key !== lastKey) { if (lastKey) { switchAt = now; knob += 0.9; } lastKey = key; }
  const beat = (now / 1000) * galaxy.bpm[si] / 60 + galaxy.phase0[si];

  lg.setTransform(1, 0, 0, 1, 0, 0); lg.clearRect(0, 0, LW, LH); lg.fillStyle = "#000"; lg.fillRect(0, 0, LW, LH);
  drawSet(lg);
  lg.save(); lg.beginPath(); lg.roundRect(SX0, SY0, SX1 - SX0, SY1 - SY0, 9); lg.clip();
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

  // captions in crisp type over the picture: the channel (year) and the track
  if (open01 >= 1 && ch) {
    const X = (x: number) => rect.x + x * k, Yp = (y: number) => rect.y + y * k;
    g.fillStyle = sc(si, 1); g.shadowColor = sc(si, 0.8); g.shadowBlur = 6; g.textBaseline = "top";
    g.font = `${Math.round(Math.max(12, 9 * k))}px ${FONT_LBL}`; g.textAlign = "right";
    g.fillText(yr ? String(yr) : "—", X(SX1 - 5), Yp(SY0 + 4));
    g.font = `${Math.round(Math.max(9, 3.6 * k))}px ${FONT_LBL}`; g.textAlign = "left";
    g.fillText("TIME WARP", X(SX0 + 5), Yp(SY0 + 4));
    const text = `${ch.an[ch.a[np!.i]]} — ${ch.t[np!.i]}`.toUpperCase(), boxW = (SX1 - SX0 - 10) * k;
    g.save(); g.beginPath(); g.rect(X(SX0 + 5), Yp(SY1 - 12), boxW, 10 * k); g.clip();
    const tw = g.measureText(text).width, off = tw > boxW && !reduce ? ((now / 40) % (tw + 60)) : 0;
    g.fillText(text, X(SX0 + 5) - off, Yp(SY1 - 9)); if (off) g.fillText(text, X(SX0 + 5) - off + tw + 60, Yp(SY1 - 9));
    g.restore(); g.shadowBlur = 0;
  }
  g.globalAlpha = 1;
  // the way back, just above the set
  if (!back.hidden) { back.style.left = `${rect.x}px`; back.style.top = `${Math.max(6, rect.y - 34)}px`; }
}
