import { CheckIcon, ChevronDownIcon, LoaderCircleIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { OFF_TOPIC } from './results';
import { sourceById, windowById, type SourceId } from '@/lib/sources';
import type { AskState } from '@/lib/use-ask';
import { cn } from '@/lib/utils';
import type { ProviderId } from '@/lib/typesafe';
import { SourceIcon } from './source-icon';

function list(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const providerLabel: Record<ProviderId, string> = {
  typesafe: 'TypeSafe',
  vercel: 'Vercel AI Gateway',
  cloudflare: 'Cloudflare Workers AI',
  clef: 'Cloudflare Workers AI',
  'clef-flash': 'Cloudflare Workers AI',
};

type Line = { key: string; state: 'doing' | 'done' | 'failed'; text: React.ReactNode; icon?: SourceId };

/** Where each chosen source is, in words. */
function sourceLines(state: AskState): Line[] {
  const { intent } = state;
  if (!intent) return [];
  return intent.sources.map((id) => {
    const source = sourceById(id);
    const keys = source.lanes.map((l) => `${id}/${l.service}`);
    const answered = keys.filter((k) => k in state.found || k in state.lanes);
    const scored = keys.filter((k) => k in state.lanes);
    const found = keys.reduce((n, k) => n + (state.found[k] ?? 0), 0);
    const rows = state.items.filter((i) => i.source === id);
    const answering = rows.filter((i) => i.relevance >= OFF_TOPIC).length;
    const allFailed = scored.length === keys.length && scored.every((k) => state.lanes[k]?.error) && found === 0;

    if (allFailed) return { key: id, state: 'failed', icon: id, text: <>{source.label} didn't answer</> };
    if (answered.length === 0) return { key: id, state: 'doing', icon: id, text: <>Asking {source.label}…</> };
    if (scored.length < keys.length) {
      return {
        key: id,
        state: 'doing',
        icon: id,
        text: (
          <>
            {source.label} · {found} found
            {scored.length > 0 && `, ${answering} answer you so far`}
            <span className="text-muted-foreground"> · checking which answer you…</span>
          </>
        ),
      };
    }
    return {
      key: id,
      state: 'done',
      icon: id,
      text: found === 0 ? <>{source.label} · nothing there</> : <>{source.label} · {answering} of {found} answer you</>,
    };
  });
}

function Mark({ state }: { state: Line['state'] }) {
  if (state === 'done') {
    return (
      <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
        <CheckIcon className="size-2.5" strokeWidth={3} />
      </span>
    );
  }
  if (state === 'failed') return <span className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground">–</span>;
  return (
    <span className="inline-flex size-4 shrink-0 items-center justify-center">
      <span className="size-2 rounded-full bg-primary animate-pulse" />
    </span>
  );
}

/**
 * The wait, narrated. A block that fills the space where results will land
 * and grows a line per thing that happens, in plain words. Once results
 * are on screen it folds to one line that keeps updating; click to reopen.
 */
export function Working({ state, actions }: { state: AskState; actions?: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const hasResults = state.items.length > 0;
  useEffect(() => {
    if (hasResults) setOpen(false);
  }, [hasResults]);
  useEffect(() => {
    if (state.phase === 'understanding') setOpen(true);
  }, [state.phase]);
  if (state.phase === 'idle' || state.phase === 'error') return null;

  const { intent } = state;
  const lines = sourceLines(state);
  const found = Object.values(state.found).reduce((n, c) => n + c, 0);
  const answering = state.items.filter((i) => i.relevance >= OFF_TOPIC).length;
  const pending = lines.filter((l) => l.state === 'doing');
  const window = intent && intent.window !== 'any' ? windowById(intent.window).label.toLowerCase() : null;

  let summary: React.ReactNode;
  if (!intent) summary = 'Reading your question…';
  else if (state.phase === 'done') {
    summary = (
      <>
        <span className="sm:hidden">{answering} of {found} relevant</span>
        <span className="hidden sm:inline">
          Asked {list(intent.sources.map((id) => sourceById(id).label))} · {found} found · {answering} answer you
          {state.totalMs !== null && <span className="text-muted-foreground/60"> · {(state.totalMs / 1000).toFixed(1)}s</span>}
        </span>
      </>
    );
  } else if (pending.length > 0) {
    summary = (
      <>
        Still asking {list(pending.map((l) => sourceById(l.key as SourceId).label))}…
        {found > 0 && <span className="text-muted-foreground/70"> · {found} found so far</span>}
      </>
    );
  } else summary = <>Checking which of the {found} answer you…</>;

  return (
    <section className="mt-4 text-sm">
      <div className="flex items-start gap-4">
        <button
          className="group flex min-w-0 flex-1 items-start gap-2 text-left text-muted-foreground hover:text-foreground"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          type="button"
        >
          {state.phase === 'done' ? (
            <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
              <CheckIcon className="size-2.5" strokeWidth={3} />
            </span>
          ) : (
            <LoaderCircleIcon className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
          )}
          <span className="min-w-0 wrap-anywhere">{summary}</span>
          <ChevronDownIcon
            className={cn(
              'mt-[3px] size-3.5 shrink-0 opacity-40 transition-transform duration-200 group-hover:opacity-80',
              open && 'rotate-180'
            )}
          />
        </button>
        {actions}
      </div>

      <div className="fold" data-open={open ? '' : undefined}>
        <ol className="mt-2 ml-1.5 flex flex-col gap-1.5 border-l pl-4">
          {intent && (
            <li className="flex items-center gap-2 text-muted-foreground">
              <Mark state="done" />
              <span>
                Looking for <span className="text-foreground">“{intent.query}”</span>
                {window && <span> · {window}</span>}
                <span> · interpreted via {providerLabel[intent.judge]}</span>
              </span>
            </li>
          )}
          {!intent && (
            <li className="flex items-center gap-2 text-foreground">
              <Mark state="doing" />
              <span>Reading your question</span>
            </li>
          )}
          {lines.map((line) => (
            <li
              className={cn(
                'enter flex items-center gap-2',
                line.state === 'doing' ? 'text-foreground' : 'text-muted-foreground'
              )}
              key={line.key}
            >
              <Mark state={line.state} />
              {line.icon && <SourceIcon className="size-3.5" id={line.icon} on={line.state !== 'failed'} />}
              <span>{line.text}</span>
            </li>
          ))}
          {state.phase === 'done' && state.totalMs !== null && (
            <li className="flex items-center gap-2 text-muted-foreground">
              <Mark state="done" />
              <span>Done in {(state.totalMs / 1000).toFixed(1)}s</span>
            </li>
          )}
        </ol>
      </div>
    </section>
  );
}
