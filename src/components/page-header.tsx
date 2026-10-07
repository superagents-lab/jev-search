import { RepositoryLink } from '@/components/repository-link';
import { SponsorLink } from '@/components/sponsor-link';
import { ThemeToggle } from '@/components/theme-toggle';
import { Wordmark } from '@/components/wordmark';

/** Header for content pages: the wordmark back to search, and the same icon cluster as the search page. */
export function PageHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <Wordmark size="sm" />
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <SponsorLink />
          <RepositoryLink />
        </div>
      </div>
    </header>
  );
}
