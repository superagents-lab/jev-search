import { Link, createFileRoute } from '@tanstack/react-router';
import { Rss } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { CHANGELOG_FEED_URL, CHANGELOG_URL, formatDate } from '@/lib/changelog-shared';
import { getChangelog } from '@/server/changelog';

const TITLE = 'Changelog · Jev Search';
const DESCRIPTION =
  'Notable changes to Jev Search, the open-source search engine where a decision model chooses sources and ranks results: new models, sources, privacy changes and the Ask API.';

export const Route = createFileRoute('/changelog/')({
  loader: () => getChangelog(),
  staleTime: Infinity,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: 'description', content: DESCRIPTION },
      { property: 'og:url', content: CHANGELOG_URL },
      { property: 'og:title', content: TITLE },
      { property: 'og:description', content: DESCRIPTION },
      { name: 'twitter:title', content: TITLE },
      { name: 'twitter:description', content: DESCRIPTION },
    ],
    links: [
      { rel: 'canonical', href: CHANGELOG_URL },
      { rel: 'alternate', type: 'application/rss+xml', title: 'Jev Search changelog', href: CHANGELOG_FEED_URL },
    ],
  }),
  component: ChangelogIndex,
});

function ChangelogIndex() {
  const entries = Route.useLoaderData();
  return (
    <>
      <PageHeader />
      <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-12 sm:pt-16">
        <h1 className="display text-[clamp(2.5rem,6vw,3.5rem)] leading-none tracking-[-0.01em]">Changelog</h1>
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground sm:text-lg">
          What changed in Jev Search, and why.
          <a
            className="inline-flex min-h-11 items-center gap-1.5 text-sm text-foreground/80 hover:text-primary-text hover:underline"
            href="/changelog/rss.xml"
          >
            <Rss aria-hidden className="size-3.5" />
            RSS
          </a>
        </p>

        <ol className="mt-10 border-l border-border sm:mt-12">
          {entries.map((entry) => (
            <li className="relative pb-10 pl-6 last:pb-0 sm:pl-8" key={entry.slug}>
              <span aria-hidden className="absolute -left-[5px] top-1.5 size-[9px] rounded-full border-2 border-background bg-primary" />
              <time className="text-sm tabular-nums text-muted-foreground" dateTime={entry.date}>
                {formatDate(entry.date)}
              </time>
              <h2 className="mt-1 text-lg font-semibold leading-snug sm:text-xl">
                <Link
                  className="hover:text-primary-text hover:underline"
                  params={{ slug: entry.slug }}
                  to="/changelog/$slug"
                >
                  {entry.title}
                </Link>
              </h2>
              <p className="mt-2 leading-relaxed text-muted-foreground">{entry.summary}</p>
            </li>
          ))}
        </ol>
      </main>
    </>
  );
}
