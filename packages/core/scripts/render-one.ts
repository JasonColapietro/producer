/**
 * render-one.ts — one-shot local video builder for manual testing.
 *
 * Usage (from repo root):
 *   pnpm exec tsx packages/core/scripts/render-one.ts "<topic>" [faceless|avatar]
 *
 * Prerequisites:
 *   - ffmpeg must be installed and on PATH (brew install ffmpeg)
 *   - A .env file at the repo root with DATABASE_URL and API keys:
 *       DATABASE_URL, ANTHROPIC_API_KEY (or channel BYO keys),
 *       REPLICATE_API_TOKEN, PEXELS_API_KEY / PIXABAY_API_KEY,
 *       BLOB_READ_WRITE_TOKEN (Vercel Blob), STOCK_VOICE_REF_URL
 *   - Optional: OWNER_EMAIL (defaults to "owner@producer.local")
 */

// ── 1. Best-effort .env loading ───────────────────────────────────────────────
// Node 22 ships process.loadEnvFile natively; older Nodes skip it silently.
// Try the repo root relative to this script first, then fall back to cwd.
for (const envPath of [
  new URL("../../../.env", import.meta.url),
  new URL(".env", `file://${process.cwd()}/`),
]) {
  try {
    // @ts-ignore — process.loadEnvFile is Node 22+
    process.loadEnvFile(envPath);
    break; // stop at the first .env that loads without throwing
  } catch {
    // Not found or not Node 22 — try next path or continue without it
  }
}

// ── 2. Imports ────────────────────────────────────────────────────────────────
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { enqueueJob } from "../src/db/queue.js";
import { assets, channels, jobs, users } from "../src/db/schema.js";
import type { VideoMode } from "../src/db/schema.js";
import { processJob } from "../src/pipeline/index.js";

// ── 3. Parse CLI args ─────────────────────────────────────────────────────────
const topic = process.argv[2];
const modeArg = process.argv[3];

if (!topic) {
  console.error("Usage: pnpm exec tsx packages/core/scripts/render-one.ts \"<topic>\" [faceless|avatar]");
  console.error("Example: pnpm exec tsx packages/core/scripts/render-one.ts \"5 guitar tips for beginners\" faceless");
  process.exit(1);
}

const mode: VideoMode = modeArg === "avatar" ? "avatar" : "faceless";

// ── 4. Bootstrap owner user + channel (mirrors ensureOwnerChannel in apps/web/lib/data.ts) ──
async function ensureOwnerChannel(): Promise<string> {
  // Return the first channel that exists — no seed needed if already bootstrapped
  const existing = await db().select({ id: channels.id }).from(channels).limit(1);
  if (existing[0]) return existing[0].id;

  // No channel yet — upsert the owner user then insert a default channel
  const email = process.env.OWNER_EMAIL ?? "owner@producer.local";
  console.log(`No channel found — bootstrapping owner user (${email}) + default channel…`);

  let owner = (
    await db().select().from(users).where(eq(users.email, email)).limit(1)
  )[0];

  if (!owner) {
    owner = (await db().insert(users).values({ email }).returning())[0]!;
    console.log(`  Created user: ${owner.id}`);
  } else {
    console.log(`  Found existing user: ${owner.id}`);
  }

  const channel = (
    await db()
      .insert(channels)
      .values({ userId: owner.id, name: "My Channel", niche: "" })
      .returning()
  )[0]!;

  console.log(`  Created channel: ${channel.id} ("${channel.name}")`);
  return channel.id;
}

// ── 5. Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\nTubeForge render-one`);
  console.log(`  topic : ${topic}`);
  console.log(`  mode  : ${mode}`);
  console.log();

  // Ensure owner channel exists
  const channelId = await ensureOwnerChannel();

  // Enqueue the job (target: "download" — builds the MP4 and stops; no YouTube upload)
  const job = await enqueueJob({
    channelId,
    topic,
    mode,
    target: "download",
  });
  console.log(`Enqueued job: ${job.id}`);
  console.log(`Starting pipeline (this takes several minutes)…\n`);

  // ── 6. Run the full pipeline ────────────────────────────────────────────────
  try {
    await processJob(job.id);
  } catch (err) {
    console.error("\nPipeline failed:");
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // ── 7. Fetch and print the result ───────────────────────────────────────────
  // Read the resolved title from the job row
  const jobRow = (
    await db().select({ title: jobs.title }).from(jobs).where(eq(jobs.id, job.id)).limit(1)
  )[0];

  // Find the 'final' asset (last inserted wins — newest)
  const allAssets = await db()
    .select({ kind: assets.kind, url: assets.url })
    .from(assets)
    .where(eq(assets.jobId, job.id));

  const finalAsset = allAssets.filter((a) => a.kind === "final").at(-1);

  console.log("\n────────────────────────────────────────");
  if (jobRow?.title) {
    console.log(`Title : ${jobRow.title}`);
  }
  if (finalAsset?.url) {
    console.log(`\n✅ Video ready: ${finalAsset.url}`);
  } else {
    console.log("⚠️  Pipeline completed but no final asset URL was found.");
    console.log("   Check the assets table for job id:", job.id);
  }
  console.log("────────────────────────────────────────\n");
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
