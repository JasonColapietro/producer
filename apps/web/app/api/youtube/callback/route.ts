import { db, exchangeCode, googleConfig, schema } from "@producer/core/web";
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { verifyOAuthState } from "@/lib/oauth-state";

export const runtime = "nodejs";

// Public by necessity (Google's redirect target), so the state is the gate: it
// must have been minted by the owner-only connect route, for this channel,
// within the last few minutes. Anything else is dropped before the code is
// exchanged or any row is touched.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const channelId = verifyOAuthState(req.nextUrl.searchParams.get("state"), process.env.DASHBOARD_SECRET);
  const origin = req.nextUrl.origin;

  if (!code || !channelId) {
    return NextResponse.redirect(`${origin}/?youtube=error`);
  }

  try {
    const refreshToken = await exchangeCode(googleConfig(), code);
    await db()
      .update(schema.channels)
      .set({ youtubeRefreshToken: refreshToken })
      .where(eq(schema.channels.id, channelId));
    return NextResponse.redirect(`${origin}/?youtube=connected`);
  } catch {
    return NextResponse.redirect(`${origin}/?youtube=error`);
  }
}
