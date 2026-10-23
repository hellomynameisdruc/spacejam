// FLEETS: a pilot broadcasts what is on air, others tune in and hear the same track at the same moment,
// each through their own YouTube player (we only share which video and where in it, never the sound).
// The host steers; the crew follows. Live channels, nothing stored:
//   "onair"          — who is broadcasting, with the track they are on and how many tuned in
//   "fleet:<hostId>" — the fleet: who is aboard and the host's position in the track
// The channels are private: the database lets anyone listen, signed-in pilots show up, and only a
// fleet's own host send into it. Names and ranks shown come from the registry, not from the channel.
// The fleet's chat is a room of COMMS ("f:<hostId>"), stored like the open channel and fading after hours.
import type { RealtimeChannel } from "@supabase/supabase-js";
import { $ } from "../core/dom";
import { esc, hash } from "../core/util";
import { chunk, galaxy, state, tracks } from "../app/state";
import { select } from "../app/actions";
import { cloud } from "../cloud/client";
import { onFrame } from "../render/scene";
import { ICON, player, playTestSignal } from "./dock";
import { lookup, openPilot, pilot, roster } from "./pilot";
import { rankOf } from "./ranks";
import { flashKey, toast } from "./toast";

export type Who = { id: string; nick: string; avatar: number; rank?: string };
export type Host = Who & { title: string; artist: string; style: string; n: number };
type Sync = { yt: string; st: string; i: number; t: number; playing: boolean; title: string; artist: string };

export const fleet = {
  role: null as null | "host" | "crew",
  hostId: "",
  host: null as Who | null,
  crew: [] as Who[],
  hosts: [] as Host[],
  note: "",
};
const subs: (() => void)[] = [];
export const onFleet = (f: () => void) => { subs.push(f); };
/** a pilot as the registry knows them; what came over the channel only until the registry answers */
export const known = <T extends Who>(w: T): T => { const p = roster.get(w.id); return p ? { ...w, nick: p.nick, avatar: p.avatar, rank: p.rank } : w; };
let looking = false;
function emit() {
  const ids = [...fleet.hosts, ...fleet.crew, ...(fleet.host ? [fleet.host] : [])].map((w) => w.id).filter((id) => !roster.has(id));
  if (ids.length && !looking) { looking = true; lookup(ids).catch(() => {}).finally(() => { looking = false; if (ids.some((id) => roster.has(id))) emit(); }); }
  const meId = me().id, aboard = [...(fleet.role === "crew" && fleet.host ? [fleet.host] : []), ...fleet.crew].filter((w) => w.id !== meId).map(known);
  state.fleetShips = fleet.role ? aboard.map((w) => ({ nick: w.nick, color: rankOf(w.rank).color })) : [];
  state.following = fleet.role === "crew";
  paintBar(); subs.forEach((f) => f());
}

let guest = ""; // a listener without an account still needs a name on the channel
function me(): Who {
  if (pilot.me) return { id: pilot.me.id, nick: pilot.me.nick, avatar: pilot.me.avatar, rank: pilot.me.rank };
  guest ||= `guest-${Math.random().toString(36).slice(2, 10)}`;
  return { id: guest, nick: "GUEST", avatar: hash(guest) % 2147483647, rank: "cadet" };
}
const subscribed = (c: RealtimeChannel) => new Promise<void>((res, rej) => c.subscribe((s) => { if (s === "SUBSCRIBED") res(); else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") rej(new Error(s)); }));

// —— ON AIR: the list of broadcasts
let air: RealtimeChannel | null = null, airJoin: Promise<RealtimeChannel> | null = null;
export function watchOnAir() {
  return (airJoin ??= (async () => {
    const sb = await cloud(), c = sb.channel("onair", { config: { private: true, presence: { key: `${me().id}-${Math.random().toString(36).slice(2, 6)}` } } });
    c.on("presence", { event: "sync" }, () => {
      const seen = new Set<string>();
      fleet.hosts = Object.values(c.presenceState<Host>()).flat().filter((h) => h.title !== undefined && !seen.has(h.id) && seen.add(h.id));
      emit();
    });
    await subscribed(c); air = c; return c;
  })().catch((e) => { airJoin = null; throw e; }));
}
let lastAnnounce = "";
function announce() {
  if (fleet.role !== "host" || !air) return;
  const np = state.nowPlaying, ch = np && chunk(np.s);
  const h: Host = { ...me(), title: ch ? ch.t[np!.i] : $("npTitle").textContent ?? "", artist: ch ? ch.an[ch.a[np!.i]] : "", style: np ? galaxy.stars[np.s].name : "", n: fleet.crew.length };
  const key = JSON.stringify(h); if (key === lastAnnounce) return; lastAnnounce = key;
  air.track(h);
}

// —— the fleet channel
let fc: RealtimeChannel | null = null, seenHost = false, expectYt = "", offMap = "", lastSync = 0, joinTimer = 0;
async function board(hostId: string, role: "host" | "crew") {
  await disembark();
  fleet.role = role; fleet.hostId = hostId; fleet.crew = []; fleet.host = role === "host" ? me() : null; fleet.note = ""; seenHost = false;
  emit();
  const sb = await cloud();
  const c = sb.channel(`fleet:${hostId}`, { config: { private: true, broadcast: { self: false }, presence: { key: `${me().id}-${Math.random().toString(36).slice(2, 6)}` } } });
  c.on("presence", { event: "sync" }, () => {
    const all = Object.values(c.presenceState<Who & { host?: boolean }>()).flat(), ids = new Set<string>();
    fleet.crew = all.filter((w) => !w.host && !ids.has(w.id) && ids.add(w.id));
    const h = all.find((w) => w.host);
    if (h) { fleet.host = h; seenHost = true; }
    else if (role === "crew" && seenHost) { leave("THE HOST WENT OFF AIR."); return; }
    emit(); announce();
    if (role === "host") sendSync(); // someone came aboard: tell them where we are
  });
  c.on("broadcast", { event: "sync" }, ({ payload }) => { if (fleet.role === "crew") follow(payload as Sync); });
  c.on("broadcast", { event: "end" }, () => { if (fleet.role === "crew") leave("THE BROADCAST HAS ENDED."); });
  try { await subscribed(c); } catch { fleet.role = null; fleet.note = "NO SIGNAL. TRY AGAIN IN A MOMENT."; emit(); return; }
  fc = c;
  await c.track({ ...me(), host: role === "host" }).catch(() => {}); // a guest listens without showing up
  if (role === "crew") {
    clearTimeout(joinTimer);
    joinTimer = window.setTimeout(() => { if (fleet.role === "crew" && !seenHost) leave("NOBODY IS BROADCASTING ON THIS FREQUENCY."); }, 7000);
  } else sendSync();
}
async function disembark() {
  clearTimeout(joinTimer);
  const c = fc; fc = null; expectYt = "";
  if (c) await c.unsubscribe().catch(() => {});
}

/** ((•)): broadcast what is on air */
export async function startBroadcast() {
  if (!pilot.me) { openPilot(); return; }
  await watchOnAir().catch(() => {});
  await board(pilot.me.id, "host");
  announce();
  if (fleet.role === "host") toast("You are on air: pilots can tune in from ON AIR or your invite link");
}
export async function endBroadcast() {
  if (fleet.role !== "host") return;
  fc?.send({ type: "broadcast", event: "end", payload: {} });
  air?.untrack(); lastAnnounce = "";
  await disembark(); fleet.role = null; fleet.crew = []; emit();
  toast("Broadcast ended");
}
export async function tuneIn(hostId: string) {
  if (fleet.role === "host") await endBroadcast();
  if (pilot.me && hostId === pilot.me.id) return;
  await board(hostId, "crew");
  if (fleet.role === "crew") toast("Tuned in: you hear what the host hears");
}
export async function leave(why = "") {
  if (!why && fleet.role === "crew") toast("You left the fleet");
  await disembark(); fleet.role = null; fleet.host = null; fleet.crew = []; fleet.note = why; emit();
  if (why) setTimeout(() => { if (fleet.note === why) { fleet.note = ""; emit(); } }, 6000);
}
/** the fleet's room in COMMS */
export const fleetRoom = () => (fleet.role ? `f:${fleet.hostId}` : null);
export const inviteLink = () => `${location.origin}${location.pathname}#fleet-${fleet.hostId}`;

// —— the host's position, sent on every change and every few seconds
let sent = { yt: "", playing: false, t: 0, at: 0 };
function sendSync() {
  const np = state.nowPlaying, ch = np && chunk(np.s); if (!fc || !np || !ch) return;
  const p: Sync = { yt: ch.yt[np.i], st: galaxy.stars[np.s].name, i: np.i, t: player.time(), playing: player.playing, title: ch.t[np.i], artist: ch.an[ch.a[np.i]] };
  fc.send({ type: "broadcast", event: "sync", payload: p });
  sent = { yt: p.yt, playing: p.playing, t: p.t, at: performance.now() };
  announce();
}

// —— the crew follows
async function follow(p: Sync) {
  expectYt = p.yt; lastSync = performance.now();
  const np = state.nowPlaying, cur = np && chunk(np.s)?.yt[np.i];
  if (cur === p.yt || offMap === p.yt) { align(p); return; }
  offMap = "";
  const got = performance.now(), s = galaxy.starIndex(p.st);
  const c = s >= 0 ? await tracks.load(s).catch(() => null) : null, i = c ? (c.yt[p.i] === p.yt ? p.i : c.yt.indexOf(p.yt)) : -1;
  if (c && i >= 0) select({ kind: "track", s, i }, true, true);
  else { offMap = p.yt; playTestSignal(p.yt); $("npTitle").textContent = p.title; $("npArtist").textContent = p.artist; } // not on this map: play it anyway
  // once the new video runs, jump to where the host is now
  let k = 0;
  const catchUp = () => {
    const fresh = player.ready && player.time() > 0.1 && player.time() < 6;
    if (fresh || ++k > 24) { align({ ...p, t: p.t + (performance.now() - got) / 1000 }); return; }
    setTimeout(catchUp, 250);
  };
  setTimeout(catchUp, 300);
}
function align(p: Sync) {
  if (!player.ready) return;
  if (p.playing !== player.playing && !player.buffering) player.toggle();
  if (p.playing && Math.abs(player.time() - (p.t + 0.3)) > 2.5) player.seek(p.t + 0.3);
}

// —— the bar in the player
function paintBar() {
  const bar = $("fleetBar"), cast = $("dockCast");
  cast.classList.toggle("on", fleet.role === "host"); cast.hidden = fleet.role === "crew";
  cast.title = fleet.role === "host" ? "Broadcasting: other pilots can tune in. Click to stop" : "Broadcast: let other pilots tune in and listen with you";
  if (!fleet.role && !fleet.note) { bar.hidden = true; return; }
  bar.hidden = false;
  const n = fleet.crew.length - (fleet.role === "crew" ? 1 : 0);
  bar.innerHTML = fleet.role === "host"
    ? `<span class="fl-on">${ICON.cast}LIVE</span><span class="fl-n">${n} TUNED IN</span><button type="button" class="dock-btn fl-b" data-fl="invite" title="Copy the invite link">INVITE</button><button type="button" class="dock-btn fl-b" data-fl="end">END</button>`
    : fleet.role === "crew"
      ? `<span class="fl-on">⇢ TUNED IN</span><span class="fl-n">${esc((fleet.host ? known(fleet.host).nick : "…").toUpperCase())}${n > 0 ? ` +${n}` : ""}</span><button type="button" class="dock-btn fl-b" data-fl="leave">LEAVE</button>`
      : `<span class="fl-n">${esc(fleet.note)}</span>`;
}
export async function copyInvite() {
  try { await navigator.clipboard.writeText(inviteLink()); toast("Invite link copied. Paste it to a friend"); return true; }
  catch { toast(`Copy this link: ${inviteLink()}`, "err"); return false; }
}

export function initFleet() {
  $("dockCast").onclick = () => (fleet.role === "host" ? endBroadcast() : startBroadcast());
  $("fleetBar").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-fl]"); if (!b) return;
    const a = b.dataset.fl;
    if (a === "end") endBroadcast(); else if (a === "leave") leave(); else if (a === "invite") copyInvite().then((ok) => { if (ok) flashKey(b, "COPIED ✓"); });
  });
  // the host: report every change; the crew: notice flying off alone
  let last = 0, lastT = 0;
  onFrame((now) => {
    if (now - last < 500) return;
    const dt = (now - last) / 1000; last = now;
    if (fleet.role === "host" && fc) {
      const np = state.nowPlaying, yt = np ? chunk(np.s)?.yt[np.i] ?? "" : "", t = player?.time() ?? 0;
      const jumped = player?.playing && Math.abs(t - (lastT + dt)) > 3; lastT = t;
      if (yt !== sent.yt || (player?.playing ?? false) !== sent.playing || jumped || now - sent.at > 8000) sendSync();
    }
    if (fleet.role === "crew" && expectYt && now - lastSync > 4000) {
      const np = state.nowPlaying, yt = np ? chunk(np.s)?.yt[np.i] : null;
      if (yt && yt !== expectYt && offMap !== expectYt) leave("YOU FLEW OFF ON YOUR OWN COURSE. LEFT THE FLEET.");
    }
  });
  addEventListener("beforeunload", () => { if (fleet.role === "host") fc?.send({ type: "broadcast", event: "end", payload: {} }); });
  // an invite link: #fleet-<host>
  const m = location.hash.match(/^#fleet-([\w-]{6,64})$/);
  if (m) setTimeout(() => tuneIn(m[1]), 800);
  paintBar();
}
