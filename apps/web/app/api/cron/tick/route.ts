import { db, runAutopilotTick, schema } from "@producer/core/web";
import { sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Vercel cron tick (daily on Hobby). Runs autopilot: each due content plan
 * refills its topic backlog from its niche and enqueues `perDay` jobs, which the
 * always-on Render worker then renders. Also reports queue health. Locked by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const autopilot = await runAutopilotTick();

  const [stats] = await db()
    .select({
      queued: sql<number>`count(*) filter (where status = 'queued')`,
      processing: sql<number>`count(*) filter (where status = 'processing')`,
      needsReview: sql<number>`count(*) filter (where status = 'needs_review')`,
      published: sql<number>`count(*) filter (where status = 'published')`,
      failed: sql<number>`count(*) filter (where status = 'failed')`,
    })
    .from(schema.jobs);

  return NextResponse.json({ ok: true, at: new Date().toISOString(), autopilot, stats });
}
