// Small per-visitor settings.
import type { KV } from "./storage";

export const PHOSPHORS = ["violet", "green", "amber"] as const;
export type Phosphor = (typeof PHOSPHORS)[number];

export class Prefs {
  constructor(private kv: KV) {}
  get phosphor(): Phosphor { const v = this.kv.get("kosmos-ph"); return (PHOSPHORS as readonly string[]).includes(v ?? "") ? (v as Phosphor) : "violet"; }
  set phosphor(v: Phosphor) { this.kv.set("kosmos-ph", v); }
  get volume(): number | null { const v = this.kv.get("kosmos-vol"); return v === null ? null : +v; }
  set volume(v: number | null) { if (v !== null) this.kv.set("kosmos-vol", String(v)); }
}
