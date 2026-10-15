// Dead signals: videos that turned out to be removed, private or not allowed to play on other sites.
// Remembered in this browser, so the visitor is never sent to them again and they go dark on the map.
import { type KV, readJSON, Signal } from "./storage";

const KEY = "kosmos-dead";
/** keep the newest this many (a few tens of KB at most) */
export const DEAD_MAX = 5000;

export class DeadSignals {
  private list: string[];
  private ids: Set<string>;
  readonly changed = new Signal();

  constructor(private kv: KV) {
    const raw = readJSON<unknown>(kv, KEY, []);
    this.list = (Array.isArray(raw) ? raw : []).filter((y): y is string => typeof y === "string").slice(-DEAD_MAX);
    this.ids = new Set(this.list);
  }
  get size() { return this.ids.size; }
  has(y: string) { return this.ids.has(y); }
  add(y: string) {
    if (!y || this.ids.has(y)) return;
    this.list.push(y); this.ids.add(y);
    while (this.list.length > DEAD_MAX) this.ids.delete(this.list.shift()!);
    this.kv.set(KEY, JSON.stringify(this.list)); this.changed.emit();
  }
}
