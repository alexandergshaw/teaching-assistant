# A25 scope: cross-assignment trend accumulation

Row: `docs/backlog.yml`, `- id: 'A25'` (measured today at line 451,
`grep -n "id: 'A25'" -A 40 docs/backlog.yml`). State `unscoped`, `blocked_by: []`,
`owns: []`. Title: trends that span SEVERAL assignments over a term for one
course, explicitly the LARGER item A16 carved itself away from. Owner's words,
quoted in the row: "when i run a tool over a series of assignments, that run
should generate trends," settled to mean one run over many students for ONE
assignment (A16, shipped) - this row holds the reading the owner also meant but
that A16 deliberately did not build: trends that accumulate ACROSS assignments
over a term.

This is a first scoping pass. No `docs/a25-scope.md` existed before this file
(`ls docs/a25-scope.md` before this write: "No such file or directory";
`git log --all --oneline -- docs/a25-scope.md` before this write: empty). **No
disposition table is included** - there is no prior version of this scope to
restructure.

Every quantity below names the command that produced it, measured in this
checkout today (2026-09-23) unless stated otherwise. Nothing here is inherited
from the row's own instrument field without being re-checked against the tree.

---

## 0. Correcting the row's own citation before building on it

The row's `instrument` cites `GradingRunEntry` at `types.ts:320-338`. Re-measured
this pass: `grep -n "^export interface GradingRunEntry" src/lib/grade/types.ts`
returns line **353**, and the interface's closing brace (found by scanning
forward from 353 for the next `^}`) is line **362**. The type has moved since
A16's scoping pass four days ago; the shape itself is unchanged:

```
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
```
(`src/lib/grade/types.ts:353-362`)

This matters beyond pedantry: it is the object every later section below cites
by line number, and it is why every citation in this document was opened this
pass rather than copied from A16's note.

---

## 1. What already exists (traced from the control to the code)

**The control an instructor would press today, if this feature existed, does
not exist and nothing routes to it.** Traced exhaustively:

- The only function that computes a rubric-area trend is
  `computeClassTrends(entry: GradingRunEntry): ClassTrendsReport`
  (`src/lib/grade/class-trends.ts:259`). Its signature takes **exactly one**
  `GradingRunEntry` - one assignment's run. `grep -rn "GradingRunEntry\[\]"
  src --include=*.ts | grep -v ".test.ts"` (run this pass) returns 8 hits, all
  of them either a single workflow step building one run array to grade RIGHT
  NOW (`steps.grading-run.ts:426`, `steps.grading-cartridge.ts:45`,
  `steps.grading-draft-flow.ts:224`), or plumbing that carries a runs array
  through for POSTING/STRIPPING (`grading-review-rows.ts:95,109,154`,
  `grading-drafts.ts:33`, `actions/grading.ts:280`) - never a function that
  reduces runs from DIFFERENT points in time into one report. There is no
  `computeCrossAssignmentTrends`, no `ClassTrendsHistory`, no function anywhere
  in the tree whose input type is an array of runs spanning more than one
  grading session. This independently confirms A16's own finding
  (`docs/backlog.yml:457`), with fresh line numbers rather than inherited ones.
- Every grading surface that DOES show a trend today builds a single-run
  "cohort" and feeds it to `computeClassTrends`: `classTrendsRunCohort.ts`
  (`src/app/components/grading-recording/classTrendsRunCohort.ts`, 181 lines,
  `wc -l`), `classTrendsFolderEntry.ts`
  (`src/app/components/repo-grades/classTrendsFolderEntry.ts`, 113 lines),
  and `classTrendsEntry.ts`
  (`src/app/components/grading-results/classTrendsEntry.ts`, 54 lines). Each
  is a per-surface adapter that turns THIS SESSION's in-memory results into
  one `GradingRunEntry`-shaped cohort. None persists or reads back a prior
  cohort.
- **The raw data a term-trend would need is already being written, one row
  per run, and is unreachable.** `grading_drafts` (Supabase table,
  `supabase/migrations/20260811000000_create_grading_drafts.sql:8-15`) stores
  one row per grading run with `payload jsonb` holding `{ runs:
  GradingRunEntry[] }` (`src/lib/grading-drafts.ts:32-39`), scoped
  `.eq("user_id", userId)` throughout (`grading-drafts.ts:246,262,283,303`
  etc.). `markGradingDraftReviewed` (`grading-drafts.ts:330-341`, called from
  `src/app/actions/grading.ts:414` and `:558` after a successful post) sets
  `status: "reviewed"` and **does not delete the row**. `deleteGradingDraft`
  (`grading-drafts.ts:361-368`) is the only path that removes a row, and its
  one caller (`src/app/actions/grading.ts:428`,
  `deleteGradingDraftAction`) is wired only to an explicit user "discard"
  button - never called automatically after review. So a reviewed draft is a
  **durable, growing, per-course history of every graded run**, sitting in the
  database indefinitely, already scoped to the account that owns it.
- **And nothing reads it back.** The only list function is
  `listPendingGradingDrafts` (`grading-drafts.ts:242-254`), which filters
  `.eq("status", "pending")` - a reviewed row is invisible to it. `grep -rn
  "listPendingGradingDrafts\|listPendingGradingDraftsAction"
  src/app/actions/grading.ts src/app/components/DraftedGradesTab.tsx` (run
  this pass) shows the ONLY consumer of the list function is
  `DraftedGradesTab.tsx:151,173`, and it always calls the pending-only
  variant. There is no `listReviewedGradingDrafts`, no admin or history view,
  no export. `grep -rn "reviewed" src/app/components/drafted-grades/*.tsx`
  (run this pass) returns zero lines - nothing under `drafted-grades/` even
  mentions the reviewed state.

**Conclusion for this section: this is NOT the "shipped, just unreachable"
pattern this repo has hit twice before (per the brief) - there is no
accumulator to make reachable.** What exists is raw material (one row per run,
already durable, already scoped) and a single-run reducer
(`computeClassTrends`). The thing this row is named for - a reducer over
MULTIPLE runs, plus a surface that reads multiple reviewed rows back - has to
be built. That is different from A16's finding (a fully-built library with no
render site) and should not be scoped as if it were. It is, however, cheaper
than "build persistence from nothing": the corpus already exists and is
already private per-owner; the gap is entirely in the read-back and the
reduction.

---

## 2. The data

### 2.1 What's stored today

| Shape | Where | Per-run fields relevant to a trend |
|---|---|---|
| `GradingRunEntry` | `src/lib/grade/types.ts:353-362` | `courseName` (free string), `assignmentName`, `run.results[].rubricAreas[]` (area + score string) |
| `GradingDraftPayload` | `src/lib/grading-drafts.ts:32-39` | `runs: GradingRunEntry[]` (one or more, usually one per draft in practice - `wc -l` on the two call sites that build multi-entry `runs` arrays, `steps.grading-run.ts:426` and `steps.grading-cartridge.ts:45`, shows they loop over a `plan` of possibly several assignments in one workflow run) |
| `grading_drafts` table row | `supabase/migrations/20260811000000_create_grading_drafts.sql:8-15` | `id, user_id, status, summary, payload jsonb, workflow_id, workflow_name, source, created_at, updated_at` - confirmed by reading the migration plus the two later ALTERs (`20260818000000_drafts_workflow_ref.sql`, `20260827000000_grading_drafts_source.sql`); no other migration touches this table (`grep -rln "grading_drafts" supabase/migrations/`, 4 files, all read) |

### 2.2 The quantity this feature must display that is NOT cleanly derivable today

**There is no stable course identifier on a stored run.** `GradingRunEntry`
carries `courseName: string` and an optional `institution?: string` - never a
`courseId`. The app's own `Course` type DOES have a stable id
(`id: string`, `src/lib/supabase/courses.types.ts:63`) and even a `term:
string | null` field (`:65`) that would make "trends over a term" literal
rather than inferred - but that id is never threaded onto a `GradingRunEntry`
or into the `grading_drafts` row. Traced to where it is dropped: at
`steps.grading-run.ts:398` the workflow's own `PlanRow` interface DOES carry
`courseId: string`, and at `:533` the code reads `tileMap.get(offlineRow.courseId)`
- so the id is in hand at construction time - but the `GradingRunEntry` built
from that row (`:426` onward) never copies it in. `grep -n "courseId"
src/lib/grade/types.ts` (run this pass) returns nothing.

**Consequence, and the two real options, neither of which this scope decides:**

- **Option A - reuse the existing string-match precedent.** The app already
  groups by course using `courseName` string equality, nowhere else: `grep
  -rn "entry.courseName ===" src/lib/grading-draft-view.ts` shows
  `gradeMatchesFilters` (`grading-draft-view.ts:44`) and `collectCourseNames`
  (`:53-60`) both key on the raw string. This is the SAME mechanism the
  Drafted Grades course filter already uses for the pending list today, so
  extending it to a multi-run accumulation is consistent with precedent, costs
  no migration, and inherits precedent's own known fragility: a renamed
  course silently splits its own history in two, and two course sections that
  happen to share a name would be merged. No bug against this has been filed
  in this repo as of this measurement (`grep -rn "courseName" docs/backlog.yml`
  returns no open row naming it a defect) - it is a live risk, not a live bug.
- **Option B - add `courseId` to `GradingRunEntry` and thread it through.**
  Correct join key, zero collision risk, but real cost: a new optional field
  on `GradingRunEntry` (cheap, `types.ts`), a one-line change at the
  `steps.grading-run.ts:426` construction site to copy `row.courseId` in
  (cheap - the value is already in scope there), but EVERY OTHER PRODUCER of a
  `GradingRunEntry` needs the same field threaded or the new accumulator gets
  silent gaps for that source: `steps.grading-cartridge.ts:45`,
  `steps.grading-draft-flow.ts:224`, and any repo-grading or grading-recording
  path that builds its own cohort (`classTrendsRunCohort.ts`,
  `classTrendsFolderEntry.ts`) would need auditing for whether a courseId is
  even available at that call site - not measured in this pass, and named
  here as unmeasured rather than assumed. No schema migration is required
  UNLESS the query needs to filter server-side by course id inside the jsonb
  (see 2.3) rather than fetching all of a user's reviewed drafts and filtering
  client-side.

**This scope does not pick one.** It is exactly the kind of "state a rule
against every other bound on the same quantity" question the AC seat's
checklist asks (`seats.md:123-135`) turned into a data-identity question
instead of a numeric one, and it belongs to the architect wave with the
recommendation stated plainly: **Option A first** (ship the coarser, string-
keyed version, consistent with the app's own existing precedent and zero
schema cost), with Option B recorded as a residual (register, item R-A25-2)
if the string-collision risk is ever reported as a real defect rather than a
theoretical one.

### 2.3 Cost of querying the data that DOES exist

No caller today reads more than one draft's payload at a time by id
(`getGradingDraft`, `grading-drafts.ts:284-300`) or a small pending list
(`listPendingGradingDraftsAction`, `actions/grading.ts:355-370`). A
cross-assignment view needs a NEW query: every reviewed (and pending) draft
row for one user, filtered client-side to one course's `courseName`, across
however many runs a term has produced. Two real costs, neither measurable
locally (`this-repo.md` section 6: no live database in this checkout):

- **Row count**: `grading_drafts` has no cap and no cleanup path other than
  the manual "discard" button (section 1 above) - a full term of daily
  workflow runs could be dozens to low hundreds of rows per course. Unmeasured
  here; residual R-A25-3 below.
- **Payload size per row**: `stripGradingRunEntriesForDraft`
  (`src/lib/workflows/grading-review-rows.ts:95-97`) strips `rawBase64` but
  keeps every result's `overallComment`, `strengths`, `improvements`,
  `feedback`, and `rubricAreas` (`src/lib/grade/types.ts:212-241`, the shared
  fields every `GradeResultBase` carries) - i.e. the FULL per-student text a
  trend does not need. `computeClassTrends` itself only reads
  `result.rubricAreas` (`class-trends.ts:282-304`) - area name and score
  string, nothing else, and never a student name at the layer-A level this
  scope recommends (section 5). **A term-trend query that fetches whole
  `payload` blobs to extract only `rubricAreas` pulls every student's full
  written feedback into memory for every assignment in the term, unused.**
  This is a real, checkable data-minimization finding for the security/data
  seat, not a blocking one for THIS scope pass: the fix is either a
  server-side JSON projection (`payload->'runs'->...->'rubricAreas'` in the
  Supabase query) or accepting the over-fetch as a first cut and shrinking it
  later. Recorded as residual R-A25-4.

### 2.4 The privacy rule that constrains the obvious cheap fix

The obvious cheap fix - cache the computed term-trend client-side in
`localStorage` so the panel reopens instantly - is **foreclosed by existing
precedent, not by a new rule this scope invents**. Two citations:

- `src/app/components/repo-grades/index.tsx:170-176`: per-cell edited scores
  are explicitly kept in React state only, "never persisted to localStorage (a
  typed but un-posted score surviving a reload would be surprising, and this
  codebase's own precedent - GradingResults.tsx's `edits`/`postStatus` - does
  not persist these either)."
- `src/app/components/accommodations/accommodations.structure.test.ts:83-93`:
  a structure-test canary asserts the data-access module `src/lib/accommodations.ts`
  "never references localStorage or sessionStorage" at all (Ruling N4-L,
  in-memory only for anything that is student/grading data rather than UI
  chrome).

**The rule this scope draws from those two instances, stated for the
implementer**: any control this feature adds (a course selector, an
expand/collapse toggle) may use a `ta-` localStorage key exactly like every
other UI control in this repo, but the COMPUTED TREND DATA ITSELF - scores,
rubric-area names as tied to a specific run, anything that is graded content
rather than a UI preference - must be re-fetched from Supabase on each view,
never cached into `localStorage`. This matches the existing single-run
`ClassTrendsPanel`, which recomputes `computeClassTrends` from `entry` on
every render (`ClassTrendsPanel.tsx` takes `entry` as a prop, never reads a
cache) rather than persisting a report.

---

## 3. The surface

### 3.1 Where a control could reach this, and the line cost of each

Two live candidates, both measured, neither decided here:

**Candidate 1: `DraftedGradesTab.tsx`.** Already the host of the single-run
`ClassTrendsPanel` (mounted at `DraftedGradesTab.tsx:655`, one JSX line, plus
one import line at `:27` - the existing precedent for how cheaply a leaf panel
mounts). Already has a course-scoped selector wired to a persisted key:
`courseFilter` (`useState`, `:124-127`, seeded from
`localStorage.getItem("ta-drafts-course")`, `:126`) and
`collectCourseNames`/`resolveEffectiveCourseFilter`
(`src/lib/grading-draft-view.ts:53-60,72-76`). A cross-assignment panel gated
on "a specific course is selected" would reuse this control with **zero new
persisted keys** - the panel would simply read the same `effectiveCourseFilter`
value DraftedGradesTab already computes at `:368`, and fetch its own history
independently (new server action, new leaf component) the same way
`ClassTrendsPanel` computes its own report from a prop today.
- **File-size headroom**: `DraftedGradesTab.tsx` is **898 lines**, measured
  two ways, both run this pass: `wc -l src/app/components/DraftedGradesTab.tsx`
  -> 898; PowerShell `@(Get-Content src/app/components/DraftedGradesTab.tsx).Count`
  -> 898. Both instruments agree here (unlike the 42-line disagreement
  `this-repo.md` documents on a different file - re-measured, not assumed).
  Against the 1000-line ceiling (`src/file-size-ceiling.structure.test.ts:41`,
  `LIMIT = 1000`), that is **102 lines of headroom**. The mount pattern
  above (2 lines: one import, one render call for a new leaf component) fits
  easily inside that headroom **only if the new panel does its own data
  fetching and rendering in its own file**, the same discipline
  `ClassTrendsPanel` already follows. If an architect instead chooses to
  inline the history logic into `DraftedGradesTab.tsx` itself, it will not
  fit: 102 lines is not enough room for a new query, a new loading/error
  state, and a rendered history view.

**Candidate 2: the recording "tools" tab strip, where A16 places single-run
trends** (`RecordingTab.tsx`, per A16's row, `docs/backlog.yml:352-361`).
Measured this pass, NOT inherited from A16's note: `wc -l
src/app/components/RecordingTab.tsx` -> 917; PowerShell `@(Get-Content
src/app/components/RecordingTab.tsx).Count` -> 917. Against the 1000-line
ceiling, that is **83 lines of headroom** - tighter than Candidate 1, and this
file is ALSO covered by a second, stricter, non-recursive gate:
`src/app/components/recording/recording-split.structure.test.ts`, which pins
an EXACT count of tab-strip entries (12, `:132`), an exact count of
`role="tabpanel"` occurrences (11, `:187`), and `panelTargets.size === 11`
(`:219`) - all three break the moment a sub-tab or panel is added, per
`this-repo.md:149`, which documents this exact failure mode ("adding a
sub-tab breaks three of those and passes the fourth falsely"). Placing a
cross-assignment view here would need it to NOT be a new sub-tab (to avoid
the three-count break) or would need all three counts bumped in the same
commit as a deliberate, checked change.

**This scope recommends Candidate 1** (Drafted Grades, course-filter-gated),
for three measured reasons: more headroom (102 vs 83 lines), no
non-recursive structural gate with hardcoded counts to bump, and it already
owns the course-grouping mechanism this feature needs (section 2.2, Option A)
- reuse over reinvention, per the architect seat's own standing question
(`seats.md:169-171`). This is a recommendation for the architect wave to
accept or override, not a decision this scope pass is authorized to make
final.

### 3.2 New module, not an extension of an existing 1000-line-adjacent file

Whichever host is chosen, the reduction logic itself (a new
`computeCrossAssignmentTrends`-shaped function, analogous to
`computeClassTrends` but folding N `GradingRunEntry` reads into one
per-course, per-area time series) belongs in a new file under `src/lib/grade/`
- e.g. `src/lib/grade/class-trends-history.ts` - not inside `class-trends.ts`
(355 lines, `wc -l src/lib/grade/class-trends.ts`, comfortable headroom, but a
change of scope this size deserves its own file per this repo's own layering:
`class-trends.ts` is layer A for ONE run, `class-trends-insight.ts` (270
lines) is layer B, `class-trends-draft.ts` (228 lines) is layer C - each a
separate file for a separate concern, and "layer A across N runs" is a fourth
concern, not a modification of the first). This also sidesteps the
`@/lib/grade` barrel client-bundle hazard `classTrendsRunCohort.ts`'s own
header warns about (`src/app/components/grading-recording/classTrendsRunCohort.ts:24-27`):
any new client-side cohort builder must import types through
`@/lib/grade/types`, never the barrel.

---

## 4. Persistence

**No new `ta-` key is required if Candidate 1 (section 3.1) is accepted as
scoped** - the panel reads the host's existing `effectiveCourseFilter`
(`DraftedGradesTab.tsx:368`) and computes its own report from a server
fetch on each mount, with no new textbox, select, or checkbox of its own.

**If the architect wave adds a control anyway** (e.g. a "show last N
assignments" selector, or an expand/collapse for the history panel), it needs
a `ta-` prefixed key exactly like `DraftedGradesTab`'s own three
(`ta-drafts-search`, `ta-drafts-sort`, `ta-drafts-course`, all confirmed live
at `DraftedGradesTab.tsx:118,122,126`).

**The exact-key-set canary that would need bumping: there is none.** Checked
with a canary proving the search method itself works, then applied to the
real question:

```
grep -rn "ta-rec-" src/app/components/recording/recording-split.structure.test.ts | wc -l
-> 90   (proves this grep style finds a REAL exact-key-set canary when one exists)

grep -rln "ta-drafts" src/app/components/drafted-grades/     -> (no output, exit 1)
find src/app/components/drafted-grades -name "*.test.ts" | xargs grep -l "ta-drafts"  -> (no output, exit 1)
grep -rl "ta-drafts" src --include=*.test.ts                 -> (no output, exit 1)
```

All three commands were run this pass, none piped through `head`. The
recording tab's own canary (`recording-split.structure.test.ts`) is scanned
NON-recursively and by name (`this-repo.md:149`: "Scans
`src/app/components/recording/` non-recursively plus `RecordingTab.tsx` and
`TabShell.tsx` by name") and does not reach `drafted-grades/` at all. No other
structure or wiring test anywhere in the repo asserts an exact set of
`ta-drafts-*` keys (`grep -rl "ta-drafts" src --include=*.test.ts` returns
nothing, confirmed above). **Consequence: a new key added under
`drafted-grades/` today has no canary to bump, and also gets none for free -
if the architect wants one, it must be written new, not "bumped."** State
this to the implementer explicitly rather than letting them search for a
canary that does not exist and conclude (wrongly) that its absence means no
test covers this area at all - `DraftedGradesTab.tsx`'s existing 898 lines are
otherwise covered by ordinary vitest unit tests on its extracted pure helpers
(`grading-draft-view.ts`, `grading-draft-checklist.ts`, etc.), just not by a
key-set canary.

---

## 5. The leverage question, answered against the mechanism

**Class claimed: CORPUS, and it is EARNED, not inherited - conditionally.**
Per `docs/loop/leverage.md`'s own struck-class table, "persistence (generic)"
is explicitly NOT enough (262 files already hold a Supabase client; every
server module gets that for free). What CORPUS requires, and what section 1
established does not exist yet, is a LATER act reading the record back
(`leverage.md:37`). Today, a reviewed `grading_drafts` row is written and then
read by NOTHING (section 1: `listPendingGradingDrafts` never sees it, no
other reader exists). Building the read-back - a query across N runs for one
course, reduced into a term trend - is what would EARN this class; it is not
free from the platform the way plain persistence is.

**What this specifically gives an instructor that a chat cannot, stated as a
mechanism and checked against the two assumptions this repo's own research
pass just falsified** (`leverage.md` is explicit that a chat CAN persist
across sessions via Projects, and CAN write back to Canvas via an MCP
server + PAT - so neither "it remembers" nor "it can act in Canvas" is an
automatic win here):

- The mechanism is not that the app remembers and a chat does not - a chat
  with Projects memory also remembers. The mechanism is that **the app's
  memory is populated automatically by the instructor's own ordinary use of
  the grading tools already in this app**, with no separate re-entry step: a
  graded run is written to `grading_drafts` the moment it is drafted
  (`createGradingDraft`, called from the grade-to-draft workflow step), before
  the instructor does anything else. A chat's memory of a prior assignment's
  scores exists only if the instructor manually pastes or uploads that
  assignment's rubric results into it, every time, for every assignment, and
  nothing enforces that they did so completely or accurately.
- The mechanism that survives review is **GUARANTEED, not CORPUS alone**:
  `computeClassTrends` makes no model call today (`class-trends.ts`'s own
  header, `:4-15`, "no model call, no network, no storage") and a
  cross-assignment reducer built the same way inherits that property - the
  term trend is a COUNT over stored, typed `rubricAreas` scores, not a
  language model's summary of pasted history. A chat asked "how has this
  class trended on X over the term" answers in prose assembled from whatever
  was pasted into it, with no guarantee the count is complete or that nothing
  drifted between paraphrase and fact. This app's version, built the way
  layer A already is, would carry a stated denominator per area exactly the
  way `class-trends.ts:207-243`'s `buildAreaSummary` already does for one run
  - "N of M runs graded so far covered this area" - extended across
  assignments instead of across students in one assignment.

**Honest limit, stated rather than oversold**: this is a genuinely THIN
version of CORPUS until N13b lands. `docs/backlog.yml:150-160` (N13b, also
`unscoped`) is what turns a bare high/low direction into something with a
named subset of struggling students - without it, a cross-assignment view can
only say "this area was low in assignments 2 and 4, high in 3" with the SAME
literal-consistency weakness `class-trends.ts:184-205`'s `classifyDirection`
already has for one run (a realistically mixed set of scores across
assignments will often classify as "mixed" and render nothing useful, the
same failure N13b's own note describes for one run). A25's own row already
says its shape "depends on... N13b, which is what makes a trend worth
reading at all" (`docs/backlog.yml:461`) - this scope confirms that
dependency independently rather than repeating it, and recommends the wave
plan (section 6) sequence A25's reduction logic AFTER N13b's subset signal
lands, so the cross-assignment view is built against the richer per-area
signal from the start rather than needing a second pass to add it.

**If the honest answer were "not much"**: it is not "not much," but it is
"real once N13b exists, thin before it." The correct disposal per
`leverage.md`'s own worked negative example is neither silent overselling nor
rejection - it is the "Accept the cost explicitly" branch: ship the coarse
high/low-only version if the owner wants it now, with the criteria stating
plainly that its leverage is CORPUS-without-subset-attribution until N13b
ships, or wait and build both together. That choice is the owner's / AC
seat's, not this scope's.

---

## 6. Wave plan

This is a scope, not the architect's plan - the wave breakdown below is a
proposal the architect wave should accept, adjust, or replace, but every wave
below deliberately includes the file that CALLS or RENDERS the new export, per
the standing rule this repo keeps relearning (`seats.md:161-163`,
`AGENTS.md` "assignment must include the wiring file").

**Wave 1 - data and reduction (no UI).**
- `src/lib/grade/class-trends-history.ts` (new) - the pure reducer, analogous
  to `computeClassTrends` but over `GradingRunEntry[]` grouped by
  `courseName` (Option A, section 2.2) with each area's per-assignment
  direction plus a stated denominator per assignment.
- `src/lib/grading-drafts.ts` - add `listReviewedGradingDrafts` (or a combined
  `listGradingDraftsForCourse`) alongside the existing `listPendingGradingDrafts`,
  same `.eq("user_id", userId)` scoping discipline as every function in this
  file already follows (`grading-drafts.ts:246,262` etc.).
- `src/app/actions/grading.ts` - a new server action wrapping the new list
  function (`requireOwner()` + `createServiceClient()`, the pattern every
  existing action in this file already follows, e.g. `:355-370`).
- File-set is disjoint from any other chunk touching `class-trends.ts`,
  `class-trends-insight.ts`, or `class-trends-draft.ts` (layers A/B/C for a
  SINGLE run) - this wave adds a new file and two new functions, it does not
  edit those three.

**Wave 2 - surface (depends on Wave 1's action and reducer).**
- A new leaf component, e.g.
  `src/app/components/drafted-grades/ClassTrendsHistoryPanel.tsx` - fetches
  via Wave 1's action, renders using Wave 1's reducer output.
- `src/app/components/DraftedGradesTab.tsx` - the two-line mount (import +
  render, following the exact precedent at `:27` and `:655` for
  `ClassTrendsPanel`), gated on `effectiveCourseFilter !== "all"`
  (`:368`) so the panel appears once a specific course is selected - THIS is
  the file list entry that makes Wave 1's export reachable; a wave list
  without it ships the reducer dead, exactly the failure mode this repo has
  shipped twice before.
- Re-measure `DraftedGradesTab.tsx`'s line count with both `wc -l` and
  `@(Get-Content ...).Count` after this wave, before calling it done - the 102
  lines of headroom (section 3.1) is a pre-wave measurement, not a promise.

**Wave 3 - UX/visual/accessibility passes** against the as-built Wave 2 diff,
per the standing wave-3 trigger table (`seats.md:50,54,56` - any change a user
can see, click, or hear read aloud; any new surface; any change to markup,
focus, or keyboard behaviour).

**Sequencing note, not a hard blocker**: `blocked_by: []` on the A25 row is
accurate in the mechanical sense (nothing prevents Wave 1 from starting), but
section 5 above recommends the reduction logic in Wave 1 be designed against
N13b's subset signal rather than only today's high/low direction, to avoid a
second pass. If N13b has not landed when this row is picked up, Wave 1 should
still ship the high/low-only version with the criteria stating that
limitation explicitly (section 5's "accept the cost" branch), rather than
waiting.

---

## 7. Residual register

Every entry: owner, instrument, object, direction of failure, step.

| ID | Object | Owner | Instrument | Direction of failure | Step |
|---|---|---|---|---|---|
| R-A25-1 | Whether the recommended surface (Candidate 1, section 3.1) actually reads well and is reachable in a real browser | Repo owner | A real browser against the deployed app (nothing renders under vitest here - `this-repo.md` section 6) | Fails if the gated panel does not appear when a course is selected, or appears in a confusing place | The next owner verification pass after Wave 2 ships |
| R-A25-2 | Course-identity collision risk from string-keyed `courseName` matching (section 2.2, Option A accepted over Option B) | Architect wave, revisited only if reported | A real instance of two same-named courses or a renamed course, reported by the owner or found in `grading_drafts` data | Fails if a term's trend silently merges two different courses or drops history after a rename | Only if/when reported - not before, per this scope's recommendation to accept Option A first |
| R-A25-3 | Row-count growth of `grading_drafts` over a real term (no cleanup path exists beyond manual discard, section 1) | Repo owner, with production access | A query against the live Supabase table (`select count(*) from grading_drafts where status = 'reviewed'`), unavailable in this checkout (no `.env`, `this-repo.md` section 6) | Fails if a real course's history query becomes slow or expensive because rows are never pruned | Before or during Wave 1's query design, once a production tick is available |
| R-A25-4 | Data-minimization: a term-trend query over whole `payload` jsonb blobs pulls every student's full feedback text into memory for a computation that only needs `rubricAreas` (section 2.3) | Wave 1 implementer or a follow-up security pass | A server-side JSON projection in the new Supabase query (`payload->'runs'->...->'rubricAreas'`), OR an explicit acceptance of the over-fetch as a first cut | Fails (as a finding, not a blocking defect) if the shipped Wave 1 query fetches full payloads with no projection and no accepted-cost note in the criteria | Wave 1's own build, or the security pass triggered by "any new network egress" (`seats.md:54`) |
| R-A25-5 | Whether a cross-assignment reduction over today's literal `classifyDirection` (high/low only, no subset) is "worth reading" per the owner's own N13b complaint about the single-run version | Repo owner / AC seat | The N13b row itself (`docs/backlog.yml:150-160`), and the AC seat's explicit "accept the cost" statement in A25's own criteria if built before N13b lands | Fails if A25 ships with no stated limitation and the owner reports the same "renders nothing useful on a realistically mixed history" complaint N13b already recorded for one run | A25's own AC round, before Wave 1 starts |
| R-A25-6 | Removal test buildability for the CORPUS/GUARANTEED leverage claim (section 5) | Test seat | A pure-function test on the new reducer: feed it two `GradingRunEntry` fixtures for the same course with contrasting scores in one area across two assignments, assert the term report reflects BOTH (not just the latest) - deleting the multi-row read (feeding it only the latest entry) must make that assertion fail | Fails if the "removal test" only asserts a single-run property that would still pass with the multi-run read deleted | Test seat's oracle-construction pass, after Wave 1's reducer signature is fixed |
| R-A25-7 | UI/click-path and keyboard reachability of the new panel and its course-filter gating | Accessibility / UX seats (Wave 3) | Reading claims only - no component renders under vitest (`this-repo.md` section 6, restated per this document's own rule) | Fails if a reading-only claim is presented as verified rather than labeled as a reading claim | Wave 3, explicitly labeled as reading claims routed to the owner for real-browser confirmation (folds into R-A25-1) |

---

## Verification of this document's own write set

```
git status --short
```
Expected and required: the only path this document's authoring touched is
`docs/a25-scope.md` itself (new, untracked before this commit). Other paths
appearing in `git status --short` at authoring time
(`docs/css-orphans.md`, `package.json`, `src/tools/backlog/cli.ts`,
`src/tools/backlog/round-ledger.ts`, observed modified/untracked when this
pass ran its own `git status --short`) belong to concurrently running agents
per this repo's stated operating mode (`AGENTS.md`, "many agents working
concurrently") and were not touched, read for content, or relied upon by any
claim in this document.

## Closing gate command and result

Command actually run (multi-file, per this repo's standing rule - never a raw
multi-path `vitest run`), output redirected to a file and the exit code
captured to a second file rather than read from a pipe:

```
npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts > /tmp/a25-gate-out.txt 2>&1
echo $? > /tmp/a25-gate-exit.txt
```

Exit code, read from `/tmp/a25-gate-exit.txt`: **0**.

Tail of `/tmp/a25-gate-out.txt`:

```
 RUN  v4.1.9 C:/Users/alexa/OneDrive/Documents/Projects/teaching-assistant

 YES src/source-bytes.structure.test.ts (3 tests) 579ms
     YES contains no NUL or other stray control bytes  357ms
 YES src/lib/no-emojis.test.ts (18 tests) 9ms

 Test Files  2 passed (2)
      Tests  21 passed (21)

COVERED src/lib/no-emojis.test.ts files=1 passed=18
COVERED src/source-bytes.structure.test.ts files=1 passed=3
```

Both paths were credited COVERED by the `test:paths` wrapper (no path was
silently dropped). No test in this repo asserts on `docs/a25-scope.md` by
name, but `src/lib/no-emojis.test.ts` scans `roots = ["src", "docs"]`
including `.md` files (per `this-repo.md`'s own citation of that scan), so
this run exercises the repo-wide emoji ban and the source-byte structural gate
over the whole tree INCLUDING the file this document adds - consistent with
`seats.md:29-38`'s note that a documentation-only chunk is still gated by
both. 18 of 18 no-emoji assertions and all 3 source-bytes assertions passed
with this file present in the tree.
