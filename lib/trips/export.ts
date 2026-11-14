import { buildCaveatNotice } from '@/lib/planning-context';
import type { Place, Snapshot } from '@/lib/domain';
import { placesFromSegment, type TripDetail } from './repository';

export interface TripExport {
  title: string;
  destination: string;
  origin: string | null;
  status: string;
  exportedAt: string;
  revision: number | null;
  days: {
    dayNumber: number;
    date: string | null;
    startingFrom: string;
    endingAt: string | null;
    stops: { order: number; name: string; address: string; durationMinutes: number; reason: string; verification: string[] }[];
    openIssues: string[];
    notice: string;
  }[];
}

function verification(place: Place | undefined): string[] {
  if (!place) return ['Place details unavailable'];
  return [
    place.formattedOpeningHours ? 'Opening hours verified' : 'Opening hours not verified',
    place.timezone ? `Time zone ${place.timezone}` : 'Time zone not verified',
    ...(place.accessibilityInfo?.wheelchairAccessible === true ? ['Wheelchair accessible'] : place.accessibilityInfo?.wheelchairAccessible === false ? ['Not wheelchair accessible'] : []),
    ...(place.lastVerified ? [`Verified ${place.lastVerified.slice(0, 10)}`] : []),
  ];
}

/** Printable view of the latest accepted revision, including verification status for every stop (Task 6.42). */
export function buildTripExport(detail: TripDetail, now = new Date()): TripExport {
  const segments = detail.latestRevision?.segments ?? [];
  const dates = new Map(detail.days.map(day => [day.dayNumber, day.date]));
  return {
    title: detail.trip.title,
    destination: detail.trip.destination,
    origin: detail.trip.origin,
    status: detail.trip.status,
    exportedAt: now.toISOString(),
    revision: detail.latestRevision?.revisionNumber ?? null,
    days: segments.map(segment => {
      const snapshot = segment.snapshotJson as Snapshot;
      const places = placesFromSegment(segment);
      return {
        dayNumber: segment.dayNumber,
        date: dates.get(segment.dayNumber) ?? null,
        startingFrom: segment.startingFrom,
        endingAt: segment.endingAt,
        stops: (snapshot.activities ?? []).map((activity, index) => {
          const place = places.find(candidate => candidate.id === activity.placeId);
          return { order: index + 1, name: place?.name ?? activity.placeId, address: place?.address ?? '', durationMinutes: activity.durationMinutes, reason: activity.reason, verification: verification(place) };
        }),
        openIssues: (snapshot.issues ?? []).map(issue => issue.message),
        notice: buildCaveatNotice(snapshot, places),
      };
    }),
  };
}

export function renderMarkdown(data: TripExport): string {
  const lines = [`# ${data.title}`, '', `${data.destination}${data.origin ? ` · starting from ${data.origin}` : ''}`, `Status: ${data.status}${data.revision ? ` · revision ${data.revision}` : ''} · exported ${data.exportedAt.slice(0, 10)}`, ''];
  if (!data.days.length) lines.push('_No accepted itinerary yet._');
  for (const day of data.days) {
    lines.push(`## Day ${day.dayNumber}${day.date ? ` — ${day.date}` : ''}`, `Start: ${day.startingFrom}${day.endingAt ? ` · Overnight: ${day.endingAt}` : ''}`, '');
    for (const stop of day.stops) {
      lines.push(`${stop.order}. **${stop.name}** (${stop.durationMinutes} min)${stop.address ? ` — ${stop.address}` : ''}`);
      if (stop.reason) lines.push(`   ${stop.reason}`);
      lines.push(`   _${stop.verification.join(' · ')}_`);
    }
    if (day.openIssues.length) lines.push('', 'Open issues:', ...day.openIssues.map(issue => `- ${issue}`));
    lines.push('', day.notice, '');
  }
  return lines.join('\n');
}
