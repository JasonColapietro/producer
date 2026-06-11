import { MODELS, type Creds } from "../config.js";
import { firstUrl, runReplicate } from "./replicate.js";

/**
 * Clone-voice text-to-speech. `speakerUrl` is a short reference clip of the
 * target voice (the tenant's own, for personal brand) — XTTS is zero-shot, so
 * ~10s is enough. For faceless channels point it at any neutral sample.
 */
export async function synthesizeSpeech(
  creds: Creds,
  text: string,
  speakerUrl: string,
): Promise<string> {
  const out = await runReplicate(creds.replicateApiToken, MODELS.tts, {
    text,
    speaker: speakerUrl,
    language: "en",
    cleanup_voice: true,
  });
  return firstUrl(out);
}
