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

initScene();
initDock();
initDossier();
initRoutePanel();
initLogPanel();
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
document.fonts?.ready.then(() => { state.dirty = true; });

// deep links: #test-<videoId> plays one video, #r<a>-<b> opens a route, #t<star>-<track> a track
const tm = location.hash.match(/^#test-([A-Za-z0-9_-]{11})$/);
if (tm) playTestSignal(tm[1]);
routeFromHash();
addEventListener("hashchange", routeFromHash);
const m = location.hash.match(/^#t(\d+)-(\d+)$/);
if (m && +m[1] < galaxy.stars.length) tracks.load(+m[1]).then((ch) => { if (+m[2] < ch.yt.length) select({ kind: "track", s: +m[1], i: +m[2] }); });
