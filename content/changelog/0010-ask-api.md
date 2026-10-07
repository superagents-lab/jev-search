---
title: Jev Search is now an API
date: 2026-10-07
summary: The pipeline behind Jev Search is available to your own agents as Search1API's Ask API. One POST /ask request returns on-topic, deduplicated, scored results.
---
What Jev Search does for a person, Search1API's [Ask API](https://s1.dev/ask-api?utm_source=jev-search&utm_medium=changelog) now does for an agent. Send a plain-language request to `POST https://api.search1api.com/ask` and get back chosen, scored and deduplicated results as JSON.

## What one request does

- **Intent detection.** The decision model picks the keyword query and time window. Pass `time_range` to set the window yourself.
- **Engine routing.** It scores 12 engines, including Google, Reddit, Hacker News, GitHub, arXiv, X and YouTube, and searches up to five in parallel. Pass `sources` to choose them yourself.
- **Reranking.** Every result gets a relevance score. Results below 0.5 are dropped, duplicates across engines are merged, and each result keeps its score.

An agent that calls one search tool after another reads every engine's top results whether they fit or not. Ask makes those choices in one call and returns only what is on topic, so the agent reads less and spends fewer tokens.

## Pricing

A completed request costs a flat 5 credits, however many engines it searches, with the model calls included. If no engine completes, the request is not charged. New accounts get 100 free credits, enough for 20 requests. The API currently uses TypeSafe's Jev. See the [API documentation](https://s1.dev/docs/basic/ask?utm_source=jev-search&utm_medium=changelog) for parameters and response fields.
