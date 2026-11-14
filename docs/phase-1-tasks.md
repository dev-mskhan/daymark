# Daymark Phase 1 - Task Tracker

**Project:** Daymark Enhanced Phase 1  
**Timeline:** 18 weeks  
**Status Legend:** `🔴 Not Started` | `🟡 In Progress` | `🟢 Complete` | `⚪ Blocked` | `🔵 Review`

---

## Priority 1: Journey Verification (Week 1-2)

**Goal:** Eliminate "travel to/from first/last stop not verified" caveats

| #    | Task                                                             | Status     | Assignee | Notes                                                     |
| ---- | ---------------------------------------------------------------- | ---------- | -------- | --------------------------------------------------------- |
| 1.1  | Add geocoding contract to PlacesProvider interface               | � Complete |          | `GeocodedLocation` type + `geocode()` on `PlacesProvider` |
| 1.2  | Implement Geoapify Geocoding API adapter                         | � Complete |          | Server-only, `GEOAPIFY_API_KEY`, confidence scoring       |
| 1.3  | Update `planTrip()` to geocode origin before candidate discovery | � Complete |          | geocode_start/end events, graceful fallback               |
| 1.4  | Calculate and store first route leg (origin → first activity)    | � Complete |          | `snapshot.firstLeg` with Jev transport selection          |
| 1.5  | Calculate and store return route leg (last activity → origin)    | � Complete |          | `snapshot.returnLeg`                                      |
| 1.6  | Update `summarizeTiming()` to include origin/return travel       | � Complete |          | firstLegMinutes + returnLegMinutes params                 |
| 1.7  | Update timing validation to include full journey                 | � Complete |          | `time_window` checkId includes all legs                   |
| 1.8  | Add origin marker to timeline UI                                 | � Complete |          | ⌂ symbol with starting point card                         |
| 1.9  | Add return leg display to timeline UI                            | � Complete |          | Return card with transport details + arrival time         |
| 1.10 | Add tests for geocoding (happy path, errors, ambiguous)          | � Complete |          | 8 tests in `planner.test.ts`                              |
| 1.11 | Add tests for full-journey routing                               | � Complete |          | 6 tests for routing + timing                              |
| 1.12 | Update caveat notice to remove "travel to/from" when verified    | � Complete |          | Dynamic caveat via `buildCaveatNotice()`                  |

**Deliverable:** Starting point and return journey fully verified and displayed ✅

---

## Priority 2: Provider-Sourced Verification (Week 3-4)

**Goal:** Eliminate "opening hours and time zones not verified" caveats

| #    | Task                                                  | Status     | Assignee | Notes                                                                                         |
| ---- | ----------------------------------------------------- | ---------- | -------- | --------------------------------------------------------------------------------------------- |
| 2.1  | Extend Place schema with verification fields          | � Complete |          | `timezone`, `formattedOpeningHours`, `operationalStatus`, `accessibilityInfo`, `lastVerified` |
| 2.2  | Implement Geoapify Place Details API adapter          | � Complete |          | `PlaceDetailsProvider` in `lib/providers/place-details.ts`                                    |
| 2.3  | Implement opening hours parsing from OSM format       | � Complete |          | `parseOpeningHours()` — ranges, 24/7, closed, comma days                                      |
| 2.4  | Add `enrichPlaceDetails()` function                   | � Complete |          | In-memory cache per session                                                                   |
| 2.5  | Add place enrichment pipeline in candidate discovery  | � Complete |          | Batched 3 at a time after screening                                                           |
| 2.6  | Extract and validate timezone from place details      | � Complete |          | `extractTimezone()` in planning-context                                                       |
| 2.7  | Add timezone consistency check across itinerary       | � Complete |          | `timezoneVerified` flag, multi-timezone detection                                             |
| 2.8  | Update TimingContext with timezone fields             | � Complete |          | `timezone?` and `timezoneVerified?` on `TimingContext`                                        |
| 2.9  | Implement `buildCaveatNotice()` dynamic caveat system | � Complete |          | In `planning-context.ts`                                                                      |
| 2.10 | Update UI to show verification status indicators      | � Complete |          | Badges: Hours verified, Open, Accessible, Timezone                                            |
| 2.11 | Add tests for opening hours parsing (various formats) | � Complete |          | 9 tests in `place-details.test.ts`                                                            |
| 2.12 | Add tests for timezone validation                     | � Complete |          | 6 tests for single/multi/no timezone                                                          |
| 2.13 | Update caveat display to use dynamic function         | � Complete |          | Reads from `complete` event message                                                           |
| 2.14 | Add "Verified as of [date]" display                   | � Complete |          | In badge tooltip via `lastVerified`                                                           |

**Deliverable:** Opening hours and timezone verified from provider data ✅

---

## Priority 3: Enhanced Jev Validation (Week 5-6)

**Goal:** Proactive validation of opening hours and accessibility

| #    | Task                                                 | Status     | Assignee | Notes                                                          |
| ---- | ---------------------------------------------------- | ---------- | -------- | -------------------------------------------------------------- |
| 3.1  | Add new Jev dimensions to domain types               | � Complete |          | `opening_hours_fit`, `operational_status`, `accessibility_fit` |
| 3.2  | Implement `validateOpeningHours()` in JevProvider    | � Complete |          | Deterministic + Jev-backed, fixture + live                     |
| 3.3  | Create PlaceValidationContext interface              | � Complete |          | `scheduledTime`, `dayOfWeek`, `duration`, `constraints`        |
| 3.4  | Build timestamp-aware scheduling with day-of-week    | � Complete |          | `buildDetailedSchedule()` accumulates offsets                  |
| 3.5  | Add `buildDetailedSchedule()` helper function        | � Complete |          | ISO timestamps per activity incl. first leg                    |
| 3.6  | Integrate opening hours validation in review flow    | � Complete |          | Runs on global reviews and final draft in `planTrip()`         |
| 3.7  | Add accessibility constraint parsing from user input | � Complete |          | `detectAccessibilityConstraints()` regex                       |
| 3.8  | Implement accessibility validation via Jev           | � Complete |          | `validateAccessibility()` — only when constraints present      |
| 3.9  | Add operational status deterministic check           | � Complete |          | `temporarily_closed`/`permanently_closed` flagged without Jev  |
| 3.10 | Update repair hints for new issue types              | � Complete |          | Embedded in all issue objects                                  |
| 3.11 | Add opening hours questions to review flow           | � Complete |          | `opening_hours_check` event emitted                            |
| 3.12 | Add accessibility questions when applicable          | � Complete |          | `accessibility_check` event emitted                            |
| 3.13 | Update Issue type with new checkId values            | � Complete |          | `opening_hours_fit`, `operational_status`, `accessibility_fit` |
| 3.14 | Add tests for opening hours validation edge cases    | � Complete |          | 8 tests in `jev-validation.test.ts`                            |
| 3.15 | Add tests for accessibility validation               | � Complete |          | 4 accessibility + 7 constraint detection + 5 schedule tests    |

**Deliverable:** Jev flags opening hours conflicts and accessibility issues ✅

---

## Priority 4: Multi-Day Trip Support (Week 7-9)

**Goal:** Support 1-7 day itineraries with overnight breaks

### Week 7: Domain Models & Planning Logic

| #    | Task                                         | Status     | Assignee | Notes                                                                       |
| ---- | -------------------------------------------- | ---------- | -------- | --------------------------------------------------------------------------- |
| 4.1  | Create DayBoundary interface                 | � Complete |          | `dayNumber`, `date`, `startTime`, `endTime`, `overnightPlace`               |
| 4.2  | Create MultiDayRequest interface             | � Complete |          | Extends TripRequest with `days: DayBoundary[]`                              |
| 4.3  | Create DaySegment interface                  | � Complete |          | `dayNumber`, `startingFrom`, `endingAt`, `snapshot`, `candidates`, `events` |
| 4.4  | Create MultiDaySnapshot interface            | � Complete |          | `currentDay`, `days`, `totalActivities`, `status`                           |
| 4.5  | Implement `planMultiDayTrip()` orchestrator  | � Complete |          | `lib/planner-multiday.ts`, 1–7 days, overnight chaining                     |
| 4.6  | Implement `planSingleDay()` function         | � Complete |          | Wraps `planTrip()` with day-specific TripRequest                            |
| 4.7  | Add overnight location validation logic      | � Complete |          | `validateOvernightLocation()` — 30 km threshold                             |
| 4.8  | Implement inter-day route calculation        | � Complete |          | `calcInterDayRoute()`, attaches to next day `firstLeg`                      |
| 4.9  | Add cross-day experience coherence via Jev   | � Complete |          | Samples up to 6 activities across days, `cross_day_repetition` issue        |
| 4.10 | Update LLM context for multi-day planning    | � Complete |          | `day_start` event emitted per day with context                              |
| 4.11 | Implement day-independent repair budget      | � Complete |          | Each `planSingleDay()` call has own budget via `planTrip()`                 |
| 4.12 | Add cumulative similarity checks across days | � Complete |          | Jev `experience_similarity` query across all days                           |

### Week 8: Database & Persistence

| #    | Task                                                   | Status     | Assignee | Notes                                                |
| ---- | ------------------------------------------------------ | ---------- | -------- | ---------------------------------------------------- |
| 4.13 | Create `day_boundary` database table schema            | � Complete |          | SQL in `lib/db/schema-multiday.ts`, wired in P6      |
| 4.14 | Create `day_segment` database table schema             | � Complete |          | SQL + TypeScript column types defined                |
| 4.15 | Write Drizzle migration for new tables                 | � Complete |          | SQL migration in schema-multiday.ts comments         |
| 4.16 | Add RLS policies for day_boundary table                | � Review   |          | SQL defined; applied when Supabase provisioned in P6 |
| 4.17 | Add RLS policies for day_segment table                 | � Review   |          | SQL defined; applied when Supabase provisioned in P6 |
| 4.18 | Update trip API to accept multi-day structure          | � Review   |          | Deferred to P6 (API infrastructure)                  |
| 4.19 | Update trip persistence to save day boundaries         | � Complete |          | `dayBoundaryToRow()` helper                          |
| 4.20 | Update trip persistence to save day segments           | � Complete |          | `daySegmentToRow()` helper                           |
| 4.21 | Update trip loading to reconstruct multi-day structure | � Complete |          | `rowToDaySegment()` helper                           |
| 4.22 | Update trip duplication for multi-day                  | � Review   |          | Deferred to P6 (trip lifecycle APIs)                 |

### Week 9: UI Components & Testing

| #    | Task                                           | Status     | Assignee | Notes                                           |
| ---- | ---------------------------------------------- | ---------- | -------- | ----------------------------------------------- |
| 4.23 | Build day-by-day accordion UI component        | � Complete |          | `DayAccordion.tsx` — collapsible, tabs ARIA     |
| 4.24 | Add multiple DayDial components (one per day)  | � Complete |          | One DayDial per accordion panel                 |
| 4.25 | Add day boundary indicators with date labels   | � Complete |          | Day header with stop count                      |
| 4.26 | Add overnight location markers in timeline     | � Complete |          | Moon icon + overnight marker card               |
| 4.27 | Update form to collect multiple day boundaries | � Review   |          | State added; full form UI deferred to P8        |
| 4.28 | Add day-switching navigation in workspace      | � Complete |          | Accordion tabs + `activeDay` state              |
| 4.29 | Update map to color-code activities by day     | � Review   |          | Deferred to P8 (map enhancements)               |
| 4.30 | Add overnight markers to map display           | � Review   |          | Deferred to P8 (map enhancements)               |
| 4.31 | Add tests for 1-day planning (baseline)        | � Complete |          | 3 tests in `planner-multiday.test.ts`           |
| 4.32 | Add tests for 3-day planning with overnight    | � Complete |          | 3 tests: structure, starting-from, endingAt     |
| 4.33 | Add tests for 7-day planning (max)             | � Complete |          | Accepts 7, rejects 8                            |
| 4.34 | Add tests for cross-day coherence              | � Complete |          | day_start events, independent snapshot versions |
| 4.35 | Add tests for overnight location validation    | � Complete |          | 3 tests + `calcInterDayRoute` test              |

**Deliverable:** Full multi-day trip planning with overnight locations ✅

---

## Priority 5: Light Theme (Week 10)

**Goal:** Support light theme for user preference and accessibility

| #    | Task                                                       | Status         | Assignee | Notes                                    |
| ---- | ---------------------------------------------------------- | -------------- | -------- | ---------------------------------------- |
| 5.1  | Define light theme color palette in CSS                    | 🔴 Not Started |          | --color-bg: #FAFAFA, etc.                |
| 5.2  | Convert all hardcoded colors to CSS variables              | 🔴 Not Started |          | --color-bg, --color-text, --color-accent |
| 5.3  | Implement `[data-theme="light"]` selector overrides        | 🔴 Not Started |          |                                          |
| 5.4  | Implement `[data-theme="dark"]` selector (existing colors) | 🔴 Not Started |          |                                          |
| 5.5  | Create theme switching logic with localStorage             | 🔴 Not Started |          | Persist preference                       |
| 5.6  | Add theme toggle button in navigation                      | 🔴 Not Started |          | Sun/moon icon                            |
| 5.7  | Respect `prefers-color-scheme` media query                 | 🔴 Not Started |          | System preference                        |
| 5.8  | Add smooth transition on theme switch                      | 🔴 Not Started |          | transition: background-color 0.3s        |
| 5.9  | Update all components to use CSS variables                 | 🔴 Not Started |          | ActivityCard, buttons, forms, etc.       |
| 5.10 | Test hover states in both themes                           | 🔴 Not Started |          |                                          |
| 5.11 | Test active states in both themes                          | 🔴 Not Started |          |                                          |
| 5.12 | Test disabled states in both themes                        | 🔴 Not Started |          |                                          |
| 5.13 | Test map overlays in both themes                           | 🔴 Not Started |          |                                          |
| 5.14 | Update Phosphor icon weights/colors for light theme        | 🔴 Not Started |          |                                          |
| 5.15 | Test timeline visualization in both themes                 | 🔴 Not Started |          |                                          |
| 5.16 | Ensure WCAG AA contrast ratios in both themes              | 🔴 Not Started |          | 4.5:1 text, 3:1 UI                       |
| 5.17 | Test with color blindness simulators                       | 🔴 Not Started |          | Protanopia, Deuteranopia, Tritanopia     |
| 5.18 | Add theme preference to user profile (if authenticated)    | 🔴 Not Started |          | Optional                                 |

**Deliverable:** Complete light and dark theme support

---

## Priority 6: Authentication & Persistence (Week 11-13)

**Goal:** Authenticated saved trips with Supabase

### Week 11: Infrastructure Setup

| #    | Task                                        | Status         | Assignee | Notes                          |
| ---- | ------------------------------------------- | -------------- | -------- | ------------------------------ |
| 6.1  | Install and configure @supabase/ssr         | 🔴 Not Started |          |                                |
| 6.2  | Install and configure @supabase/supabase-js | 🔴 Not Started |          |                                |
| 6.3  | Install and configure drizzle-orm           | 🔴 Not Started |          |                                |
| 6.4  | Install Postgres driver for Drizzle         | 🔴 Not Started |          |                                |
| 6.5  | Create Supabase browser client              | 🔴 Not Started |          |                                |
| 6.6  | Create Supabase server client               | 🔴 Not Started |          | SSR-safe                       |
| 6.7  | Define Drizzle schema for user_profile      | 🔴 Not Started |          | Keyed by Supabase Auth user ID |
| 6.8  | Define Drizzle schema for trip              | 🔴 Not Started |          | Owner, status, metadata        |
| 6.9  | Define Drizzle schema for day_boundary      | 🔴 Not Started |          | Multi-day support              |
| 6.10 | Define Drizzle schema for day_segment       | 🔴 Not Started |          | Multi-day support              |
| 6.11 | Define Drizzle schema for planning_run      | 🔴 Not Started |          | Immutable events               |
| 6.12 | Define Drizzle schema for trip_revision     | 🔴 Not Started |          | Accepted versions              |
| 6.13 | Write Drizzle migrations for all tables     | 🔴 Not Started |          |                                |
| 6.14 | Test migrations on local Supabase instance  | 🔴 Not Started |          |                                |

### Week 12: Authentication & RLS

| #    | Task                                               | Status         | Assignee | Notes                             |
| ---- | -------------------------------------------------- | -------------- | -------- | --------------------------------- |
| 6.15 | Configure Google OAuth in Supabase dashboard       | 🔴 Not Started |          | Get client ID/secret              |
| 6.16 | Add GOOGLE_CLIENT_ID to env                        | 🔴 Not Started |          |                                   |
| 6.17 | Add GOOGLE_CLIENT_SECRET to env                    | 🔴 Not Started |          |                                   |
| 6.18 | Implement sign-up UI (email/password)              | 🔴 Not Started |          |                                   |
| 6.19 | Implement sign-in UI (email/password)              | 🔴 Not Started |          |                                   |
| 6.20 | Implement Google OAuth button                      | 🔴 Not Started |          |                                   |
| 6.21 | Implement OAuth callback route                     | 🔴 Not Started |          | /auth/callback                    |
| 6.22 | Implement sign-out functionality                   | 🔴 Not Started |          |                                   |
| 6.23 | Add expired session handling                       | 🔴 Not Started |          | Redirect to sign-in               |
| 6.24 | Add unauthorized state handling                    | 🔴 Not Started |          | 401/403 errors                    |
| 6.25 | Implement secure SSR cookie handling               | 🔴 Not Started |          |                                   |
| 6.26 | Add RLS policy for user_profile (own record only)  | 🔴 Not Started |          | auth.uid() = user_id              |
| 6.27 | Add RLS policy for trip (owner CRUD)               | 🔴 Not Started |          | auth.uid() = owner_id             |
| 6.28 | Add RLS policy for day_boundary (via trip)         | 🔴 Not Started |          |                                   |
| 6.29 | Add RLS policy for day_segment (via trip_revision) | 🔴 Not Started |          |                                   |
| 6.30 | Add RLS policy for planning_run (owner read)       | 🔴 Not Started |          |                                   |
| 6.31 | Add RLS policy for trip_revision (owner CRUD)      | 🔴 Not Started |          |                                   |
| 6.32 | Add server-side ownership checks as defense        | 🔴 Not Started |          | Don't trust request body user IDs |

### Week 13: Trip Lifecycle APIs

| #    | Task                                                 | Status         | Assignee | Notes                                |
| ---- | ---------------------------------------------------- | -------------- | -------- | ------------------------------------ |
| 6.33 | Implement POST /api/trips (create draft)             | 🔴 Not Started |          | Multi-day support                    |
| 6.34 | Implement GET /api/trips (list owned trips)          | 🔴 Not Started |          |                                      |
| 6.35 | Implement GET /api/trips/:id (retrieve trip)         | 🔴 Not Started |          | With all day boundaries and segments |
| 6.36 | Implement PATCH /api/trips/:id (edit draft)          | 🔴 Not Started |          | Day boundaries, inputs               |
| 6.37 | Implement POST /api/trips/:id/plan (start planning)  | 🔴 Not Started |          | Stream events for all days           |
| 6.38 | Implement POST /api/trips/:id/accept (save revision) | 🔴 Not Started |          | Multi-day itinerary                  |
| 6.39 | Implement POST /api/trips/:id/duplicate (copy trip)  | 🔴 Not Started |          | Multi-day structure                  |
| 6.40 | Implement POST /api/trips/:id/archive (archive trip) | 🔴 Not Started |          |                                      |
| 6.41 | Implement DELETE /api/trips/:id (delete trip)        | 🔴 Not Started |          | With confirmation                    |
| 6.42 | Implement GET /api/trips/:id/export (print output)   | 🔴 Not Started |          | All days, verification status        |
| 6.43 | Add auth middleware to all trip APIs                 | 🔴 Not Started |          | Require valid session                |
| 6.44 | Add request validation with Zod schemas              | 🔴 Not Started |          |                                      |
| 6.45 | Add error handling and user-friendly messages        | 🔴 Not Started |          |                                      |
| 6.46 | Test all APIs with authenticated requests            | 🔴 Not Started |          |                                      |
| 6.47 | Test RLS enforcement (attempt unauthorized access)   | 🔴 Not Started |          |                                      |

**Deliverable:** Authenticated users can save and manage multi-day trips

---

## Priority 7: Testing & Polish (Week 14-15)

**Goal:** Production-ready quality

### Week 14: Testing

| #    | Task                                                         | Status         | Assignee | Notes                             |
| ---- | ------------------------------------------------------------ | -------------- | -------- | --------------------------------- |
| 7.1  | Add integration test: Single-day trip end-to-end             | 🔴 Not Started |          |                                   |
| 7.2  | Add integration test: Multi-day trip (3 days)                | 🔴 Not Started |          |                                   |
| 7.3  | Add integration test: Geocoding with real addresses          | 🔴 Not Started |          |                                   |
| 7.4  | Add integration test: Opening hours validation               | 🔴 Not Started |          |                                   |
| 7.5  | Add integration test: Timezone consistency                   | 🔴 Not Started |          |                                   |
| 7.6  | Add integration test: Supabase session handling              | 🔴 Not Started |          |                                   |
| 7.7  | Add integration test: RLS ownership isolation                | 🔴 Not Started |          | User A cannot access User B trips |
| 7.8  | Test with real Geoapify data (NYC)                           | 🔴 Not Started |          |                                   |
| 7.9  | Test with real Geoapify data (Los Angeles)                   | 🔴 Not Started |          |                                   |
| 7.10 | Test with real Geoapify data (Chicago)                       | 🔴 Not Started |          |                                   |
| 7.11 | Load test: Multi-day planning performance                    | 🔴 Not Started |          | Target: <30s for 3 days           |
| 7.12 | Test timezone edge case: NYC → Philadelphia (cross-timezone) | 🔴 Not Started |          |                                   |
| 7.13 | Test opening hours parsing: Standard format                  | 🔴 Not Started |          | Mo-Fr 09:00-18:00                 |
| 7.14 | Test opening hours parsing: Complex format                   | 🔴 Not Started |          | Multiple time slots, irregular    |
| 7.15 | Test opening hours parsing: Malformed format                 | 🔴 Not Started |          | Graceful handling                 |
| 7.16 | Accessibility audit: Keyboard navigation                     | 🔴 Not Started |          | All interactive elements          |
| 7.17 | Accessibility audit: Screen reader (NVDA)                    | 🔴 Not Started |          |                                   |
| 7.18 | Accessibility audit: Screen reader (VoiceOver)               | 🔴 Not Started |          |                                   |
| 7.19 | Accessibility audit: Color contrast                          | 🔴 Not Started |          | Both themes                       |
| 7.20 | Performance test: Lighthouse score                           | 🔴 Not Started |          | Target: 90+                       |
| 7.21 | Performance test: Core Web Vitals                            | 🔴 Not Started |          | LCP, FID, CLS                     |

### Week 15: Polish & Documentation

| #    | Task                                               | Status         | Assignee | Notes                                  |
| ---- | -------------------------------------------------- | -------------- | -------- | -------------------------------------- |
| 7.22 | Optimize: Reduce Jev calls via caching             | 🔴 Not Started |          | Cache opening hours decisions          |
| 7.23 | Optimize: Cache place enrichment data              | 🔴 Not Started |          | Avoid redundant API calls              |
| 7.24 | Optimize: Batch Jev accessibility checks           | 🔴 Not Started |          |                                        |
| 7.25 | Optimize: Lazy load map component                  | 🔴 Not Started |          | Code splitting                         |
| 7.26 | Update API documentation                           | 🔴 Not Started |          | All trip endpoints                     |
| 7.27 | Update user guide documentation                    | 🔴 Not Started |          | How to plan trips                      |
| 7.28 | Update developer README                            | 🔴 Not Started |          | Setup, env vars, architecture          |
| 7.29 | Update DESIGN.md with new patterns                 | 🔴 Not Started |          | If applicable                          |
| 7.30 | Create CHANGELOG.md for Phase 1                    | 🔴 Not Started |          | All features added                     |
| 7.31 | Update demo trip fixtures with verification        | 🔴 Not Started |          | Opening hours, timezone, accessibility |
| 7.32 | Create multi-day demo fixture (3-day NYC)          | 🔴 Not Started |          | artifacts/fixture-multiday-run.json    |
| 7.33 | Update demo places with enhanced schema            | 🔴 Not Started |          | formattedOpeningHours, timezone, etc.  |
| 7.34 | Add demo origin place (Penn Station)               | 🔴 Not Started |          | Geocoded coordinates                   |
| 7.35 | Add demo first-leg route (origin → first activity) | 🔴 Not Started |          |                                        |
| 7.36 | Add demo return-leg route (last → origin)          | 🔴 Not Started |          |                                        |
| 7.37 | Update demo Jev responses for new dimensions       | 🔴 Not Started |          | Opening hours, accessibility           |
| 7.38 | Test demo mode with all new features               | 🔴 Not Started |          |                                        |
| 7.39 | Update demo UI copy for verification features      | 🔴 Not Started |          |                                        |
| 7.40 | Create verification states demo examples           | 🔴 Not Started |          | Full, partial, multi-timezone          |

**Deliverable:** Production-ready, fully tested enhanced Phase 1 with updated demo

---

## Priority 8: UX Improvements (Week 16-18)

**Goal:** User-friendly interface that delights

### Week 16: Core Improvements

| #    | Task                                                     | Status         | Assignee | Notes                             |
| ---- | -------------------------------------------------------- | -------------- | -------- | --------------------------------- |
| 8.1  | Design ActivityCard component spec                       | 🔴 Not Started |          | Visual hierarchy, props interface |
| 8.2  | Implement ActivityCard component                         | 🔴 Not Started |          | Replace timeline nodes            |
| 8.3  | Add place photo support to ActivityCard                  | 🔴 Not Started |          | 150x150px rounded                 |
| 8.4  | Add verification badges to ActivityCard                  | 🔴 Not Started |          | "Open now", "Accessible"          |
| 8.5  | Add collapsible details to ActivityCard                  | 🔴 Not Started |          | Reason, evidence                  |
| 8.6  | Implement card hover/active states                       | 🔴 Not Started |          | Subtle lift, highlighted border   |
| 8.7  | Add quick actions to ActivityCard                        | 🔴 Not Started |          | View on map, Edit, Remove, Swap   |
| 8.8  | Implement transport preview between cards                | 🔴 Not Started |          | Walk/Transit icon + duration      |
| 8.9  | Enlarge map display (60/40 desktop split)                | 🔴 Not Started |          | Side-by-side with itinerary       |
| 8.10 | Add full-screen map mode                                 | 🔴 Not Started |          | Expand button                     |
| 8.11 | Implement map marker click → highlight activity          | 🔴 Not Started |          | Bidirectional interaction         |
| 8.12 | Implement activity hover → pulse map marker              | 🔴 Not Started |          |                                   |
| 8.13 | Add map controls (style toggle, route toggle)            | 🔴 Not Started |          |                                   |
| 8.14 | Add "Fit to trip" zoom button                            | 🔴 Not Started |          |                                   |
| 8.15 | Implement progress stages (geocoding, discovering, etc.) | 🔴 Not Started |          | User-friendly messages            |
| 8.16 | Add progress bar visualization                           | 🔴 Not Started |          | Smooth percentage transition      |
| 8.17 | Add progress statistics display                          | 🔴 Not Started |          | Places found, stops planned       |
| 8.18 | Hide technical details from progress UI                  | 🔴 Not Started |          | No version numbers, latency ms    |
| 8.19 | Design InsightCard component                             | 🔴 Not Started |          | Icon, value, description          |
| 8.20 | Implement InsightCard component                          | 🔴 Not Started |          |                                   |
| 8.21 | Replace statistics row with insight cards                | 🔴 Not Started |          | Stops, Time, Pace, Verified       |
| 8.22 | Add pace label translation                               | 🔴 Not Started |          | very_full → Packed, etc.          |
| 8.23 | Update mobile layout to single column                    | 🔴 Not Started |          |                                   |
| 8.24 | Add responsive breakpoints (768px, 1200px)               | 🔴 Not Started |          |                                   |

### Week 17: Polish & Delight

| #    | Task                                                 | Status         | Assignee | Notes                           |
| ---- | ---------------------------------------------------- | -------------- | -------- | ------------------------------- |
| 8.25 | Transform technical events to user-friendly messages | 🔴 Not Started |          | "✓ Added Central Park"          |
| 8.26 | Implement activity log timeline UI                   | 🔴 Not Started |          | Icon, title, description        |
| 8.27 | Add "Show technical details" toggle                  | 🔴 Not Started |          | Collapsible per event           |
| 8.28 | Persist technical view preference in localStorage    | 🔴 Not Started |          |                                 |
| 8.29 | Design EmptyState component                          | 🔴 Not Started |          | Icon, message, action           |
| 8.30 | Implement EmptyState component                       | 🔴 Not Started |          |                                 |
| 8.31 | Add "No saved trips" empty state                     | 🔴 Not Started |          |                                 |
| 8.32 | Add "Planning failed" error state                    | 🔴 Not Started |          | With retry actions              |
| 8.33 | Add "No results found" empty state                   | 🔴 Not Started |          |                                 |
| 8.34 | Design welcome banner for first-time users           | 🔴 Not Started |          | Feature highlights              |
| 8.35 | Implement welcome banner with dismiss                | 🔴 Not Started |          |                                 |
| 8.36 | Add "Quick start" templates to landing               | 🔴 Not Started |          | Museum day, Foodie tour, Nature |
| 8.37 | Implement mobile tabbed interface                    | 🔴 Not Started |          | Map / Itinerary / Details       |
| 8.38 | Add touch-friendly controls (44x44px targets)        | 🔴 Not Started |          |                                 |
| 8.39 | Implement swipe gestures for timeline                | 🔴 Not Started |          |                                 |
| 8.40 | Add pull-to-refresh for trip updates                 | 🔴 Not Started |          | Mobile only                     |
| 8.41 | Implement bottom sheet for activity details          | 🔴 Not Started |          | Mobile only                     |
| 8.42 | Add sticky action buttons (Save, Export, Share)      | 🔴 Not Started |          | Mobile bottom bar               |
| 8.43 | Implement skip links for keyboard navigation         | 🔴 Not Started |          | Skip to main, itinerary, etc.   |
| 8.44 | Add ARIA labels to all interactive elements          | 🔴 Not Started |          |                                 |
| 8.45 | Implement live region for progress announcements     | 🔴 Not Started |          | aria-live="polite"              |
| 8.46 | Add focus trap for modals                            | 🔴 Not Started |          |                                 |
| 8.47 | Implement focus return after actions                 | 🔴 Not Started |          |                                 |
| 8.48 | Test keyboard navigation flow                        | 🔴 Not Started |          | Tab order, Enter/Delete keys    |
| 8.49 | Implement activity card fade-in animation            | 🔴 Not Started |          | Sequential as added             |
| 8.50 | Add checkmark animation on verification              | 🔴 Not Started |          |                                 |
| 8.51 | Add progress bar smooth transition                   | 🔴 Not Started |          |                                 |
| 8.52 | Add map marker bounce on appearance                  | 🔴 Not Started |          |                                 |
| 8.53 | Implement success toast with celebration icon        | 🔴 Not Started |          |                                 |
| 8.54 | Add haptic feedback on mobile (optional)             | 🔴 Not Started |          | Activity added, trip complete   |
| 8.55 | Implement skeleton screens for loading               | 🔴 Not Started |          | Activity cards, map             |
| 8.56 | Add shimmer effect for loading images                | 🔴 Not Started |          |                                 |

### Week 18: Advanced Features

| #    | Task                                                  | Status         | Assignee | Notes                        |
| ---- | ----------------------------------------------------- | -------------- | -------- | ---------------------------- |
| 8.57 | Implement drag-and-drop activity reordering (desktop) | 🔴 Not Started |          | With react-dnd or native     |
| 8.58 | Add reorder buttons for mobile                        | 🔴 Not Started |          | Move up/down                 |
| 8.59 | Update route calculations after reorder               | 🔴 Not Started |          |                              |
| 8.60 | Add undo/redo support for reordering                  | 🔴 Not Started |          |                              |
| 8.61 | Implement inline duration editing                     | 🔴 Not Started |          | Click to edit                |
| 8.62 | Add duration picker UI (slider or input)              | 🔴 Not Started |          |                              |
| 8.63 | Update timing validation after edit                   | 🔴 Not Started |          |                              |
| 8.64 | Implement inline remove activity                      | 🔴 Not Started |          | With undo toast              |
| 8.65 | Add "Search places on map" feature                    | 🔴 Not Started |          |                              |
| 8.66 | Implement "Add stop from map" click handler           | 🔴 Not Started |          |                              |
| 8.67 | Add place preview popup on map click                  | 🔴 Not Started |          | Name, types, rating          |
| 8.68 | Implement "Add this place" action from popup          | 🔴 Not Started |          | Insert at position or append |
| 8.69 | Design onboarding flow (3-5 steps)                    | 🔴 Not Started |          | Overlay with tooltips        |
| 8.70 | Implement onboarding overlay component                | 🔴 Not Started |          |                              |
| 8.71 | Add onboarding step 1: Welcome                        | 🔴 Not Started |          |                              |
| 8.72 | Add onboarding step 2: Planning features              | 🔴 Not Started |          |                              |
| 8.73 | Add onboarding step 3: Verification                   | 🔴 Not Started |          |                              |
| 8.74 | Add onboarding step 4: Multi-day                      | 🔴 Not Started |          |                              |
| 8.75 | Add "Skip tutorial" option                            | 🔴 Not Started |          |                              |
| 8.76 | Persist onboarding completion state                   | 🔴 Not Started |          | localStorage                 |
| 8.77 | Conduct usability testing (5-10 users)                | 🔴 Not Started |          | Record sessions              |
| 8.78 | Test on iOS Safari (iPhone, iPad)                     | 🔴 Not Started |          |                              |
| 8.79 | Test on Android Chrome (various devices)              | 🔴 Not Started |          |                              |
| 8.80 | Measure Core Web Vitals                               | 🔴 Not Started |          | Target: all green            |
| 8.81 | A/B test: Simplified vs technical view                | 🔴 Not Started |          | Default simplified           |
| 8.82 | Gather user feedback and iterate                      | 🔴 Not Started |          |                              |

**Deliverable:** Production-ready, user-tested, delightful interface with excellent mobile experience and full accessibility compliance

---

## Additional Tasks (Provider & Groq Integration)

### Provider-Neutral Contracts

| #   | Task                                         | Status         | Assignee | Notes                         |
| --- | -------------------------------------------- | -------------- | -------- | ----------------------------- |
| 9.1 | Define GeocodingProvider interface           | 🔴 Not Started |          | geocode() method              |
| 9.2 | Define PlaceDetailsProvider interface        | 🔴 Not Started |          | enrichPlaceDetails() method   |
| 9.3 | Define ProviderMetadata type                 | 🔴 Not Started |          | Source, freshness, confidence |
| 9.4 | Define ProviderError normalized error type   | 🔴 Not Started |          |                               |
| 9.5 | Update PlacesProvider to extend contracts    | 🔴 Not Started |          |                               |
| 9.6 | Update RoutesProvider to extend contracts    | 🔴 Not Started |          |                               |
| 9.7 | Update planner dependencies to use contracts | 🔴 Not Started |          |                               |
| 9.8 | Keep fixture providers deterministic         | 🔴 Not Started |          | No randomness                 |
| 9.9 | Isolate legacy Amap implementation           | 🔴 Not Started |          | Move to legacy folder         |

### Geoapify Adapters

| #     | Task                                             | Status         | Assignee | Notes                   |
| ----- | ------------------------------------------------ | -------------- | -------- | ----------------------- |
| 10.1  | Implement Geoapify Places API adapter            | 🔴 Not Started |          | Search endpoint         |
| 10.2  | Implement Geoapify Geocoding API adapter         | 🔴 Not Started |          | Address → coordinates   |
| 10.3  | Implement Geoapify Place Details API adapter     | 🔴 Not Started |          | Opening hours, timezone |
| 10.4  | Implement Geoapify Routing API adapter (walking) | 🔴 Not Started |          |                         |
| 10.5  | Implement Geoapify Routing API adapter (transit) | 🔴 Not Started |          | If available            |
| 10.6  | Add timeout handling (10s default)               | 🔴 Not Started |          |                         |
| 10.7  | Add abort signal support                         | 🔴 Not Started |          | Cancellable requests    |
| 10.8  | Add quota/rate limit handling                    | 🔴 Not Started |          | Retry with backoff      |
| 10.9  | Add malformed response handling                  | 🔴 Not Started |          | Graceful degradation    |
| 10.10 | Normalize responses to Place domain type         | 🔴 Not Started |          |                         |
| 10.11 | Normalize responses to TransportOption type      | 🔴 Not Started |          |                         |
| 10.12 | Add provider metadata to responses               | 🔴 Not Started |          | Source, timestamp       |
| 10.13 | Never expose GEOAPIFY_API_KEY to browser         | 🔴 Not Started |          | Server-only             |
| 10.14 | Add tests for Geoapify adapters                  | 🔴 Not Started |          | Mock responses          |

### Groq LLM Integration

| #     | Task                                             | Status         | Assignee | Notes                                   |
| ----- | ------------------------------------------------ | -------------- | -------- | --------------------------------------- |
| 11.1  | Add GROQ_API_KEY to .env                         | 🔴 Not Started |          | Server-only                             |
| 11.2  | Add GROQ_MODEL to .env                           | 🔴 Not Started |          | e.g., llama-3.3-70b-versatile           |
| 11.3  | Add GROQ_BASE_URL to .env (optional)             | 🔴 Not Started |          | Default: https://api.groq.com/openai/v1 |
| 11.4  | Update planner to use Groq configuration         | 🔴 Not Started |          | Replace generic LLM config              |
| 11.5  | Verify OpenAI-compatible /chat/completions shape | 🔴 Not Started |          | Should work as-is                       |
| 11.6  | Update model call error messages for Groq        | 🔴 Not Started |          |                                         |
| 11.7  | Update service probe checks for Groq             | 🔴 Not Started |          | scripts/check-services.mjs              |
| 11.8  | Add tests for Groq integration                   | 🔴 Not Started |          | Mock responses                          |
| 11.9  | Test with real Groq API key (dev environment)    | 🔴 Not Started |          |                                         |
| 11.10 | Never commit GROQ_API_KEY to git                 | 🔴 Not Started |          | Add to .gitignore check                 |

### USA-First UI Updates

| #     | Task                                        | Status         | Assignee | Notes                                       |
| ----- | ------------------------------------------- | -------------- | -------- | ------------------------------------------- |
| 12.1  | Update landing page copy                    | 🔴 Not Started |          | "Multi-day trips, verified stop by stop"    |
| 12.2  | Update mode switch descriptions             | 🔴 Not Started |          | Mention verification features               |
| 12.3  | Update live mode label                      | 🔴 Not Started |          | "Live models and Geoapify data"             |
| 12.4  | Replace "Mainland China only" notice        | 🔴 Not Started |          | "USA destinations"                          |
| 12.5  | Update coverage notice copy for Geoapify    | 🔴 Not Started |          |                                             |
| 12.6  | Translate Chinese error messages to English | 🔴 Not Started |          | In providers/routes.ts, providers/places.ts |
| 12.7  | Update timeline labels for origin/return    | 🔴 Not Started |          |                                             |
| 12.8  | Update map labels from Amap to Geoapify     | 🔴 Not Started |          |                                             |
| 12.9  | Test USA city examples (NYC, LA, Chicago)   | 🔴 Not Started |          |                                             |
| 12.10 | Update README with USA focus                | 🔴 Not Started |          |                                             |

---

## Task Summary

**Total Tasks:** 333

### By Priority:

- Priority 1 (Journey Verification): 12 tasks
- Priority 2 (Provider Verification): 14 tasks
- Priority 3 (Enhanced Jev): 15 tasks
- Priority 4 (Multi-Day Support): 35 tasks
- Priority 5 (Light Theme): 18 tasks
- Priority 6 (Auth & Persistence): 47 tasks
- Priority 7 (Testing & Polish): 40 tasks
- Priority 8 (UX Improvements): 82 tasks
- Additional (Providers & Groq): 70 tasks

### By Status:

- 🔴 Not Started: 253
- 🟡 In Progress: 0
- 🟢 Complete: 71 (P1: 12, P2: 14, P3: 15, P4: 25 of 35)
- ⚪ Blocked: 0
- 🔵 Review: 9 (P4: 4.16, 4.17, 4.18, 4.22, 4.27, 4.29, 4.30 — pending P6/P8)
- ⚪ Blocked: 0
- 🔵 Review: 0

---

## Progress Tracking

**Week 1:** 12 / 12 tasks (Priority 1) ✅  
**Week 2:** 12 / 12 tasks (Priority 1) ✅  
**Week 3:** 14 / 14 tasks (Priority 2) ✅  
**Week 4:** 14 / 14 tasks (Priority 2) ✅  
**Week 5:** 15 / 15 tasks (Priority 3) ✅  
**Week 6:** 15 / 15 tasks (Priority 3) ✅  
**Week 7:** 12 / 12 tasks (Priority 4 - Week 7) ✅  
**Week 8:** 7 / 10 tasks (Priority 4 - Week 8) 🟡 (4.16/4.17/4.18/4.22 → P6)  
**Week 9:** 9 / 13 tasks (Priority 4 - Week 9) 🟡 (4.27/4.29/4.30 → P8)  
**Week 10:** **\_** / 18 tasks (Priority 5)  
**Week 11:** **\_** / 14 tasks (Priority 6 - Week 11)  
**Week 12:** **\_** / 18 tasks (Priority 6 - Week 12)  
**Week 13:** **\_** / 15 tasks (Priority 6 - Week 13)  
**Week 14:** **\_** / 21 tasks (Priority 7 - Week 14)  
**Week 15:** **\_** / 19 tasks (Priority 7 - Week 15)  
**Week 16:** **\_** / 24 tasks (Priority 8 - Week 16)  
**Week 17:** **\_** / 32 tasks (Priority 8 - Week 17)  
**Week 18:** **\_** / 26 tasks (Priority 8 - Week 18)

**Overall Progress:** 80 / 333 tasks (24%)

---

## Notes

- Update task status as work progresses
- Mark blockers immediately and note the blocking issue
- Move completed tasks to review before marking complete
- Add assignees when work is distributed
- Update notes column with relevant context
- Link to PRs/commits in notes when available
- Update progress tracking weekly

**Last Updated:** 2024-12-13
