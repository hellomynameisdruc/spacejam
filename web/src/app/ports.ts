// The UI as the actions see it: the few things they ask of it, filled in by the UI modules when they
// start. The actions stay free of the UI's code, and the UI is free to import the actions — no cycles.
import type { TrackRef } from "../core/types";

export const ui = {
  /** the selection changed: redraw the dossier (decoding in over ms) */
  showSelection: (_ms: number) => {},
  /** put a track on air */
  loadTrack: (_r: TrackRef) => {},
  isPlaying: () => false,
  togglePlay: () => {},
  /** the route (odyssey, hitchhike, time warp) changed */
  showRoute: () => {},
  /** a route ran out: its last word, in the panel */
  routeEnded: (_note: string) => {},
  /** how much of the map's left side the route panel covers */
  routePanelWidth: () => 0,
  /** picking an odyssey's destination: from where (null when done) */
  pickHint: (_from: string | null) => {},
  /** a destination inside the origin's own system */
  pickDenied: (_star: string) => {},
  /** the header's ticker numbers changed */
  stats: () => {},
  /** the player, for fleets that keep players in step */
  media: {
    ready: () => false,
    time: () => 0,
    playing: () => false,
    buffering: () => false,
    toggle: () => {},
    seek: (_t: number) => {},
    /** play a video that isn't on this map, under the title the host gave */
    playOffMap: (_yt: string, _title: string, _artist: string) => {},
    /** what the player shows as the title, when the map can't name the track */
    title: () => "",
  },
};
export const provide = (p: Partial<typeof ui>) => { Object.assign(ui, p); };
