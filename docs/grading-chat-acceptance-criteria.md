# Acceptance criteria: the Grading chat surface

Seat: Acceptance criteria (`loop-ac`). This is the FIRST seat for this feature.
A fresh `loop-checker` reads this before any design wave consumes it. Mechanism,
seams, oracle construction and the wave plan are NOT here - they are the
architect's, the test seat's and the plan seat's, and some run concurrently.

## The owner's request, verbatim (the criteria are written from these words)

> "make a new sub tab inside the grading subtab, and really mimic the look and
> feel of an llm chat. I should be able to submit assignment instructions to one
> panel, rubric to another, and then continuously submit student submissions to
> another (this should accept text submissions, zip submissions, url
> submissions, other file submissions, etc) and have each student submission
> kick off another grading effort that results in a table row with scores
> according to rubric criteria, copyable comments (which are split up into what
> they did right, what they did wrong, etc)."

Every criterion below quotes or traces to a fragment of this sentence. Where the
sentence and a criterion diverge, the sentence wins.

## 0. What this is, and how it relates to what already ships

**This is an ADDITIONAL surface, not a fill of an existing one.** The Grading
sub-tab's inner navigation is the `GradingView` union in
`src/app/components/manual/manual-rail.ts:38`, whose members today are exactly
five - `run | repos | recording | snapshots | drafts` (measured by reading
`manual-rail.ts:38`). This feature adds a SIXTH member (the owner's "new sub tab
inside the grading subtab"), a genuinely distinct surface with its own
destination in the `Grading` group at `manual-rail.ts:113-123` and its own entry
in `INNER_NAV` at `manual-rail.ts:187-191`. It is NOT the A39 incremental fill of
the existing `run` ("Submissions") surface, which DECISION 17 kept a fill.

**Relationship to the existing `run` surface.** The `run` surface
(`GradingTab.tsx`) is a BATCH form: fill instructions + rubric, upload ONE zip or
paste ONE Canvas URL, submit once, receive one whole run and one table. The chat
surface is CONTINUOUS: instructions and rubric are set once and REMEMBERED, then
the instructor drops submissions one at a time and each one independently
produces a row. The two surfaces grade against the SAME `GradeResult` /
`GradingRun` shapes and the SAME per-item grading primitive (see the reuse list);
they differ only in ingestion cadence and layout. Criteria here must not
duplicate or contradict the `run` surface's behaviour - they add a cadence, not
a second grading engine.

**Lineage.** This surface is the concrete answer to two open owner rows, and the
criteria are calibrated against them:
- `docs/BACKLOG.md` A39 (line 157): OWNER REPORT 2026-09-23 that grading is
  faster in an LLM chat because the chat is "paste the rubric, paste the
  assignment description, then paste each submission" (2 + N pastes, no
  navigation). A39 owns the interaction census and the click-gap remedy.
- `docs/BACKLOG.md` A46 (line 158): CONCURRENT AND INCREMENTAL GRADING - "upload
  a submission, have it START GRADING while the next one is still being
  uploaded." A46 shipped a three-at-a-time pool in part 2026-09-27 at ceab414,
  gated OFF behind `INCREMENTAL_ROUTE_ENABLED = false`
  (`incrementalRunPlan.ts:104`) because the incremental route is a THINNER
  surface than whole-run (RULING 116). This feature is where that mechanism first
  reaches a live surface.

---

## 1. Leverage claim (one paragraph) and its removal-test criterion

**Claim.** The categorical advantage this surface earns over a chat is
CONCURRENCY (`docs/loop/leverage.md`, the CONCURRENCY row, and A46): a chat is
blocked on the human because the human IS the transport - it cannot begin grading
submission two while the instructor is still producing submission three. This
surface can, because each dropped submission independently kicks off its own
grading effort the instant it arrives, over the existing bounded pool
(`INCREMENTAL_CONCURRENCY = 3`, `incrementalRunPlan.ts:31`) and the existing
per-item Route Handler (`/api/grade-run-item`), rather than a single batch action
the instructor must trigger after assembling every submission. The feature earns
this by WIRING that mechanism into a continuous-submission surface for the first
time - the pool primitive exists (A46, ceab414) but is gated off and reachable
only from the batch `run` form today. Compounding it (named, not claimed as the
removal test): SCALE - one rubric and one criteria set held constant across N
students into one comparable table (`gradeStudentEntries` pins one
`rubric`/`criteria` pair, `engine.ts:205-208`); and the structured per-criterion
scores plus copyable strengths/improvements comments a chat's flat prose cannot
hand back at scale. What today's instructor does instead - the owner's own A39
loop, re-pasting into a chat and reading back flat prose - and what the
click-cost and felt-latency parts of that cost, are STRUCK classes with no
in-repo removal test (nothing renders under vitest, the network is blocked); they
are recorded as owner-walk residuals (R5, R6), not claimed here.

**AC-L (the ONE removal-test criterion; the test seat owns its construction).**
- Object under comparison: the sequence of grade-dispatch calls the surface's
  driver issues to the model seam, versus the sequence of submission events the
  instructor performs, for a run of N submissions (N greater than one).
- Instrument: the driver exercised with a MOCKED grade seam (the pattern
  `useIncrementalGradingRun.lifecycle.test.ts` already uses - a no-render
  `vi.mock` harness, network stays blocked), asserting the ORDER and COUNT of
  seam calls against submission events, never wall-clock timing.
- Direction of failure (RED on removal): the criterion is satisfied when
  submission k's grade dispatch is issued upon submission k's own arrival, before
  submission k+1 has been submitted - i.e. at least one grade call is in flight
  before the final submission is entered. It goes RED if the advantage is removed
  by batching (no grade seam call is issued until a separate "grade all" trigger,
  or until all N submissions have arrived). The exact deletion that must turn it
  red: replace per-submission dispatch with a single end-of-batch dispatch; the
  observed "first-call-before-last-submission" fact must then become false.
- This is TESTABLE HERE (mocked-seam driver test), not owner-walk. If the
  architect's chosen driver shape makes call ordering unobservable without a
  render, that is a finding to route back, not a reason to weaken the assertion.

Note for the checker: AC-L is a removal test, not "a thing a chat could not do".
A chat also cannot satisfy AC-L, but the assertion's observed value CHANGES under
the named batching deletion, which is the property `docs/loop/leverage.md`
requires and which "a database row was written" fails.

---

## 2. Acceptance criteria

Each criterion names its Object, its Instrument, and its Direction of failure, or
is marked OWNER-WALK (no in-repo instrument renders it). "TESTABLE HERE" means an
executable vitest instrument exists or is buildable without rendering a component
or calling a live model.

### Group A - the three input panels

**AC-1. Three distinct input regions: instructions, rubric, submissions.**
- Object: the surface exposes three separately-addressable inputs mapping to the
  owner's "assignment instructions to one panel, rubric to another, and then
  continuously submit student submissions to another".
- Instrument: OWNER-WALK for layout/"look and feel of an llm chat" (no render);
  the presence and wiring of the three inputs is a reading claim for the
  architect/UX seats. The DATA each panel feeds (instructions, rubric,
  submissions) is testable via the driver contract in Group B.
- Direction of failure: fewer than three independently-editable inputs, or a
  submissions input that is the same control as instructions/rubric.

**AC-2. Instructions and rubric feed the existing run-header path.**
- Object: the instructions and rubric the instructor sets on this surface are the
  `assignmentInstructions` and `rubric` consumed by the run header
  (`resolveRunHeader`, `run-header.ts:32`) and per-item grading
  (`/api/grade-run-item` body fields `assignmentInstructions`, `rubric`,
  `route.ts:107-110`).
- Instrument: TESTABLE HERE - the request/plan body carries the panel values
  unchanged (assert against the driver's built request bodies).
- Direction of failure: a submission graded against different instructions/rubric
  text than the panels hold, or against empty text when the panels are non-empty.

**AC-3. Blank instructions refuses; the exact existing wording is preserved.**
- Object: with the instructions panel blank, the surface refuses to grade and
  surfaces the existing refusal string "Please provide assignment instructions."
  (`run-header.ts:39`, `grading-incremental.ts:92`).
- Instrument: TESTABLE HERE against whichever prep path the architect wires (the
  refusal already exists on `resolveRunHeader` and `prepareGradingRunAction`).
- Direction of failure: a submission is dispatched for grading while
  instructions are blank, or a new/divergent refusal string is invented.

**AC-4. Blank-rubric behaviour is stated and consistent with the chosen path.**
- Object: what a blank rubric does. The existing paths DIVERGE by design and the
  criterion must not flatten that: `resolveRunHeader` synthesizes a rubric from
  instructions ONLY when `synthesizeRubricWhenBlank` is true (`run-header.ts:42-47`;
  the zip path passes true, the Canvas path false, `grading-incremental.ts:159-161`),
  and the gated incremental route today grades a blank rubric against NO rubric
  at all (RULING 116, `incrementalRunPlan.ts:90-99`).
- Instrument: OWNER-WALK for the product choice of which behaviour this surface
  takes (routed to architect + owner, see R2); TESTABLE HERE once chosen (assert
  the effective rubric handed to the seam matches the chosen rule).
- Direction of failure: a blank rubric silently grades against no rubric with no
  per-criterion scores while the UI implies criteria were applied; or the chosen
  rule is unstated so a later reader cannot tell synthesis from no-rubric.

### Group B - continuous submission

**AC-5. Each submission independently kicks off one grading effort.**
- Object: the owner's "each student submission kick off another grading effort".
  One submission event produces one dispatched grading effort, isolated from
  every other (one item's failure does not abort the run - reuse
  `classifyItemFailure`, `incrementalRunPlan.ts:198`).
- Instrument: TESTABLE HERE - driver test with a mocked seam asserts one seam
  call per submitted item and that a rejected item yields an ungraded
  ("grading-failed") row rather than throwing.
- Direction of failure: a submission produces zero grade calls, or two; or one
  item's failure removes or corrupts another item's row.

**AC-6. Submissions do not block one another (the non-blocking cadence).**
- Object: the owner's "continuously submit ... without" waiting - a new
  submission can be entered and dispatched while an earlier one is still grading.
- Instrument: TESTABLE HERE - driver test asserts a second submission's dispatch
  is not gated on the first submission's completion (subject to the pool bound
  `INCREMENTAL_CONCURRENCY = 3`, `incrementalRunPlan.ts:31`, which is a
  simultaneity ceiling, not a block).
- Direction of failure: entering submission two is disabled, ignored, or its
  grading is deferred until submission one's row has landed.

**AC-7. Each submission appends exactly one row per gradable student, and a row
never moves once placed.**
- Object: the owner's "results in a table row". Reuse the sourceIndex-keyed
  projection (`mergeArrivedResults`, `incrementalRunPlan.ts:172`; "a row never
  moves, it only appears", RULING 30). A text / single-file / URL submission is
  one student and appends one row; a zip submission of many students appends one
  row PER student it contains (this is the one input event that is not one row -
  see AC-9).
- Instrument: TESTABLE HERE - assert the projected `results` are ordered by a
  stable per-submission key and that an already-placed row's position and
  identity are unchanged by a later arrival.
- Direction of failure: rows reorder as results arrive; a score is attributed to
  the wrong student (the A44/A45 identity invariants must stay green - do not let
  this surface key on arrival order).

**AC-8. The submissions input accepts text, single files, and zips.**
- Object: the owner's "text submissions, zip submissions, ... other file
  submissions". Text maps to a `StudentSubmissionEntry` with `content` set
  (`route.ts:91` accepts `entry.content` directly); single files map via
  `buildSingleFileEntry` (`single-file-entry.ts:72`); zips map via
  `extractStudentEntries` (imported at `grading-incremental.ts:28`); "other file
  submissions" are classified by `classifyGradingUpload`
  (`single-file-entry.ts:36-45`: `zip | single | unsupported` by extension).
- Instrument: TESTABLE HERE for the classification and entry-building of text,
  single-file and zip inputs (these functions are pure/async and already tested);
  the wiring into this surface is a driver claim.
- Direction of failure: a text paste, a supported single file, or a zip is
  rejected or silently dropped; an `unsupported` extension is graded as empty
  rather than refused with a named reason.

**AC-9. A zip submission's per-student expansion is stated at the boundary.**
- Object: the boundary behaviour of a zip that contains many students - it must
  append one row per contained student (AC-7), and the collision refusal that
  already fires inside `extractStudentEntries` (A44, `decideCollisionRefusal`,
  surfaced as a "Refused: " message, `grading-incremental.ts:60,196-198`) must
  still fire on this surface, before any row is placed.
- Instrument: TESTABLE HERE - a zip whose parse would blend distinct students
  produces a refusal, not a blended row.
- Direction of failure: a zip appends a single blended row; or the collision
  refusal is swallowed and two students collapse into one row.

**AC-10. URL submissions: scope is stated, and the gap is named not assumed.**
- Object: the owner's "url submissions". MEASURED GAP: there is no
  single-arbitrary-URL ingestion primitive today. URL handling that exists is (a)
  a Canvas assignment/discussion URL, which is a WHOLE-CLASS ingest
  (`extractCanvasEntries`, `gradeCanvasUrl`, `engine.ts:446`), and (b) a GitHub
  repo URL folded into a Canvas submission's content by `canvasWorkToEntry`
  (`types.ts:434-445`). A "paste one arbitrary web URL as one student's
  submission" path does not exist in the tree.
- Instrument: OWNER-WALK / RELOCATE - which URL kinds this surface accepts, and
  whether an arbitrary-URL fetcher is built, is an architect + external-facts +
  owner decision (see R3). No criterion here asserts arbitrary-URL grading works,
  because no instrument can, and asserting it would be unsatisfiable.
- Direction of failure: the surface claims to accept "url submissions" generally
  while silently only handling Canvas/GitHub URLs, misleading the instructor; or
  an arbitrary URL is grabbed and sent to the model with no safe-fetch review
  (security/SSRF - routed to the security seat, not decided here).

**AC-11. The continuous-submission count has a defined bound and no silent
truncation.**
- Object: how many submissions a single continuous session may grade. MEASURED:
  the 40-cap `DEFAULT_MAX_SUBMISSIONS` (`gemini.ts:32`, read via
  `getGeminiMaxSubmissions`, `gemini.ts:129`) is applied ONLY inside
  `gradeStudentEntries` via `.slice(0, maxSubmissions)` (`engine.ts:204`). The
  per-item path grades one entry - `gradeEntries([entry], ...)` (`route.ts:173`)
  delegates to `gradeStudentEntries` (`engine.ts:430,438`), where
  `slice(0, 40)` over a one-element array is a no-op - so the 40-cap does NOT
  bound a continuous per-item session. This surface therefore has NO inherited
  total-count ceiling.
- Instrument: RELOCATE to architect + reliability (R4) to DECIDE the bound;
  TESTABLE HERE once decided (assert the surface's behaviour at the bound is the
  decided one - refuse, warn, or continue - not a silent drop).
- Direction of failure: the surface silently stops grading or drops submissions
  past some implicit limit while reporting the run complete; or it inherits the
  40-cap by accident and truncates a 41st submission with no message.

### Group C - the per-row output

**AC-12. Each row carries per-rubric-criterion scores.**
- Object: the owner's "scores according to rubric criteria". Reuse
  `rubricAreas: RubricAreaResult[]` (`types.ts:39-43,237`) columned by the run's
  `rubricAreaNames` (`types.ts:349`); the pinned criteria come from
  `resolveRunHeader.criteriaNames` (`run-header.ts:49`).
- Instrument: TESTABLE HERE - assert a graded row exposes one score per pinned
  criterion name, in a stable column order (reuse `canonicalColumns`,
  `incrementalRunPlan.ts:237`).
- Direction of failure: rows show a single total with no per-criterion breakdown;
  or columns differ per row so the table is not comparable across students.

**AC-13. Each row's comments are split into "did right" and "did wrong", and are
copyable.**
- Object: the owner's "copyable comments (which are split up into what they did
  right, what they did wrong, etc)". This MAPS ONTO the existing structure - do
  NOT invent a parallel one: `strengths` ("what they did well",
  `types.ts:225`), `improvements` ("what they could do better", `types.ts:231`),
  and `resubmitNotice` (`types.ts:236`), composed into `overallComment` by
  `composeOverallComment` (`types.ts:28-37`). The copyable rendering already
  exists in `RowFeedbackBoxes.tsx` (three independently-copyable boxes plus one
  "copy all", `RowFeedbackBoxes.tsx:85-157`).
- Instrument: TESTABLE HERE for the data mapping (a graded row exposes distinct
  `strengths` and `improvements`); OWNER-WALK for the "copyable" affordance
  actually copying (clipboard behaviour does not render under vitest).
- Direction of failure: strengths and improvements are merged into one blob; a
  fourth parallel comment structure is introduced; or the copy control copies the
  wrong box's text (the accessible-name-per-box guarantee, `RowFeedbackBoxes.tsx:119-127`,
  must be preserved when many rows are on screen - routed to accessibility).

**AC-14. The resubmission notice keeps its existing wording and condition.**
- Object: `resubmitNotice` is `RESUBMIT_NOTICE` verbatim (`types.ts:15-16`) when
  points were deducted and "" at full credit - the exact condition every existing
  producer uses (`engine.ts:116`, `pointsWereDeducted`).
- Instrument: TESTABLE HERE - assert the notice is present iff points were
  deducted and is byte-identical to `RESUBMIT_NOTICE`.
- Direction of failure: the notice is model-generated or reworded, or appears at
  full credit / is missing when points were lost.

### Group D - cross-cutting constraints (repo standards)

**AC-15. Every new input persists across reload under a `ta-` key.**
- Object: the owner's memory rule - "every new textbox/select/checkbox must
  persist across reloads (localStorage, ta- keys)". The instructions panel, the
  rubric panel, and any submission-type selector this surface adds each persist.
  Precedent: `GradingTab.tsx` already persists the source selector under
  `ta-grading-source` (`GradingTab.tsx:111,133`) and rubric memory under
  `ta-grading-rubric-memory` (`GradingTab.tsx:63`).
- Instrument: OWNER-WALK for the reload round-trip (no render); the presence of a
  named `ta-` key per control is a reading claim for the data/UX seats. The
  criterion is that each control NAMES its `ta-` key (an unnamed persisted claim
  is the defect the data seat checks for).
- Direction of failure: a panel's content is lost on reload; or "persisted" is
  claimed with no `ta-` key named.

**AC-16. The surface is professional, modern, minimal, reuses the app's visual
language, and contains no emojis.**
- Object: the UI/UX standard and the no-emoji rule (`AGENTS.md`), and the owner's
  "really mimic the look and feel of an llm chat".
- Instrument: OWNER-WALK for look-and-feel (no component renders here); the
  no-emoji rule is TESTABLE HERE (`src/lib/no-emojis.test.ts` scans `src` and
  `docs`, per `seats.md:34`).
- Direction of failure: an emoji reaches the codebase (caught by the emoji test);
  look-and-feel divergence is a reading/owner-walk finding, not a green-gate one.

**AC-17. Click cost is counted for first use and repeat use.**
- Object: the A39 remedy - a rubric/instructions set once must never be re-set
  per submission ("a rubric pasted once should never be pasted again", A39).
- Instrument: OWNER-WALK / RELOCATE to the UX seat, which counts clicks twice
  (first submission vs. the Kth submission with instructions/rubric already set).
  No vitest instrument counts clicks.
- Direction of failure: the repeat-submission click count includes re-entering
  instructions or rubric; or the count is asserted rather than walked.

---

## 3. Vetted reuse list (file:line, with a fit note per entry)

Every entry was opened. Fit notes say what it gives this feature and any caveat.

- `src/app/components/manual/manual-rail.ts:38` - `GradingView` union (5 members
  today). FIT: add the sixth member here; `GRADING_VIEW_PRESENCE`
  (`:40-47`), the `Grading` destinations group (`:113-123`), `INNER_NAV`
  (`:187-191`), `getActiveDestinationId` (`:238-240`) and
  `resolveStateFromDestinationId` (`:328-335`) all key off this union and must
  gain the member together (architect owns the enumeration).
- `src/lib/grade/types.ts:212-271` - `GradeResultBase` with `strengths`,
  `improvements`, `resubmitNotice`, `rubricAreas`, `totalScore`. FIT: the exact
  target of the owner's "did right / did wrong / scores"; do NOT invent a
  parallel shape (AC-12, AC-13).
- `src/lib/grade/types.ts:28-37` - `composeOverallComment`. FIT: the one composer
  every producer must use so `overallComment` never drifts from the three boxes.
- `src/lib/grade/types.ts:39-43` (`RubricAreaResult`) and `:349`
  (`GradingRun.rubricAreaNames`). FIT: per-criterion scores + column names (AC-12).
- `src/lib/grade/types.ts:15-16` - `RESUBMIT_NOTICE`. FIT: verbatim notice (AC-14).
- `src/app/components/grading-results/RowFeedbackBoxes.tsx:85-157` - three
  copyable feedback boxes + "copy all". FIT: the copyable-comment rendering the
  owner asks for already exists and already carries per-box, per-student
  accessible names (`:119-127`). Its `namePrefix` prop (`:59-72`) already lets
  ONE component serve a second surface - likely reusable here without a fork.
- `src/app/api/grade-run-item/route.ts:127` (POST), `:173`
  (`gradeEntries([entry], ...)`). FIT: THE per-submission grading primitive -
  one entry in, one `GradeResult` out. This is the owner's "each submission kicks
  off a grading effort". CAVEAT: guarded by `requireUser()` (`:133`), while the
  prep action uses `requireAppOwner()` (`grading-incremental.ts:80`) - a guard
  asymmetry for the security/operability seats to rule on, not decided here.
- `src/app/components/grading/useIncrementalGradingRun.ts:89` - the client pool
  driver (bounded concurrency over `/api/grade-run-item`, per-item `.catch`
  isolation, cancellation). FIT: the closest existing driver. CAVEAT: it is
  BATCH-shaped - `startReview` takes ONE `FormData`, calls
  `prepareGradingRunAction` once, then pools over a fixed ticket list
  (`:219-271`). A continuous "append one submission at a time" cadence is NOT its
  current shape. Whether to extend it or write a continuous driver is the
  architect's call (R1).
- `src/app/components/grading/incrementalRunPlan.ts` - pure plan/assembly leaf:
  `INCREMENTAL_CONCURRENCY = 3` (`:31`), `ITEM_REQUEST_BYTE_BUDGET` (`:42`),
  `mergeArrivedResults` (`:172`), `buildIncrementalRun` (`:260`),
  `classifyItemFailure` (`:198`), `canonicalColumns` (`:237`),
  `INCREMENTAL_ROUTE_ENABLED = false` (`:104`). FIT: row projection, column
  pinning, per-item failure rows, size budget - all reusable. CAVEAT: the
  `routeGradingRun` gate is off (RULING 116); this surface's relationship to that
  flag is a design question to FLAG, not decide (R1).
- `src/app/actions/grading-incremental.ts:79` - `prepareGradingRunAction`
  (blank-instructions refusal `:91-93`, `resolveRunHeader` `:159`, refusal
  routing `:196-198`, `mode: whole-run|refused|incremental`). FIT: per-run header
  resolution done once. CAVEAT: batch-shaped (one FormData -> tickets); a
  continuous surface may need per-submission ticketing (architect, R1).
- `src/lib/grade/run-header.ts:32` - `resolveRunHeader` (blank-instructions
  refusal `:38-40`, blank-rubric synthesis `:42-47`, `criteriaNames` `:49`). FIT:
  AC-2, AC-3, AC-4, AC-12 column source.
- `src/lib/grade/single-file-entry.ts:36` (`classifyGradingUpload`), `:72`
  (`buildSingleFileEntry`). FIT: text/single-file/other-file ingestion (AC-8).
  CAVEAT: `.docx`-as-zip hazard is handled by extension-only classification
  (`:36-45`); a `.docx` renamed to `.zip` is a still-open problem (RES-A39A-9),
  inherited, not solved here.
- `src/lib/grade/extraction.ts` (`extractStudentEntries`, `extractCanvasEntries`,
  imported at `grading-incremental.ts:28`). FIT: zip and Canvas-URL ingestion,
  and the A44 collision refusal fired inside `extractStudentEntries` (AC-9).
- `src/lib/gemini.ts:32` (`DEFAULT_MAX_SUBMISSIONS = 40`), `:129`
  (`getGeminiMaxSubmissions`), applied at `src/lib/grade/engine.ts:204`. FIT:
  the measured cap that does NOT bound the per-item path (AC-11).
  MEASUREMENT NOTE: the comment at `gemini.ts:57-59` still says "the default cap
  of 5 submissions" - that is STALE; the value at `:32` is 40. Do not cite the
  comment's 5.

DO-NOT-REUSE (named to prevent a wrong reuse the brief specifically flagged):
- `src/lib/grade/submission-kind.ts:29` - `GradingSubmissionKind` is
  `initial-post | reply | other | unknown`, a DISCUSSION-CONTRIBUTION
  classification (is a screenshot an original post or a reply), NOT the
  ingestion-format taxonomy the owner's "text/zip/url/other file" needs. There is
  NO single existing enum for the ingestion-format taxonomy. Do not press this
  union into that role (it would carry meanings the format taxonomy cannot
  produce). The format taxonomy, if one is wanted, is `classifyGradingUpload`'s
  `zip | single | unsupported` plus a text and a URL kind - an architect decision.

---

## 4. Testable here vs owner-walk-only

TESTABLE HERE (executable vitest, no render, no live model):
- AC-L (mocked-seam driver call ordering), AC-2, AC-3, AC-5, AC-6, AC-7, AC-8,
  AC-9, AC-12, AC-14, the no-emoji half of AC-16, and AC-4/AC-11 once their
  product decision lands.

OWNER-WALK ONLY (no in-repo instrument; needs a live browser and/or a live
model - this checkout renders no component under vitest, blocks the network, has
no key):
- The "look and feel of an llm chat", panel layout and focus/keyboard behaviour
  (AC-1 layout, AC-16 look-and-feel).
- The clipboard actually copying (AC-13 copy affordance; the DATA mapping is
  testable).
- `ta-` key reload round-trip (AC-15; the named-key requirement is a reading
  claim).
- Click counts (AC-17; relocated to the UX seat's counted walk).
- That a real model returns distinct strengths vs improvements for a real
  submission (the SHAPE is testable; the model's behaviour is owner-walk).

---

## 5. Residual register (owner, instrument, step)

Each residual has an owner, an instrument, and the step that will measure it. Per
`iteration-caps.md:36-37` a residual missing any of the three is a deletion.
These must be filed into `docs/BACKLOG.md` by the orchestrator (this seat must
not edit the backlog; another agent holds it this window). Where sensible, attach
to the existing A39/A46 rows rather than opening new ones.

- **R1 - driver shape (reuse the batch pool vs. a continuous driver).** Owner:
  architect (wave 1) + plan seat. Instrument: the seam-call driver test behind
  AC-L and AC-6 exercises whichever driver is chosen. Step: architecture pass;
  the criteria ship as-is regardless of which driver is chosen. Relates to A46
  and `INCREMENTAL_ROUTE_ENABLED` (RULING 116).
- **R2 - blank-rubric behaviour choice for this surface** (synthesize from
  instructions, or grade with no rubric, or refuse). Owner: architect proposes,
  the human decides (product call). Instrument: once decided, AC-4's assertion on
  the effective rubric handed to the seam. Step: architecture pass + owner
  confirmation; not a gate.
- **R3 - "url submissions" scope.** Owner: architect + external-facts research +
  the human. Instrument: AC-10's direction-of-failure (no misleading "accepts
  URLs" claim) plus a security review of any fetcher. Step: architecture pass. If
  no safe arbitrary-URL fetcher exists, this becomes an owner scope call (accept
  Canvas/GitHub-only URLs, or build a reviewed fetcher). MEASURED: no
  arbitrary-single-URL ingestion primitive exists today.
- **R4 - continuous-submission total-count bound.** Owner: architect +
  reliability seat. Instrument: AC-11 once the bound is decided; the 40-cap is
  measured NOT to bound the per-item path (`engine.ts:204` vs `route.ts:173`).
  Step: reliability pass (also owns the platform `maxDuration` / rate-limit
  ceiling the A46 row flags, and the `INCREMENTAL_CONCURRENCY = 3` interaction).
- **R5 - click-cost advantage (A39).** Owner: A39 row + UX seat. Instrument: the
  UX seat's counted interaction census (first vs. repeat submission); STRUCK
  class, no vitest instrument. Step: UX wave 3. This is where "remembering the
  rubric" is proven to save clicks.
- **R6 - felt latency / incremental DISPLAY advantage.** Owner: A46 row. LIMIT:
  no removal test is buildable here for what the instructor SEES during a run
  (nothing renders under vitest, no wall-clock, no key). Instrument: owner
  browser walk. Step: owner verification. Recorded, not claimed as AC-L.
- **R7 - guard asymmetry on the reused paths.** Owner: security + operability
  seats. Instrument: read `route.ts:133` (`requireUser`) vs
  `grading-incremental.ts:80` (`requireAppOwner`). Step: wave 2. Named here
  because this surface inherits both; the decision is not this seat's.

---

## 6. What I could not determine, and gaps named plainly

- **The ingestion-format taxonomy does not exist as one type.** The owner's
  "text/zip/url/other file" is served today by four separate paths
  (`content` direct, `buildSingleFileEntry`, `extractStudentEntries`,
  `extractCanvasEntries`), not one enum. `GradingSubmissionKind` is unrelated
  (discussion post/reply). Whether to introduce a unifying format taxonomy is an
  architect decision (do-not-reuse note in section 3).
- **Arbitrary-URL grading has no primitive.** I could not find any code that
  fetches an arbitrary pasted web URL as one student's submission; only Canvas
  and GitHub-repo URLs are handled, and only inside class-level / Canvas-work
  paths. Stated as AC-10 + R3, not assumed away.
- **The continuous cadence has no existing driver.** The pool driver is
  batch-shaped (one FormData -> fixed ticket list). I did not design the
  continuous driver (mechanism is the architect's lane); I recorded the reuse
  caveat and R1.
- **No component renders here**, so every layout / focus / clipboard / reload /
  click criterion is a reading claim or an owner-walk item - marked as such
  throughout, never dressed as a green-gate assertion.

## 7. Notes for the checker

- This is a NEW artifact for this feature; there is no prior criteria version, so
  no disposition table is owed (`iteration-caps.md:151-155`).
- The leverage claim rests the removal test on CONCURRENCY (AC-L), names SCALE
  and the structured/copyable output as compounding earned mechanisms, and
  STRIKES click-cost (R5) and latency/display (R6) as classes with no in-repo
  removal test - per `docs/loop/leverage.md`'s honest-limit rule, not silence.
- No mechanism, no seam signatures, no oracle construction, no wave plan appear
  here by design; R1-R7 route those to the seats that own them.
