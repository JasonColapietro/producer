import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// ── enums ────────────────────────────────────────────────────────────────────
export const videoMode = pgEnum("video_mode", ["faceless", "avatar"]);

// Where a finished video goes. "download" = build it, store the MP4, stop (you
// upload manually — the default while YouTube API publishing is gated by audit).
// "youtube" = auto-upload via the Data API.
export const publishTarget = pgEnum("publish_target", ["download", "youtube"]);

export const jobStatus = pgEnum("job_status", [
  "queued", // waiting for a worker
  "processing", // a worker has claimed it
  "needs_review", // assembled, waiting for human approve (if review gate on)
  "ready", // approved, waiting to publish / scheduled (youtube target)
  "publishing",
  "published",
  "completed", // built + stored, ready to download (manual-upload target)
  "failed",
]);

export const jobStage = pgEnum("job_stage", [
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

export const assetKind = pgEnum("asset_kind", [
  "script",
  "audio",
  "caption",
  "broll",
  "image",
  "thumbnail",
  "video",
  "final",
]);

// ── tenants ──────────────────────────────────────────────────────────────────
// One row per customer. v1 seeds a single owner row; billing/auth attach here.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  plan: text("plan").notNull().default("owner"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// A YouTube channel a tenant automates. Holds its own BYO API keys + YT token,
// so each customer pays their own inference + the product bears zero GPU cost.
export const channels = pgTable(
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
export const jobs = pgTable(
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
export const assets = pgTable(
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

// ── relations ────────────────────────────────────────────────────────────────
export const usersRel = relations(users, ({ many }) => ({
  channels: many(channels),
}));
export const channelsRel = relations(channels, ({ one, many }) => ({
  user: one(users, { fields: [channels.userId], references: [users.id] }),
  jobs: many(jobs),
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
}

export interface JobOptions extends ChannelDefaults {
  /** Override channel niche for this single video. */
  niche?: string;
  /** Make it private/unlisted/public on publish. */
  privacy?: "private" | "unlisted" | "public";
}

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Channel = typeof channels.$inferSelect;
export type Asset = typeof assets.$inferSelect;

export type VideoMode = (typeof videoMode.enumValues)[number];
export type PublishTarget = (typeof publishTarget.enumValues)[number];
export type JobStatus = (typeof jobStatus.enumValues)[number];
export type JobStage = (typeof jobStage.enumValues)[number];
export type AssetKind = (typeof assetKind.enumValues)[number];
