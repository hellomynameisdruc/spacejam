// The pre-flight safety briefing: how to use the observatory, drawn like the safety card in an
// airliner's seat pocket. Shown on the first visit and whenever the ? key or button is pressed.
// While it is open the music pauses: nothing is ever drawn over a playing video.
import { $ } from "../core/dom";
import { browserKV } from "../store/storage";
import { player } from "./dock";

const SEEN = "kosmos-briefed";
let resume = false;

// pictograms: pixel drawings in the phosphor colour (60 × 34 cells)
const pic = (body: string) => `<svg viewBox="0 0 60 34" aria-hidden="true" shape-rendering="crispEdges">${body}</svg>`;
const r = (x: number, y: number, w: number, h: number, o = 1) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="currentColor"${o < 1 ? ` opacity="${o}"` : ""}/>`;
const ring = (cx: number, cy: number, rr: number, o = 1, dash = "") => `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="none" stroke="currentColor" stroke-width="1"${dash ? ` stroke-dasharray="${dash}"` : ""}${o < 1 ? ` opacity="${o}"` : ""}/>`;
const dot = (cx: number, cy: number, rr: number, o = 1) => `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="currentColor"${o < 1 ? ` opacity="${o}"` : ""}/>`;
const txt = (x: number, y: number, s: string) => `<text x="${x}" y="${y}" font-size="3.2" text-anchor="middle" fill="currentColor" opacity=".7" font-family="Martian Mono, monospace">${s}</text>`;
/** the beacon: a diamond with a heart in it */
const BEACON = (x: number, y: number, k: number) => {
  const D = [[6, 1, 2], [5, 2, 1], [8, 2, 1], [4, 3, 1], [9, 3, 1], [3, 4, 1], [10, 4, 1], [2, 5, 1], [11, 5, 1], [1, 6, 1], [12, 6, 1], [1, 7, 1], [12, 7, 1], [2, 8, 1], [11, 8, 1], [3, 9, 1], [10, 9, 1], [4, 10, 1], [9, 10, 1], [5, 11, 1], [8, 11, 1], [6, 12, 2]];
  const H = [[4, 5, 2], [8, 5, 2], [3, 6, 8], [3, 7, 8], [4, 8, 6], [5, 9, 4], [6, 10, 2]];
  return [...D, ...H].map(([a, b, w]) => r(x + a * k, y + b * k, w * k, k)).join("");
};

const PANELS: { t: string; p: string; d: string }[] = [
  {
    t: "FASTEN YOUR SCROLL WHEEL",
    p: pic(`${r(8, 6, 1, 20)}${r(19, 6, 1, 20)}${r(9, 5, 10, 1)}${r(9, 26, 10, 1)}${r(9, 14, 10, 1, 0.5)}${r(13, 7, 2, 5)}
      ${r(13, 1, 2, 2)}${r(12, 2, 4, 1)}${r(13, 29, 2, 2)}${r(12, 29, 4, 1)}
      ${ring(42, 17, 3)}${ring(42, 17, 7, 0.7)}${ring(42, 17, 12, 0.45)}${ring(42, 17, 16, 0.25, "1 2")}${dot(42, 17, 1)}`),
    d: "Wheel or two fingers to zoom: galaxies, then styles, labels and single tracks. Drag to fly about.",
  },
  {
    t: "KNOW YOUR SURROUNDINGS",
    p: pic(`${[[0, 0], [3, -2], [-3, 2], [2, 3], [-2, -3], [5, 1], [-5, -1], [1, -5], [-1, 5], [4, -4]].map(([a, b]) => dot(8 + a, 14 + b, 0.8, 0.8)).join("")}
      ${dot(22, 14, 2.4)}${r(21, 8, 2, 2, 0.6)}${r(21, 18, 2, 2, 0.6)}${r(16, 13, 2, 2, 0.6)}${r(26, 13, 2, 2, 0.6)}
      ${dot(38, 14, 4)}<ellipse cx="38" cy="14" rx="7.5" ry="2.2" fill="none" stroke="currentColor" stroke-width="1" opacity=".8"/>
      ${r(51, 13, 2, 2)}${ring(52, 14, 4, 0.4, "1 1.5")}
      ${txt(8, 30, "GENRE")}${txt(22, 30, "STYLE")}${txt(38, 30, "LABEL")}${txt(52, 30, "TRACK")}`),
    d: "Galaxy = a genre. Star = a style. Planet = a label. Satellite = a track.",
  },
  {
    t: "AUTOPILOT ENGAGED",
    p: pic(`${dot(30, 17, 6, 0.9)}${ring(30, 17, 13, 0.35, "1 2")}
      ${[[14, 9], [45, 8], [47, 25], [12, 26], [30, 3]].map(([x, y]) => r(x, y, 2, 2)).join("")}
      <path d="M15 10 Q30 0 45 9" fill="none" stroke="currentColor" stroke-dasharray="1.5 1.5"/>
      ${r(43, 6, 1, 1)}${r(44, 7, 1, 1)}${r(42, 8, 3, 1)}`),
    d: "Click any satellite to play it. When a track ends the ship flies on to the nearest one you haven't heard.",
  },
  {
    t: "BEACONS = LIKES",
    p: pic(`${BEACON(6, 3, 2)}${r(36, 9, 18, 1)}${r(36, 15, 14, 1, 0.7)}${r(36, 21, 16, 1, 0.5)}${r(36, 27, 11, 1, 0.3)}
      ${r(33, 9, 1, 1)}${r(33, 15, 1, 1, 0.7)}${r(33, 21, 1, 1, 0.5)}${r(33, 27, 1, 1, 0.3)}`),
    d: "Love a track? Press ♥ (or L) to set a beacon. The BEACONS tab keeps them all and plays them as a YouTube playlist.",
  },
  {
    t: "MISSIONS AVAILABLE",
    p: pic(`${dot(7, 24, 3)}${dot(23, 10, 2)}${dot(38, 22, 2.4)}${dot(53, 8, 3)}
      <path d="M7 24 L23 10 L38 22 L53 8" fill="none" stroke="currentColor" stroke-dasharray="2 1.5"/>
      ${ring(23, 10, 5, 0.5)}${ring(38, 22, 5, 0.5)}${txt(7, 32, "FROM")}${txt(53, 17, "TO")}`),
    d: "<b>On a star:</b> an odyssey across five systems, or hitchhike round its labels, 42 tracks. <b>On a planet:</b> Solaris station, the label as a radio; or time warp through its history.",
  },
  {
    t: "EMERGENCY EXITS",
    p: pic(`${r(3, 5, 54, 1)}${r(3, 28, 54, 1)}${r(3, 5, 1, 24)}${r(56, 5, 1, 24)}
      <text x="30" y="15" font-size="6" text-anchor="middle" fill="currentColor" font-family="DotGothic16, monospace" letter-spacing=".5">EXIT</text>
      ${r(15, 18, 30, 1, 0.5)}${r(40, 16, 1, 5)}${r(42, 17, 1, 3)}${r(44, 18, 1, 1)}
      ${txt(13, 25, "H")}${txt(25, 25, "W")}${txt(37, 25, "ESC")}${txt(49, 25, "/")}`),
    d: "Lost in space? <b>H</b> back to the full sector · <b>W</b> wormhole to a random track · <b>Esc</b> one step back · <b>/</b> search.",
  },
];

function build() {
  const el = $("brief");
  el.innerHTML = `<div class="brief-card" role="document">
    <div class="brief-head"><span class="inv">SOUND COSMOS</span><span>PRE-FLIGHT SAFETY BRIEFING</span><button type="button" class="dock-btn" data-brief-close aria-label="Close the briefing">×</button></div>
    <p class="brief-sub">PLEASE READ BEFORE TAKE-OFF · THIS CARD STAYS IN THE SEAT POCKET: <b>?</b></p>
    <ol class="brief-grid">${PANELS.map((p, k) => `<li><span class="brief-n">${k + 1}</span><h3>${p.t}</h3>${p.p}<p>${p.d}</p></li>`).join("")}</ol>
    <div class="brief-foot"><span class="brief-dp">DON'T PANIC</span><span class="brief-note">If a signal is lost, the player jumps on by itself.</span><button type="button" class="key hot" data-brief-close>TAKE OFF ▸</button></div>
  </div>`;
  el.querySelectorAll<HTMLElement>("[data-brief-close]").forEach((b) => { b.onclick = closeBriefing; });
  el.onclick = (e) => { if (e.target === el) closeBriefing(); };
}

export function openBriefing() {
  const el = $("brief"); if (!el.hidden) return;
  if (!el.firstChild) build();
  // pause the music while the card is over the screen; it picks up again when the card is put away
  resume = player.playing; if (resume) player.toggle();
  el.hidden = false; el.scrollTop = 0; el.querySelector<HTMLElement>(".brief-foot .key")?.focus({ preventScroll: true });
}
export function closeBriefing() {
  const el = $("brief"); if (el.hidden) return;
  el.hidden = true; browserKV.set(SEEN, "1");
  if (resume && !player.playing) player.toggle();
  resume = false;
}
export const briefingOpen = () => !$("brief").hidden;

export function initBriefing() {
  $("help").onclick = openBriefing;
  // the card has the keyboard while it is open
  addEventListener("keydown", (e) => {
    const typing = (e.target as HTMLElement).tagName === "INPUT";
    if (briefingOpen()) {
      if (e.key === "Escape" || e.key === "Enter" || e.key === "?") { e.preventDefault(); closeBriefing(); }
      e.stopImmediatePropagation(); return;
    }
    if (e.key === "?" && !typing) { e.preventDefault(); e.stopImmediatePropagation(); openBriefing(); }
  }, true);
  // first visit: the briefing comes first (not for someone arriving by a shared link to a track or a route)
  if (!browserKV.get(SEEN) && !location.hash) openBriefing();
}
