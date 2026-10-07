---
title: Jev Search launches: plain-language web search, ranked by a decision model
date: 2026-09-18
summary: Jev Search is live and open source. TypeSafe's Jev reads a plain-language request, chooses the search engines and time window, and ranks every result. No generated answers.
try: Rust async runtimes on Hacker News this month
---
Jev Search is a search engine for requests written the way you would ask a person. Type "Rust async runtimes on Hacker News this month" and it does not look for those exact words. A decision model reads the request first and decides how to search.

## How a search runs

- **Understand.** [TypeSafe's Jev](https://typesafe.ai) answers typed questions about your request: which keyword query fits it, which sources it calls for, and whether it implies a time window. You can override the source and time chips afterwards.
- **Search.** The chosen engines run in parallel through [Search1API](https://www.search1api.com): Google and DuckDuckGo for the open web, Hacker News, Reddit and GitHub through a site search plus their own engines, and dedicated engines for X, arXiv, YouTube, Wikipedia, IMDb and WeChat.
- **Rank.** Jev scores every result for relevance. Results are merged by URL and ordered by relevance, agreement between engines and original rank. Off-topic results are grouped at the bottom instead of mixed in.

Results stream in as each engine finishes, and the page shows its work: the query it chose, the sources it is asking, and how many results each returned. Each relevance score is visible next to its result.

## What it does not do

Jev Search does not write answers. It returns links and snippets, so every claim on the page can be traced to its source.

The code is MIT-licensed on [GitHub](https://github.com/superagents-lab/jev-search). Jev Search is built by Search1API and is not an official TypeSafe product.
