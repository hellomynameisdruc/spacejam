// Шрифти лежать разом із сайтом (лише латиниця + кирилиця)
import "@fontsource/dotgothic16/latin-400.css";
import "@fontsource/dotgothic16/latin-ext-400.css";
import "@fontsource/dotgothic16/cyrillic-400.css";
import "@fontsource/martian-mono/latin-300.css";
import "@fontsource/martian-mono/cyrillic-300.css";
import "@fontsource/martian-mono/latin-400.css";
import "@fontsource/martian-mono/cyrillic-400.css";
import "@fontsource/martian-mono/latin-600.css";
import "@fontsource/martian-mono/cyrillic-600.css";
import "./style.css";
import { Player } from "./player";

// ---------- Дані (готує pipeline/build_map.py) ----------
type Star = { name: string; x: number; y: number; core: number; R: number; n: number; tracks: number; color: string };
type Planet = { name: string; s: number; x: number; y: number; r: number; n: number; yr: [number, number]; t0: number; t1: number };
type MapData = { meta: { sector: string; sample: boolean; releases: number; tracks: number }; stars: Star[]; links: [number, number, number][]; planets: Planet[] };
type Chunk = { yt: string[]; t: string[]; a: number[]; yr: number[]; p: number[]; x: number[]; y: number[]; an: string[] };
type TrackRef = { s: number; i: number };
type Sel = { kind: "star"; s: number } | { kind: "planet"; p: number } | { kind: "track"; s: number; i: number } | null;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmt = (n: number) => n.toLocaleString("uk-UA").replace(/ /g, " ");
const pad = (n: number, w: number) => String(n).padStart(w, "0");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

const map: MapData = await fetch("./data/map.json").then((r) => r.json());
const { stars, planets, links } = map;
const planetsByStar: number[][] = stars.map(() => []);
planets.forEach((p, i) => planetsByStar[p.s].push(i));
planetsByStar.forEach((l) => l.sort((a, b) => planets[b].n - planets[a].n));
const totalTracks = stars.reduce((a, s) => a + s.tracks, 0);

// ---------- Ліниве завантаження треків по зорях ----------
const chunks: (Chunk | null)[] = stars.map(() => null);
const loading = new Map<number, Promise<Chunk>>();
function loadChunk(s: number): Promise<Chunk> {
  if (chunks[s]) return Promise.resolve(chunks[s]!);
  if (!loading.has(s)) loading.set(s, fetch(`./data/tracks/${s}.json`).then((r) => r.json()).then((c: Chunk) => { chunks[s] = c; dirty = true; return c; }));
  return loading.get(s)!;
}

// ---------- Люмінофор ----------
let PH = [190, 184, 255];
const ph = (a = 1) => `rgba(${PH[0]},${PH[1]},${PH[2]},${a})`;
let BG = "#07060e";
function readPhosphor() {
  const cs = getComputedStyle(document.documentElement);
  PH = cs.getPropertyValue("--ph").trim().split(/\s+/).map(Number);
  BG = cs.getPropertyValue("--bg").trim() || BG;
  ditherPat = null; dirty = true;
}
function setPhosphor(name: string) {
  document.documentElement.dataset.phosphor = name;
  document.querySelectorAll<HTMLButtonElement>(".phos button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ph === name)));
  try { localStorage.setItem("kosmos-ph", name); } catch { /* */ }
  readPhosphor(); render();
}
document.querySelectorAll<HTMLButtonElement>(".phos button").forEach((b) => (b.onclick = () => setPhosphor(b.dataset.ph!)));

// ---------- Піксельні гліфи зір (симетричний 7×7 малюнок з назви) ----------
const glyphs = stars.map((s) => {
  let h = hash(s.name); const g: boolean[][] = [];
  for (let y = 0; y < 7; y++) { g.push([]); for (let x = 0; x < 4; x++) { h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; g[y][x] = (h & 7) < 3; } }
  g[3][3] = true; g[2][3] = true; g[4][3] = true; g[3][2] = true; // ядро
  return g.map((r) => [r[0], r[1], r[2], r[3], r[2], r[1], r[0]]);
});
function drawGlyph(c: CanvasRenderingContext2D, s: number, cx: number, cy: number, cell: number, a = 1) {
  const g = glyphs[s], o = 3.5 * cell;
  c.fillStyle = ph(a);
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) if (g[y][x]) c.fillRect(Math.round(cx - o + x * cell), Math.round(cy - o + y * cell), Math.ceil(cell - (cell > 3 ? 1 : 0)), Math.ceil(cell - (cell > 3 ? 1 : 0)));
}

// ---------- Канвас і камера ----------
const vp = $("viewport"), cv = $<HTMLCanvasElement>("sky"), ctx = cv.getContext("2d")!;
let W = 0, H = 0, dirty = true, ditherPat: CanvasPattern | null = null;
function resize() {
  const r = vp.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  W = Math.max(1, r.width); H = Math.max(1, r.height);
  cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false;
  dirty = true;
}
new ResizeObserver(resize).observe(vp); resize();

const bounds = (() => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of stars) { x0 = Math.min(x0, s.x - s.R); y0 = Math.min(y0, s.y - s.R); x1 = Math.max(x1, s.x + s.R); y1 = Math.max(y1, s.y + s.R); }
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
})();
const homeScale = () => Math.min(W / bounds.w, H / bounds.h) * 0.94;
const cam = { x: bounds.x, y: bounds.y, s: homeScale() };
const minS = () => homeScale() * 0.5, maxS = 14;
const clampS = (s: number) => Math.max(minS(), Math.min(maxS, s));
const toScreen = (x: number, y: number) => ({ x: (x - cam.x) * cam.s + W / 2, y: (y - cam.y) * cam.s + H / 2 });
const toWorld = (x: number, y: number) => ({ x: (x - W / 2) / cam.s + cam.x, y: (y - H / 2) / cam.s + cam.y });

let tween: { fx: number; fy: number; fs: number; tx: number; ty: number; ts: number; t0: number; dur: number } | null = null;
let warpFx = 0;
function fly(tx: number, ty: number, ts: number, dur = 1400) { tween = { fx: cam.x, fy: cam.y, fs: cam.s, tx, ty, ts: clampS(ts), t0: performance.now(), dur: reduce ? 1 : dur }; }
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const LOD_PLANETS = 0.12, LOD_TRACKS = 0.7, LOD_TITLES = 3.2;
let sel: Sel = null, hover: Sel = null, nowPlaying: TrackRef | null = null;
const same = (a: Sel, b: Sel) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);

let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const dust = Array.from({ length: 420 }, () => ({ x: rnd(), y: rnd(), d: 0.15 + rnd() * 0.7, b: rnd() }));

const FONT_LBL = "DotGothic16, 'Martian Mono', monospace";
const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
function label(txt: string, x: number, y: number, size: number, a: number, align: CanvasTextAlign = "center", force = false, inv = false) {
  ctx.font = `${size}px ${FONT_LBL}`;
  const w = ctx.measureText(txt).width, h = size + 2;
  const x0 = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  const r = { x0: x0 - 3, y0: y - h, x1: x0 + w + 3, y1: y + 4 };
  if (!force && placed.some((p) => p.x0 < r.x1 && p.x1 > r.x0 && p.y0 < r.y1 && p.y1 > r.y0)) return false;
  placed.push(r);
  ctx.textAlign = align;
  if (inv) { ctx.fillStyle = ph(1); ctx.fillRect(r.x0 - 2, r.y0 + 1, r.x1 - r.x0 + 4, h + 4); ctx.fillStyle = BG; ctx.shadowBlur = 0; }
  else { ctx.fillStyle = ph(a); ctx.shadowColor = ph(0.7); ctx.shadowBlur = 6; }
  ctx.fillText(txt, x, y); ctx.shadowBlur = 0;
  return true;
}
function brackets(x: number, y: number, r: number, a = 1, len = 6) {
  ctx.strokeStyle = ph(a); ctx.lineWidth = 1.2; ctx.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const cx = x + sx * r, cy = y + sy * r;
    ctx.moveTo(cx, cy - sy * len); ctx.lineTo(cx, cy); ctx.lineTo(cx - sx * len, cy);
  }
  ctx.stroke();
}
function getDither() {
  if (ditherPat) return ditherPat;
  const c = document.createElement("canvas"); c.width = c.height = 3;
  const g = c.getContext("2d")!; g.fillStyle = ph(0.95); g.fillRect(0, 0, 1, 1); g.fillStyle = ph(0.45); g.fillRect(2, 2, 1, 1);
  return (ditherPat = ctx.createPattern(c, "repeat"));
}
function inView(x: number, y: number, r: number) { const a = toWorld(0, 0), b = toWorld(W, H); return x + r > a.x && x - r < b.x && y + r > a.y && y - r < b.y; }

function draw() {
  placed.length = 0;
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  const v0 = toWorld(0, 0), v1 = toWorld(W, H);

  // координатна сітка в просторі мапи
  const step = Math.pow(10, Math.ceil(Math.log10(70 / cam.s)));
  const st = step * cam.s < 140 ? step : step / 2;
  ctx.strokeStyle = ph(0.06); ctx.lineWidth = 1; ctx.beginPath();
  for (let x = Math.floor(v0.x / st) * st; x < v1.x; x += st) { const p = toScreen(x, 0).x; ctx.moveTo(Math.round(p) + 0.5, 0); ctx.lineTo(Math.round(p) + 0.5, H); }
  for (let y = Math.floor(v0.y / st) * st; y < v1.y; y += st) { const p = toScreen(0, y).y; ctx.moveTo(0, Math.round(p) + 0.5); ctx.lineTo(W, Math.round(p) + 0.5); }
  ctx.stroke();

  // пил
  for (const d of dust) {
    let x = (d.x * W * 4 - cam.x * cam.s * d.d * 0.04) % W, y = (d.y * H * 4 - cam.y * cam.s * d.d * 0.04) % H;
    if (x < 0) x += W; if (y < 0) y += H;
    ctx.fillStyle = ph(0.12 + d.b * 0.35);
    if (warpFx > 0.05) { ctx.fillRect(x, y, 1 + (x - W / 2) * warpFx * 0.25, 1); }
    else ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  // межі систем і гравітаційні зв'язки
  ctx.setLineDash([1, 5]); ctx.lineWidth = 1;
  for (const s of stars) if (inView(s.x, s.y, s.R)) { const p = toScreen(s.x, s.y); ctx.strokeStyle = ph(0.16); ctx.beginPath(); ctx.arc(p.x, p.y, s.R * cam.s, 0, 7); ctx.stroke(); }
  for (const [a, b, w] of links) {
    const A = toScreen(stars[a].x, stars[a].y), B = toScreen(stars[b].x, stars[b].y);
    ctx.strokeStyle = ph(Math.min(0.55, 0.08 + w * 1.2)); ctx.lineWidth = w > 0.15 ? 1.5 : 1;
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
  }
  ctx.setLineDash([]);

  // треки
  let titles: { x: number; y: number; t: string }[] = [];
  if (cam.s >= LOD_TRACKS) {
    const sz = Math.max(1, Math.min(3, Math.round(cam.s * 0.9)));
    ctx.fillStyle = ph(0.85);
    stars.forEach((s, si) => {
      if (!inView(s.x, s.y, s.R)) return;
      const ch = chunks[si]; if (!ch) { loadChunk(si); return; }
      for (let i = 0; i < ch.x.length; i++) {
        const x = ch.x[i], y = ch.y[i];
        if (x < v0.x || x > v1.x || y < v0.y || y > v1.y) continue;
        const p = toScreen(x, y);
        ctx.fillRect(Math.round(p.x - sz / 2), Math.round(p.y - sz / 2), sz, sz);
        if (cam.s >= LOD_TITLES && titles.length < 240) titles.push({ x: p.x, y: p.y, t: ch.t[i] });
      }
    });
  } else {
    for (const p of planets) if (inView(p.x, p.y, 60)) {
      const q = toScreen(p.x, p.y), rr = (p.r + 4 + 1.5 * Math.sqrt(p.t1 - p.t0)) * cam.s;
      if (rr > 2) { ctx.strokeStyle = ph(0.25); ctx.setLineDash([1, 2]); ctx.beginPath(); ctx.arc(q.x, q.y, rr, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    }
  }

  // планети: дизерована куля з контуром
  if (cam.s >= LOD_PLANETS) {
    const vis = planets.map((_, i) => i).filter((i) => inView(planets[i].x, planets[i].y, planets[i].r * 3));
    const pat = getDither();
    for (const i of vis) {
      const pl = planets[i], p = toScreen(pl.x, pl.y), r = Math.max(1.5, pl.r * cam.s);
      if (r < 3) { ctx.fillStyle = ph(0.9); ctx.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 2, 2); continue; }
      ctx.fillStyle = BG; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.clip();
      ctx.fillStyle = pat!; ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      ctx.fillStyle = ph(0.9); ctx.beginPath(); ctx.arc(p.x - r * 0.35, p.y - r * 0.35, r * 0.62, 0, 7); ctx.fill();
      ctx.fillStyle = BG; ctx.beginPath(); ctx.arc(p.x + r * 0.05, p.y + r * 0.05, r * 0.72, 0, 7); ctx.globalAlpha = 0.55; ctx.fill(); ctx.globalAlpha = 1;
      ctx.restore();
      ctx.strokeStyle = ph(0.9); ctx.lineWidth = 1; ctx.shadowColor = ph(0.6); ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.stroke(); ctx.shadowBlur = 0;
    }
    for (const i of vis.slice().sort((a, b) => planets[b].n - planets[a].n)) {
      const pl = planets[i], r = pl.r * cam.s; if (r < 4) continue;
      const p = toScreen(pl.x, pl.y);
      label(pl.name.toUpperCase(), p.x, p.y + r + 14, 11, 0.8);
    }
  }

  // зорі: піксельний гліф + приціл
  stars.forEach((s, si) => {
    if (!inView(s.x, s.y, 300 / cam.s)) return;
    const p = toScreen(s.x, s.y), cell = Math.max(2, Math.min(7, Math.round(s.core * cam.s / 4)));
    ctx.shadowColor = ph(0.9); ctx.shadowBlur = 12; drawGlyph(ctx, si, p.x, p.y, cell); ctx.shadowBlur = 0;
    const r = cell * 4.5;
    ctx.strokeStyle = ph(0.35); ctx.beginPath();
    ctx.moveTo(p.x - r - 6, p.y); ctx.lineTo(p.x - r - 2, p.y); ctx.moveTo(p.x + r + 2, p.y); ctx.lineTo(p.x + r + 6, p.y);
    ctx.moveTo(p.x, p.y - r - 6); ctx.lineTo(p.x, p.y - r - 2); ctx.moveTo(p.x, p.y + r + 2); ctx.lineTo(p.x, p.y + r + 6); ctx.stroke();
  });
  stars.map((s, si) => ({ s, si })).sort((a, b) => b.s.n - a.s.n).forEach(({ s, si }) => {
    if (!inView(s.x, s.y, 300 / cam.s)) return;
    const p = toScreen(s.x, s.y), cell = Math.max(2, Math.min(7, Math.round(s.core * cam.s / 4)));
    label(s.name.toUpperCase(), p.x, p.y - cell * 4.5 - 12, W < 600 ? 12 : 14, 1);
  });

  for (const t of titles) label(t.t, t.x + 6, t.y + 4, 11, 0.7, "left");

  // виділення, наведення, відтворення
  const marker = (o: Sel, strong: boolean) => {
    if (!o) return;
    let x = 0, y = 0, r = 8, name = "";
    if (o.kind === "star") { const s = stars[o.s], p = toScreen(s.x, s.y); x = p.x; y = p.y; r = Math.max(14, Math.min(7, Math.round(s.core * cam.s / 4)) * 4.5 + 8); name = s.name; }
    else if (o.kind === "planet") { const pl = planets[o.p], p = toScreen(pl.x, pl.y); x = p.x; y = p.y; r = Math.max(9, pl.r * cam.s + 6); name = pl.name; }
    else { const ch = chunks[o.s]; if (!ch) return; const p = toScreen(ch.x[o.i], ch.y[o.i]); x = p.x; y = p.y; r = 7; name = ch.t[o.i]; }
    brackets(x, y, r, strong ? 1 : 0.6, strong ? 7 : 4);
    if (strong) {
      const lx = x + r + 26, ly = y - r - 18;
      ctx.strokeStyle = ph(0.9); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + r, y - r); ctx.lineTo(x + r + 12, ly + 4); ctx.lineTo(lx - 4, ly + 4); ctx.stroke();
      label(name.toUpperCase(), lx, ly + 8, 12, 1, "left", true, true);
    }
  };
  if (nowPlaying) { const ch = chunks[nowPlaying.s]; if (ch) { const p = toScreen(ch.x[nowPlaying.i], ch.y[nowPlaying.i]); const t = performance.now() / 300; ctx.strokeStyle = ph(0.8); ctx.beginPath(); ctx.arc(p.x, p.y, 10 + (t % 6) * 3, 0, 7); ctx.globalAlpha = 1 - (t % 6) / 6; ctx.stroke(); ctx.globalAlpha = 1; dirty = true; } }
  if (hover && !same(hover, sel)) marker(hover, false);
  marker(sel, true);

  // показники
  const c = toWorld(W / 2, H / 2);
  const sg = (n: number) => (n < 0 ? "−" : "+") + pad(Math.abs(n).toFixed(1) as unknown as number, 6);
  $("readout").textContent = `X ${sg(c.x)}  Y ${sg(c.y)}  ×${cam.s.toFixed(2)}  СІТКА ${st >= 1 ? st : st.toFixed(1)}`;
  $("scaleName").textContent = cam.s < LOD_PLANETS ? "ГАЛАКТИКА" : cam.s < LOD_TRACKS ? "СИСТЕМИ" : cam.s < LOD_TITLES ? "ОРБІТИ" : "СИГНАЛИ";
}

function frame(now: number) {
  if (tween) {
    const k = Math.min(1, (now - tween.t0) / tween.dur), e = ease(k);
    cam.x = tween.fx + (tween.tx - tween.fx) * e; cam.y = tween.fy + (tween.ty - tween.fy) * e;
    const dist = Math.hypot(tween.tx - tween.fx, tween.ty - tween.fy) * Math.min(tween.fs, tween.ts);
    const bump = Math.min(2.2, dist / 500) * Math.sin(Math.PI * e);
    cam.s = Math.exp(Math.log(tween.fs) + (Math.log(tween.ts) - Math.log(tween.fs)) * e - bump);
    warpFx = reduce ? 0 : Math.min(1, bump);
    if (k >= 1) { tween = null; warpFx = 0; }
    dirty = true;
  }
  if (dirty) { dirty = false; draw(); }
  dosAnim?.(now);
  requestAnimationFrame(frame);
}

// ---------- Вибір під курсором ----------
function pick(sx: number, sy: number): Sel {
  let best: Sel = null, bd = Infinity;
  const consider = (o: Sel, x: number, y: number, thr: number) => { const p = toScreen(x, y), d = Math.hypot(p.x - sx, p.y - sy); if (d < thr && d < bd) { bd = d; best = o; } };
  if (cam.s >= LOD_TRACKS) {
    const w = toWorld(sx, sy), rad = 10 / cam.s;
    stars.forEach((st, s) => {
      const ch = chunks[s]; if (!ch || Math.hypot(w.x - st.x, w.y - st.y) > st.R + rad) return;
      for (let i = 0; i < ch.x.length; i++) if (Math.abs(ch.x[i] - w.x) < rad && Math.abs(ch.y[i] - w.y) < rad) consider({ kind: "track", s, i }, ch.x[i], ch.y[i], 10);
    });
  }
  if (cam.s >= LOD_PLANETS) planets.forEach((p, i) => consider({ kind: "planet", p: i }, p.x, p.y, Math.max(10, p.r * cam.s + 5)));
  stars.forEach((st, s) => consider({ kind: "star", s }, st.x, st.y, Math.max(18, st.core * cam.s + 8)));
  return best;
}
const local = (e: PointerEvent | WheelEvent) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
const ptrs = new Map<number, { x: number; y: number }>();
let dragged = 0, pinch0: { d: number; s: number } | null = null, hoverT = 0;
cv.addEventListener("pointerdown", (e) => {
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, local(e)); dragged = 0; cv.classList.add("drag");
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), s: cam.s }; }
});
cv.addEventListener("pointermove", (e) => {
  const L = local(e);
  if (!ptrs.has(e.pointerId)) {
    const now = performance.now(); if (now - hoverT < 40) return; hoverT = now;
    const h = pick(L.x, L.y); if (!same(h, hover)) { hover = h; cv.style.cursor = h ? "pointer" : ""; dirty = true; }
    return;
  }
  const prev = ptrs.get(e.pointerId)!, dx = L.x - prev.x, dy = L.y - prev.y; ptrs.set(e.pointerId, L);
  if (ptrs.size === 2 && pinch0) { const [a, b] = [...ptrs.values()]; cam.s = clampS(pinch0.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch0.d); dragged += 10; dirty = true; return; }
  dragged += Math.abs(dx) + Math.abs(dy);
  if (dragged > 4) { tween = null; cam.x -= dx / cam.s; cam.y -= dy / cam.s; dirty = true; }
});
const up = (e: PointerEvent) => {
  ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = null; cv.classList.remove("drag");
  if (e.type === "pointerup" && dragged < 5 && ptrs.size === 0) { const L = local(e), o = pick(L.x, L.y); if (o) select(o); }
};
cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
cv.addEventListener("wheel", (e) => {
  e.preventDefault(); const L = local(e), before = toWorld(L.x, L.y);
  cam.s = clampS(cam.s * Math.exp(-e.deltaY * 0.0015));
  const after = toWorld(L.x, L.y); cam.x += before.x - after.x; cam.y += before.y - after.y; tween = null; dirty = true;
}, { passive: false });

// ---------- Вибір ----------
function select(o: Sel, go = true, autoplay = false) {
  sel = o; dirty = true;
  if (o?.kind === "star") { const s = stars[o.s]; if (go) fly(s.x, s.y, Math.min(maxS, (Math.min(W, H) * 0.46) / s.R)); }
  else if (o?.kind === "planet") { const p = planets[o.p]; if (go) fly(p.x, p.y, Math.max(LOD_TRACKS * 1.6, Math.min(8, Math.min(W, H) * 0.16 / (p.r + 4 + 1.5 * Math.sqrt(p.t1 - p.t0))))); }
  else if (o?.kind === "track") { const ch = chunks[o.s]!; if (go) fly(ch.x[o.i], ch.y[o.i], Math.max(cam.s, LOD_TITLES * 1.3)); if (autoplay) playTrack(o); try { history.replaceState(null, "", `#t${o.s}-${o.i}`); } catch { /* */ } }
  render();
}

// ---------- Досьє ----------
let dosAnim: ((t: number) => void) | null = null;
const refs: Sel[] = [];
const R = (o: Sel) => { refs.push(o); return refs.length - 1; };
const neighbours = (s: number) => links.filter((l) => l[0] === s || l[1] === s).map((l) => ({ s: l[0] === s ? l[1] : l[0], w: l[2] })).sort((a, b) => b.w - a.w).slice(0, 6);
const row = (k: string, v: string) => `<div class="row"><span>${k}</span><span>${v}</span></div>`;
const meter = (k: string, frac: number, val: string, ref?: number) =>
  `<div class="bar-r${ref !== undefined ? " click" : ""}"${ref !== undefined ? ` data-r="${ref}"` : ""}><span>${esc(k)}</span><span class="meter"><i style="width:${Math.max(2, Math.min(100, frac * 100)).toFixed(1)}%"></i></span><span>${val}</span></div>`;
const trackItem = (s: number, i: number, n: number) => {
  const ch = chunks[s]!, now = nowPlaying && nowPlaying.s === s && nowPlaying.i === i;
  return `<button data-r="${R({ kind: "track", s, i })}" class="${now ? "now" : ""}"><span class="n">${pad(n, 3)}</span><span class="t">${esc(ch.an[ch.a[i]])} — ${esc(ch.t[i])}</span><span class="y">${ch.yr[i] || "----"}</span></button>`;
};
const trackCode = (s: number, i: number) => `TR-${pad(s, 2)}.${pad(i, 5)}`;

function scramble(el: Element | null, text: string) {
  if (!el) return;
  if (reduce) { el.textContent = text; return; }
  const chars = "▓▒░#/\\<>01*+=", t0 = performance.now();
  const tick = () => {
    const k = Math.min(1, (performance.now() - t0) / 420), n = Math.floor(text.length * k);
    el.textContent = text.slice(0, n) + Array.from(text.slice(n), (c) => (c === " " ? " " : chars[(Math.random() * chars.length) | 0])).join("");
    if (k < 1) requestAnimationFrame(tick);
  };
  tick();
}

function heroCanvas(): HTMLCanvasElement | null { return document.querySelector<HTMLCanvasElement>("#hero canvas"); }
function fitCanvas(c: HTMLCanvasElement) {
  const r = c.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  c.width = Math.max(1, r.width * dpr); c.height = Math.max(1, r.height * dpr);
  const g = c.getContext("2d")!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = false;
  return { g, w: r.width, h: r.height };
}
// Дизерована куля (упорядкований растр Байєра)
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
function drawSphere(g: CanvasRenderingContext2D, w: number, h: number, seedN: number, t: number) {
  g.fillStyle = BG; g.fillRect(0, 0, w, h);
  const px = 3, cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.36, rot = t / 4000 + seedN;
  const lx = Math.cos(rot) * 0.7, ly = -0.5, lz = Math.sqrt(Math.max(0, 1 - lx * lx - ly * ly));
  g.fillStyle = ph(1);
  for (let y = 0; y < h; y += px) for (let x = 0; x < w; x += px) {
    const nx = (x - cx) / r, ny = (y - cy) / r, d = nx * nx + ny * ny;
    if (d > 1) continue;
    const nz = Math.sqrt(1 - d);
    let l = Math.max(0, nx * lx + ny * ly + nz * lz);
    l *= 0.85 + 0.15 * Math.sin((ny * 6 + seedN) * 2 + Math.sin(nx * 3));
    if (l * 16 > BAYER[(y / px) & 3][(x / px) & 3] + 0.5) g.fillRect(x, y, px - 1, px - 1);
  }
  g.strokeStyle = ph(0.6); g.beginPath(); g.ellipse(cx, cy, r * 1.45, r * 0.32, -0.35, 0, Math.PI * 2); g.setLineDash([2, 3]); g.stroke(); g.setLineDash([]);
}
function drawRadar(g: CanvasRenderingContext2D, w: number, h: number, t: number) {
  g.fillStyle = BG; g.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.42;
  g.strokeStyle = ph(0.35); g.lineWidth = 1;
  for (const k of [1, 0.66, 0.33]) { g.beginPath(); g.arc(cx, cy, r * k, 0, 7); g.stroke(); }
  g.beginPath(); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.moveTo(cx, cy - r); g.lineTo(cx, cy + r); g.stroke();
  const a = (t / 1600) % (Math.PI * 2);
  for (let k = 0; k < 24; k++) { g.strokeStyle = ph(0.5 * (1 - k / 24)); g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a - k * 0.03) * r, cy + Math.sin(a - k * 0.03) * r); g.stroke(); }
  const s = Math.max(bounds.w, bounds.h) / 2 / r;
  stars.forEach((st) => { const x = cx + (st.x - bounds.x) / s, y = cy + (st.y - bounds.y) / s; g.fillStyle = ph(0.95); g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3); });
}
function drawWave(g: CanvasRenderingContext2D, w: number, h: number, t: number, seedN: number, live: boolean) {
  g.fillStyle = BG; g.fillRect(0, 0, w, h);
  g.strokeStyle = ph(0.12); g.lineWidth = 1; g.beginPath();
  for (let x = 0; x < w; x += 12) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); }
  for (let y = 0; y < h; y += 12) { g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); }
  g.stroke();
  const amp = live ? 0.36 : 0.08, f1 = 2 + (seedN % 5), f2 = 7 + (seedN % 11), sp = live ? t / 280 : t / 1400;
  g.strokeStyle = ph(1); g.lineWidth = 1.5; g.shadowColor = ph(0.8); g.shadowBlur = 6; g.beginPath();
  for (let x = 0; x <= w; x += 2) {
    const u = x / w * Math.PI * 2;
    const y = h / 2 + h * amp * (Math.sin(u * f1 + sp) * 0.7 + Math.sin(u * f2 - sp * 1.7) * 0.3) * (live ? 0.75 + 0.25 * Math.sin(sp * 0.3) : 1);
    x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
  }
  g.stroke(); g.shadowBlur = 0;
}

function render() {
  refs.length = 0;
  const d = $("detail"); let h = ""; const o = sel; let code = "", title = "";
  dosAnim = null;
  if (!o) {
    code = `СЕКТОР // ${map.meta.sector.toUpperCase()}`; title = `СЕКТОР ${map.meta.sector.toUpperCase()}`;
    const top = stars.map((s, i) => ({ s, i })).sort((a, b) => b.s.tracks - a.s.tracks);
    const mx = top[0]?.s.tracks || 1;
    h = `<div class="hero"><div class="frame" id="hero"><canvas></canvas></div>
        <div class="ident"><span class="code">ОБСЕРВАТОРІЯ // 01</span><h2 id="dosTitle"></h2><span class="stamp">${map.meta.sample ? "ТЕСТОВИЙ СИГНАЛ" : "ЖИВИЙ КАТАЛОГ"}</span></div></div>
      <div class="rows">${row("ЗІР / СТИЛІВ", fmt(stars.length))}${row("ПЛАНЕТ / ЛЕЙБЛІВ", fmt(planets.length))}${row("СУПУТНИКІВ / ТРЕКІВ", fmt(map.meta.tracks))}${row("РЕЛІЗІВ", fmt(map.meta.releases))}${row("ДЖЕРЕЛО", "DISCOGS · CC0")}</div>
      <p class="lede">Кожна <b>зоря</b> — стиль. На її орбітах — <b>планети-лейбли</b>, довкола них <b>супутники-треки</b>: старіші ближче до центру. Пунктир між зорями — як часто стилі звучать на одних релізах.</p>
      <div class="bars"><div class="ph-sub">ЗОРЯНІ СИСТЕМИ // ЗА КІЛЬКІСТЮ ТРЕКІВ</div>${top.map(({ s, i }) => meter(s.name.toUpperCase(), s.tracks / mx, fmt(s.tracks), R({ kind: "star", s: i }))).join("")}</div>`;
    dosAnim = (t) => { const c = heroCanvas(); if (c) { const f = (c as any)._f || ((c as any)._f = fitCanvas(c)); drawRadar(f.g, f.w, f.h, t); } };
  } else if (o.kind === "star") {
    const s = stars[o.s], pl = planetsByStar[o.s], nb = neighbours(o.s);
    code = `ЗОРЯ // ST-${pad(o.s, 2)}`; title = s.name.toUpperCase();
    h = `<div class="hero"><div class="frame" id="hero"><canvas></canvas></div>
        <div class="ident"><span class="code">ST-${pad(o.s, 2)} // СТИЛЬ</span><h2 id="dosTitle"></h2><span class="stamp">${(s.tracks * 100 / totalTracks).toFixed(1)}% СЕКТОРУ</span></div></div>
      <div class="rows">${row("РЕЛІЗІВ", fmt(s.n))}${row("ПЛАНЕТ / ЛЕЙБЛІВ", fmt(pl.length))}${row("ТРЕКІВ", fmt(s.tracks))}${row("РАДІУС СИСТЕМИ", fmt(Math.round(s.R)))}</div>
      ${nb.length ? `<div class="bars"><div class="ph-sub">ГРАВІТАЦІЙНІ ЗВ'ЯЗКИ</div>${nb.map((n) => meter(stars[n.s].name.toUpperCase(), Math.min(1, n.w * 3), `${Math.round(n.w * 100)}%`, R({ kind: "star", s: n.s }))).join("")}</div>` : ""}
      <div><div class="ph-sub">ПЛАНЕТИ НА ОРБІТІ</div><div class="list">${pl.slice(0, 40).map((p, k) => `<button data-r="${R({ kind: "planet", p })}"><span class="n">${pad(k + 1, 3)}</span><span class="t">${esc(planets[p].name)}</span><span class="y">${fmt(planets[p].n)} РЕЛ</span></button>`).join("")}</div>
      ${pl.length > 40 ? `<div class="more">…і ще ${fmt(pl.length - 40)}</div>` : ""}</div>`;
    const si = o.s;
    dosAnim = (t) => {
      const c = heroCanvas(); if (!c) return; const f = (c as any)._f || ((c as any)._f = fitCanvas(c));
      f.g.fillStyle = BG; f.g.fillRect(0, 0, f.w, f.h);
      const cell = Math.floor(f.w / 11), pulse = reduce ? 1 : 0.75 + 0.25 * Math.sin(t / 500);
      f.g.shadowColor = ph(0.9); f.g.shadowBlur = 10 * pulse; drawGlyph(f.g, si, f.w / 2, f.h / 2, cell, pulse); f.g.shadowBlur = 0;
    };
  } else if (o.kind === "planet") {
    const p = planets[o.p], s = stars[p.s], ch = chunks[p.s];
    if (!ch) loadChunk(p.s).then(() => { if (sel === o) render(); });
    const n = p.t1 - p.t0, shown = Math.min(n, 150);
    code = `ПЛАНЕТА // PL-${pad(o.p, 4)}`; title = p.name.toUpperCase();
    let hist = "";
    if (ch && n) {
      const ys = ch.yr.slice(p.t0, p.t1).filter(Boolean);
      if (ys.length) {
        const y0 = Math.min(...ys), y1 = Math.max(...ys), cnt = new Array(y1 - y0 + 1).fill(0);
        ys.forEach((y) => cnt[y - y0]++); const mx = Math.max(...cnt);
        hist = `<div class="hist"><div class="ph-sub">АКТИВНІСТЬ ПО РОКАХ</div><div class="cols">${cnt.map((c, k) => `<i style="height:${(c / mx * 100).toFixed(1)}%" title="${y0 + k}: ${c}"></i>`).join("")}</div><div class="axis"><span>${y0}</span><span>${Math.round((y0 + y1) / 2)}</span><span>${y1}</span></div></div>`;
      }
    }
    h = `<div class="hero"><div class="frame" id="hero"><canvas></canvas></div>
        <div class="ident"><span class="code">PL-${pad(o.p, 4)} // ЛЕЙБЛ</span><h2 id="dosTitle"></h2><span class="stamp">${p.yr[0] || "????"}–${p.yr[1] || "????"}</span></div></div>
      <div class="rows"><div class="row"><span>ОРБІТА</span><button class="link" data-r="${R({ kind: "star", s: p.s })}">${esc(s.name.toUpperCase())}</button></div>${row("РЕЛІЗІВ", fmt(p.n))}${row("ТРЕКІВ", fmt(n))}${row("МАСА", `${p.r.toFixed(1)} ОД`)}</div>
      ${hist}
      ${ch && n && !map.meta.sample ? `<button class="play" data-r="${R({ kind: "track", s: p.s, i: p.t0 })}" data-play="1">▶ ВІДТВОРИТИ ОРБІТУ</button>` : ""}
      <div><div class="ph-sub">СУПУТНИКИ</div><div class="list">${ch ? Array.from({ length: shown }, (_, k) => trackItem(p.s, p.t0 + k, k + 1)).join("") : `<p class="note">ЗАВАНТАЖЕННЯ…</p>`}</div>
      ${n > shown ? `<div class="more">…і ще ${fmt(n - shown)}. Наблизь планету на мапі.</div>` : ""}</div>`;
    const sd = hash(p.name) % 100;
    let drawn = false;
    dosAnim = (t) => {
      if (reduce && drawn) return;
      const c = heroCanvas(); if (!c) return; const f = (c as any)._f || ((c as any)._f = fitCanvas(c));
      if (((t / 66) | 0) === (c as any)._last) return; (c as any)._last = (t / 66) | 0;
      drawSphere(f.g, f.w, f.h, sd, t); drawn = true;
    };
  } else {
    const ch = chunks[o.s]!, s = stars[o.s], pi = ch.p[o.i], p = pi >= 0 ? planets[pi] : null, yt = ch.yt[o.i];
    const near = nearestTracks(o, 8);
    code = `ОБ'ЄКТ // ${trackCode(o.s, o.i)}`; title = ch.t[o.i].toUpperCase();
    h = `<div class="hero"><div class="frame thumb" id="hero"><img alt="" src="https://i.ytimg.com/vi/${esc(yt)}/default.jpg" referrerpolicy="no-referrer"><span class="raster"></span></div>
        <div class="ident"><span class="code">${trackCode(o.s, o.i)} // ТРЕК</span><h2 id="dosTitle"></h2><span class="by">${esc(ch.an[ch.a[o.i]])}</span></div></div>
      <div class="rows">${row("АРТИСТ", esc(ch.an[ch.a[o.i]]))}${row("РІК", ch.yr[o.i] ? String(ch.yr[o.i]) : "----")}
        <div class="row"><span>ЛЕЙБЛ</span>${p ? `<button class="link" data-r="${R({ kind: "planet", p: pi })}">${esc(p.name.toUpperCase())}</button>` : "<span>ПОЯС АСТЕРОЇДІВ</span>"}</div>
        <div class="row"><span>СТИЛЬ</span><button class="link" data-r="${R({ kind: "star", s: o.s })}">${esc(s.name.toUpperCase())}</button></div>
        ${row("КООРДИНАТИ", `${ch.x[o.i].toFixed(0)} / ${ch.y[o.i].toFixed(0)}`)}</div>
      <div class="scope-c"><canvas id="wave"></canvas></div>
      ${map.meta.sample ? `<p class="note">ТЕСТОВИЙ СИГНАЛ: відео не грають.</p>` : `<button class="play" data-r="${R(o)}" data-play="1">${nowPlaying && nowPlaying.s === o.s && nowPlaying.i === o.i ? "◉ У ЕФІРІ" : "▶ ВІДТВОРИТИ"}</button>`}
      <a class="out" href="https://www.youtube.com/watch?v=${esc(yt)}" target="_blank" rel="noopener">ВІДКРИТИ НА YOUTUBE ↗</a>
      ${near.length ? `<div><div class="ph-sub">НАЙБЛИЖЧІ СИГНАЛИ</div><div class="list">${near.map((r, k) => trackItem(r.s, r.i, k + 1)).join("")}</div></div>` : ""}`;
    const sd = hash(yt) % 97;
    dosAnim = (t) => {
      const c = document.getElementById("wave") as HTMLCanvasElement | null; if (!c) return;
      const f = (c as any)._f || ((c as any)._f = fitCanvas(c));
      const live = !!(nowPlaying && nowPlaying.s === o.s && nowPlaying.i === o.i && player.playing);
      if (reduce && (c as any)._done) return; (c as any)._done = true;
      drawWave(f.g, f.w, f.h, t, sd, live);
    };
  }
  d.innerHTML = h; d.scrollTop = 0;
  scramble($("dosId"), code); scramble(document.getElementById("dosTitle"), title);
  const img = d.querySelector<HTMLImageElement>(".thumb img");
  if (img) img.onerror = () => { img.remove(); const f = $("hero"); f.classList.remove("thumb"); f.insertAdjacentHTML("afterbegin", "<canvas></canvas>"); f.querySelector(".raster")?.remove(); const c = heroCanvas()!; const ff = fitCanvas(c); drawSphere(ff.g, ff.w, ff.h, 7, 0); };
}
$("detail").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-r]"); if (!b) return;
  const o = refs[+b.dataset.r!];
  if (o?.kind === "track") { select(o, true, !!b.dataset.play); return; }
  select(o);
});

function nearestTracks(ref: TrackRef, k: number, skip?: Set<string>): TrackRef[] {
  const ch = chunks[ref.s]; if (!ch) return [];
  const x = ch.x[ref.i], y = ch.y[ref.i], best: { i: number; d: number }[] = [];
  for (let i = 0; i < ch.x.length; i++) {
    if (i === ref.i || skip?.has(ch.yt[i])) continue;
    const d = (ch.x[i] - x) ** 2 + (ch.y[i] - y) ** 2;
    if (best.length < k || d < best[best.length - 1].d) { best.push({ i, d }); best.sort((a, b) => a.d - b.d); if (best.length > k) best.pop(); }
  }
  return best.map((b) => ({ s: ref.s, i: b.i }));
}

// ---------- Плеєр ----------
const played = new Set<string>();
const hist_: TrackRef[] = [];
const player = new Player("yt", {
  onEnded: () => { if ($<HTMLInputElement>("autopilot").checked) next(); },
  onError: (code) => {
    const m = $("pMsg"); m.hidden = false;
    m.textContent = code === 101 || code === 150 ? "! ВЛАСНИК ЗАБОРОНИВ ВБУДОВУВАННЯ. ПЕРЕХОДЖУ ДО СУСІДНЬОГО СИГНАЛУ…" : "! ВІДЕО НЕДОСТУПНЕ. ПЕРЕХОДЖУ ДО СУСІДНЬОГО СИГНАЛУ…";
    setTimeout(next, 1500);
  },
  onPlayingChange: (p) => { $("pToggle").textContent = p ? "❚❚" : "▶"; $("pToggle").setAttribute("aria-label", p ? "Пауза" : "Грати"); ticker(); },
});
function playTrack(ref: TrackRef) {
  if (map.meta.sample) return;
  const ch = chunks[ref.s]!;
  nowPlaying = ref; played.add(ch.yt[ref.i]);
  const last = hist_[hist_.length - 1];
  if (!last || last.i !== ref.i || last.s !== ref.s) hist_.push(ref);
  $("playerBox").hidden = false; $("pMsg").hidden = true;
  player.play(ch.yt[ref.i]); logTrack(ref); ticker(); dirty = true;
}
function next() { if (!nowPlaying) return; const n = nearestTracks(nowPlaying, 1, played)[0]; if (n) select({ kind: "track", ...n }, true, true); }
$("pNext").onclick = next;
$("pPrev").onclick = () => { if (hist_.length > 1) { hist_.pop(); const r = hist_.pop()!; select({ kind: "track", ...r }, true, true); } };
$("pToggle").onclick = () => player.toggle();
const tint = $<HTMLInputElement>("tint");
const applyTint = () => { $("videoWrap").classList.toggle("tinted", tint.checked); try { localStorage.setItem("kosmos-tint", tint.checked ? "1" : "0"); } catch { /* */ } };
try { if (localStorage.getItem("kosmos-tint") === "0") tint.checked = false; } catch { /* */ }
tint.onchange = applyTint; applyTint();

// ---------- Журнал ----------
const LOGKEY = "kosmos-log2";
let log: { k: string; t: number }[] = [];
try { log = JSON.parse(localStorage.getItem(LOGKEY) || "[]"); } catch { /* */ }
function logTrack(r: TrackRef) {
  const k = `${r.s}-${r.i}`;
  log = [{ k, t: Date.now() }, ...log.filter((x) => x.k !== k)].slice(0, 40);
  try { localStorage.setItem(LOGKEY, JSON.stringify(log)); } catch { /* */ }
  renderLog();
}
async function renderLog() {
  const el = $("log");
  const items = log.map((x) => ({ ...x, r: x.k.split("-").map(Number) })).filter(({ r }) => r[0] < stars.length);
  await Promise.all([...new Set(items.map(({ r }) => r[0]))].map(loadChunk));
  const ok = items.filter(({ r }) => chunks[r[0]] && r[1] < chunks[r[0]]!.yt.length);
  el.innerHTML = ok.length
    ? ok.map(({ r, t }) => { const d = new Date(t); return `<button data-s="${r[0]}" data-i="${r[1]}"><time>${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}</time><span>▸ ${esc(chunks[r[0]]!.t[r[1]])} · ${esc(stars[r[0]].name.toUpperCase())}</span></button>`; }).join("")
    : `<p class="note">ЗАПИСІВ НЕМАЄ. ПРОСЛУХАНІ СИГНАЛИ З'ЯВЛЯТЬСЯ ТУТ.</p>`;
}
$("log").addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-s]"); if (b) select({ kind: "track", s: +b.dataset.s!, i: +b.dataset.i! }, true, true); });

// ---------- Телеметрія ----------
function ticker() {
  let np = "ЕФІР: ТИША";
  if (nowPlaying && chunks[nowPlaying.s]) { const ch = chunks[nowPlaying.s]!; np = `ЕФІР: <b>${esc(ch.an[ch.a[nowPlaying.i]])} — ${esc(ch.t[nowPlaying.i])}</b>${player.playing ? "" : " [ПАУЗА]"}`; }
  const parts = [np, `ЗІР <b>${stars.length}</b>`, `ПЛАНЕТ <b>${fmt(planets.length)}</b>`, `СУПУТНИКІВ <b>${fmt(map.meta.tracks)}</b>`, `РЕЛІЗІВ <b>${fmt(map.meta.releases)}</b>`,
    `НАЙБІЛЬША СИСТЕМА <b>${esc(stars.slice().sort((a, b) => b.tracks - a.tracks)[0]?.name.toUpperCase() || "—")}</b>`, `ЗВ'ЯЗКІВ <b>${links.length}</b>`, `ПРОСЛУХАНО <b>${log.length}</b>`, `ДЖЕРЕЛО <b>DISCOGS CC0</b>`];
  const one = parts.map((p) => `<span>${p}</span>`).join("");
  $("ticker").innerHTML = one + one;
}
setInterval(() => { const d = new Date(); $("clock").textContent = `${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(d.getSeconds(), 2)}`; }, 1000);

// ---------- Кнопки й клавіші ----------
const goHome = () => { select(null); fly(bounds.x, bounds.y, homeScale()); };
const warp = async () => {
  let r = Math.random() * totalTracks, s = 0;
  while (s < stars.length - 1 && r > stars[s].tracks) { r -= stars[s].tracks; s++; }
  const ch = await loadChunk(s);
  select({ kind: "track", s, i: Math.floor(Math.random() * ch.yt.length) }, true, !!nowPlaying);
};
$("home").onclick = goHome; $("warp").onclick = warp;
$("zin").onclick = () => { cam.s = clampS(cam.s * 1.5); dirty = true; };
$("zout").onclick = () => { cam.s = clampS(cam.s / 1.5); dirty = true; };
addEventListener("keydown", (e) => {
  const typing = (e.target as HTMLElement).tagName === "INPUT";
  if (e.key === "Escape") { if (typing) { q.blur(); res.hidden = true; return; } if (sel?.kind === "track") select({ kind: "star", s: sel.s }); else if (sel) select(null); return; }
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === "/") { e.preventDefault(); q.focus(); }
  else if (k === "w" || k === "ц") warp();
  else if (k === "h" || k === "р") goHome();
  else if (k === "n" || k === "т") next();
  else if (k === " ") { e.preventDefault(); player.toggle(); }
  else if (k === "+" || k === "=") { cam.s = clampS(cam.s * 1.5); dirty = true; }
  else if (k === "-") { cam.s = clampS(cam.s / 1.5); dirty = true; }
});

// ---------- Пошук ----------
const q = $<HTMLInputElement>("q"), res = $("results");
let artists: [string, number, number][] | null = null;
q.addEventListener("focus", () => { if (!artists) fetch("./data/artists.json").then((r) => r.json()).then((a) => { artists = a; }); }, { once: true });
let hits: { label: string; kind: string; go: () => void }[] = [], cur = 0;
q.addEventListener("input", () => {
  const s = q.value.trim().toLowerCase();
  if (s.length < 2) { res.hidden = true; return; }
  hits = [];
  stars.forEach((st, i) => { if (st.name.toLowerCase().includes(s)) hits.push({ label: st.name, kind: "ЗОРЯ", go: () => select({ kind: "star", s: i }) }); });
  for (let i = 0; i < planets.length && hits.length < 14; i++) if (planets[i].name.toLowerCase().includes(s)) hits.push({ label: planets[i].name, kind: "ПЛАНЕТА", go: () => select({ kind: "planet", p: i }) });
  if (artists) for (let i = 0; i < artists.length && hits.length < 24; i++) {
    const [name, st, ti] = artists[i];
    if (name.toLowerCase().includes(s)) hits.push({ label: name, kind: "АРТИСТ", go: () => loadChunk(st).then(() => select({ kind: "track", s: st, i: ti })) });
  }
  cur = 0; res.hidden = false;
  res.innerHTML = hits.length ? hits.map((h, i) => `<button data-h="${i}" class="${i === 0 ? "on" : ""}"><span class="k">${h.kind}</span><span>${esc(h.label)}</span></button>`).join("") : `<p class="note" style="padding:8px 10px">НІЧОГО НЕ ЗНАЙДЕНО В ЦЬОМУ СЕКТОРІ.</p>`;
});
q.addEventListener("keydown", (e) => {
  if (res.hidden || !hits.length) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); cur = (cur + (e.key === "ArrowDown" ? 1 : -1) + hits.length) % hits.length; [...res.children].forEach((b, i) => b.classList.toggle("on", i === cur)); }
  if (e.key === "Enter") choose(cur);
});
res.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-h]"); if (b) choose(+b.dataset.h!); });
function choose(i: number) { hits[i]?.go(); res.hidden = true; q.value = ""; q.blur(); }

// ---------- Старт ----------
let savedPh = "violet";
try { savedPh = localStorage.getItem("kosmos-ph") || "violet"; } catch { /* */ }
setPhosphor(["violet", "green", "amber"].includes(savedPh) ? savedPh : "violet");
$("sector").textContent = map.meta.sector.toUpperCase();
if (map.meta.sample) { const b = $("sampleBanner"); b.hidden = false; b.onclick = () => { b.hidden = true; }; }
cam.s = homeScale();
render(); renderLog(); ticker(); requestAnimationFrame(frame);
document.fonts?.ready.then(() => { dirty = true; });
const m = location.hash.match(/^#t(\d+)-(\d+)$/);
if (m && +m[1] < stars.length) loadChunk(+m[1]).then((ch) => { if (+m[2] < ch.yt.length) select({ kind: "track", s: +m[1], i: +m[2] }); });
