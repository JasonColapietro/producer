import type { Creds } from "../config.js";

type Orientation = "landscape" | "portrait";

interface Broll {
  url: string;
  width: number;
  height: number;
  source: "pexels" | "pixabay";
}

async function fromPexels(
  key: string | undefined,
  query: string,
  orientation: Orientation,
): Promise<Broll | null> {
  if (!key) return null;
  const u = new URL("https://api.pexels.com/videos/search");
  u.searchParams.set("query", query);
  u.searchParams.set("per_page", "5");
  u.searchParams.set("orientation", orientation);
  u.searchParams.set("size", "medium");
  const res = await fetch(u, { headers: { Authorization: key } });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    videos?: Array<{
      video_files: Array<{ link: string; width: number; height: number; quality: string }>;
    }>;
  };
  const video = data.videos?.[0];
  if (!video) return null;
  // prefer the largest HD file that isn't 4K (keeps download + ffmpeg light)
  const file =
    video.video_files
      .filter((f) => f.height <= 1080)
      .sort((a, b) => b.height - a.height)[0] ?? video.video_files[0];
  if (!file) return null;
  return { url: file.link, width: file.width, height: file.height, source: "pexels" };
}

async function fromPixabay(
  key: string | undefined,
  query: string,
  orientation: Orientation,
): Promise<Broll | null> {
  if (!key) return null;
  const u = new URL("https://pixabay.com/api/videos/");
  u.searchParams.set("key", key);
  u.searchParams.set("q", query);
  u.searchParams.set("per_page", "5");
  const res = await fetch(u);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    hits?: Array<{ videos: { large: { url: string; width: number; height: number } } }>;
  };
  const hit = data.hits?.find((h) => {
    const v = h.videos.large;
    return orientation === "portrait" ? v.height >= v.width : v.width >= v.height;
  }) ?? data.hits?.[0];
  if (!hit) return null;
  const v = hit.videos.large;
  return { url: v.url, width: v.width, height: v.height, source: "pixabay" };
}

/** Find one stock clip for a scene. Tries each keyword across both providers. */
export async function fetchBroll(
  creds: Creds,
  keywords: string[],
  orientation: Orientation = "landscape",
): Promise<Broll | null> {
  for (const kw of keywords) {
    const hit =
      (await fromPexels(creds.pexelsApiKey, kw, orientation)) ??
      (await fromPixabay(creds.pixabayApiKey, kw, orientation));
    if (hit) return hit;
  }
  return null;
}
