/**
 * Multi-Day Trip Planner — Priority 4
 * Tasks 4.5–4.12
 *
 * Orchestrates planning for 1–7 day itineraries with overnight locations,
 * inter-day routing, and cross-day experience coherence via Jev.
 */

import type {
  Activity,
  DayBoundary,
  DaySegment,
  Issue,
  MultiDayRequest,
  MultiDaySnapshot,
  Place,
  RunEvent,
  Snapshot,
  TripRequest,
  TransportLeg,
  TransportOption,
} from './domain';
import { planTrip } from './planner';
import { RoutesProvider } from './providers/routes';
import { JevProvider } from './providers/jev';

// ─── Task 4.7: Overnight location validation ─────────────────────────────────

/**
 * Validate that the overnight place is reasonably close to the last activity
 * of the day. Returns an issue if it's too far, null if fine.
 */
export function validateOvernightLocation(
  overnightPlace: Place,
  lastActivityPlace: Place,
): Issue | null {
  const distKm = haversineKm(
    lastActivityPlace.latitude,
    lastActivityPlace.longitude,
    overnightPlace.latitude,
    overnightPlace.longitude,
  );
  if (distKm > 30) {
    return {
      checkId: 'overnight_distance',
      status: 'flag',
      subjectIds: [],
      message: `Overnight location "${overnightPlace.name}" is ${distKm.toFixed(1)} km from the last activity — this is a long end-of-day transfer.`,
      condition: 'Overnight location should be within reasonable distance of the last activity.',
      evidence: [`distance: ${distKm.toFixed(1)} km`, `last activity: ${lastActivityPlace.name}`, `overnight: ${overnightPlace.name}`],
      repairHint: 'Consider choosing a closer overnight location or reordering activities.',
    };
  }
  return null;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Task 4.8: Inter-day route calculation ────────────────────────────────────

/**
 * Calculate the route from the overnight location (end of day N)
 * to the first activity of day N+1.
 */
export async function calcInterDayRoute(
  overnightPlace: Place,
  firstNextDayPlace: Place,
  fixture: boolean,
  signal: AbortSignal,
): Promise<TransportLeg> {
  const routesProvider = new RoutesProvider(fixture, signal);
  let options: TransportOption[] = [];
  try {
    options = await routesProvider.options(overnightPlace, firstNextDayPlace);
  } catch {
    signal.throwIfAborted();
  }
  const selected = options[0] ?? null;
  return {
    fromActivityId: `overnight-day-${(overnightPlace as Place & { dayNumber?: number }).dayNumber ?? 0}`,
    toActivityId: 'first-next-day',
    fromPlaceId: overnightPlace.id,
    toPlaceId: firstNextDayPlace.id,
    selected,
    options,
  };
}

// ─── Task 4.6: Plan a single day ─────────────────────────────────────────────

/**
 * Plan one day of a multi-day trip.
 * Day 1 starts from the user origin; Day 2+ start from the previous overnight place.
 */
export async function planSingleDay(
  day: DayBoundary,
  request: MultiDayRequest,
  startingFromAddress: string,
  onEvent: (event: RunEvent) => void,
  signal: AbortSignal,
): Promise<DaySegment> {
  // Build a single-day TripRequest from the day boundary
  const dayRequest: TripRequest = {
    destination: request.destination,
    origin: startingFromAddress,
    startAt: `${day.date}T${day.startTime}:00`,
    endAt: `${day.date}T${day.endTime}:00`,
    partySize: request.partySize,
    preference: request.preference,
    constraints: request.constraints,
    mode: request.mode,
  };

  const result = await planTrip(dayRequest, onEvent, signal);

  return {
    dayNumber: day.dayNumber,
    startingFrom: startingFromAddress,
    endingAt: day.overnightPlace?.name,
    snapshot: result.snapshot,
    candidates: result.candidates,
    events: result.events,
  };
}

// ─── Task 4.5: Multi-day orchestrator ────────────────────────────────────────

/**
 * Plan a multi-day trip with 1–7 day boundaries.
 * Each day is planned independently, then inter-day routes are calculated.
 * Cross-day coherence is checked via Jev after all days are planned.
 */
export async function planMultiDayTrip(
  request: MultiDayRequest,
  onEvent: (event: RunEvent, dayNumber: number) => void = () => {},
  signal = new AbortController().signal,
): Promise<MultiDaySnapshot> {
  if (request.days.length < 1 || request.days.length > 7) {
    throw new Error('Multi-day trips must have 1–7 day boundaries.');
  }

  const jev = new JevProvider(request.mode !== 'live');
  const days = [...request.days].sort((a, b) => a.dayNumber - b.dayNumber);
  const segments: DaySegment[] = [];
  const allIssues: Issue[] = [];

  // Task 4.10: LLM context updated per day via onEvent wrapping
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    signal.throwIfAborted();

    // Determine starting location: Day 1 from user origin; Day N+1 from overnight of Day N
    const startingFrom =
      i === 0
        ? (request.origin ?? request.destination)
        : (segments[i - 1].endingAt ?? segments[i - 1].snapshot.origin?.formattedAddress ?? request.destination);

    // Emit a day-start marker event
    const dayStartEvent: Omit<RunEvent, 'sequence' | 'elapsedMs'> = {
      type: 'day_start',
      actor: 'Controller',
      message: `Planning Day ${day.dayNumber} of ${days.length}: ${day.date}, ${day.startTime}–${day.endTime}, starting from ${startingFrom}.`,
      version: i,
    };
    onEvent({ ...dayStartEvent, sequence: i * 100, elapsedMs: 0 }, day.dayNumber);

    // Task 4.11: Each day has its own independent repair budget (handled by planTrip)
    const segment = await planSingleDay(
      day,
      request,
      startingFrom,
      (event) => onEvent(event, day.dayNumber),
      signal,
    );
    segments.push(segment);

    // Task 4.7: Validate overnight location proximity
    if (day.overnightPlace && segment.snapshot.activities.length > 0) {
      const lastActivityId = segment.snapshot.activities.at(-1)!.placeId;
      const lastPlace = segment.candidates.find(p => p.id === lastActivityId);
      if (lastPlace) {
        const overnightIssue = validateOvernightLocation(day.overnightPlace, lastPlace);
        if (overnightIssue) allIssues.push(overnightIssue);
      }
    }
  }

  // Task 4.8: Calculate inter-day routes between consecutive days
  const fixture = request.mode !== 'live';
  for (let i = 0; i < segments.length - 1; i++) {
    const currentDay = days[i];
    const nextSegment = segments[i + 1];
    const overnightPlace = currentDay.overnightPlace;

    if (overnightPlace && nextSegment.snapshot.activities.length > 0) {
      const firstNextActivityId = nextSegment.snapshot.activities[0].placeId;
      const firstNextPlace = nextSegment.candidates.find(p => p.id === firstNextActivityId);
      if (firstNextPlace) {
        try {
          const interDayLeg = await calcInterDayRoute(overnightPlace, firstNextPlace, fixture, signal);
          // Attach the inter-day leg to the next day's snapshot firstLeg
          nextSegment.snapshot = {
            ...nextSegment.snapshot,
            firstLeg: interDayLeg,
          };
          const mins = interDayLeg.selected?.durationMinutes;
          onEvent({
            type: 'inter_day_route',
            actor: 'Controller',
            message: `Inter-day route Day ${currentDay.dayNumber}→${days[i + 1].dayNumber}: ${overnightPlace.name} → ${firstNextPlace.name}${mins ? `, ${mins} min` : ''}.`,
            sequence: (i + 1) * 100 + 50,
            elapsedMs: 0,
            version: i + 1,
          }, days[i + 1].dayNumber);
        } catch {
          signal.throwIfAborted();
        }
      }
    }
  }

  // Task 4.9 & 4.12: Cross-day experience coherence via Jev
  // Collect all activities across all days for similarity check
  const allActivities = segments.flatMap(s => s.snapshot.activities);
  const allCandidates = deduplicatePlaces(segments.flatMap(s => s.candidates));

  if (allActivities.length >= 2 && segments.length > 1) {
    // Sample up to 6 activities across days for the similarity query
    const sampleSize = Math.min(6, allActivities.length);
    const step = Math.max(1, Math.floor(allActivities.length / sampleSize));
    const sampled = allActivities.filter((_, idx) => idx % step === 0).slice(0, sampleSize);

    if (sampled.length >= 2) {
      try {
        const crossDayDecisions = await jev.query(
          { ...request, startAt: days[0].date + 'T' + days[0].startTime + ':00', endAt: days[days.length - 1].date + 'T' + days[days.length - 1].endTime + ':00' },
          allCandidates,
          sampled,
          { dimension: 'experience_similarity', subjectIds: sampled.map(a => a.id), scope: 'segment' },
          0,
          signal,
        );
        const repetitions = crossDayDecisions.filter(d => d.choice === 'flag');
        if (repetitions.length) {
          allIssues.push({
            checkId: 'cross_day_repetition',
            status: 'flag',
            subjectIds: repetitions.map(d => d.subjectId),
            message: `${repetitions.length} activit${repetitions.length > 1 ? 'ies' : 'y'} may create unwanted repetition across days.`,
            condition: 'Cross-day experience coherence: activities across different days should offer meaningfully distinct experiences.',
            repairHint: "Replace repeated experiences with alternatives from each day's candidate pool.",
          });
        }
      } catch {
        signal.throwIfAborted();
      }
    }
  }

  const totalActivities = segments.reduce((n, s) => n + s.snapshot.activities.length, 0);
  const hasAttention = segments.some(s => s.snapshot.issues.some(i => i.status === 'flag')) || allIssues.some(i => i.status === 'flag');

  // Attach global issues to the last day's snapshot so they surface in the UI
  if (allIssues.length && segments.length > 0) {
    const last = segments[segments.length - 1];
    segments[segments.length - 1] = {
      ...last,
      snapshot: {
        ...last.snapshot,
        issues: [...last.snapshot.issues, ...allIssues],
      },
    };
  }

  return {
    currentDay: segments.length,
    days: segments,
    totalActivities,
    status: totalActivities === 0 ? 'partial' : hasAttention ? 'needs_attention' : 'complete',
  };
}

function deduplicatePlaces(places: Place[]): Place[] {
  const seen = new Set<string>();
  return places.filter(p => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}
