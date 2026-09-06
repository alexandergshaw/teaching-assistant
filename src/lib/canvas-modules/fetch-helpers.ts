import {
  canvasError,
  parseNextLink,
  type CanvasInstitution,
} from "../canvas-core";
import { fetchWithThrottleRetry, isCanvasRateLimitStatus, type ThrottleBudget } from "../canvas-throttle";
import { assertCanvasSuppliedUrlIsSameOrigin, CANVAS_PAGINATION_PAGE_CAP } from "../canvas-remote-url";

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
    const response = await fetch(next, {
      headers: { Authorization: `Bearer ${ctx.token}` },
    });
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
 * shape. No caller's error handling is affected. Only responses are retried,
 * so a network-level failure propagates on its first occurrence just as it
 * always did.
 */
export async function writeJson<T>(
  url: string,
  method: "POST" | "PUT" | "DELETE",
  ctx: CourseContext,
  params?: URLSearchParams
): Promise<T> {
  const response = await fetchWithThrottleRetry(
    () =>
      fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${ctx.token}`,
          ...(params ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        },
        body: params ? params.toString() : undefined,
      }),
    { budget: ctx.throttleBudget, retryOn: isCanvasRateLimitStatus }
  );
  if (!response.ok) {
    throw canvasError(response.status, ctx.institution);
  }
  return (await response.json()) as T;
}

export async function fetchJson<T>(url: string, ctx: CourseContext): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${ctx.token}` } });
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
