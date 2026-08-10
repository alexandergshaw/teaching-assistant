# Transport resilience: GitHub structured errors + Canvas write retry

Two independent groups. Each gets its own regression pass and its own push.

The shared premise: both features already have resilience at the layer above
the transport (an idempotent bulk-module planner; an honest rate-limit
classifier), while the transport underneath stays unprotected. This closes
that gap in the two places it actually bites.

---

## Group A - `ghFetch` carries status and headers

### Problem

`ghFetch` (`src/lib/github.repos.ts:26`) throws a plain `Error` whose message
embeds the HTTP status as text. The `Response` - and every header on it - is
discarded at the throw site. GitHub signals throttling in exactly those
headers (`x-ratelimit-remaining: 0`, `x-ratelimit-reset: <unix seconds>`).

`classifyGithubFailure` (`src/lib/github-rate-limit.ts:123`) is built to read
them, but on the live path (`loadOrgRepoTreesAction` -> `scanOrgRepoTrees` ->
`listOrgRepos`/`getRepoTree`) it is called with an empty header reader, and
the status is recovered by regex-parsing the thrown message
(`parseGithubErrorStatus`, `src/lib/repo-grade-tree-scan.ts:73`).

Consequences today:

- A bare 403 cannot be resolved. Primary-quota exhaustion (`remaining: 0`)
  and a token missing a scope both arrive as 403 with no way to tell them
  apart, so the classifier honestly returns "forbidden" for both.
- No reset time, so the banner cannot say when to retry.
- The status-from-message parse is brittle: reword `ghError` and every
  failure silently degrades to "other".

### Acceptance criteria

**A1.** A new module `src/lib/github-http-error.ts` exports a
`GithubHttpError extends Error` carrying `status: number` and
`headers: GithubHeaderReader`, plus an `EMPTY_GITHUB_HEADERS` constant and an
`asGithubHttpError(err: unknown)` narrowing helper.

**A2.** The module has **no imports at all** - not from `github.repos.ts`, not
from `github-rate-limit.ts`. It must be safe for a client component to pull in
transitively without dragging a `process.env.GITHUB_TOKEN` reader into the
browser bundle (see memory: registry-client-bundle-guard). `GithubHeaderReader`
is declared structurally so it satisfies `github-rate-limit.ts`'s own private
`HeaderReader` without either file importing the other.

**A3.** `ghFetch` throws `GithubHttpError` instead of `Error`. The message is
**byte-identical** to what `ghError` produces today. This is what makes the
change backward compatible: all 91 `ghFetch`/`ghJson` references across 12
modules read only `.message` or `instanceof Error`, both of which still hold.
No call site outside the two named in A4 changes.

**A4.** `scanOrgRepoTrees`'s two catch blocks
(`repo-grade-tree-scan.ts:189`, `:206`) prefer the structured error: when
`asGithubHttpError` matches, `classifyGithubFailure` is called with the
error's **real** status and **real** headers. `parseGithubErrorStatus` stays
as an explicit second-choice fallback for errors that did not come from
`ghFetch`, so a non-GitHub failure (a network error with no status) still
degrades exactly as it does today rather than becoming an exception.

**A5.** A 403 whose response carried `x-ratelimit-remaining: 0` now classifies
as `"rate-limited"`, not `"forbidden"` - the specific case that was
unresolvable before.

**A6.** A rate-limited verdict carries `resetAtMs` from `x-ratelimit-reset`,
so the existing banner (`repo-grades/index.tsx:485-489`, which renders
`scan.rateLimit.message`) gains "it resets in about N minutes" with **no UI
change** - `rateLimitedMessage` already formats it. The UI was never the gap;
the headers were.

**A7.** Every existing test in `repo-grade-tree-scan.test.ts` and
`github-rate-limit.test.ts` still passes **unmodified**. Those tests throw
plain `Error`s with `ghError`-shaped messages, which exercise the A4 fallback
path. A green run of the untouched suite is the evidence that the fallback
still works, not just the new path (see memory: guard-before-migration).

### Explicitly out of scope for A

Nothing else reads GitHub error headers today. Threading them further (retry
with backoff on the GitHub side, honoring `x-ratelimit-reset` as a sleep) is a
separate change; A only makes the data *available* and consumes it in the one
place that already asked for it.

---

## Group B - a shared Canvas throttle retry, with a bounded budget

### Problem

`fetchWithThrottleRetry` (`src/lib/canvas/announcements.ts:299`) does bounded
exponential backoff - max 4 attempts, `500 * 2**(tries-1)` ms - and treats
both 429 and 403 as throttle signals, because Canvas's own docs write the
status as "429 Forbidden (Rate Limit Exceeded)" and third-party reports
describe 403 for the same condition.

It is not exported. Three functions in that one file use it. Every Canvas
module write goes through `writeJson`
(`src/lib/canvas-modules/fetch-helpers.ts:50`), which has no retry at all -
about 40 call sites across 11 files (modules, pages, assignments, quizzes,
rubrics, due-dates, copy, accessibility, module-items, bulk).

Recorded as a known limit in `docs/REGRESSION.md` #244 check 8.

### The constraint the naive fix misses

Wrapping `writeJson` in the existing helper is wrong on its own, because the
loop shapes differ:

- `BulkCreateModulesModal.tsx:78-92` and `steps.lms-modules.ts:90` loop
  **client-side**, one server action per module. Retry costs at most ~3.5s per
  *invocation*. Safe.
- `bulkUpdate` / `bulkDelete` (`canvas-modules/bulk.ts:108`, `:140`) loop over
  N ids **inside a single server call**. A sustained throttle - Canvas
  answering 429 because the quota is genuinely spent - hits every id, burning
  the full 3.5s backoff on each: 50 selected items = 175s, well past this
  deployment's 60s Vercel Hobby function cap (memory:
  deployment-vercel-hobby). That turns a clean set of per-item failures into a
  timeout that reports nothing - strictly worse than today. Restricting the
  predicate to 429 (B3a) removes the forbidden-token version of this scenario
  but does nothing about a real throttle, so the budget is still required.

So the retry needs a budget that a whole bulk loop shares, not just a
per-call attempt cap.

### Acceptance criteria

**B1.** A new module `src/lib/canvas-throttle.ts` owns the retry. It exports
`fetchWithThrottleRetry`, the `429 || 403` predicate, the delay formula, and
the attempt/base-delay constants. Pure and injectable: `sleep` is a parameter
with a real default, so tests never actually wait.

**B2.** `announcements.ts` imports it and deletes its private copy. Behavior
is unchanged for its three existing callers - same 4 attempts, same 500ms
base, same statuses. **`createAnnouncement` is not touched**: the pinned
regression at REGRESSION.md #157 AC6 depends on it, and the whole reason the
helper was written standalone was to keep it out of that function. Extraction
does not change it; only `writeJson` gains new behavior.

**B3.** `writeJson` routes its fetch through `fetchWithThrottleRetry`. On a
still-failing final attempt it throws `canvasError(status, institution)`
exactly as it does today - the error shape and message are unchanged, so no
call site's error handling changes.

**B3a.** `writeJson` retries **429 only**, via a `retryOn` option defaulting
to the 429-or-403 predicate the announcements callers keep. A bare 403 is also
how Canvas reports a token that genuinely lacks access, and nothing in the
response distinguishes the two; treating it as retryable delays every real
permissions failure by the full 3500ms backoff. That trade is worth it for an
unattended scheduled announcement and not for a write a user is waiting on.
The accepted cost is explicit: a throttle Canvas reports as 403 is no longer
absorbed, and surfaces as a per-item failure exactly as it did before any
retry existed.

**B4.** A `ThrottleBudget` caps total sleep across many writes that share one
`CourseContext`. `writeJson` reads it off `ctx` (which every call site already
threads), so no call site signature changes. Absent budget = today's
per-call behavior, which is what every single-write caller gets.

**B5.** The four loops that write N items inside ONE server invocation -
`bulkUpdate` and `bulkDelete` (`bulk.ts`), `bulkAssociateRubric`
(`rubrics.ts`), and `setDueDates` (`due-dates.ts`) - create **one** budget and
attach it to the ctx they already build once. The budget is sized so a whole
bulk loop's worst-case added sleep stays comfortably inside the 60s function
cap regardless of how many ids were selected.

`saveAccessibilityItemHtml` (`accessibility.ts`) is deliberately NOT in that
list: it routes one write per call through a type switch, so it is a
single-write caller and gets the per-call default like every other one.

**B6.** Once a budget is exhausted, further writes in that loop fail fast with
no sleep at all, rather than each paying the full backoff. Verified by a test
that counts sleeps across a simulated loop, not by inspection.

**B7.** Retry only ever repeats a request Canvas **rejected** (429/403 are
returned before the write is applied), so no retry can duplicate a create.
Network-level failures are not retried - `writeJson` never caught those before
and does not start now.

**B8.** `docs/REGRESSION.md` #244 check 8, which currently records "module
writes have no throttle retry" as a known accepted limit, is rewritten to
describe the new behavior. Leaving it would make the regression doc lie.

### Explicitly out of scope for B

`fetchAll` / `safeFetchAll` / `fetchJson` (reads) keep no retry. Reads are
cheap to re-issue by reloading the view, they do not consume the same write
quota, and adding retry to the paginated read loop multiplies against page
count in a way that needs its own sizing analysis.
