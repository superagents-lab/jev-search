import { createServerFn } from '@tanstack/react-start';
import { env } from 'cloudflare:workers';
import { repositoryStars } from '@/lib/github-stars';

/** Runs on the Worker, so visitors' browsers never contact GitHub for the count. */
export const getRepositoryStars = createServerFn({ method: 'GET' }).handler(() => {
  // Both bindings are optional: without CACHE every miss asks GitHub, without a token requests are anonymous.
  const workerEnv = env as { CACHE?: KVNamespace; GITHUB_TOKEN?: string };
  return repositoryStars({ cache: workerEnv.CACHE, token: workerEnv.GITHUB_TOKEN || undefined });
});
