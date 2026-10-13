// The panel under the dossier: FLIGHT LOG and BEACONS tabs.
import { esc, pad } from "../core/util";
import { $ } from "../core/dom";
import { beacons, chunk, flightLog, galaxy, tracks } from "../app/state";
import { select } from "../app/actions";

export async function renderLog() {
  const el = $("log"), stars = galaxy.stars;
  const items = flightLog.refs().filter((r) => r.s < stars.length);
  await Promise.allSettled([...new Set(items.map((r) => r.s))].map((s) => tracks.load(s)));
  const ok = items.filter((r) => chunk(r.s) && r.i < chunk(r.s)!.yt.length);
  el.innerHTML = ok.length
    ? ok.map((r) => { const d = new Date(r.t); return `<button data-s="${r.s}" data-i="${r.i}"><time>${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}</time><span>▸ ${esc(chunk(r.s)!.t[r.i])} · ${esc(stars[r.s].name.toUpperCase())}</span></button>`; }).join("")
    : `<p class="note">NO ENTRIES YET. SIGNALS YOU PLAY WILL SHOW UP HERE.</p>`;
}

export async function renderBeacons() {
  const el = $("liked"), stars = galaxy.stars;
  $("likedN").textContent = String(beacons.size);
  if (el.hidden) return;
  if (!beacons.size) { el.innerHTML = `<p class="note">NO BEACONS YET. SET ONE ON A SIGNAL YOU LOVE: ◇ OR <kbd>L</kbd>.</p>`; return; }
  await Promise.allSettled([...new Set(beacons.all.map((b) => b.s))].filter((s) => s < stars.length).map((s) => tracks.load(s)));
  const parts = beacons.playlistLinks();
  const links = parts.map((href, k) => `<a class="ytlist" href="${href}" target="_blank" rel="noopener">▶ OPEN AS YOUTUBE PLAYLIST${parts.length > 1 ? ` · PART ${k + 1}/${parts.length}` : ""} ↗</a>`).join("");
  el.innerHTML = links + `<p class="note ythint">Opens on YouTube; use “Save” there to keep it in your library.</p>` +
    beacons.all.map((b, k) => {
      const r = beacons.ref(b);
      return `<div class="lk"><button ${r ? `data-s="${r.s}" data-i="${r.i}"` : "disabled"}><time>${pad(k + 1, 2)}</time><span>▸ ${esc(b.a ?? "")} — ${esc(b.t ?? "")}${b.s < stars.length ? ` · ${esc(stars[b.s].name.toUpperCase())}` : ""}</span></button><button class="unlike" data-y="${esc(b.y)}" aria-label="Remove beacon">×</button></div>`;
    }).join("");
}

function showTab(beaconsTab: boolean) {
  $("log").hidden = beaconsTab; $("liked").hidden = !beaconsTab;
  $("tabLog").setAttribute("aria-selected", String(!beaconsTab)); $("tabLiked").setAttribute("aria-selected", String(beaconsTab));
  if (beaconsTab) renderBeacons();
}

export function initLogPanel() {
  const play = (e: Event) => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-s]"); if (b) select({ kind: "track", s: +b.dataset.s!, i: +b.dataset.i! }, true, true); };
  $("log").addEventListener("click", play);
  $("liked").addEventListener("click", (e) => {
    const u = (e.target as HTMLElement).closest<HTMLElement>("[data-y]");
    if (u) { beacons.remove(u.dataset.y!); return; }
    play(e);
  });
  $("tabLog").onclick = () => showTab(false);
  $("tabLiked").onclick = () => showTab(true);
}
