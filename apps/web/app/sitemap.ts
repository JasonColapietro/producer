import type { MetadataRoute } from "next";

/**
 * Nothing on producer.suedeai.ai is indexable: the dashboard sits behind the
 * auth gate in lib/dashboard-auth.ts, which answers 503 with no
 * DASHBOARD_SECRET set and 401 with one. The route is kept and served empty
 * rather than deleted so that opening a public surface here later is a
 * one-entry restore, and so a stale cached sitemap is replaced rather than
 * left to 404.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [];
}
