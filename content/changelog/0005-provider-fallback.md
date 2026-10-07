---
title: Jev now runs on three providers with automatic fallback
date: 2026-09-19
summary: Jev Search can call Jev through TypeSafe, Vercel AI Gateway and Cloudflare Workers AI, and moves to the next provider when one is out of credit, throttled or down.
---
Every search depends on the decision model. When it ran on TypeSafe's API alone, a single problem there, such as an empty credit balance, failed every search with HTTP 402.

The same Jev model is also available through [Vercel AI Gateway](https://vercel.com/ai-gateway/models/jev) and [Cloudflare Workers AI](https://developers.cloudflare.com/ai/models/typesafe/jev/). Jev Search now speaks all three and tries them in a configured order.

## When it switches

- A request moves to the next provider only when the current one returns HTTP 402 (no credit), 429 (throttled) or a 5xx error.
- Client errors such as 400 or 401 are not retried, because another provider would reject the same request.
- Nothing is retried after you cancel a search.

The progress details show which provider interpreted your request. For self-hosters, the order is set with the `JEV_PROVIDERS` secret, and providers not listed stay off even when their credentials exist. The [README](https://github.com/superagents-lab/jev-search#decision-providers) documents every setting.
