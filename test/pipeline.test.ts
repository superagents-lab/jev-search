import { afterEach, describe, expect, it, vi } from 'vitest';
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

function stubFetch(results?: Record<string, unknown>[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      calls.push({ url, body });

      if (url.endsWith('/v1/systemone')) {
        const questions = body.questions as Record<string, { type: string }>;
        const answers: Record<string, unknown> = {};
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

/** Fake Workers AI binding answering the Clairic query field. */
function clairic(reply: (inputs: { state: string; fields: Record<string, unknown> }) => Promise<unknown>) {
  const run = vi.fn(async (model: string, inputs: unknown) => {
    expect(model).toBe('@cf/cloudflare/clairic');
    return reply(inputs as { state: string; fields: Record<string, unknown> });
  });
  return { ai: { run }, run };
}

const extracted = (value: string | null) => async () => ({
  answers: { query: { type: 'text', value, p_null: value ? 0.01 : 0.99, confidence: 0.9 } },
  usage: { input_tokens: 40, output_tokens: 0 },
});

afterEach(() => {
  vi.unstubAllGlobals();
  calls.length = 0;
});

describe('runSearch', () => {
  it('searches and scores each lane once even when a caller repeats sources', async () => {
    stubFetch([{ title: 'Bun discussion', link: 'https://reddit.com/r/bun/1', snippet: 'Bun runtime' }]);
    const out = await runSearch(
      { search1api: { apiKey: 's1' }, judge: { providers: [{ provider: 'typesafe' as const, apiKey: 'ts' }] }, now: () => new Date('2026-09-18T18:30:00Z') },
      { request: 'Bun', sources: ['reddit', 'reddit', 'reddit'], window: 'any' }
    );

    const searchCalls = calls.filter((c) => c.url.endsWith('/search'));
    expect(searchCalls.map((c) => c.body.search_service).sort()).toEqual(['google', 'reddit']);
    // One intent judgment, then one relevance judgment per lane.
    expect(calls.filter((c) => c.url.endsWith('/v1/systemone'))).toHaveLength(3);
    expect(out.sources).toEqual(['reddit']);
    expect(out.lanes).toHaveLength(2);
    expect(out.items).toHaveLength(1);
    expect(out.tokens).toBe(300);
  });

  it('carries API dates through filtering, scoring and Newest sorting', async () => {
    stubFetch([
      { title: 'Old', link: 'https://a.com/old', snippet: '1 hour ago ... misleading', published_date: '2025-01-01' },
      { title: 'Day only', link: 'https://a.com/day', snippet: 'plain', published_date: '2026-09-17' },
      { title: 'Recent', link: 'https://a.com/recent', snippet: '3 days ago ... misleading', published_date: '2026-09-18T17:30:00Z' },
      { title: 'Unknown', link: 'https://a.com/unknown', snippet: 'plain', published_date: null },
    ]);
    const out = await runSearch(
      { search1api: { apiKey: 's1' }, judge: { providers: [{ provider: 'typesafe' as const, apiKey: 'ts' }] }, now: () => new Date('2026-09-18T18:30:00Z') },
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
    const deps = { search1api: { apiKey: 's1' }, judge: { providers: [{ provider: 'typesafe' as const, apiKey: 'ts' }] }, cache: memoryCache(), now: () => now };
    const input = { request: 'Bun', sources: ['google' as const], window: 'any' as const };
    expect((await runSearch(deps, input)).items[0]!.ageHours).toBe(1);
    now = new Date('2026-09-18T18:30:00Z');
    expect((await runSearch(deps, input)).items[0]!.ageHours).toBe(1.5);
    expect(calls.filter((c) => c.url.endsWith('/search'))).toHaveLength(1);
  });

  it('infers window and sources, sends the extracted query, and scores results', async () => {
    stubFetch();
    const { ai, run } = clairic(extracted('Bun 1.3'));
    const out = await runSearch(
      { search1api: { apiKey: 's1' }, judge: { providers: [{ provider: 'typesafe' as const, apiKey: 'ts' }] }, ai, now: () => new Date('2026-09-17T00:00:00Z') },
      { request: 'what are people saying about Bun 1.3 this week' }
    );

    expect(out.window).toBe('7d');
    expect(out.sources).toEqual(['reddit']);
    expect(out.query).toBe('Bun 1.3');
    expect(out.queryExtracted).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]![1]).toMatchObject({ state: 'what are people saying about Bun 1.3 this week' });
    // Jev answers window and sources only; the query comes from Clairic.
    const intentCall = calls.find((c) => c.url.endsWith('/v1/systemone') && 'window' in (c.body.questions as object))!;
    expect(Object.keys(intentCall.body.questions as object).filter((k) => !k.startsWith('source_'))).toEqual(['window']);
    expect(intentCall.body.state).not.toHaveProperty('candidates');

    const searchCalls = calls.filter((c) => c.url.endsWith('/search') && c.body.query === 'Bun 1.3' && c.body.time_range === 'week');
    expect(searchCalls.map((c) => c.body.search_service).sort()).toEqual(['google', 'reddit']);
    expect(searchCalls.find((c) => c.body.search_service === 'reddit')!.body).toMatchObject({ include_sites: [], exclude_sites: [] });
    expect(searchCalls[0]!.body).toMatchObject({
      query: 'Bun 1.3',
      time_range: 'week',
      include_sites: ['reddit.com'],
    });

    // Lanes folded by URL: the shared URL is one row with both engines; the
    // stale reddit row (Oct 2025) is outside the window and dropped.
    expect(out.items).toHaveLength(2);
    expect(out.items[0]).toMatchObject({ relevance: 0.95, ageHours: 72, snippet: 'runtime' });
    expect(out.items[0]!.engines.sort()).toEqual(['google', 'reddit']);
    expect(out.items[1]).toMatchObject({ relevance: 0.05, ageHours: 24, engines: ['google'] });
    expect(out.lanes.find((l) => l.engine === 'reddit')).toMatchObject({ stale: 1 });
    expect(out.tokens).toBe(340);
  });

  it('sends the request as typed when extraction fails, finds nothing, is slow or has no binding', async () => {
    const request = 'what are people saying about Bun 1.3 this week';
    const deps = { search1api: { apiKey: 's1' }, judge: { providers: [{ provider: 'typesafe' as const, apiKey: 'ts' }] }, now: () => new Date('2026-09-17T00:00:00Z') };
    const cases = [
      undefined,
      clairic(async () => { throw new Error('AiError: 3040: Capacity temporarily exceeded'); }).ai,
      clairic(extracted(null)).ai,
      clairic(extracted('   ')).ai,
      clairic(() => new Promise(() => undefined)).ai,
    ];
    for (const ai of cases) {
      stubFetch();
      const out = await runSearch({ ...deps, ai }, { request, sources: ['google'], window: 'any' });
      expect(out.query).toBe(request);
      expect(out.queryExtracted).toBe(false);
      expect(calls.filter((c) => c.url.endsWith('/search')).map((c) => c.body.query)).toEqual([request]);
      vi.unstubAllGlobals();
      calls.length = 0;
    }
  });

  it('reads the REST-shaped Clairic response and sends one query to every engine, IMDb included', async () => {
    stubFetch();
    const { ai } = clairic(async () => ({ result: (await extracted('Oppenheimer cast')()) }));
    const out = await runSearch(
      { search1api: { apiKey: 's1' }, judge: { providers: [{ provider: 'typesafe' as const, apiKey: 'ts' }] }, ai },
      { request: 'who is in the cast of Oppenheimer', window: 'any', sources: ['google', 'imdb', 'reddit'] }
    );
    expect(out.query).toBe('Oppenheimer cast');
    const queries = calls.filter((c) => c.url.endsWith('/search')).map((c) => c.body.query);
    expect(queries.length).toBe(4);
    expect(new Set(queries)).toEqual(new Set(['Oppenheimer cast']));
  });

  it('respects explicit window and sources', async () => {
    stubFetch();
    const out = await runSearch(
      { search1api: { apiKey: 's1' }, judge: { providers: [{ provider: 'typesafe' as const, apiKey: 'ts' }] } },
      { request: 'Bun 1.3', window: '24h', sources: ['google', 'duckduckgo', 'github'] }
    );
    expect(out.window).toBe('24h');
    expect(out.sources).toEqual(['google', 'duckduckgo', 'github']);
    // One call per lane: Google, DuckDuckGo, and GitHub's site search and native engine.
    const searches = calls.filter((c) => c.url.endsWith('/search'));
    expect(searches).toHaveLength(4);
    const web = searches.filter((c) => ['google', 'duckduckgo'].includes(String(c.body.search_service)) && (c.body.include_sites as string[]).length === 0 && 'time_range' in c.body);
    const gh = searches.filter((c) => (c.body.include_sites as string[])[0] === 'github.com' || c.body.search_service === 'github');
    expect(web.map((c) => c.body.search_service).sort()).toEqual(['duckduckgo', 'google']);
    expect(web[0]!.body).toMatchObject({ time_range: 'day', exclude_sites: [] });
    expect(gh.map((c) => c.body.search_service).sort()).toEqual(['github', 'google']);
  });

  it('searches Hacker News through Google site and the native news endpoint only', async () => {
    stubFetch([{ title: 'SQLite discussion', link: 'https://news.ycombinator.com/item?id=1', snippet: 'SQLite' }]);
    const out = await runSearch(
      { search1api: { apiKey: 's1' }, judge: { providers: [{ provider: 'typesafe' as const, apiKey: 'ts' }] } },
      { request: 'SQLite', sources: ['hackernews'], window: '30d' }
    );
    const searches = calls.filter((c) => c.url.endsWith('/search') || c.url.endsWith('/news'));
    expect(searches).toHaveLength(2);
    expect(searches.find((c) => c.url.endsWith('/news'))!.body).toMatchObject({
      search_service: 'hackernews', time_range: 'month', include_sites: [], exclude_sites: [],
    });
    expect(searches.find((c) => c.url.endsWith('/search'))!.body).toMatchObject({
      search_service: 'google', include_sites: ['news.ycombinator.com'],
    });
    expect(out.sources).toEqual(['hackernews']);
    expect(out.items[0]!.engines.sort()).toEqual(['google', 'hackernews']);
  });

  it('uses the vertical engine for vertical sources', async () => {
    stubFetch();
    await runSearch(
      { search1api: { apiKey: 's1' }, judge: { providers: [{ provider: 'typesafe' as const, apiKey: 'ts' }] } },
      { request: 'LLM agents', sources: ['arxiv'] }
    );
    const searches = calls.filter((c) => c.url.endsWith('/search') && c.body.search_service === 'arxiv');
    expect(searches[0]!.body).toMatchObject({ search_service: 'arxiv', include_sites: [], exclude_sites: [] });
  });

  it('sends no time filter for Any time, and never to engines that reject it', async () => {
    stubFetch();
    const out = await runSearch(
      { search1api: { apiKey: 's1' }, judge: { providers: [{ provider: 'typesafe' as const, apiKey: 'ts' }] } },
      { request: 'Oppenheimer', window: 'any', sources: ['google', 'imdb'] }
    );
    const searches = calls.filter((c) => c.url.endsWith('/search'));
    expect(searches.every((c) => !('time_range' in c.body))).toBe(true);
    expect(searches.filter((c) => c.body.search_service === 'google')).toHaveLength(1);
    // Any time: the stale row is kept and freshness is flat.
    expect(out.items.every((i) => i.freshness === 0.5)).toBe(true);

    calls.length = 0;
    await runSearch(
      { search1api: { apiKey: 's1' }, judge: { providers: [{ provider: 'typesafe' as const, apiKey: 'ts' }] } },
      { request: 'Oppenheimer', window: '7d', sources: ['google', 'imdb'] }
    );
    const again = calls.filter((c) => c.url.endsWith('/search'));
    expect(again.filter((c) => c.body.search_service === 'imdb').every((c) => !('time_range' in c.body))).toBe(true);
    // The google lane carries the window.
    expect(again.filter((c) => c.body.search_service === 'google' && 'time_range' in c.body).map((c) => c.body.time_range)).toEqual(['week']);
  });

  it('keeps going when one source fails', async () => {
    stubFetch();
    const original = globalThis.fetch as ReturnType<typeof vi.fn>;
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { include_sites?: string[]; search_service?: string };
      if (String(input).endsWith('/search') && (body.include_sites?.[0] === 'github.com' || body.search_service === 'github')) {
        return new Response('upstream broke', { status: 502 });
      }
      return original(input, init);
    }));
    const out = await runSearch(
      { search1api: { apiKey: 's1' }, judge: { providers: [{ provider: 'typesafe' as const, apiKey: 'ts' }] } },
      { request: 'Bun 1.3', sources: ['reddit', 'github'] }
    );
    expect(out.errors.map((e) => e.engine).sort()).toEqual(['github', 'google']);
    expect(out.errors.every((e) => e.source === 'github' && e.message === 'upstream broke')).toBe(true);
    expect(out.totalMs).toBeGreaterThanOrEqual(0);
    expect(out.items.map((i) => i.source)).toEqual(['reddit', 'reddit']);
  });
});
