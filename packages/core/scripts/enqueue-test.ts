// Enqueue one faceless/AI-visuals test job through the real queue path (same
// code the dashboard's "Render it" button calls), then print the job id so it
// can be polled while the worker picks it up.
//   pnpm exec tsx packages/core/scripts/enqueue-test.ts
import { db } from "../src/db/client.js";
import { channels } from "../src/db/schema.js";
import { enqueueJob } from "../src/db/queue.js";

try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  /* no .env — rely on process.env */
}

const channel = (await db().select().from(channels).limit(1))[0];
if (!channel) {
  console.error("No channel found — dashboard hasn't bootstrapped one yet.");
  process.exit(1);
}

const job = await enqueueJob({
  channelId: channel.id,
  topic: "Why octopuses have three hearts and blue blood",
  mode: "faceless",
  target: "download",
  options: { visuals: "ai", privacy: "private" },
});

console.log(JSON.stringify({ jobId: job.id, channelId: channel.id, status: job.status }));
process.exit(0);
