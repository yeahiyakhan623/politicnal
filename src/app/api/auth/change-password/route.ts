import { compare, hash } from "bcryptjs";
import { NextResponse, type NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { ApiRequestError, apiError, readJsonBody } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/auth/origin";
import { requireRoles } from "@/lib/auth/require-user";
import { SESSION_COOKIE, createSession } from "@/lib/auth/session";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let client: PoolClient | undefined;
  let transactionOpen = false;
  try {
    assertSameOrigin(request);
    const user = await requireRoles("STUDENT");
    const body = await readJsonBody(request, 4_096);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiRequestError("Enter your current and new passwords.", 400);
    }
    const data = body as Record<string, unknown>;
    const currentPassword = typeof data.currentPassword === "string" ? data.currentPassword : "";
    const newPassword = typeof data.newPassword === "string" ? data.newPassword : "";
    if (!currentPassword || currentPassword.length > 128) {
      throw new ApiRequestError("Enter the temporary password from your email.", 400);
    }
    if (newPassword.length < 10 || newPassword.length > 128) {
      throw new ApiRequestError("Choose a new password with at least 10 characters.", 400);
    }

    client = await getPool().connect();
    const account = await client.query<{ passwordHash: string; required: boolean }>(
      `SELECT password_hash AS "passwordHash",
              password_change_required AS required
       FROM public.users WHERE id = $1 AND role = 'student'`,
      [user.id],
    );
    const row = account.rows[0];
    if (!row) throw new ApiRequestError("Student account was not found.", 404);
    if (!row.required) throw new ApiRequestError("Your password has already been updated.", 409);
    if (!await compare(currentPassword, row.passwordHash)) {
      throw new ApiRequestError("The temporary password is incorrect.", 401);
    }
    if (await compare(newPassword, row.passwordHash)) {
      throw new ApiRequestError("Choose a password different from your temporary password.", 400);
    }

    const passwordHash = await hash(newPassword, 12);
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query(
      `UPDATE public.users
       SET password_hash = $2, password_change_required = false,
           token_version = token_version + 1, updated_at = now()
       WHERE id = $1 AND role = 'student'`,
      [user.id, passwordHash],
    );
    const session = await createSession(user.id, client);
    await client.query("COMMIT");
    transactionOpen = false;

    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      expires: session.expiresAt,
      priority: "high",
    });
    return response;
  } catch (error) {
    if (client && transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
    const response = apiError(error);
    if (response) return response;
    if (error instanceof ApiRequestError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Student password update failed.", error);
    return NextResponse.json({ error: "Unable to update your password right now." }, { status: 500 });
  } finally {
    client?.release();
  }
}
