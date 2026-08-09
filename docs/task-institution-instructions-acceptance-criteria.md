# Per-institution instructions on the Tasks tables - acceptance criteria

The Tasks tab's two tables (Term setup, and the daily/weekly Recurring view)
gain custom instruction text scoped per institution per task, plus the surfaces
to set and edit it.

## Stated assumptions (called out because the source is ambiguous or absent)

**A1.** Rows are courses and columns are tasks, and a course already carries its
own institution. So a literal per-(course, task) instruction would add nothing
that `TaskCell.note` does not already provide. The axis that makes "per
institution" meaningful is **per (institution, task)**: one instruction authored
once for an institution, inherited by every course at that institution in that
column - "how this school wants this task done."

**A2.** This is ADDITIVE to `TaskCell.note`, never a replacement. The note stays
the per-course, per-cell scratchpad (`src/lib/course-tasks.ts:109-112`, capped
at `TASK_NOTE_MAX_LENGTH = 200`); the instruction is the shared, per-institution
standing guidance. Both can be present on one cell at once.

**A3.** Instructions apply identically to both sub-views. Task ids are unique
across both catalogs (`src/lib/course-tasks-catalog.ts:133-135`), so one store
keyed on `task_id` serves Term and Recurring without a view discriminator.

**A4.** A course with a blank/null institution has no institution-scoped
instruction. It is not an error and not an empty-string institution - the cell
simply shows no instruction. `course_hub.institution` is nullable
(`supabase/migrations/20260715000000_course_hub_institution.sql:3`) and the grid
already renders a dash for it (`TaskGridRow.tsx:92`).

## Vetted existing code - reuse these, do not reinvent

### Storage precedent

| What | Where | Notes |
| --- | --- | --- |
| `institution_pages` | `supabase/migrations/20260910000000_create_institution_pages.sql:21-35` | The closest precedent: per-institution free-form `body text`. Its own comment at `:13-17` states institution is "a plain text column, not a foreign key, because there is no institutions table in this codebase." |
| `institution_fields` | `supabase/migrations/20260802000000_create_institution_fields.sql:3-9` | PK `(user_id, acronym)`. |
| `microsoft_credentials` | `supabase/migrations/20260708000000_create_microsoft_credentials.sql:15-26` | PK `(user_id, institution)`. |
| `grading_dismissals` | `supabase/migrations/20260623000000_create_grading_dismissals.sql:8-14` | `institution` inside the PK. |
| `course_tasks` / `course_task_defs` | `supabase/migrations/20260924000000_course_tasks.sql:28-38`, `:62-78` | The house migration style to copy: header comment explaining WHY, `user_id uuid not null references auth.users on delete cascade`, a named unique index, RLS plus exactly four `auth.uid() = user_id` policies, `-- Written idempotently.` |

`(user_id, institution, task_id)` is therefore the natural key, and it matches
every existing per-institution table in this codebase.

### The Tasks feature

| What | Where | Notes |
| --- | --- | --- |
| `TaskCell`, `TaskCellMap`, `coerceTaskCellMap`, `isEmptyTaskCell`, `applyTaskCell` | `src/lib/course-tasks.ts:107-119`, `:200-221`, `:131-133`, `:297-305` | DO NOT ride the cell. `applyTaskCell` DELETES a cell that is empty, and `coerceTaskCellMap` rebuilds a fresh `{status, note, doneAt}` per entry, silently stripping unknown fields. |
| `course_task_defs.label` | migration `:62-78`; `normalizeTaskLabel` `src/lib/course-tasks-view.ts:289-292` | DO NOT ride the def. Every def upsert writes all columns on conflict, which is why callers must go through `baseTaskCatalogOverride` (`course-tasks-view.ts:122-143`). |
| `resolveTaskCatalog(builtIns, overrides, view)` | `src/lib/course-tasks-view.ts:210-274` | Pure catalog merge. |
| `TaskRowCourse` / `TaskRow` | `src/lib/course-tasks-view.ts:67-77` | `TaskRowCourse` already carries `institution?: string \| null` - the join key is already on the row. |
| `filterTaskRows`, `distinctInstitutions` | `src/lib/course-tasks-view.ts:457-459`, `:498-500` | The existing institution comparison. See AC2 item 6 - it is trim-and-exact, and that is the trap. |
| `taskCellAccessibleName(courseName, task, cell, nowMs)` | `src/lib/course-tasks-view.ts:321-331` | Already appends `", note: <note>"`. The seam an instruction indicator extends. |
| `setCourseTaskCellsAction(courseId, patch)` | `src/app/actions/course-tasks.ts:40-43` | The read-merge-write idiom (`mergeStatusMap`, `src/lib/supabase/course-tasks.ts:68-82`) - `null` deletes, `undefined` ignored. |
| `useCourseTasksData.ts` + `useWriteChain` | `src/app/components/tasks/useCourseTasksData.ts:118`, `:161-179` | Optimistic-with-revert writes, serialized per course. |
| `TaskCell`'s editor | `src/app/components/tasks/TaskCell.tsx:405-462` | `Popper` + `ClickAwayListener` + `Paper role="dialog"`, deliberately NOT MUI `Popover`. The header at `:3-14` records why: `Popover` is `styled(Modal)` and brings focus trapping, scroll lock and `aria-hidden` on the document, which AC15 item 100 rules out. |
| `TaskColumnMenu` | `src/app/components/tasks/TaskColumnMenu.tsx:659-702` | `Popper` + `ClickAwayListener` + `Paper role="menu"`, sections Sort / Reorder / Filter / Bulk update. |
| `gridFocus.ts`, `columnOrder.ts`, `tasksUiState.ts` | `src/app/components/tasks/` | The tested pure seams. vitest is node-env and renders nothing, so new logic must live in `.ts`. |
| Live regions | `src/app/components/TasksTab.tsx:717-730` | Two, always mounted: a polite `role="status"` and an assertive one with NO role. Announce through these, never a per-cell region (`TaskCell.tsx:400-403`). |
| `normalizeInstitution` | `src/lib/knowledge-base.ts:41-43` | `value.trim().toUpperCase()` - the app's existing institution normalizer. |

## AC1 - Storage

1. ONE new table, `public.course_task_instructions`, in a new migration whose
   timestamp is above `20260930000000` (re-check for a later one before picking):
   `id uuid primary key default gen_random_uuid()`,
   `user_id uuid not null references auth.users on delete cascade`,
   `institution text not null`,
   `task_id text not null`,
   `body text`,
   `created_at timestamptz not null default now()`,
   `updated_at timestamptz not null default now()`.
2. `create unique index if not exists course_task_instructions_user_inst_task_idx
   on public.course_task_instructions (user_id, institution, task_id);`
3. RLS enabled plus exactly four owner-scoped policies named
   `"Users <read|insert|update|delete> own course_task_instructions"`, each
   preceded by its own `drop policy if exists`, `insert` using `with check` and
   the other three using `using`. Copy `20260924000000_course_tasks.sql:40-60`.
4. The migration opens with a substantial header comment naming this AC document
   and explaining WHY the shape is what it is - including why `institution` is
   plain text and not a foreign key (there is no institutions table; see
   `20260910000000_create_institution_pages.sql:13-17`), and why this is a
   separate table rather than a column on `course_task_defs` (defs are keyed
   `(user_id, task_id)` with no institution dimension, and every def upsert
   rewrites all columns). It ends `-- Written idempotently.`
5. NO foreign key to any institution table and NO enum. Migrations auto-apply
   via `.github/workflows/supabase-migrations.yml` on push to main - never
   instruct anyone to run one by hand.

## AC2 - The institution join, and the casing trap

6. THIS IS THE DEFECT THIS FEATURE WOULD OTHERWISE SHIP. The two existing
   institution stores normalize differently:
   - `institution_pages` uppercases on write via `normalizeInstitution`
     (`src/lib/knowledge-base.ts:41-43`), applied in every action.
   - `course_hub.institution` does NOT uppercase. `clean()`
     (`src/lib/supabase/courses.ts:400-403`) only trims and maps empty to null.
     The asymmetry is called out at `src/lib/supabase/courses.ts:573-578`, and is
     exactly why `countCoursesByInstitution` (`:579-588`) filters in JS rather
     than with `.eq()`.
   A tile saved as `"mcc"` and an instruction saved as `"MCC"` would therefore
   never join, and the cell would silently show no instruction - no error, no
   warning, nothing to notice.
7. Resolution: ONE exported pure function owns the comparison, and BOTH sides go
   through it at the point of comparison:
   `taskInstructionKey(institution: string | null | undefined): string` -
   `trim().toUpperCase()`, returning `""` for null/undefined/blank.
   Writes normalize with it; reads normalize the course's institution with it
   before lookup. Nothing anywhere compares raw institution strings.
8. `""` is never a lookup key. A course whose normalized institution is `""` has
   no instruction (A4), and the writer refuses to create a row for a blank
   institution rather than storing one under `""`.
9. This deliberately does NOT change how `filterTaskRows`
   (`src/lib/course-tasks-view.ts:457-459`) compares institutions today. That
   comparison is trim-and-exact and case-SENSITIVE; changing it would alter which
   rows the existing institution filter shows, which is a separate behavior with
   its own pinned tests. Recorded as a known inconsistency: the filter and the
   instruction lookup normalize differently, on purpose, and item 6's asymmetry
   is the reason. State this in the regression entry.
10. Renaming an institution is remove-then-add and ORPHANS rows silently -
    `src/lib/institution-removal.ts:66-72` states this is intentional
    ("Removing ... does NOT delete anything from the database ... Re-adding
    ... later makes them visible again exactly as they were"). Instruction rows
    inherit that behavior, which is consistent with every other
    institution-keyed table. Do not invent a rename/backfill path here; do
    record the behavior.

## AC3 - Reading and resolving

11. A pure exported resolver:
    `resolveTaskInstruction(instructions: TaskInstructionMap, institution: string | null | undefined, taskId: string): string`
    returning `""` when there is no match. `TaskInstructionMap` is keyed by
    `` `${normalizedInstitution} ${taskId}` `` or an equivalent nested map -
    pick one, document it, and never build the key inline at a call site.
12. Instructions load once per Tasks tab mount alongside the existing task data,
    scoped to the user - not per row and not per cell. The existing hook
    (`useCourseTasksData.ts`) is the place; it already owns the data layer.
13. A missing instruction, a blank instruction, and a whitespace-only
    instruction are the same thing: no instruction. Trim on write and on read.

## AC4 - Showing it in the grid

14. A cell whose (institution, task) has an instruction shows a distinct
    indicator. The cell already uses three of its four corners - `.noteMarker`
    top-right, `.errorMarker` bottom-right, `.cellMenuTrigger` top-left
    (`TasksGrid.module.css:552-561`, `:568-573`, `:583-593`) - so the
    instruction indicator takes the BOTTOM-LEFT corner, absolutely positioned,
    so it cannot grow the row.
15. The indicator is a distinct SVG SHAPE, never colour alone and never an
    emoji. Every existing indicator in this grid is a silhouette for exactly
    this reason (`TaskCell.tsx:42-48`), and `src/lib/no-emojis.test.ts` scans
    `src/` and `docs/`.
16. A cell can show the note dog-ear AND the instruction indicator AND the error
    marker at once without collision. `TasksGrid.module.css:563-567` already
    records this "opposite corners so a cell can show both at once" rule -
    follow it.
17. The accessible name extends the existing seam
    (`taskCellAccessibleName`, `course-tasks-view.ts:321-331`), which already
    appends `", note: <note>"`. It gains a bounded mention that an instruction
    exists - NOT the instruction body, which is shared, potentially long, and
    identical across every row at that institution; repeating it in a thousand
    cells' accessible names would be unusable. The `title` attribute follows the
    same rule.
18. The column header shows nothing new. Instructions vary by institution and a
    column spans institutions, so a header-level indicator would be wrong
    whenever the visible rows span more than one institution.

## AC5 - Setting it (the instructor's own follow-up: "and for me to be able to set those")

19. THE SCOPE MUST BE UNMISTAKABLE AT THE POINT OF EDIT. Editing from a cell
    looks per-cell but writes per-institution: it changes what every course at
    that institution shows in that column. That is a footgun, and the design
    must defuse it rather than rely on the instructor remembering.
    Every editing surface states the scope in words, naming both the institution
    and the task, e.g. "Applies to every course at MCC" - not a generic
    "instructions" label.
20. Editing surface A - the cell editor. The existing `Popper` editor
    (`TaskCell.tsx:405-462`) gains an Instructions section BELOW the existing
    Note field, visually separated, each labelled with its own scope: the note
    as this course only, the instruction as every course at that institution.
    The note field's behavior, cap and commit path are UNCHANGED.
21. Editing surface B - the column menu. `TaskColumnMenu` gains an Instructions
    section. When the visible rows span exactly one institution it edits that
    one; when they span several it lists them, so the instructor picks
    deliberately rather than the app guessing.
22. A cell on a course with no institution offers NO instruction editor, and
    says why in one short line rather than showing a disabled control with no
    explanation.
23. Saving announces through the existing polite live region
    (`TasksTab.tsx:717-730`), never a per-cell region.
24. Instruction bodies are capped and the cap is enforced on write AND on input,
    matching how `TASK_NOTE_MAX_LENGTH` is applied in both places
    (`course-tasks.ts:287` and `TaskCell.tsx:452`). Instructions are standing
    guidance rather than a scratch note, so the cap is larger than the note's
    200 - pick one value, name it as an exported constant, and apply it in both
    places.
25. Clearing an instruction to blank DELETES its row rather than storing an
    empty string, mirroring how an empty cell is deleted rather than stored
    (`applyTaskCell`, `course-tasks.ts:297-305`).
26. Editing an instruction changes many rows' display at once. The write is
    optimistic with revert on failure, following `useCourseTasksData.ts:264-290`,
    and a failure is surfaced rather than silently reverted.

## AC6 - Surfaces, boundaries and file budget

27. A new server action module for instructions, `"use server"`, exporting ONLY
    async functions (no types, no consts, no re-exports).
    `src/lib/use-server-exports.test.ts` guards this and `next build` is the only
    gate that catches a violation.
28. Supabase access follows the house Pattern B: functions take an injected
    `SupabaseClient<Database>` as their first argument and do NOT import
    `next/headers` or `@/lib/supabase/server` - see
    `src/lib/supabase/course-tasks.ts`. Hand-maintained row types go in
    `src/lib/supabase/types.tables-*.ts` and are registered in
    `src/lib/supabase/types.ts`. Typed selects collapse to `never`; map rows
    through an explicit mapper.
29. FILE BUDGET, checked AFTER the change. Three files in the blast radius are
    already near the 1000-line cap: `TasksGrid.tsx` at 994, `course-tasks-view.ts`
    at 953, `TasksTab.tsx` at 859. `TasksGrid.tsx` cannot absorb even a small
    addition. Extraction ships WITH this feature, not as follow-up cleanup, and
    the repo has two worked precedents for exactly this seam:
    `useColumnDrag.ts:3-11` and `columnDrag.module.css:1-2`, both split out of
    those same two files for this same reason.
30. The instruction editor must NOT be an MUI `Dialog` or `Popover` opened from
    inside a cell - both are modal and would `aria-hidden` the grid and
    scroll-lock it, ruled out in writing twice (`TaskCell.tsx:3-14`,
    `TaskColumnMenu.tsx:20-28`). Use `Popper` + `ClickAwayListener`.
31. Do not register any new trigger through `registerRef` - that map is the
    roving-tabindex registry (`TasksGrid.tsx:160-164`) and an extra `(row, col)`
    key would collide with a real cell. A trigger inside a cell stays
    `tabIndex={-1}`, keeping exactly one tab stop per column.
32. `Escape` inside the new surface must `stopPropagation()`
    (`TaskCell.tsx:421-422`) so it never reaches `useColumnDrag`'s
    document-level Escape listener (`useColumnDrag.ts:175`).
33. Keys already bound on a status cell, which the new affordance must not
    steal: all 8 nav keys, `Ctrl/Cmd+D`, bare and Shift-ed `d o n a`, `Enter`,
    `Space`, `F2` (`TaskCell.tsx:280-327`). Note the handler filters
    `ctrl/meta/alt` but NOT `shift`, so `Shift+D` already commits "done".
34. On close, restore focus to the cell's own button, the existing
    `closePopover` idiom (`TaskCell.tsx:267-270`).
35. No emojis anywhere.

## Non-goals (deliberate, not oversights)

- No per-course override of an institution instruction. `TaskCell.note` is
  already the per-course text and this feature does not duplicate it.
- No change to `TaskCell`, `TaskCellMap`, `coerceTaskCellMap`, or the
  `course_tasks.statuses` shape.
- No change to `course_task_defs` or to any def upsert path.
- No change to how `filterTaskRows` compares institutions (AC2 item 9).
- No institutions table, no uuid FK, no backfill across the eight existing
  institution text columns. That is a much larger change with its own migration
  strategy.
- No rename or merge path for institutions.
- No instruction history, versioning, or audit.
- No LLM consumption of instructions in this change. Making workflow steps read
  them is a natural follow-up and is deliberately separate.
- No CSV export column for instructions (they are not per-row data).

## Tests written BEFORE implementation

1. `taskInstructionKey`: trims, uppercases, maps null/undefined/blank to `""`.
   Frozen literal table.
2. The casing join: a course stored `"mcc"` resolves the instruction stored
   `"MCC"`. THIS IS THE ANTI-DEFECT TEST for AC2 item 6 - it must FAIL against
   a naive raw-string comparison. Verify that it does before accepting it.
3. `resolveTaskInstruction`: hit, miss, blank body, whitespace-only body, and a
   course with null institution all behave per AC3/AC4.
4. Blank institution never produces a stored row (AC2 item 8).
5. Clearing to blank deletes the row rather than storing `""` (AC5 item 25).
6. The cap is enforced on write, not only in the input (AC5 item 24).
7. The accessible name mentions that an instruction exists WITHOUT inlining its
   body (AC4 item 17), asserted as a frozen literal.
8. A cell renders note, instruction and error indicators simultaneously without
   one displacing another - asserted through whatever pure helper decides the
   indicator set, since vitest renders no component.
9. Both sub-views resolve the same instruction for the same task id (A3).
10. Every test sabotage-checked: break the behavior it pins, confirm it FAILS,
    restore. Report which were verified.
