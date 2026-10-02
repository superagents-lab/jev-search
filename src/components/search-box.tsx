import { useNavigate } from '@tanstack/react-router';
import { CheckIcon, ChevronDownIcon, SearchIcon } from 'lucide-react';
import { Select as SelectPrimitive } from 'radix-ui';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** Newlines never reach the URL: a pasted or wrapped request is one line of words. */
function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

const supportsFieldSizing = () => typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content');

/**
 * A pill that opens. At rest it is one line, like any search box, with a
 * fade where a long request runs past the edge. Focused, the request wraps
 * and the box grows so the whole question can be read and edited; it folds
 * back on blur. Enter submits.
 */
export function SearchBox({
  initial = '',
  initialModel = 'auto',
  compact = false,
  autoFocus = false,
  onModelChange,
}: {
  initial?: string;
  initialModel?: string;
  compact?: boolean;
  autoFocus?: boolean;
  onModelChange?: (model: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const [model, setModel] = useState(initialModel);
  const [models, setModels] = useState<{ id: string; label: string }[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  const navigate = useNavigate();
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/models', { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Models unavailable')))
      .then((body: unknown) => {
        if (typeof body === 'object' && body !== null && 'models' in body && Array.isArray(body.models)) {
          setModels(body.models as { id: string; label: string }[]);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    // Browsers without `field-sizing: content` get the same growth from JS.
    if (!supportsFieldSizing()) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
    if (!expanded) {
      el.scrollLeft = 0;
      setClipped(el.scrollWidth > el.clientWidth);
    }
  }, [value, expanded]);

  const submit = (form: HTMLFormElement | null) => {
    const q = oneLine(value);
    if (!q) return;
    form?.querySelector('textarea')?.blur();
    // A new request resets explicit filters so the judge decides again.
    navigate({ to: '/search', search: { q, m: model === 'auto' ? undefined : model }, viewTransition: true });
  };

  return (
    <form
      className="vt-searchbox relative"
      onSubmit={(event) => {
        event.preventDefault();
        submit(event.currentTarget);
      }}
      role="search"
    >
      {/* The pill is this wrapper, so the text fade below never touches the border. */}
      <div className="flex items-start rounded-3xl border border-input shadow-sm transition-[color,box-shadow] has-focus-visible:border-ring has-focus-visible:shadow-md has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50 dark:bg-input/30">
        <SearchIcon
          aria-hidden
          className={cn('pointer-events-none absolute left-4 text-muted-foreground', compact ? 'top-3 size-4' : 'top-3.5 size-5')}
        />
        <textarea
          aria-label="Search"
          autoComplete="off"
          autoFocus={autoFocus}
          className={cn(
            'block min-w-0 flex-1 resize-none overflow-hidden bg-transparent pl-11 pr-2 leading-6 outline-none placeholder:text-muted-foreground',
            compact ? 'py-2 text-base md:text-sm' : 'py-3 text-base',
            !expanded && clipped && '[mask-image:linear-gradient(to_right,black_calc(100%-3.5rem),transparent_calc(100%-1rem))]'
          )}
          enterKeyHint="search"
          maxLength={300}
          name="q"
          onBlur={() => setExpanded(false)}
          onChange={(event) => setValue(event.target.value)}
          onFocus={() => setExpanded(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit(event.currentTarget.form);
            }
          }}
          placeholder="Ask the web any way you like"
          ref={field}
          rows={1}
          style={{ fieldSizing: 'content' } as React.CSSProperties}
          value={value}
          wrap={expanded ? 'soft' : 'off'}
        />
        {(models.length > 1 || model !== 'auto') && (
          <div className={cn('mr-2 shrink-0', compact ? 'mt-1' : 'mt-2')}>
            <SelectPrimitive.Root
              onValueChange={(nextModel) => {
                setModel(nextModel);
                if (oneLine(value) === oneLine(initial)) onModelChange?.(nextModel);
              }}
              value={model}
            >
              <SelectPrimitive.Trigger
                aria-label="Decision model"
                className={cn(
                  'flex max-w-36 items-center gap-1.5 rounded-full bg-transparent pl-3 pr-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground focus-visible:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  compact ? 'h-7' : 'h-8'
                )}
              >
                <SelectPrimitive.Value />
                <SelectPrimitive.Icon>
                  <ChevronDownIcon aria-hidden className="size-3" />
                </SelectPrimitive.Icon>
              </SelectPrimitive.Trigger>
              <SelectPrimitive.Portal>
                <SelectPrimitive.Content
                  align="end"
                  className="z-50 min-w-40 overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg"
                  collisionPadding={8}
                  position="popper"
                  sideOffset={8}
                >
                  <SelectPrimitive.Viewport>
                    {[
                      { id: 'auto', label: 'Auto' },
                      ...(model !== 'auto' && !models.some((option) => option.id === model)
                        ? [{ id: model, label: 'Unavailable model' }]
                        : []),
                      ...models,
                    ].map((option) => (
                      <SelectPrimitive.Item
                        className="relative flex min-h-9 cursor-default select-none items-center rounded-lg py-2 pr-8 pl-3 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[state=checked]:font-medium"
                        key={option.id}
                        value={option.id}
                      >
                        <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                        <SelectPrimitive.ItemIndicator className="absolute right-3 text-primary-text">
                          <CheckIcon aria-hidden className="size-3.5" />
                        </SelectPrimitive.ItemIndicator>
                      </SelectPrimitive.Item>
                    ))}
                  </SelectPrimitive.Viewport>
                </SelectPrimitive.Content>
              </SelectPrimitive.Portal>
            </SelectPrimitive.Root>
          </div>
        )}
      </div>
    </form>
  );
}
