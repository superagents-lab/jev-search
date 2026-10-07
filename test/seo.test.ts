import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HOME_CANONICAL, SEARCH_ROBOTS, SITE_ORIGIN, SITEMAP_URL } from '@/lib/seo';

describe('crawl directives', () => {
  const robots = readFileSync('public/robots.txt', 'utf8');

  it('advertises a sitemap and does not hide /search from crawlers', () => {
    expect(robots).toContain(`Sitemap: ${SITEMAP_URL}`);
    expect(robots).toMatch(/^User-agent: \*$/m);
    expect(robots).toContain('Allow: /');
    expect(robots).toContain('Disallow: /api/');
    expect(robots).not.toMatch(/Disallow:\s*\/search/);
  });

  it('serves the sitemap from its route; a static copy would shadow it', () => {
    expect(existsSync('public/sitemap.xml')).toBe(false);
    expect(readFileSync('src/routes/sitemap[.]xml.ts', 'utf8')).toContain('sitemapXml()');
    expect(HOME_CANONICAL.startsWith(SITE_ORIGIN)).toBe(true);
  });

  it('wires those directives onto the routes', () => {
    const home = readFileSync('src/routes/index.tsx', 'utf8');
    const search = readFileSync('src/routes/search.tsx', 'utf8');
    expect(home).toContain('rel: \'canonical\'');
    expect(home).toContain('HOME_CANONICAL');
    expect(search).toContain('SEARCH_ROBOTS');
    expect(search).toContain('HOME_CANONICAL');
  });
});
