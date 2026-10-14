// The floating player dock: the visible YouTube monitor, transport keys, seek/volume, minimise to a
// pill (minimising pauses — audio never plays from a hidden player), dragging by the header.
import type { TrackRef } from "../core/types";
import { mmss, pad } from "../core/util";
import { $, uiZoom } from "../core/dom";
import { Player } from "./youtubePlayer";
import { beacons, chunk, galaxy, prefs, state } from "../app/state";
import { next, prev, toggleBeacon } from "../app/actions";
import { viewportEl } from "../render/scene";
import { ticker } from "./ticker";

// Player keys use one family of pixel icons (14×14 grid), so they match in size and weight
const svgI = (body: string) => `<svg class="ico" viewBox="0 0 14 14" aria-hidden="true" shape-rendering="crispEdges">${body}</svg>`;
export const ICON = {
  prev: svgI(`<path fill="currentColor" d="M7 2h1v10H7zM6 3h1v8H6zM5 4h1v6H5zM4 5h1v4H4zM3 6h1v2H3zM13 2h-1v10h1zM12 3h-1v8h1zM11 4h-1v6h1zM10 5H9v4h1zM9 6H8v2h1z" transform="translate(-1 0)"/>`),
  next: svgI(`<path fill="currentColor" d="M1 2h1v10H1zM2 3h1v8H2zM3 4h1v6H3zM4 5h1v4H4zM5 6h1v2H5zM7 2h1v10H7zM8 3h1v8H8zM9 4h1v6H9zM10 5h1v4h-1zM11 6h1v2h-1z" transform="translate(1 0)"/>`),
  pause: svgI(`<path fill="currentColor" d="M3 2h3v10H3zM8 2h3v10H8z"/>`),
  play: svgI(`<path fill="currentColor" d="M3 2h1v10H3zM4 3h2v8H4zM6 4h2v6H6zM8 5h2v4H8zM10 6h2v2h-2z"/>`),
  beacon: svgI(`<path fill="currentColor" d="M6 1h2v1H6zM5 2h1v1H5zM8 2h1v1H8zM4 3h1v1H4zM9 3h1v1H9zM3 4h1v1H3zM10 4h1v1h-1zM2 5h1v1H2zM11 5h1v1h-1zM1 6h1v2H1zM12 6h1v2h-1zM2 8h1v1H2zM11 8h1v1h-1zM3 9h1v1H3zM10 9h1v1h-1zM4 10h1v1H4zM9 10h1v1H9zM5 11h1v1H5zM8 11h1v1H8zM6 12h2v1H6zM6 6h2v2H6z"/>`),
  beaconOn: svgI(`<path fill="currentColor" d="M6 1h2v1H6zM5 2h4v1H5zM4 3h6v1H4zM3 4h8v1H3zM2 5h10v1H2zM1 6h12v2H1zM2 8h10v1H2zM3 9h8v1H3zM4 10h6v1H4zM5 11h4v1H5zM6 12h2v1H6z"/><path fill="var(--bg, #000)" d="M6 6h2v2H6z"/>`),
};

export let player: Player;
let dock: HTMLElement, pill: HTMLElement, seekEl: HTMLInputElement, volEl: HTMLInputElement;
let seeking = false;
/** last seek gesture, for the scrub effect on the signal scope */
export const scrub = { t: -1e9, dir: 0, prev: 0 };
const paintRange = (el: HTMLInputElement) => el.style.setProperty("--p", `${(+el.value - +el.min) / (+el.max - +el.min) * 100}%`);

/** phones: the dock is a fixed sheet along the bottom, not a window to drag */
const sheet = matchMedia("(max-width: 860px)");
export function showDock() { dock.hidden = false; pill.hidden = true; document.body.classList.add("docked"); }

/** the dock's beacon key reflects the track on air */
export function paintBeaconKey() {
  const on = beacons.has(state.nowPlaying), b = $("pLike");
  b.innerHTML = on ? ICON.beaconOn : ICON.beacon; b.setAttribute("aria-pressed", String(on)); b.classList.toggle("on", on);
  b.setAttribute("aria-label", on ? "Remove beacon" : "Set beacon");
}

/** "ODYSSEY 07/24" next to ON AIR while the track on air is a stop of the playing odyssey */
export function paintOdysseyTag() {
  const r = state.route, k = state.routeIdx, np = state.nowPlaying, cur = r && k >= 0 ? r.flat[k] : null;
  const on = !!(cur && np && cur.s === np.s && cur.i === np.i);
  // or an orbit: how many of the planet's satellites have been heard so far
  const pi = state.orbit, p = !on && pi !== null && np ? galaxy.planets[pi] : null, ch = p && chunk(p.s);
  const orbiting = !!(p && ch && np!.s === p.s && ch.p[np!.i] === pi);
  $("dockOdy").hidden = !on && !orbiting;
  if (on) {
    $("dockOdy").firstChild!.textContent = r!.star !== undefined ? "HITCHHIKE " : "ODYSSEY ";
    $("dockOdyN").textContent = `${pad(k + 1, 2)}/${pad(r!.flat.length, 2)}`;
  } else if (orbiting) {
    let heard = 0; for (let i = p!.t0; i < p!.t1; i++) if (state.played.has(ch!.yt[i])) heard++;
    $("dockOdy").firstChild!.textContent = "SOLARIS ";
    $("dockOdyN").textContent = `${pad(heard, 2)}/${pad(p!.t1 - p!.t0, 2)}`;
  }
  $("dockOdy").title = orbiting ? `Orbiting ${p!.name}: next plays another track of this label` : "";
}

/** put a track on air */
export function loadInDock(ref: TrackRef) {
  const ch = chunk(ref.s)!;
  showDock(); $("pMsg").hidden = true;
  for (const id of ["playerBox", "dockPill"]) $(id).style.setProperty("--acc", galaxy.stars[ref.s].color);
  player.play(ch.yt[ref.i]);
  paintBeaconKey(); paintOdysseyTag();
  $("npTitle").textContent = ch.t[ref.i]; $("npArtist").textContent = ch.an[ch.a[ref.i]];
  seekEl.value = "0"; paintRange(seekEl); $("tCur").textContent = "0:00"; $("tDur").textContent = "0:00";
}

/** plays a single video through the transport (test hook #test-<id>) */
export function playTestSignal(id: string) {
  showDock(); $("npTitle").textContent = "TEST SIGNAL"; $("npArtist").textContent = id;
  player.play(id);
}

export function initDock() {
  dock = $("playerBox"); pill = $("dockPill"); seekEl = $<HTMLInputElement>("seek"); volEl = $<HTMLInputElement>("vol");
  $("pPrev").innerHTML = ICON.prev; $("pNext").innerHTML = ICON.next; $("pToggle").innerHTML = ICON.pause; $("pLike").innerHTML = ICON.beacon;

  player = new Player("yt", {
    onEnded: () => { if ($<HTMLInputElement>("autopilot").checked) next(); },
    onError: (code) => {
      const m = $("pMsg"); m.hidden = false;
      m.textContent = code === 101 || code === 150 ? "! EMBEDDING DISABLED BY OWNER. JUMPING TO A NEARBY SIGNAL…" : "! VIDEO UNAVAILABLE. JUMPING TO A NEARBY SIGNAL…";
      setTimeout(next, 1500);
    },
    onPlayingChange: (p) => { $("live").classList.toggle("on", p); $("pToggle").innerHTML = p ? ICON.pause : ICON.play; $("pToggle").setAttribute("aria-label", p ? "Pause" : "Play"); ticker(); },
  });

  $("pNext").onclick = next;
  $("pPrev").onclick = prev;
  $("pToggle").onclick = () => player.toggle();
  $("pLike").onclick = () => toggleBeacon(state.nowPlaying);
  $("dockMin").onclick = () => {
    if (player.playing) player.toggle();
    dock.hidden = true; pill.hidden = false; document.body.classList.remove("docked");
    $("pillTitle").textContent = $("npTitle").textContent;
  };
  pill.onclick = () => { showDock(); if (!player.playing) player.toggle(); };

  // drag the dock by its header, kept inside the map
  let start: { x: number; y: number; l: number; t: number } | null = null;
  const head = $("dockHead"), vp = viewportEl();
  head.addEventListener("pointerdown", (e) => {
    if (sheet.matches || (e.target as HTMLElement).closest("button")) return;
    const r = dock.getBoundingClientRect(), v = vp.getBoundingClientRect();
    const z = uiZoom(vp);
    start = { x: e.clientX, y: e.clientY, l: (r.left - v.left) / z, t: (r.top - v.top) / z };
    head.setPointerCapture(e.pointerId);
  });
  head.addEventListener("pointermove", (e) => {
    if (!start) return;
    const z = uiZoom(vp);
    const l = Math.max(0, Math.min(vp.offsetWidth - dock.offsetWidth, start.l + (e.clientX - start.x) / z));
    const t = Math.max(0, Math.min(vp.offsetHeight - dock.offsetHeight, start.t + (e.clientY - start.y) / z));
    Object.assign(dock.style, { left: `${l}px`, top: `${t}px`, right: "auto", bottom: "auto" });
  });
  const end = () => { start = null; };
  head.addEventListener("pointerup", end); head.addEventListener("pointercancel", end);

  // transport: seek bar, time, volume (the YouTube player itself stays visible above)
  seekEl.addEventListener("pointerdown", () => { scrub.prev = +seekEl.value; });
  seekEl.addEventListener("input", () => {
    const v = +seekEl.value; if (v !== scrub.prev) scrub.dir = Math.sign(v - scrub.prev); scrub.prev = v; scrub.t = performance.now();
    seeking = true; paintRange(seekEl); $("tCur").textContent = mmss(+seekEl.value / 1000 * player.duration());
  });
  seekEl.addEventListener("change", () => { player.seek(+seekEl.value / 1000 * player.duration()); seeking = false; scrub.t = performance.now(); });
  const v = prefs.volume; if (v !== null) volEl.value = String(v);
  const applyVol = () => { player.setVolume(+volEl.value); paintRange(volEl); prefs.volume = +volEl.value; };
  volEl.addEventListener("input", applyVol); applyVol();
  setInterval(() => {
    if (dock.hidden || seeking) return;
    const d = player.duration(), t = player.time();
    seekEl.value = String(d ? Math.round(t / d * 1000) : 0); paintRange(seekEl);
    $("tCur").textContent = mmss(t); $("tDur").textContent = d ? mmss(d) : "0:00";
  }, 250);
}
