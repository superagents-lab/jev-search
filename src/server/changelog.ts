import { createServerFn } from '@tanstack/react-start';
import { toTeaser, type ChangelogEntry, type ChangelogTeaser } from '@/lib/changelog-shared';

/*
 * Changelog data for routes. Each handler imports the entries lazily: a
 * top-level import would keep the eagerly loaded Markdown in the browser
 * bundle, which then downloads every entry on every page.
 */

export const getLatestChange = createServerFn({ method: 'GET' }).handler(async (): Promise<ChangelogTeaser | null> => {
  const { CHANGELOG } = await import('@/lib/changelog');
  return CHANGELOG[0] ? toTeaser(CHANGELOG[0]) : null;
});

export const getChangelog = createServerFn({ method: 'GET' }).handler(async (): Promise<ChangelogTeaser[]> => {
  const { CHANGELOG } = await import('@/lib/changelog');
  return CHANGELOG.map(toTeaser);
});

export interface ChangelogPage {
  entry: ChangelogEntry;
  newer?: ChangelogTeaser;
  older?: ChangelogTeaser;
}

export const getChangelogEntry = createServerFn({ method: 'GET' })
  .inputValidator((slug: string) => slug)
  .handler(async ({ data: slug }): Promise<ChangelogPage | null> => {
    const { CHANGELOG } = await import('@/lib/changelog');
    const index = CHANGELOG.findIndex((entry) => entry.slug === slug);
    if (index < 0) return null;
    const newer = CHANGELOG[index - 1];
    const older = CHANGELOG[index + 1];
    return {
      entry: CHANGELOG[index]!,
      ...(newer ? { newer: toTeaser(newer) } : {}),
      ...(older ? { older: toTeaser(older) } : {}),
    };
  });
