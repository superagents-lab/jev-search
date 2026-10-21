export interface Search1ApiConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface SearchParams {
  query: string;
  /** Search1API `search_service`; defaults to google. */
  service?: string;
  timeRange?: 'day' | 'week' | 'month';
  maxResults?: number;
}

export interface RawResult {
  title: string;
  link: string;
  snippet: string;
  /** Normalized ISO publication date from Search1API; absent when unknown. */
  published_date?: string | null;
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', hellip: '…',
  mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
};

/** Snippets come back with HTML entities left in; decode the common ones. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match)
    .replace(/\s{2,}/g, ' ');
}

export class Search1ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'Search1ApiError';
    this.status = status;
  }
}

/**
 * One POST /search, or /news for Hacker News. The engine is picked with
 * `service`; recency is `time_range` in both cases.
 */
/** Allow filtered searches to finish while other lanes stream independently. */
export const LANE_TIMEOUT_MS = 15_000;

export async function search(
  config: Search1ApiConfig,
  params: SearchParams,
  signal?: AbortSignal
): Promise<RawResult[]> {
  const base = (config.baseUrl ?? 'https://api.search1api.com').replace(/\/$/, '');
  const timeout = AbortSignal.timeout(LANE_TIMEOUT_MS);
  const laneSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await fetch(`${base}/${params.service === 'hackernews' ? 'news' : 'search'}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: params.query,
      search_service: params.service ?? 'google',
      ...(params.timeRange ? { time_range: params.timeRange } : {}),
      max_results: params.maxResults ?? 8,
    }),
    signal: laneSignal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Search1ApiError(response.status, text.slice(0, 300) || response.statusText);
  }
  const body = (await response.json()) as { results?: unknown };
  const results = Array.isArray(body.results) ? body.results : [];
  return results
    .filter(
      (r): r is RawResult =>
        typeof r === 'object' &&
        r !== null &&
        typeof (r as RawResult).link === 'string' &&
        typeof (r as RawResult).title === 'string'
    )
    .map((r) => ({
      title: decodeEntities(r.title),
      link: r.link,
      snippet: decodeEntities(r.snippet ?? ''),
      ...(typeof r.published_date === 'string' ? { published_date: r.published_date } : {}),
    }));
}
