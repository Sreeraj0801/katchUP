import { NextResponse } from "next/server";
import { initDb, getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await initDb();
  const db = getDb();
  const { anonId, articleId } = await request.json();

  if (!anonId || !articleId) {
    return NextResponse.json({ error: "anonId and articleId required" }, { status: 400 });
  }

  const exists = await db.query("SELECT id FROM articles WHERE id = $1", [articleId]);
  if (exists.rowCount === 0) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  const like = await db.query("SELECT id FROM likes WHERE anon_id = $1 AND article_id = $2", [anonId, articleId]);
  if (like.rowCount === 0) {
    await db.query(
      `INSERT INTO likes (anon_id, article_id) VALUES ($1, $2)
       ON CONFLICT (anon_id, article_id) DO NOTHING`,
      [anonId, articleId]
    );
    return NextResponse.json({ ok: true, liked: true });
  }

  await db.query("DELETE FROM likes WHERE anon_id = $1 AND article_id = $2", [anonId, articleId]);
  return NextResponse.json({ ok: true, liked: false });
}
