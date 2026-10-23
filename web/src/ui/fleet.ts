// Fleets on screen: the broadcast key in the player, and the fleet as a mode on the rail — ON AIR with
// INVITE and END for the host, TUNED IN with LEAVE for the crew. The engine is cloud/fleet.ts.
import { esc } from "../core/util";
import { $ } from "../core/dom";
import { endBroadcast, fleet, inviteLink, known, leave, onFleet, onFleetNote, startBroadcast, startFleets } from "../cloud/fleet";
import { ICON } from "./dock";
import { openPilot } from "./pilot";
import { clearMode, say, setMode } from "./rail";

export async function copyInvite() {
  try { await navigator.clipboard.writeText(inviteLink()); say("Invite link copied. Paste it to a friend"); return true; }
  catch { say(`Copy this link: ${inviteLink()}`, "err"); return false; }
}

function paint() {
  const cast = $("dockCast");
  cast.classList.toggle("on", fleet.role === "host"); cast.hidden = fleet.role === "crew";
  cast.title = fleet.role === "host" ? "Broadcasting: other pilots can tune in. Click to stop" : "Broadcast: let other pilots tune in and listen with you";
  const n = fleet.crew.length - (fleet.role === "crew" ? 1 : 0), pilots = `${n} ${n === 1 ? "PILOT" : "PILOTS"}`;
  if (fleet.role === "host") setMode("fleet", `<b>ON AIR</b> · ${pilots} TUNED IN`, [{ label: "INVITE", run: copyInvite }, { label: "END", run: endBroadcast }], "live", ICON.cast);
  else if (fleet.role === "crew") setMode("fleet", `TUNED IN TO <b>${esc((fleet.host ? known(fleet.host).nick : "…").toUpperCase())}</b>${n > 0 ? ` · +${pilots}` : ""}`, [{ label: "LEAVE", run: () => leave() }], "live", ICON.cast);
  else clearMode("fleet");
}

export function initFleet() {
  $("dockCast").onclick = async () => { if (fleet.role === "host") endBroadcast(); else if (!(await startBroadcast())) openPilot(); };
  onFleet(paint);
  onFleetNote(say);
  startFleets();
  paint();
}
