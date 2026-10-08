# Scope / recon: Courses-table column search + slow load

Two related owner asks (2026-10-06) on the Courses table surface, scoped as TWO
waves in one document. Scope only - no code. A fresh `loop-checker` reads this
before any build.

- ASK 1 - COLUMN-SPECIFIC SEARCH: search scoped to a chosen column.
- ASK 2 - SLOW LOAD: the Courses table loads slowly.

Both are authored from the TREE, not from a design doc. Every quantity below
names the command that produced it. Every `file:line` was opened.

## 0. Measurement log (every quantity names its command)

Line counts, run from the repo root:

```
# Bash: wc -l < <file>
CoursesTable.tsx            792
CoursesTab.tsx              474
useCoursesData.ts           233
CourseRow.tsx               694
cell-copy.ts                372
courses-table-helpers.ts    834
courses-table-labels.ts     134
course-hub-core.ts          313
supabase/courses.ts         289
supabase/courses.row.ts     (opened; COLUMNS at :25-26)

# PowerShell: @(Get-Content <file>).Count  -> identical values for all nine
# files above (the two tools AGREE here; no 42-line discrepancy on these).
```

Blast-radius / caller counts:

```
grep -rl 'from "@/lib/supabase/courses"' src | wc -l      -> 133
grep -rln 'import type { Course'          src | wc -l      -> 170
```

So the `Course` type is consumed by ~170 files. Any change to the SHAPE of
`Course` (making a field optional/nullable) is a 170-file blast radius. This
number is load-bearing for ASK 2's fork below.

Shared DB `listCourses` callers (the supabase one, NOT the Canvas
`listCourses` in `@/lib/canvas`):

```
grep -rn "listCourses\b" src --include=*.ts --include=*.tsx
# DB listCourses (supabase/courses) is mocked/called by at least:
#   src/app/actions/castletop.test.ts:9,17   (castletop action validates courseId via it)
#   src/app/actions/action-guard-coverage-github-cohort.test.ts:461,492
#   src/app/actions/course-hub-core.ts:28     (listCourseHubAction)
```

CONSEQUENCE for ASK 2: `listCourses` in `src/lib/supabase/courses.ts:60-70` is
SHARED. It must NOT be narrowed in place - castletop and the cohort guard path
read it too. A light list is a NEW dedicated function, never a mutation of the
shared one.

## What this environment cannot verify (stated, not filled in)

- NO real load timing. There is no `.env`, no live Supabase, the network is
  blocked under vitest, and no component is rendered by any test here. The
  felt-speed claim in ASK 2 ("loads really slow" -> "loads fast") is an
  OWNER/BROWSER walk, recorded as such in the residual register. Everything
  below argues from the CODE STRUCTURE that gates first paint, not from a
  profile.
- The relative size of `csv_data` / `rubric_data` / `course_project` payloads
  per real course is unknown here (no live rows). The over-fetch argument rests
  on the STRUCTURE (full content columns are selected and the first paint blocks
  on the whole payload), not on a measured byte figure. Where a byte figure
  would decide the fork, that is called out.

---

# ASK 1 - COLUMN-SPECIFIC SEARCH

## 1.1 Current-filter trace (opened, not recalled)

The global search is NOT in `CoursesTable`. It is in the parent, `CoursesTab`.

- The search string is parent state: `CoursesTab.tsx:74` `const [search, setSearch] = useState("")`.
- The ACTUAL row filter is `CoursesTab.tsx:114-134`:

```
const query = search.trim().toLowerCase();
const filteredCourses = courses.filter((c) => {
  if (!query) return true;
  const hay = [
    c.name, c.courseCode, c.term, c.institution, c.textbook,
    c.notes, c.topics, c.csvName, c.githubOrg,
    ...c.repos.map((r) => r.repo),
    ...c.integrations.map((i) => i.name),
  ].filter(Boolean).join(" ").toLowerCase();
  return hay.includes(query);
});
```

- `filteredCourses` is passed as the `courses` prop: `CoursesTab.tsx:342`.
- `CoursesTable` receives already-filtered rows; it renders the search box
  (`CoursesTable.tsx:505-514`, a MUI `TextField type="search"`) and calls
  `onSearchChange` (`:511`) but does NO filtering itself. `search` reaches it
  only to render the "No courses match ..." empty line (`CoursesTable.tsx:675`)
  and the placeholder.

**The per-column text extractor already exists and is the correct reuse:**
`cellTextValue(course, column, ctx)` at `src/lib/cell-copy.ts:84-184` - an
exhaustive switch over `CellColumnId` returning the cell's full display text
(selects render labels, dates ISO, numbers bare, list/file columns one entry
per line). `CellColumnId = ColumnId | "name"` (`courses-table-labels.ts:19`).
`CELL_COLUMN_LABELS` (`courses-table-labels.ts:28-75`) gives each a label.

**CRITICAL MISMATCH the checker must hold me to.** Today's "global" `hay` set
is NOT the set of table columns, in BOTH directions:

- `hay` includes fields that are NOT columns / NOT a `CellColumnId`:
  `courseCode`, `term`, `notes`, `topics` (none appear in `CELL_COLUMN_LABELS`).
- `hay` OMITS most columns that ARE columns: `description`, `roster`, `dayTime`,
  `breaks`, the four instructor fields, `weeks`, `tests`, dates, checklist, etc.

Therefore "All columns" CANNOT be redefined as "union of `cellTextValue` over
all columns" - that would change which courses match today's global search and
is a REGRESSION. "All columns" must preserve the EXACT `hay` logic above,
byte-identical. This is the single most likely place this design is gotten
wrong; it is pinned as the frozen oracle in 1.4.

## 1.2 Design

A column selector beside the existing search box. Default `"all"` reproduces
today's behavior unchanged; a specific column filters rows by ONLY that
column's `cellTextValue`.

**THE SURFACE IS A LAYER - stated so it is not shipped headless.** The user
reaches this feature through ONE control: a MUI `Select` (size `small`)
rendered immediately before the search `TextField` at `CoursesTable.tsx:505-514`
inside the existing `.adaptActionBar` row. It is wired to two new
`CoursesTableProps`: `searchColumn: SearchColumn` and
`onSearchColumnChange: (c: SearchColumn) => void`. The option list is
`["all", ...orderedVisibleColumns]` (CoursesTable already computes
`orderedVisibleColumns` at `:257`), each labeled `"All columns"` / 
`CELL_COLUMN_LABELS[id]`. Reachability control -> code is therefore:
`Select` (CoursesTable) -> `onSearchColumnChange` prop -> `setSearchColumn`
(CoursesTab) -> new pure `filterCoursesBySearch(...)` (CoursesTab:114-134 is
replaced by a call to it) -> `filteredCourses` -> `courses` prop -> rows.

Three layers, each named:

1. **Pure filter (new leaf).** `src/lib/courses-table-search.ts`, exporting
   `type SearchColumn = "all" | CellColumnId` and
   `filterCoursesBySearch(courses: Course[], search: string, searchColumn: SearchColumn, ctx?: SortContext): Course[]`.
   - `searchColumn === "all"`: byte-identical to the current `hay` filter
     (1.1). The `hay` field list is moved here VERBATIM (same fields, same
     order, same `.filter(Boolean).join(" ").toLowerCase()`, same
     `query = search.trim().toLowerCase()`, same empty-query short-circuit).
   - otherwise: `const q = search.trim().toLowerCase(); if (!q) return courses;`
     then `courses.filter(c => cellTextValue(c, searchColumn, ctx).toLowerCase().includes(q))`.
   - New leaf (not appended to `courses-table-helpers.ts`, which is already 834
     lines) imports `cellTextValue` from `./cell-copy` and `SortContext` from
     `./courses-table-helpers`. No cycle: `cell-copy` already imports
     `courses-table-helpers`, and `courses-table-helpers` must NOT import the
     new leaf (recorded memory: back-importing a constant from a parent creates
     a cycle that yields `undefined` and `tsc` misses it).
2. **Wiring (parent).** `CoursesTab.tsx`: add `searchColumn` state (persisted,
   1.3), build `sortCtx` (it already holds `syllabi` and `templates`; mirror
   `CoursesTable.tsx:285-288` so a `syllabusId`/`syllabusTemplate` column search
   matches the displayed NAME, not the raw id), replace the inline `hay` filter
   with `filterCoursesBySearch(courses, search, searchColumn, sortCtx)`, and
   pass `searchColumn`/`onSearchColumnChange` to `CoursesTable`.
3. **Selector UI (table).** `CoursesTable.tsx`: render the `Select` before the
   search box; consume the two new props.

## 1.3 Persistence (per the persist rule)

- New key: `ta-courses-search-column` (verified unused:
  `grep -rn "ta-courses" src` returns only `-sort`, `-columns`,
  `-column-order`).
- State lives in `CoursesTab` (where the filter lives). Lazy init with the
  existing client-guard idiom (`typeof window === "undefined" ? "all" : ...`,
  matching `CoursesTable.tsx:219-227`). It is a plain stored value, not a
  details-open, so no mount-effect hydration trap applies.
- **Validation on read:** a persisted column that is no longer a valid
  `CellColumnId`, or is not currently in `orderedVisibleColumns`, falls back to
  `"all"`. Writing a new value persists it. (A column hidden after being chosen
  must not leave the search silently scoped to an invisible column.)

## 1.4 Frozen oracle + machine-checkable AC (the test seat owns the oracle)

Pure function `filterCoursesBySearch(courses, search, searchColumn, ctx)`:

- **AC1 (All = today, frozen).** For `searchColumn === "all"`, the result is
  byte-identical to the current `CoursesTab.tsx:114-134` `hay` filter. ORACLE:
  a frozen literal copy of the current filter in the test file (NOT an import of
  the production function - that would be a tautology; recorded memory:
  "refactors disarm tests", use a frozen literal oracle). Object under
  comparison: the array of course ids returned. Instruments: production
  `filterCoursesBySearch(..., "all", ...)` vs the frozen literal filter.
  Direction of failure: any course whose membership differs. Axes (from a
  different source than the generator, per the test-seat rule): query strings
  drawn from an independent list (empty, a `name` substring, a `notes`
  substring, a `repos[].repo` substring, a `term` substring, a substring
  present ONLY in a non-`hay` field such as `description` - which must NOT
  match under "all"), crossed over a fixture course set.
- **AC2 (specific column matches only that column).** For a chosen column X, a
  course is in the result iff `cellTextValue(c, X, ctx)` (lower-cased) contains
  the lower-cased trimmed query. ORACLE: construct fixture courses where a token
  appears in column X's text for some courses and in a DIFFERENT column's text
  for others; assert exactly the X-carrying courses are returned and the
  other-column-carrying courses are NOT. Direction of failure: a course matches
  on a column other than the chosen one, or an X-carrying course is dropped.
- **AC3 (empty query, specific column).** `search.trim() === ""` with any
  `searchColumn` returns all courses unchanged (reference equality of the input
  order; no filtering).
- **AC4 (ctx-resolved columns).** For `searchColumn === "syllabusId"`, a query
  matching the resolved syllabus NAME (via `ctx.syllabusNameById`) matches;
  without `ctx`, it matches the raw id (cellTextValue's own fallback,
  `cell-copy.ts:144-153`). Pins that the parent builds and passes `ctx`.
- **AC5 (persisted key, source-text).** `grep` proves the literal
  `"ta-courses-search-column"` appears in `CoursesTab.tsx`, and that the read
  path falls back to `"all"` for an invalid/hidden column. (Source-text +
  pure-logic; no render.)

Not machine-checkable here (no render): that the `Select` is visually beside
the search box, is keyboard reachable, and that results update on change.
Recorded as a browser walk in the residual register.

## 1.5 Wave plan - ASK 1 (one wave, independently pushable)

Wave S1 write set (every file that CALLS a new export is included):

- `src/lib/courses-table-search.ts` (NEW leaf: `SearchColumn`,
  `filterCoursesBySearch`).
- `src/lib/courses-table-search.test.ts` (NEW: AC1-AC4 oracle).
- `src/app/components/CoursesTab.tsx` (CALLER of `filterCoursesBySearch`;
  `searchColumn` state + persistence + `sortCtx`; passes new props). This is
  the file that calls the new export - the wave is not dead code.
- `src/app/components/courses/CoursesTable.tsx` (the `Select` surface + two new
  props on `CoursesTableProps`).

Line-ceiling headroom (measured, `@(Get-Content).Count`): CoursesTable
792 -> ~+20 selector ≈ 812; CoursesTab 474 -> ~+30 ≈ 505; new leaf ~45; both
well under 1000. No extraction needed in this wave.

Gate (S1):

```
npm run test:paths src/lib/courses-table-search.test.ts
# plus tsc + eslint + build compile-line check (the repo push gate)
# plus file-size ceiling, unconditionally, for every touched non-test file:
#   @(Get-Content <file>).Count  -> assert < 1000
# plus directory-canary step (see Shared gate note below): a NEW root file is
#   added to src/lib, so any frozen-roots/basename canary over src/lib MUST be
#   re-run and its frozen list + count bumped in the SAME commit.
```

---

# ASK 2 - SLOW LOAD

## 2.1 What blocks first paint (traced, cited)

First paint of the table is gated on `state === "loading"`:

- `CoursesTab.tsx:344` `loading={state === "loading"}`.
- `CoursesTable.tsx:663-668` renders the "Loading courses…" spinner while
  `loading`; `:678` gates the whole table body on `!loading && courses.length > 0`.
- `state` starts `"loading"` (`useCoursesData.ts:74`, when `hubCache` is null)
  and only becomes `"idle"` at the END of `load()` (`useCoursesData.ts:142`).
- `load()` (`useCoursesData.ts:114-144`) awaits `Promise.all` of FOUR server
  actions (`:117-122`): `listCourseHubAction`, `listFinalizedSyllabiAction`,
  `listMyOrgsAction`, `listSyllabusTemplatesAction`. These run in PARALLEL, so
  the wait is `max(4)`, not `sum(4)`.

Two code-provable facts about that wait:

**(a) Over-fetch - the dominant, unbounded term.** `listCourseHubAction`
(`course-hub-core.ts:25-32`) -> `listCourses` (`supabase/courses.ts:60-70`) runs
ONE query: `table().select(COLUMNS)`. `COLUMNS` (`courses.row.ts:25-26`) is 55
columns and INCLUDES every heavy content column for every course:
`csv_data`, `rubric_data`, `topic_outline`, `description`, `roster`,
`notes`, `weekly_checklist`, `course_project`, `materials_files`,
`castletop_files`, `misc_files`, `export_files`, `repo_module_pairing`,
`export_module_additions`, `custom_tiles`, `student_repos`, `instructor_bio`.
`csv_data`/`rubric_data` hold whole uploaded file texts; `course_project`,
`repo_module_pairing`, `export_module_additions`, `weekly_checklist` are
generated JSON blobs. The payload is O(courses x full-content), and first paint
blocks on ALL of it plus the per-row `toCourse` coerce pass
(`courses.row.ts:94-162`, which runs `coerceCourseProject`,
`coerceWeeklyChecklist`, `coerceRepoModulePairing`, `coerceExportModuleAdditions`
per course). This term GROWS with content and course count - it is the
highest-leverage target.

**(b) Not an N+1 at the DB, and the per-cell fetches do NOT block paint.**
Confirmed by grep over the cells
(`grep -nE "Action\(|canvasFetch|supabase\." src/app/components/courses/*Cell.tsx`):
every per-cell server action (`WeeklyChecklistCell:284`, `LmsCell:91`,
`RosterCell:452`, `MiscFilesCell:52,82`, `ScheduleCell:58,72,242,267`,
`CastletopCell:104,121,165`, `FilesCell:63,86,102,276,307`,
`ProjectCell:52,66`, `SyllabusCell:116,123`, `SyllabusTemplateCell:110`) fires
only inside a user-interaction handler (upload / save / generate), never on
mount. The one post-load fan-out is the notifications effect
(`useCoursesData.ts:191-211`): N PARALLEL `getCourseNotificationsAction` calls,
one per course with `canvasUrl && institution`. It runs in a `useEffect` AFTER
`courses` land and feeds the notification badge via `setNotifByCourse`; it does
NOT gate `state`, so it does NOT block first paint. (It is a separate, real
cost - badges populate late - but it is not the first-paint blocker and is out
of scope unless the owner wants badge latency addressed; recorded as a
residual.)

**Why default-column deferral does NOT help.** `DEFAULT_VISIBLE_COLUMNS =
[...ALL_COLUMN_IDS]` (`courses-table-helpers.ts:99-101`) - every column is shown
by default. So "defer off-screen columns" buys nothing for a default user;
nothing is off-screen. The heavy columns are both fetched AND rendered (as
TRUNCATED previews - e.g. `ScheduleCsvCell` shows `truncateForCell(csvData,...)`
inline, `ScheduleCell.tsx:1-16,33-47`), so the full blob is fetched to render a
~60-char preview. That is the waste, and it is independent of visibility.

## 2.2 Dominant bottleneck + recommended fix

**Dominant bottleneck:** the over-fetch in 2.1(a). First paint blocks on a
payload containing every course's full `csv_data`/`rubric_data`/`course_project`
/`topic_outline`/`description`/`roster`/`weekly_checklist` + four file arrays,
while the cells need only truncated previews or presence of most of them.

**Recommended fix - two-phase light-first load, NO `Course`-type change
(Shape B).** Rationale: the `Course` type is consumed by ~170 files (0.), so
making heavy fields optional/nullable is the wrong blast radius. Instead keep
`Course` intact and populate it in two phases:

1. A NEW dedicated light query + action (never a narrowing of the shared
   `listCourses`, which castletop/cohort also call - see 0.):
   `listCoursesLight(userId)` selecting only the columns the rows need to
   render + sort + the inline truncated previews, returning `Course[]` whose
   HEAVY fields are placeholders (`""`/`[]`/empty-JSON) - type-identical, so no
   consumer changes. Light columns are the scalars already in `hay`/sort plus
   the presence/name fields the cells read (`csv_name`, `rubric_name`,
   `materials_zip_name`, file-array LENGTHS if cheaply derivable, etc.). The
   exact light-column set is the plan/architect's to finalize against each
   cell's render path; this scope fixes the SHAPE (light query -> paint ->
   hydrate), not the column list.
2. `useCoursesData.load()` awaits the light action first, sets `state="idle"`
   -> table paints. Then a background fetch (the existing full `listCourses`
   path) hydrates heavy fields and `setCourses` merges, WITHOUT returning
   `state` to `"loading"` (use `refreshing` or a silent merge so paint is not
   torn down).

**Guard for the transient window (the correctness hazard this introduces).**
Between phase 1 and phase 2 the heavy fields are empty placeholders. A
preview/copy/column-search on a heavy field during that window would read
empty. The fix must gate heavy-field reads on a "hydrated" flag (a per-load
boolean in the hook, NOT a `Course` field): disable the per-cell Preview /
"Copy information" / "Copy all" for heavy columns, and (interaction with ASK 1)
restrict a heavy-column SEARCH until hydrated, until the merge lands. This guard
is itself testable (2.4).

## 2.3 Owner fork - the load-fix SHAPE

The lowest-risk-vs-highest-leverage tradeoff is a genuine fork. Recommendation
and cost of each:

- **Shape B (RECOMMENDED) - two-phase light-first.** Highest leverage (first
  paint no longer waits on any heavy content). Cost: a NEW light query/action, a
  hydration merge in the hook, and the transient-window guard (2.2). Risk:
  medium - a visible "fills in" moment for heavy cells, and the guard must be
  correct or empty content is briefly readable. No `Course`-type change.
- **Shape C - trim only the never-inline heavy columns from a dedicated light
  list, load the rest eagerly as today.** Drop from the light query ONLY the
  columns the courses table never renders inline:
  `repo_module_pairing`, `export_module_additions` (used by content-tab/modules
  hooks, never by this table), and `course_project` (ProjectCell shows presence
  only until a preview click). Keep `csv_data`/`rubric_data`/etc. eager (they
  have inline truncated previews). Lower leverage (the big text blobs still
  block paint) but LOWEST risk and NO transient-empty window for any SEARCHABLE
  column - which also removes ASK 1's heavy-column-search interaction entirely.
  Cost: a dedicated light query (same "don't touch shared `listCourses`"
  constraint) + lazy fetch of the three trimmed fields where a consumer needs
  them.
- **Shape D - do nothing structural; only de-duplicate the 4x `requireOwner()`
  and/or lazy-load heavy content on expand.** Rejected as the primary fix: the
  four actions are already parallel, so paint waits on `max`, not `sum`; the
  auth de-dup is a minor constant, not the unbounded term.

**My reading, acted on now (not an owner ruling):** I recommend Shape B. If the
owner prefers to cap risk, Shape C delivers a real-but-smaller win and makes the
two waves nearly independent. The question is shaped so every answer TERMINATES:
"ASK 2 ships Shape B (two-phase, bigger win, transient-window guard) or Shape C
(trim-only, smaller win, no guard) - which do you want?" Starting the ASK 2
recon/plan under Shape B costs rework only in the hydration-merge + guard if the
owner picks C; the light-query and the "don't touch shared `listCourses`"
constraint are common to both, so that part is not at risk.

## 2.4 Machine-checkable AC (pure/structure; felt speed is a browser walk)

- **AC6 (first paint no longer blocks on heavy content).** STRUCTURE test: the
  light query's column list (a frozen exported constant, e.g.
  `LIGHT_LIST_COLUMNS`) does NOT contain the heavy content columns deferred
  under the chosen shape. Object: the light column set. Instrument: a frozen
  oracle enumerating the deferred columns. Direction of failure: a deferred
  heavy column appears in the light set. (This pins the data-shape change that
  makes the table not block on heavy data.)
- **AC7 (shared `listCourses` unchanged).** Source-text/structure: the shared
  `listCourses` (`supabase/courses.ts`) still selects `COLUMNS`; the light path
  is a SEPARATE exported function. Direction of failure: `listCourses`'s select
  narrowed (would silently regress castletop/cohort).
- **AC8 (hydration merge preserves identity + fills heavy fields).** Pure merge
  function `mergeHydratedCourses(light: Course[], full: Course[]): Course[]`:
  returns one entry per light course, in light order, with heavy fields taken
  from the matching `full` row by `id` and light/scalar fields unchanged.
  Oracle: fixtures where light has placeholders and full has content; assert
  ids/order preserved and heavy fields filled. Direction of failure: a row
  dropped, reordered, or a scalar overwritten.
- **AC9 (transient-window guard, Shape B only).** Pure predicate
  `heavyReadReady(hydrated: boolean, column): boolean` gating Preview/Copy/
  heavy-column search; false until hydrated for heavy columns, always true for
  light columns. Oracle: a frozen column->heavy map. Direction of failure: a
  heavy column reads ready before hydration.

Not verifiable here: that the table actually PAINTS SOONER (needs live DB +
browser timing). Recorded as the owner browser walk in the residual register.

## 2.5 Wave plan - ASK 2 (one wave, independently pushable)

Wave P1 write set (Shape B; Shape C is a subset - no hook hydration/guard):

- `src/lib/supabase/courses.ts` (+ `src/lib/supabase/courses.row.ts` for the
  light column list / a light mapper): NEW `listCoursesLight` and
  `LIGHT_LIST_COLUMNS`. Shared `listCourses` untouched.
- `src/app/actions/course-hub-core.ts` (NEW `listCoursesLightAction`) + the
  actions barrel export (the file that CALLS it is the hook, included below).
- `src/app/components/courses/useCoursesData.ts` (two-phase `load`, hydration
  merge, `hydrated` flag) - the CALLER of the new action.
- A pure merge/guard leaf for AC8/AC9 (e.g. add to `courses-table-helpers.ts`
  or a small new leaf) + its test.
- Test files for AC6-AC9.

Does ASK 2 touch `CoursesTable`/`CoursesTab`? Under Shape B/C the data-shape
and load live in the hook + server/lib. `state` semantics are preserved
(light phase sets `idle`; hydration is silent). So `CoursesTable.tsx` /
`CoursesTab.tsx` are NOT in this wave's write set - UNLESS the transient-window
guard (AC9) must disable per-cell Preview/Copy controls, which would touch the
cell components and/or `CourseRow`. The plan seat decides that against the final
light-column set; flagged here as the one place P1 could reach into the table.

Line-ceiling headroom (measured): courses.ts 289, courses.row.ts opened,
course-hub-core.ts 313, useCoursesData.ts 233 - all far under 1000 even with the
additions. No extraction needed.

Gate (P1):

```
npm run test:paths src/lib/supabase/<light-list>.test.ts src/app/components/courses/<merge-guard>.test.ts
# (one path per arg via test:paths - a raw multi-path vitest drops unmatched args)
# plus tsc + eslint + build compile-line check
# plus file-size ceiling (<1000) for every touched non-test file
# plus directory-canary step if a new root file is added (see Shared gate note)
```

---

# Sequencing, shared files, and the One-Off-Tasks recon

## Dependency between the two waves

**They are NOT concurrent.** Two reasons:

1. **File overlap (Shape B with the AC9 guard):** if the guard disables
   per-cell controls, P1 and S1 both reach into `CoursesTable.tsx` /
   `CourseRow` / cells, and S1 edits `CoursesTab.tsx`. Intersecting write sets.
2. **Informational dependency (even if file-disjoint):** ASK 1's per-column
   filter reads `cellTextValue` over heavy columns; ASK 2 (Shape B) makes heavy
   fields TRANSIENTLY EMPTY during hydration. So ASK 1's heavy-column search
   must know ASK 2's load timing. Per `parallel-disjointness.md`, an
   informational dependency alone forbids concurrency.

**Recommended order: ASK 2 (perf) FIRST, then ASK 1.** Why: (a) it is the
owner's stated pain; (b) it ESTABLISHES the data-availability timing that ASK
1's column filter must design against - building ASK 1 first would mean
retrofitting the hydration guard afterward. If the owner picks Shape C, there is
NO transient-empty window for any searchable column, the informational
dependency disappears, and the two waves become file-disjoint (P1 = hook +
server/lib; S1 = CoursesTab + CoursesTable + new leaf) and MAY then run
concurrently - stated so the order is not over-constrained by a fork outcome.

Intersect the write sets mechanically at build time (`sort | uniq -d`, paste
the output; empty is the only pass) once the AC9-guard decision is final - do
not eyeball it.

## Shared file with the One-Off-Tasks-move recon (also running)

The One-Off-Tasks move concerns `TasksTab`/`tasks/*`. This scope touches
`CoursesTab.tsx` and the courses data/lib. The only plausible overlap is the
top-level tab router `page.tsx` (the parent that mounts both `CoursesTab` and
`TasksTab`). NEITHER wave here edits `page.tsx` as specified (ASK 1 edits
`CoursesTab`+`CoursesTable`+a leaf; ASK 2 edits the hook+server+lib). So as
scoped there is NO shared file with the One-Off-Tasks recon. If either recon's
PLAN later needs `page.tsx`, re-check disjointness before dispatching them
together. Flagged, not assumed clear.

## Shared gate note (both waves)

Adding ANY new root file to a directory must re-run that directory's
frozen-roots / basename canary and bump its frozen list + count in the SAME
commit, or main goes red uncaught through build and verify (recorded memory:
"gate must include directory canary"). Checked at scope time:
`grep -rln "readdirSync|frozen-roots|ROOT_FILES|basename" src --include=*.test.ts`
surfaced structure tests but none that clearly enumerate `src/lib` or
`src/app/components/courses` root FILES as a frozen count (the courses-dir tests
are CSS-class canaries: `page-module-css-classes.test.ts`,
`page-module-css-orphan-classes.test.ts`). This is a scope-time read, not a
guarantee: the build wave MUST re-run the check against the tree it edits and,
if any such canary exists, bump it. Do not treat "I found none" as "there is
none".

---

# Leverage note

Neither ask is a feature that needs a new leverage claim. ASK 1 is a UX
refinement of an existing search (a bug-adjacent / usability change); ASK 2 is a
performance fix. Both are explicitly in the "not a new capability" set
(`DEV_LOOP.md` "The loop / Criteria": a bug fix / refactor has no claim). Fired
trigger recorded: no leverage claim owed. The acceptance-criteria seat should
confirm this reading rather than manufacture a claim.

---

# Disposition table

Not applicable: this is a NEW scope document with no prior version to restructure.

---

# Residual register (each: owner, instrument, step)

| # | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R1 | ASK 1 felt behavior: Select sits beside the search box, is keyboard reachable, results update on change | owner | browser walk (no render here) | After S1 ships: open Courses tab, choose a column, type, confirm rows filter; verify persistence across reload |
| R2 | ASK 2 felt speed: table paints noticeably sooner | owner | browser walk + live DB timing (no profile here) | After P1 ships: load Courses tab with a realistic course set, confirm rows appear before heavy content |
| R3 | ASK 2 transient-window correctness (Shape B): heavy Preview/Copy/search disabled until hydration | loop-test-author -> implementer | pure predicate `heavyReadReady` (AC9) | Built in P1; browser-confirm no empty content is previewable mid-hydration |
| R4 | Notification-badge fan-out latency (`useCoursesData.ts:191-211`, N parallel Canvas calls) | owner | n/a (network-blocked here) | Out of scope for these two asks; raise as a separate backlog row only if badge latency is itself a complaint |
| R5 | Shared `listCourses` must stay full-select (castletop/cohort depend on it) | loop-checker / implementer | AC7 source-text/structure | Gate on P1: assert `listCourses` select unchanged |
| R6 | Directory frozen-roots canary if a new root file is added | implementer / verifier | the directory's own canary test (if any) | Re-run `grep` for a roots canary over the edited dir at build; bump list+count same commit |
| R7 | Owner fork: ASK 2 load-fix shape (B vs C) | owner | n/a (product decision) | Terminating question in 2.3; apply the answer, record the other shape as withdrawn-with-reason |

Every residual above must be filed in `docs/BACKLOG.md` by the orchestrator at
disposal time; a residual that is not in the backlog does not exist.
