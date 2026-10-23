// COMMS: the open channel, a chat for every pilot, in the panel under the dossier. Anyone can listen;
// signed-in pilots transmit. New messages arrive live; three reports take a message off the air.
import type { RealtimeChannel } from "@supabase/supabase-js";
import { esc, pad } from "../core/util";
import { $ } from "../core/dom";
import { cloud } from "../cloud/client";
import { avatarSvg } from "./avatar";
import { onPilot, openPilot, pilot, wake, type Pilot } from "./pilot";

const ROOM = "all", KEEP = 80;
type Msg = { id: number; pilot: string; body: string; created_at: string };
const msgs: Msg[] = [], who = new Map<string, Pilot>(), reported = new Set<number>();
let started = false, channel: RealtimeChannel | null = null, note = "";

const time = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`; };

function line(m: Msg) {
  const p = who.get(m.pilot), mine = m.pilot === pilot.me?.id;
  const act = !pilot.me ? "" : mine
    ? `<button class="m-x" data-del="${m.id}" aria-label="Delete your message" title="Delete">×</button>`
    : `<button class="m-x" data-rep="${m.id}" aria-label="Report this message" title="${reported.has(m.id) ? "Reported" : "Report"}" ${reported.has(m.id) ? "disabled" : ""}>!</button>`;
  return `<div class="msg${mine ? " mine" : ""}">${avatarSvg(p?.avatar ?? 0, 32)}<div class="m-b"><span class="m-h"><b>${esc((p?.nick ?? "PILOT").toUpperCase())}</b><time>${time(m.created_at)}</time>${act}</span><span class="m-t">${esc(m.body)}</span></div></div>`;
}

function paint() {
  const list = $("commsList"), atEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  list.innerHTML = msgs.length ? msgs.map(line).join("") : `<p class="note">${started ? "SILENCE ON THE CHANNEL. SAY HELLO." : "TUNING IN…"}</p>`;
  if (atEnd) list.scrollTop = list.scrollHeight;
  const f = $("commsForm");
  f.classList.toggle("off", !pilot.me);
  ($("commsIn") as HTMLInputElement).disabled = !pilot.me;
  ($("commsIn") as HTMLInputElement).placeholder = pilot.me ? "transmit to all pilots" : "sign in to transmit";
  $("commsNote").textContent = note; $("commsNote").hidden = !note;
}

async function pilotsFor(ids: string[]) {
  const need = [...new Set(ids)].filter((id) => !who.has(id)); if (!need.length) return;
  const { data } = await (await cloud()).from("pilots").select("id,nick,avatar").in("id", need);
  for (const p of (data ?? []) as Pilot[]) who.set(p.id, p);
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
  inp.disabled = true;
  const { data, error } = await (await cloud()).from("messages").insert({ room: ROOM, body: body.slice(0, 400) }).select("id,pilot,body,created_at").single();
  inp.disabled = false; inp.focus();
  if (error) { note = /TOO FAST/.test(error.message) ? "TOO FAST. ONE MESSAGE EVERY FEW SECONDS." : "TRANSMISSION FAILED. TRY AGAIN."; paint(); return; }
  inp.value = ""; note = "";
  const m = data as Msg; who.set(pilot.me.id, pilot.me);
  if (!msgs.some((x) => x.id === m.id)) { msgs.push(m); if (msgs.length > KEEP) msgs.shift(); }
  paint(); $("commsList").scrollTop = $("commsList").scrollHeight;
}

async function act(e: Event) {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-del],[data-rep]"); if (!b) return;
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

export const openComms = () => { start(); paint(); };

export function initComms() {
  $("commsForm").onsubmit = (e) => { e.preventDefault(); send(); };
  $("commsForm").onclick = () => { if (!pilot.me) openPilot(); };
  $("commsList").addEventListener("click", act);
  onPilot(() => { if (pilot.me) who.set(pilot.me.id, pilot.me); if (!$("comms").hidden || started) paint(); });
  addEventListener("beforeunload", () => { channel?.unsubscribe(); });
}
