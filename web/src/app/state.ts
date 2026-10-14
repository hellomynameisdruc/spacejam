// The app's shared runtime state and services. Everything that several features read or change lives
// here, so modules depend on this one place instead of on each other's variables.
import type { Sel, TrackRef } from "../core/types";
import { reduce } from "../core/dom";
import { Galaxy } from "../model/galaxy";
import { Motion } from "../model/orbits";
import type { Route } from "../model/routes";
import { loadMap, setDataVersion, TrackStore } from "../data/loader";
import { browserKV } from "../store/storage";
import { Beacons } from "../store/beacons";
import { FlightLog } from "../store/flightLog";
import { Prefs } from "../store/prefs";

const map = await loadMap();
setDataVersion(map.meta.rev ?? map.meta.build);
export const galaxy = new Galaxy(map);
export const tracks = new TrackStore(galaxy.stars.length, () => { state.dirty = true; });
export const chunk = (s: number) => tracks.get(s);
export const motion = new Motion(galaxy, chunk, reduce);
export const beacons = new Beacons(browserKV, chunk);
export const flightLog = new FlightLog(browserKV);
export const prefs = new Prefs(browserKV);

export const state = {
  sel: null as Sel,
  hover: null as Sel,
  nowPlaying: null as TrackRef | null,
  /** the static layer needs a full repaint */
  dirty: true,
  route: null as Route | null,
  /** index into route.flat of the track being played along the route, or -1 */
  routeIdx: -1,
  /** origin (a planet or a whole star) while the visitor picks an odyssey's destination */
  routePick: null as { kind: "planet" | "star"; i: number } | null,
  /** planet whose orbit is playing (PLAY THE ORBIT): next keeps to its satellites */
  orbit: null as number | null,
  /** the wormhole animation is running */
  warping: false,
  /** YouTube ids heard this session (autopilot skips them) */
  played: new Set<string>(),
  /** tracks in play order, for the ◂◂ key */
  history: [] as TrackRef[],
};

export const sameSel = (a: Sel, b: Sel) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
export const isNowPlaying = (s: number, i: number) => !!state.nowPlaying && state.nowPlaying.s === s && state.nowPlaying.i === i;
