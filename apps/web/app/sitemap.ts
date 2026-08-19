import type { MetadataRoute } from "next";

import { SITE_URL } from "./site";


export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date("2026-07-07T00:00:00.000Z"),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
