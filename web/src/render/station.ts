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

/** where the station's call-out sits this frame, for the little monitor that hangs under it */
export const stationAt = { ok: false, x: 0, y: 0, left: false, si: 0, a: 0 };

export function drawStation(ctx: CanvasRenderingContext2D, t: number) {
  stationAt.ok = false;
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
  Object.assign(stationAt, { ok: true, x: lx, y: ly + 18, left, si: pl.s, a: after });
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
