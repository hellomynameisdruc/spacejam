import { describe, expect, it } from "vitest";
import { clipSeg } from "../src/core/util";

describe("clipSeg", () => {
  it("keeps the part of a segment inside the box", () => {
    expect(clipSeg(-100, 50, 200, 50, 0, 0, 100, 100)).toEqual([1 / 3, 2 / 3]);
    expect(clipSeg(10, 10, 20, 20, 0, 0, 100, 100)).toEqual([0, 1]);
    expect(clipSeg(-10, -10, -5, 200, 0, 0, 100, 100)).toBeNull();
  });
});
