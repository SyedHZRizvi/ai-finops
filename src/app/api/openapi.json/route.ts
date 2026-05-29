import { NextRequest, NextResponse } from 'next/server';
import { buildOpenApiSpec } from '@/lib/openapi';

export const dynamic = 'force-dynamic';

// Serves the OpenAPI 3.0 spec for the entire AI FinOps API surface.
//
// servers[0].url is populated dynamically from the inbound request so the
// spec is correct in dev (http://localhost:3000) and in prod (whatever host
// the proxy lands us on) without any build-time config.
export function GET(request: NextRequest): NextResponse {
  // Order: explicit override > x-forwarded-* (behind a proxy) > host header.
  // Vercel, Fly, Render, and most reverse proxies set x-forwarded-host and
  // x-forwarded-proto; falling back to host covers the bare next-dev case.
  const override = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  let baseUrl: string;
  if (override && /^https?:\/\//.test(override)) {
    baseUrl = override.replace(/\/+$/, '');
  } else {
    const forwardedHost = request.headers.get('x-forwarded-host');
    const forwardedProto = request.headers.get('x-forwarded-proto');
    const host = forwardedHost ?? request.headers.get('host') ?? 'localhost:3000';
    // Default to http for explicit localhost; everything else assumes https
    // unless an upstream proxy says otherwise.
    const proto = forwardedProto
      ?? (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
    baseUrl = `${proto}://${host}`;
  }

  const spec = buildOpenApiSpec(baseUrl);
  return new NextResponse(JSON.stringify(spec, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
