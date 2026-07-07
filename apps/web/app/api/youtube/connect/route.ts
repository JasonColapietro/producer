import { getAuthUrl, googleConfig, hasGoogleConfig } from "@producer/core/web";
import { NextResponse, type NextRequest } from "next/server";
import { ensureOwnerChannel } from "@/lib/data";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  if (!hasGoogleConfig()) {
    return NextResponse.redirect(`${origin}/?youtube=disabled`);
  }

  const channel = await ensureOwnerChannel();
  const url = getAuthUrl(googleConfig(), channel.id);
  return NextResponse.redirect(url);
}
