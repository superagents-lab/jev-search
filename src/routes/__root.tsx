import { HeadContent, Link, Scripts, createRootRoute, useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { PwaRegister } from '@/components/pwa-register';
import { RepositoryLink } from '@/components/repository-link';
import { SourceIcon } from '@/components/source-icon';
import { SponsorLink } from '@/components/sponsor-link';
import { THEME_SURFACE, ThemeToggle, themeScript } from '@/components/theme-toggle';
import { SHARE_IMAGE } from '@/lib/seo';
import { cn } from '@/lib/utils';
import appCss from '../styles.css?url';

const TITLE = 'Jev Search — Picks where to search. Ranks what comes back.';
const DESCRIPTION = "TypeSafe's Jev reads your question, selects sources, time ranges and search terms, and ranks the results. No generated answers.";
const SHARE_IMAGE_ALT = 'Jev Search homepage with a model selector, example queries and supported search engines.';
const WEB_ANALYTICS_BEACON = JSON.stringify({ token: '6d6e9cf679fe45cb8ce7143deb36a0c2' });

export const Route = createRootRoute({
  head: () => ({
    links: [
      { href: appCss, rel: 'stylesheet' },
      { href: '/favicon.png', rel: 'icon', type: 'image/png', sizes: '400x400' },
      { href: '/apple-touch-icon.png?v=typesafe', rel: 'apple-touch-icon', sizes: '400x400' },
      { href: '/manifest.webmanifest', rel: 'manifest' },
      { href: 'https://fonts.googleapis.com', rel: 'preconnect' },
      { href: 'https://fonts.gstatic.com', rel: 'preconnect', crossOrigin: 'anonymous' },
      {
        href: 'https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap',
        rel: 'stylesheet',
      },
    ],
    meta: [
      { charSet: 'utf-8' },
      { content: 'width=device-width, initial-scale=1', name: 'viewport' },
      { title: TITLE },
      { name: 'description', content: DESCRIPTION },
      { name: 'mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-title', content: 'Jev Search' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Jev Search' },
      { property: 'og:title', content: TITLE },
      { property: 'og:description', content: DESCRIPTION },
      { property: 'og:image', content: SHARE_IMAGE },
      { property: 'og:image:type', content: 'image/png' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: SHARE_IMAGE_ALT },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: TITLE },
      { name: 'twitter:description', content: DESCRIPTION },
      { name: 'twitter:image', content: SHARE_IMAGE },
      { name: 'twitter:image:alt', content: SHARE_IMAGE_ALT },
    ],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
});

function NotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">Nothing here</h1>
      <p className="mt-2 text-muted-foreground">That page does not exist.</p>
      <Link className="mt-6 inline-block text-link underline" to="/">
        Back to search
      </Link>
    </main>
  );
}

function RootDocument({ children }: { readonly children: ReactNode }) {
  const isHome = useRouterState({ select: (state) => state.location.pathname === '/' });

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta content={THEME_SURFACE.light} name="theme-color" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <HeadContent />
      </head>
      <body className="min-h-dvh flex flex-col">
        {isHome && (
          <div className="absolute right-4 top-4 flex items-center gap-1 sm:right-6">
            <ThemeToggle />
            <RepositoryLink />
            <SponsorLink />
          </div>
        )}
        <div className="flex flex-1 flex-col">{children}</div>
        {/* Two things with different jobs: where to go next (content, above the
            rule, home only: results are where to go next on the search page)
            and who did what to the query (one credit line, below it). */}
        <footer className="text-xs text-muted-foreground">
          {isHome && (
            <nav
              aria-label="Jev community"
              className="mx-auto flex max-w-5xl items-center justify-center gap-x-6 px-4 pb-2 text-sm"
            >
              <a
                className="inline-flex min-h-11 items-center gap-1.5 text-foreground/80 hover:text-primary-text hover:underline"
                href="https://github.com/fatwang2/awesome-jev"
                rel="noreferrer"
                target="_blank"
                title="Projects built with Jev"
              >
                <SourceIcon className="size-3.5" id="github" />
                Showcase
              </a>
              <a
                className="inline-flex min-h-11 items-center gap-1.5 text-foreground/80 hover:text-primary-text hover:underline"
                href="https://www.reddit.com/r/typesafe_jev/"
                rel="noreferrer"
                target="_blank"
                title="r/typesafe_jev on Reddit"
              >
                <SourceIcon className="size-3.5" id="reddit" />
                Community
              </a>
            </nav>
          )}
          <div className="border-t">
            <p className={cn('mx-auto max-w-5xl px-4 py-4 leading-relaxed', isHome && 'text-center')}>
              <span className="block sm:inline">
                Judgment by{' '}
                <a className="text-foreground/80 hover:underline" href="https://typesafe.ai" rel="noreferrer" target="_blank">
                  Jev
                </a>
                {' · '}Search by{' '}
                <a className="text-foreground/80 hover:underline" href="https://www.search1api.com" rel="noreferrer" target="_blank">
                  Search1API
                </a>
              </span>
              <span className="hidden sm:inline">{' · '}</span>
              <span className="block sm:inline">No generated answers</span>
            </p>
          </div>
        </footer>
        <Scripts />
        <PwaRegister />
        <script
          data-cf-beacon={WEB_ANALYTICS_BEACON}
          src="https://static.cloudflareinsights.com/beacon.min.js"
          type="module"
        />
      </body>
    </html>
  );
}
