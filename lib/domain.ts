export type ExperienceType = 'iconic' | 'history' | 'local_life' | 'art' | 'nature' | 'food' | 'architecture';
export interface TripRequest { destination: string; origin?: string; startAt: string; endAt: string; partySize?: number; preference: string; constraints?: string; mode?: 'fixture' | 'live' }
export interface FormattedOpeningHours { [day: string]: { open: string; close: string }[] }
export interface AccessibilityInfo { wheelchairAccessible?: boolean; elevator?: boolean; parking?: boolean }
export type OperationalStatus = 'operational' | 'temporarily_closed' | 'permanently_closed'
export interface Place { id: string; name: string; address: string; latitude: number; longitude: number; types: string[]; rating?: number; source: 'photon' | 'geoapify' | 'demo'; cityCode?: string; adcode?: string; openingHours?: string; screeningLabel?: string; timezone?: string; formattedOpeningHours?: FormattedOpeningHours; operationalStatus?: OperationalStatus; accessibilityInfo?: AccessibilityInfo; lastVerified?: string }
export interface Activity { id: string; placeId: string; durationMinutes: number; reason: string }
export interface TransportOption { id: string; mode: 'walk' | 'transit'; durationMinutes: number; walkingMinutes: number; transfers: number; distanceMeters: number; fareYuan?: number; lines: string[] }
export interface TransportLeg { fromActivityId: string; toActivityId: string; fromPlaceId: string; toPlaceId: string; selected: TransportOption | null; options: TransportOption[] }
export interface TransportSelection { version: number; selectedOptionId: string; model: string; answers: Record<string, { choice: string; confidence: number; probabilities: Record<string, number> }> }
export type RequestCheckId = 'multi_day' | 'multi_city' | 'booking_or_transaction';
export interface RequestScreening { model: string; answers: Record<RequestCheckId, { choice: 'pass' | 'flag' | 'unknown'; confidence: number; probabilities: Record<string, number> }> }
export interface Proposal { activities: Activity[]; done: boolean; model?: string }
export type JevQueryDimension = 'preference_fit' | 'experience_similarity' | 'evidence_sufficiency' | 'opening_hours_fit' | 'operational_status' | 'accessibility_fit';
export interface JevQueryRequest {
  dimension: JevQueryDimension;
  subjectIds: string[];
  scope: 'candidate' | 'segment';
}
export interface JevDecision {
  queryId: string;
  version: number;
  dimension: JevQueryDimension;
  subjectId: string;
  choice: 'pass' | 'flag' | 'unknown';
  confidence: number;
  probabilities: Record<string, number>;
  model: string;
}
export type PlannerAction =
  | { action: 'proposal'; proposal: Proposal }
  | { action: 'ask_jev'; query: JevQueryRequest; model?: string };
export interface Issue { checkId: string; subjectIds: string[]; status: 'flag' | 'unknown'; message: string; condition?: string; evidence?: string[]; repairHint?: string }
export interface Review { version: number; scope: 'local' | 'global'; status: 'pass' | 'flag' | 'unknown'; issues: Issue[]; latencyMs: number; model: string; answers?: Record<string, { choice: string; confidence: number; probabilities: Record<string, number> }> }
export interface OriginPoint { latitude: number; longitude: number; formattedAddress: string; }
export interface Snapshot { version: number; activities: Activity[]; routes: (number | null)[]; transportLegs?: TransportLeg[]; issues: Issue[]; origin?: OriginPoint; firstLeg?: TransportLeg; returnLeg?: TransportLeg; }
export interface RunEvent { sequence: number; elapsedMs: number; type: string; actor: 'LLM' | 'Jev' | 'Controller'; message: string; version?: number; snapshot?: Snapshot; candidates?: Place[]; review?: Review; decisions?: JevDecision[]; requestScreening?: RequestScreening; transportSelection?: TransportSelection; before?: Activity[]; after?: Activity[]; latencyMs?: number; model?: string; context?: PlanningContext }
export interface RunResult { status: 'complete' | 'needs_attention'; snapshot: Snapshot; candidates: Place[]; events: RunEvent[] }

export interface TimingContext {
  availableMinutes: number;
  activityMinutes: number;
  knownTravelMinutes: number;
  usedMinutes: number | null;
  remainingMinutes: number | null;
  minimumUsedMinutes: number;
  remainingUpperBoundMinutes: number;
  legs: { fromActivityId: string; toActivityId: string; fromPlaceId: string; toPlaceId: string; durationMinutes: number | null }[];
  timezone?: string;
  timezoneVerified?: boolean;
}
export interface PlanningContext {
  version: number;
  timing: TimingContext;
  candidateRoutes: { placeId: string; fromPlaceId: string; durationMinutes: number | null; remainingAfterTravelMinutes: number | null; options?: TransportOption[] }[];
}

/** Task 3.3: Context passed to opening hours / accessibility validation. */
export interface PlaceValidationContext {
  scheduledTime: string;      // ISO datetime of scheduled visit start
  dayOfWeek: string;          // 'monday' | 'tuesday' | …
  durationMinutes: number;
  constraints?: string;       // raw user constraints string
}

/** Task 3.5: Per-activity schedule with timestamps. */
export interface ActivitySchedule {
  activityId: string;
  placeId: string;
  scheduledStart: string;     // ISO datetime
  scheduledEnd: string;       // ISO datetime
  dayOfWeek: string;
  durationMinutes: number;
}

// ─── Multi-Day Trip Support (Priority 4) ─────────────────────────────────────

/** Task 4.1: One day's time window and optional overnight place. */
export interface DayBoundary {
  dayNumber: number;          // 1-based
  date: string;               // YYYY-MM-DD
  startTime: string;          // HH:MM  (local time)
  endTime: string;            // HH:MM
  overnightPlace?: Place;     // where traveler stays after this day
}

/** Task 4.2: Multi-day trip request — extends single-day with explicit boundaries. */
export interface MultiDayRequest extends Omit<TripRequest, 'startAt' | 'endAt'> {
  days: DayBoundary[];        // 1–7 entries, in day order
}

/** Task 4.3: Per-day planning result — activities, routes, and legs for one day. */
export interface DaySegment {
  dayNumber: number;
  startingFrom: string;       // address/name of day's starting location
  endingAt?: string;          // address/name of overnight location
  snapshot: Snapshot;         // full single-day snapshot
  candidates: Place[];        // candidates used for this day
  events: RunEvent[];         // planning events for this day
}

/** Task 4.4: Full multi-day planning result. */
export interface MultiDaySnapshot {
  currentDay: number;         // most recently planned day
  days: DaySegment[];
  totalActivities: number;
  status: 'complete' | 'needs_attention' | 'partial';
}
