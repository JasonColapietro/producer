import { afterEach, describe, expect, it, vi } from "vitest";
import type { Creds } from "../config.js";
import { generateSceneVideo, pickUrl } from "./kie.js";

const creds = {
  kieApiKey: "test-key",
  kieVideoModel: "test/model",
} as Creds;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** Run the generator against fake timers, advancing through the poll sleeps. */
async function withFakePolling<T>(fn: () => Promise<T>): Promise<T> {
  vi.useFakeTimers();
  const p = fn();
  // swallow rejections until we await, so a failing poll doesn't go unhandled
  p.catch(() => {});
  await vi.advanceTimersByTimeAsync(60_000);
  vi.useRealTimers();
  return p;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("pickUrl", () => {
  it("parses a resultJson string with resultUrls", () => {
    expect(pickUrl(JSON.stringify({ resultUrls: ["https://cdn.kie.ai/a.mp4"] }))).toBe(
      "https://cdn.kie.ai/a.mp4",
    );
  });

  it("accepts an already-parsed object", () => {
    expect(pickUrl({ resultUrls: ["https://cdn.kie.ai/b.mp4"] })).toBe("https://cdn.kie.ai/b.mp4");
  });

  it("returns null for empty/missing urls", () => {
    expect(pickUrl(undefined)).toBeNull();
    expect(pickUrl(JSON.stringify({ resultUrls: [] }))).toBeNull();
    expect(pickUrl(JSON.stringify({ other: true }))).toBeNull();
  });
});

describe("generateSceneVideo", () => {
  it("throws without a key", async () => {
    await expect(
      generateSceneVideo({ ...creds, kieApiKey: undefined } as Creds, "a shot"),
    ).rejects.toThrow(/Kie\.ai key missing/);
  });

  it("creates a task on the unified endpoint and polls to success", async () => {
    const calls: string[] = [];
    let polls = 0;
    vi.stubGlobal("fetch", async (url: string | URL) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("/api/v1/jobs/createTask")) {
        return jsonResponse({ code: 200, data: { taskId: "t-1" } });
      }
      polls += 1;
      return jsonResponse({
        code: 200,
        data:
          polls < 2
            ? { state: "generating" }
            : { state: "success", resultJson: JSON.stringify({ resultUrls: ["https://cdn.kie.ai/out.mp4"] }) },
      });
    });

    const url = await withFakePolling(() =>
      generateSceneVideo(creds, "slow dolly-in on a lighthouse at dusk"),
    );
    expect(url).toBe("https://cdn.kie.ai/out.mp4");
    expect(calls[0]).toContain("/api/v1/jobs/createTask");
    expect(calls.at(-1)).toContain("/api/v1/jobs/recordInfo?taskId=t-1");
  });

  it("routes veo models to the dedicated endpoint", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string | URL) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("/api/v1/veo/generate")) {
        return jsonResponse({ code: 200, data: { taskId: "t-veo" } });
      }
      return jsonResponse({
        code: 200,
        data: { successFlag: 1, response: { resultUrls: ["https://cdn.kie.ai/veo.mp4"] } },
      });
    });

    const url = await withFakePolling(() =>
      generateSceneVideo({ ...creds, kieVideoModel: "veo3_fast" } as Creds, "shot"),
    );
    expect(url).toBe("https://cdn.kie.ai/veo.mp4");
    expect(calls[0]).toContain("/api/v1/veo/generate");
    expect(calls.at(-1)).toContain("/api/v1/veo/record-info?taskId=t-veo");
  });

  it("surfaces a task failure message", async () => {
    let created = false;
    vi.stubGlobal("fetch", async (url: string | URL) => {
      if (!created && String(url).includes("createTask")) {
        created = true;
        return jsonResponse({ code: 200, data: { taskId: "t-2" } });
      }
      return jsonResponse({ code: 200, data: { state: "fail", failMsg: "flagged prompt" } });
    });

    await expect(withFakePolling(() => generateSceneVideo(creds, "shot"))).rejects.toThrow(
      /flagged prompt/,
    );
  });

  it("throws on a non-200 Kie envelope code", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({ code: 402, msg: "insufficient credits" }));
    await expect(generateSceneVideo(creds, "shot")).rejects.toThrow(/insufficient credits/);
  });

  it("throws on a 429 rate-limit response instead of hanging or crashing the process", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response("Too Many Requests", {
          status: 429,
          headers: { "Content-Type": "text/plain" },
        }),
    );
    await expect(generateSceneVideo(creds, "shot")).rejects.toThrow(/Kie 429/);
  });

  it("throws a bounded error instead of an unhandled rejection when the body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response("<html>502 Bad Gateway</html>", { status: 502 }),
    );
    await expect(generateSceneVideo(creds, "shot")).rejects.toThrow(/Kie 502/);
  });

  it("propagates a network-level failure (e.g. DNS/connection error) rather than hanging", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed: getaddrinfo ENOTFOUND api.kie.ai");
    });
    await expect(generateSceneVideo(creds, "shot")).rejects.toThrow(/ENOTFOUND/);
  });

  it("wires a bounded per-request timeout so a hung connection aborts instead of blocking forever", async () => {
    // AbortSignal.timeout() uses a native timer vitest's fake timers can't advance,
    // so we substitute a controllable signal to deterministically simulate the timeout firing.
    const controller = new AbortController();
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    vi.stubGlobal("fetch", (_url: string | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("This operation was aborted", "AbortError"));
        });
      });
    });

    const p = generateSceneVideo(creds, "shot");
    p.catch(() => {});
    expect(timeoutSpy).toHaveBeenCalledWith(30_000);
    controller.abort();
    await expect(p).rejects.toThrow(/aborted/i);
  });
});
