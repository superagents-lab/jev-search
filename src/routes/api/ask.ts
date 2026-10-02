import { createFileRoute } from '@tanstack/react-router';
import { askStream, type AskEvent } from '@/lib/pipeline';
import { selectModel } from '@/lib/judge-config';
import { validateAskRequest } from '@/lib/validate';
import { getEnv, getJudgeConfig } from '@/server/env.server';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return request.headers.get('sec-fetch-site') === 'same-origin';
  return origin === new URL(request.url).origin;
}

function clientKey(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'anonymous'
  );
}

/**
 * POST /api/ask → newline-delimited JSON, one AskEvent per line, in the order
 * they happen: intent, then each source as it finishes, then done.
 */
export const Route = createFileRoute('/api/ask')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!sameOrigin(request)) return json(403, { error: 'forbidden' });

        let env: ReturnType<typeof getEnv>;
        try {
          env = getEnv();
        } catch (error) {
          return json(500, { error: error instanceof Error ? error.message : 'Missing configuration' });
        }

        let data: ReturnType<typeof validateAskRequest>;
        try {
          data = validateAskRequest(await request.json());
        } catch (error) {
          return json(400, { error: error instanceof Error ? error.message : 'Bad request' });
        }

        let judge: ReturnType<typeof getJudgeConfig>;
        try {
          judge = selectModel(getJudgeConfig(env), data.m);
        } catch (error) {
          return json(400, { error: error instanceof Error ? error.message : 'Invalid model' });
        }

        if (env.SEARCH_RATE_LIMIT) {
          const { success } = await env.SEARCH_RATE_LIMIT.limit({ key: clientKey(request) });
          if (!success) {
            return json(429, { error: 'Too many searches from this address. Try again in a minute.' });
          }
        }

        const deps = {
          search1api: { apiKey: env.SEARCH1API_API_KEY, baseUrl: env.SEARCH1API_BASE_URL },
          judge,
          cache: env.CACHE,
        };
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]);
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const send = (event: AskEvent | { type: 'error'; message: string }) =>
              controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
            try {
              for await (const event of askStream(deps, { request: data.q, window: data.w, sources: data.s }, signal)) {
                send(event);
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Search failed';
              console.error('[ask] failed', message);
              send({ type: 'error', message });
            } finally {
              controller.close();
            }
          },
        });
        return new Response(stream, {
          headers: {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Accel-Buffering': 'no',
          },
        });
      },
    },
  },
});
