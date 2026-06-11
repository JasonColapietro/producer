import { and, asc, eq } from "drizzle-orm";
import { db } from "./client.js";
import { jobs, type Job, type NewJob } from "./schema.js";

export async function enqueueJob(input: {
  channelId: string;
  topic: string;
  mode?: NewJob["mode"];
  target?: NewJob["target"];
  options?: NewJob["options"];
  scheduledAt?: Date | null;
}): Promise<Job> {
  const [row] = await db()
    .insert(jobs)
    .values({
      channelId: input.channelId,
      topic: input.topic,
      mode: input.mode ?? "faceless",
      target: input.target ?? "download",
      options: input.options ?? {},
      scheduledAt: input.scheduledAt ?? null,
      status: "queued",
    })
    .returning();
  return row!;
}

/**
 * Atomically claim the oldest queued job. The guarded UPDATE (…AND status='queued')
 * is the lock: two workers racing can't both flip the same row. Returns null if
 * the queue is empty or the pick was taken first.
 */
export async function claimNextJob(): Promise<Job | null> {
  const pick = (
    await db().select({ id: jobs.id }).from(jobs).where(eq(jobs.status, "queued")).orderBy(asc(jobs.createdAt)).limit(1)
  )[0];
  if (!pick) return null;

  const claimed = await db()
    .update(jobs)
    .set({ status: "processing", updatedAt: new Date() })
    .where(and(eq(jobs.id, pick.id), eq(jobs.status, "queued")))
    .returning();
  return claimed[0] ?? null;
}

/** Claim the oldest approved ("ready") job for publishing. Same guarded-update lock. */
export async function claimReadyJob(): Promise<Job | null> {
  const pick = (
    await db().select({ id: jobs.id }).from(jobs).where(eq(jobs.status, "ready")).orderBy(asc(jobs.createdAt)).limit(1)
  )[0];
  if (!pick) return null;

  const claimed = await db()
    .update(jobs)
    .set({ status: "publishing", updatedAt: new Date() })
    .where(and(eq(jobs.id, pick.id), eq(jobs.status, "ready")))
    .returning();
  return claimed[0] ?? null;
}
