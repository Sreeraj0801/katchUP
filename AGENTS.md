# NewsReel — project notes

Reels-style news feed. Next.js 14 (App Router) + PostgreSQL + Gemini.

## Commands

```bash
npm run dev          # dev server
npm run build        # production build (also runs lint + typecheck)
npx tsc --noEmit     # typecheck only
```

Requires `DATABASE_URL` and `GEMINI_API_KEY` (see `.env.example`).

## Jobs

Ingest and retention run as HTTP routes so the same code path works locally and
behind a scheduler later. `scripts/job.mjs` calls them against a running server.

```bash
npm run ingest           # pull new articles (default limit 40)
npm run ingest -- 100    # custom limit
npm run prune:dry        # show what retention would remove — changes nothing
npm run prune            # apply retention
npm run jobs             # ingest, then prune
```

Target another port with `BASE_URL=http://localhost:3001 npm run jobs`.

When `CRON_SECRET` is set, `/api/ingest` and `/api/cron/prune` require
`Authorization: Bearer <secret>`. Unset for local dev.

## Retention

`RETENTION_STRIP_DAYS` (default 7) — null out `content` (full article text).
`RETENTION_DELETE_DAYS` (default 30) — delete the article entirely.
Liked articles are never deleted. Headline/summary/TLDR/image survive stripping,
so cards and deep links keep working; the reader shows the summary plus a link
to the source when `content` is gone.

Sizing: ~3.8 KB per article, of which `content` is ~79%. Stripped rows are
~800 bytes. At 100 articles/day that is ~139 MB/year unpruned, ~29 MB/year with
the policy above.

## Gemini quota

The free tier allows **20 requests/day**. When it is exhausted, ingestion falls
back to `lib/classify-fallback.ts` (keyword classifier, scores capped at 0.8 so
real LLM classifications always outrank it). Ingest keeps working, but summaries
are weaker. `runIngestion` reports `classifiedByLlm` / `classifiedByKeywords` /
`llmQuotaExhausted`.

## Gotchas

- **Smooth scroll fights `onScroll`.** Programmatic scrolls go through
  `goToIndex()`, which sets `scrollLockUntil` to suppress the intermediate
  events. Without it `activeIndex` flickers and read-aloud repeats a card.
- **Card artwork layering.** The category gradient is the *base* layer and the
  photo sits above it (`CardImage`). Rendering the gradient last hides the photo.
- **Read-aloud is driven by one effect** keyed on `[readAloudAutoPlay,
  activeIndex]`. Do not also call `speak()` from the click handler — the second
  `cancel()` kills the first utterance and nothing plays.
- Browser TTS only; the Google GenAI SDK exposes no TTS endpoint here.
