import { describe, it, expect } from "vitest";
import { firstUrl } from "./replicate.js";

describe("firstUrl", () => {
  it("returns a plain string as-is", () => {
    expect(firstUrl("https://example.com/audio.mp3")).toBe("https://example.com/audio.mp3");
  });

  it("returns the first element of a string array", () => {
    expect(firstUrl(["https://first.com/a.mp3", "https://second.com/b.mp3"])).toBe(
      "https://first.com/a.mp3",
    );
  });

  it("extracts .audio from an object", () => {
    expect(firstUrl({ audio: "https://example.com/out.wav" })).toBe(
      "https://example.com/out.wav",
    );
  });

  it("throws on an unexpected shape (number)", () => {
    expect(() => firstUrl(42)).toThrow("Unexpected Replicate output shape");
  });

  it("throws on an unexpected shape (null)", () => {
    expect(() => firstUrl(null)).toThrow("Unexpected Replicate output shape");
  });

  it("throws on an unexpected shape (object without audio)", () => {
    expect(() => firstUrl({ video: "https://example.com/v.mp4" })).toThrow(
      "Unexpected Replicate output shape",
    );
  });

  it("throws on an array of non-strings", () => {
    expect(() => firstUrl([42, 99])).toThrow("Unexpected Replicate output shape");
  });
});
