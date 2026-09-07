import type { IncomingHttpHeaders } from "node:http";
import { canvasFetch, type CanvasFetchResult } from "./canvas-fetch";

// ============================================================================
// The canvasFetch(...) -> Response/throw adapter.
//
// Every bearer-carrying Canvas request that has migrated off the platform's
// bare `fetch` goes through `canvasFetch` (src/lib/canvas-fetch.ts), which
// pins the dialled connection to a resolved-and-classified address (SEC1,
// closing DNS rebinding) and never follows a redirect blind (SEC2). Neither
// property is optional, and neither is a drop-in: `canvasFetch` returns a
// discriminated union, not a `Response`, so every migrated call site's
// response handling has to be rewritten, not renamed. The three functions
// below (`canvasGet`, `canvasRequest`, `canvasFetchResultToResponse`) are
// that rewrite, done ONCE and shared, so a caller's existing `.ok`/`.status`/
// `.json()`/`.arrayBuffer()` call shape does not have to change - only what
// sits behind that call shape does. Extracted from `src/lib/canvas-modules/
// fetch-helpers.ts` (the pilot that first proved this pattern out) so every
// later file that migrates reuses this ONE mapping rather than each growing
// its own, slightly different copy of a security-critical adapter.
//
// THE FAILURE MAPPING, AND WHY EACH HALF IS A THROW, NOT A VALUE.
// `canvasFetch` hands back three shapes: `ok: true` (a completed HTTP
// exchange - any status), `kind: "host-not-allowed"`, and
// `kind: "unreachable"`. Every migrated caller already knows how to handle
// exactly two outcomes: a `Response` it can call `.ok`/`.status`/`.json()`/
// `.arrayBuffer()` on, or a thrown `Error` it either lets propagate, wraps in
// `canvasError`, or catches. So `ok: true` maps onto a real `Response` -
// never a look-alike object - and both failure kinds map onto a throw, for
// two DIFFERENT reasons:
//   - `"unreachable"` is already time-flattened upstream (SEC9/E-UX4)
//     specifically so a network-layer failure's latency carries no signal.
//     `fetchWithThrottleRetry` only retries a completed `Response` whose
//     status matches its predicate - it never retries a rejected `attempt()`
//     (see its own doc comment: "a request that failed mid-flight might have
//     been applied and is deliberately left alone"). Throwing here, rather
//     than inventing some sentinel `Response`, is what makes an unreachable
//     host behave EXACTLY like the old rejected-`fetch` case: propagate once,
//     never retried. Turning it into a value the retry loop could inspect
//     would risk exactly the retry-on-network-failure this pattern forbids.
//   - `"host-not-allowed"` is a configuration or attack signal decided
//     entirely by `canvasFetch`'s own classifier before any socket opens -
//     retrying it would just repeat a decision that cannot change. Throwing
//     keeps it out of the retry loop for the same reason.
// Neither thrown message ever carries a raw provider or network string
// (docs/lms-credentials-acceptance-criteria.md SEC4 - a token embedded in a
// logged error message is exactly what the run-log scrubber exists to
// prevent): `"unreachable"` carries no text of its own to leak, so the thrown
// message here is a fixed literal; `"host-not-allowed"`'s `reason` is text
// `canvasFetch` itself composed from its own classification (never an
// upstream response body or a raw `Error#message`), so surfacing it is safe
// by the same argument `canvas-fetch.ts`'s own doc comment makes for why that
// `reason` string exists at all.
//
// TIMEOUT: EACH CALLER DECIDES, NOT THIS MODULE.
// `canvasFetch`'s own doc comment argues three different `timeoutMs` bounds
// (a 10s validation probe with no retry; a 15s attended read; an unattended
// read capped at `min(15s, deadline - now)`) and says only the caller knows
// which applies. `canvasRequest`/`canvasGet` below never supply one, so an
// omitted `timeoutMs` falls through to `canvasFetch`'s own default,
// `DEFAULT_TIMEOUT_MS`. Each consumer of this adapter states its own
// `timeoutMs` choice (or its reason for omitting one) in its own file - see
// `src/lib/canvas-modules/fetch-helpers.ts` for the first such rationale.
//
// WHAT THIS MODULE DELIBERATELY DOES NOT TAKE.
// `fetch-helpers.ts`'s `CourseContext` (courseId, institution, throttle
// budget, base URL, token) is that module's OWN shape, built for its own
// ~40 call sites - it is not dragged down here. Every function below takes
// only the one thing it actually reads: a bearer token, as a plain string.
// A caller that already has a `CourseContext`, or a `ctx.token`, or a bare
// token variable, passes it the same way; nothing here forces a caller to
// construct or import a shape it does not otherwise need.
// ============================================================================

/** Every HTTP status the Fetch spec forbids from carrying a body. Node's
 * `Response` constructor throws a `TypeError` if given a non-null body for
 * one of these - verified directly against this repo's Node version - so
 * this set exists specifically to null out `canvasFetch`'s body (a `Buffer`,
 * possibly zero-length, never `null`) before it reaches `new Response(...)`.
 * `101`/`103` cannot occur here in practice (this is the response to an
 * already-completed exchange, never an interim status), but they are
 * included for the same reason `canvas-fetch.ts` itself is written
 * defensively: this is the platform's own null-body list, not a guess at
 * which subset Canvas happens to use today. */
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

/**
 * Converts one `IncomingHttpHeaders` object (Node's lower-cased, possibly-
 * multi-valued header shape - what `canvasFetch` returns) into a `Headers`
 * instance, so a caller's `response.headers.get("link")` keeps working
 * unchanged. A header repeated by the server (an array value) is appended,
 * not overwritten, matching how a real multi-value response header would
 * already behave through the platform's own `fetch`.
 */
function toResponseHeaders(headers: IncomingHttpHeaders): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const one of value) {
        result.append(key, one);
      }
    } else {
      result.set(key, value);
    }
  }
  return result;
}

/**
 * Maps one `canvasFetch` result onto exactly what every caller already
 * expects: a real `Response` for a completed exchange, or a thrown `Error`
 * for either failure kind. See the module doc comment above for the full
 * reasoning - this function's body is just that reasoning, applied.
 */
export function canvasFetchResultToResponse(result: CanvasFetchResult): Response {
  if (result.ok) {
    // `Response`'s DOM-derived `BodyInit` type wants a `Uint8Array` backed by
    // a real `ArrayBuffer`, never Node's `Buffer` (whose `.buffer` is typed
    // `ArrayBufferLike`, i.e. possibly a `SharedArrayBuffer` - a mismatch TS
    // reports even though a `Buffer` is trivially a `Uint8Array` at runtime).
    // `new Uint8Array(result.body)` copies into exactly that shape; response
    // bodies are already capped at `MAX_RESPONSE_BYTES` (canvas-fetch.ts), so
    // the copy is bounded and cheap.
    const body = NULL_BODY_STATUSES.has(result.status) ? null : new Uint8Array(result.body);
    return new Response(body, { status: result.status, headers: toResponseHeaders(result.headers) });
  }

  if (result.kind === "host-not-allowed") {
    throw new Error(`Canvas request refused: ${result.reason}`);
  }

  // result.kind === "unreachable": a fixed literal, never anything derived
  // from the underlying failure - see SEC4 note above.
  throw new Error("Canvas did not respond.");
}

/** One bearer-carrying request through `canvasFetch`, converted to the
 * `Response` shape every caller already handles. `init` never carries an
 * `Authorization` header - `canvasFetch` attaches the bearer itself from
 * `token`, and drops a caller-supplied `Authorization` rather than trusting
 * two sources of truth to agree (see its own doc comment). Only for a
 * request that should carry this app's own credential - a fetch that must
 * NOT carry it (an unauthenticated download, a pre-signed upload URL that
 * supplies its own credential in its params) stays on the platform's bare
 * `fetch` rather than being routed through here. */
export async function canvasRequest(
  url: string,
  init: { method?: string; headers?: Readonly<Record<string, string>>; body?: string },
  token: string
): Promise<Response> {
  const result = await canvasFetch(url, init, { token });
  return canvasFetchResultToResponse(result);
}

/** `canvasRequest` with no method/headers/body - the common bearer-carrying GET. */
export async function canvasGet(url: string, token: string): Promise<Response> {
  return canvasRequest(url, {}, token);
}
