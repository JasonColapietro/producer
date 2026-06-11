// Light surface for the Vercel dashboard — DB, queue, OAuth, types only.
// Deliberately excludes the pipeline (FFmpeg / child_process / Replicate) so it
// never gets bundled into serverless functions.
export { db } from "./db/client.js";
export * as schema from "./db/schema.js";
export { enqueueJob } from "./db/queue.js";
export { resolveCreds, googleConfig } from "./config.js";
export { getAuthUrl, exchangeCode } from "./providers/publish.js";
export type {
  Job,
  NewJob,
  Channel,
  Asset,
  VideoMode,
  JobStatus,
  JobStage,
  AssetKind,
  ChannelDefaults,
  ChannelSecrets,
  JobOptions,
} from "./db/schema.js";
