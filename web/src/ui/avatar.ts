// Pilot portraits: a helmet drawn in pixels, different for every number — helmet shape, visor, antenna,
// markings and the glint on the glass all come from the pilot's avatar number. Drawn in the phosphor.
const mulberry = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const G = 12, ROWS = 13;

export function avatarCells(seed: number) {
  const rnd = mulberry(seed), pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const shape = pick(["round", "square", "tall"] as const), cy = 7;
  const inH = (x: number, y: number) => {
    const dx = x + 0.5 - G / 2, dy = y + 0.5 - cy;
    if (y > 11) return false;
    if (shape === "round") return dx * dx + dy * dy <= 5.4 * 5.4;
    if (shape === "square") return Math.abs(dx) <= 5 && dy >= -4.5 && dy <= 4.5 && !(Math.abs(dx) > 4 && Math.abs(dy) > 3.5);
    return (dx * dx) / 20 + (dy * dy) / 30 <= 1;
  };
  const vt = pick(["band", "wide", "slit", "round"] as const), vy = 5 + Math.floor(rnd() * 2), vx = 2 + Math.floor(rnd() * 2);
  const inV = (x: number, y: number) => {
    if (vt === "round") { const dx = x + 0.5 - G / 2, dy = y + 0.5 - (vy + 2); return dx * dx + dy * dy <= 2.9 * 2.9; }
    const h = vt === "slit" ? 1 : vt === "band" ? 3 : 4;
    if (y < vy || y >= vy + h || x < vx || x >= G - vx) return false;
    return !(vt === "wide" && (y === vy || y === vy + h - 1) && (x === vx || x === G - vx - 1)); // rounded corners
  };
  const deco = Array.from({ length: (G / 2) * ROWS }, () => rnd() < 0.22), stripe = rnd() < 0.35, ant = pick([0, 0, 1, 2]);
  const cells: [number, number, number][] = []; // x, y, opacity
  const helmetTop = (x: number) => { for (let y = 0; y < ROWS; y++) if (inH(x, y)) return y; return ROWS; };
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < G; x++) {
    if (!inH(x, y)) continue;
    const edge = !inH(x - 1, y) || !inH(x + 1, y) || !inH(x, y - 1) || !inH(x, y + 1), m = x < G / 2 ? x : G - 1 - x;
    if (edge) cells.push([x, y, 1]);
    else if (inV(x, y)) cells.push([x, y, 0.1]);
    else if (stripe && (x === 5 || x === 6) && y < vy) cells.push([x, y, 0.95]);
    else cells.push([x, y, deco[y * (G / 2) + m] ? 0.22 : 0.55]);
  }
  // the glint on the visor
  const vis = cells.filter(([x, , o]) => o === 0.1 && x < G / 2).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  if (vis[0]) { vis[0][2] = 0.95; const n = cells.find(([x, y]) => x === vis[0][0] + 1 && y === vis[0][1]); if (n && n[2] === 0.1) n[2] = 0.6; }
  // antenna: one in the middle, or two at the sides
  if (ant === 1) { const t = helmetTop(5); for (let y = t - 2; y < t; y++) if (y >= 0) cells.push([5, y, 0.9], [6, y, y === t - 2 ? 0 : 0.9]); if (t - 3 >= 0) cells.push([5, t - 3, 1]); }
  if (ant === 2) for (const x of [2, G - 3]) { const t = helmetTop(x); if (t - 1 >= 0) cells.push([x, t - 1, 0.9]); if (t - 2 >= 0) cells.push([x, t - 2, 1]); }
  // the collar
  for (let x = 3; x < G - 3; x++) cells.push([x, 12, x === 3 || x === G - 4 ? 0.5 : 0.85]);
  return cells.filter((c) => c[2] > 0);
}

export function avatarSvg(seed: number, size = 48, cls = "ava") {
  const rects = avatarCells(seed).map(([x, y, o]) => `<rect x="${x}" y="${y}" width="1" height="1"${o < 1 ? ` opacity="${o}"` : ""}/>`).join("");
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="-0.5 0 13 13" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}
