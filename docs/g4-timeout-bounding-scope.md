# G4 timeout-bounding scope (Option A build) + the canvasGet live sibling

Read-only design pass. This document's own write set is exactly
`docs/g4-timeout-bounding-scope.md`. No production code is edited here; a later
build wave consumes this.

This scope CONSUMES the SHIP-checked AC (`docs/g4-acceptance-criteria.md`,
Option A: migrate the two named user-facing paths onto Route Handlers that
declare a sub-60s ceiling and race `callLlm`) and the four orchestrator rulings
threaded through the prior `docs/g4-scope.md` (RULING 75 wrapper-not-signal, 76
elapsed-aware budget, 77 budget constant, 78 image path split to G5). It does
not re-decide the A/B/C product fork - the owner's standing "go with the
recommendation" plus the AC's SHIP settle that as A. It resolves the five
IMPLEMENTATION forks the build needs, each as a recommended reading, and
decides the canvasGet live sibling.

---

## 0. What already shipped (brief from the tree, not the doc)

Measured `git log` and the file directly, not recalled:

- **Wave B (abort-is-terminal) SHIPPED at `50617d9`** (`git log --oneline -S
  "G4 Wave B" -- src/lib/llm.ts` -> one commit `50617d95`). `src/lib/llm.ts:427`
  `isAbortError`, consumed by the catch at `:485-491` (`postGenerateContent`)
  and `:652-657` (`postInteraction`): an `AbortError` returns immediately,
  never retried. **But no signal is threaded in**: `callLlm` (`:382`),
  `callGemini` (`:516`) and `postGenerateContent` (`:461`) take NO signal, and
  `fetch(url, {...})` at `:479` passes none. The abort machinery is LATENT -
  it fires only if a future wave threads a real signal into `fetch`. Confirmed:
  `grep -n "signal" src/lib/llm.ts` returns only the prose at `:416-428`.
- **G5 (image transport) COMPLETE** at `2c54745` + `2aa5c13` (per
  `docs/g4-scope.md` R6 / BACKLOG G5). `generateGeminiImage` is bounded by
  `raceWithTimeout` at `announcement-image.ts`. Out of this scope.
- **No Route Handler exists yet for either named path**: `find src/app/api
  -iname "*discussion*" -o -iname "*learning-resource*" -o -iname
  "*resource-link*"` returns nothing. This scope's Wave 1/2 create them.

So the piece this scope designs is the one piece of G4 still unbuilt under
Option A: the per-path Route Handler migration with an elapsed-aware race.

---

## 1. What is true right now (measured 2026-10-11, commands shown)

- `grep -rn "callLlm(" src --include=*.ts --include=*.tsx | grep -v "\.test\." |
  wc -l` -> **136** (import + invocation lines; the AC's 135 and the row's 127
  are earlier snapshots). `... | grep -rln ... | wc -l` -> **69** files. Canary
  `grep -rn "callLlmZZZ(" ...` -> 0.
- `callLlm` signature: `src/lib/llm.ts:382`, `(req: LlmRequest, provider:
  LlmProvider = DEFAULT_PROVIDER)` - no signal, no timeout.
- `src/app/page.tsx:1` is `"use client"`; `grep -n maxDuration src/app/page.tsx`
  exits 1. A client component cannot export route-segment config, so NO Server
  Action reached from this page can declare a ceiling. (Re-confirmed; this is
  the structural reason Option A must move the paths to Route Handlers.)
- Existing `maxDuration` routes: `grep -rn "export const maxDuration"
  src/app/api --include=*.ts | grep -v "\.test\."` -> **16 routes**; the
  interactive-LLM ones all declare `= 60` (`presentations/pipeline:50`,
  `presentations/generate:26`, `course-intel/ask:134`,
  `class-trends-insight:33`, `decks/ask:33`). Five batch/export routes declare
  `= 300` and main deploys - so 60 is a GRANT ceiling on Hobby, not a build
  validation (`docs/g4-scope.md:53` instrument).
- Bounding primitives, both race caller patience and NEITHER cancels the work
  (RULING 75 / Wave B):
  - `raceWithTimeout` (`src/lib/bounded-race.ts:31`) - built on `setTimeout`,
    so `vi.useFakeTimers()` CAN drive it (its own doc comment `:20-24`).
  - `withDeadline` (`src/lib/course-intel/fetch.ts:316`) - built on
    `AbortSignal.timeout(ms)`, which `vi.useFakeTimers()` does NOT patch
    (`fetch.ts` comment; G5 scope re-confirmed inside vitest). Testable only by
    mocking the helper itself (`pipeline/route.test.ts:234` mocks `withDeadline`
    to reject).
- The two named user-facing paths (`grep -n "callLlm(" <file>`):
  - `discussion-replies.ts` (`"use server"`, `:1`): `callLlm` at `:211`
    (inside `draftDiscussionRepliesAction`, `:268`) and `:348` (inside
    `gatherReplyResourcesAction`, `:609`). Client-invoked:
    `useDiscussionReplies.ts:554`, `useReplyResources.ts:397,:526`.
  - Learning resources: `learning-resource-links.ts` (`"use server"`):
    `callLlm` at `:269,:338` inside `findResourceLinksForConceptsAction`
    (`:455`), the documented 90-100s path (`RETRY_BUDGET_MS = 32_000`, `:121`,
    which gates RETRY only). `learning-resources-generator.ts`: `callLlm` at
    `:187,:498`.

---

## 2. SHAPE RULING: which layer the user reaches (the surface is a layer)

This decides where every Route Handler boundary falls, and it corrects the
row's and AC's shorthand "migrate learning-resources-generator.ts".

`findResourceLinksForConceptsAction` HAS NO CLIENT CALLER. `grep -rn
"findResourceLinksForConceptsAction" src/app/components --include=*.ts
--include=*.tsx | grep -v "\.test\."` returns nothing. Every invocation is
server-side, from THREE parent actions: `discussion-replies.ts:712` (inside
`gatherReplyResourcesAction`), `learning-resources-generator.ts:239` (inside
`generateLearningResourcesForSelection`), and `walkthrough-announcement.ts:294`.

Likewise `generateLearningResourcesForSelection` (`:432`) is reached from
`lms-generation.ts:593`, not directly from a client.

**Consequence for the build (do not get this wrong):** the Route Handler
boundary is the CLIENT-INVOKED action, never the shared leaf. If the build
"migrates" `learning-resource-links.ts`, it migrates a leaf shared by three
unrelated surfaces (discussion replies, LMS generation, walkthrough
announcement) and bounds none of them at the layer the user reaches. The leaf
stays a leaf the route's handler imports and races; the ROUTE is the new client
boundary.

The two client-reachable surfaces, each the layer a user actually touches:

- **Surface S1 - discussion replies.** Clean: the client hooks call
  `draftDiscussionRepliesAction` and `gatherReplyResourcesAction` directly
  (`useDiscussionReplies.ts:554`, `useReplyResources.ts:397,:526`). Both carry a
  `callLlm` at the top level of their own action body. Fully traced control ->
  code. This is Wave 1.
- **Surface S2 - learning resources.** NOT clean: the `callLlm`-bearing action
  (`findResourceLinksForConceptsAction`) is a shared internal with three
  server-side parents and no client caller, and its two client-facing parents
  (`lms-generation.ts` flow and `walkthrough-announcement.ts`) are different
  surfaces. The migration boundary must be chosen by the architect's
  reachability survey (R-1 below), not assumed. This is Wave 2, gated on that
  survey, because shipping it against the wrong boundary would bound a
  shared leaf the user does not reach. (`verify-reachability-not-just-
  correctness` memory: a capability can ship dead with every gate green.)

---

## 3. The five implementation forks, resolved (recommended readings)

The owner's standing rule is "build on the recommendation." Each fork below is
recorded as the recommended choice, not a hard ruling; the owner redirects if
wrong at one message's cost.

### F1 - Where the first-attempt bound lives

Three candidates: (a) thread an `AbortSignal` through `callLlm`; (b) a timeout
WRAPPER around the `callLlm` call; (c) a per-provider deadline inside
`callGemini`.

**RECOMMENDED: (b), a wrapper, placed in the new Route Handler** -
`raceWithTimeout(callLlm(req, provider), budgetMs)` (see F5 for why
`raceWithTimeout` over `withDeadline`). This is RULING 75 (per-caller wrapping,
not a threaded signal) applied unchanged, and it is what the four shipped
precedents already do (`pipeline/route.ts:259`, `course-intel/ask`,
`class-trends-insight`, `decks/ask`).

**`callLlm`'s signature does NOT change, and NO call site inherits anything.**
That is the point of choosing (b): the 136-line / 69-file `callLlm` census
(section 1) is UNTOUCHED, so the blast radius is the two new routes plus the
client hooks that now `fetch` them, not a repo-wide seam. The census is cited
here only to size what option (a) WOULD have cost - a 136-site seam the row
itself rules "needs its own chunking" (BACKLOG G4 instrument), carried as
residual R-4, not done here.

**Honest limit, stated so the build does not oversell it (Wave B finding):** a
wrapper bounds CALLER PATIENCE, not the work. The abandoned `callLlm` keeps
running and keeps burning Gemini quota until the platform reclaims the process
at the ceiling; `raceWithTimeout`/`withDeadline` cannot cancel it
(`bounded-race.ts:26-29`, `fetch.ts:303-307`). That is SUFFICIENT for this
row's harm - the user stops waiting and gets a worded `{error}` before the
platform kill instead of a raw transport failure - and INSUFFICIENT against
quota burn. True cancellation needs a signal threaded into `fetch`, which is a
different, larger item (R-4). The build's code comments must say this rather
than imply a cancellation the code does not perform.

Candidate (c) is rejected: a deadline inside `callGemini` is just (a) wearing a
different hat (it still needs a parameter on the shared helper, same 136-site
blast radius) and it cannot be elapsed-aware across a multi-call invocation
(RULING 76) because the helper cannot see the invocation's start.

### F2 - The timeout value(s), their single source, and how a timeout surfaces

**Value shape: elapsed-aware and per-invocation (RULING 76), never a fixed
per-call constant.** Even though both in-scope surfaces today make their
`callLlm` calls one-at-a-time inside a run, the budget is still computed as
`remainingMs = startedAtMs + TOTAL_BUDGET_MS - Date.now()`, clamped to
`[MODEL_WAIT_MIN_MS, MODEL_WAIT_MAX_MS]`, minus a `MODEL_WAIT_RESERVE_MS` sized
to the post-model work (parse, redact, respond). Rationale, unchanged from
`docs/g4-scope.md:336-381`: 31 caller files hold >=2 `callLlm` sites (one holds
8), so a fixed literal is wrong the moment a second call site is added, and it
costs nothing extra to write the elapsed-aware form from the start. S2's
resource path in particular already loops concepts and makes two `callLlm`
calls per concept (`learning-resource-links.ts:269,:338`), so the multi-call
case is live there, not hypothetical.

**Single source: one constants module, not per-route literals.**
RECOMMENDED: a new leaf `src/lib/llm-deadline.ts` exporting
`TOTAL_BUDGET_MS = 50_000`, `MODEL_WAIT_RESERVE_MS = 2_000`,
`MODEL_WAIT_MIN_MS`, `MODEL_WAIT_MAX_MS = 24_000`, and ONE pure helper
`remainingModelBudgetMs(startedAtMs, now)` returning the clamped value.
`TOTAL_BUDGET_MS = 50_000` with a 2s reserve is RULING 77's adopted number
(`class-trends-insight/route.ts:47,:51`); `54_000` from `course-intel/ask:145`
is named only so nobody invents a third. A leaf (not inline per route) so the
two routes share one tested number and a third future caller reuses it; it must
be a plain `.ts` leaf (not under `"use server"`) so the test can import the
constants and the helper can be unit-tested, matching why the existing
per-route budgets live as module constants the route tests read.

**How a timeout surfaces as the `{error}` string the UI expects.** On a fired
race the handler returns a normal HTTP response whose body carries
`{ error: "<label> timed out after N seconds" }` (the shape the client already
destructures from these actions' `{ok:false, error}` returns). Use a
distinguishable status so "timed out" is not confused with an ordinary throw:
the shipped idiom is **504 on deadline vs 502 on an ordinary failure**
(`pipeline/route.ts:74-82`). The message MUST contain the literal token
`"timed out"` (or `timeout`/`deadline`) - see the classifier note next.

**Chat-seam classification (where a classifier exists).** `classifyChatSeam
Failure` (`chatSeamDiagnostic.ts:37`) maps `/time(d)?[ -]?out|deadline|aborted/i`
-> `"timed out"` (a member of `CHAT_SEAM_FAILURE_CLASSES`, `:21-31`). Two facts
the build must honour:
1. `withDeadline`'s own message is `"<label> did not finish within N seconds"`
   (`fetch.ts:320`), which matches NONE of those tokens - it would classify as
   `"refused"`. So any message intended to classify as `"timed out"` must be
   worded with one of the matched tokens. RECOMMENDED label text: `"<surface>
   timed out after N seconds"`.
2. **Neither in-scope surface is a grading-chat seam.** `CHAT_SEAM_FAILURE_
   CLASSES` and `recordChatSeamSettled` belong to the GRADING-CHAT surface
   (operations `resolve_header`/`grade_item`/..., `chatSeamDiagnostic.ts:13-19`);
   discussion-replies and learning-resources do not record into it. So for
   these two paths the `{error}` string is shown to the user directly, and the
   classifier is relevant only as the WORDING CONTRACT (use a matched token) so
   that IF either surface is ever folded into a seam log, the message already
   classifies correctly. This is the diagnostics-representation criterion
   (DEV_LOOP b907ff8e) for a bug fix: the new failure the feature makes visible
   is "timed out", worded so a seam classifier can see it; no new diagnostic
   data path is added, and that is stated rather than assumed.

### F3 - Which routes need an explicit maxDuration, and what value

**RECOMMENDED: `export const maxDuration = 60` on each NEW Route Handler**, plus
`export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"`,
matching `pipeline/route.ts:49-51`. Files that get the export:

- Wave 1: `src/app/api/discussion-replies/route.ts` (new) - or one route per
  action if the request shapes differ enough (architect's call); the export
  lives on each route file created.
- Wave 2: the learning-resources route(s), path chosen by R-1's survey (S2 is
  not yet pinned to a path - do not invent one here).

`page.tsx` does NOT get an export: it is `"use client"` (section 1) and cannot
carry one; that is the defect, not a fix site. Value is 60 because these are
interactive user-facing paths that must return a worded error well under the
Hobby grant ceiling; the raced `TOTAL_BUDGET_MS = 50_000` sits below it with
10s of headroom for the pre-race `requireUser`/`req.json()` and the post-model
reserve. A route declaring 300 (the batch-export value) would be wrong here:
the point is to return BEFORE the platform kill, and 300 is not granted on
Hobby anyway.

### F4 - canvasGet's timeout: SEPARATE SIBLING ROW (recommended), not this scope

**RECOMMENDED: file canvasGet as its own backlog row, not fold it into G4.**
Four reasons, and a measurement correction the sibling row must carry.

Reasons it is a different item:
1. **Different transport.** `canvasGet` -> `canvasFetch` dials `node:https` with
   its own hop/redirect/timeout machinery (`canvas-fetch.ts:200-221`), not the
   `fetch`-based `callLlm` path. It reaches ZERO of the `callLlm` census. This
   is exactly the RULING-78 situation that split the image transport into G5:
   a separate transport is a separate row.
2. **Different value source.** The bound is `DEFAULT_TIMEOUT_MS = 15_000`
   (`grep -n DEFAULT_TIMEOUT_MS src/lib/canvas-fetch.ts` -> `:161`), not the
   `llm-deadline.ts` budget. Folding it in would mingle two unrelated constants.
3. **Different, larger caller set.** `grep -rln "canvasGet\|canvasRequest" src
   --include=*.ts | grep -v "\.test\."` -> **28 files**. Its own blast radius.
4. **Different fix shape** (see the correction).

**MEASUREMENT CORRECTION the sibling row must record (I can disprove the row's
framing, so I record the conflict rather than adopt it).** The task/row says
"canvasGet supplies NO timeoutMs, so it falls through to canvasFetch's default
(~37s observed)" - framed as an UNBOUNDED first attempt. Measured, it is not:
- `canvasFetch`'s default is **15s, bounded** (`DEFAULT_TIMEOUT_MS = 15_000`,
  `:161`; applied `:205`), enforced as one whole-call deadline incl. redirect
  hops (`:206`, `deadline = Date.now() + timeoutMs`).
- `canvasFetch` does **NOT retry** a network-layer failure (`:100-101` "NO
  RETRIES. E-REL2: NEVER retry a network-layer failure against a user-supplied
  host").
- The Success-Tracking course list is `listLiveCoursesAction` ->
  `listCourses` (`listings.ts:157`) -> `fetchCoursesForQuery` -> a PAGINATION
  loop `while (next && pagesFetched < CANVAS_PAGINATION_PAGE_CAP)` calling
  `canvasGet` per page (`listings.ts:111`, and `listCoursesByTerm` at `:186`).

So the ~37s the owner felt is an AGGREGATE of multiple 15s-bounded calls (a
base-URL validation/probe plus one or more paginated page fetches against an
unresponsive host), not one unbounded call. The defect is real but its SHAPE is
"no operation-level bound across a multi-call attended sequence, and 15s per
call is a long attended hang," not "unbounded first attempt." Its fix is
therefore one of: a tighter attended `timeoutMs` passed by the course-list
callers; a fast fail-closed base-URL reachability probe before paginating; or
an operation-level deadline threaded across the loop - none of which is the
`callLlm` wrapper this scope builds. That design belongs in the sibling row.

**Filing content for the orchestrator (so this is a deferral, not a silent
deletion - DEV_LOOP step 0):**
- Title: "Success-Tracking course listing has no operation-level bound; a
  misconfigured institution (RIZE) makes the attended user wait ~37s."
- Area: `canvas-fetch-attended-timeout`. Kind: bug.
- Measured facts: `DEFAULT_TIMEOUT_MS = 15_000` (`canvas-fetch.ts:161`);
  no network-layer retry (`:100-101`); paginated callers
  (`listings.ts:111,:186`); 28 canvasGet/canvasRequest caller files; client
  entry `live-messaging-enrollments.ts` `listLiveCoursesAction` (host now named
  in the error since `29624ca2`).
- Instrument (the sibling test must EXECUTE a bounded path, never grep for a
  name): a `listings.ts` test with `canvasGet` mocked to a fake-timer-advanced
  hang, asserting the operation fails fast at the chosen attended bound and
  that the page loop does not issue a second page after the deadline.
- Direction of failure: RED if the attended course-list operation can exceed
  the chosen operation-level bound against a hanging host.

### F5 - Test strategy (network blocked; mock the client/provider, never fetch)

`vitest.setup.ts` throws on real `fetch`; no key, no render (`this-repo.md`
s2/s6). So:

- **Mock `callLlm`, not `fetch`.** All existing tests for these paths already do
  (`vi.mock("@/lib/llm", () => ({ callLlm: vi.fn() }))`, e.g.
  `decks/ask/route.test.ts:9`). The route test mocks `callLlm` to return a
  promise that never resolves within the budget.
- **Prove fail-fast with FAKE TIMERS and `raceWithTimeout`, not `withDeadline`.**
  This is why F1 recommends `raceWithTimeout`: `vi.useFakeTimers()` patches
  `setTimeout` (which `raceWithTimeout` uses) but NOT `AbortSignal.timeout`
  (which `withDeadline` uses) - `bounded-race.ts:20-24` and the G5 scope both
  state this. The test: mock `callLlm` to a pending promise, call the handler,
  advance the fake clock past `TOTAL_BUDGET_MS`, and assert the handler resolves
  to the worded 504 `{error:"... timed out ..."}` WITHOUT the real call having
  settled - i.e. the race fired and the handler's own branch ran. A second
  (sabotage) case removes the wrapper and asserts the handler then does NOT
  resolve within the advanced clock (the behavioural pair G5 used: the unbounded
  mutant TIMES OUT the test, which is the correct red signature for "nothing
  bounds the call").
- **The pure budget helper is unit-tested directly.** `remainingModelBudgetMs`
  (F2) gets a frozen-literal oracle: hand-written `(startedAtMs, now)` ->
  expected clamped decimals across rows that each kill a different mutant (drop
  the max clamp -> killed by the zero-elapsed row; drop the floor -> killed by a
  large-elapsed row; drop the reserve subtraction -> killed by a mid row). This
  is the elapsed-aware-vs-literal discriminator G5 proved necessary: a
  single-tick assertion passes for both a literal and an elapsed-aware impl, so
  the oracle must advance elapsed time across rows.
- **What is NOT machine-verifiable here, stated:** that a real slow Gemini call
  on the deployed path returns the worded body BEFORE the platform kill (no
  network, no key) - R-2, owner post-deploy; and that the user SEES a legible
  "timed out" state (nothing renders) - R-3, owner/UX walk.

---

## 4. Disposition table (restructuring `docs/g4-scope.md`)

`docs/g4-scope.md` is the round-2 scope for the BROADER activity (bound the
whole ~60-caller `callLlm` seam, fork X/Y). This document narrows to the
owner-chosen Option A (two user-facing paths). Every prior requirement is mapped;
ids are re-derived last (this document's own ids are R-1..R-6 in section 5).

| Prior requirement (`docs/g4-scope.md`) | Disposition | Detail |
|---|---|---|
| S1/S2 `callLlm` shape, zero AbortSignal, census | KEPT | Re-measured section 1 (136/69, was 127/64). Shape unchanged. |
| Wave B (abort-retried-as-transient) | WITHDRAWN as a this-scope obligation - DISCHARGED | SHIPPED at `50617d9` (section 0). The enforcer it protected (abort terminal on both transports) is live; no replacement owed. |
| Wave A (A39 per-item `grade-run-item` route) | HANDED OVER to A39 | Not this scope's path; A39's Commit 4c owns it, constant `TOTAL_BUDGET_MS = 50_000` (RULING 77). Unchanged. |
| Wave C (~60 remaining callers, repo-wide walker) | HANDED OVER to R-4 | Option A bounds only the two user-facing paths; the repo-wide seam + its enforcement walker is a separate chunk (BACKLOG G4 instrument: a signature change needs its own chunking). Carried as R-4, not withdrawn. |
| S6 elapsed-aware budget (RULING 76) | KEPT, APPLIED | Section 3 F2 adopts it as the required value shape and names the single-source leaf. |
| S6.4 shared-ceiling (cron) sizing rule | HANDED OVER to R-4 | Neither in-scope surface is the unattended/cron population; its rule stays with the repo-wide chunk. |
| S6.5 persist-before-done write ordering | HANDED OVER to R-5 | Neither S1 nor S2 persists mid-run on the timed-out path (both return to the client); the three unattended grading paths' write-ordering debt stays R7/R8 of `g4-scope.md`, re-filed as R-5. |
| S7 fork X/Y recommendation (X) | SUPERSEDED by the AC's A/B/C fork, resolved A | The AC re-framed X/Y into A/B/C and SHIPped A; this document builds A. X (per-caller wrapping) survives inside A as the wrapper mechanism (F1). |
| S9 residual register R1-R8 | KEPT, re-mapped | R1 (ai-chat unbounded) -> R-6; R2 (Wave B) -> discharged; R4 (budget adequacy) -> R-2; R5 (legible state) -> R-3; R6 (image) -> done (G5); R7/R8 (write ordering) -> R-5. |

Backward check: every section head of `g4-scope.md` (1,1a,2,3,4,5,6,7,8,9,10)
is represented above or is pure measurement restated in section 1; no prior
requirement is dropped without a disposition.

---

## 5. Wave plan (smallest-shippable-first, explicit write sets)

Each wave is independently pushable and gated on `git status --short` against
its write set plus `src/file-size-ceiling.structure.test.ts` (the one
unconditional canary) and the source-text/structure tests that read the edited
files (section 6). A wave that names >=2 test files runs them via
`npm run test:paths <p1> <p2> ...`, never a raw multi-path vitest.

### Wave 1 - the shared deadline leaf (foundation, no behaviour change)
Smallest shippable. A pure leaf + its test; no route, no client change, so it
ships green and bounds nothing yet (dark).
- Write set: `src/lib/llm-deadline.ts` (new, ~40 lines), its caller none-yet is
  legal ONLY because this is a type/constant+pure-helper leaf with its own unit
  test as the consumer (the test IS the caller that exercises the export - state
  this explicitly so the wave gate does not read it as dead code); `src/lib/
  llm-deadline.test.ts` (new).
- Pass condition: object = `remainingModelBudgetMs` return; instrument = the
  frozen-literal oracle (F5); direction = RED if any clamp/reserve mutant
  survives. `@(Get-Content src/lib/llm-deadline.ts).Count` < 1000 (trivially).

### Wave 2 - Surface S1 (discussion replies) to a Route Handler
The fully-traced surface. First surface that actually bounds a user path.
- Write set (build confirms exact split):
  - `src/app/api/discussion-replies/route.ts` (new) - `maxDuration = 60`,
    `runtime`/`dynamic`, `requireUser`/`requireAppOwner` per the existing guard
    (see note), races `callLlm` via `raceWithTimeout` against
    `remainingModelBudgetMs`, returns worded 504 vs 502. Imports the existing
    draft/gather logic from a leaf.
  - `src/app/actions/discussion-replies.ts` (edit) - extract the `callLlm`-
    bearing bodies of `draftDiscussionRepliesAction`/`gatherReplyResourcesAction`
    into plain leaf functions the route imports; keep (or thin) the `"use
    server"` exports only if any non-migrated caller still needs them (grep says
    the client hooks are the only callers, so they can be removed once the hooks
    switch).
  - `src/app/components/recording/useDiscussionReplies.ts` (edit) - call
    `fetch("/api/discussion-replies", ...)` instead of the Server Action.
  - `src/app/components/recording/useReplyResources.ts` (edit) - same for gather.
  - Tests: `src/app/api/discussion-replies/route.test.ts` (new, the fake-timer
    race + sabotage pair), and the existing source-text tests that name these
    symbols (section 6) updated to the new shape.
- Pass condition: AC-1 (callLlm only inside a race under a declared <=60
  ceiling, budget < maxDuration*1000), AC-2 (worded 504, distinguishable from
  502, not swallowed), AC-4 (in-house egress only). Object/instrument/direction
  as F5.
- Ceiling check: `discussion-replies.ts` is 786 lines (`wc -l` and
  `@(Get-Content).Count` both 786); extracting bodies into a leaf REDUCES it, so
  no 1000-line risk. The new route file is small.

### Wave 3 - Surface S2 (learning resources) to a Route Handler
GATED on R-1 (architect reachability survey) choosing the client-facing boundary
- do NOT dispatch this wave until the survey pins which client action reaches
the resource generation, because `findResourceLinksForConceptsAction` is a
shared leaf with three parents (section 2).
- Write set (provisional, survey finalizes): a new route under
  `src/app/api/learning-resources/...` (`maxDuration = 60`), the client entry
  the survey names (edit), and `learning-resource-links.ts` left as the shared
  leaf the route imports (its `RETRY_BUDGET_MS` run-budget stays; the new race
  bounds the FIRST attempt the run-budget never covered). Plus route test and
  updated source-text tests.
- Pass condition: same AC-1/AC-2/AC-4, with the multi-call elapsed-aware budget
  exercised (two `callLlm` per concept, `:269,:338`).
- Ceiling check: `learning-resource-links.ts` is 748 lines; no edit adds bulk
  (the route is a new file), so no ceiling risk; re-measure at build.

**Note on the guard (Operability trigger).** The existing batch routes use
`requireUser`; `requireOwner()` is a deprecated alias for any active account and
`requireAppOwner()` is the real owner gate (`seats.md` Operability). The build
must match whatever guard the migrated action had, not silently widen or narrow
it; `findResourceLinksForConceptsAction` uses `requireOwner` today
(`learning-resource-links.ts:72`) - carry that intent (likely
`requireAppOwner` if owner-only is meant) and record the choice.

---

## 6. owns file list (command shown, output pasted)

Files this build may WRITE, plus the files that READ the edited files AS SOURCE
TEXT (a grep-string test that names a symbol reddens when the symbol moves). The
reader closure is the real hazard - a correct migration can turn a source-text
test red.

Command (run 2026-10-11 from repo root):
```
grep -rln "draftDiscussionRepliesAction\|gatherReplyResourcesAction\|\
findResourceLinksForConceptsAction\|generateLearningResourcesForSelection\|\
deriveResourceConcepts" src --include=*.ts --include=*.tsx \
  | grep -v -E "^src/app/actions/(discussion-replies|learning-resource-links|learning-resources-generator)\.ts$" | sort
```
Output (readers-as-source closure):
```
src/app/actions/action-guard-coverage-github-cohort.test.ts
src/app/actions/discussion-replies-bulk-redaction.test.ts
src/app/actions/discussion-replies-draft.test.ts
src/app/actions/discussion-replies-resources.test.ts
src/app/actions/intro-discussion-generator.test.ts
src/app/actions/intro-discussion-generator.ts
src/app/actions/learning-resource-links.test.ts
src/app/actions/learning-resource-links.yield.test.ts
src/app/actions/learning-resources-generator.test.ts
src/app/actions/lms-generation.intro-discussion.test.ts
src/app/actions/lms-generation.test.ts
src/app/actions/lms-generation.ts
src/app/actions/message-replies.test.ts
src/app/actions/message-replies.ts
src/app/actions/walkthrough-announcement.test.ts
src/app/actions/walkthrough-announcement.ts
src/app/components/message-replies/useMessageReplies.wiring.test.ts
src/app/components/recording/discussion-capture.resources.test.ts
src/app/components/recording/discussion-capture.ts
src/app/components/recording/discussion-draft-loop.ts
src/app/components/recording/discussion-persisted-controls.ts
src/app/components/recording/useDiscussionReplies.ts
src/app/components/recording/useReplyResources.test.ts
src/app/components/recording/useReplyResources.ts
src/app/components/recording/useReplyRowResourceMutators.test.ts
src/app/components/recording/useReplyRowResourceMutators.ts
src/lib/discussion-reply-prompt.ts
src/lib/grounding-sources.ts
src/lib/lms-generation/kind-configs.ts
```
Plus the primary edited/created files: `src/lib/llm-deadline.ts` (new),
`src/lib/llm-deadline.test.ts` (new), `src/app/api/discussion-replies/route.ts`
(new) + `route.test.ts` (new), `src/app/actions/discussion-replies.ts` (edit),
`src/app/components/recording/useDiscussionReplies.ts` (edit),
`src/app/components/recording/useReplyResources.ts` (edit); Wave 3 adds the
learning-resources route + its client entry (R-1).

**Structure-gate readers to run in every wave gate** (these scan directories /
census, not symbols): `src/file-size-ceiling.structure.test.ts` (always);
`src/app/actions/action-guard-coverage-github-cohort.test.ts` and
`wholesale-auth-mock-population.structure.test.ts` (both appear in the reader
list above - they enumerate action-guard coverage, so moving an action's guard
or body touches them). `src/lib/use-server-exports.test.ts` must run on any wave
that changes a `"use server"` module's exports (removing the migrated actions
changes `discussion-replies.ts`'s export set). A new file under `src/app/api/`
is a new route; confirm no api-directory frozen-roots canary exists that needs
its N bumped (`gate-must-include-directory-canary` memory) - measured: no
`*.structure.test.ts` enumerates `src/app/api` route files today
(`grep -rln "app/api" src/**/*.structure.test.ts` -> none), so no bump owed, but
re-check at build.

---

## 7. What cannot be verified in this checkout (stated, not worked around)

- The platform kill itself and whether the worded body returns before it: no
  `.env`, no key, network blocked (`this-repo.md` s6). R-2, owner post-deploy.
- Whether the user SEES a legible "timed out" state: no component renders under
  vitest. R-3, owner/UX walk.
- Real Gemini latency / whether 50s is generous enough for a real grading-sized
  resource run: no key. R-2.
- The canvasGet ~37s aggregate: not reproducible here (network blocked); the
  sibling row's instrument uses a fake-timer-advanced mock, not a live host.

---

## 8. Residual register (owner / instrument / step - each present or it is a deletion)

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R-1 | S2's client-facing migration boundary is unpinned: `findResourceLinksForConceptsAction` has 3 server-side parents and no client caller (section 2). Wave 3 must not ship against the wrong layer. | Architect | Trace each client control that reaches resource generation (lms-generation flow, walkthrough-announcement) to the `callLlm` call; name the one client-facing action per surface | Architect reachability survey, BEFORE Wave 3 dispatch |
| R-2 | Worded body returns before the platform kill on the deployed path; 50s budget adequacy for a real run | Repo owner | Deploy; trigger a slow model call on an in-scope path; observe a worded 504, not a blank failure; confirm no item times out that would have finished under 60s | Post-deploy owner verification |
| R-3 | The instructor sees a legible "timed out" state on screen | Repo owner / UX pass | Browser observation - nothing renders under vitest | A39-style owner walk on the as-built diff |
| R-4 | The repo-wide `callLlm` seam (the other ~60-67 unbounded callers) and true-cancellation via a threaded fetch signal - Option C / fork X-Y. Option A bounds only the 2 named surfaces; quota burn on an abandoned call is NOT closed (F1 limit). | The `callLlm`-seam implementer / a loop-architect pass | `docs/g4-scope.md:644-689` (the repo-wide walker: derive the census at runtime, ratcheting allowlist, call-expression anchor not a 200-char proximity match) | A dedicated repo-wide chunk, only if/when the owner escalates beyond the 2 paths |
| R-5 | Persist-before-done write ordering on the three unattended grading paths (`steps.grading-repos.grade-repo.ts`, `-draft-flow.ts`, `-cartridge.ts`): a mid-batch platform kill loses all accumulated results or marks a drop "graded" before its draft is durable (`docs/g4-scope.md:446-514`). Not touched by Option A (neither in-scope surface persists mid-run). | Whoever next touches those three files | A test that throws on the (N+1)th model call and asserts the durable store holds N results, not zero | The next chunk touching any of the three files |
| R-6 | `ai-chat/route.ts` has no `maxDuration` and no wrapper (`callLlm` bare at `:653`) - a live user-facing unbounded path NOT in the row's two named paths | Wave 3+ or a standalone follow-up | A wiring assertion that the route has BOTH a declared `maxDuration` AND an elapsed-aware wrapped call (not a bare `grep maxDuration`) | Fold into Option A's follow-up or file as its own row if the owner wants it in scope |
| R-SIBLING | The canvasGet / Success-Tracking course-list attended-timeout row (F4): filed as its own backlog row with the corrected 15s-not-37s measurement | Orchestrator (filing) then a canvas-fetch implementer | F4's EXECUTE-a-bounded-path instrument (fake-timer hang, assert fail-fast + no second page) | Orchestrator files the row; a later chunk builds it |

All residuals above exist only in this document until the orchestrator files
R-1..R-6 and R-SIBLING as rows in `docs/BACKLOG.md`; `iteration-caps.md` counts
an unfiled residual as not yet real.

---

## 9. Verification of this document's own write set

```
git status --short   # this pass writes exactly docs/g4-timeout-bounding-scope.md
```
No file under `src/`, no test file, no other `docs/` file was opened for
writing. Every quantity above was produced by a command run against the real
tree this session (the `callLlm` census 136/69; `DEFAULT_TIMEOUT_MS = 15_000`;
the 28 canvasGet callers; the 786/748 line counts by both `wc -l` and
`@(Get-Content).Count`; the readers-as-source closure grep output pasted in
section 6) or read from an opened `file:line` (every cited line was opened:
`llm.ts:382/427/485/652`, `bounded-race.ts:31`, `fetch.ts:316`,
`canvas-fetch.ts:161`, `listings.ts:111`, `chatSeamDiagnostic.ts:37`,
`learning-resource-links.ts:121/455`, `discussion-replies.ts:712`). The
measurement conflict in F4 (row says ~37s unbounded; tree says 15s bounded +
pagination) is recorded, not silently adopted either way.
