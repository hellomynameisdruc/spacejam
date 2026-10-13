import { describe, expect, it } from "vitest";
import { makeChunk, makeGalaxy } from "./fixtures";
import { Motion } from "../src/model/orbits";

const g = makeGalaxy(4, 4, 6);
const chunks = g.stars.map((_, s) => makeChunk(g, s));
const m = new Motion(g, (s) => chunks[s]);

describe("Motion", () => {
  it("planets start at their catalogue position and stay on their orbit", () => {
    const p = g.planets[5], st = g.stars[p.s];
    const q0 = { ...m.planetPos(5, 0) };
    expect(q0.x).toBeCloseTo(p.x, 6); expect(q0.y).toBeCloseTo(p.y, 6);
    const q1 = { ...m.planetPos(5, 60_000) };
    expect(Math.hypot(q1.x - st.x, q1.y - st.y)).toBeCloseTo(p.o!, 6);
    expect(Math.hypot(q1.x - q0.x, q1.y - q0.y)).toBeGreaterThan(1);
  });
  it("a band turns as one: planets of one band keep their distance", () => {
    const sameBand = g.planetsByStar[0].slice(0, 2), [a, b] = sameBand;
    g.planets[a].b = g.planets[b].b = 300;
    const mm = new Motion(g, (s) => chunks[s]);
    const d = (t: number) => { const A = { ...mm.planetPos(a, t) }, B = mm.planetPos(b, t); return Math.hypot(A.x - B.x, A.y - B.y); };
    expect(d(100_000)).toBeCloseTo(d(0), 4);
  });
  it("frozen motion (reduced motion) never moves", () => {
    const f = new Motion(g, (s) => chunks[s], true);
    expect({ ...f.planetPos(3, 0) }).toEqual({ ...f.planetPos(3, 99_999) });
  });
  it("satellites stay within their orbit radius of the planet", () => {
    const pi = g.planetsByStar[1][2], p = g.planets[pi];
    for (const t of [0, 5000, 77_000]) for (let i = p.t0; i < p.t1; i++) {
      const q = { ...m.trackPos(1, i, t) }, c = m.planetPos(pi, t);
      expect(Math.hypot(q.x - c.x, q.y - c.y)).toBeLessThanOrEqual(p.r + 4 + 1.5 * Math.sqrt(p.t1 - p.t0) + 1e-6);
    }
  });
  it("a satellite behind the planet's disc is hidden, in front is not", () => {
    expect(m.hiddenBehind(1, g.planets[g.planetsByStar[1][0]].t0, { ...m.planetPos(g.planetsByStar[1][0]), z: -1 })).toBe(true);
    expect(m.hiddenBehind(1, g.planets[g.planetsByStar[1][0]].t0, { ...m.planetPos(g.planetsByStar[1][0]), z: 1 })).toBe(false);
  });
});
