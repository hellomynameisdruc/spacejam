import { describe, expect, it } from "vitest";
import type { Planet } from "../src/core/types";
import { addWords, unpackTracks } from "../src/data/loader";

const P = (s: number, t0: number, t1: number, x: number): Planet => ({ name: "L", s, x, y: 0, r: 5, n: 10, yr: [2000, 2001], t0, t1 });

describe("unpackTracks", () => {
  it("puts ids, planets, satellites and belt points back", () => {
    const planets = [{ P: P(3, 0, 2, 100), pi: 7 }, { P: P(3, 2, 3, 300), pi: 8 }];
    const ch = unpackTracks({ v: 2, n: 5, yt: "aaaaaaaaaaabbbbbbbbbbbcccccccccccdddddddddddeeeeeeeeeee", yr: [1, 2, 3, 4, 5], bx: [10, 20], by: [-1, -2] }, planets);
    expect(ch.yt).toEqual(["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc", "ddddddddddd", "eeeeeeeeeee"]);
    expect(ch.p).toEqual([7, 7, 8, -1, -1]);
    expect([ch.x[3], ch.y[3], ch.x[4], ch.y[4]]).toEqual([10, -1, 20, -2]);
    // the first satellite of a planet sits just outside it, the next one a little further out
    const d0 = Math.hypot(ch.x[0] - 100, ch.y[0]), d1 = Math.hypot(ch.x[1] - 100, ch.y[1]);
    expect(d0).toBeCloseTo(5 + 4 + 1.5 * Math.sqrt(0.5)); expect(d1).toBeGreaterThan(d0);
    expect(ch.t).toEqual([]);
    addWords(ch, { t: "A\nB\nC\nD\nE", an: "X\nY", a: [0, 1, 0, 1, 0] });
    expect(ch.t[4]).toBe("E"); expect(ch.an[ch.a[1]]).toBe("Y");
  });
});
