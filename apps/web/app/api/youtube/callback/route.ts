import { db, exchangeCode, googleConfig, schema } from "@producer/core/web";
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const channelId = req.nextUrl.searchParams.get("state");
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
