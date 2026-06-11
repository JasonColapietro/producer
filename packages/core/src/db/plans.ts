import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "./client.js";
import { contentPlans, planTopics, type ContentPlan, type NewContentPlan } from "./schema.js";

/** A plan can enqueue again once it's been ~a day since the last run. The daily
 *  cron naturally satisfies this; the guard just prevents double-fire on retries. */
export const PLAN_MIN_INTERVAL_MS = 20 * 60 * 60 * 1000;

/** Pure: is this plan due to enqueue at `now`? Exposed for testing. */
export function isPlanDue(plan: Pick<ContentPlan, "enabled" | "lastEnqueuedAt">, now: Date): boolean {
  if (!plan.enabled) return false;
  if (!plan.lastEnqueuedAt) return true;
  return now.getTime() - plan.lastEnqueuedAt.getTime() >= PLAN_MIN_INTERVAL_MS;
}

export async function createPlan(input: {
  channelId: string;
  name: string;
  niche: string;
  perDay?: number;
  mode?: NewContentPlan["mode"];
  target?: NewContentPlan["target"];
  enabled?: boolean;
}): Promise<ContentPlan> {
  const [row] = await db()
    .insert(contentPlans)
    .values({
      channelId: input.channelId,
      name: input.name,
      niche: input.niche,
      perDay: input.perDay ?? 1,
      mode: input.mode ?? "faceless",
      target: input.target ?? "download",
      enabled: input.enabled ?? true,
    })
    .returning();
  return row!;
}

export function listPlans(channelId: string): Promise<ContentPlan[]> {
  return db().select().from(contentPlans).where(eq(contentPlans.channelId, channelId)).orderBy(asc(contentPlans.createdAt));
}

export async function getPlan(id: string): Promise<ContentPlan | undefined> {
  return (await db().select().from(contentPlans).where(eq(contentPlans.id, id)).limit(1))[0];
}

export async function listEnabledPlans(): Promise<ContentPlan[]> {
  return db().select().from(contentPlans).where(eq(contentPlans.enabled, true));
}

export async function setPlanEnabled(id: string, enabled: boolean): Promise<void> {
  await db().update(contentPlans).set({ enabled }).where(eq(contentPlans.id, id));
}

export async function deletePlan(id: string): Promise<void> {
  await db().delete(contentPlans).where(eq(contentPlans.id, id));
}

export async function markPlanEnqueued(id: string, at: Date): Promise<void> {
  await db().update(contentPlans).set({ lastEnqueuedAt: at }).where(eq(contentPlans.id, id));
}

export async function addTopics(planId: string, topics: string[]): Promise<void> {
  const clean = topics.map((t) => t.trim()).filter(Boolean);
  if (clean.length === 0) return;
  await db().insert(planTopics).values(clean.map((topic) => ({ planId, topic })));
}

export async function countPendingTopics(planId: string): Promise<number> {
  const rows = await db()
    .select({ id: planTopics.id })
    .from(planTopics)
    .where(and(eq(planTopics.planId, planId), eq(planTopics.used, false)));
  return rows.length;
}

/** Most recently used topics — fed to the LLM as "avoid" when refilling. */
export async function recentTopics(planId: string, limit = 40): Promise<string[]> {
  const rows = await db().select().from(planTopics).where(eq(planTopics.planId, planId));
  return rows.map((r) => r.topic).slice(-limit);
}

/** Claim up to `n` unused topics, marking them used. Returns the topic strings. */
export async function takePendingTopics(planId: string, n: number): Promise<string[]> {
  const picks = await db()
    .select({ id: planTopics.id, topic: planTopics.topic })
    .from(planTopics)
    .where(and(eq(planTopics.planId, planId), eq(planTopics.used, false)))
    .orderBy(asc(planTopics.createdAt))
    .limit(n);
  if (picks.length === 0) return [];
  await db()
    .update(planTopics)
    .set({ used: true })
    .where(inArray(planTopics.id, picks.map((p) => p.id)));
  return picks.map((p) => p.topic);
}
