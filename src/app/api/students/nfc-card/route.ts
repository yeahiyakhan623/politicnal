import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { ApiRequestError, apiError } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/auth/origin";
import { requireUser } from "@/lib/auth/require-user";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  try {
    const user = await requireUser();
    if (user.role !== "STUDENT" || !user.studentId || !user.instituteId) {
      throw new ApiRequestError("A linked student account is required to manage an NFC card.", 403);
    }

    const result = await getPool().query<{ id: string; issued_at: Date | string }>(
      `SELECT id, issued_at
       FROM public.student_nfc_cards
       WHERE student_id = $1 AND institute_id = $2 AND revoked_at IS NULL
       LIMIT 1`,
      [user.studentId, user.instituteId],
    );
    const card = result.rows[0];
    return NextResponse.json(
      {
        active: Boolean(card),
        issuedAt: card ? new Date(card.issued_at).toISOString() : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const response = apiError(error);
    if (response) {
      return NextResponse.json(response.body, {
        status: response.status,
        headers: { "Cache-Control": "no-store" },
      });
    }
    console.error("Student NFC card status query failed.", error);
    return jsonError("Unable to load NFC card status.", 500);
  }
}

export async function POST(request: NextRequest) {
  let client: PoolClient | undefined;
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    if (user.role !== "STUDENT" || !user.studentId || !user.instituteId) {
      throw new ApiRequestError("A linked student account is required to issue an NFC card.", 403);
    }
    if (user.passwordChangeRequired) {
      throw new ApiRequestError("Change your temporary password before issuing a card.", 403);
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    client = await getPool().connect();
    await client.query("BEGIN");
    const student = await client.query(
      `SELECT 1 FROM public.students
       WHERE id = $1 AND institute_id = $2
         AND is_active = true AND approval_status = 'approved'
       FOR UPDATE`,
      [user.studentId, user.instituteId],
    );
    if (!student.rowCount) throw new ApiRequestError("Active student record was not found.", 404);

    await client.query(
      `UPDATE public.student_nfc_cards
       SET revoked_at = now()
       WHERE student_id = $1 AND institute_id = $2 AND revoked_at IS NULL`,
      [user.studentId, user.instituteId],
    );
    const card = await client.query<{ id: string }>(
      `INSERT INTO public.student_nfc_cards
         (institute_id, student_id, token_hash, issued_by)
       VALUES ($1,$2,$3,$4)
       RETURNING id`,
      [user.instituteId, user.studentId, tokenHash, user.id],
    );
    const cardId = card.rows[0]?.id;
    if (!cardId) throw new Error("NFC card was not created.");

    await client.query("COMMIT");
    return NextResponse.json(
      { success: true, cardId, token },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    const response = apiError(error);
    if (response) {
      return NextResponse.json(response.body, {
        status: response.status,
        headers: { "Cache-Control": "no-store" },
      });
    }
    console.error("Student NFC card issuance failed.", error);
    return jsonError("Unable to issue an NFC card.", 500);
  } finally {
    client?.release();
  }
}

export async function DELETE(request: NextRequest) {
  let client: PoolClient | undefined;
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    if (user.role !== "STUDENT" || !user.studentId || !user.instituteId) {
      throw new ApiRequestError("A linked student account is required to manage an NFC card.", 403);
    }

    client = await getPool().connect();
    await client.query("BEGIN");
    const student = await client.query(
      `SELECT 1 FROM public.students
       WHERE id = $1 AND institute_id = $2
       FOR UPDATE`,
      [user.studentId, user.instituteId],
    );
    if (!student.rowCount) throw new ApiRequestError("Active student record was not found.", 404);
    const result = await client.query(
      `UPDATE public.student_nfc_cards
       SET revoked_at = now()
       WHERE student_id = $1 AND institute_id = $2 AND revoked_at IS NULL
       RETURNING id`,
      [user.studentId, user.instituteId],
    );
    await client.query("COMMIT");
    return NextResponse.json(
      { success: true, deactivated: Boolean(result.rowCount) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    const response = apiError(error);
    if (response) {
      return NextResponse.json(response.body, {
        status: response.status,
        headers: { "Cache-Control": "no-store" },
      });
    }
    console.error("Student NFC card deactivation failed.", error);
    return jsonError("Unable to deactivate the NFC card.", 500);
  } finally {
    client?.release();
  }
}
