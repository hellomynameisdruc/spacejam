import "./style.css";
import { Player } from "./player";

// ---------- Типи даних (їх готує pipeline/build_map.py) ----------
type Star = { name: string; x: number; y: number; core: number; R: number; n: number; tracks: number; color: string };
type Planet = { name: string; s: number; x: number; y: number; r: number; n: number; yr: [number, number]; t0: number; t1: number };
type MapData = { meta: { sector: string; sample: boolean; releases: number; tracks: number }; stars: Star[]; links: [number, number, number][]; planets: Planet[] };
type Chunk = { yt: string[]; t: string[]; a: number[]; yr: number[]; p: number[]; x: number[]; y: number[]; an: string[] };
type TrackRef = { s: number; i: number };
type Sel = { kind: "star"; s: number } | { kind: "planet"; p: number } | { kind: "track"; s: number; i: number } | null;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmt = (n: number) => n.toLocaleString("uk-UA");

const map: MapData = await fetch("./data/map.json").then((r) => r.json());
const { stars, planets, links } = map;
const planetsByStar: number[][] = stars.map(() => []);
planets.forEach((p, i) => planetsByStar[p.s].push(i));
planetsByStar.forEach((l) => l.sort((a, b) => planets[b].n - planets[a].n));

// ---------- Ліниве завантаження треків по зорях ----------
const chunks: (Chunk | null)[] = stars.map(() => null);
const loading = new Map<number, Promise<Chunk>>();
function loadChunk(s: number): Promise<Chunk> {
  if (chunks[s]) return Promise.resolve(chunks[s]!);
  if (!loading.has(s)) {
    loading.set(s, fetch(`./data/tracks/${s}.json`).then((r) => r.json()).then((c: Chunk) => { chunks[s] = c; dirty = true; return c; }));
  }
  return loading.get(s)!;
}

// ---------- Канвас і камера ----------
const cv = $<HTMLCanvasElement>("sky");
const ctx = cv.getContext("2d")!;
let W = 0, H = 0, dirty = true;
function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  W = innerWidth; H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  dirty = true;
}
addEventListener("resize", resize); resize();
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobile = () => W <= 760;
const viewCenter = () => (mobile() ? { x: W / 2, y: H * 0.31 } : { x: (W - 376) / 2, y: H / 2 });

const bounds = (() => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of stars) { x0 = Math.min(x0, s.x - s.R); y0 = Math.min(y0, s.y - s.R); x1 = Math.max(x1, s.x + s.R); y1 = Math.max(y1, s.y + s.R); }
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
})();
const homeScale = () => {
  const vw = mobile() ? W : W - 392, vh = mobile() ? H * 0.38 : H;
  return Math.min(vw / bounds.w, vh / bounds.h) * 0.92;
};
const cam = { x: bounds.x, y: bounds.y, s: 1 };
cam.s = homeScale();
const minS = () => homeScale() * 0.5, maxS = 14;
const clampS = (s: number) => Math.max(minS(), Math.min(maxS, s));
const toScreen = (x: number, y: number) => { const c = viewCenter(); return { x: (x - cam.x) * cam.s + c.x, y: (y - cam.y) * cam.s + c.y }; };
const toWorld = (x: number, y: number) => { const c = viewCenter(); return { x: (x - c.x) / cam.s + cam.x, y: (y - c.y) / cam.s + cam.y }; };
const worldView = () => { const a = toWorld(0, 0), b = toWorld(W, H); return { x0: a.x, y0: a.y, x1: b.x, y1: b.y }; };

let tween: { fx: number; fy: number; fs: number; tx: number; ty: number; ts: number; t0: number; dur: number } | null = null;
let warpFx = 0;
function fly(tx: number, ty: number, ts: number, dur = 1400) {
  tween = { fx: cam.x, fy: cam.y, fs: cam.s, tx, ty, ts: clampS(ts), t0: performance.now(), dur: reduce ? 1 : dur };
}
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Рівні деталізації
const LOD_PLANETS = 0.12, LOD_TRACKS = 0.7, LOD_TITLES = 3.2;

// Фонові зорі
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const sky = Array.from({ length: 600 }, () => ({ x: rnd(), y: rnd(), d: 0.2 + rnd() * 0.6, b: 0.25 + rnd() * 0.75 }));

let sel: Sel = null;
let hover: Sel = null;
let nowPlaying: TrackRef | null = null;

function glow(x: number, y: number, r: number, color: string, a: number) {
  if (r < 0.5) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = a; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
}
const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
function label(txt: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = "center", force = false) {
  ctx.font = font; const w = ctx.measureText(txt).width, h = 14;
  const x0 = align === "center" ? x - w / 2 : x, r = { x0: x0 - 2, y0: y - h, x1: x0 + w + 2, y1: y + 4 };
  if (!force && placed.some((p) => p.x0 < r.x1 && p.x1 > r.x0 && p.y0 < r.y1 && p.y1 > r.y0)) return;
  placed.push(r);
  ctx.textAlign = align; ctx.fillStyle = color; ctx.fillText(txt, x, y);
}
const isSel = (k: Sel, s: Sel) => !!k && !!s && JSON.stringify(k) === JSON.stringify(s);

function draw() {
  placed.length = 0;
  let pendingTitles: { x: number; y: number; t: string }[] = [];
  ctx.fillStyle = "#080a17"; ctx.fillRect(0, 0, W, H);
  const v = worldView(), c = viewCenter();
  const inView = (x: number, y: number, r: number) => x + r > v.x0 && x - r < v.x1 && y + r > v.y0 && y - r < v.y1;

  // фон
  ctx.fillStyle = "#d8daf5";
  for (const s of sky) {
    let x = (s.x * W * 3 - cam.x * cam.s * s.d * 0.05) % W, y = (s.y * H * 3 - cam.y * cam.s * s.d * 0.05) % H;
    if (x < 0) x += W; if (y < 0) y += H;
    ctx.globalAlpha = s.b * 0.6;
    if (warpFx > 0.05) {
      ctx.strokeStyle = "#d8daf5"; ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + (x - c.x) * warpFx * 0.3, y + (y - c.y) * warpFx * 0.3); ctx.stroke();
    } else ctx.fillRect(x, y, 1.2, 1.2);
  }
  ctx.globalAlpha = 1;

  // туманності
  for (const s of stars) if (inView(s.x, s.y, s.R)) { const p = toScreen(s.x, s.y); glow(p.x, p.y, s.R * cam.s * 1.15, s.color, 0.09); }

  // гравітаційні зв'язки
  ctx.setLineDash([2, 6]);
  for (const [a, b, w] of links) {
    const A = stars[a], B = stars[b], pa = toScreen(A.x, A.y), pb = toScreen(B.x, B.y);
    const g = ctx.createLinearGradient(pa.x, pa.y, pb.x, pb.y); g.addColorStop(0, A.color); g.addColorStop(1, B.color);
    ctx.strokeStyle = g; ctx.globalAlpha = Math.min(0.5, 0.06 + w * 0.9); ctx.lineWidth = 0.6 + Math.min(3, w * 8);
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
  }
  ctx.setLineDash([]); ctx.globalAlpha = 1;

  // треки
  if (cam.s >= LOD_TRACKS) {
    const rr = Math.max(0.9, Math.min(3, 1.0 * cam.s));
    const titles: { x: number; y: number; t: string }[] = [];
    stars.forEach((st, s) => {
      if (!inView(st.x, st.y, st.R)) return;
      const ch = chunks[s];
      if (!ch) { loadChunk(s); return; }
      ctx.fillStyle = "#f2f0ff"; ctx.globalAlpha = 0.8; ctx.beginPath();
      for (let i = 0; i < ch.x.length; i++) {
        const x = ch.x[i], y = ch.y[i];
        if (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1) continue;
        const p = toScreen(x, y);
        ctx.moveTo(p.x + rr, p.y); ctx.arc(p.x, p.y, rr, 0, 7);
        if (cam.s >= LOD_TITLES && titles.length < 260) titles.push({ x: p.x, y: p.y, t: ch.t[i] });
      }
      ctx.fill(); ctx.globalAlpha = 1;
    });
    pendingTitles = titles;
  } else {
    // здалеку: тільки ореоли з треків довкола планет
    for (const p of planets) if (inView(p.x, p.y, p.r * 4)) { const q = toScreen(p.x, p.y); glow(q.x, q.y, Math.max(2, (p.r + 4 + 1.5 * Math.sqrt(p.t1 - p.t0)) * cam.s), stars[p.s].color, 0.22); }
  }

  // виділений / граючий трек
  for (const ref of [nowPlaying, sel?.kind === "track" ? sel : null, hover?.kind === "track" ? hover : null]) {
    if (!ref) continue; const ch = chunks[ref.s]; if (!ch) continue;
    const p = toScreen(ch.x[ref.i], ch.y[ref.i]);
    ctx.fillStyle = "#ffb547"; ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, 7); ctx.fill();
    ctx.strokeStyle = "#ffb547"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, 7); ctx.stroke();
    label(ch.t[ref.i], p.x + 13, p.y + 4, "700 12px Manrope, system-ui, sans-serif", "#ffb547", "left", true);
  }
  for (const t of pendingTitles) label(t.t, t.x + 6, t.y + 4, "500 11px Manrope, system-ui, sans-serif", "rgba(235,233,245,.72)", "left");

  // планети
  if (cam.s >= LOD_PLANETS) {
    const order = planets.map((_, i) => i).filter((i) => inView(planets[i].x, planets[i].y, planets[i].r * 3));
    for (const i of order) {
      const pl = planets[i], p = toScreen(pl.x, pl.y), r = Math.max(1.5, pl.r * cam.s), col = stars[pl.s].color;
      if (r > 3) glow(p.x, p.y, r * 2.6, col, 0.35);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
      if (r > 3) { ctx.fillStyle = "rgba(8,10,23,.45)"; ctx.beginPath(); ctx.arc(p.x + r * 0.35, p.y + r * 0.3, r * 0.8, 0, 7); ctx.fill(); }
      const on = isSel({ kind: "planet", p: i }, sel) || isSel({ kind: "planet", p: i }, hover);
      if (on) { ctx.strokeStyle = "#ffb547"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, r + 5, 0, 7); ctx.stroke(); }
    }
    // підписи: від найбільших до менших, без накладань
    const bySize = order.slice().sort((a, b) => planets[b].n - planets[a].n);
    for (const i of bySize) {
      const pl = planets[i], r = pl.r * cam.s;
      const on = isSel({ kind: "planet", p: i }, sel) || isSel({ kind: "planet", p: i }, hover);
      if (!on && r < 4) continue;
      const p = toScreen(pl.x, pl.y);
      label(pl.name, p.x, p.y + Math.max(2, r) + 14, "500 11px 'IBM Plex Mono', monospace", on ? "#ffb547" : "rgba(235,233,245,.78)", "center", on);
    }
  }

  // зорі
  stars.forEach((st, s) => {
    if (!inView(st.x, st.y, st.core * 4 + 200 / cam.s)) return;
    const p = toScreen(st.x, st.y), r = Math.max(5, st.core * cam.s);
    const on = isSel({ kind: "star", s }, sel) || isSel({ kind: "star", s }, hover);
    glow(p.x, p.y, r * 4, st.color, 0.5);
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.5, 0, 7); ctx.fill();
    glow(p.x, p.y, r, st.color, 0.9);
    if (on) { ctx.strokeStyle = "#ffb547"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, r + 8, 0, 7); ctx.stroke(); }
  });
  stars.slice().map((st, s) => ({ st, s })).sort((a, b) => b.st.n - a.st.n).forEach(({ st, s }) => {
    if (!inView(st.x, st.y, 200 / cam.s)) return;
    const p = toScreen(st.x, st.y), r = Math.max(5, st.core * cam.s);
    const on = isSel({ kind: "star", s }, sel) || isSel({ kind: "star", s }, hover);
    const fs = Math.round(Math.max(10, Math.min(mobile() ? 14 : 22, 9 + Math.log2(st.n) * 0.9)));
    label(st.name.toUpperCase(), p.x, p.y - r - 10, `600 ${fs}px Unbounded, Manrope, sans-serif`, on ? "#ffb547" : st.color, "center", on);
  });

  $("scale").textContent = cam.s < LOD_PLANETS ? "масштаб: галактика стилів" : cam.s < LOD_TRACKS ? "масштаб: системи лейблів" : cam.s < LOD_TITLES ? "масштаб: орбіти треків" : "масштаб: назви треків";
}

function frame(now: number) {
  if (tween) {
    const k = Math.min(1, (now - tween.t0) / tween.dur), e = ease(k);
    cam.x = tween.fx + (tween.tx - tween.fx) * e;
    cam.y = tween.fy + (tween.ty - tween.fy) * e;
    const dist = Math.hypot(tween.tx - tween.fx, tween.ty - tween.fy) * Math.min(tween.fs, tween.ts);
    const bump = Math.min(2.2, dist / 500) * Math.sin(Math.PI * e);
    cam.s = Math.exp(Math.log(tween.fs) + (Math.log(tween.ts) - Math.log(tween.fs)) * e - bump);
    warpFx = reduce ? 0 : Math.min(1, bump);
    if (k >= 1) { tween = null; warpFx = 0; }
    dirty = true;
  }
  if (dirty) { dirty = false; draw(); }
  requestAnimationFrame(frame);
}

// ---------- Вибір об'єкта під курсором ----------
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
  stars.forEach((st, s) => consider({ kind: "star", s }, st.x, st.y, Math.max(16, st.core * cam.s + 8)));
  return best;
}

const ptrs = new Map<number, { x: number; y: number }>();
let dragged = 0, pinch0: { d: number; s: number } | null = null;
cv.addEventListener("pointerdown", (e) => {
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); dragged = 0; cv.classList.add("drag");
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), s: cam.s }; }
});
let hoverT = 0;
cv.addEventListener("pointermove", (e) => {
  if (!ptrs.has(e.pointerId)) {
    const now = performance.now(); if (now - hoverT < 40) return; hoverT = now;
    const h = pick(e.clientX, e.clientY);
    if (!isSel(h, hover)) { hover = h; cv.style.cursor = h ? "pointer" : ""; dirty = true; }
    return;
  }
  const prev = ptrs.get(e.pointerId)!, dx = e.clientX - prev.x, dy = e.clientY - prev.y;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2 && pinch0) { const [a, b] = [...ptrs.values()]; cam.s = clampS(pinch0.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch0.d); dragged += 10; dirty = true; return; }
  dragged += Math.abs(dx) + Math.abs(dy);
  if (dragged > 4) { tween = null; cam.x -= dx / cam.s; cam.y -= dy / cam.s; dirty = true; }
});
const up = (e: PointerEvent) => {
  ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = null; cv.classList.remove("drag");
  if (e.type === "pointerup" && dragged < 5 && ptrs.size === 0) { const o = pick(e.clientX, e.clientY); if (o) select(o); }
};
cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
cv.addEventListener("wheel", (e) => {
  e.preventDefault();
  const before = toWorld(e.clientX, e.clientY);
  cam.s = clampS(cam.s * Math.exp(-e.deltaY * 0.0015));
  const after = toWorld(e.clientX, e.clientY);
  cam.x += before.x - after.x; cam.y += before.y - after.y; tween = null; dirty = true;
}, { passive: false });

// ---------- Вибір і панель ----------
function select(o: Sel, go = true, autoplay = false) {
  sel = o; dirty = true;
  if (!o) { render(); return; }
  if (o.kind === "star") { const s = stars[o.s]; if (go) fly(s.x, s.y, Math.min(maxS, (Math.min(W, H) * 0.42) / s.R)); }
  else if (o.kind === "planet") { const p = planets[o.p]; if (go) fly(p.x, p.y, Math.max(LOD_TRACKS * 1.6, Math.min(8, 60 / (p.r + 4 + 1.5 * Math.sqrt(p.t1 - p.t0))))); }
  else { const ch = chunks[o.s]!; if (go) fly(ch.x[o.i], ch.y[o.i], Math.max(cam.s, LOD_TITLES * 1.3)); if (autoplay) playTrack(o); setHash(o); }
  render();
}
function setHash(o: TrackRef) { try { history.replaceState(null, "", `#t${o.s}-${o.i}`); } catch { /* */ } }

const refs: Sel[] = [];
const R = (o: Sel) => { refs.push(o); return refs.length - 1; };
const trackRow = (s: number, i: number) => {
  const ch = chunks[s]!, now = nowPlaying && nowPlaying.s === s && nowPlaying.i === i;
  return `<button data-r="${R({ kind: "track", s, i })}" class="${now ? "now" : ""}"><span class="t">${esc(ch.an[ch.a[i]])} — ${esc(ch.t[i])}</span><span class="y">${ch.yr[i] || "—"}</span></button>`;
};
const neighbours = (s: number) => links.filter((l) => l[0] === s || l[1] === s).map((l) => ({ s: l[0] === s ? l[1] : l[0], w: l[2] })).sort((a, b) => b.w - a.w).slice(0, 8);

function render() {
  refs.length = 0;
  const d = $("detail"); let h = "";
  const o = sel;
  if (!o) {
    h = `<div class="eyebrow">Сектор ${esc(map.meta.sector)}</div>
      <h2>Кожна зоря тут — стиль<small>Планети на її орбітах — лейбли, точки довкола планет — треки</small></h2>
      <div class="stats"><span><b>${stars.length}</b>стилів</span><span><b>${fmt(planets.length)}</b>лейблів</span><span><b>${fmt(map.meta.tracks)}</b>треків</span></div>
      <p>Стилі, що часто трапляються в одних релізах, стоять поруч і з'єднані пунктиром. Довкола планети треки розкладені спіраллю: старіші ближче до центру. Релізи без лейбла й дрібних лейблів утворюють пояс астероїдів на краю системи.</p>
      <div><p class="listh">Зоряні системи</p><div class="rows">${stars.map((s, i) => ({ s, i })).sort((a, b) => b.s.tracks - a.s.tracks).map(({ s, i }) => `<button data-r="${R({ kind: "star", s: i })}"><span class="t"><span class="dot" style="background:${s.color};margin-right:8px"></span>${esc(s.name)}</span><span class="y">${fmt(s.tracks)}</span></button>`).join("")}</div></div>
      <p class="note">Дані: Discogs (CC0). Відтворення через офіційний плеєр YouTube.</p>`;
  } else if (o.kind === "star") {
    const s = stars[o.s], pl = planetsByStar[o.s];
    h = `<div class="eyebrow"><span class="dot" style="background:${s.color}"></span>Зоря · стиль</div>
      <h2>${esc(s.name)}</h2>
      <div class="stats"><span><b>${fmt(s.n)}</b>релізів</span><span><b>${fmt(pl.length)}</b>лейблів</span><span><b>${fmt(s.tracks)}</b>треків</span></div>
      <div><p class="listh">Найбільші планети-лейбли</p><div class="rows">${pl.slice(0, 25).map((p) => `<button data-r="${R({ kind: "planet", p })}"><span class="t">${esc(planets[p].name)}</span><span class="y">${fmt(planets[p].n)} рел.</span></button>`).join("")}</div></div>
      <div><p class="listh">Сусідні системи</p><div class="rows">${neighbours(o.s).map((n) => `<button data-r="${R({ kind: "star", s: n.s })}"><span class="t">${esc(stars[n.s].name)}</span><span class="y">зв'язок ${Math.round(n.w * 100)}%</span></button>`).join("")}</div></div>`;
  } else if (o.kind === "planet") {
    const p = planets[o.p], s = stars[p.s], ch = chunks[p.s];
    if (!ch) loadChunk(p.s).then(() => { if (sel === o) render(); });
    const n = p.t1 - p.t0, shown = Math.min(n, 200);
    h = `<div class="eyebrow"><span class="dot" style="background:${s.color}"></span>Планета · лейбл</div>
      <h2>${esc(p.name)}<small>на орбіті <button class="linkish" data-r="${R({ kind: "star", s: p.s })}">${esc(s.name)}</button></small></h2>
      <dl class="meta"><dt>Релізів</dt><dd>${fmt(p.n)}</dd><dt>Роки</dt><dd>${p.yr[0] || "?"}–${p.yr[1] || "?"}</dd><dt>Треків</dt><dd>${fmt(n)}</dd></dl>
      ${ch && n ? `<button class="play" data-r="${R({ kind: "track", s: p.s, i: p.t0 })}" data-play="1">▶ Слухати з початку орбіти</button>` : ""}
      <div><p class="listh">Треки на орбіті</p><div class="rows">${ch ? Array.from({ length: shown }, (_, k) => trackRow(p.s, p.t0 + k)).join("") : `<p class="note">Завантажую…</p>`}</div>
      ${n > shown ? `<p class="note">…і ще ${fmt(n - shown)}. Наблизь планету на мапі, щоб побачити всі.</p>` : ""}</div>`;
  } else {
    const ch = chunks[o.s]!, s = stars[o.s], pi = ch.p[o.i], p = pi >= 0 ? planets[pi] : null;
    const near = nearestTracks(o, 6);
    h = `<div class="eyebrow"><span class="dot" style="background:${s.color}"></span>Трек</div>
      <h2>${esc(ch.t[o.i])}<small>${esc(ch.an[ch.a[o.i]])}</small></h2>
      <dl class="meta"><dt>Рік</dt><dd>${ch.yr[o.i] || "невідомо"}</dd>
        <dt>Лейбл</dt><dd>${p ? `<button class="linkish" data-r="${R({ kind: "planet", p: pi })}">${esc(p.name)}</button>` : "пояс астероїдів"}</dd>
        <dt>Стиль</dt><dd><button class="linkish" data-r="${R({ kind: "star", s: o.s })}">${esc(s.name)}</button></dd></dl>
      ${map.meta.sample ? `<p class="note">У тестових даних відео не грають.</p>` : `<button class="play" data-r="${R(o)}" data-play="1">▶ Слухати</button>`}
      <a class="note" href="https://www.youtube.com/watch?v=${esc(ch.yt[o.i])}" target="_blank" rel="noopener">Відкрити на YouTube ↗</a>
      ${near.length ? `<div><p class="listh">Найближче на мапі</p><div class="rows">${near.map((r) => trackRow(r.s, r.i)).join("")}</div></div>` : ""}`;
  }
  d.innerHTML = h; d.scrollTop = 0;
}
$("detail").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-r]"); if (!b) return;
  const o = refs[+b.dataset.r!];
  if (o?.kind === "track") { select(o, true, !!b.dataset.play); return; }
  select(o);
});

// Найближчі треки в просторі (з тієї ж зорі)
function nearestTracks(ref: TrackRef, k: number, skip?: Set<string>): TrackRef[] {
  const ch = chunks[ref.s]; if (!ch) return [];
  const x = ch.x[ref.i], y = ch.y[ref.i];
  const best: { i: number; d: number }[] = [];
  for (let i = 0; i < ch.x.length; i++) {
    if (i === ref.i || skip?.has(ch.yt[i])) continue;
    const d = (ch.x[i] - x) ** 2 + (ch.y[i] - y) ** 2;
    if (best.length < k || d < best[best.length - 1].d) { best.push({ i, d }); best.sort((a, b) => a.d - b.d); if (best.length > k) best.pop(); }
  }
  return best.map((b) => ({ s: ref.s, i: b.i }));
}

// ---------- Плеєр ----------
const played = new Set<string>();
const history_: TrackRef[] = [];
const player = new Player("yt", {
  onEnded: () => { if ($<HTMLInputElement>("autopilot").checked) next(); },
  onError: (code) => {
    const m = $("pMsg"); m.hidden = false;
    m.textContent = code === 101 || code === 150 ? "Власник відео заборонив вбудовування. Перескакую на сусідній трек…" : "Відео недоступне. Перескакую на сусідній трек…";
    setTimeout(next, 1500);
  },
  onPlayingChange: (p) => { $("pToggle").textContent = p ? "⏸" : "▶"; $("pToggle").setAttribute("aria-label", p ? "Пауза" : "Грати"); },
});
function playTrack(ref: TrackRef) {
  if (map.meta.sample) return;
  const ch = chunks[ref.s]!;
  nowPlaying = ref; played.add(ch.yt[ref.i]);
  if (!history_.length || history_[history_.length - 1].i !== ref.i || history_[history_.length - 1].s !== ref.s) history_.push(ref);
  $("playerBox").hidden = false; $("pMsg").hidden = true;
  player.play(ch.yt[ref.i]);
  logTrack(ref); dirty = true;
}
function next() {
  if (!nowPlaying) return;
  const n = nearestTracks(nowPlaying, 1, played)[0];
  if (n) select({ kind: "track", ...n }, true, true);
}
$("pNext").onclick = next;
$("pPrev").onclick = () => { if (history_.length > 1) { history_.pop(); const r = history_.pop()!; select({ kind: "track", ...r }, true, true); } };
$("pToggle").onclick = () => player.toggle();

// ---------- Бортовий журнал ----------
const LOGKEY = "kosmos-log";
let log: string[] = [];
try { log = JSON.parse(localStorage.getItem(LOGKEY) || "[]"); } catch { /* */ }
function logTrack(r: TrackRef) {
  const k = `${r.s}-${r.i}`;
  log = [k, ...log.filter((x) => x !== k)].slice(0, 30);
  try { localStorage.setItem(LOGKEY, JSON.stringify(log)); } catch { /* */ }
  renderLog();
}
async function renderLog() {
  const el = $("log");
  const items = log.map((k) => k.split("-").map(Number)).filter(([s]) => s < stars.length);
  await Promise.all([...new Set(items.map(([s]) => s))].map(loadChunk));
  el.innerHTML = items.length
    ? items.filter(([s, i]) => chunks[s] && i < chunks[s]!.yt.length).map(([s, i]) => `<button data-s="${s}" data-i="${i}"><span class="t">${esc(chunks[s]!.t[i])}</span><span class="y">${esc(stars[s].name)}</span></button>`).join("")
    : `<p class="note">Треки, які ти слухав, з'являться тут.</p>`;
}
$("log").addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-s]"); if (b) select({ kind: "track", s: +b.dataset.s!, i: +b.dataset.i! }, true, true); });

// ---------- Кнопки ----------
$("home").onclick = () => { select(null); fly(bounds.x, bounds.y, homeScale()); };
$("zin").onclick = () => { cam.s = clampS(cam.s * 1.5); dirty = true; };
$("zout").onclick = () => { cam.s = clampS(cam.s / 1.5); dirty = true; };
$("warp").onclick = async () => {
  const total = stars.reduce((a, s) => a + s.tracks, 0);
  let r = Math.random() * total, s = 0;
  while (s < stars.length - 1 && r > stars[s].tracks) { r -= stars[s].tracks; s++; }
  const ch = await loadChunk(s);
  select({ kind: "track", s, i: Math.floor(Math.random() * ch.yt.length) }, true, !!nowPlaying);
};

// ---------- Пошук ----------
const q = $<HTMLInputElement>("q"), res = $("results");
let artists: [string, number, number][] | null = null;
q.addEventListener("focus", () => { if (!artists) fetch("./data/artists.json").then((r) => r.json()).then((a) => { artists = a; }); }, { once: true });
let hits: { label: string; kind: string; go: () => void }[] = [], cur = 0;
q.addEventListener("input", () => {
  const s = q.value.trim().toLowerCase();
  if (s.length < 2) { res.hidden = true; return; }
  hits = [];
  stars.forEach((st, i) => { if (st.name.toLowerCase().includes(s)) hits.push({ label: st.name, kind: "стиль", go: () => select({ kind: "star", s: i }) }); });
  for (let i = 0; i < planets.length && hits.length < 14; i++) if (planets[i].name.toLowerCase().includes(s)) hits.push({ label: planets[i].name, kind: "лейбл", go: () => select({ kind: "planet", p: i }) });
  if (artists) for (let i = 0; i < artists.length && hits.length < 24; i++) {
    const [name, st, ti] = artists[i];
    if (name.toLowerCase().includes(s)) hits.push({ label: name, kind: "артист", go: () => loadChunk(st).then(() => select({ kind: "track", s: st, i: ti })) });
  }
  cur = 0; res.hidden = false;
  res.innerHTML = hits.length ? hits.map((h, i) => `<button data-h="${i}" class="${i === 0 ? "on" : ""}"><span class="kind">${h.kind}</span><span>${esc(h.label)}</span></button>`).join("") : `<p class="note" style="padding:8px 10px;margin:0">Нічого не знайдено в цьому секторі.</p>`;
});
q.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { res.hidden = true; return; }
  if (res.hidden || !hits.length) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); cur = (cur + (e.key === "ArrowDown" ? 1 : -1) + hits.length) % hits.length; [...res.children].forEach((b, i) => b.classList.toggle("on", i === cur)); }
  if (e.key === "Enter") choose(cur);
});
res.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-h]"); if (b) choose(+b.dataset.h!); });
function choose(i: number) { hits[i]?.go(); res.hidden = true; q.value = ""; q.blur(); }

// ---------- Старт ----------
if (map.meta.sample) { $("sampleBanner").hidden = false; $("sampleBanner").onclick = () => { $("sampleBanner").hidden = true; }; }
render(); renderLog(); requestAnimationFrame(frame);
const m = location.hash.match(/^#t(\d+)-(\d+)$/);
if (m && +m[1] < stars.length) loadChunk(+m[1]).then((ch) => { if (+m[2] < ch.yt.length) select({ kind: "track", s: +m[1], i: +m[2] }); });
