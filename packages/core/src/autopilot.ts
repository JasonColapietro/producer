import { eq } from "drizzle-orm";
import { resolveCreds } from "./config.js";
import { db } from "./db/client.js";
import {
  addTopics,
  countPendingTopics,
  isPlanDue,
  listEnabledPlans,
  markPlanEnqueued,
  recentTopics,
  takePendingTopics,
} from "./db/plans.js";
import { enqueueJob } from "./db/queue.js";
import { channels } from "./db/schema.js";
import { ideateTopics } from "./providers/llm.js";

export interface AutopilotResult {
  plansRun: number;
  jobsEnqueued: number;
  details: { planId: string; enqueued: number; error?: string }[];
}

/**
 * The autopilot tick — called by the daily Vercel cron. For each enabled plan
 * that's due, refill the topic backlog from the niche (via the LLM) if it's
 * short, then enqueue `perDay` jobs. The always-on Render worker renders them.
 * One bad plan never kills the whole tick.
 */
export async function runDuePlans(now = new Date()): Promise<AutopilotResult> {
  const plans = await listEnabledPlans();
  const result: AutopilotResult = { plansRun: 0, jobsEnqueued: 0, details: [] };

  for (const plan of plans) {
    if (!isPlanDue(plan, now)) continue;
    try {
      const channel = (await db().select().from(channels).where(eq(channels.id, plan.channelId)).limit(1))[0];
      if (!channel) continue;
      const creds = resolveCreds(channel);
      const need = Math.max(1, plan.perDay);

      // Top up the backlog from the niche if it can't cover today's quota.
      if ((await countPendingTopics(plan.id)) < need) {
        const fresh = await ideateTopics(creds, {
          niche: plan.niche,
          count: Math.max(need * 3, 10),
          avoid: await recentTopics(plan.id),
        });
        await addTopics(plan.id, fresh);
      }

      const topics = await takePendingTopics(plan.id, need);
      for (const topic of topics) {
        await enqueueJob({ channelId: plan.channelId, topic, mode: plan.mode, target: plan.target });
      }
      if (topics.length > 0) await markPlanEnqueued(plan.id, now);

      result.plansRun++;
      result.jobsEnqueued += topics.length;
      result.details.push({ planId: plan.id, enqueued: topics.length });
    } catch (e) {
      result.details.push({ planId: plan.id, enqueued: 0, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}
