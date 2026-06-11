import { eq } from "drizzle-orm";
import { db } from "./client.js";
import { appSettings, type AppSettings } from "./schema.js";

const GLOBAL = "global";

export interface SettingsPatch {
  autopilotEnabled?: boolean;
  cronMinIntervalHours?: number;
  maxJobsPerTick?: number;
  lastCronRunAt?: Date | null;
}

/** Fetch the singleton settings row, lazily creating it on first read. */
export async function getSettings(): Promise<AppSettings> {
  const existing = (await db().select().from(appSettings).where(eq(appSettings.id, GLOBAL)).limit(1))[0];
  if (existing) return existing;
  await db().insert(appSettings).values({ id: GLOBAL }).onConflictDoNothing();
  return (await db().select().from(appSettings).where(eq(appSettings.id, GLOBAL)).limit(1))[0]!;
}

export async function updateSettings(patch: SettingsPatch): Promise<AppSettings> {
  await getSettings(); // ensure the row exists
  const [row] = await db()
    .update(appSettings)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(appSettings.id, GLOBAL))
    .returning();
  return row!;
}

/**
 * Pure: should the cron actually run autopilot at `now`? Gates on the master
 * switch and the runtime throttle interval. Exposed for testing.
 */
export function shouldRunCron(
  s: Pick<AppSettings, "autopilotEnabled" | "cronMinIntervalHours" | "lastCronRunAt">,
  now: Date,
): boolean {
  if (!s.autopilotEnabled) return false;
  if (!s.lastCronRunAt) return true;
  return now.getTime() - s.lastCronRunAt.getTime() >= s.cronMinIntervalHours * 3_600_000;
}
