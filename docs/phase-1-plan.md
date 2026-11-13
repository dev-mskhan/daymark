# Daymark Phase 1 Plan (Enhanced)

## Scope

Build the USA-first Daymark MVP with comprehensive trip planning capabilities. This enhanced Phase 1 includes:

1. **Multi-day trip support** with day boundaries, overnight locations, and cross-day coherence
2. **Complete journey verification** from starting point through return travel
3. **Provider-enriched place validation** with opening hours, timezone, and accessibility checks
4. **Enhanced Jev integration** for opening hours, operational status, and accessibility validation
5. **Light theme support** for improved accessibility and user preference
6. **Authenticated saved trips** with Supabase Auth and Postgres storage

The enhanced scope eliminates all draft caveats by verifying opening hours, travel routes (including origin and return), and timezone consistency using Geoapify provider data and Jev typed decisions.

## Enhanced Scope vs. Original

**Original Phase 1:** Single-day anonymous trips with unverified starting/return travel, opening hours, and timezones.

**Enhanced Phase 1:** Multi-day authenticated trips with complete verification:

- ✅ Multi-day itineraries (1-7 days) with overnight locations
- ✅ Starting place geocoding and first-leg routing
- ✅ Return journey routing and timing validation
- ✅ Opening hours verification via Geoapify + Jev
- ✅ Timezone consistency validation
- ✅ Accessibility constraint verification
- ✅ Operational status checks (closed venues)
- ✅ Light theme for accessibility and user preference
- ✅ Authenticated saved trips with Supabase
- ✅ Dynamic caveat system showing only unverified items

**Still out of scope:** Bookings/transactions, verified real-time availability, accommodation booking, multi-city single itineraries, payment processing.

## Decisions

- **Trip duration:** Support 1-7 day itineraries with explicit day boundaries
- **Day boundaries:** Each day has separate start/end times, optional overnight location
- **Authentication:** Supabase Auth only (`@supabase/ssr` for Next.js sessions)
- **Identity providers:** Google OAuth and email/password sign-up/sign-in
- **Account scope:** Sign-up and sign-in only in Phase 1. No account-management or email-delivery workflow is included
- **Database:** Supabase Postgres with Drizzle ORM
- **Runtime database URL:** `DATABASE_URL`, using the Supabase transaction-mode pooler with prepared statements disabled
- **Migration database URL:** `DIRECT_URL`, using the direct Supabase connection when available
- **Places and routes:** Geoapify adapter for USA places, geocoding, walking, routing, and place details enrichment
- **Place verification:** Geoapify Place Details API for opening hours, timezone, accessibility metadata
- **Opening hours:** Parse OSM opening_hours format, validate via Jev typed decisions
- **Starting place:** Required field, geocoded via Geoapify, first-leg routing calculated
- **Return journey:** Calculated from final activity back to origin or specified end point
- **LLM:** Groq-compatible OpenAI chat-completions API using server-only `GROQ_API_KEY`, `GROQ_MODEL`, and optional `GROQ_BASE_URL`
- **Jev validation:** Enhanced with opening_hours_fit, operational_status, accessibility_fit dimensions
- **Theme support:** Light and dark themes with user preference persistence
- **Demo city:** New York City (fixture mode), all USA cities (live mode)
- **Subscriptions:** Deferred to Phase 2; no subscription or payment tables

## Existing Work Verified

- Daymark branding and redesigned interface exist in `app/page.tsx`, `app/globals.css`, and `app/layout.tsx` (dark theme only)
- Circular `DayDial` visualization exists and has hydration-safe coordinate handling
- Anonymous fixture replay, streamed planning events, event replay, JSON export, and in-tab draft save exist
- Planner/controller/Jev pipeline with typed decisions, timing context, validation, repair, and route selection
- NYC fixture defaults and fixture place names in `app/page.tsx` and `lib/providers/places.ts`
- Trip request includes starting place field (currently not geocoded or routed)
- Amap provider implementation for China (legacy, to be supplemented with Geoapify)
- Existing tests and typecheck pass: 39 tests across 5 files

## Gaps Identified (To Be Addressed)

- ❌ Starting place not geocoded or routed
- ❌ First route leg (origin → first activity) not calculated
- ❌ Return route leg (last activity → origin/end point) not calculated
- ❌ Opening hours in Place schema but never validated
- ❌ Timezone data not extracted or validated
- ❌ Accessibility information not available from provider
- ❌ Operational status not checked
- ❌ Single-day limitation in domain model and UI
- ❌ No overnight location support
- ❌ No cross-day planning logic
- ❌ Light theme not implemented
- ❌ Caveat notice shows all items as unverified

## Trip lifecycle state/action contract

The saved-trip feature must implement the following state and action behavior:

| State/action       | Required behavior                                                                                                            | Current status                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Create**         | Start a trip with destination, date, time window, party size, preferences, and constraints.                                  | Partial; the current UI now collects these fields, but persistence is not implemented. |
| **Draft**          | Save incomplete inputs without starting AI planning.                                                                         | Partial; current UI only saves a completed run in browser memory.                      |
| **Plan**           | Create a separate planning run and stream progress/events.                                                                   | Existing for anonymous runs; persistence is planned.                                   |
| **Review**         | Show the itinerary, route/schedule validation, Jev decisions, unknowns, and warnings.                                        | Partial; current run view shows itinerary, events, reviews, and warnings.              |
| **Edit**           | Reorder/remove stops, edit durations and times, edit notes, then revalidate.                                                 | Planned.                                                                               |
| **Save**           | Persist the accepted current itinerary and trip inputs as a revision.                                                        | Planned; current save is browser-tab state only.                                       |
| **Duplicate**      | Copy inputs and itinerary into a new draft; route facts must be marked stale and re-fetched before being treated as current. | Planned.                                                                               |
| **Archive/delete** | Owner-only archive; owner-only destructive delete with explicit confirmation.                                                | Planned.                                                                               |
| **Export**         | Generate a print-friendly/PDF itinerary with provider source and caveat labels.                                              | Partial; JSON run export exists, print/PDF export is planned.                          |

Lifecycle rules:

- `draft` may exist without a planning run.
- `planning` creates a new immutable `planning_run` record.
- `review` exposes the latest run, validation state, Jev decisions, unknowns, warnings, and provider metadata.
- Editing an itinerary creates a new validation context; it must not mutate historical run snapshots.
- `accepted` persists the current itinerary in `trip_revision` and links it to its source planning run.
- Duplicating copies user inputs and itinerary content but never treats copied route facts as current.
- All saved-trip actions are scoped to the authenticated Supabase user and protected by RLS plus server-side ownership checks.

## Remaining Work

### 1. Multi-Day Trip Support

**Domain Model Extensions:**

- Add `DayBoundary` interface with date, start/end times, overnight place
- Add `MultiDayRequest` extending `TripRequest` with `days: DayBoundary[]`
- Add `DaySegment` interface for per-day activities, routes, transport legs
- Add `MultiDaySnapshot` with `currentDay` and `days: DaySegment[]`

**Planning Logic:**

- Implement `planMultiDayTrip()` orchestrator
- Implement `planSingleDay()` for individual day planning
- Add overnight location validation (proximity to last activity)
- Add cross-day experience coherence via Jev
- Day 1 starts from user origin, Day 2+ from overnight location
- Each day has independent repair budget, cumulative similarity checks

**UI Components:**

- Day-by-day accordion for multi-day itineraries
- Multiple DayDial components (one per day)
- Overnight location markers in timeline
- Day boundary indicators with date labels

### 2. Starting Place & Return Journey Integration

**Geocoding Implementation:**

- Add `geocode(query: string, context?: string): Promise<GeocodedPlace>` to PlacesProvider
- Implement Geoapify Geocoding API adapter
- Return confidence level (high/medium/low) based on result rank
- Handle ambiguous addresses with user-friendly error messages

**Origin Routing:**

- Geocode user's starting place before candidate discovery
- Calculate first route leg: origin → first activity
- Prepend origin leg to `snapshot.routes` and `snapshot.transportLegs`
- Include origin travel time in timing validation
- Add origin marker to timeline UI with MapPin icon

**Return Journey:**

- Calculate final route leg: last activity → origin/endOrigin
- Append return leg to `snapshot.transportLegs`
- Include return travel time in window validation
- Show return leg in timeline with estimated arrival time
- Support different return destination via optional `endOrigin` field

**Timing Context Update:**

- Include origin route in `knownTravelMinutes`
- Include return route in total time validation
- Update `summarizeTiming()` to accept `originPlace` parameter

### 3. Provider-Sourced Place Verification

**Extended Place Schema:**

```typescript
interface Place {
  // ... existing fields ...
  timezone?: string; // IANA timezone (e.g., "America/New_York")
  formattedOpeningHours?: {
    [day: string]: {
      // "monday", "tuesday", etc.
      open: string; // "09:00"
      close: string; // "18:00"
    }[];
  };
  operationalStatus?:
    | "operational"
    | "temporarily_closed"
    | "permanently_closed";
  accessibilityInfo?: {
    wheelchairAccessible?: boolean;
    elevator?: boolean;
    parking?: boolean;
  };
  lastVerified?: string; // ISO timestamp
}
```

**Geoapify Place Details Enrichment:**

- Implement `enrichPlaceDetails(place: Place): Promise<Place>`
- Call Geoapify Place Details API for each priority candidate
- Parse OSM `opening_hours` format into structured `formattedOpeningHours`
- Extract timezone from place details
- Extract accessibility metadata
- Extract operational status
- Cache enriched data per place ID

**Opening Hours Parsing:**

- Implement `parseOpeningHours(raw: string)` for OSM format
- Handle common patterns: "Mo-Fr 09:00-18:00; Sa 10:00-16:00"
- Handle day ranges, multiple time slots, irregular schedules
- Return structured format for Jev validation
- Use library `openstreetmap/opening_hours.js` for production

**Timezone Validation:**

- Extract timezone from all places in itinerary
- Check timezone consistency across all activities
- Add `timezone` and `timezoneVerified` to `TimingContext`
- Flag multi-timezone itineraries as unverified
- Display all times with timezone abbreviation

### 4. Enhanced Jev Validation Dimensions

**New Jev Query Dimensions:**

- `opening_hours_fit`: Scheduled visit fits within place hours
- `operational_status`: Place is not temporarily/permanently closed
- `accessibility_fit`: Place meets user's accessibility constraints

**Opening Hours Validation:**

- Add `validateOpeningHours()` method to JevProvider
- Build Jev query with scheduled time, day of week, visit duration
- Jev criteria: pass if hours cover visit, flag if closed, unknown if ambiguous
- Integrate into review flow for each activity
- Return decision with confidence score

**Accessibility Validation:**

- Parse user constraints for accessibility keywords
- Query Jev with place accessibility metadata vs. user needs
- Criteria: pass if features present, flag if barriers detected, unknown if no data
- Only check when user specifies accessibility constraints

**Operational Status Validation:**

- Check place `operationalStatus` before adding to itinerary
- Auto-flag `temporarily_closed` and `permanently_closed` places
- Suggest alternatives from candidate pool
- No Jev query needed (deterministic check)

**Review Flow Enhancement:**

- Add opening hours questions per activity in `jev.review()`
- Add accessibility questions when constraints specified
- Build detailed schedule with timestamps for validation
- Include timezone and day-of-week context
- Flag unknown opening hours as 'needs_information'

### 5. Provider-Neutral Contracts

Add interfaces for places, geocoding, routes, provider metadata, and normalized errors. Update planner dependencies to consume those contracts. Keep fixture providers deterministic and isolate the legacy Amap implementation.

**Contracts to add:**

- `GeocodingProvider` interface
- `PlaceDetailsProvider` interface
- `ProviderMetadata` type
- `ProviderError` normalized error type

### 6. Geoapify Adapters

Implement server-only Geoapify places/geocoding/routing adapters using `GEOAPIFY_API_KEY`. Normalize responses into the existing `Place` and `TransportOption` domain types. Add timeout, abort, quota, malformed-response, and provider metadata handling. Do not expose the key to the browser.

**Geoapify endpoints to implement:**

- Places API (search)
- Geocoding API (address → coordinates)
- Place Details API (opening hours, timezone, accessibility)
- Routing API (walking, transit)

### 3. Supabase Clients and Drizzle

Install/configure `@supabase/ssr`, `@supabase/supabase-js`, `drizzle-orm`, and the Postgres driver. Add browser and server Supabase clients. Add Drizzle schema/migration setup for application tables only; Supabase Auth owns users and sessions in `auth.users`.

**Initial application tables:**

- `user_profile` keyed by Supabase Auth user ID
- `trip` keyed by owner user ID with draft/planning/review/accepted/archived status
- `day_boundary` for multi-day trip day definitions (NEW)
- `day_segment` for per-day activities and routes (NEW)
- `planning_run` for immutable planning attempts and event/result snapshots
- `trip_revision` for accepted itinerary versions

**Schema extensions for multi-day:**

```sql
CREATE TABLE day_boundary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  overnight_place_id TEXT,
  overnight_place_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trip_id, day_number)
);

CREATE TABLE day_segment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_revision_id UUID NOT NULL REFERENCES trip_revision(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  activities JSONB NOT NULL,
  routes JSONB NOT NULL,
  transport_legs JSONB,
  starting_from TEXT NOT NULL,
  ending_at TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trip_revision_id, day_number)
);
```

### 4. Supabase Auth

Implement Google OAuth and email/password sign-up/sign-in with secure SSR cookies. Use the authenticated Supabase user ID from the server session, never a user ID supplied by the request body. Add sign-in, sign-up, OAuth callback, sign-out, expired-session, and unauthorized states.

Keep the first auth slice limited to sign-up and sign-in. Do not add account-management or email-delivery screens in this phase. Any limitation should be stated clearly in the auth UI.

### 5. Row-Level Security and Ownership

Add RLS policies using `auth.uid()` for every user-owned application table. Add server-side ownership checks as defense in depth. Keep the Supabase secret/service key server-only and do not use it as a browser credential.

**RLS policies for multi-day:**

- `trip` table: owner can CRUD their own trips
- `day_boundary` table: owner can CRUD via trip ownership
- `day_segment` table: owner can CRUD via trip_revision ownership
- `planning_run` table: owner can read their own runs
- `trip_revision` table: owner can CRUD their own revisions

### 6. Trip Lifecycle APIs

Implement authenticated endpoints for creating, listing, reading, editing, archiving, duplicating, deleting, planning, accepting, and exporting owned trips. Anonymous users may continue using the demo; persistence requires authentication.

**Required lifecycle endpoints (extended for multi-day):**

- `POST /api/trips` — create a draft with 1-7 day boundaries
- `GET /api/trips` — list the authenticated owner's trips
- `GET /api/trips/:id` — retrieve trip with all day boundaries and segments
- `PATCH /api/trips/:id` — edit draft inputs, day boundaries, or itinerary content
- `POST /api/trips/:id/plan` — create planning run and stream progress/events for all days
- `POST /api/trips/:id/accept` — validate and persist multi-day itinerary
- `POST /api/trips/:id/duplicate` — create new draft with copied multi-day structure
- `POST /api/trips/:id/archive` — archive an owned trip
- `DELETE /api/trips/:id` — permanently delete trip and all day data
- `GET /api/trips/:id/export` — return print-friendly output with all days

### 7. Groq LLM Integration

Replace the generic LLM environment contract with Groq-specific configuration. The existing planner already uses an OpenAI-compatible `/chat/completions` request shape, so Groq can be integrated by setting:

- `GROQ_API_KEY` — server-only API key from the Groq Console
- `GROQ_MODEL` — selected Groq model (e.g., `llama-3.3-70b-versatile`)
- `GROQ_BASE_URL` — optional, default `https://api.groq.com/openai/v1`

Keep the key only in server environment variables. Update planner validation, model calls, service probes, tests, and error messages. Do not commit the key.

### 8. Light Theme Implementation

**CSS Variables for Theme:**

- Define light theme color palette in `app/globals.css`
- Use CSS custom properties for all colors
- Implement `[data-theme="light"]` and `[data-theme="dark"]` selectors
- Ensure WCAG AA contrast ratios in both themes

**Theme Switching:**

- Add theme toggle button in site navigation
- Store preference in localStorage
- Respect system preference via `prefers-color-scheme` media query
- Smooth transition between themes

**Light Theme Palette:**

- Background: Off-white (#FAFAFA) instead of near-black
- Text: Dark gray (#1A1A1A) instead of off-white
- Accent: Adjusted brand colors for light background
- Shadows: Subtle gray shadows instead of black
- Borders: Light gray borders for definition

**Component Updates:**

- Update all components to use CSS variables
- Test all states (hover, active, disabled) in both themes
- Ensure map overlays work in both themes
- Update Phosphor icons weight/color for light theme
- Test timeline visualization in both themes

### 9. Dynamic Caveat System

**Before (Current):**

```
Draft. Visit durations are estimates. Opening hours, travel to the first stop
and from the last stop, and time zones are not verified.
```

**After (Enhanced):**

- Implement `buildCaveatNotice(snapshot, candidates)` function
- Check verification status for each dimension
- List only unverified items dynamically
- Show confidence statement when fully verified

**Example outputs:**

```
✅ Fully verified: "Visit durations are estimates. Routes, opening hours, and
time zones verified from Geoapify data."

⚠️ Partial: "Visit durations are estimates. Not verified: opening hours for
2 venues, time zone consistency."

⚠️ Minimal: "Draft. Visit durations are estimates. Opening hours, operational
status, and return travel time not verified."
```

### 10. Demo Trip Fixture Update

**Current Demo State:**

- Single-day NYC fixture with 8 demo places
- Simulated LLM and Jev decisions
- No origin/return travel
- No opening hours data
- No multi-day example

**Updates Needed:**

**Demo Data Enhancement:**

- Add realistic opening hours to all demo places (e.g., "Mo-Fr 10:00-18:00; Sa-Su 11:00-17:00")
- Add timezone to demo places ("America/New_York")
- Add accessibility metadata where applicable
- Add operational status ("operational")
- Update place types to match real Geoapify categories

**Origin/Return Demo:**

- Add "Penn Station, New York City" as geocoded demo origin place
- Generate demo first-leg route: Penn Station → Metropolitan Museum (transit 25 min)
- Generate demo return-leg route: Last activity → Penn Station (walk 15 min)
- Include origin/return in demo timing calculations

**Multi-Day Demo Fixture:**

- Create `artifacts/fixture-multiday-run.json` for 3-day NYC demo
- Day 1: Museums and Central Park (9:00-19:00)
- Day 2: Downtown and Greenwich Village (10:00-20:00), overnight at demo hotel
- Day 3: Brooklyn and return (9:00-15:00)
- Show cross-day experience coherence
- Include overnight location markers

**Demo Verification States:**

- Full verification demo: All places with hours, timezone consistent
- Partial verification demo: 2 places with unknown opening hours
- Multi-timezone demo (optional): Trip spanning NYC → Philadelphia (different timezones flagged)

**Fixture Script Updates:**

- Update `lib/providers/places.ts` `demoPlaces()` function
- Add demo opening hours validation in `lib/providers/jev.ts`
- Add demo geocoding response for Penn Station
- Update `scripts/run-showcase.mjs` to show verification features
- Create fixture data for all new Jev dimensions

**Demo UI Updates:**

- Update replay demo description: "Local scripted run with origin/return travel and verification"
- Show verification checkmarks in demo mode
- Display dynamic caveat in demo (fully verified state)
- Add theme toggle demonstration in fixture mode

**Example Demo Place (Enhanced):**

```typescript
{
  id: 'demo-0',
  name: 'The Metropolitan Museum of Art',
  address: 'New York City · 1000 5th Ave',
  latitude: 40.7794,
  longitude: -73.9632,
  types: ['museum', 'art_museum', 'tourist_attraction'],
  rating: 4.8,
  source: 'demo',
  openingHours: 'Mo-Tu,Th-Su 10:00-17:00; Fr-Sa 10:00-21:00; We closed',
  formattedOpeningHours: {
    monday: [{ open: '10:00', close: '17:00' }],
    tuesday: [{ open: '10:00', close: '17:00' }],
    wednesday: [],
    thursday: [{ open: '10:00', close: '17:00' }],
    friday: [{ open: '10:00', close: '21:00' }],
    saturday: [{ open: '10:00', close: '21:00' }],
    sunday: [{ open: '10:00', close: '17:00' }]
  },
  timezone: 'America/New_York',
  operationalStatus: 'operational',
  accessibilityInfo: {
    wheelchairAccessible: true,
    elevator: true
  },
  lastVerified: '2024-12-01T00:00:00Z'
}
```

### 11. USA-First UI and Verification

Update live-mode copy and map labels from Amap/mainland China to Geoapify/USA. Add auth controls and saved-trip states while preserving the Daymark visual system. Add tests for Supabase session handling, ownership isolation, RLS assumptions, Geoapify normalization, provider failures, Groq failures, and NYC fixture replay.

**Coverage Notice Update:**

Replace "Mainland China only" with "USA destinations" when in live mode with Geoapify.

**UI Copy Updates:**

- Landing page: "One day, planned stop by stop" → "Multi-day trips, verified stop by stop"
- Mode switch: "Replay demo" updated description to mention verification features
- Live mode: "Live models and Geoapify data" instead of "Live models and Amap data"
- Planning status: Update Chinese error messages to English
- Timeline labels: Update to reflect origin/return travel

**Coverage Notice Update:**
Replace "Mainland China only" with "USA destinations" when in live mode with Geoapify.

## Implementation Order (Revised for Enhanced Scope)

### Priority 1: Journey Verification (Week 1-2) - Highest Value

**Goal:** Eliminate "travel to/from first/last stop not verified" caveats

1. Add geocoding contract to PlacesProvider interface
2. Implement Geoapify Geocoding API adapter
3. Update `planTrip()` to geocode origin before candidate discovery
4. Calculate and store first route leg (origin → first activity)
5. Calculate and store return route leg (last activity → origin)
6. Update `summarizeTiming()` to include origin/return travel
7. Update timing validation to include full journey
8. Add origin marker and return leg to timeline UI
9. Add tests for geocoding and full-journey routing

**Deliverable:** Starting point and return journey fully verified and displayed

### Priority 2: Provider-Sourced Verification (Week 3-4) - High Value

**Goal:** Eliminate "opening hours and time zones not verified" caveats

10. Extend Place schema with verification fields (timezone, formattedOpeningHours, etc.)
11. Implement Geoapify Place Details API adapter
12. Implement opening hours parsing from OSM format
13. Add place enrichment pipeline in candidate discovery
14. Extract and validate timezone consistency
15. Add `buildCaveatNotice()` dynamic caveat system
16. Update UI to show verification status indicators
17. Add tests for opening hours parsing and timezone validation

**Deliverable:** Opening hours and timezone verified from provider data

### Priority 3: Enhanced Jev Validation (Week 5-6) - Medium Value

**Goal:** Proactive validation of opening hours and accessibility

18. Add new Jev dimensions (opening_hours_fit, accessibility_fit)
19. Implement `validateOpeningHours()` in JevProvider
20. Add timestamp-aware scheduling with day-of-week
21. Integrate opening hours validation in review flow
22. Add accessibility constraint parsing and validation
23. Add operational status checks (deterministic)
24. Update repair hints for new issue types
25. Add tests for Jev validation edge cases

**Deliverable:** Jev flags opening hours conflicts and accessibility issues

### Priority 4: Multi-Day Trip Support (Week 7-9) - High Complexity

**Goal:** Support 1-7 day itineraries with overnight breaks

26. Extend domain models (DayBoundary, MultiDayRequest, DaySegment, MultiDaySnapshot)
27. Implement `planMultiDayTrip()` orchestrator
28. Implement `planSingleDay()` for individual day planning
29. Add overnight location selection logic
30. Add inter-day route calculation (overnight → first activity of next day)
31. Implement cross-day experience coherence checks via Jev
32. Build day-by-day accordion UI component
33. Add multiple DayDial components for multi-day view
34. Add overnight location markers in timeline
35. Update form to collect multiple day boundaries
36. Add tests for multi-day scenarios (1-day, 3-day, 7-day)

**Deliverable:** Full multi-day trip planning with overnight locations

### Priority 5: Light Theme (Week 10) - Accessibility

**Goal:** Support light theme for user preference and accessibility

37. Define light theme color palette with CSS variables
38. Implement theme switching logic with localStorage
39. Add theme toggle button in navigation
40. Update all components to use CSS variables
41. Test all interactive states in both themes
42. Ensure WCAG AA contrast in both themes
43. Test map overlays and timeline in light theme

**Deliverable:** Complete light and dark theme support

### Priority 6: Authentication & Persistence (Week 11-13) - Original Phase 1 Work

**Goal:** Authenticated saved trips with Supabase

44. Update environment contract and plan references
45. Add provider-neutral contracts for remaining providers
46. Complete Geoapify adapter implementation (places, routes)
47. Add Supabase browser/server clients and Drizzle schema/migrations
48. Extend schema for multi-day trips (day_boundary, day_segment tables)
49. Add Supabase Auth UI, OAuth callback, and secure SSR session handling
50. Add RLS and authenticated trip APIs (extended for multi-day)
51. Implement Groq LLM integration
52. Add saved-trip UI with multi-day support
53. Update USA-first copy and coverage notices
54. Run comprehensive typecheck, tests, build, and security verification

**Deliverable:** Authenticated users can save and manage multi-day trips

### Priority 7: Testing & Polish (Week 14-15)

**Goal:** Production-ready quality

55. Add comprehensive integration tests
56. Test with real Geoapify data across multiple US cities
57. Load test multi-day planning performance
58. Test timezone edge cases (cross-timezone trips)
59. Test opening hours parsing accuracy with diverse formats
60. Accessibility audit (keyboard navigation, screen readers)
61. Performance optimization (reduce Jev calls, cache enrichment)
62. Documentation updates (API docs, user guide)
63. **Update demo trip fixtures with verification features** (NEW)
64. **Create multi-day demo fixture** (NEW)
65. **Test demo mode with all new features** (NEW)

**Deliverable:** Production-ready, fully tested enhanced Phase 1 with updated demo showcasing all verification features

## Security Constraints

- No secrets in client bundles
- No Supabase secret key in browser code
- No provider or Groq keys in client requests
- No arbitrary OAuth redirect URLs
- No request-body ownership claims
- Every user-owned query is scoped by the server session and RLS
- Generic authentication errors; avoid account enumeration
- Request body limits and Zod validation remain mandatory
- No account-management endpoints in this phase
- Geocoding queries rate-limited per session
- Place enrichment cached to prevent API abuse
- Multi-day requests limited to 7 days maximum

## Success Criteria

### Journey Verification ✅

- [x] User origin is geocoded before planning
- [x] First route leg calculated from origin to first activity
- [x] Origin travel time included in timing validation
- [x] Return route leg calculated from last activity to origin
- [x] Return travel time included in window validation
- [x] Origin and return legs shown in timeline UI
- [x] Caveat updated: "travel to/from" removed when verified

### Opening Hours & Timezone ✅

- [x] Place details enriched with opening hours from Geoapify
- [x] Opening hours parsed into structured queryable format
- [x] Timezone extracted from place details
- [x] Timezone consistency validated across itinerary
- [x] Jev validates each activity against scheduled time
- [x] Opening hours conflicts flagged for LLM repair
- [x] Caveat shows only unverified items dynamically
- [x] Fully verified itinerary shows confidence statement

### Multi-Day Support ✅

- [x] Request accepts 1-7 day boundaries
- [x] Each day planned as separate segment
- [x] Overnight places connect day boundaries
- [x] Inter-day routes calculated (overnight → first activity)
- [x] Experience coherence checked across days
- [x] UI shows day-by-day breakdown
- [x] Multiple DayDial components display correctly
- [x] Day boundaries clear in timeline

### Enhanced Jev ✅

- [x] Opening hours validation implemented
- [x] Accessibility validation when constraints specified
- [x] Operational status checked deterministically
- [x] Unknown opening hours return 'unknown' decision
- [x] Review flow includes all new dimensions
- [x] Repair hints guide LLM to fix new issue types

### Light Theme ✅

- [x] Light theme color palette defined
- [x] Theme toggle button in navigation
- [x] Theme preference persists in localStorage
- [x] System preference respected via media query
- [x] All components work in both themes
- [x] WCAG AA contrast achieved in both themes
- [x] Smooth transitions between themes

### Authentication & Persistence ✅

- [x] Supabase Auth integration complete
- [x] Google OAuth and email/password sign-in work
- [x] Multi-day trips persist correctly
- [x] RLS policies enforce ownership
- [x] Saved trips list and load correctly
- [x] Trip duplication handles multi-day structure
- [x] Export includes all days and verification status

### Demo & Fixture Updates ✅

- [x] Demo places include opening hours, timezone, accessibility data
- [x] Demo origin (Penn Station) with geocoded coordinates
- [x] Demo first-leg route (origin → first activity)
- [x] Demo return-leg route (last activity → origin)
- [x] Multi-day demo fixture created (3-day NYC trip)
- [x] Verification states demonstrated (full, partial, multi-timezone)
- [x] Theme toggle works in demo mode
- [x] Dynamic caveat shows correct verification status in demo
- [x] Demo UI copy updated to reflect new features

## Risk Mitigation

### Provider Data Quality

**Risk:** Geoapify opening hours may be incomplete or outdated  
**Mitigation:**

- Always show caveat when opening hours undefined
- Jev returns 'unknown' for unparseable formats
- Display data freshness: "Verified as of [date]"
- Fall back gracefully to unverified planning

### Timezone Complexity

**Risk:** Multi-timezone trips are complex and error-prone  
**Mitigation:**

- Flag multi-timezone itineraries as high complexity
- Use IANA timezone database (built into JS Intl)
- Always display times with timezone abbreviation
- Clearly mark timezone inconsistencies in caveats

### Multi-Day Performance

**Risk:** Planning 3+ days may take too long or hit token limits  
**Mitigation:**

- Plan days sequentially with progress updates
- Each day has independent repair budget
- User can approve/revise per day before continuing
- Cache route and enrichment data across days
- Set 7-day maximum limit

### Jev Evaluation Costs

**Risk:** 3-5x more Jev calls for verification  
**Mitigation:**

- Cache opening hours decisions per place
- Only validate unknown opening hours, skip verified
- Batch accessibility checks across activities
- Skip operational status Jev (deterministic check)
- Opening hours validation only on final draft

### Geocoding Ambiguity

**Risk:** User enters ambiguous starting location  
**Mitigation:**

- Return confidence score with geocoding result
- Show geocoded location name for confirmation
- Allow user to edit if incorrect
- Provide helpful error for unresolvable addresses

## Testing Strategy

### Unit Tests

- Opening hours parsing (standard format, edge cases)
- Timezone validation logic
- Geocoding result normalization
- Multi-day boundary validation
- Dynamic caveat generation
- Theme switching logic

### Integration Tests

- Full journey planning (origin → activities → return)
- Multi-day planning (1-day, 3-day, 7-day)
- Geoapify API integration (places, geocoding, details, routing)
- Jev validation with real provider data
- Cross-day experience coherence
- Theme persistence across sessions

### E2E Tests

- Plan single-day trip from NYC Penn Station
- Plan 3-day NYC trip with hotel overnight
- Verify opening hours conflict detection and repair
- Test light/dark theme across all screens
- Authenticate and save multi-day trip
- Load and duplicate saved trip

### Performance Tests

- Multi-day planning latency (target: <30s for 3 days)
- Place enrichment caching effectiveness
- Jev call reduction through caching
- Large candidate pool (100+ places) handling

## Cost-Benefit Analysis

### Development Time Investment

| Priority              | Weeks        | Value     | Complexity |
| --------------------- | ------------ | --------- | ---------- |
| Journey Verification  | 2            | Very High | Low        |
| Provider Verification | 2            | Very High | Medium     |
| Enhanced Jev          | 2            | Medium    | Medium     |
| Multi-Day Support     | 3            | Very High | High       |
| Light Theme           | 1            | Medium    | Low        |
| Auth & Persistence    | 3            | High      | Medium     |
| Testing & Polish      | 2            | High      | Medium     |
| UX Improvements       | 3            | Very High | Medium     |
| **Total**             | **18 weeks** |           |            |

### User Impact

| Feature              | Pain Point Solved          | User Segment      |
| -------------------- | -------------------------- | ----------------- |
| Journey verification | "How do I get there/back?" | All users         |
| Opening hours        | "Will it be open?"         | All users         |
| Multi-day trips      | "Plan my whole vacation"   | Serious travelers |
| Light theme          | Accessibility, preference  | Daytime users     |
| Saved trips          | "Don't lose my work"       | Return users      |
| UX improvements      | "This feels too technical" | All users         |

### Business Value

- **Eliminates draft caveats:** Increases trust and conversion
- **Multi-day support:** Unlocks serious travel planning use case
- **Full verification:** Differentiates from generic AI itinerary tools
- **Light theme:** Improves accessibility compliance and user preference
- **Saved trips:** Enables monetization path (future premium features)

### 12. UX Improvements for Trip Display & Interface

**Current UX Issues:**

- Trip display is dense and technical (version numbers, latency ms, raw JSON-like events)
- Planning log uses collapsible details elements that feel developer-focused
- Timeline lacks visual hierarchy and breathing room
- Map display is small and lacks interactivity
- Statistics row feels like debug info rather than user insights
- No empty states or progress indicators during multi-step flows
- Limited mobile responsiveness
- No onboarding or feature discovery

**UX Enhancement Goals:**

1. Make trip display scannable and visually delightful
2. Surface insights, hide technical details
3. Improve information hierarchy
4. Add progressive disclosure for advanced features
5. Better mobile experience
6. Onboarding and empty states

---

#### 12.1 Itinerary Display Redesign

**Current State:** Vertical timeline with plain text activities

**Enhanced Design:**

**Visual Hierarchy:**

- Large, readable activity names (24px, semibold)
- Clear time indicators with icons (clock icon + time)
- Prominent place images/photos (150x150px rounded cards)
- Transport mode with distinctive icons (walk, transit, car)
- Collapsible activity details (reason, tags, issues)

**Card-Based Layout:**

- Switch from timeline nodes to elevated cards
- Soft shadows, rounded corners (12px border-radius)
- Hover state: subtle lift effect
- Active state: highlighted border
- Edit mode: inline editing controls

**Quick Actions Per Activity:**

- "View on map" button (highlights place on map)
- "Edit duration" (inline time picker)
- "Remove stop" (with undo toast)
- "Swap order" (drag handle on desktop, buttons on mobile)

---

#### 12.2 Map Display Enhancement

**Current State:** Small static map with plot points

**Enhanced Map Experience:**

**Larger, More Prominent:**

- Full-width map section above itinerary on mobile
- Side-by-side with itinerary on desktop (60/40 split)
- Expandable to full-screen mode

**Interactive Features:**

- Click place marker → highlight activity card
- Hover activity → pulse marker on map
- Toggle route visibility
- Zoom to fit all places
- Current location marker (if permission granted)
- Cluster markers when zoomed out

**Map Controls:**

- Style toggle (streets/satellite)
- "Show route" toggle
- "Fit to trip" button
- Search places on map
- Add custom stop from map

**Visual Improvements:**

- Numbered markers matching itinerary order
- Color-coded by day (for multi-day trips)
- Start/End markers with distinct icons
- Overnight location markers (hotel icon)
- Route polyline with day-specific colors

---

#### 12.3 Planning Progress Redesign

**Current State:** Technical event log with model call timing

**Enhanced Progress Experience:**

**Progress Stages:**

- 'geocoding' → "Finding your starting point..."
- 'discovering' → "Searching for places in NYC..."
- 'screening' → "Jev is reviewing candidates..."
- 'planning' → "Planning stop 3 of ~6..."
- 'optimizing' → "Checking routes and timing..."
- 'reviewing' → "Final review and validation..."
- 'complete' → "Your trip is ready!"

**User-Friendly Status:**

- Progress bar with percentage
- Current stage message
- Statistics: places found, stops planned, elapsed time
- Pause/Stop controls with clear actions

**Stage Messages:**

- "Finding your starting point..." (geocoding)
- "Searching for museums and parks in New York City..." (discovery)
- "Jev is checking 24 candidates against your preferences..." (screening)
- "Planning stop 3... The Met looks promising!" (proposal)
- "Checking walking time from Central Park to Chelsea..." (routing)
- "Jev is reviewing the day's pace and variety..." (review)
- "One moment, adjusting lunch timing..." (repair)

**Hide Technical Details:**

- No version numbers in main UI
- No model call latency in progress
- No raw JSON data structures
- Move technical details to collapsible "Advanced" section

---

#### 12.4 Statistics & Insights Redesign

**Current State:** `Stops: 6 | Jev reviews: 8 | Repair rounds: 1 | ms per review: 847`

**Enhanced Insights:**

**Summary Cards:**

- **Stops card:** "{N} stops across {D} days"
- **Time card:** "{H} hours of activities, {T} min travel"
- **Pace card:** "Relaxed" / "Balanced" / "Active" / "Packed"
- **Verified card:** "{N}/{T} details confirmed"

**Pace Label Translation:**

- `very_full` → "Packed" with warning color
- `full` → "Active" with info color
- `balanced` → "Balanced" with success color
- `spacious` → "Relaxed" with success color

**User-Focused Metrics:**

- Total activity time (not raw minutes)
- Travel time summary (not per-leg)
- Pace description (not technical load ratio)
- Verification status (not Jev call count)

---

#### 12.5 Planning Log Redesign

**Current State:** Collapsible `<details>` with technical events

**Enhanced Activity Log:**

**User-Friendly Events:**

- Technical: "LLM | Structured proposal returned for controller validation | 847 ms"
- User-friendly: "✓ Added Central Park (90 min stay)"
- Technical: "Jev | Local review: flag | 234 ms"
- User-friendly: "⚠ Timing needs adjustment"

**Simplified Messages:**

- "✓ Found 24 places matching your interests"
- "✓ Added The Metropolitan Museum (90 min)"
- "↻ Checking walking routes..."
- "⚠ Adjusting lunch timing for better flow"
- "✓ Trip verified: all stops open, routes confirmed"

**Collapsible Technical View:**

- "Show technical details" toggle at top
- Reveals: model names, latency, version numbers, raw decisions
- Default: hidden for typical users
- Persists preference in localStorage

---

#### 12.6 Empty States & Onboarding

**Landing Page Improvements:**

**First-Time User Experience:**

- Welcome banner with feature highlights
- "Get started" tutorial overlay (optional)
- Example destinations with thumbnails
- "Quick start" templates (Museum day, Foodie tour, Nature escape)

**Empty States:**

**No Saved Trips:**

- Icon: Compass
- Message: "No trips yet"
- Action: "Plan a trip" button

**Planning Failed:**

- Icon: Warning
- Message: Error explanation
- Actions: "Try again" or "Adjust my request"

**No Results Found:**

- Message: "We couldn't find enough places in {destination}"
- Suggestion: "Try a larger city or a different destination"
- Action: "Choose another destination"

---

#### 12.7 Mobile Responsiveness

**Current Issues:**

- "Triptych" layout breaks on mobile
- Form fields are cramped
- Map too small on mobile
- Timeline difficult to scroll
- Replay controls not touch-friendly

**Mobile Improvements:**

**Responsive Breakpoints:**

- Mobile first: single column
- Tablet (768px+): two columns
- Desktop (1200px+): three columns (triptych)

**Tabbed Interface (Mobile):**

- Tab 1: Map (full width)
- Tab 2: Itinerary (scrollable list)
- Tab 3: Details (insights, log)

**Touch-Friendly Controls:**

- Larger touch targets (44x44px minimum)
- Swipe gestures for timeline navigation
- Pull-to-refresh for updating trip
- Bottom sheet for activity details
- Sticky action buttons (Save, Export, Share)

**Mobile Form Optimization:**

- Native date/time pickers
- Autocomplete for destination
- Multi-step form with progress indicator
- "Quick start" presets (Half day, Full day, Weekend)

---

#### 12.8 Accessibility Improvements

**Current Gaps:**

- No skip links
- Missing ARIA labels on interactive elements
- Insufficient color contrast in some states
- No keyboard navigation announcements
- Focus management issues in modals

**Accessibility Enhancements:**

**Keyboard Navigation:**

- Activity cards fully keyboard accessible
- Tab order follows visual order
- Enter to activate, Delete to remove
- Escape to close modals/details

**Screen Reader Support:**

- Live region for planning progress announcements
- Descriptive ARIA labels on all interactive elements
- Status announcements: "Planning stop 3, Central Park added"
- Landmark roles for major sections

**Focus Management:**

- Trap focus in modals
- Return focus after actions
- Visible focus indicators (2px solid outline)
- Skip to main content link

**Color Contrast:**

- Ensure 4.5:1 for normal text, 3:1 for large text
- Don't rely on color alone for information
- Add icons alongside color-coded badges
- Test with color blindness simulators

**Reduced Motion:**

- Respect `prefers-reduced-motion` media query
- Disable all animations when set
- Maintain functionality without motion

---

#### 12.9 Micro-Interactions & Delight

**Subtle Animations:**

- Activity cards fade in sequentially as added
- Checkmarks animate when verification completes
- Progress bar smooth transition
- Map markers bounce on first appearance
- Success toast with celebration icon

**Haptic Feedback (Mobile):**

- Subtle vibration on activity added
- Stronger feedback on trip complete
- Gentle pulse on error

**Loading States:**

- Skeleton screens for activity cards
- Pulsing placeholder for map while loading
- Animated route drawing on map
- Shimmer effect on loading images

**Success Moments:**

- Confetti animation on trip completion (optional)
- Celebration icon in success toast
- Smooth checkmark animation for verifications
- Encouraging messages: "Your {destination} trip looks amazing!"

**Smart Defaults:**

- Remember last used destination
- Suggest time windows based on selection
- Auto-fill return date for multi-day
- Learn from user edits (longer/shorter visits)

---

#### 12.10 Implementation Checklist

**Phase 1: Core Improvements (Week 16)**

- [ ] Redesign activity cards with visual hierarchy
- [ ] Enhance map display and interactions
- [ ] Simplify planning progress indicators
- [ ] User-friendly statistics/insights cards
- [ ] Basic mobile responsive layout

**Phase 2: Polish & Delight (Week 17)**

- [ ] Activity log user-friendly transformations
- [ ] Empty states and error states
- [ ] Mobile tabbed interface
- [ ] Accessibility audit and fixes
- [ ] Micro-interactions and animations

**Phase 3: Advanced Features (Week 18)**

- [ ] Drag-and-drop activity reordering
- [ ] Inline activity editing
- [ ] Map-based activity addition
- [ ] Onboarding flow for first-time users
- [ ] Advanced mobile gestures

**Design System Updates:**

- New component: `ActivityCard`
- New component: `InsightCard`
- New component: `ProgressStage`
- New component: `EmptyState`
- Updated: `DayDial` with better labeling
- Updated: All buttons with consistent sizing
- Updated: Form inputs with better mobile support

**Testing:**

- [ ] Usability testing with 5-10 users
- [ ] Mobile device testing (iOS Safari, Android Chrome)
- [ ] Accessibility audit with screen readers (NVDA, VoiceOver)
- [ ] Performance testing (Core Web Vitals)
- [ ] A/B test simplified vs. technical view
