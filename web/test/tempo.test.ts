import { describe, expect, it } from "vitest";
import { pulseBpm, tempoLabel, tempoOf } from "../src/model/tempo";

describe("tempo", () => {
  it("knows typical ranges and styles without a steady beat", () => {
    expect(tempoOf("Drum n Bass")).toEqual({ lo: 165, hi: 176 });
    expect(tempoOf("Deep House")).toEqual({ lo: 118, hi: 124 });
    expect(tempoOf("Dub Techno")).toEqual({ lo: 115, hi: 125 }); // not plain techno
    expect(tempoOf("Ambient")).toBeNull();
    expect(tempoLabel(tempoOf("Ambient"))).toBe("FREE TEMPO");
    expect(tempoLabel(tempoOf("Dubstep"))).toBe("138–142 BPM");
  });
  it("falls back to keywords for styles it doesn't list", () => {
    expect(tempoOf("Liquid Drum n Bass")).toEqual({ lo: 165, hi: 176 });
    expect(tempoOf("Something Odd")).toBeNull();
    expect(pulseBpm(null)).toBe(60);
  });
});
