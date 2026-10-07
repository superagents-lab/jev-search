import { describe, expect, it } from 'vitest';
import { configuredModels, judgeConfig, selectModel } from '@/lib/judge-config';

const AI = { run: async () => ({}) };

describe('judgeConfig', () => {
  it('uses TypeSafe alone when it is the only credential', () => {
    expect(judgeConfig({ TYPESAFE_API_KEY: 'ts', TYPESAFE_MODEL: 'jev-latest' })).toEqual({
      providers: [{ provider: 'typesafe', apiKey: 'ts', baseUrl: undefined, model: 'jev-latest' }],
    });
  });

  it('passes the TypeSafe base URL from the environment', () => {
    expect(judgeConfig({ TYPESAFE_API_KEY: 'ts', TYPESAFE_BASE_URL: 'http://127.0.0.1:8787/' })).toEqual({
      providers: [{ provider: 'typesafe', apiKey: 'ts', baseUrl: 'http://127.0.0.1:8787/', model: undefined }],
    });
  });

  it('leaves unlisted providers off even when their credentials exist', () => {
    const config = judgeConfig({ TYPESAFE_API_KEY: 'ts', AI, AI_GATEWAY_API_KEY: 'vc' });
    expect(config.providers.map((p) => p.provider)).toEqual(['typesafe']);
  });

  it('enables both Clef models through the existing AI binding without a key', () => {
    const config = judgeConfig({ JEV_PROVIDERS: 'clef-flash,clef,cloudflare', AI });
    expect(config.providers).toEqual([
      { provider: 'clef-flash', ai: AI },
      { provider: 'clef', ai: AI },
      { provider: 'cloudflare', ai: AI, model: undefined },
    ]);
  });

  it('enables OpenAI Decisions with its key and an optional model', () => {
    expect(judgeConfig({ JEV_PROVIDERS: 'openai-decisions,typesafe', OPENAI_API_KEY: 'sk', TYPESAFE_API_KEY: 'ts' }).providers[0]).toEqual({
      provider: 'openai',
      apiKey: 'sk',
      model: undefined,
    });
    expect(judgeConfig({ JEV_PROVIDERS: 'openai', OPENAI_API_KEY: 'sk', OPENAI_DECISIONS_MODEL: 'gpt-6-luna' }).providers).toEqual([
      { provider: 'openai', apiKey: 'sk', model: 'gpt-6-luna' },
    ]);
    expect(() => judgeConfig({ JEV_PROVIDERS: 'openai' })).toThrow(/JEV_PROVIDERS=openai; set OPENAI_API_KEY/);
  });

  it('chains every listed provider in the given order', () => {
    const config = judgeConfig({
      JEV_PROVIDERS: 'typesafe,cloudflare,vercel',
      TYPESAFE_API_KEY: 'ts',
      TYPESAFE_MODEL: 'jev-latest',
      AI,
      CLOUDFLARE_AI_MODEL: 'typesafe/jev',
      AI_GATEWAY_API_KEY: 'vc',
      AI_GATEWAY_MODEL: 'typesafe-ai/jev',
    });
    expect(config.providers.map((p) => p.provider)).toEqual(['typesafe', 'cloudflare', 'vercel']);
    expect(config.providers[1]).toEqual({ provider: 'cloudflare', ai: AI, model: 'typesafe/jev' });
    expect(config.providers[2]).toEqual({ provider: 'vercel', apiKey: 'vc', model: 'typesafe-ai/jev' });
  });

  it('follows JEV_PROVIDERS order, accepts aliases and skips providers without credentials', () => {
    const config = judgeConfig({
      JEV_PROVIDERS: ' Vercel-AI-Gateway, cloudflare-workers-ai ,typesafe,vercel',
      TYPESAFE_API_KEY: 'ts',
      AI,
    });
    expect(config.providers.map((p) => p.provider)).toEqual(['cloudflare', 'typesafe']);
    expect(config.providers[0]).toEqual({ provider: 'cloudflare', ai: AI, model: undefined });
  });

  it('ignores an AI value that is not a binding', () => {
    expect(judgeConfig({ TYPESAFE_API_KEY: 'ts', AI: 'nope' }).providers.map((p) => p.provider)).toEqual(['typesafe']);
    expect(() => judgeConfig({ JEV_PROVIDERS: 'clef', AI: 'nope' })).toThrow(/the AI binding in wrangler.jsonc/);
  });

  it('explains what is missing when nothing is configured', () => {
    expect(() => judgeConfig({})).toThrow(/No decision provider is configured for JEV_PROVIDERS=typesafe; set TYPESAFE_API_KEY/);
    expect(() => judgeConfig({ JEV_PROVIDERS: 'typesafe,cloudflare' })).toThrow(
      /JEV_PROVIDERS=typesafe,cloudflare; set TYPESAFE_API_KEY or the AI binding in wrangler.jsonc/
    );
    expect(() => judgeConfig({ JEV_PROVIDERS: 'vercel', TYPESAFE_API_KEY: 'ts' })).toThrow(
      /JEV_PROVIDERS=vercel; set AI_GATEWAY_API_KEY/
    );
  });

  it('rejects unknown provider names', () => {
    expect(() => judgeConfig({ JEV_PROVIDERS: 'anthropic', TYPESAFE_API_KEY: 'ts' })).toThrow(/unknown provider "anthropic"/);
  });
});

describe('model selection', () => {
  const config = judgeConfig({
    JEV_PROVIDERS: 'clef-flash,typesafe,cloudflare,clef,openai,vercel',
    TYPESAFE_API_KEY: 'ts',
    AI_GATEWAY_API_KEY: 'vc',
    OPENAI_API_KEY: 'sk',
    AI,
  });

  it('lists each configured model once in provider order', () => {
    expect(configuredModels(config)).toEqual([
      { id: 'clef-flash', label: 'Clef-flash' },
      { id: 'jev', label: 'Jev' },
      { id: 'clef', label: 'Clef' },
      { id: 'gpt-6-luna', label: 'GPT-6 Luna' },
    ]);
  });

  it('keeps same-model provider fallbacks and excludes other models', () => {
    expect(selectModel(config, 'jev').providers.map((p) => p.provider)).toEqual(['typesafe', 'cloudflare', 'vercel']);
    expect(selectModel(config, 'clef').providers.map((p) => p.provider)).toEqual(['clef']);
    expect(selectModel(config, 'gpt-6-luna').providers.map((p) => p.provider)).toEqual(['openai']);
    expect(selectModel(config, 'auto')).toBe(config);
    expect(() => selectModel(config, 'unknown')).toThrow('Selected model is not available');
  });

  it('shows a custom configured model separately', () => {
    const custom = judgeConfig({ JEV_PROVIDERS: 'typesafe,vercel', TYPESAFE_API_KEY: 'ts', AI_GATEWAY_API_KEY: 'vc', TYPESAFE_MODEL: 'my-decision-v2' });
    expect(configuredModels(custom)).toEqual([
      { id: 'model:my-decision-v2', label: 'my-decision-v2' },
      { id: 'jev', label: 'Jev' },
    ]);
  });

  it('shows a custom OpenAI model separately from GPT-6 Luna', () => {
    const custom = judgeConfig({ JEV_PROVIDERS: 'openai', OPENAI_API_KEY: 'sk', OPENAI_DECISIONS_MODEL: 'gpt-6-luna-2026-10-06' });
    expect(configuredModels(custom)).toEqual([{ id: 'model:gpt-6-luna-2026-10-06', label: 'gpt-6-luna-2026-10-06' }]);
  });
});
