import { describe, expect, it } from "vitest";
import { makeGalaxy, makeMap } from "./fixtures";
import { Galaxy, longRun, midYear, shareOf } from "../src/model/galaxy";

describe("Galaxy", () => {
  const g = makeGalaxy();
  it("groups planets by star, biggest label first", () => {
    for (const list of g.planetsByStar) for (let k = 1; k < list.length; k++) expect(g.planets[list[k - 1]].n).toBeGreaterThanOrEqual(g.planets[list[k]].n);
    expect(g.planetsByStar.flat().length).toBe(g.planets.length);
  });
  it("builds a symmetric style graph", () => {
    for (const [a, b, w] of g.links) { expect(g.link(a, b)).toBe(w); expect(g.link(b, a)).toBe(w); }
    expect(g.link(0, 5)).toBeUndefined();
  });
  it("classifies planets", () => {
    const map = makeMap(2, 3, 2);
    map.planets[0].yr = [1985, 1999]; map.planets[0].n = 1; // retired before 2001 → cratered
    map.planets[1].yr = [2012, 2020]; map.planets[1].n = 1; // started after 2010 → ice world
    map.planets[2].yr = [1990, 2010]; map.planets[2].ay = 12; map.planets[2].n = 1; // 20 years, 12 active → ringed
    const gg = new Galaxy(map);
    expect(gg.ptype[0]).toBe("ancient");
    expect(gg.ptype[1]).toBe("young");
    expect(gg.ptype[2]).toBe("ringed");
    expect(gg.ringed[2]).toBe(true);
  });
  it("derives star tempo, class and peak year", () => {
    const map = makeMap(3, 1, 1);
    map.stars[0].name = "Deep House"; map.stars[1].name = "Techno"; map.stars[2].name = "Drum n Bass";
    const gg = new Galaxy(map);
    expect(gg.bpm).toEqual([121, 132, 170]);
    expect(gg.sclass[0]).toBe("O");
    expect(gg.peakYear[0]).toBe(1980 + 11);
  });
  it("helpers", () => {
    const p = g.planets[0];
    expect(midYear(p)).toBe(1995);
    expect(shareOf(p, 1)).toBe(0.3);
    expect(shareOf(p, 5)).toBe(0);
    expect(longRun({ ...p, yr: [1990, 2010], ay: 10 })).toBe(true);
    expect(longRun({ ...p, yr: [1990, 2010], ay: 3 })).toBe(false);
  });
});
