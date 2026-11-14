import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) loadEnvFile(file);
}

// Mirrors lib/providers/jev.ts endpoint resolution so this probe tests the configured URL.
function jevEndpoint() {
  const base = (process.env.JEV_BASE_URL?.trim() || 'https://api.typesafe.ai').replace(/\/$/, '');
  return base.endsWith('/systemone') ? base : base.endsWith('/v1') ? `${base}/systemone` : `${base}/v1/systemone`;
}
const jevKey = process.env.JEV_API_KEY ?? process.env.TYPESAFE_API_KEY;
const geoKey = process.env.GEOAPIFY_API_KEY;
const probes = [
  ['Geoapify geocode', geoKey ? `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent('Penn Station, New York')}&limit=1&apiKey=${geoKey}` : null, undefined, 'GEOAPIFY_API_KEY'],
  ['Geoapify routing', geoKey ? `https://api.geoapify.com/v1/routing?waypoints=40.7506,-73.9935|40.7484,-73.9857&mode=walk&apiKey=${geoKey}` : null, undefined, 'GEOAPIFY_API_KEY'],
  ['Jev', jevKey ? jevEndpoint() : null, { model: process.env.JEV_MODEL ?? 'jev-latest', state: 'The traveler likes art museums.', questions: { art: { type: 'choice', instructions: 'Does the traveler like art?', criteria: { pass: 'Yes', flag: 'No', unknown: 'Not stated' } } } }, 'JEV_API_KEY'],
  ['Groq', process.env.GROQ_API_KEY && process.env.GROQ_MODEL ? (process.env.GROQ_BASE_URL?.trim() || 'https://api.groq.com/openai/v1').replace(/\/$/, '') + '/chat/completions' : null, { model: process.env.GROQ_MODEL, max_tokens: 300, response_format: {type:'json_object'}, messages:[{role:'user',content:'Return JSON {"ok":true}.'}] }, 'GROQ_API_KEY and GROQ_MODEL'],
];
await Promise.all(probes.map(async ([name, url, body, requires]) => {
  if (!url) return console.log(JSON.stringify({ service: name, skipped: `${requires} is not set` }));
  const start = performance.now();
  try {
    const response = await fetch(url, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json', Authorization: `Bearer ${name === 'Jev' ? jevKey : process.env.GROQ_API_KEY}` } : {}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(25000) });
    const raw = await response.json().catch(() => ({}));
    const data = raw.data ?? raw; // JevStation wraps results in { code, message, data }
    console.log(JSON.stringify({service:name,status:response.status,latencyMs:Math.round(performance.now()-start),model:data.model,error:response.ok && (typeof raw.code !== 'number' || raw.code === 0) ? undefined : raw.message ?? raw.error?.message ?? 'Provider request failed',geocoded:data.features?.length,routeSeconds:data.features?.[0]?.properties?.time,answer:name === 'Jev' ? data.answers : undefined}));
  } catch(error) { console.log(JSON.stringify({service:name,error:error.name,code:error.cause?.code,latencyMs:Math.round(performance.now()-start)})); }
}));
