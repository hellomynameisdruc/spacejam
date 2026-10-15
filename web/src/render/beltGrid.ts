// Spatial grid over each system's asteroid-belt tracks (planet satellites move, and are found through
// their planet instead): finds the belt points inside an area quickly.
import { baseChunk, galaxy } from "../app/state";

const CELL = 48;
type Grid = Map<number, number[]>;
const grids: (Grid | null)[] = galaxy.stars.map(() => null);
const gkey = (cx: number, cy: number) => (cx + 32768) * 65536 + (cy + 32768);

function gridOf(si: number): Grid | null {
  if (grids[si]) return grids[si];
  const ch = baseChunk(si); if (!ch) return null;
  const g: Grid = new Map();
  for (let i = 0; i < ch.x.length; i++) { if (ch.p[i] >= 0) continue; const k = gkey(Math.floor(ch.x[i] / CELL), Math.floor(ch.y[i] / CELL)); let a = g.get(k); if (!a) g.set(k, (a = [])); a.push(i); }
  return (grids[si] = g);
}

/** calls fn(i) for each belt track of star si whose position may lie in the box */
export function eachTrack(si: number, x0: number, y0: number, x1: number, y1: number, fn: (i: number) => void) {
  const g = gridOf(si); if (!g) return;
  const st = galaxy.stars[si];
  x0 = Math.max(x0, st.x - st.R); y0 = Math.max(y0, st.y - st.R); x1 = Math.min(x1, st.x + st.R); y1 = Math.min(y1, st.y + st.R);
  if (x0 > x1 || y0 > y1) return;
  for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
    for (let cy = Math.floor(y0 / CELL); cy <= Math.floor(y1 / CELL); cy++) { const a = g.get(gkey(cx, cy)); if (a) for (const i of a) fn(i); }
}
