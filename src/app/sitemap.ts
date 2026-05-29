import type { MetadataRoute } from 'next';

function getBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL?.trim() || 'http://localhost:3000').replace(/\/$/, '');
}

// All public, indexable pages. `/api/*` is intentionally excluded —
// see robots.ts. Priorities are coarse: 1.0 for the dashboard, 0.8 for
// the four primary product surfaces, 0.5 for everything else.

interface SitemapEntry {
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
}

const ROUTES: SitemapEntry[] = [
  { path: '/', priority: 1.0, changeFrequency: 'daily' },
  { path: '/insights', priority: 0.8, changeFrequency: 'daily' },
  { path: '/prompts', priority: 0.8, changeFrequency: 'hourly' },
  { path: '/optimizer', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/studio', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/budget', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/digest', priority: 0.6, changeFrequency: 'daily' },
  { path: '/anomaly', priority: 0.6, changeFrequency: 'hourly' },
  { path: '/settings', priority: 0.4, changeFrequency: 'monthly' },
  { path: '/import', priority: 0.5, changeFrequency: 'weekly' },
  { path: '/api-docs', priority: 0.5, changeFrequency: 'weekly' },
  { path: '/setup', priority: 0.5, changeFrequency: 'monthly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getBaseUrl();
  const lastModified = new Date();

  return ROUTES.map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
