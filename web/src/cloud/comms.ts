// COMMS as data: the messages of the rooms we're in (the open channel "all", and a fleet's "f:<host>"),
// one live line for new and removed messages, and what a pilot can do there: transmit, remove, report,
// and — the founder — give ranks. The chat panel (ui/comms.ts) draws it.
import type { RealtimeChannel } from "@supabase/supabase-js";
import { cloud } from "./client";
import { lookup, roster } from "./pilots";

export const ALL = "all";
const KEEP = 80;
export type Msg = { id: number; pilot: string; body: string; created_at: string; room?: string };
const rooms = new Map<string, Msg[]>(), loaded = new Set<string>();
let live: RealtimeChannel | null = null, wanted: (room: string) => boolean = (r) => r === ALL;

type Change = { kind: "loaded" | "removed"; room?: string } | { kind: "new"; room: string; msg: Msg };
const listeners: ((c: Change) => void)[] = [];
export const onComms = (f: (c: Change) => void) => { listeners.push(f); };
const emit = (c: Change) => listeners.forEach((f) => f(c));

export const messages = (room: string | null): readonly Msg[] => (room ? rooms.get(room) ?? [] : []);
const bucket = (r: string) => { let l = rooms.get(r); if (!l) rooms.set(r, (l = [])); return l; };
function add(m: Msg) {
  const l = bucket(m.room!); if (l.some((x) => x.id === m.id)) return false;
  l.push(m); if (l.length > KEEP) l.shift(); return true;
}

/** the latest messages of a room, once; false if the channel couldn't be reached */
export async function loadRoom(r: string) {
  if (loaded.has(r)) return true; loaded.add(r);
  const sb = await cloud();
  const { data, error } = await sb.from("messages").select("id,pilot,body,created_at,room").eq("room", r).order("created_at", { ascending: false }).limit(KEEP);
  if (error) { loaded.delete(r); return false; }
  for (const m of ((data ?? []) as Msg[]).reverse()) add({ ...m, room: r });
  bucket(r).sort((a, b) => a.id - b.id);
  await lookup(bucket(r).map((m) => m.pilot)).catch(() => {});
  emit({ kind: "loaded", room: r }); return true;
}
/** leaving a room (a fleet broke up): forget it */
export function dropRoom(r: string) { rooms.delete(r); loaded.delete(r); }

/** one live line for every room: each message is filed under its own, kept only for rooms we want */
export async function goLive(want: (room: string) => boolean) {
  wanted = want; if (live) return;
  const sb = await cloud();
  live = sb.channel("comms:live", { config: { private: true } })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async (e) => {
      const m = e.new as Msg; if (!m.room || !wanted(m.room)) return;
      await lookup([m.pilot]).catch(() => {});
      if (add(m)) emit({ kind: "new", room: m.room, msg: m });
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (e) => {
      if (forget((e.old as { id?: number }).id)) emit({ kind: "removed" });
    })
    .subscribe();
  addEventListener("beforeunload", () => { live?.unsubscribe(); });
}
function forget(id?: number) {
  let hit = false;
  for (const l of rooms.values()) { const k = l.findIndex((x) => x.id === id); if (k >= 0) { l.splice(k, 1); hit = true; } }
  return hit;
}

/** null when sent, else "too-fast" or the reason */
export async function transmit(room: string, text: string) {
  const { data, error } = await (await cloud()).from("messages").insert({ room, body: text.slice(0, 400) }).select("id,pilot,body,created_at,room").single();
  if (error) return /TOO FAST/.test(error.message) ? "too-fast" : error.message;
  const m = data as Msg; if (add({ ...m, room })) emit({ kind: "new", room, msg: m });
  return null;
}
export async function remove(id: number) {
  const { error } = await (await cloud()).from("messages").delete().eq("id", id);
  if (error) return false;
  forget(id); emit({ kind: "removed" }); return true;
}
/** a pilot's invites to their own fleet, everywhere in the chat: only one is ever current */
export async function clearInvites(hostId: string) {
  const tag = `#fleet-${hostId}`;
  const { error } = await (await cloud()).from("messages").delete().eq("pilot", hostId).like("body", `%${tag}%`);
  if (error) return false;
  let hit = false;
  for (const l of rooms.values()) for (let k = l.length - 1; k >= 0; k--) if (l[k].pilot === hostId && l[k].body.includes(tag)) { l.splice(k, 1); hit = true; }
  if (hit) emit({ kind: "removed" });
  return true;
}
export async function report(id: number) {
  const { error } = await (await cloud()).from("reports").insert({ message: id });
  return !error || error.code === "23505"; // reported before counts too
}
/** the founder gives a rank: the pilot's call sign as the registry has it, or why not */
export async function grantRank(nick: string, rank: string): Promise<{ nick: string } | { error: "not-authorised" | "no-such-pilot" | string }> {
  const { data, error } = await (await cloud()).rpc("grant_rank", { target: nick, new_rank: rank });
  if (error) return { error: /NOT AUTHORISED/.test(error.message) ? "not-authorised" : /NO SUCH PILOT/.test(error.message) ? "no-such-pilot" : error.message };
  for (const p of roster.values()) if (p.nick.toLowerCase() === nick.toLowerCase()) p.rank = rank;
  return { nick: String(data) };
}
