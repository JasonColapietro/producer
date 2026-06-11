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
import { getSettings, shouldRunCron, updateSettings } from "./db/settings.js";
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
export async function runDuePlans(
  now = new Date(),
  opts: { force?: boolean; maxJobs?: number } = {},
): Promise<AutopilotResult> {
  const plans = await listEnabledPlans();
  const result: AutopilotResult = { plansRun: 0, jobsEnqueued: 0, details: [] };

  for (const plan of plans) {
    if (!opts.force && !isPlanDue(plan, now)) continue;
    if (opts.maxJobs != null && result.jobsEnqueued >= opts.maxJobs) break;
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

      // Respect the per-tick safety cap.
      const budget = opts.maxJobs != null ? opts.maxJobs - result.jobsEnqueued : need;
      const take = Math.max(0, Math.min(need, budget));
      const topics = take > 0 ? await takePendingTopics(plan.id, take) : [];
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

export interface AutopilotTickResult extends AutopilotResult {
  ran: boolean;
  skipped?: string;
}

/**
 * Cron entrypoint with the runtime controls applied:
 * - AUTOPILOT_ENABLED=false (env) hard-disables everything (deploy-level off switch).
 * - Otherwise the DB settings gate it: master on/off + min-interval throttle.
 * - `force` (the dashboard "Run now" button) bypasses the DB gate AND the per-plan
 *   interval — but never the env hard-off.
 */
export async function runAutopilotTick(opts: { force?: boolean } = {}): Promise<AutopilotTickResult> {
  const empty = { plansRun: 0, jobsEnqueued: 0, details: [] as AutopilotResult["details"] };
  if (process.env.AUTOPILOT_ENABLED === "false") {
    return { ran: false, skipped: "disabled by env (AUTOPILOT_ENABLED=false)", ...empty };
  }
  const now = new Date();
  const settings = await getSettings();
  if (!opts.force && !shouldRunCron(settings, now)) {
    return { ran: false, skipped: settings.autopilotEnabled ? "min interval not elapsed" : "autopilot disabled", ...empty };
  }
  const result = await runDuePlans(now, { force: opts.force, maxJobs: settings.maxJobsPerTick });
  await updateSettings({ lastCronRunAt: now });
  return { ran: true, ...result };
}
