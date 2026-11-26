import { createFileRoute } from '@tanstack/react-router';
import { configuredModels } from '@/lib/judge-config';
import { getEnv, getJudgeConfig } from '@/server/env.server';

export const Route = createFileRoute('/api/models')({
  server: {
    handlers: {
      GET: () => {
        try {
          const env = getEnv();
          const models = configuredModels(getJudgeConfig(env));
          // The page needs the public Turnstile site key only when the server checks tokens.
          const turnstileSiteKey = env.TURNSTILE_SECRET_KEY && env.TURNSTILE_SITE_KEY ? env.TURNSTILE_SITE_KEY : null;
          return Response.json({ models, turnstileSiteKey }, { headers: { 'Cache-Control': 'no-store' } });
        } catch {
          return Response.json({ error: 'Models are unavailable' }, { status: 503 });
        }
      },
    },
  },
});
