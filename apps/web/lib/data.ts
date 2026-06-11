import "server-only";
import { db, schema } from "@tubeforge/core/web";
import { desc, eq } from "drizzle-orm";

const { users, channels, jobs } = schema;

/**
 * Single-tenant bootstrap: ensure an owner user + default channel exist, so the
 * dashboard works on first boot. Multi-tenant auth replaces this later.
 */
export async function ensureOwnerChannel() {
  const existing = await db().select().from(channels).limit(1);
  if (existing[0]) return existing[0];

  const email = process.env.OWNER_EMAIL ?? "owner@tubeforge.local";
  let owner = (await db().select().from(users).where(eq(users.email, email)).limit(1))[0];
  if (!owner) owner = (await db().insert(users).values({ email }).returning())[0]!;

  return (
    await db()
      .insert(channels)
      .values({ userId: owner.id, name: "My Channel", niche: "" })
      .returning()
  )[0]!;
}

export async function listJobs(channelId: string, limit = 25) {
  return db()
    .select()
    .from(jobs)
    .where(eq(jobs.channelId, channelId))
    .orderBy(desc(jobs.createdAt))
    .limit(limit);
}

export async function jobThumbnails(jobIds: string[]) {
  if (jobIds.length === 0) return new Map<string, string>();
  const rows = await db().select().from(schema.assets);
  const map = new Map<string, string>();
  for (const a of rows) {
    if (a.kind === "thumbnail" && jobIds.includes(a.jobId)) map.set(a.jobId, a.url);
  }
  return map;
}
