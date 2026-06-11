import { MODELS, type Creds } from "../config.js";
import { firstUrl, runReplicate } from "./replicate.js";

/** Flux text-to-image — used for the thumbnail and to fill b-roll gaps. */
export async function generateImage(
  creds: Creds,
  prompt: string,
  aspectRatio: "16:9" | "9:16" = "16:9",
): Promise<string> {
  const out = await runReplicate(creds.replicateApiToken, MODELS.image, {
    prompt,
    aspect_ratio: aspectRatio,
    output_format: "jpg",
    output_quality: 90,
    num_outputs: 1,
  });
  return firstUrl(out);
}
