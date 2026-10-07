import {
  CHANGELOG_FEED_URL,
  CHANGELOG_URL,
  entryUrl,
  type ChangelogEntry,
} from './changelog-shared';
import { SITE_ORIGIN } from './seo';

export * from './changelog-shared';

/**
 * Server-side changelog: entries live in `content/changelog/NNNN-slug.md`, a
 * numeric prefix for order, a slug for the URL, and a small front matter block:
 *
 *   ---
 *   title: GPT-6 Luna joins the model selector
 *   date: 2026-10-07
 *   summary: One or two sentences, also used as the meta description.
 *   try: Optional example search linked at the end of the entry
 *   ---
 *
 * The body is a Markdown subset; see `parseBlocks`. Routes reach this module
 * through server functions only, because the eager import below would put
 * every entry into the browser bundle.
 */

const FILE_NAME = /(?:^|\/)(\d+)-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseEntry(path: string, source: string): ChangelogEntry {
  const name = FILE_NAME.exec(path);
  if (!name) throw new Error(`${path}: expected NNNN-slug.md`);
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source.replace(/\r\n/g, '\n'));
  if (!match) throw new Error(`${path}: missing front matter`);

  const fields = new Map<string, string>();
  for (const line of match[1]!.split('\n')) {
    if (!line.trim()) continue;
    const colon = line.indexOf(':');
    if (colon < 1) throw new Error(`${path}: bad front matter line "${line}"`);
    fields.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }
  const required = (key: string) => {
    const value = fields.get(key);
    if (!value) throw new Error(`${path}: missing ${key}`);
    return value;
  };

  const date = required('date');
  if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(date))) throw new Error(`${path}: date must be YYYY-MM-DD`);
  return {
    slug: name[2]!,
    order: Number(name[1]),
    title: required('title'),
    date,
    summary: required('summary'),
    tryQuery: fields.get('try') || undefined,
    body: match[2]!.trim(),
  };
}

/** Newest first. The file prefix orders entries that share a date. */
export function sortEntries(entries: ChangelogEntry[]): ChangelogEntry[] {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.order - a.order);
}

const files = import.meta.glob<string>('/content/changelog/*.md', { query: '?raw', import: 'default', eager: true });

export const CHANGELOG: ChangelogEntry[] = sortEntries(
  Object.entries(files).map(([path, source]) => parseEntry(path, source))
);

export function findEntry(slug: string): ChangelogEntry | undefined {
  return CHANGELOG.find((entry) => entry.slug === slug);
}

function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

export function sitemapXml(entries: ChangelogEntry[] = CHANGELOG): string {
  const urls = [
    { loc: `${SITE_ORIGIN}/` },
    { loc: CHANGELOG_URL, lastmod: entries[0]?.date },
    ...entries.map((entry) => ({ loc: entryUrl(entry), lastmod: entry.date })),
  ];
  const body = urls
    .map(({ loc, lastmod }) => `  <url>\n    <loc>${escapeXml(loc)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export function rssXml(entries: ChangelogEntry[] = CHANGELOG): string {
  const items = entries
    .map((entry) => {
      const url = escapeXml(entryUrl(entry));
      return [
        '    <item>',
        `      <title>${escapeXml(entry.title)}</title>`,
        `      <link>${url}</link>`,
        `      <guid isPermaLink="true">${url}</guid>`,
        `      <pubDate>${new Date(`${entry.date}T00:00:00Z`).toUTCString()}</pubDate>`,
        `      <description>${escapeXml(entry.summary)}</description>`,
        '    </item>',
      ].join('\n');
    })
    .join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    '    <title>Jev Search changelog</title>',
    `    <link>${CHANGELOG_URL}</link>`,
    `    <atom:link href="${CHANGELOG_FEED_URL}" rel="self" type="application/rss+xml" />`,
    '    <description>Notable changes to Jev Search, newest first.</description>',
    '    <language>en</language>',
    items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
