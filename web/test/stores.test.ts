import { describe, expect, it } from "vitest";
import type { Chunk } from "../src/core/types";
import { memoryKV } from "../src/store/storage";
import { Beacons, YT_BATCH } from "../src/store/beacons";
import { FlightLog } from "../src/store/flightLog";
import { Prefs } from "../src/store/prefs";

const chunk: Chunk = { yt: ["aaa", "bbb", "ccc"], t: ["A", "B", "C"], a: [0, 0, 0], yr: [2000, 2001, 2002], p: [-1, -1, -1], x: [0, 0, 0], y: [0, 0, 0], an: ["DJ"] };

describe("Beacons", () => {
  it("toggles, persists and notifies", () => {
    const kv = memoryKV(); const b = new Beacons(kv, () => chunk);
    let n = 0; b.changed.on(() => n++);
    b.toggle({ s: 0, i: 1 });
    expect(b.has({ s: 0, i: 1 })).toBe(true); expect(n).toBe(1);
    expect(new Beacons(kv, () => chunk).has({ s: 0, i: 1 })).toBe(true); // survives reload
    b.toggle({ s: 0, i: 1 });
    expect(b.size).toBe(0); expect(n).toBe(2);
  });
  it("finds a beacon's track after the map moved it", () => {
    const b = new Beacons(memoryKV(), () => chunk);
    b.toggle({ s: 0, i: 2 });
    const moved: Chunk = { ...chunk, yt: ["ccc", "aaa", "bbb"] };
    const b2 = new Beacons(memoryKV({ "kosmos-likes": JSON.stringify(b.all) }), () => moved);
    expect(b2.ref(b2.all[0])).toEqual({ s: 0, i: 0 });
  });
  it("splits the YouTube playlist into batches", () => {
    const list = Array.from({ length: YT_BATCH + 3 }, (_, k) => ({ y: `v${k}`, s: 0, i: 0, t: "", a: "", at: 0 }));
    const b = new Beacons(memoryKV({ "kosmos-likes": JSON.stringify(list) }), () => chunk);
    const links = b.playlistLinks();
    expect(links).toHaveLength(2);
    expect(links[0].split("=")[1].split(",")).toHaveLength(YT_BATCH);
  });
  it("tolerates broken storage", () => {
    expect(new Beacons(memoryKV({ "kosmos-likes": "{oops" }), () => chunk).size).toBe(0);
  });
});

describe("FlightLog", () => {
  it("keeps the newest first without duplicates", () => {
    const l = new FlightLog(memoryKV());
    l.add({ s: 1, i: 2 }, 1); l.add({ s: 3, i: 4 }, 2); l.add({ s: 1, i: 2 }, 3);
    expect(l.refs().map((r) => [r.s, r.i])).toEqual([[1, 2], [3, 4]]);
  });
});

describe("Prefs", () => {
  it("falls back to violet and remembers the choice", () => {
    const kv = memoryKV({ "kosmos-ph": "pink" }); const p = new Prefs(kv);
    expect(p.phosphor).toBe("violet");
    p.phosphor = "amber"; expect(new Prefs(kv).phosphor).toBe("amber");
  });
});

describe("damaged saved data", () => {
  it("drops malformed entries instead of breaking the panel", () => {
    const kv = memoryKV({ "kosmos-log2": JSON.stringify([{ k: "1-2", t: 5 }, null, { k: 3 }, "x"]), "kosmos-likes": JSON.stringify({ not: "a list" }) });
    expect(new FlightLog(kv).refs()).toEqual([{ s: 1, i: 2, t: 5 }]);
    expect(new Beacons(kv, () => chunk).size).toBe(0);
  });
  it("one failing listener doesn't silence the others", () => {
    const log = new FlightLog(memoryKV()); let n = 0;
    log.changed.on(() => { throw new Error("boom"); }); log.changed.on(() => n++);
    const err = console.error; console.error = () => {};
    log.add({ s: 0, i: 0 }); console.error = err;
    expect(n).toBe(1);
  });
});

describe("surviving a map rebuild", () => {
  it("log entries keep the YouTube id, star name and build, and repeat plays move to the top", () => {
    const log = new FlightLog(memoryKV());
    log.add({ s: 1, i: 2 }, 1, { b: "abc", y: "yt1", st: "Techno" });
    log.add({ s: 3, i: 4 }, 2, { b: "abc", y: "yt2", st: "House" });
    log.add({ s: 9, i: 9 }, 3, { b: "new", y: "yt1", st: "Techno" }); // same video, renumbered map
    expect(log.refs().map((r) => [r.y, r.s, r.b])).toEqual([["yt1", 9, "new"], ["yt2", 3, "abc"]]);
  });
  it("a beacon is found by its video in the star it names", () => {
    const kv = memoryKV(); const b = new Beacons(kv, () => chunk);
    b.toggle({ s: 0, i: 2 }, "Deep House");
    expect(b.all[0].st).toBe("Deep House");
    const moved = { ...chunk, yt: ["ccc", "aaa", "bbb"] };
    const b2 = new Beacons(kv, (s) => (s === 5 ? moved : null));
    expect(b2.ref(b2.all[0], 5)).toEqual({ s: 5, i: 0 });
  });
});
