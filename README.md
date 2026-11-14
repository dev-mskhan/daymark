# Daymark

**Two Minds, One Trip.**

Daymark is an explainable day-trip planner. The LLM plans ahead; Jev chooses and checks. Deterministic code handles route facts, time calculations, validation, and versioning.

![Daymark product overview](docs/jev-trip-overview.png)

## How it works

```text
Places + routes ──→ LLM Planner ──→ Draft itinerary
                         ↕                  │
                    Jev decisions           │
                         ↑                  ↓
                    Controller ←── review, validate, repair
```

- **LLM Planner** chooses the next activity and repairs flagged plans.
- **Jev** screens candidates, compares transport options, answers typed planning questions, and reviews the itinerary.
- **Controller** owns facts and rules: timing, routes, IDs, versions, validation, and retry limits.

The interface uses English for product controls and system states. User preferences and planning explanations follow the user's language; place names and transit lines remain in their original language.

## Try it

```sh
npm install
cp .env.example .env.local
npm run dev -- --hostname 127.0.0.1 --port 3100
```

Open [http://127.0.0.1:3100](http://127.0.0.1:3100).

- **Replay demo** is a local scripted run with no credentials or network calls. Start it, then replay or scrub through every planning and repair event.
- **Live models + maps** uses Geoapify places/routes, Groq, and Jev.

Live mode requires:

```env
GEOAPIFY_API_KEY=
JEV_API_KEY=
JEV_BASE_URL=https://jevstation.com/api   # omit for TypeSafe direct (https://api.typesafe.ai)
GROQ_API_KEY=
GROQ_MODEL=
```

Optional configuration is documented in [.env.example](.env.example). To check that the configured services respond (keys are never printed):

```sh
node scripts/check-services.mjs
```

The Jev probe uses the same `JEV_BASE_URL` resolution as the app. JevStation gives new accounts 50 free credits (valid 30 days); TypeSafe's own API is pay-as-you-go with no published free tier.

### Accounts and saved trips (optional)

Saved trips need a Supabase project. Without these variables the demo and live planning still work; account pages and trip APIs report that accounts are not configured.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
DATABASE_URL=   # Supabase transaction-mode pooler
DIRECT_URL=     # direct connection, used for migrations
```

Apply the schema (tables, indexes and row-level-security policies) with `npm run db:migrate`. After changing `lib/db/schema.ts`, run `npm run db:generate` and commit the new SQL in `drizzle/`. For Google sign-in, enable the Google provider in the Supabase dashboard and add `<your-site>/auth/callback` as an allowed redirect URL.

Row-level security protects direct Supabase access. The server connects with a role that bypasses it, so every trip query is also filtered by the signed-in user's id. Both layers are covered by tests that run the real migration on an in-process Postgres (`npm test`).

## Verify

```sh
npm test
npm run typecheck
npm run build
```

## Current scope

The current app plans a single day in USA cities using Geoapify places, routing and static maps. It supports origin geocoding, first/return route legs, streamed planning events, bounded repair, replay/export, and place verification checks for provider-sourced opening hours, timezone, operational status, and accessibility details. A multi-day planner and saved-trip APIs exist; the `/trips` page lets signed-in users create multi-day trips, plan them, save itineraries, export, duplicate, archive and delete. The main page still plans a single anonymous day. The UI supports light and dark themes with a saved preference.

Bookings are not available. Verification depends on provider data and live Jev availability; missing or failed checks remain unverified. Visit durations are estimates, and every result should be treated as a draft rather than a guaranteed executable itinerary.

## References

- [Jev Choice](https://docs.typesafe.ai/primitives/choice)
- [Jev model limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13)
