# A8 scope + recon - the reply-section SCORING round

Scope and recon only. No production code and no test code was written or changed
to produce this document. Consumer: a `loop-plan`/`loop-architect`/`loop-ac`
chain for the remaining A8 build. A fresh `loop-checker` gates this before any
consumer acts on it. Every quantity below names the command that produced it;
every `file:line` was opened in this session.

> THIS DOCUMENT REPLACES a prior `docs/a8-scope.md` that scoped the
> RECOGNITION-ONLY remainder of A8, which has since SHIPPED (section 1). The
> prior content is preserved in git (`git show HEAD:docs/a8-scope.md` before this
> commit) and every one of its requirements is accounted for in the disposition
> table (section 7) - nothing is silently dropped. The reframe is forced by the
> tree: the thing the old scope scoped is done, so a document that still scoped
> it would mislead the next reader into redoing shipped work. The companion
> design docs `docs/a8-architecture.md`, `docs/a8-waves.md`, `docs/a8-test-notes.md`
> describe that SAME shipped recognition round and are NOT rewritten here; this
> document cites them where their section 9 / "designed not built" content is the
> starting point for the remaining round.

## 0. The headline: what already exists vs what A8 still needs

A8's owner intent, verbatim from the row (`docs/BACKLOG.md:168`): "REPLIES ARE
GRADED SEPARATELY, AGAINST DIFFERENT CRITERIA. Not excluded, not merely
labelled." That is the whole bug and it is only PARTLY delivered.

**ALREADY SHIPPED (measured, section 1):**

- **Recognition on the screen-capture surface (A8-R, routes b+e).** Shipped
  2026-09-20..22 (`58a4254`, `d5a3e2c`, `db747cc`, `75bd7d4`, `ad3dd61`). An
  unconfirmed contribution no longer reads "Submission"; the submission-kind
  union, its transport, and the neutral/hedged default landed.
- **Recognition on the Canvas-API Gemini path (Route A).** Shipped 2026-09-29 in
  two waves: Wave 1 `d82d18ae` (`DiscussionPost.parentName`, shape-only
  `CanvasStudentWork.initialPostCount`/`replyCount`), Wave 2 `20e8af54`
  (`canvasWorkToEntry` builds a labelled entry from `work.discussion`: a
  front-loaded manifest plus `=== INITIAL POST ===` / `=== REPLIES TO
  CLASSMATES ===` sections, early-return so the flat `work.text` branch does not
  double-emit). Regression entry 444 (`docs/REGRESSION.md:45900`, `95a52756`).
  Opus verify: SHIP.

So TODAY the grading model is TOLD which contribution is a reply and which is an
initial post. That closes the "merely labelled / misread as a second post" half.

**WHAT IS STILL NOT BUILT - and it is the owner's actual decision, not a
nice-to-have:**

The model is told the distinction, but every rubric is still a single flat list
of criteria, so a reply is still SCORED against the initial-post criteria. The
owner decided replies must be scored SEPARATELY against DIFFERENT criteria, via
a specific surface (section 2). None of the SCORING machinery exists:

- `grep -rn "axis\|replySection\|reply.section" src/lib/grade` (2026-10-05)
  returns only the recognition content labels in `src/lib/grade/extraction.ts:349-356`
  (`=== REPLIES TO CLASSMATES ===`). There is NO axis/section concept in the
  rubric parser, the prompt builder, the engine, or the score types.
- `RubricCriterion` (`src/lib/grade/types.ts:458-462`) is `{ name: string;
  points: number | null }` - no axis tag.
- `extractRubricCriteria(rubric: string): RubricCriterion[]`
  (`src/lib/grade/rubric.ts:27`) parses a flat list; no section marker.
- `grep -n "reply" src/lib/grade/engine.ts` returns nothing - the engine has no
  reply-aware scoring branch.
- No authoring surface lets an instructor MARK a reply section (section 4.1).

This remaining work is the reply-section SCORING round. It is a genuine,
substantial build, NOT a redundant re-scope of shipped work. It is also
deliberately deferred by an orchestrator ruling that this document does not
re-open (RULING A, in the row): exclusion/scoring ships only once a rubric can
carry a reply section AND the model-facing instructions are narrowed in the same
change - because exclusion alone, with the assignment still demanding replies,
would make the model deduct for work it can no longer see (`prompts.ts:83-90`
semantics), which is strictly worse than the defect.

**RECOMMENDATION:** do not close A8 and do not narrow it to recognition. Scope
and build the reply-section scoring round described below. Routes C and D stay
owner-only residuals (section 8). This document is that scope.

## 1. Measured state of the tree

Commands run 2026-10-05 from the repo root unless noted.

### 1.1 Recognition shipped on Route A (the Gemini/Canvas-API path)

- `grep -rln "buildDiscussionEntry" src` -> `src/lib/grade/extraction.ts` only
  (real tree; `.claude/worktrees/friendly-meninsky-8032bc/` exists but the grep
  over `src` is the main checkout). `canvasWorkToEntry` early-returns on
  `work.discussion` (`extraction.ts:372-389`, opened), building `content` from
  `buildDiscussionEntry` (`:304-364`): manifest first, then the two labelled
  sections, one `SubmittedFileInfo` per contribution with `extension: "(none)"`
  and dot-free names.
- `src/lib/canvas/discussions.ts`: `DiscussionPost.parentName?` (`:17-19`),
  resolved in `extractDiscussionActivity` (`:70`); `CanvasStudentWork`
  `initialPostCount?`/`replyCount?` (`:118-124`) set in `fetchDiscussion`
  (`:163-164`). Both carry a comment "shape-only; no runtime reader - see
  docs/a8-architecture.md section 5".
- `fetchDiscussion` STILL builds the flat `text` by concatenating
  `[...initialPosts, ...replies]` (`discussions.ts:153-156`) - correctly: that
  flat `text` is a fallback for non-discussion consumers; the fix is that
  `canvasWorkToEntry` now reads `work.discussion` FIRST and never reaches the
  flat text for a discussion.

### 1.2 Recognition shipped on the screen-capture surface

`src/lib/grade/submission-kind.ts` exists; `git show --stat ad3dd61` (per the
row) mapped `unknown` to "Not identified" and a hedged prompt header. Not
re-audited line by line here (it is shipped and verified); confirmed present via
the row's citations and the commits existing in `git log`.

### 1.3 The flat rubric parser and the score carrier (the remaining round's seams)

- `extractRubricCriteria(rubric)` (`rubric.ts:27`) -> flat `RubricCriterion[]`,
  fed to `buildSystemPrompt(assignmentInstructions, rubric, criteria, ...)` and
  pinned once per batch at `src/lib/grade/engine.ts:232-235` (opened). This is
  the single choke where axis-tagging would plug in.
- The score-to-Canvas carrier ALREADY holds N named scores (Fork B, section 2.2):
  `postCanvasGrades` (`src/lib/canvas/grades.ts:128-140`, opened) sets one
  `submission[posted_grade]` (`:130`) plus, per matched `rubricArea`, a separate
  `rubric_assessment[<criterionId>][points]`/`[comments]` (`:134-140`).
  `deriveTotalScore` (`src/lib/grade/parsing.ts:208-213`, opened) trusts an
  explicit model total when present, else sums `rubricAreas`.

### 1.4 Sizes (both mandated instruments; they AGREE on every file, 2026-10-05)

`@(Get-Content <path>).Count` (PowerShell) and `wc -l <path>` (Git Bash):

| File | Get-Content | wc -l | Role in remaining round |
|---|---|---|---|
| `src/lib/grade/rubric.ts` | 420 | 420 | axis parsing (section 4.2) |
| `src/lib/grade/engine.ts` | 499 | 499 | per-axis scoring + exclusion (4.3) |
| `src/lib/grade/prompts.ts` | 415 | 415 | narrowed instructions + axis labels (4.3) |
| `src/lib/grade/types.ts` | 462 | 462 | `RubricCriterion.axis?` (4.2) |
| `src/app/actions/grading.ts` | 977 | 977 | NOT expected to change (R6) |
| `src/app/components/grading-recording/RubricInputModal.tsx` | 389 | 389 | authoring surface (4.1) |
| `src/lib/grade/extraction.ts` | 527 | 527 | shipped; exclusion may touch (4.3) |
| `src/lib/canvas/discussions.ts` | 170 | 170 | shipped; no change expected |

`LIMIT = 1000` at `src/file-size-ceiling.structure.test.ts:41`
(`Select-String`, 2026-10-05); no `ALLOWED_OVERAGE` entry matched for any file
above. All have > 420 lines of headroom; none is near the ceiling. NOTE the
drift from the prior docs: `rubric.ts` was 443 on 2026-09-29 and is 420 today,
`extraction.ts` was 372 and is 527 (the shipped Wave 2), `discussions.ts` 158 ->
170 (shipped Wave 1). Re-measure at build time; do not trust the prior docs'
line pins.

## 2. The surface-deciding fork - ALREADY OWNER-DECIDED (do not re-open)

The task brief asks for a recommendation on how the rubric gains a second axis
and flags it "do not default it - it decides the whole surface". Measured against
the row, this fork is NOT open: the owner answered it.

**Fork A (how the rubric gains a second axis).** `docs/BACKLOG.md:168`, verbatim:
"SECOND OWNER DECISION 2026-09-15, closing implication (1), the one the scoping
pass was told not to default: ONE RUBRIC WITH A REPLY SECTION ... Not two
instructor-supplied rubrics, and not an app-side split of a single rubric by
convention."

So the decided reading is **(b) one rubric with a dedicated reply section the
instructor authors.** I am NOT re-litigating it. The task brief's three options
map to the row's wording: (a) two rubrics = rejected; (b) one rubric with a reply
section = CHOSEN; (c) app-side convention split = rejected.

This recon scopes on (b). If I were asked to recommend from scratch, (b) is also
what I would recommend, and the reasoning is worth recording because it is why
the decision holds:

- Least instructor friction: one rubric field already exists
  (`RubricInputModal.tsx`); (a) would need a whole second authoring surface and a
  second parse/stamp/provenance path.
- Reuse: `extractRubricCriteria` already parses one rubric string; (b) adds a
  marker line inside it, (a) duplicates the entire pipeline.
- How rubrics are actually written: most discussion rubrics are a single
  document with an "initial post" group and a "replies" group - (b) matches the
  authored artifact; (c) forces the app to GUESS the grouping, which the owner
  explicitly rejected ("the app never has to guess").

**The ONE owner-facing item that rides alongside (SHAPE-5), as a CONFIRMATION,
not a gate:** the decision was made 2026-09-15; it has not been exercised because
nothing built it. Before the authoring surface is built, confirm the decision
still holds. If the owner has since changed to (a) or (c), the switch cost is:
(a) a second authoring field + a second `extractRubricCriteria` call + two
`rubricAreas` provenance stamps + the plan's Wave structure roughly doubles; (c)
drops the authoring surface entirely but moves all risk into a heuristic that
splits a flat rubric, which is the guess the owner rejected and which has no
code-held guarantee. This confirmation is startable work for the orchestrator to
put to the owner WHILE the architect designs on (b); it does not block the
design, because (b) is the decision of record.

**Fork B (is the score still one number).** Recommended reading, grounded in
1.3: reuse the existing multi-component carrier. A reply-section criterion is
simply one more `RubricAreaResult` whose `area` name matches the Canvas rubric's
reply criterion; `postCanvasGrades` already posts it as its own
`rubric_assessment[...]` entry (`grades.ts:134-140`). No new combination
mechanism is needed for the per-criterion half. The only real open question -
whether a model-supplied aggregate that ignores the reply component should be
OVERRIDDEN by the code-derived sum (`deriveTotalScore`, `parsing.ts:208-213`) -
is live in THIS round (it was moot until a reply criterion could exist) and is
AC-R6 below, not a separate residual.

## 3. Acceptance criteria for the remaining round

Each AC names the object under comparison, the instrument producing each
quantity, and the direction of failure. "NEW" marks an instrument nothing in the
repo provides today. Where the only possible enforcer is a render or a live call,
the AC is an OWNER RESIDUAL and is marked so - never a machine AC.

**AC-R1 (the parser recognizes a reply section).** Object: the `RubricCriterion[]`
returned by `extractRubricCriteria` for a rubric containing a reply-section
marker line (the marker convention is the architect's, seeded by
`docs/a8-architecture.md` section 9). Instrument (NEW): a unit test in
`src/lib/grade/rubric.test.ts`. Direction of failure: RED if criteria authored
after the marker are not tagged with the reply axis, or criteria before it lose
their initial-post axis, or the marker line is itself parsed as a criterion.

**AC-R2 (no regression for a rubric with no reply section).** Object: the
`RubricCriterion[]` for every rubric that parses today. Instrument: a frozen
oracle over existing `rubric.test.ts` fixtures (the same non-regression bar
`rubric.ts` already states for its strict/widened split, `rubric.ts:33-35`
region). Direction of failure: RED if any rubric that has no marker parses to a
different criteria set than before the axis feature.

**AC-R3 (reply criteria score the replies; initial criteria score the initial
post).** Object: the model-facing request composed by `buildSystemPrompt` /
`gradeStudentEntries` for a discussion whose rubric has a reply section.
Instrument (NEW): a unit test asserting the prompt pairs the reply-axis criteria
with the reply content and the initial-axis criteria with the initial-post
content (the exact composition is the architect's; the test pins that a
reply-axis criterion name appears in the reply-scoring context and NOT only in
the initial-post context). Direction of failure: RED if a reply-axis criterion is
presented to the model as applying to the initial post, or vice versa.

**AC-R4 (no reply section -> replies EXCLUDED from initial criteria, and the
exclusion is DISCLOSED by code).** Object: the scored content and the disclosure
text for a discussion graded against a rubric with NO reply section. Instrument
(NEW): a unit test on the code-composed disclosure (a pure function, like the
existing `composeOverallComment`/`RESUBMIT_NOTICE` mechanism, so it survives the
model returning an empty string - the GUARANTEED class the row demands).
Direction of failure: RED if the reply text is scored against the initial-post
criteria, or if the exclusion is not disclosed, or if the disclosure is
model-generated rather than code-composed.

**AC-R5 (the model instructions are narrowed in the SAME change as exclusion -
RULING A).** Object: the assignment-instruction text the model receives for a
discussion whose replies are being excluded. Instrument (NEW): a unit test
asserting that when replies are excluded, the model is NOT instructed to demand
them on the scored axis (so it cannot deduct for work removed from the request).
Direction of failure: RED if exclusion fires while the model is still told to
require the replies - the disposed "exclusion without narrowing" class.

**AC-R6 (the aggregate is carried, not silently recombined wrongly).** Object:
`deriveTotalScore` / the posted `submission[posted_grade]` for a two-axis grade.
Instrument: a unit test over `deriveTotalScore` (`parsing.ts:208`) plus a
source-read of `postCanvasGrades` (`grades.ts:128-140`) confirming each axis'
`rubricArea` posts as its own `rubric_assessment[...]`. Direction of failure: RED
if a reply-axis component is dropped from the posted assessment, or if the
aggregate rule changes behaviour for a single-axis (no-reply-section) rubric.
The decision WHICH aggregate rule to apply when the model total ignores the reply
component is Fork B's live half - the architect/owner must fix it here, not defer
it.

**AC-R7 (OWNER RESIDUAL - the authoring surface renders and persists).** Object:
the `RubricInputModal` control by which an instructor marks a reply section.
Instrument: OWNER - no component renders under vitest in this repo. The
source-checkable half (the marker reaches `extractRubricCriteria`) is covered by
AC-R1; the rendered control, its persistence (memory: persist-ui-control-state,
`ta-` keys), and keyboard behaviour are owner/UX. Direction of failure: owner
walk in the running app.

**AC-R8 (OWNER RESIDUAL - the model actually scores separately).** Object: a live
`gradeCanvasUrl` grade of a real graded discussion with a reply-section rubric.
Instrument: OWNER - no live Gemini, no live Canvas, no API key in this checkout.
The machine ACs verify the model RECEIVES the two-axis structure; whether its
OUTPUT honours it is argued, not measured. Direction of failure: owner walk.

## 4. Architecture sketch (consumed, not re-derived, from a8-architecture section 9)

This recon does not redo the architecture; it states the shape the architect
must harden and the seams the plan must cut. `docs/a8-architecture.md` section 9
already proposes a marker convention ("a non-indented line beginning `replies` or
`reply section` with no `(N pts)` parenthetical") and the `axis` tag on
`RubricCriterion`. That is the starting point; the architect owns finalising it
and MUST re-measure (section 9 cited `rubric.ts` at 443; it is 420 today).

### 4.1 Authoring surface (the layer the instructor reaches)

THE SURFACE IS A LAYER. Today an instructor authors a rubric as free text in
`RubricInputModal.tsx` (389 lines) and, for built rubrics, `RubricBuilderModal.tsx`
(`grep -rln "extractRubricCriteria\|RubricCriterion" src` lists both as
consumers). The reply section is authored HERE - either by the instructor typing
the marker line into the existing field (lowest friction, no new control, pairs
directly with AC-R1) or by a dedicated "reply section" affordance. The architect
decides which; the plan MUST name the authoring file in the wave that builds the
parser, or the parser ships dead (memory: assignment-must-include-the-wiring-file;
the row's RULING A names exactly this dead-code risk).

### 4.2 Parser axis-tagging (rubric.ts + types.ts)

`RubricCriterion` gains `axis?: "initial-post" | "reply"` (optional, so the wide
blast radius below keeps compiling). `extractRubricCriteria` detects the marker
in its existing per-line loop and tags criteria before/after it. BLAST RADIUS
(measured, `grep -rln "extractRubricCriteria\|RubricCriterion" src`, 33 files):
the type is consumed across cartridge import (`cartridge-import*.ts`), canvas
modules (`canvas-modules/*`), snapshot grading (`snapshot-*`), workflows
(`workflows/registry/steps.rubrics.ts`), and rubric rendering (`rubric-render.ts`,
`rubric-bulk-plan.ts`). Making `axis` OPTIONAL is what keeps all of them
compiling unchanged - the architect must confirm no structure test enumerates
`RubricCriterion` keys (a field-count canary), and the plan must list any
source-text reader of `rubric.ts`/`types.ts` in its write set
(`grep -rln "readFileSync" src | xargs grep -l "grade/rubric\|grade/engine"`
returned 10 candidate readers this session - the plan intersects them precisely).

### 4.3 Per-axis scoring, exclusion, and narrowed instructions (engine.ts + prompts.ts)

The engine pins criteria once per batch (`engine.ts:232-235`). The two-axis
scoring plugs in here and in `buildSystemPrompt` (`prompts.ts`): initial-axis
criteria apply to the initial-post content, reply-axis criteria to the reply
content. When the rubric has NO reply section, replies are excluded from the
scored content and the exclusion is disclosed by code (AC-R4), AND the model
instructions are narrowed in the SAME change (AC-R5, RULING A). The GUARANTEED
class the row demands (G1/G2/G3 in `docs/BACKLOG.md:168`): the disclosure is
code-composed (survives an empty model string), and the excluded count is a
TypeScript integer from `replies.length` - not model-supplied.

### 4.4 Score carrying (no new plumbing - Fork B)

Reuse `rubricAreas` + `postCanvasGrades` as-is (1.3, 2.2). The only decision is
AC-R6's aggregate rule.

## 5. Downstream implications from the owner's note - each addressed

The row lists five implications. State of each against the tree:

1. **Rubric gains a second axis** - DECIDED (one rubric with a reply section,
   section 2). The build is sections 4.1-4.3.
2. **Score no longer one number** - the carrier already holds N named scores
   (1.3). The per-criterion half needs no plumbing; the aggregate half is AC-R6.
   The instructor does NOT set a combination rule unless AC-R6's decision says so.
3. **`contributionCount` must become two counts** - ALREADY SHIPPED as
   `initialPostCount`/`replyCount` (Wave 1, `discussions.ts:118-124`), shape-only
   with no runtime reader (that is accepted; they mirror `contributionCount`'s
   own zero-reader state). A reader MAY appear in this round if the exclusion
   disclosure needs the count - if so, the shape fields finally gain their reader
   (discharges RT-5). Re-measure with `grep -rn "initialPostCount\|replyCount" src`.
4. **No-replies vs no-initial-post read differently** - ALREADY SHIPPED on
   Route A (Wave 2 manifest + the `[This student did not write an initial post.]`
   content line, `extraction.ts:335-336`). This round extends it to the SCORING
   feedback: "no initial post" and "no replies" must produce different scored
   outcomes once each axis scores its own content.
5. **The UI lists every contribution as a peer item** - the screen-capture
   surface's recognition SHIPPED (A8-R). The remaining UI is the authoring
   surface (4.1, AC-R7, owner residual) and the per-axis score display, which is
   OV/owner (no render under vitest).

## 6. Wave plan (independently gateable and pushable)

Dependency-ordered; exact write sets and disjointness are the `loop-plan` seat's
to finalise with pasted `sort | uniq -d`. The shape:

- **WAVE A - parser axis-tag (foundation).** Write set:
  `src/lib/grade/rubric.ts`, `src/lib/grade/types.ts`, and the owned test
  `src/lib/grade/rubric.test.ts`. Delivers AC-R1, AC-R2. Independently gateable:
  the parser is a pure function driven directly. Gate (all from PowerShell):
  `npx tsc --noEmit`; `npm run lint`; tests - `rubric.test.ts` is one owned file,
  but if any source-text reader of `rubric.ts` is in the write set, use
  `npm run test:paths -- src/lib/grade/rubric.test.ts <reader2> ...` (one path per
  arg; never a raw multi-path `vitest`); `npm test` (full regression for the
  33-file `RubricCriterion` blast radius); `npm run build`; `git status --short`
  against the assignment; AND `npx vitest run src/file-size-ceiling.structure.test.ts`
  unconditionally (the file-size ceiling canary - re-measure `rubric.ts`/`types.ts`).
- **WAVE B - per-axis scoring + exclusion + narrowed instructions.** Depends on
  Wave A (reads `RubricCriterion.axis`). Write set: `src/lib/grade/engine.ts`,
  `src/lib/grade/prompts.ts`, possibly `src/lib/grade/extraction.ts` for the
  exclusion content, their owned tests, and any pure disclosure-compose leaf.
  Delivers AC-R3, AC-R4, AC-R5, AC-R6. Gate: as Wave A, with `test:paths`
  mandatory (multiple owned + source-text-reader files), plus the file-size
  ceiling canary unconditionally.
- **WAVE C - authoring surface.** Depends on Wave A (produces the marker the
  parser reads). Write set: `RubricInputModal.tsx` (and/or `RubricBuilderModal.tsx`),
  its wiring test, persistence (`ta-` key). Delivers AC-R1's wiring (the marker
  reaches the parser from the UI) and AC-R7's source-checkable half; the rendered
  control is owner residual R5/RT-1. Gate: as above; AC-R7's render is owner.

Sequencing: A before B and C (both read the axis). B and C are path-disjoint from
each other and MAY run concurrently IF the plan proves it with `sort | uniq -d`
AND neither establishes a fact the other designs against. Each wave is its own
push.

## 7. Disposition of the prior `docs/a8-scope.md` (the recognition round)

Each prior requirement -> kept(with state) / handed over(receiver+obligation) /
withdrawn(reason). Id column re-derived last.

| Prior | Disposition | Detail |
|---|---|---|
| AC-1 Route A recognition | KEPT -> SHIPPED | Wave 2 `20e8af54`; `canvasWorkToEntry` discussion branch. |
| AC-2 reaches model unmerged + truncation survival | KEPT -> SHIPPED | Wave 2; front-loaded manifest. |
| AC-3 `contributionCount` split | KEPT -> SHIPPED | Wave 1 `d82d18ae`; shape-only `initialPostCount`/`replyCount`. |
| AC-4 two empty states | KEPT -> SHIPPED | Wave 2; manifest + "did not write an initial post" line. |
| AC-5 UI marks which is which | KEPT -> SHIPPED (source half) | Wave 2 `submittedFiles` names; rendered half -> AC-R7 / R5 (owner). |
| AC-6 Route D no change this round | KEPT | Route D stays owner residual R2 (section 8). |
| AC-7 BLOCKED on Fork A scoring | HANDED OVER -> THIS round | Receiver: the reply-section scoring round (AC-R1..AC-R6). It is now the core of A8's remainder. |
| AC-8 BLOCKED on Route C data | HANDED OVER -> owner residual R1 | Route C needs a live `/view` call this route does not make. |
| R1 Route C | KEPT -> R1 (section 8) | Owner. |
| R2 Route D | KEPT -> R2 (section 8) | Owner. |
| R3 reply-section rubric authoring+parser+grader | HANDED OVER -> THIS round | Now sections 4.1-4.3 / AC-R1..AC-R5. |
| R4 model-total-vs-code-sum | KEPT, now LIVE -> AC-R6 | Was moot; becomes decidable once a reply criterion can exist. |
| R5 AC-5 rendered UI | KEPT -> R5 (section 8) | Owner/UX. |
| R6 `grading.ts` line budget | KEPT -> R6 (section 8) | 977/1000; this round is not expected to touch it. |
| R7 `parentName` | WITHDRAWN -> DISCHARGED | Shipped in Waves 1-2 (`discussions.ts:70`, `extraction.ts:351`). |
| R8 `contributionCount` re-confirm | WITHDRAWN -> DISCHARGED | Shipped; fields added, not removed. |

## 8. Residual register (owner, instrument, step)

A residual not in `docs/BACKLOG.md` does not exist; the push that lands any wave
of this round must reconcile these into the A8 row.

- **R1 - Route C (`gradeOneSubmissionAction`) discussion recognition.** Owner:
  repo owner. Instrument: one live single-submission grade through
  `gradeOneSubmissionAction` against a real graded discussion (the route has no
  `/view` call; `submission-detail.ts` body has no Post/Reply structure). Step:
  after a future wave gives that route a `/view` call. In NO wave this round.
- **R2 - Route D (external Deterministic Grading API / `_post.txt`).** Owner:
  repo owner. Instrument: one run against the live external service
  (`grep -rn "_post" src` excluding tests still finds no in-repo reader). Step:
  before any change to what `canvasWorkToZipBase64` writes. In NO wave this round.
- **R5 - the authoring surface and per-axis score DISPLAY render.** Owner:
  verify/UX pass at implementation time. Instrument: a manual walk/screenshot in
  the running app (no component renders under vitest). Step: after Wave C, before
  it ships.
- **R6 - `grading.ts` line budget (977/1000, no `ALLOWED_OVERAGE`,
  `file-size-ceiling.structure.test.ts:41`).** Owner: the `loop-plan` seat of any
  wave that edits `grading.ts`. Instrument:
  `@(Get-Content src/app/actions/grading.ts).Count` vs `LIMIT`. Step: before that
  wave; this round is NOT expected to edit it, but re-measure if a wave reaches it.
- **R-AXIS-BLAST - the 33-file `RubricCriterion` consumer set.** Owner: the
  `loop-plan` seat. Instrument: `grep -rln "extractRubricCriteria\|RubricCriterion" src`
  plus the source-text readers from `grep -rln "readFileSync" src | xargs grep -l
  "grade/rubric\|grade/engine"`. Step: before Wave A dispatch - every reader is
  classified owned/checked-safe and any that reads the edited file AS SOURCE TEXT
  is in the gate. Missing this is how an optional-field addition goes red in a
  file nobody listed.
- **R-FORK-A-CONFIRM - the owner-decision confirmation.** Owner: repo owner.
  Instrument: re-affirm "one rubric with a reply section" (decided 2026-09-15,
  unexercised since) before Wave C authors the surface; section 2 states the
  switch cost if it changed. Step: alongside the architect pass, not as a gate.
- **RT-5 (carried) - `initialPostCount`/`replyCount` are shape-only.** Owner:
  this round, IF the exclusion disclosure reads a count. Instrument:
  `grep -rn "initialPostCount\|replyCount" src`. Step: Wave B. If a reader
  appears, mark RT-5 discharged; if not, it remains a known shape-only state.

## 9. What could not be determined here (environment limits, `docs/loop/this-repo.md` section 6)

- **No live Canvas**: recognition's behavioural effect and Route C's missing
  `/view` data are unexercised (R1, AC-R8).
- **No live Gemini / no API key**: whether the model's OUTPUT honours the two-axis
  structure is argued, not measured (AC-R8). The machine ACs verify the model
  RECEIVES it.
- **No component renders under vitest**: the authoring surface and per-axis score
  display are OV/owner (AC-R7, R5). No requirement in this scope is enforced only
  by a render.
- **No live external Deterministic Grading API**: Route D's tolerance is unknown
  (R2).

## 10. owns / blast-radius list (derived, command stated, output pasted)

Commands run 2026-10-05:

```
grep -rln "extractRubricCriteria\|RubricCriterion" src
```
(33 files) EDITED (production, this round): `src/lib/grade/rubric.ts`,
`src/lib/grade/types.ts`, `src/lib/grade/engine.ts`, `src/lib/grade/prompts.ts`,
and one of `src/app/components/grading-recording/RubricInputModal.tsx` /
`src/app/components/content-tab/RubricBuilderModal.tsx` (authoring surface, Wave C).
CHECKED-SAFE (optional `axis` keeps them compiling; must stay green under
`npm test`): `src/app/actions/snapshot-grade.ts`, `snapshot-parse-rubric.ts`,
`src/app/components/snapshot-grading/snapshot-grade-prompt.ts`,
`src/lib/canvas/metadata.ts`, `src/lib/canvas-modules/{rubrics,types,raw-types}.ts`,
`src/lib/cartridge-import*.ts`, `src/lib/rubric-{render,bulk-plan}.ts`,
`src/lib/grade/{reconcile,run-header}.ts`, `src/lib/grade.ts`,
`src/lib/workflows/registry/steps.rubrics.ts`, and the test files in that list.

```
grep -rln "readFileSync" src | xargs grep -l "grade/rubric\|grade/engine\|RubricInputModal"
```
Source-text readers to classify before dispatch (reads an edited file AS TEXT, so
a correct change can turn one red): `src/app/api/grade-run-item/route.test.ts`,
`src/app/components/grading-recording/grading-rows.test.ts`,
`src/app/components/grading-results/gradingResultsHelpersWiring.test.ts`,
`src/app/components/grading-results/ungradedDisclosure.test.ts`,
`src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts`,
`src/app/components/snapshot-grading/snapshot-grading.structure.test.ts`,
`src/app/components/ui/buttonVariant.test.ts`,
`src/app/components/ui/modalAdoption.wiring.test.ts`,
`src/lib/cartridge-drops.origin.test.ts`,
`src/lib/grade/grouping-zip-parents.wiring.test.ts`.
The `loop-plan` seat intersects each against the per-wave write set with
`sort | uniq -d` and pastes the result; this list is the input to that, not a
substitute for it.
```
