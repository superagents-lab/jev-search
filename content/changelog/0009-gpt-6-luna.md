---
title: GPT-6 Luna joins the model selector
date: 2026-10-07
summary: OpenAI's GPT-6 Luna, served through the new Decisions API, is now a fourth model in the Jev Search model selector, and the footer credits whichever model you chose.
try: What are developers saying about Bun this month?
---
OpenAI's [Decisions API](https://developers.openai.com/api/docs/guides/decisions) answers typed questions with calibrated probabilities instead of generating text: whether a condition holds, which of several options fits, or how well something meets a rubric. That is the kind of model Jev Search is built on, so GPT-6 Luna is now available next to Jev, Clef and Clef-flash.

## Using it

Choose **GPT-6 Luna** in the model menu of the search box. An explicit choice uses only GPT-6 Luna for that search: it chooses the sources, time window and query, then scores each result. Auto keeps the existing default and reaches GPT-6 Luna only as a fallback.

The footer now credits the model you selected instead of always naming Jev, and links to that model's documentation.

## Notes

- The Decisions API is in public beta, so its behaviour may change before general availability.
- GPT-6 Luna accepts images, but Jev Search sends text only.
- Self-hosters enable it with an `OPENAI_API_KEY` secret and `openai` in `JEV_PROVIDERS`.
