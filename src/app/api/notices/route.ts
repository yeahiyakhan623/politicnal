import { NextResponse, type NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { ApiRequestError, apiError } from "@/lib/api/http";
import { assertSameOrigin } from "@/lib/auth/origin";
import { AuthorizationError } from "@/lib/auth/authorization";
import { requireUser } from "@/lib/auth/require-user";
import { getPool } from "@/lib/db";
import { resolveInstituteId } from "@/lib/students/service";
import type { InstituteNotice } from "@/lib/notices/types";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_FILE_BYTES + 128 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORIES = new Set([
  "Academic",
  "Examination",
  "Admission",
  "Administrative",
  "Scholarship",
  "Other",
]);

type NoticeRow = {
  id: string;
  title: string;
  description: string;
  category: string;
  noticeDate: string;
  format: "document" | "image";
  attachmentName: string | null;
  attachmentMimeType: string | null;
  createdAt: Date | string;
};

function assertNoticeManager(role: string) {
  if (!["SUPER_ADMIN", "INSTITUTE_ADMIN", "TEACHER"].includes(role)) {
    throw new AuthorizationError("Only administrators and teachers can publish notices.");
  }
}

function requiredFormText(value: FormDataEntryValue | null, label: string, maximum: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiRequestError(`${label} is required.`, 400);
  }
  const result = value.trim();
  if (result.length > maximum) {
    throw new ApiRequestError(`${label} must be ${maximum} characters or fewer.`, 400);
  }
  return result;
}

function noticeDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiRequestError("Notice date must be a valid calendar date.", 400);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ApiRequestError("Notice date must be a valid calendar date.", 400);
  }
  return value;
}

function safeFileName(value: string) {
  const name = value.split(/[\\/]/).pop()?.replace(/[^\w.-]/g, "_").slice(0, 255);
  return name || "notice-attachment";
}

async function validateNoticeFile(file: File) {
  if (file.size < 1 || file.size > MAX_FILE_BYTES) {
    throw new ApiRequestError("Notice images and PDFs must be between 1 byte and 10 MB.", 413);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const isPdf = file.type === "application/pdf" &&
    bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  const isJpeg = file.type === "image/jpeg" &&
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = file.type === "image/png" &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isGif = file.type === "image/gif" &&
    ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"));
  const isWebp = file.type === "image/webp" &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (!isPdf && !isJpeg && !isPng && !isGif && !isWebp) {
    throw new ApiRequestError("Choose a valid JPEG, PNG, GIF, WebP image, or PDF file.", 415);
  }
  return bytes;
}

export async function GET(request: NextRequest) {
  try {
    const instituteId = request.nextUrl.searchParams.get("instituteId") ?? "";
    if (!UUID.test(instituteId)) throw new ApiRequestError("Institute selection is invalid.", 400);
    const result = await getPool().query<NoticeRow>(
      `SELECT id, title, description, category,
              to_char(notice_date, 'YYYY-MM-DD') AS "noticeDate",
              format, attachment_name AS "attachmentName",
              attachment_mime_type AS "attachmentMimeType", created_at AS "createdAt"
       FROM public.institute_notices
       WHERE institute_id = $1 AND is_published = true
       ORDER BY notice_date DESC, created_at DESC
       LIMIT 100`,
      [instituteId],
    );
    const data: InstituteNotice[] = result.rows.map((row) => ({
      ...row,
      createdAt: new Date(row.createdAt).toISOString(),
    }));
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = apiError(error);
    if (response) return response;
    if (error instanceof ApiRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Public notice list query failed.", error);
    return NextResponse.json({ error: "Unable to load institute notices." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let transactionOpen = false;
  let client: PoolClient | undefined;
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    assertNoticeManager(user.role);
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_REQUEST_BYTES) {
      throw new ApiRequestError("Notice upload exceeds the 10 MB file limit.", 413);
    }
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) {
      throw new ApiRequestError("Content-Type must be multipart/form-data.", 415);
    }
    const form = await request.formData();
    const instituteValue = form.get("instituteId");
    const instituteRequested = typeof instituteValue === "string" ? instituteValue : null;
    const instituteId = await resolveInstituteId(user, instituteRequested);
    const title = requiredFormText(form.get("title"), "Notice title", 200);
    const descriptionValue = form.get("description");
    if (descriptionValue !== null && typeof descriptionValue !== "string") {
      throw new ApiRequestError("Notice description is invalid.", 400);
    }
    const description = (descriptionValue ?? "").trim();
    if (description.length > 20000) {
      throw new ApiRequestError("Notice description must be 20,000 characters or fewer.", 400);
    }
    const category = requiredFormText(form.get("category"), "Category", 80);
    if (!CATEGORIES.has(category)) {
      throw new ApiRequestError("Select a valid notice category.", 400);
    }
    const date = noticeDate(requiredFormText(form.get("noticeDate"), "Notice date", 10));
    const format = requiredFormText(form.get("format"), "Notice format", 12);
    if (format !== "document" && format !== "image") {
      throw new ApiRequestError("Select a document or image notice format.", 400);
    }

    let fileName: string | null = null;
    let mimeType: string | null = null;
    let fileBytes: Buffer | null = null;
    const entry = form.get("file");
    if (format === "image") {
      if (!(entry instanceof File)) throw new ApiRequestError("Choose an image or PDF notice file.", 400);
      fileBytes = await validateNoticeFile(entry);
      fileName = safeFileName(entry.name);
      mimeType = entry.type;
    } else if (entry instanceof File && entry.size > 0) {
      throw new ApiRequestError("Document notices use the written content format; choose image notice to attach a file.", 400);
    } else if (!description) {
      throw new ApiRequestError("Enter the notice text before publishing.", 400);
    }

    client = await getPool().connect();
    await client.query("BEGIN");
    transactionOpen = true;
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO public.institute_notices
         (institute_id, title, description, category, notice_date, format,
          attachment_name, attachment_mime_type, attachment_size, attachment_data,
          created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        instituteId, title, description, category, date, format,
        fileName, mimeType, fileBytes?.byteLength ?? null, fileBytes, user.id,
      ],
    );
    const noticeId = inserted.rows[0]?.id;
    if (!noticeId) throw new Error("Notice could not be saved.");
    await client.query(
      `INSERT INTO public.admin_audit_logs
         (actor_user_id, actor_role, action, target_type, target_id, after_value)
       VALUES ($1,$2,'notice.created','institute_notice',$3,$4::jsonb)`,
      [user.id, user.role.toLowerCase(), noticeId, JSON.stringify({
        instituteId, title, category, noticeDate: date, format, attachmentName: fileName,
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
    console.error("Notice publish failed.", error);
    return NextResponse.json({ error: "Unable to publish the notice." }, { status: 500 });
  } finally {
    client?.release();
  }
}
