import { claimNextJob, claimReadyJob, processJob, publishJob } from "@tubeforge/core";

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 5000);
let running = true;

function log(...a: unknown[]) {
  console.log(new Date().toISOString(), "[worker]", ...a);
}

async function tick(): Promise<boolean> {
  // Publishing approved jobs takes priority over building new ones.
  const ready = await claimReadyJob();
  if (ready) {
    log(`publishing job ${ready.id} (${ready.title ?? ready.topic})`);
    try {
      const id = await publishJob(ready.id);
      log(`published ${ready.id} → https://youtu.be/${id}`);
    } catch (e) {
      log(`publish failed ${ready.id}:`, e instanceof Error ? e.message : e);
    }
    return true;
  }

  const job = await claimNextJob();
  if (job) {
    log(`building job ${job.id} (${job.mode}) — ${job.topic}`);
    try {
      await processJob(job.id);
      log(`done ${job.id}`);
    } catch (e) {
      log(`build failed ${job.id}:`, e instanceof Error ? e.message : e);
    }
    return true;
  }
  return false;
}

async function main() {
  log(`up. polling every ${POLL_MS}ms`);
  while (running) {
    let didWork = false;
    try {
      didWork = await tick();
    } catch (e) {
      log("tick error:", e instanceof Error ? e.message : e);
    }
    if (!didWork) await new Promise((r) => setTimeout(r, POLL_MS));
  }
  log("shutting down");
}

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    log(`${sig} received`);
    running = false;
  });
}

main().catch((e) => {
  log("fatal:", e);
  process.exit(1);
});
