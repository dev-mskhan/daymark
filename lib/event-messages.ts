/**
 * Task 8.25-8.26: Transform technical events to user-friendly messages.
 * 
 * Converts internal event types to human-readable activity log entries.
 */

import type { RunEvent, Activity } from '@/lib/domain';

export interface UserFriendlyEvent {
  icon: string;
  title: string;
  description: string;
  technical?: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

/**
 * Convert technical event to user-friendly message
 */
export function transformEvent(event: RunEvent): UserFriendlyEvent {
  const { type, message, actor, snapshot, review, candidates } = event;

  switch (type) {
    // Discovery phase
    case 'geocode_start':
      return {
        icon: '📍',
        title: 'Finding starting location',
        description: 'Locating your starting point on the map...',
        technical: message,
        type: 'info',
      };

    case 'geocode_end':
      return {
        icon: '✓',
        title: 'Starting point confirmed',
        description: snapshot?.origin?.formattedAddress || 'Origin located',
        technical: message,
        type: 'success',
      };

    case 'discovery_start':
      return {
        icon: '🔍',
        title: 'Discovering places',
        description: 'Searching for amazing spots near you...',
        technical: message,
        type: 'info',
      };

    case 'discovery_end':
      return {
        icon: '✓',
        title: `Found ${candidates?.length || 0} places`,
        description: 'Great options discovered in your area',
        technical: message,
        type: 'success',
      };

    // Screening phase
    case 'screening_request':
      return {
        icon: '🎯',
        title: 'Checking your requirements',
        description: 'Making sure this trip fits your needs...',
        technical: message,
        type: 'info',
      };

    case 'screening_approved':
      return {
        icon: '✓',
        title: 'All clear',
        description: 'Your trip request looks perfect',
        technical: message,
        type: 'success',
      };

    // Planning phase
    case 'proposal':
      const activityCount = snapshot?.activities?.length || 0;
      const verb = activityCount === 1 ? 'is' : 'are';
      return {
        icon: '📝',
        title: `Draft itinerary (${activityCount} ${activityCount === 1 ? 'stop' : 'stops'})`,
        description: `There ${verb} ${activityCount} ${activityCount === 1 ? 'activity' : 'activities'} planned so far`,
        technical: message,
        type: 'info',
      };

    case 'enrichment_start':
      return {
        icon: '🔍',
        title: 'Verifying details',
        description: 'Checking opening hours and accessibility...',
        technical: message,
        type: 'info',
      };

    case 'enrichment_end':
      return {
        icon: '✓',
        title: 'Details verified',
        description: 'Place information updated and confirmed',
        technical: message,
        type: 'success',
      };

    // Review phase
    case 'local_review':
    case 'global_review':
      const scope = type === 'local_review' ? 'activity' : 'itinerary';
      const status = review?.status || 'unknown';
      if (status === 'pass') {
        return {
          icon: '✓',
          title: `${scope === 'activity' ? 'Activity' : 'Itinerary'} looks good`,
          description: 'Quality check passed',
          technical: message,
          type: 'success',
        };
      } else if (status === 'flag') {
        return {
          icon: '⚠',
          title: `Found ${review?.issues.length || 0} ${review?.issues.length === 1 ? 'issue' : 'issues'}`,
          description: 'Adjusting to improve your experience...',
          technical: message,
          type: 'warning',
        };
      }
      return {
        icon: '❓',
        title: 'Checking quality',
        description: 'Reviewing the plan...',
        technical: message,
        type: 'info',
      };

    case 'opening_hours_check':
      return {
        icon: '🕐',
        title: 'Checking opening hours',
        description: 'Making sure places will be open...',
        technical: message,
        type: 'info',
      };

    case 'accessibility_check':
      return {
        icon: '♿',
        title: 'Checking accessibility',
        description: 'Verifying accessibility features...',
        technical: message,
        type: 'info',
      };

    // Routing phase
    case 'routing_start':
      return {
        icon: '🚶',
        title: 'Planning routes',
        description: 'Finding the best way between stops...',
        technical: message,
        type: 'info',
      };

    case 'routing_end':
      return {
        icon: '✓',
        title: 'Routes mapped',
        description: 'Transportation options calculated',
        technical: message,
        type: 'success',
      };

    case 'transport_selection':
      return {
        icon: '🚇',
        title: 'Choosing transport',
        description: 'Selecting the best way to travel...',
        technical: message,
        type: 'info',
      };

    // Repair phase
    case 'repair_remove':
      return {
        icon: '✂',
        title: 'Removed an activity',
        description: 'Adjusting the itinerary to fix an issue',
        technical: message,
        type: 'warning',
      };

    case 'repair_swap':
      return {
        icon: '🔄',
        title: 'Swapped an activity',
        description: 'Replaced with a better option',
        technical: message,
        type: 'info',
      };

    // Completion
    case 'complete':
      const totalStops = snapshot?.activities?.length || 0;
      return {
        icon: '🎉',
        title: 'Trip plan ready!',
        description: `Your ${totalStops}-stop itinerary is complete`,
        technical: message,
        type: 'success',
      };

    case 'needs_attention':
      return {
        icon: '⚠',
        title: 'Plan needs review',
        description: 'Some issues need your attention',
        technical: message,
        type: 'warning',
      };

    // Multi-day events
    case 'day_start':
      const dayNum = (message.match(/Day (\d+)/) || [])[1] || '?';
      return {
        icon: '📅',
        title: `Day ${dayNum} planning`,
        description: 'Creating itinerary for this day...',
        technical: message,
        type: 'info',
      };

    case 'day_complete':
      return {
        icon: '✓',
        title: 'Day complete',
        description: 'Moving to next day...',
        technical: message,
        type: 'success',
      };

    case 'cross_day_review':
      return {
        icon: '🔗',
        title: 'Checking multi-day flow',
        description: 'Ensuring variety across all days...',
        technical: message,
        type: 'info',
      };

    // Errors
    case 'error':
      return {
        icon: '❌',
        title: 'Something went wrong',
        description: message,
        technical: message,
        type: 'error',
      };

    // Default
    default:
      return {
        icon: actor === 'LLM' ? '🤖' : actor === 'Jev' ? '✨' : '⚙',
        title: type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        description: message,
        technical: message,
        type: 'info',
      };
  }
}

/**
 * Get a concise progress message for the current stage
 */
export function getProgressMessage(events: RunEvent[]): string {
  if (events.length === 0) return 'Getting ready...';

  const lastEvent = events[events.length - 1];
  const { type } = lastEvent;

  // Provide ongoing status
  if (type.includes('start')) {
    const friendly = transformEvent(lastEvent);
    return friendly.title;
  }

  if (type === 'complete') return 'Trip plan complete!';
  if (type === 'needs_attention') return 'Plan ready for review';
  if (type === 'error') return 'Planning paused';

  // Default to last friendly title
  return transformEvent(lastEvent).title;
}
