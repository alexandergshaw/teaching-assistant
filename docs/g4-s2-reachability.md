# G4 R-1: Surface S2 reachability survey (read-only)

Read-only reachability survey. This document's own write set is exactly
`docs/g4-s2-reachability.md`. No production code is edited here. It answers the
R-1 residual of `docs/g4-timeout-bounding-scope.md` (section 8): where the S2
timeout bound belongs, so a later W3 can wrap it exactly as W2 wrapped S1.

All quantities were produced this session (2026-10-11) by the command shown;
every `file:line` cited was opened.

---

## 0. The question, and the one-line answer

**Question:** what is the CLIENT-FACING entry point of the learning-resources
generation path, and is it the right place to put the timeout bound?

**Answer:** the learning-resources page has exactly ONE client-facing entry -
`generateFromSelectionAction` with `kind: "resources"`, called from
`useLmsGeneration.ts:563`. It is NOT a clean single-purpose action like S1's:
it is a NINE-kind dispatcher (`lms-generation.ts:206`), of which "resources" is
one case (`:586-614`). The slow resource-search leaf
(`findResourceLinksForConceptsAction`) is additionally reached by a SECOND,
distinct client surface - the walkthrough-announcement research call
(`gatherWalkthroughResourcesAction`, `useWalkthroughGenerationAdapters.ts:31`) -
which the scope's "two named paths" did not name. So S2 is not one clean action;
pinning its boundary is a SHAPE decision with a fork, resolved in section 4.

---

## 1. The measured import/call graph (OUT from the LLM call to every client entry)

### 1a. The slow leaf and its direct LLM calls

`findResourceLinksForConceptsAction` - `src/app/actions/learning-resource-links.ts:455`
(`"use server"`). Its guard is `requireOwner()` (import `:72`, call `:497`). It
holds two `callLlm` sites (`grep -c "callLlm(" src/app/actions/learning-resource-links.ts`
-> **2**; they are `:269`, `:338`) and loops them per concept, under an internal
`RETRY_BUDGET_MS = 32_000` wall-clock budget (`:121`) that gates RETRIES only,
never the first attempt. This is the documented 90-100s path the row targets.

### 1b. Every non-test importer of the slow leaf (the fan-in)

Command:
```
grep -rln "findResourceLinksForConceptsAction" src --include=*.ts --include=*.tsx \
  | grep -v "\.test\." | sort
```
Output:
```
src/app/actions/discussion-replies.ts
src/app/actions/learning-resource-links.ts        <- the definition itself
src/app/actions/learning-resources-generator.ts
src/app/actions/walkthrough-announcement.ts
src/lib/discussion-reply-prompt.ts                <- COMMENT only (:25)
src/lib/grounding-sources.ts                       <- COMMENT only (:163)
```
The two `src/lib` entries are comment references, not calls (verified: both
lines open as `//`/`*` comments). So the leaf has exactly THREE server-side
INVOKERS, each a parent action on a different user surface:

| Parent action (invoker) | Call site | Client surface | Bounded today? |
|---|---|---|---|
| `gatherReplyResourcesAction` | `discussion-replies.ts:712` | Discussion replies (S1) | **YES** - W2 route (`e08d7d64`) |
| `findResourceLinksSafely` -> ... | `learning-resources-generator.ts:239` | LMS learning-resources page | NO |
| `gatherWalkthroughResourcesAction` | `walkthrough-announcement.ts:294` | Walkthrough announcement | NO |

`findResourceLinksForConceptsAction` has NO client caller. Command:
```
grep -rln "findResourceLinksForConceptsAction" src/app/components \
  --include=*.ts --include=*.tsx | grep -v "\.test\."
```
-> (no rows). This confirms the scope's section-2 ruling: the leaf is a shared
internal, and the bound must sit at the client-facing PARENT, never the leaf.

### 1c. Surface path A - the LMS learning-resources page (the scope's "S2")

Full chain, each hop opened:

1. CLIENT: `useLmsGeneration.ts:563` calls `generateFromSelectionAction({... kind ...})`
   inside `runGenerationCall(...)` (`:562`). This is the ONLY production client
   invocation of that action (command below). `page.tsx:1` is `"use client"`,
   so this Server Action inherits no route-segment ceiling.
2. ACTION: `generateFromSelectionAction` - `lms-generation.ts:206`, guard
   `requireOwner()` (`:210`). It is a dispatcher over nine kinds; `kind: "decks"`
   is refused here (`:223-225`) and runs through its own route instead (1e).
   The `"resources"` case is `:586-614`.
3. The resources case calls `generateLearningResourcesForSelection(moduleLabel,
   materials.materialsText, provider, courseKind)` - `lms-generation.ts:593`.
4. GENERATOR: `generateLearningResourcesForSelection` -
   `learning-resources-generator.ts:432`. It fires TWO LLM legs in parallel
   (`Promise.all`, `:497-506`): a prose `callLlm` (`:498`) and
   `deriveResourceConcepts` (`:505`, defined `:172`, its own `callLlm` `:187`).
   It then calls `findResourceLinksSafely` (`:232`), which calls the slow leaf
   `findResourceLinksForConceptsAction` (`:239`).

So one resources run = prose call + concept-extraction call (parallel) + the
grounded-search leaf (concepts x 2 calls each). Deeply multi-call.

The only non-test, non-comment client INVOCATION of `generateFromSelectionAction`:
```
grep -rn "generateFromSelectionAction(\|gatherWalkthroughResourcesAction(" \
  src/app/components --include=*.ts --include=*.tsx | grep -v "\.test\."
```
-> `useLmsGeneration.ts:563` and `useWalkthroughGenerationAdapters.ts:31` (the
other component matches for these names, listed below, are comments or type/doc
references, not calls).
```
grep -rln "generateFromSelectionAction\|gatherWalkthroughResourcesAction" \
  src/app/components --include=*.ts --include=*.tsx | grep -v "\.test\."
```
-> 10 files, of which only the two above contain a call expression; the other
eight (`lmsGenerationDeckHelpers.ts`, `lmsGenerationDiagRecord.ts`,
`lmsGenerationKindHelpers.ts`, `lmsGenerationSafeCall.ts`,
`lmsGenerationSelection.ts`, `lmsGenerationTypes.ts`, `useVisualizerCoverage.ts`,
`announcement-draft-slots.ts`) mention the names only in comments/types.

### 1d. Surface path B - walkthrough-announcement research (NOT in the scope's named pair)

1. CLIENT: `useWalkthroughGenerationAdapters.ts:31` (`"use client"`, `:1`) calls
   `gatherWalkthroughResourcesAction(ctx.materialsText, ctx.courseLabel, ctx.provider)`
   inside the `fetchResources` adapter - the sole site allowed to call this
   server action directly (its own comment, `:24-28`).
2. ACTION: `gatherWalkthroughResourcesAction` - `walkthrough-announcement.ts:280`,
   guard `requireUser()` (`:286`). It calls `deriveResourceConcepts` (`:288`,
   same `learning-resources-generator.ts:172` leg) then the slow leaf
   `findResourceLinksForConceptsAction` (`:294`).

This is a slow path (concept extraction + grounded search) on a DIFFERENT user
feature than "learning resources", and it is unbounded.

### 1e. What already runs behind a route (the precedents, for shape)

- S1 (W2): `src/app/api/discussion-replies/route.ts` - shipped `e08d7d64`
  (`git log --oneline -- src/app/api/discussion-replies/route.ts`; follow-up fix
  `84748642`). Body is `{op: "draft"|"gather", args}`; it `requireOwner()`s,
  computes an elapsed-aware budget, `raceWithTimeout`s the chosen whole action,
  and returns a worded 504 (timeout) vs 502 (failure) vs the value
  (`route.ts:50-96`). `maxDuration = 60` (`:21`).
- Decks: `src/app/api/lms-generation/deck/route.ts` - the one `generateFrom
  SelectionAction` kind that was ALWAYS its own function (`generateDeckFrom
  TemplateAction`), route-ified because it runs several sequential LLM calls
  (`:23-51`). It RE-IMPLEMENTS the shared preamble (resolve course `:120-132`,
  expand modules `:140-149`, gather materials `:151-158`) because a `"use server"`
  module exports only async functions, so that preamble cannot be imported
  (`:55-62`). `maxDuration = 300` (`:53`) - but its own comment (`:39-51`) says
  Hobby's hard ceiling is 60s regardless, so the 300 is cosmetic. The client
  reaches it via `generateDeckApi` fetch (`useLmsGeneration.ts:516`), which
  already treats a non-JSON platform-timeout response as a clean error (`:43-45`
  comment). This is the proven client idiom a W3 fetch must copy.

The shared deadline leaf exists and is wired: `src/lib/llm-deadline.ts` exports
`TOTAL_BUDGET_MS = 50000` (`:5`), `MODEL_WAIT_RESERVE_MS = 2000` (`:8`),
`MODEL_WAIT_MIN_MS = 8000` (`:11`), `MODEL_WAIT_MAX_MS = 24000` (`:14`), and
`remainingModelBudgetMs(startedAtMs, now)` (`:26`) returning the clamped value
or the sentinel `0` (under MIN -> "do not start", `:28`). W2's route consumes
all of these (`discussion-replies/route.ts:5`).

---

## 2. The SHAPE finding (the reason R-1 existed)

The scope's "S2 = learning resources" resolves to a client boundary that is a
MULTI-KIND dispatcher, not a dedicated action. Two consequences the build must
not get wrong:

- **There is no clean single-kind boundary to wrap.** The resources case shares
  `generateFromSelectionAction`'s preamble (course resolve + materials gather)
  with eight other kinds. Bounding only "resources" therefore means EITHER
  duplicating that preamble into a per-kind route (the deck-route tax, `:55-62`)
  OR wrapping the whole nine-kind action (which bounds the other kinds too).
- **The slow leaf is reached by a second live client surface the pair never
  named** (path B, walkthrough). Bounding path A alone leaves path B's identical
  grounded-search hang unbounded - the same harm, one surface over. This is the
  `verify-reachability-not-just-correctness` memory in the scoping seat: a
  sibling surface can carry the same unbounded call with every gate green.

Neither consequence is an implementation detail resolvable by the implementer;
both are scope-shaped, so they are surfaced as a fork (section 4), not assumed.

---

## 3. Is `generateFromSelectionAction` the right place to put the bound?

Yes for the LMS surface - it is the only client boundary that path A crosses,
and it is where S1's precedent puts the bound (at the client-facing action, via
a route). But it bounds MORE than resources, because it is multi-kind. The
honest options for the bound's placement:

- **(b) Wrap the whole action in one route** - RECOMMENDED (F1 below). No
  preamble duplication: the route imports and `raceWithTimeout`s
  `generateFromSelectionAction(body)` exactly as W2's route races
  `gatherReplyResourcesAction`. Bounds resources AND the seven sibling non-deck
  kinds, which are all equally-unbounded user-facing LLM Server Actions. Larger
  client change (the whole generic branch repoints to a fetch) but SIMPLER route
  code and the same shape as W2.
- **(a) Per-kind resources route** - deck-style, duplicates ~120 lines of
  preamble and bounds only one of several unbounded kinds; carries the deck
  route's standing divergence tax (its many "mirrors generateFromSelectionAction
  exactly" comments). Faithful to the narrow "learning resources" wording, but
  more code and less harm closed.
- **(c) Bound inside the leaf / inside `generateFromSelectionAction`** - rejected
  for the same reason the scope rejected it for S1: a wrapper inside a Server
  Action reached from a `"use client"` page gets no DECLARED ceiling (Option A's
  whole premise), and the leaf is shared across three surfaces.

---

## 4. Recommended S2 boundary and the terminating fork (go-with-recommended)

**RECOMMENDED S2 boundary (option b above):** W3 wraps the WHOLE
`generateFromSelectionAction` in one new Route Handler
`src/app/api/lms-generation/generate/route.ts`, racing the elapsed-aware budget,
and repoints `useLmsGeneration.ts`'s generic (non-deck) branch to fetch it.
PLUS wrap the walkthrough surface (`gatherWalkthroughResourcesAction`) in a
second small route, because it is S1-shaped (one clean single-purpose action)
and reaches the same unbounded leaf.

Rationale: (1) no clean single-kind boundary exists (section 2); (2) wrapping the
whole action is the lower-code, lower-divergence choice and matches W2's
race-the-whole-action shape; (3) it discharges part of R-4/R-6 (other unbounded
user-facing LLM callers) for free; (4) the owner's standing "prefer the most
extensive build" favours bounding all the unbounded generic kinds over one.

**THE FORK (shaped so every answer terminates the activity):** the scope named
"two paths"; this survey finds the learning-resources boundary is a nine-kind
action plus a sibling surface. W3 therefore builds ONE of:

- **(W) Broad:** bound the whole `generateFromSelectionAction` (all non-deck
  kinds) + the walkthrough `gatherWalkthroughResourcesAction`. [RECOMMENDED]
- **(N) Narrow:** bound ONLY the learning-resources kind via a deck-style
  per-kind route, and leave the walkthrough surface to R-6.

This is a product/scope decision (how much of the unbounded-LLM surface Option A
closes), not an implementation fork, so it is the orchestrator's to settle or
the owner's. It is NOT a reason to stall: (W) is the recommended reading and the
section-5 write set is written for it; (N) is a strict subset of it (drop the
walkthrough route; make the LMS route per-kind with a duplicated preamble).
Either answer ends R-1.

---

## 5. If W3 proceeds: the write set (smallest-shippable-first)

Written for the RECOMMENDED (W) reading. Each wave is independently pushable and
gated on `git status --short` against its write set.

### W3a - the LMS generate route (the scope's S2 proper)
Write set:
- `src/app/api/lms-generation/generate/route.ts` (new). `export const runtime =
  "nodejs"`, `export const maxDuration = 60` (per scope F3; do NOT copy the deck
  route's cosmetic 300 - the race returns at the 50s budget, below the 60s Hobby
  kill), `export const dynamic = "force-dynamic"`. Guard `requireOwner()` to
  MATCH `generateFromSelectionAction`'s own guard (`lms-generation.ts:210`) -
  neither widen nor narrow. Body = the `GenerateFromSelectionInput` object the
  client already sends. Compute `budgetMs` for a MULTI-CALL run exactly as W2's
  gather branch does (`TOTAL_BUDGET_MS - MODEL_WAIT_RESERVE_MS - (now -
  startedAtMs)`, `discussion-replies/route.ts:54`), not the per-call clamp.
  OR-1: if `remainingModelBudgetMs(...) === 0`, return the worded 504 BEFORE
  calling the action (the race cannot cancel the loser). `raceWithTimeout
  (generateFromSelectionAction(body), budgetMs)` -> worded 504 (message carries
  the literal token "timed out" so the client's chat-seam classifier matches,
  per scope F2) vs 502 vs the `{artifact, notes}|{error}` value.
- `src/app/components/content-tab/modules/useLmsGeneration.ts` (edit): repoint the
  generic branch at `:562-563` from `runGenerationCall(() =>
  generateFromSelectionAction({...}))` to a fetch of the new route, reusing the
  non-JSON-is-a-clean-error idiom `generateDeckApi` already uses (`:43-45`). The
  diag record (`createDiagRecorder`, `:544`; `startedAt`, `:543`) must wrap the
  FETCH, so the diagnostics-representation criterion (timing/returned/rejected)
  is preserved - this is the DEV_LOOP diagnostics-representation criterion for
  this path; name it in the W3 AC.
- `src/app/api/lms-generation/generate/route.test.ts` (new): the fake-timer race
  + sabotage pair from scope F5 (mock the action to a never-resolving promise,
  advance past the budget, assert worded 504 without the call settling; sabotage
  = remove the wrapper, assert the handler then does not resolve within the
  advanced clock). Network is blocked, so mock the ACTION, never `fetch`.

### W3b - the walkthrough research route (only under reading W)
Write set:
- `src/app/api/walkthrough-resources/route.ts` (new). Same segment config. Guard
  `requireUser()` to MATCH `gatherWalkthroughResourcesAction`'s guard
  (`walkthrough-announcement.ts:286`) - this one is NOT owner-only; do not copy
  W2's `requireOwner`. Body = `{materialsText, courseLabel, provider}`. Multi-call
  budget. `raceWithTimeout(gatherWalkthroughResourcesAction(...), budgetMs)` ->
  worded 504 vs 502 vs the `ResourceOutcome` value.
- `src/app/components/walkthrough-announcement/useWalkthroughGenerationAdapters.ts`
  (edit): repoint `fetchResources` (`:29-33`) from the direct action call to a
  fetch of the new route, preserving its outer try/treat-throw-as-"failed" belt.
- `src/app/api/walkthrough-resources/route.test.ts` (new): the same race +
  sabotage pair.

The shared leaf `learning-resource-links.ts` is NOT edited in either wave (its
`RETRY_BUDGET_MS` internal budget stays; the new race bounds the first attempt
the run-budget never covered). `src/lib/llm-deadline.ts` is NOT edited (W1
shipped it).

### Gate list for each W3 wave (INCLUDING this session's learned canaries)
- `git status --short` against the wave's write set, and confirm no
  `.claude/worktrees` copy was edited (`stale-worktree-shadows-glob` memory).
- `src/file-size-ceiling.structure.test.ts` (the always-on canary). New route
  files are small; re-measure any EDITED file with `@(Get-Content <f>).Count`.
- Any `src/app/actions` edit: NONE is planned here (the actions are imported
  unchanged, not moved), so `wholesale-auth-mock-population.structure.test.ts`
  and `action-guard-coverage-github-cohort.test.ts` SHOULD be unaffected - but
  RUN them, because they enumerate action-guard coverage and a new route that
  calls an action can trip the coverage census. If an edit to an action's export
  set does become necessary, also run `src/lib/use-server-exports.test.ts`.
- `src/tools/strip-comments-agreement.structure.test.ts` - RUN it. (CORRECTION
  to the scope's "no `*.structure.test.ts` enumerates `src/app/api`": this one
  DOES reference an api path, `:482`, but only as a comment-dialect exclusion;
  it is a tree-wide scanner keyed on comment-strip/tokenizer expressions, and a
  plain timeout route contains none, so no frozen-count bump is expected. RUN it
  anyway to confirm, per the `gate-must-include-directory-canary` memory.)
- If the wave names >= 2 test files, run them with `npm run test:paths <p1>
  <p2> ...`, never a raw multi-path vitest (`test-paths-wrapper` memory).
- A full `npm test` sweep as the backstop before the push.
- No new browser-seam module is introduced (route handlers run in node), so the
  session-diagnostic-log substring scan is not triggered unless a test names a
  browser-seam module; none is planned.

---

## 6. What can and cannot be verified in this checkout

Verifiable here (network-blocked, fake-timer): that the handler returns a worded
504 within the elapsed budget without the mocked model call settling, and that
removing the wrapper makes the handler hang past the advanced clock (the race +
sabotage pair, section 5). The budget helper `remainingModelBudgetMs` already has
its frozen-literal oracle from W1.

NOT verifiable here, carried as owner/residual (same as S1's R-2/R-3):
- That the worded body returns BEFORE the real Hobby platform kill on a deployed
  slow Gemini run, and that 50s is generous enough for a real resources run - no
  `.env`, no key, network blocked (`this-repo.md` s6). Owner, post-deploy.
- That the instructor SEES a legible "timed out" state - no component renders
  under vitest (`this-repo.md` s6; MEMORY headless-count). Owner/UX walk on the
  as-built diff.

---

## 7. Residual / filing notes for the orchestrator (this survey changes nothing itself)

- R-1 is DISCHARGED by this survey: S2's client boundary is pinned
  (`generateFromSelectionAction` kind="resources", `useLmsGeneration.ts:563`),
  and the fork (W vs N) is stated with a recommendation. The orchestrator either
  settles the fork (go-with-recommended = W) or routes it to the owner, then
  briefs W3 from section 5.
- The walkthrough surface (`gatherWalkthroughResourcesAction`) is a NEW finding
  not in the scope's named pair. Under reading W it is W3b; under reading N it
  belongs with R-6 ("other unbounded user-facing paths"). It is not silently
  dropped either way - record it as a row or as part of W3.
- Measurement conflict recorded, not adopted: the scope's section 6 asserted no
  `*.structure.test.ts` enumerates `src/app/api`; this survey found
  `src/tools/strip-comments-agreement.structure.test.ts:482` references an api
  path. The reconciliation (it is a comment-dialect scanner, not a route
  enumeration, so no bump expected but RUN it) is in section 5's gate list.

### Verification of this document's own write set
```
git status --short   # this pass writes exactly docs/g4-s2-reachability.md
```
No file under `src/`, no test, no other `docs/` file was opened for writing.
