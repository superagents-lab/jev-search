---
title: A query for each engine
date: 2026-10-22
summary: Each engine now gets its own span of your words. Jev picks it, and Cloudflare's Clairic writes it for Hacker News, Reddit and GitHub, the same selection as the Ask API.
---
Jev Search used to send one query to every engine. Each engine now gets its own query, always copied from your own words. Nothing is translated or added.

- **Jev** picks the span that suits each engine. A film question sends `Past Lives` to IMDb and Wikipedia but `directed the movie Past Lives` to the web engines.
- **Cloudflare's [Clairic](https://developers.cloudflare.com/workers-ai/models/clairic/)** writes the query for Hacker News, Reddit and GitHub, where keyword search rewards a tight subject. It runs alongside Jev's choice of sources and time window. On “GitHub에서 Docker 없이 Windows에서 실행되는 OCR 프로젝트를 찾아줘” GitHub is searched for `OCR`.
- **Requests that name two platforms are split.** “On GitHub find FastAPI JWT authentication examples; on Reddit find FastAPI production performance experiences.” sends each half to its own engine.

Hacker News, Reddit and GitHub now search only their own engines. The extra Google searches restricted to those sites are gone, because the search service already does that inside its own engines.

This is the same query selection as Search1API's [Ask API](https://s1.dev/ask-api?utm_source=jev-search&utm_medium=changelog). If Clairic is unavailable, Jev picks those queries too. If both fail, the request is sent as you typed it.
