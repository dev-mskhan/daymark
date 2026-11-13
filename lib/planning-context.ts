import type { Activity, Place, TimingContext, TripRequest } from './domain';

export function summarizeTiming(request: TripRequest, activities: Activity[], routes: (number | null)[], firstLegMinutes: number | null = null, returnLegMinutes: number | null = null): TimingContext {
  const availableMinutes = (Date.parse(request.endAt + 'Z') - Date.parse(request.startAt + 'Z')) / 60000;
  const activityMinutes = activities.reduce((sum, a) => sum + a.durationMinutes, 0);
  const legs = activities.slice(1).map((a, i) => ({ fromActivityId: activities[i].id, toActivityId: a.id, fromPlaceId: activities[i].placeId, toPlaceId: a.placeId, durationMinutes: routes[i] ?? null }));
  const knownTravelMinutes = legs.reduce((sum, leg) => sum + (leg.durationMinutes ?? 0), 0) + (firstLegMinutes ?? 0) + (returnLegMinutes ?? 0);
  const minimumUsedMinutes = activityMinutes + knownTravelMinutes;
  const complete = legs.every(leg => leg.durationMinutes !== null) && (firstLegMinutes !== null || !request.origin) && (returnLegMinutes !== null || !request.origin);
  return { availableMinutes, activityMinutes, knownTravelMinutes, minimumUsedMinutes, remainingUpperBoundMinutes: availableMinutes - minimumUsedMinutes, usedMinutes: complete ? minimumUsedMinutes : null, remainingMinutes: complete ? availableMinutes - minimumUsedMinutes : null, legs };
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
