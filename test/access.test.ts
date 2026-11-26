import { describe, expect, it } from 'vitest';
import {
  ASK_API_URL,
  DAILY_SEARCH_LIMIT,
  denialBody,
  denialStatus,
  verifyTurnstile,
  withinDailyLimit,
} from '@/lib/access';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    get: async (key: string) => data.get(key) ?? null,
    put: async (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe('access denials', () => {
  it('points every refusal at the Ask API', () => {
    for (const code of ['rate_limited', 'daily_limit', 'verification_required', 'verification_failed'] as const) {
      const body = denialBody(code);
      expect(body.code).toBe(code);
      expect(body.error.length).toBeGreaterThan(0);
      expect(body.askApi.url).toBe(ASK_API_URL);
      expect(body.askApi.endpoint).toBe('POST https://api.search1api.com/ask');
    }
  });

  it('uses 429 for limits and 403 for failed verification', () => {
    expect(denialStatus('rate_limited')).toBe(429);
    expect(denialStatus('daily_limit')).toBe(429);
    expect(denialStatus('verification_required')).toBe(403);
    expect(denialStatus('verification_failed')).toBe(403);
  });
});

describe('verifyTurnstile', () => {
  const ok = (success: boolean) => (async () => Response.json({ success })) as unknown as typeof fetch;

  it('requires a token', async () => {
    expect(await verifyTurnstile('secret', null, '1.2.3.4', ok(true))).toBe('verification_required');
  });

  it('accepts a token Cloudflare confirms and sends the visitor address', async () => {
    let sent: FormData | undefined;
    const fetcher = (async (_url: string, init: RequestInit) => {
      sent = init.body as FormData;
      return Response.json({ success: true });
    }) as unknown as typeof fetch;
    expect(await verifyTurnstile('secret', 'token', '1.2.3.4', fetcher)).toBe('ok');
    expect(sent?.get('response')).toBe('token');
    expect(sent?.get('remoteip')).toBe('1.2.3.4');
  });

  it('fails closed on a rejected token, an HTTP error or a network error', async () => {
    expect(await verifyTurnstile('secret', 'token', null, ok(false))).toBe('verification_failed');
    const http500 = (async () => new Response('no', { status: 500 })) as unknown as typeof fetch;
    expect(await verifyTurnstile('secret', 'token', null, http500)).toBe('verification_failed');
    const broken = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await verifyTurnstile('secret', 'token', null, broken)).toBe('verification_failed');
  });
});

describe('withinDailyLimit', () => {
  const day = new Date('2026-11-26T12:00:00Z');

  it('allows the daily allowance and refuses the next search', async () => {
    const store = memoryStore();
    for (let i = 0; i < DAILY_SEARCH_LIMIT; i++) {
      expect(await withinDailyLimit(store, '1.2.3.4', day)).toBe(true);
    }
    expect(await withinDailyLimit(store, '1.2.3.4', day)).toBe(false);
    expect(await withinDailyLimit(store, '5.6.7.8', day)).toBe(true);
  });

  it('starts a new count on the next UTC day', async () => {
    const store = memoryStore();
    for (let i = 0; i < 3; i++) await withinDailyLimit(store, '1.2.3.4', day, 3);
    expect(await withinDailyLimit(store, '1.2.3.4', day, 3)).toBe(false);
    expect(await withinDailyLimit(store, '1.2.3.4', new Date('2026-11-27T00:00:01Z'), 3)).toBe(true);
  });

  it('never blocks a search when the store fails', async () => {
    const store = { get: async () => { throw new Error('kv down'); }, put: async () => {} };
    expect(await withinDailyLimit(store, '1.2.3.4', day)).toBe(true);
  });
});
