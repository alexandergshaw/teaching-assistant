// Pure response reader for the client wrappers that call a Route Handler in
// place of a Server Action (G4 Wave 2). Plain leaf, no imports.
//
// The Server Action contract is "a result object or { error }". A Route
// Handler can answer with something that is neither: a platform-generated
// HTML/plain-text page when the invocation itself is killed (a 504 the route
// never got to word), or an empty body. Reading that with a bare res.json()
// throws a JSON parse error whose text says nothing about what happened, so
// this reader turns every non-conforming answer into a worded { error }.

/** The slice of Response this reader needs; a test can hand-build one. */
export interface RouteResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Wording for a response that carried no usable { error }. 408/504 read as a
 * timeout ("timed out" is what the chat-seam classifier buckets as such);
 * everything else names the status so a failure is still attributable.
 */
function statusMessage(status: number): string {
  if (status === 408 || status === 504) {
    return "The request timed out before the server answered. Try again.";
  }
  return `The server could not complete the request (HTTP ${status}). Try again.`;
}

/**
 * Read a route response as a Server Action result. Success path (an ok
 * response whose JSON body is an object) returns that body unchanged. A
 * non-ok response keeps the route's own worded { error } when it sent one,
 * and otherwise (non-JSON body, JSON without an error string) gets a worded
 * message derived from the status. An ok response with an unreadable body is
 * a worded failure too, never a thrown parse error.
 */
export async function readActionRouteResponse<T>(res: RouteResponseLike): Promise<T | { error: string }> {
  let body: unknown;
  let parsed = true;
  try {
    body = await res.json();
  } catch {
    parsed = false;
  }

  if (!res.ok) {
    if (parsed && isObject(body) && typeof body.error === "string" && body.error.trim() !== "") {
      return { error: body.error };
    }
    return { error: statusMessage(res.status) };
  }

  if (!parsed || !isObject(body)) {
    return { error: "The server sent a response that could not be read. Try again." };
  }
  return body as T;
}
