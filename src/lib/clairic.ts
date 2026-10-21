/**
 * Search query extraction with Cloudflare's Clairic (`@cf/cloudflare/clairic`).
 *
 * Clairic answers typed fields from the request in one forward pass; a text
 * field is a span copied from the request, so it never translates or adds
 * words. One field gives the query every engine receives. Docs:
 * https://developers.cloudflare.com/workers-ai/models/clairic/
 *
 * Evaluated on 70 requests over 12 engines (2 rounds, Jev relevance on the
 * top 10): this field 8.01 relevant results per lane, the previous candidate
 * pick 7.69, the request as typed 7.51.
 */

import type { JevBinding } from './typesafe';

export const CLAIRIC_MODEL = '@cf/cloudflare/clairic';

/** Runs alongside the intent judgment; past this the request as typed is sent. */
export const CLAIRIC_TIMEOUT_MS = 1_200;

export const QUERY_INSTRUCTIONS =
  'The search query: the subject together with what the user wants to know or find about it (e.g. "Cloudflare outage", "capital of Australia", "A 股为什么大跌", "Tesla robotaxi launch"). Leave out words that only say when (today, this week, 最近), which website or app to search (Reddit, on X, 公众号上), the kind of post (tweets, threads, videos, repos), and conversational openers (what are people saying, show me, 大家怎么看).';

export interface QueryExtraction {
  /** Query sent to every engine. */
  query: string;
  /** False when Clairic was unavailable, slow or found nothing and the request is sent as typed. */
  extracted: boolean;
  tokens: number;
}

type TextAnswer = { type?: string; value?: unknown };
type ClairicResponse = {
  answers?: Record<string, TextAnswer>;
  usage?: { input_tokens?: number };
  /** The REST API wraps the same body in `result`. */
  result?: ClairicResponse;
};

/**
 * Extracts the query from `request`. Never throws for a model failure: the
 * request as typed is the fallback. Aborts from `signal` propagate.
 */
export async function extractQuery(
  ai: JevBinding | undefined,
  request: string,
  signal?: AbortSignal
): Promise<QueryExtraction> {
  const fallback: QueryExtraction = { query: request, extracted: false, tokens: 0 };
  if (!ai) return fallback;
  const timeout = AbortSignal.timeout(CLAIRIC_TIMEOUT_MS);
  const callSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let body: ClairicResponse;
  try {
    body = (await raceAbort(
      // No signal to the binding: aborting a call that already answered makes the
      // remote binding log an internal error. Racing the signal stops the wait.
      ai.run(CLAIRIC_MODEL, { state: request, fields: { query: { type: 'text', instructions: QUERY_INSTRUCTIONS } } }),
      callSignal
    )) as ClairicResponse;
  } catch (error) {
    if (signal?.aborted) throw error;
    console.warn(
      `[clairic] ${timeout.aborted ? 'timed out' : `failed: ${error instanceof Error ? error.message : String(error)}`}`
    );
    return fallback;
  }
  const payload = body?.answers ? body : body?.result;
  const value = payload?.answers?.query?.value;
  const query = typeof value === 'string' ? value.trim() : '';
  const tokens = payload?.usage?.input_tokens ?? 0;
  return query ? { query, extracted: true, tokens } : { ...fallback, tokens };
}

/** Stops waiting for `promise` once `signal` aborts. */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}
