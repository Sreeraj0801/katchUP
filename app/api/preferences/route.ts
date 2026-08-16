import { NextResponse } from "next/server";
import { initDb, preferences } from "@/lib/mongo";
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
  const col = await preferences();
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

    const existing = await col.findOne({ _id: anonId });
    const merged = { ...DEFAULT_SETTINGS, ...(existing?.settings || {}), ...(settings || {}) };

    // Replaces the Postgres INSERT ... ON CONFLICT DO UPDATE.
    await col.updateOne(
      { _id: anonId },
      { $set: { categories: valid, settings: merged, updated_at: new Date() } },
      { upsert: true }
    );

    return NextResponse.json({ ok: true, categories: valid, settings: merged });
  }

  if (settings) {
    // The old query used `settings || $2::jsonb` to shallow-merge. Mongo has no
    // direct equivalent for a nested object merge, so read-merge-write it is.
    // Upserting here matters: the Postgres version issued a bare UPDATE, so a
    // settings change from a user with no preferences row silently did nothing.
    const existing = await col.findOne({ _id: anonId });
    const merged = { ...DEFAULT_SETTINGS, ...(existing?.settings || {}), ...settings };
    await col.updateOne(
      { _id: anonId },
      {
        $set: { settings: merged, updated_at: new Date() },
        $setOnInsert: { categories: existing?.categories ?? [] },
      },
      { upsert: true }
    );
    return NextResponse.json({ ok: true, settings: merged });
  }

  return NextResponse.json({ error: "No update provided" }, { status: 400 });
}

export async function GET(request: Request) {
  await initDb();
  const { searchParams } = new URL(request.url);
  const anonId = searchParams.get("anonId");
  if (!anonId) return NextResponse.json({ categories: [], settings: DEFAULT_SETTINGS });

  const col = await preferences();
  const doc = await col.findOne({ _id: anonId });
  return NextResponse.json({
    categories: doc?.categories || [],
    settings: { ...DEFAULT_SETTINGS, ...(doc?.settings || {}) },
  });
}
