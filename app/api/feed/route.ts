import { NextResponse } from "next/server";
import { initDb, getDb } from "@/lib/db";
import { TAXONOMY } from "@/lib/categories";
import { rankArticles, THRESHOLD } from "@/lib/rank";
import { fallbackImageUrl } from "@/lib/images";

const PAGE_SIZE = 10;

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await initDb();
  const db = getDb();
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

  const [articlesRes, likesRes, totalLikesRes] = await Promise.all([
    db.query(
      `SELECT a.id, a.title, a.link, a.source, a.published_at, a.summary, a.tldr_bullets, a.content, a.image_url, a.image_is_fallback,
              json_agg(json_build_object('category', ac.category, 'score', ac.score)) AS categories
       FROM articles a
       JOIN article_categories ac ON a.id = ac.article_id
       WHERE ac.category = ANY($1) AND ac.score >= $2
       GROUP BY a.id
       ORDER BY a.published_at DESC
       LIMIT $3`,
      [selected, THRESHOLD, 200]
    ),
    anonId
      ? db.query(
          `SELECT l.article_id, array_agg(ac.category) AS categories
           FROM likes l
           JOIN article_categories ac ON l.article_id = ac.article_id
           WHERE l.anon_id = $1
           GROUP BY l.article_id`,
          [anonId]
        )
      : Promise.resolve({ rows: [] }),
    anonId
      ? db.query(
          `SELECT COUNT(*) FROM likes WHERE anon_id = $1`,
          [anonId]
        )
      : Promise.resolve({ rows: [{ count: 0 }] }),
  ]);

  const likedIds = new Set<number>(likesRes.rows.map((r: any) => r.article_id));
  const likeCounts: Record<string, number> = {};
  for (const row of likesRes.rows) {
    for (const c of row.categories || []) {
      likeCounts[c] = (likeCounts[c] || 0) + 1;
    }
  }
  const totalLikes = parseInt(totalLikesRes.rows[0]?.count || "0", 10);

  const articles = articlesRes.rows.map((r: any) => {
    const cats = r.categories.filter((c: any) => c.category && selected.includes(c.category));
    const topCategory = cats[0]?.category || selected[0] || "AI";
    const hasImage = !!r.image_url;
    const image_url = r.image_url || fallbackImageUrl(topCategory, r.title);
    return {
      ...r,
      categories: cats,
      image_url,
      image_is_fallback: hasImage ? r.image_is_fallback : true,
    };
  });

  const ranked = rankArticles(articles, selected, likeCounts, totalLikes, likedIds);
  const page = ranked.slice(cursor, cursor + PAGE_SIZE);
  const nextCursor = cursor + page.length < ranked.length ? cursor + page.length : null;

  return NextResponse.json({
    articles: page,
    nextCursor,
    total: ranked.length,
  });
}
