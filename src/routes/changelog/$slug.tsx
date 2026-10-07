import { Link, createFileRoute, notFound } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, Search } from 'lucide-react';
import { ChangelogBody } from '@/components/changelog-body';
import { PageHeader } from '@/components/page-header';
import { CHANGELOG_URL, entryUrl, formatDate } from '@/lib/changelog-shared';
import { SITE_ORIGIN } from '@/lib/seo';
import { getChangelogEntry } from '@/server/changelog';

export const Route = createFileRoute('/changelog/$slug')({
  loader: async ({ params }) => {
    const page = await getChangelogEntry({ data: params.slug });
    if (!page) throw notFound();
    return page;
  },
  staleTime: Infinity,
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { entry } = loaderData;
    const title = `${entry.title} · Jev Search changelog`;
    const url = entryUrl(entry);
    return {
      meta: [
        { title },
        { name: 'description', content: entry.summary },
        { property: 'og:type', content: 'article' },
        { property: 'og:url', content: url },
        { property: 'og:title', content: entry.title },
        { property: 'og:description', content: entry.summary },
        { property: 'article:published_time', content: entry.date },
        { name: 'twitter:title', content: entry.title },
        { name: 'twitter:description', content: entry.summary },
      ],
      links: [{ rel: 'canonical', href: url }],
      scripts: [
        {
          type: 'application/ld+json',
          children: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: entry.title,
            description: entry.summary,
            datePublished: entry.date,
            mainEntityOfPage: url,
            url,
            author: { '@type': 'Organization', name: 'Search1API', url: 'https://www.search1api.com' },
            publisher: { '@type': 'Organization', name: 'Search1API', url: 'https://www.search1api.com' },
            isPartOf: { '@type': 'Blog', name: 'Jev Search changelog', url: CHANGELOG_URL },
            image: `${SITE_ORIGIN}/og-home.png`,
          }),
        },
      ],
    };
  },
  component: ChangelogEntryPage,
});

function ChangelogEntryPage() {
  const { entry, newer, older } = Route.useLoaderData();

  return (
    <>
      <PageHeader />
      <main className="mx-auto w-full max-w-2xl px-4 pb-20 pt-10 sm:pt-14">
        <Link
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          to="/changelog"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          Changelog
        </Link>
        <article className="mt-4">
          <time className="text-sm tabular-nums text-muted-foreground" dateTime={entry.date}>
            {formatDate(entry.date)}
          </time>
          <h1 className="display mt-2 text-[clamp(2rem,5vw,2.75rem)] leading-[1.1] tracking-[-0.01em]">{entry.title}</h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{entry.summary}</p>
          <div className="mt-8 border-t pt-4 leading-7 text-foreground/90">
            <ChangelogBody body={entry.body} />
          </div>
          {entry.tryQuery && (
            <Link
              className="mt-10 flex min-h-11 items-center gap-3 rounded-2xl border border-primary/25 bg-accent/60 px-4 py-3 text-foreground/90 transition-colors hover:border-primary/50 hover:bg-accent"
              search={{ q: entry.tryQuery }}
              to="/search"
            >
              <Search aria-hidden className="size-4 shrink-0 text-primary-text" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-muted-foreground">Try it</span>
                <span className="block">{entry.tryQuery}</span>
              </span>
              <ArrowRight aria-hidden className="size-4 shrink-0" />
            </Link>
          )}
        </article>

        <nav aria-label="More changes" className="mt-14 grid gap-3 border-t pt-6 text-sm sm:grid-cols-2">
          {older ? (
            <Link className="group block rounded-xl py-1" params={{ slug: older.slug }} to="/changelog/$slug">
              <span className="text-muted-foreground">Previous</span>
              <span className="mt-0.5 block font-medium group-hover:text-primary-text group-hover:underline">{older.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {newer && (
            <Link className="group block rounded-xl py-1 sm:text-right" params={{ slug: newer.slug }} to="/changelog/$slug">
              <span className="text-muted-foreground">Next</span>
              <span className="mt-0.5 block font-medium group-hover:text-primary-text group-hover:underline">{newer.title}</span>
            </Link>
          )}
        </nav>
      </main>
    </>
  );
}
