import type { MetadataRoute } from "next";

// 17 S17-15: `/` only.
export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return [{ url: `${site.replace(/\/$/, "")}/`, changeFrequency: "weekly", priority: 1 }];
}
