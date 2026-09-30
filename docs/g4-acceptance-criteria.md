# G4 acceptance criteria

- Item: G4, area `llm-call-platform-ceiling`, kind **bug**, state unscoped
  (`docs/backlog.yml:151-162`).
- Source: the G4 backlog row (title `:155`, instrument `:159`, note `:161`),
  which carries the measured framing and says its own fork has "CHANGED shape".
- Seat: `loop-ac` (Opus). A fresh `loop-checker` gates this document before any
  later seat consumes it.
- This is the AC round only. No mechanism, no wave plan, no oracle, no code. The
  architect owns shape (the reachability survey, the elapsed-aware budget shape,
  write-ordering); the test seat owns oracle and sabotage; the plan owns wave
  ordering. Where this document names a code location it is to make a criterion
  satisfiable, never to design the build.
- Relationship to the prior `docs/g4-scope.md` (round-2 scope, "BUILDABLE IN
  PART"): that is a SCOPE artifact for a broader activity - bounding the whole
  ~60-caller `callLlm` seam repo-wide (its fork X/Y). This AC is a NEW activity
  with its own two rounds; it does not restructure the scope, so no disposition
  table is owed (this is the first AC document for G4). This AC binds to the
  row's TWO named reachable user-facing paths and the invariant; the repo-wide
  seam is carried as residual R-1/R-5, and its mechanism (scope §6, RULING 76)
  as R-4.

## The owner's words (quoted, from the G4 row)

The row is a defect description, not a feature sentence. Its defining claims,
quoted verbatim (`docs/backlog.yml:155`, `:161`):

> "callLlm takes no AbortSignal, so nothing bounds a first attempt ... When the
> platform kills the invocation the action's own catch never runs, so the client
> gets a raw transport failure instead of the {error} string the action would
> have returned. Reachable today via discussion-replies.ts:786 and
> learning-resources-generator.ts:229."

> "MIGRATE the two named reachable features (discussion-replies.ts,
> learning-resources-generator.ts) off Server Actions onto Route Handlers that
> declare their own sub-60s ceiling ... OR accept the unknown platform ceiling
> and the raw transport failure it produces ... A bound must therefore sit BELOW
> the invocation ceiling for the action to return anything at all."

Where any criterion below and these sentences diverge, the sentences win.

## Re-measured facts (every quantity names its command; measured 2026-09-29)

- `grep -rn "callLlm(" src --include=*.ts --include=*.tsx | grep -v "\.test\." | wc -l`
  -> **135** call sites (the row/scope's 127 is stale; the +8 delta is the newly
  added PRES-2 pipeline: `src/app/api/presentations/pipeline/route.ts:259` and
  `src/lib/presentations/generate.ts:82,87,92,111,123` - and those 6 are already
  bounded via `withDeadline`, see below). `grep -rln ... | wc -l` -> **68** files
  (was 64). Canary `callLlmZZZ(` returns 0.
- `callLlm` is `src/lib/llm.ts:375`, signature `(req: LlmRequest, provider:
  LlmProvider = DEFAULT_PROVIDER)` - **no AbortSignal / no timeout parameter**.
  `grep -n "AbortSignal\|abortSignal\|signal\|timeout\|withDeadline\|AbortController" src/lib/llm.ts`
  returns only prose (`:406-412`, `:751`), never a parameter.
- `src/app/page.tsx:1` is `"use client"`; `grep -n maxDuration src/app/page.tsx`
  exits 1 (nothing). A client component cannot export route-segment config, so a
  page-level ceiling is NOT available for any Server Action reached from this
  page - the invocation runs under the platform default.
- Server-Action `callLlm` blast radius:
  `grep -rln "callLlm(" src/app/actions --include=*.ts | grep -v "\.test\."`
  -> **53 action files**;
  `grep -rln "raceWithTimeout\|withDeadline" src/app/actions --include=*.ts | grep -v "\.test\."`
  -> **0**. So NO Server Action bounds its `callLlm` call today.
- The two named paths, re-confirmed reachable and unbounded:
  - `discussion-replies.ts` (`"use server"`, `:1`): `callLlm` at `:211,:348`;
    exports `draftDiscussionRepliesAction` (`:268`) and `gatherReplyResourcesAction`
    (`:609`), both invoked from client hooks (`useDiscussionReplies.ts:554`,
    `useReplyResources.ts:397,:526`). No bound.
  - `learning-resources-generator.ts` (NOT itself `"use server"`; a leaf helper
    imported into server actions): `callLlm` at `:187,:498`; reached through
    `lms-generation.ts:593`, `walkthrough-announcement.ts:288`. Its sibling
    `learning-resource-links.ts` (`"use server"`) also calls `callLlm`
    (`:269,:338`) and documents the 90-100s case (`RETRY_BUDGET_MS = 32_000`,
    `:121`) that gates RETRY only, not the first attempt. No call-level bound.
- The Route-Handler precedent (the shipped, documented pattern the fork's
  Option A follows):
  `grep -rln "export const maxDuration" src/app/api --include=*.ts | grep -v "\.test\."`
  -> **16 routes**. `withDeadline` is `src/lib/course-intel/fetch.ts:316`
  (`AbortSignal.timeout(ms)` racing a labelled reject via `Promise.race` - it
  races caller patience, it does NOT cancel the work). Fresh precedents:
  `src/app/api/presentations/pipeline/route.ts:50` (`maxDuration = 60`), `:58`
  (`SOFT_DEADLINE_MS = 50_000`), `:259` (`callLlm` raced), returning a worded
  504 on deadline (`:74-77`); `src/app/api/presentations/generate/route.ts:26`;
  `class-trends-insight/route.ts`; `course-intel/ask/route.ts`.
- The deadline behaviour IS machine-testable at the route level:
  `src/app/api/presentations/pipeline/route.test.ts:234` mocks `withDeadline` to
  reject and asserts `res.status === 504` with a partial marker, and `:245`
  sabotage-proves it (same op without a timeout returns 200).

## Leverage: TRIGGER FIRED AND DECLINED (no claim owed)

G4 is a bug fix (`kind: bug`), so `DEV_LOOP.md:101-108`'s exemption applies: no
leverage claim is owed for a bug fix, a refactor, a doc correction or an owner
verification. Recorded as the fired trigger, per `docs/loop/seats.md:73-75`.
What the hardening earns, stated once and NOT as a leverage class: bounded,
worded, predictable LLM-call latency on the two named user-facing paths - the
instructor gets a stated timeout instead of a blank raw transport failure. There
is therefore no LEV removal test; the test seat instead owes the AC-2 route
deadline oracle (residual R-6).

## The bounded-ceiling invariant (binds every criterion below)

> A reachable user-facing LLM call MUST NOT be able to run past a declared
> sub-60s bound before the platform kills the invocation; AND when that bound
> fires, the user MUST receive a WORDED error/partial, not a raw transport
> failure.

The two halves are one fix, not alternatives (the row: a bound must sit BELOW
the ceiling for the action to return anything at all). "Sub-60s" is the Vercel
Hobby GRANT ceiling (a route may DECLARE more and simply not get it - the row's
instrument corrects the false "fails to build above 60" claim: five routes
declare 300 and main deploys).

## Numbered acceptance criteria

Each names object / instrument / direction of failure and a class tag:
[MACHINE] pure- or route-test checkable; [READING] verified by reading source
only; [OWNER] verified only by the owner on the deployed app. Several criteria
are FORK-DEPENDENT and say so; the invariant itself is fork-independent.

### AC-1 - Each in-scope reachable path executes `callLlm` only inside a race against a declared sub-ceiling budget [READING + MACHINE-if-route + OWNER]
- Owner's words: "MIGRATE the two named reachable features ... onto Route
  Handlers that declare their own sub-60s ceiling".
- Object: each in-scope reachable user-facing LLM path (at minimum the two named
  - the discussion-reply draft/gather paths and the learning-resources
  generation path; the full set is R-1, the architect's survey).
- Instrument: [READING] the path calls `callLlm` only as the argument of a
  `withDeadline(`/`raceWithTimeout(` race whose budget is strictly less than a
  declared platform ceiling `<= 60`. On a Route Handler that is
  `export const maxDuration = N` (`N <= 60`) present AND the raced budget
  `< N * 1000` (the shipped shape: `pipeline/route.ts:50,:58,:259`). [MACHINE]
  for a Route Handler, a route test drives POST with a hanging/rejecting
  `callLlm` (or mocked `withDeadline`) and asserts the race fires (precedent
  `pipeline/route.test.ts:234`). [OWNER] the deployed path returns before the
  platform kill.
- Direction of failure: FAILS if a reachable path calls `callLlm` with no race
  against a declared sub-ceiling budget; FAILS if the raced budget `>=` the
  declared `maxDuration` (the platform kills first, so the bound buys nothing);
  FAILS structurally if the path remains a Server Action, because a Server
  Action reached from the `"use client"` page has NO declarable ceiling to sit
  below - which is the exact condition that forces the fork (AC applies; the
  option chosen decides how it is satisfied).
- Inherited constraint (NOT re-derived here, handed to architect/test seat as
  R-4): where one invocation may make two or more bounded calls, the budget must
  be per-invocation ELAPSED-AWARE, not a fixed per-call constant - RULING 76,
  `docs/g4-scope.md:328-381`. 31 caller files hold >=2 `callLlm` sites and one
  holds 8 (`docs/g4-scope.md:342-346`), so a fixed constant gives one invocation
  several full budgets and every wrapper after the first fires after the kill.

### AC-2 - A deadline yields a WORDED, distinguishable outcome, never a raw transport failure [MACHINE-if-route + OWNER]
- Owner's words: "the client gets a raw transport failure instead of the {error}
  string the action would have returned"; this criterion is that harm's inverse.
- Object: the client-visible outcome when an in-scope call exceeds its budget.
- Instrument: [MACHINE] for a Route Handler, a route test mocks the raced call
  to time out and asserts the handler resolves to a worded error/partial body
  with a distinguishable status (the shipped idiom: 504 with a worded reason,
  distinct from a plain 502 on an ordinary throw - `pipeline/route.ts:74-82`,
  `pipeline/route.test.ts:234,:267`), i.e. the handler's own catch/branch runs.
  [OWNER] the platform kill itself is NOT vitest-observable (no network, no key,
  nothing renders - `docs/loop/this-repo.md` s6), so "a real slow call yields
  the worded message rather than a blank failure" is owner/deploy verification
  (R-2).
- Direction of failure: FAILS if a timed-out call surfaces a raw transport
  failure or an unhandled rejection instead of a worded body; FAILS if the
  timeout branch is indistinguishable from an ordinary error (the owner cannot
  tell "timed out" from "network died"); the direction must be RED-on-raw-
  failure and MUST NOT be satisfiable by swallowing the timeout silently
  (`.claude/agents/loop-ac.md:36-37` - a failure direction that rewards
  discarding the thing under test).

### AC-3 - Blast radius is contained: the shared `callLlm` seam is not changed unless Option C is explicitly chosen AND enforced [READING + MACHINE]
- Owner's words / row instrument: "any callLlm signature change is a repo-wide
  seam and needs its own chunking"; and "a call-level bound is a 124-site seam
  change, or it is optional and therefore unenforced".
- Object: the diff's footprint against `callLlm` (`src/lib/llm.ts:375`) and the
  set of files it bounds.
- Instrument: [READING/MACHINE] under Option A or B, `callLlm`'s signature is
  unchanged `(req, provider)` (a source-text/structure assertion at `:375`) and
  bounds are added only on the in-scope reachable paths. Under Option C,
  `callLlm` gains an OPTIONAL deadline/signal parameter whose default preserves
  all 135 existing sites' behaviour, AND a repo-wide enforcement instrument (the
  scope's Wave C walker, `docs/g4-scope.md:650-682`) goes RED when a reachable
  caller omits the bound - because an optional-and-unenforced parameter is
  unbounded-by-default, which is the row's own stated failure.
- Direction of failure: FAILS if `callLlm`'s signature changes without the
  repo-wide chunking the row requires; FAILS if a bound is added as an optional
  `callLlm` parameter with NO instrument that goes RED when a reachable caller
  omits it (the "optional therefore unenforced" trap).

### AC-4 - Any migrated path stays in-house only [MACHINE]
- Standing rule (`AGENTS.md` memory `in-house-ai-only.md`): generation stays
  inside the app via the in-house LLM path; the instructor is never routed to an
  external tool.
- Object: any new Route Handler (Option A) or otherwise-changed path.
- Instrument: [MACHINE] an import/source-text test that the path's model egress
  is only `callLlm` / the in-house generation path - no non-in-house generation
  egress and no out-link to an external authoring tool (the pattern is stated in
  `pipeline/route.ts:43` "no direct fetch, no external call (in-house only)").
- Direction of failure: FAILS if a migration introduces any non-in-house model
  egress or an external out-link.

## The fork - the owner decision this row needs (recommendation, not a default)

The row's fork, updated with the fresh PRES-2 precedent and a considered third
option. This is a genuine product/cost call; the AC seat frames and recommends,
it does not default.

- **Option A - MIGRATE the two named user-facing paths to Route Handlers** that
  declare `maxDuration <= 60` and race `callLlm` via `withDeadline` against a
  sub-ceiling budget. Real work: it changes how the client invokes them (server
  action call -> `fetch` to a route). Follows a pattern FOUR shipped routes
  already establish and document (`pipeline`, `generate`, `class-trends-insight`,
  `course-intel/ask`).
- **Option B - ACCEPT the unknown platform ceiling** and the raw transport
  failure on those two paths. No code; accept the reliability exposure.
- **Option C - ROOT-FIX at the source**: give `callLlm` an optional
  deadline/signal so any caller (action or route) can bound it, addressing the
  135-site seam rather than per-path. Its own repo-wide chunk per the row.

**Recommendation: Option A, for the two named paths only.** Reasoning:

1. The harm is specifically that a Server Action reached from the `"use client"`
   page has NO ceiling to bound below, so the invocation runs under the platform
   default and its `catch` never runs. Only moving to a Route Handler lets the
   path DECLARE a ceiling and race a worded response in before the kill. A and C
   both need this; C ALONE does not close the harm, because a bounded `callLlm`
   inside a Server Action still has no ceiling to sit below.
2. `withDeadline`/`raceWithTimeout` bound CALLER PATIENCE, not the work (RULING
   75, Wave B; `fetch.ts:316` is a `Promise.race`, not a threaded fetch signal).
   So Option C's "root fix" does not cancel work or stop quota burn either - it
   buys the same guarantee A does, at 135-site blast radius.
3. The row already rules a `callLlm` signature change is a repo-wide seam needing
   its own chunking, NOT this chunk - so C is a separate, larger item by the
   row's own standing.

**What A concedes.** B buys zero code and zero client-call change (right if the
two paths are rarely slow). C buys one enforcement point instead of per-path
placements and benefits ALL 53 unbounded action files at once (right if many of
them are user-facing-and-hot - which R-1's survey, not this seat, must settle).

**What would change the recommendation.** If R-1's survey shows many more than
two reachable-and-hot unbounded paths, C's amortised root fix wins over N
migrations. If the owner wants the WORK cancelled (quota) not just caller
patience bounded, A and C are both insufficient alone and a fetch-signal item is
needed (a different, larger item). If the platform default ceiling turns out
known and comfortably long, B's exposure shrinks.

**Cost of being wrong.** Wrong toward B: instructors intermittently get a blank
transport failure on discussion replies and learning-resources on slow runs,
unbounded and unworded. Wrong toward A when B would do: real migration effort
(new routes, changed client calls) for little felt benefit. Wrong toward C:
a 135-site seam shipped as one chunk (which the row forbids) at high blast
radius, and it still does not close the Server-Action ceiling harm.

## OPEN QUESTION to the owner (every answer terminates)

> G4 produces one of three, and your answer ends the activity:
> **(A)** migrate the two named user-facing paths - the discussion-reply
> draft/gather paths (`discussion-replies.ts`) and the learning-resources
> generation path (`learning-resources-generator.ts` / `learning-resource-links.ts`)
> - to Route Handlers that declare `maxDuration <= 60` and race `callLlm` via
> `withDeadline`, changing how the client calls them (my recommendation);
> **(B)** accept the unknown platform ceiling and the raw transport failure on
> those two paths, no code; or
> **(C)** add an optional deadline/signal to `callLlm` as a repo-wide seam (its
> own chunk per the row) - noting it does NOT by itself close the Server-Action
> harm, because a Server Action still has no ceiling to bound below.
>
> On **A**: the two migrations are built to the invariant (AC-1..AC-4).
> On **B**: AC-1/AC-2 are struck for those paths as accepted exposure, recorded
> as a residual (R-3 outcome), and the feature ships unchanged.
> On **C**: the invariant is applied at the `callLlm` seam in its own chunk;
> AC-3's Option-C clause and the scope's Wave C enforcement become mandatory.

## Residual register

Each residual carries owner, instrument, and the step that will measure it. A
residual missing any of the three is a deletion. **These must be filed as rows
in `docs/BACKLOG.md` by the orchestrator** (this seat does not write the backlog
under concurrency); until then they exist only here, which `iteration-caps.md`
counts as not yet real.

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R-1 | The FULL set of reachable-unbounded user-facing Server-Action `callLlm` paths. The row names 2; measured today there are 53 action files calling `callLlm` and 0 that bound it - an enumeration is a floor, not the set (`docs/loop/traps-spec.md`). | Architect | Trace each src/app/actions `callLlm` file from a user control to the call; classify reachable/unbounded/user-facing | Architect reachability survey |
| R-2 | Whether the worded body actually returns before the platform kill on the deployed path (the kill is not vitest-observable: no network, no key, nothing renders) | Repo owner | Deploy; trigger a slow model call on an in-scope path; observe a worded timeout, not a blank failure | Post-deploy owner verification |
| R-3 | The A/B/C fork decision itself | Repo owner | The terminating question above | The owner's answer ENDS this activity |
| R-4 | The elapsed-aware per-invocation budget mechanism (RULING 76) and the platform-kill write-ordering rule (persist-before-done) - the HOW, deliberately not designed here | Architect + test seat | `docs/g4-scope.md:328-514` (the shape + the three write-ordering cases) | Architect/plan pass on the chosen option |
| R-5 | If Option C: the repo-wide `callLlm` signature chunking + its enforcement walker. Wave B (abort-retried-as-transient guard) already SHIPPED at `50617d9`, so that dependency is discharged; the remaining C-only work is the optional-signal seam and its instrument | The `callLlm`-seam implementer | `docs/g4-scope.md:644-689` (Wave C object/instrument/direction) | The dedicated repo-wide chunk, only if the owner picks C |
| R-6 | The AC-2 route-deadline oracle (there is no LEV removal test - G4 is a bug) | Test seat | A route test driving a timed-out `callLlm`/`withDeadline` and asserting the worded, distinguishable body (precedent `pipeline/route.test.ts:234`) | Test seat, after Build and Verify |

## Disposition table

Not applicable: this is the first AC document for G4. The prior `docs/g4-scope.md`
is a SCOPE artifact for a broader activity (the repo-wide seam, fork X/Y), not a
prior version of this AC; it is not restructured here. Its repo-wide scope is
carried forward as R-1/R-4/R-5 rather than absorbed.

## Reuse notes (vetted, file:line - for the architect, not a design)

- Bounding primitives: `withDeadline` (`src/lib/course-intel/fetch.ts:316`),
  `raceWithTimeout` (`src/lib/bounded-race.ts:31`). Both race caller patience;
  neither cancels the work.
- Shipped Route-Handler pattern: `src/app/api/presentations/pipeline/route.ts`
  (`maxDuration = 60` `:50`, `SOFT_DEADLINE_MS = 50_000` `:58`, raced `callLlm`
  `:259`, worded 504 `:74-82`) and its test (`route.test.ts:234,:245,:267`);
  `presentations/generate/route.ts:26`; `class-trends-insight/route.ts`;
  `course-intel/ask/route.ts` (elapsed-aware multi-call precedent).
- The in-house call: `callLlm` (`src/lib/llm.ts:375`, `(req, provider)`, no
  signal). Network blocked under vitest; logic is testable with `callLlm` mocked.
- The two named paths: `src/app/actions/discussion-replies.ts` (`callLlm`
  `:211,:348`; `draftDiscussionRepliesAction` `:268`, `gatherReplyResourcesAction`
  `:609`); `src/app/actions/learning-resources-generator.ts` (`:187,:498`) with
  `src/app/actions/learning-resource-links.ts` (`:269,:338`, `RETRY_BUDGET_MS`
  `:121`).

## Out of scope for this document (routed, per `docs/loop/seats.md:77-84`)

- Mechanism: the elapsed-aware budget shape, the shared-ceiling (cron) sizing
  rule, and the persist-before-done write ordering -> architect (see R-4 and
  `docs/g4-scope.md:328-514`).
- The full reachable-unbounded path enumeration -> architect reachability survey
  (R-1).
- Wave ordering and write-set disjointness; the repo-wide `callLlm` seam chunk
  -> plan (R-5).
- Oracle, fixtures, sabotage, the AC-2 route-deadline oracle -> test seat (R-6).
