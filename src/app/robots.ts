import type { MetadataRoute } from 'next';

// Resolve a canonical base URL for the sitemap reference. We honour
// the same env var used everywhere else in the app so a single
// `NEXT_PUBLIC_BASE_URL=https://app.example.com` propagates here too.
function getBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL?.trim() || 'http://localhost:3000').replace(/\/$/, '');
}

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrl();

  return {
    rules: [
      {
        userAgent: '*',
        // Explicit allow for the marketing/app surface, explicit
        // disallow for /api/* (the data plane should not be crawled).
        allow: ['/'],
        disallow: ['/api/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
