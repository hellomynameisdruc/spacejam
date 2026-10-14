// Pointer, wheel, keyboard and the map's buttons.
import type { Vec } from "../core/types";
import { $, uiZoom } from "../core/dom";
import { galaxy, sameSel, state } from "../app/state";
import { endPick, goHome, next, pickBlocked, select, toggleBeacon, warp, zoomBy } from "../app/actions";
import { cam } from "../render/camera";
import { sc } from "../render/palette";
import { pick } from "../render/picker";
import { sceneCanvas } from "../render/scene";
import { denyCursor, lockCursor } from "./cursors";
import { player } from "./dock";
import { closeSearch, searchInput } from "./search";

export function initInput() {
  const cv = sceneCanvas();
  const local = (e: PointerEvent | WheelEvent): Vec => { const r = cv.getBoundingClientRect(), z = uiZoom(cv); return { x: (e.clientX - r.left) / z, y: (e.clientY - r.top) / z }; };
  const ptrs = new Map<number, Vec>();
  let dragged = 0, pinch0: { d: number; s: number } | null = null, hoverT = 0, wasBlocked = false;

  cv.addEventListener("pointerdown", (e) => {
    cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, local(e)); dragged = 0; cv.classList.add("drag");
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), s: cam.s }; }
  });
  cv.addEventListener("pointermove", (e) => {
    const L = local(e);
    if (!ptrs.has(e.pointerId)) {
      // hover: at most every 40 ms; only star markers live on the static layer
      const now = performance.now(); if (now - hoverT < 40) return; hoverT = now;
      const h = pick(L.x, L.y), blocked = pickBlocked(h);
      if (!sameSel(h, state.hover) || blocked !== wasBlocked) {
        if (h?.kind === "star" || state.hover?.kind === "star") state.dirty = true;
        state.hover = h; wasBlocked = blocked;
        cv.style.cursor = blocked ? denyCursor() : h ? lockCursor(sc(h.kind === "planet" ? galaxy.planets[h.p].s : h.s)) : "";
      }
      return;
    }
    const prev = ptrs.get(e.pointerId)!, dx = L.x - prev.x, dy = L.y - prev.y; ptrs.set(e.pointerId, L);
    if (ptrs.size === 2 && pinch0) { const [a, b] = [...ptrs.values()]; cam.s = cam.clampS(pinch0.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch0.d); dragged += 10; return; }
    dragged += Math.abs(dx) + Math.abs(dy);
    if (dragged > 4) { cam.stop(); cam.unfollow(); cam.x -= dx / cam.s; cam.y -= dy / cam.s; }
  });
  const up = (e: PointerEvent) => {
    ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = null; cv.classList.remove("drag");
    if (e.type === "pointerup" && dragged < 5 && ptrs.size === 0) { const L = local(e), o = pick(L.x, L.y); if (o) select(o); }
  };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", (e) => { e.preventDefault(); const L = local(e); cam.zoomAt(L.x, L.y, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

  $("home").onclick = goHome; $("warp").onclick = warp;
  $("zin").onclick = () => zoomBy(1.5);
  $("zout").onclick = () => zoomBy(1 / 1.5);

  addEventListener("keydown", (e) => {
    const typing = (e.target as HTMLElement).tagName === "INPUT", sel = state.sel;
    if (e.key === "Escape" && state.routePick !== null) { endPick(); return; }
    if (e.key === "Escape") { if (typing) { closeSearch(); return; } if (sel?.kind === "track") select({ kind: "star", s: sel.s }); else if (sel) select(null); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "/") { e.preventDefault(); searchInput().focus(); }
    else if (k === "w" || k === "ц") warp();
    else if (k === "h" || k === "р") goHome();
    else if (k === "n" || k === "т") next();
    else if (k === "l" || k === "д") toggleBeacon(sel?.kind === "track" ? sel : state.nowPlaying);
    else if (k === " ") { e.preventDefault(); player.toggle(); }
    else if (k === "+" || k === "=") zoomBy(1.5);
    else if (k === "-") zoomBy(1 / 1.5);
  });
}
