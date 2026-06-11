import { describe, it, expect } from "vitest";
import { isPlanDue, PLAN_MIN_INTERVAL_MS } from "./plans.js";

const NOW = new Date("2026-06-11T12:00:00Z");

describe("isPlanDue", () => {
  it("returns false for a disabled plan even when lastEnqueuedAt is null", () => {
    expect(isPlanDue({ enabled: false, lastEnqueuedAt: null }, NOW)).toBe(false);
  });

  it("returns false for a disabled plan even when lastEnqueuedAt is well in the past", () => {
    const old = new Date(NOW.getTime() - PLAN_MIN_INTERVAL_MS * 2);
    expect(isPlanDue({ enabled: false, lastEnqueuedAt: old }, NOW)).toBe(false);
  });

  it("returns true for an enabled plan that has never run (lastEnqueuedAt null)", () => {
    expect(isPlanDue({ enabled: true, lastEnqueuedAt: null }, NOW)).toBe(true);
  });

  it("returns true when lastEnqueuedAt is exactly PLAN_MIN_INTERVAL_MS ago (>= boundary)", () => {
    const boundary = new Date(NOW.getTime() - PLAN_MIN_INTERVAL_MS);
    expect(isPlanDue({ enabled: true, lastEnqueuedAt: boundary }, NOW)).toBe(true);
  });

  it("returns false when lastEnqueuedAt is 1 ms under the interval", () => {
    const justUnder = new Date(NOW.getTime() - PLAN_MIN_INTERVAL_MS + 1);
    expect(isPlanDue({ enabled: true, lastEnqueuedAt: justUnder }, NOW)).toBe(false);
  });

  it("returns true when lastEnqueuedAt is well over the interval ago", () => {
    const longAgo = new Date(NOW.getTime() - PLAN_MIN_INTERVAL_MS - 1000);
    expect(isPlanDue({ enabled: true, lastEnqueuedAt: longAgo }, NOW)).toBe(true);
  });
});
