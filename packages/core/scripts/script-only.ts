// Stage-1 only: generate the video SCRIPT (title, description, tags, scenes).
// Needs ONLY an Anthropic key — no DB, no ffmpeg, no Replicate. Proves the brain.
//   ANTHROPIC_API_KEY=sk-ant-... pnpm exec tsx packages/core/scripts/script-only.ts "<topic>"
import type { Creds } from "../src/config.js";
import { writeScript } from "../src/providers/llm.js";

try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url));
} catch {
  /* no .env — rely on process.env */
}

const topic = process.argv[2];
if (!topic) {
  console.error('Usage: tsx script-only.ts "<topic>"');
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Set ANTHROPIC_API_KEY (env or .env).");
  process.exit(1);
}

// writeScript only touches the anthropic fields; fill the rest with placeholders.
const creds = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
  replicateApiToken: "unused",
  pexelsApiKey: "unused",
  pixabayApiKey: "unused",
  blobToken: "unused",
  google: { clientId: "unused", clientSecret: "unused", redirect: "unused" },
} satisfies Creds;

const niche = process.argv[3] ?? "creator-ownership / programmable IP infrastructure for musicians";

console.log(`\n🧠 model: ${creds.anthropicModel}\n📝 topic: ${topic}\n🎯 niche: ${niche}\n`);

const script = await writeScript(creds, {
  topic,
  niche,
  persona: "a confident, declarative narrator — never hedging or apologetic; frames Suede in plain musician language",
  lengthMinutes: 5,
});

const line = "─".repeat(64);
console.log(line);
console.log(`TITLE:  ${script.title}`);
console.log(line);
console.log(`DESCRIPTION:\n${script.description}`);
console.log(line);
console.log(`TAGS: ${script.tags.join(", ")}`);
console.log(line);
console.log(`THUMBNAIL PROMPT: ${script.thumbnailPrompt}`);
console.log(line);
console.log(`SCENES (${script.scenes.length}):\n`);
script.scenes.forEach((s, i) => {
  console.log(`  [${i + 1}] ${s.narration}`);
  console.log(`      b-roll: ${s.brollKeywords.join(" · ")}\n`);
});
console.log(line);
const words = script.scenes.reduce((n, s) => n + s.narration.split(/\s+/).length, 0);
console.log(`~${words} words ≈ ${(words / 140).toFixed(1)} min spoken\n`);
process.exit(0);
