---
title: First community contributions
date: 2026-10-01
summary: The first pull requests from outside contributors are merged, including a configurable TypeSafe endpoint for self-hosters and clearer documentation for local development and caching.
---
Jev Search is open source, and this week the first pull requests from people outside the project were merged. Thank you to both contributors.

- **Configurable TypeSafe endpoint** by [xujiantop-crypto](https://github.com/superagents-lab/jev-search/pull/11). The new `TYPESAFE_BASE_URL` setting points the `typesafe` provider at a local Jev-compatible server or a custom gateway, without changing the provider chain.
- **Local development setup** by [dajiaohuang](https://github.com/superagents-lab/jev-search/pull/8). The README now states that `pnpm dev` opens a remote Workers AI session at startup, even when no Cloudflare provider is enabled, so you need `wrangler login` or a `CLOUDFLARE_API_TOKEN` first.
- **Cache disclosure** by [dajiaohuang](https://github.com/superagents-lab/jev-search/pull/10). The README now says exactly what the KV cache stores (the normalized engine query and the returned snippets) and for how long.

Issues and pull requests are welcome on [GitHub](https://github.com/superagents-lab/jev-search).
