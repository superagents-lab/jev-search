import { afterEach, describe, expect, it, vi } from 'vitest';
import { systemOne, TypeSafeError, type JevBinding, type JudgeConfig } from '@/lib/typesafe';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

function stubFetch(handler: (call: Call) => Response | Promise<Response>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const call: Call = {
        url: String(input),
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
      };
      calls.push(call);
      return handler(call);
    })
  );
  return calls;
}

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

function fakeBinding(run: JevBinding['run']): JevBinding & { run: ReturnType<typeof vi.fn> } {
  return { run: vi.fn(run) } as JevBinding & { run: ReturnType<typeof vi.fn> };
}

const one = (provider: JudgeConfig['providers'][number]): JudgeConfig => ({ providers: [provider] });

const QUESTIONS = {
  window: { type: 'choice' as const, instructions: 'How recent?', criteria: { any: 'Any time', '7d': 'Past week' } },
  source_reddit: {
    type: 'noul' as const,
    instructions: 'Wants Reddit?',
    criteria: { true: 'Mentions Reddit', false: 'Does not' },
  },
  plain: { type: 'noul' as const, instructions: 'No criteria' },
};

const NATIVE = {
  model: 'jev-1.13.0',
  answers: {
    window: { type: 'choice', choice: '7d', probabilities: { any: 0.2, '7d': 0.8 }, confidence: 0.74 },
    source_reddit: { type: 'noul', noul: 0.91 },
    plain: { type: 'noul', noul: 0.07 },
  },
  usage: { input_tokens: 123, output_tokens: 4 },
};

describe('TypeSafe provider', () => {
  it.each([
    [503, 'Jev is temporarily unavailable. Please try again shortly.'],
    [529, 'Jev is temporarily unavailable. Please try again shortly.'],
    [429, 'Jev is receiving too many requests. Please try again shortly.'],
    [402, 'Jev could not process this request (HTTP 402).'],
    [401, 'Jev could not process this request (HTTP 401).'],
  ])('shows a readable message for HTTP %i without exposing the provider body', async (status, message) => {
    stubFetch(() => json(status, { detail: { error_type: 'billing_error', message: 'Internal request details' } }));
    await expect(systemOne(one({ provider: 'typesafe', apiKey: 'test' }), 'test', {})).rejects.toMatchObject({
      status,
      message,
      provider: 'typesafe',
    });
  });

  it('posts to api.typesafe.ai with the model and untouched questions', async () => {
    const calls = stubFetch(() => json(200, NATIVE));
    const res = await systemOne(one({ provider: 'typesafe', apiKey: 'ts-key' }), { request: 'x' }, QUESTIONS);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(calls[0]!.headers.authorization).toBe('Bearer ts-key');
    expect(calls[0]!.body).toEqual({ state: { request: 'x' }, model: 'jev-latest', questions: QUESTIONS });
    expect(res).toEqual({ ...NATIVE, provider: 'typesafe' });
  });

  it('posts to a custom base URL without duplicating trailing slashes', async () => {
    const calls = stubFetch(() => json(200, NATIVE));
    await systemOne(
      one({ provider: 'typesafe', apiKey: 'ts-key', baseUrl: 'http://127.0.0.1:8787///' }),
      { request: 'x' },
      QUESTIONS
    );
    expect(calls[0]!.url).toBe('http://127.0.0.1:8787/v1/systemone');
  });
});

describe('Cloudflare Workers AI provider', () => {
  it('runs typesafe/jev through the binding and returns the native shape', async () => {
    const ai = fakeBinding(async () => NATIVE);
    const res = await systemOne(one({ provider: 'cloudflare', ai }), { request: 'x' }, QUESTIONS);
    expect(ai.run).toHaveBeenCalledTimes(1);
    const [model, inputs, options] = ai.run.mock.calls[0]!;
    expect(model).toBe('typesafe/jev');
    expect(inputs).toEqual({ state: { request: 'x' }, questions: QUESTIONS });
    expect(options).toEqual({});
    expect(res).toEqual({ ...NATIVE, provider: 'cloudflare' });
  });

  it('honours a custom model and forwards the abort signal', async () => {
    const ai = fakeBinding(async () => NATIVE);
    const controller = new AbortController();
    await systemOne(one({ provider: 'cloudflare', ai, model: 'typesafe/jev-latest' }), 'x', QUESTIONS, controller.signal);
    const [model, , options] = ai.run.mock.calls[0]!;
    expect(model).toBe('typesafe/jev-latest');
    expect(options).toEqual({ signal: controller.signal });
  });

  it('fills in missing model and usage', async () => {
    const ai = fakeBinding(async () => ({ answers: NATIVE.answers }));
    const res = await systemOne(one({ provider: 'cloudflare', ai }), 'x', QUESTIONS);
    expect(res.model).toBe('typesafe/jev');
    expect(res.usage).toEqual({ input_tokens: 0, output_tokens: 0 });
  });

  it.each([
    ['AiGatewayError: 2021: Insufficient AI Gateway credits', 402],
    ['InferenceUpstreamError: 2049: Insufficient balance; add money to your gateway or use BYOK', 402],
    ['AiError: Rate limit exceeded for model', 429],
    ['InferenceUpstreamError: 503 Service Unavailable', 503],
    ['AiError: 400 Bad Request', 400],
    ['something exploded', 502],
  ])('maps the binding error "%s" to HTTP %i', async (message, status) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ai = fakeBinding(async () => {
      throw new Error(message);
    });
    await expect(systemOne(one({ provider: 'cloudflare', ai }), 'x', QUESTIONS)).rejects.toMatchObject({
      status,
      provider: 'cloudflare',
    });
  });
});

describe('Cloudflare Clef providers', () => {
  it.each(['clef', 'clef-flash'] as const)('runs %s with the required model selector and native response', async (provider) => {
    const ai = fakeBinding(async () => ({ ...NATIVE, model: provider }));
    const controller = new AbortController();
    const res = await systemOne(one({ provider, ai }), { request: 'x' }, QUESTIONS, controller.signal);
    expect(ai.run).toHaveBeenCalledWith(
      `@cf/cloudflare/${provider}`,
      { model: provider, state: { request: 'x' }, questions: QUESTIONS },
      { signal: controller.signal }
    );
    expect(res).toEqual({ ...NATIVE, model: provider, provider });
  });

  it('falls back from Clef to Jev when the Clef binding is throttled', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ai = fakeBinding(async (model) => {
      if (model === '@cf/cloudflare/clef-flash') throw new Error('429 Too Many Requests');
      return NATIVE;
    });
    const res = await systemOne({ providers: [{ provider: 'clef-flash', ai }, { provider: 'cloudflare', ai }] }, 'x', QUESTIONS);
    expect(ai.run.mock.calls.map(([model]) => model)).toEqual(['@cf/cloudflare/clef-flash', 'typesafe/jev']);
    expect(res.provider).toBe('cloudflare');
    expect(warn.mock.calls.map((call) => String(call[0]))).toContain(
      '[jev] clef-flash returned HTTP 429; retrying with cloudflare'
    );
  });

  it('names Clef in a provider error', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ai = fakeBinding(async () => { throw new Error('503 Service Unavailable'); });
    await expect(systemOne(one({ provider: 'clef', ai }), 'x', QUESTIONS)).rejects.toMatchObject({
      status: 503,
      provider: 'clef',
      message: 'Clef is temporarily unavailable. Please try again shortly.',
    });
  });
});

describe('Vercel AI Gateway provider', () => {
  const config = one({ provider: 'vercel', apiKey: 'vc-key' });

  it('posts to the gateway evaluation endpoint with noul questions as boolean', async () => {
    const calls = stubFetch(() =>
      json(200, {
        answers: {
          window: { type: 'choice', choice: '7d', probabilities: { any: 0.2, '7d': 0.8 } },
          source_reddit: { type: 'boolean', probability: 0.91 },
          plain: { type: 'boolean', probability: 0.07 },
        },
        usage: { inputTokens: 123, outputTokens: 4 },
        providerMetadata: { typesafe: { confidence: { window: 0.74 } } },
      })
    );
    const res = await systemOne(config, { request: 'x' }, QUESTIONS);

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe('https://ai-gateway.vercel.sh/v4/ai/evaluation-model');
    expect(call.headers.authorization).toBe('Bearer vc-key');
    expect(call.headers['ai-model-id']).toBe('typesafe-ai/jev');
    expect(call.headers['ai-evaluation-model-specification-version']).toBe('4');
    expect(call.headers['ai-gateway-auth-method']).toBe('api-key');
    expect(call.body).toEqual({
      state: { request: 'x' },
      questions: {
        window: QUESTIONS.window,
        source_reddit: {
          type: 'boolean',
          instructions: 'Wants Reddit?',
          criteria: { true: 'Mentions Reddit', false: 'Does not' },
        },
        plain: { type: 'boolean', instructions: 'No criteria' },
      },
    });
    expect(call.body).not.toHaveProperty('model');
    expect(res).toEqual({ ...NATIVE, model: 'typesafe-ai/jev', provider: 'vercel' });
  });

  it('honours a custom gateway model and falls back to the chosen probability without metadata', async () => {
    const calls = stubFetch(() => json(200, { answers: { window: { type: 'choice', choice: 'any' } } }));
    const res = await systemOne(one({ provider: 'vercel', apiKey: 'vc', model: 'typesafe-ai/jev-latest' }), 'x', QUESTIONS);
    expect(calls[0]!.headers['ai-model-id']).toBe('typesafe-ai/jev-latest');
    expect(res.answers.window).toEqual({ type: 'choice', choice: 'any', probabilities: { any: 1 }, confidence: 1 });
    expect(res.usage).toEqual({ input_tokens: 0, output_tokens: 0 });
  });

  it('reports gateway failures with the same readable messages', async () => {
    stubFetch(() => json(401, { error: { message: 'Authentication failed', type: 'authentication_error' } }));
    await expect(systemOne(config, 'x', QUESTIONS)).rejects.toMatchObject({
      status: 401,
      message: 'Jev could not process this request (HTTP 401).',
      provider: 'vercel',
    });
  });
});

describe('OpenAI Decisions provider', () => {
  const OPENAI = {
    model: 'gpt-6-luna',
    answers: [
      {
        type: 'choice',
        name: 'window',
        choice: '7d',
        probabilities: [
          { value: 'any', probability: 0.2 },
          { value: '7d', probability: 0.8 },
        ],
        confidence: 0.6,
      },
      { type: 'predicate', name: 'source_reddit', probability: 0.91 },
      { type: 'refusal', name: 'plain' },
    ],
    usage: { input_tokens: 345, input_tokens_details: { cached_tokens: 0 }, output_tokens: 0, total_tokens: 345 },
  };

  it('posts named questions with criteria folded into predicate instructions and the state as text', async () => {
    const calls = stubFetch(() => json(200, OPENAI));
    await systemOne(one({ provider: 'openai', apiKey: 'sk-test' }), { request: 'x' }, QUESTIONS);
    expect(calls[0]!.url).toBe('https://api.openai.com/v1/decisions');
    expect(calls[0]!.headers.authorization).toBe('Bearer sk-test');
    expect(calls[0]!.body).toEqual({
      model: 'gpt-6-luna',
      input: '{"request":"x"}',
      questions: [
        {
          type: 'choice',
          name: 'window',
          instructions: 'How recent?',
          choices: [
            { value: 'any', description: 'Any time' },
            { value: '7d', description: 'Past week' },
          ],
        },
        {
          type: 'predicate',
          name: 'source_reddit',
          instructions: 'Wants Reddit?\nTrue when: Mentions Reddit\nFalse when: Does not',
        },
        { type: 'predicate', name: 'plain', instructions: 'No criteria' },
      ],
    });
  });

  it('maps answers to the native shape and drops refusals', async () => {
    stubFetch(() => json(200, OPENAI));
    const res = await systemOne(one({ provider: 'openai', apiKey: 'sk-test' }), 'x', QUESTIONS);
    expect(res).toEqual({
      model: 'gpt-6-luna',
      provider: 'openai',
      answers: {
        window: { type: 'choice', choice: '7d', probabilities: { any: 0.2, '7d': 0.8 }, confidence: 0.6 },
        source_reddit: { type: 'noul', noul: 0.91 },
      },
      usage: { input_tokens: 345, output_tokens: 0 },
    });
  });

  it('sends a plain-text state unchanged, omits empty choice descriptions and honours a custom model', async () => {
    const calls = stubFetch(() => json(200, { answers: [] }));
    const res = await systemOne(one({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-6-luna-2026-10-06' }), 'plain text', {
      pick: { type: 'choice', instructions: 'Pick', criteria: { a: null, b: 'B' } },
    });
    expect(calls[0]!.body.model).toBe('gpt-6-luna-2026-10-06');
    expect(calls[0]!.body.input).toBe('plain text');
    expect(calls[0]!.body.questions).toEqual([
      { type: 'choice', name: 'pick', instructions: 'Pick', choices: [{ value: 'a' }, { value: 'b', description: 'B' }] },
    ]);
    expect(res.model).toBe('gpt-6-luna-2026-10-06');
    expect(res.usage).toEqual({ input_tokens: 0, output_tokens: 0 });
  });

  it('falls back when OpenAI reports exhausted credit as HTTP 429', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const calls = stubFetch((call) =>
      call.url.includes('openai.com')
        ? json(429, { error: { type: 'insufficient_quota', code: 'credit_balance_exhausted' } })
        : json(200, NATIVE)
    );
    const res = await systemOne(
      { providers: [{ provider: 'openai', apiKey: 'sk-test' }, { provider: 'typesafe', apiKey: 'ts' }] },
      'x',
      QUESTIONS
    );
    expect(calls.map((c) => c.url)).toEqual(['https://api.openai.com/v1/decisions', 'https://api.typesafe.ai/v1/systemone']);
    expect(res.provider).toBe('typesafe');
    expect(console.warn).toHaveBeenCalledWith('[jev] openai returned HTTP 429; retrying with typesafe');
  });

  it('names GPT-6 Luna in a provider error', async () => {
    stubFetch(() => json(503, { error: { message: 'Internal request details' } }));
    await expect(systemOne(one({ provider: 'openai', apiKey: 'sk-test' }), 'x', QUESTIONS)).rejects.toMatchObject({
      status: 503,
      provider: 'openai',
      message: 'GPT-6 Luna is temporarily unavailable. Please try again shortly.',
    });
  });
});

describe('provider chain', () => {
  function chain(ai: JevBinding): JudgeConfig {
    return {
      providers: [
        { provider: 'typesafe', apiKey: 'ts-key' },
        { provider: 'cloudflare', ai },
        { provider: 'vercel', apiKey: 'vc-key' },
      ],
    };
  }

  it.each([402, 429, 503])('moves to the next provider after HTTP %i', async (status) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ai = fakeBinding(async () => NATIVE);
    const calls = stubFetch(() => json(status, { detail: { message: 'No credits' } }));
    const res = await systemOne(chain(ai), 'x', QUESTIONS);
    expect(calls.map((c) => new URL(c.url).host)).toEqual(['api.typesafe.ai']);
    expect(res.provider).toBe('cloudflare');
  });

  it('walks the whole chain when every earlier provider is out', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ai = fakeBinding(async () => {
      throw new Error('2049: Insufficient balance');
    });
    const calls = stubFetch((call) =>
      call.url.includes('typesafe.ai')
        ? json(402, {})
        : json(200, { answers: { plain: { type: 'boolean', probability: 0.5 } } })
    );
    const res = await systemOne(chain(ai), 'x', { plain: QUESTIONS.plain });
    expect(calls.map((c) => new URL(c.url).host)).toEqual(['api.typesafe.ai', 'ai-gateway.vercel.sh']);
    expect(ai.run).toHaveBeenCalledTimes(1);
    expect(res.provider).toBe('vercel');
    expect(res.answers.plain).toEqual({ type: 'noul', noul: 0.5 });
    expect(warn.mock.calls.map((c) => String(c[0]))).toEqual([
      '[jev] typesafe returned HTTP 402; retrying with cloudflare',
      '[jev] cloudflare binding failed: Error: 2049: Insufficient balance',
      '[jev] cloudflare returned HTTP 402; retrying with vercel',
    ]);
  });

  it('does not fall back on client errors such as HTTP 401', async () => {
    const ai = fakeBinding(async () => NATIVE);
    const calls = stubFetch(() => json(401, {}));
    await expect(systemOne(chain(ai), 'x', QUESTIONS)).rejects.toBeInstanceOf(TypeSafeError);
    expect(calls).toHaveLength(1);
    expect(ai.run).not.toHaveBeenCalled();
  });

  it('surfaces the last error when every provider fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ai = fakeBinding(async () => {
      throw new Error('Insufficient balance');
    });
    stubFetch((call) => json(call.url.includes('typesafe.ai') ? 402 : 429, {}));
    await expect(systemOne(chain(ai), 'x', QUESTIONS)).rejects.toMatchObject({ status: 429, provider: 'vercel' });
  });

  it('does not fall back once the request was aborted', async () => {
    const controller = new AbortController();
    const ai = fakeBinding(async () => NATIVE);
    const calls = stubFetch(() => {
      controller.abort();
      return json(503, {});
    });
    await expect(systemOne(chain(ai), 'x', QUESTIONS, controller.signal)).rejects.toMatchObject({ status: 503 });
    expect(calls).toHaveLength(1);
    expect(ai.run).not.toHaveBeenCalled();
  });

  it('rejects an empty chain', async () => {
    await expect(systemOne({ providers: [] }, 'x', QUESTIONS)).rejects.toThrow(/No decision provider/);
  });
});
