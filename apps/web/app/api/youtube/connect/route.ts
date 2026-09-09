import { getAuthUrl, googleConfig, hasGoogleConfig } from "@producer/core/web";
import { NextResponse, type NextRequest } from "next/server";
import { ensureOwnerChannel } from "@/lib/data";
import { mintOAuthState } from "@/lib/oauth-state";

export const runtime = "nodejs";

// Gated by the dashboard middleware: only the owner can start the flow, so only
// the owner can mint a state the public callback will accept.
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  if (!hasGoogleConfig()) {
    return NextResponse.redirect(`${origin}/?youtube=disabled`);
  }

  const channel = await ensureOwnerChannel();
  const state = mintOAuthState(channel.id, process.env.DASHBOARD_SECRET);
  const url = getAuthUrl(googleConfig(), state);
  return NextResponse.redirect(url);
}
