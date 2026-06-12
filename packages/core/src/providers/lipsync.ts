import { MODELS, type Creds } from "../config.js";
import { firstUrl, runReplicate } from "./replicate.js";

/**
 * Lip-sync existing talking-head footage to new audio via LatentSync.
 * Cheaper than SadTalker: L40S GPU, ~80s, real facial expressions preserved.
 * videoUrl = the base clip (user's own footage); audioUrl = recorded voiceover.
 */
export async function syncLips(
  creds: Creds,
  videoUrl: string,
  audioUrl: string,
): Promise<string> {
  const out = await runReplicate(
    creds.replicateApiToken,
    MODELS.lipsync,
    { video: videoUrl, audio: audioUrl, inference_steps: 20, guidance_scale: 1.5 },
    { timeoutMs: 10 * 60_000 },
  );
  return firstUrl(out);
}
