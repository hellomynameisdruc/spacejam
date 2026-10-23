// Overlays (the safety briefing, the pilot card) all work one way: the page behind dims, the keyboard
// stays inside the card (Tab cycles through it, Esc closes), focus goes back where it came from, and
// the map's own keys rest meanwhile. The player is never covered: it rises above the dimming, and its
// video is never drawn over (YouTube's rule).
import { uiZoom } from "../core/dom";

type Open = { el: HTMLElement; back: HTMLElement | null; close: () => void; keys?: Record<string, () => void> };
const stack: Open[] = [];
const listeners: (() => void)[] = [];
/** the rail and others want to know when an overlay opens or closes */
export const onModal = (f: () => void) => { listeners.push(f); };
export const topModal = () => stack[stack.length - 1]?.el ?? null;

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])";
const focusables = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);

export function openModal(el: HTMLElement, close: () => void, opt: { focus?: HTMLElement | null; keys?: Record<string, () => void> } = {}) {
  if (stack.some((o) => o.el === el)) return;
  stack.push({ el, back: document.activeElement as HTMLElement | null, close, keys: opt.keys });
  el.hidden = false; el.classList.add("overlay");
  document.body.classList.add("modal-open");
  clearOfPlayer(el);
  (opt.focus ?? focusables(el)[0] ?? el).focus({ preventScroll: true });
  listeners.forEach((f) => f());
}
/** on a wide screen the card moves clear of the player (which stays above the dimming), if there's room */
function clearOfPlayer(el: HTMLElement) {
  el.style.paddingRight = "";
  const dock = document.getElementById("playerBox"), card = el.firstElementChild as HTMLElement | null;
  if (!dock || dock.hidden || !card || innerWidth <= 860) return;
  const r = dock.getBoundingClientRect(), z = uiZoom(el), left = r.left / z, w = card.offsetWidth;
  if (left > Math.min(w, 640) + 40) el.style.paddingRight = `${(innerWidth - r.left) / z + 12}px`;
}
export function closeModal(el: HTMLElement) {
  const k = stack.findIndex((o) => o.el === el); if (k < 0) { el.hidden = true; return; }
  const [o] = stack.splice(k, 1);
  el.hidden = true;
  if (!stack.length) document.body.classList.remove("modal-open");
  o.back?.focus?.({ preventScroll: true });
  listeners.forEach((f) => f());
}

export function initModals() {
  addEventListener("keydown", (e) => {
    const top = stack[stack.length - 1]; if (!top) return;
    const typing = (e.target as HTMLElement).tagName === "INPUT";
    if (e.key === "Escape") { e.preventDefault(); top.close(); }
    else if (e.key === "Tab") {
      const f = focusables(top.el); if (!f.length) { e.preventDefault(); return; }
      const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      else if (i < 0) { e.preventDefault(); f[0].focus(); }
      return;
    } else if (!typing && top.keys?.[e.key]) { e.preventDefault(); top.keys[e.key](); }
    if (!typing || e.key === "Escape") e.stopImmediatePropagation(); // the map's keys rest while a card is open
  }, true);
  // a click on the dimmed page closes the card
  addEventListener("pointerdown", (e) => { const top = stack[stack.length - 1]; if (top && e.target === top.el) top.close(); });
}
