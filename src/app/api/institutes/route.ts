import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { getInstituteOptions } from "@/lib/students/service";
import { apiError } from "@/lib/api/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const institutes = await getInstituteOptions(user);
    return NextResponse.json({ data: institutes });
  } catch (error) {
    const response = apiError(error);
    if (response) return response;
    console.error("Institute list query failed.", error);
    return NextResponse.json({ error: "Unable to load institutes." }, { status: 500 });
  }
}
