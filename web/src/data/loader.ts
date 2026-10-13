// Fetching the map and, lazily, each star's tracks.
import type { Chunk, MapData } from "../core/types";

export const loadMap = (): Promise<MapData> => fetch("./data/map.json").then((r) => r.json());
export const loadArtists = (): Promise<[string, number, number][]> => fetch("./data/artists.json").then((r) => r.json());

/** Tracks are split per star system and fetched on first need */
export class TrackStore {
  private chunks: (Chunk | null)[];
  private loading = new Map<number, Promise<Chunk>>();
  constructor(nStars: number, private onLoad: (s: number) => void = () => {}) { this.chunks = new Array(nStars).fill(null); }
  get(s: number): Chunk | null { return this.chunks[s] ?? null; }
  load(s: number): Promise<Chunk> {
    const have = this.chunks[s]; if (have) return Promise.resolve(have);
    if (!this.loading.has(s)) this.loading.set(s, fetch(`./data/tracks/${s}.json`).then((r) => r.json()).then((c: Chunk) => { this.chunks[s] = c; this.onLoad(s); return c; }));
    return this.loading.get(s)!;
  }
}
