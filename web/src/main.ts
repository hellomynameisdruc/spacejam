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
type Star = { name: string; x: number; y: number; core: number; R: number; n: number; tracks: number; color: string; yh?: number[]; hull?: number[]; bub?: [number, number, number][]; orb?: number[] };
type Planet = { name: string; s: number; x: number; y: number; r: number; n: number; yr: [number, number]; ay?: number; o?: number; a?: number; t0: number; t1: number };
type MapData = { meta: { sector: string; sample: boolean; releases: number; tracks: number; years?: [number, number] }; stars: Star[]; links: [number, number, number][]; planets: Planet[] };
type Chunk = { yt: string[]; t: string[]; a: number[]; yr: number[]; p: number[]; x: number[]; y: number[]; an: string[] };
type TrackRef = { s: number; i: number };
type Sel = { kind: "star"; s: number } | { kind: "planet"; p: number } | { kind: "track"; s: number; i: number } | null;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmt = (n: number) => n.toLocaleString("en-US").replace(/ /g, " ");
const pad = (n: number, w: number) => String(n).padStart(w, "0");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

const map: MapData = await fetch("./data/map.json").then((r) => r.json());
const { stars, planets, links } = map;
const planetsByStar: number[][] = stars.map(() => []);
planets.forEach((p, i) => planetsByStar[p.s].push(i));
planetsByStar.forEach((l) => l.sort((a, b) => planets[b].n - planets[a].n));
const totalTracks = stars.reduce((a, s) => a + s.tracks, 0);

// ---------- Classification: planet types and star classes ----------
// Planet type comes from the label's history; star size from popularity, glow from how alive the style is now.
type PType = "giant" | "ringed" | "ancient" | "young" | "rocky";
const nSorted = planets.map((p) => p.n).sort((a, b) => a - b);
const giantMin = Math.max(8, nSorted[Math.floor(nSorted.length * 0.85)] ?? Infinity);
const spanOf = (p: Planet) => (p.yr[0] && p.yr[1] ? p.yr[1] - p.yr[0] : 0);
// long-runner: 15+ years between first and last release AND releases in at least 10 different years
const longRun = (p: Planet) => spanOf(p) >= 15 && (p.ay ?? 99) >= 10;
const ptype: PType[] = planets.map((p) => {
  if (p.n >= giantMin) return "giant";
  if (longRun(p)) return "ringed";
  if (p.yr[1] && p.yr[1] <= 2000) return "ancient";
  if (p.yr[0] >= 2010) return "young";
  return "rocky";
});
const ringedP = planets.map((p, i) => ptype[i] === "ringed" || (ptype[i] === "giant" && longRun(p)));
const PTYPE_INFO: Record<PType, [string, string]> = {
  giant: ["GAS GIANT", "one of the largest labels in the sector"],
  ringed: ["RINGED WORLD", "a long-runner: 15+ years of releases, in at least 10 different years"],
  ancient: ["CRATERED", "went quiet before 2001"],
  young: ["ICE WORLD", "first release in 2010 or later"],
  rocky: ["TERRESTRIAL", "a regular label"],
};
const nMax = Math.max(1, ...stars.map((s) => s.n));
const starRel = stars.map((s) => Math.sqrt(s.n / nMax));
const starIdx = new Map(stars.map((s, i) => [s, i] as [Star, number]));
const recentShare = stars.map((s) => { const yh = s.yh || []; const tot = yh.reduce((a, b) => a + b, 0) || 1; return yh.slice(-10).reduce((a, b) => a + b, 0) / tot; });
const lum = (() => { const mx = Math.max(0.0001, ...recentShare); return recentShare.map((r) => r / mx); })();
const starRank: number[] = [];
stars.map((_, i) => i).sort((a, b) => stars[b].n - stars[a].n).forEach((si, k) => { starRank[si] = k; });
const CLASSES = ["O", "B", "A", "F", "G", "K", "M"];
const sclass: string[] = [];
stars.map((_, i) => i).sort((a, b) => stars[b].n - stars[a].n).forEach((si, k) => { sclass[si] = CLASSES[Math.min(6, Math.floor(k / stars.length * 7))]; });

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
  dirty = true;
}
function setPhosphor(name: string) {
  document.documentElement.dataset.phosphor = name;
  document.querySelectorAll<HTMLButtonElement>(".phos button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ph === name)));
  try { localStorage.setItem("kosmos-ph", name); } catch { /* */ }
  readPhosphor(); render();
}
document.querySelectorAll<HTMLButtonElement>(".phos button").forEach((b) => (b.onclick = () => setPhosphor(b.dataset.ph!)));

// ---------- Кольори систем і пульсари ----------
// Кожен стиль має свій колір (сусідні стилі — схожі відтінки). Зоря спалахує в типовому
// для стилю темпі й раз на такт (4 удари) скидає оболонку-нову.
const SC = stars.map((s) => { const h = s.color.replace("#", ""); return [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16)); });
const sc = (si: number, a = 1) => `rgba(${SC[si][0]},${SC[si][1]},${SC[si][2]},${a})`;
const Y0 = map.meta.years?.[0] ?? 1980;
const peakYear = stars.map((s) => { const yh = s.yh || []; let b = 0; yh.forEach((v, i) => { if (v > yh[b]) b = i; }); return Y0 + b; });
// Довідковий темп жанру (BPM), не виміряний з треків
const TEMPO: [RegExp, number][] = [[/jungle|drum ?n ?bass|d&b/i, 170], [/juke|footwork/i, 160], [/hard house/i, 145], [/ghettotech/i, 145],
  [/eurodance/i, 140], [/trance/i, 138], [/speed garage/i, 135], [/uk garage|2-step|bassline/i, 132], [/techno/i, 132], [/breakbeat|breaks/i, 130],
  [/ghetto house/i, 130], [/progressive|electro house/i, 128], [/euro house|italo house|jackin|funky/i, 126], [/tech house|acid/i, 125],
  [/minimal/i, 124], [/disco/i, 118], [/hip-house/i, 120], [/deep|soulful|afro|latin|garage house/i, 121], [/house/i, 124]];
const bpm = stars.map((s) => TEMPO.find(([re]) => re.test(s.name))?.[1] ?? 124);
const phase0 = stars.map((s) => (hash(s.name) % 1000) / 1000);
function sprite(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; paint(c.getContext("2d")!); return c;
}
const glowS = stars.map((_, si) => sprite(64, 64, (g) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.16, sc(si, 1)); gr.addColorStop(0.42, sc(si, 0.32)); gr.addColorStop(1, sc(si, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
}));
function pulseOf(si: number, t: number) {
  const beat = (t / 1000) * bpm[si] / 60 + phase0[si];
  return { p: reduce ? 0.4 : Math.exp(-(beat % 1) * 6), bar: reduce ? 0.3 : (beat / 4) % 1 };
}
// Star in the same visual language as the planets: a dithered sphere with an outline, but lit from
// within, ringed by a dotted halo. Flashes on every beat, sheds a nova shell once per bar.
const starDither = stars.map((_, si) => sprite(3, 3, (g) => { g.fillStyle = sc(si, 1); g.fillRect(0, 0, 1, 1); g.fillRect(2, 1, 1, 1); g.fillStyle = sc(si, 0.5); g.fillRect(1, 2, 1, 1); }));
function drawPulsar(c: CanvasRenderingContext2D, si: number, x: number, y: number, s: number, t: number) {
  const { p, bar } = pulseOf(si, t);
  const prev = c.globalCompositeOperation;
  // nova shell — once per bar
  c.strokeStyle = sc(si, 0.55 * (1 - bar) ** 2); c.lineWidth = Math.max(1, s * 0.1 * (1 - bar));
  c.beginPath(); c.arc(x, y, s * (1.3 + 6 * bar), 0, 7); c.stroke();
  // dotted halo, like a planet's satellite ring; breathes with the beat
  const hr = s * (1.75 + 0.18 * p), rot = (reduce ? 0 : t / 1000) * 0.2 * (si % 2 ? 1 : -1) + phase0[si] * 6.283;
  const nDots = Math.max(16, Math.min(48, Math.round(hr * 1.4))), dsz = Math.max(1, Math.round(s * 0.09));
  c.fillStyle = sc(si, 0.3 + 0.35 * lum[si] + 0.3 * p);
  for (let k = 0; k < nDots; k++) { const a = rot + k * 6.283 / nDots; c.fillRect(Math.round(x + Math.cos(a) * hr - dsz / 2), Math.round(y + Math.sin(a) * hr - dsz / 2), dsz, dsz); }
  // glow
  c.globalCompositeOperation = "lighter";
  const gR = s * (1.8 + 1.4 * lum[si] + 2.2 * p); c.globalAlpha = Math.min(1, 0.2 + 0.45 * lum[si] + 0.45 * p); c.drawImage(glowS[si], x - gR, y - gR, gR * 2, gR * 2); c.globalAlpha = 1;
  c.globalCompositeOperation = prev;
  // dithered sphere, lit from inside
  const r = s * (1 + 0.1 * p);
  c.save(); c.beginPath(); c.arc(x, y, r, 0, 7); c.clip();
  c.fillStyle = BG; c.fillRect(x - r, y - r, r * 2, r * 2);
  c.fillStyle = c.createPattern(starDither[si], "repeat")!; c.fillRect(x - r, y - r, r * 2, r * 2);
  c.globalCompositeOperation = "lighter";
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,255,255,${0.85 + 0.15 * p})`); g.addColorStop(0.35 + 0.15 * p, sc(si, 0.9)); g.addColorStop(1, sc(si, 0));
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  c.restore();
  // outline, like the planets
  c.strokeStyle = sc(si, 0.95); c.lineWidth = 1; c.beginPath(); c.arc(x, y, r, 0, 7); c.stroke();
}

// ---------- Канвас і камера ----------
const vp = $("viewport"), cv = $<HTMLCanvasElement>("sky"), ctx = cv.getContext("2d")!;
const layer = document.createElement("canvas"), lc = layer.getContext("2d")!; // статичний шар мапи
let W = 0, H = 0, DPR = 1, dirty = true;
const ditherPats: (CanvasPattern | null)[] = [];
function resize() {
  const r = vp.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  W = Math.max(1, r.width); H = Math.max(1, r.height); DPR = dpr;
  cv.width = layer.width = W * dpr; cv.height = layer.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); lc.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false;
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
let G: CanvasRenderingContext2D = lc; // where label()/brackets() draw: static layer, or the live frame
function label(txt: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "center", force = false, inv = false) {
  G.font = `${size}px ${FONT_LBL}`;
  const w = G.measureText(txt).width, h = size + 2;
  const x0 = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  const r = { x0: x0 - 3, y0: y - h, x1: x0 + w + 3, y1: y + 4 };
  if (!force && placed.some((p) => p.x0 < r.x1 && p.x1 > r.x0 && p.y0 < r.y1 && p.y1 > r.y0)) return false;
  placed.push(r);
  G.textAlign = align;
  if (inv) { G.fillStyle = color; G.fillRect(r.x0 - 2, r.y0 + 1, r.x1 - r.x0 + 4, h + 4); G.fillStyle = BG; }
  else G.fillStyle = color;
  G.fillText(txt, x, y);
  return true;
}
function brackets(x: number, y: number, r: number, color: string, len = 6) {
  G.strokeStyle = color; G.lineWidth = 1.2; G.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const cx = x + sx * r, cy = y + sy * r;
    G.moveTo(cx, cy - sy * len); G.lineTo(cx, cy); G.lineTo(cx - sx * len, cy);
  }
  G.stroke();
}
function getDither(si: number) {
  if (ditherPats[si]) return ditherPats[si]!;
  const c = sprite(3, 3, (g) => { g.fillStyle = sc(si, 0.95); g.fillRect(0, 0, 1, 1); g.fillStyle = sc(si, 0.45); g.fillRect(2, 2, 1, 1); });
  return (ditherPats[si] = lc.createPattern(c, "repeat"))!;
}
let V0 = { x: 0, y: 0 }, V1 = { x: 0, y: 0 };
const inView = (x: number, y: number, r: number) => x + r > V0.x && x - r < V1.x && y + r > V0.y && y - r < V1.y;
const starSize = (s: Star) => { const k = starRel[starIdx.get(s)!]; return Math.max(3.5 + 8 * k, Math.min(54, (12 + 44 * k) * cam.s)); };

// Просторова сітка треків: швидко знаходимо точки у видимій області
const CELL = 48;
type Grid = Map<number, number[]>;
const grids: (Grid | null)[] = stars.map(() => null);
const gkey = (cx: number, cy: number) => (cx + 32768) * 65536 + (cy + 32768);
function gridOf(si: number): Grid | null {
  if (grids[si]) return grids[si];
  const ch = chunks[si]; if (!ch) return null;
  const g: Grid = new Map();
  for (let i = 0; i < ch.x.length; i++) { const k = gkey(Math.floor(ch.x[i] / CELL), Math.floor(ch.y[i] / CELL)); let a = g.get(k); if (!a) g.set(k, (a = [])); a.push(i); }
  return (grids[si] = g);
}
function eachTrack(si: number, x0: number, y0: number, x1: number, y1: number, fn: (i: number) => void) {
  const g = gridOf(si); if (!g) return;
  const st = stars[si];
  x0 = Math.max(x0, st.x - st.R); y0 = Math.max(y0, st.y - st.R); x1 = Math.min(x1, st.x + st.R); y1 = Math.min(y1, st.y + st.R);
  if (x0 > x1 || y0 > y1) return;
  for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
    for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) { const a = g.get(gkey(cx, cy)); if (a) for (const i of a) fn(i); }
}

// Satellites orbit their planet on tilted circular orbits (random orientations ⇒ a spherical swarm).
// Belt tracks (no planet) stay put. Kepler-ish: inner orbits are faster.
type Orbit = { d: Float32Array; th: Float32Array; ci: Float32Array; si: Float32Array; cO: Float32Array; sO: Float32Array; w: Float32Array };
const orbits: (Orbit | null)[] = stars.map(() => null);
function orbitOf(s: number): Orbit | null {
  if (orbits[s]) return orbits[s];
  const ch = chunks[s]; if (!ch) return null;
  const n = ch.x.length, o: Orbit = { d: new Float32Array(n), th: new Float32Array(n), ci: new Float32Array(n), si: new Float32Array(n), cO: new Float32Array(n), sO: new Float32Array(n), w: new Float32Array(n) };
  let sd = 1 + s * 7919; const r1 = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const pi = ch.p[i]; if (pi < 0) continue;
    const P = planets[pi], dx = ch.x[i] - P.x, dy = ch.y[i] - P.y, d = Math.hypot(dx, dy);
    const ci = 2 * r1() - 1, O = r1() * 6.2832;
    o.d[i] = d; o.th[i] = Math.atan2(dy, dx); o.ci[i] = ci; o.si[i] = Math.sqrt(1 - ci * ci); o.cO[i] = Math.cos(O); o.sO[i] = Math.sin(O);
    o.w[i] = (6.2832 / 46) * Math.pow((P.r + 4) / Math.max(d, P.r + 4), 1.5);
  }
  return (orbits[s] = o);
}
let tNow = 0;
// Planets circle their star. A whole ring turns together at its own Kepler-ish speed,
// and rings are spaced by the satellite swarms, so planets never collide.
const pOmega = planets.map((p) => {
  if (!p.o) return 0;
  const o0 = stars[p.s].orb?.[0] || p.o;
  return (p.s % 2 ? -1 : 1) * (6.2832 / 90) * Math.pow(o0 / p.o, 0.9);
});
const PP = { x: 0, y: 0 };
function planetPos(i: number, t = tNow) {
  const p = planets[i];
  if (!p.o) { PP.x = p.x; PP.y = p.y; return PP; }
  const st = stars[p.s], a = (p.a ?? 0) + (reduce ? 0 : t / 1000) * pOmega[i];
  PP.x = st.x + Math.cos(a) * p.o; PP.y = st.y + Math.sin(a) * p.o; return PP;
}
// Camera rides along with the selected planet so it doesn't drift off screen
let follow: number | null = null, followP = { x: 0, y: 0 };
function setFollow(i: number | null) {
  follow = i && i >= 0 ? i : i === 0 ? 0 : null;
  if (follow !== null) { const q = planetPos(follow, performance.now()); followP = { x: q.x, y: q.y }; }
}
const OP = { x: 0, y: 0, z: 0 };
// World position of a track right now (z > 0 = in front of its planet)
function trackPos(s: number, i: number, t = tNow) {
  const ch = chunks[s]!, o = orbitOf(s)!;
  if (!o || ch.p[i] < 0 || !o.d[i]) { OP.x = ch.x[i]; OP.y = ch.y[i]; OP.z = 1; return OP; }
  const P = planetPos(ch.p[i], t), th = o.th[i] + (reduce ? 0 : t / 1000) * o.w[i], d = o.d[i];
  const X = d * Math.cos(th), Y = d * Math.sin(th) * o.ci[i];
  OP.x = P.x + X * o.cO[i] - Y * o.sO[i]; OP.y = P.y + X * o.sO[i] + Y * o.cO[i]; OP.z = d * Math.sin(th) * o.si[i];
  return OP;
}
const hiddenBehind = (s: number, i: number, q: { x: number; y: number; z: number }) => {
  if (q.z >= 0) return false; const pi = chunks[s]!.p[i]; if (pi < 0) return false;
  const r = planets[pi].r, P = planetPos(pi); return (q.x - P.x) ** 2 + (q.y - P.y) ** 2 < r * r;
};
const orbitR = (pl: Planet) => pl.r + 6 + 1.5 * Math.sqrt(pl.t1 - pl.t0);

// Planet look by type: banded giants, ringed long-runners, cratered retired labels, icy newcomers
function drawPlanetBody(i: number, x: number, y: number, r: number) {
  const pl = planets[i], si = pl.s, ty = ptype[i], h = hash(pl.name), ringed = ringedP[i];
  const tilt = -0.5 + (h % 100) / 100 * 0.45, rx = r * 1.95, ry = r * 0.5;
  if (ringed) { G.strokeStyle = sc(si, 0.5); G.lineWidth = Math.max(1, r * 0.12); G.beginPath(); G.ellipse(x, y, rx, ry, tilt, Math.PI, Math.PI * 2); G.stroke(); }
  G.save(); G.beginPath(); G.arc(x, y, r, 0, 7); G.clip();
  G.fillStyle = BG; G.fillRect(x - r, y - r, r * 2, r * 2);
  G.globalAlpha = ty === "young" ? 0.35 : 1; G.fillStyle = getDither(si); G.fillRect(x - r, y - r, r * 2, r * 2); G.globalAlpha = 1;
  if (ty === "giant") {
    const nb = 5;
    for (let k = 0; k < nb; k++) {
      const yy = y - r + (k + 0.5) * (2 * r / nb) + Math.sin(k * 1.7 + h) * r * 0.06;
      G.fillStyle = sc(si, k % 2 ? 0.9 : 0.3); G.fillRect(x - r, yy - r * 0.1, r * 2, r * (k % 2 ? 0.2 : 0.13));
    }
  }
  if (ty === "ancient") {
    G.globalAlpha = 0.55; G.fillStyle = BG; G.fillRect(x - r, y - r, r * 2, r * 2); G.globalAlpha = 1;
    G.strokeStyle = sc(si, 0.85); G.lineWidth = 1;
    for (let k = 0; k < 4; k++) {
      const a = ((h >>> (k * 3)) % 628) / 100, d = r * 0.12 + (((h >>> (k * 5)) % 100) / 100) * r * 0.55, cr = r * (0.12 + ((h >>> (k * 2)) % 10) / 70);
      G.beginPath(); G.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, cr, 0, 7); G.stroke();
    }
  } else {
    G.fillStyle = sc(si, 0.95); G.beginPath(); G.arc(x - r * 0.35, y - r * 0.35, r * (ty === "young" ? 0.45 : 0.62), 0, 7); G.fill();
    G.globalAlpha = 0.55; G.fillStyle = BG; G.beginPath(); G.arc(x + r * 0.05, y + r * 0.05, r * 0.72, 0, 7); G.fill(); G.globalAlpha = 1;
  }
  G.restore();
  G.strokeStyle = sc(si, 0.95); G.lineWidth = 1;
  if (ty === "young") G.setLineDash([2, 2]);
  G.beginPath(); G.arc(x, y, r, 0, 7); G.stroke(); G.setLineDash([]);
  if (ringed) { G.strokeStyle = sc(si, 0.95); G.lineWidth = Math.max(1, r * 0.12); G.beginPath(); G.ellipse(x, y, rx, ry, tilt, 0, Math.PI); G.stroke(); }
  if (ty === "young" && r > 5) {
    const sx = x - r * 0.42, sy = y - r * 0.42, k = Math.max(1, Math.round(r * 0.08));
    G.fillStyle = "#fff"; G.fillRect(sx - k * 3, sy - k / 2, k * 6, k); G.fillRect(sx - k / 2, sy - k * 3, k, k * 6);
  }
}

// System outline: a wobbly hull plus soap-bubble outlines around each cluster of labels
function drawSystemShape(si: number) {
  const s = stars[si], p = toScreen(s.x, s.y);
  const h = s.hull;
  lc.setLineDash([1, 5]); lc.lineWidth = 1; lc.strokeStyle = sc(si, 0.26);
  lc.beginPath();
  if (h && h.length > 2) {
    const n = h.length, pt = (k: number) => { const a = (k % n) / n * Math.PI * 2, r = h[k % n] * cam.s; return [p.x + Math.cos(a) * r, p.y + Math.sin(a) * r]; };
    let [x0, y0] = pt(0), [x1, y1] = pt(1);
    lc.moveTo((x0 + x1) / 2, (y0 + y1) / 2);
    for (let k = 1; k <= n; k++) { const [ax, ay] = pt(k), [bx, by] = pt(k + 1); lc.quadraticCurveTo(ax, ay, (ax + bx) / 2, (ay + by) / 2); }
  } else lc.arc(p.x, p.y, s.R * cam.s, 0, 7);
  lc.stroke(); lc.setLineDash([]);
  // planet orbits
  if (!s.orb || cam.s < LOD_PLANETS * 0.6) return;
  lc.setLineDash([1, 4]); lc.strokeStyle = sc(si, 0.22);
  for (const o of s.orb) { lc.beginPath(); lc.arc(p.x, p.y, o * cam.s, 0, 7); lc.stroke(); }
  lc.setLineDash([]);
}

let marker: (o: Sel, strong: boolean) => void = () => {};
// Статичний шар: перемальовується лише коли рухається камера або змінюється вибір
let layerCam = { x: 0, y: 0, s: 0 };
function drawStatic() {
  layerCam = { x: cam.x, y: cam.y, s: cam.s };
  placed.length = 0;
  V0 = toWorld(0, 0); V1 = toWorld(W, H);
  lc.fillStyle = BG; lc.fillRect(0, 0, W, H);

  // координатна сітка
  const step = Math.pow(10, Math.ceil(Math.log10(70 / cam.s)));
  const st = step * cam.s < 140 ? step : step / 2;
  lc.strokeStyle = ph(0.06); lc.lineWidth = 1; lc.beginPath();
  for (let x = Math.floor(V0.x / st) * st; x < V1.x; x += st) { const p = toScreen(x, 0).x; lc.moveTo(Math.round(p) + 0.5, 0); lc.lineTo(Math.round(p) + 0.5, H); }
  for (let y = Math.floor(V0.y / st) * st; y < V1.y; y += st) { const p = toScreen(0, y).y; lc.moveTo(0, Math.round(p) + 0.5); lc.lineTo(W, Math.round(p) + 0.5); }
  lc.stroke();

  // туманності систем (спрайт світіння, без розмиття)
  lc.globalCompositeOperation = "lighter";
  stars.forEach((s, si) => {
    if (!inView(s.x, s.y, s.R)) return;
    const p = toScreen(s.x, s.y), R = s.R * cam.s, al = 0.16 * Math.min(1, 0.6 / cam.s);
    if (al < 0.02) return;
    lc.globalAlpha = al; lc.drawImage(glowS[si], p.x - R, p.y - R, R * 2, R * 2);
  });
  lc.globalAlpha = 1; lc.globalCompositeOperation = "source-over";

  // пил
  for (const d of dust) {
    let x = (d.x * W * 4 - cam.x * cam.s * d.d * 0.04) % W, y = (d.y * H * 4 - cam.y * cam.s * d.d * 0.04) % H;
    if (x < 0) x += W; if (y < 0) y += H;
    lc.fillStyle = ph(0.1 + d.b * 0.3);
    if (warpFx > 0.05) lc.fillRect(x, y, 1 + (x - W / 2) * warpFx * 0.25, 1);
    else lc.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  // межі систем і зв'язки
  lc.setLineDash([1, 5]); lc.lineWidth = 1;
  stars.forEach((s, si) => { if (inView(s.x, s.y, s.R)) drawSystemShape(si); });
  lc.setLineDash([2, 5]);
  for (const [a, b, w] of links) {
    const A = toScreen(stars[a].x, stars[a].y), B = toScreen(stars[b].x, stars[b].y), al = Math.min(0.75, 0.12 + w * 1.4);
    const g = lc.createLinearGradient(A.x, A.y, B.x, B.y); g.addColorStop(0, sc(a, al)); g.addColorStop(1, sc(b, al));
    lc.strokeStyle = g; lc.lineWidth = w > 0.15 ? 1.6 : 1;
    lc.beginPath(); lc.moveTo(A.x, A.y); lc.lineTo(B.x, B.y); lc.stroke();
  }
  lc.setLineDash([]);

  // треки
  const titles: { x: number; y: number; t: string; si: number }[] = [];
  if (cam.s >= LOD_TRACKS) {
    const sz = Math.max(1, Math.min(3, Math.round(cam.s * 0.9)));
    stars.forEach((s, si) => {
      if (!inView(s.x, s.y, s.R)) return;
      const ch = chunks[si]; if (!ch) { loadChunk(si); return; }
      lc.fillStyle = sc(si, 0.9);
      eachTrack(si, V0.x, V0.y, V1.x, V1.y, (i) => {
        if (ch.p[i] >= 0) return; // planet satellites are animated in drawLive
        const x = ch.x[i], y = ch.y[i];
        if (x < V0.x || x > V1.x || y < V0.y || y > V1.y) return;
        const p = toScreen(x, y);
        lc.fillRect(Math.round(p.x - sz / 2), Math.round(p.y - sz / 2), sz, sz);
        if (cam.s >= LOD_TITLES && titles.length < 240) titles.push({ x: p.x, y: p.y, t: ch.t[i], si });
      });
    });
  }

  // підписи зір (самі пульсари малюються поверх, у кожному кадрі)
  stars.map((s, si) => ({ s, si })).sort((a, b) => b.s.n - a.s.n).forEach(({ s, si }) => {
    if (!inView(s.x, s.y, 300 / cam.s)) return;
    const p = toScreen(s.x, s.y);
    label(s.name.toUpperCase(), p.x, p.y - starSize(s) * 3.4 - 6, W < 600 ? 12 : 14, sc(si, 1), "center", starRank[si] < 12);
  });
  for (const t of titles) label(t.t, t.x + 6, t.y + 4, 11, sc(t.si, 0.75), "left");

  // виділення й наведення
  marker = (o: Sel, strong: boolean) => {
    if (!o) return;
    let x = 0, y = 0, r = 8, name = "", si = 0;
    if (o.kind === "star") { const s = stars[o.s], p = toScreen(s.x, s.y); x = p.x; y = p.y; r = starSize(s) * 2.6 + 6; name = `${bpm[o.s]} BPM · PEAK ${peakYear[o.s]}`; si = o.s; }
    else if (o.kind === "planet") { if (G === lc) return; const pl = planets[o.p], q = planetPos(o.p), p = toScreen(q.x, q.y); x = p.x; y = p.y; r = Math.max(9, pl.r * cam.s + 6); name = pl.name; si = pl.s; }
    else { const ch = chunks[o.s]; if (!ch || G === lc) return; const q = trackPos(o.s, o.i), p = toScreen(q.x, q.y); x = p.x; y = p.y; r = 7; name = ch.t[o.i]; si = o.s; }
    brackets(x, y, r, sc(si, strong ? 1 : 0.65), strong ? 7 : 4);
    if (strong) {
      const lx = x + r + 26, ly = y - r - 18;
      lc.strokeStyle = sc(si, 0.95); lc.lineWidth = 1; lc.beginPath(); lc.moveTo(x + r, y - r); lc.lineTo(x + r + 12, ly + 4); lc.lineTo(lx - 4, ly + 4); lc.stroke();
      label(name.toUpperCase(), lx, ly + 8, 12, sc(si, 1), "left", true, true);
    }
  };
  if (hover && !same(hover, sel)) marker(hover, false);
  marker(sel, true);

  const c = toWorld(W / 2, H / 2);
  const sg = (n: number) => (n < 0 ? "−" : "+") + Math.abs(n).toFixed(1).padStart(6, "0");
  $("readout").textContent = `X ${sg(c.x)}  Y ${sg(c.y)}  ×${cam.s.toFixed(2)}  GRID ${st >= 1 ? st : st.toFixed(1)}`;
  $("scaleName").textContent = cam.s < LOD_PLANETS ? "GALAXY" : cam.s < LOD_TRACKS ? "SYSTEMS" : cam.s < LOD_TITLES ? "ORBITS" : "SIGNALS";
}

// Кожен кадр: готовий статичний шар + пульсари + маяк треку, що грає
// Planet bodies are cached as small sprites per zoom level and blitted at their moving positions
const pSprite: (HTMLCanvasElement | null)[] = planets.map(() => null);
let spriteScale = 0;
function planetSprite(i: number, r: number) {
  if (spriteScale !== cam.s) { pSprite.fill(null); spriteScale = cam.s; }
  const have = pSprite[i]; if (have) return have;
  const half = Math.ceil((ringedP[i] ? r * 2.05 : r) + 3), w = half * 2;
  const c = document.createElement("canvas"); c.width = c.height = Math.ceil(w * DPR);
  const g = c.getContext("2d")!; g.setTransform(DPR, 0, 0, DPR, 0, 0);
  const prev = G; G = g; drawPlanetBody(i, half, half, r); G = prev;
  return (pSprite[i] = c);
}
function drawPlanets(t: number) {
  if (cam.s < LOD_PLANETS) return;
  const vis: number[] = [];
  stars.forEach((st, si) => {
    if (!inView(st.x, st.y, st.R)) return;
    for (const i of planetsByStar[si]) { const q = planetPos(i, t); if (inView(q.x, q.y, planets[i].r * 3)) vis.push(i); }
  });
  for (const i of vis) {
    const pl = planets[i], q = planetPos(i, t), p = toScreen(q.x, q.y), r = Math.max(1.5, pl.r * cam.s);
    if (r < 3) { ctx.fillStyle = sc(pl.s, 0.95); ctx.fillRect(Math.round(p.x - 1), Math.round(p.y - 1), 2, 2); continue; }
    if (r > 180) { drawPlanetBody(i, p.x, p.y, r); continue; }
    const c = planetSprite(i, r), w = c.width / DPR;
    ctx.drawImage(c, p.x - w / 2, p.y - w / 2, w, w);
  }
  vis.sort((a, b) => planets[b].n - planets[a].n);
  for (const i of vis) {
    const pl = planets[i], r = pl.r * cam.s; if (r < 4) continue;
    const q = planetPos(i, t), p = toScreen(q.x, q.y);
    label(pl.name.toUpperCase(), p.x, p.y + r + 14, 11, sc(pl.s, 0.85));
  }
}
function drawSatellites(t: number) {
  if (cam.s < LOD_TRACKS) return;
  const sz = Math.max(1, Math.min(3, Math.round(cam.s * 0.9))), titles = cam.s >= LOD_TITLES;
  let nT = 0;
  stars.forEach((st, si) => {
    if (!inView(st.x, st.y, st.R)) return;
    const ch = chunks[si]; if (!ch || !orbitOf(si)) return;
    const back = new Path2D(), front = new Path2D();
    for (const pi of planetsByStar[si]) {
      const pl = planets[pi], c = planetPos(pi, t); if (!inView(c.x, c.y, orbitR(pl))) continue;
      for (let i = pl.t0; i < pl.t1; i++) {
        const q = trackPos(si, i, t);
        if (q.x < V0.x || q.x > V1.x || q.y < V0.y || q.y > V1.y || hiddenBehind(si, i, q)) continue;
        const p = toScreen(q.x, q.y), X = Math.round(p.x - sz / 2), Y = Math.round(p.y - sz / 2);
        (q.z >= 0 ? front : back).rect(X, Y, sz, sz);
        if (titles && q.z > 0 && nT < 160 && label(ch.t[i], p.x + 6, p.y + 4, 11, sc(si, 0.75), "left")) nT++;
      }
    }
    ctx.fillStyle = sc(si, 0.35); ctx.fill(back);
    ctx.fillStyle = sc(si, 0.95); ctx.fill(front);
  });
}
function drawLive(t: number) {
  tNow = t;
  let ox = (cam.x - layerCam.x) * cam.s, oy = (cam.y - layerCam.y) * cam.s;
  if (cam.s !== layerCam.s || Math.abs(ox) > 28 || Math.abs(oy) > 28) { drawStatic(); ox = oy = 0; }
  if (ox || oy) { ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H); }
  ctx.drawImage(layer, -ox, -oy, W, H);
  const nPlaced = placed.length; G = ctx;
  drawPlanets(t);
  drawSatellites(t);
  stars.forEach((s, si) => {
    if (!inView(s.x, s.y, starSize(s) * 9 / cam.s)) return;
    const p = toScreen(s.x, s.y);
    drawPulsar(ctx, si, p.x, p.y, starSize(s), t);
  });
  if (nowPlaying) {
    const ch = chunks[nowPlaying.s];
    if (ch) {
      const q = trackPos(nowPlaying.s, nowPlaying.i, t), p = toScreen(q.x, q.y), { bar } = pulseOf(nowPlaying.s, t);
      ctx.strokeStyle = sc(nowPlaying.s, 0.9 * (1 - bar)); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(p.x, p.y, 6 + bar * 26, 0, 7); ctx.stroke();
    }
  }
  const moving = (o: Sel) => !!o && (o.kind === "planet" || o.kind === "track");
  if (moving(hover) && !same(hover, sel)) marker(hover, false);
  if (moving(sel)) marker(sel, true);
  placed.length = nPlaced; G = lc;
}

function frame(now: number) {
  tNow = now;
  if (follow !== null) {
    const q = planetPos(follow, now), dx = q.x - followP.x, dy = q.y - followP.y;
    followP = { x: q.x, y: q.y };
    if (dx || dy) {
      if (tween) { tween.fx += dx; tween.fy += dy; tween.tx += dx; tween.ty += dy; } else { cam.x += dx; cam.y += dy; }
      // no full redraw: drawLive slides the static layer and refreshes it only every few dozen pixels
    }
  }
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
  if (dirty) { dirty = false; drawStatic(); }
  drawLive(now);
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
      eachTrack(s, w.x - rad, w.y - rad, w.x + rad, w.y + rad, (i) => { if (ch.p[i] < 0) consider({ kind: "track", s, i }, ch.x[i], ch.y[i], 10); });
      if (!orbitOf(s)) return;
      for (const pi of planetsByStar[s]) {
        const pl = planets[pi], c = planetPos(pi); if (Math.hypot(w.x - c.x, w.y - c.y) > orbitR(pl) + rad) continue;
        for (let i = pl.t0; i < pl.t1; i++) { const q = trackPos(s, i); if (!hiddenBehind(s, i, q)) consider({ kind: "track", s, i }, q.x, q.y, 10); }
      }
    });
  }
  if (cam.s >= LOD_PLANETS) planets.forEach((p, i) => { const q = planetPos(i); consider({ kind: "planet", p: i }, q.x, q.y, Math.max(10, p.r * cam.s + 5)); });
  stars.forEach((st, s) => consider({ kind: "star", s }, st.x, st.y, Math.max(16, starSize(st) * 3 + 4)));
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
  if (dragged > 4) { tween = null; follow = null; cam.x -= dx / cam.s; cam.y -= dy / cam.s; dirty = true; }
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
  setFollow(o?.kind === "planet" ? o.p : o?.kind === "track" ? chunks[o.s]!.p[o.i] : null);
  if (o?.kind === "star") { const s = stars[o.s]; if (go) fly(s.x, s.y, Math.min(maxS, (Math.min(W, H) * 0.46) / s.R)); }
  else if (o?.kind === "planet") { const p = planets[o.p], q = planetPos(o.p); if (go) fly(q.x, q.y, Math.max(LOD_TRACKS * 1.6, Math.min(8, Math.min(W, H) * 0.16 / (p.r + 4 + 1.5 * Math.sqrt(p.t1 - p.t0))))); }
  else if (o?.kind === "track") { const ch = chunks[o.s]!; if (go) { const pi = ch.p[o.i]; if (pi >= 0) { const pl = planets[pi], q = planetPos(pi); fly(q.x, q.y, Math.max(LOD_TITLES * 1.1, Math.min(8, Math.min(W, H) * 0.42 / orbitR(pl)))); } else fly(ch.x[o.i], ch.y[o.i], Math.max(cam.s, LOD_TITLES * 1.3)); } if (autoplay) playTrack(o); try { history.replaceState(null, "", `#t${o.s}-${o.i}`); } catch { /* */ } }
  render();
  decodeDossier(warping ? 900 : 380);
}

// ---------- Досьє ----------
let dosAnim: ((t: number) => void) | null = null;
const refs: Sel[] = [];
const R = (o: Sel) => { refs.push(o); return refs.length - 1; };
const neighbours = (s: number) => links.filter((l) => l[0] === s || l[1] === s).map((l) => ({ s: l[0] === s ? l[1] : l[0], w: l[2] })).sort((a, b) => b.w - a.w).slice(0, 6);
const row = (k: string, v: string) => `<div class="row"><span>${k}</span><span>${v}</span></div>`;
const meter = (k: string, frac: number, val: string, ref?: number, color?: string) =>
  `<div class="bar-r${ref !== undefined ? " click" : ""}"${ref !== undefined ? ` data-r="${ref}"` : ""}${color ? ` style="--c:${color}"` : ""}><span>${esc(k)}</span><span class="meter"><i style="width:${Math.max(2, Math.min(100, frac * 100)).toFixed(1)}%"></i></span><span>${val}</span></div>`;
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
function drawSphere(g: CanvasRenderingContext2D, w: number, h: number, seedN: number, t: number, col: (a?: number) => string = ph, type: PType = "rocky", ringed = true) {
  g.fillStyle = BG; g.fillRect(0, 0, w, h);
  const px = 3, cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.36, rot = t / 4000 + seedN;
  const lx = Math.cos(rot) * 0.7, ly = -0.5, lz = Math.sqrt(Math.max(0, 1 - lx * lx - ly * ly));
  g.fillStyle = col(1);
  for (let y = 0; y < h; y += px) for (let x = 0; x < w; x += px) {
    const nx = (x - cx) / r, ny = (y - cy) / r, d = nx * nx + ny * ny;
    if (d > 1) continue;
    const nz = Math.sqrt(1 - d);
    let l = Math.max(0, nx * lx + ny * ly + nz * lz);
    l *= 0.85 + 0.15 * Math.sin((ny * 6 + seedN) * 2 + Math.sin(nx * 3));
    if (type === "giant") l *= Math.sin(ny * 9 + seedN + Math.sin(nx * 2 + t / 3000) * 0.4) > 0 ? 1.1 : 0.45;
    if (type === "young") l *= 0.62;
    if (type === "ancient") {
      l *= 0.8;
      for (let k = 0; k < 5; k++) { const ax = Math.sin(seedN * 3.1 + k * 2.3) * 0.55, ay = Math.cos(seedN * 1.7 + k * 1.9) * 0.55, cr = 0.12 + (k % 3) * 0.06, dd = Math.hypot(nx - ax, ny - ay); if (dd < cr) l *= dd > cr * 0.75 ? 1.4 : 0.25; }
    }
    if (l * 16 > BAYER[(y / px) & 3][(x / px) & 3] + 0.5) g.fillRect(x, y, px - 1, px - 1);
  }
  if (ringed) { g.strokeStyle = col(0.8); g.lineWidth = 1.5; g.beginPath(); g.ellipse(cx, cy, r * 1.55, r * 0.36, -0.35, 0, Math.PI * 2); g.stroke(); g.lineWidth = 1; }
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
  stars.forEach((st, si) => { const x = cx + (st.x - bounds.x) / s, y = cy + (st.y - bounds.y) / s; g.fillStyle = sc(si, 1); g.shadowColor = sc(si, 1); g.shadowBlur = 5; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3); g.shadowBlur = 0; });
}
function drawWave(g: CanvasRenderingContext2D, w: number, h: number, t: number, seedN: number, live: boolean, col: (a?: number) => string = ph) {
  g.fillStyle = BG; g.fillRect(0, 0, w, h);
  g.strokeStyle = ph(0.12); g.lineWidth = 1; g.beginPath();
  for (let x = 0; x < w; x += 12) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); }
  for (let y = 0; y < h; y += 12) { g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); }
  g.stroke();
  const amp = live ? 0.36 : 0.08, f1 = 2 + (seedN % 5), f2 = 7 + (seedN % 11), sp = live ? t / 280 : t / 1400;
  g.strokeStyle = col(1); g.lineWidth = 1.5; g.shadowColor = col(0.8); g.shadowBlur = 6; g.beginPath();
  for (let x = 0; x <= w; x += 2) {
    const u = x / w * Math.PI * 2;
    const y = h / 2 + h * amp * (Math.sin(u * f1 + sp) * 0.7 + Math.sin(u * f2 - sp * 1.7) * 0.3) * (live ? 0.75 + 0.25 * Math.sin(sp * 0.3) : 1);
    x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
  }
  g.stroke(); g.shadowBlur = 0;
}

// Великий пульсар у досьє зорі
function drawPulsarHero(g: CanvasRenderingContext2D, w: number, h: number, si: number, t: number) {
  g.fillStyle = BG; g.fillRect(0, 0, w, h);
  drawPulsar(g, si, w / 2, h / 2 - 6, w * 0.1, t);
  g.font = `10px ${FONT_LBL}`; g.textAlign = "center"; g.fillStyle = sc(si, 1);
  g.fillText(`${bpm[si]} BPM`, w / 2, h - 7);
}

function render() {
  refs.length = 0;
  const d = $("detail"); let h = ""; const o = sel; let code = "", title = "";
  dosAnim = null;
  const accSi = !o ? -1 : o.kind === "planet" ? planets[o.p].s : o.s;
  document.querySelector<HTMLElement>(".dossier")!.style.setProperty("--acc", accSi >= 0 ? stars[accSi].color : "");
  if (!o) {
    code = `SECTOR // ${map.meta.sector.toUpperCase()}`; title = `SECTOR ${map.meta.sector.toUpperCase()}`;
    const top = stars.map((s, i) => ({ s, i })).sort((a, b) => b.s.tracks - a.s.tracks);
    const mx = top[0]?.s.tracks || 1;
    h = `<div class="hero"><div class="frame" id="hero"><canvas></canvas></div>
        <div class="ident"><span class="code">OBSERVATORY // 01</span><h2 id="dosTitle"></h2><span class="stamp">${map.meta.sample ? "TEST SIGNAL" : "LIVE CATALOGUE"}</span></div></div>
      <div class="rows">${row("STARS / STYLES", fmt(stars.length))}${row("PLANETS / LABELS", fmt(planets.length))}${row("SATELLITES / TRACKS", fmt(map.meta.tracks))}${row("RELEASES", fmt(map.meta.releases))}${row("SOURCE", "DISCOGS · CC0")}</div>
      <p class="lede">Every <b>star</b> is a style. Its orbits hold <b>label planets</b>, circled by <b>track satellites</b>: older ones sit closer in. The dotted lines show how often two styles share a release.</p>
      <div class="bars"><div class="ph-sub">PLANET TYPES</div>${(Object.keys(PTYPE_INFO) as PType[]).map((k) => { const c = ptype.filter((x) => x === k).length; return meter(PTYPE_INFO[k][0], c / Math.max(1, planets.length), fmt(c)); }).join("")}<p class="note">Giants are the biggest labels, ringed worlds are long-runners (15+ years), cratered ones went quiet before 2001, ice worlds started after 2010.</p></div>
      <div class="bars"><div class="ph-sub">STAR SYSTEMS // BY TRACK COUNT</div>${top.map(({ s, i }) => meter(s.name.toUpperCase(), s.tracks / mx, fmt(s.tracks), R({ kind: "star", s: i }), s.color)).join("")}</div>`;
    dosAnim = (t) => { const c = heroCanvas(); if (c) { const f = (c as any)._f || ((c as any)._f = fitCanvas(c)); drawRadar(f.g, f.w, f.h, t); } };
  } else if (o.kind === "star") {
    const s = stars[o.s], pl = planetsByStar[o.s], nb = neighbours(o.s);
    code = `STAR // ST-${pad(o.s, 2)}`; title = s.name.toUpperCase();
    h = `<div class="hero"><div class="frame" id="hero"><canvas></canvas></div>
        <div class="ident"><span class="code">ST-${pad(o.s, 2)} // STYLE</span><h2 id="dosTitle"></h2><span class="stamp">${(s.tracks * 100 / totalTracks).toFixed(1)}% OF SECTOR</span></div></div>
      <div class="rows">${row("RELEASES", fmt(s.n))}${row("PLANETS / LABELS", fmt(pl.length))}${row("TRACKS", fmt(s.tracks))}${row("CLASS", `${sclass[o.s]} · ${starRel[o.s] > 0.75 ? "SUPERGIANT" : starRel[o.s] > 0.5 ? "GIANT" : starRel[o.s] > 0.3 ? "MAIN SEQUENCE" : "DWARF"}`)}${row("LUMINOSITY", `${Math.round(recentShare[o.s] * 100)}% RELEASES IN LAST 10 YRS`)}${row("PULSE", `≈ ${bpm[o.s]} BPM`)}${row("PEAK YEAR", String(peakYear[o.s]))}</div>
      <p class="note">Size shows how many releases the style has; glow shows how alive it is today. The star pulses at the tempo typical for its style and sheds a shell once every bar.</p>
      ${s.yh?.length ? `<div class="hist"><div class="ph-sub">ACTIVITY // RELEASES PER YEAR</div><div class="cols">${s.yh.map((c, k) => `<i style="height:${(c / Math.max(1, ...s.yh!) * 100).toFixed(1)}%" title="${Y0 + k}: ${c}"></i>`).join("")}</div><div class="axis"><span>${Y0}</span><span>${Y0 + Math.round((s.yh.length - 1) / 2)}</span><span>${Y0 + s.yh.length - 1}</span></div></div>` : ""}
      ${nb.length ? `<div class="bars"><div class="ph-sub">GRAVITATIONAL LINKS</div>${nb.map((n) => meter(stars[n.s].name.toUpperCase(), Math.min(1, n.w * 3), `${Math.round(n.w * 100)}%`, R({ kind: "star", s: n.s }), stars[n.s].color)).join("")}</div>` : ""}
      <div><div class="ph-sub">PLANETS IN ORBIT</div><div class="list">${pl.slice(0, 40).map((p, k) => `<button data-r="${R({ kind: "planet", p })}"><span class="n">${pad(k + 1, 3)}</span><span class="t">${esc(planets[p].name)}</span><span class="y">${fmt(planets[p].n)} REL</span></button>`).join("")}</div>
      ${pl.length > 40 ? `<div class="more">…and ${fmt(pl.length - 40)} more</div>` : ""}</div>`;
    const si = o.s;
    dosAnim = (t) => {
      const c = heroCanvas(); if (!c) return; const f = (c as any)._f || ((c as any)._f = fitCanvas(c));
      drawPulsarHero(f.g, f.w, f.h, si, t);
    };
  } else if (o.kind === "planet") {
    const p = planets[o.p], s = stars[p.s], ch = chunks[p.s];
    if (!ch) loadChunk(p.s).then(() => { if (sel === o) render(); });
    const n = p.t1 - p.t0, shown = Math.min(n, 150);
    code = `PLANET // PL-${pad(o.p, 4)}`; title = p.name.toUpperCase();
    let hist = "";
    if (ch && n) {
      const ys = ch.yr.slice(p.t0, p.t1).filter(Boolean);
      if (ys.length) {
        const y0 = Math.min(...ys), y1 = Math.max(...ys), cnt = new Array(y1 - y0 + 1).fill(0);
        ys.forEach((y) => cnt[y - y0]++); const mx = Math.max(...cnt);
        hist = `<div class="hist"><div class="ph-sub">ACTIVITY PER YEAR</div><div class="cols">${cnt.map((c, k) => `<i style="height:${(c / mx * 100).toFixed(1)}%" title="${y0 + k}: ${c}"></i>`).join("")}</div><div class="axis"><span>${y0}</span><span>${Math.round((y0 + y1) / 2)}</span><span>${y1}</span></div></div>`;
      }
    }
    h = `<div class="hero"><div class="frame" id="hero"><canvas></canvas></div>
        <div class="ident"><span class="code">PL-${pad(o.p, 4)} // LABEL</span><h2 id="dosTitle"></h2><span class="stamp">${p.yr[0] || "????"}–${p.yr[1] || "????"}</span></div></div>
      <div class="rows"><div class="row"><span>ORBIT</span><button class="link" data-r="${R({ kind: "star", s: p.s })}">${esc(s.name.toUpperCase())}</button></div>${row("TYPE", PTYPE_INFO[ptype[o.p]][0] + (ptype[o.p] === "giant" && ringedP[o.p] ? " · RINGED" : ""))}${row("RELEASES", fmt(p.n))}${row("TRACKS", fmt(n))}${row("ACTIVE", p.ay ? `${p.ay} OF ${spanOf(p) + 1} YEARS` : `${spanOf(p) + (p.yr[0] ? 1 : 0)} YEARS`)}</div>
      <p class="note">${PTYPE_INFO[ptype[o.p]][0][0]}${PTYPE_INFO[ptype[o.p]][0].slice(1).toLowerCase()}: ${PTYPE_INFO[ptype[o.p]][1]}.</p>
      ${hist}
      ${ch && n && !map.meta.sample ? `<button class="play" data-r="${R({ kind: "track", s: p.s, i: p.t0 })}" data-play="1">▶ PLAY THE ORBIT</button>` : ""}
      <div><div class="ph-sub">SATELLITES</div><div class="list">${ch ? Array.from({ length: shown }, (_, k) => trackItem(p.s, p.t0 + k, k + 1)).join("") : `<p class="note">LOADING…</p>`}</div>
      ${n > shown ? `<div class="more">…and ${fmt(n - shown)} more. Zoom in on the planet to see them all.</div>` : ""}</div>`;
    const sd = hash(p.name) % 100;
    let drawn = false;
    dosAnim = (t) => {
      if (reduce && drawn) return;
      const c = heroCanvas(); if (!c) return; const f = (c as any)._f || ((c as any)._f = fitCanvas(c));
      if (((t / 66) | 0) === (c as any)._last) return; (c as any)._last = (t / 66) | 0;
      drawSphere(f.g, f.w, f.h, sd, t, (a = 1) => sc(p.s, a), ptype[o.p], ringedP[o.p]); drawn = true;
    };
  } else {
    const ch = chunks[o.s]!, s = stars[o.s], pi = ch.p[o.i], p = pi >= 0 ? planets[pi] : null, yt = ch.yt[o.i];
    const near = nearestTracks(o, 8);
    code = `OBJECT // ${trackCode(o.s, o.i)}`; title = ch.t[o.i].toUpperCase();
    h = `<div class="hero"><div class="frame thumb" id="hero"><img alt="" src="https://i.ytimg.com/vi/${esc(yt)}/default.jpg" referrerpolicy="no-referrer"><span class="raster"></span></div>
        <div class="ident"><span class="code">${trackCode(o.s, o.i)} // TRACK</span><h2 id="dosTitle"></h2><span class="by">${esc(ch.an[ch.a[o.i]])}</span></div></div>
      <div class="rows">${row("ARTIST", esc(ch.an[ch.a[o.i]]))}${row("YEAR", ch.yr[o.i] ? String(ch.yr[o.i]) : "----")}
        <div class="row"><span>LABEL</span>${p ? `<button class="link" data-r="${R({ kind: "planet", p: pi })}">${esc(p.name.toUpperCase())}</button>` : "<span>ASTEROID BELT</span>"}</div>
        <div class="row"><span>STYLE</span><button class="link" data-r="${R({ kind: "star", s: o.s })}">${esc(s.name.toUpperCase())}</button></div>
        ${row("COORDINATES", `${ch.x[o.i].toFixed(0)} / ${ch.y[o.i].toFixed(0)}`)}</div>
      <div class="scope-c"><canvas id="wave"></canvas></div>
      ${map.meta.sample ? `<p class="note">TEST SIGNAL: videos won't play.</p>` : `<button class="play" data-r="${R(o)}" data-play="1">${nowPlaying && nowPlaying.s === o.s && nowPlaying.i === o.i ? "◉ ON AIR" : "▶ PLAY"}</button>`}
      <a class="out" href="https://www.youtube.com/watch?v=${esc(yt)}" target="_blank" rel="noopener">OPEN ON YOUTUBE ↗</a>
      ${near.length ? `<div><div class="ph-sub">NEAREST SIGNALS</div><div class="list">${near.map((r, k) => trackItem(r.s, r.i, k + 1)).join("")}</div></div>` : ""}`;
    const sd = hash(yt) % 97;
    dosAnim = (t) => {
      const c = document.getElementById("wave") as HTMLCanvasElement | null; if (!c) return;
      const f = (c as any)._f || ((c as any)._f = fitCanvas(c));
      const live = !!(nowPlaying && nowPlaying.s === o.s && nowPlaying.i === o.i && player.playing);
      if (reduce && (c as any)._done) return; (c as any)._done = true;
      drawWave(f.g, f.w, f.h, t, sd, live, (a = 1) => sc(o.s, a));
    };
  }
  d.innerHTML = h; d.scrollTop = 0;
  scramble($("dosId"), code); scramble(document.getElementById("dosTitle"), title);
  const img = d.querySelector<HTMLImageElement>(".thumb img");
  if (img) img.onerror = () => { img.remove(); const f = $("hero"); f.classList.remove("thumb"); f.insertAdjacentHTML("afterbegin", "<canvas></canvas>"); f.querySelector(".raster")?.remove(); const c = heroCanvas()!; const ff = fitCanvas(c); const si = sel?.kind === "track" ? sel.s : 0; drawSphere(ff.g, ff.w, ff.h, 7, 0, (a = 1) => sc(si, a), "rocky", false); };
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
    m.textContent = code === 101 || code === 150 ? "! EMBEDDING DISABLED BY OWNER. JUMPING TO A NEARBY SIGNAL…" : "! VIDEO UNAVAILABLE. JUMPING TO A NEARBY SIGNAL…";
    setTimeout(next, 1500);
  },
  onPlayingChange: (p) => { $("live").classList.toggle("on", p); $("pToggle").textContent = p ? "❚❚" : "▶"; $("pToggle").setAttribute("aria-label", p ? "Pause" : "Play"); ticker(); },
});
function playTrack(ref: TrackRef) {
  if (map.meta.sample) return;
  const ch = chunks[ref.s]!;
  nowPlaying = ref; played.add(ch.yt[ref.i]);
  const last = hist_[hist_.length - 1];
  if (!last || last.i !== ref.i || last.s !== ref.s) hist_.push(ref);
  showDock(); $("pMsg").hidden = true;
  for (const id of ["playerBox", "dockPill"]) $(id).style.setProperty("--acc", stars[ref.s].color);
  player.play(ch.yt[ref.i]); logTrack(ref); ticker(); dirty = true;
  $("npTitle").textContent = ch.t[ref.i]; $("npArtist").textContent = ch.an[ch.a[ref.i]];
  seekEl.value = "0"; paintRange(seekEl); $("tCur").textContent = "0:00"; $("tDur").textContent = "0:00";
}
function next() { if (!nowPlaying) return; const n = nearestTracks(nowPlaying, 1, played)[0]; if (n) select({ kind: "track", ...n }, true, true); }
$("pNext").onclick = next;
$("pPrev").onclick = () => { if (hist_.length > 1) { hist_.pop(); const r = hist_.pop()!; select({ kind: "track", ...r }, true, true); } };
$("pToggle").onclick = () => player.toggle();
// Floating dock: minimise = pause + collapse to a pill (audio never plays from a hidden player)
const dock = $("playerBox"), pill = $("dockPill");
function showDock() { dock.hidden = false; pill.hidden = true; }
$("dockMin").onclick = () => {
  if (player.playing) player.toggle();
  dock.hidden = true; pill.hidden = false;
  $("pillTitle").textContent = $("npTitle").textContent;
};
pill.onclick = () => { showDock(); if (!player.playing) player.toggle(); };
{ // drag the dock by its header, kept inside the map
  let start: { x: number; y: number; l: number; t: number } | null = null;
  const head = $("dockHead");
  head.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const r = dock.getBoundingClientRect(), v = vp.getBoundingClientRect();
    start = { x: e.clientX, y: e.clientY, l: r.left - v.left, t: r.top - v.top };
    head.setPointerCapture(e.pointerId);
  });
  head.addEventListener("pointermove", (e) => {
    if (!start) return;
    const v = vp.getBoundingClientRect();
    const l = Math.max(0, Math.min(v.width - dock.offsetWidth, start.l + e.clientX - start.x));
    const t = Math.max(0, Math.min(v.height - dock.offsetHeight, start.t + e.clientY - start.y));
    Object.assign(dock.style, { left: `${l}px`, top: `${t}px`, right: "auto", bottom: "auto" });
  });
  const end = () => { start = null; };
  head.addEventListener("pointerup", end); head.addEventListener("pointercancel", end);
}

// Transport: seek bar, time, volume (the YouTube player itself stays visible above)
const seekEl = $<HTMLInputElement>("seek"), volEl = $<HTMLInputElement>("vol");
const mmss = (t: number) => `${Math.floor(t / 60)}:${pad(Math.floor(t % 60), 2)}`;
let seeking = false;
const paintRange = (el: HTMLInputElement) => el.style.setProperty("--p", `${(+el.value - +el.min) / (+el.max - +el.min) * 100}%`);
seekEl.addEventListener("input", () => { seeking = true; paintRange(seekEl); $("tCur").textContent = mmss(+seekEl.value / 1000 * player.duration()); });
seekEl.addEventListener("change", () => { player.seek(+seekEl.value / 1000 * player.duration()); seeking = false; });
try { const v = localStorage.getItem("kosmos-vol"); if (v !== null) volEl.value = v; } catch { /* */ }
const applyVol = () => { player.setVolume(+volEl.value); paintRange(volEl); try { localStorage.setItem("kosmos-vol", volEl.value); } catch { /* */ } };
volEl.addEventListener("input", applyVol); applyVol();
setInterval(() => {
  if ($("playerBox").hidden || seeking) return;
  const d = player.duration(), t = player.time();
  seekEl.value = String(d ? Math.round(t / d * 1000) : 0); paintRange(seekEl);
  $("tCur").textContent = mmss(t); $("tDur").textContent = d ? mmss(d) : "0:00";
}, 250);

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
    : `<p class="note">NO ENTRIES YET. SIGNALS YOU PLAY WILL SHOW UP HERE.</p>`;
}
$("log").addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-s]"); if (b) select({ kind: "track", s: +b.dataset.s!, i: +b.dataset.i! }, true, true); });

// ---------- Телеметрія ----------
function ticker() {
  let np = "ON AIR: SILENCE";
  if (nowPlaying && chunks[nowPlaying.s]) { const ch = chunks[nowPlaying.s]!; np = `ON AIR: <b>${esc(ch.an[ch.a[nowPlaying.i]])} — ${esc(ch.t[nowPlaying.i])}</b>${player.playing ? "" : " [PAUSED]"}`; }
  const parts = [np, `STARS <b>${stars.length}</b>`, `PLANETS <b>${fmt(planets.length)}</b>`, `SATELLITES <b>${fmt(map.meta.tracks)}</b>`, `RELEASES <b>${fmt(map.meta.releases)}</b>`,
    (() => { const b = stars.slice().sort((a, b) => b.tracks - a.tracks)[0]; return `LARGEST SYSTEM <b style="color:${b?.color}">${esc(b?.name.toUpperCase() || "—")}</b>`; })(), `LINKS <b>${links.length}</b>`, `PLAYED <b>${log.length}</b>`, `SOURCE <b>DISCOGS CC0</b>`];
  const one = parts.map((p) => `<span>${p}</span>`).join("");
  $("ticker").innerHTML = one + one;
}
setInterval(() => { const d = new Date(); $("clock").textContent = `${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(d.getSeconds(), 2)}`; }, 1000);

// ---------- Text glitch during a jump ----------
// Every text field on the terminal flickers and dissolves into noise while the wormhole runs,
// then the new dossier decodes back in.
const NOISE = "▓▒░#/\\<>01*+=%$&@";
function textNodes(root: Element | null): Text[] {
  if (!root) return [];
  const out: Text[] = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) if (n.nodeValue && n.nodeValue.trim()) out.push(n as Text);
  return out;
}
function corrupt(orig: string, amount: number) {
  let out = "";
  for (const c of orig) out += c === " " || c === "\n" || Math.random() >= amount ? c : NOISE[(Math.random() * NOISE.length) | 0];
  return out;
}
// shape(k) → share of corrupted characters at progress k (0…1); originals are restored at the end
function glitchNodes(nodes: Text[], ms: number, shape: (k: number) => number) {
  if (reduce || !nodes.length) return;
  const items = nodes.map((n) => ({ n, orig: n.nodeValue! })), t0 = performance.now();
  let lastTick = 0;
  const tick = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    if (now - lastTick > 45 || k >= 1) {
      lastTick = now;
      for (const it of items) if (it.n.isConnected) it.n.nodeValue = k >= 1 ? it.orig : corrupt(it.orig, shape(k));
    }
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
const UI_ROOTS = [".bar", ".scope .ph-head", ".ph-foot", ".dossier > .ph-head", ".pbar", ".log", ".hints"];
function glitchUI(ms: number) {
  if (reduce) return;
  const term = document.querySelector(".term")!;
  term.classList.add("glitching");
  setTimeout(() => term.classList.remove("glitching"), ms * 0.9);
  // the old dossier dissolves completely before the jump; the rest of the UI rises and falls
  glitchNodes(textNodes($("detail")), ms * 0.8, (k) => Math.min(1, k * 1.6));
  glitchNodes(UI_ROOTS.flatMap((q) => [...document.querySelectorAll(q)].flatMap(textNodes)), ms * 0.92, (k) => Math.pow(Math.sin(Math.PI * k), 0.6) * 0.85);
}
// short decode of the dossier when moving between objects
function decodeDossier(ms = 380) { glitchNodes(textNodes($("detail")), ms, (k) => 1 - k); }

// ---------- Червоточина ----------
// Перехід через міжзоряний простір: зорі розтягуються в штрихи, тунель кілець затягує,
// колір перетікає з поточної системи в систему призначення, спалах — і ми на місці.
const wf = document.createElement("canvas"); wf.className = "wormhole"; wf.setAttribute("aria-hidden", "true"); vp.appendChild(wf);
const wg = wf.getContext("2d")!;
let warping = false;
function nearestStarToCam() { let b = 0, bd = Infinity; stars.forEach((s, i) => { const d = (s.x - cam.x) ** 2 + (s.y - cam.y) ** 2; if (d < bd) { bd = d; b = i; } }); return b; }
function wormhole(fromSi: number, toSi: number, dest: string, onPeak: () => void) {
  if (reduce) { onPeak(); return; }
  warping = true;
  const dpr = Math.min(2, devicePixelRatio || 1), w = W, h = H;
  wf.width = w * dpr; wf.height = h * dpr; wg.setTransform(dpr, 0, 0, dpr, 0, 0); wf.style.display = "block";
  const A = SC[fromSi], B = SC[toSi];
  const mix = (k: number, a: number) => { k = Math.max(0, Math.min(1, k)); return `rgba(${(A[0] + (B[0] - A[0]) * k) | 0},${(A[1] + (B[1] - A[1]) * k) | 0},${(A[2] + (B[2] - A[2]) * k) | 0},${a})`; };
  const R = Math.hypot(w, h) / 2;
  const parts = Array.from({ length: 280 }, () => ({ a: Math.random() * 6.283, z: 0.05 + Math.random() * 0.95, sp: 0.6 + Math.random() * 0.9 }));
  const T = 2600, t0 = performance.now();
  glitchUI(T);
  let peaked = false, last = t0;
  const code = `${pad(Math.floor(Math.random() * 9999), 4)}.${pad(Math.floor(Math.random() * 999), 3)}`;
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / T), dt = Math.min(50, now - last) / 16.7; last = now;
    const fadeIn = Math.min(1, k / 0.16), fadeOut = k > 0.84 ? 1 - (k - 0.84) / 0.16 : 1, vis = Math.min(fadeIn, fadeOut);
    const speed = Math.sin(Math.PI * Math.min(1, k * 1.12));
    const vx = w / 2 + Math.sin(k * 9) * w * 0.035 * speed, vy = h / 2 + Math.cos(k * 7) * h * 0.035 * speed;
    wg.globalCompositeOperation = "source-over"; wg.clearRect(0, 0, w, h);
    wg.fillStyle = `rgba(3,2,8,${0.94 * vis})`; wg.fillRect(0, 0, w, h);
    wg.globalCompositeOperation = "lighter";
    // зоряні штрихи
    const v = 0.004 + 0.05 * speed;
    wg.lineWidth = 1.4;
    for (const p of parts) {
      const z1 = p.z; p.z -= v * p.sp * dt;
      if (p.z <= 0.02) { p.z = 1; p.a = Math.random() * 6.283; continue; }
      const r0 = R * 0.05 / z1, r1 = R * 0.05 / p.z, ca = Math.cos(p.a), sa = Math.sin(p.a);
      wg.strokeStyle = mix(k * 1.3 - p.z * 0.3, (1 - p.z) * 0.95 * vis);
      wg.beginPath(); wg.moveTo(vx + ca * r0, vy + sa * r0); wg.lineTo(vx + ca * r1, vy + sa * r1); wg.stroke();
    }
    // тунель кілець
    const tunnel = Math.max(0, Math.min(1, (k - 0.1) / 0.18)) * vis;
    if (tunnel > 0) {
      const n = 16, flow = (now - t0) / 420;
      for (let i = 0; i < n; i++) {
        const z = (((i / n) - flow) % 1 + 1) % 1 + 0.015;
        const r = R * 0.07 / z; if (r > R * 1.8) continue;
        const twist = (1 - z) * 0.9 + k * 4;
        const ox = Math.sin(i * 1.7 + k * 8) * R * 0.025 * (1 - z), oy = Math.cos(i * 1.3 + k * 6) * R * 0.025 * (1 - z);
        wg.strokeStyle = mix(k * 1.4 - z * 0.4, (1 - z) * 0.85 * tunnel);
        wg.lineWidth = Math.max(1, 4 * (1 - z));
        wg.setLineDash([r * 0.22, r * 0.1]); wg.lineDashOffset = (i % 2 ? 1 : -1) * flow * 40;
        wg.beginPath(); wg.ellipse(vx + ox, vy + oy, r, r * 0.92, twist, 0, Math.PI * 2); wg.stroke();
      }
      wg.setLineDash([]);
    }
    // вихід: ядро росте й засліплює
    const grow = Math.max(0, (k - 0.5) / 0.32);
    const cr = R * (0.03 + 0.5 * grow ** 3);
    const gr = wg.createRadialGradient(vx, vy, 0, vx, vy, cr);
    gr.addColorStop(0, `rgba(255,255,255,${0.95 * vis})`); gr.addColorStop(0.4, mix(1, 0.7 * vis)); gr.addColorStop(1, mix(1, 0));
    wg.fillStyle = gr; wg.beginPath(); wg.arc(vx, vy, cr, 0, 7); wg.fill();
    if (k > 0.72 && k < 0.96) { wg.fillStyle = `rgba(255,255,255,${Math.sin(Math.PI * (k - 0.72) / 0.24) * 0.85})`; wg.fillRect(0, 0, w, h); }
    // телеметрія переходу
    wg.globalCompositeOperation = "source-over";
    const ta = Math.min(1, k / 0.1) * (k > 0.7 ? Math.max(0, 1 - (k - 0.7) / 0.08) : 1);
    if (ta > 0) {
      const flick = Math.random() < 0.06 ? 0.35 : 1;
      wg.globalAlpha = ta * flick; wg.textAlign = "center"; wg.fillStyle = mix(k * 1.3, 1);
      wg.font = `${Math.round(Math.max(14, Math.min(26, w / 24)))}px ${FONT_LBL}`;
      wg.fillText("WORMHOLE // TRANSIT", w / 2, h * 0.2);
      wg.font = `12px ${FONT_LBL}`; wg.fillStyle = "rgba(255,255,255,0.8)";
      const shown = Math.floor(dest.length * Math.min(1, k / 0.55));
      wg.fillText(`→ ${dest.slice(0, shown)}${"▓▒░".charAt(Math.floor(now / 60) % 3).repeat(Math.max(0, Math.min(6, dest.length - shown)))}`, w / 2, h * 0.2 + 24);
      // смуга дистанції
      const bw = Math.min(320, w * 0.6), bx = w / 2 - bw / 2, by = h * 0.8;
      wg.strokeStyle = mix(k, 0.8); wg.lineWidth = 1; wg.strokeRect(bx, by, bw, 8);
      wg.fillStyle = mix(k, 1); wg.fillRect(bx + 2, by + 2, (bw - 4) * Math.min(1, k / 0.72), 4);
      wg.font = `11px ${FONT_LBL}`; wg.fillStyle = "rgba(255,255,255,0.7)";
      wg.fillText(`DISTANCE ${code} LY · ${Math.round(Math.min(1, k / 0.72) * 100)}%`, w / 2, by + 24);
      wg.globalAlpha = 1;
    }
    if (!peaked && k >= 0.8) { peaked = true; onPeak(); }
    if (k < 1) requestAnimationFrame(step);
    else { wf.style.display = "none"; warping = false; }
  };
  requestAnimationFrame(step);
}

// ---------- Кнопки й клавіші ----------
const goHome = () => { select(null); fly(bounds.x, bounds.y, homeScale()); };
const warp = async () => {
  if (warping) return;
  let r = Math.random() * totalTracks, s = 0;
  while (s < stars.length - 1 && r > stars[s].tracks) { r -= stars[s].tracks; s++; }
  const ch = await loadChunk(s), i = Math.floor(Math.random() * ch.yt.length);
  const from = !sel ? nearestStarToCam() : sel.kind === "planet" ? planets[sel.p].s : sel.s;
  const autoplay = !!nowPlaying;
  wormhole(from, s, `${trackCode(s, i)} · ${stars[s].name.toUpperCase()}`, () => {
    const pi = ch.p[i], q = pi >= 0 ? planetPos(pi) : { x: ch.x[i], y: ch.y[i] };
    tween = null; cam.x = q.x; cam.y = q.y; cam.s = clampS(LOD_TITLES * 1.3);
    select({ kind: "track", s, i }, false, autoplay);
  });
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
let hits: { label: string; kind: string; color?: string; go: () => void }[] = [], cur = 0;
q.addEventListener("input", () => {
  const s = q.value.trim().toLowerCase();
  if (s.length < 2) { res.hidden = true; return; }
  hits = [];
  stars.forEach((st, i) => { if (st.name.toLowerCase().includes(s)) hits.push({ label: st.name, kind: "STAR", color: st.color, go: () => select({ kind: "star", s: i }) }); });
  for (let i = 0; i < planets.length && hits.length < 14; i++) if (planets[i].name.toLowerCase().includes(s)) hits.push({ label: planets[i].name, kind: "PLANET", color: stars[planets[i].s].color, go: () => select({ kind: "planet", p: i }) });
  if (artists) for (let i = 0; i < artists.length && hits.length < 24; i++) {
    const [name, st, ti] = artists[i];
    if (name.toLowerCase().includes(s)) hits.push({ label: name, kind: "ARTIST", go: () => loadChunk(st).then(() => select({ kind: "track", s: st, i: ti })) });
  }
  cur = 0; res.hidden = false;
  res.innerHTML = hits.length ? hits.map((h, i) => `<button data-h="${i}" class="${i === 0 ? "on" : ""}"><span class="k">${h.kind}</span>${h.color ? `<i class="sw" style="background:${h.color}"></i>` : ""}<span>${esc(h.label)}</span></button>`).join("") : `<p class="note" style="padding:8px 10px">NOTHING FOUND IN THIS SECTOR.</p>`;
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
// Test hook: #test-<videoId> plays one YouTube video through the transport (works with the test map too)
const tm = location.hash.match(/^#test-([A-Za-z0-9_-]{11})$/);
if (tm) {
  showDock(); $("npTitle").textContent = "TEST SIGNAL"; $("npArtist").textContent = tm[1];
  player.play(tm[1]);
}
const m = location.hash.match(/^#t(\d+)-(\d+)$/);
if (m && +m[1] < stars.length) loadChunk(+m[1]).then((ch) => { if (+m[2] < ch.yt.length) select({ kind: "track", s: +m[1], i: +m[2] }); });
