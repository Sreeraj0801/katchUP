import { NextResponse } from "next/server";
import { initDb, articles, likes } from "@/lib/mongo";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await initDb();
  const { anonId, articleId } = await request.json();

  if (!anonId || !articleId) {
    return NextResponse.json({ error: "anonId and articleId required" }, { status: 400 });
  }

  const [articlesCol, likesCol] = await Promise.all([articles(), likes()]);

  const exists = await articlesCol.findOne({ id: articleId }, { projection: { _id: 1 } });
  if (!exists) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  // Toggle. deletedCount tells us whether a like existed, so this is a single
  // round trip instead of the old SELECT-then-INSERT/DELETE pair.
  const removed = await likesCol.deleteOne({ anon_id: anonId, article_id: articleId });
  if (removed.deletedCount > 0) {
    return NextResponse.json({ ok: true, liked: false });
  }

  await likesCol.updateOne(
    { anon_id: anonId, article_id: articleId },
    { $setOnInsert: { anon_id: anonId, article_id: articleId, created_at: new Date() } },
    { upsert: true }
  );
  return NextResponse.json({ ok: true, liked: true });
}
