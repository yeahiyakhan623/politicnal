import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { AuthenticationError, AuthorizationError } from "@/lib/auth/authorization";

export async function readJsonBody(request: NextRequest, maxBytes = 16_384): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new ApiRequestError("Content-Type must be application/json.", 415);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maxBytes) throw new ApiRequestError("Request body is too large.", 413);

  const reader = request.body?.getReader();
  if (!reader) throw new ApiRequestError("Request body is required.", 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBytes) {
      await reader.cancel();
      throw new ApiRequestError("Request body is too large.", 413);
    }
    chunks.push(value);
  }
  try {
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApiRequestError("Request body must be valid JSON.", 400);
  }
}

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiRequestError";
  }
}

export function apiError(error: unknown) {
  if (error instanceof ApiRequestError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof AuthenticationError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof AuthorizationError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof Error && error.message.toLowerCase().includes("same-origin request")) {
    return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
  }
  if (error instanceof Error && (
    error.message === "Select an institute to continue." ||
    error.message === "Institute was not found." ||
    error.message === "This account is not linked to an institute."
  )) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof Error && error.message.includes("DATABASE_URL")) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }
  return null;
}

export function validationError(error: unknown) {
  if (error instanceof Error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ error: "Request could not be validated." }, { status: 400 });
}
