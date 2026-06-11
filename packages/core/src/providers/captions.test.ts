import { describe, it, expect } from "vitest";
import { srtTime, buildSrt } from "./captions.js";

describe("srtTime", () => {
  it("formats 0 seconds as 00:00:00,000", () => {
    expect(srtTime(0)).toBe("00:00:00,000");
  });

  it("formats 3661.5 seconds as 01:01:01,500", () => {
    expect(srtTime(3661.5)).toBe("01:01:01,500");
  });

  it("clamps negative values to zero", () => {
    expect(srtTime(-5)).toBe("00:00:00,000");
  });

  it("handles millisecond boundaries correctly", () => {
    // 1.001 seconds → 00:00:01,001
    expect(srtTime(1.001)).toBe("00:00:01,001");
  });

  it("rounds fractional milliseconds", () => {
    // 1.0005 rounds to 1001 ms → 00:00:01,001
    expect(srtTime(1.0005)).toBe("00:00:01,001");
  });

  it("pads hours, minutes, and seconds with leading zeros", () => {
    // 3 seconds → 00:00:03,000
    expect(srtTime(3)).toBe("00:00:03,000");
  });

  it("handles exactly one hour", () => {
    expect(srtTime(3600)).toBe("01:00:00,000");
  });
});

describe("buildSrt", () => {
  it("returns an empty string for no segments", () => {
    expect(buildSrt([])).toBe("");
  });

  it("numbers cues starting at 1", () => {
    const srt = buildSrt([{ start: 0, end: 1, text: "Hello" }]);
    expect(srt.startsWith("1\n")).toBe(true);
  });

  it("formats the timing line with --> separator", () => {
    const srt = buildSrt([{ start: 0, end: 2, text: "Hi" }]);
    expect(srt).toContain("00:00:00,000 --> 00:00:02,000");
  });

  it("trims leading and trailing whitespace from text", () => {
    const srt = buildSrt([{ start: 0, end: 1, text: "  trimmed  " }]);
    expect(srt).toContain("\ntrimmed\n");
  });

  it("separates multiple cues with a blank line", () => {
    const srt = buildSrt([
      { start: 0, end: 1, text: "First" },
      { start: 1, end: 2, text: "Second" },
    ]);
    // The join("\n") between cues produces a blank line between the trailing \n of cue 1
    // and the index line of cue 2.
    expect(srt).toContain("First\n\n2\n");
  });

  it("numbers multiple cues sequentially", () => {
    const srt = buildSrt([
      { start: 0, end: 1, text: "One" },
      { start: 1, end: 2, text: "Two" },
      { start: 2, end: 3, text: "Three" },
    ]);
    expect(srt).toContain("1\n");
    expect(srt).toContain("\n2\n");
    expect(srt).toContain("\n3\n");
  });

  it("produces a complete well-formed SRT block for a single segment", () => {
    const srt = buildSrt([{ start: 61, end: 62.5, text: "Line one" }]);
    expect(srt).toBe("1\n00:01:01,000 --> 00:01:02,500\nLine one\n");
  });
});
