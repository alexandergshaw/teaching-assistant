# A38 acceptance criteria - grade ONE submission on the recording grader

- Item: A38, area `grading-run-survival-and-disclosure`, kind feature, state
  unscoped (`docs/backlog.yml:667-712`).
- Seat: `loop-ac` (Opus). A fresh `loop-checker` gates this document before any
  later seat consumes it.
- This is the AC round only. No mechanism, no wave plan, no oracle, no code.
  Where a criterion names a code location it is to make itself satisfiable,
  never to design the build. Mechanism (the extraction wave, the prop sets, the
  digest function, `ConfirmArmButtons` wiring, how N reaches the client) is the
  architect's and lives already in `docs/a38-scope.md`.
- **Unusual ordering, stated so no consumer is surprised.** An architecture pass
  (`docs/a38-scope.md`, revision 2) and two round-2 rulings
  (`docs/a38-rulings-round2.md`) already exist for A38; this AC document was
  authored after them. These criteria codify the owner's words and the DECISIONS
  already made; they do not reopen the architecture. Where this document and
  `docs/a38-scope.md` diverge on a value the owner has since decided, the
  DECISION wins and the divergence is named (see AC-3 and the conflict note
  under it).

## The owner's words (quoted)

From the backlog title (`docs/backlog.yml:667`, owner 2026-09-23, answering the
fork A34 raised):

> "choosing between a single-row and a subset control and answering: Single row.
> Grade ONE submission on the recording grader, rather than the whole table.
> Today handleGradeAll is the only way to grade there and it always sends every
> row, which is why TWO false sentences had to be deleted rather than made true -
> A31 said re-run to grade the rest and A34 said retry this row on its own, and
> neither named anything the instructor could do."

The owner's own list of what the scope must settle and must not default silently
(`docs/backlog.yml:677`, note): "(1) THE BOUND ... (2) THE RUBRIC ... (3) COST
DISCLOSURE ... (4) THE COPY THAT WAS DELETED ... (5) CONCURRENCY". Each is
carried below as a criterion.

The spend-cap shape, from `docs/owner-decisions-2026-09-23.md` DECISION 2 (owner
2026-09-23):

> "The question was the cap's shape - a hard stop, a confirm above N, or a
> disclosure only. The owner chose: confirm above N."

Where any criterion below and these words diverge, the words win.

## Environment ceilings that bind every criterion

Measured, not assumed (`docs/loop/this-repo.md` sections 1, 6):

- NO component is rendered by any test here (`vitest.config.ts` is
  `environment: "node"`, `include: ["src/**/*.test.ts"]`). Every claim about the
  per-row button appearing, its disabled state, the confirm dialog showing, or a
  click landing is a READING claim or an OWNER-VERIFICATION claim, never
  machine-checkable. Each such criterion says so.
- NO HOOK IS DRIVEN AT RUNTIME EITHER, which is a stricter ceiling than "no
  component renders" and binds AC-1, AC-3 and AC-8 specifically: `grep -rn
  "renderHook\|@testing-library" package.json vitest.config.ts vitest.setup.ts`
  returns nothing - there is no `@testing-library/react-hooks` or
  `@testing-library/react` `renderHook` in this tree, and `environment: "node"`
  (above) forecloses adding one that works without a DOM. A criterion whose
  instrument reads "drive the hook", "press twice" against a hook, or "call the
  hook with a mocked ref" is not buildable here even mocked - it needs a
  render pass this repo's vitest cannot perform. Any such criterion's
  MACHINE instrument must instead name a plain function/object this repo can
  construct and call directly with `new`/a factory - never a hook invocation -
  which in turn requires the behavior to be EXTRACTED out of the hook into a
  pure, dependency-injected unit before the criterion is satisfiable. Where a
  criterion below requires that extraction as its instrument's precondition,
  it says so and routes the extraction to the architect (mechanism is out of
  scope for this document per the header above); this document does not design
  the extraction, only requires that the instrument be buildable.
- No API key, and `vitest.setup.ts` throws on real network. Every `callLlm` path
  is exercised only through mocks. The single-row DISPATCH logic, the
  spend-count increment, the N threshold decision, the classifier reuse and the
  emitted-string shape ARE machine-checkable with the grading action or
  `callLlm` mocked. The QUALITY of any model output is owner-verification.
- A multi-file instrument is spelled `npm run test:paths -- <p1> <p2> ...`, never
  a raw multi-path `vitest`/`npm test`, which silently drops any argument it does
  not match and exits 0 (`docs/loop/this-repo.md` section 1).

## Measured tree facts these criteria rest on

Every quantity names the command that produced it. Run from the repo root.

- `handleGradeAll` is the ONLY production caller of the batch action, and it
  builds its submission list from the WHOLE table on every press:
  `grep -n "handleGradeAll\|gradeCapturedSubmissionsAction\|rawRows" src/app/components/grading-recording/GradingRecordingPanel.tsx`
  -> handler at `:621`, `const submissions = gradingRows.rawRows.map(...)` at
  `:638-643`, the call at `:651-656`. Confirmed the "whole table on every press"
  claim at HEAD.
- The batch action accepts an arbitrary-length array and slices it to the bound:
  `sed -n '131,214p' src/app/actions/grading-submission-grade.ts` shows
  `gradeCapturedSubmissionsAction(submissions, rubricText, knowledgeContext, provider)`
  at `:131`, `maxSubmissions = getGeminiMaxSubmissions()` at `:146`,
  `submissions.slice(0, maxSubmissions)` at `:151`, overflow rows returned as
  `composeFailedGradingRow(...)` with the `submission-count-bound` message at
  `:196-208`. A one-element array is therefore never in the overflow slice.
- The bound is server-only and NOT client-readable:
  `grep -rln "getGeminiMaxSubmissions" src --include=*.ts --include=*.tsx`
  returns actions, `src/lib/grade/*`, `src/lib/workflows/registry/*` and one
  chat hook - NO client component. `DEFAULT_MAX_SUBMISSIONS = 40` at
  `src/lib/gemini.ts:32`, read from `process.env.GRADE_MAX_SUBMISSIONS` at
  `:131`.
- The overflow / deleted-copy sentence today offers NOTHING:
  `grep -n "submission-count-bound\|UNGRADED_NOT_ATTEMPTED_MESSAGES" src/lib/grade/types.ts`
  -> `:194` `"Not graded: this run reached its submission limit before this submission."`
- Panel size: `wc -l src/app/components/grading-recording/GradingRecordingPanel.tsx`
  -> 977 (drifted from the 990 `docs/a38-scope.md:101` measured; ceiling is 1000,
  red at 1001 per `docs/a38-scope.md:107`). The ceiling headroom is an architect
  concern, not an AC.
- Rubric persistence and RUN-LEVEL provenance already SHIPPED (via A39, commit
  8a977b1): `ls src/lib/grade/rubric-memory.ts` exists;
  `grep -n "STORAGE_KEY_RUBRIC" src/app/components/grading-recording/GradingRecordingPanel.tsx`
  -> `:197 const STORAGE_KEY_RUBRIC = "ta-rec-grade-rubric"`; the persisted-key
  canary is already at eight keys (`grading-rows.test.ts:694`). See the
  shipped/partial/new map for what this means for AC-6.
- The single-row PATH does not exist yet:
  `grep -rn "gradeAttempts\|gradedRubricDigest\|useGradingRowGrade\|gradingRowGradeAction" src --include=*.ts --include=*.tsx`
  returns only docs and the not-yet-built references; no such source symbol
  exists. `ConfirmArmButtons` (the arm/confirm idiom) is already imported and
  used in `src/app/components/grading-recording/GradingTableRow.tsx:50,182`, so
  the cap's confirm idiom is reusable, in-file.

## Shipped / partial / new map

| Piece | Status | Evidence |
|---|---|---|
| Batch grade action (`gradeCapturedSubmissionsAction`), reachable, one caller | SHIPPED - already accepts a 1-element array | `grading-submission-grade.ts:131`, called at `GradingRecordingPanel.tsx:651` |
| Grade-all whole-table path (`handleGradeAll`) | SHIPPED - must be preserved (AC-2) | `GradingRecordingPanel.tsx:621,638-656` |
| A single-row CALLER (a per-row control that sends exactly one row) | NEW | no per-row grade symbol exists (grep above) |
| Rubric text persistence (`ta-rec-grade-rubric`) | SHIPPED (A39) | `GradingRecordingPanel.tsx:197`, `rubric-memory.ts` |
| Run-level rubric provenance / fingerprint | SHIPPED (A39 W2, 8a977b1) | `rubric-memory.ts`; backlog A44 note |
| Per-row rubric-divergence signal (`gradedRubricDigest`) | NEW | no such symbol exists (grep above) |
| Spend cap: per-row attempt count + confirm above N | NEW | no `gradeAttempts` symbol exists |
| Arm/confirm idiom (`ConfirmArmButtons`) | SHIPPED, reusable | `GradingTableRow.tsx:50,182` |
| Concurrency: only guard today is captured render state (`gradingBusy`) | PARTIAL - a real lock is NEW | `GradingRecordingPanel.tsx` `gradingBusy`; `docs/a38-scope.md:565-577` |
| Overflow / deleted-copy sentence offering nothing | SHIPPED - offer added only where reachable (AC-4/AC-9) | `types.ts:194` |

## Leverage claim (one paragraph, one removal-test criterion)

A38 does NOT earn a new leverage class, and the honest name matters. The
mechanism it needs - one `systemPrompt` pinned from the rubric, looped over
submissions - is already in the tree (`grading-submission-grade.ts:154,157-194`);
A38 builds none of it. What A38 changes is the UNIT that pinned rubric is applied
at, from the whole table to one row, plus a guard on what one screen can spend.
Its class is therefore SCALE, INHERITED not earned (`docs/a38-scope.md:65`), and
the recommendation of record is to ACCEPT THE COST EXPLICITLY
(`docs/a38-scope.md:82-87`): A38's advantage is interaction cost and spend at a
smaller unit - N model calls to fix one row today (and for a bound-overflow row,
no working sequence at all) become one call - not integration or persistence it
does not have. This is a targeted UX + cost-control capability, not a
user-facing content feature. The three-way class call is the human's, not this
seat's to finalize.

- **LEV-1 (removal test, owned by the test seat).**
  - Object under comparison: the submissions array the grade action receives on a
    single-row press, versus that same press with the row-scoped projection
    removed (sending `gradingRows.rawRows` instead of the one row).
  - Instrument: a wiring/unit test with the grade action (or `callLlm`) mocked to
    capture its first argument; assert `mock.calls[0][0].length === 1` and
    `mock.calls[0][0][0].id` equals the pressed row's id.
  - Direction of failure: RED when the length is not 1 or the id is not the
    pressed row's - i.e. RED on REMOVAL of the row-scoping, not merely on
    unrelated breakage. A single-row press that quietly sends the whole table
    must turn this RED.
  - Named to the test seat because oracle construction is theirs.

## Numbered acceptance criteria

Each names object / instrument / direction of failure, and its class:
[MACHINE] pure or mocked-`callLlm`/mocked-action testable; [READING] verified by
reading source only; [OWNER] verified only by the owner in the deployed app.

### AC-1 - A single-row grade sends EXACTLY the one chosen row [MACHINE + OWNER]
- Owner's words: "Single row. Grade ONE submission ... rather than the whole
  table."
- INSTRUMENT PRECONDITION (routed to the architect, not designed here): the
  code that turns "one chosen row" into the grade action's request payload
  (the single-row selection/request-body builder) must be a PURE function,
  extracted out of the hook the scope sketches (`useGradingRowGrade`) rather
  than inlined in it, taking a row (or row id + row lookup) and returning the
  payload the grade action receives - callable directly from a node test with
  no hook driven and nothing rendered. This is the same "no hook runtime"
  ceiling named above; without the extraction this criterion has no buildable
  MACHINE instrument.
- Object: the request-body/selection builder's OUTPUT for one chosen row (the
  payload the grade action would receive), and, separately, the set of rows a
  press mutates.
- Instrument: [MACHINE] STRONGER FORM, preferred where the architect can make
  it hold: shape the builder so its return type IS a single submission (e.g. it
  takes one row and returns one payload object, not an array) - "sends more
  than one row" then becomes UNREPRESENTABLE by the type/shape itself, and this
  criterion needs no runtime length assertion at all; a source-reading check
  that the builder's signature and return shape admit only one row is
  sufficient. FALLBACK FORM, only if the stronger form is not adopted: call the
  pure builder directly (no hook, no render) with one row and assert the
  returned payload's array length is 1 and its id is the pressed row's - this
  is still a MACHINE instrument because the builder is a plain function, unlike
  the banned hook-driven form. Either form is paired with a second assertion
  that no other row's result fields change (compare the row array before and
  after the press, using the existing wiring/action-mock pattern LEV-1 already
  uses - that part does not need the hook driven, only the action mocked).
  [OWNER] the owner presses one row's grade control and sees only that row
  update.
- Direction of failure: FAILS if the builder's output (or, fallback form, the
  captured payload) contains more than the one row; FAILS if it regrades the
  whole prefix (the first `maxSubmissions` rows); FAILS if any non-target row's
  fields change; FAILS if the existing grade-all path is broken by the change
  (cross-checked by AC-2); FAILS (as a document defect, not a code defect) if
  the extraction precondition above is skipped and the only instrument offered
  is a source-text grep for "one row" - that does not observe a length or a
  shape and satisfies nothing.

### AC-2 - Grade-all whole-table behavior is preserved, additively [MACHINE + READING]
- Owner's words (implication): the single-row control is added; grade-all is
  "the only way to grade there" today and stays working.
- Object: `handleGradeAll`'s whole-table dispatch and every assertion currently
  pinning it.
- Instrument: [READING] a source pin that `handleGradeAll` still builds its
  submissions from `gradingRows.rawRows` (the whole table). [MACHINE] the shipped
  grade-all wiring and action tests (`GradingRecordingPanel.wiring.test.ts`,
  `grading-submission-grade.test.ts`) stay green, with no assertion WEAKENED to
  accommodate the single-row path; a deliberate correction (e.g. the action
  header comment that becomes false, `grading-submission-grade.ts` header) is
  allowed and named, but no behavioral assertion is loosened.
- Direction of failure: FAILS if a grade-all behavioral assertion had to change
  to let the single-row path in (that means the change was not additive); FAILS
  if a bulk press sends fewer than the whole table; FAILS if grade-all is routed
  through the single-row path and thereby loses its per-invocation bound.

### AC-3 - The spend cap is CONFIRM ABOVE N, counting model calls DISPATCHED, N = min(totalCount, maxSubmissions) [MACHINE + OWNER]
- Owner's words: DECISION 2 - "The owner chose: confirm above N." Below N nothing
  is asked; above N "the instructor is asked and may proceed" and "no press is
  silently refused"; and the count "increments when the call is DISPATCHED, not
  when it is classified" (`docs/owner-decisions-2026-09-23.md:41-63`).
- Object: (a) the per-row attempt count for the table, and WHEN it increments;
  (b) the pure decision "does this press require a confirm", as a function of
  that count and N; (c) N's value.
- INSTRUMENT PRECONDITION (routed to the architect, not designed here): the
  per-row attempt counter must be a PURE, dependency-injected unit (an
  increment/read pair, or a small state object with an `onDispatch` /
  `onOutcome` entry point) extracted out of the hook, not a `useState`/`useRef`
  counter reachable only by driving `useGradingRowGrade`. Same "no hook
  runtime" ceiling as AC-1.
- Instrument:
  - [MACHINE] drive the pure counter directly: call its dispatch-increment
    entry point, then call its error/failure outcome entry point (simulating
    the grade action returning `{ error }` or throwing), and assert the count
    rose by one at the DISPATCH call and did not fall or reset at the
    failure-outcome call. This proves "increments on dispatch, survives an
    error outcome" without a hook driven or anything rendered - the counter is
    a plain object under direct call, not the hook.
  - [MACHINE] a pure threshold predicate: below N returns proceed-without-confirm;
    at or above N returns require-confirm.
  - [MACHINE] N is `min(totalCount, maxSubmissions)`, NOT `totalCount`: with
    `getGeminiMaxSubmissions` mocked low (the pattern already at
    `grading-submission-grade.test.ts:288-331`) and a `totalCount` above it, the
    confirm boundary sits at the min, not at `totalCount`.
  - [OWNER] above N the instructor sees a confirm, can proceed, and can cancel;
    below N no confirm appears.
- Direction of failure: FAILS if the confirm fires below N (trains dismissal,
  DECISION 2's stated worse-than-nothing case); FAILS if no confirm at or above
  N; FAILS if the count rises only on SUCCESS so a failing row can be re-pressed
  indefinitely without reaching N (the exact `docs/a38-rulings-round2.md` Ruling 6
  hole); FAILS if N is set to `totalCount` (Ruling 9); FAILS if the cap is a hard
  stop that cannot be proceeded past, or the confirm cannot be cancelled.
- CONFLICT NOTE, surfaced rather than silently adopted: `docs/a38-scope.md:652`
  sets `N = gradingRows.totalCount`. `docs/owner-decisions-2026-09-23.md:54-58`
  and `docs/a38-rulings-round2.md` Ruling 9 SUPERSEDE that:
  `N = min(totalCount, maxSubmissions)`, because `totalCount` exceeds one bulk
  press by `totalCount - 40` exactly in the overflow case A38 exists for. This
  criterion binds to the DECISION value (min). The scope's `totalCount` value is
  stale and must not be built.
- SATISFIABILITY NOTE: `maxSubmissions` is server-only (measured above), while
  the confirm renders client-side. N is still satisfiable - the min can be
  computed where the action runs, or the bound exposed to the client - but HOW is
  the architect's, recorded as RES-A38AC-2.

### AC-4 - No path silently regrades already-graded rows, and no remedy sentence is false on a reachable state [MACHINE + READING + OWNER]
- Owner's words: the two deleted sentences (A31 "re-run to grade the rest", A34
  "retry this row on its own") "neither named anything the instructor could do";
  and the note's item (4): a sentence "may assert only what holds on every caller
  and every reachable state" (A31 Ruling 1).
- Object: (a) the rows a single-row press affects beyond its target; (b) every
  offer/remedy sentence rendered or emitted on the grading surface.
- Instrument: [MACHINE] AC-1's non-target-rows assertion covers (a). For (b): the
  emitted overflow string (`grading-submission-grade.ts:196-208`) offers nothing
  - captured by driving the real action with `getGeminiMaxSubmissions` mocked low
  (`grading-submission-grade.test.ts:288`). [READING] any offer sentence that
  names the single-row remedy renders only inside the same condition that renders
  the reachable control, so it cannot be read while the control is absent (the
  `docs/a38-rulings-round2.md` Ruling 10 B-3 requirement: the sentence had four
  producers and was false on three). [OWNER] the owner confirms no sentence
  promises a remedy that is not offered beside it.
- Direction of failure: FAILS if a single-row press changes any row other than
  its target; FAILS if grade-all sends only a prefix while implying the whole
  table; FAILS if any offer sentence ("grade the rest", "get past the run
  limit", "retry this row on its own") renders on a state where that action is
  not actually reachable.

### AC-5 - A single-row grade is always under the bound, and IS the remedy for bound-overflow rows [MACHINE + OWNER]
- Owner's words (note item 1): "does a single-row grade count against the same
  submission limit, and what happens when the table is already past it? The limit
  is read per run from the environment, so a one-row run is trivially under it -
  say whether that is intended or an accident to guard."
- Object: a single-row grade against `getGeminiMaxSubmissions()`, when the table
  is already past the bound.
- Instrument: [MACHINE] driving the grade action with a one-element array and
  `getGeminiMaxSubmissions` mocked to its minimum (>= 1, since
  `parsePositiveInt` has no `min` arg and falls back to 40 -
  `docs/a38-scope.md:307-316`) yields the row in `results`, never in overflow.
  [OWNER] on a table past the bound, pressing an overflow row's control grades it.
- Direction of failure: FAILS if a single-row press can land in the overflow
  branch; FAILS if a single-row press is refused because the TABLE is past the
  bound (the whole point is that the single row is under the per-invocation
  bound and so grades). See OQ-3 for the intended/guard confirmation.

### AC-6 - A single-row grade uses the same rubric as its neighbours, and divergence is disclosed [MACHINE + OWNER]
- Owner's words (note item 2): "a single-row grade must not silently resolve a
  DIFFERENT rubric than the row beside it was graded against, which would make
  two rows on one screen incomparable."
- Object: the rubric the single-row path reads, versus the rubric the bulk path
  reads; and the signal shown when a row was graded against a rubric that differs
  from the current one.
- Instrument: [MACHINE] the single-row path reads the SAME `rubricText` state the
  bulk path reads (`GradingRecordingPanel.tsx` rubric state, captured in the
  request) - a request-capture test asserting both paths carry the same rubric
  for the same state. [MACHINE/READING] where a row was graded against a
  different rubric than the current one, a divergence signal is present (the
  `gradedRubricDigest` per-row field is NEW; run-level provenance already ships
  via `rubric-memory.ts`). [OWNER] the owner can tell a row was graded against an
  older rubric.
- Direction of failure: FAILS if the single-row path resolves its rubric from a
  different source than the bulk path; FAILS if a row graded against rubric A is
  shown beside a row graded against rubric B with no signal; FAILS if the
  divergence signal fires on a row that carries no recorded digest (a row graded
  before the field existed must warn about nothing - `docs/a38-scope.md:410-412`).

### AC-7 - The instructor can tell what a single-row press will spend [OWNER + READING]
- Owner's words (note item 3): "one row is one model call, and the instructor
  should be able to tell what a press will spend."
- Object: what the per-row control communicates about its scope/cost.
- Instrument: [READING] the control's accessible name / adjacent copy names the
  single-submission scope (this app has no cost-disclosure copy today -
  `docs/a38-scope.md:445-452` - so the disclosure is STRUCTURAL: the control sits
  in the row it grades and names that one row). [OWNER] pressing gives a clear
  indication that it grades this one submission. This is NOT machine-checkable
  because nothing renders under vitest.
- Direction of failure: FAILS (owner) if pressing gives no indication of scope;
  FAILS if the control implies it grades more than the one row.

### AC-8 - Per-row presses do not interleave, and a refused press never deadlocks the surface [MACHINE + OWNER]
- Owner's words (note item 5): "A26 shipped a lock because two clicks during a
  rubric fetch double-graded every repo. A per-row button multiplies the click
  surface, so say whether the same lock covers it or whether per-row presses may
  interleave."
- INSTRUMENT PRECONDITION (routed to the architect, not designed here): the
  lock itself must be a PURE, dependency-injected unit - an acquire/release
  pair (or equivalent) callable directly, independent of the hook and of
  `useRef` - extracted out of `useGradingRowGrade` rather than living only as a
  ref reachable by driving the hook. Same "no hook runtime" ceiling as AC-1 and
  AC-3; without this extraction Ruling 8's mandated deadlock instrument (below)
  has nothing to call.
- Object: concurrent single-row presses; a single-row press concurrent with a
  bulk run; and the state of the lock AFTER a press that it refused.
- Instrument: [MACHINE] drive the pure lock directly: acquire it once (asserts
  acquired), attempt a second acquire while still held (asserts refused - only
  one logical "call" would proceed), then release, then acquire AGAIN (asserts
  the second acquire now SUCCEEDS). This is Ruling 8's "press twice, second
  press works" requirement satisfied by calling the real lock unit twice, not
  by rendering or driving a hook. [MACHINE] separately, a claims-the-lock-only
  check (asserting merely that `acquire()` was called or returned truthy once,
  with no second acquire-after-release proving release actually happened) is
  EXPLICITLY INSUFFICIENT per Ruling 8 and must not be offered as the sole or
  primary instrument - Ruling 8 exists precisely because that shape passes
  green while the surface deadlocks on the second click. [OWNER] while one row
  grades, its control reads busy/disabled and other controls are disabled;
  after that grade completes, the control is pressable again.
- Direction of failure: FAILS if two presses both dispatch concurrently; FAILS
  if a single-row press can interleave with a bulk run (in either order); FAILS
  if the lock is claimed on an early-return/refusal path and never released, so
  the next legitimate press does nothing (every gate green, feature dead on the
  second click - Ruling 8); FAILS (as a document defect, not a code defect) if
  the second-acquire-after-release call is missing from the instrument and only
  the claims-the-lock check is offered - that is the banned shape.

## Open questions - forks the owner must settle (phrased so every answer terminates)

Do NOT guess these into the criteria as decided.

- **OQ-1 - does the confirm-above-N cap apply to the per-row path only, or also
  to grade-all?** Grade-all is already bounded per invocation to `maxSubmissions`
  and cannot exceed one press; the per-row path is what removes any aggregate
  bound (`docs/a38-scope.md:328-336`). Recommended reading: per-row only.
  Answers, each terminating: (a) per-row only - AC-3 binds to the per-row path;
  (b) both - AC-3 additionally guards grade-all. The answer sets the path in AC-3
  and closes it.
- **OQ-2 - is "a one-row run is trivially under the env limit" INTENDED, or an
  accident to guard?** (Owner's own note item 1.) The scope treats it as the
  intended remedy for bound-overflow rows (AC-5). Answers, each terminating:
  (a) intended - AC-5 stands as written, no extra guard; (b) guard it - AC-5
  gains a single-row-specific cap. Either ends the question.

Copy of the confirm and the offer sentence is NOT an owner fork: DECISION 2
leaves it to A31 Ruling 1, i.e. the seat writes it against every reachable state,
not frozen as a test literal (`docs/owner-decisions-2026-09-23.md:65-67`). It is
a residual, below, not a question.

## Residual register

Each residual carries owner, instrument, and the step that will measure it. A
residual missing any of the three is a deletion. **These residuals must be filed
as rows in `docs/BACKLOG.md` by the orchestrator** (this seat does not write the
backlog under concurrency); until then they exist only here, which
`docs/loop/iteration-caps.md` counts as not yet real.

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-A38AC-1 | The confirm's copy and the per-row offer sentence, written true on every reachable state per A31 Ruling 1 (not frozen as a literal) | Test seat / architect | Reading against every reachable state; `docs/a38-rulings-round2.md` Ruling 10 B-3 | Design + test-notes pass |
| RES-A38AC-2 | WIDENED (round-1 fix): HOW the extraction is done - (a) `min(totalCount, maxSubmissions)` computed given `maxSubmissions` is server-only (AC-3); (b) the single-row request-body/selection builder pulled out of `useGradingRowGrade` as a pure function (AC-1); (c) the per-row attempt counter pulled out as a pure dependency-injected unit (AC-3); (d) the per-row lock pulled out as a pure acquire/release unit (AC-8) - all four are one architect decision about the hook's internal shape, not four separate ones, because this repo's vitest cannot drive a hook (see the ceiling note above `AC-1`) | Architect | The AC-1 / AC-3 / AC-8 machine instruments, each of which needs its named unit to exist before it can be written | Architect pass |
| RES-A38AC-7 | `docs/a38-scope.md` is STALE relative to owner decisions made after it was written, and BLOCKS the wave plan until refreshed: (1) `docs/a38-scope.md:652` sets `N = gradingRows.totalCount`, superseded by `docs/owner-decisions-2026-09-23.md` DECISION 2 and Ruling 9's `N = min(totalCount, maxSubmissions)` (AC-3's conflict note, above); (2) the scope's wave 1 plans to ship rubric-text persistence (`docs/a38-scope.md:372,376-377`, "seven to eight" key canary at `:298,724`) and that persistence, plus the eighth key and the run-level fingerprint, ALREADY SHIPPED via A39 (commit 8a977b1; `grading-rows.test.ts:694` already shows eight keys; `GradingRecordingPanel.tsx:197`) - wave 1 as scoped would re-ship a shipped canary bump and re-litigate a settled key count. Filed as a residual rather than fixed here because scope revision is the architect's mechanism pass, out of this document's scope (see header). | Architect | A fresh read of `docs/a38-scope.md` against current HEAD and against `docs/owner-decisions-2026-09-23.md` / `docs/a38-rulings-round2.md`, producing a revision 3 | Architect pass, BEFORE the A38 wave plan is written - the wave plan must not consume scope revision 2 as-is |
| RES-A38AC-3 | Per-row rubric-divergence signal (`gradedRubricDigest`) is NEW; run-level provenance already ships (`rubric-memory.ts`) - decide whether the per-row signal is additive or reuses the shipped provenance | Architect | AC-6 machine + owner verify | Architect pass |
| RES-A38AC-4 | The per-row button rendering, its three disabled reasons, and the confirm dialog interaction (nothing renders under vitest) | Owner | Open Tools grading recording panel in prod; grade one row; exceed N; cancel and proceed | Post-deploy owner verification |
| RES-A38AC-5 | Whether a real single-row run returns useful feedback (model QUALITY) | Owner | Run the deployed feature (no API key here) | Post-deploy owner verification |
| RES-A38AC-6 | LEV-1 removal-test construction (the leverage oracle) | Test seat | Mocked grade-action request-capture | Test seat, after Build and Verify |

## Disposition table

Not applicable: this is the first AC version for A38. `docs/a38-scope.md` and
`docs/a38-rulings-round2.md` are architecture and orchestrator artifacts, not a
prior AC document, so there are no prior criteria to map to kept / handed-over /
withdrawn. The one value where this document overrides the scope (N) is named
in-line under AC-3 rather than in a disposition row.

## Out of scope for this document (routed)

- Mechanism: the extraction wave, prop sets, the digest function, the lock's
  wiring, how N reaches the client, `ConfirmArmButtons` placement -> architect
  (`docs/a38-scope.md`).
- Wave ordering and write-set disjointness -> plan.
- Oracle, fixtures, sabotage, the LEV-1 removal test, the confirm/offer copy ->
  test seat.
- Global-invariant accounting (the file-size ceiling, the exact-set canaries) ->
  architect and the wave gate.
