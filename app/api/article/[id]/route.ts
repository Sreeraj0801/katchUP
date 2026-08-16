import { NextResponse } from "next/server";
import { initDb, getDb } from "@/lib/db";
import { generateTldr } from "@/lib/gemini";
import { fallbackImageUrl } from "@/lib/images";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  await initDb();
  const db = getDb();
  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const [articleRes, catsRes] = await Promise.all([
    db.query("SELECT * FROM articles WHERE id = $1", [id]),
    db.query("SELECT category, score FROM article_categories WHERE article_id = $1", [id]),
  ]);

  if (articleRes.rowCount === 0) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  let article = articleRes.rows[0];

  if (
    (!article.tldr_bullets || article.tldr_bullets.length === 0) &&
    article.content
  ) {
    try {
      const tldr = await generateTldr(article.title, article.content);
      await db.query(
        "UPDATE articles SET tldr_bullets = $1 WHERE id = $2",
        [tldr, id]
      );
      article = { ...article, tldr_bullets: tldr };
    } catch (err) {
      console.error("TLDR generation failed:", err);
    }
  }

  const topCategory = catsRes.rows[0]?.category || "AI";
  const hasImage = !!article.image_url;
  const image_url = article.image_url || fallbackImageUrl(topCategory, article.title);

  return NextResponse.json({
    article: { ...article, image_url, image_is_fallback: hasImage ? article.image_is_fallback : true, categories: catsRes.rows },
  });
}
