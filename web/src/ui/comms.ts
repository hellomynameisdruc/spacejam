// COMMS: the open channel, a chat for every pilot, in the panel under the dossier. Anyone can listen;
// signed-in pilots transmit. New messages arrive live; three reports take a message off the air.
// A fleet has its own room here ("f:<host>"), stored the same way so nobody speaks under another's name,
// and fading a few hours on. ON AIR lists the broadcasts to tune in to.
import type { RealtimeChannel } from "@supabase/supabase-js";
import { esc, pad } from "../core/util";
import { $ } from "../core/dom";
import { cloud } from "../cloud/client";
import { avatarSvg } from "./avatar";
import { lookup, onPilot, openPilot, pilot, roster, wake } from "./pilot";
import { isStaff, rankKey, rankOf, rankTag, RANKS } from "./ranks";
import { flashKey, toast } from "./toast";
import { ICON } from "./dock";
import { copyInvite, fleet, fleetRoom, inviteLink, known, leave, onFleet, tuneIn, watchOnAir } from "./fleet";

const ALL = "all", KEEP = 80;
type Msg = { id: number; pilot: string; body: string; created_at: string; room?: string };
const rooms = new Map<string, Msg[]>(), loaded = new Set<string>(), reported = new Set<number>();
let unread = 0;
const seen = () => !$("comms").hidden && !document.hidden;
function paintUnread() { const b = $("commsUnread"); b.hidden = !unread; b.textContent = unread > 99 ? "99+" : String(unread); $("tabComms").classList.toggle("news", unread > 0); }
let started = false, channel: RealtimeChannel | null = null, note = "", view: "all" | "fleet" | "air" = "all";
const room = () => (view === "fleet" ? fleetRoom() : ALL);
const list = (r: string | null) => { if (!r) return []; let l = rooms.get(r); if (!l) rooms.set(r, (l = [])); return l; };

const time = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`; };

function nameTag(p: { nick?: string; rank?: string } | undefined) {
  const k = rankOf(p?.rank);
  return `${rankTag(p?.rank)}<b${k.color ? ` style="color:${k.color}"` : ""}>${esc((p?.nick ?? "PILOT").toUpperCase())}</b>`;
}
function line(m: Msg) {
  const p = roster.get(m.pilot), mine = m.pilot === pilot.me?.id;
  const act = !pilot.me ? "" : mine || isStaff(pilot.me)
    ? `<button class="m-x" data-del="${m.id}" aria-label="Delete the message" title="Delete">×</button>`
    : `<button class="m-x" data-rep="${m.id}" aria-label="Report this message" title="${reported.has(m.id) ? "Reported" : "Report"}" ${reported.has(m.id) ? "disabled" : ""}>!</button>`;
  return `<div class="msg${mine ? " mine" : ""}">${avatarSvg(p?.avatar ?? 0, 32)}<div class="m-b"><span class="m-h">${nameTag(p)}<time>${time(m.created_at)}</time>${act}</span>${body(m.body, p?.nick)}</div></div>`;
}
/** a message's text; an invite to a fleet becomes a card to board it */
function body(text: string, nick?: string) {
  const f = text.match(/#fleet-([\w-]{6,64})/);
  if (!f) return `<span class="m-t">${esc(text)}</span>`;
  const rest = text.replace(/\S*#fleet-[\w-]{6,64}\S*/, "").trim();
  return `${rest ? `<span class="m-t">${esc(rest)}</span>` : ""}<button type="button" class="m-card" data-join="${esc(f[1])}">▶ JOIN ${esc((nick ?? "THE").toUpperCase())}${nick ? "’S" : ""} FLEET <i>TUNE IN</i></button>`;
}
function airList() {
  if (!fleet.hosts.length) return `<p class="note">NOBODY IS BROADCASTING RIGHT NOW. START ONE WITH <span class="ico-in">${ICON.cast}</span> IN THE PLAYER.</p>`;
  return fleet.hosts.map((raw) => {
    const h = known(raw), self = h.id === pilot.me?.id, on = fleet.role === "crew" && fleet.hostId === h.id;
    return `<div class="msg air">${avatarSvg(h.avatar, 32)}<div class="m-b"><span class="m-h">${nameTag(h)}<time>${h.n} ${h.n === 1 ? "PILOT" : "PILOTS"}</time></span><span class="m-t">♪ ${esc(h.artist)}${h.artist ? " — " : ""}${esc(h.title)}</span><span class="m-s">${esc(h.style.toUpperCase())}</span></div>${self ? `<span class="air-tag">YOU</span>` : on ? `<button type="button" class="key" data-leave>LEAVE</button>` : `<button type="button" class="key hot" data-join="${esc(h.id)}">TUNE IN</button>`}</div>`;
  }).join("");
}

function paint() {
  if (view === "fleet" && !fleet.role) view = "all";
  const el = $("commsList"), atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  const invite = fleet.role ? `<div class="fl-inv"><span>INVITE PILOTS</span><button type="button" class="key" data-fl-copy>COPY LINK</button><button type="button" class="key" data-fl-post>POST TO ALL</button></div>` : "";
  const msgs = list(room());
  el.innerHTML = view === "air" ? airList()
    : view === "fleet" ? invite + (msgs.length ? msgs.map(line).join("") : `<p class="note">THE FLEET'S OWN CHANNEL. ITS MESSAGES FADE A FEW HOURS ON.</p>`)
    : msgs.length ? msgs.map(line).join("") : `<p class="note">${started ? "SILENCE ON THE CHANNEL. SAY HELLO." : "TUNING IN…"}</p>`;
  if (atEnd && view !== "air") el.scrollTop = el.scrollHeight;
  for (const b of document.querySelectorAll<HTMLElement>(".comms-ch [data-ch]")) b.setAttribute("aria-selected", String(b.dataset.ch === view));
  $("chFleet").hidden = !fleet.role;
  $("fleetN").textContent = fleet.role ? String(fleet.crew.length + 1) : "";
  $("airN").textContent = fleet.hosts.length ? String(fleet.hosts.length) : "";
  const f = $("commsForm");
  f.hidden = view === "air";
  f.classList.toggle("off", !pilot.me);
  ($("commsIn") as HTMLInputElement).disabled = !pilot.me;
  ($("commsIn") as HTMLInputElement).placeholder = !pilot.me ? "sign in to transmit" : view === "fleet" ? "talk to your fleet" : "transmit to all pilots";
  $("commsNote").textContent = note; $("commsNote").hidden = !note;
}

/** the latest messages of a room, once */
async function load(r: string | null) {
  if (!r || loaded.has(r)) return; loaded.add(r);
  const sb = await cloud();
  const { data, error } = await sb.from("messages").select("id,pilot,body,created_at,room").eq("room", r).order("created_at", { ascending: false }).limit(KEEP);
  if (error) { loaded.delete(r); if (r === ALL) note = "NO SIGNAL FROM COMMS. TRY AGAIN LATER."; paint(); return; }
  const l = list(r), have = new Set(l.map((m) => m.id));
  l.push(...((data ?? []) as Msg[]).reverse().filter((m) => !have.has(m.id))); l.sort((a, b) => a.id - b.id);
  await lookup(l.map((m) => m.pilot)).catch(() => {});
  paint(); $("commsList").scrollTop = $("commsList").scrollHeight;
}

async function start() {
  if (started) return; started = true;
  wake();
  await load(ALL);
  const sb = await cloud();
  // one live line for every room: each message is filed under its own, and kept only for rooms we're in
  channel = sb.channel("comms:live", { config: { private: true } })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async (e) => {
      const m = e.new as Msg; if (!m.room || (m.room !== ALL && m.room !== fleetRoom())) return;
      const l = list(m.room); if (l.some((x) => x.id === m.id)) return;
      await lookup([m.pilot]).catch(() => {});
      l.push(m); if (l.length > KEEP) l.shift(); paint();
      if (m.pilot !== pilot.me?.id && !seen()) { unread++; paintUnread(); }
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (e) => {
      const id = (e.old as { id?: number }).id;
      for (const l of rooms.values()) { const k = l.findIndex((x) => x.id === id); if (k >= 0) { l.splice(k, 1); paint(); } }
    })
    .subscribe();
}

async function send() {
  const inp = $("commsIn") as HTMLInputElement, text = inp.value.trim(), r = room();
  if (!pilot.me) { openPilot(); return; }
  if (!text || !r) return;
  if (text.startsWith("/")) { await command(text); return; }
  inp.disabled = true;
  const { data, error } = await (await cloud()).from("messages").insert({ room: r, body: text.slice(0, 400) }).select("id,pilot,body,created_at,room").single();
  inp.disabled = false; inp.focus();
  if (error) { note = /TOO FAST/.test(error.message) ? "TOO FAST. ONE MESSAGE EVERY FEW SECONDS." : "TRANSMISSION FAILED. TRY AGAIN."; paint(); return; }
  inp.value = ""; note = "";
  const m = data as Msg, l = list(r);
  if (!l.some((x) => x.id === m.id)) { l.push(m); if (l.length > KEEP) l.shift(); }
  paint(); $("commsList").scrollTop = $("commsList").scrollHeight;
}

/** the console: /rank CALLSIGN RANK (the founder), /ranks lists them */
async function command(text: string) {
  const inp = $("commsIn") as HTMLInputElement, [cmd, nick, ...rest] = text.slice(1).trim().split(/\s+/);
  if (cmd === "ranks" || cmd === "help") { note = `RANKS: ${Object.keys(RANKS).join(" · ")}. GIVE ONE: /rank CALLSIGN RANK`; inp.value = ""; paint(); return; }
  if (cmd !== "rank" || !nick || !rest.length) { note = "UNKNOWN COMMAND. TRY /ranks"; paint(); return; }
  const r = rankKey(rest.join(" ")); if (!r) { note = `NO SUCH RANK. ${Object.keys(RANKS).join(" · ")}`; paint(); return; }
  const { data, error } = await (await cloud()).rpc("grant_rank", { target: nick, new_rank: r });
  if (error) note = /NOT AUTHORISED/.test(error.message) ? "ONLY THE FOUNDER GIVES RANKS." : /NO SUCH PILOT/.test(error.message) ? `NO PILOT CALLED ${nick.toUpperCase()}.` : `FAILED: ${error.message}`;
  else {
    note = ""; toast(`${String(data)} is now ${RANKS[r].label}`); inp.value = "";
    for (const p of roster.values()) if (p.nick.toLowerCase() === nick.toLowerCase()) p.rank = r;
  }
  paint();
}

async function act(e: Event) {
  const t = e.target as HTMLElement;
  const j = t.closest<HTMLElement>("[data-join]"); if (j) { await tuneIn(j.dataset.join!); return; }
  if (t.closest("[data-leave]")) { await leave(); return; }
  const cp = t.closest<HTMLElement>("[data-fl-copy]"); if (cp) { if (await copyInvite()) flashKey(cp, "COPIED ✓"); return; }
  if (t.closest("[data-fl-post]")) { if (!pilot.me) { openPilot(); return; } const inp = $("commsIn") as HTMLInputElement; inp.value = `Tune in with me: ${inviteLink()}`; view = "all"; paint(); await send(); if (!note) toast("Invite posted to ALL"); return; }
  const b = t.closest<HTMLElement>("[data-del],[data-rep]"); if (!b) return;
  const sb = await cloud();
  if (b.dataset.del) {
    const id = +b.dataset.del, { error } = await sb.from("messages").delete().eq("id", id);
    if (!error) { for (const l of rooms.values()) { const k = l.findIndex((x) => x.id === id); if (k >= 0) l.splice(k, 1); } toast("Message deleted"); }
    else toast("Could not delete the message", "err");
  } else {
    const id = +b.dataset.rep!, { error } = await sb.from("reports").insert({ message: id });
    if (!error || error.code === "23505") { reported.add(id); toast("Reported. Thank you, pilot"); }
  }
  paint();
}

export const openComms = () => { start(); watchOnAir().catch(() => {}); unread = 0; paintUnread(); paint(); };

export function initComms() {
  $("commsForm").onsubmit = (e) => { e.preventDefault(); send(); };
  $("commsForm").onclick = () => { if (!pilot.me) openPilot(); };
  $("commsList").addEventListener("click", act);
  document.querySelectorAll<HTMLElement>(".comms-ch [data-ch]").forEach((b) => { b.onclick = () => { view = b.dataset.ch as typeof view; note = ""; paint(); if (view !== "air") $("commsList").scrollTop = 1e9; }; });
  // joining a fleet opens its room; leaving falls back to ALL
  let was: string | null = null;
  onFleet(() => {
    const r = fleetRoom();
    if (r !== was) { if (was) { rooms.delete(was); loaded.delete(was); } was = r; if (r) { view = "fleet"; start(); load(r); } }
    if (started || !$("comms").hidden) paint();
  });
  onPilot(() => { if (!$("comms").hidden || started) paint(); });
  addEventListener("beforeunload", () => { channel?.unsubscribe(); });
  document.addEventListener("visibilitychange", () => { if (seen()) { unread = 0; paintUnread(); } });
  // tune in to the channel a moment after the map is up, so new messages show on the tab
  setTimeout(() => { start(); watchOnAir().catch(() => {}); }, 4000);
}
