// Sharing a track: its stable link copied, or sent to the open COMMS channel (ALL), where it shows as
// a card. From the player (the track on air) and from a track's dossier.
import { $ } from "../core/dom";
import { state } from "../app/state";
import { signalLink } from "../app/signal";
import { ALL, transmit } from "../cloud/comms";
import { pilot } from "../cloud/pilots";
import { openPilot } from "./pilot";
import { flashKey, say } from "./rail";

export async function shareTrack(o: { s: number; i: number }, how: "copy" | "send", key?: HTMLElement | null) {
  const link = signalLink(o.s, o.i);
  if (how === "copy") {
    try { await navigator.clipboard.writeText(link); if (key?.classList.contains("key")) flashKey(key, "COPIED ✓"); say("Link copied. Paste it in COMMS or anywhere"); }
    catch { say(`Copy this link: ${link}`, "err"); }
    return;
  }
  if (!pilot.me) { openPilot(); return; }
  const e = await transmit(ALL, link);
  if (e) say(e === "too-fast" ? "Too fast. One message every few seconds" : "Couldn't send it. Try again", "err");
  else { if (key?.classList.contains("key")) flashKey(key, "SENT ✓"); say("Sent to COMMS · ALL"); }
}

/** the player's share key: a small menu over it, for the track on air */
export function initShareKey() {
  const key = $("pShare"), pop = $("sharePop");
  const close = () => { pop.hidden = true; key.setAttribute("aria-expanded", "false"); };
  key.onclick = (e) => { e.stopPropagation(); const open = pop.hidden; pop.hidden = !open; key.setAttribute("aria-expanded", String(open)); if (open) pop.querySelector<HTMLElement>("button")?.focus(); };
  pop.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-share]"); const np = state.nowPlaying;
    if (!b || !np) return;
    close(); shareTrack(np, b.dataset.share as "copy" | "send");
  });
  addEventListener("pointerdown", (e) => { if (!pop.hidden && !pop.contains(e.target as Node) && e.target !== key && !key.contains(e.target as Node)) close(); });
  pop.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); key.focus(); } });
}
