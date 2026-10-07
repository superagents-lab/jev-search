import { Link } from '@tanstack/react-router';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatDate, type ChangelogTeaser } from '@/lib/changelog-shared';
import { cn } from '@/lib/utils';

const DISMISSED_KEY = 'jev-whats-new-dismissed';

/** Footer element the launcher is portalled into, so it sits level with the footer links. */
export const WHATS_NEW_SLOT_ID = 'whats-new-slot';

type View = 'hidden' | 'card' | 'launcher';

/**
 * Bottom-left announcement of the newest changelog entry. It opens by itself
 * once per entry; closing it (or reading the entry) stores that entry's slug
 * and leaves a small "What's new" launcher, level with the footer links, that
 * reopens the card. The server renders the card hidden, keeping its links in
 * the HTML; the client picks the view once it can read localStorage.
 */
export function WhatsNew({ change }: { change: ChangelogTeaser }) {
  const [view, setView] = useState<View>('hidden');
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setSlot(document.getElementById(WHATS_NEW_SLOT_ID));
  }, []);

  useEffect(() => {
    let dismissed: string | null = null;
    try { dismissed = localStorage.getItem(DISMISSED_KEY); } catch {}
    if (dismissed === change.slug) {
      setView('launcher');
      return;
    }
    const timer = setTimeout(() => setView('card'), 900);
    return () => clearTimeout(timer);
  }, [change.slug]);

  const collapse = () => {
    setView('launcher');
    try { localStorage.setItem(DISMISSED_KEY, change.slug); } catch { /* Closing still works without storage. */ }
  };

  const card = view === 'card';
  const launcher = view === 'launcher';

  return (
    <>
      {slot &&
        createPortal(
          <button
            aria-hidden={!launcher}
            className={cn(
              'inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm text-foreground/80 transition-opacity duration-300 hover:text-primary-text hover:underline motion-reduce:transition-none',
              !launcher && 'pointer-events-none opacity-0'
            )}
            inert={!launcher}
            onClick={() => setView('card')}
            type="button"
          >
            <Sparkles aria-hidden className="size-3.5 text-primary" />
            <span className="max-sm:sr-only">What's new</span>
          </button>,
          slot
        )}

      <aside
        aria-hidden={!card}
        aria-label="What's new"
        className={cn(
          'fixed inset-x-3 bottom-3 z-20 transition-[opacity,translate] duration-500 ease-out motion-reduce:transition-none sm:inset-x-auto sm:bottom-6 sm:left-6 sm:w-80',
          !card && 'pointer-events-none translate-y-3 opacity-0'
        )}
        data-open={card}
        inert={!card}
      >
        <div className="relative rounded-2xl border bg-background/95 p-4 shadow-[0_12px_40px_-12px_rgb(0_0_0/0.25)] backdrop-blur">
          <button
            aria-label="Close"
            className="absolute right-1.5 top-1.5 inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={collapse}
            type="button"
          >
            <X aria-hidden className="size-4" />
          </button>
          <p className="flex items-center gap-2 pr-8 text-xs text-muted-foreground">
            <span className="rounded-full bg-primary px-2 py-0.5 font-medium text-primary-foreground">What's new</span>
            <time dateTime={change.date}>{formatDate(change.date)}</time>
          </p>
          <Link
            className="mt-2.5 block pr-2 font-semibold leading-snug hover:text-primary-text hover:underline"
            onClick={collapse}
            params={{ slug: change.slug }}
            to="/changelog/$slug"
          >
            {change.title}
          </Link>
          <p className="mt-1 line-clamp-2 hidden text-sm leading-relaxed text-muted-foreground sm:block">{change.summary}</p>
          <div className="mt-3 flex items-center justify-between text-sm">
            <Link
              className="inline-flex min-h-9 items-center gap-1 font-medium text-primary-text hover:underline"
              onClick={collapse}
              params={{ slug: change.slug }}
              to="/changelog/$slug"
            >
              Read more
              <ArrowRight aria-hidden className="size-3.5" />
            </Link>
            <Link
              className="inline-flex min-h-9 items-center text-muted-foreground hover:text-foreground hover:underline"
              onClick={collapse}
              to="/changelog"
            >
              All changes
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
