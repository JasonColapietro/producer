import { afterEach, describe, expect, it, vi } from "vitest";
import { channels, jobs, assets } from "../db/schema.js";

const dbState = vi.hoisted(() => ({
  job: null as any,
  channel: null as any,
  existingAssets: [] as any[],
  updates: [] as any[],
  inserts: [] as any[],
}));

vi.mock("../db/client.js", () => {
  function builder() {
    let mode: "jobs" | "channels" | "assets" | null = null;
    const self: any = {
      select: () => self,
      from: (table: unknown) => {
        mode = table === jobs ? "jobs" : table === channels ? "channels" : table === assets ? "assets" : null;
        return self;
      },
      where: () => self,
      limit: () => self,
      update: () => self,
      set: (patch: unknown) => {
        dbState.updates.push(patch);
        return self;
      },
      insert: () => self,
      values: (vals: unknown) => {
        dbState.inserts.push(vals);
        return Promise.resolve();
      },
      then: (resolve: (v: unknown) => void) => {
        if (mode === "jobs") resolve([dbState.job]);
        else if (mode === "channels") resolve([dbState.channel]);
        else if (mode === "assets") resolve(dbState.existingAssets);
        else resolve(undefined);
      },
    };
    return self;
  }
  return { db: () => builder() };
});

vi.mock("../config.js", () => ({
  resolveCreds: () => ({
    anthropicApiKey: "x",
    anthropicModel: "claude-fable-5",
    replicateApiToken: "x",
    pexelsApiKey: "x",
    pixabayApiKey: "x",
    kieApiKey: "kie-key",
    kieVideoModel: "bytedance/v1-lite-text-to-video",
    blobToken: "x",
    google: { clientId: "x", clientSecret: "x", redirect: "x" },
  }),
}));

const ONE_SCENE_SCRIPT = {
  title: "t",
  description: "d",
  tags: [],
  thumbnailPrompt: "thumb",
  scenes: [{ narration: "hello", brollKeywords: ["city"], visualPrompt: "a shot" }],
};

vi.mock("../providers/llm.js", () => ({ writeScript: vi.fn(async () => ONE_SCENE_SCRIPT) }));
vi.mock("../providers/tts.js", () => ({ synthesizeSpeech: vi.fn(async () => "https://x/audio.wav") }));
vi.mock("../providers/captions.js", () => ({ transcribeToSrt: vi.fn(async () => "1\n00:00:00,000 --> 00:00:01,000\nhello\n") }));
vi.mock("../providers/avatar.js", () => ({ animateAvatar: vi.fn() }));
vi.mock("../providers/lipsync.js", () => ({ syncLips: vi.fn() }));
vi.mock("../providers/publish.js", () => ({ uploadVideo: vi.fn() }));
vi.mock("../providers/storage.js", () => ({
  download: vi.fn(async (_url: string, dest: string) => dest),
  putBuffer: vi.fn(async () => "https://blob/script.json"),
  putFile: vi.fn(async () => "https://blob/final.mp4"),
}));
vi.mock("../assemble/shorts.js", () => ({ makeShort: vi.fn(async () => {}) }));

interface ClipArgs {
  visualPath: string;
  visualKind: string;
  audioPath: string;
  outPath: string;
  dims: unknown;
}
const buildSceneClip = vi.fn(async (_args: ClipArgs) => {});
vi.mock("../assemble/ffmpeg.js", () => ({
  LANDSCAPE: { w: 1920, h: 1080, fps: 30 },
  buildSceneClip: (args: ClipArgs) => buildSceneClip(args),
  concatClips: vi.fn(async () => {}),
  extractAudio: vi.fn(async () => {}),
  burnSubtitles: vi.fn(async () => {}),
}));

const generateSceneVideo = vi.fn(async (_creds: unknown, _prompt: string) => "https://cdn.kie.ai/x.mp4");
vi.mock("../providers/kie.js", () => ({
  generateSceneVideo: (creds: unknown, prompt: string) => generateSceneVideo(creds, prompt),
}));

const fetchBroll = vi.fn(async (_creds: unknown, _keywords: string[]) => null as { url: string; width: number; height: number; source: string } | null);
vi.mock("../providers/stock.js", () => ({
  fetchBroll: (creds: unknown, keywords: string[]) => fetchBroll(creds, keywords),
}));

const generateImage = vi.fn(async (_creds: unknown, _prompt: string, _ar?: string) => "https://x/still.jpg");
vi.mock("../providers/images.js", () => ({
  generateImage: (creds: unknown, prompt: string, ar?: string) => generateImage(creds, prompt, ar),
}));

const { processJob } = await import("./index.js");

function resetDb() {
  dbState.job = {
    id: "job-1",
    channelId: "chan-1",
    mode: "faceless",
    target: "download",
    status: "queued",
    stage: "ideate",
    topic: "test topic",
    title: null,
    description: null,
    options: {},
    error: null,
    attempts: 0,
    publishedVideoId: null,
    scheduledAt: null,
  };
  dbState.channel = {
    id: "chan-1",
    niche: "test",
    defaults: { voiceRefUrl: "https://x/ref.wav" },
    secrets: {},
  };
  dbState.existingAssets = [];
  dbState.updates = [];
  dbState.inserts = [];
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("processJob — scene visual fallback chain (adversarial)", () => {
  it("degrades to the Flux still when both Kie AND stock fail, instead of crashing the render", async () => {
    resetDb();
    generateSceneVideo.mockRejectedValue(new Error("Kie 500: internal error"));
    fetchBroll.mockRejectedValue(new TypeError("fetch failed: getaddrinfo ENOTFOUND api.pexels.com"));

    await expect(processJob("job-1")).resolves.toBeUndefined();

    const clipCall = buildSceneClip.mock.calls[0]![0];
    expect(clipCall.visualKind).toBe("image");
    expect(generateImage).toHaveBeenCalled();

    const finalStatus = dbState.updates.at(-1);
    expect(finalStatus).toMatchObject({ status: "completed" });
    expect(dbState.updates.some((u) => u.status === "failed")).toBe(false);
  });

  it("still prefers stock b-roll over Flux when Kie fails but stock succeeds (regression)", async () => {
    resetDb();
    generateSceneVideo.mockRejectedValue(new Error("Kie 500: internal error"));
    fetchBroll.mockResolvedValue({ url: "https://cdn/broll.mp4", width: 1920, height: 1080, source: "pexels" });

    await expect(processJob("job-1")).resolves.toBeUndefined();

    const clipCall = buildSceneClip.mock.calls[0]![0];
    expect(clipCall.visualKind).toBe("video");
    expect(dbState.inserts.some((v: any) => v.kind === "broll" && v.meta?.source === "pexels")).toBe(true);
    expect(dbState.updates.some((u) => u.status === "failed")).toBe(false);
  });

  it("falls through to the keyword prompt when the script's visualPrompt is an empty string", async () => {
    resetDb();
    dbState.job.options = { visuals: "stock" }; // force stock path irrelevant here; test targets the Kie prompt directly
    generateSceneVideo.mockResolvedValue("https://cdn.kie.ai/ok.mp4");
    fetchBroll.mockResolvedValue(null);

    const originalScenes = ONE_SCENE_SCRIPT.scenes[0]!.visualPrompt;
    ONE_SCENE_SCRIPT.scenes[0]!.visualPrompt = "   ";
    dbState.job.options = {};
    try {
      await processJob("job-1");
      expect(generateSceneVideo).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("city"),
      );
      expect(generateSceneVideo).not.toHaveBeenCalledWith(expect.anything(), "   ");
    } finally {
      ONE_SCENE_SCRIPT.scenes[0]!.visualPrompt = originalScenes;
    }
  });
});
