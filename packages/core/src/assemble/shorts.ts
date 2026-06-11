import { spawn } from "node:child_process";

/** Output dimensions for a 9:16 vertical short. */
const SHORT_W = 1080;
const SHORT_H = 1920;

/** Default maximum clip length in seconds. */
const DEFAULT_MAX_SECONDS = 50;

/** Mirror of the private run() in ffmpeg.ts — not exported from there so we own one here. */
function run(bin: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { cwd });
    let err = "";
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0
        ? resolve(out || err)
        : reject(new Error(`${bin} exited ${code}:\n${err.slice(-2000)}`)),
    );
  });
}

/**
 * Convert a landscape (16:9) master MP4 into a 1080×1920 vertical short suitable
 * for Reels, YouTube Shorts, and TikTok.
 *
 * Filtergraph overview:
 *   [bg]  — source scaled to FILL 1080×1920 (overscale then crop), then heavily
 *           gaussian-blurred so there are no black bars and no jarring edges.
 *   [fg]  — source scaled to width 1080, keeping the original 16:9 aspect ratio,
 *           then centered over the blurred background.
 *   The two streams are composited with overlay, producing a "blurred letterbox"
 *   look that is standard on all short-form platforms.
 *
 * @param inputVideoPath  Absolute path to the finished landscape MP4.
 * @param outPath         Absolute path for the output vertical MP4.
 * @param opts.maxSeconds Trim the output to this many seconds from the start (default 50).
 */
export async function makeShort(
  inputVideoPath: string,
  outPath: string,
  opts?: { maxSeconds?: number },
): Promise<void> {
  const maxSeconds = opts?.maxSeconds ?? DEFAULT_MAX_SECONDS;

  // ── Filtergraph ──────────────────────────────────────────────────────────────
  //
  // [0:v] is used twice so we split it into [src0] and [src1].
  //
  // Background path  ([bg]):
  //   scale to COVER 1080×1920 using force_original_aspect_ratio=increase, then
  //   crop the center 1080×1920, apply a strong gblur (sigma=40) to produce the
  //   blurred bokeh background that fills every pixel without black bars.
  //
  // Foreground path  ([fg]):
  //   scale the source to exactly 1080 px wide, letting the height follow the
  //   natural 16:9 ratio (→ 607 px tall). The resulting sub-frame sits centered
  //   on the 1920-tall canvas, bordered above and below by the blurred background.
  //
  // Overlay:
  //   x = 0  (fg already fills the full width)
  //   y = (SHORT_H - fg_height) / 2  — we compute this dynamically via the
  //   overlay expression  y=(H-h)/2  so it works regardless of rounding.

  const fgHeight = Math.round((SHORT_W * 9) / 16); // 607 px for 1080 wide
  void fgHeight; // computed above for doc clarity; overlay uses H/h expression

  const filterComplex = [
    // Split input video into two identical streams
    `[0:v]split=2[src0][src1]`,

    // Build blurred background: scale to cover, crop center, blur
    `[src0]scale=${SHORT_W}:${SHORT_H}:force_original_aspect_ratio=increase,` +
      `crop=${SHORT_W}:${SHORT_H},` +
      `gblur=sigma=40,` +
      `setsar=1` +
      `[bg]`,

    // Build foreground: scale to target width, keep 16:9 aspect, set SAR
    `[src1]scale=${SHORT_W}:-2,setsar=1[fg]`,

    // Composite: fg centered horizontally and vertically over bg
    `[bg][fg]overlay=x=0:y=(H-h)/2,format=yuv420p[out]`,
  ].join(";");

  const args: string[] = [
    "-y",
    // Trim input from the start — placing -t before -i is fastest (input seek)
    "-t", String(maxSeconds),
    "-i", inputVideoPath,
    "-filter_complex", filterComplex,
    // Map composited video and original audio
    "-map", "[out]",
    "-map", "0:a:0",
    // Video encoding — match ffmpeg.ts encoder flags
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-r", "30",
    // Audio encoding — match ffmpeg.ts encoder flags
    "-c:a", "aac",
    "-ar", "44100",
    "-ac", "2",
    "-b:a", "192k",
    // Stop as soon as the shorter stream ends (guards against audio overrun)
    "-shortest",
    outPath,
  ];

  await run("ffmpeg", args);
}
