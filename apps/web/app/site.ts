/**
 * Single source for the identity this surface publishes.
 *
 * layout.tsx, the JSON-LD graph and llms.txt all read from here, so the page a
 * human sees, the schema a crawler parses and the file an answer engine reads
 * cannot drift into describing the product differently.
 */
export const SITE_URL = "https://producer.suedeai.ai";
export const SITE_NAME = "Suede Cinema";
export const SITE_TAGLINE = "Type a topic, get a finished video.";
export const SITE_DESCRIPTION =
  "Type a topic and get a finished video: Claude-written scripts, cinematic AI footage, cloned voiceover, and burned-in captions, published to YouTube.";
