// The logbook: a signed-in pilot's beacons and flight log, kept with the account so every device has
// them. On sign-in this browser's and the account's are merged; after that every change is sent up.
// A removed beacon leaves a tombstone ("gone": id → when), so another device's copy can't bring it back
// unless it was set again later.
import { beacons, flightLog } from "../app/state";
import type { Beacon } from "../store/beacons";
import type { LogEntry } from "../store/flightLog";
import { browserKV, readJSON } from "../store/storage";
import { cloud } from "./client";
import { onPilot, pilot } from "../ui/pilot";

const GONE = "kosmos-gone", MAX_GONE = 500;
let uid: string | null = null, applying = false, timer = 0, ready = false;
let gone: Record<string, number> = readJSON(browserKV, GONE, {});
let known = new Set(beacons.all.map((b) => b.y));

const keyOf = (e: LogEntry) => e.y ?? e.k;
function trimGone() {
  const e = Object.entries(gone).sort((a, b) => b[1] - a[1]).slice(0, MAX_GONE);
  gone = Object.fromEntries(e); browserKV.set(GONE, JSON.stringify(gone));
}

/** this browser's logbook and the account's, as one: beacons by when they were first set, minus the
 *  ones removed since (tombstones win over older copies); flights by track, latest time kept */
export function mergeLogbook(localB: readonly Beacon[], localL: readonly LogEntry[], localGone: Record<string, number>, remote: { beacons?: unknown; gone?: unknown; flights?: unknown }) {
  const g = { ...localGone }, rg = (remote.gone && typeof remote.gone === "object" ? remote.gone : {}) as Record<string, number>;
  for (const [y, t] of Object.entries(rg)) if (typeof t === "number" && !(g[y] >= t)) g[y] = t;
  const byId = new Map<string, Beacon>();
  for (const b of [...(Array.isArray(remote.beacons) ? remote.beacons : []) as Beacon[], ...localB]) {
    if (!b || typeof b.y !== "string") continue;
    const had = byId.get(b.y); if (!had || (b.at ?? 0) < (had.at ?? 0)) byId.set(b.y, b);
  }
  const list = [...byId.values()].filter((b) => !(g[b.y] >= (b.at ?? 0))).sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  const log = new Map<string, LogEntry>();
  for (const e of [...(Array.isArray(remote.flights) ? remote.flights : []) as LogEntry[], ...localL]) {
    if (!e || typeof e.t !== "number") continue;
    const had = log.get(keyOf(e)); if (!had || e.t > had.t) log.set(keyOf(e), e);
  }
  return { beacons: list, flights: [...log.values()].sort((a, b) => b.t - a.t), gone: g };
}

function merge(remote: { beacons?: unknown; gone?: unknown; flights?: unknown }) {
  const m = mergeLogbook(beacons.all, flightLog.all, gone, remote);
  gone = m.gone; trimGone();
  applying = true;
  try { beacons.replaceAll(m.beacons); flightLog.replaceAll(m.flights); }
  finally { applying = false; }
  known = new Set(beacons.all.map((b) => b.y));
}

async function push() {
  if (!uid || !ready) return;
  const sb = await cloud();
  await sb.from("logbooks").upsert({ pilot: uid, beacons: beacons.all, gone, flights: flightLog.all, updated_at: new Date().toISOString() });
}
const later = () => { clearTimeout(timer); timer = window.setTimeout(push, 1500); };

async function pull() {
  if (!uid) return;
  const sb = await cloud(), { data, error } = await sb.from("logbooks").select("beacons,gone,flights").eq("pilot", uid).maybeSingle();
  if (error) return; // no logbook table yet: stay local
  if (data) merge(data);
  ready = true; await push();
}

export function initSync() {
  beacons.changed.on(() => {
    const now = new Set(beacons.all.map((b) => b.y));
    if (!applying) { for (const y of known) if (!now.has(y)) gone[y] = Date.now(); trimGone(); }
    known = now;
    if (!applying) later();
  });
  flightLog.changed.on(() => { if (!applying) later(); });
  onPilot(() => {
    const id = pilot.me?.id ?? null; if (id === uid) return;
    uid = id; ready = false; if (uid) pull();
  });
  // coming back to the tab: pick up what other devices added meanwhile
  document.addEventListener("visibilitychange", () => { if (!document.hidden && uid) pull(); });
}
