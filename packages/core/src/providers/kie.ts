/**
 * Kie.ai — generative AI video for scene visuals, billed per clip in cents.
 * Minimal client, no SDK: create a task, poll to completion, return the MP4 URL.
 *
 * Two API surfaces:
 *  - Unified marketplace: POST /api/v1/jobs/createTask (model string in body)
 *  - Veo dedicated:       POST /api/v1/veo/generate    (model "veo3" | "veo3_fast")
 * We route by model id so KIE_VIDEO_MODEL can point at either.
 */
import type { Creds } from "../config.js";

const BASE = "https://api.kie.ai";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface KieEnvelope<T> {
  code: number;
  msg?: string;
  data?: T;
}

async function http<T>(key: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => null)) as KieEnvelope<T> | null;
  if (!res.ok || !body || body.code !== 200) {
    throw new Error(`Kie ${res.status}: ${body?.msg ?? (body ? JSON.stringify(body).slice(0, 300) : "bad response")}`);
  }
  return body.data as T;
}

export interface SceneVideoOptions {
  /** "16:9" (default) or "9:16". */
  aspectRatio?: "16:9" | "9:16";
  /** Output resolution for marketplace models (Seedance et al). */
  resolution?: "480p" | "720p" | "1080p";
  /** Clip length in seconds — a string per the unified API schema. */
  duration?: "5" | "10";
  /** Poll timeout — video gen can take a few minutes. */
  timeoutMs?: number;
}

function isVeo(model: string): boolean {
  return model.startsWith("veo");
}

/** Extract result URLs from the various shapes Kie returns. Exported for tests. */
export function pickUrl(resultJson: unknown): string | null {
  if (!resultJson) return null;
  const parsed = typeof resultJson === "string" ? (JSON.parse(resultJson) as unknown) : resultJson;
  if (parsed && typeof parsed === "object") {
    const urls = (parsed as { resultUrls?: unknown }).resultUrls;
    if (Array.isArray(urls) && typeof urls[0] === "string") return urls[0];
  }
  return null;
}

/**
 * Generate one short scene clip from a text prompt. Returns a URL to the MP4.
 * Throws on failure/timeout — the pipeline catches and falls back to stock.
 */
export async function generateSceneVideo(
  creds: Creds,
  prompt: string,
  { aspectRatio = "16:9", resolution = "720p", duration = "5", timeoutMs = 10 * 60_000 }: SceneVideoOptions = {},
): Promise<string> {
  const key = creds.kieApiKey;
  if (!key) throw new Error("Kie.ai key missing (channel secret kieApiKey or env KIE_API_KEY)");
  const model = creds.kieVideoModel;
  const deadline = Date.now() + timeoutMs;

  if (isVeo(model)) {
    // ── Dedicated Veo endpoint ──────────────────────────────────────────────
    const created = await http<{ taskId: string }>(key, "/api/v1/veo/generate", {
      method: "POST",
      // aspect_ratio per current docs; aspectRatio kept for the legacy schema.
      body: JSON.stringify({ model, prompt, aspect_ratio: aspectRatio, aspectRatio, enableFallback: true }),
    });
    for (;;) {
      if (Date.now() > deadline) throw new Error(`Kie ${model} timeout`);
      await sleep(15_000);
      const rec = await http<{
        successFlag: number;
        errorMessage?: string | null;
        response?: { resultUrls?: string[] };
      }>(key, `/api/v1/veo/record-info?taskId=${encodeURIComponent(created.taskId)}`);
      if (rec.successFlag === 1) {
        const url = rec.response?.resultUrls?.[0];
        if (!url) throw new Error(`Kie ${model} succeeded but returned no URL`);
        return url;
      }
      if (rec.successFlag === 2 || rec.successFlag === 3) {
        throw new Error(`Kie ${model} failed: ${rec.errorMessage ?? "unknown"}`);
      }
    }
  }

  // ── Unified marketplace endpoint ──────────────────────────────────────────
  const created = await http<{ taskId: string }>(key, "/api/v1/jobs/createTask", {
    method: "POST",
    body: JSON.stringify({ model, input: { prompt, aspect_ratio: aspectRatio, resolution, duration } }),
  });
  for (;;) {
    if (Date.now() > deadline) throw new Error(`Kie ${model} timeout`);
    await sleep(15_000);
    const rec = await http<{
      state: "waiting" | "queuing" | "generating" | "success" | "fail";
      failMsg?: string | null;
      resultJson?: string;
    }>(key, `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(created.taskId)}`);
    if (rec.state === "success") {
      const url = pickUrl(rec.resultJson);
      if (!url) throw new Error(`Kie ${model} succeeded but returned no URL`);
      return url;
    }
    if (rec.state === "fail") {
      throw new Error(`Kie ${model} failed: ${rec.failMsg ?? "unknown"}`);
    }
  }
}
