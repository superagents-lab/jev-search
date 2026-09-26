import { describe, expect, it } from 'vitest';
import { judgeConfig } from '@/lib/judge-config';

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
  });

  it('explains what is missing when nothing is configured', () => {
    expect(() => judgeConfig({})).toThrow(/No Jev provider is configured for JEV_PROVIDERS=typesafe; set TYPESAFE_API_KEY/);
    expect(() => judgeConfig({ JEV_PROVIDERS: 'typesafe,cloudflare' })).toThrow(
      /JEV_PROVIDERS=typesafe,cloudflare; set TYPESAFE_API_KEY or the AI binding in wrangler.jsonc/
    );
    expect(() => judgeConfig({ JEV_PROVIDERS: 'vercel', TYPESAFE_API_KEY: 'ts' })).toThrow(
      /JEV_PROVIDERS=vercel; set AI_GATEWAY_API_KEY/
    );
  });

  it('rejects unknown provider names', () => {
    expect(() => judgeConfig({ JEV_PROVIDERS: 'openai', TYPESAFE_API_KEY: 'ts' })).toThrow(/unknown provider "openai"/);
  });
});
