# Tasks tab: sort and filter rows by ANY column's values

Extends REGRESSION #232 of `docs/REGRESSION.md` (the Tasks tab) and the two AC documents
it cites. Numbering continues from the amendments file, which ends at 146, so the
items below start at **200** to leave that range alone.

## The request

"Give me the ability to sort/filter rows by any column's values in the term
setup/daily weekly subtabs."

Today the Tasks tab can sort by exactly four things (course name, institution,
term, overall progress) and filter by four (free-text search, institution, term,
outstanding-only). None of those reach the actual matrix: with 40 Term Setup task
columns and 12 Daily/Weekly ones, there is no way to ask "which courses still have
*Textbook ordered?* outstanding" or "sort by *Syllabus uploaded?* so the blocked
ones come first".

## Scope decisions (stated, not assumed)

- **Sort covers every column in the grid**: the frozen Course column (by course
  name, and by the institution/term it displays underneath the name), the frozen
  Progress column, and every task column.
- **Filter-by-value covers every column too**, but the mechanism differs by column
  because the value domains differ:
  - a **task column** filters on its four statuses (multi-select);
  - the **Progress column** filters on "has outstanding work" - the existing
    `outstandingOnly` state, surfaced on the column it describes rather than
    duplicated;
  - the **Course column** filters on institution and term - the existing toolbar
    selects, surfaced on the column that displays those values. Same state, two
    entry points, never a second copy.
- **Free-text search stays a toolbar control.** It is cross-column by definition,
  so it has no single column to hang off.
- Task-column filtering matches the **effective (period-scoped) status**, exactly
  like every other read in this feature: in Daily/Weekly, "Done" means done in the
  current day/week, not "was ticked once in March".

## Acceptance criteria

### AC-A. Sorting by a task column (pure, `src/lib/course-tasks-view.ts`)

200. `TaskSortField` gains `"task"`, and `TaskSortState` gains an optional
     `taskId?: string`, meaningful only when `field === "task"`. The existing four
     fields and the existing `{field, direction}` shape keep working unchanged,
     and every persisted value stays valid.

     TWO TRAPS, both found by the pre-implementation audit, both non-obvious:

     - **The type is `string`, never `string | null`, and every producer OMITS
       the key rather than emitting `null` on a non-task sort.** `toEqual`
       ignores an `undefined` property but treats `null` as a real value, so a
       resolver or parser that normalizes to `taskId: sort.taskId ?? null`
       fails four existing assertions, including one that is green today
       (`expect(DEFAULT_TASK_SORT).toEqual({field:"name", direction:"asc"})`).
     - **One current call site does NOT stay valid and must be fixed first:**
       `SORT_FIELD_LABELS: Record<TaskSortField, string>` at
       `src/app/components/tasks/TasksToolbar.tsx:31` is an exhaustive record
       over the union. Adding `"task"` breaks `tsc` for the whole app on the
       very first line of this work. Re-key it to the four non-task fields
       (its own type, not `TaskSortField`) before anything else is written.
       Note also that `TASK_SORT_FIELDS` (`course-tasks-view.ts:413`) is a plain
       array with no exhaustiveness check, so forgetting to add `"task"` there
       produces NO compile error - it just silently keeps rejecting every
       persisted column sort.
201. Sorting by a task column orders rows by that column's EFFECTIVE status
     (`effectiveTaskStatus`, period-scoped), never the raw stored status.
202. The status order is fixed and documented: ascending is **Blocked, Not done,
     Done**, i.e. most-attention-needed first, matching sort-by-progress ascending
     (least done first). Descending reverses those three.
203. **Not applicable always sorts last, in both directions** - the same rule the
     existing sort already applies to a blank institution or term, reusing that
     same `SortableValue.empty` mechanism. It is never "the most done".

     SCOPED TO `field === "task"` ONLY. Do NOT generalize it to progress: a
     zero-applicable row currently sorts FIRST under progress-ascending, via
     `progressRatio`'s `-1` sentinel with `empty: false`
     (`course-tasks-view.ts:310`), and that placement is now frozen by a literal
     in the existing "sorts a row with nothing applicable consistently" test.
     An earlier draft of this item justified the rule by analogy to progress
     arithmetic; that analogy was factually wrong about this codebase and would
     have licensed exactly the change that breaks it.
204. The result is still a TOTAL order: status, then course name ascending, then
     course id ascending, with both tie-breaks ascending regardless of direction
     (REGRESSION #232 check 12 must keep passing). This includes ties BETWEEN
     TWO NOT-APPLICABLE ROWS: the sorts-last branch must fall through to the
     name/id tie-break when both sides are `na`, not return a fixed 1/-1, or the
     order of two `na` rows depends on the order they arrived in.
205. A sort naming a task that is not in the `tasks` list handed to
     `sortTaskRows` - hidden column, retired task, deleted custom task, missing or
     empty `taskId` - degrades to `DEFAULT_TASK_SORT` (course name ascending)
     rather than producing an arbitrary order or throwing. `resolveTaskSort(sort,
     tasks)` exposes that same decision to the UI so the toolbar label and the
     actual row order can never disagree.
206. `parseTaskSortState` accepts the new shape, rejects a `"task"` sort with a
     missing/blank/non-string `taskId` (falling back to `DEFAULT_TASK_SORT`),
     DROPS a stale `taskId` sitting on any non-task field (that value really does
     reach localStorage - see item 227), and still falls back rather than
     throwing on anything malformed.
207. `sortTaskRows` still never mutates the array it is given.

### AC-B. Filtering by a task column's values (pure)

208. A new `TaskColumnFilters = Record<string, TaskStatus[]>` maps a task id to
     the statuses to KEEP. `TaskRowFilters` gains an optional `columns?:
     TaskColumnFilters`, so every existing caller and test compiles unchanged.
209. A row is kept when, for EVERY constrained column, that row's effective status
     for the column is in the column's selected set. Statuses within one column
     are OR-ed; columns are AND-ed with each other and with search, institution,
     term and outstanding-only.
210. A column with an **empty** selection, or one selecting **all four** statuses,
     is not a constraint at all. Deselecting everything must never silently empty
     the table.
211. A filter naming a task id that is not in the visible `tasks` list is IGNORED
     - same rule and rationale as amendment 133's search scoping: a constraint the
     instructor cannot see (hidden column, retired task, other sub-view) must
     never remove rows.
212. An unstored cell counts as `open`, so filtering a column to "Not done"
     includes courses that have never been touched.
213. `normalizeTaskColumnFilters(raw: unknown): TaskColumnFilters` - the parameter
     is `unknown`, not `TaskColumnFilters`, because it doubles as the coercion
     for untrusted persisted state. It drops empty, complete, non-status and
     blank-keyed entries (the blank-key rule `coerceTaskCellMap` already
     applies), de-duplicates, and ORDERS each selection in `TASK_STATUSES` order
     so the same selection never serializes two ways. It never throws on garbage
     input, and never mutates its input - in particular, no in-place `sort()` on
     a caller's array.
214. `filterTaskRows` never mutates the rows OR the filter object it is given.

### AC-C. Persistence (per sub-view)

215. Column filters persist as exactly `{v: CURRENT_TASK_COLUMN_FILTERS_VERSION,
     filters: {...}}` - that envelope, those two key names - written by
     `serializeTaskColumnFilters` (which NORMALIZES on write, so an empty or
     complete selection is never persisted) and read by
     `parseTaskColumnFilters`, which falls back to "no filters" on anything
     malformed and never throws. The parser must accept a hand-written payload
     of that shape, not merely its own serializer's output.
216. Term Setup and Daily/Weekly keep SEPARATE filter and sort state, exactly as
     they already do for search/institution/term/columns. Filtering a column in
     one sub-view must not affect the other. The storage key comes from a pure
     `taskColumnFiltersKey(view)` in `course-tasks-view.ts`
     (`ta-tasks-term-colfilters` / `ta-tasks-recurring-colfilters`), NOT from a
     template literal inside the component-side persistence module - REGRESSION
     #232 check 25's separation is otherwise enforced only by a string that the
     plan's step 2 refactor moves, with no test watching it.
217. Every control added here survives a reload, per the app-wide rule that any new
     textbox/select/checkbox persists.

### AC-D. Column header UI (`TasksGrid`)

218. Every column header - Course, Progress and each task column - is a button
     that opens that column's menu. The two frozen headers join the grid's
     existing roving-tabindex model at row -1, columns 0 and 1; the grid stays ONE
     tab stop and the existing arrow-key contract (including ArrowUp from body row
     0 into the header) keeps working.
219. Each task column's menu has three labelled sections:
     **Sort** (ascending / descending, `role="menuitemradio"` with `aria-checked`
     reflecting the current sort), **Filter by value** (one
     `role="menuitemcheckbox"` per status, each with its status glyph and its
     `TASK_STATUS_WORDS` label, plus "Select all" / "Clear filter"), and
     **Bulk update** (the four existing "Set every visible row to X" items,
     unchanged in behavior).
220. The Course menu offers sorting by course name, institution and term, plus the
     institution and term value pickers bound to the SAME state as the toolbar
     selects. The Progress menu offers sorting by progress plus the
     outstanding-only toggle bound to the SAME state as the toolbar checkbox.
     Changing one entry point immediately reflects in the other.

     The Progress menu's toggle inherits `outstandingOnlyDisabled` and is
     disabled under exactly the same condition as the toolbar checkbox. This is
     not cosmetic: REGRESSION #232 check 24 (amendment 132) exists because an
     all-columns-hidden progress of `{0,0,0}` filters every row away, and
     Progress is a FROZEN column that is still rendered when every task column
     is hidden - the one place the disabled state would otherwise be bypassed.
     Bind it to `effectiveOutstandingOnly`, never to the raw `outstandingOnly`.
221. `aria-sort` is set to `ascending`/`descending` on exactly ONE header cell -
     the currently sorted column - and on no other, moving as the sort moves
     (W3C APG: it is only ever on the sorted header).
222. A sorted column shows a direction indicator whose SHAPE differs between
     ascending and descending (the same triangles the toolbar already uses), never
     colour alone.
223. A filtered column shows a persistent filter indicator in its header (an
     inline SVG, `aria-hidden`, in the StatusGlyph style - this repo has no icon
     font and no `@mui/icons-material`), and the header button's accessible name
     states the active constraint in words, e.g. "Textbook ordered?, filtered to
     Not done, Blocked. Sorted ascending." Wherever a selected status SET is
     listed - chip text, header name, announcement - it is listed in
     `TASK_STATUSES` order (`open, done, blocked, na` -> "Not done, Done,
     Blocked, Not applicable"), the repo's existing canonical order, so the same
     selection never reads two different ways. That is deliberately NOT the sort
     rank of item 202, which is a magnitude and applies only to ordering rows.
224. A column whose filter removes every row still renders its header and its
     indicator; the existing "No courses match the current filters." empty row is
     what the body shows.

### AC-E. Active-filter visibility (`TasksToolbar`)

225. Active constraints render as removable chips under the toolbar: one per
     active column filter (naming the column and its selected statuses), plus the
     existing search, institution, term and outstanding-only constraints. A
     filtered table must never look identical to an unfiltered one - column
     filters can otherwise sit off-screen behind a horizontal scroll or a hidden
     column and silently change what the instructor is reading.
226. Every chip removes exactly its own constraint. A "Clear all filters" control
     appears once two or more are active and resets all of them (never the sort,
     never the column-visibility set, never density).
227. The toolbar Sort select lists the four existing fields AND every visible task
     column, grouped under headings, so sorting by a column is reachable without
     horizontal scrolling to find its header.

     A `<select>` carries ONE string, so an option's value is the opaque key
     `taskSortValueKey(sort)` produces (`"name"`, `"progress"`, `"task:<id>"`),
     decoded by `taskSortFromValueKey`. The DECODER is what clears `taskId`, not
     the caller: the existing handler is `onSortChange({...sort, field: ...})`
     (`TasksToolbar.tsx:170`), and that spread carries a stale `taskId` through
     to `JSON.stringify(state.sort)` in `persistUiState` whenever the user
     switches away from a column sort.
228. Chips and the sort control read from the same resolved state as the grid, so
     a filter on a column that is currently hidden is not shown as active (it is
     not applied - item 211).

### AC-F. Announcements and accessibility

229. Changing a column filter or the sort announces the result through the tab's
     existing polite live region, e.g. "Filtered Textbook ordered? to Blocked. 4
     of 26 courses shown." / "Sorted by Textbook ordered?, ascending."
230. Every added control is a real button/menuitem with an accessible name,
     keyboard-operable with a visible focus ring, and no meaning carried by colour
     alone. Menus close on Escape and return focus to the header button that
     opened them.
231. No emoji anywhere (`src/lib/no-emojis.test.ts` stays green). Geometric-shape
     triangles are allowed - the toolbar already ships them; Dingbats and
     Miscellaneous Symbols are not.

### AC-H. Helpers the tests pin that the items above did not name

236. `describeTaskColumnFilters(filters, tasks)` returns one descriptor per
     ACTIVE filter whose column is in `tasks`, in `tasks` order (not in the
     filter object's key order), each carrying at least `{taskId, label,
     statuses, statusWords}` - `statuses` normalized, `statusWords` built from
     `TASK_STATUS_WORDS` joined with ", ". It is the ONE source of that text for
     the chips (item 225), the header names (item 223) and the announcements
     (item 229), so those three can never drift apart. Extra fields may be added.
237. `hasActiveColumnFilter(filters, taskId)` re-applies the empty/complete rule
     rather than assuming an already-normalized map - the header indicator must
     not light up for a filter that constrains nothing, whatever it is handed.
238. `taskSortValueKey` / `taskSortFromValueKey` encode and decode the Sort
     select's option value (item 227). The decoder returns a partial sort
     (`{field}` or `{field, taskId}`, no direction) and falls back to
     `DEFAULT_TASK_SORT.field` on an unknown or malformed key, including
     `"task:"` with no id.
239. `taskColumnFiltersKey(view)` is the pure storage-key builder of item 216.

### AC-G. Structure

240. No file this work item touches exceeds 1000 lines. Real counts, measured
     with `@(Get-Content <file>).Count` (`Get-Content | Measure-Object -Line`
     silently skips blank lines and under-reports by ~10 percent - it is what
     produced the wrong figures in the first draft of this document):
     `course-tasks-view.ts` **732**, `TasksGrid.tsx` **664**, `TasksTab.tsx`
     **624**, `TasksToolbar.tsx` **311**. Headroom on `course-tasks-view.ts` is
     268 lines, and plan step 1 adds nine exports to it - if that gets tight,
     split the column-filter helpers into their own module rather than
     overrunning. The plan's extractions (`tasksUiState.ts`,
     `TaskColumnMenu.tsx`, `TasksFilterChips.tsx`) exist for the same reason.
241. All new pure logic lives in `course-tasks-view.ts` (client-safe, no
     `Date.now()`, `nowMs` from the caller) and is unit-tested there. Components
     stay presentation-only, since this repo's vitest setup cannot render them.
     The tests for this work item live in
     `src/lib/course-tasks-view.columns.test.ts`, split out of the 811-line
     `course-tasks-view.test.ts` for the same cap, mirroring the
     `weekly-checklist.frequency.test.ts` split.

## Reuse survey (verified against the code, not pattern-matched on names)

Use these; do not reinvent them.

| Use | Where | Verified by |
| --- | --- | --- |
| Period-scoped status for filtering and sorting | `effectiveTaskStatus(cell, cadence, nowMs)` - `src/lib/course-tasks.ts:363` | Read; already used by `computeTaskProgress`, `csvCellText`, `TaskGridRow`. Returns raw status for anything but `done`; `done` defers to `isTaskDoneNow`. |
| Missing cell reads as open | `taskCellAt` / `EMPTY_TASK_CELL` - `course-tasks.ts:119` | Read; frozen constant, covered by existing tests. |
| Status vocabulary in both UI and a11y strings | `TASK_STATUS_WORDS` - `course-tasks-view.ts:229` | Read; already the single source for cell aria-labels, bulk menus and announcements. Do NOT introduce a second word map. |
| Status shapes | `StatusGlyph` - `src/app/components/tasks/TaskCell.tsx` | Read via its imports in `TasksToolbar`/`TaskGridRow`; inline SVG paths with distinct silhouettes (REGRESSION #232 check 20). |
| The status enum and its order | `TASK_STATUSES` - `course-tasks.ts:67` | Read; `["open","done","blocked","na"]` is the CYCLE order, not a magnitude - the sort rank in item 202 is deliberately different and must be its own constant. |
| Total-order tie-break | `sortTaskRows`'s name-then-id tail - `course-tasks-view.ts:461` | Read; REGRESSION #232 check 12 pins it. Extend `sortFieldValue`, do not write a second comparator. |
| "Empty sorts last in both directions" | `SortableValue.empty` - `course-tasks-view.ts:416` | Read; already used for blank institution/term. `na` reuses this exact mechanism (item 203). |
| Conjunctive filtering | `filterTaskRows` - `course-tasks-view.ts:344` | Read; add one more conjunct, do not add a second filter function. |
| Versioned persisted state | `parseTaskColumnSet` / `serializeTaskColumnSet` - `course-tasks-view.ts:579` | Read; `{v, ...}` + never-throw fallback is the house idiom. Column FILTERS need no `known`-style union (a filter naming a vanished task is simply ignored - item 211). |
| Persisted-sort parsing | `parseTaskSortState` - `course-tasks-view.ts:494` | Read; extend its validation, keep the fallback-not-throw contract. |
| Header menu, roving tabindex, `data-row`/`data-col` | `TasksGrid.tsx:402-422, 540-579` | Read; the per-task header button already opens a `Menu` at row -1 and already registers a ref. Extend that slot; do not add new tab stops. |
| Live region | `announcement` state + `role="status"` in `TasksTab.tsx:289, 514` | Read; one always-mounted region, already used for bulk actions and cell errors. |
| Toolbar layout primitives | `styles.toolbar`, `toolbarGroup`, `toolbarDivider`, `summaryBar` - `TasksGrid.module.css` | Read via `TasksToolbar.tsx`; chips go in a new row under the toolbar reusing these tokens. |

## Implementation plan

Researched against the W3C APG grid/table properties guidance (`aria-sort` belongs
on exactly one header at a time; sort-direction icons must differ in shape, not
just colour; header sort controls are buttons inside the header cell) and against
current data-table filtering practice (column-level filters are the right pattern
when a column has a small bounded value domain - four statuses here; active
filters must be shown as removable chips with a "Clear all", because a filtered
table that looks unfiltered is how people misread data).

1. **`src/lib/course-tasks-view.ts`** - extend
   `TaskSortField`/`TaskSortState`/`sortFieldValue`/`TASK_SORT_FIELDS`, add
   `resolveTaskSort`, `taskSortValueKey`, `taskSortFromValueKey`,
   `TaskColumnFilters`, the `columns` conjunct in `filterTaskRows`,
   `normalizeTaskColumnFilters`, `parseTaskColumnFilters`,
   `serializeTaskColumnFilters`, `CURRENT_TASK_COLUMN_FILTERS_VERSION`,
   `taskColumnFiltersKey`, `describeTaskColumnFilters` (chip/announcement text,
   so the grid, the chips and the live region share one string source), and
   `hasActiveColumnFilter`. The status ordering of item 202 is an
   IMPLEMENTATION DETAIL - a private constant, a switch, an indexOf, whatever
   reads best. Do not export a rank map: the ordering is fully pinned as
   observable behavior by the ascending/descending tests, and exporting it would
   foreclose those choices for no testing benefit.
2. **`src/app/components/tasks/tasksUiState.ts`** (new) - move `loadUiState`,
   `persistUiState`, `loadDensity` out of `TasksTab.tsx` and add the column-filter
   keys. Keeps `TasksTab` under the cap as it gains wiring.
3. **`src/app/components/tasks/TaskColumnMenu.tsx`** (new) - one menu component
   rendering the Sort / Filter by value / Bulk update sections for a task column,
   and the Course and Progress variants. Presentation only.
4. **`TasksGrid.tsx`** - corner headers become buttons at (-1, 0) and (-1, 1);
   task headers gain `aria-sort`, the direction indicator and the filter
   indicator; the inline `Menu` is replaced by `TaskColumnMenu`.
5. **`src/app/components/tasks/TasksFilterChips.tsx`** (new) - the chip row.
6. **`TasksToolbar.tsx`** - NOT optional and NOT last: `SORT_FIELD_LABELS` at
   line 31 is an exhaustive `Record<TaskSortField, string>` and stops compiling
   the moment step 1 adds `"task"` to that union (item 200). Re-key it, then the
   sort select gains the task columns under group headings and the file renders
   `TasksFilterChips`.
7. **`TasksTab.tsx`** - new state, persistence, resolution and announcements;
   passes both down.
8. **`TasksGrid.module.css`** - chip row, header indicators, active-column
   header tint (redundant with the indicator, never the sole signal).
