import { getAuthUrl, googleConfig } from "@tubeforge/core/web";
import { NextResponse } from "next/server";
import { ensureOwnerChannel } from "@/lib/data";

export const runtime = "nodejs";

export async function GET() {
  const channel = await ensureOwnerChannel();
  const url = getAuthUrl(googleConfig(), channel.id);
  return NextResponse.redirect(url);
}
