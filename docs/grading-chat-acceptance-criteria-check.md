# Adversarial check: grading-chat acceptance criteria

Fresh checker over `docs/grading-chat-acceptance-criteria.md`, run before any
design wave consumes it. Default-to-defective. I did not author it.

## Verdict

SOUND ENOUGH FOR THE DESIGN WAVES TO CONSUME. No blockers. Three residual
findings (scope trim, one unit ambiguity, one adjacent citation), none of which
would make the architect build against something imaginary - because every
load-bearing citation was opened and resolved.

Counts by severity: BLOCKER 0, RESIDUAL 3, run-and-empty attacks 4.

## Citation verification (the crux attack)

Every reuse citation below was opened at its stated line. All resolve and the
symbol does what the criteria claim. (Reads via the Read tool, this tree, HEAD.)

- `types.ts:15-16` RESUBMIT_NOTICE - CORRECT (const, verbatim string).
- `types.ts:28-37` composeOverallComment - CORRECT (strengths, improvements,
  resubmitNotice, empty-part-dropping join).
- `types.ts:39-43` RubricAreaResult - CORRECT. `:225` strengths, `:231`
  improvements - CORRECT ("what they did well" / "what they could do better",
  both required non-optional). `:237` rubricAreas, `:349`
  GradingRun.rubricAreaNames - CORRECT.
- `types.ts:434-445` canvasWorkToEntry GitHub-URL fold into content - CORRECT
  (submissionUrl at :434-436, GitHub fold at :437-445).
- `RowFeedbackBoxes.tsx:85-157` - CORRECT. Three independently-copyable boxes +
  copy-all; `namePrefix` prop (:59-72) lets one component serve a second
  surface; per-box per-student accessible names at :119-127. The owner's
  "copyable comments split into did-right / did-wrong" rests on this and it
  holds.
- `grade-run-item/route.ts:127` POST, `:173` gradeEntries([entry], ...), `:133`
  requireUser, `:91` entry.content accepted directly, `:107-110`
  assignmentInstructions/rubric body fields - ALL CORRECT. One submission maps
  to one gradeEntries call over a one-element array.
- `engine.ts:204` `.slice(0, maxSubmissions)` - CORRECT. `:116`
  pointsWereDeducted -> RESUBMIT_NOTICE - CORRECT. `:430/:438` gradeEntries
  delegating to gradeStudentEntries - CORRECT. The AC's `:204` supersedes the
  brief's (and leverage.md's / seats.md's) stale `:126`; I confirmed the slice
  is at `:204`, not `:126`. The AC got this right and named its command.
- `gemini.ts:32` DEFAULT_MAX_SUBMISSIONS = 40 - CORRECT. `:129`
  getGeminiMaxSubmissions - CORRECT.
- `run-header.ts:32` resolveRunHeader, `:38-40` blank-instructions refusal,
  `:42-47` synthesizeRubricWhenBlank branch, `:49` criteriaNames - ALL CORRECT.
- `incrementalRunPlan.ts:31` INCREMENTAL_CONCURRENCY = 3, `:104`
  INCREMENTAL_ROUTE_ENABLED = false, `:172` mergeArrivedResults (sourceIndex Map,
  sorted ascending at :179-181, last-wins on duplicate key at :169), `:198`
  classifyItemFailure, `:237` canonicalColumns - ALL CORRECT.
- `grading-incremental.ts:80` requireAppOwner, `:91-93` blank-instructions
  refusal, `:159-161` synthesizeRubricWhenBlank: !canvasUrl - ALL CORRECT.
- `manual-rail.ts:38` GradingView = run | repos | recording | snapshots |
  drafts - CORRECT, exactly five members; the sixth is genuinely new.
- `single-file-entry.ts:36` classifyGradingUpload (zip|single|unsupported),
  `:72` buildSingleFileEntry - CORRECT.
- `useIncrementalGradingRun.ts:89` - CORRECT and batch-shaped (run lock,
  arrivedRef, startReview over one FormData). The caveat is accurate.
- BACKLOG A39 at line 157, A46 at line 158 - CORRECT.

More than half of all cited lines opened; all correct. The reuse spine the
architect will build against is trustworthy.

## The four named gaps - all REAL

1. **No ingestion-format taxonomy enum.** `GradingSubmissionKind`
   (`submission-kind.ts:29`) is `initial-post | reply | other | unknown`, a
   discussion-contribution classification - confirmed by reading the type and
   its comment. The closest format taxonomy is `classifyGradingUpload`'s
   `zip | single | unsupported`, which has no text or URL member. The AC's
   do-not-reuse note is correct: pressing GradingSubmissionKind into the format
   role would carry meanings it cannot produce. REAL.

2. **Arbitrary-URL submissions have no primitive.** Only a Canvas whole-class
   ingest and a GitHub-repo fold (into a Canvas submission's content) exist. No
   "paste one arbitrary web URL as one student" path is in the tree. The AC does
   NOT claim arbitrary-URL grading works; AC-10 states the gap and routes it to
   R3 with a security note. This is the honest disposal - a criterion asserting
   arbitrary-URL grading would be unsatisfiable, and the AC refuses to write one.
   REAL and routed correctly.

3. **The 40-cap does not bound the per-item path.** `.slice(0, 40)` runs inside
   gradeStudentEntries (`engine.ts:204`); the per-item route calls
   `gradeEntries([entry])` (`route.ts:173`), a one-element array, so the slice is
   a no-op. A continuous per-item session inherits no total ceiling. VERIFIED by
   reading both sites. REAL - and AC-11 routes the bound to R4 rather than
   asserting one.

4. **useIncrementalGradingRun is batch-shaped.** startReview takes one FormData
   and pools over a fixed ticket list; a continuous "append one at a time"
   cadence is not its current shape. VERIFIED. The reuse-vs-new-driver fork (R1)
   is the single biggest architecture decision and the AC correctly leaves it to
   the architect rather than deciding it.

## The leverage claim and AC-L

Run-and-substantial, and it survives. The claim rests on CONCURRENCY
(`leverage.md`, the CONCURRENCY row: "work BEGINS on one input while the human
is still producing the next, because the human is not the transport").

- **Not a double-count of A46.** A46 (BACKLOG line 158) owns concurrency, and its
  own discharge instrument is "emitted-per-completion count greater than one for
  N greater than one" - that is incremental DISPLAY over a batch the human has
  already fully produced. The grading-chat AC-L instrument is different:
  "at least one grade call is in flight before the final submission is entered."
  That captures dispatch-on-arrival across the human's production time, which is
  the literal leverage.md definition and which A46's batch pool cannot deliver.
  The AC hands incremental-display back to A46 explicitly (R6) and keeps only the
  continuous-dispatch layer for itself. The separation is clean.
- **It discriminates.** The named removal edit ("replace per-submission dispatch
  with a single end-of-batch dispatch") turns the observed
  "first-call-before-last-submission" fact false, leaving A46's pool intact. That
  is the marginal advantage this feature builds, and the assertion's value
  changes under exactly that deletion - the leverage.md removal-test procedure is
  satisfied. It is not the trivial "a chat could not do it" test; a database-row
  assertion would not change under this edit.
- **Testable here.** Mocked-seam call-ordering on the no-render lifecycle harness
  (the useIncrementalGradingRun.lifecycle.test.ts pattern), network stays
  blocked. The AC concedes that if the architect's driver shape makes ordering
  unobservable without a render, that is a route-back finding, not a weakened
  assertion. Honest.

## Owner-walk honesty

Every look/feel/focus/keyboard/clipboard/reload/click criterion is marked
OWNER-WALK: AC-1 (layout), AC-13 (copy affordance), AC-15 (reload round-trip),
AC-16 (look-and-feel), AC-17 (click counts). None is dressed as testable.

And the enforceable criteria underneath are NOT trivial: AC-2 (panel values
reach the seam unchanged), AC-3 (exact refusal string), AC-5 (one dispatch per
item, isolated failure), AC-6 (non-blocking cadence), AC-7 (stable-keyed row
projection), AC-8 (classification), AC-9 (collision refusal before any row),
AC-12 (per-criterion scores), AC-14 (resubmit notice iff deducted, byte-exact),
AC-L (concurrency ordering). The data flow, row projection and concurrency are
all substantive and testable. The "everything that matters is owner-walk"
warning does NOT apply here.

## Numeric bounds against the tree

Checked, not asserted: DEFAULT_MAX_SUBMISSIONS = 40 (`gemini.ts:32`, read
directly), the slice at `engine.ts:204` (read directly), INCREMENTAL_CONCURRENCY
= 3 (`incrementalRunPlan.ts:31`, read directly). The AC also correctly resolved
the `:126` vs `:204` discrepancy the brief flagged: the slice is at `:204`. No
knob-collision is asserted; the one relevant interaction (40-cap does not bound
per-item) is measured on both sides.

## Stale comment (attack 7)

CONFIRMED PRESENT. `gemini.ts:57-59` reads "at the default cap of 5 submissions
per run (DEFAULT_MAX_SUBMISSIONS)" while `:32` sets 40. The AC's measurement
note is accurate and correctly says "do not cite the comment's 5." Not part of
this feature to fix; flagged so no downstream seat inherits the 5.

## Findings

### RESIDUAL 1 - seat-scope-bleed (NEW)

Section 3 ("Vetted reuse list ... with a fit note per entry") plus the
DO-NOT-REUSE list is the architect's named deliverable (`seats.md:155`:
"Produces: a vetted reuse list (symbol, file:line ...); an explicit do-not-reuse
list"). The architect runs in wave 1, concurrently. Two documents over the same
ground reaching different counts for the same set is the exact symptom
`seats.md:139-140` warns about. Some citation in the criteria is legitimate
(AC-2/AC-12/AC-13 must point at the shapes to say "reuse, do not fork"); a
standalone survey with per-file enumeration guidance ("add the sixth member
here ... architect owns the enumeration", section 3 manual-rail entry) is
architect territory restated here. It is NOT a correctness blocker - I verified
every citation - but the orchestrator should have the architect own the reuse
list and trim section 3 to the citations the criteria need, so the two documents
cannot diverge. Corrective rule: move the reuse survey to its owning seat.

### RESIDUAL 2 - ambiguous-unit (NEW)

AC-5 mixes "submission event", "item" and "student" ("each student submission
kick off another grading effort. One submission event produces one dispatched
grading effort" then instrument "one seam call per submitted item"). A zip is
ONE event but many students / many entries / many rows (AC-7, AC-9). Read in
isolation, AC-5's "one seam call per submission" could be implemented as one
call per zip event - blending every student in the zip into one graded row,
which is the AC-9 failure. AC-7 and AC-9 resolve the intent, but AC-5 is not
self-contained. This is the weakest single criterion: most likely to be built
exactly as its own instrument states and still produce a bad result. Corrective
rule: state the grading unit as the post-extraction entry, not the input event,
in AC-5 itself.

### RESIDUAL 3 - citation-locates-adjacent-symbol (NEW, trivial)

AC-9 attributes the collision refusal to "decideCollisionRefusal ... surfaced as
a 'Refused: ' message, `grading-incremental.ts:60`". `grading-incremental.ts:60`
is only `REFUSAL_MESSAGE_PREFIX = "Refused: "`, a routing string; the refusal is
emitted in collisionRefusal.ts (per A46's row, `:128`) inside extractStudentEntries.
The criterion's substance (a blending zip produces a refusal before any row) is
correct; only the symbol-to-line mapping is loose. Corrective rule: cite the
emitter, not the adjacent prefix. Trivial; not load-bearing.

## Forks: owner ruling vs architect decision

- **R2 blank-rubric behaviour** - genuine OWNER ruling. synthesize-from-
  instructions vs grade-with-no-rubric vs refuse is a product call; the existing
  paths deliberately diverge (`run-header.ts:42-47` vs the gated route). The AC
  routes it right (architect proposes, human decides).
- **R3 URL scope** - genuine OWNER ruling (with external-facts + security
  input). Accept Canvas/GitHub-only, or fund a reviewed arbitrary-URL fetcher,
  is a scope-and-safety call no agent should default. Routed right.
- **R1 driver shape** - ARCHITECT decision, no owner needed. The cadence
  (continuous) is fixed by the owner's request; R1 is only extend-vs-rewrite.
- **R4 total-count bound** - ARCHITECT + reliability decision. An engineering
  bound against maxDuration and INCREMENTAL_CONCURRENCY, not a product fork,
  though the owner may want the chosen number surfaced.

## Run-and-empty attacks

- Feature-already-exists: EMPTY. The strongest version is A46's gated three-at-a-
  time pool, which is batch-shaped and reachable only from the run form
  (INCREMENTAL_ROUTE_ENABLED = false). No continuous chat surface exists; the AC
  frames this correctly in section 0. Not a reframe.
- Silent-green failure: EMPTY as a defect of the AC. The AC itself flags the
  no-render ceiling throughout, and docs:gate runs test:paths (not a raw
  multi-path vitest), so the multi-path-drop trap does not apply to its own gate.
- Orchestrator rulings: none are under this artifact yet (this is the first seat;
  no disposition table owed, `iteration-caps.md:151-155`). EMPTY.
- Internal contradiction (AC-L/AC-6 require continuous dispatch while R1 frames
  driver as open): EMPTY on inspection - R1 is extend-vs-rewrite of a driver that
  is continuous either way; the cadence is not what R1 leaves open.

## Stopping point

NOTHING remains for correctness. What is left is design (R1 driver shape, R4
bound - architect/reliability) and owner rulings (R2 blank rubric, R3 URL
scope), all of which the AC already routes with owner, instrument and step. The
three residuals above are advisory scope/clarity trims, not gates. The criteria
ship as they stand.
