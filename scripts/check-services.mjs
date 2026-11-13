import { loadEnvFile } from 'node:process';
loadEnvFile('.env.local');
const probes = [
  ['Photon', 'https://photon.komoot.io/api/?q=Tokyo&limit=1&lang=en', undefined],
  ['Valhalla', 'https://valhalla1.openstreetmap.de/route?json=' + encodeURIComponent(JSON.stringify({locations:[{lat:35.6812,lon:139.7671},{lat:35.6852,lon:139.77}],costing:'pedestrian'})), undefined],
  ['Jev', 'https://api.typesafe.ai/v1/systemone', { model: process.env.JEV_MODEL ?? 'jev-1.13.0', state: 'The traveler likes art museums.', questions: { art: { type: 'choice', instructions: 'Does the traveler like art?', criteria: { pass: 'Yes', flag: 'No', unknown: 'Not stated' } } } }],
  ['Groq', (process.env.GROQ_BASE_URL?.trim() || 'https://api.groq.com/openai/v1').replace(/\/$/, '') + '/chat/completions', { model: process.env.GROQ_MODEL, max_tokens: 300, response_format: {type:'json_object'}, messages:[{role:'user',content:'Return JSON {"ok":true}.'}] }],
];
await Promise.all(probes.map(async ([name, url, body]) => {
  const start = performance.now();
  try {
    const response = await fetch(url, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json', Authorization: `Bearer ${name === 'Jev' ? process.env.TYPESAFE_API_KEY : process.env.GROQ_API_KEY}` } : {}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(25000) });
    const data = await response.json();
    console.log(JSON.stringify({service:name,status:response.status,latencyMs:Math.round(performance.now()-start),model:data.model,places:data.features?.length,routeSeconds:data.trip?.summary?.time,answer:name === 'Jev' ? data.answers : name === 'LLM' ? data.choices?.[0]?.message?.content : undefined}));
  } catch(error) { console.log(JSON.stringify({service:name,error:error.name,code:error.cause?.code,latencyMs:Math.round(performance.now()-start)})); }
}));
