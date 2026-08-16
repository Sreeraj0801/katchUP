import { NextResponse } from "next/server";
import { TAXONOMY, CATEGORY_META } from "@/lib/categories";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    categories: TAXONOMY,
    meta: CATEGORY_META,
  });
}
