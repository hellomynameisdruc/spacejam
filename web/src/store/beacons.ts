// Beacons (likes): signals the visitor marked. Each one remembers the YouTube id plus title and artist,
// so it survives map rebuilds where track indices move.
import type { Chunk, TrackRef } from "../core/types";
import { type KV, readJSON, Signal } from "./storage";

/** st: the star's name, to find the track again after the map is rebuilt */
export type Beacon = { y: string; s: number; i: number; t: string; a: string; at: number; st?: string };
const KEY = "kosmos-likes";
/** YouTube makes a temporary playlist from up to this many ids */
export const YT_BATCH = 50;

export class Beacons {
  private list: Beacon[];
  private ids: Set<string>;
  readonly changed = new Signal();

  constructor(private kv: KV, private chunk: (s: number) => Chunk | null) {
    const raw = readJSON<unknown>(kv, KEY, []);
    this.list = (Array.isArray(raw) ? raw : []).filter((b): b is Beacon => !!b && typeof b.y === "string" && Number.isInteger(b.s) && Number.isInteger(b.i));
    this.ids = new Set(this.list.map((b) => b.y));
  }
  get all(): readonly Beacon[] { return this.list; }
  get size() { return this.list.length; }
  hasId(yt: string) { return this.ids.has(yt); }
  has(r: TrackRef | null) { const ch = r && this.chunk(r.s); return !!ch && this.ids.has(ch.yt[r!.i]); }

  toggle(r: TrackRef | null, starName?: string) {
    const ch = r && this.chunk(r.s); if (!r || !ch) return;
    const y = ch.yt[r.i];
    if (this.ids.has(y)) this.remove(y);
    else { this.ids.add(y); this.list = [{ y, s: r.s, i: r.i, t: ch.t[r.i], a: ch.an[ch.a[r.i]], at: Date.now(), ...(starName ? { st: starName } : {}) }, ...this.list]; this.save(); }
  }
  remove(y: string) {
    if (!this.ids.delete(y)) return;
    this.list = this.list.filter((b) => b.y !== y); this.save();
  }
  /** take a merged list (from the account): replaces what this browser has */
  replaceAll(list: Beacon[]) {
    this.list = list.filter((b) => !!b && typeof b.y === "string" && Number.isInteger(b.s) && Number.isInteger(b.i));
    this.ids = new Set(this.list.map((b) => b.y)); this.save();
  }
  /** where a beacon's track sits on the current map, or null if it moved out of reach */
  ref(b: Beacon, s = b.s): TrackRef | null {
    const ch = this.chunk(s);
    if (ch && s === b.s && ch.yt[b.i] === b.y) return { s, i: b.i };
    if (ch) { const i = ch.yt.indexOf(b.y); if (i >= 0) return { s, i }; }
    return null;
  }
  /** youtube.com/watch_videos links, YT_BATCH ids each */
  playlistLinks(): string[] {
    const out: string[] = [];
    for (let k = 0; k < this.list.length; k += YT_BATCH) out.push(`https://www.youtube.com/watch_videos?video_ids=${this.list.slice(k, k + YT_BATCH).map((b) => b.y).join(",")}`);
    return out;
  }
  private save() { this.kv.set(KEY, JSON.stringify(this.list)); this.changed.emit(); }
}
