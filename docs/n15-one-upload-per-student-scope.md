# N15 merged scope: one-upload-per-student (N15a) + photo downscale (N15-PHOTO-DOWNSCALE)

An architecture artifact (leverage claim + reuse survey + shape decisions +
wave plan + forks + residual register). NOT code. A fresh `loop-checker` reads
it before any build wave consumes it.

Every quantity below names the command that produced it, run in this checkout
on 2026-10-11 from the Bash tool. Line counts use `wc -l`; per
`docs/loop/this-repo.md` section 3, `wc -l` from the Bash tool agrees with the
mandated `@(Get-Content <file>).Count` on this repo (both gave 964 on the file
that disagreement was measured on; only `Measure-Object -Line` diverges). A
build wave re-measures with `@(Get-Content).Count` in PowerShell before trusting
any ceiling claim here.

This environment CANNOT verify: no component is rendered by any test (vitest is
node-env, `include: ["src/**/*.test.ts"]`), the network is blocked
(`vitest.setup.ts`), there is no `.env`, and there is NO browser `canvas` under
node. Every UI, keyboard, and canvas-downscale claim here is a reading claim and
is marked so. See sections 8 and 9.

---

## 0. Citations in the dispatch brief, verified against the tree

The dispatch brief carried three `file:line` cites and warned they might be
stale. All three ARE stale; the symbols are real at new addresses. Measured with
`grep -n` on the current files:

| Brief cite | Status | Measured truth |
|---|---|---|
| `getGeminiInterRequestDelayMs` applied between entries "engine.ts:207-209" | STALE | `getGeminiInterRequestDelayMs()` is READ at `src/lib/grade/engine.ts:374`; the `await sleep(interRequestDelayMs)` is applied at `engine.ts:502-503`, inside the loop and guarded by `i < limitedEntries.length - 1` (`:502`). Lines 207-209 are `gradeSubmission`'s signature. |
| `gradeEntries` "engine.ts:333-341" is a generic per-entry wrapper | STALE (claim TRUE) | `gradeEntries` is at `src/lib/grade/engine.ts:631-640`; it is a thin wrapper over `gradeStudentEntries` (`:360-578`). |
| `canvasWorkToEntry` "extraction.ts:153" builds one entry directly | STALE (claim TRUE) | `canvasWorkToEntry` is declared at `src/lib/grade/extraction.ts:837` and called at `:371`. |

The brief's CORE CLAIM survives verification and is the reason N15a+N15b were
merged: the inter-request delay is paid ONLY between entries inside one
`gradeStudentEntries` call (`engine.ts:502-503`). N separate one-entry calls
pay it zero times. This is the correctness property the merge protects, and it
is confirmed below to apply to the existing incremental route too (section 2).

---

## 1. Leverage claim (AGENTS.md / DEV_LOOP "The loop / Criteria")

**Class: SCALE + ATTRIBUTION (`docs/loop/leverage.md`).** With "each upload is
one student" on, the instructor sets ONE rubric and ONE assignment description
(entered once, shared) and then feeds N submissions - typically phone photos of
handwritten or printed work - each graded against that held-constant pair
(SCALE: `src/lib/grade/engine.ts:377-396` pins one criteria set and loops it),
each bound to a DISTINCT student by construction and never merged with a prior
upload even when two files share a generic name (ATTRIBUTION), through ONE
rate-limited serial channel that actually pays the inter-request delay
(`engine.ts:502-503`) between model calls. A chat regrades each pasted
submission independently, holds no batch together as one unit, cannot keep two
identically-named submissions from being read as the same subject, and has no
notion of a rate-limited dispatch queue draining underneath the instructor.

**What the instructor does instead today:** either (a) assembles a zip of all
submissions first (the existing "Upload ZIP" path), which a phone-photo workflow
cannot easily produce on the device the photos live on, or (b) pastes each
submission into a chat and re-states the rubric or trusts the model to remember
it.

**The honest cost, stated not hidden (leverage card's "accept the cost
explicitly").** On CLICK-COST this feature LOSES. `docs/a39-census.md:63-64`
gives the crossover rule `s + p*N < 2 + N`: with per-submission interaction
cost `p >= 1` (each upload is at least one file-pick interaction) there is NO N
at which repeated single uploads beat the chat baseline of `2 + N`. The backlog
row's own 2026-09-23 note records this. So the click-cost advantage is NOT
claimed. The leverage claimed is SCALE + ATTRIBUTION + the serialized paced
dispatch, all of which are categorical (a chat cannot do them at all), not
steady-state assembly-cost savings.

**Removal-test note for the test seat.** SCALE and ATTRIBUTION are buildable
removal tests here (they are pure/typed, not render-dependent): the ATTRIBUTION
test is that two uploads with an identical generic filename produce two rows
whose `student` display strings are distinct (section 4). The pacing advantage
("the delay is paid") has a buildable removal test on the PURE pacing leaf
(section 3's `nextDispatchWaitMs`), NOT on wall-clock latency, which no test
here can observe. The "graded as it lands" / click advantages are LIVE-LOOP-like
and have NO buildable removal test here (no component renders); record that as a
residual with an owner and a step (section 10, RES-N15M-1).

**Diagnostics representation (DEV_LOOP owner rule, 2026-10-11).** N15a adds a new
data path (per-upload serialized grading) and MUST report through the existing
session diagnostic surface (`src/app/components/grading/gradingDiagnosticLog.ts`).
The representation is recorded IN WAVE 1 (not deferred to Wave 2; see section 7,
and blocker-3 fix below), and it is shaped by two hard facts measured in this
module:

- `gradingDiagnosticLog.ts` is BROWSER-ONLY and carries NO STUDENT DATA (its
  header, `:1-14`): the label is a fixed operation label, never a student name
  or submission text. So the disambiguated DISPLAY LABEL (a filename-derived
  student name, section 4) MUST NOT be recorded - recording it would violate
  this module's own rule.
- The entry shape is the app-wide `SessionDiagnosticEntry`
  (`src/lib/session-diagnostic-log.ts:131`), whose columns are fixed
  (`at / surface / operation / label / institution / course / outcome / error /
  durationMs? / classificationStudentCount?`, read at `:232-247`). There is no
  column for an upload ordinal or a paced-wait value; adding one edits the
  app-wide core and its ~9 owners (`grep -rln gradingDiagnosticLog src
  --include=*.test.ts` = 9 files), which is OUT of N15a's write set.

Given those two, the Wave-1 representation is: the client hook
`useOneUploadRun.ts` records ONE entry per upload through the EXISTING
`recordGradingDiagnosticEntry` (`gradingDiagnosticLog.ts:77`, called OUTSIDE a
setState updater per its contract at `:75-76`) using the EXISTING operation
`grade_item` (`gradingDiagnosticLog.ts:24`, label "Grade submission" `:45`),
carrying the per-item OUTCOME (`success` / `failure`) and the grade call's
`durationMs`. The per-item sequence is observable as entry ORDER and the pacing
is observable as the GAPS between consecutive entries' `at` timestamps - so the
new data path is NOT invisible, with no core-schema edit and no student data.
The structured ordinal / paced-wait-applied FIELDS are the schema enrichment
above and are deferred as RES-N15M-6 (owner / instrument / step, section 10).
The existing whole-run diagnostic (`markWholeRunStart` inside `submitWholeRun`,
`GradingTab.tsx:175-176`) does NOT fire on the enqueue path and must not - there
is no whole run on this path; each upload's `grade_item` entry is its
representation. The downscale (section 6) reports the before/after byte sizes
and whether it fell back. A build wave that ships the per-upload data path in
Wave 1 with no `grade_item` diagnostic entry has an unmet criterion, the same as
a missing test. INSTRUMENT: `useOneUploadRun.lifecycle.test.ts` spies
`recordGradingDiagnosticEntry` and asserts exactly one call per settled upload
with `operation: "grade_item"` and the correct `outcome`; FAILS (red) if an
upload settles with no diagnostic call or the wrong outcome.

---

## 2. The precedent that already exists, and why N15a is not a rebuild

This is the load-bearing reuse finding. The A39 "incremental-fill" feature
already ships a client-driven pool that grades entries ONE AT A TIME and fills
the results table as each lands - almost exactly N15a's "graded as it lands".
Opened directly this pass:

- `src/app/components/grading/useIncrementalGradingRun.ts` (314 lines,
  `wc -l`): the client pool. `runPool` (`:144-217`) spawns
  `workerCount = Math.min(INCREMENTAL_CONCURRENCY, requests.length)` workers
  (`:208`) over a shared `cursor`, each `await postGradeRunItem(request)`
  (`:193`), appending to `arrivedRef` and rebuilding the merged run.
- `src/app/components/grading/incrementalRunPlan.ts` (355 lines): the PURE
  leaf - `mergeArrivedResults` (`:225`, keys strictly by `sourceIndex`),
  `buildIncrementalRun` (`:315`), `classifyItemFailure` (`:251`),
  `GradeRunItemRequestBody` (`:59`), `INCREMENTAL_CONCURRENCY = 3` (`:32`),
  `ITEM_REQUEST_BYTE_BUDGET` (`:43`), and the phase machine.
- `src/app/api/grade-run-item/route.ts` (333 lines): one student's grade as a
  Route Handler, `requireAppOwner()`-gated (`:229`), body-validated
  (`parseRequestBody`, `:125`), budget-checked (`:171`), one `gradeEntries([entry], ...)`
  call (`:303`).
- `src/app/actions/grading-incremental.ts` (`prepareGradingRunAction`, `:80`):
  builds the ticket plan server-side; single-file branch at `:127-129` uses
  `buildSingleFileEntry`.

**Three facts about that precedent decide N15a's shape:**

1. **It is concurrency-3 and UNPACED.** `INCREMENTAL_CONCURRENCY = 3`
   (`incrementalRunPlan.ts:32`); `runPool` has no `sleep` between dispatches.
   So it has the SAME rate-limit exposure the merge rationale names - three
   one-entry calls in flight, no inter-request delay - and more so under a
   growing queue. N15a must NOT copy the concurrency-3 unpaced shape; it must
   serialize and pace (section 3).
2. **It takes a FIXED ticket set up front.** `runPool(requests, ...)` closes
   over an array whose length is read at `:208`; there is no path to append a
   ticket mid-run. N15a's uploads arrive over time, so N15a needs a GROWING
   queue the existing pool cannot provide. This is the one genuinely new
   control-flow piece.
3. **It is gated OFF.** `INCREMENTAL_ROUTE_ENABLED = false`
   (`incrementalRunPlan.ts:157`), because RULING 116 (quoted in that file at
   `:141-156`) found the incremental route a THINNER surface than the whole-run
   path - no RubricProvenance mount, no blank-rubric synthesis, no
   blank-instructions refusal. N15a inherits that thinness if it reuses the
   per-item route, and must compensate (section 3, constraint C3).

So N15a REUSES the merge leaves and the per-item route, and ADDS exactly two
things the precedent lacks: a growing queue, and serial pacing. It does NOT
reuse `gradeEntries` directly per upload (a one-entry `gradeEntries` call pays
zero internal delays - that IS the hazard; `engine.ts:502` guards the sleep
with `i < limitedEntries.length - 1`, and with one entry that is never true).

### Reuse list (symbol, file:line, what it gives us) - half opened directly

| Symbol | file:line | Gives us |
|---|---|---|
| `mergeArrivedResults` | `incrementalRunPlan.ts:225` | sourceIndex-keyed row projection; a row never moves, only appears |
| `buildIncrementalRun` | `incrementalRunPlan.ts:315` | assembles the one `GradingRun` the merged mount renders |
| `classifyItemFailure` | `incrementalRunPlan.ts:251` | one item's transport failure becomes an ordinary ungraded row, isolated |
| `GradeRunItemRequestBody` | `incrementalRunPlan.ts:59` | the POST body shape the route already validates |
| `ITEM_REQUEST_BYTE_BUDGET` / `estimateNeededWireBytes` | `incrementalRunPlan.ts:43,119` | per-item wire sizing, one owner |
| `POST /api/grade-run-item` | `route.ts:221` | one-student grade, owner-gated, budget-checked - the dispatch sink |
| `classifyGradingUpload` | `single-file-entry.ts:109` | extension-only kind: `single`/`zip`/`video`/`unsupported` |
| `buildSingleFileEntry` | `single-file-entry.ts:148` | turns ONE non-zip file into one `StudentSubmissionEntry`; accepts a `labelled` flag (`:153`); image branch makes NO model call (`:159-178`) |
| `assignUnclaimedLabel` | `src/lib/grade/utils.ts:420` | first UNCLAIMED label against a taken-set - the disambiguation primitive (section 4) |
| `getGeminiInterRequestDelayMs` | `src/lib/gemini.ts:143` | the authoritative delay value (server-only env) |
| `preflightUploadFile` | `src/lib/grade/zip-upload-preflight.ts` | existing per-file wire-budget refusal, already wired at `GradingTab.tsx:248` |
| `checkFileWireBudget` / `maxFileBytesForWireBudget` | `src/lib/upload-budget.ts:101,65` | the wire budget = 2752512 file bytes (section 6) |

### Do-not-reuse list (with justification)

- **`runPool` in `useIncrementalGradingRun.ts`** - its fixed-array worker pool
  cannot accept a ticket mid-run and is concurrency-3 unpaced. N15a needs a new,
  smaller serial driver. Reuse the pure leaves it calls, not the pool itself.
- **`prepareGradingRunAction`** - it builds a whole-batch plan from one FormData
  and front-loads two per-RUN model calls (inference + rubric synth). N15a's run
  grows one upload at a time with a shared rubric already resolved, so it builds
  one entry per upload via `buildSingleFileEntry` directly, not the batch plan.
- **`INCREMENTAL_ROUTE_ENABLED` / `routeGradingRun`** - that is the zip/Canvas
  incremental route's own kill switch, gated for a different (RULING 116) reason.
  N15a is a distinct mode and must not be entangled with that flag.
- **`parseSubmissionFileName` / `leafStemFallback` (`utils.ts:287,121`)** - these
  recover identity for MANY files in one zip; `leafStemFallback` names a student
  after the leading alphanumeric run of the stem, the exact collision hazard
  N15a must avoid (section 4). `single-file-entry.ts:123-139` already documents
  why the single-file path deliberately does NOT use them.

---

## 3. FORK 1 - the serialization design (the correctness core)

**RECOMMENDED READING (owner: go-with-recommended).** A new client-side FIFO
accumulator with a SINGLE serialized worker (concurrency 1) that reuses the A39
merge leaves and the existing `/api/grade-run-item` route, and that ADDS a
client-enforced inter-request gap equal to the server's
`getGeminiInterRequestDelayMs()` value, threaded to the client once per session.

**The seam, named.** A new PURE leaf
`src/app/components/grading/oneUploadQueue.ts` owns every decision and nothing
with a side effect. The identity leaf is a SEQUENCE REDUCER that OWNS the
taken-set accumulation internally (blocker-2 fix: it is NOT a per-call pure
function of `(fileName, takenLabels)` - such a function cannot emit the
enqueue-ordering state the distinctness guarantee needs, and
`assignUnclaimedLabel` does not mutate its taken-set
(`utils.ts:420-428`, verified), so distinctness can only be guaranteed by a
reducer that assigns-then-adds). The reducer mirrors `disambiguateCanvasEntries`
(`extraction.ts:410-413`, RULING 129), which does exactly
`label = assignUnclaimedLabel(entry.student, taken); taken.add(label)`:

- Types: `UploadIdentity = { ordinal: number; display: string }`;
  `IdentityFoldState = { ordinal: number; taken: ReadonlySet<string> }`;
  `EMPTY_IDENTITY_STATE = { ordinal: 0, taken: new Set() }`.
- `assignNextUploadIdentity(prev: IdentityFoldState, base: string)` ->
  `{ identity: UploadIdentity; next: IdentityFoldState }`: a single immutable
  fold step. `ordinal = prev.ordinal + 1` (the ordinal is an EXPLICIT fold index
  derived from the input state, never read from hidden enqueue state);
  `display = assignUnclaimedLabel(base, prev.taken)`; `next.taken` is
  `new Set(prev.taken)` with `display` added; `next.ordinal = ordinal`. The
  INPUT `base` is the SERVER-assigned display string (`entry.student` from the
  built entry), NOT a client re-derivation from the raw file name:
  `studentLabelFromFileName` is module-private (`single-file-entry.ts:133`, not
  exported) and its unusable-name branch may make a model call
  (`:156-157`), so re-deriving it on the client is neither reachable nor pure.
  Disambiguating `entry.student` is precisely what the Canvas precedent does.
- `assignUploadIdentities(bases: readonly string[])` ->
  `readonly UploadIdentity[]`: the BATCH form, a left fold of
  `assignNextUploadIdentity` from `EMPTY_IDENTITY_STATE`. Over any sequence -
  INCLUDING identical bases - the returned `display` strings are pairwise
  distinct AND the `ordinal` numbers are pairwise distinct, BY CONSTRUCTION.
  This batch call is the pure, fully-testable ATTRIBUTION removal test
  (section 4's pass condition).
- `nextDispatchWaitMs(now, lastDispatchAtMs, interRequestDelayMs)` -> number:
  `Math.max(0, interRequestDelayMs - (now - lastDispatchAtMs))`. THIS is the
  function that makes the queue pay the delay N uncoordinated calls skip, and
  it is the buildable removal test (set `interRequestDelayMs` to 0 and the wait
  collapses). Pure, fully unit-testable under vitest.
- re-exports `mergeArrivedResults` usage via a thin `projectRun(...)` that calls
  `buildIncrementalRun` - no second merge dialect.

A new THIN hook `src/app/components/grading/useOneUploadRun.ts` holds the refs
(`queueRef`, `arrivedRef`, `lastDispatchAtRef`, `workerRunningRef`, and a single
`identityStateRef: IdentityFoldState` seeded to `EMPTY_IDENTITY_STATE`), exposes
`enqueue(entry)` and `run`/`phase`/`error`, and runs a single worker that: while
the queue has an undispatched ticket, computes `nextDispatchWaitMs`,
`await sleep(wait)`, POSTs `/api/grade-run-item`, appends to `arrivedRef`
(success via the response, failure via `classifyItemFailure`), rebuilds the
merged run, sets `lastDispatchAtRef = Date.now()` at dispatch time, and records
one `grade_item` diagnostic entry (section 1). When the queue drains, the worker
IDLES (does not terminate the run); a later `enqueue` restarts it. This mirrors
the no-render, `useRef`/`useState`-only shape of `useIncrementalGradingRun.ts`
(its header at `:10-18` explains why no `useEffect`), so the same
`vi.mock("react", ...)` lifecycle harness drives it.

**The hook-level identity invariant (blocker-2 fix, the part the pure reducer
cannot guarantee alone).** The pure reducer guarantees pairwise-distinct
displays only if the caller threads the fold state serially. Identity is
assigned at enqueue, AFTER the async server build resolves, so two builds
started close together could resolve near-simultaneously. The invariant the hook
MUST hold: the read of `identityStateRef.current`, the `assignNextUploadIdentity`
call, and the write-back `identityStateRef.current = next` happen in ONE
SYNCHRONOUS block with NO `await` between the read and the write. JS is
single-threaded, so each resolved build's continuation runs this block
atomically with respect to every other; two concurrent builds therefore cannot
both read the same taken-set and emit the same display. This serialization is
also why the worker is concurrency 1. The lifecycle test exercises the JS
ordering deterministically (resolve two builds in a controlled order through the
harness and assert distinct displays); the REAL-BROWSER concurrent-upload timing
the node harness cannot reproduce is a reading-claim residual (RES-N15M-7:
owner / instrument / step, section 10). This is stated, not claimed as
unit-tested.

**Where the delay value comes from.** `getGeminiInterRequestDelayMs()` reads
`process.env.GRADE_INTER_REQUEST_DELAY_MS` (`gemini.ts:143-149`) - server-only,
NOT `NEXT_PUBLIC`, so the client cannot read it. A new `"use server"` action
`src/app/actions/grading-one-upload.ts` with `requireAppOwner()` does two jobs
in one round trip per upload: it builds the entry (reusing `classifyGradingUpload`
+ `buildSingleFileEntry`, exactly as `grading-incremental.ts:123-129` does) AND,
on the first call of a session, returns `interRequestDelayMs` so the client
caches it. Returning it per call is harmless and avoids a second action.

**Two MANDATES on how this action and its test are WRITTEN (blocker-1 fix -
these are silent-escape hazards the pre-push gate, which runs no vitest, cannot
catch; they red only under the named canaries, which section 7 now gates on):**

- The action's exported function MUST be spelled
  `export async function gradingOneUploadAction(...)`. The owner-gate ratchet
  `action-guard-coverage.test.ts` collects actions with
  `/^export async function (\w+)/` (`:127`, measured) and then asserts each is
  `requireAppOwner()`-guarded. An ARROW export
  (`export const gradingOneUploadAction = async () => ...`) is NOT collected, so
  it would SILENTLY ESCAPE the owner-gate coverage - a green run, not a red.
  An arrow export is therefore forbidden here.
- `grading-one-upload.test.ts` MUST use the MOCK-THE-CLIENT idiom - mock
  `@/lib/supabase/server` and `@/lib/supabase/app-users`, exactly as
  `grading.guard.test.ts` does (`:59,:64`, measured). It MUST NOT do a wholesale
  `vi.mock("@/lib/supabase/auth", ...)`: that string is counted by the
  SHRINK-ONLY frozen canary `wholesale-auth-mock-population.structure.test.ts`,
  which REDS ON GROWTH (a new file adding that mock is growth beyond the frozen
  set). Mocking the client instead keeps the guard module executing against a
  mocked client, which is what actually exercises the gate.

**Why entry-building is server-side and per-upload.** Extraction
(`extractTextFromBuffer`, docx/pdf) and image base64 live server-side;
`buildSingleFileEntry` is the existing one-file builder. The flow per upload:
(1) client POSTs the raw file to `grading-one-upload.ts`, which returns a built
`StudentSubmissionEntry` (+ the delay value); (2) client assigns identity
(section 4) and enqueues; (3) the serial worker paces, then POSTs the entry to
`/api/grade-run-item` to grade it. Two server round trips per upload, both
owner-gated. The GRADE call is the one the serial worker paces; the build call
for the PRIMARY input (a phone-photo image) makes NO model call
(`single-file-entry.ts:159-178`), so it carries no rate-limit weight. For a text
doc with an unusable name, `buildSingleFileEntry` may infer the name with one
model call (`:198-206`); that call is also inside the serial turn (the client
awaits the build before enqueue), so it never races N inferences at once.

**Why NOT reuse `gradeEntries` per upload.** A direct `gradeEntries([one], ...)`
per upload is what the merge rationale forbids: it pays zero inter-request delays
(`engine.ts:502` guard). The pacing MUST be client-side, across HTTP calls,
because each upload is a separate request.

**Pass condition for the serialization property** (object / instruments /
direction): over a session that enqueues K>=2 uploads with no human gap between
them, the sequence of dispatch timestamps the worker records (instrument: the
pure `nextDispatchWaitMs` applied to a fake clock in the lifecycle test) must
have every consecutive gap `>= interRequestDelayMs`; FAILS (red) if any
consecutive gap is `< interRequestDelayMs` while `interRequestDelayMs > 0`.

**Constraints the build wave inherits from RULING 116 (C3).** The per-item route
is the thin surface. N15a enters uploads only when a shared rubric and
assignment description already exist in the two GradingTab fields, so:
- C3a: before the FIRST upload is accepted in this mode, refuse with the SAME
  byte-identical message `prepareGradingRunAction` uses when instructions are
  blank ("Please provide assignment instructions.", `grading-incremental.ts:93`)
  - do not invent a second copy.
- C3b: rubric is passed through unchanged (no per-run synthesis on this path);
  state in the UI copy that a blank rubric grades against instructions only, the
  same asymmetry `grading-incremental.ts:164-167` preserves. RubricProvenance is
  not mounted on this path; recorded as RES-N15M-2, not silently dropped.

---

## 4. FORK 2 - the per-upload student identity

**RECOMMENDED READING.** Identity is assigned in TWO layers, both by
construction so misattribution is structurally impossible across uploads:

1. **Stable key = the reducer's explicit ordinal** (`prev.ordinal + 1` inside
   `assignNextUploadIdentity`, an explicit fold index, section 3 - NOT a hidden
   enqueue counter). This is the `sourceIndex` the merge keys on
   (`mergeArrivedResults` keys strictly by `sourceIndex`,
   `incrementalRunPlan.ts:229-234`), so two uploads NEVER collapse into one row
   regardless of filename - this is the core correctness guarantee the backlog
   row demands ("each upload recognized as a DIFFERENT student"). The reducer
   makes the ordinals strictly increasing, hence pairwise distinct, by
   construction.
2. **Display label = server base, then disambiguated by the reducer.** The base
   display is the SERVER-assigned `entry.student` on the built entry (produced by
   `buildSingleFileEntry` via the module-private `studentLabelFromFileName`,
   `single-file-entry.ts:133` - the WHOLE stem, with content inference for
   unusable names, NOT `leafStemFallback`). The client reducer
   `assignNextUploadIdentity` passes that base through
   `assignUnclaimedLabel(base, prev.taken)` (`utils.ts:420-428`) against the
   fold state's accumulated taken-set and then ADDS the result to the next
   taken-set - the assign-then-add that makes distinctness hold. So two files
   both named `scan.jpg` (both arriving with `entry.student` = `scan`) render as
   `scan` and `scan (2)`.

**Why the display MUST be pairwise-distinct, with the instrument.** The results
component keys EVERY piece of per-row state on `r.student` (the display string),
not on an id: `edits[r.student]`, `postStatus[r.student]`, `refusals[r.student]`,
`codeRuns[row.student]`, `codeRunning[row.student]`, `armedPostOne.student`,
`expandedBox.student` - measured across
`src/app/components/GradingResults.tsx:383-925`
(`grep -cE "\.student\]" src/app/components/GradingResults.tsx` = 27 keyed
sites, 2026-10-11; first at `:383`, last at `:925`). Two rows with an identical
`student` string therefore SHARE an
edit cell, a post status, a code-run result, and an arm state - a silent
cross-wiring into a live gradebook write, exactly the hazard the backlog row's
2026-09-23 note names. `GradingResults.tsx` is a SHARED component outside N15a's
write set, so N15a cannot fix the keying there; it must instead GUARANTEE the
`student` strings it feeds in are pairwise distinct. `assignUnclaimedLabel` is
the exact primitive `groupSubmissionsByStudent` (`utils.ts:494-503`) and the
Canvas path (`disambiguateCanvasEntries`, RULING 129) already use for this, so
N15a reuses it rather than writing a second dialect.

**Rejected sub-readings.** (a) Filename inference alone (`parseSubmissionFileName`)
- rejected: generic names collapse via `leafStemFallback` (`utils.ts:121-126`)
into one key; it is the hazard, not the fix. (b) A MANDATORY per-upload typed
name field - rejected for Wave 1: it adds an interaction per student, worsening
the already-losing click-cost (section 1), and the ordinal already guarantees
distinctness without it. It returns as an OPTIONAL override in Wave 2 via the
`labelled` flag `buildSingleFileEntry` already accepts (`:153`).

**Pass condition** (object / instrument / direction). Object: the
`readonly UploadIdentity[]` returned by the PURE batch reducer
`assignUploadIdentities(["scan", "scan"])` - two identical bases, the worst case.
Instruments: the array's `display` strings and its `ordinal` numbers. Direction
of failure (red): any two `display` strings are equal, OR any two `ordinal`
numbers are equal. This is a fully pure, fully-testable property and IS the
ATTRIBUTION removal test: a mutant that drops the reducer's `taken.add(display)`,
or returns `base` without `assignUnclaimedLabel`, makes the two displays equal
and reds; a mutant that reuses `prev.ordinal` without incrementing makes the two
ordinals equal and reds. The hook-level serialization that makes this guarantee
hold across real uploads (section 3) is tested in the lifecycle harness to the
extent node allows and otherwise carried as RES-N15M-7.

---

## 5. FORK 3 - the checkbox and its persistence

**RECOMMENDED READING.** A single MUI `Checkbox`/`FormControlLabel`
("Each upload is one student") rendered in `GradingTab.tsx` only when
`source === "zip"` (the assignment-upload tool; the non-zip modes have no file
input). State lives in `GradingTab.tsx` beside `source`, seeded from and written
to `localStorage` key **`ta-grading-one-upload`** (boolean "1"/absent), seeded
in the `useState` initializer the same way `source` is
(`GradingTab.tsx:95-99`) and written in the setter the same way `selectSource`
writes (`:118-121`). Per the persisted-details-open memory, a `useState`
initializer that reads localStorage is correct for a control that is NOT inside
a collapsed/hydration-sensitive `<details>`; this checkbox renders
unconditionally within the zip branch, so no mount effect is needed - but the
build wave states that as a reading claim (no render test here).

**THE LOAD-BEARING GATE CONSTRAINT (gate-must-include-directory-canary).**
`src/app/components/componentStorageKeys.structure.test.ts` (263 lines) is a
NON-RECURSIVE frozen exact-set canary over `src/app/components/` that already
lists `ta-grading-rubric-memory` and `ta-grading-source` in `EXPECTED_TA_KEYS`
(`:161-162`; header at `:1-27` explains the scope). `GradingTab.tsx` sits
directly in `src/app/components/`, so a new `ta-grading-one-upload` literal in
that file WILL be seen by this canary and FAIL it until `EXPECTED_TA_KEYS` is
updated. Therefore the wave that adds the key MUST, in the SAME commit:
(1) add `ta-grading-one-upload` to `EXPECTED_TA_KEYS` (sorted; `.sort()` is the
oracle per `:129-132`); (2) run `componentStorageKeys.structure.test.ts` in the
wave gate AND the verify list. The pre-push gate runs NO vitest
(`this-repo.md` section 1), so omitting this canary from the wave gate lands
main red and silent. DECISION 9 (quoted in `GradingTab.tsx:47-48`) said an
exact-set canary is written "when a sixth key lands"; the canary already exists
repo-wide, so the obligation is simply to keep its frozen list current.

This key must also NOT be added to any `src/app/components/grading/`
subdirectory canary, because no `ta-` key of N15a lives in that subdirectory
under this design (the checkbox literal is in `GradingTab.tsx`). If the build
wave moves the literal into a `grading/` leaf, it owes that subdirectory's own
canary instead - but the recommended placement keeps it in `GradingTab.tsx`
beside the sibling `ta-grading-*` keys.

---

## 6. FORK 4 - the photo downscale (N15-PHOTO-DOWNSCALE)

**Target surface and the refusal it removes.** The N15 picture field is the
rubric/assignment-description TRANSCRIPTION intake, not a student-submission
intake: `src/app/components/grading/GradingPictureField.tsx:22` takes
`kind: "rubric" | "assignment description"`, and `describePictureRejection`
(`gradingPictureIngest.ts:28-40`) refuses a file whose
`checkFileWireBudget(file.size, ...)` fails - the budget is
`maxFileBytesForWireBudget()` = 2752512 file bytes (`upload-budget.ts:65-67`,
`UPLOAD_WIRE_BUDGET_BYTES = 3.5*1024*1024` at `:41`, `BASE64_INFLATION = 4/3` at
`:44`; `Math.floor(3.5*1024*1024 / (4/3)) = 2752512`). A 3-5MB phone photo
exceeds it and is refused today.

**RECOMMENDED READING.** A reusable client-side downscale, split into a PURE
testable leaf and a browser-only leaf:

- PURE: `src/app/components/grading/imageDownscalePlan.ts` -
  `shouldAttemptDownscale(fileType, fileBytes, budgetBytes)` (true only when
  `fileType.startsWith("image/")` AND `fileBytes > budgetBytes`), a bounded
  quality/dimension step schedule (e.g. longest-edge caps `[2200, 1600, 1200]`
  x JPEG qualities `[0.82, 0.7, 0.6]`, stopping at the first encode under
  budget), and `targetBudgetBytes(maxFileBytesForWireBudget())` with a safety
  margin of ~0.9 (because the encoded size is only knowable after encoding).
  Fully unit-testable under vitest.
- BROWSER: `src/app/components/grading/downscaleImageToBudget.ts` -
  `downscaleImageToBudget(file): Promise<File | null>`: decodes via
  `createImageBitmap` (or an `<img>` + `canvas` fallback), draws to a canvas at
  the planned dimensions, re-encodes with `canvas.toBlob("image/jpeg", q)`,
  iterating the plan's schedule until under budget; returns the new `File`
  (renamed `.jpg`) or `null` if canvas is unavailable or decode fails. BROWSER
  ONLY - NOT testable under node vitest (no canvas; section 9).

**WHERE it runs, and HOW it is wired in (M2 - injected, not statically called).**
The downscale enters `ingestGradingPicture` (`gradingPictureIngest.ts:46`) as an
INJECTED parameter with a default, exactly as `transcribe` (required) and
`readBase64` (defaulted, `:50`) already are - the file's own header
(`:1-4`) states injection is what keeps it executable under vitest. Add a
parameter `downscale: (file: File) => Promise<File | null> = downscaleImageToBudget`.
The browser leaf is the default; a test injects a stub (one returning `null` to
exercise the fall-through-to-refusal path; one returning a smaller `File` to
exercise the accept path). It runs BEFORE `describePictureRejection`'s budget
check and BEFORE the base64 read: if
`shouldAttemptDownscale(file.type, file.size, maxFileBytesForWireBudget())`,
`await downscale(file)`; if it returns a smaller `File`, continue with it (so the
subsequent `describePictureRejection` now passes budget); if it returns `null`
(canvas unavailable / decode failed) or the result is still over budget, fall
through to the EXISTING `describePictureRejection` refusal path UNCHANGED
(`describePictureRejection` itself is not edited, so its existing tests stay
green). Never silently send an over-budget file. INSTRUMENT for the fall-through:
`gradingPictureIngest.test.ts` injects a `downscale` stub returning `null` and
asserts the result is a `{ rejected }` with the existing budget message.

**FORMAT / QUALITY.** Output `image/jpeg` at the schedule's qualities (photos
are the target; a JPEG re-encode of a photo is far smaller than its PNG). A
screenshot that is already an image and already under budget never enters the
branch (`shouldAttemptDownscale` is false), so screenshots are unaffected -
preserving today's behaviour for the inputs that work.

**MUST NOT corrupt a non-image.** The branch is gated on
`file.type.startsWith("image/")` (the same predicate
`describePictureRejection:32` already uses to reject non-images), so a PDF or
any non-image never enters downscale and its existing "must be an image" refusal
(`gradingPictureIngest.ts:33`) is untouched. A corrupt image that fails to
decode returns `null` and falls through to refusal; it is never re-encoded into
garbage.

**Disjointness.** This fork touches `gradingPictureIngest.ts`,
`gradingPictureIngest.test.ts`, the two new downscale leaves, and (optionally,
for the busy-state copy) `GradingPictureField.tsx`. It does NOT touch
`GradingTab.tsx` or any N15a file, so it is a fully independent wave that may run
in PARALLEL with the N15a waves (section 7). It reuses `upload-budget.ts`
read-only.

**Reuse into the N15a image path (follow-up, not this scope's primary target).**
The same budget refusal fires on the N15a student-photo path
(`preflightUploadFile` at `GradingTab.tsx:248`; `buildSingleFileEntry`'s image
branch at `single-file-entry.ts:159`). Wiring `downscaleImageToBudget` into the
N15a upload handler is a natural reuse but is OUT of the N15-PHOTO-DOWNSCALE
row's named target (the transcription field) and would couple two otherwise
disjoint waves; recorded as RES-N15M-3.

---

## 7. Wave plan (dependency-ordered, disjoint write sets)

Smallest-shippable-first. The merge rationale forbids a wave that ships
per-upload dispatch WITHOUT the serializing queue, so Wave 1 ships the
correctness-complete minimal feature (serialization + identity + the one control
that reaches them), and Wave 2 is UI enrichment only. Shipping the hook with no
caller would be dead code (the repo's hardest-learned reachability rule), so
Wave 1 carries the single control that makes the hook reachable; Wave 2 does not
reopen Wave 1's correctness decisions.

Each wave's file list includes the file that CALLS each new export (architect
non-negotiable). None of the new modules is type-only.

### Wave 1 - N15a serialized core + its one control (correctness-complete)

WRITE SET:
- NEW `src/app/components/grading/oneUploadQueue.ts` (pure:
  `assignNextUploadIdentity`, `assignUploadIdentities`, `EMPTY_IDENTITY_STATE`,
  the `UploadIdentity`/`IdentityFoldState` types, `nextDispatchWaitMs`,
  `projectRun`; reuses `mergeArrivedResults`/`buildIncrementalRun`/
  `assignUnclaimedLabel`). Est. ~190 lines.
- NEW `src/app/components/grading/useOneUploadRun.ts` (thin hook; caller of
  `oneUploadQueue.ts`, of a `postGradeRunItem`-shaped fetch to
  `/api/grade-run-item`, and of `recordGradingDiagnosticEntry` for the one
  `grade_item` entry per upload, section 1). Est. ~200 lines.
- NEW `src/app/actions/grading-one-upload.ts` (`"use server"`; caller of
  `classifyGradingUpload`/`buildSingleFileEntry`; returns entry +
  `interRequestDelayMs`). Its exported action MUST be
  `export async function gradingOneUploadAction(...)` with `requireAppOwner()`
  inside - NOT an arrow export (section 3 mandate: an arrow export silently
  escapes the owner-gate ratchet, a green run not a red). Est. ~110 lines.
- EDIT `src/app/components/GradingTab.tsx` (619 lines, `wc -l`): construct
  `useOneUploadRun`, add the `ta-grading-one-upload` checkbox (zip branch), and
  branch the zip `onChange`/submit so that when the mode is on each upload
  enqueues instead of submitting the whole-run form; render the accumulating run
  through the existing `GradingResults` mount. TWO wiring constraints, both
  enforced by `gradingDiagnosticWiring.wiring.test.ts` (now in the gate):
  (1) leave `submitWholeRun`'s body intact - `markWholeRunStart()` must still
  precede `formAction(fd)` inside it (`:175-176`); add the enqueue path as a
  SEPARATE branch, do not reorder or interpose tokens inside `submitWholeRun`;
  (2) do NOT introduce the raw string `session-diagnostic-log` into
  `GradingTab.tsx` - the diagnostic recording lives in `useOneUploadRun.ts`
  (which imports `gradingDiagnosticLog.ts`, not the core), so GradingTab never
  gains that specifier. Est. +70-110 lines; re-measure against 1000 with
  `@(Get-Content).Count` (headroom ~380 by `wc -l`).
- EDIT `src/app/components/componentStorageKeys.structure.test.ts`: add
  `ta-grading-one-upload` to `EXPECTED_TA_KEYS` (sorted). MANDATORY same commit.
- NEW tests (from the test seat's notes): `oneUploadQueue.test.ts` (the pure
  reducer + `nextDispatchWaitMs`, carrying the ATTRIBUTION removal test of
  section 4), `useOneUploadRun.lifecycle.test.ts` (the `vi.mock("react")`
  harness; asserts the serial identity threading of section 3 AND the one
  `grade_item` diagnostic per upload of section 1),
  `grading-one-upload.test.ts` (guard + entry-build; MUST mock
  `@/lib/supabase/server` + `@/lib/supabase/app-users`, NEVER
  `vi.mock("@/lib/supabase/auth")` - section 3 mandate), and a
  `*.wiring.test.ts` asserting GradingTab routes a zip upload through the hook
  when the mode is on.

WAVE GATE: `npx tsc --noEmit`; `npm run lint` (no NEW warning in the written
files vs the same command before the change); `git status --short` equals this
write set and no `.claude/worktrees` copy was edited; and the multi-path vitest
run below (so `npm run test:paths`, never a raw multi-path vitest, which
silently drops unmatched args - `this-repo.md` section 1). The pre-push gate
runs NO vitest (`this-repo.md` section 1), so every canary below that this
wave's edits can move MUST be in this list or it reds main silently after the
push. This is the same list used at VERIFY.

```
npm run test:paths \
  src/app/components/componentStorageKeys.structure.test.ts \
  src/file-size-ceiling.structure.test.ts \
  src/app/components/grading/gradingDiagnosticWiring.wiring.test.ts \
  src/app/actions/wholesale-auth-mock-population.structure.test.ts \
  src/app/actions/action-guard-coverage.test.ts \
  src/app/actions/action-guard-coverage-github-cohort.test.ts \
  src/app/components/grading/oneUploadQueue.test.ts \
  src/app/components/grading/useOneUploadRun.lifecycle.test.ts \
  src/app/actions/grading-one-upload.test.ts \
  <the new wiring test>
```

Why each non-obvious canary is here (blocker-1 fix; each measured in section 12):
- `componentStorageKeys.structure.test.ts` - reds on the new `ta-` literal until
  `EXPECTED_TA_KEYS` is bumped (section 5).
- `gradingDiagnosticWiring.wiring.test.ts` - reads `GradingTab.tsx` as source,
  pins `markWholeRunStart()` before `formAction(fd)` inside `submitWholeRun` AND
  asserts the file does not contain `session-diagnostic-log`; this wave branches
  the zip submit/onChange, which can move those tokens.
- `wholesale-auth-mock-population.structure.test.ts` - SHRINK-ONLY frozen set
  over `src/app/actions`; it REDS ON GROWTH, so a `grading-one-upload.test.ts`
  that does `vi.mock("@/lib/supabase/auth")` would red it (section 3 forbids
  that mock; the canary is the backstop).
- `action-guard-coverage.test.ts` AND `action-guard-coverage-github-cohort.test.ts`
  - walk `src/app/actions` for `export async function` in `"use server"`
  modules and require each to be `requireAppOwner()`-guarded; the NEW action is
  collected here, and an arrow export would silently escape (`:127`).

### Wave 2 - N15a per-upload UI enrichment (no new correctness)

The per-upload diagnostic is NOT here - it ships in Wave 1 (section 1,
blocker-3 fix). Wave 2 adds NO new correctness and NO new data path.

WRITE SET:
- EDIT `src/app/components/GradingTab.tsx` (or a small new
  `src/app/components/grading/OneUploadControls.tsx` if Wave 1 left GradingTab
  near the ceiling - re-measure first): optional per-upload editable label
  (drives `buildSingleFileEntry`'s `labelled` path) and richer empty/running/
  partial/error copy.
- NEW tests for the label-override identity path.

WAVE GATE: as Wave 1, re-deriving the canary list (including the four
blocker-1 canaries if this wave edits `GradingTab.tsx` or adds an action); if a
new `ta-` key is added (it should not be), bump `EXPECTED_TA_KEYS` again.

RES-N15M-6 (the structured ordinal / paced-wait diagnostic FIELDS) is NOT folded
into Wave 2 by default: it requires an app-wide `SessionDiagnosticEntry` schema
change (section 1), which is a separate backlog item with its own write set, not
N15a UI enrichment. If the owner later wants those fields, that is its own wave.

### Wave 3 - photo downscale (INDEPENDENT; may run parallel to Waves 1-2)

WRITE SET:
- NEW `src/app/components/grading/imageDownscalePlan.ts` (pure). Est. ~90 lines.
- NEW `src/app/components/grading/downscaleImageToBudget.ts` (browser; canvas).
  Est. ~120 lines.
- EDIT `src/app/components/grading/gradingPictureIngest.ts` (61 lines, `wc -l`):
  add the INJECTED `downscale` parameter (default `downscaleImageToBudget`, M2 /
  section 6) and call it before the budget check (caller of both new leaves).
  `describePictureRejection` is NOT edited.
- EDIT `src/app/components/grading/gradingPictureIngest.test.ts`: cover the
  pure plan and the fall-through-on-null path by injecting a `downscale` stub
  (the canvas path is NOT testable; mark the reading claim).
- NEW `src/app/components/grading/imageDownscalePlan.test.ts`.

WAVE GATE: `npx tsc --noEmit`; `npm run lint` (no NEW warning in the written
files vs the same command before the change); `git status --short` vs the write
set and no `.claude/worktrees` copy edited;
`npm run test:paths src/app/components/grading/imageDownscalePlan.test.ts
src/app/components/grading/gradingPictureIngest.test.ts
src/app/components/grading/gradingPictureWiring.wiring.test.ts
src/file-size-ceiling.structure.test.ts` (multi-path, so `test:paths`).
`gradingPictureWiring.wiring.test.ts` reads `gradingPictureIngest`/
`GradingPictureField` as source and is owned by this wave's edits.

**Disjointness proof (exact path).** Wave 3's write set is entirely under
`src/app/components/grading/*Picture*`/`*Downscale*` plus the two new downscale
leaves; Waves 1-2 write `GradingTab.tsx`, `componentStorageKeys.structure.test.ts`,
and the `oneUpload*`/`grading-one-upload` files. Intersection by exact path is
EMPTY. Run `printf '%s\n' <wave1-2 paths> | sort > a; printf '%s\n' <wave3 paths>
| sort > b; comm -12 a b` at build time and paste the empty output. Shared, not
in any file list: `npx tsc --noEmit` has one caller (races on
`tsconfig.tsbuildinfo`), so only one wave gates on the tree at a time;
`src/file-size-ceiling.structure.test.ts` and `componentStorageKeys` are read by
both - a concurrent run of Waves 1 and 3 must not both edit `EXPECTED_TA_KEYS`
(only Wave 1 does), and the ceiling canary is read-only for both.

---

## 8. Not trivially revertible

- **`EXPECTED_TA_KEYS` edit** in `componentStorageKeys.structure.test.ts` is
  coupled to the `ta-grading-one-upload` literal: reverting one without the other
  reds the canary. Revert both together or neither.
- **The `ta-grading-one-upload` persisted key** is a new persisted-shape surface
  (a boolean). It is additive and defaults off, so a revert leaves a harmless
  orphaned localStorage value in users' browsers - noted, not blocking.
- Everything else (new leaves, new action, new hook, GradingTab additive branch)
  is trivially revertible by deletion; the GradingTab edits are additive within
  the existing zip branch.

---

## 9. What CANNOT be verified in this environment (stated, not worked around)

- **No component renders** (`this-repo.md` section 6). So: the checkbox
  rendering and its reload-persistence, the accumulating results table, the
  busy/error copy, keyboard reachability of the checkbox and any label field,
  and the canvas downscale actually producing a smaller image - ALL are reading
  claims. The build wave says so for each.
- **No `canvas` under node vitest.** `downscaleImageToBudget.ts`'s decode/draw/
  encode cannot be exercised here at all. Only `imageDownscalePlan.ts` (the pure
  decision leaf) and the fall-through-on-`null` path in `ingestGradingPicture`
  are testable. The removal test for the downscale is on the PLAN leaf, not on a
  rendered canvas.
- **Network blocked.** `/api/grade-run-item` and `grading-one-upload.ts` are
  exercised only through mocks; no real Gemini call and no real rate-limit
  behaviour is observable. The pacing property is proven on the PURE
  `nextDispatchWaitMs` against a fake clock, never against wall-clock latency.
- **No real phone photo measured here.** The backlog's own gating question
  ("does a real phone photo exceed 2752512 bytes after your phone saves it?") is
  owner verification (RES-N15M-4). The downscale is designed to be correct
  whether or not it does; if real photos compress under budget, the downscale
  branch simply never triggers and the row could close WONT-DO per its text.

---

## 10. Residual register (owner / instrument / step - each a requirement, not a deletion)

All residuals must be filed in `docs/BACKLOG.md` to exist; this register is the
source for that filing.

| ID | Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| RES-N15M-1 | "Graded as it lands" / click advantages have NO buildable removal test here (no render; LIVE-LOOP-like, `leverage.md` honest-limit) | Owner | A real-browser walk of the accumulating table | Owner exercises the feature in the deployed app and confirms rows appear per upload |
| RES-N15M-2 | The per-item route is the RULING-116 thin surface: no RubricProvenance mount on the N15a path | Owner | Read of `GradingTab.tsx` RubricProvenance mount vs the N15a branch | Owner decides whether N15a owes a provenance mount; until then C3b's copy stands |
| RES-N15M-3 | Reuse `downscaleImageToBudget` on the N15a student-photo upload path (out of the PHOTO-DOWNSCALE row's named target) | Backlog | A new wiring test on the N15a upload handler | A later wave wires the leaf into `GradingTab.tsx`'s zip `onChange` |
| RES-N15M-4 | Does a real phone photo exceed 2752512 bytes after the phone saves it? | Owner | Take one photo, read its size in MB vs 2752512 bytes | Owner reports; if under budget, N15-PHOTO-DOWNSCALE closes WONT-DO |
| RES-N15M-5 | Click-cost of reading (a) loses the crossover (`a39-census.md:63-64`); accepted explicitly, not claimed as leverage | Owner | The census formula `s + p*N < 2 + N` | Recorded; no code owes it, but a future reader must not re-credit click-cost here |
| RES-N15M-6 | Structured diagnostic FIELDS (upload ordinal, paced-wait-applied) are NOT recorded in Wave 1; only `operation`/`outcome`/`durationMs` are, and ordering/timestamps carry ordinal and pacing implicitly (section 1). Adding dedicated columns edits the app-wide `SessionDiagnosticEntry` schema (`session-diagnostic-log.ts:131`) and its ~9 owners | Backlog | A test asserting the new columns appear in the recorded entry and in the CSV/JSON formatters | A later wave extends `SessionDiagnosticEntry` + `recordGradingDiagnosticEntry` and threads the two fields from `useOneUploadRun.ts` |
| RES-N15M-7 | The reducer guarantees pairwise-distinct displays only if the hook threads the fold state with a synchronous read-modify-write (no `await` between read and write of `identityStateRef`, section 3). The node harness tests the JS ordering deterministically but cannot reproduce real-browser concurrent-upload timing | Owner | A real-browser walk: pick two identically-named files in quick succession, confirm two distinct rows | Owner exercises the deployed feature and confirms no two uploads share a display string |

---

## 11. Disposition of the backlog row's prior recommendation (conflict recorded, not silently adopted)

The N15a backlog row's 2026-09-23 note (`docs/BACKLOG.md:109`) RECOMMENDED
reading (b) - one multi-select upload of N files, matching the zip path - OR
dropping the row, and disqualified reading (a) on click-cost. The merge ruling
N15-3 and this dispatch instead scope reading (a) (repeated single uploads) WITH
the serializing queue, and the owner's standing instruction is go-with-
recommended on the forks. I do NOT silently adopt either: the measured
click-cost loss for reading (a) STANDS and is unrefuted (section 1, RES-N15M-5);
what the merge changed is the JUSTIFICATION, moving the claimed advantage off
click-cost (where (a) loses) and onto SCALE + ATTRIBUTION + serialized paced
dispatch (which a chat cannot do at all, and which the multi-select reading (b)
would ALSO need the same identity and pacing machinery to deliver safely). So
this scope builds reading (a)'s correctness core in a way that is reusable by
reading (b) if the owner later prefers it: the pure `oneUploadQueue.ts` identity
and pacing leaves are agnostic to whether entries arrive one-at-a-time or in a
multi-select batch. If the owner picks (b), only the GradingTab enqueue trigger
changes (a multi-file `<input>`), not the core.

---

## 12. The `owns` set (files that read the edited files as source text or assert on their behaviour)

Derived with:
`grep -rln "GradingTab\|gradingPictureIngest\|GradingPictureField\|componentStorageKeys\|single-file-entry\|grade-run-item\|grading-incremental\|incrementalRunPlan" src --include=*.test.ts | sort`
(re-run 2026-10-11, returns 49 files - the earlier "54" in this doc was stale;
the verbatim block below is the current output). A build wave MUST re-derive
this with its own instrument and report what this list missed.

**This grep is a SYMBOL-MENTION instrument, and it structurally cannot see a
canary that names no seed symbol (blocker-1 fix).** Verified this pass by
running the command and inspecting the four blocker-1 canaries:
- `gradingDiagnosticWiring.wiring.test.ts`, `action-guard-coverage-github-cohort.test.ts`
  and `wholesale-auth-mock-population.structure.test.ts` ARE returned - but only
  incidentally: the first contains the literal `GradingTab`, and the latter two
  contain `grading-incremental` (measured with
  `grep -oE "<seeds>" <file>`). Their RED behaviour, though, comes from
  directory-walking / source-text assertions a seed grep does not model.
- `action-guard-coverage.test.ts` (the plain one, the ratchet at `:127`) is NOT
  returned at all: `grep -cE "<seeds>" action-guard-coverage.test.ts` = 0. It
  walks `src/app/actions` for `export async function`; it names no seed symbol,
  so the grep is blind to it. This is the file the owns list genuinely missed.

THE RULE this establishes: directory-walking and source-text canaries (the
`src/app/actions` guard-coverage ratchet, the wholesale-auth-mock shrink-only
canary, and any `GradingTab`-source-reading wiring test) MUST be added to the
owns set and the gate BY HAND - a symbol-mention grep is a FLOOR, and for these
a misleading one (it returns three of the four for the wrong reason while
missing the fourth). The ones that can go red from THIS scope's edits:

- `src/app/actions/action-guard-coverage.test.ts` AND
  `action-guard-coverage-github-cohort.test.ts` - walk `src/app/actions` for
  `export async function` in `"use server"` modules and require each
  `requireAppOwner()`-guarded (`:127`). The NEW `grading-one-upload.ts` action is
  collected here; an arrow export silently escapes (section 3). LOAD-BEARING,
  hand-added. (Only the `-github-cohort` variant was in the grep output.)
- `src/app/actions/wholesale-auth-mock-population.structure.test.ts` - SHRINK-ONLY
  frozen set over `src/app/actions` that REDS ON GROWTH; a
  `grading-one-upload.test.ts` doing `vi.mock("@/lib/supabase/auth")` grows it
  (section 3 forbids that mock). LOAD-BEARING.
- `src/app/components/grading/gradingDiagnosticWiring.wiring.test.ts` - reads
  `GradingTab.tsx` as source; pins `markWholeRunStart()` before `formAction(fd)`
  inside `submitWholeRun` AND asserts no `session-diagnostic-log` string. Wave 1
  branches the zip submit/onChange, which can move those tokens. LOAD-BEARING.
- `src/app/components/componentStorageKeys.structure.test.ts` - reads
  `GradingTab.tsx` as source text; the `ta-grading-one-upload` literal reds it
  until `EXPECTED_TA_KEYS` is bumped (section 5). LOAD-BEARING.
- `src/file-size-ceiling.structure.test.ts` - walks all of `src/`; any new file
  or grown file over 1000 reds it. Always in every wave gate.
- `src/app/components/grading/gradingPictureIngest.test.ts` - asserts on
  `gradingPictureIngest.ts` behaviour; Wave 3 edits that file. Opened this pass.
- `src/app/components/grading/gradingPictureWiring.wiring.test.ts` - reads
  `GradingPictureField`/`gradingPictureIngest` as source; Wave 3 touches them.
- `src/app/api/grade-run-item/route.test.ts` (+ `.videoref`/`.videoseam`) -
  assert on the route N15a reuses UNCHANGED; they should stay green (no route
  edit planned). If a wave edits the route, they are owned.
- `src/lib/grade/single-file-entry.test.ts` (+ `.inference-gate`,
  `.name-oracle`) - assert on `buildSingleFileEntry`, reused UNCHANGED by Wave 1.
  Green unless a wave edits that file.
- `src/app/actions/grading-incremental.test.ts` (+ `.zip-caps`) and
  `src/app/components/grading/incrementalRunPlan.test.ts` /
  `useIncrementalGradingRun.lifecycle.test.ts` - assert on the precedent whose
  leaves N15a imports but does not edit; green unless a leaf is edited.

Full list (49 files), the exact current output of the command above, carried
verbatim for the build wave's re-derivation. NOTE: `action-guard-coverage.test.ts`
(the plain ratchet) is NOT in this output - it names no seed symbol - and MUST be
hand-added to the gate per the derivation rule above; it is listed in the "can go
red" bullets but deliberately not inserted into this verbatim block, which is the
raw grep output and nothing else.

```
src/app/actions/action-guard-coverage-github-cohort.test.ts
src/app/actions/grading-chat-intake.test.ts
src/app/actions/grading-incremental.test.ts
src/app/actions/grading-incremental.zip-caps.test.ts
src/app/actions/grading.guard.test.ts
src/app/actions/wholesale-auth-mock-population.structure.test.ts
src/app/api/grade-run-item/route.test.ts
src/app/api/grade-run-item/route.videoref.test.ts
src/app/api/grade-run-item/route.videoseam.test.ts
src/app/components/CartridgeDropPanel.reorder.test.ts
src/app/components/autoGradeTransition.wiring.test.ts
src/app/components/componentStorageKeys.structure.test.ts
src/app/components/grading-chat/GradingChatPanel.structure.test.ts
src/app/components/grading-chat/chatFrameCapture.test.ts
src/app/components/grading-chat/useContinuousGradingRun.video.test.ts
src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts
src/app/components/grading-recording/copy-feedback.test.ts
src/app/components/grading-recording/grading-row.test.ts
src/app/components/grading-recording/markLate.wiring.test.ts
src/app/components/grading-recording/submission-kind-callsites.structure.test.ts
src/app/components/grading-recording/useGradingRows.wiring.test.ts
src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts
src/app/components/grading-results/gradingResultsHelpersEditState.test.ts
src/app/components/grading-results/gradingResultsHelpersWiring.test.ts
src/app/components/grading-results/rubricProvenanceLeaf.test.ts
src/app/components/grading/gradingDiagnosticWiring.wiring.test.ts
src/app/components/grading/gradingPictureIngest.test.ts
src/app/components/grading/gradingPictureWiring.wiring.test.ts
src/app/components/grading/incrementalRunPlan.test.ts
src/app/components/grading/replySectionMarker.wiring.test.ts
src/app/components/grading/runProgressCopy.test.ts
src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts
src/app/components/grading/zipUploadPreflight.wiring.test.ts
src/app/components/repo-grades/repoGradesStorageKeys.structure.test.ts
src/app/components/tabs/topLevelTabs.wiring.test.ts
src/app/components/ui/confirmArmButtons.test.ts
src/file-size-ceiling.structure.test.ts
src/lib/canvas-client-boundary.runtime-graph.test.ts
src/lib/grade/extraction.video.test.ts
src/lib/grade/rubric-provenance-producers.structure.test.ts
src/lib/grade/rubric-stamp.wiring.test.ts
src/lib/grade/single-file-entry.inference-gate.test.ts
src/lib/grade/single-file-entry.name-oracle.test.ts
src/lib/grade/single-file-entry.test.ts
src/lib/grade/video-dispatch.wiring.test.ts
src/lib/grade/video-intake.test.ts
src/lib/grade/video-w2.wiring.test.ts
src/lib/zip-caps.test.ts
src/tools/strip-comments-agreement.structure.test.ts
```
