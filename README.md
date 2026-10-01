# Jev Search

[![Jev Search homepage](public/og-home.png)](https://jev.s1.dev)

Search the web in plain language. [TypeSafe's Jev](https://typesafe.ai) chooses sources, time ranges and search terms, then ranks the results returned through [Search1API](https://www.search1api.com). You get links and snippets, with visible relevance scores and editable filters. No generated answers.

**[Try Jev Search](https://jev.s1.dev)**

Install it from the browser as an app (Add to Home Screen on iOS, Install app on Chrome and Edge). Searches still need a network connection; the installed app caches only an offline page, not results.

Built by Search1API. This is an independent project, not an official TypeSafe product.

## How it works

1. **Understand.** Jev answers typed questions about your request. The application uses those judgments to choose a query, sources and a time range. You can override the source and time chips.
2. **Search.** Google, DuckDuckGo and Yandex search the open web. Hacker News, Reddit and GitHub each combine a Google site-restricted search with their dedicated engine (Hacker News uses the news endpoint). X, arXiv, YouTube, Wikipedia, IMDb and WeChat use vertical engines. Calls run concurrently; one failed engine does not discard another engine's results.
3. **Rank.** Jev scores each result for relevance. Results are merged by URL, ordered by relevance, engine agreement and original rank, and streamed as each lane finishes. Lower-scoring results are grouped separately. A failed source shows a warning rather than a zero-result count.

Try “Rust async runtimes on Hacker News this month”, “What do Reddit users think of the Framework laptop?”, or “New papers on speculative decoding”. These are plain-language requests, not hardcoded filters; the last one names no source or time and lets Jev choose. Model choices and provider coverage can vary.

Each request is sent to both providers: the Jev provider reads it and Search1API searches with the query derived from it. Jev Search itself does not store queries or result clicks.

The application streams newline-delimited JSON from `POST /api/ask`: `intent` (including `judge`, the Jev provider that answered), `found` (progress counts), `lane` (ranked results), and `done`. Each engine has a 15-second deadline within an overall 30-second request deadline. Google may start speculatively while Jev interprets the question. Successful, non-empty engine responses are cached for 10 minutes to 6 hours, depending on the time window.

The optional `s` source list is capped at the number of supported sources (currently 12 entries before filtering). Longer lists return HTTP 400 before any provider calls. Repeated valid sources are merged, preserving their first occurrence, so repeating a source cannot multiply search or ranking calls. Selecting all supported sources remains allowed.

## Local development

Requires Node.js 22.12+ and pnpm 10.8.0. Obtain an API key from [Search1API](https://www.search1api.com) and credentials for at least one Jev provider: [TypeSafe](https://typesafe.ai), [Cloudflare Workers AI](https://developers.cloudflare.com/ai/models/typesafe/jev/) or [Vercel AI Gateway](https://vercel.com/ai-gateway/models/jev); see [Jev providers](#jev-providers).

```bash
git clone https://github.com/superagents-lab/jev-search.git
cd jev-search
corepack enable
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
# Set SEARCH1API_API_KEY and at least one Jev provider key in .dev.vars.
pnpm dev
```

Open http://localhost:3030. Local development uses local KV and rate-limit bindings; the Workers AI binding is remote and uses your `wrangler login` session. Keep `.dev.vars` private; it is ignored by Git. `.env.example` is provided as a variable reference, but `.dev.vars` is the documented local configuration.

```bash
pnpm generate-routes
pnpm cf-typegen
pnpm test
pnpm build
pnpm exec wrangler deploy --dry-run
```

Tests mock providers and do not need API keys. Building does not call any provider. `worker-configuration.d.ts` is generated from the Wrangler configuration and `.dev.vars.example`; regenerate it after changing bindings or secrets.

## Deploy to Cloudflare Workers

The application uses TanStack Start, React and the Cloudflare Vite plugin. You need a Cloudflare account with Workers and KV enabled.

1. Run `pnpm exec wrangler login`.
2. In `wrangler.jsonc`, choose a Worker `name`. Remove `routes` to use a `workers.dev` URL, or replace `jev.s1.dev` with a domain in your Cloudflare account. Update the origin in `src/lib/seo.ts`, `public/robots.txt` and `public/sitemap.xml` to match your deployment. Remove or replace the Cloudflare Web Analytics snippet in `src/routes/__root.tsx`; the committed token belongs to the hosted demo.
3. Run `pnpm exec wrangler kv namespace create jev-search-cache` and replace the `CACHE` namespace ID with the returned ID. The committed ID belongs to the hosted demo; it is not a credential.
4. Choose a unique rate-limit `namespace_id` in your account. The default limit is 10 searches per IP per minute per Cloudflare location; it is not a global spending cap. Searches triggered by source or time filter changes count toward the same limit. `CACHE` and `SEARCH_RATE_LIMIT` are optional; regenerate types after changing bindings.
5. Upload your own provider keys and deploy:

```bash
pnpm exec wrangler secret put SEARCH1API_API_KEY
pnpm exec wrangler secret put TYPESAFE_API_KEY   # or another Jev provider, see Jev providers below
pnpm cf-typegen
pnpm test
pnpm run deploy:dry-run
pnpm run deploy
```

Wrangler can create the Worker when uploading its first secret. Provider keys stay in Cloudflare secrets and are never included in the browser bundle. Each search can make several billable provider calls. Configure provider spending limits for a public deployment; the same-origin check is a browser boundary, not authentication.

### Jev providers

Jev is available from three services that answer the same questions. Any one of them is enough; the others are optional fallbacks.

| Provider | How it is called | What it needs |
| --- | --- | --- |
| `typesafe` | TypeSafe's own API or a Jev-compatible endpoint | `TYPESAFE_API_KEY` secret |
| `vercel` | Vercel AI Gateway, model `typesafe-ai/jev` | `AI_GATEWAY_API_KEY` secret |
| `cloudflare` | Workers AI binding `AI` in `wrangler.jsonc`, model `typesafe/jev` | Nothing; billed to your Cloudflare AI Gateway credits |

Configuration is read from the Worker environment. Secrets are uploaded with `wrangler secret put` and belong to one deployment; `vars` are committed defaults in `wrangler.jsonc`.

| Variable | Kind | Default | Meaning |
| --- | --- | --- | --- |
| `SEARCH1API_API_KEY` | secret, required | | Search1API key used for every engine call. |
| `JEV_PROVIDERS` | secret, optional | `typesafe` | Enabled Jev providers in order of preference, comma-separated, e.g. `vercel,typesafe,cloudflare`. Providers not listed stay off even when their credentials exist. The first listed provider with credentials is primary; the rest are fallbacks. A listed provider without credentials is skipped. |
| `TYPESAFE_API_KEY` | secret | | Enables `typesafe`. |
| `AI_GATEWAY_API_KEY` | secret | | Enables `vercel`. Create it in the Vercel dashboard under AI Gateway. |
| `TYPESAFE_BASE_URL` | var | `https://api.typesafe.ai` | Base URL for `typesafe`; `/v1/systemone` is appended. Set this to a local Jev-compatible server or custom gateway. A trailing slash is accepted. |
| `TYPESAFE_MODEL` | var | `jev-latest` | Model ID sent to TypeSafe. |
| `AI_GATEWAY_MODEL` | var | `typesafe-ai/jev` | Model ID sent to Vercel AI Gateway. |
| `CLOUDFLARE_AI_MODEL` | var | `typesafe/jev` | Model ID run through the Workers AI binding. |

A fresh deployment with only `SEARCH1API_API_KEY` and `TYPESAFE_API_KEY` uses TypeSafe alone. To add fallbacks, upload the extra credentials and set the order:

```bash
pnpm exec wrangler secret put AI_GATEWAY_API_KEY
echo "vercel,typesafe,cloudflare" | pnpm exec wrangler secret put JEV_PROVIDERS
```

A request moves to the next provider only when the current one fails with HTTP 402 (no credit), 429 (throttled) or 5xx. Client errors such as 400 or 401 are not retried, and nothing is retried after the request is cancelled. Each hop is logged as `[jev] <provider> returned HTTP <status>; retrying with <next>`, and the `intent` event's `judge` field names the provider that answered.

Provider notes:

- **TypeSafe** bills per token to your TypeSafe organization. Enable auto-reload there if it is your primary provider; without credit it returns 402. Self-hosters can set `TYPESAFE_BASE_URL` to a local Jev-compatible server or custom proxy without changing the provider chain.
- **Vercel** free-tier teams are rate-limited per model and return 429 after a few requests. Purchasing any AI Gateway credit moves the team to the paid tier, which removes the gateway's own limits. Jev is listed at no charge for input and output tokens on either tier; set a budget in Vercel in case that listing changes. The gateway's `boolean` answers map to TypeSafe's `noul` probabilities, and TypeSafe's confidence is read from the gateway's provider metadata.
- **Cloudflare** runs the model through the Workers AI binding, so it needs no key. Jev is a third-party model billed to Cloudflare AI Gateway prepaid credits; without a balance the binding fails with "Insufficient AI Gateway credits", which this app treats as 402. Local `pnpm dev` calls Workers AI remotely through your `wrangler login` session. Remove the `ai` block from `wrangler.jsonc` to drop this provider entirely.

`.dev.vars.example` lists every secret and is also the input for `pnpm cf-typegen`, so the generated `worker-configuration.d.ts` does not depend on a developer's private `.dev.vars`. Add new secrets there first.

GitHub Actions validates pull requests and pushes with tests, type generation and a production build. The hosted demo deploys through Cloudflare Workers Builds when changes are pushed to `main`.

For Cloudflare's Git integration, use these settings:

| Setting | Value |
| --- | --- |
| Root directory | Repository root (`/`) |
| Production branch | `main` |
| Build command | `pnpm run build` |
| Deploy command | `pnpm exec wrangler deploy` |
| Node.js version | 22.12+ |

Cloudflare installs dependencies from `pnpm-lock.yaml`. The build creates the Worker and static assets and writes the Wrangler deployment configuration. Keep the existing provider keys in the Worker's runtime secrets; builds do not need them. For manual self-hosting, `pnpm run deploy` combines the build and deploy steps.

## Data and limitations

- Search requests go to Search1API and to the Jev provider that answers them: TypeSafe directly, or Cloudflare Workers AI or Vercel AI Gateway, which forward to TypeSafe. The Jev provider also receives result titles and snippets for relevance scoring. Search1API queries the selected engines.
- Cloudflare KV stores query-derived cache keys and result snippets for the configured TTL. Removing `CACHE` disables this cache.
- The application does not record search text, inferred queries or result clicks in its own analytics.
- The hosted demo loads a [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/) beacon for page views, visits, referrers, country, browser and page-load metrics. It does not use cookies and does not record URL query strings, so search terms in `/search?q=` are not stored there. Self-hosters can remove the snippet in `src/routes/__root.tsx`.
- The rate limiter uses the client IP. Cloudflare Workers request logging is enabled separately in the configuration; invocation logs include request URLs, which may contain the search query.
- The page loads a font from Google Fonts. Result links lead to third-party sites.
- Production builds register a service worker so the app can be installed. It intercepts only top-level navigations when the network fails, and never `/api/ask`. Local `pnpm dev` does not register it, so Vite's module reload keeps working.
- The sitemap lists only `https://jev.s1.dev/`. `/search` pages send `noindex, follow` so example queries and user searches are not indexed as separate documents. `robots.txt` does not `Disallow: /search`, so crawlers can still see that directive.
- Relevance percentages are model judgments, not verified accuracy. Search snippets may be incorrect, incomplete or stale. Date filtering and Newest sorting prefer Search1API's `published_date`, falling back to snippet dates when unavailable. Day-only dates are displayed as calendar dates and filtered with allowance for the unknown time of day; unknown dates can remain. Selecting and ranking existing results does not verify their claims.

## Project layout

| Path | Responsibility |
| --- | --- |
| `src/lib/sources.ts` | Sources, engine mappings and time windows |
| `src/lib/candidates.ts` | Search-query candidates |
| `src/lib/typesafe.ts` | Typed intent and relevance judgments |
| `src/lib/judge-config.ts` | Jev provider chain built from environment variables and bindings |
| `src/lib/search1api.ts` | Search provider client and engine deadlines |
| `src/lib/pipeline.ts` | Concurrent search and ranking stream |
| `src/lib/cache.ts` | Per-engine response cache |
| `src/lib/rank.ts`, `merge.ts` | Ordering, grouping and URL deduplication |
| `src/lib/use-ask.ts` | Client stream consumer |
| `src/lib/seo.ts` | Hosted origin, canonical URL and search-page robots |
| `src/routes/api/ask.ts` | Search endpoint, origin validation and rate limiting |
| `public/robots.txt`, `public/sitemap.xml` | Crawl hints for the homepage only |
| `src/server/` | Cloudflare bindings |
| `test/` | Provider-independent regression tests |

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines and [SECURITY.md](SECURITY.md) for vulnerability reporting.

## License and attribution

Application code is [MIT licensed](LICENSE). TypeSafe and Jev names and brand assets belong to their respective owners and are not included in this project's MIT license.

The favicon and Apple Touch Icon come from the icon links on [typesafe.ai](https://typesafe.ai/): [favicon](https://framerusercontent.com/images/aNFzSFxM4fjICmnibw7npfZjcQ.png) and [Apple Touch Icon](https://framerusercontent.com/images/kcuF2BEp5XaVfkmFB634IPRKQH0.png). The PWA icons in `public/` are resized from the Apple Touch Icon. Most source icons use [Simple Icons](https://simpleicons.org). Google uses the four-colour G; Yandex uses the official 2021 mark (white Я in a red circle). Interface icons use [Lucide](https://lucide.dev). For your own branding, replace the icons in `public/` and update `src/components/wordmark.tsx`, `public/manifest.webmanifest` and the page metadata.
