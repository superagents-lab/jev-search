import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getModelChoice, modelCredit, setConfiguredModels, setSelectedModel, useModelChoice } from '@/lib/model-choice';

const MODELS = [
  { id: 'jev', label: 'Jev' },
  { id: 'clef', label: 'Clef' },
  { id: 'gpt-6-luna', label: 'GPT-6 Luna' },
];

describe('modelCredit', () => {
  it('credits each built-in model with its own page', () => {
    expect(modelCredit('jev', MODELS)).toEqual({ label: 'Jev', href: 'https://typesafe.ai' });
    expect(modelCredit('clef', MODELS)).toEqual({ label: 'Clef', href: 'https://developers.cloudflare.com/workers-ai/models/clef/' });
    expect(modelCredit('clef-flash', [])).toEqual({
      label: 'Clef-flash',
      href: 'https://developers.cloudflare.com/workers-ai/models/clef-flash/',
    });
    expect(modelCredit('gpt-6-luna', [])).toEqual({
      label: 'GPT-6 Luna',
      href: 'https://developers.openai.com/api/docs/guides/decisions',
    });
  });

  it('credits the primary configured model for Auto, and Jev before the models load', () => {
    expect(modelCredit('auto', [{ id: 'clef-flash', label: 'Clef-flash' }, ...MODELS]).label).toBe('Clef-flash');
    expect(modelCredit('auto', []).label).toBe('Jev');
  });

  it('names a custom model without a link and survives a malformed id', () => {
    expect(modelCredit('model:my-decision-v2', [{ id: 'model:my-decision-v2', label: 'my-decision-v2' }])).toEqual({
      label: 'my-decision-v2',
    });
    expect(modelCredit('model:a%2Fb', [])).toEqual({ label: 'a/b' });
    expect(modelCredit('model:%E0', []).label).toBe('Jev');
    expect(modelCredit('nonexistent', MODELS).label).toBe('Jev');
  });
});

describe('model choice store', () => {
  function Probe() {
    const { selected, models } = useModelChoice();
    return createElement('span', null, `${selected ?? 'none'}:${models.length}`);
  }

  it('records the latest selection and models without republishing an unchanged selection', () => {
    setSelectedModel('clef');
    setConfiguredModels(MODELS);
    const snapshot = getModelChoice();
    expect(snapshot).toEqual({ selected: 'clef', models: MODELS });
    setSelectedModel('clef');
    expect(getModelChoice()).toBe(snapshot);
    setSelectedModel('gpt-6-luna');
    expect(getModelChoice()).toEqual({ selected: 'gpt-6-luna', models: MODELS });
  });

  it('renders the empty snapshot on the server even after a client update', () => {
    setSelectedModel('clef');
    expect(renderToStaticMarkup(createElement(Probe))).toBe('<span>none:0</span>');
  });
});
