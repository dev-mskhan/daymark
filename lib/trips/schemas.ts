import { z } from 'zod';
import { THEME_PREFERENCES } from '@/lib/db/schema';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour).');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value, 'Invalid date.');

const overnightPlace = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  address: z.string().max(400).default(''),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  types: z.array(z.string().max(80)).max(20).default([]),
  source: z.enum(['photon', 'geoapify', 'demo']).default('geoapify'),
});

export const dayBoundarySchema = z.object({
  dayNumber: z.number().int().min(1).max(7),
  date: isoDate,
  startTime: time,
  endTime: time,
  overnightPlace: overnightPlace.optional(),
}).refine(day => day.endTime > day.startTime, { message: 'A day must end after it starts.', path: ['endTime'] });

const days = z.array(dayBoundarySchema).max(7).refine(
  list => new Set(list.map(day => day.dayNumber)).size === list.length,
  'Day numbers must be unique.',
);

const tripFields = {
  title: z.string().trim().min(1).max(120),
  destination: z.string().trim().min(2).max(100),
  origin: z.string().trim().min(2).max(160).nullish(),
  partySize: z.number().int().min(1).max(20),
  preference: z.string().trim().min(2).max(2000),
  constraints: z.string().trim().max(2000),
  mode: z.enum(['fixture', 'live']),
};

export const createTripSchema = z.object({
  ...tripFields,
  partySize: tripFields.partySize.default(1),
  constraints: tripFields.constraints.default(''),
  mode: tripFields.mode.default('fixture'),
  days: days.default([]),
}).strict();

export const updateTripSchema = z.object({ ...tripFields, days }).partial().strict();

export const acceptSchema = z.object({ planningRunId: z.uuid() }).strict();

export const profileSchema = z.object({
  displayName: z.string().trim().max(80).nullable().optional(),
  themePreference: z.enum(THEME_PREFERENCES).optional(),
}).strict();

export const idSchema = z.uuid();

export type CreateTripInput = z.infer<typeof createTripSchema>;
export type UpdateTripInput = z.infer<typeof updateTripSchema>;
export type DayBoundaryInput = z.infer<typeof dayBoundarySchema>;
