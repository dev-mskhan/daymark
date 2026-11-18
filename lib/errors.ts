/**
 * User-friendly error handling for Daymark planning errors.
 * Provides clear messages, recovery actions, and optional technical details.
 */

/**
 * Strip API keys and bearer tokens from error messages before surfacing them
 * to the client. Removes:
 *   - Bearer <token> values
 *   - URL query parameters whose key is "key" (e.g. ?key=abc&… or &key=abc)
 */
export function sanitizeForClient(msg: string): string {
  return msg
    // Strip Bearer token values
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [redacted]")
    // Strip key= query param values (handles both ?key=val and &key=val, up to & or end)
    .replace(/([?&]key=)[^&\s#]*/gi, "$1[redacted]");
}

export type ErrorCode =
  | 'no_places_found'
  | 'insufficient_time'
  | 'routing_failed'
  | 'provider_unavailable'
  | 'invalid_location'
  | 'llm_error'
  | 'validation_failed'
  | 'geocoding_failed'
  | 'network_error'
  | 'unknown_error';

export interface RecoveryAction {
  type: 'retry' | 'adjust_time' | 'change_location' | 'relax_constraints' | 'contact_support';
  label: string;
  description?: string;
}

export class PlanningError extends Error {
  constructor(
    public code: ErrorCode,
    public userMessage: string,
    public recovery: RecoveryAction[],
    public technicalDetails?: string
  ) {
    super(userMessage);
    this.name = 'PlanningError';
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PlanningError);
    }
  }

  toJSON() {
    return {
      code: this.code,
      message: this.userMessage,
      recovery: this.recovery,
      technical: this.technicalDetails
    };
  }
}

/**
 * Convert any error into a user-friendly PlanningError
 */
export function toPlanningError(error: unknown): PlanningError {
  // Already a PlanningError
  if (error instanceof PlanningError) {
    return error;
  }

  // Standard Error
  if (error instanceof Error) {
    return inferPlanningError(error);
  }

  // Unknown error type
  return new PlanningError(
    'unknown_error',
    'Something unexpected happened while planning your trip.',
    [
      {
        type: 'retry',
        label: 'Try again',
        description: 'Sometimes a fresh start helps'
      },
      {
        type: 'contact_support',
        label: 'Report this issue',
        description: 'Help us improve Daymark'
      }
    ],
    String(error)
  );
}

/**
 * Infer user-friendly error from standard Error
 */
function inferPlanningError(error: Error): PlanningError {
  const message = error.message.toLowerCase();

  // Validation errors
  if (message.includes('duplicate') || message.includes('重复')) {
    return new PlanningError(
      'validation_failed',
      'The planner generated duplicate activities. This is usually temporary.',
      [
        {
          type: 'retry',
          label: 'Try again',
          description: 'Generate a fresh itinerary'
        }
      ],
      error.message
    );
  }

  if (message.includes('candidate') || message.includes('候选池')) {
    return new PlanningError(
      'validation_failed',
      'The planner referenced an invalid place. This is usually temporary.',
      [
        {
          type: 'retry',
          label: 'Try again',
          description: 'Generate a fresh itinerary'
        }
      ],
      error.message
    );
  }

  // Geocoding errors
  if (message.includes('geocod') || message.includes('location') || message.includes('address')) {
    return new PlanningError(
      'geocoding_failed',
      'We couldn\'t find that location. Please try a more specific address.',
      [
        {
          type: 'change_location',
          label: 'Try a different address',
          description: 'Include city and state, or use a landmark'
        },
        {
          type: 'retry',
          label: 'Try again',
          description: 'Sometimes provider data refreshes'
        }
      ],
      error.message
    );
  }

  // No places found
  if (message.includes('no places') || message.includes('not found') || message.includes('0 candidates')) {
    return new PlanningError(
      'no_places_found',
      'We couldn\'t find enough interesting places in this area that match your preferences.',
      [
        {
          type: 'relax_constraints',
          label: 'Broaden your interests',
          description: 'Try adding more types of activities'
        },
        {
          type: 'change_location',
          label: 'Try a different area',
          description: 'Some areas have more coverage than others'
        }
      ],
      error.message
    );
  }

  // Timing issues
  if (message.includes('time') || message.includes('window') || message.includes('duration')) {
    return new PlanningError(
      'insufficient_time',
      'There isn\'t enough time in your time window for a complete itinerary.',
      [
        {
          type: 'adjust_time',
          label: 'Extend your time window',
          description: 'Add more hours to fit more activities'
        },
        {
          type: 'relax_constraints',
          label: 'Relax your preferences',
          description: 'Allow more flexible activity selection'
        }
      ],
      error.message
    );
  }

  // Network/provider errors
  if (message.includes('network') || message.includes('fetch') || message.includes('timeout') || message.includes('api')) {
    return new PlanningError(
      'provider_unavailable',
      'One of our planning services is temporarily unavailable. Please try again in a moment.',
      [
        {
          type: 'retry',
          label: 'Try again',
          description: 'Service may be back up now'
        }
      ],
      error.message
    );
  }

  // Live mode requirement
  if (message.includes('live mode requires') || message.includes('api_key')) {
    return new PlanningError(
      'provider_unavailable',
      'Live planning is not currently configured. Please use the demo mode.',
      [
        {
          type: 'contact_support',
          label: 'Report configuration issue',
          description: 'Let the team know about this'
        }
      ],
      error.message
    );
  }

  // Generic fallback
  return new PlanningError(
    'unknown_error',
    'We encountered an issue while planning your trip. Please try again.',
    [
      {
        type: 'retry',
        label: 'Try again',
        description: 'Generate a fresh itinerary'
      },
      {
        type: 'contact_support',
        label: 'Report this issue',
        description: 'Help us improve Daymark'
      }
    ],
    error.message
  );
}

/**
 * Format error for API response
 */
export function formatErrorResponse(error: unknown): {
  error: string;
  code: string;
  recovery?: RecoveryAction[];
  technical?: string;
} {
  const planningError = toPlanningError(error);
  
  return {
    error: planningError.userMessage,
    code: planningError.code,
    recovery: planningError.recovery,
    ...(process.env.NODE_ENV === 'development' && { technical: planningError.technicalDetails })
  };
}
