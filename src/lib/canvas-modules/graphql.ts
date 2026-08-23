// A minimal Canvas GraphQL client.
//
// Goes through the same `fetchWithThrottleRetry` wrapper as every other
// Canvas write (`writeJson`, src/lib/canvas-modules/fetch-helpers.ts) -
// review finding M4. A bare `fetch` here would have left the checkpoints
// mutation as the one Canvas write with no 429 retry, while its own classic
// REST fallback (`writeJson`) already retries; using the same wrapper with
// the same `isCanvasRateLimitStatus` (429-only) predicate keeps both paths
// of graded-discussion.ts consistent instead of one being more fragile than
// the other under load.
//
// PARITY WITH `writeJson`, PRECISELY STATED (step-10 finding N3): this also
// accepts an optional `throttleBudget` on its context and threads it through
// as `fetchWithThrottleRetry`'s `budget`, exactly like `writeJson` does with
// `ctx.throttleBudget` - so a caller that builds ONE budget for a single
// request can share it across a GraphQL attempt and a REST write in that
// same request. This matters concretely for graded-discussion.ts: when the
// checkpoints mutation hits the flag-off error, `createGradedDiscussion`
// falls back to `createClassicDiscussion` (`writeJson`) in the SAME call -
// two potentially-retried Canvas writes, one after the other, in one
// invocation. Passing both the same `ThrottleBudget` bounds their combined
// worst-case retry time instead of letting each independently spend up to
// `maxThrottleSleepMs()`. When the caller passes no budget (the default),
// behaviour is unchanged: per-call retry only, same as before this fix.
//
// The one deliberate departure from every other Canvas write helper: the
// top-level `errors` array is RETURNED to the caller as data, never
// collapsed into a thrown `Error` string.
//
// Why: docs/intro-discussion-from-modules-acceptance-criteria.md AC11b/AC14g.
// Canvas Discussion Checkpoints availability is an account-scoped feature
// flag with no readable REST signal (see graded-discussion.ts's header). The
// only way to detect it is to attempt the mutation and inspect the specific
// top-level GraphQL error message Canvas returns when the flag is off. A
// caller that has to re-parse that message out of a thrown Error's `.message`
// string is fragile in a way a caller that receives the array directly is
// not - so this client hands the array back untouched.
//
// A non-2xx HTTP response (auth failure, 404, etc.) is a transport failure,
// not a GraphQL-protocol error, and still throws via the shared
// `canvasError` mapping every other Canvas write in this codebase uses.

import { canvasError, type CanvasInstitution } from "../canvas-core";
import { fetchWithThrottleRetry, isCanvasRateLimitStatus, type ThrottleBudget } from "../canvas-throttle";

/** One entry of a GraphQL response's TOP-LEVEL `errors` array (the
 * GraphQL-protocol error list - distinct from a mutation's own per-field
 * `errors` payload, e.g. `createDiscussionTopic.errors`). */
export interface CanvasGraphqlError {
  message: string;
}

export interface CanvasGraphqlResult<T> {
  /** Present when Canvas returned a `data` object, even alongside errors. */
  data: T | null;
  /** The top-level `errors` array, verbatim. Empty when Canvas reported
   * none. Never thrown - see this file's header comment. */
  errors: CanvasGraphqlError[];
}

/** Minimal context a GraphQL call needs: the resolved course's base URL,
 * token, and institution (for a transport-failure error message). Accepts
 * the same shape `resolveCourse` returns, so callers pass their `ctx`
 * straight through. */
export interface CanvasGraphqlContext {
  baseUrl: string;
  token: string;
  institution: CanvasInstitution;
  /** Optional shared sleep allowance - see this file's header comment. Same
   * shape and same meaning as `CourseContext.throttleBudget`
   * (src/lib/canvas-modules/fetch-helpers.ts): absent means per-call retry
   * only. */
  throttleBudget?: ThrottleBudget;
}

/** POST one GraphQL query/mutation to `<baseUrl>/api/graphql`. */
export async function canvasGraphql<T>(
  ctx: CanvasGraphqlContext,
  query: string,
  variables: Record<string, unknown>
): Promise<CanvasGraphqlResult<T>> {
  const res = await fetchWithThrottleRetry(
    () =>
      fetch(`${ctx.baseUrl}/api/graphql`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
      }),
    { budget: ctx.throttleBudget, retryOn: isCanvasRateLimitStatus }
  );
  if (!res.ok) {
    throw canvasError(res.status, ctx.institution);
  }
  const body = (await res.json()) as {
    data?: T;
    errors?: Array<{ message?: string }>;
  };
  return {
    data: body.data ?? null,
    errors: (body.errors ?? []).map((e) => ({ message: e.message ?? "" })),
  };
}
