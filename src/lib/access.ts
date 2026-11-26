/**
 * Who may run a search through /api/ask. The endpoint serves the Jev Search web page; scripts and
 * agents that call it directly are pointed at Search1API's Ask API, which runs the same pipeline.
 */

export const ASK_API_URL = 'https://s1.dev/ask-api?utm_source=jev-search&utm_medium=limit';

export type AccessDenial = 'rate_limited' | 'daily_limit' | 'verification_required' | 'verification_failed';

const MESSAGES: Record<AccessDenial, string> = {
  rate_limited: 'Too many searches from this address. Try again in a minute.',
  daily_limit: 'This address has reached today’s search limit on Jev Search. Try again tomorrow.',
  verification_required: 'This search could not be verified as coming from the Jev Search page. Reload the page and try again.',
  verification_failed: 'This search could not be verified as coming from the Jev Search page. Reload the page and try again.',
};

export interface AccessDenialBody {
  error: string;
  code: AccessDenial;
  /** Where to go for more searches or programmatic access. */
  askApi: { url: string; endpoint: string; note: string };
}

export function denialBody(code: AccessDenial): AccessDenialBody {
  return {
    error: MESSAGES[code],
    code,
    askApi: {
      url: ASK_API_URL,
      endpoint: 'POST https://api.search1api.com/ask',
      note: 'For more searches, or to call this pipeline from your own code or agent, use the Search1API Ask API.',
    },
  };
}

export function denialStatus(code: AccessDenial): number {
  return code === 'rate_limited' || code === 'daily_limit' ? 429 : 403;
}

/** Searches one address may run per UTC day through the web page. */
export const DAILY_SEARCH_LIMIT = 50;

export const TURNSTILE_HEADER = 'X-Turnstile-Token';
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Checks a Turnstile token with Cloudflare. Fails closed: a missing token, a rejected token or an
 * unreachable siteverify all deny the search.
 */
export async function verifyTurnstile(
  secret: string,
  token: string | null,
  remoteIp: string | null,
  fetcher: typeof fetch = fetch
): Promise<'ok' | 'verification_required' | 'verification_failed'> {
  if (!token) return 'verification_required';
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (remoteIp) form.append('remoteip', remoteIp);
  try {
    const response = await fetcher(SITEVERIFY_URL, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return 'verification_failed';
    const result = (await response.json()) as { success?: boolean };
    return result.success === true ? 'ok' : 'verification_failed';
  } catch {
    return 'verification_failed';
  }
}

interface CounterStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/**
 * Counts one search against the address's daily allowance and says whether it is still within it.
 * KV is eventually consistent, so the count can trail by a few searches across locations; that is
 * enough to stop bulk use without a Durable Object.
 */
export async function withinDailyLimit(
  store: CounterStore,
  address: string,
  now: Date = new Date(),
  limit: number = DAILY_SEARCH_LIMIT
): Promise<boolean> {
  const key = `access:day:${now.toISOString().slice(0, 10)}:${address}`;
  let count = 0;
  try {
    count = Number.parseInt((await store.get(key)) ?? '0', 10) || 0;
  } catch {
    return true;
  }
  if (count >= limit) return false;
  try {
    await store.put(key, String(count + 1), { expirationTtl: 2 * 24 * 60 * 60 });
  } catch {
    // A failed write only loses one count; never block a search on it.
  }
  return true;
}
