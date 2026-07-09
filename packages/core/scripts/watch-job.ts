// Poll one job's status/stage until it hits a terminal state, printing every change.
//   pnpm exec tsx packages/core/scripts/watch-job.ts <jobId>
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { jobs, assets } from "../src/db/schema.js";

try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  /* no .env — rely on process.env */
}

const jobId = process.argv[2];
if (!jobId) {
  console.error("Usage: tsx watch-job.ts <jobId>");
  process.exit(1);
}

const TERMINAL = new Set(["completed", "published", "failed", "needs_review", "needs_voiceover"]);
let lastKey = "";
const deadline = Date.now() + 15 * 60_000;

while (Date.now() < deadline) {
  const [job] = await db().select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) {
    console.error("job not found");
    process.exit(1);
  }
  const key = `${job.status}:${job.stage}`;
  if (key !== lastKey) {
    const ts = new Date().toISOString().slice(11, 19);
    console.log(`[${ts}] status=${job.status} stage=${job.stage}${job.error ? ` error=${job.error}` : ""}`);
    lastKey = key;
  }
  if (TERMINAL.has(job.status)) {
    const jobAssets = await db().select().from(assets).where(eq(assets.jobId, jobId));
    console.log("assets:", jobAssets.map((a) => `${a.kind}${a.meta && (a.meta as any).source ? `(${(a.meta as any).source})` : ""}`).join(", "));
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 8000));
}
console.error("timed out watching job");
process.exit(1);
