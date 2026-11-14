import type { Activity, ActivitySchedule, Place, TimingContext, TripRequest } from './domain';

export function summarizeTiming(request: TripRequest, activities: Activity[], routes: (number | null)[], firstLegMinutes: number | null = null, returnLegMinutes: number | null = null, candidates?: Place[]): TimingContext {
  const availableMinutes = (Date.parse(request.endAt + 'Z') - Date.parse(request.startAt + 'Z')) / 60000;
  const activityMinutes = activities.reduce((sum, a) => sum + a.durationMinutes, 0);
  const legs = activities.slice(1).map((a, i) => ({ fromActivityId: activities[i].id, toActivityId: a.id, fromPlaceId: activities[i].placeId, toPlaceId: a.placeId, durationMinutes: routes[i] ?? null }));
  const knownTravelMinutes = legs.reduce((sum, leg) => sum + (leg.durationMinutes ?? 0), 0) + (firstLegMinutes ?? 0) + (returnLegMinutes ?? 0);
  const minimumUsedMinutes = activityMinutes + knownTravelMinutes;
  const complete = legs.every(leg => leg.durationMinutes !== null) && (firstLegMinutes !== null || !request.origin) && (returnLegMinutes !== null || !request.origin);

  // Task 2.6-2.7: Extract and validate timezone consistency
  const { timezone, timezoneVerified } = extractTimezone(activities, candidates);

  return { availableMinutes, activityMinutes, knownTravelMinutes, minimumUsedMinutes, remainingUpperBoundMinutes: availableMinutes - minimumUsedMinutes, usedMinutes: complete ? minimumUsedMinutes : null, remainingMinutes: complete ? availableMinutes - minimumUsedMinutes : null, legs, timezone, timezoneVerified };
}

/** Extract the dominant timezone and whether all places agree on it. Task 2.6 */
export function extractTimezone(activities: Activity[], candidates?: Place[]): { timezone: string | undefined; timezoneVerified: boolean } {
  if (!candidates || !activities.length) return { timezone: undefined, timezoneVerified: false };
  const timezones = activities.flatMap(a => {
    const place = candidates.find(p => p.id === a.placeId);
    return place?.timezone ? [place.timezone] : [];
  });
  if (!timezones.length) return { timezone: undefined, timezoneVerified: false };
  const unique = [...new Set(timezones)];
  return { timezone: unique[0], timezoneVerified: unique.length === 1 };
}

export function category(place: Place): string {
  if (place.types.some(t => /restaurant|cafe|food|market/.test(t))) return 'food';
  if (place.types.some(t => /park|garden|nature/.test(t))) return 'rest';
  if (place.types.some(t => /museum|gallery|art/.test(t))) return 'art';
  if (place.types.some(t => /shop|books|street|neighborhood/.test(t))) return 'local';
  return 'sights';
}

// Keep semantic labels without treating weak interest fit as a hard exclusion.
export function retainDiverseCandidates(labelled: Place[]): Place[] {
  const kept = labelled.filter(p => p.screeningLabel !== 'alternative');
  for (const group of ['food', 'rest', 'art', 'local', 'sights']) {
    const options = labelled.filter(p => category(p) === group);
    for (const place of options.slice(0, 2)) if (!kept.some(p => p.id === place.id)) kept.push(place);
  }
  return kept.length >= 4 ? kept : labelled;
}

export function nearbyCandidates(candidates: Place[], from: Place, usedIds: Set<string>): Place[] {
  const distance = (p: Place) => Math.hypot((p.latitude - from.latitude) * 111, (p.longitude - from.longitude) * 111 * Math.cos(from.latitude * Math.PI / 180));
  const sorted = candidates.filter(p => !usedIds.has(p.id)).sort((a, b) => distance(a) - distance(b));
  const picked = sorted.slice(0, 3);
  for (const group of ['food', 'rest', 'local']) {
    const place = sorted.find(p => category(p) === group);
    if (place && !picked.some(p => p.id === place.id)) picked.push(place);
  }
  return picked;
}

/** Task 2.9: Build the caveat notice dynamically from what is and isn't verified. */
export function buildCaveatNotice(snapshot: import('./domain').Snapshot, candidates: Place[]): string {
  const { activities, firstLeg, returnLeg, origin } = snapshot;
  const unverified: string[] = [];

  // Check opening hours: any activity without formattedOpeningHours
  const placesWithoutHours = activities.filter(a => {
    const p = candidates.find(c => c.id === a.placeId);
    return !p?.formattedOpeningHours;
  });
  if (placesWithoutHours.length) {
    const count = placesWithoutHours.length;
    unverified.push(count === activities.length ? 'opening hours' : `opening hours for ${count} venue${count > 1 ? 's' : ''}`);
  }

  // Check origin/return travel
  const hasOriginTravel = origin && firstLeg?.selected && returnLeg?.selected;
  if (!hasOriginTravel) unverified.push('origin/destination travel');

  // Check timezone
  const { timezoneVerified, timezone } = extractTimezone(activities, candidates);
  if (candidates.some(c => activities.some(a => a.placeId === c.id) && c.timezone)) {
    // We have some timezone data — check consistency
    if (!timezoneVerified) {
      const timezones = activities.flatMap(a => {
        const p = candidates.find(c => c.id === a.placeId);
        return p?.timezone ? [p.timezone] : [];
      });
      const unique = [...new Set(timezones)];
      if (unique.length > 1) {
        unverified.push('time zone consistency (multi-timezone itinerary)');
      } else {
        unverified.push('time zone');
      }
    }
  } else {
    unverified.push('time zone');
  }

  void timezone; // used via extractTimezone above

  if (!unverified.length) {
    return 'Visit durations are estimates. Routes, opening hours, and time zones verified from provider data.';
  }
  const list = unverified.join(', ');
  return `Draft. Visit durations are estimates. Not verified: ${list}.`;
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

/**
 * Task 3.4-3.5: Build a detailed schedule with ISO timestamps per activity.
 * Uses the trip's startAt date + accumulated activity/travel time to compute
 * when each activity is scheduled to start and end.
 */
export function buildDetailedSchedule(
  request: TripRequest,
  activities: Activity[],
  routes: (number | null)[],
  firstLegMinutes: number | null = null,
): ActivitySchedule[] {
  const baseMs = Date.parse(request.startAt + 'Z');
  if (!Number.isFinite(baseMs)) return [];

  let offsetMinutes = firstLegMinutes ?? 0;
  return activities.map((activity, i) => {
    if (i > 0) {
      offsetMinutes += routes[i - 1] ?? 0;
    }
    const startMs = baseMs + offsetMinutes * 60_000;
    const endMs = startMs + activity.durationMinutes * 60_000;
    const dayOfWeek = DAY_NAMES[new Date(startMs).getUTCDay()];
    offsetMinutes += activity.durationMinutes;
    return {
      activityId: activity.id,
      placeId: activity.placeId,
      scheduledStart: new Date(startMs).toISOString(),
      scheduledEnd: new Date(endMs).toISOString(),
      dayOfWeek,
      durationMinutes: activity.durationMinutes,
    };
  });
}

/** Task 3.7: Detect accessibility constraints from free-text user input. */
export function detectAccessibilityConstraints(constraints?: string): boolean {
  if (!constraints) return false;
  return /wheelchair|accessible|accessibility|mobility|disabled|disability|elevator|lift|stroller/i.test(constraints);
}
