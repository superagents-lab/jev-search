---
title: We no longer record what you search for
date: 2026-09-19
summary: Jev Search stopped storing search queries and result clicks. Page-view analytics stay, without cookies and without the query strings that contain your searches.
---
Early versions of Jev Search wrote each search query and each clicked result to Cloudflare Analytics Engine. The demo never needed that data, and it is hard to justify keeping a log of what people search for, so it is gone.

## What changed

- Search text, the query the model inferred from it and result clicks are no longer recorded in the application's own analytics.
- Page views are counted with [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/), which uses no cookies and does not record URL query strings. Search terms in `/search?q=` never reach it.

## What still sees your request

A search is sent to the decision model that interprets it and to Search1API, which queries the engines. Successful engine responses are cached for 10 minutes to six hours so repeated searches are faster, and Cloudflare's request logs include request URLs. The [README](https://github.com/superagents-lab/jev-search#data-and-limitations) lists every place a request goes and how long each copy is kept.
