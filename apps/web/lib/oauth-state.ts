// OAuth `state` for the YouTube connect and callback legs. The callback has to
// stay public (Google redirects the browser there), so it cannot sit behind the
// dashboard gate. Instead the gated connect route mints a state bound to the
// channel id, with an expiry, HMAC-signed with DASHBOARD_SECRET; the callback
// only writes a refresh token to a channel whose state verifies. Without this,
// anyone who learned a channel id could finish an OAuth flow with their own
// Google account against our client id and bind their YouTube channel to the
// owner's row, redirecting every published render (login CSRF).
import { createHmac, timingSafeEqual } from "node:crypto";

export const OAUTH_STATE_TTL_SECONDS = 600;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function mintOAuthState(channelId: string, secret: string | undefined, now = Date.now()): string {
  if (!secret) throw new Error("DASHBOARD_SECRET is required to start the YouTube OAuth flow");
  if (!channelId || channelId.includes(".")) throw new Error("invalid channel id");
  const exp = Math.floor(now / 1000) + OAUTH_STATE_TTL_SECONDS;
  const payload = `${channelId}.${exp}`;
  return `${payload}.${sign(payload, secret)}`;
}

/** Returns the bound channel id, or null for anything missing, malformed, expired, or forged. */
export function verifyOAuthState(state: string | null, secret: string | undefined, now = Date.now()): string | null {
  if (!secret || !state) return null;
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [channelId, expRaw, sig] = parts;
  if (!channelId || !expRaw || !sig || !/^\d{1,12}$/.test(expRaw)) return null;
  if (Number(expRaw) * 1000 <= now) return null;
  const expected = Buffer.from(sign(`${channelId}.${expRaw}`, secret));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return channelId;
}
