# Grader Wave W1 - TDD test notes + frozen oracles (GRADING-CHAT driver-state)

Authority: `docs/grader-fully-functional-scope.md` (SHIP-checked). Reading applied:
**F3=A** - one Canvas URL pinned per session, NOT per-row; `GradingResults.tsx` is
READ-ONLY and NOT in the write set. DISJOINT from the engine wave: does not touch
`engine.ts`, `prompts.ts`, `parsing.ts`.

Satisfiability + mutation proof: reference at
`scratchpad/w1-reference.js` -> 15/15 "ALL EXPECTATIONS MET"; all six oracles green
on ONE reference driver; every sabotage flips exactly its own oracle red. No mutant
red-in-both-directions or green-in-both. Nothing rebuilt.

## WRITE SET (W1, exact)
- `src/app/components/grading-chat/useContinuousGradingRun.ts` (303 lines; additions small)
- `src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts` (extend;
  do NOT edit/delete existing assertions - FF-11)
- A new pure client-safe leaf under `grading-chat/` ONLY if the architect extracts
  relabel/session-key logic (must stay Buffer-free per `chatSubmissionIntake.ts:9-17`);
  if created, its own `*.test.ts` joins the write set.

NOT in W1: `GradingResults.tsx`, `GradingChatPanel.tsx` (W2), `gradingResultsHelpers.ts`,
`engine.ts`/`prompts.ts`/`parsing.ts`.

## HARNESS FACTS the implementer MUST honor
- The lifecycle harness mocks `react` (`vi.mock("react", ...)`, test lines 38-42) and
  both intake actions (lines 44-49). `vitest.setup.ts` throws on real fetch; the seam is
  `dispatchItem` (injected) and the two intake-action mocks - never a real `fetch`,
  never a real `callLlm`. Mock `prepareChatSubmissionAction`, never `fetch`.
- Observe after a fresh `useTestDriver()` call. The hook returns a plain object built
  from current ref/state at call time; refs persist across calls via `h0` slots (test
  lines 30-35). Re-obtain the driver after every mutating call before asserting (existing
  tests do this at lines 143-144, 149-150). Corollary for the implementer: expose
  `canvasUrl` and `runKey` by READING THE REF at return time
  (`canvasUrl: canvasUrlRef.current`, `runKey: 'grading-chat-' + sessionIdRef.current`),
  not a stale `useState` snapshot.
- No cross-test-file imports. Every expected value is a FROZEN LITERAL; do NOT import
  `assignUnclaimedLabel`/`runResetKey` to compute an expectation (tautology).
- `detectCanvasUrlKind` / `parseCanvasUrl` (`src/lib/canvas-url.ts:17,32`) are PURE and
  client-safe (header 1-6). `assignUnclaimedLabel` (`src/lib/grade/utils.ts:433`) is pure.
- New fixture needed: the existing `readyHeader` (test 73-80) has `rubricFingerprint: ""`,
  which cannot exercise FF-9. Add a fixture with a NON-EMPTY frozen fingerprint.

Tag key: PURE = node-drivable in this harness. READ = source-text/owner-walk, NOT
machine-verified here. OWNER = needs a browser/key.

---

## Oracle 1 - G1 / FF-L: driver RETAINS the Canvas URL (load-bearing removal test). [PURE core + READ last hop]
- Object: value exposed as `driver.canvasUrl` after a Canvas-URL submission of `U`.
- Instrument [PURE]: mock `prepareChatSubmissionActionMock.mockResolvedValue({ kind:"entries", entries:[{student:"Ada",content:"x",mergedFileCount:1,submittedFiles:[]}], pointsPossible: 100 })`;
  call `driver.submit({ kind:"url", url: U })` with `U = "https://canvas.example.edu/courses/1/assignments/2"` (accepted by `parseCanvasUrl`, canvas-url.ts:23); re-obtain driver; assert `driver.canvasUrl === U`.
- Direction: RED if `""` or a different URL.
- Negative companion [PURE], mandatory: a GitHub URL submission (`https://github.com/acme/repo`, `detectCanvasUrlKind` null) must leave `driver.canvasUrl === ""`. This makes the fix "pin the Canvas URL", not "retain any URL"; it is the discriminator for sabotage B.
- Frozen oracle: `canvasUrl` starts `""`; after the FIRST url submission whose `detectCanvasUrlKind(input.url)` is non-null it equals that `input.url` for the session; a GitHub/text/file submission never changes it. `input.url` is in hand in `submit` (useContinuousGradingRun.ts:223); `detectCanvasUrlKind` is a pure import.
- Sabotage A (RED->GREEN): delete the `canvasUrlRef` assignment -> `canvasUrl` stays `""` -> RED.
- Sabotage B (RED): "retain ANY url" (no `detectCanvasUrlKind` guard) -> the GitHub companion yields `canvasUrl === GH` -> RED.
- READ (FF-R7): the panel passing `canvasUrl={driver.canvasUrl}` (currently hardcoded `""` at `GradingChatPanel.tsx:175`) is a W2 source-text pin; the actual Canvas write is OWNER. The true end is FF-12 owner walk.
- F3=A refusal (argued, to architect): a SECOND different Canvas URL in the same session should be refused ("start a new session"); node-drivable (`driver.submit` returns `{kind:"refused"}`); pin the FACT (different Canvas URL does not silently change `canvasUrl` and is refused), not the wording.

## Oracle 2 - G2 / FF-2: cross-event duplicate display names disambiguated. [PURE]
- Object: the `student` label on each dispatched request body (`dispatchItemMock.mock.calls[i][0].entry.student`).
- Why that point: downstream row identity keys on `result.student` (gradingResultsHelpers.ts:287; React keys). Engine echoes `entry.student` into `result.student` (engine.ts:43,120; failure rows incrementalRunPlan.ts:210 - ARGUED, cited). Relabel `entry.student` BEFORE enqueue.
- Instrument [PURE]: two SEPARATE submit events, each a file-mock yielding one entry named `"Assignment 1"`. Assert `calls[0][0].entry.student === "Assignment 1"`, `calls[1][0].entry.student === "Assignment 1 (2)"`, `calls[0][0].sourceIndex === 0`, `calls[1][0].sourceIndex === 1`.
- Frozen oracle (NOT recomputed): the literal set `["Assignment 1", "Assignment 1 (2)"]`. Rule of `assignUnclaimedLabel` (utils.ts:433-440): first claimant keeps base; next taken gets `" (2)"`, then `" (3)"` (RULING 129). Do NOT import it to build the expectation.
- Direction: RED on any duplicate display, any first-claimant rename, or a label on the wrong `sourceIndex`.
- Sabotage A (RED->GREEN): no relabel -> both bodies `"Assignment 1"` -> RED.
- Sabotage B (RED): "blind counted suffix" that renames the FIRST claimant -> `calls[0]==="Assignment 1"` RED.

## Oracle 3 - G3 / FF-3: a new session never inherits a prior session's text. [PURE driver half + mechanism companion + READ/OWNER enforcement]
- READING claim per the scope (mechanism is the architect's). Label it READING.
- Driver half [PURE, W1]: if per-session-key mechanism chosen, the driver exposes a session discriminator (monotonic `sessionId`, surfaced in `runKey`) that DIFFERS across `reset()`. Capture `driver.runKey` before `reset()`, call `reset()`, re-obtain; assert non-empty before and `!==` after. RED if equal across reset.
- Mechanism companion [PURE; may belong in W2's grading-results test file]: `loadPersistedEdits` (gradingResultsHelpers.ts:619) both directions on frozen input - (a) `loadPersistedEdits(blobA, runB)` with same student names returns session A's `strengths` (hazard: mergeStoredRowEdit takes stored over seeded, :600-609); (b) `loadPersistedEdits(null, runB)` returns runB's model output. Frozen oracle: a run with `strengths:"MODEL OUTPUT"` and a stored blob with `strengths:"OLD SESSION"` same student; (a) yields `"OLD SESSION"`, (b) yields `"MODEL OUTPUT"`.
- READ/OWNER: actual clearing/scoping is W2 panel + localStorage (undefined under node-env; helpers guard `typeof window === "undefined"`, :642). Do NOT claim end-to-end clearing machine-verified. Honest limit: the W1 PURE half only proves the discriminator changes.

## Oracle 4 - G4 / FF-4: stable runKey so row state survives arrivals. [PURE for runKey; seven-state survival READ/OWNER]
- Object: `driver.runKey` across two sequential arrivals within one session, and across `reset()`.
- Instrument [PURE]: two text submissions (each `dispatchItemMock.mockResolvedValueOnce(gradedRow(...))`, `await flushMicrotasks()`), re-obtaining driver between. Assert `driver.runKey` non-empty, IDENTICAL after arrival 1 and 2. Then `reset()`, `beginSession` again; assert `driver.runKey !==` pre-reset value.
- Direction: RED if runKey changes within a session OR fails to change across sessions.
- Frozen oracle: `runKey = "grading-chat-" + sessionId`, `sessionId` monotonic, incremented only by `reset()`.
- Downstream link (ARGUED, cite - do not import): `runResetKey(runKey, run) = runKey ?? run` (gradingResultsHelpers.ts:735-737); stable `runKey` keeps identity constant so `GradingResults` does NOT reset its seven pieces (GradingResults.tsx:232-241).
- Sabotage A (RED->GREEN): `runKey: undefined` -> `runResetKey(undefined,run)=run`, new object per arrival -> within-session instability RED.
- Sabotage B (RED): constant `"grading-chat"` no sessionId -> across-reset change RED.
- READ/OWNER: the seven pieces (postStatus, postSummary, expandedBox, codeRuns, codeRunning, codeOutputStudent, browseFilesFor) are GradingResults internal state; their survival is READ/OWNER (FF-5, FF-12). The PURE oracle proves only runKey stability.

## Oracle 5 - G6 / FF-7: a failed row retried in place (no re-add, no G2 duplicate). [PURE]
- Object: `driver.results`, `driver.dispatchedCount`, the retried dispatch body, after `driver.retry(sourceIndex)`.
- Instrument [PURE]: `dispatchItemMock.mockRejectedValueOnce(new Error("boom"))` then resolves. Submit one Canvas-URL entry (pointsPossible 100); flush; assert precondition `results.length===1 && results[0].ungraded?.kind==="grading-failed"`. `retry(0)`; flush. Assert `results.length===1` (unchanged), `dispatchedCount===1` (retry reuses sourceIndex 0), `results[0].ungraded===undefined`. Capture `dispatchItemMock.mock.calls.length`, `retry(0)` again, flush, assert call count DID NOT increase (retry on graded row never dispatches).
- Retried-body fidelity (FROZEN, not self-comparison): retry body has `sourceIndex===0`, `rubric==="1. Correctness"` (session's header.effectiveRubric), `pointsPossible===100`.
- Direction: RED if results.length grows, dispatchedCount grows, rubric differs, or retry on a graded row dispatches.
- Implementation requirement (to architect): driver must RETAIN each sourceIndex's request body (`Map<number, GradeRunItemRequestBody>`) so retry re-dispatches the ORIGINAL body (current driver discards it after `queueRef.shift()`). `mergeArrivedResults` is LAST-WINS by sourceIndex (incrementalRunPlan.ts:176-182); `completedCount = arrivedRef.current.length` (:173) could double-count - LEFT OUT of the oracle as a RESIDUAL (W1-R2).
- Sabotage A (RED->GREEN): retry allocates a NEW sourceIndex + second row -> `results.length===2` RED.
- Sabotage B (RED): retry with blank rubric -> `rubric==="1. Correctness"` RED.

## Oracle 6 - G7 / FF-9 (+FF-1): driver EXPOSES effective rubric + provenance. [PURE for exposure; mount READ]
- Object: `driver.effectiveRubric`, `driver.rubricFingerprint`, `driver.generatedRubric`, `driver.run.rubricFingerprint`.
- New fixtures: `okHeader = { kind:"ok", effectiveRubric:"1. Correctness", generatedRubric: undefined, criteriaNames:[], rubricUsed:"1. Correctness", rubricFingerprint:"fp-123" }` and `genHeader = { ... effectiveRubric:"GENERATED RUBRIC", generatedRubric:"GENERATED RUBRIC", rubricUsed:"GENERATED RUBRIC", rubricFingerprint:"fp-gen" }`.
- Instrument [PURE]: after `beginSession`, assert `driver.effectiveRubric === "1. Correctness"` and `driver.rubricFingerprint === "fp-123"` (these top-level fields DO NOT EXIST today -> RED on current code). Submit one text entry; assert dispatched body `rubric === "1. Correctness"` and once a row lands `driver.run.rubricFingerprint === "fp-123"` (exposed == stamped). FF-1: with `genHeader` and a BLANK rubric box, assert `driver.effectiveRubric === "GENERATED RUBRIC"` and `driver.generatedRubric === "GENERATED RUBRIC"` (NOT `""`).
- Frozen oracle: exposed fields equal the resolved header's fields verbatim (run-header.ts:52-59). `"fp-123"`/`"fp-gen"` are frozen literals; do NOT call `stampRubricProvenance` to recompute.
- Direction: RED if any exposed field is undefined/empty, if the exposed fingerprint differs from `driver.run`/item bodies, or if FF-1's blank-box case exposes `""`.
- Sabotage A (RED->GREEN): no expose -> undefined -> RED.
- Sabotage B (RED): expose `rubricFingerprint:""` while exposing effectiveRubric -> the `==="fp-123"`/consistency assertion RED.
- Can't-fail test AVOIDED (checker I1): asserting ONLY `driver.run.rubricFingerprint === header.rubricFingerprint` is GREEN on today's defective driver (buildIncrementalRun passthrough, incrementalRunPlan.ts:273-274), so it is NOT the G7 discriminator. The discriminator is the TOP-LEVEL exposure.
- READ: mounting `RubricProvenance`/`GeneratedRubricCard` in the panel is W2 + OWNER.

---

## FF-11 (regression)
The seven files in scope section 2.9 stay green, NO existing assertion edited/deleted
(89 tests). New oracles are ADDITIVE to `useContinuousGradingRun.lifecycle.test.ts`. Do
not weaken the existing `reset()` test (lines 231-271); the new sessionId-increment must
not break its assertions that reset clears results/run/dispatchedCount.

## EXECUTABLE vs ARGUED vs READ/OWNER
- EXECUTABLE (PURE): canvasUrl retention + GitHub negative (O1 core); cross-event relabel
  (O2); session-discriminator-changes-across-reset (O3 driver half) + loadPersistedEdits
  both directions (O3 companion); runKey stable/changes (O4); retry in place (O5);
  top-level rubric+provenance exposure + FF-1 blank-box (O6).
- ARGUED (cited, not machine-verified): engine echoes entry.student (engine.ts:43,120);
  runResetKey keeps seven states (gradingResultsHelpers.ts:735-737); "fp-123" is
  stampRubricProvenance("1. Correctness").
- READ (W2 pin / owner walk): panel passes canvasUrl/runKey/edits-surface; panel mounts
  provenance; panel clears/scopes the edits key. OWNER (FF-12): live Canvas write, real
  Gemini rubric, reload restore, "Posted" badge surviving arrivals.

## RESIDUAL REGISTER (owner, instrument, step)
| Id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| W1-R1 | Second different Canvas URL refusal wording (F3=A) | loop-ac/architect | node-drivable fact (refused, canvasUrl unchanged); wording theirs | W2 AC; W1 pins the fact only |
| W1-R2 | completedCount semantics after retry (last-wins keeps rows=1 but arrivedRef double-counts, :173) | loop-architect | arrivedRef dedupe-by-sourceIndex vs leave-and-merge | W1 build decision; add completedCount===1-after-retry once decided |
| W1-R3 | G3 end-to-end clearing on real reload | owner | one browser reload after New session | FF-12 (FF-R1) |
| W1-R4 | Seven-state survival / "Posted" badge not reverting | owner | add 3 rows after posting row 1, watch badge | FF-12 / FF-5 |
| W1-R5 | O3 mechanism companion may belong in W2's grading-results test file | orchestrator | file placement vs no-cross-test-file-import | decide at W1/W2 split |
| W1-R6 | Live Canvas write via the Chat surface | owner | one real post to a test assignment | FF-12 (FF-R4) |

## ONE THING I COULD NOT DETERMINE
Whether `completedCount` must equal 1 after a retry (W1-R2) - depends on whether the
architect dedupes arrivedRef by sourceIndex; left OUT of the oracle rather than guess.
Flag for the architect, not for the implementer to guess.
