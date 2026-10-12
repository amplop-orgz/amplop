import type { MetadataRoute } from "next";

// 17 S17-15: only the landing page is indexed.
export default function robots(): MetadataRoute.Robots {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app", "/invite", "/approve", "/recover", "/api"],
    },
    sitemap: `${site.replace(/\/$/, "")}/sitemap.xml`,
  };
}
