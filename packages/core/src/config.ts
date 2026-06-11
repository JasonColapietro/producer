import type { Channel } from "./db/schema.js";

/**
 * Resolved credentials for a single pipeline run. Per-channel BYO keys win;
 * otherwise we fall back to process.env (single-tenant v1 + local dev).
 */
export interface Creds {
  anthropicApiKey: string;
  anthropicModel: string;
  replicateApiToken: string;
  pexelsApiKey: string;
  pixabayApiKey: string;
  blobToken: string;
  google: {
    clientId: string;
    clientSecret: string;
    redirect: string;
  };
}

function pick(channelValue: string | undefined, envKey: string): string {
  const v = channelValue ?? process.env[envKey];
  if (!v) throw new Error(`Missing credential: channel secret or env ${envKey}`);
  return v;
}

/** Just the Google OAuth config from env — used by the dashboard's connect/callback
 * routes without forcing all pipeline keys to be present. */
export function googleConfig() {
  return {
    clientId: pick(undefined, "GOOGLE_CLIENT_ID"),
    clientSecret: pick(undefined, "GOOGLE_CLIENT_SECRET"),
    redirect: pick(undefined, "GOOGLE_OAUTH_REDIRECT"),
  };
}

export function resolveCreds(channel: Pick<Channel, "secrets">): Creds {
  const s = channel.secrets ?? {};
  return {
    anthropicApiKey: pick(s.anthropicApiKey, "ANTHROPIC_API_KEY"),
    anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-fable-5",
    replicateApiToken: pick(s.replicateApiToken, "REPLICATE_API_TOKEN"),
    pexelsApiKey: pick(s.pexelsApiKey, "PEXELS_API_KEY"),
    pixabayApiKey: pick(s.pixabayApiKey, "PIXABAY_API_KEY"),
    blobToken: pick(undefined, "BLOB_READ_WRITE_TOKEN"),
    google: {
      clientId: pick(undefined, "GOOGLE_CLIENT_ID"),
      clientSecret: pick(undefined, "GOOGLE_CLIENT_SECRET"),
      redirect: pick(undefined, "GOOGLE_OAUTH_REDIRECT"),
    },
  };
}

/**
 * Model slugs for the Replicate-hosted GPU work. Swap these to change the
 * voice/avatar/image engine without touching pipeline code. Keep cost-effective
 * open models here — this is the whole "don't pay for the shilled stack" lever.
 */
export const MODELS = {
  // Zero-shot voice clone from a short reference clip.
  tts: "lucataco/xtts-v2:684bc3855b37866c0c65add2ff39c78f3dea3f4ff103a436465326e0f438d55e",
  // Audio-driven talking-head avatar from one portrait.
  avatar: "fofr/sonic:a2aad29ea95f19747a5ea22ab14fc6594654506e6cc7f1b21edf8d7e8a6e2d0e",
  // Cheap, fast, high-quality text-to-image for thumbnails + b-roll fill.
  image: "black-forest-labs/flux-schnell",
  // Transcription for burned-in captions.
  whisper: "openai/whisper:8099696689d249cf8b122d833c36ac3f75505c666a395ca40ef26f68e7d3d16e",
} as const;
