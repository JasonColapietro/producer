// Dashboard gate. Pure functions so middleware (edge runtime) and tests share
// one rule. The dashboard spends the owner's Anthropic, Replicate and Kie.ai
// credits, so an unset secret locks everything rather than opening it.
export type AuthResult = "ok" | "missing-secret" | "unauthorized";

// Seconds a crawler should wait before re-requesting a locked path. The lock
// clears when the operator sets DASHBOARD_SECRET in the Vercel project env, so
// there is no scheduled end: a day is long enough to stop crawlers hammering a
// gate that will still be shut, and short enough that the host is re-checked
// promptly once the secret lands.
export const LOCKED_RETRY_AFTER_SECONDS = 86400;

// Headers for the 503 the gate returns when no secret is configured. RFC 9110
// asks a 503 to say when to come back; without Retry-After a crawler has to
// guess, and a 503 that never explains itself eventually reads as a dead host.
//
// Frozen because this is module state in an edge runtime: a warm isolate
// serves many requests from one copy, so a later `headers["x-whatever"] = ...`
// on the way into a response would persist for every subsequent request until
// the next cold start. Freezing turns that into a visible failure instead of a
// leak on an auth-adjacent response.
export const LOCKED_RESPONSE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "cache-control": "no-store",
  "retry-after": String(LOCKED_RETRY_AFTER_SECONDS),
});

const PUBLIC_EXACT = new Set([
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/favicon.ico",
  "/api/cron/tick", // carries its own bearer check
  "/api/youtube/callback", // OAuth return leg must be reachable
]);

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/opengraph-image")) return true;
  return false;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function checkDashboardAuth(authorization: string | null, secret: string | undefined): AuthResult {
  if (!secret) return "missing-secret";
  if (!authorization || !authorization.startsWith("Basic ")) return "unauthorized";
  let decoded = "";
  try {
    decoded = atob(authorization.slice(6).trim());
  } catch {
    return "unauthorized";
  }
  const colon = decoded.indexOf(":");
  const password = colon === -1 ? "" : decoded.slice(colon + 1);
  return timingSafeEqual(password, secret) ? "ok" : "unauthorized";
}
