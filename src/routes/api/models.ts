import { createFileRoute } from '@tanstack/react-router';
import { configuredModels } from '@/lib/judge-config';
import { getEnv, getJudgeConfig } from '@/server/env.server';

export const Route = createFileRoute('/api/models')({
  server: {
    handlers: {
      GET: () => {
        try {
          const models = configuredModels(getJudgeConfig(getEnv()));
          return Response.json({ models }, { headers: { 'Cache-Control': 'no-store' } });
        } catch {
          return Response.json({ error: 'Models are unavailable' }, { status: 503 });
        }
      },
    },
  },
});
