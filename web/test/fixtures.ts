// A small synthetic galaxy for tests: stars on a ring, each linked to its neighbours (and a few
// chords), every star with a handful of planets on orbits, planets with secondary styles.
import type { Chunk, MapData, Planet, Star } from "../src/core/types";
import { Galaxy } from "../src/model/galaxy";

export function makeMap(nStars = 10, planetsPerStar = 8, tracksPerPlanet = 6, dense = true): MapData {
  const stars: Star[] = [], planets: Planet[] = [], links: [number, number, number][] = [];
  for (let s = 0; s < nStars; s++) {
    const a = (s / nStars) * Math.PI * 2;
    stars.push({ name: `Style ${s}`, x: Math.cos(a) * 3000, y: Math.sin(a) * 3000, core: 20, R: 600, n: 1000 - s * 50, tracks: planetsPerStar * tracksPerPlanet, color: "#88aaff", yh: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], orb: [150] });
  }
  for (let s = 0; s < nStars; s++) {
    links.push([s, (s + 1) % nStars, 0.2 + (s % 3) * 0.05]);
    if (s % 3 === 0) links.push([s, (s + 3) % nStars, 0.05]);
    // real styles have many neighbours; the sparse variant tests the fallbacks
    if (dense) links.push([s, (s + 2) % nStars, 0.08]);
  }
  let t = 0;
  for (let s = 0; s < nStars; s++) {
    for (let k = 0; k < planetsPerStar; k++) {
      const o = 150 + k * 50, a = k * 1.3, st = stars[s];
      planets.push({
        name: `Label ${s}.${k}`, s, x: st.x + Math.cos(a) * o, y: st.y + Math.sin(a) * o, r: 6 + k, n: 100 - k * 10,
        yr: [1990 + k * 3, 2000 + k * 3], ay: 8, o, a, b: o, xs: [[(s + 1) % nStars, 0.3], [(s + nStars - 1) % nStars, 0.2]],
        t0: t, t1: t + tracksPerPlanet,
      });
      t += tracksPerPlanet;
    }
  }
  return { meta: { sector: "Test", sample: true, releases: 5000, tracks: t, years: [1980, 1991] }, stars, links, planets };
}

export const makeGalaxy = (...a: Parameters<typeof makeMap>) => new Galaxy(makeMap(...a));

/** a track chunk for star s: tracks spread around their planets */
export function makeChunk(g: Galaxy, s: number): Chunk {
  const ch: Chunk = { yt: [], t: [], a: [], yr: [], p: [], x: [], y: [], an: ["Artist"] };
  // chunks are indexed per star; this fixture uses global planet track ranges, so fill up to the last one
  const last = Math.max(...g.planetsByStar[s].map((i) => g.planets[i].t1));
  for (let i = 0; i < last; i++) { ch.yt.push(`yt${s}_${i}`); ch.t.push(`Track ${i}`); ch.a.push(0); ch.yr.push(2000); ch.p.push(-1); ch.x.push(0); ch.y.push(0); }
  for (const pi of g.planetsByStar[s]) {
    const p = g.planets[pi];
    for (let i = p.t0; i < p.t1; i++) { const d = p.r + 4 + 1.5 * Math.sqrt(i - p.t0 + 0.5), a = i * 2.39996; ch.p[i] = pi; ch.x[i] = p.x + d * Math.cos(a); ch.y[i] = p.y + d * Math.sin(a); }
  }
  return ch;
}
