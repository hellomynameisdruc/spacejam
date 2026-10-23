// The pilot: signing in by a link sent to the email (no passwords), the call sign and portrait, signing
// out and deleting the account. The header shows SIGN IN, or the pilot's portrait and call sign.
import type { Session } from "@supabase/supabase-js";
import { esc } from "../core/util";
import { $ } from "../core/dom";
import { beacons, flightLog } from "../app/state";
import { cloud, cloudWanted } from "../cloud/client";
import { avatarSvg, avatarTraits } from "./avatar";
import { rankTag } from "./ranks";
import { toast } from "./toast";

export type Pilot = { id: string; nick: string; avatar: number; rank?: string; admin?: boolean };
/** the pilot columns to read; without ranks if the database hasn't got them yet */
let COLS = "id,nick,avatar,rank,admin";
export async function readPilots<T>(q: (cols: string) => PromiseLike<{ data: T; error: { message: string } | null }>) {
  let r = await q(COLS);
  if (r.error && /rank|admin/.test(r.error.message) && COLS !== "id,nick,avatar") { COLS = "id,nick,avatar"; r = await q(COLS); }
  return r;
}
export const pilot = { session: null as Session | null, me: null as Pilot | null };
/** pilots seen so far, by id: names, portraits and ranks as the registry has them (never as a client claims) */
export const roster = new Map<string, Pilot>();
export async function lookup(ids: string[]) {
  const need = [...new Set(ids)].filter((id) => id && !roster.has(id) && /^[0-9a-f-]{36}$/.test(id)); if (!need.length) return;
  const sb = await cloud(), { data } = await readPilots((c) => sb.from("pilots").select(c).in("id", need));
  for (const p of (data ?? []) as unknown as Pilot[]) roster.set(p.id, p);
}
const listeners: (() => void)[] = [];
export const onPilot = (fn: () => void) => { listeners.push(fn); };
const changed = () => { paintButton(); if (!$("pilotBox").hidden) render(); listeners.forEach((f) => f()); };

const NICK = /^[A-Za-z0-9_.-]{3,20}$/;
let note = "", sentTo = "", confirmDelete = false, busy = false;

async function loadMe() {
  const s = pilot.session; if (!s) { pilot.me = null; return; }
  const sb = await cloud();
  // the pilot row is made by the database on sign-up; give it a moment on the very first sign-in
  for (let k = 0; k < 4; k++) {
    const { data } = await readPilots((c) => sb.from("pilots").select(c).eq("id", s.user.id).maybeSingle());
    if (data) { pilot.me = data as unknown as Pilot; roster.set(pilot.me.id, pilot.me); return; }
    await new Promise((r) => setTimeout(r, 600));
  }
}

let woke: Promise<void> | null = null;
/** connect once: restore the session, follow sign-ins and sign-outs */
export const wake = () => (woke ??= connect());
async function connect() {
  const sb = await cloud();
  const { data } = await sb.auth.getSession();
  pilot.session = data.session; await loadMe(); changed();
  sb.auth.onAuthStateChange((_e, s) => {
    if ((s?.user.id ?? null) === (pilot.session?.user.id ?? null)) { pilot.session = s; return; }
    pilot.session = s; loadMe().then(changed);
  });
  // a sign-in link brought us here: tidy the address, and say how it went
  const q = new URLSearchParams(location.search);
  if (q.has("code") || q.has("error_description")) {
    const err = q.get("error_description");
    history.replaceState(null, "", location.pathname + location.hash);
    if (err || !pilot.session) { note = err ? `SIGN-IN FAILED: ${err}` : "SIGN-IN FAILED. OPEN THE LINK IN THE SAME BROWSER YOU ASKED FOR IT IN, OR ASK FOR A NEW ONE."; openPilot(); }
    else toast(`Signed in. Welcome aboard, ${pilot.me?.nick ?? "pilot"}`);
  }
}

function paintButton() {
  const b = $("pilotBtn"), me = pilot.me;
  b.innerHTML = me ? `${avatarSvg(me.avatar, 16)}<span>${esc(me.nick.toUpperCase())}</span>` : `<span>SIGN IN</span>`;
  b.title = me ? "Your pilot profile" : "Sign in to chat in COMMS";
}

function render() {
  const el = $("pilotBox"), me = pilot.me;
  const body = me
    ? `<div class="pl-id">${avatarSvg(me.avatar, 96, "ava big")}
        <div class="pl-f">
          <label for="plNick">CALL SIGN ${rankTag(me.rank)}</label>
          <div class="pl-row"><input id="plNick" value="${esc(me.nick)}" maxlength="20" autocomplete="off" spellcheck="false"><button type="button" class="key" id="plSave">SAVE</button></div>
          <button type="button" class="key" id="plFace">↻ NEW PORTRAIT</button>
          <p class="pl-traits">${avatarTraits(me.avatar).map((t) => esc(t.toUpperCase())).join(" · ")}</p>
        </div></div>
      <dl class="pl-stats"><dt>BEACONS</dt><dd>${beacons.size}</dd><dt>FLIGHTS LOGGED</dt><dd>${flightLog.size}</dd><dt>EMAIL</dt><dd>${esc(pilot.session?.user.email ?? "")}</dd></dl>
      <p class="pl-small">Beacons and the flight log are kept with your account, on every device you sign in on.</p>
      <div class="pl-foot"><button type="button" class="key" id="plOut">SIGN OUT</button>
        <button type="button" class="key danger" id="plDel">${confirmDelete ? "CONFIRM: DELETE FOREVER" : "DELETE ACCOUNT"}</button></div>`
    : pilot.session
      ? `<p class="pl-text">CONNECTING TO THE PILOT REGISTRY…</p>`
      : sentTo
        ? `<p class="pl-text">A SIGN-IN LINK IS ON ITS WAY TO <b>${esc(sentTo)}</b>.</p><p class="pl-small">Open it in this browser. No mail? Check spam, or wait a minute and try again.</p>
           <div class="pl-foot"><button type="button" class="key" id="plAgain">USE ANOTHER EMAIL</button></div>`
        : `<button type="button" class="key hot pl-google" id="plGoogle"><svg viewBox="0 0 14 14" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="M5 1h5v1h2v1h-2v1H9V3H5v1H4v1H3v4h1v1h1v1h4v-1h1V9H7V7h5v4h-1v1h-1v1H5v-1H3v-1H2v-1H1V4h1V3h1V2h2z"/></svg>SIGN IN WITH GOOGLE</button>
           <p class="pl-or">OR A LINK SENT TO YOUR EMAIL, NO PASSWORD</p>
           <form class="pl-row" id="plForm"><input id="plMail" type="email" required placeholder="you@example.com" autocomplete="email" spellcheck="false"><button class="key hot" ${busy ? "disabled" : ""}>SEND LINK ▸</button></form>`;
  el.innerHTML = `<div class="pl-card" role="document">
    <div class="brief-head"><span class="inv">PILOT</span><span>${me ? "REGISTRY // PROFILE" : "REGISTRY // SIGN IN"}</span><button type="button" class="dock-btn" id="plClose" aria-label="Close">×</button></div>
    ${body}
    ${note ? `<p class="pl-note" role="status">${esc(note)}</p>` : ""}
    <p class="pl-small pl-priv">We keep your email (to sign you in), your call sign, portrait number and the messages you send. Deleting the account removes all of it. <a href="./privacy.html" target="_blank" rel="noopener">Privacy</a></p>
  </div>`;
  const on = (id: string, f: () => void) => { const b = document.getElementById(id); if (b) b.onclick = f; };
  on("plClose", closePilot);
  on("plAgain", () => { sentTo = ""; note = ""; render(); });
  on("plSave", saveNick);
  on("plFace", newFace);
  on("plOut", signOut);
  on("plDel", deleteMe);
  on("plGoogle", google);
  const f = document.getElementById("plForm") as HTMLFormElement | null;
  if (f) { f.onsubmit = (e) => { e.preventDefault(); sendLink(); }; ($("plMail") as HTMLInputElement).focus(); }
  const n = document.getElementById("plNick") as HTMLInputElement | null;
  if (n) n.onkeydown = (e) => { if (e.key === "Enter") saveNick(); };
}

async function google() {
  busy = true; note = ""; render();
  const { error } = await (await cloud()).auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
  busy = false;
  if (error) { note = /not enabled|provider/i.test(error.message) ? "GOOGLE SIGN-IN IS NOT SWITCHED ON YET." : `COULD NOT SIGN IN: ${error.message}`; render(); }
}

async function sendLink() {
  const mail = ($("plMail") as HTMLInputElement).value.trim(); if (!mail || busy) return;
  busy = true; note = ""; render();
  const sb = await cloud();
  const { error } = await sb.auth.signInWithOtp({ email: mail, options: { emailRedirectTo: location.origin + location.pathname } });
  busy = false;
  if (error) note = /rate|seconds/i.test(error.message) ? `THE MAIL SERVICE IS BUSY: ${error.message.toUpperCase()}` : `COULD NOT SEND: ${error.message}`;
  else sentTo = mail;
  render();
}

async function saveNick() {
  const me = pilot.me; if (!me) return;
  const v = ($("plNick") as HTMLInputElement).value.trim();
  if (!NICK.test(v)) { note = "CALL SIGN: 3–20 LETTERS, DIGITS, . _ OR -"; render(); return; }
  if (v === me.nick) return;
  const { error } = await (await cloud()).from("pilots").update({ nick: v }).eq("id", me.id);
  note = error ? (error.code === "23505" ? "THAT CALL SIGN IS TAKEN." : `COULD NOT SAVE: ${error.message}`) : "";
  if (!error) toast(`Call sign saved: ${v}`);
  if (!error) me.nick = v;
  changed();
}

async function newFace() {
  const me = pilot.me; if (!me) return;
  const avatar = Math.floor(Math.random() * 2147483647);
  const { error } = await (await cloud()).from("pilots").update({ avatar }).eq("id", me.id);
  if (error) note = `COULD NOT SAVE: ${error.message}`; else { me.avatar = avatar; note = ""; toast("New portrait saved"); }
  changed();
}

async function signOut() {
  await (await cloud()).auth.signOut();
  pilot.session = null; pilot.me = null; note = ""; sentTo = ""; changed(); toast("Signed out");
}

async function deleteMe() {
  if (!confirmDelete) { confirmDelete = true; render(); return; }
  const sb = await cloud(), { error } = await sb.rpc("delete_me");
  confirmDelete = false;
  if (error) { note = `COULD NOT DELETE: ${error.message}`; render(); return; }
  await sb.auth.signOut().catch(() => {});
  pilot.session = null; pilot.me = null; note = "ACCOUNT DELETED."; changed(); toast("Account deleted");
}

export function openPilot() {
  const el = $("pilotBox"); el.hidden = false; confirmDelete = false; render();
  wake(); // connect while the email is typed
}
export function closePilot() { $("pilotBox").hidden = true; note = ""; confirmDelete = false; }
export const pilotOpen = () => !$("pilotBox").hidden;

export function initPilot() {
  paintButton();
  $("pilotBtn").onclick = () => (pilotOpen() ? closePilot() : openPilot());
  $("pilotBox").onclick = (e) => { if (e.target === $("pilotBox")) closePilot(); };
  addEventListener("keydown", (e) => {
    if (!pilotOpen()) return;
    if (e.key === "Escape") { e.preventDefault(); closePilot(); }
    e.stopImmediatePropagation(); // the card has the keyboard while it is open
  }, true);
  if (cloudWanted()) wake();
}
