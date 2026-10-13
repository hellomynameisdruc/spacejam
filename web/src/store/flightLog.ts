// Flight log: the last tracks played, newest first. Entries remember the YouTube id and the star's
// name, so they can be found again after the map is rebuilt and track numbers move.
import type { TrackRef } from "../core/types";
import { type KV, readJSON, Signal } from "./storage";

const KEY = "kosmos-log2";
const MAX = 40;
/** k = "<star>-<track>" on map build b; y = YouTube id; st = star name */
export type LogEntry = { k: string; t: number; b?: string; y?: string; st?: string };
export type LogRef = TrackRef & { t: number; b?: string; y?: string; st?: string };

export class FlightLog {
  private list: LogEntry[];
  readonly changed = new Signal();
  constructor(private kv: KV) {
    const raw = readJSON<unknown>(kv, KEY, []);
    this.list = (Array.isArray(raw) ? raw : []).filter((x): x is LogEntry => !!x && typeof x.k === "string" && /^\d+-\d+$/.test(x.k) && typeof x.t === "number");
  }
  get all(): readonly LogEntry[] { return this.list; }
  get size() { return this.list.length; }
  add(r: TrackRef, now = Date.now(), info: { b?: string; y?: string; st?: string } = {}) {
    const k = `${r.s}-${r.i}`, e: LogEntry = { k, t: now };
    if (info.b) e.b = info.b;
    if (info.y) e.y = info.y;
    if (info.st) e.st = info.st;
    this.list = [e, ...this.list.filter((x) => (e.y && x.y ? x.y !== e.y : x.k !== k))].slice(0, MAX);
    this.kv.set(KEY, JSON.stringify(this.list)); this.changed.emit();
  }
  /** entries as track references (as saved; see locate() for finding them on the current map) */
  refs(): LogRef[] {
    return this.list.map((x) => { const [s, i] = x.k.split("-").map(Number); return { s, i, t: x.t, b: x.b, y: x.y, st: x.st }; });
  }
}
