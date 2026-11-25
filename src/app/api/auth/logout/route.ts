import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin } from "@/lib/auth/origin";
import { SESSION_COOKIE, revokeSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  try {
    if (token) await revokeSession(token);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      expires: new Date(0),
    });
    return response;
  } catch (error) {
    console.error("Session revocation failed.", error);
    const response = NextResponse.json({
      error: process.env.DATABASE_URL ? "Sign out is temporarily unavailable." : "Database is not configured.",
    }, { status: 503 });
    response.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      expires: new Date(0),
    });
    return response;
  }
}
