import { createReadStream } from "node:fs";
import { google } from "googleapis";
import type { Creds } from "../config.js";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirect: string;
}

function oauth(g: GoogleConfig) {
  return new google.auth.OAuth2(g.clientId, g.clientSecret, g.redirect);
}

/** Step 1 of channel onboarding — where we send the user to grant access. */
export function getAuthUrl(g: GoogleConfig, state: string): string {
  return oauth(g).generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // force a refresh_token every time
    scope: SCOPES,
    state,
  });
}

/** Step 2 — exchange the callback code for a durable refresh token to store. */
export async function exchangeCode(g: GoogleConfig, code: string): Promise<string> {
  const { tokens } = await oauth(g).getToken(code);
  if (!tokens.refresh_token) throw new Error("No refresh_token returned (re-consent required)");
  return tokens.refresh_token;
}

interface UploadArgs {
  filePath: string;
  title: string;
  description: string;
  tags: string[];
  privacy: "private" | "unlisted" | "public";
  /** RFC3339; when set with privacy=private, YouTube schedules the premiere. */
  publishAt?: string;
}

/** Upload a finished MP4 to the channel that owns `refreshToken`. */
export async function uploadVideo(
  creds: Creds,
  refreshToken: string,
  args: UploadArgs,
): Promise<string> {
  const auth = oauth(creds.google);
  auth.setCredentials({ refresh_token: refreshToken });
  const youtube = google.youtube({ version: "v3", auth });

  const res = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: args.title.slice(0, 100),
        description: args.description.slice(0, 5000),
        tags: args.tags.slice(0, 20),
        categoryId: "27", // Education
      },
      status: {
        privacyStatus: args.publishAt ? "private" : args.privacy,
        publishAt: args.publishAt,
        selfDeclaredMadeForKids: false,
      },
    },
    media: { body: createReadStream(args.filePath) },
  });

  if (!res.data.id) throw new Error("YouTube upload returned no video id");
  return res.data.id;
}
