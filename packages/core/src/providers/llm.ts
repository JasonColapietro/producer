import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Creds } from "../config.js";

export const ScriptSchema = z.object({
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()).max(20),
  thumbnailPrompt: z.string(),
  scenes: z
    .array(
      z.object({
        narration: z.string(),
        brollKeywords: z.array(z.string()).min(1).max(4),
        // Cinematic text-to-video prompt for generative AI visuals. Optional so
        // scripts rendered before this field existed still parse.
        visualPrompt: z.string().optional(),
      }),
    )
    .min(3),
});
export type Script = z.infer<typeof ScriptSchema>;

interface WriteArgs {
  topic: string;
  niche: string;
  persona?: string;
  lengthMinutes?: number;
}

export async function writeScript(creds: Creds, args: WriteArgs): Promise<Script> {
  const client = new Anthropic({ apiKey: creds.anthropicApiKey });
  const minutes = args.lengthMinutes ?? 6;
  const persona = args.persona ?? "a sharp, energetic narrator who hooks fast and never pads";

  const system = [
    "You write retention-optimized scripts for faceless/avatar YouTube videos.",
    "Open with a 1-2 sentence hook that creates an open loop. No 'hey guys, welcome back'.",
    "Write spoken narration only — no stage directions inside narration.",
    "Each scene's brollKeywords are concrete, searchable stock-footage terms (e.g. 'city traffic timelapse', not 'success').",
    "Each scene's visualPrompt is a single cinematic shot description for an AI video model: subject, action, setting, camera move, lighting, mood (e.g. 'slow dolly-in on a weathered Roman aqueduct at golden hour, mist drifting through the arches, cinematic, photorealistic'). One continuous shot, no people talking to camera, no on-screen text.",
    "Return ONLY valid minified JSON matching the schema. No markdown, no commentary.",
  ].join(" ");

  const user = [
    `Topic: ${args.topic}`,
    `Niche: ${args.niche || "general"}`,
    `Persona: ${persona}`,
    `Target spoken length: about ${minutes} minutes (~${minutes * 140} words total across scenes).`,
    "",
    "JSON schema:",
    `{"title": string (<=70 chars, high-CTR),`,
    ` "description": string (2-3 short paragraphs + 3-5 hashtags),`,
    ` "tags": string[] (<=20),`,
    ` "thumbnailPrompt": string (vivid image-gen prompt, no text in image),`,
    ` "scenes": [{"narration": string, "brollKeywords": string[1..4], "visualPrompt": string (one cinematic AI-video shot)}] (>=3)}`,
  ].join("\n");

  const res = await client.messages.create({
    model: creds.anthropicModel,
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: user }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const json = text.startsWith("{") ? text : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return ScriptSchema.parse(JSON.parse(json));
}

/** Invent fresh, specific video topics for a niche — autopilot's backlog refill. */
export async function ideateTopics(
  creds: Creds,
  args: { niche: string; count: number; avoid?: string[] },
): Promise<string[]> {
  const client = new Anthropic({ apiKey: creds.anthropicApiKey });
  const avoid = args.avoid?.length
    ? `\n\nDo NOT repeat or closely echo these already-used topics:\n- ${args.avoid.slice(0, 40).join("\n- ")}`
    : "";

  const res = await client.messages.create({
    model: creds.anthropicModel,
    max_tokens: 1024,
    system:
      "You are a YouTube growth strategist. Generate specific, curiosity-driven video topics with a built-in hook — concrete title-like ideas, never vague categories. Return ONLY a JSON array of strings.",
    messages: [
      {
        role: "user",
        content: `Niche: ${args.niche}\nGenerate ${args.count} fresh video topics as a JSON array of strings.${avoid}`,
      },
    ],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const json = text.startsWith("[") ? text : text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
  return z.array(z.string()).parse(JSON.parse(json));
}
