// The COMMS panel: three channels in the panel under the dossier — ALL (the open channel), FLEET (the
// fleet you're in, while you're in one) and ON AIR (broadcasts to tune in to). New messages count up on
// the tab while it's closed. Commands start with "/": /ranks, and the founder's /rank CALLSIGN RANK.
// The messages themselves live in cloud/comms.ts, the fleets in cloud/fleet.ts.
import { esc, pad } from "../core/util";
import { $ } from "../core/dom";
import { ALL, clearInvites, dropRoom, goLive, grantRank, loadRoom, messages, onComms, remove, report, transmit, type Msg } from "../cloud/comms";
import { lookup, onPilot, pilot, roster, wake } from "../cloud/pilots";
import { fleet, fleetRoom, inviteLink, known, leave, onFleet, tuneIn, watchOnAir } from "../cloud/fleet";
import { chunk, galaxy } from "../app/state";
import { select } from "../app/actions";
import { find, parseSignal, placed, withoutSignal } from "../app/signal";
import { avatarSvg } from "./avatar";
import { openPilot } from "./pilot";
import { isStaff, rankKey, rankOf, rankTag, RANKS } from "./ranks";
import { flashKey, say } from "./rail";
import { copyInvite } from "./fleet";
import { ICON } from "./dock";

type View = "all" | "fleet" | "air";
let view: View = "all", started = false, unread = 0;
let note: { text: string; kind: "err" | "info" } | null = null;
const reported = new Set<number>();
const room = () => (view === "fleet" ? fleetRoom() : ALL);
const seen = () => !$("comms").hidden && !document.hidden;

// —— drawing
const time = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`; };
function nameTag(p: { nick?: string; rank?: string } | undefined) {
  const k = rankOf(p?.rank);
  return `${rankTag(p?.rank)}<b${k.color ? ` style="color:${k.color}"` : ""}>${esc((p?.nick ?? "PILOT").toUpperCase())}</b>`;
}
/** a shared track: its cover (in the style's colour), title, artist, label, style and year; a click plays it */
function signalCard(text: string) {
  const sig = parseSignal(text)!, said = withoutSignal(text), r = placed(sig);
  const before = said ? `<span class="m-t">${esc(said)}</span>` : "";
  if (r === undefined) { find(sig).then(() => paint()); return `${before}<div class="sig-card wait">TUNING IN TO A SIGNAL…</div>`; }
  const ch = r && chunk(r.s);
  if (!r || !ch) return `${before}<div class="sig-card wait">THIS SIGNAL IS NOT ON THE MAP ANY MORE</div>`;
  const st = galaxy.stars[r.s], pi = ch.p[r.i], label = pi >= 0 ? galaxy.planets[pi].name : "ASTEROID BELT", yt = ch.yt[r.i];
  return `${before}<button type="button" class="sig-card" data-sig="${r.s}.${r.i}" style="--acc:${st.color}" title="Fly there and play it">
    <span class="frame thumb sig-th"><img alt="" src="https://i.ytimg.com/vi/${esc(yt)}/default.jpg" referrerpolicy="no-referrer"><span class="raster"></span></span>
    <span class="sig-i"><b>${esc(ch.t[r.i])}</b><span>${esc(ch.an[ch.a[r.i]])}</span><i>${esc(label.toUpperCase())} · ${esc(st.name.toUpperCase())}${ch.yr[r.i] ? ` · ${ch.yr[r.i]}` : ""}</i></span>
    <span class="sig-go">▶</span></button>`;
}
/** a message's text; a shared track or an invite to a fleet becomes a card */
function body(text: string, nick?: string) {
  if (parseSignal(text)) return signalCard(text);
  const f = text.match(/#fleet-([\w-]{6,64})/);
  if (!f) return `<span class="m-t">${esc(text)}</span>`;
  const rest = text.replace(/\S*#fleet-[\w-]{6,64}\S*/, "").replace(/^tune in with me:?$/i, "").trim();
  return `${rest ? `<span class="m-t">${esc(rest)}</span>` : ""}${fleetCard(f[1], nick)}`;
}
/** an invite to a fleet: the host, and — while they're on air — what's playing and who's aboard */
function fleetCard(hostId: string, nick?: string) {
  const live = fleet.hosts.find((h) => h.id === hostId), p = roster.get(hostId) ?? (live && known(live));
  if (!p && !looked.has(hostId)) { looked.add(hostId); lookup([hostId]).then(() => paint()).catch(() => {}); }
  const name = esc((p?.nick ?? nick ?? "A PILOT").toUpperCase()), k = rankOf(p?.rank), aboard = fleet.role === "crew" && fleet.hostId === hostId, self = hostId === pilot.me?.id;
  const head = `<span class="fc-h"><span class="fc-lamp${live ? " on" : ""}">${live ? "● LIVE" : "○ OFF AIR"}</span><b${k.color ? ` style="color:${k.color}"` : ""}>${name}</b><span class="fc-k">FLEET</span></span>`;
  if (!live) return `<div class="fleet-card off">${avatarSvg(p?.avatar ?? 0, 40)}<span class="fc-i">${head}<span class="fc-t">This broadcast has ended. Look for it in ON AIR next time.</span></span></div>`;
  const n = live.n, key = self ? `<span class="fc-go you">YOU</span>` : aboard ? `<span class="fc-go you">ABOARD</span>` : `<span class="fc-go">▶ TUNE IN</span>`;
  return `<button type="button" class="fleet-card" ${self || aboard ? "disabled" : `data-join="${esc(hostId)}"`} title="Listen along with ${name}">${avatarSvg(p?.avatar ?? 0, 40)}<span class="fc-i">${head}
    <span class="fc-t">♪ ${esc(live.artist)}${live.artist ? " — " : ""}${esc(live.title)}</span>
    <span class="fc-m">${esc(live.style.toUpperCase())} · ${n + 1} ${n === 0 ? "PILOT" : "PILOTS"} ABOARD</span></span>${key}</button>`;
}
const looked = new Set<string>();
function line(m: Msg) {
  const p = roster.get(m.pilot), mine = m.pilot === pilot.me?.id;
  const act = !pilot.me ? "" : mine || isStaff(pilot.me)
    ? `<button class="m-x" data-del="${m.id}" aria-label="Delete the message" title="Delete">×</button>`
    : `<button class="m-x" data-rep="${m.id}" aria-label="Report this message" title="${reported.has(m.id) ? "Reported" : "Report"}" ${reported.has(m.id) ? "disabled" : ""}>!</button>`;
  return `<div class="msg${mine ? " mine" : ""}">${avatarSvg(p?.avatar ?? 0, 32)}<div class="m-b"><span class="m-h">${nameTag(p)}<time>${time(m.created_at)}</time>${act}</span>${body(m.body, p?.nick)}</div></div>`;
}
function airList() {
  if (!fleet.hosts.length) return `<p class="note">NOBODY IS BROADCASTING RIGHT NOW. START ONE WITH <span class="ico-in">${ICON.cast}</span> IN THE PLAYER.</p>`;
  return fleet.hosts.map((raw) => {
    const h = known(raw), self = h.id === pilot.me?.id, on = fleet.role === "crew" && fleet.hostId === h.id;
    const key = self ? `<span class="air-tag">YOU</span>` : on ? `<button type="button" class="key sm" data-leave>LEAVE</button>` : `<button type="button" class="key sm hot" data-join="${esc(h.id)}">TUNE IN</button>`;
    return `<div class="msg air">${avatarSvg(h.avatar, 32)}<div class="m-b"><span class="m-h">${nameTag(h)}<time>${h.n} ${h.n === 1 ? "PILOT" : "PILOTS"}</time></span><span class="m-t">♪ ${esc(h.artist)}${h.artist ? " — " : ""}${esc(h.title)}</span><span class="m-s">${esc(h.style.toUpperCase())}</span></div>${key}</div>`;
  }).join("");
}

function paint() {
  if (view === "fleet" && !fleet.role) view = "all";
  const el = $("commsList"), atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 40, msgs = messages(room());
  const invite = fleet.role ? `<div class="fl-inv"><span>INVITE PILOTS</span><button type="button" class="key sm" data-fl-copy>COPY LINK</button><button type="button" class="key sm" data-fl-post>POST TO ALL</button></div>` : "";
  el.innerHTML = view === "air" ? airList()
    : view === "fleet" ? invite + (msgs.length ? msgs.map(line).join("") : `<p class="note">THE FLEET'S OWN CHANNEL. ITS MESSAGES FADE A FEW HOURS ON.</p>`)
    : msgs.length ? msgs.map(line).join("") : `<p class="note">${started ? "SILENCE ON THE CHANNEL. SAY HELLO." : "TUNING IN…"}</p>`;
  if (atEnd && view !== "air") el.scrollTop = el.scrollHeight;
  for (const b of document.querySelectorAll<HTMLElement>("#comms .tabs [data-ch]")) b.setAttribute("aria-selected", String(b.dataset.ch === view));
  $("chFleet").hidden = !fleet.role;
  $("fleetN").textContent = fleet.role ? String(fleet.crew.length + 1) : "";
  $("airN").textContent = fleet.hosts.length ? String(fleet.hosts.length) : "";
  const f = $("commsForm"), inp = $<HTMLInputElement>("commsIn");
  f.hidden = view === "air"; f.classList.toggle("off", !pilot.me);
  inp.disabled = !pilot.me;
  inp.placeholder = !pilot.me ? "sign in to transmit" : view === "fleet" ? "talk to your fleet" : "transmit to all pilots";
  const n = $("commsNote"); n.hidden = !note; n.textContent = note?.text ?? ""; n.className = `fmsg ${note?.kind === "err" ? "err" : ""}`;
}
function paintUnread() {
  const b = $("commsUnread"); b.hidden = !unread; b.textContent = unread > 99 ? "99+" : String(unread);
  $("tabComms").classList.toggle("news", unread > 0);
}
const tell = (text: string, kind: "err" | "info" = "err") => { note = { text: text.toUpperCase(), kind }; paint(); };

// —— doing
async function start() {
  if (started) return; started = true;
  wake();
  if (!(await loadRoom(ALL))) tell("No signal from COMMS. Try again later");
  goLive((r) => r === ALL || r === fleetRoom());
}

async function send() {
  const inp = $<HTMLInputElement>("commsIn"), text = inp.value.trim(), r = room();
  if (!pilot.me) { openPilot(); return; }
  if (!text || !r) return;
  if (text.startsWith("/")) { await command(text); return; }
  inp.disabled = true;
  const e = await transmit(r, text);
  inp.disabled = false; inp.focus();
  if (e) { tell(e === "too-fast" ? "Too fast. One message every few seconds" : "Transmission failed. Try again"); return; }
  inp.value = ""; note = null; paint(); $("commsList").scrollTop = $("commsList").scrollHeight;
}

/** the console: /ranks lists them; /rank CALLSIGN RANK (the founder) gives one */
async function command(text: string) {
  const inp = $<HTMLInputElement>("commsIn"), [cmd, nick, ...rest] = text.slice(1).trim().split(/\s+/);
  if (cmd === "ranks" || cmd === "help") { inp.value = ""; tell(`Ranks: ${Object.keys(RANKS).join(" · ")}. Give one: /rank CALLSIGN RANK`, "info"); return; }
  if (cmd !== "rank" || !nick || !rest.length) { tell("Unknown command. Try /ranks"); return; }
  const r = rankKey(rest.join(" ")); if (!r) { tell(`No such rank. ${Object.keys(RANKS).join(" · ")}`); return; }
  const res = await grantRank(nick, r);
  if ("error" in res) { tell(res.error === "not-authorised" ? "Only the founder gives ranks" : res.error === "no-such-pilot" ? `No pilot called ${nick}` : `Failed: ${res.error}`); return; }
  inp.value = ""; note = null; paint(); say(`${res.nick} is now ${RANKS[r].label}`);
}

async function act(e: Event) {
  const t = e.target as HTMLElement;
  const sg = t.closest<HTMLElement>("[data-sig]");
  if (sg) { const [s, i] = sg.dataset.sig!.split(".").map(Number); select({ kind: "track", s, i }, true, true); return; }
  const j = t.closest<HTMLElement>("[data-join]"); if (j) { await tuneIn(j.dataset.join!); return; }
  if (t.closest("[data-leave]")) { await leave(); return; }
  const cp = t.closest<HTMLElement>("[data-fl-copy]"); if (cp) { if (await copyInvite()) flashKey(cp, "COPIED ✓"); return; }
  if (t.closest("[data-fl-post]")) {
    if (!pilot.me) { openPilot(); return; }
    view = "all"; paint();
    await clearInvites(pilot.me.id); // one invite at a time: the new one replaces the old
    const err = await transmit(ALL, inviteLink());
    if (err) tell(err === "too-fast" ? "Too fast. One message every few seconds" : "Transmission failed. Try again"); else say("Invite posted to ALL");
    return;
  }
  const del = t.closest<HTMLElement>("[data-del]");
  if (del) { if (await remove(+del.dataset.del!)) say("Message deleted"); else say("Could not delete the message", "err"); return; }
  const rep = t.closest<HTMLElement>("[data-rep]");
  if (rep && (await report(+rep.dataset.rep!))) { reported.add(+rep.dataset.rep!); paint(); say("Reported. Thank you, pilot"); }
}

export const openComms = () => { start(); watchOnAir().catch(() => {}); unread = 0; paintUnread(); paint(); };

export function initComms() {
  $("commsForm").onsubmit = (e) => { e.preventDefault(); send(); };
  $("commsForm").onclick = () => { if (!pilot.me) openPilot(); };
  $("commsList").addEventListener("click", act);
  document.querySelectorAll<HTMLElement>("#comms .tabs [data-ch]").forEach((b) => {
    b.onclick = () => { view = b.dataset.ch as View; note = null; paint(); if (view !== "air") $("commsList").scrollTop = 1e9; };
  });
  onComms((c) => {
    if (c.kind === "new" && c.msg.pilot !== pilot.me?.id && !seen()) { unread++; paintUnread(); }
    if (started || !$("comms").hidden) paint();
  });
  // joining a fleet opens its room; leaving falls back to ALL
  let was: string | null = null;
  onFleet(() => {
    const r = fleetRoom();
    if (r !== was) { if (was) dropRoom(was); was = r; if (r) { view = "fleet"; start(); loadRoom(r); } }
    if (started || !$("comms").hidden) paint();
  });
  onPilot(() => { if (started || !$("comms").hidden) paint(); });
  document.addEventListener("visibilitychange", () => { if (seen()) { unread = 0; paintUnread(); } });
  // tune in a moment after the map is up, so new messages count on the tab
  setTimeout(() => { start(); watchOnAir().catch(() => {}); }, 4000);
}
