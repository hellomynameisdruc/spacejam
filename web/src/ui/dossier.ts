// The dossier panel on the right: sector overview, star, planet or track, each with its own scope.
import type { PType, Sel } from "../core/types";
import { esc, fmt, hash, pad } from "../core/util";
import { $, reduce } from "../core/dom";
import { beacons, chunk, galaxy, isNowPlaying, state, tracks } from "../app/state";
import { PTYPE_INFO, spanOf } from "../model/galaxy";
import { tempoLabel } from "../model/tempo";
import { flyToNebula, nearestTracks, playLightYears, playOrbit, playSystem, select, startPick, toggleBeacon, trackCode } from "../app/actions";
import { sc } from "../render/palette";
import { onFrame } from "../render/scene";
import { drawPulsarHero, drawRadar, drawSphere, drawWave, fitCanvas, fitted } from "./scopes";
import { ICON, player, scrub } from "./dock";
import { scramble } from "./glitch";

let dosAnim: ((t: number) => void) | null = null;
/** objects behind data-r buttons of the current render */
const refs: Sel[] = [];
const R = (o: Sel) => { refs.push(o); return refs.length - 1; };
const row = (k: string, v: string) => `<div class="row"><span>${k}</span><span>${v}</span></div>`;
const meter = (k: string, frac: number, val: string, ref?: number, color?: string) =>
  `<div class="bar-r${ref !== undefined ? " click" : ""}"${ref !== undefined ? ` data-r="${ref}"` : ""}${color ? ` style="--c:${color}"` : ""}><span>${esc(k)}</span><span class="meter"><i style="width:${Math.max(2, Math.min(100, frac * 100)).toFixed(1)}%"></i></span><span>${val}</span></div>`;
const trackItem = (s: number, i: number, n: number) => {
  const ch = chunk(s)!;
  return `<button data-r="${R({ kind: "track", s, i })}" class="${isNowPlaying(s, i) ? "now" : ""}"><span class="n">${pad(n, 3)}</span><span class="t">${esc(ch.an[ch.a[i]])} — ${esc(ch.t[i])}</span><span class="y">${ch.yr[i] || "----"}</span></button>`;
};
const heroCanvas = () => document.querySelector<HTMLCanvasElement>("#hero canvas");
const hist = (cnt: number[], y0: number, title: string) => {
  const mx = Math.max(1, ...cnt), y1 = y0 + cnt.length - 1;
  return `<div class="hist"><div class="ph-sub">${title}</div><div class="cols">${cnt.map((c, k) => `<i style="height:${(c / mx * 100).toFixed(1)}%" title="${y0 + k}: ${c}"></i>`).join("")}</div><div class="axis"><span>${y0}</span><span>${y0 + Math.round((y1 - y0) / 2)}</span><span>${y1}</span></div></div>`;
};
/** the same beacon mark as on the player's key */
export const beaconLabel = (on: boolean) => (on ? `${ICON.beaconOn}<span>BEACON ON</span>` : `${ICON.beacon}<span>SET BEACON</span>`);

function sector() {
  const { stars, planets, meta, ptype } = galaxy;
  const top = stars.map((s, i) => ({ s, i })).sort((a, b) => b.s.tracks - a.s.tracks);
  const mx = top[0]?.s.tracks || 1;
  dosAnim = (t) => { const c = heroCanvas(); if (c) { const f = fitted(c); drawRadar(f.g, f.w, f.h, t); } };
  const neb = galaxy.nebulae, many = neb.length > 1;
  const gm = Math.max(1, ...neb.map((n) => n.tracks));
  return {
    code: many ? `UNIVERSE // ${meta.sector.toUpperCase()}` : `SECTOR // ${meta.sector.toUpperCase()}`,
    title: many ? `${meta.sector.toUpperCase()} UNIVERSE` : `SECTOR ${meta.sector.toUpperCase()}`,
    html: `<div class="hero"><div class="frame" id="hero"><canvas></canvas></div>
        <div class="ident"><span class="code">OBSERVATORY // DISCOGS ${meta.years ? `${meta.years[0]}–${meta.years[1]}` : ""}</span><h2 id="dosTitle"></h2><span class="stamp">${meta.sample ? "TEST SIGNAL" : "LIVE CATALOGUE"}</span></div></div>
      <div class="rows">${many ? row("GALAXIES / GENRES", fmt(neb.length)) : ""}${row("STARS / STYLES", fmt(stars.length))}${row("PLANETS / LABELS", fmt(planets.length))}${row("SATELLITES / TRACKS", fmt(meta.tracks))}${row("RELEASES", fmt(meta.releases))}${row("SOURCE", "DISCOGS · CC0")}</div>
      <p class="lede">${many ? `A map of electronic music from the Discogs catalogue. <b>Galaxies</b> are ${neb.length} families of genres. ` : ""}Every <b>star</b> is a style, its orbits hold <b>label planets</b>, and the <b>satellites</b> around them are tracks, older ones closer in. ${many ? "Galaxies that share many releases sit side by side, and so do styles that often meet on one release." : "Styles that often meet on one release sit side by side."}</p>
      ${many ? `<div class="bars"><div class="ph-sub">GALAXIES // TRACKS · CLICK TO FLY THERE</div>${neb.map((n, k) => meter(`${n.name.toUpperCase()} ${n.stars}★`, n.tracks / gm, fmt(n.tracks), undefined, n.color).replace('class="bar-r"', `class="bar-r gal click" data-neb="${k}"`)).join("")}</div>` : ""}
      <div><div class="ph-sub">HOW TO EXPLORE</div><ul class="howto">
        <li><b>Zoom</b> in: ${many ? "galaxies → " : ""}styles → labels → tracks → titles.</li>
        <li><b>Click</b> a star, planet or track to open its dossier.</li>
        <li><b>Time warp</b> on a planet: the label's story in order, one track a year from its first release to its last.</li>
        <li><b>Solaris station</b> on a planet: park a radio station in its orbit and listen to that label, track after unheard track.</li>
        <li><b>Start an odyssey</b> from a star: 20+ tracks across five star systems.</li>
        <li><b>Hitchhike the system</b> on a star: thumb a ride round ten of its labels, 42 tracks, a new ride every time.</li>
        <li><b>Wormhole</b> jumps to a random track anywhere on the map.</li>
        <li><b>Beacon</b> is a like: it saves the track to the BEACONS tab, which plays them as a YouTube playlist.</li>
        <li><b>?</b> opens the safety briefing: the whole observatory on one card.</li></ul></div>
      <div class="bars"><div class="ph-sub">PLANET TYPES</div>${(Object.keys(PTYPE_INFO) as PType[]).map((k) => { const c = ptype.filter((x) => x === k).length; return meter(PTYPE_INFO[k][0], c / Math.max(1, planets.length), fmt(c)); }).join("")}<p class="note">Giants are the biggest labels, ringed worlds are long-runners (15+ years), cratered ones went quiet before 2001, ice worlds started after 2010.</p></div>
      <div class="bars"><div class="ph-sub">STAR SYSTEMS // BY TRACK COUNT</div>${top.map(({ s, i }) => meter(s.name.toUpperCase(), s.tracks / mx, fmt(s.tracks), R({ kind: "star", s: i }), s.color)).join("")}</div>`,
  };
}

function star(si: number) {
  const g = galaxy, s = g.stars[si], pl = g.planetsByStar[si], nb = g.neighbours(si), neb = g.nebulaOf(si);
  dosAnim = (t) => { const c = heroCanvas(); if (!c) return; const f = fitted(c); drawPulsarHero(f.g, f.w, f.h, si, t); };
  return {
    code: `STAR // ST-${pad(si, 2)}`, title: s.name.toUpperCase(),
    html: `<div class="hero"><div class="frame" id="hero"><canvas></canvas></div>
        <div class="ident"><span class="code">ST-${pad(si, 2)} // STYLE</span><h2 id="dosTitle"></h2><span class="stamp">${neb ? `${(s.tracks * 100 / Math.max(1, neb.tracks)).toFixed(1)}% OF ${esc(neb.name.toUpperCase())}` : `${(s.tracks * 100 / g.totalTracks).toFixed(1)}% OF SECTOR`}</span></div></div>
      <div class="rows">${neb ? `<div class="row"><span>GALAXY</span><button class="link" data-neb="${g.nebulae.indexOf(neb)}">${esc(neb.name.toUpperCase())}</button></div>` : ""}${row("RELEASES", fmt(s.n))}${row("PLANETS / LABELS", fmt(pl.length))}${row("TRACKS", fmt(s.tracks))}${row("CLASS", `${g.sclass[si]} · ${g.starClassName(si)}`)}${row("LUMINOSITY", `${Math.round(g.recentShare[si] * 100)}% RELEASES IN LAST 10 YRS`)}${row("TYPICAL TEMPO", tempoLabel(g.tempo[si]))}${row("PEAK YEAR", String(g.peakYear[si]))}</div>
      <p class="note">Size shows how many releases the style has; glow shows how alive it is today. The star pulses at the tempo typical for its style (styles without a steady beat just breathe slowly) and sheds a shell once every bar. Tempo is the usual range for the style, not measured from the tracks.</p>
      ${s.yh?.length ? hist(s.yh, g.Y0, "ACTIVITY // RELEASES PER YEAR") : ""}
      ${!g.meta.sample && pl.length ? `<button class="play" data-system="${si}">▶ HITCHHIKE THE SYSTEM</button>` : ""}
      ${pl.length ? `<button class="plot crt" data-route-star="${si}"><span>⟶ START THE ODYSSEY FROM HERE</span></button>` : ""}
      ${nb.length ? `<div class="bars"><div class="ph-sub">GRAVITATIONAL LINKS</div>${nb.map((n) => meter(g.stars[n.s].name.toUpperCase(), Math.min(1, n.w * 3), `${Math.round(n.w * 100)}%`, R({ kind: "star", s: n.s }), g.stars[n.s].color)).join("")}</div>` : ""}
      <div><div class="ph-sub">PLANETS IN ORBIT</div><div class="list">${pl.slice(0, 40).map((p, k) => `<button data-r="${R({ kind: "planet", p })}"><span class="n">${pad(k + 1, 3)}</span><span class="t">${esc(g.planets[p].name)}</span><span class="y">${fmt(g.planets[p].n)} REL</span></button>`).join("")}</div>
      ${pl.length > 40 ? `<div class="more">…and ${fmt(pl.length - 40)} more</div>` : ""}</div>`,
  };
}

const ordinal = (k: number) => { const t = k % 100, e = k % 10; return k + (t >= 11 && t <= 13 ? "th" : e === 1 ? "st" : e === 2 ? "nd" : e === 3 ? "rd" : "th"); };
/** what kind of world it is, shown on hover over the TYPE row */
function planetType(pi: number) {
  const g = galaxy, ty = g.ptype[pi], [tn, td] = PTYPE_INFO[ty];
  return `${tn[0]}${tn.slice(1).toLowerCase()}: ${td}${ty === "giant" && g.ringed[pi] ? `, with rings: ${PTYPE_INFO.ringed[1]}` : ""}.`;
}

function planet(pi: number, o: Sel) {
  const g = galaxy, p = g.planets[pi], s = g.stars[p.s], ch = chunk(p.s), ty = g.ptype[pi];
  if (!ch) tracks.load(p.s).then(() => { if (state.sel === o) renderDossier(); });
  const n = p.t1 - p.t0, shown = Math.min(n, 150), sys = g.planetsByStar[p.s], rank = sys.indexOf(pi) + 1;
  let activity = "", ly: [number, number] | null = null;
  if (ch && n) {
    const ys = ch.yr.slice(p.t0, p.t1).filter(Boolean);
    if (ys.length >= 3 && !g.meta.sample) ly = [Math.min(...ys), Math.max(...ys)];
    if (ys.length) { const y0 = Math.min(...ys), cnt = new Array(Math.max(...ys) - y0 + 1).fill(0); ys.forEach((y) => cnt[y - y0]++); activity = hist(cnt, y0, "ACTIVITY PER YEAR"); }
  }
  const sd = hash(p.name) % 100;
  let drawn = false, last = -1;
  dosAnim = (t) => {
    if (reduce && drawn) return;
    const c = heroCanvas(); if (!c) return; const f = fitted(c);
    if (((t / 66) | 0) === last) return; last = (t / 66) | 0;
    drawSphere(f.g, f.w, f.h, sd, t, (a = 1) => sc(p.s, a), ty, g.ringed[pi]); drawn = true;
  };
  return {
    code: `PLANET // PL-${pad(pi, 4)}`, title: p.name.toUpperCase(),
    html: `<div class="hero"><div class="frame" id="hero"><canvas></canvas></div>
        <div class="ident"><span class="code">PL-${pad(pi, 4)} // LABEL</span><h2 id="dosTitle"></h2><span class="stamp">${p.yr[0] || "????"}–${p.yr[1] || "????"}</span></div></div>
      <div class="rows"><div class="row"><span>ORBIT</span><button class="link" data-r="${R({ kind: "star", s: p.s })}">${esc(s.name.toUpperCase())}</button></div>${row("TYPE", `<span title="${esc(planetType(pi))}">${PTYPE_INFO[ty][0] + (ty === "giant" && g.ringed[pi] ? " · RINGED" : "")}</span>`)}${row("SIZE RANK", `#${rank} OF ${fmt(sys.length)}`)}${row("POSITION", `${ordinal(g.orbitNo[pi]).toUpperCase()} FROM THE STAR`)}${row("RELEASES", fmt(p.n))}${row("TRACKS", fmt(n))}${row("ACTIVE", p.ay ? `${p.ay} OF ${spanOf(p) + 1} YEARS` : `${spanOf(p) + (p.yr[0] ? 1 : 0)} YEARS`)}</div>
      ${activity}
      ${ch && n && !g.meta.sample ? `<button class="play" data-orbit="${pi}">▶ SOLARIS STATION</button>` : ""}
      ${ly ? `<button class="plot crt" data-years="${pi}"><span>⟶ TIME WARP · ${ly[0]}–${ly[1]}</span></button>` : ""}
      <div><div class="ph-sub">SATELLITES</div><div class="list">${ch ? Array.from({ length: shown }, (_, k) => trackItem(p.s, p.t0 + k, k + 1)).join("") : `<p class="note">LOADING…</p>`}</div>
      ${n > shown ? `<div class="more">…and ${fmt(n - shown)} more. Zoom in on the planet to see them all.</div>` : ""}</div>`,
  };
}

function track(o: { kind: "track"; s: number; i: number }) {
  const g = galaxy, ch = chunk(o.s)!, s = g.stars[o.s], pi = ch.p[o.i], p = pi >= 0 ? g.planets[pi] : null, yt = ch.yt[o.i];
  const near = nearestTracks(o, 8), on = beacons.has(o);
  const sd = hash(yt) % 97;
  let done = false;
  dosAnim = (t) => {
    const c = document.getElementById("wave") as HTMLCanvasElement | null; if (!c) return;
    const f = fitted(c);
    const mine = isNowPlaying(o.s, o.i), live = mine && player.playing;
    const scrubbing = mine && performance.now() - scrub.t < 420, sync = mine && !scrubbing && player.buffering;
    if (reduce && done && !scrubbing) return; done = true;
    const tc = $("tCur").textContent;
    const label = scrubbing ? (scrub.dir < 0 ? `◂◂ SEEK ${tc}` : `SEEK ${tc} ▸▸`) : sync ? "SYNC…" : undefined;
    drawWave(f.g, f.w, f.h, t, sd, live, (a = 1) => sc(o.s, a), { scrub: scrubbing ? (scrub.dir || 1) : 0, sync, label });
  };
  return {
    code: `OBJECT // ${trackCode(o.s, o.i)}`, title: ch.t[o.i].toUpperCase(),
    html: `<div class="hero"><div class="frame thumb" id="hero"><img alt="" src="https://i.ytimg.com/vi/${esc(yt)}/default.jpg" referrerpolicy="no-referrer"><span class="raster"></span></div>
        <div class="ident"><span class="code">${trackCode(o.s, o.i)} // TRACK</span><h2 id="dosTitle"></h2><span class="by">${esc(ch.an[ch.a[o.i]])}</span></div></div>
      <div class="rows">${row("ARTIST", esc(ch.an[ch.a[o.i]]))}${row("YEAR", ch.yr[o.i] ? String(ch.yr[o.i]) : "----")}
        <div class="row"><span>LABEL</span>${p ? `<button class="link" data-r="${R({ kind: "planet", p: pi })}">${esc(p.name.toUpperCase())}</button>` : "<span>ASTEROID BELT</span>"}</div>
        <div class="row"><span>STYLE</span><button class="link" data-r="${R({ kind: "star", s: o.s })}">${esc(s.name.toUpperCase())}</button></div>
        ${row("COORDINATES", `${ch.x[o.i].toFixed(0)} / ${ch.y[o.i].toFixed(0)}`)}</div>
      <div class="scope-c"><canvas id="wave"></canvas></div>
      ${g.meta.sample ? `<p class="note">TEST SIGNAL: videos won't play.</p>` : `<button class="play" data-r="${R(o)}" data-play="1">${isNowPlaying(o.s, o.i) ? "◉ ON AIR" : "▶ PLAY"}</button>`}
      <button class="plot like${on ? " on" : ""}" data-like="1">${beaconLabel(on)}</button>
      <a class="out" href="https://www.youtube.com/watch?v=${esc(yt)}" target="_blank" rel="noopener">OPEN ON YOUTUBE ↗</a>
      ${near.length ? `<div><div class="ph-sub">NEAREST SIGNALS</div><div class="list">${near.map((r, k) => trackItem(r.s, r.i, k + 1)).join("")}</div></div>` : ""}`,
  };
}

export function renderDossier() {
  refs.length = 0; dosAnim = null;
  const o = state.sel, d = $("detail");
  const accSi = !o ? -1 : o.kind === "planet" ? galaxy.planets[o.p].s : o.s;
  document.querySelector<HTMLElement>(".dossier")!.style.setProperty("--acc", accSi >= 0 ? galaxy.stars[accSi].color : "");
  const v = !o ? sector() : o.kind === "star" ? star(o.s) : o.kind === "planet" ? planet(o.p, o) : track(o);
  d.innerHTML = v.html; d.scrollTop = 0;
  // all meters of a dossier share one label column, as wide as its longest label
  const labs = d.querySelectorAll<HTMLElement>(".bar-r > span:first-child");
  if (labs.length) { d.style.setProperty("--lbl", "max-content"); const w = Math.max(...[...labs].map((e) => e.scrollWidth)); d.style.setProperty("--lbl", w > 20 ? `${Math.min(w + 2, 170)}px` : ""); }
  scramble($("dosId"), v.code); scramble(document.getElementById("dosTitle"), v.title);
  const img = d.querySelector<HTMLImageElement>(".thumb img");
  if (img) img.onerror = () => {
    img.remove(); const f = $("hero"); f.classList.remove("thumb"); f.insertAdjacentHTML("afterbegin", "<canvas></canvas>"); f.querySelector(".raster")?.remove();
    const ff = fitCanvas(heroCanvas()!), si = state.sel?.kind === "track" ? state.sel.s : 0;
    drawSphere(ff.g, ff.w, ff.h, 7, 0, (a = 1) => sc(si, a), "rocky", false);
  };
}

/** refresh just the beacon button of a track dossier */
export function paintDossierBeacon() {
  const b = document.querySelector<HTMLElement>("#detail [data-like]"), sel = state.sel;
  if (b && sel?.kind === "track") { const on = beacons.has(sel); b.innerHTML = beaconLabel(on); b.classList.toggle("on", on); }
}

export function initDossier() {
  $("detail").addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const ps = t.closest<HTMLElement>("[data-route-star]"); if (ps) { startPick(+ps.dataset.routeStar!, "star"); return; }
    const sy = t.closest<HTMLElement>("[data-system]"); if (sy) { playSystem(+sy.dataset.system!); return; }
    const yr = t.closest<HTMLElement>("[data-years]"); if (yr) { playLightYears(+yr.dataset.years!); return; }
    const nb = t.closest<HTMLElement>("[data-neb]"); if (nb) { flyToNebula(+nb.dataset.neb!); return; }
    const po = t.closest<HTMLElement>("[data-orbit]"); if (po) { playOrbit(+po.dataset.orbit!); return; }
    if (t.closest("[data-like]")) { if (state.sel?.kind === "track") toggleBeacon(state.sel); return; }
    const b = t.closest<HTMLElement>("[data-r]"); if (!b) return;
    const o = refs[+b.dataset.r!];
    if (o?.kind === "track") { select(o, true, !!b.dataset.play); return; }
    select(o);
  });
  onFrame((t) => dosAnim?.(t));
}
