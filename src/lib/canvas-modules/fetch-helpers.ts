import {
  canvasError,
  parseNextLink,
  type CanvasInstitution,
} from "../canvas-core";
import { fetchWithThrottleRetry, isCanvasRateLimitStatus, type ThrottleBudget } from "../canvas-throttle";
import { assertCanvasSuppliedUrlIsSameOrigin, CANVAS_PAGINATION_PAGE_CAP } from "../canvas-remote-url";
import { canvasFetch, type CanvasFetchResult } from "../canvas-fetch";
import type { IncomingHttpHeaders } from "node:http";

export type CourseContext = {
  courseId: string;
  institution: CanvasInstitution;
  token: string;
  baseUrl: string;
  /** Optional shared sleep allowance for callers that issue MANY writes
   * inside one server invocation (bulkUpdate, bulkDelete,
   * bulkAssociateRubric, setDueDates). Carried on the context rather than
   * passed to writeJson, because every call site already threads a ctx - so
   * bounding a bulk loop costs one line where the ctx is built and changes no
   * function signature anywhere. Absent means per-call retry only, which is
   * what every single-write caller wants. See src/lib/canvas-throttle.ts for
   * why an unbounded per-call retry inside a bulk loop would be a
   * regression. */
  throttleBudget?: ThrottleBudget;
};

// ============================================================================
// The canvasFetch adapter - the pattern the rest of this migration follows.
//
// Every bearer-carrying request in this file used to go straight to the
// platform `fetch`. It now goes through `canvasFetch` (src/lib/canvas-fetch.ts),
// which pins the dialled connection to a resolved-and-classified address (SEC1,
// closing DNS rebinding) and never follows a redirect blind (SEC2). Neither
// property is optional, and neither is a drop-in: `canvasFetch` returns a
// discriminated union, not a `Response`, so every call site's response
// handling has to be rewritten, not renamed. The three functions below
// (`canvasGet`, `canvasRequest`, `canvasFetchResultToResponse`) are that
// rewrite, done once, so `fetchAll`/`writeJson`/`fetchJson` keep their EXACT
// existing signatures and their exact existing `.ok`/`.status`/`.json()`
// call shape below this line - only what sits behind that call shape changed.
//
// THE FAILURE MAPPING, AND WHY EACH HALF IS A THROW, NOT A VALUE.
// `canvasFetch` hands back three shapes: `ok: true` (a completed HTTP
// exchange - any status), `kind: "host-not-allowed"`, and
// `kind: "unreachable"`. Every existing caller in this file (and every
// existing caller of `fetchAll`/`writeJson`/`fetchJson`, unchanged) already
// knows how to handle exactly two outcomes: a `Response` it can call `.ok`/
// `.status`/`.json()` on, or a thrown `Error` it either lets propagate,
// wraps in `canvasError`, or catches (`fetchJson`, `safeFetchAll`). So
// `ok: true` maps onto a real `Response` - never a look-alike object - and
// both failure kinds map onto a throw, for two DIFFERENT reasons:
//   - `"unreachable"` is already time-flattened upstream (SEC9/E-UX4)
//     specifically so a network-layer failure's latency carries no signal.
//     `fetchWithThrottleRetry` only retries a completed `Response` whose
//     status matches its predicate - it never retries a rejected `attempt()`
//     (see its own doc comment: "a request that failed mid-flight might have
//     been applied and is deliberately left alone"). Throwing here, rather
//     than inventing some sentinel `Response`, is what makes an unreachable
//     host behave EXACTLY like the old rejected-`fetch` case: propagate once,
//     never retried. Turning it into a value the retry loop could inspect
//     would risk exactly the retry-on-network-failure this module's own doc
//     comment forbids.
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
// TIMEOUT: LEFT UNSPECIFIED, ON PURPOSE - NOT AN OVERSIGHT.
// `canvasFetch`'s own doc comment argues three different `timeoutMs` bounds
// (a 10s validation probe with no retry; a 15s attended read; an unattended
// read capped at `min(15s, deadline - now)`) and says only the caller knows
// which applies. `CourseContext` - the one thing every function in this file
// receives - carries no deadline and no attended/unattended flag today, and
// plumbing one through would mean touching every one of this file's ~40 call
// sites across 11 modules, which is exactly the scope this pilot is NOT
// doing (that is real follow-up work, tracked separately, not something to
// fold into the file establishing the pattern). So every call below omits
// `timeoutMs` and takes `canvasFetch`'s own default, `DEFAULT_TIMEOUT_MS`
// (15s - the "attended read" bound). This is a deliberate middle, not a
// guess: it is STRICTLY SAFER than what every one of these functions had
// before, which was no timeout at all - an unattended caller reading through
// `fetchAll`'s pagination loop today can hang a page indefinitely, and after
// this change it cannot hang past 15s per page. It is also not obviously
// wrong for the unattended case even though 15s is nominally the attended
// number: the unattended formula in `canvas-fetch.ts`'s doc comment is
// `min(15s, deadline - now)`, i.e. it is bounded ABOVE by 15s in every case,
// so taking the flat 15s default never exceeds what an unattended caller
// with a real deadline would have chosen for itself; it can only be looser
// once a deadline actually exists. The next group that threads a deadline
// through `CourseContext` should pass it as `timeoutMs` here rather than
// re-deriving this reasoning.
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
 * instance, so every existing caller's `response.headers.get("link")` keeps
 * working unchanged. A header repeated by the server (an array value) is
 * appended, not overwritten, matching how a real multi-value response header
 * would already behave through the platform's own `fetch`.
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
 * Maps one `canvasFetch` result onto exactly what every function below this
 * point already expects: a real `Response` for a completed exchange, or a
 * thrown `Error` for either failure kind. See the section header above for
 * the full reasoning - this function's body is just that reasoning, applied.
 */
function canvasFetchResultToResponse(result: CanvasFetchResult): Response {
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
 * `Response` shape every caller below already handles. `init` never carries
 * an `Authorization` header - `canvasFetch` attaches the bearer itself from
 * `token`, and drops a caller-supplied `Authorization` rather than trusting
 * two sources of truth to agree (see its own doc comment). */
async function canvasRequest(
  url: string,
  init: { method?: string; headers?: Readonly<Record<string, string>>; body?: string },
  token: string
): Promise<Response> {
  const result = await canvasFetch(url, init, { token });
  return canvasFetchResultToResponse(result);
}

async function canvasGet(url: string, token: string): Promise<Response> {
  return canvasRequest(url, {}, token);
}

// ============================================================================
// Public helpers - signatures unchanged from before the migration.
// ============================================================================

/**
 * GET every page of a list endpoint, following the RFC-5988 Link header.
 *
 * Two guards on the follow, per E-CRIT1
 * (docs/lms-credentials-acceptance-criteria.md, src/lib/canvas-remote-url.ts):
 * every `next` link is verified same-origin with `ctx.baseUrl` before it is
 * ever dialed - and the DIALED url is the guard's own return value, not the
 * raw header candidate, because a relative Link header resolves against the
 * base inside the guard and only that resolved string is safe to fetch. And
 * the loop is capped at `CANVAS_PAGINATION_PAGE_CAP` pages so the remote host
 * can never control how long this runs - unbounded pagination here today
 * ends as a silent 60s function kill with no thrown error and no log row.
 * Both guards are untouched by the canvasFetch migration: they run on the
 * URL BEFORE it is ever handed to `canvasGet`, exactly as they ran before it
 * was ever handed to the bare `fetch` call this replaces.
 */
export async function fetchAll<T>(
  startUrl: string,
  ctx: CourseContext
): Promise<T[]> {
  let next: string | null = startUrl;
  const all: T[] = [];
  let pageCount = 0;
  while (next) {
    pageCount += 1;
    if (pageCount > CANVAS_PAGINATION_PAGE_CAP) {
      throw new Error(
        `Canvas pagination exceeded ${CANVAS_PAGINATION_PAGE_CAP} pages while reading ${startUrl} - refusing to follow further "next" links.`
      );
    }
    const response = await canvasGet(next, ctx.token);
    if (!response.ok) {
      throw canvasError(response.status, ctx.institution);
    }
    const page = (await response.json()) as T[];
    all.push(...page);
    const rawNext = parseNextLink(response.headers.get("link"));
    next = rawNext ? assertCanvasSuppliedUrlIsSameOrigin(rawNext, ctx.baseUrl) : null;
  }
  return all;
}

/**
 * Like fetchAll but returns an empty list instead of throwing — used for the
 * "addable content" pickers, where a course may have a feature disabled (e.g.
 * quizzes) or the token may lack access to one content type. A failure for one
 * type should not blank out the others.
 */
export async function safeFetchAll<T>(startUrl: string, ctx: CourseContext): Promise<T[]> {
  try {
    return await fetchAll<T>(startUrl, ctx);
  } catch {
    return [];
  }
}

/**
 * Issue a write (POST/PUT/DELETE) with a form body, returning the parsed JSON.
 *
 * Retries a 429 with bounded exponential backoff. Every Canvas write in the
 * app funnels through here - modules, pages, assignments, quizzes, rubrics,
 * due dates, module items, course copy, bulk publish/unpublish/delete - and
 * none of them had any retry before, so a throttle partway through a bulk run
 * surfaced as a per-item failure the user had to notice and click again.
 *
 * Deliberately 429 ONLY (`isCanvasRateLimitStatus`), unlike the announcements
 * callers' 429-or-403 default. A 403 here is far more often a token that
 * genuinely lacks access than a throttle Canvas chose to report oddly, and a
 * write the user is waiting on should fail at once rather than after 3.5s of
 * backoff that was never going to change the answer. The accepted cost: a
 * throttle reported as 403 is no longer absorbed, and surfaces as a per-item
 * failure exactly as it did before any retry existed.
 *
 * What did NOT change: a still-failing final attempt throws
 * `canvasError(status, institution)` exactly as before, same message, same
 * shape. No caller's error handling is affected. Only a completed response is
 * retried (via `fetchWithThrottleRetry`'s own contract), so a `canvasFetch`
 * network-layer outcome (`"unreachable"`) still propagates on its first
 * occurrence just as a rejected `fetch` always did.
 */
export async function writeJson<T>(
  url: string,
  method: "POST" | "PUT" | "DELETE",
  ctx: CourseContext,
  params?: URLSearchParams
): Promise<T> {
  const response = await fetchWithThrottleRetry(
    () =>
      canvasRequest(
        url,
        {
          method,
          headers: params ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
          body: params ? params.toString() : undefined,
        },
        ctx.token
      ),
    { budget: ctx.throttleBudget, retryOn: isCanvasRateLimitStatus }
  );
  if (!response.ok) {
    throw canvasError(response.status, ctx.institution);
  }
  return (await response.json()) as T;
}

export async function fetchJson<T>(url: string, ctx: CourseContext): Promise<T | null> {
  try {
    const r = await canvasGet(url, ctx.token);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Run `fn` over `items` with at most `limit` in flight (pages need per-item GETs). */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}
