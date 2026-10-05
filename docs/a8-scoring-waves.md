# A8 reply-section SCORING round - wave plan

Wave cut only. No production code and no test code was written or changed to
produce this document. Consumer: a `loop-implementer` chain, one dispatch per
wave. A fresh `loop-checker` gates this plan before any implementer acts.

Inputs consumed: `docs/a8-scoring-architecture.md` (checked SHIP, round-2 fix
applied) and `docs/a8-scope.md` (checked SHIP). This plan FORMALIZES the wave/file
map sketched in the architecture section 9: it derives each wave's write set with a
stated command, proves disjointness in both senses, names the per-wave gate and its
pass criteria, prices the frozen-set / line-shift obligations, and registers the
residuals.

Every quantity below names the command that produced it; every `file:line` and
every grep was re-run in THIS session (2026-10-05) against the real tree, because
the prior A8 docs' pins drifted (`a8-architecture.md` cited `rubric.ts` at 443,
`engine.ts` at 487, `extraction.ts` at 372 - all stale; the architecture round
re-measured and this round confirms those corrections hold).

## 0. Confirmations against the tree (every architecture citation re-opened)

| Architecture claim | Re-checked this session | Verdict |
|---|---|---|
| `extractRubricCriteria` = strict-then-widened (`rubric.ts:27-31`), two per-line matcher passes (`rubric.ts:36-55`, `:97-115`), each regex requires a `(number unit)` group (`:43`, `:103`) | opened | CONFIRMED |
| `RubricCriterion` at `types.ts:458-462` is `{ name; points }`, no axis | opened | CONFIRMED |
| engine choke `const criteria = extractRubricCriteria(rubric)` + commentSplit ternary at `engine.ts:232-235` | opened | CONFIRMED (byte-exact; AC-R2c oracle binds here) |
| per-student catch at `engine.ts:287-309` (all-or-nothing) | opened | CONFIRMED (RS-2 instrument) |
| `buildDiscussionEntry` builds both slices as separate strings before join (`extraction.ts:304-364`) | opened | CONFIRMED (NOTE B pivot: slices already exist) |
| `canvasWorkToEntry` discussion branch returns the entry object (`extraction.ts:372-392`) - Wave B's `discussionAxes` populate site | opened | CONFIRMED |
| `buildSystemPrompt` = 5 params, last two optional with byte-identical defaults `"some"`/`"in-overall-comment"` (`prompts.ts:56-87`) | opened | CONFIRMED (6th optional `axisScope="all"` is safe) |
| post loop posts each `rubricArea` as its own `rubric_assessment[criterionId]` (`grades.ts:128-143`) | opened | CONFIRMED (merged reply areas reach Canvas, no new plumbing) |
| markers referenced ONLY in `extraction.ts` | `grep -rln "INITIAL POST ===\|REPLIES TO CLASSMATES" src` -> 1 file | CONFIRMED |
| new field names unused today | `grep -rn "discussionAxes\|initialPostContent\|replyContent" src` -> 0 | CONFIRMED |
| no key-count canary over `RubricCriterion` | `grep -rln "RubricCriterion" src --include=*.structure.test.ts` -> 0 | CONFIRMED |
| new symbols free | `grep -rn "CANONICAL_REPLY_MARKER\|isReplySectionMarker" src` -> 0 | CONFIRMED |
| `LIMIT = 1000`, no `ALLOWED_OVERAGE` for any A8 file | read `src/file-size-ceiling.structure.test.ts:41,75-92` | CONFIRMED |

## 1. Measured sizes (both mandated instruments AGREE; 2026-10-05)

`wc -l <path>` (Git Bash) and `@(Get-Content <path>).Count` (PowerShell), both run
this session. They agree on every file (these files end with a trailing newline, so
the repo's known up-to-42 divergence does not bite here - but both were still run,
per the non-negotiable).

| File | wc -l | Get-Content | Wave | Projected add | Projected total | Headroom to 1000 |
|---|---|---|---|---|---|---|
| `src/lib/grade/rubric.ts` | 420 | 420 | A | ~+45 | ~465 | wide |
| `src/lib/grade/types.ts` | 462 | 462 | A | ~+15 | ~477 | wide |
| `src/lib/grade/extraction.ts` | 527 | 527 | B | ~+15 | ~542 | wide |
| `src/lib/grade/engine.ts` | 499 | 499 | B | ~+90 | ~589 | wide |
| `src/lib/grade/prompts.ts` | 415 | 415 | B | ~+40 | ~455 | wide |
| `src/app/components/GradingTab.tsx` | 620 | 620 | C (mount) | NET <= 0 (REQUIRED) | <= 620 | ZERO - at the RES-GRAD-5 ratchet |
| `src/app/components/grading/ReplySectionInsertField.tsx` | NEW | NEW | C (affordance) | n/a | small leaf | wide |
| `src/lib/grade/parsing.ts` | 334 | 334 | B READ-only | 0 | 334 | n/a |
| `src/lib/canvas/grades.ts` | 184 | 184 | READ-only | 0 | 184 | n/a |
| `src/app/actions/grading.ts` | 977 | 977 | NOT touched (R6) | 0 | 977 | tight - untouched |

No Wave A/B projected total approaches 1000. `GradingTab.tsx` is the exception and is
the hard constraint of this revision: it is EXACTLY 620 on both instruments
(`wc -l` = 620, `@(Get-Content).Count` = 620, 2026-10-05) and is pinned `<= 620` by a
dedicated ratchet (`GRADING_TAB_RATCHET = 620`, `file-size-ceiling.structure.test.ts:157,162`),
so it has ZERO headroom - the Wave C mount MUST be net-zero-or-negative (section 2
Wave C, section 7.5). Projections elsewhere are the architecture's, not a promise - the
file-size ceiling canary re-measures the WHOLE `src/` tree every wave (section 6), so a
miscalled projection is caught, not assumed.

## 2. The numbered wave table

Dependency order: A, then {B, C}. The "where exported value is called" column is the
reachability test - a wave that exports something with no in-wave caller is flagged,
and the one legal type-only exception is declared explicitly.

### WAVE A - parser axis-tag + type fields (foundation)

**Write set (production + owned test):**
- `src/lib/grade/rubric.ts` - add `isReplySectionMarker(line: string): boolean`,
  `CANONICAL_REPLY_MARKER` const, and thread `currentAxis` through BOTH
  `extractRubricCriteriaStrict` (`:36-55`) and `extractRubricCriteriaWidened`
  (`:97-115`), tagging each pushed criterion and `continue`-ing on a marker line.
- `src/lib/grade/types.ts` - add `RubricCriterion.axis?: "initial-post" | "reply"`
  AND `StudentSubmissionEntry.discussionAxes?: { initialPostContent: string;
  replyContent: string; replyCount: number }`. BOTH type additions in this one wave
  so `types.ts` is touched in exactly one wave.
- `src/lib/grade/rubric.test.ts` - owned; AC-R1, AC-R2.

**Exports / where called (reachability):**
| Export | Caller IN Wave A | Later caller | Reachable at end of Wave A? |
|---|---|---|---|
| `isReplySectionMarker` | `extractRubricCriteria*` (same file) + `rubric.test.ts` | Wave C UI (anti-drift) | YES - called and asserted in-wave |
| `CANONICAL_REPLY_MARKER` | `rubric.test.ts` wiring (`isReplySectionMarker(CANONICAL_REPLY_MARKER)===true`) | Wave C UI inserts it | YES - asserted in-wave |
| `RubricCriterion.axis` (produced by the parser) | `rubric.test.ts` asserts the tag | Wave B engine filters `c.axis === "reply"` / `!== "reply"` | Produced + asserted in-wave; its SCORING consumer is Wave B |
| `StudentSubmissionEntry.discussionAxes` (type) | NONE | Wave B populates (`buildDiscussionEntry`) and consumes (engine dispatch) | NO - see declaration below |

**DECLARED type-only / dead-but-tracked intermediate (the legal exception, stated
so the gate does not imply reachability it does not have):**
- `discussionAxes` ships in Wave A as a **type-only forward declaration** with NO
  runtime producer and NO runtime consumer in Wave A. This is the `seats.md`
  type-only exception, declared explicitly. It mirrors the accepted shape-only
  precedent of `initialPostCount`/`replyCount` (shipped shape-only in the
  recognition round, `discussions.ts:118-124`). It becomes live in Wave B.
- The axis TAG on `RubricCriterion` is produced and asserted in Wave A, but its
  effect on a user-visible SCORE is not reachable until Wave B wires the engine
  filters. So Wave A ships a **planned, tracked dead-but-green intermediate**: the
  parser correctly tags axes, every gate is green, and no grading behaviour changes
  until Wave B. This is a planned state, NOT something Wave B rediscovers. It is
  safe because the tag is additive and optional - AC-R2 pins that a no-marker rubric
  is byte-identical, so no existing grade moves.

**Independently gateable: YES.** The parser is a pure function driven directly by
`rubric.test.ts`; `tsc`/`lint`/`build` pass because every new field is optional and
every new export is self-contained (no new import added to `rubric.ts`).

**Delivers:** AC-R1, AC-R2.

### WAVE B - per-axis scoring + exclusion + narrowing + aggregate

Depends on Wave A (reads `RubricCriterion.axis`, reads the `discussionAxes` type,
reads `isReplySectionMarker` only transitively via the parser's tags - Wave B does
NOT import `isReplySectionMarker`).

**Write set (production + owned/new tests):**
- `src/lib/grade/extraction.ts` - populate `discussionAxes` in `buildDiscussionEntry`
  from the slices it already computes (`:334-356`); `content` UNCHANGED (REGRESSION
  444 stays green). Set it on the `canvasWorkToEntry` discussion-branch return object
  (`:381-391`).
- `src/lib/grade/engine.ts` - extract `scoreAxis` primitive (the `gradeSubmission`
  body minus `deriveTotalScore`/`scaleResultToPoints`/`composeOverallComment`); build
  the three per-batch prompts (`singleAxisPrompt`/`initialAxisPrompt`/`replyAxisPrompt`);
  per-ENTRY dispatch on `entry.discussionAxes === undefined`; two `scoreAxis` passes
  for two-axis discussion entries; merged finalise via `deriveTotalScore("", merged)`;
  disclosure wiring gated on `discussionAxes !== undefined`.
- `src/lib/grade/prompts.ts` - 6th optional `axisScope: "all" | "initial-post-only" |
  "reply-only" = "all"` (default byte-identical); the two appended scope directives;
  `composeReplyExclusionDisclosure(replyCount: number): string`.
- `src/lib/grade/engine.test.ts` - owned; AC-R3, AC-R6, and the AC-R2b / AC-R2c
  single-axis non-regression oracles (3.5).
- `src/lib/grade/prompts.test.ts` - owned; AC-R5 (`axisScope` directive present on
  non-"all", absent on "all").
- `src/lib/grade/prompts-praise-routing.test.ts` - owned; extend the default-branch
  byte-identity guard to cover `axisScope="all"` in the same style.
- `src/lib/grade/extraction.test.ts` - owned; `discussionAxes` populated correctly
  and `content` unchanged.
- `src/lib/grade/reply-axis-scoring.oracle.test.ts` - NEW, owned; the pure
  disclosure/gate oracle (AC-R4): the NO-OP oracle (undefined entry -> no
  disclosure), the code-held-exclusion sentinel oracle (reply prose absent from the
  initial-post request string), and the positive oracle (discussion + no-reply
  rubric -> disclosure present). Confirmed FREE: `src/lib/grade/reply-axis-scoring.oracle.test.ts`
  does not exist (checked this session).

`src/lib/grade/parsing.ts` (`deriveTotalScore`, `:208-236`; `scaleResultToPoints`,
`:247-273`) and `src/lib/canvas/grades.ts` (`postCanvasGrades`, `:128-143`) are READ,
NOT edited.

**Exports / where called (reachability - every export has an in-wave caller):**
| Export | Caller IN Wave B | Reachable? |
|---|---|---|
| `scoreAxis` (new engine primitive) | `gradeSubmission` (single-axis) + the per-entry two-axis dispatch, both in `engine.ts` | YES |
| `axisScope` param on `buildSystemPrompt` | the three per-batch prompt builds in `engine.ts` | YES |
| `composeReplyExclusionDisclosure` | the exclusion branch of the per-entry dispatch in `engine.ts` | YES |
| `discussionAxes` population | consumed by the same-wave engine dispatch | YES (field goes live here) |

**Independently gateable: YES.** All consumers are in-wave; the merged areas reach
`postCanvasGrades` through the existing `rubricAreas` carrier (confirmed by reading
`grades.ts:128-143`, not inferred). No new import graph edge, no new `GradingRun`
producer (section 7).

**Delivers:** AC-R3, AC-R4, AC-R5, AC-R6, plus the AC-R2b/AC-R2c non-regression
guards.

### WAVE C - authoring surface (discoverability on the Canvas-route rubric field)

Depends on Wave A (the canonical marker and its recognizer). Independent of Wave B.

**REBOUND in round 2 (blocker B1).** Round 1 targeted `RubricInputModal.tsx`. That is
WRONG and would have shipped a DEAD surface: `RubricInputModal.tsx` references neither
`extractRubricCriteria` nor `RubricCriterion` (it collects text only,
`onSubmit:(rubricText:string)=>void` at `RubricInputModal.tsx:133`), it is NOT in the
33-consumer set (confirmed section 0/4.1), and it is imported ONLY by
`GradingRecordingPanel.tsx` and the `SnapshotGrading*`/`SnapshotCapture*` panels - the
screen-capture / embedded routes (`gradeCapturedSubmissionsAction` /
`gradeEntriesEmbedded`) that NEVER call `canvasWorkToEntry` and so always take the
SINGLE-axis path. The two-axis feature is reachable ONLY via `gradeCanvasUrl` (section
3). Its rubric is authored in `GradingTab.tsx`, so that is the only surface where an
"insert reply section" affordance is live.

**Write set:**
- `src/app/components/GradingTab.tsx` - MOUNT the new affordance beside the existing
  rubric field (`const [rubric, setRubric] = useState("")` at `GradingTab.tsx:118`;
  textarea `onChange -> setRubric` at `:253`; Canvas-fetched rubric also lands via
  `setRubric(result.rubricText)` at `:162`). This `rubric` state is what flows to the
  two-axis route as `header.effectiveRubric -> gradeCanvasUrl(..., header.effectiveRubric, ...)`
  (`grading.ts:821`). **The mount MUST be net-zero-or-negative lines** (section 7.5):
  `GradingTab.tsx` is EXACTLY 620 and pinned `<= 620`, so the import + JSX mount must be
  offset by extracting a cohesive existing slice into the new leaf, exactly as N15 W3
  mounted `GradingPictureField` and landed at 620 (`f4081cb3`).
- `src/app/components/grading/ReplySectionInsertField.tsx` - NEW leaf holding the
  affordance (an "Add reply section" control + its insert handler that appends/inserts
  `CANONICAL_REPLY_MARKER` into the rubric string via the `setRubric` passed as a prop)
  and the `ta-` persistence for any new control state (precedent: `GradingPictureField.tsx`
  is already in this directory; GradingTab's own `ta-` keys are `ta-grading-source`
  `:112,:134` and `ta-grading-rubric-memory` `:64`). Confirmed FREE this session.
- `src/app/components/grading/replySectionMarker.wiring.test.ts` - NEW, owned; the
  anti-drift + reachability wiring test (details under "Exports" below). Confirmed FREE.
- `src/file-size-ceiling.structure.test.ts` - CONDITIONAL, only if the net extraction
  SHRINKS `GradingTab.tsx` below 620: re-pin `GRADING_TAB_RATCHET` DOWNWARD to the new
  measured count in the SAME wave. Raising it is NOT permitted (section 7.5). If the
  mount lands at exactly 620, this file is NOT edited.

**New-file location confirmed safe:** `src/app/components/grading/` already holds
`GradingPictureField.tsx` + `gradingPictureWiring.wiring.test.ts` (the N15 W3
precedent); no frozen-roots/basename directory canary enumerates that directory
(`grep -rln "frozen\|roots\|readdir\|basename" src/app/components/grading*/*.structure.test.ts`
returns only `grading-chat/` and `grading-recording/` tests, neither covering
`grading/`), so a new file lands there without a frozen-roots bump.

**Exports / where called (reachability - the wiring test proves the hop, not just the
string):**
| Export | Caller / assertion | Reachable? |
|---|---|---|
| `ReplySectionInsertField` (new component) | mounted in `GradingTab.tsx` beside the rubric field | YES - mount is in-wave |
| its insert handler | wired to GradingTab's `setRubric` prop (the state that becomes `header.effectiveRubric`) | YES |
| consumes Wave A's `CANONICAL_REPLY_MARKER` / `isReplySectionMarker` | the wiring test | YES |

The wiring test (`replySectionMarker.wiring.test.ts`) asserts THREE things, the third
being the B1 fix - that the marker lands in the string that reaches the grader, not
merely that it is well-formed:
1. `isReplySectionMarker(CANONICAL_REPLY_MARKER) === true` (anti-drift; the UI inserts
   exactly what the parser recognizes).
2. Round-trip: the insert handler applied to a sample rubric produces a string on which
   `extractRubricCriteria` tags a following criterion with `axis: "reply"` (so the
   inserted marker is not just well-formed but is ACTED ON by the Wave-A parser).
3. Source-text wiring: `GradingTab.tsx` mounts `ReplySectionInsertField` and passes it
   the SAME `setRubric` that feeds `header.effectiveRubric` (the state threaded to
   `gradeCanvasUrl`) - so the inserted marker provably reaches the two-axis route's
   rubric. (The actual in-app render/click is owner/OV, R5/AC-R7; this is the
   machine-checkable half.)

**Independently gateable: YES** for the source-text wiring + round-trip half, plus the
file-size ratchet. The rendered control, its keyboard behaviour, and the per-axis score
DISPLAY are owner/OV (no render under vitest) - residual R5 / AC-R7.

**Delivers:** AC-R1's UI wiring (on the correct, live surface) + AC-R7's
source-checkable half.

## 3. Layer-spanning reachability: the ONE route, and the surface that feeds it

The feature spans lib (parser, Wave A) -> engine (scoring, Wave B) -> surface
(authoring, Wave C). The non-negotiable requires an explicit account of the hop that
makes the lower-layer capability REACHABLE from the surface, so nothing ships
dead-but-green across waves. Round 1's account was FALSE in both facts (blocker B1);
this is the corrected proof, every claim re-verified against the tree 2026-10-05.

**The two-axis capability is reachable only through a Canvas discussion fetch.** The
Wave-B two-axis gate is `entry.discussionAxes !== undefined`. `discussionAxes` is
produced by exactly one function - `canvasWorkToEntry` (`extraction.ts:372-392`) - and
ONLY on its `if (work.discussion)` branch, i.e. only when the work carries a
Canvas-fetched discussion (initial posts vs replies). `canvasWorkToEntry` is referenced
in several files (`grep -rln "canvasWorkToEntry" src`, 2026-10-05: `extraction.ts`
def; `engine.ts`, `grading.ts`, `grade.ts`, `repo-content.ts`, `single-file-entry.ts`
and four tests), but the only call that can carry `work.discussion` is the whole-run
Canvas path `gradeCanvasUrl` (`engine.ts:458-491`:
`for (const work of students) entries.push(await canvasWorkToEntry(work))`, then
`gradeStudentEntries(...)`); the other callers pass repo / single-file work whose
`work.discussion` is undefined, so `discussionAxes` stays undefined and they take the
SINGLE-axis path. Critically, the screen-capture / snapshot routes that use
`RubricInputModal` do NOT call `canvasWorkToEntry` at all
(`grep -rln "canvasWorkToEntry" src/app/components/grading-recording src/app/components/snapshot-grading`
-> none), and screen-capture submissions have no separable replies.

**The surface that authors that route's rubric is `GradingTab.tsx`, NOT
`RubricInputModal.tsx`.** `gradeCanvasUrl` takes its `rubric` as `header.effectiveRubric`
(`grading.ts:821`), and that rubric is authored in `GradingTab.tsx`: typed into the
field backed by `const [rubric, setRubric] = useState("")` (`:118`, onChange at `:253`),
or Canvas-fetched via `setRubric(result.rubricText)` (`:162`). `GradingTab.tsx` does
NOT import `RubricInputModal` (`grep -n "RubricInputModal" src/app/components/GradingTab.tsx`
-> none). `RubricInputModal` is imported only by `GradingRecordingPanel.tsx` and the
snapshot panels, whose routes never reach `canvasWorkToEntry` - so an affordance there
would be DEAD, and round 1's wiring test (string-shape only) would have passed green on
that dead surface. That is the exact failure B1 caught.

**The reachability hop needs no new engine/parser code; Wave C is discoverability on
the live field.** The moment Wave A + Wave B ship, the capability is reachable as soon
as the canonical marker text is present in the Canvas-route rubric - whether typed into
`GradingTab`'s field by hand OR already present in a rubric authored in Canvas and
fetched at `:162`. The parser (Wave A) tags the axes; the engine (Wave B) scores them.
So A + B DELIVER the capability; Wave C adds DISCOVERABILITY (an in-app "insert reply
section" affordance) and PERSISTENCE on `GradingTab`'s typed field only.

Consequence for ordering: if Wave C slips, the feature is NOT shipped dead - it is
reachable-but-undiscoverable (an instructor who types the marker, or whose Canvas
rubric already carries it, still gets two-axis scoring). That is why B and C may run
concurrently (section 5). Wave C's wiring test is the code-held link against UI/parser
drift AND against a dead surface: it asserts not only `isReplySectionMarker(
CANONICAL_REPLY_MARKER) === true` but that the inserted marker reaches the `setRubric`
state that becomes `header.effectiveRubric` (section 2 Wave C, assertion 3) - the
`assignment-must-include-the-wiring-file` and `verify-reachability-not-just-correctness`
failures the row's RULING A names.

## 4. Write-set derivation (command stated, output pasted)

The blast-radius commands, re-run this session, reproduce the architecture's lists
EXACTLY (33 and 21). The write set per wave is the production files that wave edits
plus its owned/new tests (section 2); the DERIVATION below ranges over the full
consumer and source-text-reader universe so nothing outside a write set is left
unclassified.

### 4.1 The 33-file `RubricCriterion` / `extractRubricCriteria` consumer set

```
grep -rln "extractRubricCriteria\|RubricCriterion" src        (33 files, 2026-10-05)
```
EDITED this round: `src/lib/grade/rubric.ts`, `src/lib/grade/types.ts`,
`src/lib/grade/engine.ts`, `src/lib/grade/prompts.ts`,
`src/app/components/content-tab/RubricBuilderModal.tsx` is a consumer but is NOT
edited (see Wave C scope decision). All 30 other consumers are CHECKED-SAFE: optional
`axis` keeps each compiling. The full list (pasted, sorted):
```
src/app/actions/canvas-files-bulk.ts
src/app/actions/grading-chat-intake.test.ts
src/app/actions/snapshot-grade.test.ts
src/app/actions/snapshot-grade.ts
src/app/actions/snapshot-parse-rubric.test.ts
src/app/actions/snapshot-parse-rubric.ts
src/app/components/content-tab/RubricBuilderModal.tsx
src/app/components/grading-recording/grading-feedback-prompt.ts
src/app/components/snapshot-grading/snapshot-grade-prompt.ts
src/app/components/snapshot-grading/snapshot-grading.structure.test.ts
src/lib/canvas-modules/raw-types.ts
src/lib/canvas-modules/rubrics.ts
src/lib/canvas-modules/types.ts
src/lib/canvas/metadata.ts
src/lib/cartridge-import-blackboard-rubrics.ts
src/lib/cartridge-import-shared.ts
src/lib/cartridge-import.ts
src/lib/grade.ts
src/lib/grade/engine.ts
src/lib/grade/engine.ungraded.test.ts
src/lib/grade/prompts.ts
src/lib/grade/reconcile.test.ts
src/lib/grade/reconcile.ts
src/lib/grade/rubric.test.ts
src/lib/grade/rubric.ts
src/lib/grade/run-header.test.ts
src/lib/grade/run-header.ts
src/lib/grade/types.ts
src/lib/rubric-bulk-plan.test.ts
src/lib/rubric-bulk-plan.ts
src/lib/rubric-render.test.ts
src/lib/rubric-render.ts
src/lib/workflows/registry/steps.rubrics.ts
```
Every one runs under full `npm test` in every wave gate; optional-field additions
keep them green.

### 4.2 The 21 source-text readers of the edited grade modules

```
grep -rln "readFileSync" src | xargs grep -l "grade/rubric\|grade/engine\|grade/prompts\|grade/types\|grade/extraction"   (21 files, 2026-10-05)
```
Each reads an edited file AS TEXT, so a change to a string one of them pins turns it
red. Split by the specific module each one references (so each wave's gate names its
own readers):

```
# readers that reference grade/rubric  (Wave A edits rubric.ts)
for mod in grade/rubric grade/types grade/extraction grade/engine grade/prompts; do
  echo "== $mod =="; for f in <the 21>; do grep -q "$mod" "$f" && echo "  $f"; done; done
```
pasted output:

- **grade/rubric** (Wave A): grading-rows.test.ts, gradingResultsHelpersWiring.test.ts,
  repoGradesFeedbackAndFiles.wiring.test.ts, snapshot-grading.structure.test.ts,
  cartridge-drops.origin.test.ts, rubric-tiers.test.ts, runtime-import-graph.test.ts,
  strip-comments-agreement.structure.test.ts
- **grade/types** (Wave A): useIncrementalGradingRun.lifecycle.test.ts,
  classTrendsRunCohort.test.ts, copy-feedback.test.ts,
  gradingResultsHelpersWiring.test.ts, ungradedDisclosure.test.ts,
  classTrendsFolderEntry.test.ts, repoGradesCodeExecution.wiring.test.ts,
  runtime-import-graph.test.ts
- **grade/extraction** (Wave B): action-guard-coverage-github-cohort.test.ts,
  grading.guard.test.ts, grouping-zip-parents.wiring.test.ts,
  runtime-import-graph.test.ts, runtime-import-graph.ts (a SOURCE reader, covered by
  its own runtime-import-graph.test.ts run)
- **grade/engine** (Wave B): grade-run-item/route.test.ts, ungradedDisclosure.test.ts,
  grouping-zip-parents.wiring.test.ts, rubric-provenance-producers.structure.test.ts,
  runtime-import-graph.test.ts
- **grade/prompts** (Wave B): runtime-import-graph.test.ts, gate-commands.structure.test.ts

**OVER-COUNT correction (a derivation that must range over its own set):**
`gate-commands.structure.test.ts` is a FALSE source-text reader of `prompts.ts`. It
does NOT read `src/lib/grade/prompts.ts`; it matched the grep only because it contains
the literal `src/lib/grade/prompts.test.ts` inside a FROZEN docs-hit assertion
(`gate-commands.structure.test.ts:217`, the `a11-scope.md` S8 entry). What it actually
reads is `docs/**/*.md`, `package.json`, `.claude/agents/`, `.github/workflows/`, and
`src/**` files that import `child_process`. It is therefore NOT a Wave B prompts
reader - but it IS relevant to THIS document (section 7, S8 obligation). Excluded from
Wave B's prompts-reader gate list.

None of the 21 readers must be EDITED this round: Wave A adds self-contained
functions/consts (the strict/widened regexes are UNCHANGED per ruling B43-7, so every
existing rubric-string pin survives); Wave B APPENDS (the `"all"` prompt path is
byte-identical, `content` is unchanged). So the readers are GATE additions
(run them), not write-set additions. The one conditional write-set exception is the
producer canary (section 7).

### 4.3 The markers and new-field greps
```
grep -rln "INITIAL POST ===\|REPLIES TO CLASSMATES" src           (1 file: extraction.ts)
grep -rn  "discussionAxes\|initialPostContent\|replyContent" src  (0 hits)
grep -rln "RubricCriterion" src --include=*.structure.test.ts     (0 hits)
grep -rn  "CANONICAL_REPLY_MARKER\|isReplySectionMarker" src      (0 hits)
```
The markers stay internal to `extraction.ts`; the new field and symbol names are free;
no structure test enumerates `RubricCriterion` keys.

## 5. Disjointness - BOTH senses, computed and pasted

### 5.1 Same-path (edited files + owned tests), `sort | uniq -d`

Three write-set files (one per wave), intersected pairwise. A, B, C are the STATED
write sets from section 2.

```
# A.txt / B.txt / C.txt = the section-2 write sets, one path per line
cat A.txt B.txt | sort | uniq -d   # A INTERSECT B
cat A.txt C.txt | sort | uniq -d   # A INTERSECT C
cat B.txt C.txt | sort | uniq -d   # B INTERSECT C
```
pasted output (2026-10-05; Wave C REBOUND to `GradingTab.tsx` + the new `grading/`
leaf + the conditional ratchet-test re-pin):
```
=== A INTERSECT B (expect empty) ===
=== A INTERSECT C (expect empty) ===
=== B INTERSECT C (expect empty) ===
```
All three empty. Every intersection is empty - the only pass. The NEW files
(`reply-axis-scoring.oracle.test.ts` in B; `grading/ReplySectionInsertField.tsx` and
`grading/replySectionMarker.wiring.test.ts` in C) were confirmed to not pre-exist and
have distinct paths. `GradingTab.tsx` and `file-size-ceiling.structure.test.ts` (Wave
C's targets) are in NEITHER the 33-consumer NOR the 21-reader set
(`grep -n "GradingTab.tsx\|file-size-ceiling" <(both derivations)` -> neither), and
neither is in Wave B's write set, so the rebind does not introduce a B/C collision.

A is sequenced BEFORE B and C, so A's disjointness from them is a non-issue for
concurrency; it is computed anyway (empty) to prove A's landing cannot collide with a
B or C that an orchestrator might start the instant A's push lands.

### 5.2 Informational (does any wave design against a fact another changes?)

Computed from each side's STATED write set, not from an undisclosed intermediate.

- **A vs B / A vs C:** sequential, not concurrent. B and C READ Wave A's output
  (`RubricCriterion.axis`, `discussionAxes` type, `CANONICAL_REPLY_MARKER`,
  `isReplySectionMarker`). Because A LANDS FIRST and its exports are frozen before B/C
  dispatch, B and C design against a fixed fact, not a moving one. No informational
  conflict.
- **B vs C (the concurrent pair):**
  - B's write set: `extraction.ts`, `engine.ts`, `prompts.ts` + their tests + the
    oracle. B changes SCORING behaviour (how criteria are turned into model requests
    and a merged grade).
  - C's write set: `GradingTab.tsx` (mount), `grading/ReplySectionInsertField.tsx`
    (new leaf), `grading/replySectionMarker.wiring.test.ts` (new), and conditionally
    `file-size-ceiling.structure.test.ts` (ratchet re-pin). C changes AUTHORING
    discoverability (how the marker string gets into GradingTab's rubric field).
  - Does C design against a fact B changes? C depends on `CANONICAL_REPLY_MARKER` and
    `isReplySectionMarker` - BOTH owned by Wave A (in `rubric.ts`), which neither B
    nor C edits. B does not touch `rubric.ts`, `GradingTab.tsx`, or the new leaf. So
    C's dependency is a frozen Wave-A artifact, not a B-mutated one.
  - Does B design against a fact C changes? B reads `RubricCriterion.axis` produced by
    the parser; it is indifferent to HOW the marker reached the rubric text. C inserts
    a string into GradingTab's field; it does not change the parser, the engine, or any
    type B reads.
  - **Verdict: B and C are informationally independent and MAY run concurrently.**
    Standing consent covers disjoint work; idling one while the other runs costs the
    queue.

- **The one cross-gate shared file, handled:** `file-size-ceiling.structure.test.ts` is
  RUN unconditionally by BOTH B's and C's gates, but only Wave C may EDIT it (the
  conditional GradingTab ratchet re-pin), so there is no write-write collision - B runs
  it read-only and stays green because its assertion about `GradingTab.tsx` is
  independent of every B change. To avoid even a read-against-mid-edit window, Wave C
  PREFERS the net-zero mount (GradingTab stays exactly 620, that test NOT edited at
  all); the re-pin is a fallback only if GradingTab shrinks (section 7.5). When Wave C
  does edit it, the orchestrator serializes that single write per
  `parallel-disjointness.md` (a file one agent may write, another may not in the same
  window).

- **Shared incidental readers (visible only after intersecting the GATES, not the
  write sets):** `runtime-import-graph.test.ts` and `snapshot-grading.structure.test.ts`
  are READ by B's and A's gates; C's rebound gate no longer reads
  `snapshot-grading.structure.test.ts` (it was a `RubricInputModal` reader). Neither B
  nor C EDITS any of them, and each asserts on a fact NEITHER wave changes. They are
  named here so the checker sees they were considered, not missed. The genuinely shared,
  not-in-any-file-list resources (`tsc --noEmit` races on `tsconfig.tsbuildinfo`; no two
  agents may sabotage-verify the tree at once; `docs/BACKLOG.md` is a single writer) are
  the orchestrator's to serialize per `parallel-disjointness.md`, not this plan's.

## 6. Per-wave gates (exact commands + pass criteria)

All gates run from PowerShell (Bash is unreliable here). Every multi-path test run is
the `test:paths` wrapper, one path per argument - never a raw `vitest`/`npm test`
naming two or more paths (that form silently drops any argument it does not match, and
would also break the S8 frozen-set guard, section 7). `src/file-size-ceiling.structure.test.ts`
is in EVERY wave's gate unconditionally - it scans the whole `src/` tree in one run,
so a new or grown file is caught with no per-file bookkeeping, and there is no pre-push
or CI vitest backstop otherwise.

### Gate skeleton (identical shape for all three waves)
1. `npx tsc --noEmit` - pass: exit 0, no errors. (Serialize across concurrent waves:
   one caller only, it races on `tsconfig.tsbuildinfo`.)
2. `npm run lint` - pass: exit 0.
3. `npm run test:paths -- <owned + source-text-reader paths for this wave>` - pass:
   all listed suites green. (Fast feedback subset.)
4. `npm test` - pass: full suite green (the authoritative 33-file blast-radius gate;
   also runs S8/P11/producer canary and the import graph).
5. `npx vitest run src/file-size-ceiling.structure.test.ts` - pass: green; re-measures
   every touched file against LIMIT=1000. (Single path, so it is a legal raw vitest
   run.)
6. `npm run build` - pass: compile-line clean (skip the env-dependent prerender tail,
   per the push-without-full-build memory).
7. `git status --short` vs the wave's explicit write set - pass: only this wave's files
   changed; a `.claude/worktrees` shadow check confirms the real tree was edited (Glob
   returns the worktree copy first - `stale-worktree-shadows-glob` memory).

### Wave A `test:paths` line (one path per arg)
```
npm run test:paths -- src/lib/grade/rubric.test.ts src/app/components/grading-recording/grading-rows.test.ts src/app/components/grading-results/gradingResultsHelpersWiring.test.ts src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts src/app/components/snapshot-grading/snapshot-grading.structure.test.ts src/lib/cartridge-drops.origin.test.ts src/lib/grade/rubric-tiers.test.ts src/lib/module-graph/runtime-import-graph.test.ts src/tools/strip-comments-agreement.structure.test.ts src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts src/app/components/grading-recording/classTrendsRunCohort.test.ts src/app/components/grading-recording/copy-feedback.test.ts src/app/components/grading-results/ungradedDisclosure.test.ts src/app/components/repo-grades/classTrendsFolderEntry.test.ts src/app/components/repo-grades/repoGradesCodeExecution.wiring.test.ts
```
Pass: `rubric.test.ts` proves AC-R1 (marker tagging both passes) and AC-R2 (no-marker
byte-identical); every source-text reader of `rubric.ts`/`types.ts` stays green.

### Wave B `test:paths` line (one path per arg)
```
npm run test:paths -- src/lib/grade/engine.test.ts src/lib/grade/prompts.test.ts src/lib/grade/prompts-praise-routing.test.ts src/lib/grade/extraction.test.ts src/lib/grade/reply-axis-scoring.oracle.test.ts src/app/actions/action-guard-coverage-github-cohort.test.ts src/app/actions/grading.guard.test.ts src/lib/grade/grouping-zip-parents.wiring.test.ts src/lib/module-graph/runtime-import-graph.test.ts src/app/api/grade-run-item/route.test.ts src/app/components/grading-results/ungradedDisclosure.test.ts src/lib/grade/rubric-provenance-producers.structure.test.ts
```
Pass: the oracle file proves AC-R4 (NO-OP on undefined, sentinel-absent on the
initial-post request, disclosure present on a discussion no-reply rubric);
`engine.test.ts` proves AC-R3/AC-R6 and the AC-R2b/AC-R2c single-axis non-regression;
`prompts.test.ts`/`prompts-praise-routing.test.ts` prove AC-R5 and the `axisScope="all"`
byte-identity; `rubric-provenance-producers.structure.test.ts` stays green (section 7).

### Wave C `test:paths` line (one path per arg)
```
npm run test:paths -- src/app/components/grading/replySectionMarker.wiring.test.ts src/file-size-ceiling.structure.test.ts
```
Pass: the wiring test proves (1) `isReplySectionMarker(CANONICAL_REPLY_MARKER)===true`,
(2) the round-trip - `extractRubricCriteria` tags a criterion after the inserted marker
with `axis:"reply"`, and (3) the source-text wiring - `GradingTab.tsx` mounts
`ReplySectionInsertField` and passes it the `setRubric` that feeds `header.effectiveRubric`
(section 2 Wave C). `file-size-ceiling.structure.test.ts` proves `GradingTab.tsx` stays
`<= 620` after the mount (section 7.5).

`GradingTab.tsx` is in NEITHER the 33-consumer nor the 21-source-text-reader set, so the
rebound Wave C has NO source-text reader obligation of its own beyond the file-size
canary; the authoritative blast-radius gate is the full `npm test` step, which also runs
the import graph and every structure test. (The former round-1 Wave C readers -
`modalAdoption.wiring.test.ts`, `buttonVariant.test.ts`, `snapshot-grading.structure.test.ts`,
`cartridge-import-blackboard.test.ts` - were readers of `RubricInputModal`, the dropped
surface; they are no longer Wave C's concern but still run under full `npm test`.)

## 7. Frozen-set and line-shift obligations (delta + owner)

### 7.1 S8 frozen-multi-path guard binds THIS document
`src/tools/vitest-paths/gate-commands.structure.test.ts` S8 freezes the EXACT set of
raw multi-path test commands across `docs/**/*.md` (except `BACKLOG.md`), both
directions (`:256-278`). This `docs/a8-scoring-waves.md` file is in that scan corpus.
The `test:paths` wrapper family is explicitly EXCLUDED from the detector
(`:44`, `h.family !== "wrapper"`), and a single-path raw `vitest run` is below the
`>= 2` threshold. So this document stays S8-green BECAUSE every multi-path line above
is the `test:paths` wrapper and the only raw `vitest run` is the single-path file-size
canary. **Obligation:** no revision of this doc may introduce a raw (non-wrapper)
`vitest`/`npm test` invocation naming two or more paths - including as a "never do
this" example written with two concrete paths after a bare `vitest` token, which the
detector cannot tell from a real command. Owner: whoever edits this doc. Delta: adding
one such hit flips S8's "every hit is in the frozen set" assertion RED at the next
`npm test` of any wave. (Verified safe in this draft.)

### 7.2 The `GradingRun`-producer canary binds Wave B
`src/lib/grade/rubric-provenance-producers.structure.test.ts` live-derives every
function whose return type is `GradingRun` / `Promise<GradingRun>` (pattern `:52`) and
asserts the set equals the frozen `EXPECTED_PRODUCERS` (`:79-125`) both directions
(`:168-169`). Wave B's `scoreAxis` returns an inline object literal
(`{ rubricAreas; strengths; improvements }`), NOT `GradingRun`, so it adds NO producer
and the canary stays green with NO edit to `EXPECTED_PRODUCERS`. **Conditional
obligation:** IF a Wave B implementer gives any new helper a `GradingRun` /
`Promise<GradingRun>` return type, or renames/removes `gradeStudentEntries` /
`gradeSubmissions` / `gradeEntries` / `gradeCanvasUrl`, then
`rubric-provenance-producers.structure.test.ts` (both the scan and `EXPECTED_PRODUCERS`
with disposition + coveredBy) MUST be updated in the SAME wave. Owner: the Wave B
implementer; instrument: the canary is already in Wave B's gate. The architecture's
design does not add or rename a producer, so no edit is expected - the canary's role
here is to CATCH an accidental one.

### 7.3 File-size ceiling is auto-measured for Wave A/B files
No Wave A or Wave B file has an `ALLOWED_OVERAGE` entry or a dedicated ratchet, and the
ceiling test re-derives every file's count live, so growth within A/B files needs no
re-pinned constant. Delta: none. If any wave unexpectedly pushes a file over 1000, the
canary goes red in that wave and the wave is not verified until the file is split
(owner: that wave's implementer, with a split note from Opus verify). Wave C's
`GradingTab.tsx` is the exception - it carries a dedicated ratchet, priced in 7.5.

### 7.5 `GradingTab.tsx` RES-GRAD-5 ratchet binds Wave C (the hard constraint of this rebind)
`GradingTab.tsx` is EXACTLY 620 on both instruments (`wc -l`=620,
`@(Get-Content).Count`=620, 2026-10-05) and pinned `<= 620` by a dedicated assertion
(`GRADING_TAB_RATCHET = 620`, `file-size-ceiling.structure.test.ts:157,162`). Headroom
= 0, so any net line added to `GradingTab.tsx` breaches the ratchet and reddens every
wave that runs the ceiling canary.

**Delta + rule:** the Wave C mount of `ReplySectionInsertField` costs an import line
plus a JSX mount line (~+2). To stay `<= 620`, Wave C MUST offset that by hosting the
affordance's logic in the new `grading/` leaf AND extracting a cohesive offsetting slice
out of `GradingTab.tsx`, for a NET change `<= 0` - exactly the method N15 W3 used to
mount `GradingPictureField` and land at 620 (`f4081cb3`). Re-measure with BOTH
instruments post-mount; confirm `<= 620`.

**Who re-pins / the conflict surfaced:** the committed RES-GRAD-5 policy is "never raise
it to fit growth - extract" (`file-size-ceiling.structure.test.ts:154-155`). The round-1
checker offered "re-pin (and by how much) in the same wave" as a fallback; that conflicts
with the committed policy, so this plan adopts the policy: RAISING the pin is NOT
permitted. The only legal edit to `GRADING_TAB_RATCHET` is DOWNWARD, if the extraction
leaves `GradingTab.tsx` below 620 (then Wave C re-pins it to the new count, in the same
wave, which is why `file-size-ceiling.structure.test.ts` is a CONDITIONAL Wave C
write-set member). If a net `<= 0` mount proves infeasible, the Wave C implementer
ESCALATES (extract more, or split `GradingTab.tsx`) rather than raising the ratchet.
Owner: the Wave C implementer; instrument: the file-size ceiling canary, already in Wave
C's gate.

### 7.4 Documentation line-citation drift (not a gate)
The A8 scope/architecture docs pin `file:line` regions of the edited files. Once code
lands, those citations drift. No TEST pins an absolute line number of an edited file
(the structure tests assert on patterns/function names/import edges, never line
indices - confirmed by reading `rubric-provenance-producers.structure.test.ts` and
`file-size-ceiling.structure.test.ts`), so NO gate goes red from this. It is a
doc-hygiene note for the push's reconcile step, owner: the orchestrator at reconcile;
instrument: none required (no gate affected).

## 8. Residual register (owner, instrument, step)

A residual missing any of owner / instrument / step is a deletion - each below has all
three. The push landing any wave must reconcile these into the A8 backlog row.

- **RS-C1 (REFRAMED round 2) - the Canvas-authored rubric needs the marker convention
  documented.** The two-axis route (section 3) also fires when the rubric is authored in
  Canvas itself and fetched (`GradingTab.tsx:162`), with no in-app affordance involved.
  For that path the instructor must know the canonical marker convention. Owner: repo
  owner / docs. Instrument: owner-facing documentation of `CANONICAL_REPLY_MARKER`'s
  convention (the string Wave A freezes). Step: alongside Wave C, owner. This is NOT the
  `RubricBuilderModal.tsx` extension round 1 named - that is a different route (content-tab
  builder) and is dropped, because it does not feed `gradeCanvasUrl` and so would be a
  dead affordance just as `RubricInputModal` was.
- **RO-3 (owner-facing riding confirmation, NOT a gate) - the Wave C surface choice.**
  Wave C as rebound is an in-app "insert reply section" affordance on `GradingTab.tsx`'s
  typed rubric field (discoverability). The alternative is that the marker is authored
  directly in the instructor's Canvas rubric, in which case Wave C collapses to the
  docs-only residual RS-C1 and there is no in-app build. This plan PROCEEDS on the
  recommended reading (build the GradingTab affordance): A + B already make the marker
  reachable either way (section 3), and the in-app affordance is the cheaper-friction
  discoverability win. Owner: repo owner. Instrument: a one-line confirm/redirect. Step:
  rides alongside Wave C; if the owner prefers docs-only, Wave C's build is discarded for
  RS-C1 at low cost (the new leaf + wiring test, no engine/parser work). Recorded so the
  owner can redirect cheaply.
- **RS-1 - absent-reply scoring policy (reply section, zero replies).** Owner:
  test-author at build time. Instrument: a unit test on the code-composed absent-reply
  areas (architecture 3.4). Step: Wave B. Recommended reading: code-composed absence,
  no model call; flagged in case the owner wants a different policy.
- **RS-2 - two-call reliability.** Owner: reliability pass / test-author. Instrument:
  a unit test that a thrown reply-axis pass fails the WHOLE student as a grading-failed
  row (today's per-student all-or-nothing, the catch at `engine.ts:287-309`), not a
  half grade. Step: Wave B.
- **R-AXIS-BLAST - the 33-file consumer set + 21 source-text readers.** Owner: this
  plan (discharged). Instrument: the two greps in section 4, intersected per wave;
  same-path proof in section 5.1, reader classification in section 4.2. Step: done
  before dispatch - this document IS the discharge.
- **R5 / AC-R7 - authoring control + per-axis score DISPLAY render.** Owner:
  verify/UX pass. Instrument: a running-app walk/screenshot (no component renders under
  vitest). Step: after Wave C, before it ships.
- **R6 - `grading.ts` budget (977/1000, no `ALLOWED_OVERAGE`,
  `file-size-ceiling.structure.test.ts:41`).** Owner: the plan seat of any future wave
  that edits `grading.ts`. Instrument: `@(Get-Content src/app/actions/grading.ts).Count`
  vs LIMIT. Step: before such a wave. NOT edited this round.
- **RO-1 (AC-R8) - the model's OUTPUT honours the two-axis structure / the scope
  directive.** Owner: repo owner. Instrument: one live `gradeCanvasUrl` run of a real
  graded discussion with a reply-section rubric (no live Gemini / no API key here).
  Step: owner walk. The machine ACs prove the model RECEIVES the structure; obedience
  is argued, not measured.
- **RO-2 (R-FORK-A-CONFIRM) - re-affirm "one rubric with a reply section" before
  Wave C.** Owner: repo owner. Instrument: confirm the 2026-09-15 decision still holds;
  `docs/a8-scope.md` section 2 states the switch cost if it changed. Step: alongside
  Wave C, not a gate on this plan.
- **R1 / R2 - Route C (`gradeOneSubmissionAction`) and Route D (`_post.txt` / external
  API).** Owner: repo owner. Instrument: one live call each (no live Canvas / external
  service here). Step: future, owner. Untouched this round.

## 8a. Flag for the orchestrator (NOT fixed here - a different doc, already-SHIP)

`docs/a8-scoring-architecture.md:586-587` carries the SAME false claim this round
corrected: it states `RubricInputModal.tsx` is a consumer "via `RubricBuilderModal.tsx`
(both in the 33-file set, section 10)" and treats `RubricInputModal` as the authoring
surface for the scored rubric. That is wrong for the two-axis route (section 3 here):
`RubricInputModal` is NOT in the 33-file set and does not feed `gradeCanvasUrl`. The
architecture is checked-SHIP and Waves A/B are already dispatched against it, so this
plan does NOT edit it (out of this round's scope, and it would desync an in-flight
consumer). Its Wave A/B content is unaffected - only its section-8 account of the
authoring surface needs the same correction. Routed to the orchestrator to decide whether
to patch the architecture's Wave-C surface section; no gate depends on it.

## 9. What this plan could not determine (environment limits, `this-repo.md` section 6)

- **No live Gemini / no API key:** whether the model OBEYS the scope directive and
  honours the two-axis structure is AC-R8 / RO-1, owner-verified. The STRUCTURAL
  guarantee (reply prose absent from the initial-post request) IS machine-verifiable
  (Wave B oracle, section 2).
- **No component renders under vitest:** the authoring control and per-axis score
  display are owner/OV (R5, AC-R7). No requirement in this plan is enforced only by a
  render; the UI-to-parser link is the Wave C source-text wiring test.
- **No live Canvas:** Routes C/D stay owner residuals (R1/R2). The post path is
  verified by reading `postCanvasGrades` (`grades.ts:128-143`), not by a live post.
- **Projected line additions (section 1) are the architecture's estimates**, not
  measurements of code that does not exist yet; the file-size ceiling canary measures
  the real post-build counts in every wave, which is the enforcement.
