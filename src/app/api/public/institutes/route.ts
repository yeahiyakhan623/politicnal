import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const result = await getPool().query<{ id: string; name: string; category: string | null }>(
      `SELECT id, name, category
       FROM public.institutes
       WHERE review_status = 'approved'
        AND (lower(coalesce(category, '')) = 'polytechnic' OR lower(type) = 'polytechnic')
      ORDER BY name`,
    );
    return NextResponse.json({ data: result.rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Public institute list query failed.", error);
    return NextResponse.json({ error: "Unable to load institutes." }, { status: 500 });
  }
}
