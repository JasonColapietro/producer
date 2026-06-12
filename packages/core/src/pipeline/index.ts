import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { resolveCreds } from "../config.js";
import { db } from "../db/client.js";
import { assets, channels, jobs, type AssetKind, type Job, type JobStage } from "../db/schema.js";
import { animateAvatar } from "../providers/avatar.js";
import { syncLips } from "../providers/lipsync.js";
import { transcribeToSrt } from "../providers/captions.js";
import { generateImage } from "../providers/images.js";
import { writeScript } from "../providers/llm.js";
import { fetchBroll } from "../providers/stock.js";
import { download, putBuffer, putFile } from "../providers/storage.js";
import { synthesizeSpeech } from "../providers/tts.js";
import { uploadVideo } from "../providers/publish.js";
import {
  buildSceneClip,
  burnSubtitles,
  concatClips,
  extractAudio,
  LANDSCAPE,
  type VisualKind,
} from "../assemble/ffmpeg.js";
import { makeShort } from "../assemble/shorts.js";

async function setJob(id: string, patch: Partial<Job>) {
  await db()
    .update(jobs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(jobs.id, id));
}

async function addAsset(jobId: string, kind: AssetKind, url: string, meta: Record<string, unknown> = {}) {
  await db().insert(assets).values({ jobId, kind, url, meta });
}

async function stage(id: string, s: JobStage) {
  await setJob(id, { stage: s });
}

/**
 * Full build for one job: script → per-scene voice + visuals → assemble →
 * captions → thumbnail. Honors the faceless/avatar toggle and the review gate.
 * Publishing happens here too unless the channel holds for manual approval.
 */
export async function processJob(jobId: string): Promise<void> {
  const rows = await db().select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  const job = rows[0];
  if (!job) throw new Error(`job ${jobId} not found`);

  const chRows = await db().select().from(channels).where(eq(channels.id, job.channelId)).limit(1);
  const channel = chRows[0];
  if (!channel) throw new Error(`channel ${job.channelId} not found`);

  const creds = resolveCreds(channel);
  const opts = { ...channel.defaults, ...job.options };
  const dims = LANDSCAPE;
  const dir = await mkdtemp(join(tmpdir(), `tf-${jobId}-`));

  try {
    await setJob(jobId, { status: "processing", attempts: job.attempts + 1, error: null });

    // ── Voiceover mode: script-first pass, then lipsync on resume ────────────
    if (job.mode === "voiceover") {
      const existingAssets = await db().select().from(assets).where(eq(assets.jobId, jobId));
      const audioAsset = existingAssets.find((a) => a.kind === "audio");

      if (!audioAsset) {
        // First pass: generate script, pause for the user to record audio.
        await stage(jobId, "script");
        const script = await writeScript(creds, {
          topic: job.topic,
          niche: opts.niche ?? channel.niche,
          persona: opts.persona,
          lengthMinutes: opts.lengthMinutes,
        });
        await addAsset(jobId, "script", await putBuffer(creds, `${jobId}/script.json`, JSON.stringify(script, null, 2), "application/json"));
        await setJob(jobId, { title: script.title, description: script.description, status: "needs_voiceover", stage: "voice" });
        return;
      }

      // Second pass: user has uploaded audio — lipsync + captions + done.
      const baseVideoUrl = opts.voiceoverVideoUrl ?? process.env.VOICEOVER_BASE_VIDEO_URL;
      if (!baseVideoUrl) throw new Error("No base video for lipsync (channel.defaults.voiceoverVideoUrl or VOICEOVER_BASE_VIDEO_URL)");

      await stage(jobId, "avatar");
      const syncedUrl = await syncLips(creds, baseVideoUrl, audioAsset.url);
      const syncedPath = join(dir, "synced.mp4");
      await download(syncedUrl, syncedPath);

      await stage(jobId, "captions");
      const srt = await transcribeToSrt(creds, audioAsset.url);
      const srtPath = join(dir, "captions.srt");
      await writeFile(srtPath, srt);
      const finalPath = join(dir, "final.mp4");
      await burnSubtitles(syncedPath, srtPath, finalPath);

      await stage(jobId, "thumbnail");
      const scriptAsset = existingAssets.find((a) => a.kind === "script");
      const scriptData = scriptAsset ? JSON.parse(await (await fetch(scriptAsset.url)).text()) : null;
      const thumbPrompt = scriptData?.thumbnailPrompt ?? `${job.title ?? job.topic}, cinematic`;
      const thumbUrl = await generateImage(creds, thumbPrompt, "16:9");
      await addAsset(jobId, "thumbnail", thumbUrl);

      const finalUrl = await putFile(creds, `${jobId}/final.mp4`, finalPath);
      await addAsset(jobId, "final", finalUrl);

      if (job.target === "download") {
        await setJob(jobId, { status: "completed", stage: "done" });
      } else if (opts.reviewGate) {
        await setJob(jobId, { status: "needs_review", stage: "publish" });
      } else {
        await publishJob(jobId, finalPath);
      }
      return;
    }

    // 1) Script (faceless / avatar modes)
    await stage(jobId, "script");
    const script = await writeScript(creds, {
      topic: job.topic,
      niche: opts.niche ?? channel.niche,
      persona: opts.persona,
      lengthMinutes: opts.lengthMinutes,
    });
    await addAsset(jobId, "script", await putBuffer(creds, `${jobId}/script.json`, JSON.stringify(script, null, 2), "application/json"));
    await setJob(jobId, { title: script.title, description: script.description });

    const voiceRef = opts.voiceRefUrl ?? process.env.STOCK_VOICE_REF_URL;
    if (!voiceRef) throw new Error("No voice reference (channel.defaults.voiceRefUrl or STOCK_VOICE_REF_URL)");
    const avatarImg = opts.avatarImageUrl;
    const heroScenes = job.mode === "avatar" && avatarImg ? new Set([0, script.scenes.length - 1]) : new Set<number>();

    // 2) Per scene: voice + visual → uniform clip
    const clipPaths: string[] = [];
    for (let i = 0; i < script.scenes.length; i++) {
      const scene = script.scenes[i]!;
      await stage(jobId, heroScenes.has(i) ? "avatar" : i === 0 ? "voice" : "visuals");

      const audioUrl = await synthesizeSpeech(creds, scene.narration, voiceRef);
      const audioPath = join(dir, `a${i}.wav`);
      await download(audioUrl, audioPath);

      let visualPath: string;
      let visualKind: VisualKind;
      if (heroScenes.has(i) && avatarImg) {
        const vid = await animateAvatar(creds, avatarImg, audioUrl);
        visualPath = join(dir, `v${i}.mp4`);
        await download(vid, visualPath);
        visualKind = "avatar";
      } else {
        const broll = await fetchBroll(creds, scene.brollKeywords);
        if (broll) {
          visualPath = join(dir, `v${i}.mp4`);
          await download(broll.url, visualPath);
          visualKind = "video";
          await addAsset(jobId, "broll", broll.url, { keywords: scene.brollKeywords, source: broll.source });
        } else {
          const img = await generateImage(creds, `${scene.brollKeywords.join(", ")}, cinematic, high detail`);
          visualPath = join(dir, `v${i}.jpg`);
          await download(img, visualPath);
          visualKind = "image";
        }
      }

      const clip = join(dir, `clip${String(i).padStart(3, "0")}.mp4`);
      await buildSceneClip({ visualPath, visualKind, audioPath, outPath: clip, dims });
      clipPaths.push(clip);
    }

    // 3) Assemble body
    await stage(jobId, "assemble");
    const bodyPath = join(dir, "body.mp4");
    await concatClips(clipPaths, bodyPath);

    // 4) Captions (transcribe the concatenated narration, burn it on)
    await stage(jobId, "captions");
    const narrationPath = join(dir, "narration.m4a");
    await extractAudio(bodyPath, narrationPath);
    const narrationUrl = await putFile(creds, `${jobId}/narration.m4a`, narrationPath);
    const srt = await transcribeToSrt(creds, narrationUrl);
    const srtPath = join(dir, "captions.srt");
    await writeFile(srtPath, srt);
    const finalPath = join(dir, "final.mp4");
    await burnSubtitles(bodyPath, srtPath, finalPath);

    // 5) Thumbnail
    await stage(jobId, "thumbnail");
    const thumbUrl = await generateImage(creds, script.thumbnailPrompt, "16:9");
    await addAsset(jobId, "thumbnail", thumbUrl);

    // 6) Persist final
    const finalUrl = await putFile(creds, `${jobId}/final.mp4`, finalPath);
    await addAsset(jobId, "final", finalUrl, { tags: script.tags });

    // 6b) Best-effort vertical Short for Reels/TikTok — CPU-cheap, never blocks the job.
    try {
      const shortPath = join(dir, "short.mp4");
      await makeShort(finalPath, shortPath, { maxSeconds: 50 });
      await addAsset(jobId, "short", await putFile(creds, `${jobId}/short.mp4`, shortPath));
    } catch (e) {
      console.warn(`[pipeline] short skipped for ${jobId}:`, e instanceof Error ? e.message : e);
    }

    // Finalize. Manual-upload target stops at "completed" — the MP4 is in Blob,
    // ready to download. Only the youtube target touches the Data API.
    if (job.target === "download") {
      await setJob(jobId, { status: "completed", stage: "done" });
      return;
    }
    if (opts.reviewGate) {
      await setJob(jobId, { status: "needs_review", stage: "publish" });
      return;
    }
    await publishJob(jobId, finalPath);
  } catch (e) {
    await setJob(jobId, { status: "failed", error: e instanceof Error ? e.message : String(e) });
    throw e;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Upload a built job to YouTube. If `localFinalPath` is omitted (e.g. publishing
 * an approved job in a fresh worker run) the final asset is pulled from Blob.
 */
export async function publishJob(jobId: string, localFinalPath?: string): Promise<string> {
  const job = (await db().select().from(jobs).where(eq(jobs.id, jobId)).limit(1))[0];
  if (!job) throw new Error(`job ${jobId} not found`);
  const channel = (await db().select().from(channels).where(eq(channels.id, job.channelId)).limit(1))[0];
  if (!channel?.youtubeRefreshToken) throw new Error("channel has no YouTube refresh token");
  const creds = resolveCreds(channel);

  await setJob(jobId, { status: "publishing", stage: "publish" });

  let path = localFinalPath;
  let tmp: string | undefined;
  if (!path) {
    const finalAsset = (await db().select().from(assets).where(eq(assets.jobId, jobId)))
      .filter((a) => a.kind === "final")
      .at(-1);
    if (!finalAsset) throw new Error("no final asset to publish");
    tmp = join(tmpdir(), `tf-pub-${jobId}.mp4`);
    await download(finalAsset.url, tmp);
    path = tmp;
  }

  try {
    const videoId = await uploadVideo(creds, channel.youtubeRefreshToken, {
      filePath: path,
      title: job.title ?? job.topic,
      description: job.description ?? "",
      tags: [],
      privacy: job.options.privacy ?? "private",
      publishAt: job.scheduledAt ? job.scheduledAt.toISOString() : undefined,
    });
    await setJob(jobId, { status: "published", stage: "done", publishedVideoId: videoId });
    return videoId;
  } finally {
    if (tmp) await rm(tmp, { force: true });
  }
}
