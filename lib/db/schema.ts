/**
 * Application tables (Drizzle). Supabase Auth owns users and sessions in `auth.users`;
 * every user-owned row references it. RLS is enabled on every table, and the policies
 * below are emitted into the SQL migration by drizzle-kit.
 *
 * Server code connects with a role that bypasses RLS, so repository functions
 * must also filter by the authenticated owner (see lib/trips/repository.ts).
 */
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { authenticatedRole, authUid, authUsers } from 'drizzle-orm/supabase';

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const TRIP_STATUSES = ['draft', 'planned', 'accepted', 'archived'] as const;
export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;

// Task 6.7
export const userProfile = pgTable(
  'user_profile',
  {
    id: uuid('id').primaryKey().references(() => authUsers.id, { onDelete: 'cascade' }),
    displayName: text('display_name'),
    themePreference: text('theme_preference', { enum: THEME_PREFERENCES }).notNull().default('system'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  table => [
    check('user_profile_theme_check', sql`${table.themePreference} in ('light', 'dark', 'system')`),
    pgPolicy('user_profile_own_record', {
      for: 'all',
      to: authenticatedRole,
      using: sql`${table.id} = ${authUid}`,
      withCheck: sql`${table.id} = ${authUid}`,
    }),
  ],
).enableRLS();

// Task 6.8
export const trip = pgTable(
  'trip',
  {
    id: id(),
    ownerId: uuid('owner_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    status: text('status', { enum: TRIP_STATUSES }).notNull().default('draft'),
    mode: text('mode', { enum: ['fixture', 'live'] }).notNull().default('fixture'),
    destination: text('destination').notNull(),
    origin: text('origin'),
    partySize: integer('party_size').notNull().default(1),
    preference: text('preference').notNull(),
    constraints: text('constraints').notNull().default(''),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  table => [
    index('trip_owner_idx').on(table.ownerId, table.updatedAt),
    check('trip_status_check', sql`${table.status} in ('draft', 'planned', 'accepted', 'archived')`),
    check('trip_party_size_check', sql`${table.partySize} between 1 and 20`),
    pgPolicy('trip_owner_all', {
      for: 'all',
      to: authenticatedRole,
      using: sql`${table.ownerId} = ${authUid}`,
      withCheck: sql`${table.ownerId} = ${authUid}`,
    }),
  ],
).enableRLS();

const ownsTrip = (tripId: unknown) =>
  sql`exists (select 1 from ${trip} where ${trip.id} = ${tripId} and ${trip.ownerId} = ${authUid})`;

// Tasks 6.9, 4.13
export const dayBoundary = pgTable(
  'day_boundary',
  {
    id: id(),
    tripId: uuid('trip_id').notNull().references(() => trip.id, { onDelete: 'cascade' }),
    dayNumber: integer('day_number').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    overnightPlaceId: text('overnight_place_id'),
    overnightPlaceData: jsonb('overnight_place_data'),
    createdAt: createdAt(),
  },
  table => [
    unique('day_boundary_trip_day_unique').on(table.tripId, table.dayNumber),
    check('day_boundary_day_check', sql`${table.dayNumber} between 1 and 7`),
    pgPolicy('day_boundary_via_trip', {
      for: 'all',
      to: authenticatedRole,
      using: ownsTrip(sql`${table.tripId}`),
      withCheck: ownsTrip(sql`${table.tripId}`),
    }),
  ],
).enableRLS();

// Task 6.11 — immutable: owners may read and insert, never update or delete.
export const planningRun = pgTable(
  'planning_run',
  {
    id: id(),
    tripId: uuid('trip_id').notNull().references(() => trip.id, { onDelete: 'cascade' }),
    mode: text('mode', { enum: ['fixture', 'live'] }).notNull(),
    status: text('status', { enum: ['complete', 'needs_attention', 'failed'] }).notNull(),
    eventsJson: jsonb('events_json').notNull(),
    resultJson: jsonb('result_json'),
    errorMessage: text('error_message'),
    createdAt: createdAt(),
  },
  table => [
    index('planning_run_trip_idx').on(table.tripId, table.createdAt),
    pgPolicy('planning_run_owner_read', {
      for: 'select',
      to: authenticatedRole,
      using: ownsTrip(sql`${table.tripId}`),
    }),
    pgPolicy('planning_run_owner_insert', {
      for: 'insert',
      to: authenticatedRole,
      withCheck: ownsTrip(sql`${table.tripId}`),
    }),
  ],
).enableRLS();

// Task 6.12
export const tripRevision = pgTable(
  'trip_revision',
  {
    id: id(),
    tripId: uuid('trip_id').notNull().references(() => trip.id, { onDelete: 'cascade' }),
    planningRunId: uuid('planning_run_id').references(() => planningRun.id, { onDelete: 'set null' }),
    revisionNumber: integer('revision_number').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  table => [
    unique('trip_revision_trip_number_unique').on(table.tripId, table.revisionNumber),
    pgPolicy('trip_revision_via_trip', {
      for: 'all',
      to: authenticatedRole,
      using: ownsTrip(sql`${table.tripId}`),
      withCheck: sql`${ownsTrip(sql`${table.tripId}`)} and (${table.planningRunId} is null or exists (select 1 from ${planningRun} where ${planningRun.id} = ${table.planningRunId} and ${planningRun.tripId} = ${table.tripId}))`,
    }),
  ],
).enableRLS();

// Tasks 6.10, 4.14
export const daySegment = pgTable(
  'day_segment',
  {
    id: id(),
    tripRevisionId: uuid('trip_revision_id').notNull().references(() => tripRevision.id, { onDelete: 'cascade' }),
    dayNumber: integer('day_number').notNull(),
    activities: jsonb('activities').notNull(),
    routes: jsonb('routes').notNull(),
    transportLegs: jsonb('transport_legs'),
    startingFrom: text('starting_from').notNull(),
    endingAt: text('ending_at'),
    snapshotJson: jsonb('snapshot_json').notNull(),
    eventsJson: jsonb('events_json'),
    createdAt: createdAt(),
  },
  table => [
    unique('day_segment_revision_day_unique').on(table.tripRevisionId, table.dayNumber),
    check('day_segment_day_check', sql`${table.dayNumber} between 1 and 7`),
    pgPolicy('day_segment_via_revision', {
      for: 'all',
      to: authenticatedRole,
      using: sql`exists (select 1 from ${tripRevision} where ${tripRevision.id} = ${table.tripRevisionId} and ${ownsTrip(sql`${tripRevision.tripId}`)})`,
      withCheck: sql`exists (select 1 from ${tripRevision} where ${tripRevision.id} = ${table.tripRevisionId} and ${ownsTrip(sql`${tripRevision.tripId}`)})`,
    }),
  ],
).enableRLS();

export type Trip = typeof trip.$inferSelect;
export type NewTrip = typeof trip.$inferInsert;
export type DayBoundaryRecord = typeof dayBoundary.$inferSelect;
export type PlanningRunRecord = typeof planningRun.$inferSelect;
export type TripRevisionRecord = typeof tripRevision.$inferSelect;
export type DaySegmentRecord = typeof daySegment.$inferSelect;
export type UserProfile = typeof userProfile.$inferSelect;
