import { db, schema } from "@tubeforge/core/web";
import { sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * Vercel cron heartbeat. The Render worker drains the queue continuously, so the
 * cron's real job is content SCHEDULING: this is where auto-enqueue from a
 * channel's content plan plugs in (e.g. "1 video/day from the backlog"). For now
 * it reports queue health and verifies the secret so the endpoint is locked down.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const [stats] = await db()
    .select({
      queued: sql<number>`count(*) filter (where status = 'queued')`,
      processing: sql<number>`count(*) filter (where status = 'processing')`,
      needsReview: sql<number>`count(*) filter (where status = 'needs_review')`,
      published: sql<number>`count(*) filter (where status = 'published')`,
      failed: sql<number>`count(*) filter (where status = 'failed')`,
    })
    .from(schema.jobs);

  // TODO(autopilot): for each channel with a content plan due, enqueueJob() here.

  return NextResponse.json({ ok: true, at: new Date().toISOString(), stats });
}
