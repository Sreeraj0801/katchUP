import { NextResponse } from "next/server";
import { initDb, getDb } from "@/lib/db";
import { TAXONOMY } from "@/lib/categories";

const DEFAULT_SETTINGS = {
  theme: "system",
  fontSize: "medium",
  autoScroll: { enabled: false, speed: "normal" },
  readAloudSpeed: 1,
};

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await initDb();
  const db = getDb();
  const body = await request.json();
  const { anonId, categories, settings } = body;

  if (!anonId) {
    return NextResponse.json({ error: "anonId required" }, { status: 400 });
  }

  if (Array.isArray(categories) && categories.length > 0) {
    const valid = categories.filter((c: string) => TAXONOMY.includes(c as any));
    if (valid.length === 0) {
      return NextResponse.json({ error: "No valid categories" }, { status: 400 });
    }

    const existing = await db.query("SELECT settings FROM preferences WHERE anon_id = $1", [anonId]);
    const merged = { ...DEFAULT_SETTINGS, ...(existing.rows[0]?.settings || {}), ...(settings || {}) };

    await db.query(
      `INSERT INTO preferences (anon_id, categories, settings, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (anon_id)
       DO UPDATE SET categories = $2, settings = $3, updated_at = NOW()`,
      [anonId, valid, JSON.stringify(merged)]
    );

    return NextResponse.json({ ok: true, categories: valid, settings: merged });
  }

  if (settings) {
    await db.query(
      `UPDATE preferences SET settings = settings || $2::jsonb, updated_at = NOW() WHERE anon_id = $1
       RETURNING settings`,
      [anonId, JSON.stringify(settings)]
    );
    const updated = await db.query("SELECT settings FROM preferences WHERE anon_id = $1", [anonId]);
    return NextResponse.json({ ok: true, settings: updated.rows[0]?.settings || {} });
  }

  return NextResponse.json({ error: "No update provided" }, { status: 400 });
}

export async function GET(request: Request) {
  await initDb();
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const anonId = searchParams.get("anonId");
  if (!anonId) return NextResponse.json({ categories: [], settings: DEFAULT_SETTINGS });

  const result = await db.query("SELECT categories, settings FROM preferences WHERE anon_id = $1", [anonId]);
  return NextResponse.json({
    categories: result.rows[0]?.categories || [],
    settings: { ...DEFAULT_SETTINGS, ...(result.rows[0]?.settings || {}) },
  });
}
