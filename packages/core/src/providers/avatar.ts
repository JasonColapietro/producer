import { MODELS, type Creds } from "../config.js";
import { firstUrl, runReplicate } from "./replicate.js";

/**
 * Audio-driven talking head. Feeds one portrait + an audio clip and returns a
 * lip-synced video of that face speaking. Keep clips short (intro/outro beats)
 * — this is the only pricey GPU call, so the pipeline uses avatar for hero
 * segments and b-roll for the body. portraitUrl = the tenant's own photo.
 */
export async function animateAvatar(
  creds: Creds,
  portraitUrl: string,
  audioUrl: string,
): Promise<string> {
  const out = await runReplicate(
    creds.replicateApiToken,
    MODELS.avatar,
    { image: portraitUrl, audio: audioUrl },
    { timeoutMs: 15 * 60_000 },
  );
  return firstUrl(out);
}
