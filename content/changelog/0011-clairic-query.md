---
title: Cleaner engine queries with Clairic
date: 2026-10-22
summary: Cloudflare's Clairic extraction model now writes the query every engine receives, keeping the subject and what you ask about it while dropping time, site and filler words.
---
Jev Search now sends engines a query extracted by Cloudflare's [Clairic](https://developers.cloudflare.com/workers-ai/models/clairic/) model. Clairic copies a span of your own words: the subject together with what you want to know about it. Words that only say when, where to look or how you phrased the question are left out, because the time and source chips already apply them.

- “reddit threads complaining about Cursor pricing in the last 3 days” searches Reddit for `Cursor pricing`.
- “公众号上关于小米汽车 YU7 的评测” searches for `小米汽车 YU7`.
- “Cloudflare outage today” keeps `Cloudflare outage`, not just `Cloudflare`.

Clairic runs at the same time as Jev's choice of sources and time window. Clairic never translates or adds words. If it is unavailable or slow, the request is sent as you typed it.
