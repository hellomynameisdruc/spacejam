// Where the app keeps the visitor's own data. Today: this browser (localStorage). The interface is the
// seam for accounts later — swap in a synced store without touching the features that use it.

export interface KV {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/** localStorage that never throws (private windows, blocked storage, quota) */
export const browserKV: KV = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage unavailable */ } },
};

/** in-memory store, for tests */
export function memoryKV(init: Record<string, string> = {}): KV {
  const m = new Map(Object.entries(init));
  return { get: (k) => m.get(k) ?? null, set: (k, v) => { m.set(k, v); } };
}

export function readJSON<T>(kv: KV, key: string, fallback: T): T {
  const raw = kv.get(key); if (raw == null) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

/** tiny observer list used by the stores */
export class Signal {
  private fns: (() => void)[] = [];
  on(fn: () => void) { this.fns.push(fn); }
  emit() { for (const f of this.fns) { try { f(); } catch (e) { console.error(e); } } }
}
