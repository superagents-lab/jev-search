import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RepositoryLinkView } from '@/components/repository-link';
import { memoryCache } from '@/lib/cache';
import { formatStars, repositoryStars } from '@/lib/github-stars';

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('formatStars', () => {
  it.each([
    [0, '0'],
    [514, '514'],
    [999, '999'],
    [1000, '1k'],
    [1250, '1.2k'],
    [1999, '1.9k'],
    [12_800, '12k'],
  ])('formats %i as %s', (stars, label) => {
    expect(formatStars(stars)).toBe(label);
  });
});

describe('repositoryStars', () => {
  it('asks GitHub once and serves the cached count afterwards', async () => {
    const cache = memoryCache();
    const fetch = vi.fn(async () => json(200, { stargazers_count: 514 }));
    expect(await repositoryStars({ cache, fetch })).toBe(514);
    expect(await repositoryStars({ cache, fetch })).toBe(514);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/superagents-lab/jev-search');
    expect(new Headers(init.headers).get('user-agent')).toBe('jev-search');
    expect(new Headers(init.headers).has('authorization')).toBe(false);
  });

  it('sends the optional token', async () => {
    const fetch = vi.fn(async () => json(200, { stargazers_count: 1 }));
    await repositoryStars({ token: 'ghp_test', fetch });
    const [, init] = fetch.mock.calls[0]! as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer ghp_test');
  });

  it.each([
    ['a rate limit', async () => json(403, { message: 'API rate limit exceeded' })],
    ['a malformed body', async () => json(200, { stargazers_count: 'many' })],
    ['a network failure', async () => { throw new TypeError('fetch failed'); }],
  ])('returns null and remembers %s briefly', async (_, handler) => {
    const cache = memoryCache();
    const put = vi.spyOn(cache, 'put');
    const fetch = vi.fn(handler);
    expect(await repositoryStars({ cache, fetch })).toBeNull();
    expect(await repositoryStars({ cache, fetch })).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith(expect.any(String), 'unavailable', { expirationTtl: 600 });
  });

  it('still answers when the cache is broken', async () => {
    const cache = { get: async () => { throw new Error('KV down'); }, put: async () => { throw new Error('KV down'); } };
    expect(await repositoryStars({ cache, fetch: async () => json(200, { stargazers_count: 7 }) })).toBe(7);
  });
});

describe('RepositoryLinkView', () => {
  it('shows the count in a pill with an accessible label', () => {
    const html = renderToStaticMarkup(createElement(RepositoryLinkView, { stars: 1250 }));
    expect(html).toContain('aria-label="Star Jev Search on GitHub, 1250 stars (opens in a new tab)"');
    expect(html).toContain('>1.2k</span>');
    expect(html).toContain('href="https://github.com/superagents-lab/jev-search"');
  });

  it('falls back to the plain icon without a count', () => {
    const html = renderToStaticMarkup(createElement(RepositoryLinkView, { stars: null }));
    expect(html).toContain('aria-label="Jev Search source code on GitHub (opens in a new tab)"');
    expect(html).not.toContain('Star Jev Search');
  });
});
