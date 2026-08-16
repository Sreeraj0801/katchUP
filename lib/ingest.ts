import { initDb, articles, nextArticleId } from "./mongo";
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
  await initDb();
  const col = await articles();

  const raw = await fetchAllFeeds();
  if (raw.length === 0) return { inserted: 0, total: 0 };

  const links = raw.map((r) => r.link);
  const canonicals = raw.map((r) => r.canonicalLink || r.link);
  const existing = await col
    .find(
      { $or: [{ link: { $in: links } }, { canonical_link: { $in: canonicals } }] },
      { projection: { link: 1, canonical_link: 1 } }
    )
    .toArray();
  const existingSet = new Set(existing.flatMap((r) => [r.link, r.canonical_link]));

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

    // Categories are embedded, so the article and its classifications land in a
    // single write instead of an insert plus one row per category.
    try {
      await col.insertOne({
        id: await nextArticleId(),
        title: item.title,
        link: item.link,
        canonical_link: item.canonicalLink || null,
        source: item.source,
        published_at: item.publishedAt || new Date(),
        summary: classified.summary,
        tldr_bullets: classified.tldr || [],
        content: extracted.content,
        image_url: imageUrl,
        image_is_fallback: extracted.imageIsFallback,
        created_at: new Date(),
        categories: classified.categories.map((c) => ({
          category: c.category,
          score: c.score,
        })),
      });
    } catch (err: any) {
      // Unique index on link/canonical_link: a concurrent run already took it.
      if (err?.code === 11000) {
        console.warn(`Skipping ${item.link}: already ingested`);
        continue;
      }
      throw err;
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
