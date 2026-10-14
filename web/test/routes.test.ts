import { describe, expect, it } from "vitest";
import { makeChunk, makeGalaxy } from "./fixtures";
import { lcg } from "../src/core/util";
import { HITCHHIKE_TRACKS, MIN_ROUTE_TRACKS, pathOfLen, pickStopTracks, planRoute, planSystemTour, ROUTE_SYSTEMS, starEnd, starPath, stopKind } from "../src/model/routes";

const g = makeGalaxy(10, 8, 6);
const chunks = g.stars.map((_, s) => makeChunk(g, s));
const first = (s: number) => g.planetsByStar[s][0];
const last = (s: number) => g.planetsByStar[s][g.planetsByStar[s].length - 1];

describe("star paths", () => {
  it("strongest-link path ends at both styles", () => {
    const p = starPath(g, 0, 5);
    expect(p[0]).toBe(0); expect(p[p.length - 1]).toBe(5);
    for (let k = 1; k < p.length; k++) expect(g.link(p[k - 1], p[k])).toBeDefined();
  });
  it("path of exact length is simple and connected", () => {
    const p = pathOfLen(g, 0, 1, 5)!;
    expect(p).toHaveLength(5); expect(new Set(p).size).toBe(5);
    for (let k = 1; k < p.length; k++) expect(g.link(p[k - 1], p[k])).toBeDefined();
  });
  it("a loop returns to its star through distinct systems", () => {
    const p = pathOfLen(g, 2, 2, 5)!;
    expect(p[0]).toBe(2); expect(p[4]).toBe(2); expect(new Set(p.slice(0, 4)).size).toBe(4);
  });
});

describe("planRoute", () => {
  const check = (a: number, b: number) => {
    const r = planRoute(g, a, b);
    expect(r.stops[0]).toBe(a);
    expect(r.stops[r.stops.length - 1]).toBe(b);
    expect(new Set(r.stops).size).toBe(r.stops.length); // never the same planet twice
    // two planets per system, in the order of the hops
    expect(r.stops.map((i) => g.planets[i].s)).toEqual(r.hops.flatMap((s) => [s, s]));
    return r;
  };
  it("neighbouring systems: detours to 10 planets in 5 systems", () => {
    const r = check(first(0), first(1));
    expect(r.hops).toHaveLength(ROUTE_SYSTEMS); expect(r.stops).toHaveLength(10);
  });
  it("same system: a round trip through 3 neighbours", () => {
    const r = check(first(3), last(3));
    expect(r.hops[0]).toBe(3); expect(r.hops[4]).toBe(3); expect(r.stops).toHaveLength(10);
  });
  it("far systems keep two planets per system", () => {
    const r = check(first(0), first(5));
    expect(r.hops.length).toBeGreaterThanOrEqual(ROUTE_SYSTEMS);
  });
  it("is deterministic", () => {
    expect(planRoute(g, first(0), first(6))).toEqual(planRoute(g, first(0), first(6)));
  });
  it("labels stops", () => {
    const r = planRoute(g, first(0), first(1));
    expect(stopKind(g, r, 0)).toBe("ORIGIN");
    expect(stopKind(g, r, 1)).toBe("EXIT");
    expect(stopKind(g, r, 2)).toBe("ENTRY");
    expect(stopKind(g, r, r.stops.length - 1)).toBe("DESTINATION");
  });
});

describe("sparse galaxy fallback", () => {
  const sg = makeGalaxy(10, 8, 6, false);
  it("without a 5-system detour, keeps the shorter path with two planets per system", () => {
    const a = sg.planetsByStar[0][0], b = sg.planetsByStar[1][0];
    expect(pathOfLen(sg, 0, 1, ROUTE_SYSTEMS)).toBeNull();
    const r = planRoute(sg, a, b);
    expect(r.stops[0]).toBe(a); expect(r.stops[r.stops.length - 1]).toBe(b);
    expect(r.stops.map((i) => sg.planets[i].s)).toEqual(r.hops.flatMap((s) => [s, s]));
  });
});

describe("pickStopTracks", () => {
  it("at least MIN_ROUTE_TRACKS distinct tracks from the stops' own planets", () => {
    const plan = planRoute(g, first(0), first(4));
    const t = pickStopTracks(g, plan, (s) => chunks[s], new Set(), lcg(3));
    const flat = t.flat();
    expect(flat.length).toBeGreaterThanOrEqual(MIN_ROUTE_TRACKS);
    expect(new Set(flat.map((r) => chunks[r.s].yt[r.i])).size).toBe(flat.length);
    t.forEach((list, k) => { const p = g.planets[plan.stops[k]]; for (const r of list) { expect(r.s).toBe(p.s); expect(r.i).toBeGreaterThanOrEqual(p.t0); expect(r.i).toBeLessThan(p.t1); } });
  });
});

describe("whole stars", () => {
  it("a system tour: distinct planets of one star from every ring, different each time", () => {
    const r = planSystemTour(g, 3, lcg(1));
    expect(r.star).toBe(3); expect(r.hops).toEqual([3]);
    expect(r.stops.every((i) => g.planets[i].s === 3)).toBe(true);
    expect(new Set(r.stops).size).toBe(r.stops.length);
    expect(r.stops.length).toBe(Math.min(10, g.planetsByStar[3].filter((i) => g.planets[i].t1 > g.planets[i].t0).length));
    expect(planSystemTour(g, 3, lcg(1))).toEqual(r); // same seed, same tour
    const others = [2, 3, 4, 5].map((k) => planSystemTour(g, 3, lcg(k)).stops.join());
    expect(new Set(others).size).toBeGreaterThan(1); // otherwise it changes
    expect(r.stops.map((_, k) => stopKind(g, r, k)).every((k) => k === "ORBIT")).toBe(true);
  });
  it("a hitchhike is 42 tracks when the labels have them", () => {
    const r = planSystemTour(g, 3, lcg(5)), avail = r.stops.reduce((n, i) => n + g.planets[i].t1 - g.planets[i].t0, 0);
    const t = pickStopTracks(g, r, (s) => chunks[s], new Set(), lcg(5), HITCHHIKE_TRACKS).flat();
    expect(t.length).toBe(Math.min(HITCHHIKE_TRACKS, avail));
  });
  it("tour tracks are random, distinct and prefer unheard ones", () => {
    const r = planSystemTour(g, 3, lcg(7)), heard = new Set<string>();
    const t1 = pickStopTracks(g, r, (s) => chunks[s], heard, lcg(1)).flat();
    const ids = t1.map((t) => chunks[t.s].yt[t.i]);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((y) => heard.add(y));
    const t2 = pickStopTracks(g, r, (s) => chunks[s], heard, lcg(2)).flat().map((t) => chunks[t.s].yt[t.i]);
    const avail = r.stops.reduce((n, i) => n + g.planets[i].t1 - g.planets[i].t0, 0);
    if (avail >= ids.length * 2) expect(t2.some((y) => heard.has(y))).toBe(false);
  });
  it("a star at the end of an odyssey stands in with one of its own planets", () => {
    const pa = starEnd(g, 0, 5, new Set()), pb = starEnd(g, 5, 0, new Set([pa]));
    expect(g.planets[pa].s).toBe(0); expect(g.planets[pb].s).toBe(5);
    const r = planRoute(g, pa, pb);
    expect(r.stops[0]).toBe(pa); expect(r.stops[r.stops.length - 1]).toBe(pb);
  });
});
