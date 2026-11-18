/**
 * Itinerary editing operations: remove activities, adjust durations, reorder stops.
 * Each operation recalculates routes and validates timing.
 */

import type { Activity, Place, Snapshot, TransportLeg, TransportOption, Issue } from './domain';
import { RoutesProvider } from './providers/routes';

export interface EditOperation {
  type: 'remove' | 'adjust_duration' | 'reorder';
  activityId: string;
  newDuration?: number;
  newIndex?: number;
}

/**
 * Apply an edit operation to the current itinerary snapshot.
 * Returns a new snapshot with updated activities, routes, and timing issues.
 */
export async function applyEdit(
  operation: EditOperation,
  current: Snapshot,
  candidates: Place[],
  mode: 'fixture' | 'live'
): Promise<Snapshot> {
  const updated: Snapshot = {
    ...current,
    version: current.version + 1
  };

  switch (operation.type) {
    case 'remove':
      updated.activities = current.activities.filter(
        a => a.id !== operation.activityId
      );
      break;

    case 'adjust_duration':
      if (operation.newDuration === undefined || operation.newDuration < 15) {
        throw new Error('Duration must be at least 15 minutes');
      }
      updated.activities = current.activities.map(a =>
        a.id === operation.activityId
          ? { ...a, durationMinutes: operation.newDuration! }
          : a
      );
      break;

    case 'reorder':
      if (operation.newIndex === undefined) {
        throw new Error('New index is required for reorder operation');
      }
      const activity = current.activities.find(a => a.id === operation.activityId);
      if (!activity) {
        throw new Error('Activity not found');
      }
      const withoutActivity = current.activities.filter(a => a.id !== operation.activityId);
      updated.activities = [
        ...withoutActivity.slice(0, operation.newIndex),
        activity,
        ...withoutActivity.slice(operation.newIndex)
      ];
      break;

    default:
      throw new Error(`Unknown edit operation: ${(operation as any).type}`);
  }

  // Recalculate routes between consecutive activities
  if (updated.activities.length > 0) {
    updated.routes = await recalculateRoutes(
      updated.activities,
      candidates,
      mode,
      current.origin
    );
    
    // Recalculate first leg if we have an origin
    if (current.origin && current.firstLeg) {
      const firstPlace = candidates.find(p => p.id === updated.activities[0].placeId);
      if (firstPlace) {
        const originAsPlace: Place = {
          id: 'origin',
          name: current.origin.formattedAddress,
          address: current.origin.formattedAddress,
          latitude: current.origin.latitude,
          longitude: current.origin.longitude,
          types: [],
          source: 'geoapify'
        };
        
        const routes = new RoutesProvider(mode === 'fixture');
        const options = await routes.options(originAsPlace, firstPlace);
        if (options.length > 0) {
          updated.firstLeg = {
            fromActivityId: 'origin',
            toActivityId: updated.activities[0].id,
            fromPlaceId: 'origin',
            toPlaceId: updated.activities[0].placeId,
            selected: options[0],
            options
          };
        }
      }
    }
    
    // Recalculate return leg if we have an origin
    if (current.origin && current.returnLeg && updated.activities.length > 0) {
      const lastPlace = candidates.find(
        p => p.id === updated.activities[updated.activities.length - 1].placeId
      );
      if (lastPlace) {
        const originAsPlace: Place = {
          id: 'origin',
          name: current.origin.formattedAddress,
          address: current.origin.formattedAddress,
          latitude: current.origin.latitude,
          longitude: current.origin.longitude,
          types: [],
          source: 'geoapify'
        };
        
        const routes = new RoutesProvider(mode === 'fixture');
        const options = await routes.options(lastPlace, originAsPlace);
        if (options.length > 0) {
          updated.returnLeg = {
            fromActivityId: updated.activities[updated.activities.length - 1].id,
            toActivityId: 'origin',
            fromPlaceId: updated.activities[updated.activities.length - 1].placeId,
            toPlaceId: 'origin',
            selected: options[0],
            options
          };
        }
      }
    }
  } else {
    updated.routes = [];
    updated.firstLeg = undefined;
    updated.returnLeg = undefined;
  }

  // Validate timing
  updated.issues = validateTiming(updated);

  return updated;
}

/**
 * Recalculate routes between consecutive activities.
 * Returns array of travel times in minutes (or null if route unavailable).
 */
async function recalculateRoutes(
  activities: Activity[],
  candidates: Place[],
  mode: 'fixture' | 'live',
  origin?: { latitude: number; longitude: number; formattedAddress: string }
): Promise<(number | null)[]> {
  if (activities.length <= 1) return [];

  const routes = new RoutesProvider(mode === 'fixture');
  const travelTimes: (number | null)[] = [];

  for (let i = 0; i < activities.length - 1; i++) {
    const fromPlace = candidates.find(p => p.id === activities[i].placeId);
    const toPlace = candidates.find(p => p.id === activities[i + 1].placeId);

    if (!fromPlace || !toPlace) {
      travelTimes.push(null);
      continue;
    }

    try {
      const options = await routes.options(fromPlace, toPlace);
      travelTimes.push(options[0]?.durationMinutes ?? null);
    } catch {
      travelTimes.push(null);
    }
  }

  return travelTimes;
}

/**
 * Validate timing constraints after an edit.
 * Returns array of timing-related issues.
 */
function validateTiming(snapshot: Snapshot): Issue[] {
  const issues: Issue[] = [];

  // Check if any routes are missing
  const missingRoutes = snapshot.routes.filter(r => r === null).length;
  if (missingRoutes > 0) {
    issues.push({
      checkId: 'missing_routes',
      subjectIds: [],
      status: 'unknown',
      message: `${missingRoutes} route${missingRoutes === 1 ? '' : 's'} could not be calculated`,
      repairHint: 'Some travel times are unknown. The itinerary may exceed your time window.'
    });
  }

  // Calculate total time if all routes are known
  const totalActivityMinutes = snapshot.activities.reduce(
    (sum, a) => sum + a.durationMinutes,
    0
  );
  
  const knownRoutes = snapshot.routes.filter(r => r !== null) as number[];
  const hasAllRoutes = snapshot.routes.length === 0 || knownRoutes.length === snapshot.routes.length;
  
  if (hasAllRoutes) {
    const totalTravelMinutes = knownRoutes.reduce((sum, r) => sum + r, 0);
    const firstLegMinutes = snapshot.firstLeg?.selected?.durationMinutes ?? 0;
    const returnLegMinutes = snapshot.returnLeg?.selected?.durationMinutes ?? 0;
    
    const totalMinutes = totalActivityMinutes + totalTravelMinutes + firstLegMinutes + returnLegMinutes;
    
    // We don't have the original time window here, so we can't validate against it
    // This would need to be passed in or stored in the snapshot
    // For now, just report the total time
    if (totalMinutes > 600) { // More than 10 hours is suspicious
      issues.push({
        checkId: 'excessive_duration',
        subjectIds: [],
        status: 'flag',
        message: `Total time is ${Math.round(totalMinutes / 60)} hours (${totalMinutes} minutes)`,
        repairHint: 'This itinerary may be too ambitious for a single day. Consider removing some activities.'
      });
    }
  }

  return issues;
}

/**
 * Estimate a reasonable duration for a place based on its type.
 * Used when manually adding places.
 */
export function estimateDuration(place: Place): number {
  if (place.types.includes('museum') || place.types.includes('art_gallery')) return 90;
  if (place.types.includes('restaurant') || place.types.includes('cafe')) return 60;
  if (place.types.includes('park') || place.types.includes('nature_reserve')) return 45;
  if (place.types.includes('shopping') || place.types.includes('mall')) return 60;
  if (place.types.includes('landmark') || place.types.includes('monument')) return 30;
  return 30; // default
}
