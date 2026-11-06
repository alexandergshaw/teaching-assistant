import "server-only";

const EMPTY_BODY_TIMEOUT_MS = 5_000;

export function isSameOriginFeedbackRequest(request: Request, url: URL) {
  const fetchSite = request.headers.get("sec-fetch-site");
  return request.headers.get("origin") === url.origin && (fetchSite === null || fetchSite === "same-origin");
}

export async function hasEmptyFeedbackBody(request: Request) {
  const length = request.headers.get("content-length");
  if ((length !== null && length !== "0") || request.headers.has("transfer-encoding")) return false;
  if (!request.body) return true;
  if (request.body.locked || request.bodyUsed) return false;

  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read().then(({ done }) => done),
      new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), EMPTY_BODY_TIMEOUT_MS); }),
    ]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}
