import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { runPrune } from "@/lib/prune";

export const dynamic = "force-dynamic";

/**
 * Retention job. Guarded by CRON_SECRET when that env var is set, so the same
 * route is safe to expose once this is deployed behind a real scheduler.
 * Pass ?dryRun=1 to see what would be removed without touching anything.
 */
function authorize(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${secret}`;
}

async function handle(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await initDb();
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
    return NextResponse.json(await runPrune({ dryRun }));
  } catch (err: any) {
    console.error("Prune error:", err);
    return NextResponse.json({ error: err.message || "Prune failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
