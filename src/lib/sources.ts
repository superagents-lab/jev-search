export type SourceId =
  | 'google'
  | 'duckduckgo'
  | 'yandex'
  | 'hackernews'
  | 'reddit'
  | 'github'
  | 'x'
  | 'arxiv'
  | 'youtube'
  | 'wikipedia'
  | 'imdb'
  | 'wechat';

/**
 * One Search1API `/search` or `/news` call; `service` is the engine. Every
 * source searches its own platform's engine only. Hacker News, Reddit and
 * GitHub no longer add a Google site-restricted lane: the search service
 * does that inside its own engines.
 */
export interface Lane {
  service: string;
  /** False for engines that reject or ignore `time_range` (wikipedia, imdb, wechat). */
  timeFilter?: boolean;
}

export interface Source {
  id: SourceId;
  label: string;
  lanes: Lane[];
  /** Plain-language description handed to the judge. */
  description: string;
  /** Yes/no question the judge answers to decide whether this source is wanted. */
  ask: { question: string; yes: string; no: string };
  /** Searched when the request does not single out any source. */
  defaultOn: boolean;
  /** Fall back to the intent's name-or-title pick instead of its keyword pick; unset everywhere, as in the Ask API. */
  entityQuery?: boolean;
}

export const SOURCES: readonly Source[] = [
  {
    id: 'google',
    label: 'Google',
    lanes: [{ service: 'google' }],
    description: 'Google web results: news sites, blogs, documentation, anything on the open web',
    ask: {
      question: 'Would general web pages (news, articles, blogs, docs) help answer this request?',
      yes: 'The request is a general question, or asks for news, articles, coverage, docs or blog posts',
      no: 'The request only makes sense on a specific platform such as Reddit, GitHub, arXiv, YouTube or IMDb',
    },
    defaultOn: true,
  },
  {
    id: 'duckduckgo',
    label: 'DuckDuckGo',
    lanes: [{ service: 'duckduckgo' }],
    description: 'DuckDuckGo web results: a second, independent view of the open web',
    ask: {
      question: 'Would general web pages (news, articles, blogs, docs) help answer this request?',
      yes: 'The request is a general question, or asks for news, articles, coverage, docs or blog posts',
      no: 'The request only makes sense on a specific platform such as Reddit, GitHub, arXiv, YouTube or IMDb',
    },
    defaultOn: true,
  },
  {
    id: 'yandex',
    label: 'Yandex',
    lanes: [{ service: 'yandex' }],
    description: 'Yandex web results: a third, independent view of the open web, including Russian-language pages',
    ask: {
      question: 'Would general web pages (news, articles, blogs, docs) help answer this request?',
      yes: 'The request is a general question, or asks for news, articles, coverage, docs or blog posts',
      no: 'The request only makes sense on a specific platform such as Reddit, GitHub, arXiv, YouTube or IMDb',
    },
    defaultOn: true,
  },
  {
    id: 'hackernews',
    label: 'Hacker News',
    lanes: [{ service: 'hackernews' }],
    description: 'Hacker News threads and comments',
    ask: {
      question: 'Would Hacker News threads fit this request?',
      yes: 'The request names Hacker News or HN, or asks what developers or the tech community are saying, their reactions, opinions or discussion about a technical topic',
      no: 'The request is a factual lookup, or is about something outside technology and startups',
    },
    defaultOn: false,
  },
  {
    id: 'reddit',
    label: 'Reddit',
    lanes: [{ service: 'reddit' }],
    description: 'Reddit posts and comment threads',
    ask: {
      question: 'Would Reddit threads fit this request?',
      yes: 'The request names Reddit or a subreddit, or asks what people are saying, their experiences, recommendations, opinions or discussion',
      no: 'The request is a factual lookup or asks for official sources, code, papers or videos',
    },
    defaultOn: false,
  },
  {
    id: 'github',
    label: 'GitHub',
    lanes: [{ service: 'github' }],
    description: 'GitHub repositories, issues, pull requests and releases',
    ask: {
      question: 'Is the user looking for code: repositories, releases, issues, pull requests or open source projects?',
      yes: 'The request names GitHub, or asks for repos, libraries, releases, issues, PRs, or open source tools',
      no: 'The request is about discussion, news or opinions rather than code',
    },
    defaultOn: false,
  },
  {
    id: 'x',
    label: 'X',
    lanes: [{ service: 'x' }],
    description: 'Posts on X (formerly Twitter)',
    ask: {
      question: 'Would posts on X (Twitter) fit this request?',
      yes: 'The request names X, Twitter or tweets, or asks what people are saying, their reactions, opinions or discussion about a product, launch, announcement, company or person, especially in tech and startups; launches and news break on X first',
      no: 'The request is a factual lookup, or asks for long-form content such as tutorials, papers or documentation',
    },
    defaultOn: false,
  },
  {
    id: 'arxiv',
    label: 'arXiv',
    lanes: [{ service: 'arxiv' }],
    description: 'Academic papers and preprints on arXiv',
    ask: {
      question: 'Is the user asking for academic papers, research or preprints?',
      yes: 'The request mentions papers, research, arXiv, studies or preprints',
      no: 'The request is not about academic research',
    },
    defaultOn: false,
  },
  {
    id: 'wikipedia',
    label: 'Wikipedia',
    lanes: [{ service: 'wikipedia', timeFilter: false }],
    description: 'Encyclopedia articles on Wikipedia',
    ask: {
      question: 'Is the user asking for encyclopedic facts, definitions, background or history?',
      yes: 'The request asks what or who something is, how it works, its history or background facts',
      no: 'The request asks for opinions, news, recent events, code, papers or videos',
    },
    defaultOn: false,
  },
  {
    id: 'imdb',
    label: 'IMDb',
    lanes: [{ service: 'imdb', timeFilter: false }],
    description: 'Movies, TV shows, actors and directors on IMDb',
    ask: {
      question: 'Is the user asking about a film, TV series, actor, director or other screen credit?',
      yes: 'The request names or describes a movie or show, or asks who acted in, directed or made one',
      no: 'The request is not about film or television',
    },
    defaultOn: false,
  },
  {
    id: 'wechat',
    label: 'WeChat',
    lanes: [{ service: 'wechat', timeFilter: false }],
    description: 'Articles from WeChat official accounts (微信公众号)',
    ask: {
      question: 'Would Chinese-language articles from WeChat official accounts (微信公众号) fit this request?',
      yes: 'The request mentions 微信, 公众号 or WeChat, or is written in Chinese and asks for articles, tutorials, analysis or opinions',
      no: 'The request is not in Chinese and does not mention WeChat',
    },
    defaultOn: false,
  },
  {
    id: 'youtube',
    label: 'YouTube',
    lanes: [{ service: 'youtube' }],
    description: 'Videos on YouTube',
    ask: {
      question: 'Is the user asking for videos?',
      yes: 'The request mentions videos, YouTube, talks, tutorials to watch, or channels',
      no: 'The request is not about video content',
    },
    defaultOn: false,
  },
];

export const DEFAULT_SOURCE_IDS = SOURCES.filter((s) => s.defaultOn).map((s) => s.id);

export const SOURCE_IDS = SOURCES.map((s) => s.id) as readonly SourceId[];

export function isSourceId(value: string): value is SourceId {
  return (SOURCE_IDS as readonly string[]).includes(value);
}

export function sourceById(id: SourceId): Source {
  const found = SOURCES.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown source: ${id}`);
  return found;
}

export type WindowId = 'any' | '24h' | '7d' | '30d';

export interface Window {
  id: WindowId;
  label: string;
  /** Infinity for no limit. */
  hours: number;
  /** Search1API `time_range` value; undefined sends no filter. */
  timeRange?: 'day' | 'week' | 'month';
  description: string;
}

export const WINDOWS: readonly Window[] = [
  {
    id: 'any',
    label: 'Any time',
    hours: Number.POSITIVE_INFINITY,
    description: 'The request does not ask for recent results; older, evergreen pages are fine',
  },
  {
    id: '24h',
    label: 'Past 24 hours',
    hours: 24,
    timeRange: 'day',
    description: 'Only things from today or the last day',
  },
  {
    id: '7d',
    label: 'Past week',
    hours: 24 * 7,
    timeRange: 'week',
    description: 'Things from the last several days, up to a week',
  },
  {
    id: '30d',
    label: 'Past month',
    hours: 24 * 30,
    timeRange: 'month',
    description: 'Things from the last few weeks, up to a month',
  },
];

export const DEFAULT_WINDOW: WindowId = 'any';

export function isWindowId(value: string): value is WindowId {
  return WINDOWS.some((w) => w.id === value);
}

export function windowById(id: WindowId): Window {
  const found = WINDOWS.find((w) => w.id === id);
  if (!found) throw new Error(`Unknown window: ${id}`);
  return found;
}
