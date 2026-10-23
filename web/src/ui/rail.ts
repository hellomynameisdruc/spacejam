// The message rail: one line at the top of the map for everything the observatory has to say. Modes
// that last (picking an odyssey's destination, being on air) stay with their actions until they end;
// confirmations (✓) and problems (!) show for a few seconds over them, then the mode is back. While a
// card is open (the pilot card, the briefing), the rail speaks from the top of that card instead.
import { esc } from "../core/util";
import { onModal, topModal } from "./modal";

export type Kind = "ok" | "err" | "info" | "mode" | "live";
export type Act = { label: string; kbd?: string; run: () => void; hot?: boolean };
type Item = { kind: Kind; html: string; acts?: Act[]; tag?: string };
const modes = new Map<string, Item>();
let flash: Item | null = null, timer = 0, host: HTMLElement | null = null;
const TAG: Record<Kind, string> = { ok: "✓", err: "!", info: "›", mode: "◆", live: "●" };

function paintInto(el: HTMLElement, item: Item | null) {
  if (!item) { el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false;
  el.className = `${el.classList.contains("modal-rail") ? "modal-rail " : ""}rail ${item.kind}`;
  el.innerHTML = `<span class="rail-tag">${item.tag ?? TAG[item.kind]}</span><span class="rail-t">${item.html}</span>${(item.acts ?? []).map((a, k) => `<button type="button" class="key${a.hot ? " hot" : ""}" data-act="${k}">${esc(a.label)}${a.kbd ? ` <kbd>${esc(a.kbd)}</kbd>` : ""}</button>`).join("")}`;
  el.querySelectorAll<HTMLElement>("[data-act]").forEach((b) => { b.onclick = (e) => { e.stopPropagation(); item.acts![+b.dataset.act!].run(); }; });
}
/** the map's rail keeps the modes (picking, on air); an open card's own rail only says what just happened */
function render() {
  const map = document.getElementById("rail"), card = topModal()?.querySelector<HTMLElement>(".modal-rail") ?? null;
  const mode = [...modes.values()].pop() ?? null;
  if (card) { paintInto(card, flash); if (map) paintInto(map, mode); }
  else if (map) paintInto(map, flash ?? mode);
  if (host && host !== card && host.classList.contains("modal-rail")) paintInto(host, null);
  host = card;
}

/** a passing message: ✓ done, ! something went wrong, › for the record */
export function say(text: string, kind: "ok" | "err" | "info" = "ok") {
  flash = { kind, html: esc(text.toUpperCase()) };
  render();
  clearTimeout(timer); timer = window.setTimeout(() => { flash = null; render(); }, kind === "err" ? 4200 : 2800);
}
/** a lasting mode with its actions; the same id replaces it, clearMode ends it */
export function setMode(id: string, html: string, acts: Act[] = [], kind: "mode" | "live" = "mode", tag?: string) {
  modes.delete(id); modes.set(id, { kind, html, acts, tag }); render();
}
export function clearMode(id: string) { if (modes.delete(id)) render(); }

/** a key says what it just did for a moment ("COPIED ✓"), then goes back to its label */
export function flashKey(b: HTMLElement | null, text: string) {
  if (!b) return;
  const was = b.dataset.label ?? b.innerHTML; b.dataset.label = was;
  b.textContent = text; b.classList.add("done");
  setTimeout(() => { b.innerHTML = was; b.classList.remove("done"); delete b.dataset.label; }, 1600);
}

export function initRail() { onModal(render); }
