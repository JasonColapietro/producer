import { createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { put } from "@vercel/blob";
import type { Creds } from "../config.js";

/** Upload bytes to Vercel Blob and return the public URL. */
export async function putBuffer(
  creds: Creds,
  pathname: string,
  data: Buffer | string,
  contentType?: string,
): Promise<string> {
  const { url } = await put(pathname, data, {
    access: "public",
    token: creds.blobToken,
    contentType,
    addRandomSuffix: true,
  });
  return url;
}

/** Upload a local file (an FFmpeg render) to Vercel Blob. */
export async function putFile(creds: Creds, pathname: string, localPath: string): Promise<string> {
  return putBuffer(creds, pathname, await readFile(localPath));
}

/** Stream a remote URL down to a local path for FFmpeg to consume. */
export async function download(url: string, destPath: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`download failed ${res.status}: ${url}`);
  await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(destPath));
  return destPath;
}
