'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { Activity, Place, RunEvent, Snapshot } from '@/lib/domain';
import { AmapMap } from '@/app/components/AmapMap';
const defaults = { destination: 'Tokyo', date: '2026-10-12', startTime: '09:00', endTime: '19:00', preference: 'I enjoy art, local neighborhoods and food. Include one art museum, but avoid repetitive museum visits. Keep the day relaxed.' };
const liveDefaults = { ...defaults, destination: 'Shanghai' };

export default function Home() {
  const [form, setForm] = useState(defaults);
  const [mode, setMode] = useState<'fixture' | 'live'>('fixture');
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [candidates, setCandidates] = useState<Place[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState<number | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [accepted, setAccepted] = useState<Snapshot | null>(null);
  const [showCoverage, setShowCoverage] = useState(false);
  const [coverageDismissed, setCoverageDismissed] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const run = useRef(0);
  const shown = cursor === null ? events : events.slice(0, cursor + 1);
  const displayed = cursor === null ? snapshot : [...shown].reverse().find(e => e.snapshot)?.snapshot ?? null;
  const activities = displayed?.activities ?? [];
  const points = useMemo(() => activities.flatMap(a => { const p = candidates.find(p => p.id === a.placeId); return p ? [p] : []; }), [activities, candidates]);
  const bounds = points.length ? { minLat: Math.min(...points.map(p => p.latitude)), maxLat: Math.max(...points.map(p => p.latitude)), minLon: Math.min(...points.map(p => p.longitude)), maxLon: Math.max(...points.map(p => p.longitude)) } : null;
  const positions = points.map(p => ({ x: 12 + (p.longitude - bounds!.minLon) / (bounds!.maxLon - bounds!.minLon || 1) * 68, y: 18 + (bounds!.maxLat - p.latitude) / (bounds!.maxLat - bounds!.minLat || 1) * 55 }));
  const lastLLM = [...shown].reverse().find(e => e.actor === 'LLM');
  const lastJev = [...shown].reverse().find(e => e.actor === 'Jev');
  const reviews = shown.filter(e => e.review);
  const repairs = shown.filter(e => e.type === 'repair_diff');
  const name = (id: string) => candidates.find(p => p.id === id)?.name ?? id;

  useEffect(() => {
    if (!replaying || cursor === null) return;
    if (cursor >= events.length - 1) { setReplaying(false); return; }
    const timer = window.setTimeout(() => setCursor(value => value === null ? 0 : Math.min(value + 1, events.length - 1)), 550);
    return () => window.clearTimeout(timer);
  }, [cursor, events.length, replaying]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    abort.current?.abort();
    const generation = ++run.current;
    const controller = new AbortController(); abort.current = controller;
    setError(''); setEvents([]); setCandidates([]); setSnapshot(null); setCursor(null); setReplaying(false); setAccepted(null);
    let receivedCandidates = false;
    try {
      if (mode === 'live') {
        setChecking(true);
        const screeningResponse = await fetch('/api/screen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ destination: form.destination, preference: form.preference }) });
        const screening = await screeningResponse.json() as { allowed?: boolean; message?: string; error?: string };
        if (!screeningResponse.ok) throw new Error(screening.error ?? 'Could not check this request.');
        if (!screening.allowed) { setError(screening.message ?? 'Please narrow this request to one day in one city.'); return; }
      }
      if (generation !== run.current) return;
      setChecking(false); setStarted(true); setLoading(true);
      const response = await fetch('/api/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ destination: form.destination, preference: form.preference, startAt: `${form.date}T${form.startTime}:00`, endAt: `${form.date}T${form.endTime}:00`, mode }) });
      if (!response.ok) throw new Error((await response.json()).error ?? 'Planning failed');
      const reader = response.body!.getReader(), decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop()!;
        for (const line of lines) {
          if (!line || generation !== run.current) continue;
          const update = JSON.parse(line) as RunEvent;
          if (update.type === 'error') throw new Error(update.message);
          setEvents(previous => [...previous, update]);
          if (update.candidates) { receivedCandidates = true; setCandidates(update.candidates); }
          if (update.snapshot) setSnapshot(update.snapshot);
        }
      }
    } catch (caught) { if (generation === run.current) { if (!receivedCandidates && !controller.signal.aborted) setStarted(false); setError(controller.signal.aborted ? 'Planning stopped. The last committed draft is preserved.' : caught instanceof Error ? caught.message : 'Planning failed'); } }
    finally { if (generation === run.current) { setChecking(false); setLoading(false); } }
  }
  function exportRun() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ mode, request: form, events }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'jev-trip-run.json'; link.click(); URL.revokeObjectURL(url);
  }
  function startReplay() { if (!events.length) return; setCursor(0); setReplaying(true); }
  let elapsedMinutes: number | null = 0;
  return <main>
    <nav><div className="brand"><span className="brand-mark">J</span> Jev Trip</div><a className="github-link" href="https://github.com/liaoyuhua/jev-trip" target="_blank" rel="noreferrer" aria-label="View Jev Trip on GitHub"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.72 1.27 3.38.97.1-.75.4-1.27.74-1.56-2.57-.29-5.27-1.29-5.27-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.16 1.18a10.9 10.9 0 0 1 5.76 0c2.19-1.49 3.16-1.18 3.16-1.18.63 1.58.23 2.75.11 3.04.74.8 1.19 1.83 1.19 3.08 0 4.4-2.71 5.38-5.29 5.67.42.36.79 1.06.79 2.15v3.19c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" /></svg><span>GitHub</span><b>↗</b></a></nav>
    {!started ? <section className="landing">
      <div className="intro"><h1>Watch a day<br /><em>take shape.</em></h1><p className="lede">LLM plans ahead. Jev chooses and checks. Watch an itinerary take shape through collaboration.</p></div>
      <form className="trip-form" onSubmit={submit}>
        <div className="mode-switch"><button disabled={checking} type="button" className={mode === 'fixture' ? 'selected' : ''} onClick={() => { setMode('fixture'); setForm(defaults); setShowCoverage(false); setError(''); }}>Replay demo</button><button disabled={checking} type="button" className={mode === 'live' ? 'selected' : ''} onClick={() => { setMode('live'); setForm(liveDefaults); setShowCoverage(!coverageDismissed); setError(''); }}>Live models + maps</button></div>
        {showCoverage && <div className="coverage-callout" role="status"><div><strong>Mainland China coverage</strong><span>Live planning currently supports destinations across mainland China.</span></div><button type="button" aria-label="Dismiss coverage notice" onClick={() => { setShowCoverage(false); setCoverageDismissed(true); }}>×</button></div>}
        {error && !started && <div className="scope-error" role="alert"><strong>Let’s narrow this down</strong><span>{error}</span></div>}
        <label><span>Destination</span><input value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })} required disabled={mode === 'fixture' || checking} /></label>
        <div className="form-row"><label><span>Date · one day</span><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required disabled={checking} /></label><label><span>From</span><input type="time" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} required disabled={checking} /></label><label><span>Until</span><input type="time" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} required disabled={checking} /></label></div>
        <label><span>What should this day feel like?</span><textarea rows={5} value={form.preference} onChange={e => setForm({ ...form, preference: e.target.value })} required disabled={mode === 'fixture' || checking} /></label>
        {checking && <div className="preflight-status" role="status"><i /><div><strong>Checking your request</strong><span>Jev is checking day, city, and booking scope.</span></div></div>}
        <button className="primary" disabled={checking}>{checking ? 'Checking request…' : mode === 'fixture' ? 'Start the demo' : 'Plan this day'} <span>{checking ? '·' : '↗'}</span></button>
      </form>
    </section> : <section className="workspace">
      <header className="plan-header"><div><button className="back" onClick={() => { abort.current?.abort(); ++run.current; setLoading(false); setStarted(false); }}>← New trip</button><p className="eyebrow">A day taking shape in</p><h1>{form.destination}</h1></div><div className={`mode ${mode === 'live' ? 'live' : ''}`}>{mode === 'live' ? 'Live models · Amap data' : 'Replay · simulated LLM / Jev'}</div></header>
      <div className="collaboration-bar" aria-live="polite"><div><b>LLM <span>Planner</span></b><p>{!loading && cursor === null ? 'Planning finished. Explore the draft and its repair history.' : lastLLM?.message ?? 'Waiting for candidate places'}</p></div><div><b>Jev <span>Reviewer</span></b><p>{lastJev?.message ?? 'Waiting to screen candidates'}</p></div><div><b>{loading ? '● Collaborating' : '○ Run complete'}</b><p>{shown.at(-1)?.elapsedMs ?? 0} ms · v{displayed?.version ?? 0}</p>{loading && <button onClick={() => abort.current?.abort()}>Stop planning</button>}</div></div>
      {error && <p className="error" role="alert">{error}</p>}
      <TimingTrace events={shown} fixture={mode === 'fixture'} />
      <div className="plan-grid"><div className={`map-card ${mode === 'live' ? 'map-card-live' : ''}`}>{mode === 'live' ? <AmapMap points={points} /> : <><div className="map-grid" /><svg className="route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Relative place positions"><path style={{ strokeWidth: 0.65, strokeDasharray: '1 2' }} d={positions.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')} /></svg>{points.map((p, i) => <a className="map-pin" style={{ left: `${4 + positions[i].x * .92}%`, top: `${8 + positions[i].y * .84}%` }} key={p.id} href={placeUrl(p)} target="_blank" rel="noreferrer"><span>{i + 1}</span><b>{p.name}</b></a>)}<div className="map-label">{points.length ? 'Relative place positions · lines are not route geometry' : 'Waiting for the first activity'}<br />All places and coordinates are synthetic</div></>}</div>
        <aside className="stats-card"><p className="eyebrow">The collaboration</p><Stat label="Committed activities" value={String(activities.length)} /><Stat label="Jev reviews" value={String(reviews.length)} /><Stat label="Repair rounds" value={String(repairs.length)} /><div className="decision-total"><strong>{reviews.length ? `${Math.round(reviews.reduce((sum, e) => sum + (e.latencyMs ?? 0), 0) / reviews.length)}` : '—'}</strong><span>ms / average review{mode === 'fixture' ? ' (local simulation)' : ' (including network)'}</span></div></aside></div>
      {events.length > 0 && !loading && <div className="replay"><button className="replay-primary" onClick={() => replaying ? setReplaying(false) : startReplay()}>{replaying ? 'Pause replay' : '▶ Replay from start'}</button><label><span>Planning trace · {cursor === null ? 'Final state' : `Event ${cursor + 1} / ${events.length}`}</span><input aria-label="Replay progress" type="range" min={0} max={events.length - 1} value={cursor ?? events.length - 1} onChange={e => { setReplaying(false); setCursor(Number(e.target.value)); }} /></label><button onClick={() => { setReplaying(false); setCursor(null); }}>Show final state</button><button onClick={exportRun}>Export run</button><button disabled={!displayed || displayed.issues.some(i => i.status === 'flag')} onClick={() => displayed && setAccepted(structuredClone(displayed))}>Save draft</button>{accepted && <span>Saved v{accepted.version} in this tab</span>}</div>}
      <div className="lower-grid"><section className="timeline-card"><div className="section-heading"><p className="eyebrow">The itinerary · v{displayed?.version ?? 0}</p><h2>A day with a point of view.</h2></div><p className="notice">Draft · visit durations are estimates. Opening hours, origin/destination travel, and timezone remain unverified.</p><div>{displayed?.issues.filter(issue => !issue.subjectIds.length).map(issue => <p className="issue" key={issue.checkId}>{issue.message}</p>)}</div><div className="timeline">{activities.map((a, i) => {
        const p = candidates.find(p => p.id === a.placeId)!;
        if (i > 0) { const transit = displayed?.routes[i - 1]; elapsedMinutes = elapsedMinutes === null || transit == null ? null : elapsedMinutes + transit; }
        const start = elapsedMinutes === null ? 'TBD' : formatTime(form.startTime, elapsedMinutes);
        if (elapsedMinutes !== null) elapsedMinutes += a.durationMinutes;
        const issues = displayed?.issues.filter(issue => issue.subjectIds.includes(a.id)) ?? [];
        const transport = displayed?.transportLegs?.[i - 1]?.selected;
        return <article className={`activity ${issues.some(issue => issue.status === 'flag') ? 'flagged' : ''}`} key={a.id}><time>{start}</time><div className="timeline-node"><span>{i + 1}</span></div><div><div className="role">{i > 0 ? `${transport?.mode === 'transit' ? `Transit ${transport.durationMinutes} min (walk ${transport.walkingMinutes} min${transport.transfers ? ` · ${transport.transfers} transfer${transport.transfers > 1 ? 's' : ''}` : ''})` : `Walk ${displayed?.routes[i - 1] ?? 'unknown'} min`} · ` : ''}Stay about {a.durationMinutes} min</div>{transport?.lines.length ? <p className="notice">{transport.lines.join(' → ')}</p> : null}<h3>{p?.name ?? a.placeId}</h3><p>{a.reason}</p>{p?.source !== 'demo' && <a className="source-link" href={placeUrl(p)} target="_blank" rel="noreferrer">{p.source === 'amap' ? 'View on Amap' : 'OpenStreetMap source'} ↗</a>}<div className="tags">{p?.types.map(t => <span key={t}>{t}</span>)}</div>{issues.map(issue => <p className="issue" key={issue.checkId + issue.subjectIds.join(',') + issue.message}>{issue.message}</p>)}</div></article>;
      })}{!activities.length && <p className="empty">Activities will appear here as candidates are screened.</p>}</div></section>
        <section className="decisions-card"><div className="section-heading"><p className="eyebrow">Behind the plan</p><h2>Two minds. One day.</h2></div><div className="decision-list">{shown.map(e => <details className="event" key={e.sequence} open={e.type === 'repair_diff' || e.type === 'jev_query_end'}><summary><span className={`actor ${e.actor.toLowerCase()}`}>{e.actor}</span><b>{e.message}</b><small>{e.elapsedMs}ms{e.version !== undefined ? ` · v${e.version}` : ''}{e.latencyMs !== undefined ? ` · call ${e.latencyMs}ms` : ''}</small></summary>{e.context && <div className="event-detail"><p>Controller timing · v{e.context.version} · {e.context.timing.usedMinutes ?? 'unknown'} min used / {e.context.timing.availableMinutes} min available</p>{e.context.candidateRoutes.map(r => <p key={r.placeId}>{name(r.placeId)}: {r.options?.map(option => option.mode === 'walk' ? `walk ${option.durationMinutes} min` : `transit ${option.durationMinutes} min (${option.walkingMinutes} min access walk)`).join(' / ') || 'route unknown'}</p>)}</div>}{e.transportSelection && <div className="event-detail"><p>Transport decision · {e.transportSelection.selectedOptionId}</p><pre>{JSON.stringify(e.transportSelection.answers, null, 2)}</pre></div>}{e.decisions && <div className="event-detail">{e.decisions.map(decision => <p key={decision.queryId + decision.subjectId}><strong>{name(decision.subjectId)}</strong> · {decision.dimension} · {decision.choice} · confidence {Math.round(decision.confidence * 100)}%</p>)}</div>}{e.model && <p className="notice">Model: {e.model}</p>}{e.review && <div className="event-detail"><p>{e.review.model} · {e.review.scope} · {e.review.status}</p>{e.review.issues.map((issue, i) => <div key={i}><p>{issue.message}</p><p>Condition: {issue.condition}</p><p>Repair direction: {issue.repairHint}</p>{issue.evidence?.map((fact, index) => <p key={index}>{fact}</p>)}</div>)}{e.review.answers && <pre>{JSON.stringify(e.review.answers, null, 2)}</pre>}</div>}{e.before && e.after && <div className="event-detail">{e.before.map(a => { const next = e.after!.find(n => n.id === a.id); return JSON.stringify(a) === JSON.stringify(next) ? null : <p key={a.id}><del>{name(a.placeId)} · {a.durationMinutes}m</del><br /><strong>→ {next ? `${name(next.placeId)} · ${next.durationMinutes}m` : 'Removed'}</strong></p>; })}</div>}</details>)}</div></section></div>
    </section>}
  </main>;
}
function Stat({ label, value }: { label: string; value: string }) { return <div className="stat"><span>{label}</span><strong>{value}</strong></div>; }
function formatTime(start: string, offset: number) { const [h, m] = start.split(':').map(Number); const total = h * 60 + m + offset; return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`; }

function placeUrl(place: Place) { if (place.source === 'amap') return `https://uri.amap.com/marker?position=${place.longitude},${place.latitude}&name=${encodeURIComponent(place.name)}`; const [, type, id] = place.id.split(':'); return `https://www.openstreetmap.org/${({ N: 'node', W: 'way', R: 'relation' } as Record<string, string>)[type] ?? 'node'}/${id}`; }

function TimingTrace({ events, fixture }: { events: RunEvent[]; fixture: boolean }) {
  const calls = events.filter(e => (e.type === 'proposal' || e.type === 'review_end') && e.latencyMs !== undefined);
  if (!calls.length) return null;
  const origin = Math.min(...calls.map(e => e.elapsedMs - e.latencyMs!));
  const span = Math.max(1, (events.at(-1)?.elapsedMs ?? 0) - origin);
  return <section className="timing-trace" aria-label="Model call timeline">
    <div className="trace-heading"><p className="eyebrow">Working in parallel</p><span>{fixture ? 'Local simulation · not a model benchmark' : 'Measured for this request · overlapping bars ran in parallel'}</span></div>
    {(['LLM', 'Jev'] as const).map(actor => <div className="trace-row" key={actor}><b>{actor}</b><div className="trace-track">{calls.filter(e => e.actor === actor).map(e => <span key={e.sequence} className={`trace-call ${actor.toLowerCase()}`} style={{ left: `${(e.elapsedMs - e.latencyMs! - origin) / span * 100}%`, width: `${Math.max(.4, e.latencyMs! / span * 100)}%` }} title={`${actor} · v${e.version} · ${e.latencyMs}ms${e.review ? ` · ${e.review.scope}` : ''}`} />)}</div></div>)}
    <div className="trace-scale"><span>0s</span><span>{(span / 1000).toFixed(1)}s</span></div>
  </section>;
}
