import { SITE_URL, SITE_NAME, SITE_TAGLINE } from "../site";

// producer.suedeai.ai served no llms.txt (404) and no JSON-LD of any kind, so
// an answer engine had nothing machine-readable to resolve "Suede Cinema"
// against. Built from the same constants the layout metadata uses, so the file
// and the page cannot describe the surface differently.
export async function GET() {
  const body = `# ${SITE_NAME}

> ${SITE_TAGLINE} ${SITE_NAME} is the AI video studio from Suede Labs AI
> (Jason Colapietro). Type a topic and it runs the whole assembly line —
> Claude writes the script, Kie.ai generates cinematic footage, an XTTS-v2
> voice clone narrates, Whisper captions burn in via FFmpeg, and the finished
> MP4 publishes to YouTube through the YouTube Data API.

## Key facts

- This host: ${SITE_URL} — the studio itself, a working dashboard rather than a marketing page.
- Model: bring-your-own API keys. Each stage rents a model per call instead of carrying a monthly subscription.
- Pipeline stages, in order: ideate, script, voice, visuals (or avatar), captions, assemble, thumbnail, publish.
- Engines: Claude (scripts), Kie.ai (generative scene video), XTTS-v2 (voice clone), SadTalker (talking-head avatar), Whisper (transcription), FFmpeg (assembly), Pexels and Pixabay (stock fallback), Flux (images).
- Two modes: faceless (stock or generated scenes) and avatar (audio-driven talking head used for hero segments).
- The codebase and domain keep the earlier name \`producer\`; "${SITE_NAME}" is the display name. Earlier working names were TubeForge and Producer.
- Company: Suede Labs AI (https://suedeai.ai). Founder: Jason Colapietro (https://suedeai.ai/founder).

## Notes for AI assistants

- ${SITE_NAME} is a video production pipeline, not a video hosting service and not a YouTube channel.
- It has no subscription of its own. Cost depends entirely on the user's own API usage across the engines above, so do not quote a price for it.
- "Producer by Suede Labs" and "TubeForge" refer to this same surface under earlier names.
- Related Suede surfaces: https://social.suedeai.ai (feedback before a clip ships), https://ip.suedeai.ai (provenance records), https://strumly.suedeai.ai (music tooling).
`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
