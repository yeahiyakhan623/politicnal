import { NextResponse, type NextRequest } from "next/server";
import { ApiRequestError } from "@/lib/api/http";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeFileName(value: string) {
  const name = value.split(/[\\/]/).pop()?.replace(/[^\w.-]/g, "_").slice(0, 255);
  return name || "notice-attachment";
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!UUID.test(id)) throw new ApiRequestError("Notice attachment was not found.", 404);
    const result = await getPool().query<{
      attachment_name: string;
      attachment_mime_type: string;
      attachment_size: number;
      attachment_data: Buffer;
    }>(
      `SELECT attachment_name, attachment_mime_type, attachment_size, attachment_data
       FROM public.institute_notices
       WHERE id = $1 AND is_published = true AND attachment_data IS NOT NULL`,
      [id],
    );
    const attachment = result.rows[0];
    if (!attachment) throw new ApiRequestError("Notice attachment was not found.", 404);
    const fileName = safeFileName(attachment.attachment_name);
    const disposition = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
    let offset = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= attachment.attachment_data.byteLength) {
          controller.close();
          return;
        }
        const end = Math.min(offset + 64 * 1024, attachment.attachment_data.byteLength);
        controller.enqueue(attachment.attachment_data.subarray(offset, end));
        offset = end;
      },
    });
    return new NextResponse(body, {
      headers: {
        "Content-Type": attachment.attachment_mime_type,
        "Content-Length": String(attachment.attachment_size),
        "Content-Disposition": `${disposition}; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    if (error instanceof ApiRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Notice attachment request failed.", error);
    return NextResponse.json({ error: "Unable to load notice attachment." }, { status: 500 });
  }
}
