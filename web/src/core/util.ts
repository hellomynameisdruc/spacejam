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
