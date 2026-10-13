// Fetching the map and, lazily, each star's tracks.
import type { Chunk, MapData } from "../core/types";

// The map is always revalidated; the files it points to carry its build id, so a browser can never mix
// a fresh map with track files cached from an earlier build (star numbers change between builds).
export const loadMap = (): Promise<MapData> => fetch("./data/map.json", { cache: "no-cache" }).then((r) => r.json());
let build = "";
export const setDataVersion = (v: string | undefined) => { build = v ? `?v=${encodeURIComponent(v)}` : ""; };
export const loadArtists = (): Promise<[string, number, number][]> => fetch(`./data/artists.json${build}`).then((r) => r.json());

/** Tracks are split per star system and fetched on first need */
export class TrackStore {
  private chunks: (Chunk | null)[];
  private loading = new Map<number, Promise<Chunk>>();
  constructor(nStars: number, private onLoad: (s: number) => void = () => {}) { this.chunks = new Array(nStars).fill(null); }
  get(s: number): Chunk | null { return this.chunks[s] ?? null; }
  load(s: number): Promise<Chunk> {
    const have = this.chunks[s]; if (have) return Promise.resolve(have);
    if (!this.loading.has(s)) this.loading.set(s, fetch(`./data/tracks/${s}.json${build}`).then((r) => r.json()).then((c: Chunk) => { this.chunks[s] = c; this.onLoad(s); return c; }));
    return this.loading.get(s)!;
  }
}
