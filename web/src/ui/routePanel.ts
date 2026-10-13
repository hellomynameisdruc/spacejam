// The route panel (stops and their tracks) and the "pick a destination" hint.
import { esc, pad } from "../core/util";
import { $ } from "../core/dom";
import { chunk, galaxy, state } from "../app/state";
import { stopKind } from "../model/routes";
import { clearRoute, endPick, fitRoute, playRouteAt, select, toggleRoutePlayback } from "../app/actions";
import { cam } from "../render/camera";

export function showPickHint(planetName: string) {
  $("routeHintText").innerHTML = `ROUTE FROM <b>${esc(planetName.toUpperCase())}</b> · CLICK A DESTINATION PLANET`;
  $("routeHint").hidden = false;
}
export function hidePickHint() { $("routeHint").hidden = true; }

/** width the panel takes on wide screens, so the camera can keep the route clear of it */
export function routePanelWidth() { const box = $("routeBox"); return cam.W > 700 && !box.hidden ? box.offsetWidth + 20 : 0; }

export function renderRoutePanel() {
  const box = $("routeBox"), r = state.route; if (!r) { box.hidden = true; return; }
  const { planets, stars } = galaxy, A = planets[r.a], B = planets[r.b];
  box.hidden = false; box.style.setProperty("--acc", stars[A.s].color);
  $("routeTitle").innerHTML = `${esc(A.name.toUpperCase())} <i>→</i> ${esc(B.name.toUpperCase())}`;
  $("routeMeta").textContent = `${r.stops.length} STOPS · ${r.flat.length} TRACKS · ${r.hops.length > 1 ? r.hops.map((s) => stars[s].name.toUpperCase()).join(" › ") : stars[A.s].name.toUpperCase() + " SYSTEM"}`;
  let k = 0;
  $("routeList").innerHTML = r.stops.map((pi, si) => {
    const p = planets[pi];
    const tr = r.tracks[si].map((t) => {
      const ch = chunk(t.s)!, idx = k++, on = idx === state.routeIdx;
      return `<button class="rt${on ? " on" : ""}" data-k="${idx}"><span>${on ? "◉" : "▸"}</span><span class="t">${esc(ch.an[ch.a[t.i]])} — ${esc(ch.t[t.i])}</span></button>`;
    }).join("");
    return `<li style="--c:${stars[p.s].color}"><div class="rs"><b>${pad(si + 1, 2)}</b><button class="rp" data-p="${pi}">${esc(p.name.toUpperCase())}</button><span>${stopKind(galaxy, r, si)} · ${esc(stars[p.s].name.toUpperCase())}</span></div>${tr}</li>`;
  }).join("");
  $("routePlay").textContent = state.routeIdx >= 0 ? "■ STOP ROUTE" : "▶ PLAY ROUTE";
  $("routePlay").hidden = !!galaxy.meta.sample;
}

export function initRoutePanel() {
  $("routeList").addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-k],[data-p]"); if (!t) return;
    if (t.dataset.k) playRouteAt(+t.dataset.k); else select({ kind: "planet", p: +t.dataset.p! });
  });
  $("routePlay").onclick = toggleRoutePlayback;
  $("routeClose").onclick = clearRoute;
  $("routeFit").onclick = fitRoute;
  $("routeCancel").onclick = endPick;
}
