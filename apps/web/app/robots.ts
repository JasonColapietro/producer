import type { MetadataRoute } from "next";

/**
 * This host is the operator dashboard, not a public page. It is 503 while
 * DASHBOARD_SECRET is unset and 401 once it is set, so no path here is ever
 * indexable and the host must not advertise itself as crawlable.
 *
 * Deliberately no `sitemap` and no `host` field: pointing crawlers at a
 * sitemap for a gated host is the thing this file exists to stop.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
