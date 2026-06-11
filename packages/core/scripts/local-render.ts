// FULLY OFFLINE renderer — proves an end-to-end video with NO paid services.
// Claude writes the script (Anthropic key), macOS `say` voices it, PIL renders
// kinetic text cards, ffmpeg muxes + stitches. Demo path (real pipeline uses
// XTTS voice + stock b-roll); exists to make a watchable MP4 today.
//   ANTHROPIC_API_KEY=... pnpm exec tsx packages/core/scripts/local-render.ts "<topic>"
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Creds } from "../src/config.js";
import { writeScript } from "../src/providers/llm.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CARD_PY = join(HERE, "scene_card.py");

try {
  process.loadEnvFile(join(HERE, "../../../.env"));
} catch {
  /* rely on process.env */
}

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((res, rej) => {
    const p = spawn(bin, args);
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", rej);
    p.on("close", (c) => (c === 0 ? res(err) : rej(new Error(`${bin} exit ${c}: ${err.slice(-700)}`))));
  });
}

async function probe(path: string): Promise<number> {
  let out = "";
  await new Promise<void>((res, rej) => {
    const p = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", path]);
    p.stdout.on("data", (d) => (out += d));
    p.on("close", () => res());
    p.on("error", rej);
  });
  return Number.parseFloat(out.trim()) || 3;
}

const topic = process.argv[2] ?? "What Suede Labs AI is and why creator-owned, programmable IP matters for musicians";
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Set ANTHROPIC_API_KEY");
  process.exit(1);
}

const creds = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
  replicateApiToken: "x",
  pexelsApiKey: "x",
  pixabayApiKey: "x",
  blobToken: "x",
  google: { clientId: "x", clientSecret: "x", redirect: "x" },
} satisfies Creds;

console.log(`\n🧠 writing script (${creds.anthropicModel})…`);
const script = await writeScript(creds, {
  topic,
  niche: "creator-ownership / programmable IP infrastructure for musicians",
  persona: "a confident, declarative narrator — never hedging; plain musician language",
  lengthMinutes: 4,
});
console.log(`   "${script.title}" — ${script.scenes.length} scenes`);

const dir = await mkdtemp(join(tmpdir(), "tf-local-"));
const clips: string[] = [];

for (let i = 0; i < script.scenes.length; i++) {
  const scene = script.scenes[i]!;
  const aiff = join(dir, `a${i}.aiff`);
  const png = join(dir, `s${i}.png`);
  const clip = join(dir, `c${String(i).padStart(2, "0")}.mp4`);

  await run("say", ["-r", "182", "-o", aiff, scene.narration]);
  const dur = await probe(aiff);
  await run("python3", [CARD_PY, png, scene.brollKeywords.join("  ·  ").toUpperCase(), scene.narration, "SUEDE LABS AI"]);
  await run("ffmpeg", [
    "-y", "-loop", "1", "-i", png, "-i", aiff, "-t", dur.toFixed(2),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-ar", "44100", "-ac", "2", "-shortest", clip,
  ]);
  clips.push(clip);
  console.log(`🎬 scene ${i + 1}/${script.scenes.length} (${dur.toFixed(1)}s) ✓`);
}

console.log("🧵 stitching…");
const outDir = join(HERE, "../../../out");
await mkdir(outDir, { recursive: true });
const listFile = join(dir, "list.txt");
await writeFile(listFile, clips.map((c) => `file '${c}'`).join("\n"));
const outPath = join(outDir, "suede-labs-ai.mp4");
await run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", outPath]);

const total = await probe(outPath);
const size = (await stat(outPath)).size / 1_000_000;
console.log(`\n✅ ${outPath}`);
console.log(`   ${total.toFixed(1)}s · ${size.toFixed(1)} MB · ${script.scenes.length} scenes · 1920x1080\n`);
process.exit(0);
