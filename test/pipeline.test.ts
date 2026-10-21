import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSearch } from '@/lib/pipeline';
import { memoryCache } from '@/lib/cache';
import { compareItems } from '@/lib/rank';

type Call = { url: string; body: Record<string, unknown> };
const calls: Call[] = [];

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

type SpanState = { fullRequest: string; appliedEngines: string[]; candidateQueries: Record<string, string> };
/** Picks a span by its text; undefined gives no answer (the engine falls back). */
type SpanPick = (state: SpanState, instructions: string) => string | undefined;
let spanPick: SpanPick = () => undefined;
let failSpans = false;

const choiceFor = (state: SpanState, value: string | undefined) =>
  Object.entries(state.candidateQueries).find(([, v]) => v === value)?.[0];

function stubFetch(results?: Record<string, unknown>[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      calls.push({ url, body });

      if (url.endsWith('/v1/systemone')) {
        const questions = body.questions as Record<string, { type: string; instructions: string }>;
        const answers: Record<string, unknown> = {};
        if (questions.span) {
          if (failSpans) return new Response('busy', { status: 503 });
          const state = body.state as SpanState;
          const choice = choiceFor(state, spanPick(state, questions.span.instructions));
          if (choice) answers.span = { type: 'choice', choice, probabilities: { [choice]: 1 }, confidence: 1 };
          return jsonResponse({ model: 'jev-1.13.0', answers, usage: { input_tokens: 100, output_tokens: 1 } });
        }
        for (const [id, q] of Object.entries(questions)) {
          if (id === 'window') {
            answers[id] = { type: 'choice', choice: '7d', probabilities: { '7d': 0.8 }, confidence: 0.8 };
          } else if (id.startsWith('source_')) {
            answers[id] = { type: 'noul', noul: id === 'source_reddit' ? 0.9 : 0.1 };
          } else if (q.type === 'noul') {
            // r0 is on topic, r1 is the hair bun.
            answers[id] = { type: 'noul', noul: id === 'r0' ? 0.95 : 0.05 };
          }
        }
        return jsonResponse({ model: 'jev-1.13.0', answers, usage: { input_tokens: 100, output_tokens: 1 } });
      }

      if (url.endsWith('/search') || url.endsWith('/news')) {
        if (results) return jsonResponse({ results });
        if (body.search_service === 'reddit') {
          return jsonResponse({
            results: [
              { title: 'Old thread', link: 'https://www.reddit.com/r/bun/old', snippet: 'Oct 10, 2025 · stale' },
              { title: 'Should I move away from Bun? - Reddit', link: 'https://reddit.com/r/bun/1/', snippet: '3 days ago ... runtime' },
            ],
          });
        }
        return jsonResponse({
          results: [
            { title: 'Should I move away from Bun? - Reddit', link: 'https://www.reddit.com/r/bun/1', snippet: '3 days ago ... runtime' },
            { title: 'Hair up in a bun : r/hair - Reddit', link: 'https://www.reddit.com/r/hair/2', snippet: '1 day ago ... hair' },
          ],
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    })
  );
}

/** Fake Workers AI binding answering Clairic's keyword-engine fields. */
function clairic(values: Record<string, string>, fail = false) {
  const run = vi.fn(async (model: string, _inputs: unknown) => {
    expect(model).toBe('@cf/cloudflare/clairic');
    if (fail) throw new Error('InferenceUpstreamError: 503 Service Unavailable');
    return {
      answers: Object.fromEntries(Object.entries(values).map(([id, value]) => [id, { type: 'text', value }])),
      usage: { input_tokens: 40, output_tokens: 0 },
    };
  });
  return { ai: { run }, run };
}

const judge = { providers: [{ provider: 'typesafe' as const, apiKey: 'ts' }] };
const searchesOf = (service: string) =>
  calls.filter((c) => (c.url.endsWith('/search') || c.url.endsWith('/news')) && c.body.search_service === service);
const spanCalls = () =>
  calls
    .filter((c) => c.url.endsWith('/v1/systemone') && 'span' in (c.body.questions as object))
    .map((c) => ({
      state: c.body.state as SpanState,
      instructions: (c.body.questions as { span: { instructions: string } }).span.instructions,
    }));

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  calls.length = 0;
  spanPick = () => undefined;
  failSpans = false;
});

describe('runSearch', () => {
  it('searches and scores each lane once even when a caller repeats sources', async () => {
    stubFetch([{ title: 'Bun discussion', link: 'https://reddit.com/r/bun/1', snippet: 'Bun runtime' }]);
    const out = await runSearch(
      { search1api: { apiKey: 's1' }, judge, now: () => new Date('2026-09-18T18:30:00Z') },
      { request: 'Bun', sources: ['reddit', 'reddit', 'reddit'], window: 'any' }
    );

    expect(searchesOf('reddit')).toHaveLength(1);
    expect(calls.filter((c) => c.url.endsWith('/search'))).toHaveLength(1);
    // One intent judgment and one relevance judgment; a one-word request needs no span choice.
    expect(calls.filter((c) => c.url.endsWith('/v1/systemone'))).toHaveLength(2);
    expect(out.sources).toEqual(['reddit']);
    expect(out.lanes).toHaveLength(1);
    expect(out.items).toHaveLength(1);
    expect(out.tokens).toBe(200);
  });

  it('carries API dates through filtering, scoring and Newest sorting', async () => {
    stubFetch([
      { title: 'Old', link: 'https://a.com/old', snippet: '1 hour ago ... misleading', published_date: '2025-01-01' },
      { title: 'Day only', link: 'https://a.com/day', snippet: 'plain', published_date: '2026-09-17' },
      { title: 'Recent', link: 'https://a.com/recent', snippet: '3 days ago ... misleading', published_date: '2026-09-18T17:30:00Z' },
      { title: 'Unknown', link: 'https://a.com/unknown', snippet: 'plain', published_date: null },
    ]);
    const out = await runSearch(
      { search1api: { apiKey: 's1' }, judge, now: () => new Date('2026-09-18T18:30:00Z') },
      { request: 'Bun', sources: ['google'], window: '24h' }
    );
    expect(out.lanes[0]!.stale).toBe(1);
    expect(out.items).toHaveLength(3);
    expect(out.items.find((i) => i.title === 'Day only')).toMatchObject({ publishedDate: '2026-09-17', ageHours: 42.5 });
    const recent = out.items.find((i) => i.title === 'Recent')!;
    expect(recent).toMatchObject({ publishedDate: '2026-09-18T17:30:00Z', ageHours: 1 });
    expect(recent.freshness).toBeCloseTo(23 / 24);
    expect([...out.items].sort((a, b) => compareItems(a, b, 'newest')).map((i) => i.title))
      .toEqual(['Recent', 'Day only', 'Unknown']);
  });

  it('recomputes age from the cached absolute publication time', async () => {
    stubFetch([{ title: 'Recent', link: 'https://a.com', snippet: '1 hour ago ... text', published_date: '2026-09-18T17:00:00Z' }]);
    let now = new Date('2026-09-18T18:00:00Z');
    const deps = { search1api: { apiKey: 's1' }, judge, cache: memoryCache(), now: () => now };
    const input = { request: 'Bun', sources: ['google' as const], window: 'any' as const };
    expect((await runSearch(deps, input)).items[0]!.ageHours).toBe(1);
    now = new Date('2026-09-18T18:30:00Z');
    expect((await runSearch(deps, input)).items[0]!.ageHours).toBe(1.5);
    expect(calls.filter((c) => c.url.endsWith('/search'))).toHaveLength(1);
  });

  it('infers window and sources, sends the Clairic query to Reddit, and scores results', async () => {
    stubFetch();
    const { ai, run } = clairic({ reddit: 'Bun 1.3', github: 'Bun' });
    const request = 'what are people saying about Bun 1.3 this week';
    const out = await runSearch(
      { search1api: { apiKey: 's1' }, judge, ai, now: () => new Date('2026-09-17T00:00:00Z') },
      { request }
    );

    expect(out.window).toBe('7d');
    expect(out.sources).toEqual(['reddit']);
    expect(out.query).toBe('Bun 1.3');
    expect(out.queries).toEqual({ reddit: 'Bun 1.3' });
    expect(out.queryFrom).toEqual({ reddit: 'clairic' });
    // One Clairic call for the three keyword engines, before routing is known.
    expect(run).toHaveBeenCalledTimes(1);
    const inputs = run.mock.calls[0]![1] as { state: string; fields: Record<string, unknown> };
    expect(inputs.state).toBe(request);
    expect(Object.keys(inputs.fields).sort()).toEqual(['github', 'hackernews', 'reddit']);
    // Jev answers window and sources only, and needs no span choice for Reddit.
    const intentCall = calls.find((c) => c.url.endsWith('/v1/systemone') && 'window' in (c.body.questions as object))!;
    expect(Object.keys(intentCall.body.questions as object).filter((k) => !k.startsWith('source_'))).toEqual(['window']);
    expect(spanCalls()).toHaveLength(0);

    const reddit = searchesOf('reddit');
    expect(reddit).toHaveLength(1);
    expect(reddit[0]!.body).toEqual({ query: 'Bun 1.3', search_service: 'reddit', time_range: 'week', max_results: 8 });
    // The stale reddit row (Oct 2025) is outside the window and dropped.
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({ relevance: 0.95, ageHours: 72, snippet: 'runtime', engines: ['reddit'] });
    expect(out.lanes[0]).toMatchObject({ stale: 1 });
    expect(out.tokens).toBe(240);
  });

  it('gives each engine its own query: Clairic, then a Jev span, then the request as typed', async () => {
    stubFetch();
    const request = 'On GitHub find FastAPI JWT authentication examples; on Reddit find FastAPI production performance experiences.';
    spanPick = (_state, instructions) =>
      instructions.includes('Reddit-specific')
        ? 'FastAPI production performance experiences'
        : instructions.includes('general web pages')
          ? 'FastAPI JWT authentication examples'
          : undefined;
    const out = await runSearch(
      { search1api: { apiKey: 's1' }, judge, ai: clairic({ github: 'FastAPI JWT authentication examples' }).ai },
      { request, window: 'any', sources: ['google', 'github', 'reddit', 'youtube'] }
    );
    expect(out.queries).toEqual({
      google: 'FastAPI JWT authentication examples',
      github: 'FastAPI JWT authentication examples',
      reddit: 'FastAPI production performance experiences',
      youtube: request,
    });
    expect(out.queryFrom).toEqual({ google: 'jev', github: 'clairic', reddit: 'jev', youtube: 'request' });
    expect(out.query).toBe(out.queries.google);
    expect(searchesOf('reddit')[0]!.body.query).toBe('FastAPI production performance experiences');
    expect(searchesOf('youtube')[0]!.body.query).toBe(request);

    const spans = spanCalls();
    // Web and YouTube first; Reddit only after Clairic left it empty. GitHub never asks Jev.
    expect(spans).toHaveLength(3);
    expect(spans.some((s) => s.instructions.includes('GitHub-specific'))).toBe(false);
    expect(spans[2]!.instructions).toContain('Reddit-specific');
    for (const { state } of spans) {
      // Every routed engine counts as applied, and spans naming one as the place to search are gone.
      expect(state.appliedEngines).toEqual(['google', 'github', 'reddit', 'youtube']);
      expect(state.fullRequest).toBe(request);
      const candidates = Object.values(state.candidateQueries);
      expect(candidates[0]).toBe(request);
      expect(candidates.slice(1).some((c) => /GitHub|Reddit/.test(c))).toBe(false);
    }
  });

  it('uses Jev spans for keyword engines when Clairic fails or there is no binding', async () => {
    for (const ai of [clairic({}, true).ai, undefined]) {
      stubFetch();
      spanPick = (_state, instructions) => (instructions.includes('Hacker News threads') ? 'Zig async I/O redesign' : undefined);
      const out = await runSearch(
        { search1api: { apiKey: 's1' }, judge, ai },
        { request: 'what does HN think of Zig async I/O redesign', window: 'any', sources: ['hackernews'] }
      );
      expect(out.queries).toEqual({ hackernews: 'Zig async I/O redesign' });
      expect(out.queryFrom).toEqual({ hackernews: 'jev' });
      expect(searchesOf('hackernews')[0]!.url).toMatch(/\/news$/);
      vi.unstubAllGlobals();
      calls.length = 0;
    }
  });

  it('sends the request as typed when span selection fails', async () => {
    stubFetch();
    failSpans = true;
    const request = 'who directed the movie Past Lives';
    const out = await runSearch({ search1api: { apiKey: 's1' }, judge }, { request, window: 'any', sources: ['google', 'imdb'] });
    expect(out.queries).toEqual({ google: request, imdb: request });
    expect(out.queryFrom).toEqual({ google: 'request', imdb: 'request' });
    expect(out.items.length).toBeGreaterThan(0);
  });

  it('respects explicit window and sources, one engine per source', async () => {
    stubFetch();
    const out = await runSearch(
      { search1api: { apiKey: 's1' }, judge },
      { request: 'Bun 1.3', window: '24h', sources: ['google', 'duckduckgo', 'github'] }
    );
    expect(out.window).toBe('24h');
    expect(out.sources).toEqual(['google', 'duckduckgo', 'github']);
    const searches = calls.filter((c) => c.url.endsWith('/search'));
    expect(searches.map((c) => c.body.search_service).sort()).toEqual(['duckduckgo', 'github', 'google']);
    for (const c of searches) {
      expect(c.body).toMatchObject({ time_range: 'day' });
      expect(c.body).not.toHaveProperty('include_sites');
    }
  });

  it('searches Hacker News through its native news endpoint only', async () => {
    stubFetch([{ title: 'SQLite discussion', link: 'https://news.ycombinator.com/item?id=1', snippet: 'SQLite' }]);
    const out = await runSearch({ search1api: { apiKey: 's1' }, judge }, { request: 'SQLite', sources: ['hackernews'], window: '30d' });
    const searches = calls.filter((c) => c.url.endsWith('/search') || c.url.endsWith('/news'));
    expect(searches).toHaveLength(1);
    expect(searches[0]!.url).toMatch(/\/news$/);
    expect(searches[0]!.body).toEqual({ query: 'SQLite', search_service: 'hackernews', time_range: 'month', max_results: 8 });
    expect(out.sources).toEqual(['hackernews']);
    expect(out.items[0]!.engines).toEqual(['hackernews']);
  });

  it('uses the vertical engine for vertical sources', async () => {
    stubFetch();
    await runSearch({ search1api: { apiKey: 's1' }, judge }, { request: 'LLM agents', sources: ['arxiv'] });
    expect(searchesOf('arxiv')[0]!.body).toMatchObject({ search_service: 'arxiv' });
  });

  it('sends no time filter for Any time, and never to engines that reject it', async () => {
    stubFetch();
    const out = await runSearch({ search1api: { apiKey: 's1' }, judge }, { request: 'Oppenheimer', window: 'any', sources: ['google', 'imdb'] });
    const searches = calls.filter((c) => c.url.endsWith('/search'));
    expect(searches.every((c) => !('time_range' in c.body))).toBe(true);
    expect(searchesOf('google')).toHaveLength(1);
    // Any time: the stale row is kept and freshness is flat.
    expect(out.items.every((i) => i.freshness === 0.5)).toBe(true);

    calls.length = 0;
    await runSearch({ search1api: { apiKey: 's1' }, judge }, { request: 'Oppenheimer', window: '7d', sources: ['google', 'imdb'] });
    expect(searchesOf('imdb').every((c) => !('time_range' in c.body))).toBe(true);
    expect(searchesOf('google').map((c) => c.body.time_range)).toEqual(['week']);
  });

  it('keeps going when one source fails', async () => {
    stubFetch();
    const original = globalThis.fetch as ReturnType<typeof vi.fn>;
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { search_service?: string };
      if (String(input).endsWith('/search') && body.search_service === 'github') {
        return new Response('upstream broke', { status: 502 });
      }
      return original(input, init);
    }));
    const out = await runSearch({ search1api: { apiKey: 's1' }, judge }, { request: 'Bun 1.3', sources: ['reddit', 'github'] });
    expect(out.errors).toEqual([{ source: 'github', engine: 'github', message: 'upstream broke' }]);
    expect(out.totalMs).toBeGreaterThanOrEqual(0);
    expect(out.items.map((i) => i.source)).toEqual(['reddit']);
  });
});
