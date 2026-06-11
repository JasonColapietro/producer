import { describe, it, expect } from "vitest";
import { shouldRunCron } from "./settings.js";

const NOW = new Date("2026-06-11T12:00:00Z");
const DEFAULT_HOURS = 1;
const DEFAULT_MS = DEFAULT_HOURS * 3_600_000;

type CronSettings = Parameters<typeof shouldRunCron>[0];

describe("shouldRunCron", () => {
  it("returns false when autopilotEnabled is false and lastCronRunAt is null", () => {
    const s: CronSettings = {
      autopilotEnabled: false,
      cronMinIntervalHours: DEFAULT_HOURS,
      lastCronRunAt: null,
    };
    expect(shouldRunCron(s, NOW)).toBe(false);
  });

  it("returns false when autopilotEnabled is false even if lastCronRunAt is well in the past", () => {
    const s: CronSettings = {
      autopilotEnabled: false,
      cronMinIntervalHours: DEFAULT_HOURS,
      lastCronRunAt: new Date(NOW.getTime() - DEFAULT_MS * 5),
    };
    expect(shouldRunCron(s, NOW)).toBe(false);
  });

  it("returns true when autopilotEnabled is true and lastCronRunAt is null (never run)", () => {
    const s: CronSettings = {
      autopilotEnabled: true,
      cronMinIntervalHours: DEFAULT_HOURS,
      lastCronRunAt: null,
    };
    expect(shouldRunCron(s, NOW)).toBe(true);
  });

  it("returns true when lastCronRunAt is exactly cronMinIntervalHours ago (>= boundary)", () => {
    const boundary = new Date(NOW.getTime() - DEFAULT_MS);
    const s: CronSettings = {
      autopilotEnabled: true,
      cronMinIntervalHours: DEFAULT_HOURS,
      lastCronRunAt: boundary,
    };
    expect(shouldRunCron(s, NOW)).toBe(true);
  });

  it("returns false when lastCronRunAt is just under the interval ago (1 second short)", () => {
    const justUnder = new Date(NOW.getTime() - DEFAULT_MS + 1_000);
    const s: CronSettings = {
      autopilotEnabled: true,
      cronMinIntervalHours: DEFAULT_HOURS,
      lastCronRunAt: justUnder,
    };
    expect(shouldRunCron(s, NOW)).toBe(false);
  });

  it("returns true when lastCronRunAt is well over the interval ago", () => {
    const longAgo = new Date(NOW.getTime() - DEFAULT_MS - 60_000);
    const s: CronSettings = {
      autopilotEnabled: true,
      cronMinIntervalHours: DEFAULT_HOURS,
      lastCronRunAt: longAgo,
    };
    expect(shouldRunCron(s, NOW)).toBe(true);
  });

  it("respects a non-default interval (6 h): returns false when only 5 h 59 m 59 s have elapsed", () => {
    const SIX_HOURS_MS = 6 * 3_600_000;
    const justUnder = new Date(NOW.getTime() - SIX_HOURS_MS + 1_000);
    const s: CronSettings = {
      autopilotEnabled: true,
      cronMinIntervalHours: 6,
      lastCronRunAt: justUnder,
    };
    expect(shouldRunCron(s, NOW)).toBe(false);
  });

  it("respects a non-default interval (6 h): returns true when exactly 6 h have elapsed", () => {
    const SIX_HOURS_MS = 6 * 3_600_000;
    const boundary = new Date(NOW.getTime() - SIX_HOURS_MS);
    const s: CronSettings = {
      autopilotEnabled: true,
      cronMinIntervalHours: 6,
      lastCronRunAt: boundary,
    };
    expect(shouldRunCron(s, NOW)).toBe(true);
  });
});
