import type { JevBinding, JudgeConfig, ProviderConfig, ProviderId } from './typesafe';

/** The environment that selects a decision model. Variables are plain strings; `AI` is a Workers AI binding. */
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
  clef: 'clef',
  'clef-flash': 'clef-flash',
  'cloudflare-clef': 'clef',
  'cloudflare-clef-flash': 'clef-flash',
};

const CREDENTIAL: Record<ProviderId, string> = {
  typesafe: 'TYPESAFE_API_KEY',
  vercel: 'AI_GATEWAY_API_KEY',
  cloudflare: 'the AI binding in wrangler.jsonc',
  clef: 'the AI binding in wrangler.jsonc',
  'clef-flash': 'the AI binding in wrangler.jsonc',
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
    case 'clef':
    case 'clef-flash':
      return isBinding(env.AI) ? { provider: id, ai: env.AI } : undefined;
  }
}

/**
 * Builds the decision provider chain from the environment. `JEV_PROVIDERS` is the
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
      `No decision provider is configured for JEV_PROVIDERS=${order.join(',')}; set ${order
        .map((id) => CREDENTIAL[id])
        .join(' or ')} (see .dev.vars.example)`
    );
  }
  return { providers };
}

export interface ModelOption {
  id: string;
  label: string;
}

function modelOption(config: ProviderConfig): ModelOption {
  if (config.provider === 'clef') return { id: 'clef', label: 'Clef' };
  if (config.provider === 'clef-flash') return { id: 'clef-flash', label: 'Clef-flash' };
  const name = ('model' in config ? config.model : undefined) ?? (
    config.provider === 'typesafe' ? 'jev-latest' :
    config.provider === 'vercel' ? 'typesafe-ai/jev' : 'typesafe/jev'
  );
  if (['jev', 'jev-latest', 'typesafe-ai/jev', 'typesafe/jev'].includes(name)) {
    return { id: 'jev', label: 'Jev' };
  }
  return { id: `model:${encodeURIComponent(name)}`, label: name };
}

/** Distinct models available through the enabled provider chain, in configured order. */
export function configuredModels(config: JudgeConfig): ModelOption[] {
  const options = new Map<string, ModelOption>();
  for (const provider of config.providers) {
    const option = modelOption(provider);
    options.set(option.id, option);
  }
  return [...options.values()];
}

/** A named model keeps only routes for that model; auto retains the full fallback chain. */
export function selectModel(config: JudgeConfig, model: string | undefined): JudgeConfig {
  if (!model || model === 'auto') return config;
  const providers = config.providers.filter((provider) => modelOption(provider).id === model);
  if (providers.length === 0) throw new Error('Selected model is not available');
  return { providers };
}
