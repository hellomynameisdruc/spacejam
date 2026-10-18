// SOLARIS: while a planet's orbit is playing, a small probe circles it just outside its satellites
// and listens. It is drawn like the planets — solid phosphor, ordered dithering, dark scanlines —
// on a tiny grid that is re-shaded every frame, so its parts can move: a dish that turns, panels
// that tilt to the light, lights that blink. Signal pulses travel down to the planet on the beat.
import { BG, FONT_LBL, sc, SC } from "./palette";
import { galaxy, motion, state } from "../app/state";
import { orbitR } from "../model/galaxy";
import { cam, LOD_PLANETS, LOD_TRACKS } from "./camera";
import { pulseOf } from "./pulsar";
import { uiZoom } from "../core/dom";
import { lampLit } from "../core/util";

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const GW = 44, GH = 52, OY = 12; // the craft's grid, in cells; drawing coordinates sit OY cells down
type Grid = { tone: Float32Array; light: [number, number, string][] };
const grid: Grid = { tone: new Float32Array(GW * GH), light: [] };
// tone > 0: lit share of the cell's dither (0…1); -1: a dark cell (shadow, window, panel seam)
const put = (x: number, y: number, v: number) => { x = Math.round(x); y = Math.round(y) + OY; if (x >= 0 && y >= 0 && x < GW && y < GH) grid.tone[y * GW + x] = v; };
const rect = (x0: number, y0: number, x1: number, y1: number, f: (x: number, y: number) => number) => {
  for (let y = Math.round(y0); y <= Math.round(y1); y++) for (let x = Math.round(x0); x <= Math.round(x1); x++) put(x, y, f(x, y));
};
const ellipse = (cx: number, cy: number, rx: number, ry: number, f: (u: number, v: number) => number) => {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const u = (x - cx) / Math.max(0.5, rx), v = (y - cy) / Math.max(0.5, ry); if (u * u + v * v <= 1) put(x, y, f(u, v));
  }
};
const line = (x0: number, y0: number, x1: number, y1: number, v: number) => {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let k = 0; k <= n; k++) put(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, v);
};
const lit = (u: number, v: number, base = 1) => base * Math.max(0.18, Math.min(1, 0.62 - u * 0.38 - v * 0.3)); // light from the upper left

/**
 * The probe, drawn into the grid for time t (ms), facing left (its dish toward the planet): a big
 * dish that slowly swings, a small bus with two big wings of solar cells that tilt to the light and
 * a beacon on top that blinks. Kept simple, so it reads like the planets, not like a drawing.
 */
/**
 * The beacon lamp's colour: red, unless the system's own colour is close to red (magenta, pink,
 * red, orange, yellow) — then green, so the lamp always stands out from the probe around it.
 */
function beaconFor(si: number) {
  const [r, g, b] = SC[si], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx - mn < 30) return "#ff4d6d";
  let h = mx === r ? ((g - b) / (mx - mn)) * 60 : mx === g ? (2 + (b - r) / (mx - mn)) * 60 : (4 + (r - g) / (mx - mn)) * 60;
  if (h < 0) h += 360;
  const fromRed = Math.min(Math.abs(h - 350), 360 - Math.abs(h - 350)); // how far the system's hue is from the red lamp
  return fromRed < 70 ? "#5dff8f" : "#ff4d6d";
}
let beacon = "#ff4d6d";

function probe(t: number, deploy = 1) {
  const swing = Math.sin(t / 9000) * 0.45, rx = 3.2 + 4 * Math.cos(swing); // the dish turns on its mount
  const tilt = Math.cos(t / 11000), pw = Math.max(1, 5.5 * Math.abs(tilt)), back = tilt < 0;
  // two big solar wings above and below the bus, a seam every fourth row; the back side is dull.
  // Folded against the bus in flight, they unfold row by row once the probe is in orbit.
  const wing = (y0: number, y1: number) => rect(19.5 - pw, y0, 19.5 + pw, y1, (x, y) => ((y - y0) % 4 === 3 ? -1 : back ? 0.3 : lit((x - 19) / 8, (y - 14) / 20, 0.95)));
  const reach = Math.round(16 * deploy);
  if (reach > 0) { line(19.5, 10, 19.5, 6, 0.7); line(19.5, 18, 19.5, 22, 0.7); wing(5 - reach, 5); wing(23, 23 + reach); } // masts, wings
  rect(16, 10, 23, 18, (x, y) => lit((x - 19) / 4, (y - 14) / 4, 0.8)); // bus
  ellipse(11, 14, rx, 10, (u, v) => { const d = u * u + v * v, edge = Math.min(1, (1 - d) / 0.22 + 0.25); return (d > 0.78 ? 0.95 : lit(-u, v, 0.7)) * edge; }); // dish
  grid.light.push([22, 9 + OY, state.onAir && lampLit(t) ? beacon : ""]); // beacon lamp on the bus, in step with ON AIR
}

let canvas: HTMLCanvasElement | null = null;
const D = Math.ceil(Math.hypot(GW, GH)) + 2; // the turned grid fits any angle
/**
 * Shade the probe into a canvas turned by `theta` (radians): every screen cell looks up the probe
 * cell under it, then gets its own dither and scanline, so the craft turns smoothly and stays crisp
 * (turning finished pixel art would smear it). `px` device pixels per cell.
 */
function render(si: number, px: number, theta: number) {
  const W = D * px;
  if (!canvas) canvas = document.createElement("canvas");
  if (canvas.width !== W) { canvas.width = W; canvas.height = W; }
  const g = canvas.getContext("2d")!, img = g.createImageData(W, W), d = img.data, [r, gg, b] = SC[si];
  const bg = BG.replace("#", ""), br = parseInt(bg.slice(0, 2), 16), bgg = parseInt(bg.slice(2, 4), 16), bb = parseInt(bg.slice(4, 6), 16);
  const co = Math.cos(-theta), sn = Math.sin(-theta), h = D / 2;
  for (let cy = 0; cy < D; cy++) for (let cx = 0; cx < D; cx++) {
    const ux = cx + 0.5 - h, uy = cy + 0.5 - h;
    const mx = Math.floor(ux * co - uy * sn + GW / 2), my = Math.floor(ux * sn + uy * co + GH / 2);
    if (mx < 0 || my < 0 || mx >= GW || my >= GH) continue;
    const v = grid.tone[my * GW + mx]; if (!v) continue;
    for (let sy = 0; sy < px; sy++) for (let sx = 0; sx < px; sx++) {
      const X = cx * px + sx, Y = cy * px + sy, k = (Y * W + X) * 4;
      if (v < 0) { d[k] = br; d[k + 1] = bgg; d[k + 2] = bb; d[k + 3] = 255; continue; }
      if (BAYER[(cy % 4) * 4 + (cx % 4)] / 16 >= v) continue; // one dither step per cell, chunky like the planets
      d[k] = r; d[k + 1] = gg; d[k + 2] = b; d[k + 3] = cy % 3 === 2 ? 140 : 255;
    }
  }
  g.putImageData(img, 0, 0);
  const ci = Math.cos(theta), si2 = Math.sin(theta);
  for (const [x, y, c] of grid.light) if (c) {
    const lx = x + 0.5 - GW / 2, ly = y + 0.5 - GH / 2, X = Math.floor(lx * ci - ly * si2 + h), Y = Math.floor(lx * si2 + ly * ci + h);
    g.fillStyle = c; g.fillRect((X - 1) * px, (Y - 1) * px, px * 3, px * 3);
  }
  return canvas;
}

/** the probe seen from afar: a tiny dish-and-bus mark circling just off the planet, blinking */
function drawMark(ctx: CanvasRenderingContext2D, si: number, cx: number, cy: number, pr: number, t: number) {
  const a = (t / 42000) * Math.PI * 2, R = pr + 7, x = Math.round(cx + Math.cos(a) * R), y = Math.round(cy + Math.sin(a) * R);
  ctx.fillStyle = sc(si, 0.95);
  ctx.fillRect(x - 2, y - 2, 2, 4); ctx.fillRect(x, y - 1, 2, 2); ctx.fillRect(x + 2, y - 3, 1, 6); // dish, bus, wings
  if (state.onAir && lampLit(t)) { ctx.fillStyle = beaconFor(si); ctx.fillRect(x + 4, y - 1, 2, 2); }
}

/** the arrival: the probe comes in from beyond the screen, brakes and slots into its orbit */
const ARRIVE = 4200, SETTLE = 900;
const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
let arriving = { key: -1, at: 0, dur: ARRIVE, dx: -1, dy: 0, L: 0, k: 0, hop: false, wx: 0, wy: 0 };
/** where the last station was (world coordinates), so the next one flies in from that side */
let lastAt: { key: number; x: number; y: number } | null = null;
/** which way to come in from: away from the player dock, so the flight isn't hidden behind it */
function entryDir(T: { x: number; y: number }, tn: { x: number; y: number }) {
  const dock = document.getElementById("playerBox"), sky = document.getElementById("sky");
  let dx = -tn.x, dy = -tn.y; // by default, from behind along the orbit
  if (dock && sky && !dock.hidden) {
    const r = dock.getBoundingClientRect(), k = sky.getBoundingClientRect(), z = uiZoom(sky);
    if (r.width) { dx = T.x - (r.left - k.left + r.width / 2) / z; dy = T.y - (r.top - k.top + r.height / 2) / z; }
  }
  const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  // lean it a little towards the orbit's backward side, so it comes in roughly with the orbit's flow
  const ex = dx - tn.x * 0.35, ey = dy - tn.y * 0.35, m = Math.hypot(ex, ey) || 1;
  return { dx: ex / m, dy: ey / m };
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (p: number) => 1 - Math.pow(1 - p, 4); // fast in, a long retro-burn
/** where the probe is at arrival progress p (0…1), around a target T moving along the orbit */
function arrivalPos(p: number, T: { x: number; y: number }, tn: { x: number; y: number }) {
  const { L, k } = arriving, u = easeOut(clamp01(p)), v = 1 - u, a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
  if (arriving.hop) {
    // a hop to a planet in sight: straight from where the station was (pinned to the map, so it holds
    // still while the camera moves), then round into the new orbit
    const P0 = cam.toScreen(arriving.wx, arriving.wy), P1 = { x: P0.x + (T.x - P0.x) * 0.4, y: P0.y + (T.y - P0.y) * 0.4 }, P2 = { x: T.x - tn.x * k, y: T.y - tn.y * k };
    return { x: a * P0.x + b * P1.x + c * P2.x + d * T.x, y: a * P0.y + b * P1.y + c * P2.y + d * T.y };
  }
  // straight in at first, then it swings round and joins its orbit along the orbit's own direction:
  // an orbit insertion rather than a stop
  const P0 = { x: T.x + arriving.dx * L, y: T.y + arriving.dy * L }, P1 = { x: T.x + arriving.dx * L * 0.45, y: T.y + arriving.dy * L * 0.45 };
  const P2 = { x: T.x - tn.x * k, y: T.y - tn.y * k };
  return { x: a * P0.x + b * P1.x + c * P2.x + d * T.x, y: a * P0.y + b * P1.y + c * P2.y + d * T.y };
}
/** how far from T along (dx, dy) the screen ends, plus a margin */
function offscreen(T: { x: number; y: number }, dx: number, dy: number) {
  const tx = dx > 0 ? (cam.W - T.x) / dx : dx < 0 ? -T.x / dx : Infinity, ty = dy > 0 ? (cam.H - T.y) / dy : dy < 0 ? -T.y / dy : Infinity;
  return Math.min(tx, ty) + 80;
}
const hash = (n: number) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

export function drawStation(ctx: CanvasRenderingContext2D, t: number) {
  const pi = state.orbit; if (pi === null || cam.s < LOD_PLANETS) return;
  const pl = galaxy.planets[pi], q = motion.planetPos(pi, t), c = cam.toScreen(q.x, q.y);
  // from further out the probe is just a small blinking mark beside its planet
  if (cam.s < LOD_TRACKS) {
    drawMark(ctx, pl.s, c.x, c.y, Math.max(3, pl.r * cam.s), t);
    if (arriving.key === state.orbitSince) lastAt = { key: arriving.key, x: q.x, y: q.y };
    return;
  }
  const R = Math.max(orbitR(pl) * cam.s + 22, pl.r * cam.s + 40), a = (t / 42000) * Math.PI * 2; // one slow lap in ~40 s
  const ox = c.x + Math.cos(a) * R, oy = c.y + Math.sin(a) * R * 0.92;
  const { bar } = pulseOf(pl.s, t), col = (al: number) => sc(pl.s, al);

  // a new station. If the last one is in sight, it simply hops over, right away; otherwise wait for
  // the camera to settle and fly it in from afar (unless it was long ago or motion is off)
  if (arriving.key !== state.orbitSince) {
    const prev = lastAt && lastAt.key !== state.orbitSince ? lastAt : null, ps = prev && cam.toScreen(prev.x, prev.y);
    const hop = !!ps && ps.x > 0 && ps.y > 0 && ps.x < cam.W && ps.y < cam.H;
    if (!hop && cam.flying) return;
    const dur = hop ? 2800 : ARRIVE, skip = still || Date.now() - state.orbitSince > 15000;
    arriving = { key: state.orbitSince, at: skip ? t - dur - SETTLE : t, dur, dx: -1, dy: 0, L: 0, k: 0, hop: hop && !skip, wx: prev?.x ?? 0, wy: prev?.y ?? 0 };
  }
  const dur = arriving.dur, p = (t - arriving.at) / dur, after = clamp01((t - arriving.at - dur) / SETTLE); // flight, then settling in
  // in flight it aims at where its slot on the orbit will be when it gets there, joining it along the orbit
  const aEnd = ((arriving.at + dur) / 42000) * Math.PI * 2, ta = p < 1 ? aEnd : a;
  const tl = Math.hypot(Math.sin(ta), Math.cos(ta) * 0.92) || 1, tn = { x: -Math.sin(ta) / tl, y: (Math.cos(ta) * 0.92) / tl };
  const T = p < 1 ? { x: c.x + Math.cos(aEnd) * R, y: c.y + Math.sin(aEnd) * R * 0.92 } : { x: ox, y: oy };
  if (arriving.L === 0) {
    const full = Math.hypot(cam.W, cam.H) * 0.85;
    arriving.k = arriving.hop ? Math.min(R * 0.9, full * 0.2) : Math.min(R * 1.6, full * 0.3);
    // coming from the last station: from its side, and from right where it was if that is on screen
    const prev = lastAt && lastAt.key !== arriving.key ? cam.toScreen(lastAt.x, lastAt.y) : null, pd = prev ? Math.hypot(prev.x - T.x, prev.y - T.y) : 0;
    if (arriving.hop) arriving.L = 1;
    else if (prev && pd > 60) Object.assign(arriving, { dx: (prev.x - T.x) / pd, dy: (prev.y - T.y) / pd, L: Math.min(pd, full) });
    else Object.assign(arriving, entryDir(T, tn), { L: full });
    // a far start always begins beyond the screen edge
    if (arriving.L === full) arriving.L = Math.max(full, offscreen(T, arriving.dx, arriving.dy));
  }
  const at = p < 1 ? arrivalPos(p, T, tn) : T, x = at.x, y = at.y;
  { const w = cam.toWorld(x, y); lastAt = { key: arriving.key, x: w.x, y: w.y }; }
  if (p >= 1 && (x < -90 || y < -90 || x > cam.W + 90 || y > cam.H + 90)) return;
  if (p < 1) drawFlight(ctx, pl.s, p, T, tn, t);
  ctx.save(); ctx.globalAlpha = after; // the orbit, the link and the call-out come up once it is in place

  // its orbit, faintly
  ctx.strokeStyle = col(0.16); ctx.lineWidth = 1; ctx.setLineDash([2, 6]);
  ctx.beginPath(); ctx.ellipse(c.x, c.y, R, R * 0.92, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  // the link to the planet: a faint line with signal pulses running down it, one per bar
  const pr = Math.max(2, pl.r * cam.s), dx = c.x - x, dy = c.y - y, dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl;
  const ex = c.x - ux * pr, ey = c.y - uy * pr, span = Math.max(1, dl - pr);
  ctx.strokeStyle = col(0.14); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
  for (let k = 0; k < 3; k++) {
    const f = ((1 - bar) + k / 3) % 1, px0 = x + ux * span * f, py0 = y + uy * span * f, rr = 2 + 5 * f;
    ctx.strokeStyle = col(0.75 * (1 - f)); ctx.beginPath(); ctx.arc(px0, py0, rr, Math.atan2(uy, ux) - 0.9, Math.atan2(uy, ux) + 0.9); ctx.stroke();
  }

  ctx.restore();

  // the craft: re-shaded every frame. In flight its dish leads the way; braking, it turns to the planet
  grid.tone.fill(0); grid.light.length = 0;
  beacon = beaconFor(pl.s); probe(t, p < 0.72 ? 0 : clamp01((p - 0.72) / 0.28 * 0.6 + after * 0.4));
  const face = Math.atan2(c.y - y, c.x - x) - Math.PI;
  let theta = face;
  if (p < 1) {
    const b = arrivalPos(p + 0.01, T, tn), travel = Math.atan2(b.y - y, b.x - x) - Math.PI, k = clamp01((p - 0.55) / 0.4);
    const d = Math.atan2(Math.sin(face - travel), Math.cos(face - travel)); theta = travel + d * k * k * (3 - 2 * k);
  }
  const px = Math.max(2, Math.min(3, Math.round(cam.DPR))), sp = render(pl.s, px, theta);
  const grow = p < 1 && !arriving.hop ? 0.55 + 0.45 * easeOut(clamp01(p)) : 1; // it comes from far away: a touch smaller at first
  const scale = Math.min(0.85, 0.5 + (cam.s - LOD_TRACKS) * 0.08) * grow, w = (sp.width / cam.DPR) * scale, h = (sp.height / cam.DPR) * scale;
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(sp, Math.round(x - w / 2), Math.round(y - h / 2), w, h); ctx.restore();
  // orbit insertion: a pulse rings out as the engines cut
  if (p >= 1 && after < 1) {
    ctx.strokeStyle = col(0.7 * (1 - after)); ctx.setLineDash([1, 3]);
    ctx.beginPath(); ctx.arc(x, y, 8 + 46 * easeOut(after), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }
  if (after <= 0) return;
  ctx.save(); ctx.globalAlpha = after;

  // a schematic call-out, like a diagnostic screen
  const left = x < c.x, lx = x + (left ? -1 : 1) * (w * 0.5 + 10), ly = y - h * 0.5 - 10;
  ctx.strokeStyle = col(0.6); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x + (left ? -1 : 1) * w * 0.3, y - h * 0.3); ctx.lineTo(lx, ly); ctx.lineTo(lx + (left ? -46 : 46), ly); ctx.stroke();
  ctx.fillStyle = col(0.9); ctx.font = `9px ${FONT_LBL}`; ctx.textAlign = left ? "right" : "left";
  ctx.fillText("SOLARIS STATION · LISTENING", lx + (left ? -2 : 2), ly - 3);
  // time on station, like a mission clock: T+00:12:34
  const secs = Math.max(0, Math.floor((Date.now() - state.orbitSince) / 1000)), two = (n: number) => String(n).padStart(2, "0");
  ctx.fillStyle = col(0.65);
  ctx.fillText(`T+${two(Math.floor(secs / 3600))}:${two(Math.floor(secs / 60) % 60)}:${two(secs % 60)} ON STATION`, lx + (left ? -2 : 2), ly + 10);
  // the station's monitor hangs under the call-out: the planet below, live
  drawMonitor(ctx, left ? lx - MONITOR.w - 2 : lx + 2, ly + 18, pi, pl.s, t, after);
  ctx.restore();
}

/**
 * The flight in: a dithered wake behind the probe that stretches with its speed, streaks of
 * starlight sliding past while it is fast, and the flicker of its braking jets near the end.
 */
function drawFlight(ctx: CanvasRenderingContext2D, si: number, p: number, T: { x: number; y: number }, tn: { x: number; y: number }, t: number) {
  const here = arrivalPos(p, T, tn), ahead = arrivalPos(p + 0.004, T, tn);
  let vx = ahead.x - here.x, vy = ahead.y - here.y; const sp = Math.hypot(vx, vy); if (sp < 0.01) return;
  vx /= sp; vy /= sp; const nx = -vy, ny = vx, fast = clamp01(sp / 14), fr = Math.floor(t / 70);
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  // the wake: a faint ion trail along the path just flown, and chunky pixels breaking up behind it
  ctx.strokeStyle = sc(si, 0.22); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(here.x, here.y);
  for (let k = 1; k <= 30; k++) { const q = arrivalPos(p - k * 0.01, T, tn); ctx.lineTo(q.x, q.y); }
  ctx.stroke();
  const n = 46;
  for (let k = 2; k <= n; k++) {
    const q = arrivalPos(p - k * 0.0065, T, tn), f = 1 - k / n, j = (hash(k + fr) - 0.5) * (1 - f) * 14;
    if (hash(k * 7 + fr) > 0.3 + f * 0.7) continue; // dithered: it breaks up towards the tail
    const s2 = f > 0.7 ? 4 : f > 0.45 ? 3 : f > 0.2 ? 2 : 1;
    ctx.fillStyle = sc(si, 0.95 * f); ctx.fillRect(Math.round(q.x + nx * j - s2 / 2), Math.round(q.y + ny * j - s2 / 2), s2, s2);
  }
  // streaks of starlight sliding past while it is still fast
  if (fast > 0.1 && !arriving.hop) for (let k = 0; k < 14; k++) {
    const off = (hash(k + 3.7) - 0.5) * 300, along = 160 - ((hash(k + 9.1) * 320 + t * 1.4) % 320), len = (30 + 160 * hash(k + 1.3)) * fast;
    const sx = here.x + nx * off + vx * along, sy = here.y + ny * off + vy * along;
    ctx.strokeStyle = sc(si, 0.55 * fast * (1 - Math.abs(off) / 200)); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(Math.round(sx) + 0.5, Math.round(sy) + 0.5); ctx.lineTo(Math.round(sx - vx * len) + 0.5, Math.round(sy - vy * len) + 0.5); ctx.stroke();
  }
  // the retro-burn: jets fire forward, against the motion, flickering; brightest at the nozzle
  if (p > 0.3 && p < 0.97) {
    const burn = Math.sin(((p - 0.3) / 0.67) * Math.PI), f2 = Math.floor(t / 45);
    for (let k = 0; k < 22; k++) {
      if (hash(k + f2 * 13) > 0.25 + burn * 0.75) continue;
      const r = hash(k * 3 + f2), dd = 9 + r * 34 * burn, sd = (hash(k * 5 + f2) - 0.5) * (4 + r * 12);
      const s2 = r < 0.3 ? 3 : r < 0.65 ? 2 : 1;
      ctx.fillStyle = r < 0.25 ? `rgba(255,255,255,${0.9 * burn})` : sc(si, 0.95 * burn * (1 - r * 0.6));
      ctx.fillRect(Math.round(here.x + vx * dd + nx * sd), Math.round(here.y + vy * dd + ny * sd), s2, s2);
    }
  }
  ctx.restore();
}

// ---------- the station's monitor: the planet below, as an old tube shows it ----------
const MON_W = 180, MON_H = 120, COLS = 150, ROWS = 62, PH_ = 100;
/** the scenes are drawn in this space and scaled to the picture */
const SW = 90, SH = 60; // css px; the picture's cells (each a stretch of one scan line); the grey picture's height
let lastShot = -1, cutAt = -1e9;
let grey: HTMLCanvasElement | null = null, gx: CanvasRenderingContext2D, tube: HTMLCanvasElement, tx: CanvasRenderingContext2D;
const G = (v: number) => { const n = Math.max(0, Math.min(255, Math.round(v * 255))); return `rgb(${n},${n},${n})`; };
const W1 = (a: number) => `rgba(255,255,255,${a})`;
const hsh = (n: number) => { const x = Math.sin(n * 91.7) * 43758.5; return x - Math.floor(x); };

/** the planet in grey: a shaded globe turning, its kind's surface, satellites circling, the probe passing */
function drawPlanetScene(c: CanvasRenderingContext2D, pi: number, t: number, beat: number) {
  const W = SW, H = SH, kind = galaxy.ptype[pi], cx = W / 2, cy = H / 2 + 3, r = H * 0.27, spin = t / 9000, kick = Math.exp(-(beat % 1) * 5);
  c.fillStyle = "#000"; c.fillRect(0, 0, W, H);
  for (let k = 0; k < 40; k++) { if ((k + Math.floor(t / 300)) % 7) { c.fillStyle = G(0.25 + hsh(k) * 0.5); c.fillRect(hsh(k + 1) * W, hsh(k + 2) * H, 0.7, 0.7); } } // stars
  const halo = c.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * 1.6); halo.addColorStop(0, G(0.18 + kick * 0.1)); halo.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = halo; c.fillRect(0, 0, W, H);
  const ring = galaxy.ringed[pi] || kind === "ringed", tiltR = -0.32;
  const drawRing = (front: boolean) => {
    c.save(); c.translate(cx, cy); c.rotate(tiltR); c.beginPath();
    if (front) c.ellipse(0, 0, r * 2, r * 0.48, 0, 0, Math.PI); else c.ellipse(0, 0, r * 2, r * 0.48, 0, Math.PI, Math.PI * 2);
    c.strokeStyle = G(0.75); c.lineWidth = r * 0.22; c.stroke(); c.strokeStyle = G(0.3); c.lineWidth = r * 0.05; c.stroke(); c.restore();
  };
  if (ring) drawRing(false);
  // the globe, its surface wrapped round and turning
  c.save(); c.beginPath(); c.arc(cx, cy, r, 0, 7); c.clip();
  c.fillStyle = G(0.45); c.fillRect(cx - r, cy - r, r * 2, r * 2);
  const u = (lon: number) => cx + Math.sin(lon) * r; // a longitude on the sphere, to screen x
  if (kind === "giant" || kind === "ringed") {
    for (let k = -5; k <= 5; k++) { const y = cy + k * r * 0.18 + Math.sin(spin * 3 + k) * 0.4; c.fillStyle = G(k % 2 ? 0.25 : 0.7); c.fillRect(cx - r, y, r * 2, r * 0.09 + (k % 3 === 0 ? r * 0.05 : 0)); }
    const sl = spin * 2.5 % (Math.PI * 2); if (Math.cos(sl) > 0) { c.fillStyle = G(0.15); c.beginPath(); c.ellipse(u(sl), cy + r * 0.3, r * 0.22 * Math.cos(sl), r * 0.12, 0, 0, 7); c.fill(); } // a storm
  } else {
    for (let k = 0; k < 9; k++) { // features spread round the globe, seen when on the near side
      const lon = spin * 2 + k * 0.7 + hsh(pi + k) * 2, lat = (hsh(pi * 3 + k) - 0.5) * 1.6, vis = Math.cos(lon); if (vis <= 0) continue;
      const x = u(lon), y = cy + Math.sin(lat) * r, w = r * (0.12 + hsh(k + pi) * 0.22) * vis, h = r * (0.1 + hsh(k * 2 + pi) * 0.18) * Math.cos(lat);
      if (kind === "ancient") { c.fillStyle = G(0.2); c.beginPath(); c.ellipse(x, y, w, h, 0, 0, 7); c.fill(); c.strokeStyle = G(0.8); c.lineWidth = 0.5; c.beginPath(); c.ellipse(x - w * 0.15, y - h * 0.15, w, h, 0, Math.PI * 0.9, Math.PI * 1.7); c.stroke(); } // craters
      else if (kind === "young") { c.fillStyle = G(0.85); c.beginPath(); c.ellipse(x, y, w * 1.4, h * 0.6, 0, 0, 7); c.fill(); } // ice
      else { c.fillStyle = G(0.72); c.beginPath(); c.ellipse(x, y, w * 1.5, h, hsh(k) * 2, 0, 7); c.fill(); } // land
    }
    if (kind === "young") { c.fillStyle = G(0.95); c.fillRect(cx - r, cy - r, r * 2, r * 0.25); c.fillRect(cx - r, cy + r * 0.78, r * 2, r * 0.3); } // polar caps
  }
  // light from the star on one side, night on the other, and a bright limb
  const sh = c.createLinearGradient(cx - r, cy - r, cx + r, cy + r); sh.addColorStop(0, "rgba(255,255,255,.25)"); sh.addColorStop(0.45, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,0,.85)");
  c.fillStyle = sh; c.fillRect(cx - r, cy - r, r * 2, r * 2); c.restore();
  c.strokeStyle = G(0.9); c.lineWidth = 0.8; c.beginPath(); c.arc(cx, cy, r, Math.PI * 0.8, Math.PI * 1.75); c.stroke();
  if (ring) drawRing(true);
  // satellites: the label's tracks circling, the one on air brighter; and the probe itself
  for (let k = 0; k < 14; k++) {
    const a = t / (2600 + k * 420) + k * 1.9, rr = r * (1.25 + (k % 5) * 0.16), x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.42;
    if (Math.sin(a) < 0 && Math.hypot(x - cx, y - cy) < r) continue; // behind the globe
    c.fillStyle = G(k === 0 ? 0.6 + kick * 0.4 : 0.7); c.fillRect(x - 0.7, y - 0.7, k === 0 ? 2 : 1.3, k === 0 ? 2 : 1.3);
  }
  const pa = t / 4200, px = cx + Math.cos(pa) * r * 2.2, py = cy + Math.sin(pa) * r * 0.9;
  c.fillStyle = G(1); c.fillRect(px - 1.5, py - 0.4, 3, 0.8); c.fillRect(px - 0.4, py - 1.6, 0.8, 3.2); // the station, a small cross of light
}

// ---------- footage from the surface ----------
/** a ridge line across the picture: a few sine waves seeded by the planet, so each world has its own skyline */
function ridge(seed: number, x: number, base: number, amp: number, rough: number) {
  let y = base;
  for (let k = 0; k < 4; k++) { const f = (0.04 + hsh(seed + k) * 0.08) * (1 + k * rough), ph = hsh(seed * 3 + k) * 6.28; y -= Math.sin(x * f + ph) * amp / (1 + k * 0.9); }
  return y;
}
function layer(c: CanvasRenderingContext2D, seed: number, pan: number, base: number, amp: number, rough: number, v: number, W: number, H: number) {
  c.fillStyle = G(v); c.beginPath(); c.moveTo(0, H);
  for (let x = 0; x <= W; x += 1) c.lineTo(x, ridge(seed, x + pan, base, amp, rough));
  c.lineTo(W, H); c.closePath(); c.fill();
}
/**
 * A view from the planet's surface, by its kind — cloud seas on the giants, rings across the sky on the
 * ringed worlds, crater fields on the old ones, ice and aurora on the young, mountains and water on the
 * rest — with the camera panning slowly, weather moving, and the sky keeping the beat. `night` turns
 * the lights down and the stars up.
 */
function drawSurface(c: CanvasRenderingContext2D, pi: number, t: number, beat: number, night: boolean) {
  const W = SW, H = SH, kind = galaxy.ptype[pi], s = pi * 7.3, pan = t / 260, kick = Math.exp(-(beat % 1) * 5), bar = (beat / 4) % 1;
  const hz = H * (kind === "giant" ? 0.55 : 0.58);
  // sky
  const sky = c.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, G(night ? 0.02 : kind === "ancient" ? 0.04 : 0.08)); sky.addColorStop(1, G(night ? 0.14 : kind === "ancient" ? 0.2 : 0.62));
  c.fillStyle = sky; c.fillRect(0, 0, W, H);
  if (night || kind === "ancient") for (let k = 0; k < 50; k++) { if ((k + Math.floor(t / 400)) % 9) { c.fillStyle = G(0.3 + hsh(k + s) * 0.6); c.fillRect((hsh(k * 2 + s) * W + pan * 0.05) % W, hsh(k * 3 + s) * hz * 0.9, 0.6, 0.6); } }
  // the sun of the system, low over the horizon, and the system's other worlds hanging in the sky
  const sunX = W * (0.25 + hsh(s) * 0.5) - pan * 0.08 % W, sunY = hz * (night ? 1.1 : 0.45 + hsh(s + 1) * 0.3);
  if (!night) { const g = c.createRadialGradient(sunX, sunY, 0, sunX, sunY, 14); g.addColorStop(0, G(1)); g.addColorStop(0.25, G(0.85)); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(0, 0, W, hz); }
  const moonX = (W * hsh(s + 5) - pan * 0.12) % W + (pan * 0.12 > W * hsh(s + 5) ? W : 0), moonY = hz * (0.2 + hsh(s + 6) * 0.25), mr = 3 + hsh(s + 7) * 4;
  c.fillStyle = G(night ? 0.9 : 0.6); c.beginPath(); c.arc(moonX, moonY, mr, 0, 7); c.fill();
  c.fillStyle = G(night ? 0.05 : 0.3); c.beginPath(); c.arc(moonX + mr * 0.45, moonY - mr * 0.2, mr * 0.9, 0, 7); c.fill(); // its shadowed side
  if (kind === "ringed" || galaxy.ringed[pi]) { // the rings, a great arc across the sky
    c.save(); c.translate(W * 0.5, hz + H * 0.35); c.rotate(-0.18 + Math.sin(t / 20000) * 0.03);
    for (let k = 0; k < 6; k++) { c.strokeStyle = G((night ? 0.35 : 0.85) - k * 0.08 + (k % 2 ? -0.15 : 0)); c.lineWidth = 1.6 - k * 0.15; c.beginPath(); c.ellipse(0, 0, W * 0.95 + k * 2.2, H * 0.62 + k * 1.6, 0, Math.PI * 1.04, Math.PI * 1.96); c.stroke(); }
    c.restore();
  }
  if (kind === "young") { // aurora curtains, swaying, brighter on the beat
    for (let k = 0; k < 3; k++) {
      c.strokeStyle = W1(0.12 + kick * 0.18 + (night ? 0.1 : 0)); c.lineWidth = 3 - k; c.beginPath();
      for (let x = 0; x <= W; x += 2) { const y = hz * (0.25 + k * 0.12) + Math.sin(x * 0.12 + t / 900 + k * 2) * 3 + Math.sin(x * 0.05 - t / 1500) * 2; if (x) c.lineTo(x, y); else c.moveTo(x, y); }
      c.stroke();
    }
  }
  const dim = night ? 0.35 : 1;
  if (kind === "giant") {
    // no ground: seas of cloud rolling past, a storm eye turning, lightning on the bar
    for (let k = 0; k < 6; k++) {
      const y = hz + k * (H - hz) / 5, sp = pan * (0.5 + k * 0.5);
      c.fillStyle = G((0.25 + (k % 2) * 0.25 + k * 0.05) * dim); c.beginPath(); c.moveTo(0, H);
      for (let x = 0; x <= W; x += 1) c.lineTo(x, y + Math.sin((x + sp) * (0.08 + k * 0.02) + k) * (1.5 + k * 0.6));
      c.lineTo(W, H); c.closePath(); c.fill();
    }
    const ex = (W * 0.7 - pan * 0.6) % (W + 40) + (pan * 0.6 > W * 0.7 ? W + 40 : 0) - 20, ey = hz + 10;
    for (let k = 0; k < 4; k++) { c.strokeStyle = G((0.75 - k * 0.15) * dim); c.lineWidth = 0.8; c.beginPath(); c.ellipse(ex, ey, 12 - k * 2.6, 3.5 - k * 0.8, Math.sin(t / 3000 + k) * 0.2, t / (900 + k * 300), t / (900 + k * 300) + 4.5); c.stroke(); }
    if (bar < 0.06 && Math.floor(beat / 4) % 2 === 0) { c.strokeStyle = G(1); c.lineWidth = 0.8; c.beginPath(); let lx = W * hsh(Math.floor(beat / 4)), ly = 0; c.moveTo(lx, ly); while (ly < hz + 6) { lx += (hsh(ly + beat) - 0.5) * 6; ly += 4; c.lineTo(lx, ly); } c.stroke(); c.fillStyle = W1(0.25); c.fillRect(0, 0, W, H); }
    return;
  }
  // far mountains, nearer hills, the ground: each layer pans at its own pace
  const rough = kind === "young" ? 1.6 : kind === "ancient" ? 0.4 : 1;
  layer(c, s + 1, pan * 0.3, hz - 2, kind === "ancient" ? 3 : 9, rough, night ? 0.06 : kind === "young" ? 0.8 : 0.3, W, H);
  layer(c, s + 2, pan * 0.6, hz + 6, kind === "ancient" ? 2 : 5, rough * 0.6, night ? 0.03 : kind === "young" ? 0.55 : 0.14, W, H);
  c.fillStyle = G((kind === "young" ? 0.42 : kind === "ancient" ? 0.22 : 0.08) * dim); c.fillRect(0, hz + 12, W, H - hz - 12); // the ground
  if (kind === "rocky") { // a lake catching the sky, its reflection trembling
    const ly = hz + 15; c.fillStyle = G((night ? 0.08 : 0.42)); c.fillRect(0, ly, W, 9);
    for (let k = 0; k < 9; k++) { const y = ly + 1 + k, w = 6 + hsh(k) * 10, x = (sunX + Math.sin(t / 300 + k) * 2) - w / 2; c.fillStyle = G(night ? 0.3 : 0.9 - k * 0.07); c.fillRect(x, y, w * (1 - k * 0.06), 0.5); }
    for (let k = 0; k < 4; k++) { const cx = (hsh(k + s) * W * 1.5 - pan * (0.3 + k * 0.1)) % (W * 1.5) + (pan * (0.3 + k * 0.1) > hsh(k + s) * W * 1.5 ? W * 1.5 : 0) - W * 0.25, cy = hz * (0.2 + k * 0.12); c.fillStyle = G(night ? 0.12 : 0.8); c.beginPath(); c.ellipse(cx, cy, 8 + k * 2, 1.6, 0, 0, 7); c.ellipse(cx + 4, cy - 1, 5, 1.6, 0, 0, 7); c.fill(); } // clouds
  }
  if (kind === "ancient") for (let k = 0; k < 7; k++) { // craters on the plain, coming towards you
    const z = ((k / 7 + t / 30000) % 1), y = hz + 13 + z * z * (H - hz - 12), x = W * hsh(k + s) + (W * hsh(k + s) - W / 2) * z, rx = 3 + z * 10, ry = rx * 0.3;
    c.fillStyle = G(0.12); c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); c.fill(); c.strokeStyle = G(0.6 * dim); c.lineWidth = 0.5; c.beginPath(); c.ellipse(x, y - 0.3, rx, ry, 0, Math.PI, Math.PI * 2); c.stroke();
  }
  if (kind === "young") for (let k = 0; k < 9; k++) { // spires of ice
    const x = (W * hsh(k + s) * 1.3 - pan * 0.8) % (W * 1.3) + (pan * 0.8 > W * hsh(k + s) * 1.3 ? W * 1.3 : 0) - 6, h = 5 + hsh(k * 2 + s) * 12, y = hz + 13 + hsh(k * 4 + s) * 8;
    c.fillStyle = G(0.95 * dim); c.beginPath(); c.moveTo(x - 1.8, y); c.lineTo(x, y - h); c.lineTo(x + 1.8, y); c.closePath(); c.fill(); c.fillStyle = G(0.4 * dim); c.beginPath(); c.moveTo(x, y - h); c.lineTo(x + 1.8, y); c.lineTo(x + 0.4, y); c.closePath(); c.fill();
  }
  // the relay mast the station talks to, its lamp blinking with ON AIR
  const mx = (W * 0.18 + 30 - pan * 0.9) % (W + 30) + (pan * 0.9 > W * 0.18 + 30 ? W + 30 : 0) - 15, my = hz + 14;
  c.strokeStyle = G(0.85 * dim + 0.1); c.lineWidth = 0.6; c.beginPath(); c.moveTo(mx, my); c.lineTo(mx, my - 14); c.moveTo(mx - 3, my); c.lineTo(mx, my - 9); c.lineTo(mx + 3, my); c.moveTo(mx - 4, my - 14); c.quadraticCurveTo(mx, my - 11, mx + 4, my - 14); c.stroke();
  if (state.onAir && lampLit(t)) { const g = c.createRadialGradient(mx, my - 15, 0, mx, my - 15, 3); g.addColorStop(0, G(1)); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(mx - 3, my - 18, 6, 6); }
  // weather: snow on the ice worlds, dust drifting on the old ones
  if (kind === "young" || kind === "ancient") for (let k = 0; k < 40; k++) {
    const sp = kind === "young" ? 0.012 : 0.004, x = (hsh(k + 3) * W + t * sp * (kind === "young" ? 0.4 : 2) + Math.sin(t / 700 + k) * 2) % W, y = (hsh(k + 9) * H + t * sp * (kind === "young" ? 1 : 0.2)) % H;
    c.fillStyle = G(kind === "young" ? 0.95 : 0.5); c.fillRect(x, y, 0.7, 0.7);
  }
}

/** the tube: each cell becomes a stretch of glowing scan line, edges burning brighter, alternate fields dimmer */
export function drawMonitor(ctx: CanvasRenderingContext2D, x: number, y: number, pi: number, si: number, t: number, alpha: number) {
  if (!grey) {
    grey = document.createElement("canvas"); grey.width = COLS; grey.height = PH_; gx = grey.getContext("2d", { willReadFrequently: true })!;
    tube = document.createElement("canvas"); tube.width = COLS * 2; tube.height = ROWS * 3; tx = tube.getContext("2d")!;
  }
  const beat = (t / 1000) * galaxy.bpm[si] / 60 + galaxy.phase0[si];
  // the shots change every four bars: from orbit, then the surface by day and by night
  const shot = Math.floor(beat / 16) % 3;
  gx.setTransform(COLS / SW, 0, 0, PH_ / SH, 0, 0);
  if (shot === 0) drawPlanetScene(gx, pi, t, beat); else drawSurface(gx, pi, t, beat, shot === 2);
  gx.setTransform(1, 0, 0, 1, 0, 0);
  if (shot !== lastShot) { if (lastShot >= 0) cutAt = t; lastShot = shot; }
  const snow = 1 - (t - cutAt) / 320; // a burst of snow on the cut
  if (snow > 0) for (let n = 0; n < 900 * snow; n++) { gx.fillStyle = G(Math.random()); gx.fillRect(Math.random() * COLS, Math.random() * PH_, 1, 1); }
  const src = gx.getImageData(0, 0, COLS, PH_).data, img = tx.createImageData(COLS * 2, ROWS * 3), d = img.data, [R, Gc, B] = SC[si];
  const lum = (cx: number, cy: number) => src[(Math.max(0, Math.min(PH_ - 1, cy)) * COLS + Math.max(0, Math.min(COLS - 1, cx))) * 4] / 255;
  const roll = (t / 40) % (ROWS + 10) - 5;
  for (let row = 0; row < ROWS; row++) {
    const jit = (row * 13 + Math.floor(t / 80)) % 61 === 0 ? 2 : 0, dim = row % 2 ? 0.8 : 1, boost = Math.abs(row - roll) < 1.5 ? 0.18 : 0;
    for (let col = 0; col < COLS; col++) {
      const sy = Math.round(row * PH_ / ROWS), l = lum(col, sy), e = Math.min(1, (Math.abs(lum(col + 1, sy) - lum(col - 1, sy)) + Math.abs(lum(col, sy + 2) - lum(col, sy - 2))) * 1.2);
      const v = Math.min(1, Math.pow(l, 0.85) + e * 0.5 + (l > 0.02 ? boost : 0)) * dim; if (v < 0.03) continue;
      const hot = Math.max(0, (v - 0.8) / 0.2); // the brightest burn towards white
      for (let sx = 0; sx < 2; sx++) for (let ly = 0; ly < 2; ly++) { // two lit lines out of three: the scan line and its gap
        const X = col * 2 + sx + jit, Y = row * 3 + ly; if (X >= COLS * 2) continue;
        const k = (Y * COLS * 2 + X) * 4, a = ly ? 0.55 : 1;
        d[k] = R + (255 - R) * hot; d[k + 1] = Gc + (255 - Gc) * hot; d[k + 2] = B + (255 - B) * hot; d[k + 3] = 255 * v * a;
      }
    }
  }
  tx.putImageData(img, 0, 0);
  // frame, the picture with a soft bloom, captions
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.fillStyle = "rgba(0,0,0,.88)"; ctx.fillRect(x, y, MON_W, MON_H);
  ctx.imageSmoothingEnabled = true; ctx.shadowColor = sc(si, 0.9); ctx.shadowBlur = 6;
  ctx.drawImage(tube, x + 2, y + 2, MON_W - 4, MON_H - 4); ctx.shadowBlur = 0;
  const vg = ctx.createRadialGradient(x + MON_W / 2, y + MON_H / 2, MON_H * 0.3, x + MON_W / 2, y + MON_H / 2, MON_W * 0.7);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.55)"); ctx.fillStyle = vg; ctx.fillRect(x, y, MON_W, MON_H);
  ctx.strokeStyle = sc(si, 0.75); ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, MON_W - 1, MON_H - 1);
  ctx.font = `600 8px "Martian Mono", monospace`; ctx.textBaseline = "top"; ctx.textAlign = "left";
  ctx.fillStyle = state.onAir && !lampLit(t) ? "rgba(255,77,109,.25)" : "#ff4d6d"; ctx.fillText("● LIVE", x + 5, y + 4);
  ctx.fillStyle = sc(si, 0.9); ctx.textAlign = "right"; ctx.fillText(["EXT 1 · ORBIT", "EXT 2 · SURFACE", "EXT 3 · NIGHT"][lastShot] ?? "EXT 1", x + MON_W - 5, y + 4);
  ctx.restore();
}
export const MONITOR = { w: MON_W, h: MON_H };
