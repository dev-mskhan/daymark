import type { Activity, Issue, Place, Proposal, RunEvent, RunResult, Snapshot, TransportLeg, TransportOption, TripRequest } from './domain';
import { PlacesProvider } from './providers/places';
import { RoutesProvider } from './providers/routes';
import { PlannerProvider } from './providers/planner';
import { JevProvider } from './providers/jev';
import { PlaceDetailsProvider } from './providers/place-details';
import { summarizeTiming, retainDiverseCandidates, nearbyCandidates, buildCaveatNotice, detectAccessibilityConstraints } from './planning-context';
import type { PlanningContext } from './domain';
import { EXPERIENCE_TYPES } from './search-lenses';

export function validateProposal(proposal: Proposal, current: Activity[], candidates: Place[], repair: boolean) {
  if (new Set(proposal.activities.map(a => a.id)).size !== proposal.activities.length || new Set(proposal.activities.map(a => a.placeId)).size !== proposal.activities.length) {
    throw new Error('Some activities or places are duplicated in the plan. Please try again.');
  }
  if (proposal.activities.some(a => !candidates.some(p => p.id === a.placeId))) {
    throw new Error('The planner referenced a place that is not in the candidate list. Please try again.');
  }
  if (repair && proposal.activities.some(a => !current.some(old => old.id === a.id))) {
    throw new Error('Cannot add new activities during a repair. Please try planning from scratch.');
  }
  if (!repair && (proposal.activities.length > current.length + 1 || JSON.stringify(proposal.activities.slice(0, current.length)) !== JSON.stringify(current))) {
    throw new Error('The planner modified already committed activities. Please try again.');
  }
}
export async function planTrip(request: TripRequest, onEvent: (event: RunEvent) => void = () => {}, signal = new AbortController().signal): Promise<RunResult> {
  const fixture = request.mode !== 'live';
  if (!fixture && (!process.env.GROQ_API_KEY || !process.env.GROQ_MODEL || !(process.env.JEV_API_KEY ?? process.env.TYPESAFE_API_KEY))) throw new Error('Live mode requires GROQ_API_KEY, GROQ_MODEL, and JEV_API_KEY.');
  const planner = new PlannerProvider(fixture), jev = new JevProvider(fixture);
  const places = new PlacesProvider(fixture, signal);
  const detailsProvider = new PlaceDetailsProvider(fixture, signal);
  const routeCache = new Map<string, TransportOption[]>();
  const transportChoiceCache = new Map<string, TransportOption>();
  const events: RunEvent[] = [], started = performance.now();
  let snapshot: Snapshot = { version: 0, activities: [], routes: [], issues: [] };
  const emit = (event: Omit<RunEvent, 'sequence' | 'elapsedMs'>) => { signal.throwIfAborted(); const full = { ...event, sequence: events.length + 1, elapsedMs: Math.round(performance.now() - started) }; events.push(full); onEvent(full); };
  
  // Geocode origin if provided
  let originPoint: { latitude: number; longitude: number; formattedAddress: string } | undefined;
  if (request.origin) {
    emit({ type: 'geocode_start', actor: 'Controller', message: `Geocoding origin: ${request.origin}` });
    try {
      const geocoded = await places.geocode(request.origin);
      originPoint = { latitude: geocoded.latitude, longitude: geocoded.longitude, formattedAddress: geocoded.formattedAddress };
      emit({ type: 'geocode_end', actor: 'Controller', message: `Origin located: ${geocoded.formattedAddress} (${geocoded.confidence} confidence)` });
    } catch (error) {
      signal.throwIfAborted();
      emit({ type: 'geocode_error', actor: 'Controller', message: `Could not geocode origin: ${error instanceof Error ? error.message : 'unknown error'}` });
    }
  }
  
  emit({ type: 'search', actor: 'Controller', message: fixture ? 'Replay demo: scripted places, LLM, and Jev decisions.' : `Searching for places around ${request.destination}, starting from ${request.origin ?? 'the destination center'}.` });
  const candidates = await places.discover(request.destination, EXPERIENCE_TYPES);
  emit({ type: 'candidates', actor: 'Controller', message: `Found ${candidates.length} candidates. Opening hours and experience details remain unverified.`, candidates });
  emit({ type: 'screen_start', actor: 'Jev', message: 'Screening candidates against explicit interests.' });
  let pool = candidates;
  try {
    const screened = await jev.screen(request, candidates, signal);
    const labelled = screened.map(p => ({ ...p.place, screeningLabel: p.label }));
    pool = retainDiverseCandidates(labelled);
    emit({ type: 'screen_end', actor: 'Jev', message: screened.map(p => `${p.place.name}: ${p.label}`).join(' · ') });
  } catch { signal.throwIfAborted(); emit({ type: 'screen_unknown', actor: 'Jev', message: 'Candidate screening was unavailable. All candidates remain, marked unknown.' }); }
  
  // Task 2.5: Enrich priority candidates with opening hours, timezone, etc.
  emit({ type: 'enrich_start', actor: 'Controller', message: 'Fetching opening hours and place details for candidates.' });
  try {
    const priorityCandidates = pool.slice(0, 15); // enrich top candidates only
    const enriched = await detailsProvider.enrichCandidates(priorityCandidates);
    const enrichedIds = new Set(enriched.map(p => p.id));
    // Replace originals with enriched versions in pool and candidates arrays
    const enrichedMap = new Map(enriched.map(p => [p.id, p]));
    pool = pool.map(p => enrichedMap.get(p.id) ?? p);
    for (let i = 0; i < candidates.length; i++) {
      if (enrichedIds.has(candidates[i].id)) candidates[i] = enrichedMap.get(candidates[i].id)!;
    }
    const verifiedCount = enriched.filter(p => p.formattedOpeningHours).length;
    emit({ type: 'enrich_end', actor: 'Controller', message: `Opening hours verified for ${verifiedCount} of ${priorityCandidates.length} candidates.` });
  } catch { signal.throwIfAborted(); emit({ type: 'enrich_unknown', actor: 'Controller', message: 'Place details enrichment was unavailable. Opening hours unverified.' }); }
  const routeOptions = async (from: Place, to: Place, routeSignal = signal): Promise<TransportOption[]> => {
    const key = `${from.id}|${to.id}`;
    if (routeCache.has(key)) return routeCache.get(key)!;
    try {
      const options = await new RoutesProvider(fixture, routeSignal).options(from, to);
      routeCache.set(key, options);
      return options;
    } catch { routeSignal.throwIfAborted(); return []; }
  };
  const propose = async (issues: Issue[] = [], proposalSignal = signal) => {
    const base = snapshot;
    emit({ type: issues.length ? 'repair_start' : 'planning_start', actor: 'LLM', version: base.version, message: issues.length ? 'Revising the current draft from review feedback.' : `Planning activity ${base.activities.length + 1}.` });
    const context: PlanningContext = { version: base.version, timing: summarizeTiming(request, base.activities, base.routes, null, null, candidates), candidateRoutes: [] };
    let proposalPool = pool;
    if (!issues.length && base.activities.length && !fixture) {
      emit({ type: 'route_context', actor: 'Controller', version: base.version, message: 'Loading walking and transit options for nearby candidates.' });
      const last = candidates.find(p => p.id === base.activities.at(-1)!.placeId)!;
      const shortlist = nearbyCandidates(pool, last, new Set(base.activities.map(a => a.placeId)));
      for (let i = 0; i < shortlist.length; i += 2) {
        const hints = await Promise.all(shortlist.slice(i, i + 2).map(async place => {
          const options = await routeOptions(last, place, proposalSignal);
          const durationMinutes = options[0]?.durationMinutes ?? null;
          return { placeId: place.id, fromPlaceId: last.id, durationMinutes, remainingAfterTravelMinutes: durationMinutes !== null && context.timing.remainingMinutes !== null ? context.timing.remainingMinutes - durationMinutes : null, options };
        }));
        context.candidateRoutes.push(...hints);
      }
      proposalPool = [...pool.filter(p => base.activities.some(a => a.placeId === p.id)), ...shortlist];
    }
    proposalSignal.throwIfAborted();
    emit({ type: 'planning_context', actor: 'Controller', version: base.version, message: `Planner context: ${context.timing.activityMinutes} min of activities, ${context.timing.knownTravelMinutes} min of known travel, ${context.timing.remainingMinutes ?? 'unknown'} min remaining.`, context });
    const start = performance.now();
    let result: Proposal | undefined;
    let validationFeedback: string | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (issues.length) {
          result = await planner.propose(request, proposalPool, base.activities, issues, proposalSignal, validationFeedback, context);
        } else {
          let action = await planner.nextAction(request, proposalPool, base.activities, proposalSignal, validationFeedback, context, [], true);
          if (action.action === 'ask_jev') {
            emit({ type: 'jev_query_start', actor: 'LLM', version: base.version, message: `Asking Jev about ${action.query.dimension} across ${action.query.subjectIds.length} subjects.`, model: action.model });
            const queryStarted = performance.now();
            const decisions = await jev.query(request, pool, base.activities, action.query, base.version, proposalSignal);
            emit({ type: 'jev_query_end', actor: 'Jev', version: base.version, message: `Returned ${decisions.length} typed decisions. The LLM continues planning.`, decisions, latencyMs: Math.round(performance.now() - queryStarted), model: decisions[0]?.model });
            action = await planner.nextAction(request, proposalPool, base.activities, proposalSignal, validationFeedback, context, decisions, false);
          }
          if (action.action !== 'proposal') throw new Error('Jev 查询后必须提交活动或结束。');
          result = action.proposal;
        }
        proposalSignal.throwIfAborted();
        if (!issues.length && result.done && result.activities.length < 3 && context.timing.availableMinutes >= 360 && (context.timing.remainingMinutes ?? 0) >= 180) throw new Error('行程结束得过早：长时间窗仍剩至少 3 小时且少于 3 个活动。请继续覆盖用户明确兴趣，保留合理自由时间即可。');
        validateProposal(result, base.activities, pool, issues.length > 0);
        break;
      } catch (error) {
        proposalSignal.throwIfAborted();
        if (attempt === 1) throw error;
        validationFeedback = error instanceof Error ? error.message : 'Invalid proposal; check the required JSON schema.';
        emit({ type: 'retry', actor: 'LLM', version: base.version, message: `Generation failed validation. Retrying once without changing the draft: ${validationFeedback}` });
      }
    }
    if (!result) throw new Error('LLM 未返回有效方案。');
    emit({ type: 'proposal', actor: 'LLM', version: base.version, message: 'Structured proposal returned for controller validation.', model: result.model ?? 'fixture-script', latencyMs: Math.round(performance.now() - start) });
    return result;
  };
  const commit = async (proposal: Proposal) => {
    const walking: (number | null)[] = [];
    const transportLegs: TransportLeg[] = [];
    
    // Calculate first leg from origin if available
    let firstLeg: TransportLeg | undefined;
    if (originPoint && proposal.activities.length > 0) {
      const firstPlace = candidates.find(p => p.id === proposal.activities[0].placeId)!;
      const originAsPlace: Place = { id: 'origin', name: originPoint.formattedAddress, address: originPoint.formattedAddress, latitude: originPoint.latitude, longitude: originPoint.longitude, types: [], source: 'demo' };
      const options = await routeOptions(originAsPlace, firstPlace);
      let selected: TransportOption | null = null;
      if (options.length) {
        const choiceKey = `origin|${firstPlace.id}|${request.preference}`;
        selected = transportChoiceCache.get(choiceKey) ?? null;
        if (!selected) {
          const selectionStarted = performance.now();
          const selection = await jev.chooseTransport(request, options, snapshot.version, signal);
          selected = options.find(option => option.id === selection.selectedOptionId) ?? options[0];
          transportChoiceCache.set(choiceKey, selected);
          emit({ type: 'transport_selection', actor: 'Jev', version: snapshot.version, message: `Origin → ${firstPlace.name}: selected ${selected.mode === 'walk' ? 'walking' : 'public transit'}, ${selected.durationMinutes} min.`, transportSelection: selection, latencyMs: Math.round(performance.now() - selectionStarted), model: selection.model });
        }
      }
      firstLeg = { fromActivityId: 'origin', toActivityId: proposal.activities[0].id, fromPlaceId: 'origin', toPlaceId: firstPlace.id, selected, options };
    }
    
    for (let i = 1; i < proposal.activities.length; i++) {
      const pair = proposal.activities.slice(i - 1, i + 1).map(a => candidates.find(p => p.id === a.placeId)!);
      const options = await routeOptions(pair[0], pair[1]);
      let selected: TransportOption | null = null;
      if (options.length) {
        const choiceKey = `${pair[0].id}|${pair[1].id}|${request.preference}`;
        selected = transportChoiceCache.get(choiceKey) ?? null;
        if (!selected) {
          const selectionStarted = performance.now();
          const selection = await jev.chooseTransport(request, options, snapshot.version, signal);
          selected = options.find(option => option.id === selection.selectedOptionId) ?? options[0];
          transportChoiceCache.set(choiceKey, selected);
          emit({ type: 'transport_selection', actor: 'Jev', version: snapshot.version, message: `${pair[0].name} → ${pair[1].name}: selected ${selected.mode === 'walk' ? 'walking' : 'public transit'}, ${selected.durationMinutes} min.`, transportSelection: selection, latencyMs: Math.round(performance.now() - selectionStarted), model: selection.model });
        }
      }
      walking.push(selected?.durationMinutes ?? null);
      transportLegs.push({ fromActivityId: proposal.activities[i - 1].id, toActivityId: proposal.activities[i].id, fromPlaceId: pair[0].id, toPlaceId: pair[1].id, selected, options });
    }
    
    // Calculate return leg to origin if available
    let returnLeg: TransportLeg | undefined;
    if (originPoint && proposal.activities.length > 0) {
      const lastPlace = candidates.find(p => p.id === proposal.activities.at(-1)!.placeId)!;
      const originAsPlace: Place = { id: 'origin', name: originPoint.formattedAddress, address: originPoint.formattedAddress, latitude: originPoint.latitude, longitude: originPoint.longitude, types: [], source: 'demo' };
      const options = await routeOptions(lastPlace, originAsPlace);
      let selected: TransportOption | null = null;
      if (options.length) {
        const choiceKey = `${lastPlace.id}|origin|${request.preference}`;
        selected = transportChoiceCache.get(choiceKey) ?? null;
        if (!selected) {
          const selectionStarted = performance.now();
          const selection = await jev.chooseTransport(request, options, snapshot.version, signal);
          selected = options.find(option => option.id === selection.selectedOptionId) ?? options[0];
          transportChoiceCache.set(choiceKey, selected);
          emit({ type: 'transport_selection', actor: 'Jev', version: snapshot.version, message: `${lastPlace.name} → Origin: selected ${selected.mode === 'walk' ? 'walking' : 'public transit'}, ${selected.durationMinutes} min.`, transportSelection: selection, latencyMs: Math.round(performance.now() - selectionStarted), model: selection.model });
        }
      }
      returnLeg = { fromActivityId: proposal.activities.at(-1)!.id, toActivityId: 'origin', fromPlaceId: lastPlace.id, toPlaceId: 'origin', selected, options };
    }
    
    // Prepare next-node facts before dispatching reviewer and planner together.
    // This keeps route I/O out of the model-overlap interval; no artificial delay.
    if (!fixture && !proposal.done && proposal.activities.length) {
      const last = candidates.find(p => p.id === proposal.activities.at(-1)!.placeId)!;
      const shortlist = nearbyCandidates(pool, last, new Set(proposal.activities.map(a => a.placeId)));
      emit({ type: 'route_context', actor: 'Controller', message: 'Preparing route facts before the LLM and Jev run in parallel.' });
      for (let i = 0; i < shortlist.length; i += 2) await Promise.all(shortlist.slice(i, i + 2).map(p => routeOptions(last, p)));
    }
    const issues: Issue[] = [];
    if (walking.includes(null)) issues.push({ checkId: 'route_unknown', status: 'unknown', subjectIds: [], message: '部分交通时间待核实。' });
    if (firstLeg && !firstLeg.selected) issues.push({ checkId: 'first_leg_unknown', status: 'unknown', subjectIds: [], message: 'Travel from origin to first stop not verified.' });
    if (returnLeg && !returnLeg.selected) issues.push({ checkId: 'return_leg_unknown', status: 'unknown', subjectIds: [], message: 'Return travel from last stop to origin not verified.' });
    const fullJourneyMinutes = (firstLeg?.selected?.durationMinutes ?? 0) + proposal.activities.reduce((n, a) => n + a.durationMinutes, 0) + walking.reduce<number>((n, t) => n + (t ?? 0), 0) + (returnLeg?.selected?.durationMinutes ?? 0);
    const available = (Date.parse(request.endAt + 'Z') - Date.parse(request.startAt + 'Z')) / 60000;
    if (fullJourneyMinutes > available) issues.push({ checkId: 'time_window', status: 'flag', subjectIds: proposal.activities.map(a => a.id), message: `Full journey ${fullJourneyMinutes} min exceeds ${available} min window. Shorten or reduce activities.`, condition: 'Full journey including origin and return travel must fit the time window.', evidence: [JSON.stringify(summarizeTiming(request, proposal.activities, walking, firstLeg?.selected?.durationMinutes ?? null, returnLeg?.selected?.durationMinutes ?? null, candidates))], repairHint: 'Remove or shorten activities causing longest routes; keep must-visit requirements, reduce count if needed.'  });
    snapshot = { version: snapshot.version + 1, activities: proposal.activities, routes: walking, transportLegs, issues, origin: originPoint, firstLeg, returnLeg };
    emit({ type: 'snapshot', actor: 'Controller', version: snapshot.version, message: 'Draft committed. Starting node review.', snapshot });
  };
  let proposal = await propose(), repairs = 0, repaired = false, segmentRepairs = 0;
  const seen = new Set<string>();
  for (let step = 0; step < 12; step++) {
    await commit(proposal);
    const base = snapshot;
    emit({ type: 'review_start', actor: 'Jev', version: base.version, message: 'Reviewing the current node and, at stage boundaries, the whole draft.' });
    const reviewPromise = Promise.all(([ 'local', ...(base.activities.length % 2 === 0 || proposal.done || repaired ? ['global'] : []) ] as ('local' | 'global')[]).map(async scope => {
      const review = await jev.review(request, candidates, base.activities, base.version, scope, signal, proposal.done, repaired, summarizeTiming(request, base.activities, base.routes, null, null, candidates));
      emit({ type: 'review_end', actor: 'Jev', version: review.version, message: `${scope === 'local' ? 'Local' : 'Global'} review: ${review.status}`, review, latencyMs: review.latencyMs });
      return review;
    }));

    // Task 3.6, 3.11: Opening hours validation — run on global reviews and final draft
    const hoursValidationPromise = (proposal.done || base.activities.length % 2 === 0 || repaired)
      ? jev.validateOpeningHours(request, candidates, base.activities, base.routes, base.version, signal, snapshot.firstLeg?.selected?.durationMinutes ?? null)
          .then(issues => {
            if (issues.length) emit({ type: 'opening_hours_check', actor: 'Jev', version: base.version, message: `Opening hours check: ${issues.filter(i => i.status === 'flag').length} conflict(s), ${issues.filter(i => i.status === 'unknown').length} unknown.` });
            return issues;
          })
          .catch(error => { signal.throwIfAborted(); throw error; })
      : Promise.resolve([] as Issue[]);

    // Task 3.8, 3.12: Accessibility validation — only when constraints mention accessibility
    const accessibilityValidationPromise = (proposal.done && detectAccessibilityConstraints(request.constraints))
      ? jev.validateAccessibility(request, candidates, base.activities, base.version, signal)
          .then(issues => {
            if (issues.length) emit({ type: 'accessibility_check', actor: 'Jev', version: base.version, message: `Accessibility check: ${issues.filter(i => i.status === 'flag').length} concern(s).` });
            return issues;
          })
          .catch(error => { signal.throwIfAborted(); throw error; })
      : Promise.resolve([] as Issue[]);
    // One speculative node only. Capture rejection immediately so it cannot become unhandled.
    const speculativeAbort = new AbortController();
    const ahead = !proposal.done ? propose([], AbortSignal.any([signal, speculativeAbort.signal])).then(value => ({ value, error: null }), error => ({ value: null, error })) : null;
    const [reviews, hoursIssues, accessibilityIssues] = await Promise.all([reviewPromise, hoursValidationPromise, accessibilityValidationPromise]);
    const allNewIssues = [...reviews.flatMap(r => r.issues), ...hoursIssues, ...accessibilityIssues];
    snapshot = { ...base, issues: [...new Map([...base.issues, ...allNewIssues].map(issue => [JSON.stringify([issue.checkId, issue.status, issue.subjectIds]), issue])).values()] };
    emit({ type: 'snapshot', actor: 'Controller', version: snapshot.version, message: 'Review results attached to the current version.', snapshot });
    const flagged = snapshot.issues.filter(i => i.status === 'flag');
    if (flagged.length) {
      if (ahead) { speculativeAbort.abort(); await ahead; emit({ type: 'discard', actor: 'Controller', version: base.version, message: '已丢弃提前生成的节点，先处理当前版本问题。' }); }
      const fingerprint = contentFingerprint(base.activities);
      if (repairs >= 4 || segmentRepairs >= 2 || seen.has(fingerprint)) { emit({ type: 'stopped', actor: 'Controller', message: '达到修复预算或检测到重复草稿，保留未解决项。' }); break; }
      seen.add(fingerprint); repairs++; segmentRepairs++;
      let fixed: Proposal;
      try { fixed = await propose(flagged); }
      catch {
        signal.throwIfAborted();
        snapshot = { ...snapshot, issues: [...snapshot.issues, { checkId: 'repair_unavailable', subjectIds: [], status: 'unknown', message: '模型修复两次均未返回有效结构，已保留当前草稿和待解决问题。' }] };
        emit({ type: 'stopped', actor: 'Controller', version: snapshot.version, message: '修复未完成，保留当前草稿。', snapshot });
        break;
      }
      if (contentFingerprint(fixed.activities) === fingerprint) { emit({ type: 'stopped', actor: 'Controller', message: '修复未改变草稿，停止重复尝试。' }); break; }
      emit({ type: 'repair_diff', actor: 'LLM', version: base.version, message: `Repair ${repairs} complete. Rechecking the draft.`, before: base.activities, after: fixed.activities });
      proposal = fixed; repaired = true;
    } else {
      if (proposal.done) break;
      const next = await ahead!;
      if (next.error) throw next.error;
      if (!next.value || (!next.value.done && JSON.stringify(next.value.activities) === JSON.stringify(base.activities))) break;
      proposal = next.value; repaired = false; segmentRepairs = 0;
    }
  }
  if (!proposal.done) snapshot = { ...snapshot, issues: [...snapshot.issues, { checkId: 'incomplete', status: 'unknown', subjectIds: [], message: '规划提前停止，当前行程尚未完成。' }] };
  const result: RunResult = { status: 'needs_attention', snapshot, candidates, events };
  const caveatMessage = buildCaveatNotice(snapshot, candidates);
  emit({ type: 'complete', actor: 'Controller', version: snapshot.version, message: `Planning complete. ${caveatMessage}`, snapshot });
  return result;
}

function contentFingerprint(activities: Activity[]) { return JSON.stringify(activities.map(({ id, placeId, durationMinutes }) => ({ id, placeId, durationMinutes }))); }
