import { SITE_ORIGIN } from './seo';

/** Browser-safe changelog helpers. The entries themselves load only on the server; see `changelog.ts`. */

export interface ChangelogEntry {
  slug: string;
  order: number;
  title: string;
  date: string;
  summary: string;
  tryQuery?: string;
  body: string;
}

/** What lists, cards and neighbour links need from an entry. */
export type ChangelogTeaser = Pick<ChangelogEntry, 'slug' | 'title' | 'date' | 'summary'>;

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; href: string };

export type Block =
  | { type: 'heading'; content: Inline[] }
  | { type: 'paragraph'; content: Inline[] }
  | { type: 'list'; items: Inline[][] };

export const CHANGELOG_URL = `${SITE_ORIGIN}/changelog`;
export const CHANGELOG_FEED_URL = `${SITE_ORIGIN}/changelog/rss.xml`;

export function entryUrl(entry: Pick<ChangelogEntry, 'slug'>): string {
  return `${CHANGELOG_URL}/${entry.slug}`;
}

export function toTeaser({ slug, title, date, summary }: ChangelogEntry): ChangelogTeaser {
  return { slug, title, date, summary };
}

/** "October 7, 2026", independent of the server's and the visitor's time zone. */
export function formatDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
  });
}

/** `**strong**`, `` `code` `` and `[text](href)`; everything else is plain text. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) out.push({ type: 'text', text: text.slice(last, match.index) });
    if (match[1] !== undefined) out.push({ type: 'strong', text: match[1] });
    else if (match[2] !== undefined) out.push({ type: 'code', text: match[2] });
    else out.push({ type: 'link', text: match[3]!, href: match[4]! });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

/** `## ` headings, `- ` lists and paragraphs separated by blank lines. */
export function parseBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of body.split(/\n\s*\n/)) {
    const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    if (lines.length === 1 && lines[0]!.startsWith('## ')) {
      blocks.push({ type: 'heading', content: parseInline(lines[0]!.slice(3)) });
    } else if (lines.every((line) => line.startsWith('- '))) {
      blocks.push({ type: 'list', items: lines.map((line) => parseInline(line.slice(2))) });
    } else {
      blocks.push({ type: 'paragraph', content: parseInline(lines.join(' ')) });
    }
  }
  return blocks;
}
