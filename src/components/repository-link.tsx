import { rootRouteId, useLoaderData } from '@tanstack/react-router';
import { Star } from 'lucide-react';
import { SourceIcon } from '@/components/source-icon';
import { formatStars, REPOSITORY_URL } from '@/lib/github-stars';

/** The GitHub link, showing the star count loaded with the page when GitHub answered. */
export function RepositoryLink() {
  const stars = useLoaderData({ from: rootRouteId });
  return <RepositoryLinkView stars={stars} />;
}

export function RepositoryLinkView({ stars }: { stars: number | null }) {
  if (stars === null) {
    return (
      <a
        aria-label="Jev Search source code on GitHub (opens in a new tab)"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
        href={REPOSITORY_URL}
        rel="noreferrer"
        target="_blank"
        title="Jev Search on GitHub"
      >
        <SourceIcon id="github" className="size-5" />
      </a>
    );
  }

  // The 44px link keeps the touch target; the visible pill inside it is smaller.
  // Below 380px the star glyph is dropped so the search header stays on one row.
  return (
    <a
      aria-label={`Star Jev Search on GitHub, ${stars} ${stars === 1 ? 'star' : 'stars'} (opens in a new tab)`}
      className="group inline-flex h-11 shrink-0 items-center px-0.5 focus-visible:outline-none"
      href={REPOSITORY_URL}
      rel="noreferrer"
      target="_blank"
      title="Star Jev Search on GitHub"
    >
      <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background/60 pl-2.5 pr-3 text-sm font-medium text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:bg-accent group-hover:text-foreground group-focus-visible:ring-2 group-focus-visible:ring-ring/60">
        <SourceIcon id="github" className="size-4" />
        <Star
          aria-hidden
          className="size-3.5 transition-colors group-hover:fill-primary group-hover:text-primary max-[379px]:hidden"
        />
        <span className="tabular-nums">{formatStars(stars)}</span>
      </span>
    </a>
  );
}
