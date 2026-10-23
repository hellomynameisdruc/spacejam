// COMMS: the open channel, a chat for every pilot, in the panel under the dossier. Anyone can listen;
// signed-in pilots transmit. New messages arrive live; three reports take a message off the air.
import type { RealtimeChannel } from "@supabase/supabase-js";
import { esc, pad } from "../core/util";
import { $ } from "../core/dom";
import { cloud } from "../cloud/client";
import { avatarSvg } from "./avatar";
import { onPilot, openPilot, pilot, readPilots, wake, type Pilot } from "./pilot";
import { isStaff, rankKey, rankOf, rankTag, RANKS } from "./ranks";
import { copyInvite, fleet, inviteLink, leave, onFleet, say, tuneIn, watchOnAir, type FMsg } from "./fleet";

const ROOM = "all", KEEP = 80;
type Msg = { id: number; pilot: string; body: string; created_at: string };
const msgs: Msg[] = [], who = new Map<string, Pilot>(), reported = new Set<number>();
let started = false, channel: RealtimeChannel | null = null, note = "", view: "all" | "fleet" | "air" = "all";

const time = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`; };

function line(m: Msg) {
  const p = who.get(m.pilot), mine = m.pilot === pilot.me?.id;
  const act = !pilot.me ? "" : mine || isStaff(pilot.me)
    ? `<button class="m-x" data-del="${m.id}" aria-label="Delete your message" title="Delete">×</button>`
    : `<button class="m-x" data-rep="${m.id}" aria-label="Report this message" title="${reported.has(m.id) ? "Reported" : "Report"}" ${reported.has(m.id) ? "disabled" : ""}>!</button>`;
  return `<div class="msg${mine ? " mine" : ""}">${avatarSvg(p?.avatar ?? 0, 32)}<div class="m-b"><span class="m-h">${rankTag(p?.rank)}<b${rankOf(p?.rank).color ? ` style="color:${rankOf(p?.rank).color}"` : ""}>${esc((p?.nick ?? "PILOT").toUpperCase())}</b><time>${time(m.created_at)}</time>${act}</span>${body(m.body, p?.nick)}</div></div>`;
}
/** a message's text; an invite to a fleet becomes a card to board it */
function body(text: string, nick?: string) {
  const f = text.match(/#fleet-([\w-]{6,64})/);
  if (!f) return `<span class="m-t">${esc(text)}</span>`;
  const rest = text.replace(/\S*#fleet-[\w-]{6,64}\S*/, "").trim();
  return `${rest ? `<span class="m-t">${esc(rest)}</span>` : ""}<button type="button" class="m-card" data-join="${esc(f[1])}">▶ JOIN ${esc((nick ?? "THE").toUpperCase())}${nick ? "’S" : ""} FLEET <i>TUNE IN</i></button>`;
}
function fleetLine(m: FMsg) {
  const k = rankOf(m.who.rank), mine = m.who.id === pilot.me?.id, d = new Date(m.at);
  return `<div class="msg${mine ? " mine" : ""}">${avatarSvg(m.who.avatar, 32)}<div class="m-b"><span class="m-h">${rankTag(m.who.rank)}<b${k.color ? ` style="color:${k.color}"` : ""}>${esc(m.who.nick.toUpperCase())}</b><time>${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}</time></span>${body(m.body, m.who.nick)}</div></div>`;
}
function airList() {
  if (!fleet.hosts.length) return `<p class="note">NOBODY IS BROADCASTING RIGHT NOW. START ONE WITH ((•)) IN THE PLAYER.</p>`;
  return fleet.hosts.map((h) => {
    const self = h.id === pilot.me?.id, on = fleet.role === "crew" && fleet.hostId === h.id, k = rankOf(h.rank);
    return `<div class="msg air">${avatarSvg(h.avatar, 32)}<div class="m-b"><span class="m-h">${rankTag(h.rank)}<b${k.color ? ` style="color:${k.color}"` : ""}>${esc(h.nick.toUpperCase())}</b><time>${h.n} ${h.n === 1 ? "PILOT" : "PILOTS"}</time></span><span class="m-t">♪ ${esc(h.artist)}${h.artist ? " — " : ""}${esc(h.title)}</span><span class="m-s">${esc(h.style.toUpperCase())}</span></div>${self ? `<span class="air-tag">YOU</span>` : on ? `<button type="button" class="key" data-leave>LEAVE</button>` : `<button type="button" class="key hot" data-join="${esc(h.id)}">TUNE IN</button>`}</div>`;
  }).join("");
}

function paint() {
  if (view === "fleet" && !fleet.role) view = "all";
  const list = $("commsList"), atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  const invite = fleet.role ? `<div class="fl-inv"><span>INVITE PILOTS</span><button type="button" class="key" data-fl-copy>COPY LINK</button><button type="button" class="key" data-fl-post>POST TO ALL</button></div>` : "";
  list.innerHTML = view === "air" ? airList()
    : view === "fleet" ? invite + (fleet.chat.length ? fleet.chat.map(fleetLine).join("") : `<p class="note">THE FLEET CHANNEL. ONLY THOSE ABOARD HEAR IT, AND IT IS GONE WHEN THE FLEET BREAKS UP.</p>`)
    : msgs.length ? msgs.map(line).join("") : `<p class="note">${started ? "SILENCE ON THE CHANNEL. SAY HELLO." : "TUNING IN…"}</p>`;
  if (atEnd && view !== "air") list.scrollTop = list.scrollHeight;
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

async function pilotsFor(ids: string[]) {
  const need = [...new Set(ids)].filter((id) => !who.has(id)); if (!need.length) return;
  const sb = await cloud(), { data } = await readPilots((c) => sb.from("pilots").select(c).in("id", need));
  for (const p of (data ?? []) as unknown as Pilot[]) who.set(p.id, p);
}

async function start() {
  if (started) return; started = true;
  wake();
  const sb = await cloud();
  const { data, error } = await sb.from("messages").select("id,pilot,body,created_at").eq("room", ROOM).order("created_at", { ascending: false }).limit(KEEP);
  if (error) { note = "NO SIGNAL FROM COMMS. TRY AGAIN LATER."; started = false; paint(); return; }
  msgs.splice(0, msgs.length, ...((data ?? []) as Msg[]).reverse());
  await pilotsFor(msgs.map((m) => m.pilot));
  paint(); $("commsList").scrollTop = $("commsList").scrollHeight;
  channel = sb.channel("comms-all")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `room=eq.${ROOM}` }, async (e) => {
      const m = e.new as Msg & { room: string }; if (msgs.some((x) => x.id === m.id)) return;
      await pilotsFor([m.pilot]);
      msgs.push(m); if (msgs.length > KEEP) msgs.shift(); paint();
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (e) => {
      const id = (e.old as { id?: number }).id, k = msgs.findIndex((x) => x.id === id);
      if (k >= 0) { msgs.splice(k, 1); paint(); }
    })
    .subscribe();
}

async function send() {
  const inp = $("commsIn") as HTMLInputElement, body = inp.value.trim();
  if (!pilot.me) { openPilot(); return; }
  if (!body) return;
  if (body.startsWith("/")) { await command(body); return; }
  if (view === "fleet") { note = say(body); if (!note) inp.value = ""; paint(); return; }
  inp.disabled = true;
  const { data, error } = await (await cloud()).from("messages").insert({ room: ROOM, body: body.slice(0, 400) }).select("id,pilot,body,created_at").single();
  inp.disabled = false; inp.focus();
  if (error) { note = /TOO FAST/.test(error.message) ? "TOO FAST. ONE MESSAGE EVERY FEW SECONDS." : "TRANSMISSION FAILED. TRY AGAIN."; paint(); return; }
  inp.value = ""; note = "";
  const m = data as Msg; who.set(pilot.me.id, pilot.me);
  if (!msgs.some((x) => x.id === m.id)) { msgs.push(m); if (msgs.length > KEEP) msgs.shift(); }
  paint(); $("commsList").scrollTop = $("commsList").scrollHeight;
}

/** the console: /rank CALLSIGN RANK (the founder), /ranks lists them */
async function command(line: string) {
  const inp = $("commsIn") as HTMLInputElement, [cmd, nick, ...rest] = line.slice(1).trim().split(/\s+/);
  if (cmd === "ranks" || cmd === "help") { note = `RANKS: ${Object.keys(RANKS).join(" · ")}. GIVE ONE: /rank CALLSIGN RANK`; inp.value = ""; paint(); return; }
  if (cmd !== "rank" || !nick || !rest.length) { note = "UNKNOWN COMMAND. TRY /ranks"; paint(); return; }
  const r = rankKey(rest.join(" ")); if (!r) { note = `NO SUCH RANK. ${Object.keys(RANKS).join(" · ")}`; paint(); return; }
  const { data, error } = await (await cloud()).rpc("grant_rank", { target: nick, new_rank: r });
  if (error) note = /NOT AUTHORISED/.test(error.message) ? "ONLY THE FOUNDER GIVES RANKS." : /NO SUCH PILOT/.test(error.message) ? `NO PILOT CALLED ${nick.toUpperCase()}.` : `FAILED: ${error.message}`;
  else {
    note = `${String(data).toUpperCase()} IS NOW ${RANKS[r].label}.`; inp.value = "";
    for (const p of who.values()) if (p.nick.toLowerCase() === nick.toLowerCase()) p.rank = r;
    if (pilot.me && pilot.me.nick.toLowerCase() === nick.toLowerCase()) pilot.me.rank = r;
  }
  paint();
}

async function act(e: Event) {
  const t = e.target as HTMLElement;
  const j = t.closest<HTMLElement>("[data-join]"); if (j) { await tuneIn(j.dataset.join!); view = "fleet"; paint(); return; }
  if (t.closest("[data-leave]")) { await leave(); return; }
  if (t.closest("[data-fl-copy]")) { copyInvite(); return; }
  if (t.closest("[data-fl-post]")) { if (!pilot.me) { openPilot(); return; } const inp = $("commsIn") as HTMLInputElement; inp.value = `Tune in with me: ${inviteLink()}`; view = "all"; paint(); await send(); return; }
  const b = t.closest<HTMLElement>("[data-del],[data-rep]"); if (!b) return;
  const sb = await cloud();
  if (b.dataset.del) {
    const id = +b.dataset.del, { error } = await sb.from("messages").delete().eq("id", id);
    if (!error) { const k = msgs.findIndex((x) => x.id === id); if (k >= 0) msgs.splice(k, 1); }
  } else {
    const id = +b.dataset.rep!, { error } = await sb.from("reports").insert({ message: id });
    if (!error || error.code === "23505") { reported.add(id); note = "REPORTED. THANK YOU, PILOT."; }
  }
  paint();
}

export const openComms = () => { start(); watchOnAir().catch(() => {}); paint(); };

export function initComms() {
  $("commsForm").onsubmit = (e) => { e.preventDefault(); send(); };
  $("commsForm").onclick = () => { if (!pilot.me) openPilot(); };
  $("commsList").addEventListener("click", act);
  document.querySelectorAll<HTMLElement>(".comms-ch [data-ch]").forEach((b) => { b.onclick = () => { view = b.dataset.ch as typeof view; note = ""; paint(); if (view !== "air") $("commsList").scrollTop = 1e9; }; });
  // joining a fleet opens its channel; leaving falls back to ALL
  let was: string | null = null;
  onFleet(() => { if (fleet.role !== was) { if (fleet.role) view = "fleet"; was = fleet.role; } if (started || !$("comms").hidden) paint(); });
  onPilot(() => { if (pilot.me) who.set(pilot.me.id, pilot.me); if (!$("comms").hidden || started) paint(); });
  addEventListener("beforeunload", () => { channel?.unsubscribe(); });
}
