/**
 * Per-engine query: the decision model picks one coherent span of the
 * user's own words for each engine, in one choice. It never translates or
 * adds words. Same selection as Search1API's Ask API (search1api-monorepo
 * apps/ask/src/spans.ts); evaluated there on 32 multilingual requests:
 * exact Wikipedia pages 5/6 vs 0/6 for a single shared keyword query, and
 * multi-platform requests split per engine.
 */

import { systemOne, type JudgeConfig } from './typesafe';
import type { SourceId } from './sources';

/** Engines that share a note share one selection. */
const WEB_NOTE =
  'Retrieve general web pages for the request. Select the complete subject and task, without words that only describe where or when to search.';

const NOTES: Record<SourceId, string> = {
  google: WEB_NOTE,
  duckduckgo: WEB_NOTE,
  yandex: WEB_NOTE,
  hackernews:
    'Retrieve Hacker News threads. Select the technical subject and what is being discussed, not request scaffolding.',
  reddit:
    'Retrieve discussion posts for the Reddit-specific part of the request. When there are multiple platform clauses, select the Reddit subject and its comparison, problem or experience, not the GitHub implementation clause. Preserve both sides of a requested comparison.',
  github:
    'Retrieve repositories or code examples for the GitHub-specific part of the request. When there are multiple platform clauses, select only the GitHub subject and its technical task, not the Reddit experience/comparison clause. Preserve the complete software name and task-specific technologies.',
  x: 'Retrieve posts on X (Twitter) for the X-specific part of the request. Select the subject people are posting about.',
  arxiv:
    'Retrieve academic papers on the exact research topic. Select the complete technical topic, not question wording or already applied dates.',
  wikipedia:
    'Retrieve the exact encyclopedic entity/work page in the request language. Select the complete entity or work name and necessary disambiguation (such as a release year or novel genre). A question about history or authorship can be answered by the entity page; omit question wording and the requested factual facet when that would impair exact-page lookup.',
  imdb: 'Retrieve the exact film/person page. Select the full title/name and release year when it identifies the work. Director/cast question wording is unnecessary for retrieving the film page.',
  wechat:
    'Retrieve WeChat articles for the WeChat-specific part of the request. Select the complete subject and topic.',
  youtube:
    'Retrieve videos for the YouTube-specific part of the request. Select the complete subject and the kind of video wanted (tutorial, review, talk).',
};

/**
 * How requests name each engine. Live checks showed the model keeps "on
 * GitHub" or "Reddit 上" despite the instruction, so spans that use an
 * applied engine as scope are removed before the choice.
 */
const SCOPE_NAMES: Record<SourceId, readonly string[]> = {
  google: ['Google', '谷歌'],
  duckduckgo: ['DuckDuckGo'],
  yandex: ['Yandex', 'Яндекс'],
  hackernews: ['Hacker News', 'HackerNews', 'HN'],
  reddit: ['Reddit'],
  github: ['GitHub'],
  x: ['Twitter', '推特'],
  arxiv: ['arXiv'],
  wikipedia: ['Wikipedia', 'Википедия', '维基百科', 'ウィキペディア', '위키백과'],
  imdb: ['IMDb'],
  wechat: ['WeChat', '微信公众号', '公众号'],
  youtube: ['YouTube', '油管'],
};

const LATIN_OR_DIGIT = /[A-Za-z0-9]/;
const PRODUCT_START = /[A-Z0-9]/;

/**
 * True when `text` names one of `names` as a place to search. A name directly
 * followed by a capitalised word or number is a product ("GitHub Actions",
 * "YouTube Shorts", "Reddit API") and does not count.
 */
export function mentionsScope(text: string, names: readonly string[]): boolean {
  const lower = text.toLowerCase();
  for (const name of names) {
    const needle = name.toLowerCase();
    for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, at + 1)) {
      const before = text[at - 1] ?? '';
      const after = text[at + name.length] ?? '';
      if (LATIN_OR_DIGIT.test(before) || LATIN_OR_DIGIT.test(after)) continue;
      const next = after === ' ' ? (text[at + name.length + 1] ?? '') : after;
      if (!PRODUCT_START.test(next)) return true;
    }
  }
  return false;
}

/** Largest Choice the model is asked; longer lists are sampled evenly. */
const MAX_CANDIDATES = 255;

function cap(values: string[], whole: string): string[] {
  const unique = [...new Set([whole, ...values].filter(Boolean))];
  if (unique.length <= MAX_CANDIDATES) return unique;
  // Even sampling across all intervals: no language-specific stopword rules.
  const selected = [whole];
  for (let i = 0; i < MAX_CANDIDATES - 1; i++) {
    selected.push(unique[1 + Math.floor((i * (unique.length - 1)) / (MAX_CANDIDATES - 1))]!);
  }
  return [...new Set(selected)];
}

/**
 * Every contiguous span on word boundaries, minus spans `exclude` rejects;
 * index 0 is always the whole text.
 */
export function wordSpans(text: string, exclude: (span: string) => boolean = () => false): string[] {
  const parts = [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)].filter((part) =>
    part.segment.trim()
  );
  const values: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    for (let j = i; j < parts.length; j++) {
      const first = parts[i];
      const last = parts[j];
      if (first && last) {
        const span = text.slice(first.index, last.index + last.segment.length);
        if (!exclude(span)) values.push(span);
      }
    }
  }
  return cap(values, text);
}

export interface SpanContext {
  request: string;
  sources: readonly SourceId[];
  /** Search1API `time_range` already applied, if any. */
  timeRange: string | undefined;
}

/** Picks one candidate; undefined when the model gives no usable answer. */
async function choose(
  config: JudgeConfig,
  context: SpanContext,
  note: string,
  candidates: string[],
  signal?: AbortSignal
): Promise<{ query: string | undefined; tokens: number }> {
  if (candidates.length < 2) return { query: candidates[0], tokens: 0 };
  const criteria = Object.fromEntries(candidates.map((value, i) => [`c${i}`, value]));
  const res = await systemOne(
    config,
    {
      fullRequest: context.request,
      appliedEngines: context.sources,
      appliedTimeRange: context.timeRange ?? null,
      candidateQueries: criteria,
    },
    {
      span: {
        type: 'choice',
        instructions: `Select ONE coherent original-text span as the best literal search query for this engine. ${note} The engines in appliedEngines and the appliedTimeRange are already applied as search parameters: do not select platform names or time phrases as keywords. Prefer the shortest complete subject-and-task phrase that can retrieve the intended source. Avoid leftover request scaffolding. Never translate, invent keywords, or silently change a requested technology/entity. If no shortened candidate adequately identifies the intended subject/task, keep c0.`,
        criteria,
      },
    },
    signal
  );
  const answer = res.answers.span;
  const index = answer?.type === 'choice' && /^c\d+$/.test(answer.choice) ? Number(answer.choice.slice(1)) : -1;
  return { query: candidates[index], tokens: res.usage.input_tokens };
}

export interface SpanQueries {
  /** Chosen span per engine; engines missing here keep their fallback query. */
  queries: Partial<Record<SourceId, string>>;
  tokens: number;
}

/**
 * Selects a span per engine with one choice over its word spans. Engines
 * that share a note are selected together; notes run in parallel. A failed
 * or unusable selection (a provider error, a refusal, a choice outside the
 * candidates) leaves those engines out so the caller can fall back; aborts
 * propagate. `only` limits which engines are selected; every engine in
 * `context.sources` still counts as applied.
 */
export async function selectSpans(
  config: JudgeConfig,
  context: SpanContext,
  signal?: AbortSignal,
  only: readonly SourceId[] = context.sources
): Promise<SpanQueries> {
  if (only.length === 0) return { queries: {}, tokens: 0 };
  const groups = new Map<string, SourceId[]>();
  for (const source of only) {
    const note = NOTES[source];
    groups.set(note, [...(groups.get(note) ?? []), source]);
  }
  const scopes = context.sources.flatMap((source) => SCOPE_NAMES[source]);
  const phrases = wordSpans(context.request, (span) => mentionsScope(span, scopes));
  const picks = await Promise.all(
    [...groups].map(async ([note, sources]) => {
      try {
        const pick = await choose(config, context, note, phrases, signal);
        return { sources, query: pick.query, tokens: pick.tokens };
      } catch (error) {
        if (signal?.aborted) throw error;
        console.warn(
          `[jev] span selection failed for ${sources.join(',')}: ${error instanceof Error ? error.message : String(error)}`
        );
        return { sources, query: undefined, tokens: 0 };
      }
    })
  );
  const queries: Partial<Record<SourceId, string>> = {};
  let tokens = 0;
  for (const pick of picks) {
    tokens += pick.tokens;
    const query = pick.query?.trim();
    if (query) {
      for (const source of pick.sources) queries[source] = query;
    }
  }
  return { queries, tokens };
}
