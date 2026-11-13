import { afterEach, describe, expect, it, vi } from 'vitest';
import { JevProvider } from '@/lib/providers/jev';
import { POST } from './route';

afterEach(() => vi.restoreAllMocks());
const answer = (choice: 'pass' | 'flag' | 'unknown', confidence: number) => ({ choice, confidence, probabilities: { pass: 0, flag: 0, unknown: 0 } });

describe('request scope screening', () => {
  it('combines multiple flags into one concise correction', async () => {
    vi.spyOn(JevProvider.prototype, 'screenRequest').mockResolvedValue({ model: 'test', answers: {
      multi_day: answer('flag', .95), multi_city: answer('pass', .9), booking_or_transaction: answer('flag', .9),
    } });
    const response = await POST(new Request('http://localhost/api/screen', { method: 'POST', body: JSON.stringify({ destination: 'Shanghai', preference: 'Plan three days and book dinner.' }) }));
    expect(await response.json()).toMatchObject({ allowed: false, blocked: ['multi_day', 'booking_or_transaction'], message: 'We currently support one-day trips only. We cannot make bookings or purchases.' });
  });
  it('does not block unknown or low-confidence flags', async () => {
    vi.spyOn(JevProvider.prototype, 'screenRequest').mockResolvedValue({ model: 'test', answers: {
      multi_day: answer('flag', .6), multi_city: answer('unknown', .9), booking_or_transaction: answer('pass', .9),
    } });
    const response = await POST(new Request('http://localhost/api/screen', { method: 'POST', body: JSON.stringify({ destination: 'Shanghai', preference: 'Surprise me.' }) }));
    expect(await response.json()).toMatchObject({ allowed: true, blocked: [], message: '' });
  });
});
