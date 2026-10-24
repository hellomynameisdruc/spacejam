// COMMS on its own page (comms.html): the founder's console — the open channel and who's on air, to
// keep in a tab of its own. Other pilots see only a note pointing back to the observatory.
// Light: no map here. A shared track or a fleet opens in the observatory tab (it's told over a
// BroadcastChannel; if none is open, a new one opens). Signing in happens in the observatory: the
// session is shared, so this page follows along.
import "@fontsource/dotgothic16/latin-400.css";
import "@fontsource/dotgothic16/cyrillic-400.css";
import "@fontsource/martian-mono/latin-400.css";
import "@fontsource/martian-mono/cyrillic-400.css";
import "./style.css";
import { esc, pad } from "./core/util";
import { $ } from "./core/dom";
import { browserKV } from "./store/storage";
import { Prefs } from "./store/prefs";
import { applyCursors } from "./ui/cursors";
import { ALL, goLive, grantRank, loadRoom, messages, onComms, remove, report, transmit, type Msg } from "./cloud/comms";
import { lookup, onPilot, pilot, roster, wake } from "./cloud/pilots";
import { cloud } from "./cloud/client";
import { avatarSvg } from "./ui/avatar";
import { isStaff, rankKey, rankOf, rankTag, RANKS } from "./ui/ranks";
import { initRail, say } from "./ui/rail";
import type { RealtimeChannel } from "@supabase/supabase-js";

// the phosphor the observatory uses
document.documentElement.dataset.phosphor = new Prefs(browserKV).phosphor;
{ const cs = getComputedStyle(document.documentElement); applyCursors(`rgb(${cs.getPropertyValue("--ph").trim().split(/\s+/).join(",")})`, cs.getPropertyValue("--bg").trim()); }

type Host = { id: string; nick: string; avatar: number; rank?: string; title: string; artist: string; style: string; n: number };
let view: "all" | "air" = "all", hosts: Host[] = [], note: { text: string; kind: "err" | "info" } | null = null;
const reported = new Set<number>();

// —— the observatory tab: play there (or open one)
const bus = typeof BroadcastChannel === "function" ? new BroadcastChannel("sound-cosmos") : null;
function openInObservatory(hash: string, what: string) {
  let heard = false;
  const ack = (e: MessageEvent) => { if (e.data?.ack === hash) heard = true; };
  bus?.addEventListener("message", ack);
  bus?.postMessage({ go: hash });
  setTimeout(() => {
    bus?.removeEventListener("message", ack);
    if (heard) say(`${what} in the observatory tab`);
    else window.open(`./${hash}`, "sound-cosmos");
  }, 450);
}

// —— shared tracks: the card needs the map's names, fetched only when a track is shared
type Placed = { title: string; artist: string; label: string; style: string; year: number; color: string; yt: string } | null;
const cards = new Map<string, Placed | "pending">();
function trackCard(text: string) {
  const m = text.match(/#sig-([A-Za-z0-9_-]{11})\.([^\s#?&]+)/); if (!m) return "";
  const key = `${m[1]}.${m[2]}`, hash = `#sig-${key}`, c = cards.get(key);
  if (c === undefined) {
    cards.set(key, "pending");
    import("./app/signal").then(async ({ find, parseSignal }) => {
      const { chunk, galaxy } = await import("./app/state");
      const sig = parseSignal(hash)!, r = await find(sig), ch = r && chunk(r.s);
      cards.set(key, r && ch ? { title: ch.t[r.i], artist: ch.an[ch.a[r.i]], label: ch.p[r.i] >= 0 ? galaxy.planets[ch.p[r.i]].name : "ASTEROID BELT", style: galaxy.stars[r.s].name, year: ch.yr[r.i], color: galaxy.stars[r.s].color, yt: ch.yt[r.i] } : null);
      paint();
    });
  }
  if (c === undefined || c === "pending") return `<div class="sig-card wait">TUNING IN TO A SIGNAL…</div>`;
  if (!c) return `<div class="sig-card wait">THIS SIGNAL IS NOT ON THE MAP ANY MORE</div>`;
  return `<button type="button" class="sig-card" data-go="${esc(hash)}" style="--acc:${c.color}" title="Play it in the observatory">
    <span class="frame thumb sig-th"><img alt="" src="https://i.ytimg.com/vi/${esc(c.yt)}/default.jpg" referrerpolicy="no-referrer"><span class="raster"></span></span>
    <span class="sig-i"><b>${esc(c.title)}</b><span>${esc(c.artist)}</span><i>${esc(c.label.toUpperCase())} · ${esc(c.style.toUpperCase())}${c.year ? ` · ${c.year}` : ""}</i></span>
    <span class="sig-go">▶</span></button>`;
}
function fleetCard(hostId: string) {
  const live = hosts.find((h) => h.id === hostId), p = roster.get(hostId), k = rankOf(p?.rank), name = esc((p?.nick ?? live?.nick ?? "A PILOT").toUpperCase());
  const head = `<span class="fc-h"><span class="fc-lamp${live ? " on" : ""}">${live ? "● LIVE" : "○ OFF AIR"}</span><b${k.color ? ` style="color:${k.color}"` : ""}>${name}</b><span class="fc-k">FLEET</span></span>`;
  if (!live) return `<div class="fleet-card off">${avatarSvg(p?.avatar ?? 0, 40)}<span class="fc-i">${head}<span class="fc-t">This broadcast has ended.</span></span></div>`;
  return `<button type="button" class="fleet-card" data-go="#fleet-${esc(hostId)}" title="Tune in, in the observatory">${avatarSvg(p?.avatar ?? live.avatar, 40)}<span class="fc-i">${head}
    <span class="fc-t">♪ ${esc(live.artist)}${live.artist ? " — " : ""}${esc(live.title)}</span><span class="fc-m">${esc(live.style.toUpperCase())} · ${live.n + 1} ${live.n ? "PILOTS" : "PILOT"} ABOARD</span></span><span class="fc-go">▶ TUNE IN</span></button>`;
}

// —— drawing
const time = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`; };
const nameTag = (p?: { nick?: string; rank?: string }) => { const k = rankOf(p?.rank); return `${rankTag(p?.rank)}<b${k.color ? ` style="color:${k.color}"` : ""}>${esc((p?.nick ?? "PILOT").toUpperCase())}</b>`; };
function body(text: string) {
  const sig = /#sig-[A-Za-z0-9_-]{11}\./.test(text), f = text.match(/#fleet-([\w-]{6,64})/);
  const said = text.replace(/\S*#(sig|fleet)-\S+/, "").replace(/^tune in with me:?$/i, "").trim();
  return `${said ? `<span class="m-t">${esc(said)}</span>` : ""}${sig ? trackCard(text) : f ? fleetCard(f[1]) : ""}`;
}
function line(m: Msg) {
  const p = roster.get(m.pilot), mine = m.pilot === pilot.me?.id;
  const act = !pilot.me ? "" : mine || isStaff(pilot.me) ? `<button class="m-x" data-del="${m.id}" aria-label="Delete the message">×</button>` : `<button class="m-x" data-rep="${m.id}" aria-label="Report this message" ${reported.has(m.id) ? "disabled" : ""}>!</button>`;
  return `<div class="msg${mine ? " mine" : ""}">${avatarSvg(p?.avatar ?? 0, 32)}<div class="m-b"><span class="m-h">${nameTag(p)}<time>${time(m.created_at)}</time>${act}</span>${body(m.body)}</div></div>`;
}
function airList() {
  if (!hosts.length) return `<p class="note">NOBODY IS BROADCASTING RIGHT NOW.</p>`;
  return hosts.map((h) => fleetCard(h.id)).join("");
}
let locked = true, connected = false;
function paint() {
  if (locked) {
    $("commsList").innerHTML = `<p class="note">${!connected ? "CONNECTING…" : "THIS CONSOLE IS FOR THE FOUNDER. CHAT IN COMMS, IN THE OBSERVATORY."}</p>`;
    $("commsForm").hidden = true; $("chatMe").innerHTML = `<a href="./" target="sound-cosmos">THE OBSERVATORY ↗</a>`;
    return;
  }
  const el = $("commsList"), atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 60, msgs = messages(ALL);
  el.innerHTML = view === "air" ? airList() : msgs.length ? msgs.map(line).join("") : `<p class="note">SILENCE ON THE CHANNEL. SAY HELLO.</p>`;
  if (atEnd && view === "all") el.scrollTop = el.scrollHeight;
  document.querySelectorAll<HTMLElement>("[data-ch]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.ch === view)));
  $("airN").textContent = hosts.length ? String(hosts.length) : "";
  const inp = $<HTMLInputElement>("commsIn");
  $("commsForm").hidden = view === "air"; inp.disabled = !pilot.me;
  inp.placeholder = pilot.me ? "transmit to all pilots" : "sign in in the observatory to transmit";
  const n = $("commsNote"); n.hidden = !note; n.textContent = note?.text ?? ""; n.className = `fmsg ${note?.kind === "err" ? "err" : ""}`;
  $("chatMe").innerHTML = pilot.me ? `${avatarSvg(pilot.me.avatar, 16)}<span>${nameTag(pilot.me)}</span>` : `<a href="./" target="sound-cosmos">SIGN IN IN THE OBSERVATORY ↗</a>`;
}
const tell = (text: string, kind: "err" | "info" = "err") => { note = { text: text.toUpperCase(), kind }; paint(); };

// —— doing
async function send() {
  const inp = $<HTMLInputElement>("commsIn"), text = inp.value.trim(); if (!text || !pilot.me) return;
  if (text.startsWith("/")) {
    const [cmd, nick, ...rest] = text.slice(1).split(/\s+/);
    if (cmd === "ranks") { inp.value = ""; tell(`Ranks: ${Object.keys(RANKS).join(" · ")}`, "info"); return; }
    const r = cmd === "rank" && nick ? rankKey(rest.join(" ")) : null; if (!r) { tell("Unknown command. Try /ranks"); return; }
    const res = await grantRank(nick, r);
    if ("error" in res) tell(res.error === "not-authorised" ? "Only the founder gives ranks" : `Failed: ${res.error}`); else { inp.value = ""; note = null; paint(); say(`${res.nick} is now ${RANKS[r].label}`); }
    return;
  }
  inp.disabled = true; const e = await transmit(ALL, text); inp.disabled = false; inp.focus();
  if (e) { tell(e === "too-fast" ? "Too fast. One message every few seconds" : "Transmission failed. Try again"); return; }
  inp.value = ""; note = null; paint(); $("commsList").scrollTop = 1e9;
}
$("commsForm").onsubmit = (e) => { e.preventDefault(); send(); };
$("commsList").addEventListener("click", async (e) => {
  const t = e.target as HTMLElement;
  const go = t.closest<HTMLElement>("[data-go]"); if (go) { openInObservatory(go.dataset.go!, go.dataset.go!.startsWith("#fleet") ? "Tuned in" : "Playing"); return; }
  const d = t.closest<HTMLElement>("[data-del]"); if (d) { if (await remove(+d.dataset.del!)) say("Message deleted"); return; }
  const r = t.closest<HTMLElement>("[data-rep]"); if (r && (await report(+r.dataset.rep!))) { reported.add(+r.dataset.rep!); paint(); say("Reported. Thank you, pilot"); }
});
document.querySelectorAll<HTMLElement>("[data-ch]").forEach((b) => { b.onclick = () => { view = b.dataset.ch as "all" | "air"; note = null; paint(); if (view === "all") $("commsList").scrollTop = 1e9; }; });

// —— start
initRail();
onComms(() => paint());
onPilot(() => { locked = !pilot.me?.admin; paint(); if (!locked) boot(); });
paint();
let booted = false;
/** the founder is here: tune in to the channel and to who's on air (once) */
async function boot() {
  if (booted) return; booted = true;
  if (!(await loadRoom(ALL))) tell("No signal from COMMS. Try again later");
  goLive((r) => r === ALL);
  paint(); $("commsList").scrollTop = 1e9;
  const sb = await cloud(), air: RealtimeChannel = sb.channel("onair", { config: { private: true } });
  air.on("presence", { event: "sync" }, async () => {
    const seen = new Set<string>();
    hosts = Object.values(air.presenceState<Host>()).flat().filter((h) => h.title !== undefined && !seen.has(h.id) && seen.add(h.id));
    await lookup(hosts.map((h) => h.id)).catch(() => {});
    paint();
  }).subscribe();
}
wake().then(() => { connected = true; locked = !pilot.me?.admin; paint(); if (!locked) boot(); });
