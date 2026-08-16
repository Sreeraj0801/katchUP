import { getDb } from "./db";
import { fetchAllFeeds, extractArticle } from "./rss";
import { summarizeAndClassify } from "./gemini";
import { classifyWithKeywords } from "./classify-fallback";
import { fallbackImageUrl } from "./images";

function isQuotaError(err: any): boolean {
  const status = err?.status ?? err?.code;
  const msg = String(err?.message || err || "");
  return status === 429 || /RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(msg);
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    if (isQuotaError(err)) throw err; // don't burn retries on a quota wall
    console.warn(`${label} failed, retrying once...`);
    await new Promise((r) => setTimeout(r, 1000));
    try {
      return await fn();
    } catch (err2) {
      console.error(`${label} failed after retry:`, (err2 as any)?.message || err2);
      return null;
    }
  }
}

export async function runIngestion(limit = 30) {
  const db = getDb();

  const raw = await fetchAllFeeds();
  if (raw.length === 0) return { inserted: 0, total: 0 };

  const links = raw.map((r) => r.link);
  const canonicals = raw.map((r) => r.canonicalLink || r.link);
  const existing = await db.query(
    "SELECT link, canonical_link FROM articles WHERE link = ANY($1) OR canonical_link = ANY($2)",
    [links, canonicals]
  );
  const existingSet = new Set(existing.rows.flatMap((r) => [r.link, r.canonical_link]));

  const newItems = raw
    .filter((r) => !existingSet.has(r.link) && !existingSet.has(r.canonicalLink || r.link))
    .sort((a, b) => (b.publishedAt?.getTime() || 0) - (a.publishedAt?.getTime() || 0))
    .slice(0, limit);

  let inserted = 0;
  let llmUsed = 0;
  let heuristicUsed = 0;
  let llmExhausted = false;

  for (const item of newItems) {
    const extracted = await withRetry(() => extractArticle(item), `Extract ${item.link}`);
    if (!extracted || extracted.content.length < 40) {
      console.warn(`Skipping ${item.link}: not enough content`);
      continue;
    }

    let classified: Awaited<ReturnType<typeof summarizeAndClassify>> | null = null;

    if (!llmExhausted) {
      try {
        classified = await withRetry(
          () => summarizeAndClassify(item.title, extracted.content),
          `Classify ${item.link}`
        );
        if (classified) llmUsed++;
      } catch (err) {
        if (isQuotaError(err)) {
          // Free tier is capped per day. Fall back to keywords for the rest of
          // the run instead of failing the whole ingest.
          console.warn("LLM quota exhausted - continuing with keyword classification");
          llmExhausted = true;
        } else {
          console.error(`Classify ${item.link} errored:`, (err as any)?.message || err);
        }
      }
    }

    if (!classified || classified.categories.length === 0) {
      classified = classifyWithKeywords(item.title, extracted.content, item.description);
      if (classified.categories.length > 0) heuristicUsed++;
    }

    if (classified.categories.length === 0) {
      console.warn(`Skipping ${item.link}: no categories matched`);
      continue;
    }

    const topCategory = classified.categories[0].category;
    const imageUrl = extracted.imageIsFallback
      ? fallbackImageUrl(topCategory, item.title)
      : extracted.imageUrl;

    const articleRes = await db.query(
      `INSERT INTO articles (title, link, canonical_link, source, published_at, summary, tldr_bullets, content, image_url, image_is_fallback)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        item.title,
        item.link,
        item.canonicalLink,
        item.source,
        item.publishedAt || new Date(),
        classified.summary,
        classified.tldr,
        extracted.content,
        imageUrl,
        extracted.imageIsFallback,
      ]
    );
    const articleId = articleRes.rows[0].id;

    for (const c of classified.categories) {
      await db.query(
        `INSERT INTO article_categories (article_id, category, score)
         VALUES ($1, $2, $3)
         ON CONFLICT (article_id, category) DO NOTHING`,
        [articleId, c.category, c.score]
      );
    }
    inserted++;
  }

  return {
    inserted,
    total: newItems.length,
    classifiedByLlm: llmUsed,
    classifiedByKeywords: heuristicUsed,
    llmQuotaExhausted: llmExhausted,
  };
}
