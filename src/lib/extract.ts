/**
 * Queries for keyword engines, extracted by Clairic (Workers AI
 * `@cf/cloudflare/clairic`). Clairic copies a span of the request for each
 * field in one pass and never adds words. It runs alongside the intent
 * judgment, so it adds no serial step.
 *
 * Same fields as Search1API's Ask API (search1api-monorepo
 * apps/ask/src/extract.ts). Only the engines where it beat the Jev span
 * choice on real searches use it: GitHub, Hacker News and Reddit (Ask's
 * eval/query-clairic-results.md; GitHub 4.9 vs 3.3 on-topic results in the
 * top 8 in both runs). X did not repeat its gain; web engines, Wikipedia,
 * YouTube and IMDb did as well or better with Jev spans.
 * Docs: https://developers.cloudflare.com/workers-ai/models/clairic/
 */

import type { JevBinding } from './typesafe';
import type { SourceId } from './sources';

export const CLAIRIC_MODEL = '@cf/cloudflare/clairic';
/** Fallback to Jev spans for these engines when Clairic has not answered by then. */
export const EXTRACT_TIMEOUT_MS = 1500;

const APPLIED =
  ' Leave out website or platform names and time words: the engine and the time range are applied separately. Never include conversational openers.';

const FIELDS = {
  hackernews: 'The query for Hacker News threads: the technical subject and what is being discussed.',
  reddit:
    'The query for Reddit discussion posts, for the Reddit-specific part of the request. When the request has clauses for several platforms, take the Reddit subject and its comparison, problem or experience, not the GitHub implementation clause. Keep both sides of a requested comparison.',
  github:
    'The query for GitHub repositories or code, for the GitHub-specific part of the request. When the request has clauses for several platforms, take only the GitHub subject and its technical task, not the Reddit experience or comparison clause. Keep the complete software name and task-specific technologies.',
} as const satisfies Partial<Record<SourceId, string>>;

export type ExtractedSource = keyof typeof FIELDS;

export const EXTRACTED_SOURCES = Object.keys(FIELDS) as ExtractedSource[];

export function isExtracted(source: SourceId): source is ExtractedSource {
  return source in FIELDS;
}

export interface Extracted {
  queries: Partial<Record<ExtractedSource, string>>;
  tokens: number;
}

interface ClairicBody {
  answers?: Record<string, { value?: unknown }>;
  usage?: { input_tokens?: number };
  /** The REST API wraps the same body in `result`. */
  result?: ClairicBody;
}

const NONE: Extracted = { queries: {}, tokens: 0 };

/**
 * One Clairic call for every keyword engine, whether or not the intent
 * judgment picks it: the call starts before routing is known. Fails soft:
 * a missing binding, timeout, binding error or unusable answer returns no
 * queries and the caller falls back to Jev spans; aborts propagate.
 */
export async function extractQueries(
  ai: JevBinding | undefined,
  request: string,
  signal?: AbortSignal,
  timeoutMs: number = EXTRACT_TIMEOUT_MS
): Promise<Extracted> {
  if (!ai) return NONE;
  const timeout = AbortSignal.timeout(timeoutMs);
  const callSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const fields = Object.fromEntries(
    Object.entries(FIELDS).map(([id, note]) => [id, { type: 'text', instructions: note + APPLIED }])
  );
  let body: ClairicBody;
  try {
    // The binding may not honour the signal; stop waiting either way.
    body = (await raceAbort(ai.run(CLAIRIC_MODEL, { state: request, fields }, { signal: callSignal }), callSignal)) as ClairicBody;
  } catch (error) {
    if (signal?.aborted) throw error;
    console.warn(
      `[jev] query extraction failed: ${timeout.aborted ? 'timed out' : error instanceof Error ? error.message : String(error)}`
    );
    return NONE;
  }
  const payload = body?.answers ? body : body?.result;
  const queries: Extracted['queries'] = {};
  for (const id of EXTRACTED_SOURCES) {
    const value = payload?.answers?.[id]?.value;
    if (typeof value === 'string' && value.trim()) queries[id] = value.trim();
  }
  return { queries, tokens: payload?.usage?.input_tokens ?? 0 };
}

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
