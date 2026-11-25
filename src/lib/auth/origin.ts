import "server-only";

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) {
    throw new Error("A same-origin request is required.");
  }

  let originUrl: URL;
  let requestUrl: URL;
  try {
    originUrl = new URL(origin);
    requestUrl = new URL(request.url);
  } catch {
    throw new Error("A valid same-origin request is required.");
  }

  if (originUrl.origin !== requestUrl.origin) {
    throw new Error("A same-origin request is required.");
  }
}
