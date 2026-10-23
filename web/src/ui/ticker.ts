// The telemetry ticker along the top bar, and the clock.
import { esc, fmt, pad } from "../core/util";
import { $ } from "../core/dom";
import { beacons, chunk, galaxy, state } from "../app/state";
import { provide } from "../app/ports";

let last = "";
export function ticker() {
  const { stars, planets, links, meta } = galaxy, np = state.nowPlaying;
  let on = "ON AIR: SILENCE";
  if (np && chunk(np.s)) { const ch = chunk(np.s)!; on = `ON AIR: <b>${esc(ch.an[ch.a[np.i]])} — ${esc(ch.t[np.i])}</b>${state.onAir ? "" : " [PAUSED]"}`; }
  const big = stars.slice().sort((a, b) => b.tracks - a.tracks)[0];
  const parts = [on, ...(galaxy.nebulae.length ? [`GALAXIES <b>${galaxy.nebulae.length}</b>`] : []), `STARS <b>${stars.length}</b>`, `PLANETS <b>${fmt(planets.length)}</b>`, `SATELLITES <b>${fmt(meta.tracks)}</b>`, `RELEASES <b>${fmt(meta.releases)}</b>`,
    `LARGEST SYSTEM <b style="color:${big?.color}">${esc(big?.name.toUpperCase() || "—")}</b>`, `STYLE LINKS <b>${links.length}</b>`, `PLAYED THIS VISIT <b>${state.played.size}</b>`, `BEACONS <b>${beacons.size}</b>`, `SOURCE <b>DISCOGS CC0</b>`];
  const one = parts.map((p) => `<span>${p}</span>`).join("");
  // rebuild only when the text changes, so the marquee doesn't jump
  if (one !== last) { last = one; $("ticker").innerHTML = one + one; }
}

export function initClock() {
  provide({ stats: ticker });
  setInterval(() => { const d = new Date(); $("clock").textContent = `${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(d.getSeconds(), 2)}`; }, 1000);
}
