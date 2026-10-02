import { useEffect, useState } from 'react';
import { mergeItems } from './merge';
import type { AskEvent, IntentEvent, LaneEvent } from './pipeline';
import type { RankedItem } from './rank';
import type { SourceId, WindowId } from './sources';

export interface AskState {
  phase: 'idle' | 'understanding' | 'searching' | 'done' | 'error';
  intent: IntentEvent | null;
  /** Scored lanes folded by URL as they arrive. */
  items: RankedItem[];
  /** Lanes whose engine has answered (rows may still be unscored), keyed `${source}/${engine}`. */
  found: Record<string, number>;
  /** Every scored lane, keyed `${source}/${engine}`. */
  lanes: Record<string, LaneEvent>;
  totalMs: number | null;
  message: string | null;
}

type Incoming = AskEvent | { type: 'error'; message: string };

const IDLE: AskState = {
  phase: 'idle',
  intent: null,
  items: [],
  found: {},
  lanes: {},
  totalMs: null,
  message: null,
};

function reduce(s: AskState, event: Incoming): AskState {
  switch (event.type) {
    case 'intent':
      return { ...s, phase: 'searching', intent: event };
    case 'found':
      return { ...s, found: { ...s.found, [`${event.source}/${event.engine}`]: event.items.length } };
    case 'lane':
      return {
        ...s,
        items: mergeItems(s.items, event.items),
        found: { ...s.found, [`${event.source}/${event.engine}`]: event.items.length },
        lanes: { ...s.lanes, [`${event.source}/${event.engine}`]: event },
      };
    case 'done':
      return { ...s, phase: 'done', totalMs: event.totalMs };
    case 'error':
      return { ...s, phase: 'error', message: event.message };
  }
}

/** Consume POST /api/ask as it streams, one JSON event per line. */
export function useAsk(params: { q: string; w?: WindowId; s?: SourceId[]; m?: string }) {
  // Server render already shows "Reading your question" so the first frame matches the second.
  const [state, setState] = useState<AskState>(() =>
    params.q.trim() ? { ...IDLE, phase: 'understanding' } : IDLE
  );
  const key = JSON.stringify(params);

  useEffect(() => {
    if (!params.q.trim()) {
      setState(IDLE);
      return;
    }
    const controller = new AbortController();
    setState({ ...IDLE, phase: 'understanding' });

    const apply = (event: Incoming) =>
      setState((s) => controller.signal.aborted ? s : reduce(s, event));

    (async () => {
      let response: Response;
      try {
        response = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        apply({ type: 'error', message: (error as Error).message });
        return;
      }
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        apply({ type: 'error', message: body.error ?? `HTTP ${response.status}` });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const handle = (line: string) => {
        if (!line.trim()) return;
        apply(JSON.parse(line) as Incoming);
      };
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) handle(line);
        }
        if (buffer) handle(buffer);
      } catch (error) {
        if (controller.signal.aborted) return;
        apply({ type: 'error', message: (error as Error).message });
      }
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
