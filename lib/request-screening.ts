import type { RequestCheckId, RequestScreening } from './domain';

export const REQUEST_BLOCK_CONFIDENCE = .75;

export function blockedRequestChecks(screening: RequestScreening): RequestCheckId[] {
  return (Object.entries(screening.answers) as [RequestCheckId, RequestScreening['answers'][RequestCheckId]][])
    .filter(([, answer]) => answer.choice === 'flag' && answer.confidence >= REQUEST_BLOCK_CONFIDENCE)
    .map(([id]) => id);
}

export function requestScopeMessage(blocked: RequestCheckId[]): string {
  const multiDay = blocked.includes('multi_day');
  const multiCity = blocked.includes('multi_city');
  const booking = blocked.includes('booking_or_transaction');
  const limits = multiDay && multiCity
    ? 'We currently support one-day trips in one city only.'
    : multiDay
      ? 'We currently support one-day trips only.'
      : multiCity
        ? 'We currently support one city per trip only.'
        : '';
  const transaction = booking ? 'We cannot make bookings or purchases.' : '';
  return [limits, transaction].filter(Boolean).join(' ');
}
