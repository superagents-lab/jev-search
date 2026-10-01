import type { JevBinding, JudgeConfig, ProviderConfig, ProviderId } from './typesafe';

/** The environment that decides how Jev is reached. Variables are plain strings; `AI` is a Workers AI binding. */
export interface JudgeEnv {
  /** Comma-separated list of enabled providers in order of preference, e.g. `typesafe,vercel`. Unlisted providers stay off. */
  JEV_PROVIDERS?: string;
  TYPESAFE_API_KEY?: string;
  TYPESAFE_BASE_URL?: string;
  TYPESAFE_MODEL?: string;
  AI_GATEWAY_API_KEY?: string;
  AI_GATEWAY_MODEL?: string;
  AI?: unknown;
  CLOUDFLARE_AI_MODEL?: string;
}

export const DEFAULT_PROVIDER_ORDER: readonly ProviderId[] = ['typesafe'];

const ALIASES: Record<string, ProviderId> = {
  typesafe: 'typesafe',
  vercel: 'vercel',
  'vercel-ai-gateway': 'vercel',
  cloudflare: 'cloudflare',
  'cloudflare-workers-ai': 'cloudflare',
  'cloudflare-ai-gateway': 'cloudflare',
};

const CREDENTIAL: Record<ProviderId, string> = {
  typesafe: 'TYPESAFE_API_KEY',
  vercel: 'AI_GATEWAY_API_KEY',
  cloudflare: 'the AI binding in wrangler.jsonc',
};

function parseOrder(value: string | undefined): ProviderId[] {
  const names = (value ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name !== '');
  if (names.length === 0) return [...DEFAULT_PROVIDER_ORDER];
  const order: ProviderId[] = [];
  for (const name of names) {
    const id = ALIASES[name];
    if (!id) {
      throw new Error(`JEV_PROVIDERS lists unknown provider "${name}"; use ${Object.keys(ALIASES).join(', ')}`);
    }
    if (!order.includes(id)) order.push(id);
  }
  return order;
}

function isBinding(value: unknown): value is JevBinding {
  return typeof value === 'object' && value !== null && typeof (value as { run?: unknown }).run === 'function';
}

function configured(env: JudgeEnv, id: ProviderId): ProviderConfig | undefined {
  switch (id) {
    case 'typesafe':
      return env.TYPESAFE_API_KEY
        ? {
            provider: 'typesafe',
            apiKey: env.TYPESAFE_API_KEY,
            baseUrl: env.TYPESAFE_BASE_URL || undefined,
            model: env.TYPESAFE_MODEL || undefined,
          }
        : undefined;
    case 'vercel':
      return env.AI_GATEWAY_API_KEY
        ? { provider: 'vercel', apiKey: env.AI_GATEWAY_API_KEY, model: env.AI_GATEWAY_MODEL || undefined }
        : undefined;
    case 'cloudflare':
      return isBinding(env.AI)
        ? { provider: 'cloudflare', ai: env.AI, model: env.CLOUDFLARE_AI_MODEL || undefined }
        : undefined;
  }
}

/**
 * Builds the Jev provider chain from the environment. `JEV_PROVIDERS` is the
 * switch: only listed providers are used, in the order given, and the default
 * is TypeSafe alone. The first listed provider with credentials is primary and
 * the others are fallbacks for credit, rate-limit and server failures. A
 * listed provider without credentials is skipped.
 */
export function judgeConfig(env: JudgeEnv): JudgeConfig {
  const order = parseOrder(env.JEV_PROVIDERS);
  const providers = order.map((id) => configured(env, id)).filter((p): p is ProviderConfig => p !== undefined);
  if (providers.length === 0) {
    throw new Error(
      `No Jev provider is configured for JEV_PROVIDERS=${order.join(',')}; set ${order
        .map((id) => CREDENTIAL[id])
        .join(' or ')} (see .dev.vars.example)`
    );
  }
  return { providers };
}
