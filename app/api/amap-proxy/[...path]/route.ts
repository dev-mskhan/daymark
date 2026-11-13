import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const securityCode = process.env.AMAP_JS_SECURITY_CODE;
  if (!securityCode) return Response.json({ error: 'Amap security proxy is not configured.' }, { status: 503 });

  const { path } = await context.params;
  const target = new URL(`https://restapi.amap.com/${path.map(encodeURIComponent).join('/')}`);
  request.nextUrl.searchParams.forEach((value, key) => target.searchParams.append(key, value));
  target.searchParams.set('jscode', securityCode);

  const method = request.method.toUpperCase();
  const response = await fetch(target, {
    method,
    headers: request.headers.get('content-type') ? { 'content-type': request.headers.get('content-type')! } : undefined,
    body: method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer(),
    cache: 'no-store',
  });
  const headers = new Headers();
  const contentType = response.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  headers.set('cache-control', 'no-store');
  return new Response(response.body, { status: response.status, headers });
}

export const GET = proxy;
export const POST = proxy;
