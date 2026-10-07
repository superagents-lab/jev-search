import { useSyncExternalStore } from 'react';
import type { ModelOption } from './judge-config';

/**
 * The model chosen in the search box, shared with the footer credit. The
 * search box publishes its selection and the configured models; nothing is
 * published during server rendering, so the server snapshot stays empty.
 */
interface ModelChoice {
  /** Null until a search box has mounted. */
  selected: string | null;
  models: ModelOption[];
}

const EMPTY: ModelChoice = { selected: null, models: [] };
let current = EMPTY;
const listeners = new Set<() => void>();

function publish(next: ModelChoice) {
  current = next;
  for (const listener of listeners) listener();
}

export function setSelectedModel(selected: string) {
  if (current.selected !== selected) publish({ ...current, selected });
}

export function setConfiguredModels(models: ModelOption[]) {
  publish({ ...current, models });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getModelChoice(): ModelChoice {
  return current;
}

export function useModelChoice(): ModelChoice {
  return useSyncExternalStore(subscribe, getModelChoice, () => EMPTY);
}

export interface ModelCredit {
  label: string;
  href?: string;
}

const KNOWN: Record<string, ModelCredit> = {
  jev: { label: 'Jev', href: 'https://typesafe.ai' },
  clef: { label: 'Clef', href: 'https://developers.cloudflare.com/workers-ai/models/clef/' },
  'clef-flash': { label: 'Clef-flash', href: 'https://developers.cloudflare.com/workers-ai/models/clef-flash/' },
  'gpt-6-luna': { label: 'GPT-6 Luna', href: 'https://developers.openai.com/api/docs/guides/decisions' },
};

/** The model to credit for a selection. Auto credits the primary configured model; fallbacks answer only when it fails. */
export function modelCredit(selected: string, models: readonly ModelOption[]): ModelCredit {
  const id = selected === 'auto' ? models[0]?.id : selected;
  if (!id) return KNOWN.jev!;
  const known = KNOWN[id];
  if (known) return known;
  const option = models.find((model) => model.id === id);
  if (option) return { label: option.label };
  if (id.startsWith('model:')) {
    // The id can come straight from the URL, so a malformed escape must not break rendering.
    try {
      return { label: decodeURIComponent(id.slice('model:'.length)) };
    } catch {
      return KNOWN.jev!;
    }
  }
  return KNOWN.jev!;
}
