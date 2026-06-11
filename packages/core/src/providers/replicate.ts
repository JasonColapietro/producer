/**
 * Minimal Replicate client — create a prediction, poll to completion.
 * No SDK dependency; works identically on Vercel functions and the Render worker.
 * This is the only place we touch a GPU, and we pay strictly per second.
 */
const BASE = "https://api.replicate.com/v1";

interface Prediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: unknown;
  error: string | null;
  urls: { get: string };
}

async function http(token: string, url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait", // let Replicate hold the connection briefly for fast models
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Replicate ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as Prediction;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run a model to completion and return its output.
 * @param model "owner/name" for official models, or "owner/name:version" for pinned versions.
 */
export async function runReplicate(
  token: string,
  model: string,
  input: Record<string, unknown>,
  { timeoutMs = 10 * 60_000 } = {},
): Promise<unknown> {
  const [name, version] = model.split(":");
  const create = version
    ? await http(token, `${BASE}/predictions`, {
        method: "POST",
        body: JSON.stringify({ version, input }),
      })
    : await http(token, `${BASE}/models/${name}/predictions`, {
        method: "POST",
        body: JSON.stringify({ input }),
      });

  let pred = create;
  const deadline = Date.now() + timeoutMs;
  while (pred.status === "starting" || pred.status === "processing") {
    if (Date.now() > deadline) throw new Error(`Replicate timeout for ${model}`);
    await sleep(1500);
    pred = await http(token, pred.urls.get);
  }
  if (pred.status !== "succeeded") {
    throw new Error(`Replicate ${model} ${pred.status}: ${pred.error ?? "unknown"}`);
  }
  return pred.output;
}

/** Many models return a URL or array of URLs — normalize to the first string. */
export function firstUrl(output: unknown): string {
  if (typeof output === "string") return output;
  if (Array.isArray(output) && typeof output[0] === "string") return output[0];
  if (output && typeof output === "object" && "audio" in output) {
    const a = (output as { audio: unknown }).audio;
    if (typeof a === "string") return a;
  }
  throw new Error(`Unexpected Replicate output shape: ${JSON.stringify(output).slice(0, 200)}`);
}
