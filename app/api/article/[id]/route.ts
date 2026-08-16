import { NextResponse } from "next/server";
import { initDb, articles } from "@/lib/mongo";
import { generateTldr } from "@/lib/gemini";
import { fallbackImageUrl } from "@/lib/images";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  await initDb();
  const id = parseInt(params.id, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const col = await articles();
  let article = await col.findOne({ id });

  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  if ((!article.tldr_bullets || article.tldr_bullets.length === 0) && article.content) {
    try {
      const tldr = await generateTldr(article.title, article.content);
      await col.updateOne({ id }, { $set: { tldr_bullets: tldr } });
      article = { ...article, tldr_bullets: tldr };
    } catch (err) {
      console.error("TLDR generation failed:", err);
    }
  }

  const categories = article.categories || [];
  const topCategory = categories[0]?.category || "AI";
  const hasImage = !!article.image_url;
  const image_url = article.image_url || fallbackImageUrl(topCategory, article.title);

  const { _id, ...rest } = article as any;

  return NextResponse.json({
    article: {
      ...rest,
      image_url,
      image_is_fallback: hasImage ? article.image_is_fallback : true,
      categories,
    },
  });
}
