import { env as workerEnv } from 'cloudflare:workers';
import { judgeConfig } from '@/lib/judge-config';

export function getEnv() {
  // Optional bindings and secrets may be removed by self-hosters without changing application code.
  const env: typeof workerEnv & {
    CACHE?: KVNamespace;
    SEARCH_RATE_LIMIT?: RateLimit;
    AI?: Ai;
    TYPESAFE_API_KEY?: string;
    AI_GATEWAY_API_KEY?: string;
    OPENAI_API_KEY?: string;
    JEV_PROVIDERS?: string;
  } = workerEnv;
  if (!env.SEARCH1API_API_KEY) {
    throw new Error('SEARCH1API_API_KEY is not set (see .dev.vars.example)');
  }
  // Throws when no Jev provider has credentials.
  judgeConfig(env);
  return env;
}

/** The Jev provider chain derived from the Worker environment. */
export function getJudgeConfig(env: ReturnType<typeof getEnv>) {
  return judgeConfig(env);
}
