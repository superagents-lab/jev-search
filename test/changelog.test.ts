import { describe, expect, it } from 'vitest';
import {
  CHANGELOG,
  formatDate,
  parseBlocks,
  parseEntry,
  parseInline,
  rssXml,
  sitemapXml,
  sortEntries,
} from '@/lib/changelog';
import { HOME_CANONICAL, SITE_ORIGIN } from '@/lib/seo';

const source = (fields: string, body = 'Body.') => `---\n${fields}\n---\n${body}\n`;

describe('parseEntry', () => {
  it('reads the order and slug from the file name and the rest from front matter', () => {
    const entry = parseEntry(
      '/content/changelog/0009-gpt-6-luna.md',
      source('title: A: title with a colon\ndate: 2026-10-07\nsummary: Short.\ntry: Bun this month', 'Line one.\n')
    );
    expect(entry).toEqual({
      slug: 'gpt-6-luna',
      order: 9,
      title: 'A: title with a colon',
      date: '2026-10-07',
      summary: 'Short.',
      tryQuery: 'Bun this month',
      body: 'Line one.',
    });
  });

  it('accepts CRLF files and omits an absent try query', () => {
    const entry = parseEntry('/c/0001-x.md', '---\r\ntitle: T\r\ndate: 2026-09-18\r\nsummary: S\r\n---\r\nB\r\n');
    expect(entry.tryQuery).toBeUndefined();
    expect(entry.body).toBe('B');
  });

  it.each([
    ['/c/launch.md', source('title: T\ndate: 2026-09-18\nsummary: S'), /NNNN-slug/],
    ['/c/0001-Bad_Slug.md', source('title: T\ndate: 2026-09-18\nsummary: S'), /NNNN-slug/],
    ['/c/0001-x.md', 'no front matter', /front matter/],
    ['/c/0001-x.md', source('date: 2026-09-18\nsummary: S'), /missing title/],
    ['/c/0001-x.md', source('title: T\ndate: 18/09/2026\nsummary: S'), /YYYY-MM-DD/],
    ['/c/0001-x.md', source('title: T\ndate: 2026-02-31x\nsummary: S'), /YYYY-MM-DD/],
  ])('rejects %s', (path, text, error) => {
    expect(() => parseEntry(path, text)).toThrow(error);
  });
});

describe('sortEntries', () => {
  it('puts the newest date first and breaks ties with the file order', () => {
    const make = (slug: string, date: string, order: number) => ({ slug, date, order, title: slug, summary: slug, body: '' });
    const sorted = sortEntries([make('a', '2026-09-18', 1), make('c', '2026-10-07', 9), make('d', '2026-10-07', 10)]);
    expect(sorted.map((entry) => entry.slug)).toEqual(['d', 'c', 'a']);
  });
});

describe('Markdown subset', () => {
  it('parses strong, code and links inside text', () => {
    expect(parseInline('Use **Auto** or `m=jev`, see [docs](https://x.dev/a_b).')).toEqual([
      { type: 'text', text: 'Use ' },
      { type: 'strong', text: 'Auto' },
      { type: 'text', text: ' or ' },
      { type: 'code', text: 'm=jev' },
      { type: 'text', text: ', see ' },
      { type: 'link', text: 'docs', href: 'https://x.dev/a_b' },
      { type: 'text', text: '.' },
    ]);
  });

  it('keeps HTML as text instead of markup', () => {
    expect(parseInline('<script>alert(1)</script>')).toEqual([{ type: 'text', text: '<script>alert(1)</script>' }]);
  });

  it('splits headings, lists and wrapped paragraphs', () => {
    const blocks = parseBlocks('## Heading\n\nOne\ntwo.\n\n- a\n- **b**');
    expect(blocks.map((block) => block.type)).toEqual(['heading', 'paragraph', 'list']);
    expect(blocks[1]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'One two.' }] });
    expect(blocks[2]).toEqual({ type: 'list', items: [[{ type: 'text', text: 'a' }], [{ type: 'strong', text: 'b' }]] });
  });
});

describe('committed changelog', () => {
  it('has entries with unique slugs and orders, newest first', () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
    expect(new Set(CHANGELOG.map((entry) => entry.slug)).size).toBe(CHANGELOG.length);
    expect(new Set(CHANGELOG.map((entry) => entry.order)).size).toBe(CHANGELOG.length);
    expect(sortEntries(CHANGELOG)).toEqual(CHANGELOG);
  });

  it.each(CHANGELOG.map((entry) => [entry.slug, entry] as const))('%s fits search snippets', (_slug, entry) => {
    expect(entry.title.length).toBeLessThanOrEqual(90);
    expect(entry.summary.length).toBeGreaterThanOrEqual(50);
    expect(entry.summary.length).toBeLessThanOrEqual(200);
    expect(entry.body.length).toBeGreaterThan(200);
  });

  it('formats dates in UTC', () => {
    expect(formatDate('2026-10-07')).toBe('October 7, 2026');
  });
});

describe('feeds', () => {
  it('lists the homepage, the changelog and every entry in the sitemap, never search or API URLs', () => {
    const sitemap = sitemapXml();
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(locs).toEqual([
      HOME_CANONICAL,
      `${SITE_ORIGIN}/changelog`,
      ...CHANGELOG.map((entry) => `${SITE_ORIGIN}/changelog/${entry.slug}`),
    ]);
    expect(sitemap).not.toContain(`${SITE_ORIGIN}/search`);
    expect(sitemap).not.toContain('/api/');
    expect(sitemap).toContain(`<lastmod>${CHANGELOG[0]!.date}</lastmod>`);
  });

  it('escapes entry text in RSS', () => {
    const rss = rssXml([{ slug: 'x', order: 1, date: '2026-10-07', title: 'A & B <C>', summary: "It's", body: '' }]);
    expect(rss).toContain('<title>A &amp; B &lt;C&gt;</title>');
    expect(rss).toContain('<description>It&apos;s</description>');
    expect(rss).toContain('<pubDate>Wed, 07 Oct 2026 00:00:00 GMT</pubDate>');
    expect(rss).toContain(`<link>${SITE_ORIGIN}/changelog/x</link>`);
  });
});
