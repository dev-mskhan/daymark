export type ExperienceType = 'iconic' | 'history' | 'local_life' | 'art' | 'nature' | 'food' | 'architecture';
export interface TripRequest { destination: string; startAt: string; endAt: string; preference: string; mode?: 'fixture' | 'live' }
export interface Place { id: string; name: string; address: string; latitude: number; longitude: number; types: string[]; rating?: number; source: 'amap' | 'photon' | 'demo'; cityCode?: string; adcode?: string; openingHours?: string; screeningLabel?: string }
export interface Activity { id: string; placeId: string; durationMinutes: number; reason: string }
export interface TransportOption { id: string; mode: 'walk' | 'transit'; durationMinutes: number; walkingMinutes: number; transfers: number; distanceMeters: number; fareYuan?: number; lines: string[] }
export interface TransportLeg { fromActivityId: string; toActivityId: string; fromPlaceId: string; toPlaceId: string; selected: TransportOption | null; options: TransportOption[] }
export interface TransportSelection { version: number; selectedOptionId: string; model: string; answers: Record<string, { choice: string; confidence: number; probabilities: Record<string, number> }> }
export type RequestCheckId = 'multi_day' | 'multi_city' | 'booking_or_transaction';
export interface RequestScreening { model: string; answers: Record<RequestCheckId, { choice: 'pass' | 'flag' | 'unknown'; confidence: number; probabilities: Record<string, number> }> }
export interface Proposal { activities: Activity[]; done: boolean; model?: string }
export type JevQueryDimension = 'preference_fit' | 'experience_similarity' | 'evidence_sufficiency';
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
export interface Snapshot { version: number; activities: Activity[]; routes: (number | null)[]; transportLegs?: TransportLeg[]; issues: Issue[] }
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
}
export interface PlanningContext {
  version: number;
  timing: TimingContext;
  candidateRoutes: { placeId: string; fromPlaceId: string; durationMinutes: number | null; remainingAfterTravelMinutes: number | null; options?: TransportOption[] }[];
}
