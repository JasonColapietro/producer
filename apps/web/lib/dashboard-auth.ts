// Dashboard gate. Pure functions so middleware (edge runtime) and tests share
// one rule. The dashboard spends the owner's Anthropic, Replicate and Kie.ai
// credits, so an unset secret locks everything rather than opening it.
export type AuthResult = "ok" | "missing-secret" | "unauthorized";

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
