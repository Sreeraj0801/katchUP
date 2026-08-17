import { NextResponse } from "next/server";
import { initDb, articles, likes } from "@/lib/mongo";
import { TAXONOMY } from "@/lib/categories";
import { rankArticles, THRESHOLD } from "@/lib/rank";
import { fallbackImageUrl } from "@/lib/images";

const PAGE_SIZE = 10;
const CANDIDATE_LIMIT = 200;

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await initDb();
  const { searchParams } = new URL(request.url);
  const anonId = searchParams.get("anonId") || "";
  const catsParam = searchParams.get("categories") || "";
  const cursor = parseInt(searchParams.get("cursor") || "0", 10);

  const selected = catsParam
    .split(",")
    .map((c) => decodeURIComponent(c).trim())
    .filter((c) => TAXONOMY.includes(c as any));

  if (selected.length === 0) {
    return NextResponse.json({ error: "No valid categories selected" }, { status: 400 });
  }

  const [articlesCol, likesCol] = await Promise.all([articles(), likes()]);

  // Categories are embedded, so this replaces the old articles/article_categories
  // join with a single indexed query. $elemMatch is required so the category and
  // the score threshold are matched on the *same* array element.
  const [rows, likeRows] = await Promise.all([
    articlesCol
      .find({
        categories: { $elemMatch: { category: { $in: selected }, score: { $gte: THRESHOLD } } },
      })
      .sort({ published_at: -1 })
      .limit(CANDIDATE_LIMIT)
      .toArray(),
    anonId ? likesCol.find({ anon_id: anonId }).toArray() : Promise.resolve([]),
  ]);

  const likedIds = new Set<number>(likeRows.map((l) => l.article_id));

  // The old query derived per-category like counts via a join onto
  // article_categories. With categories embedded we can count them off the
  // liked articles directly.
  const likeCounts: Record<string, number> = {};
  if (likedIds.size > 0) {
    const likedArticles = await articlesCol
      .find({ id: { $in: Array.from(likedIds) } }, { projection: { categories: 1 } })
      .toArray();
    for (const a of likedArticles) {
      for (const c of a.categories || []) {
        likeCounts[c.category] = (likeCounts[c.category] || 0) + 1;
      }
    }
  }
  const totalLikes = likedIds.size;

  const mapped = rows.map((r) => {
    const cats = (r.categories || []).filter(
      (c) => c.category && selected.includes(c.category)
    );
    const topCategory = cats[0]?.category || selected[0] || "AI";
    const hasImage = !!r.image_url;
    const image_url = r.image_url || fallbackImageUrl(topCategory, r.title);
    return {
      id: r.id,
      title: r.title,
      link: r.link,
      source: r.source,
      published_at: r.published_at,
      summary: r.summary,
      tldr_bullets: r.tldr_bullets || [],
      content: r.content,
      image_url,
      image_is_fallback: hasImage ? r.image_is_fallback : true,
      categories: cats,
    };
  });

  const ranked = rankArticles(mapped as any, selected, likeCounts, totalLikes, likedIds);
  const page = ranked.slice(cursor, cursor + PAGE_SIZE);
  const nextCursor = cursor + page.length < ranked.length ? cursor + page.length : null;

  return NextResponse.json({
    articles: page,
    nextCursor,
    total: ranked.length,
  });
}
