// Light surface for the Vercel dashboard — DB, queue, OAuth, types only.
// Deliberately excludes the pipeline (FFmpeg / child_process / Replicate) so it
// never gets bundled into serverless functions.
export { db } from "./db/client.js";
export * as schema from "./db/schema.js";
export { enqueueJob } from "./db/queue.js";
export { resolveCreds, googleConfig, hasGoogleConfig } from "./config.js";
export { getAuthUrl, exchangeCode } from "./providers/publish.js";
export { runDuePlans, runAutopilotTick, type AutopilotResult, type AutopilotTickResult } from "./autopilot.js";
export { getSettings, updateSettings, type SettingsPatch } from "./db/settings.js";
export {
  createPlan,
  listPlans,
  getPlan,
  setPlanEnabled,
  deletePlan,
  addTopics,
  countPendingTopics,
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
  AppSettings,
} from "./db/schema.js";
