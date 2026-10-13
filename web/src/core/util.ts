// Small pure helpers shared by every layer.

export const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
export const fmt = (n: number) => n.toLocaleString("en-US").replace(/ /g, " ");
export const pad = (n: number, w: number) => String(n).padStart(w, "0");
export const mmss = (t: number) => `${Math.floor(t / 60)}:${pad(Math.floor(t % 60), 2)}`;
/** FNV-1a 32-bit — stable per-name randomness */
export const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Park–Miller generator; returns a function giving numbers in (0, 1) */
export const lcg = (seed: number) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
/** the part [t0, t1] of segment A→B inside the box (Liang–Barsky), or null */
export function clipSeg(ax: number, ay: number, bx: number, by: number, x0: number, y0: number, x1: number, y1: number): [number, number] | null {
  const dx = bx - ax, dy = by - ay; let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [t0, t1];
}
