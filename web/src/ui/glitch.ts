// Text effects: decoding titles, and the whole terminal flickering into noise during a wormhole jump.
import { $, reduce } from "../core/dom";

const NOISE = "▓▒░#/\\<>01*+=%$&@";

/** text resolves from noise left to right */
export function scramble(el: Element | null, text: string) {
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
/** shape(k) → share of corrupted characters at progress k (0…1); originals are restored at the end */
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

const UI_ROOTS = [".bar", ".scope .ph-head", ".ph-foot", ".dossier > .ph-head", ".pbar", ".logp > .ph-head", ".log", ".hints"];
export function glitchUI(ms: number) {
  if (reduce) return;
  const term = document.querySelector(".term")!;
  term.classList.add("glitching");
  setTimeout(() => term.classList.remove("glitching"), ms * 0.9);
  // the old dossier dissolves completely before the jump; the rest of the UI rises and falls
  glitchNodes(textNodes($("detail")), ms * 0.8, (k) => Math.min(1, k * 1.6));
  glitchNodes(UI_ROOTS.flatMap((q) => [...document.querySelectorAll(q)].flatMap(textNodes)), ms * 0.92, (k) => Math.pow(Math.sin(Math.PI * k), 0.6) * 0.85);
}
/** short decode of the dossier when moving between objects */
export function decodeDossier(ms = 380) { glitchNodes(textNodes($("detail")), ms, (k) => 1 - k); }
