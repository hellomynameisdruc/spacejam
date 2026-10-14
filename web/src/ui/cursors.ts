// Pixel-art mouse cursors in the terminal style. Each shape is a small grid: X = phosphor fill,
// o = dark outline (added automatically around X when a shape has none), . = transparent.
// Drawn as crisp SVG at 2px per cell, coloured from the current phosphor.

type Shape = { rows: string[]; hot: [number, number] }; // hotspot in cells

// Each cell is 1.5 CSS px. The SVG is drawn at 3 px per cell and declared as a 2x image, so on a
// Retina screen every cell is exactly 3 device pixels (crisp), at ~3/4 of the old size.
const CELL = 3, CSS_CELL = 1.5;

function grid(w: number, h: number, fill: (x: number, y: number) => boolean): string[] {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) { let r = ""; for (let x = 0; x < w; x++) r += fill(x, y) ? "X" : "."; rows.push(r); }
  return rows;
}
// surround every X with a 1-cell dark outline (8-neighbourhood) so the cursor reads on any background
function outline(rows: string[]): string[] {
  const h = rows.length, w = rows[0].length, at = (x: number, y: number) => rows[y]?.[x] === "X";
  return rows.map((r, y) => [...r].map((c, x) => {
    if (c !== ".") return c;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy)) return "o";
    return ".";
  }).join("")).slice(0, h).map((r) => r.slice(0, w));
}

const C = 7, N = 15; // 15×15 cells, centre cell 7
const ARROW: Shape = {
  rows: [
    "o..........",
    "oo.........",
    "oXo........",
    "oXXo.......",
    "oXXXo......",
    "oXXXXo.....",
    "oXXXXXo....",
    "oXXXXXXo...",
    "oXXXXXXXo..",
    "oXXXXXXXXo.",
    "oXXXXXXoooo",
    "oXXoXXo....",
    "oXo.oXXo...",
    "oo..oXXo...",
    "o....oXXo..",
    ".....oooo..",
  ],
  hot: [0, 0],
};
const HAND: Shape = {
  rows: [
    "....oo.......",
    "...oXXo......",
    "...oXXo......",
    "...oXXo......",
    "...oXXoooo...",
    "...oXXoXXoooo",
    ".oooXXoXXoXXo",
    "oXXoXXXXXXXXo",
    "oXXXXXXXXXXXo",
    ".oXXXXXXXXXXo",
    "..oXXXXXXXXXo",
    "..oXXXXXXXXo.",
    "...oXXXXXXXo.",
    "...oXXXXXXo..",
    "....oooooo...",
  ],
  hot: [4, 1],
};
// targeting reticle: gapped cross + centre pip
const CROSS: Shape = {
  rows: outline(grid(N, N, (x, y) =>
    (x === C && y === C) ||
    (x === C && ((y >= 1 && y <= 4) || (y >= 10 && y <= 13))) ||
    (y === C && ((x >= 1 && x <= 4) || (x >= 10 && x <= 13))))),
  hot: [C, C],
};
// locked on: corner brackets + small plus
const LOCK: Shape = {
  rows: outline(grid(N, N, (x, y) => {
    const cx = x === 1 || x === 13, cy = y === 1 || y === 13;
    const bx = (x === 1 || x === 13) && (y <= 4 || y >= 10) && y >= 1 && y <= 13;
    const by = (y === 1 || y === 13) && (x <= 4 || x >= 10) && x >= 1 && x <= 13;
    const plus = (x === C && Math.abs(y - C) <= 1) || (y === C && Math.abs(x - C) <= 1);
    return (cx && cy) || bx || by || plus;
  })),
  hot: [C, C],
};
// not allowed: a ring crossed out
const DENY: Shape = {
  rows: outline(grid(N, N, (x, y) => {
    const d = Math.hypot(x - C, y - C), ring = d >= 5.2 && d <= 6.4;
    return ring || (Math.abs((x - C) - (y - C)) <= 0.5 && d < 5.6);
  })),
  hot: [C, C],
};
// dragging: four-way move arrows
const MOVE: Shape = {
  rows: outline(grid(N, N, (x, y) => {
    const line = (x === C && y >= 2 && y <= 12) || (y === C && x >= 2 && x <= 12);
    const heads = [[C - 1, 3], [C + 1, 3], [C - 1, 11], [C + 1, 11], [3, C - 1], [3, C + 1], [11, C - 1], [11, C + 1],
      [C - 2, 4], [C + 2, 4], [C - 2, 10], [C + 2, 10], [4, C - 2], [4, C + 2], [10, C - 2], [10, C + 2]];
    return line || heads.some(([hx, hy]) => hx === x && hy === y);
  })),
  hot: [C, C],
};
// text: I-beam
const TEXT: Shape = {
  rows: outline(grid(11, 15, (x, y) => (x === 5 && y >= 1 && y <= 13) || ((y === 1 || y === 13) && x >= 3 && x <= 7 && x !== 5) || ((y === 1 || y === 13) && x === 5))),
  hot: [5, 7],
};

function svg(shape: Shape, fill: string, edge: string) {
  const h = shape.rows.length, w = Math.max(...shape.rows.map((r) => r.length));
  let rects = "";
  shape.rows.forEach((r, y) => [...r].forEach((c, x) => {
    if (c === ".") return;
    rects += `<rect x='${x * CELL}' y='${y * CELL}' width='${CELL}' height='${CELL}' fill='${c === "X" ? fill : edge}'/>`;
  }));
  const body = `<svg xmlns='http://www.w3.org/2000/svg' width='${w * CELL}' height='${h * CELL}' shape-rendering='crispEdges'>${rects}</svg>`;
  const mid = shape === ARROW || shape === HAND ? 0 : 0.5;
  const hx = Math.round((shape.hot[0] + mid) * CSS_CELL), hy = Math.round((shape.hot[1] + mid) * CSS_CELL);
  return `image-set(url("data:image/svg+xml,${encodeURIComponent(body)}") 2x) ${hx} ${hy}`;
}

let edgeColor = "#07060e";
const lockCache = new Map<string, string>();

/** Set the CSS cursor variables for the current phosphor colour. */
export function applyCursors(fill: string, edge: string) {
  edgeColor = edge; lockCache.clear();
  const st = document.documentElement.style;
  st.setProperty("--cur-arrow", `${svg(ARROW, fill, edge)}, default`);
  st.setProperty("--cur-hand", `${svg(HAND, fill, edge)}, pointer`);
  st.setProperty("--cur-cross", `${svg(CROSS, fill, edge)}, crosshair`);
  st.setProperty("--cur-move", `${svg(MOVE, fill, edge)}, grabbing`);
  st.setProperty("--cur-text", `${svg(TEXT, fill, edge)}, text`);
  st.setProperty("--cur-lock", `${svg(LOCK, fill, edge)}, pointer`);
}

/** Red "not here" cursor (e.g. an odyssey can't end in the system it starts from). */
export function denyCursor() {
  let c = lockCache.get("deny");
  if (!c) { c = `${svg(DENY, "#ff4d6d", edgeColor)}, not-allowed`; lockCache.set("deny", c); }
  return c;
}

/** Lock-on reticle tinted with the hovered object's system colour. */
export function lockCursor(color: string) {
  let c = lockCache.get(color);
  if (!c) { c = `${svg(LOCK, color, edgeColor)}, pointer`; lockCache.set(color, c); }
  return c;
}
