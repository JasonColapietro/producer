// Public surface of the TubeForge engine.
export * as schema from "./db/schema.js";
export { db } from "./db/client.js";
export { enqueueJob, claimNextJob, claimReadyJob } from "./db/queue.js";
export { resolveCreds, MODELS, type Creds } from "./config.js";
export { processJob, publishJob } from "./pipeline/index.js";
export { getAuthUrl, exchangeCode } from "./providers/publish.js";
export { ideateTopics } from "./providers/llm.js";
export { runDuePlans, type AutopilotResult } from "./autopilot.js";
export {
  createPlan,
  listPlans,
  getPlan,
  listEnabledPlans,
  setPlanEnabled,
  deletePlan,
  addTopics,
  countPendingTopics,
  takePendingTopics,
  recentTopics,
  markPlanEnqueued,
  isPlanDue,
  PLAN_MIN_INTERVAL_MS,
} from "./db/plans.js";
export type {
  Job,
  NewJob,
  Channel,
  Asset,
  VideoMode,
  PublishTarget,
  JobStatus,
  JobStage,
  AssetKind,
  ChannelDefaults,
  ChannelSecrets,
  JobOptions,
  ContentPlan,
  NewContentPlan,
  PlanTopic,
} from "./db/schema.js";
