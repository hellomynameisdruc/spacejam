// Phosphor colour themes (violet, green, amber).
import { prefs, state } from "../app/state";
import { readTheme } from "../render/palette";
import { applyCursors } from "./cursors";
import { renderDossier } from "./dossier";
import type { Phosphor } from "../store/prefs";

export function setPhosphor(name: Phosphor) {
  document.documentElement.dataset.phosphor = name;
  document.querySelectorAll<HTMLButtonElement>(".phos button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ph === name)));
  prefs.phosphor = name;
  const t = readTheme(); applyCursors(t.rgb, t.bg);
  state.dirty = true;
  renderDossier();
}
export function initTheme() {
  document.querySelectorAll<HTMLButtonElement>(".phos button").forEach((b) => (b.onclick = () => setPhosphor(b.dataset.ph as Phosphor)));
  setPhosphor(prefs.phosphor);
}
