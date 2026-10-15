// Fetching the map and, lazily, each star's tracks.
import type { Chunk, MapData, Planet } from "../core/types";

// The map is always revalidated; the files it points to carry its build id, so a browser can never mix
// a fresh map with track files cached from an earlier build (star numbers change between builds).
export const loadMap = (): Promise<MapData> => fetch("./data/map.json", { cache: "no-cache" }).then((r) => r.json());
let build = "";
// "-2": the packed two-file format, so browsers don't reuse track files cached in the old one
export const setDataVersion = (v: string | undefined) => { build = v ? `?v=${encodeURIComponent(v)}-2` : ""; };
export const loadArtists = (): Promise<[string, number, number][]> => fetch(`./data/artists.json${build}`).then((r) => r.json());

/** a star's tracks as stored: ids glued together, years, and the asteroid belt's coordinates */
export type PackedTracks = { v: 2; n: number; yt: string; yr: number[]; bx: number[]; by: number[] };
/** the words, fetched right after: titles and artist names one per line, and each track's artist */
export type PackedWords = { t: string; an: string; a: number[] };
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/**
 * Unpack a star's tracks into the chunk the app works with. A planet's satellites sit on a golden-angle
 * spiral by track number (as the map builder put them), so their positions are worked out here rather
 * than downloaded; titles and artists stay empty until addWords.
 */
export function unpackTracks(b: PackedTracks, planets: readonly { P: Planet; pi: number }[]): Chunk {
  const n = b.n, yt = new Array<string>(n), p = new Array<number>(n).fill(-1), x = new Array<number>(n), y = new Array<number>(n);
  for (let i = 0; i < n; i++) yt[i] = b.yt.slice(i * 11, i * 11 + 11);
  for (const { P, pi } of planets) for (let i = P.t0, k = 0; i < P.t1; i++, k++) {
    const rr = P.r + 4 + 1.5 * Math.sqrt(k + 0.5), a = k * GOLDEN;
    p[i] = pi; x[i] = P.x + rr * Math.cos(a); y[i] = P.y + rr * Math.sin(a);
  }
  for (let i = 0, k = 0; i < n; i++) if (p[i] < 0) { x[i] = b.bx[k]; y[i] = b.by[k]; k++; }
  return { yt, yr: b.yr, p, x, y, t: [], a: [], an: [] };
}
export function addWords(ch: Chunk, w: PackedWords) { ch.t = w.t.split("\n"); ch.an = w.an.split("\n"); ch.a = w.a; }

/**
 * Tracks are split per star system and fetched on first need, in two steps: first what the map needs
 * to draw the satellites (base), then the titles and artists. get() gives a star only once both are in;
 * the renderer uses base() so the satellites show up as soon as possible.
 */
export class TrackStore {
  private chunks: (Chunk | null)[];
  private full: Uint8Array;
  private loading = new Map<number, Promise<Chunk>>();
  /** planets: the map's planets, to put the satellites back around them */
  constructor(nStars: number, private planets: readonly Planet[] = [], private onLoad: (s: number) => void = () => {}) {
    this.chunks = new Array(nStars).fill(null); this.full = new Uint8Array(nStars);
  }
  get(s: number): Chunk | null { return this.full[s] ? this.chunks[s] : null; }
  base(s: number): Chunk | null { return this.chunks[s] ?? null; }
  load(s: number): Promise<Chunk> {
    const have = this.get(s); if (have) return Promise.resolve(have);
    if (!this.loading.has(s)) this.loading.set(s, this.fetchStar(s));
    return this.loading.get(s)!;
  }
  private async fetchStar(s: number): Promise<Chunk> {
    const raw = await fetch(`./data/tracks/${s}.json${build}`).then((r) => r.json()) as PackedTracks | Chunk;
    if (Array.isArray(raw.yt)) { this.chunks[s] = raw as Chunk; this.full[s] = 1; this.onLoad(s); return raw as Chunk; } // the older one-file format
    // the star's planets, with their indices in the whole map (that is what a track's planet number is)
    const ch = unpackTracks(raw as PackedTracks, this.planets.map((P, pi) => ({ P, pi })).filter((q) => q.P.s === s));
    this.chunks[s] = ch; this.onLoad(s); // satellites can be drawn now
    addWords(ch, await fetch(`./data/titles/${s}.json${build}`).then((r) => r.json()));
    this.full[s] = 1; this.onLoad(s);
    return ch;
  }
}
