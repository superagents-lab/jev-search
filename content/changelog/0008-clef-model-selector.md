---
title: Choose your decision model: Clef and Clef-flash arrive
date: 2026-10-02
summary: Cloudflare's Clef and Clef-flash decision models join Jev, and a model selector in the search box lets you choose which one interprets and ranks your search.
try: New papers on speculative decoding
---
Jev Search is no longer tied to one model. Cloudflare released two decision models of its own, [Clef](https://developers.cloudflare.com/workers-ai/models/clef/) and [Clef-flash](https://developers.cloudflare.com/workers-ai/models/clef-flash/), which answer the same kind of typed questions as Jev. Both are now available in Jev Search.

## The model selector

The search box has a model menu next to the input:

- **Auto** uses the default model and falls back to the others if it fails.
- **Jev**, **Clef** or **Clef-flash** uses only that model. A search never switches to a different model without telling you.

The chosen model is saved in the search URL, so a shared link reproduces the same choice, and the progress details name the model that interpreted the request.

## How they compare

In [Cloudflare's published comparison](https://blog.cloudflare.com/clef-decision-models/), Clef-flash has a median latency of 38.8 ms, Clef 209.3 ms and Jev 524.1 ms. Quality depends on the task: Clef scores higher than Jev on ToolRet, while Jev scores higher than both Clef models on BRIGHT. Those benchmarks do not measure source selection or result ranking, so the best way to compare them is to run the same search with each model.
