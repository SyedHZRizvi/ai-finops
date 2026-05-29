import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildDigest } from '@/lib/digest';
import { renderDigestHtml } from '@/lib/digestHtml';

export const dynamic = 'force-dynamic';

const PeriodSchema = z.enum(['daily', 'weekly', 'monthly']);
const FormatSchema = z.enum(['json', 'html']);

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    const periodRaw = url.searchParams.get('period') ?? 'weekly';
    const formatRaw = url.searchParams.get('format') ?? 'html';

    const periodParsed = PeriodSchema.safeParse(periodRaw);
    if (!periodParsed.success) {
      return NextResponse.json(
        { error: 'invalid period; must be daily | weekly | monthly' },
        { status: 400 },
      );
    }
    const formatParsed = FormatSchema.safeParse(formatRaw);
    if (!formatParsed.success) {
      return NextResponse.json(
        { error: 'invalid format; must be json | html' },
        { status: 400 },
      );
    }

    const digest = await buildDigest(periodParsed.data);

    if (formatParsed.data === 'json') {
      // Dates serialize naturally to ISO 8601 in JSON; consumers parse them back.
      return new NextResponse(JSON.stringify(digest), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }

    const html = renderDigestHtml(digest, BASE_URL);
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
