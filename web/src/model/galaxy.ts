// The catalogue as a galaxy: stars (styles), planets (labels), links between styles, and everything
// derived from them — planet types, star classes, tempo, glow. Pure: no DOM, no rendering.
import type { MapData, MapMeta, Planet, PType, Star } from "../core/types";
import { hash } from "../core/util";

export const PTYPE_INFO: Record<PType, [string, string]> = {
  giant: ["GAS GIANT", "one of the largest labels in the sector"],
  ringed: ["RINGED WORLD", "a long-runner: 15+ years of releases, in at least 10 different years"],
  ancient: ["CRATERED", "went quiet before 2001"],
  young: ["ICE WORLD", "first release in 2010 or later"],
  rocky: ["TERRESTRIAL", "a regular label"],
};
const CLASSES = ["O", "B", "A", "F", "G", "K", "M"];
// Reference tempo of a style (BPM) — typical for the genre, not measured from the tracks
const TEMPO: [RegExp, number][] = [[/jungle|drum ?n ?bass|d&b/i, 170], [/juke|footwork/i, 160], [/hard house/i, 145], [/ghettotech/i, 145],
  [/eurodance/i, 140], [/trance/i, 138], [/speed garage/i, 135], [/uk garage|2-step|bassline/i, 132], [/techno/i, 132], [/breakbeat|breaks/i, 130],
  [/ghetto house/i, 130], [/progressive|electro house/i, 128], [/euro house|italo house|jackin|funky/i, 126], [/tech house|acid/i, 125],
  [/minimal/i, 124], [/disco/i, 118], [/hip-house/i, 120], [/deep|soulful|afro|latin|garage house/i, 121], [/house/i, 124]];

export const spanOf = (p: Planet) => (p.yr[0] && p.yr[1] ? p.yr[1] - p.yr[0] : 0);
/** long-runner: 15+ years between first and last release AND releases in at least 10 different years */
export const longRun = (p: Planet) => spanOf(p) >= 15 && (p.ay ?? 99) >= 10;
export const midYear = (p: Planet) => (p.yr[0] && p.yr[1] ? (p.yr[0] + p.yr[1]) / 2 : p.yr[1] || 2000);
/** share of the label's releases that also carry style `s` */
export const shareOf = (p: Planet, s: number) => p.xs?.find((e) => e[0] === s)?.[1] ?? 0;
/** outer radius of a planet's satellite swarm */
export const orbitR = (pl: Planet) => pl.r + 6 + 1.5 * Math.sqrt(pl.t1 - pl.t0);

export class Galaxy {
  readonly meta: MapMeta;
  readonly stars: Star[];
  readonly planets: Planet[];
  readonly links: [number, number, number][];
  /** planet indices of each star, biggest label first */
  readonly planetsByStar: number[][];
  readonly totalTracks: number;
  /** style graph: neighbours with link weight */
  readonly adj: { s: number; w: number }[][];
  private readonly linkW = new Map<number, number>();
  readonly ptype: PType[];
  readonly ringed: boolean[];
  /** star size 0…1 (√ of releases relative to the biggest style) */
  readonly starRel: number[];
  /** share of releases in the last 10 years, and the same normalised to the liveliest style */
  readonly recentShare: number[];
  readonly lum: number[];
  readonly starRank: number[];
  readonly sclass: string[];
  readonly Y0: number;
  readonly peakYear: number[];
  readonly bpm: number[];
  /** per-star phase offset 0…1, so pulsars don't beat in unison */
  readonly phase0: number[];
  readonly bounds: { x: number; y: number; w: number; h: number };
  readonly meanLink: number;

  constructor(map: MapData) {
    const { stars, planets, links } = map;
    this.meta = map.meta; this.stars = stars; this.planets = planets; this.links = links;
    this.planetsByStar = stars.map(() => []);
    planets.forEach((p, i) => this.planetsByStar[p.s].push(i));
    this.planetsByStar.forEach((l) => l.sort((a, b) => planets[b].n - planets[a].n));
    this.totalTracks = stars.reduce((a, s) => a + s.tracks, 0);

    this.adj = stars.map(() => []);
    for (const [a, b, w] of links) {
      this.adj[a].push({ s: b, w }); this.adj[b].push({ s: a, w });
      this.linkW.set(a * 1000 + b, w); this.linkW.set(b * 1000 + a, w);
    }
    this.meanLink = links.reduce((acc, [a, b]) => acc + Math.hypot(stars[a].x - stars[b].x, stars[a].y - stars[b].y), 0) / Math.max(1, links.length);

    // planet types from the label's history
    const nSorted = planets.map((p) => p.n).sort((a, b) => a - b);
    const giantMin = Math.max(8, nSorted[Math.floor(nSorted.length * 0.85)] ?? Infinity);
    this.ptype = planets.map((p) => {
      if (p.n >= giantMin) return "giant";
      if (longRun(p)) return "ringed";
      if (p.yr[1] && p.yr[1] <= 2000) return "ancient";
      if (p.yr[0] >= 2010) return "young";
      return "rocky";
    });
    this.ringed = planets.map((p, i) => this.ptype[i] === "ringed" || (this.ptype[i] === "giant" && longRun(p)));

    // star size from popularity, glow from how alive the style is now
    const nMax = Math.max(1, ...stars.map((s) => s.n));
    this.starRel = stars.map((s) => Math.sqrt(s.n / nMax));
    this.recentShare = stars.map((s) => { const yh = s.yh || []; const tot = yh.reduce((a, b) => a + b, 0) || 1; return yh.slice(-10).reduce((a, b) => a + b, 0) / tot; });
    const mx = Math.max(0.0001, ...this.recentShare);
    this.lum = this.recentShare.map((r) => r / mx);
    const byN = stars.map((_, i) => i).sort((a, b) => stars[b].n - stars[a].n);
    this.starRank = []; this.sclass = [];
    byN.forEach((si, k) => { this.starRank[si] = k; this.sclass[si] = CLASSES[Math.min(6, Math.floor(k / stars.length * 7))]; });
    this.Y0 = map.meta.years?.[0] ?? 1980;
    this.peakYear = stars.map((s) => { const yh = s.yh || []; let b = 0; yh.forEach((v, i) => { if (v > yh[b]) b = i; }); return this.Y0 + b; });
    this.bpm = stars.map((s) => TEMPO.find(([re]) => re.test(s.name))?.[1] ?? 124);
    this.phase0 = stars.map((s) => (hash(s.name) % 1000) / 1000);

    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of stars) { x0 = Math.min(x0, s.x - s.R); y0 = Math.min(y0, s.y - s.R); x1 = Math.max(x1, s.x + s.R); y1 = Math.max(y1, s.y + s.R); }
    this.bounds = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
  }

  /** link weight between two styles, or undefined when they never share a release */
  link(a: number, b: number) { return this.linkW.get(a * 1000 + b); }
  /** the six strongest neighbours of a style */
  neighbours(s: number) {
    return this.links.filter((l) => l[0] === s || l[1] === s).map((l) => ({ s: l[0] === s ? l[1] : l[0], w: l[2] })).sort((a, b) => b.w - a.w).slice(0, 6);
  }
  starClassName(s: number) {
    const r = this.starRel[s];
    return r > 0.75 ? "SUPERGIANT" : r > 0.5 ? "GIANT" : r > 0.3 ? "MAIN SEQUENCE" : "DWARF";
  }
}
