// Flight log: the last tracks played, newest first.
import type { TrackRef } from "../core/types";
import { type KV, readJSON, Signal } from "./storage";

const KEY = "kosmos-log2";
const MAX = 40;
export type LogEntry = { k: string; t: number };

export class FlightLog {
  private list: LogEntry[];
  readonly changed = new Signal();
  constructor(private kv: KV) { this.list = readJSON<LogEntry[]>(kv, KEY, []); }
  get all(): readonly LogEntry[] { return this.list; }
  get size() { return this.list.length; }
  add(r: TrackRef, now = Date.now()) {
    const k = `${r.s}-${r.i}`;
    this.list = [{ k, t: now }, ...this.list.filter((x) => x.k !== k)].slice(0, MAX);
    this.kv.set(KEY, JSON.stringify(this.list)); this.changed.emit();
  }
  /** entries as track references */
  refs() { return this.list.map((x) => { const [s, i] = x.k.split("-").map(Number); return { s, i, t: x.t }; }); }
}
