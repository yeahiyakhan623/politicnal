import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { ApiRequestError, apiError, readJsonBody } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/auth/origin";
import { consumeAuthAttempt, hashAuthRateKey } from "@/lib/auth/rate-limit";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const MAX_SCANS_PER_IP = 60;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  let client: PoolClient | undefined;
  try {
    assertSameOrigin(request);
    const body = await readJsonBody(request, 2_048);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiRequestError("Scan data is required.", 400);
    }
    const data = body as Record<string, unknown>;
    const token = typeof data.token === "string" ? data.token : "";
    const method = data.method;
    if (!TOKEN.test(token)) throw new ApiRequestError("Student card is invalid or inactive.", 404);
    if (method !== "nfc" && method !== "qr") throw new ApiRequestError("Scan method is invalid.", 400);

    const forwardedIp = request.headers.get("x-real-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const rateKey = hashAuthRateKey(forwardedIp.slice(0, 100), "student-card-scan");
    if (await consumeAuthAttempt(rateKey) > MAX_SCANS_PER_IP) {
      throw new ApiRequestError("Too many card scans. Please try again later.", 429);
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");
    client = await getPool().connect();
    await client.query("BEGIN");
    const card = await client.query<{
      id: string;
      name: string | null;
      rollNumber: string | null;
      registrationNumber: string | null;
      department: string | null;
      semester: number;
      sessionYear: string | null;
      instituteName: string;
    }>(
      `SELECT card.id, student.full_name AS name,
              student.roll_number AS "rollNumber",
              student.registration_number AS "registrationNumber",
              student.department, student.semester,
              student.session_year AS "sessionYear",
              institute.name AS "instituteName"
       FROM public.student_nfc_cards card
       JOIN public.students student
         ON student.id = card.student_id AND student.institute_id = card.institute_id
       JOIN public.institutes institute ON institute.id = card.institute_id
       WHERE card.token_hash = $1 AND card.revoked_at IS NULL
         AND student.is_active = true AND student.approval_status = 'approved'
         AND institute.review_status = 'approved'
       FOR SHARE OF card, student`,
      [tokenHash],
    );
    const record = card.rows[0];
    if (!record) throw new ApiRequestError("Student card is invalid or inactive.", 404);

    await client.query(
      `INSERT INTO public.student_nfc_scan_logs (card_id, scan_method)
       VALUES ($1, $2)`,
      [record.id, method],
    );
    await client.query("COMMIT");
    return NextResponse.json(
      {
        success: true,
        student: {
          name: record.name ?? "",
          rollNumber: record.rollNumber ?? "",
          registrationNumber: record.registrationNumber ?? "",
          department: record.department ?? "",
          semester: Number(record.semester),
          sessionYear: record.sessionYear ?? "",
          instituteName: record.instituteName,
        },
      },
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
    console.error("Student card scan failed.", error);
    return jsonError("Unable to verify this student card.", 500);
  } finally {
    client?.release();
  }
}
