import { NextResponse, type NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { ApiRequestError, apiError, readJsonBody } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/auth/origin";
import { AuthorizationError } from "@/lib/auth/authorization";
import { requireUser } from "@/lib/auth/require-user";
import { getPool } from "@/lib/db";
import { resolveInstituteId } from "@/lib/students/service";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    const instituteId = request.nextUrl.searchParams.get("instituteId") ?? "";
    if (!UUID.test(instituteId)) throw new ApiRequestError("Select an institute to view admission circulars.", 400);
    const result = await getPool().query<{
      id: string;
      instituteId: string;
      title: string;
      body: string;
      publishedAt: Date | string;
      applicationDeadline: string | null;
      attachmentUrl: string | null;
      attachmentName: string | null;
      attachmentType: string | null;
    }>(
      `SELECT n.id, n.institute_id AS "instituteId", n.title, n.body,
              COALESCE(n.published_at, n.created_at) AS "publishedAt",
              to_char(n.application_deadline, 'YYYY-MM-DD') AS "applicationDeadline",
              n.attachment_url AS "attachmentUrl", n.attachment_name AS "attachmentName",
              n.attachment_type AS "attachmentType"
       FROM public.notices n
       JOIN public.institutes i ON i.id = n.institute_id AND i.review_status = 'approved'
       WHERE n.institute_id = $1 AND n.notice_type = 'admission'
         AND n.is_published = true AND (n.expires_at IS NULL OR n.expires_at > now())
         AND (n.application_deadline IS NULL OR n.application_deadline >= CURRENT_DATE)
       ORDER BY n.published_at DESC NULLS LAST, n.created_at DESC
       LIMIT 100`,
      [instituteId],
    );
    return NextResponse.json({
      data: result.rows.map((row) => ({
        ...row,
        publishedAt: new Date(row.publishedAt).toISOString(),
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Public admissions circular query failed.", error);
    return NextResponse.json({ error: "Unable to load admission circulars." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let client: PoolClient | undefined;
  let transactionOpen = false;
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    if (!["SUPER_ADMIN", "INSTITUTE_ADMIN", "TEACHER"].includes(user.role)) {
      throw new AuthorizationError("Only administrators and teachers can publish admission circulars.");
    }
    const body = await readJsonBody(request, 32_768);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiRequestError("Admission circular details are required.", 400);
    }
    const data = body as Record<string, unknown>;
    const instituteRequested = typeof data.instituteId === "string" ? data.instituteId : null;
    const instituteId = await resolveInstituteId(user, instituteRequested);
    const title = typeof data.title === "string" ? data.title.trim() : "";
    const description = typeof data.body === "string" ? data.body.trim() : "";
    if (!title || title.length > 180) {
      throw new ApiRequestError("Circular title is required and must be 180 characters or fewer.", 400);
    }
    if (!description || description.length > 10000) {
      throw new ApiRequestError("Circular details are required and must be 10,000 characters or fewer.", 400);
    }
    const deadline = typeof data.applicationDeadline === "string" && data.applicationDeadline
      ? data.applicationDeadline
      : null;
    if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
      throw new ApiRequestError("Application deadline must be a valid calendar date.", 400);
    }
    if (deadline && new Date(`${deadline}T00:00:00.000Z`).toISOString().slice(0, 10) !== deadline) {
      throw new ApiRequestError("Application deadline must be a valid calendar date.", 400);
    }
    client = await getPool().connect();
    await client.query("BEGIN");
    transactionOpen = true;
    const result = await client.query<{ id: string }>(
      `INSERT INTO public.notices
         (institute_id, title, body, published_at, is_published, created_by,
          notice_type, application_deadline)
       VALUES ($1,$2,$3,now(),true,$4,'admission',$5)
       RETURNING id`,
      [instituteId, title, description, user.id, deadline],
    );
    const noticeId = result.rows[0]?.id;
    if (!noticeId) throw new Error("Admission circular could not be published.");
    await client.query(
      `INSERT INTO public.admin_audit_logs
         (actor_user_id, actor_role, action, target_type, target_id, after_value)
       VALUES ($1,$2,'admission_circular.created','notice',$3,$4::jsonb)`,
      [user.id, user.role.toLowerCase(), noticeId, JSON.stringify({
        instituteId, title, applicationDeadline: deadline,
      })],
    );
    await client.query("COMMIT");
    transactionOpen = false;
    return NextResponse.json({ id: noticeId }, { status: 201 });
  } catch (error) {
    if (client && transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
    const response = apiError(error);
    if (response) return response;
    if (error instanceof ApiRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Admission circular publish failed.", error);
    return NextResponse.json({ error: "Unable to publish admission circular." }, { status: 500 });
  } finally {
    client?.release();
  }
}
