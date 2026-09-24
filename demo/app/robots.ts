import type { MetadataRoute } from "next";

const SITE_URL = "https://pi-intake-agent.vercel.app";

/** Crawlers may read the page. The API routes are for the app, not for search. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
