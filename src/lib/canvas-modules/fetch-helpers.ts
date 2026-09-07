import {
  canvasError,
  parseNextLink,
  type CanvasInstitution,
} from "../canvas-core";
import { fetchWithThrottleRetry, isCanvasRateLimitStatus, type ThrottleBudget } from "../canvas-throttle";
import { assertCanvasSuppliedUrlIsSameOrigin, CANVAS_PAGINATION_PAGE_CAP } from "../canvas-remote-url";
import { canvasGet, canvasRequest } from "../canvas-fetch-response";

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
// platform `fetch`. It now goes through `canvasFetch` (src/lib/canvas-fetch.ts)
// via `canvasGet`/`canvasRequest` (src/lib/canvas-fetch-response.ts), which
// pins the dialled connection to a resolved-and-classified address (SEC1,
// closing DNS rebinding) and never follows a redirect blind (SEC2). Those two
// functions, plus the `canvasFetch`-result-to-`Response`/throw mapping behind
// them, used to live in this file; they are now extracted to
// `canvas-fetch-response.ts` so every OTHER Canvas module migrating onto
// `canvasFetch` shares this one adapter rather than growing its own,
// slightly different copy of a security-critical mapping. See that file's
// own doc comment for the full failure-mapping reasoning (the discriminated
// union `canvasFetch` returns, and why each failure kind is a throw, not a
// value) - it applies unchanged here. `fetchAll`/`writeJson`/`fetchJson`
// below keep their EXACT existing signatures and their exact existing
// `.ok`/`.status`/`.json()` call shape - only what sits behind that call
// shape changed.
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
