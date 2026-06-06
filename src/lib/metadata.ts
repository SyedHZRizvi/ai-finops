import type { Metadata } from 'next';

// Centralized metadata helper. Use from every page that should be
// individually titled / sharable. Title format is "<Page> · <Site>".

export const SITE_NAME = 'AI FinOps';
export const SITE_DESCRIPTION =
  'Track every LLM token. Classify every prompt. Get ranked, dollar-impact actions to reduce your AI bill.';
// Default Open Graph image. The actual file is an SVG; some social
// crawlers prefer raster but most accept SVG, and we keep the path
// stable so a future PNG drop-in can replace it without code changes.
export const DEFAULT_OG = '/og-default.svg';

/**
 * Resolve the canonical base URL for absolute metadata URLs (OG, canonical).
 * Honors `NEXT_PUBLIC_BASE_URL` and falls back to localhost:3000 for
 * local dev. Trailing slash is stripped so `${base}${path}` never
 * yields a double slash.
 */
function getBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL?.trim() || 'http://localhost:3000').replace(/\/$/, '');
}

export interface PageMetadataOptions {
  /** Page-specific title, e.g. "Insights". Gets suffixed with the site name. */
  title: string;
  /** Page-specific description, used for SEO + OG + Twitter card. */
  description: string;
  /** Path on the site, leading slash. E.g. "/insights". */
  path: string;
  /** Optional path/URL to an Open Graph image. Defaults to DEFAULT_OG. */
  ogImage?: string;
}

/**
 * Build a full Next.js Metadata object for a page.
 *
 * Returns:
 *  - `title` formatted as "<page> · AI FinOps"
 *  - `description`
 *  - `openGraph` (title, description, type, siteName, url, images)
 *  - `twitter` (summary_large_image card with the same image)
 *  - `alternates.canonical` set to the absolute URL of the page
 */
export function pageMetadata(opts: PageMetadataOptions): Metadata {
  const baseUrl = getBaseUrl();
  const normalizedPath = opts.path.startsWith('/') ? opts.path : `/${opts.path}`;
  const absoluteUrl = `${baseUrl}${normalizedPath}`;

  const image = opts.ogImage ?? DEFAULT_OG;
  const absoluteImage = image.startsWith('http') ? image : `${baseUrl}${image.startsWith('/') ? image : `/${image}`}`;

  const fullTitle = `${opts.title} · ${SITE_NAME}`;

  return {
    title: fullTitle,
    description: opts.description,
    openGraph: {
      title: fullTitle,
      description: opts.description,
      type: 'website',
      siteName: SITE_NAME,
      url: absoluteUrl,
      images: [
        {
          url: absoluteImage,
          alt: `${opts.title} · ${SITE_NAME}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description: opts.description,
      images: [absoluteImage],
    },
    alternates: {
      canonical: absoluteUrl,
    },
  };
}
