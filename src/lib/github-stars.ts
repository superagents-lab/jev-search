import type { ResultCache } from './cache';

export const REPOSITORY = 'superagents-lab/jev-search';
export const REPOSITORY_URL = `https://github.com/${REPOSITORY}`;

const CACHE_KEY = `github-stars|${REPOSITORY}`;
const CACHE_TTL_SECONDS = 60 * 60;
/** A failed lookup is remembered briefly so a GitHub outage or rate limit is not retried on every page view. */
const FAILURE_TTL_SECONDS = 10 * 60;
const FAILURE = 'unavailable';
/** Pages wait for this on a cache miss, so keep it short; the button falls back to the plain icon. */
const FETCH_TIMEOUT_MS = 1500;

/** 514 → "514", 1250 → "1.2k", 12800 → "12k". Rounds down so the count is never overstated. */
export function formatStars(stars: number): string {
  if (stars < 1000) return String(stars);
  if (stars < 10_000) return `${(Math.floor(stars / 100) / 10).toFixed(1).replace(/\.0$/, '')}k`;
  return `${Math.floor(stars / 1000)}k`;
}

function parseStars(value: string): number | null {
  const stars = Number(value);
  return Number.isInteger(stars) && stars >= 0 ? stars : null;
}

/** The repository's star count from GitHub, cached; null when GitHub cannot be reached. Never throws. */
export async function repositoryStars(deps: {
  cache?: ResultCache;
  token?: string;
  fetch?: typeof fetch;
}): Promise<number | null> {
  try {
    const hit = await deps.cache?.get(CACHE_KEY);
    if (hit === FAILURE) return null;
    if (hit) {
      const stars = parseStars(hit);
      if (stars !== null) return stars;
    }
  } catch {
    // A broken cache must never break a page.
  }

  let stars: number | null = null;
  try {
    const response = await (deps.fetch ?? fetch)(`https://api.github.com/repos/${REPOSITORY}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'jev-search',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(deps.token ? { Authorization: `Bearer ${deps.token}` } : {}),
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.ok) {
      const body = (await response.json()) as { stargazers_count?: unknown };
      stars = typeof body.stargazers_count === 'number' ? parseStars(String(body.stargazers_count)) : null;
    } else {
      await response.body?.cancel().catch(() => undefined);
    }
  } catch {
    stars = null;
  }

  await deps.cache
    ?.put(CACHE_KEY, stars === null ? FAILURE : String(stars), {
      expirationTtl: stars === null ? FAILURE_TTL_SECONDS : CACHE_TTL_SECONDS,
    })
    .catch(() => undefined);
  return stars;
}
