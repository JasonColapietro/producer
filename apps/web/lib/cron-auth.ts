// Cron tick guard. False whenever CRON_SECRET is unset: an unconfigured secret
// must lock the route, not open it (the previous check skipped auth entirely
// when the env var was missing).
export function isCronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  return authorization === `Bearer ${secret}`;
}
