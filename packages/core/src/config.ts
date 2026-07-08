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
  /** Kie.ai key — unlocks generative AI video scenes. Optional: without it the
   * pipeline silently uses stock B-roll, so faceless mode still works keyless. */
  kieApiKey?: string;
  /** Kie.ai model id for scene video. Swap via KIE_VIDEO_MODEL. */
  kieVideoModel: string;
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

const GOOGLE_ENV_KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_OAUTH_REDIRECT",
] as const;

export function hasGoogleConfig(): boolean {
  return GOOGLE_ENV_KEYS.every((key) => Boolean(process.env[key]?.trim()));
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
    kieApiKey: s.kieApiKey ?? process.env.KIE_API_KEY ?? undefined,
    kieVideoModel: process.env.KIE_VIDEO_MODEL ?? KIE_DEFAULT_VIDEO_MODEL,
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
/**
 * Default Kie.ai model for generative scene video. Chosen for best
 * quality-per-dollar on short 720p B-roll clips. Override with KIE_VIDEO_MODEL.
 */
export const KIE_DEFAULT_VIDEO_MODEL = "veo3_fast"; // placeholder — finalized below

// Verified live on replicate.com (Jun 2026). Swap these to change the engine.
export const MODELS = {
  // Zero-shot voice clone from a short reference clip. Input: text, speaker(url), language, cleanup_voice.
  tts: "lucataco/xtts-v2:684bc3855b37866c0c65add2ff39c78f3dea3f4ff103a436465326e0f438d55e",
  // Audio-driven talking-head from one portrait. Input: source_image(url), driven_audio(url).
  // NOTE: fofr/sonic does NOT exist — sadtalker is the verified image+audio→video model.
  avatar: "cjwbw/sadtalker:a519cc0cfebaaeade068b23899165a11ec76aaa1d2b313d40d214f204ec957a3",
  // Cheap, fast text-to-image for thumbnails + b-roll fill. Official model — no version hash needed.
  image: "black-forest-labs/flux-schnell",
  // Transcription for burned-in captions. Returns segments[] with start/end/text.
  whisper: "openai/whisper:8099696689d249cf8b122d833c36ac3f75505c666a395ca40ef26f68e7d3d16e",
  // Lip-sync existing footage to new audio. Input: video(url), audio(url). Much cheaper than SadTalker.
  lipsync: "bytedance/latentsync:637ce191f5e68621a4f1a7e3e938c6bce8da73f4",
} as const;
