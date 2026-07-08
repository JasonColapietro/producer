import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const tf = pgSchema("tubeforge");

// ── enums ────────────────────────────────────────────────────────────────────
export const videoMode = tf.enum("video_mode", ["faceless", "avatar", "voiceover"]);

// Where a finished video goes. "download" = build it, store the MP4, stop (you
// upload manually — the default while YouTube API publishing is gated by audit).
// "youtube" = auto-upload via the Data API.
export const publishTarget = tf.enum("publish_target", ["download", "youtube"]);

export const jobStatus = tf.enum("job_status", [
  "queued", // waiting for a worker
  "processing", // a worker has claimed it
  "needs_voiceover", // script ready, waiting for user to upload recorded audio
  "needs_review", // assembled, waiting for human approve (if review gate on)
  "ready", // approved, waiting to publish / scheduled (youtube target)
  "publishing",
  "published",
  "completed", // built + stored, ready to download (manual-upload target)
  "failed",
]);

export const jobStage = tf.enum("job_stage", [
  "ideate",
  "script",
  "voice",
  "visuals",
  "avatar",
  "captions",
  "assemble",
  "thumbnail",
  "publish",
  "done",
]);

export const assetKind = tf.enum("asset_kind", [
  "script",
  "audio",
  "caption",
  "broll",
  "image",
  "thumbnail",
  "video",
  "final",
  "short", // 9:16 vertical cut for Reels/Shorts/TikTok
]);

// ── tenants ──────────────────────────────────────────────────────────────────
// One row per customer. v1 seeds a single owner row; billing/auth attach here.
export const users = tf.table("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  plan: text("plan").notNull().default("owner"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// A YouTube channel a tenant automates. Holds its own BYO API keys + YT token,
// so each customer pays their own inference + the product bears zero GPU cost.
export const channels = tf.table(
  "channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    niche: text("niche").notNull().default(""),
    // BYO keys. null ⇒ fall back to process.env (single-tenant v1).
    // TODO(billing): encrypt at rest before opening to external customers.
    secrets: jsonb("secrets")
      .$type<Partial<ChannelSecrets>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    // Per-channel defaults the pipeline reads (voice ref, persona, cadence…).
    defaults: jsonb("defaults")
      .$type<ChannelDefaults>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    youtubeRefreshToken: text("youtube_refresh_token"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("channels_user_idx").on(t.userId)],
);

// ── jobs ─────────────────────────────────────────────────────────────────────
export const jobs = tf.table(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    mode: videoMode("mode").notNull().default("faceless"),
    target: publishTarget("target").notNull().default("download"),
    status: jobStatus("status").notNull().default("queued"),
    stage: jobStage("stage").notNull().default("ideate"),
    topic: text("topic").notNull(),
    title: text("title"),
    description: text("description"),
    // resolved per-job options (overrides channel.defaults)
    options: jsonb("options").$type<JobOptions>().notNull().default(sql`'{}'::jsonb`),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    publishedVideoId: text("published_video_id"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("jobs_channel_idx").on(t.channelId),
    index("jobs_status_idx").on(t.status),
  ],
);

// Every artifact a job produces, addressable by URL in Blob storage.
export const assets = tf.table(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    kind: assetKind("kind").notNull(),
    url: text("url").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("assets_job_idx").on(t.jobId)],
);

// ── autopilot ────────────────────────────────────────────────────────────────
// A content plan turns a niche into an endless backlog: the daily cron enqueues
// `perDay` jobs from plan_topics, and when the backlog runs dry the LLM invents
// a fresh batch from the niche. Set it and it runs itself.
export const contentPlans = tf.table(
  "content_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    niche: text("niche").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    perDay: integer("per_day").notNull().default(1),
    mode: videoMode("mode").notNull().default("faceless"),
    target: publishTarget("target").notNull().default("download"),
    lastEnqueuedAt: timestamp("last_enqueued_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("content_plans_channel_idx").on(t.channelId)],
);

export const planTopics = tf.table(
  "plan_topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => contentPlans.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    used: boolean("used").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("plan_topics_plan_idx").on(t.planId)],
);

// Global runtime knobs — a single row ("global"). Lets you turn autopilot off or
// retune its cadence from the dashboard WITHOUT a redeploy (the vercel.json cron
// schedule is the fixed trigger; these gate what each tick actually does).
export const appSettings = tf.table("app_settings", {
  id: text("id").primaryKey().default("global"),
  autopilotEnabled: boolean("autopilot_enabled").notNull().default(true),
  cronMinIntervalHours: integer("cron_min_interval_hours").notNull().default(24),
  maxJobsPerTick: integer("max_jobs_per_tick").notNull().default(50),
  lastCronRunAt: timestamp("last_cron_run_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── relations ────────────────────────────────────────────────────────────────
export const usersRel = relations(users, ({ many }) => ({
  channels: many(channels),
}));
export const channelsRel = relations(channels, ({ one, many }) => ({
  user: one(users, { fields: [channels.userId], references: [users.id] }),
  jobs: many(jobs),
  plans: many(contentPlans),
}));
export const contentPlansRel = relations(contentPlans, ({ one, many }) => ({
  channel: one(channels, { fields: [contentPlans.channelId], references: [channels.id] }),
  topics: many(planTopics),
}));
export const planTopicsRel = relations(planTopics, ({ one }) => ({
  plan: one(contentPlans, { fields: [planTopics.planId], references: [contentPlans.id] }),
}));
export const jobsRel = relations(jobs, ({ one, many }) => ({
  channel: one(channels, { fields: [jobs.channelId], references: [channels.id] }),
  assets: many(assets),
}));
export const assetsRel = relations(assets, ({ one }) => ({
  job: one(jobs, { fields: [assets.jobId], references: [jobs.id] }),
}));

// ── jsonb shapes (typed) ─────────────────────────────────────────────────────
export interface ChannelSecrets {
  anthropicApiKey: string;
  replicateApiToken: string;
  pexelsApiKey: string;
  pixabayApiKey: string;
  /** Kie.ai key for generative AI video scenes (kie.ai → API Keys). */
  kieApiKey: string;
}

export interface ChannelDefaults {
  /** Reference audio URL for voice cloning (the tenant's own voice). */
  voiceRefUrl?: string;
  /** Portrait image URL for the avatar talking head. */
  avatarImageUrl?: string;
  /** Script persona / system steer. */
  persona?: string;
  /** Target length in minutes. */
  lengthMinutes?: number;
  /** Hold finished videos for manual approval before publishing. */
  reviewGate?: boolean;
  /** URL of the talking-head video clip used as the base for LatentSync lip-sync (voiceover mode). */
  voiceoverVideoUrl?: string;
}

export interface JobOptions extends ChannelDefaults {
  /** Override channel niche for this single video. */
  niche?: string;
  /** Make it private/unlisted/public on publish. */
  privacy?: "private" | "unlisted" | "public";
  /**
   * Scene visuals engine. "ai" = generative video via Kie.ai (cinematic,
   * costs cents per scene); "stock" = free Pexels/Pixabay B-roll. Falls back
   * ai → stock → Flux still, so a missing key never fails a job.
   */
  visuals?: "ai" | "stock";
}

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Channel = typeof channels.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type ContentPlan = typeof contentPlans.$inferSelect;
export type NewContentPlan = typeof contentPlans.$inferInsert;
export type PlanTopic = typeof planTopics.$inferSelect;
export type AppSettings = typeof appSettings.$inferSelect;

export type VideoMode = (typeof videoMode.enumValues)[number];
export type PublishTarget = (typeof publishTarget.enumValues)[number];
export type JobStatus = (typeof jobStatus.enumValues)[number];
export type JobStage = (typeof jobStage.enumValues)[number];
export type AssetKind = (typeof assetKind.enumValues)[number];
