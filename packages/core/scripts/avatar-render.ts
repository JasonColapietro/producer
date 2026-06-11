// CLONE-YOUR-FACE renderer — needs only ANTHROPIC + REPLICATE (no DB/Blob).
// Claude writes the script, XTTS speaks it in your voice, SadTalker animates your
// face, ffmpeg assembles. Reference face + voice are uploaded straight to Replicate.
//   ANTHROPIC_API_KEY=... REPLICATE_API_TOKEN=... \
//   FACE=out/likeness/faces/v1_06.png VOICE=out/likeness/voice-v1-00m30.wav \
//   pnpm exec tsx packages/core/scripts/avatar-render.ts "<topic>"
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Creds } from "../src/config.js";
import { writeScript } from "../src/providers/llm.js";
import { synthesizeSpeech } from "../src/providers/tts.js";
import { animateAvatar } from "../src/providers/avatar.js";

const HERE = dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(join(HERE, "../../../.env"));
} catch {
  /* env from process */
}

const FACE = process.env.FACE;
const VOICE = process.env.VOICE;
const SCENES = Number(process.env.SCENES ?? 3); // cap for a cheap first test
const topic = process.argv[2] ?? "Why Suede Labs AI lets musicians own their sound like a tech company owns its code";

for (const [k, v] of Object.entries({ ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN, FACE, VOICE })) {
  if (!v) {
    console.error(`Missing ${k}. Set FACE=<portrait.png> VOICE=<voice.wav> + the two API keys.`);
    process.exit(1);
  }
}

const creds = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
  replicateApiToken: process.env.REPLICATE_API_TOKEN!,
  pexelsApiKey: "x",
  pixabayApiKey: "x",
  blobToken: "x",
  google: { clientId: "x", clientSecret: "x", redirect: "x" },
} satisfies Creds;

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((res, rej) => {
    const p = spawn(bin, args);
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", rej);
    p.on("close", (c) => (c === 0 ? res() : rej(new Error(`${bin} exit ${c}: ${err.slice(-600)}`))));
  });
}

async function probe(path: string): Promise<number> {
  let out = "";
  await new Promise<void>((res) => {
    const p = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", path]);
    p.stdout.on("data", (d) => (out += d));
    p.on("close", () => res());
  });
  return Number.parseFloat(out.trim()) || 5;
}

async function download(url: string, dest: string): Promise<void> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${r.status}`);
  await writeFile(dest, Buffer.from(await r.arrayBuffer()));
}

/** Upload a local file to Replicate's file store, return its served URL. */
async function uploadToReplicate(path: string, name: string, type: string): Promise<string> {
  const fd = new FormData();
  fd.append("content", new Blob([await readFile(path)], { type }), name);
  const r = await fetch("https://api.replicate.com/v1/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.replicateApiToken}` },
    body: fd,
  });
  if (!r.ok) throw new Error(`replicate upload ${r.status}: ${await r.text()}`);
  return (await r.json()).urls.get as string;
}

console.log(`\n🧠 script (${creds.anthropicModel})…`);
const script = await writeScript(creds, {
  topic,
  niche: "creator-ownership / programmable IP for musicians",
  persona: "confident, declarative founder voice — plain language, no hedging",
  lengthMinutes: 2,
});
const scenes = script.scenes.slice(0, SCENES);
console.log(`   "${script.title}" — using ${scenes.length}/${script.scenes.length} scenes`);

console.log("⬆️  uploading your face + voice to Replicate…");
const faceUrl = await uploadToReplicate(FACE!, "face.png", "image/png");
const voiceUrl = await uploadToReplicate(VOICE!, "voice.wav", "audio/wav");

const dir = await mkdtemp(join(tmpdir(), "tf-avatar-"));
const clips: string[] = [];
for (let i = 0; i < scenes.length; i++) {
  const scene = scenes[i]!;
  console.log(`🗣️  scene ${i + 1}/${scenes.length}: cloning voice…`);
  const audioUrl = await synthesizeSpeech(creds, scene.narration, voiceUrl);
  const audioPath = join(dir, `a${i}.wav`);
  await download(audioUrl, audioPath);

  console.log(`🙂 scene ${i + 1}/${scenes.length}: animating your face…`);
  const vidUrl = await animateAvatar(creds, faceUrl, audioUrl);
  const rawVid = join(dir, `r${i}.mp4`);
  await download(vidUrl, rawVid);

  // normalize to 1080x1920 with the authoritative cloned-voice audio
  const clip = join(dir, `c${String(i).padStart(2, "0")}.mp4`);
  const dur = await probe(audioPath);
  await run("ffmpeg", [
    "-y", "-i", rawVid, "-i", audioPath, "-t", dur.toFixed(2),
    "-filter_complex", "[0:v]scale=1080:-2,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x140A1F,setsar=1,fps=30[v]",
    "-map", "[v]", "-map", "1:a",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-ar", "44100", "-ac", "2", "-shortest", clip,
  ]);
  clips.push(clip);
}

console.log("🧵 stitching…");
const outDir = join(HERE, "../../../out");
await mkdir(outDir, { recursive: true });
const list = join(dir, "list.txt");
await writeFile(list, clips.map((c) => `file '${c}'`).join("\n"));
const outPath = join(outDir, "suede-avatar.mp4");
await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", outPath]);

const total = await probe(outPath);
const mb = (await stat(outPath)).size / 1_000_000;
console.log(`\n✅ ${outPath}\n   ${total.toFixed(1)}s · ${mb.toFixed(1)} MB · YOUR face + YOUR voice\n`);
process.exit(0);
