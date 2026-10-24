// Sound Cosmos — entry point. Modules only define things; everything is started here, in order.
//   core/    types and helpers          model/  galaxy, motion, routes (pure, tested)
//   data/    fetching the map           store/  beacons, flight log, prefs (behind a storage adapter)
//   app/     shared state and actions   render/ camera, layers, what's drawn on the map
//   ui/      dossier, player dock, route panel, log, search, input, effects
// Fonts ship with the site (latin + cyrillic only)
import "@fontsource/dotgothic16/latin-400.css";
import "@fontsource/dotgothic16/latin-ext-400.css";
import "@fontsource/dotgothic16/cyrillic-400.css";
import "@fontsource/martian-mono/latin-300.css";
import "@fontsource/martian-mono/cyrillic-300.css";
import "@fontsource/martian-mono/latin-400.css";
import "@fontsource/martian-mono/cyrillic-400.css";
import "@fontsource/martian-mono/latin-600.css";
import "@fontsource/martian-mono/cyrillic-600.css";
import "./style.css";
import { $ } from "./core/dom";
import { beacons, flightLog, galaxy, state, tracks } from "./app/state";
import { routeFromHash, select } from "./app/actions";
import { find, parseSignal } from "./app/signal";
import { initScene, startLoop } from "./render/scene";
import { initDock, paintBeaconKey, playTestSignal } from "./ui/dock";
import { initDossier, paintDossierBeacon, renderDossier } from "./ui/dossier";
import { initRoutePanel } from "./ui/routePanel";
import { initLogPanel, renderBeacons, renderLog } from "./ui/logPanel";
import { initClock, ticker } from "./ui/ticker";
import { initSearch } from "./ui/search";
import { initInput } from "./ui/input";
import { initWormhole } from "./ui/wormhole";
import { initTheme } from "./ui/theme";
import { initBriefing } from "./ui/briefing";
import { initPilot } from "./ui/pilot";
import { initModals } from "./ui/modal";
import { initRail } from "./ui/rail";
import { initComms } from "./ui/comms";
import { initFleet } from "./ui/fleet";
import { tuneIn } from "./cloud/fleet";
import { initShareKey } from "./ui/share";
import { initSync } from "./cloud/sync";

initModals();
initRail();
initScene();
initDock();
initDossier();
initRoutePanel();
initLogPanel();
initPilot();
initComms();
initFleet();
initShareKey();
initSync();
initSearch();
initInput();
initWormhole();
initClock();

// stores tell the UI when they change
beacons.changed.on(() => { renderBeacons(); paintBeaconKey(); paintDossierBeacon(); ticker(); state.dirty = true; });
flightLog.changed.on(() => { renderLog(); ticker(); });

initTheme();
$("sector").textContent = galaxy.meta.sector.toUpperCase();
if (galaxy.meta.sample) { const b = $("sampleBanner"); b.hidden = false; b.onclick = () => { b.hidden = true; }; }
renderDossier(); renderLog(); renderBeacons(); paintBeaconKey(); ticker();
startLoop();
initBriefing();
document.fonts?.ready.then(() => { state.dirty = true; });

// deep links: #test-<videoId> plays one video, #r<a>-<b> opens a route, #t<star>-<track> a track
const tm = location.hash.match(/^#test-([A-Za-z0-9_-]{11})$/);
if (tm) playTestSignal(tm[1]);
routeFromHash();
// the COMMS page (comms.html) asks this tab to play a shared track or tune in to a fleet
window.name = "sound-cosmos";
if (typeof BroadcastChannel === "function") {
  const bus = new BroadcastChannel("sound-cosmos");
  bus.onmessage = (e) => {
    const go = String(e.data?.go ?? "");
    const s = parseSignal(go), f = go.match(/^#fleet-([\w-]{6,64})$/);
    if (s) find(s).then((r) => { if (r) select({ kind: "track", ...r }, true, true); });
    else if (f) tuneIn(f[1]);
    else return;
    bus.postMessage({ ack: go });
  };
}
addEventListener("hashchange", () => {
  if (routeFromHash()) return;
  const s = parseSignal(location.hash); if (s) find(s).then((r) => { if (r) select({ kind: "track", ...r }); });
  const f = location.hash.match(/^#fleet-([\w-]{6,64})$/); if (f) tuneIn(f[1]);
});
const sig = parseSignal(location.hash);
if (sig) find(sig).then((r) => { if (r) select({ kind: "track", ...r }); });
const m = location.hash.match(/^#t(\d+)-(\d+)$/);
if (m && +m[1] < galaxy.stars.length) tracks.load(+m[1]).then((ch) => { if (+m[2] < ch.yt.length) select({ kind: "track", s: +m[1], i: +m[2] }); });

// signature in the browser console
console.log("%c SOUND COSMOS %c © 2026 hellomynameisdruc · all rights reserved · github.com/hellomynameisdruc/spacejam",
  "background:#b8a8ff;color:#0b0716;font-weight:bold;padding:2px 4px", "color:#b8a8ff");

