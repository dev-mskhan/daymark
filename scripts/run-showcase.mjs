import { mkdir, writeFile } from 'node:fs/promises';
const mode = process.argv[2] === 'live' ? 'live' : 'fixture';
const destination = process.argv[3] ?? 'Tokyo';
const suffix = process.argv[3] ? '-' + destination.toLowerCase().replace(/[^a-z0-9-]/g, '_') : '';
const baseUrl = process.env.SHOWCASE_BASE_URL ?? 'http://127.0.0.1:3100';
const response = await fetch(`${baseUrl}/api/plan`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({destination,startAt:'2026-10-12T09:00:00',endAt:'2026-10-12T19:00:00',preference:'I enjoy art, local neighborhoods and food. Include one art museum, but avoid repetitive museum visits. Keep the day relaxed.',mode})});
const reader = response.body.getReader(), decoder = new TextDecoder();
let buffer = ''; const events = [];
while(true) { const {done,value} = await reader.read(); if(done)break; buffer += decoder.decode(value,{stream:true}); const lines = buffer.split('\n'); buffer = lines.pop(); for(const line of lines) {if(!line)continue;const e=JSON.parse(line); events.push(e); console.log(JSON.stringify({type:e.type,actor:e.actor,version:e.version,elapsedMs:e.elapsedMs,message:e.message,model:e.review?.model,places:e.candidates?.map(p=>p.name)}));}}
await mkdir('artifacts',{recursive:true});
await writeFile(`artifacts/${mode}${suffix}-run.json`,JSON.stringify({mode,events},null,2));
if(events.some(e=>e.type==='error')||!events.some(e=>e.type==='complete'))process.exitCode=1;
