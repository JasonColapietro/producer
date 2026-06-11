import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";

export interface Dims {
  w: number;
  h: number;
  fps: number;
}
export const LANDSCAPE: Dims = { w: 1920, h: 1080, fps: 30 };
export const PORTRAIT: Dims = { w: 1080, h: 1920, fps: 30 };

function run(bin: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { cwd });
    let err = "";
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve(out || err) : reject(new Error(`${bin} exited ${code}:\n${err.slice(-2000)}`)),
    );
  });
}

/** Duration of a media file in seconds. */
export async function probeDuration(path: string): Promise<number> {
  const out = await run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    path,
  ]);
  const n = Number.parseFloat(out.trim());
  if (!Number.isFinite(n)) throw new Error(`ffprobe could not read duration of ${path}`);
  return n;
}

export type VisualKind = "video" | "image" | "avatar";

interface SceneClipArgs {
  visualPath: string;
  visualKind: VisualKind;
  audioPath: string;
  outPath: string;
  dims: Dims;
}

/**
 * One scene = a visual fitted to the exact length of its narration audio, with
 * that audio as the track. All scene clips are encoded identically so they can
 * be concatenated by stream-copy. Avatar clips already carry matching audio but
 * we re-attach the authoritative TTS track to guarantee uniform encoding + sync.
 */
export async function buildSceneClip(a: SceneClipArgs): Promise<void> {
  const { w, h, fps } = a.dims;
  const dur = await probeDuration(a.audioPath);
  const fit = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`;

  const args: string[] = ["-y"];
  let vfilter: string;
  if (a.visualKind === "image") {
    args.push("-loop", "1", "-i", a.visualPath);
    const frames = Math.ceil(dur * fps);
    // slow Ken Burns push-in so stills don't feel dead
    vfilter = `${fit},zoompan=z='min(zoom+0.0006,1.12)':d=${frames}:s=${w}x${h}:fps=${fps},format=yuv420p`;
  } else {
    args.push("-stream_loop", "-1", "-i", a.visualPath); // loop short b-roll to fill
    vfilter = `${fit},fps=${fps},format=yuv420p`;
  }
  args.push("-i", a.audioPath);
  args.push(
    "-t", dur.toFixed(3),
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-vf", vfilter,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(fps),
    "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "192k",
    "-shortest",
    a.outPath,
  );
  await run("ffmpeg", args);
}

/** Concatenate uniformly-encoded scene clips by stream copy. */
export async function concatClips(clipPaths: string[], outPath: string): Promise<void> {
  const dir = dirname(outPath);
  const listPath = `${outPath}.txt`;
  await writeFile(listPath, clipPaths.map((p) => `file '${basename(p)}'`).join("\n"));
  await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", basename(listPath), "-c", "copy", basename(outPath)], dir);
}

/** Pull the (already-concatenated) narration out for transcription. */
export async function extractAudio(videoPath: string, outPath: string): Promise<void> {
  await run("ffmpeg", ["-y", "-i", videoPath, "-vn", "-c:a", "aac", "-b:a", "160k", outPath]);
}

/** Burn SRT captions onto the body video. Runs with cwd=dir to dodge path escaping. */
export async function burnSubtitles(videoPath: string, srtPath: string, outPath: string): Promise<void> {
  const dir = dirname(videoPath);
  const style =
    "FontName=Arial,FontSize=22,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,MarginV=60";
  await run(
    "ffmpeg",
    [
      "-y",
      "-i", basename(videoPath),
      "-vf", `subtitles=${basename(srtPath)}:force_style='${style}'`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-c:a", "copy",
      basename(outPath),
    ],
    dir,
  );
}
