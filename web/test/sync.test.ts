import { describe, expect, it, vi } from "vitest";
vi.mock("../src/app/state", () => ({ beacons: { all: [], changed: { on() {} } }, flightLog: { all: [], size: 0, changed: { on() {} } } }));
vi.mock("../src/ui/pilot", () => ({ onPilot() {}, pilot: { me: null } }));
vi.mock("../src/cloud/client", () => ({ cloud: async () => ({}) }));
import { mergeLogbook } from "../src/cloud/sync";

const b = (y: string, at: number) => ({ y, s: 0, i: 0, t: y, a: "", at });
describe("logbook merge", () => {
  it("joins both sides' beacons, newest first", () => {
    const m = mergeLogbook([b("aaaaaaaaaaa", 1)], [], {}, { beacons: [b("bbbbbbbbbbb", 2)] });
    expect(m.beacons.map((x) => x.y)).toEqual(["bbbbbbbbbbb", "aaaaaaaaaaa"]);
  });
  it("a beacon removed on another device stays removed", () => {
    const m = mergeLogbook([b("aaaaaaaaaaa", 1)], [], {}, { beacons: [], gone: { aaaaaaaaaaa: 5 } });
    expect(m.beacons).toEqual([]);
  });
  it("but setting it again later brings it back", () => {
    const m = mergeLogbook([b("aaaaaaaaaaa", 9)], [], {}, { gone: { aaaaaaaaaaa: 5 } });
    expect(m.beacons.length).toBe(1);
  });
  it("flights are counted per device, and the counts add up across devices", () => {
    const m = mergeLogbook([], [], {}, { flights: { list: [], count: { phone: 120, laptop: 30 } } }, { laptop: 45 });
    expect(m.count).toEqual({ phone: 120, laptop: 45 });
  });
  it("reads the old logbook too (a plain list of flights)", () => {
    const m = mergeLogbook([], [], {}, { flights: [{ k: "1-2", t: 5, y: "x" }] });
    expect(m.flights.length).toBe(1);
  });
  it("flights: one entry per track, the latest, newest first", () => {
    const m = mergeLogbook([], [{ k: "1-2", t: 10, y: "x" }], {}, { flights: [{ k: "1-2", t: 20, y: "x" }, { k: "3-4", t: 15, y: "z" }] });
    expect(m.flights.map((e) => e.t)).toEqual([20, 15]);
  });
});
