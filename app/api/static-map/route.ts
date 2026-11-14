import { z } from 'zod';

export const runtime = 'nodejs';

const MAX_POINTS = 12;
const STYLES = { light: 'osm-bright', dark: 'dark-matter' } as const;
const querySchema = z.object({
  points: z.string().min(1).max(600),
  theme: z.enum(['light', 'dark']).default('light'),
});
const pointSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

function parsePoints(raw: string) {
  const points = raw.split('|').map(pair => pair.split(',').map(Number));
  if (points.length > MAX_POINTS) return null;
  const parsed = points.map(point => pointSchema.safeParse(point));
  return parsed.every(result => result.success) ? parsed.map(result => result.data!) : null;
}

// Proxies Geoapify static maps so GEOAPIFY_API_KEY never reaches the browser.
export async function GET(request: Request) {
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  const points = query.success ? parsePoints(query.data.points) : null;
  if (!query.success || !points?.length) return Response.json({ error: 'Invalid map request.' }, { status: 400 });
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) return Response.json({ error: 'Map service is not configured.' }, { status: 503 });

  const lons = points.map(([lon]) => lon), lats = points.map(([, lat]) => lat);
  const pad = 0.01;
  const marker = points.map(([lon, lat], index) => `lonlat:${lon},${lat};color:%23ffb81c;size:medium;text:${index + 1}`).join('|');
  const params = [
    `style=${STYLES[query.data.theme]}`,
    'width=640',
    'height=640',
    `area=rect:${Math.min(...lons) - pad},${Math.min(...lats) - pad},${Math.max(...lons) + pad},${Math.max(...lats) + pad}`,
    `marker=${marker}`,
    ...(points.length > 1 ? [`geometry=polyline:${points.map(([lon, lat]) => `${lon},${lat}`).join(',')};linewidth:3;linecolor:%230d3b40;lineopacity:0.8`] : []),
    `apiKey=${encodeURIComponent(apiKey)}`,
  ].join('&');

  try {
    const upstream = await fetch(`https://maps.geoapify.com/v1/staticmap?${params}`, {
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
    });
    if (!upstream.ok) return Response.json({ error: 'Map service request failed.' }, { status: 502 });
    return new Response(upstream.body, {
      headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'image/png', 'Cache-Control': 'private, max-age=3600' },
    });
  } catch {
    return Response.json({ error: 'Map service is unavailable.' }, { status: 502 });
  }
}
