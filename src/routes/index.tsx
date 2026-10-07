import { Link, createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { EngineStrip, type EnginePreview } from '@/components/home-demos';
import { SearchBox } from '@/components/search-box';
import { WhatsNew } from '@/components/whats-new';
import { HOME_CANONICAL } from '@/lib/seo';
import { getLatestChange } from '@/server/changelog';

export const Route = createFileRoute('/')({
  loader: () => getLatestChange(),
  staleTime: Infinity,
  head: () => ({
    meta: [{ property: 'og:url', content: HOME_CANONICAL }],
    links: [{ rel: 'canonical', href: HOME_CANONICAL }],
  }),
  component: Home,
});

interface Example extends EnginePreview {
  q: string;
}

/**
 * Three requests that look nothing alike: a phrase with a source and a time,
 * a full question with only a source, and a bare topic with neither. Together
 * they say "write it any way you like" better than a template would. The
 * sources and windows are what Jev typically chooses for them, shown on hover
 * so the engine strip below can demonstrate the choice without an API call.
 */
const EXAMPLES: Example[] = [
  { q: 'Rust async runtimes on Hacker News this month', window: '30d', sources: ['hackernews', 'google'] },
  { q: 'What do Reddit users think of the Framework laptop?', window: 'any', sources: ['reddit', 'google'] },
  { q: 'New papers on speculative decoding', window: '30d', sources: ['arxiv', 'google'] },
];

/* design-structure: search-engine home · centered column, headline as the only voice, form as the CTA · footer=Ft2 */

function Home() {
  const latestChange = Route.useLoaderData();
  const [preview, setPreview] = useState<EnginePreview | null>(null);
  const [model, setModel] = useState('auto');

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 pb-12 pt-16 sm:py-20">
      <h1 className="vt-wordmark display text-center text-[clamp(2.75rem,6vw,4rem)] leading-none tracking-[-0.01em]">
        Jev <span className="text-primary">Search</span>
      </h1>
      <p className="mt-3 text-center text-[15px] text-muted-foreground sm:mt-4 sm:text-lg">
        Picks where to search. Ranks what comes back.
      </p>
      <div className="mt-7 w-full sm:mt-8">
        <SearchBox autoFocus onModelChange={setModel} />
      </div>
      <ul aria-label="Example searches" className="mt-4 w-full px-4 text-[15px] sm:text-sm">
        {EXAMPLES.map((example) => (
          <li key={example.q}>
            <Link
              className="inline-block min-h-11 py-2.5 text-muted-foreground hover:text-foreground hover:underline sm:min-h-10 sm:py-2"
              onBlur={() => setPreview(null)}
              onFocus={() => setPreview(example)}
              onMouseEnter={() => setPreview(example)}
              onMouseLeave={() => setPreview(null)}
              search={{ q: example.q, m: model === 'auto' ? undefined : model }}
              to="/search"
              viewTransition
            >
              {example.q}
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-9 sm:mt-10">
        <EngineStrip preview={preview} />
      </div>
      {latestChange && <WhatsNew change={latestChange} />}
    </main>
  );
}
