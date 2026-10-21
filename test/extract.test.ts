import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLAIRIC_MODEL, EXTRACTED_SOURCES, extractQueries } from '@/lib/extract';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const answer = (value: string | null) => ({ type: 'text', value });

describe('extractQueries', () => {
  it('asks Clairic for every keyword engine in one call', async () => {
    const run = vi.fn(async (_model: string, _inputs: unknown) => ({ answers: {}, usage: { input_tokens: 7 } }));
    await extractQueries({ run }, 'htmx in production on Reddit');
    expect(run).toHaveBeenCalledTimes(1);
    const [model, inputs] = run.mock.calls[0] as unknown as [string, { state: string; fields: Record<string, { type: string }> }];
    expect(model).toBe(CLAIRIC_MODEL);
    expect(inputs.state).toBe('htmx in production on Reddit');
    expect(Object.keys(inputs.fields).sort()).toEqual([...EXTRACTED_SOURCES].sort());
    expect(Object.keys(inputs.fields).sort()).toEqual(['github', 'hackernews', 'reddit']);
    expect(Object.values(inputs.fields).every((f) => f.type === 'text')).toBe(true);
  });

  it('keeps trimmed spans and drops null, blank or unknown answers', async () => {
    const run = vi.fn(async () => ({
      answers: { reddit: answer(' htmx in production '), github: answer(null), x: answer('htmx'), hackernews: { type: 'text' } },
      usage: { input_tokens: 812 },
    }));
    expect(await extractQueries({ run }, 'htmx in production')).toEqual({ queries: { reddit: 'htmx in production' }, tokens: 812 });
  });

  it('reads the REST-shaped body', async () => {
    const run = vi.fn(async () => ({ result: { answers: { github: answer('Home Assistant MQTT') }, usage: { input_tokens: 9 } } }));
    expect(await extractQueries({ run }, 'ตัวอย่าง Home Assistant MQTT')).toEqual({ queries: { github: 'Home Assistant MQTT' }, tokens: 9 });
  });

  it('returns no queries without a binding or when the binding fails', async () => {
    expect(await extractQueries(undefined, 'htmx')).toEqual({ queries: {}, tokens: 0 });
    const run = vi.fn(async () => {
      throw new Error('InferenceUpstreamError: 503 Service Unavailable');
    });
    expect(await extractQueries({ run }, 'htmx')).toEqual({ queries: {}, tokens: 0 });
  });

  it('gives up after the timeout even if the binding ignores the signal', async () => {
    const run = vi.fn(() => new Promise(() => undefined));
    expect(await extractQueries({ run }, 'htmx', undefined, 10)).toEqual({ queries: {}, tokens: 0 });
  });

  it('propagates a caller abort', async () => {
    const controller = new AbortController();
    const run = vi.fn(() => new Promise(() => undefined));
    const pending = extractQueries({ run }, 'htmx', controller.signal);
    controller.abort(new Error('aborted'));
    await expect(pending).rejects.toThrow('aborted');
  });
});
