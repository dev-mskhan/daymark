import type { Activity, Issue, Place, Proposal, RunEvent, RunResult, Snapshot, TransportLeg, TransportOption, TripRequest } from './domain';
import { PlacesProvider } from './providers/places';
import { RoutesProvider } from './providers/routes';
import { PlannerProvider } from './providers/planner';
import { JevProvider } from './providers/jev';
import { summarizeTiming, retainDiverseCandidates, nearbyCandidates } from './planning-context';
import type { PlanningContext } from './domain';
import { EXPERIENCE_TYPES } from './search-lenses';

export function validateProposal(proposal: Proposal, current: Activity[], candidates: Place[], repair: boolean) {
  if (new Set(proposal.activities.map(a => a.id)).size !== proposal.activities.length || new Set(proposal.activities.map(a => a.placeId)).size !== proposal.activities.length) throw new Error('活动或地点 ID 重复。');
  if (proposal.activities.some(a => !candidates.some(p => p.id === a.placeId))) throw new Error('LLM 引用了候选池之外的地点。');
  if (repair && proposal.activities.some(a => !current.some(old => old.id === a.id))) throw new Error('修复不能新增节点 ID。');
  if (!repair && (proposal.activities.length > current.length + 1 || JSON.stringify(proposal.activities.slice(0, current.length)) !== JSON.stringify(current))) throw new Error('生成节点修改了已提交的活动。');
}
export async function planTrip(request: TripRequest, onEvent: (event: RunEvent) => void = () => {}, signal = new AbortController().signal): Promise<RunResult> {
  const fixture = request.mode !== 'live';
  if (!fixture && (!process.env.LLM_API_KEY || !process.env.LLM_MODEL || !process.env.TYPESAFE_API_KEY)) throw new Error('真实模式需要配置 LLM_API_KEY、LLM_MODEL 和 TYPESAFE_API_KEY。');
  const planner = new PlannerProvider(fixture), jev = new JevProvider(fixture);
  const places = new PlacesProvider(fixture, signal);
  const routeCache = new Map<string, TransportOption[]>();
  const transportChoiceCache = new Map<string, TransportOption>();
  const events: RunEvent[] = [], started = performance.now();
  let snapshot: Snapshot = { version: 0, activities: [], routes: [], issues: [] };
  const emit = (event: Omit<RunEvent, 'sequence' | 'elapsedMs'>) => { signal.throwIfAborted(); const full = { ...event, sequence: events.length + 1, elapsedMs: Math.round(performance.now() - started) }; events.push(full); onEvent(full); };
  emit({ type: 'search', actor: 'Controller', message: fixture ? 'Replay demo: scripted places, LLM, and Jev decisions.' : 'Searching Amap for places within the destination city.' });
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
    const context: PlanningContext = { version: base.version, timing: summarizeTiming(request, base.activities, base.routes), candidateRoutes: [] };
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
    const minutes = proposal.activities.reduce((n, a) => n + a.durationMinutes, 0) + walking.reduce<number>((n, t) => n + (t ?? 0), 0);
    const available = (Date.parse(request.endAt + 'Z') - Date.parse(request.startAt + 'Z')) / 60000;
    if (minutes > available) issues.push({ checkId: 'time_window', status: 'flag', subjectIds: proposal.activities.map(a => a.id), message: `活动与已知交通共 ${minutes} 分钟，超过 ${available} 分钟的时间窗。请缩短或减少活动。`, condition: '活动时长与真实交通时间之和不得超过用户时间窗。', evidence: [JSON.stringify(summarizeTiming(request, proposal.activities, walking))], repairHint: '优先删除或替换造成最长交通的活动；保留明确必去要求，必要时减少活动数。'  });
    snapshot = { version: snapshot.version + 1, activities: proposal.activities, routes: walking, transportLegs, issues };
    emit({ type: 'snapshot', actor: 'Controller', version: snapshot.version, message: 'Draft committed. Starting node review.', snapshot });
  };
  let proposal = await propose(), repairs = 0, repaired = false, segmentRepairs = 0;
  const seen = new Set<string>();
  for (let step = 0; step < 12; step++) {
    await commit(proposal);
    const base = snapshot;
    emit({ type: 'review_start', actor: 'Jev', version: base.version, message: 'Reviewing the current node and, at stage boundaries, the whole draft.' });
    const reviewPromise = Promise.all(([ 'local', ...(base.activities.length % 2 === 0 || proposal.done || repaired ? ['global'] : []) ] as ('local' | 'global')[]).map(async scope => {
      const review = await jev.review(request, candidates, base.activities, base.version, scope, signal, proposal.done, repaired, summarizeTiming(request, base.activities, base.routes));
      emit({ type: 'review_end', actor: 'Jev', version: review.version, message: `${scope === 'local' ? 'Local' : 'Global'} review: ${review.status}`, review, latencyMs: review.latencyMs });
      return review;
    }));
    // One speculative node only. Capture rejection immediately so it cannot become unhandled.
    const speculativeAbort = new AbortController();
    const ahead = !proposal.done ? propose([], AbortSignal.any([signal, speculativeAbort.signal])).then(value => ({ value, error: null }), error => ({ value: null, error })) : null;
    const reviews = await reviewPromise;
    snapshot = { ...base, issues: [...new Map([...base.issues, ...reviews.flatMap(r => r.issues)].map(issue => [JSON.stringify([issue.checkId, issue.status, issue.subjectIds]), issue])).values()] };
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
  emit({ type: 'complete', actor: 'Controller', version: snapshot.version, message: 'Planning complete. Opening hours, origin/destination travel, and timezone remain unverified; this is still a draft.', snapshot });
  return result;
}

function contentFingerprint(activities: Activity[]) { return JSON.stringify(activities.map(({ id, placeId, durationMinutes }) => ({ id, placeId, durationMinutes }))); }
