# A25 scope: cross-assignment trend accumulation - REVISION 2

Row: `docs/backlog.yml`, `- id: 'A25'`, at line **457** measured this pass
(`grep -n "id: 'A25'" docs/backlog.yml` -> `457:- id: 'A25'`; canary
`grep -n "id: 'A25ZZZ'" docs/backlog.yml` exits 1, so the pattern
discriminates). State `unscoped`, `blocked_by: []`, `owns: []`.

**This is revision 2 and it is TERMINAL.** Written against
`docs/a25-rulings.md` at commit e25e56d, which disposes round 1's check
(`docs/a25-check.md`: NOT BUILDABLE, 5 blockers / 9 majors / 4 minors). Under
`AGENTS.md` "Two rounds, then ask" and `docs/loop/iteration-caps.md` cap 2
there is no round 3: everything not settled here is a residual with all five
fields (section 11), or the owner question in section 13, which gates nothing.

**Measurement discipline for this revision.** RULING 62 found three mechanical
classes in revision 1: a named instrument that produced no output, three
"measured this pass" figures that were another card's stale numbers, and a gate
misattributed to a file deliberately exempt from it. So **every command below
was re-run in this checkout on 2026-09-27 and its output read before the
sentence around it was written**; every absence claim carries a canary that
exercises the same pattern and the same filter; no command whose exit status
matters is piped through `wc -l`, `cat` or `head`. Where a citation revision 1
carried has moved, both addresses are given.

**Concurrency snapshot.** `git status --short` at the start of this pass listed
`docs/css-orphans.md`, `src/app/components/grading-recording/GradingRecordingPanel.tsx`,
`src/app/components/grading-recording/grading-rows.test.ts`,
`src/app/components/ppt-design/{TemplateSelector.tsx,hooks.ts,index.tsx}`,
`src/lib/grade/engine.ts`, `src/lib/supabase/types.ts` modified and four
untracked paths, all belonging to concurrently running agents. **No load-bearing
claim below rests on any of those files.** `src/lib/grade/engine.ts` is cited
once, for `DEFAULT_MAX_SUBMISSIONS`'s application site, and that citation is
flagged as a snapshot where it appears.

---

## 0. How to read this revision, and what is dispatchable now

The owner question in section 13 - **is A25 its own layer, or an additional
signal inside the existing `src/lib/course-intel/` subsystem?** - is not this
scope's to settle. So this document is structured so that the answer changes as
little as possible:

| Part | Branch (A), own layer | Branch (B), signal inside course-intel | Dispatchable now? |
|---|---|---|---|
| Sections 3, 4, 5 - the corpus read, the join key, the unkeyable remainder, the denominators | identical | identical | **YES** |
| Section 8 - the leverage claim | identical | identical, with one extra requirement (REQ-9) | **YES** |
| Section 6 - the surface, the trigger, the reachability instrument | a per-course modal off the courses table | no new surface; a counted fact inside the existing answer | **NO - NOT DISPATCHABLE** |
| Section 7 - persistence and any `ta-` key | one new key, or none | none | **NO - NOT DISPATCHABLE** |
| Section 10 - the wave plan | waves 1/2A/3 | waves 1/2B | wave 1's CONTENT only, with the caller caveat in 10.1 |

**Wave 1's content is settled under either answer; wave 2 is not, and is marked
NOT DISPATCHABLE throughout.** Wave 1 is not, however, independently compliant
with this repo's caller rule - both its new exports are called only by the
surface - so section 10.1 recommends merging waves 1 and 2 once the answer
arrives, and states what landing wave 1 alone does and does not buy. Section 10
states per branch what changes.

---

## 1. Disposition of revision 1

Revision 1 is `docs/a25-scope.md` at commit b26e072
(`git log --all --oneline -- docs/a25-scope.md` returns exactly one commit,
b26e072). This is a restructuring, so `iteration-caps.md` entry gate 3 requires
the table below before anything else. Every prior requirement, recommendation
and residual is mapped to kept / handed over / withdrawn.

| Revision 1 item | Disposition | Detail |
|---|---|---|
| Sec 0: correct the row's own `GradingRunEntry` citation | **KEPT, re-measured** | Row says `types.ts:320-338`; revision 1 said `:353-362`; measured today `grep -n "^export interface GradingRunEntry" src/lib/grade/types.ts` -> `362`, body closes at `371`. See section 2. |
| Sec 1: no cross-assignment reducer exists | **KEPT** | Re-verified with a widened absence search and canaries, section 3.1. |
| Sec 1: a reviewed draft is a durable, growing history | **KEPT, with a corrected premise** | The conclusion holds; two of the three facts revision 1 gave for it are false. Section 3.2. |
| Sec 1: `deleteGradingDraft`'s "one caller ... wired only to an explicit user discard button - never called automatically" | **WITHDRAWN as false** | Measured: two callers of the lib function, and `deleteGradingDraftAction` is called automatically by an unattended step. Section 3.2. It protected no enforcer - no test asserted it. |
| Sec 1: "nothing reads a reviewed row back" | **WITHDRAWN as overstated** | `getGradingDraft` has no status filter, so a reviewed row IS readable by id. What does not exist is any ENUMERATION. Section 3.2. |
| Sec 2.1: the stored shapes table | **KEPT, re-measured** | Section 2. |
| Sec 2.2: "no stable course identifier on a stored run", Option A / Option B, recommend A | **WITHDRAWN** | RULING 61. A stable id is recoverable at zero type cost, and `src/lib/course-canvas-url-match.ts:3` rules against Option A's mechanism in its own header. Replaced by REQ-1..REQ-4, section 4. Enforcer it protected: none. |
| Sec 2.3: the over-fetch finding | **KEPT and strengthened into REQ-7** | The allowlist also keeps `student`; section 5.3. |
| Sec 2.4: the privacy foreclosure | **WITHDRAWN by RULING 59** | Persistence is available. `docs/owner-decisions-2026-09-23.md` DECISION 10 settles it. Section 7 states what IS binding, and does not replace the foreclosure with a better-cited one. |
| Sec 3.1: Candidate 1, Drafted Grades, gated on `effectiveCourseFilter !== "all"`, RECOMMENDED | **WITHDRAWN by RULING 60** | The gate is computed from the pending-only population, so the panel never renders in the state the feature exists for. Section 6.1. |
| Sec 3.1: Candidate 2, RecordingTab's sub-tab strip | **WITHDRAWN** | Not chosen, and its three cited gate line numbers were wrong by 11 (RULING 62 / check M2). Correct values in section 6.1. |
| Sec 3.1: "the 1000-line ceiling (`file-size-ceiling.structure.test.ts:41`)" applied to `RecordingTab.tsx` | **WITHDRAWN as misattributed** | `RecordingTab.tsx` is listed in `COVERED_BY_RECORDING_SPLIT_CHECK` at `:52`; its real gate is `recording-split.structure.test.ts:58`. Section 6.1. |
| Sec 3.2: the reducer is a new file under `src/lib/grade/`, not an edit to `class-trends.ts` | **KEPT** | Section 10, wave 1. |
| Sec 3.2: import types through `@/lib/grade/types`, never the barrel | **KEPT as REQ-10** | Section 9. |
| Sec 4: no new `ta-` key required; no exact-key-set canary exists | **HANDED OVER to the wave-2 architect** | The claim was measured for `drafted-grades/`, which is no longer the host. Section 7 re-measures it for the new host directory. Receiver: the wave-2 architect, whose obligation is to state which key-set canary covers the host it picks, measured. |
| Sec 4: "DraftedGradesTab's own three" `ta-drafts` keys | **WITHDRAWN as wrong** | Four, not three: `ta-drafts-collapsed` at `DraftedGradesTab.tsx:68`. Moot under the new host but recorded so the count is not inherited. |
| Sec 5: CORPUS is EARNED, conditionally; thin until N13b | **WITHDRAWN by RULING 63** | Automatic population is REMOVED SETUP, the struck click-cost branch. Replaced by section 8's narrower claim. |
| Sec 5: sequence A25's reducer AFTER N13b | **WITHDRAWN** | RULING 63: N13b enriches the per-area signal and does nothing to convert removed setup into an advantage. `blocked_by: []` stands. |
| Sec 6: wave plan, 3 waves | **KEPT, restructured per branch** | Section 10. |
| Sec 6: "every wave includes the file that CALLS the new export" | **KEPT, and revision 1 violated it** | Check M5: nothing in revision 1's wave 1 called the reducer. Fixed in section 10 by putting the reducer's caller in wave 1. |
| R-A25-1, UI reachability in a browser | **KEPT, narrowed** | RES-1. Most of what it covered is now an executing instrument (REQ-5, REQ-6). |
| R-A25-2, course-identity collision | **WITHDRAWN as a residual, PROMOTED to REQ-2/REQ-3/REQ-4** | Its instrument was an event ("reported by the owner") and its step was "only if/when reported". RULING 61. The narrower judgement that remains is RES-2, with an executing count behind it. |
| R-A25-3, row-count growth | **KEPT** | RES-3. Revision 1's version satisfied four of five fields; the step is now unconditional. |
| R-A25-4, data minimization | **WITHDRAWN as a residual, PROMOTED to REQ-7** | Two owners and two remedies-as-instrument. The part that genuinely cannot be measured here is folded into RES-3. |
| R-A25-5, is a coarse trend worth reading | **KEPT, re-instrumented** | RES-4. Its instrument was a backlog row (a document); it is now a count the panel renders. |
| R-A25-6, removal-test buildability | **WITHDRAWN as a residual, PROMOTED to REQ-8** | Check B5: the proposed test was unchanged by the deletion it was meant to detect. REQ-8 changes KIND (a transitive-import ban, not a pure-function assertion), as cap 1 requires. It protected no existing enforcer. |
| R-A25-7, UI/keyboard reachability | **WITHDRAWN as a duplicate, replaced by REQ-11 + RES-1** | Its instrument was "reading claims only" and its direction of failure silently changed the object from the panel to the wording of a later document. |

Count: 8 kept, 2 handed over, 11 withdrawn, 4 promoted from residual to
requirement. No revision-1 item had an executing test behind it, so nothing in
the withdrawn column removes an enforcer.

---

## 2. Measurement basis

Commands run 2026-09-27 in this checkout. `git log --oneline -1` -> `e25e56d`.

**The type every later section keys on.** `grep -n "^export interface
GradingRunEntry" src/lib/grade/types.ts` -> `362`. Canary: the same grep for
`GradingRunEntryZZZ` exits 1. `sed -n '362,371p'` shows the body, unchanged in
shape from revision 1:

    export interface GradingRunEntry {
      courseName: string;
      assignmentName: string;
      canvasUrl: string;
      run: GradingRun;
      institution?: string;
      assignmentId?: string;
      pointsPossible?: number | null;
      offline?: boolean;
    }

`grep -n "courseId" src/lib/grade/types.ts` exits 1 with no output; canary
`grep -c "courseName" src/lib/grade/types.ts` -> `1`, so the file was read and
the negative is real. **There is no `courseId` field.**

**Line counts, both mandated instruments, every file this scope's design
touches or measures headroom against.** `wc -l` from the Bash tool and
`@(Get-Content <file>).Count` from PowerShell, run separately:

| File | `wc -l` | `@(Get-Content).Count` |
|---|---|---|
| `src/app/actions/grading.ts` | 941 | 941 |
| `src/app/api/course-intel/ask/route.ts` | 976 | 976 |
| `src/app/components/CoursesTab.tsx` | 474 | 474 |
| `src/app/components/courses/CoursesTable.tsx` | 792 | 792 |
| `src/app/components/courses/CourseRow.tsx` | 694 | 694 |
| `src/app/components/courses/AskAiModal.tsx` | 152 | 152 |
| `src/app/components/DraftedGradesTab.tsx` | 898 | 898 |
| `src/app/components/RecordingTab.tsx` | 917 | 917 |
| `src/app/components/drafted-grades/ClassTrendsPanel.tsx` | 212 | 212 |
| `src/app/components/ui/ModalShell.tsx` | 108 | 108 |
| `src/lib/grading-drafts.ts` | 377 | 377 |
| `src/lib/grading-draft-view.ts` | 174 | 174 |
| `src/lib/grade/class-trends.ts` | 355 | 355 |
| `src/lib/grade/class-trends-insight.ts` | 270 | 270 |
| `src/lib/grade/class-trends-draft.ts` | 228 | 228 |
| `src/lib/canvas-url.ts` | 128 | 128 |
| `src/lib/course-canvas-url-match.ts` | 372 | 372 |
| `src/lib/course-intel/concern.ts` | 277 | 277 |
| `src/lib/course-intel/engagement.ts` | 906 | 906 |
| `src/lib/course-intel/types.ts` | 663 | 663 |
| `src/lib/course-intel/context-block.ts` | 429 | 429 |
| `src/lib/course-intel/offline-assembly.ts` | 758 | 758 |
| `src/lib/course-intel/offline-payload.ts` | 354 | 354 |
| `src/lib/canvas/submissions-grid.ts` | 264 | 264 |

Both instruments agree on all 24. `docs/loop/this-repo.md` opens by recording
that they have disagreed by 15 to 138 elsewhere and that 42 is the smallest
recorded gap, not a bound - so agreement here is a measurement, not an
assumption, and `Measure-Object -Line` was not used.

**The ceiling that binds them.** `grep -n "LIMIT = 1000"
src/file-size-ceiling.structure.test.ts` -> `41`. Canary: `grep -n "LIMIT =
9999"` on the same file exits 1. `grep -n "RecordingTab"
src/file-size-ceiling.structure.test.ts` -> `31` (a comment) and `52`, the
latter inside `COVERED_BY_RECORDING_SPLIT_CHECK`, whose own comment says
re-failing those paths "would be a duplicate report" - so that file is
deliberately exempt here and its ceiling is enforced by
`src/app/components/recording/recording-split.structure.test.ts:58` ("should
keep RecordingTab.tsx under 1000 lines", via `countLines` imported at `:18`).
`src/app/actions/grading.ts` is NOT in `ALLOWED_OVERAGE`
(read in full at `:76-92`), so at 941 lines it has **59 lines of headroom**
against the repo-wide gate. That is a wave-1 constraint, section 10.

**Source-text instrument population, re-measured rather than quoted.**
`find src -name "*.wiring.test.ts" | wc -l` -> **79**;
`find src -name "*.structure.test.ts" | wc -l` -> **22**. Canary:
`find src -name "*.wiringZZZ.test.ts" | wc -l` -> `0`.
`docs/loop/this-repo.md` section 2 prints 68 and 17 and tells the reader to
measure rather than quote it; those figures are stale and are not used here.

---

## 3. What exists, traced from the control to the code

### 3.1 There is no cross-assignment reducer. Widened search, with canaries.

`grep -n "export function computeClassTrends" src/lib/grade/class-trends.ts` ->
`259:export function computeClassTrends(entry: GradingRunEntry):
ClassTrendsReport`. It takes **exactly one** entry. Canary: the same grep for
`computeClassTrendsZZZ` exits 1.

The absence was searched wider than one pattern:

    grep -rn "GradingRunEntry\[\]" src --include=*.ts --include=*.tsx | grep -v "\.test\."   -> 8 lines
    grep -rn "Array<GradingRunEntry" src                                                     -> no output, exit 1

The 8 are `actions/grading.ts:282`, `grading-drafts.ts:33`,
`grading-review-rows.ts:95,109,154`, `steps.grading-cartridge.ts:45`,
`steps.grading-draft-flow.ts:224`, `steps.grading-run.ts:426` - every one is a
single session's runs array being built, stripped, or turned into review rows.
None reduces runs from different points in time. `grep -rln "trend\|Trend"
src/lib/course-intel/` exits 1 with no output; canary `grep -rln "supabase"
src/lib/course-intel/ | head -3` returns three files, so the directory is
greppable and the negative is not a path artefact.

**Conclusion, unchanged from revision 1 and re-verified:** this is not the
"already built, merely unreachable" pattern. The reducer and the read-back both
have to be built. What exists is the corpus and a single-run reducer.

### 3.2 The corpus: durable, but NOT for the reasons revision 1 gave

`grading_drafts` stores one row per grading run with `payload jsonb` holding
`{ runs: GradingRunEntry[] }` (`src/lib/grading-drafts.ts:32-41`;
`supabase/migrations/20260811000000_create_grading_drafts.sql:7-15`, read in
full). RLS is on (`:20`) with four per-user policies - select at `:23`, insert
at `:28`, update at `:33`, delete at `:38` - and the only index is
`grading_drafts_user_created_idx on (user_id, created_at)` (`:17-18`) -
**there is no index on `status`**, which matters to RES-3.
`grep -rln "grading_drafts" supabase/migrations/ | wc -l` -> `4`; the fourth,
`20261004000000_generated_artifacts.sql`, mentions the table only in a comment
and alters nothing (opened).

Every function in `grading-drafts.ts` scopes by user: `grep -n '\.eq("user_id"'
src/lib/grading-drafts.ts` -> `254, 280, 302, 344, 361, 373`. Only two carry a
status filter: `grep -n '\.eq("status"' src/lib/grading-drafts.ts` -> `255,
281`, i.e. `listPendingGradingDrafts` (`:248`) and
`findPendingGradingDraftForWorkflow` (`:272`).

**Three corrections to revision 1, all measured.**

1. **`deleteGradingDraft` has two callers, not one.** `grep -rn
   "deleteGradingDraft\b" src --include=*.ts --include=*.tsx | grep -v
   "\.test\." | grep -v "deleteGradingDraftAction"` returns
   `actions/grading.ts:430` (inside `deleteGradingDraftAction`, `:424`) and
   **`src/app/components/DraftedGradesTab.tsx:193`**, which calls the lib
   function directly with the browser client. Canary: the same grep for
   `deleteGradingDraftZZ\b` exits 1.

2. **A draft IS deleted automatically, by an unattended step.** `grep -rn
   "deleteGradingDraftAction" src --include=*.ts --include=*.tsx | grep -v
   "\.test\."` returns, besides the declaration,
   `steps.grading-repos.grade-repo.ts:127` and `steps.grading-repos.ts:133`.
   The first is inside `findEquivalentOrReplaceableDraft` (`:112-140`, read in
   full): an unattended repo-grading re-run looks up its own prior draft and
   **deletes it** when the fresh results differ. The second is the
   attended-only "Discard a grading draft" step (`:120-142`), which deletes by
   id with no status check. So revision 1's "never called automatically after
   review" is false.

   **The conclusion survives, for a different reason.** The automatic delete
   resolves its target through `findPendingGradingDraftForWorkflowAction(...,
   "repos")`, and `findPendingGradingDraftForWorkflow` carries
   `.eq("status", "pending")` at `:281` - so a REVIEWED row is never its
   target. The one path that can erase a reviewed row is the attended
   "Discard a grading draft" step, invoked with that row's id. That is the
   honest answer to "what deletes this data": a reviewed draft is durable
   against every automatic path and erasable by one explicit attended step and
   by the tab's own discard button.

3. **A reviewed row is readable, just not enumerable.** `getGradingDraft`
   (`:295`) has no status filter - `.eq("user_id", userId)` at `:302` is its
   only filter - and `getGradingDraftAction` (`actions/grading.ts:374`) returns
   `status: "pending" | "reviewed"` (`:380`). So the review workflow already
   reads reviewed rows by id. `grep -rn "listReviewedGradingDrafts" src` exits
   1 with no output; canary `grep -rln "listPendingGradingDrafts" src | wc -l`
   -> `5`. **What is missing is an enumeration, not a read.**

### 3.3 Reuse survey: the comparable subsystem revision 1 missed

RULING 63. `src/lib/course-intel/` already holds a cross-assignment,
course-scoped reducer. Every citation opened:

- `src/lib/canvas/submissions-grid.ts` (264 lines), header at `:1-3`:
  "Course-wide submission grid: every submission in a course, in ONE paginated
  read, independent of assignment count."
- `src/lib/course-intel/types.ts:189`: `byAssignmentId: Readonly<Record<string,
  StudentSubmissionFact>>` on a per-student record - a cross-assignment
  structure.
- `src/lib/course-intel/engagement.ts:435`: `export function
  computeEngagementSet(args: ComputeEngagementArgs): EngagementSet`, in a
  906-line module that reduces across assignments.
  `src/lib/course-intel/types.ts:555` documents the rendered fact
  "3 of 7 assignments missing", built in code - a cross-assignment aggregate
  with a stated denominator.
- `src/lib/course-intel/concern.ts` (277 lines), header at `:1-2`: "THE
  CONCERN SET. This file is the security control, not a helper" - a pure
  reducer over typed numbers, computed in TypeScript before any model call
  (`src/app/api/course-intel/ask/route.ts:777`, `computeConcernSet`), with a
  receipt over the model's answer at `:868`
  (`unexplainedStudentIndices`). `docs/loop/leverage.md:42` cites these as
  `:773-781` and `:864-871`; both have drifted and the values above are today's.
- **It keys on the same parsed Canvas course id A25 needs.**
  `src/app/api/course-intel/ask/route.ts:525`:
  `const canvasCourseId = parseCanvasCourseId(course.canvasUrl ?? "");`
- It is reachable: `src/app/components/course-intel/index.tsx` is rendered by
  `src/app/page.tsx:662`, imported at `:20`.

**What it does NOT have, measured.** `grep -rln "trend\|Trend"
src/lib/course-intel/` exits 1. `grep -rln "grading_drafts\|grading-drafts"
src/lib/course-intel/ src/app/api/course-intel/` exits 1; canary
`grep -rln "supabase" src/lib/course-intel/ | head -3` returns three files. So
the subsystem has no trend vocabulary and never reads the grading-draft table.

**And one thing it deliberately refuses, quoted with its scope stated.**
`src/lib/course-intel/offline-payload.ts` is that subsystem's wire boundary for
the offline path. Its header (`:11-18`) states: "DATA MINIMISATION IS
STRUCTURAL HERE, NOT A CONVENTION (D7). `mapOfflineAssemblyInputs` reads
exactly six fields off a `GradingRow` ... Nothing else is accepted here." And
at `:207-210` it sets `rubricAreas: []` with the reason "This offline mapping
has no rubric-area source of its own".

**What that passage forbids, and what it does not.** It fixes the six fields
the OFFLINE path's Route-Handler wire accepts off a browser grading row. It is
scoped to that one function and that one path. It does **not** forbid rubric
areas anywhere else, it is not an owner decision, and it says nothing about
`grading_drafts`, which is server-side and never crosses that wire. It is
therefore a **cost stated for branch (B)** in section 13, not a foreclosure -
per `docs/loop/traps-spec.md:123-129`, a comment is not a ruling.

A second related measurement, so nobody later mistakes the on-device grading
table for A25's corpus: `src/app/components/grading-recording/grading-row-serialization.ts:308-317`
states that `rubricAreas` "never reaches storage" under `ta-rec-grade-table`,
because "this run's cohort is `useState` and does not survive a reload", and
`fromWire` "emits `[]` UNCONDITIONALLY". So the durable rubric-area corpus in
this app is `grading_drafts.payload`, and only that.

---

## 4. The join key (RULING 61), and the remainder measured across every producer

### 4.1 The key

A stable course identifier IS recoverable from a stored entry at zero type
cost, by the function the app already uses for exactly this:

- `src/lib/canvas-url.ts:87`: `export function parseCanvasCourseId(url:
  string): string | null`, body `url.match(/\/courses\/(\d+)/)` at `:88-89`.
- `grep -rn "parseCanvasCourseId(entry.canvasUrl" src --include=*.ts
  --include=*.tsx` returns three live sites:
  `src/app/components/DraftedGradesTab.tsx:390`,
  `src/lib/workflows/registry/steps.grading-draft-flow.ts:458`,
  `src/lib/workflows/registry/steps.grading-run.ts:676`. Canary: the same grep
  for `parseCanvasCourseIdZZZ(entry.canvasUrl` exits 1.
- `grep -rn "parseCanvasCourseId" src --include=*.ts --include=*.tsx | grep -v
  "\.test\." | wc -l` -> **94** non-test occurrences, so this is the app's
  ordinary way of getting a course id out of a stored URL.

**And the repo holds a rule against the string key revision 1 recommended.**
`src/lib/course-canvas-url-match.ts:3` (header, opened): "on
parseCanvasCourseId(url) AND host, **never raw string equality**", and the
matching rule at `:180`: "COURSE ID must match on both sides
(parseCanvasCourseId), full stop."

**REQ-1.** The reducer groups entries by `parseCanvasCourseId(entry.canvasUrl)`
and by nothing else. **Object:** the grouping key the reducer computes.
**Instrument:** a unit test on the reducer that feeds two entries with
identical `courseName` and different `canvasUrl` course ids and asserts two
groups, plus two entries with different `courseName` and the same
`canvasUrl` course id and asserts one group. **Direction of failure:** RED if
either pair lands in the wrong number of groups - i.e. red the moment the
implementation falls back to `courseName` equality.

### 4.2 Do NOT reuse `findCourseForCanvasUrl` as the join. Measured reason.

`findCourseForCanvasUrl` (`src/lib/course-canvas-url-match.ts:292`) is generic
over `T extends { canvasUrl: string | null; institution?: string | null }`, so
a `Course` satisfies it, and calling it with a one-element array looks like the
right reuse. **It is not**, and the reason is in its own body, read in full at
`:300-371`:

- Step 1 (`:316`, the comment; the filter follows) keeps only rows whose parsed
  id equals the passed URL's.
- Step 2 (`:324` comment, `:328` the `if (tabHost) {` branch) returns a match
  only when the stored side's host AND the passed URL's host are both non-null
  and equal.
- Otherwise step 3 (`:336` comment, `:339` the filter) runs, and branch (a) -
  the unique, host-inconclusive case at `:345` - opens
  `if (!normalizedAcronym) return null;` at **`:351`**
  (`grep -n "normalizedAcronym) return null" src/lib/course-canvas-url-match.ts`
  returns `351` and `369`, the second being branch (b) at `:364`).
- The module's own header at `:50-55` records that no current caller supplies
  `knownAcronyms` and describes the acronym argument as optional.

So a call with no acronym returns **null** for every entry whose stored URL is
the host-less `/courses/<id>` shape that the doc comment at `:193` says
"LmsCell.tsx/CoursePicker.tsx actually emit". Reusing it would silently drop
those entries from every course's history. `hostOf`, the host half, is
module-private (`grep -n "function hostOf" src/lib/course-canvas-url-match.ts`
-> `106`, with no `export`), so the host clause is not separately reusable
either.

**REQ-2.** `src/lib/course-canvas-url-match.ts` appears on the do-not-reuse
list with the reason above; the reducer reuses `parseCanvasCourseId` from
`@/lib/canvas-url` directly, applied to BOTH sides of the comparison.
**Object:** the reducer's import list. **Instrument:** a source-text assertion
that the reducer imports `parseCanvasCourseId` from `@/lib/canvas-url` and does
not import `course-canvas-url-match`. **Direction of failure:** RED if the
reducer imports the matcher, or if it compares a raw `canvasUrl` string.

### 4.3 The remainder is NOT distinguished by `offline`. RULING 61 corrected.

RULING 61 says offline runs are "a NAMED remainder with a distinguishing flag".
That is true of one producer and false of four. Measured:

    grep -rn 'canvasUrl: ""' src --include=*.ts --include=*.tsx | grep -v "\.test\."
    grep -rn "offline: true" src --include=*.ts --include=*.tsx | grep -v "\.test\."

Of the sites that build a `GradingRunEntry` which reaches a `grading_drafts`
row:

| Producer site | `canvasUrl` | `offline` |
|---|---|---|
| `steps.grading-run.ts:497-505` (online) | `row.canvasUrl ?? ""` | absent |
| `steps.grading-run.ts:554-560` (offline) | `""` (`:557`) | `true` (`:559`) |
| `steps.grading-cartridge.ts:216-223` | `""` (`:219`) | `true` (`:221`) |
| `steps.grading-repos.grade-repo.ts:462-469` | `""` (`:465`) | **absent** |
| `steps.grading-repos.helpers.ts:339-347` | `assignmentUrl` (`:342`), which the unattended caller passes as `""` at `:428` | **absent** |
| `steps.grading-repos.ts:271-277` | `""` (`:274`) | **absent** |
| `steps.grading-repos.ts:321-327` | `""` (`:324`) | **absent** |
| `actions/grading.ts:312-320` (`buildZeroGradingEntry`) | `${baseUrl}/courses/${courseId}/assignments/${assignmentId}` (`:315`) | absent |

`grep -c "offline" src/lib/workflows/registry/steps.grading-repos.ts` -> `0`
(exit 1); canary `grep -c "GradingRunEntry"` on the same file -> `4`, so the
file was read. **Four draft-reaching producer sites emit an empty `canvasUrl`
with `offline` undefined**, so `offline?: boolean` does not name the remainder.

**Worse for the withdrawn Option A, on two independently measured counts.**
First, two of those sites set `courseName: r.fullName`
(`steps.grading-repos.ts:272` and `:322`), and `r.fullName` is the value passed
as `repo:` to `buildRepoGradingLogEntry` at `:264` - a repository identifier,
not the instructor's course name - while the other two repo sites use
`tile.name`. So the string key would split one course's repo-graded history
across two spellings, on top of the collision hazard revision 1 deferred.
Second, `actions/grading.ts:313` sets `courseName: "Course"` - a literal string,
identical for every course the zero-drafting path ever touches, so a string key
would merge every one of them into a single fictitious course. That same
producer's `canvasUrl` IS parseable (`:315`), so REQ-1 groups those rows
correctly and REQ-3 never counts them as unkeyable: the parsed-id key is not
merely tidier here, it is the difference between right and silently wrong.

**And Option B (thread `courseId` through) has its own measured gap:**
`steps.grading-run.ts:110` sets `courseId: ""` with the comment "no local
tile", so the field revision 1 proposed to thread is already empty on one of
its own populate paths (`grep -n "courseId:"
src/lib/workflows/registry/steps.grading-run.ts` -> `62, 110, 200, 223, 398`).

**REQ-3.** The reducer returns a counted `unkeyableEntryCount` (entries for
which `parseCanvasCourseId(entry.canvasUrl)` is null), and never silently drops
them. **Object:** the reducer's return value on a mixed input. **Instrument:** a
unit test feeding three entries - two keyable to the same id, one with
`canvasUrl: ""` and `offline` undefined - asserting one group of two and
`unkeyableEntryCount === 1`. **Direction of failure:** RED if the third entry
is dropped without being counted, and RED if the count is derived from
`entry.offline` rather than from the parse result.

**REQ-4.** The surface renders `unkeyableEntryCount` whenever it is non-zero,
in the same sentence as the denominator. **Object:** the rendered summary.
**Instrument:** a source-text wiring assertion that the surface's render path
reads `unkeyableEntryCount`. **Direction of failure:** RED if the field is
computed and never read, which is how "a term with no history" and "a term
whose history could not be keyed" become indistinguishable on screen.

---

## 5. The corpus read

### 5.1 The population requirement - this is where round 1's blocker lived

Check B2 / RULING 60: revision 1 gated the feature on a value derived from the
pending-only population. The fix is not only a different surface; it is a
stated requirement about the population, with an executing instrument.

`listPendingGradingDrafts` (`grading-drafts.ts:248-260`) is
`.select("*").eq("user_id", userId).eq("status", "pending").order("created_at",
{ ascending: true })`. A25's subject is REVIEWED runs, so the new function must
not carry that filter.

**REQ-5.** The new list function's query carries `.eq("user_id", userId)` and
does **not** carry `.eq("status", "pending")`. **Object:** the sequence of
`.eq(column, value)` pairs the function sends. **Instrument:** an executing
unit test using the fake-Supabase idiom this repo already has at
`src/lib/grading-drafts.test.ts:269-334` (a hand-built object whose `from`/
`insert`/`select`/`single` chain records what it was called with), extended so
`select()` returns a recorder whose `eq()` appends `[column, value]` and whose
`order()` resolves to `{ data: [...], error: null }`. Assert the recorded pairs
contain `["user_id", <id>]` and do not contain `["status", "pending"]`.
**Direction of failure:** RED if the recorded pairs include
`["status", "pending"]`, and RED if `["user_id", ...]` is absent.

That assertion is the thing revision 1 had no instrument for. It fails on the
exact edit that would reintroduce the blocker, and it executes under this
repo's node-env vitest with no database.

### 5.2 Read path: no new server action is needed

`DraftedGradesTab.tsx` reads `grading_drafts` **from the browser** with the
provider's client: `useSupabase()` imported at `:6`, destructured at `:91`,
`listPendingGradingDrafts(supabase, user.id)` at `:151` and `:173`, inside the
async-IIFE-plus-`cancelled`-flag effect at `:140-167`, and
`deleteGradingDraft(supabase, user!.id, draft.id)` at `:193`. RLS is on the
table (`20260811000000_create_grading_drafts.sql:20-30`), so the browser client
is sufficient and is the established pattern for this table.

**REQ-6.** The new read reuses that client-side pattern; no new export is added
to `src/app/actions/grading.ts`. **Object:** wave 1's write set. **Instrument:**
`git status --short` against the wave's file list at the wave gate, plus
`@(Get-Content src/app/actions/grading.ts).Count` unchanged at 941.
**Direction of failure:** the wave fails if `src/app/actions/grading.ts`
appears in `git status --short`.

This is not only tidiness: that file is at **941 lines with 59 of headroom**
(section 2), it is not in `ALLOWED_OVERAGE`, and it is the file a concurrent
agent is most likely to be in. If branch (B) is chosen the read must instead be
reachable server-side - see section 10.2, where REQ-6 is the one requirement
that changes.

### 5.3 What the read must not carry

`stripGradeResultForDraft` (`src/lib/workflows/grading-review-rows.ts:40`)
keeps, explicitly enumerated from `:47` (`const shared = {`): `student` (`:48`),
`overallComment` (`:49`), `strengths` (`:56`), `improvements` (`:57`),
`resubmitNotice` (`:58`), `rubricAreas` (`:59`), `totalScore` (`:60`),
`feedback` (`:61`), `mergedFileCount` (`:62`), `gradedRepo`, `gradedRef`. So
the stored payload carries every student's name and full written feedback.
Revision 1's over-fetch list omitted `student`, which is the field that turns
this from a memory note into a data-minimization finding.

`computeClassTrends` reads only `result.rubricAreas` (`grep -n "rubricAreas"
src/lib/grade/class-trends.ts` -> `267, 269, 284, 288`; the only read is
`for (const rubricArea of result.rubricAreas)` at `:288`).

A server-side JSON projection is the ideal fix and **cannot be verified in this
checkout** - `docs/loop/this-repo.md` section 6: no live database, no `.env`.
So the over-fetch is ACCEPTED explicitly for wave 1, and what is required
instead is a bound on what the aggregate can carry:

**REQ-7.** The reducer reads no field of a `GradeResult` other than
`rubricAreas`, and the criteria state the accepted over-fetch in those words.
**Object:** the reducer's source text. **Instrument:** a source-text assertion
over the reducer file, comment-stripped with the `stripComments` helper the
existing wiring tests use (`src/app/components/drafted-grades/classTrends.wiring.test.ts:37`),
that it contains none of `.student`, `.overallComment`, `.feedback`,
`.strengths`, `.improvements`, `.submissionText`; with a canary asserting the
same checker DOES fire on an inline fixture string containing `result.student`.
**Direction of failure:** RED if the reducer's source reads any of those
fields; and RED (canary) if the checker reports clean on the fixture, which
would mean the negative is a spelling artefact.

### 5.4 The denominators, stated rather than inferred

Layer A's denominator is per-SUBMISSION, not per-run. `buildAreaSummary`
(`src/lib/grade/class-trends.ts:207`) builds
`"${trend.resultsWithArea} of ${trend.totalResults} submissions graded so far
covered ..."` at `:208`. Revision 1 paraphrased this as "N of M runs", which is
a different quantity. `AreaTrend` (`:124-153`) carries `resultsWithArea`,
`totalResults`, `scoredCount`, `unscoredCount`, `percentValues`, `rawValues`,
`averagePercent`, `averageRaw`, `direction`; `ClassTrendsReport` (`:155-174`)
carries `totalResults`, `ungraded: { notAttempted, gradingFailed }`, `areas`,
`strengths`, `struggles`, `summaryLines`. `classifyDirection` is at `:184`, with
`HIGH_PERCENT_THRESHOLD = 70` (`:114`) and `LOW_PERCENT_THRESHOLD = 60`
(`:115`).

**REQ-8a (denominators).** The term report states two denominators, both
computed from the input and neither hardcoded: **how many of the term's
assignments carried this area** (the cross-assignment denominator A25 adds) and
**how many submissions each of those assignments graded** (layer A's own,
carried through). **Object:** the two numbers in the rendered summary.
**Instrument:** a unit test feeding three entries, two of which carry the area,
asserting the area's assignment denominator is 3 and its covered count is 2,
and that adding a fourth entry changes the denominator to 4.
**Direction of failure:** RED if either number is constant across inputs of
different length - the shape a hardcoded denominator takes.

One further honest note on the denominator's meaning: `class-trends.ts:18`
says "engine.ts:126 slices to DEFAULT_MAX_SUBMISSIONS (5)". That parenthetical
is stale - `grep -n "DEFAULT_MAX_SUBMISSIONS" src/lib/gemini.ts` -> `32:const
DEFAULT_MAX_SUBMISSIONS = 40`. The per-run cohort is therefore capped at 40
submissions, not 5, and a term denominator inherits that cap. (`src/lib/grade/engine.ts`
is being edited by a concurrent agent as this is written, so its own line
number for the `.slice` is not cited here; the value is read from `gemini.ts`,
which is untouched.)

---

## 6. The surface

### 6.1 Why Drafted Grades is withdrawn, and the two figures revision 1 got wrong

**Drafted Grades cannot host this.** All four facts from `grep -n` on
`src/app/components/DraftedGradesTab.tsx` at HEAD:

1. `:151` and `:173` - the only loader is `listPendingGradingDrafts`, the
   pending-only list.
2. `:362` - `const courseNames = collectCourseNames(drafts || []);`
3. `:368` - `const effectiveCourseFilter =
   resolveEffectiveCourseFilter(courseFilter, courseNames);`
4. `:485-490` - the course `<MenuItem>` options are exactly `courseNames`, plus
   a hardcoded `"all"` at `:485`.

`collectCourseNames` (`src/lib/grading-draft-view.ts:53-62`) adds
`entry.courseName` at `:57` for every entry of every loaded draft, and
`resolveEffectiveCourseFilter` (`:78-81`) returns `"all"` unless the stored
value is in that list. Its own doc comment at `:71-77` says why: "Falls back to
'all' when the persisted course filter no longer matches any loaded draft (e.g.
that draft was reviewed and left the pending list)". A course whose runs are all
reviewed contributes no name, is not selectable, and the panel never renders.
Nothing here catches that - `docs/loop/this-repo.md` section 2: no component is
rendered by any test. **Drafted Grades is the pending surface by construction.**

For the record, and because revision 1's figures must not be inherited: the
RecordingTab candidate's three gate counts are at
`recording-split.structure.test.ts:143` (`toHaveLength(12)`), `:198`
(`toHaveLength(11)`) and `:230` (`panelTargets.size).toBe(11)`) - measured by
`grep -n "toHaveLength(12)\|toHaveLength(11)\|panelTargets.size"` on that file;
canary `grep -n "toHaveLength(9999)"` exits 1. Revision 1 printed `132`, `187`
and `219`, which are `docs/loop/this-repo.md` section 3's stale figures, all
three low by 11.

### 6.2 Branch (A) surface: a per-course window off the courses table

**NOT DISPATCHABLE until the owner answers section 13.**

Recommended host: the Courses tab's per-course row, hosted by
`src/app/components/CoursesTab.tsx`, following the `AskAiModal` precedent
exactly. The whole chain was opened:

| Hop | Site | What is there |
|---|---|---|
| 1 | `src/app/components/courses/CourseRow.tsx:687` | `<button type="button" className={styles.linkButton} onClick={() => onAskAi(course)}>` - the trigger, in the row |
| 2 | `CourseRow.tsx:82` / `:126` | `onAskAi: (course: Course) => void;` in the props type, destructured |
| 3 | `src/app/components/courses/CoursesTable.tsx:160` / `:203` / `:734` | prop type, destructure, pass-through |
| 4 | `src/app/components/CoursesTab.tsx:88` / `:367` / `:448` | `useState<Course \| null>`, `onAskAi={(course) => setAskAiCourse(course)}`, and the mount `{askAiCourse && <AskAiModal course={askAiCourse} onClose={() => setAskAiCourse(null)} />}` |

**Why this host and not the one revision 1 chose - the reachability condition,
stated as the requirement RULING 60 asks for.** A course row exists whenever
the course exists. Nothing about its presence is derived from draft status, so
the trigger is reachable for a course whose runs are all reviewed - the exact
state the feature exists for. `CoursesTab.tsx:448`'s guard contains one
identifier, the modal-open state, and the same file mounts two further
per-course modals the same way (`RecommendTextbooksModal` at `:450`,
`TextbookPhotoModal` at `:457`), so this is the established shape.

**Cost, counted from the precedent rather than estimated:** 3 lines in
`CourseRow.tsx`, 3 in `CoursesTable.tsx`, 4 in `CoursesTab.tsx` (import,
state, handler, mount) = **10 lines across three existing files**, at 694, 792
and 474 lines - none within 200 lines of the ceiling. Plus one new leaf
component file.

**Click cost, counted twice as the UX seat's brief requires.** First use:
Courses tab -> the course's row -> the trigger = the same count `AskAiModal`
costs today from the same row. Repeat use: identical, because nothing is
persisted that would shortcut it. It is NOT cheaper than Drafted Grades'
zero-click inline panel, and that is the price of reachability; it is stated
here rather than discovered at Verify.

**Reuse for the shell.** `AskAiModal.tsx:14` imports `ModalShell` from
`../ui/ModalShell`, and `:70-74` passes `label` (`:71`), `onDismiss`,
`restoreFocusRef` (`:73`) and `fallbackFocusRefs` (`:74`).
`src/app/components/ui/ModalShell.tsx:77`
declares it; `:93-95` render `role="dialog"`, `aria-modal="true"`,
`aria-label={label}`, and `:86` wires `useModalDismiss({ open: true, onDismiss,
restoreFocusRef, fallbackFocusRefs })`. So Escape, the accessible name and
focus restoration come from a shared component, not from new code.

**Zero new CSS.** `AskAiModal.tsx` adds no stylesheet: `:12-13` import
`../../page.module.css` and `./CoursesTable.module.css` and every `className`
(8 occurrences, `grep -c "className"`) reuses an existing class. That matters
because `src/app/components/courses/page-module-css-orphan-classes.test.ts:290`
pins `const PINNED_ORPHAN_CEILING = 120` as a ratchet (canary: the same grep
for `PINNED_ORPHAN_CEILING_ZZZ` exits 1), and
`page-module-css-classes.test.ts:342` requires every `styles.<name>` reference
to resolve in the stylesheet its own import points at.

**REQ-11 (reachability, with an executing instrument).** A wiring test in
`src/app/components/courses/` asserts the whole chain, in the idiom
`src/app/components/courses/FilesCell.wiring.test.ts` already uses - whose own
header at `:9` says it guards "reachability, not just correctness" - and in the
idiom `src/app/components/drafted-grades/classTrends.wiring.test.ts:44` uses,
titled "DraftedGradesTab mounts ClassTrendsPanel (reachability, not merely
rendering)". **Object:** the four hops above, in the three existing files plus
the new panel. **Instrument:** `readFileSync` over the four files with
`stripComments` applied first (the existing tests' own helper), asserting: the
trigger's `onClick` calling the new prop exists in `CourseRow.tsx`; the prop
name appears in the props type and the pass-through in `CoursesTable.tsx`; the
mount in `CoursesTab.tsx` exists and its guard expression contains only the
modal-open state identifier; and the new panel imports `ModalShell` and the
reducer. Each checker is proven against an inline canary fixture before being
run against the real file, exactly as `FilesCell.wiring.test.ts` does.
**Direction of failure:** RED if any hop is missing, and RED if the mount's
guard expression names any identifier other than the modal-open state - which
is what would reintroduce round 1's blocker in a new location.

Pinning the guard's identifier rather than its spelling is deliberate:
`docs/loop/traps-spec.md`'s own record, and this repo's memory of source-text
tests over-specifying, both say pin the fact and the ordering, never the prose.

### 6.3 Branch (B) surface

**NOT DISPATCHABLE.** Under (B) there is no new surface at all: the reducer's
output becomes a counted fact family inside `src/lib/course-intel/`'s context
assembly, surfaced in the existing answer and history
(`src/app/components/course-intel/index.tsx:114-139`). The trigger is the
existing textbox; the tab has no course picker by design (`index.tsx:3-14`).
REQ-11's object becomes the fact family's presence in the assembled context and
the receipt over the answer, not a mount; REQ-9 (section 8) becomes
load-bearing rather than belt-and-braces. Two measured costs are in section 13.

---

## 7. Persistence

**RULING 59: the foreclosure revision 1 built is WITHDRAWN, and is not replaced
with a better-cited one.** `docs/owner-decisions-2026-09-23.md` DECISION 10
(`:247-250`) settles the question: "A stored rubric persists on the
instructor's own device. Accepted. The rubric is the instructor's own material
on the instructor's own machine, and it is the same class of data the app
already persists there under other keys." Per
`docs/loop/traps-spec.md:123-129`, where a decision bears on the question the
seat does not reason from inferred precedent at all. **On-device persistence is
available to this design.** Revision 1's section 2.4 is deleted, not softened.

What IS binding, quoted with its scope:

- **DECISION 3** (`docs/owner-decisions-2026-09-23.md:99-100`): "Every new
  control persists under a `ta-` prefixed key, and the relevant exact-key-set
  canary tests must be bumped in the same commit." That is an obligation, not a
  preference - revision 1 rendered it as the architect's choice (check M4).
- **DECISION 9** (`:237-244`) supplies the transition rule when no exact-set
  canary exists: "when a SIXTH key lands in that directory, the exact-set canary
  is written then, covering all of them. Without that clause this is a permanent
  hole rather than a deferral." Its stated subject is A39's own directory. It is
  used below as the MODEL for a deferral, and the trigger for a different
  directory is stated in that directory's own measured terms rather than
  inherited.

**Measured for the branch-(A) host directory.** `grep -rnoE 'const [A-Z_]+ =
"ta-[a-z0-9-]+"' src/app/components/courses/` returns **9** declarations:
`CoursesTable.tsx:50,51,52` (`ta-courses-sort`, `ta-courses-columns`,
`ta-courses-column-order`), `WeeklyChecklistCell.tsx:160`
(`ta-weekly-checklist-new-item-kind`), and
`WeeklyChecklistOverviewModal.tsx:84-88` (the five
`ta-weekly-checklist-overview-*` keys). Canary: the same pattern with prefix
`"zz-` returns 0.

**And no exact-key-set canary covers that directory.** `grep -rn
"ta-courses\|ta-weekly-checklist" src --include=*.test.ts` returns exactly one
line, `src/app/components/home/useAppNavigation.test.ts:102`, and it pins
`ta-courses-section` - a navigation key, not a key of this directory. Canary
that the literals are greppable: `grep -rln "ta-courses-sort" src` returns
`CoursesTable.tsx`, `AutomationsPanel.tsx` and `courses-table-helpers.ts`.
`src/app/components/courses/weekly-checklist-overview-window.test.ts` asserts
geometry, not key sets (`grep -n "it("` over it, 19 assertions, none naming a
key).

**REQ-12.** If the wave-2 architect adds any control to the branch-(A) panel it
persists under a `ta-` prefixed key, and the commit states - measured, with the
command - that no exact-key-set canary covers
`src/app/components/courses/`, together with the trigger at which one is
written. **Object:** the new key and the set of tests naming it. **Instrument:**
`grep -rn "<the new key>" src --include=*.test.ts`, plus the two commands above
re-run at that commit. **Direction of failure:** the wave fails if a new
control persists nothing, if it persists under a key without the `ta-` prefix,
or if the commit asserts a canary bump without the grep that shows which test
was bumped.

**Recommendation, so the architect is not handed an open question:** ship the
branch-(A) panel with **no control of its own** - it takes the `Course` it was
opened for and renders the whole term. That is zero new keys, and it is what
makes REQ-12 vacuous rather than deferred. A "last N assignments" selector is a
follow-up worth its own row, not part of this one.

---

## 8. The leverage claim, corrected

**RULING 63.** Revision 1 claimed CORPUS and rested it on "the app's memory is
populated automatically by the instructor's own ordinary use ... with no
separate re-entry step". That is REMOVED SETUP, which
`docs/loop/leverage.md:64` strikes as inherited - "Click cost ... Free to any
feature with a UI at all ... it is not a categorical advantage over a chat" -
and revision 1 then blamed the thinness on N13b's absence, which is the wrong
remedy for the wrong diagnosis.

**The claim this scope makes, and defends now:**

> **Class: GUARANTEED** (`docs/loop/leverage.md:42`). A25 renders a COUNT over
> typed `rubricAreas` values already stored in `grading_drafts.payload`, folded
> across a term's assignments for one Canvas course id, with a stated
> denominator on both axes (how many of the term's assignments carried the
> area; how many submissions each of those graded) and **no model call at any
> point in the computation**. What the instructor does instead today: paste
> each assignment's rubric results into a chat and ask for a trend. That
> answer is prose assembled from whatever was pasted; nothing downstream of it
> can tell a counted fact from a plausible-sounding one, and nothing states
> what fraction of the term the answer actually covered. A25's number is the
> count or it is red.

This inherits the property `computeClassTrends` already has -
`src/lib/grade/class-trends.ts:8`, in its own header: "No model call, no
network, no storage" - and it is adjacent to the surviving word in
`docs/a39-research.md` section 5.3 (`:554`, titled "One rubric held constant
across a class - DOES NOT SURVIVE AS STATED", whose `:566` reads "What survives
is narrower and worth more: **provenance.**"), which is what RULING 63
restates. It
does **not** claim CORPUS, does not claim that the app remembers and a chat
does not, and does not depend on N13b. N13b would enrich the per-area signal;
it is not load-bearing for this claim, and `blocked_by: []` on the row is
correct.

**REQ-8 (the removal test, changed in KIND per cap 1).** Revision 1's proposed
removal test was a pure-function assertion that the report reflects both
entries; check B5 showed it is unchanged by deleting the multi-row read, so it
could only go red when the test itself was rewritten. The replacement is a
different instrument, and it is the one this repo has sabotage-proven:

> A transitive-import ban over the new reducer and the new surface, in the
> shape `src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts`
> already implements. Its `FORBIDDEN_PATH_PREFIXES` is at `:58` and today reads
> `["app/actions", "lib/canvas", "lib/lms-generation", "lib/llm", "lib/gemini"]`;
> `isForbiddenPath` is at `:67`, the walker at `:119`, and it carries three
> canaries of its own (`:185` a real known-bad fixture at depth 1, `:198` a
> synthetic depth-2 fixture proving the walk recurses, plus `:151`/`:173`
> positive and negative checks on the path predicate).

**Object:** the transitive import graph rooted at the new reducer and the new
surface. **Instrument:** that walker, run over the new roots.
**Direction of failure:** RED the moment any path under `lib/llm` or
`lib/gemini` becomes reachable from those roots - which is exactly the edit
that removes the advantage. `docs/loop/leverage.md:151-165` records that this
guard was sabotage-checked by adding a real `import { X } from "../llm"` and
watching it go from 5 passing to 4 passed / 1 failed, so the instrument is
known to depend on the prefixes it lists.

State the deletion, then trace the assertion, as `leverage.md:146-149`
requires: delete the reducer's counting and replace the aggregate with a model
summary, and the summary needs a client from `lib/llm` or `lib/gemini`; the
walker's observed violation list goes from empty to non-empty. The assertion's
value changes. It is a removal test.

**REQ-9.** The counted aggregate is computed in TypeScript and rendered from
the typed reducer output; no rendered number is produced by, or paraphrased
through, a model. **Object:** the number on screen. **Instrument:** REQ-8's
walker, plus a source-text assertion that the surface reads the reducer's
typed fields rather than a free-text field. **Direction of failure:** RED if a
model-authored string can occupy the position a counted number occupies. This
is belt-and-braces under branch (A) and load-bearing under branch (B), where
the aggregate becomes a fact inside a prompt whose answer is prose - the case
`src/lib/course-intel/concern.ts` and the receipt at
`src/app/api/course-intel/ask/route.ts:868` already solve, and the pattern (B)
must follow.

---

## 9. Requirements register

Each names the object under comparison, the instrument producing each quantity,
and the direction of failure. Stated in full in the sections cited.

| ID | Requirement | Where stated | Branch |
|---|---|---|---|
| REQ-1 | Group by `parseCanvasCourseId(entry.canvasUrl)` and nothing else | 4.1 | both |
| REQ-2 | `course-canvas-url-match.ts` is do-not-reuse; parse both sides directly | 4.2 | both |
| REQ-3 | Count, never drop, entries with no parseable course id | 4.3 | both |
| REQ-4 | Render that count beside the denominator | 4.3 | both |
| REQ-5 | The query carries `user_id` and NOT `status = pending` | 5.1 | both |
| REQ-6 | Read via the browser client; `actions/grading.ts` stays out of the write set | 5.2 | (A) only - see 10.2 |
| REQ-7 | The reducer reads only `rubricAreas`; the over-fetch is stated as accepted | 5.3 | both |
| REQ-8 | The removal test is a transitive-import ban on `lib/llm` / `lib/gemini` | 8 | both |
| REQ-8a | Two denominators, both computed from the input | 5.4 | both |
| REQ-9 | No rendered number is model-produced | 8 | both, load-bearing in (B) |
| REQ-10 | Import types through `@/lib/grade/types`, never the `@/lib/grade` barrel | below | both |
| REQ-11 | The reachability chain, asserted by a wiring test | 6.2 | (A); restated in (B) per 6.3 |
| REQ-12 | Any new control persists under a `ta-` key, with the canary state measured | 7 | (A) only |

**REQ-10 in full.** `src/app/components/grading-recording/classTrendsRunCohort.ts`
(181 lines) warns in its own header, at `:24-27`, that a client-side cohort
builder must import types through `@/lib/grade/types` rather than the
`@/lib/grade` barrel. **Object:** the new panel's import statements.
**Instrument:** a source-text assertion that no file under the new surface
imports from `@/lib/grade` without a subpath; the registry-client-bundle guard
idiom this repo already uses. **Direction of failure:** RED if a bare
`from "@/lib/grade"` appears in a client component.

---

## 10. Wave plan

A scope proposes; the plan seat decides. Every wave below includes the file
that CALLS each new export - `docs/loop/seats.md:160-164`, and revision 1
violated it (check M5: nothing in its wave 1 called the reducer).

### 10.1 Wave 1 - corpus and reduction. Its CONTENT is settled under either answer; see the caller note before dispatching it alone.

Write set:

- `src/lib/grade/class-trends-history.ts` (new) - the pure reducer: group
  `GradingRunEntry[]` by `parseCanvasCourseId(entry.canvasUrl)` (REQ-1, REQ-2),
  fold each group's per-area `AreaTrend` values across assignments, emit both
  denominators (REQ-8a) and `unkeyableEntryCount` (REQ-3). A new file rather
  than an edit to `class-trends.ts` (355 lines): that file is layer A for ONE
  run, `class-trends-insight.ts` (270) is layer B, `class-trends-draft.ts`
  (228) is layer C, and "layer A across N runs" is a fourth concern.
- `src/lib/grading-drafts.ts` (377 lines) - add the reviewed-inclusive list
  function, same `.eq("user_id", userId)` discipline as the six existing
  queries (`:254, 280, 302, 344, 361, 373`), and without
  `.eq("status", "pending")` (REQ-5).
- `src/lib/grade/class-trends-history.test.ts` (new) - REQ-1, REQ-3, REQ-7,
  REQ-8a.
- `src/lib/grading-drafts.test.ts` (334 lines) - the recorder test for REQ-5,
  extending the fake-Supabase idiom already at `:269-334`.
- **THE CALLER RULE, and why this wave does not satisfy it on its own.** Both
  of wave 1's new exports - the reducer and the list function - have exactly one
  production caller, and it is the surface, which is branch-dependent and
  therefore in wave 2. Their only wave-1 caller is their own test, and a test is
  not a caller for the purposes of `docs/loop/seats.md:160-164`. Neither is a
  type-only module, so that rule's single legal exception does not apply, and
  claiming it would be exactly the escape the rule names. Revision 1 asserted
  that "every wave below deliberately includes the file that CALLS or RENDERS
  the new export" while its wave 1 did not (check M5); this revision does not
  repeat the assertion.

  **Two honest dispositions, and a recommendation.** (i) **Merge waves 1 and 2
  once the owner answers** - the recommendation, and the only one that satisfies
  the rule outright. (ii) If wave 1 must land alone, it lands with REQ-8's
  import-ban test rooted at the reducer and with REQ-5's recorder test, both of
  which execute against the new files, and the wave's report says in those words
  that two exports are shipping ahead of their callers with the calling wave
  named. What is NOT available is landing wave 1 alone and calling the caller
  rule satisfied.
- Disjointness: the write set does not intersect `class-trends.ts`,
  `class-trends-insight.ts`, `class-trends-draft.ts`, or any file listed as
  modified in this pass's `git status --short`, with one exception to check at
  dispatch time - `src/lib/grade/engine.ts` and
  `src/app/components/grading-recording/grading-rows.test.ts` are currently
  held by other agents and are NOT in this write set, but
  `src/lib/grading-drafts.test.ts` must be intersected mechanically against
  whatever is live at dispatch (`sort | uniq -d`, per
  `docs/loop/parallel-disjointness.md`), not eyeballed.

### 10.2 Wave 2 - the surface. NOT DISPATCHABLE until section 13 is answered.

**Under branch (A):** `src/app/components/courses/ClassTrendsHistoryModal.tsx`
(new leaf, wrapping `ModalShell`), plus the ten lines across
`CourseRow.tsx` / `CoursesTable.tsx` / `CoursesTab.tsx` enumerated in 6.2, plus
`src/app/components/courses/classTrendsHistory.wiring.test.ts` (new) for
REQ-11. REQ-6 holds: `src/app/actions/grading.ts` stays out of the write set.
Re-measure all three existing files with both instruments after the wave.

**Under branch (B):** no component wave. The write set moves into
`src/lib/course-intel/` - the context assembly and the answer's receipt - and
**REQ-6 inverts**: the read must be reachable from
`src/app/api/course-intel/ask/route.ts`, which is at **976 lines, 24 of
headroom** against the 1000 ceiling, so the seam must be a new lib module that
the route imports in one or two lines, never logic added to the route.
REQ-11's object becomes the fact family's presence in the assembled context;
REQ-12 is vacuous (no new control); REQ-9 becomes load-bearing.

### 10.3 Wave 3 - experience passes

Against the as-built wave-2 diff, per `docs/loop/seats.md:50,52,56`. Under
branch (A) all three wave-3 seats fire (a new surface, new markup, a new
keyboard path). Under branch (B) the visual and accessibility triggers do not
fire - no new markup - and the UX seat still does, because the answer's copy
changes. Every finding is a reading claim: no component is rendered by any test
here (`docs/loop/this-repo.md` section 2).

---

## 11. Residual register

Five fields each: object, owner, instrument, direction of failure, step. Per
`docs/loop/iteration-caps.md`'s anti-gaming rule, an instrument that is a remedy
is not an instrument, and a residual missing any of the three is a deletion.
Four of revision 1's seven residuals were promoted to requirements above
precisely because they could not meet this bar.

| ID | Object | Owner | Instrument | Direction of failure | Step |
|---|---|---|---|---|---|
| RES-1 | Whether the shipped surface READS well - layout, placement in the row, whether the two denominators are legible side by side | Repo owner | A real browser against the deployed app. Nothing in this checkout renders a component (`this-repo.md` section 6), so this cannot be executed here at any effort | Fails if the owner opens the surface for a course with reviewed runs and cannot tell, from the panel alone, which areas moved and over how many assignments | The owner verification pass on the wave-2 diff, immediately after it ships. REQ-11 already proves the surface is REACHED, so this residual is about legibility only |
| RES-2 | Whether repo- and cartridge-sourced drafts should carry a course id at all: four producer sites emit `canvasUrl: ""` with `offline` undefined (section 4.3), so those runs join no course's term history | Repo owner (it is a product call about whether repo grading belongs in a Canvas-course trend) | `unkeyableEntryCount`, the number REQ-3 makes the reducer compute and REQ-4 makes the panel render, read by the owner against their own data | Fails if that number is non-zero for a course the owner expects history for - i.e. the history is silently missing the repo-graded half of a term | The same owner pass as RES-1. Its output is either "zero, close this" or a new backlog row naming the four producer sites (`steps.grading-repos.grade-repo.ts:465`, `steps.grading-repos.helpers.ts:342`, `steps.grading-repos.ts:274` and `:324`) |
| RES-3 | Row-count growth and read cost of a reviewed-inclusive query over `grading_drafts`, including the accepted whole-payload over-fetch (REQ-7) and the absence of any index on `status` (`20260811000000_create_grading_drafts.sql:17-18`) | Repo owner, with production access | `select count(*) from grading_drafts where status = 'reviewed'` plus the panel's own load time, run against the live database. Unavailable here: no `.env` (`this-repo.md` section 6) | Fails if the panel's first load for a full term is slow enough to be noticed, or if the payload volume is large enough that the projection REQ-7 defers becomes necessary | The same owner pass as RES-1, which is the first production tick after wave 2. Not before - there is nothing here to run it against |
| RES-4 | Whether a cross-assignment fold over `classifyDirection`'s three-value vocabulary (`class-trends.ts:184`, thresholds 70/60 at `:114-115`) says anything useful on a real term, or collapses to "mixed" everywhere - the same complaint the N13b row records for one run (`docs/backlog.yml:151`) | Repo owner, with the AC seat carrying the wording either way | The count of areas the panel classifies `mixed` against the count it classifies `high` or `low` - both computed by the reducer and rendered, read by the owner on their own term | Fails if every area in a real term comes back `mixed` and the panel therefore states a denominator and no direction | The same owner pass as RES-1. Its output is either acceptance or a `Reduce` disposal on the claim in section 8 - never a further round of this scope |
| RES-5 | Whether branch (B)'s fact family can reach `src/lib/course-intel/`'s offline path without widening the six-field wire boundary at `offline-payload.ts:11-18` | Repo owner, if and only if branch (B) is chosen | Reading `offline-payload.ts`'s `buildGradingRow` (`:178-219`) against the fact family the reducer emits, plus the wave-2 security seat's trigger ("any new network egress", `seats.md:54`) | Fails if branch (B) ships by adding fields to that wire shape without the owner being told that a stated structural data-minimization control was widened | Branch (B)'s wave-2 security pass. Void under branch (A) |

---

## 12. What this scope could not determine

Stated rather than filled in, per `docs/loop/this-repo.md` section 6.

- **Anything about real query behaviour.** No `.env`, no live database. Row
  counts, payload sizes, index use and the viability of a PostgREST JSON
  projection over `payload->runs` are all unverifiable here. RES-3.
- **Anything a browser would show.** No component is rendered by any test in
  this repo, so the surface's legibility, its focus order and its keyboard path
  are reading claims. RES-1, and `ModalShell` is reused precisely so fewer of
  them are new.
- **Whether `assignmentUrl` is ever non-empty on the attended repo-grading
  path.** `steps.grading-repos.helpers.ts:342` reads a parameter; the one
  caller measured (`:428`) passes `""`. Whether an attended caller passes a
  real URL was not traced, and REQ-3's count is what makes the answer visible
  rather than assumed.
- **Whether the owner wants repo-graded runs in a Canvas-course trend at all.**
  RES-2. This is a product question, not a measurement.

---

## 13. To the owner: one question, gating nothing

Restated from `docs/a25-rulings.md` in the owner's terms, with what this pass
measured added. Wave 1 (section 10.1) is dispatchable whichever way this goes.

> A25 would fold your stored grading runs into a per-course, per-rubric-area
> trend over a term. This app already has a cross-assignment reducer for a
> course - `src/lib/course-intel/` - keyed on the same parsed Canvas course id
> (`ask/route.ts:525`), already rendering stated denominators
> (`course-intel/types.ts:555`, "3 of 7 assignments missing"), already
> computing its set in TypeScript before any model call
> (`concern.ts`, `ask/route.ts:777`) with a receipt over the answer (`:868`),
> and already reachable from its own tab (`page.tsx:662`). What it does not
> have is any rubric-area breakdown: `grep -rln "trend\|Trend"
> src/lib/course-intel/` exits 1, and that subsystem never reads the
> grading-draft table (`grep -rln "grading_drafts\|grading-drafts"
> src/lib/course-intel/ src/app/api/course-intel/` exits 1).
>
> **(A)** Build A25 as its own layer over your stored grading drafts, keyed on
> the parsed Canvas course id, with unkeyable runs counted and named, opened
> from a course's row in the Courses tab - the same place "Ask AI" opens from
> today; **or (B)** add rubric-area history as an additional signal inside
> Course Intel, reusing its course id, its denominators and its answer.
>
> **Recommendation: (A).** Three costs of (B), measured this pass and not in
> the round-1 material: `src/app/api/course-intel/ask/route.ts` is **976
> lines**, 24 from the repo-wide 1000-line ceiling
> (`file-size-ceiling.structure.test.ts:41`), so the work would have to be
> squeezed through a file already at the wall; Course Intel's offline path has
> a deliberate six-field wire boundary that sets `rubricAreas: []` on purpose
> (`offline-payload.ts:11-18, 207-210`), so (B) means widening a stated
> data-minimization control; and (B)'s answer is model prose, so the counted
> number only stays counted if it is rendered as a receipt (REQ-9), which is
> extra work (A) does not need.
>
> **Cost of being wrong about (A):** a second per-course trend surface the
> instructor reaches differently from the first, and two subsystems that could
> disagree about which runs belong to a course - though both would now compute
> that answer with the SAME function on the SAME field
> (`parseCanvasCourseId` on a stored `canvasUrl`), which is the one thing that
> keeps the disagreement bounded.

Either answer ends this activity. Under (A) the scope ships as written and
wave 2 unblocks. Under (B) sections 6.3 and 10.2's branch-(B) paragraph replace
section 6.2, REQ-6 inverts, REQ-12 goes vacuous, REQ-9 becomes load-bearing,
and RES-5 activates. Nothing else in this document changes, and nothing in it
needs re-deciding to apply either answer.

---

## 14. Verification of this document's own write set

    git status --short

The only path this document's authoring touched is `docs/a25-scope.md`. Every
other path in that output belongs to the concurrently running agents named in
this pass's brief, and none was written or relied on by a load-bearing claim
here.

**The tree moved DURING this pass, which is worth recording rather than
smoothing over.** At the start, `git status --short` listed
`docs/css-orphans.md`, `GradingRecordingPanel.tsx`, `grading-rows.test.ts`,
three `ppt-design` files, `src/lib/grade/engine.ts`, `src/lib/supabase/types.ts`
and four untracked paths. At the end it lists `docs/a25-scope.md` (this file),
`docs/css-orphans.md`, `deck-template-files.ts`, `ppt-design/GeneratePanel.tsx`,
six `walkthrough-announcement` files, two `lib/decks` files and two untracked
`lib/decks` files - a different set. `docs/css-orphans.md` is in both because
`src/app/components/courses/page-module-css-orphan-classes.test.ts:354` writes
it as part of its own run, so any full suite run modifies it. None of the files
in either set is cited in a load-bearing claim above; the one exception is
flagged where it appears (`src/lib/grade/engine.ts`, section 5.4, which is why
`DEFAULT_MAX_SUBMISSIONS` is read from `src/lib/gemini.ts:32` instead). This is
also the concrete reason section 10.1 requires wave 1's disjointness to be
intersected mechanically at dispatch time rather than against this document's
snapshot.

ASCII check on this file:

    tr -d -c '\000' < docs/a25-scope.md | wc -c

Closing gate, multi-path and therefore through the wrapper, never a raw
multi-path `vitest run`, with the exit code read from the command rather than
from a pipe:

    npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts

Both files reach this document: `src/lib/no-emojis.test.ts:254` sets
`roots = ["src", "docs"]` and `:237` sets
`SCAN_EXTENSIONS = /\.(ts|tsx|css|md)$/`, so the emoji ban covers `docs/*.md`;
`src/source-bytes.structure.test.ts` is the NUL/BOM gate. Results are recorded
in this seat's report to its caller.
