import { NextResponse } from "next/server";
import { initDb } from "@/lib/mongo";
import { runIngestion } from "@/lib/ingest";

// Guarded by CRON_SECRET when that env var is set, so the same route is safe
// to expose once this runs behind a real scheduler.
function authorize(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return (request.headers.get("authorization") || "") === `Bearer ${secret}`;
}

async function handle(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await initDb();
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const result = await runIngestion(limit);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Ingest error:", err);
    return NextResponse.json({ error: err.message || "Ingest failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
