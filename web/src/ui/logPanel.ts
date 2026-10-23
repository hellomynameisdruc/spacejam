// The panel under the dossier: FLIGHT LOG and BEACONS tabs.
import { esc, pad } from "../core/util";
import { $ } from "../core/dom";
import { beacons, chunk, flightLog, galaxy, tracks } from "../app/state";
import { select } from "../app/actions";
import { openComms } from "./comms";

/** a saved entry's place on the current map: by YouTube id within its star (found by name), or by its
 * saved numbers if the map hasn't been rebuilt since; null if it can't be found */
async function locate(e: { s: number; i: number; b?: string; y?: string; st?: string }): Promise<{ s: number; i: number } | null> {
  const { stars, meta } = galaxy;
  if (e.y) {
    const byName = galaxy.starIndex(e.st), s = byName >= 0 ? byName : e.s;
    if (s >= stars.length) return null;
    const ch = await tracks.load(s).catch(() => null); if (!ch) return null;
    const i = ch.yt[e.i] === e.y ? e.i : ch.yt.indexOf(e.y);
    return i >= 0 ? { s, i } : null;
  }
  if (e.b !== meta.build || e.s >= stars.length) return null; // numbers from another build of the map
  const ch = await tracks.load(e.s).catch(() => null);
  return ch && e.i < ch.yt.length ? { s: e.s, i: e.i } : null;
}

export async function renderLog() {
  const el = $("log"), stars = galaxy.stars;
  const items = flightLog.refs();
  const found = await Promise.all(items.map(locate));
  const ok = items.flatMap((r, k) => (found[k] ? [{ ...found[k]!, t: r.t }] : []));
  el.innerHTML = ok.length
    ? ok.map((r) => { const d = new Date(r.t); return `<button data-s="${r.s}" data-i="${r.i}"><time>${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}</time><span title="${esc(`${chunk(r.s)!.an[chunk(r.s)!.a[r.i]]} — ${chunk(r.s)!.t[r.i]}`)}">▸ ${esc(chunk(r.s)!.t[r.i])} · ${esc(stars[r.s].name.toUpperCase())}</span></button>`; }).join("")
    : `<p class="note">NO ENTRIES YET. SIGNALS YOU PLAY WILL SHOW UP HERE.</p>`;
}

export async function renderBeacons() {
  const el = $("liked"), stars = galaxy.stars;
  $("likedN").textContent = String(beacons.size);
  if (el.hidden) return;
  if (!beacons.size) { el.innerHTML = `<p class="note">NO BEACONS YET. SET ONE ON A TRACK YOU LOVE: THE BEACON KEY OR <kbd>L</kbd>.</p>`; return; }
  // each beacon's star: by name if it has one (survives rebuilds), else the saved number
  const starOf = beacons.all.map((b) => { const n = galaxy.starIndex(b.st); return n >= 0 ? n : b.s; });
  await Promise.allSettled([...new Set(starOf)].filter((s) => s < stars.length).map((s) => tracks.load(s)));
  const parts = beacons.playlistLinks();
  const links = parts.map((href, k) => `<a class="ytlist" href="${href}" target="_blank" rel="noopener">▶ OPEN AS YOUTUBE PLAYLIST${parts.length > 1 ? ` · PART ${k + 1}/${parts.length}` : ""} ↗</a>`).join("");
  el.innerHTML = links + `<p class="note ythint">Opens on YouTube; use “Save” there to keep it in your library.</p>` +
    beacons.all.map((b, k) => {
      const r = starOf[k] < stars.length ? beacons.ref(b, starOf[k]) : null;
      return `<div class="lk"><button ${r ? `data-s="${r.s}" data-i="${r.i}"` : "disabled"}><time>${pad(k + 1, 2)}</time><span title="${esc(`${b.a ?? ""} — ${b.t ?? ""}`)}">▸ ${esc(b.a ?? "")} — ${esc(b.t ?? "")}${r ? ` · ${esc(stars[r.s].name.toUpperCase())}` : ""}</span></button><button class="unlike" data-y="${esc(b.y)}" aria-label="Remove beacon">×</button></div>`;
    }).join("");
}

type Tab = "log" | "liked" | "comms";
function showTab(tab: Tab) {
  $("log").hidden = tab !== "log"; $("liked").hidden = tab !== "liked"; $("comms").hidden = tab !== "comms";
  ($("log").parentElement as HTMLElement).hidden = tab === "comms";
  $("tabLog").setAttribute("aria-selected", String(tab === "log")); $("tabLiked").setAttribute("aria-selected", String(tab === "liked"));
  $("tabComms").setAttribute("aria-selected", String(tab === "comms"));
  if (tab === "liked") renderBeacons();
  if (tab === "comms") openComms();
}

export function initLogPanel() {
  const play = (e: Event) => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-s]"); if (b) select({ kind: "track", s: +b.dataset.s!, i: +b.dataset.i! }, true, true); };
  $("log").addEventListener("click", play);
  $("liked").addEventListener("click", (e) => {
    const u = (e.target as HTMLElement).closest<HTMLElement>("[data-y]");
    if (u) { beacons.remove(u.dataset.y!); return; }
    play(e);
  });
  $("tabLog").onclick = () => showTab("log");
  $("tabLiked").onclick = () => showTab("liked");
  $("tabComms").onclick = () => showTab("comms");
}
