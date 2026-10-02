import { cachedSearch, type ResultCache } from './cache';
import { buildCandidates } from './candidates';
import { freshnessScore, isPublicationStale, resolvePublication, stripAgePrefix } from './freshness';
import { mergeItems } from './merge';
import type { RankedItem } from './rank';
import { search, type RawResult, type Search1ApiConfig, type SearchParams } from './search1api';
import {
  DEFAULT_SOURCE_IDS,
  DEFAULT_WINDOW,
  SOURCE_IDS,
  sourceById,
  windowById,
  type Lane,
  type SourceId,
  type WindowId,
} from './sources';
import { inferIntent, rerank, type Intent, type JudgeConfig, type ProviderId } from './typesafe';

export interface SearchInput {
  request: string;
  /** Explicit user choice; undefined lets the judge decide. */
  window?: WindowId;
  /** Explicit user choice; undefined lets the judge decide. */
  sources?: SourceId[];
}

export interface LaneError {
  source: SourceId;
  engine: string;
  message: string;
}

export interface IntentEvent {
  type: 'intent';
  request: string;
  /** Keyword query actually sent to the engines. */
  query: string;
  /** Name-or-title query sent to catalogue engines such as IMDb. */
  entityQuery: string;
  candidates: string[];
  window: WindowId;
  sources: SourceId[];
  inferred: {
    window: Intent['window'];
    sources: Intent['sources'];
    query: Intent['query'];
    entity: Intent['entity'];
  };
  intentMs: number;
  /** Decision provider that interpreted the request. */
  judge: ProviderId;
}

/** An engine has answered; the UI shows its count while the judge scores its rows. */
export interface FoundEvent {
  type: 'found';
  source: SourceId;
  engine: string;
  items: RankedItem[];
  searchMs: number;
}

export interface LaneEvent {
  type: 'lane';
  source: SourceId;
  engine: string;
  /** Scored results from this engine; empty when it failed. */
  items: RankedItem[];
  /** Rows the engine returned but which were provably older than the window. */
  stale: number;
  /** Engine round trip. */
  searchMs: number;
  /** Judge round trip for this lane's rows. */
  scoreMs: number;
  error?: string;
}

export interface DoneEvent {
  type: 'done';
  totalMs: number;
  tokens: number;
}

export type AskEvent = IntentEvent | FoundEvent | LaneEvent | DoneEvent;

const SOURCE_PROB_THRESHOLD = 0.6;
const RESULTS_PER_LANE = 8;
/** Engines apply time filters loosely; drop anything provably older than this multiple of the window. */
const WINDOW_TOLERANCE = 1.5;

export interface PipelineDeps {
  search1api: Search1ApiConfig;
  /** Decision providers, primary first. */
  judge: JudgeConfig;
  /** Optional KV-like store; lanes are cached by query, engine and window. */
  cache?: ResultCache;
  now?: () => Date;
}

/**
 * The whole search as a stream of events: first what the judge understood
 * (so the UI can show chips immediately), then every engine lane as soon as
 * it has answered and its rows are scored, then a summary. Lanes of one
 * source are not waited on together: the client folds them by URL.
 */
export async function* askStream(
  deps: PipelineDeps,
  input: SearchInput,
  signal?: AbortSignal
): AsyncGenerator<AskEvent> {
  const started = performance.now();
  const now = deps.now ? deps.now() : new Date();
  const request = input.request.trim();
  const candidates = buildCandidates(request);

  const runSearch = (params: SearchParams) =>
    cachedSearch(deps.cache, params, () => search(deps.search1api, params, signal));

  // 0. Speculate: Google with the words as typed, fired alongside the judge.
  //    Reused when the judge keeps those words and wants no time window,
  //    which is most factual questions; otherwise it is simply dropped.
  const speculative: SearchParams = { query: candidates[0]!, service: 'google', maxResults: RESULTS_PER_LANE };
  const speculativePromise = input.sources && !input.sources.includes('google')
    ? null
    : runSearch(speculative).catch(() => null);

  // 1. Understand the request.
  const intent = await inferIntent(deps.judge, { request, candidates, now }, signal);
  const intentMs = Math.round(performance.now() - started);

  const window = input.window ?? intent.window.choice ?? DEFAULT_WINDOW;
  let sources: SourceId[];
  if (input.sources && input.sources.length > 0) {
    // Direct callers can bypass HTTP validation; never start a lane twice.
    sources = [...new Set(input.sources)];
  } else {
    const wanted = SOURCE_IDS.filter((id) => intent.sources[id] >= SOURCE_PROB_THRESHOLD);
    sources = wanted.length > 0 ? wanted : [...DEFAULT_SOURCE_IDS];
  }
  const query = candidates[intent.query.index] ?? candidates[0]!;
  const entityQuery = candidates[intent.entity.index] ?? query;
  const win = windowById(window);
  const maxAge = win.hours * WINDOW_TOLERANCE;
  let tokens = intent.usage.input_tokens;

  yield {
    type: 'intent',
    request,
    query,
    entityQuery,
    candidates,
    window,
    sources,
    inferred: { window: intent.window, sources: intent.sources, query: intent.query, entity: intent.entity },
    intentMs,
    judge: intent.provider,
  };

  // 2. Every lane searches, filters by age, and gets scored on its own. The
  //    'found' event goes out between the two steps so the page can show the
  //    rows before they are ordered.
  const found: FoundEvent[] = [];
  let wake: (() => void) | null = null;
  const announce = (event: FoundEvent) => {
    found.push(event);
    wake?.();
  };
  const runLane = async (source: SourceId, lane: Lane): Promise<LaneEvent> => {
    const t0 = performance.now();
    const params: SearchParams = {
      query: lane.entityQuery ? entityQuery : query,
      service: lane.service,
      timeRange: lane.timeFilter === false ? undefined : win.timeRange,
      maxResults: RESULTS_PER_LANE,
      includeSites: lane.site ? [lane.site] : [],
    };
    const sameAsSpeculative =
      speculativePromise !== null &&
      params.service === speculative.service &&
      params.query === speculative.query &&
      params.timeRange === undefined &&
      params.includeSites!.length === 0;
    let raw: RawResult[];
    try {
      const got = sameAsSpeculative ? await speculativePromise : null;
      raw = got ? got.results : (await runSearch(params)).results;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        type: 'lane',
        source,
        engine: lane.service,
        items: [],
        stale: 0,
        searchMs: Math.round(performance.now() - t0),
        scoreMs: 0,
        error: message,
      };
    }
    const searchMs = Math.round(performance.now() - t0);

    const items: RankedItem[] = [];
    let stale = 0;
    raw.forEach((row, index) => {
      const publication = resolvePublication(row.published_date, row.snippet, now.getTime());
      const { ageHours } = publication;
      if (isPublicationStale(publication, maxAge)) {
        stale += 1; // maxAge is Infinity for 'any'
        return;
      }
      items.push({
        id: `${source}:${lane.service}:${index + 1}`,
        source,
        title: row.title,
        url: row.link,
        snippet: stripAgePrefix(row.snippet),
        ...publication,
        relevance: 0,
        ranked: false,
        freshness: freshnessScore(ageHours, win.hours),
        position: index + 1,
        engines: [lane.service],
      });
    });
    if (items.length > 0) {
      announce({ type: 'found', source, engine: lane.service, items: items.map((it) => ({ ...it })), searchMs });
    }

    // 3. Judge relevance of this lane's rows against the original request.
    const t1 = performance.now();
    let error: string | undefined;
    if (items.length > 0) {
      try {
        const scored = await rerank(
          deps.judge,
          request,
          items.map((it) => ({ id: it.id, source: it.source, title: it.title, snippet: it.snippet })),
          signal
        );
        tokens += scored.usage.input_tokens;
        for (const item of items) {
          item.relevance = scored.relevance[item.id] ?? 0;
          item.ranked = true;
        }
      } catch (err) {
        error = `model: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    return {
      type: 'lane',
      source,
      engine: lane.service,
      items,
      stale,
      searchMs,
      scoreMs: Math.round(performance.now() - t1),
      ...(error ? { error } : {}),
    };
  };

  const inFlight = new Map<string, Promise<{ key: string; event: LaneEvent }>>();
  for (const source of sources) {
    for (const lane of sourceById(source).lanes) {
      const key = `${source}/${lane.service}`;
      inFlight.set(key, runLane(source, lane).then((event) => ({ key, event })));
    }
  }
  while (inFlight.size > 0) {
    // Wake on whichever comes first: an engine answering, or a lane fully scored.
    const wakeup = new Promise<void>((resolve) => {
      wake = resolve;
    });
    const next = await Promise.race([Promise.race(inFlight.values()), wakeup]);
    wake = null;
    while (found.length > 0) yield found.shift()!;
    if (next) {
      const { key, event } = next;
      inFlight.delete(key);
      yield event;
    }
  }

  yield { type: 'done', totalMs: Math.round(performance.now() - started), tokens };
}

// ---------------------------------------------------------------------------
// Non-streaming convenience for tests and scripts.
// ---------------------------------------------------------------------------

export interface SearchOutput extends Omit<IntentEvent, 'type'> {
  /** Lanes folded by URL, in source order then engine rank. */
  items: RankedItem[];
  lanes: LaneEvent[];
  errors: LaneError[];
  totalMs: number;
  tokens: number;
}

export async function runSearch(
  deps: PipelineDeps,
  input: SearchInput,
  signal?: AbortSignal
): Promise<SearchOutput> {
  let intent: IntentEvent | undefined;
  let items: RankedItem[] = [];
  const lanes: LaneEvent[] = [];
  const errors: LaneError[] = [];
  let totalMs = 0;
  let tokens = 0;
  for await (const event of askStream(deps, input, signal)) {
    if (event.type === 'intent') intent = event;
    else if (event.type === 'found') continue;
    else if (event.type === 'lane') {
      lanes.push(event);
      items = mergeItems(items, event.items);
      if (event.error) errors.push({ source: event.source, engine: event.engine, message: event.error });
    } else {
      totalMs = event.totalMs;
      tokens = event.tokens;
    }
  }
  if (!intent) throw new Error('stream ended without intent');
  const { type: _type, ...rest } = intent;
  const order = new Map(intent.sources.map((s, i) => [s, i]));
  items.sort((a, b) => (order.get(a.source) ?? 0) - (order.get(b.source) ?? 0) || a.position - b.position);
  return { ...rest, items, lanes, errors, totalMs, tokens };
}
