# Feature: Tasks tab - a courses x tasks matrix, with Term Setup and Daily/Weekly sub-views

Source of truth for the Term Setup task list: `C:\Users\alexa\Downloads\Adjuncting Tasks.xlsx`,
sheet "Recurring Tasks". Row 2 is the header row; columns A-C identify the course (Course /
Institution / Term); columns D-AQ are 40 setup tasks. Row 1 carries two banded group headers:
"Dependent Upon Others" (merged F1:L1) and "Independent of Others" (merged U1:AQ1). Cell values
observed across the real data: `Y` (260), `N/A` (122), `n/a` (6), `N/N` (1, a typo), and free
text used in place of a Y (`Talk with lead`, `Sharepoint`, `Dean?`, `Self Service book tab`,
`Swanson 006/008`, ...). Blank cells are conditionally formatted red (`LEN(TRIM(A2))=0` -> fill
FFEA9999) meaning "still outstanding".

## Stated assumptions (called out because the source is ambiguous or absent)

- **A1.** The sheet's "Dependent Upon Others" merge only spans F:L, but columns D, E and M-T are
  equally other-dependent (`Talk with dean`, `Email dean`, `Talk with dept chair` appear in M and
  S). The merge is read as an under-extended range. This build assigns **D-T to "Dependent Upon
  Others" (17 tasks)** and **U-AQ to "Independent of Others" (23 tasks)**, making the two groups
  contiguous and exhaustive.
- **A2.** The header in AI2 reads `Weclome Note Scheduled in LMS...`. Shipped as **"Welcome Note
  Scheduled in LMS (course days/times/location)?"** - typo corrected.
- **A3.** Trailing whitespace in G2 and the ` ?` in AI2 are normalized.
- **A4.** Rows are **one per course**, not one per (course, term): a course tile in this app
  already carries its own `term`, so the sheet's (course, term) row key collapses to the course id.
- **A5.** The workbook has NO daily/weekly sheet. The Daily/Weekly catalog in AC14 is a proposed
  default grounded in what this app already does for the instructor (drafted grades, LMS
  announcements, Canvas inbox, standups, submissions, gradebook). It is fully editable through
  AC9, so a wrong default costs a rename, not a rebuild.
- **A6.** This does NOT replace the existing per-course **Weekly Checklist** column on the Courses
  table (`course_hub.weekly_checklist`, regression entries 131/132/149/151/195, and the read-only
  overview window in the FAB). That feature is per-course FREE-FORM items with calendar sync and
  per-item deadlines. This one is a SHARED catalog applied across every course as a grid. They
  stay separate; nothing here modifies `weekly_checklist`.

---

## AC1 - The tab exists, has two sub-views, and is navigable

1. A sixth top-level tab labelled **Tasks** renders in the tab strip in `src/app/page.tsx`,
   positioned immediately after **Courses** (it is a per-course view, so it belongs beside the
   courses table, not at the end).
2. `ActiveTab` in `src/app/url-state.ts` gains `"tasks"`, and `ACTIVE_TAB_VALUES` gains it too.
   `isActiveTab("tasks") === true`. `normalizeActiveTab("tasks") === "tasks"`. `normalizeActiveTab`
   keeps every existing legacy migration and its `"manual"` default.
3. The tab has exactly two sub-views, rendered as an inner tablist INSIDE the tab (the same
   `styles.lessonInnerTab` treatment `WorkflowsPanel` uses, NOT a second MUI `Tabs` strip):
   - **Term Setup** (default) - the once-per-term matrix from the Recurring Tasks sheet.
   - **Daily / Weekly** - the recurring-cadence matrix. See AC14.
   `url-state.ts` gains `export type TasksView = "term" | "recurring"`, a `TASKS_VIEW_VALUES` set,
   `isTasksView`, `normalizeTasksView` (default `"term"`), a `tasksView` field on `UrlNavState`,
   and the `tasksView` URL param - modelled exactly on the existing `WorkflowsView` plumbing, not
   a parallel invention.
4. `buildUrlSearch({tab: "tasks", tasksView: "term", ...})` returns exactly `"?tab=tasks"` (the
   default sub-view is omitted, matching every other tab); with `tasksView: "recurring"` it returns
   `"?tab=tasks&tasksView=recurring"`. No unrelated sub-view param leaks from whatever tab was
   active before, and `tasksView` never appears on a non-Tasks tab's URL. `parseUrlState`
   round-trips both.
5. Selecting the tab, and switching sub-view within it, each push a history entry; Back returns to
   the previous view and Forward returns forward (regression entries 120 and 122). The popstate
   handler in `useAppNavigation.ts` restores `tasksView` only when `parsed.tab === "tasks"`,
   matching how `workflowsView` is gated.
6. The active tab persists under the existing `ta-active-tab` key and the sub-view under a new
   `ta-tasks-view` key, so a reload lands back on the exact sub-view.
7. The tab body is wrapped in `TabShell` with a `TabHeader` (eyebrow / title / subtitle), matching
   every other tab. **The two sub-views share ONE grid component** - the second view is a different
   task catalog and a different group split fed into the same component, never a forked copy.

## AC2 - Rows are the app's courses, read-only (both sub-views)

8. The grid's rows are exactly the courses returned by `listCourseHubAction()` - the same data the
   Courses tab shows. No course is invented, and no course can be added, renamed or deleted here.
9. Each row shows **Course name**, **Institution**, **Term**, verbatim from the course tile
   (`Course.name`, `Course.institution`, `Course.term`). These three cells are NOT editable here;
   the Courses tab remains the only place a course is edited.
10. A course with a blank `institution` or `term` renders an em dash placeholder, never `undefined`,
    `null`, or an empty cell that reads as an outstanding task.
11. When a course is added or edited on the Courses tab, switching to Tasks shows the change without
    a page reload (the tab loads courses on mount / when it becomes active).
12. Zero courses renders an empty state that names the Courses tab as where to add one - not a bare
    empty table.
13. Deleting a course on the Courses tab removes its row here, and its stored task statuses are
    cleaned up by the database (`on delete cascade`), leaving no orphan rows.

## AC3 - The Term Setup task columns

14. The 40 built-in Term Setup tasks ship with the exact labels below (subject to A1-A3), in this
    order, each with a stable string id that is what gets persisted. **Ids never change once
    shipped** - a relabel must keep the id.

    **Dependent Upon Others (17)**
    | # | id | label |
    |---|---|---|
    | 1 | `course-evaluation-form` | Course Evaluation Form Owned? |
    | 2 | `syllabus-template-obtained` | Updated Syllabus Template Obtained? |
    | 3 | `room-code-fob` | Lecture room code / fob obtained? |
    | 4 | `room-days-times` | Lecture room # / class days / times obtained? |
    | 5 | `textbook-owned` | Textbook Owned? |
    | 6 | `textbook-location` | Textbook Location Specified? |
    | 7 | `textbook-for-students` | Textbook Specified for Students? |
    | 8 | `syllabus-objectives-owned` | Syllabus/Course Objectives Owned? |
    | 9 | `course-accessible-lms` | Course Accessible in LMS? |
    | 10 | `lms-population-method` | Method of Populating LMS Shells Identified? |
    | 11 | `lms-shells-populated` | LMS Shells Populated? |
    | 12 | `external-grade-percentage` | External Grade Set to Percentage? |
    | 13 | `digital-office-hours` | Digital Office Hours Linked and Checked? |
    | 14 | `syllabus-in-lms` | Syllabus Added to LMS? |
    | 15 | `syllabus-ack-quiz` | Syllabus Acknowledgement Quiz Added? |
    | 16 | `syllabus-upload-location` | Syllabus Upload Location ID'ed? |
    | 17 | `syllabus-uploaded-college` | Syllabus Uploaded to College? |

    **Independent of Others (23)**
    | # | id | label |
    |---|---|---|
    | 18 | `labs-added` | Labs Added? |
    | 19 | `projects-run-through` | Run Through Projects/Homework on My Own? |
    | 20 | `lectures-added` | Lectures Added? |
    | 21 | `software-versions` | Instructor/Student Versions of Software Obtained? |
    | 22 | `deadlines-added` | Deadlines Added? |
    | 23 | `points-added` | Points Added? |
    | 24 | `modules-assignments-published` | All Modules and Assignments Published? |
    | 25 | `ferpa-title-ix` | Updated for FERPA and Title IX? |
    | 26 | `accessibility-100` | Accessibility at 100%? |
    | 27 | `links-validated` | Links Validated? |
    | 28 | `modules-double-checked` | All Modules Double Checked? |
    | 29 | `test-dates-chosen` | Dates Chosen for Tests? |
    | 30 | `tests-made` | Tests Made? |
    | 31 | `course-published` | Course Published? |
    | 32 | `welcome-note-scheduled` | Welcome Note Scheduled in LMS (course days/times/location)? |
    | 33 | `closing-note-scheduled` | Closing Note Scheduled in LMS? |
    | 34 | `standups-implemented` | Standups Implemented? |
    | 35 | `lecture-practiced` | Lecture/Lab Practiced in Classroom? |
    | 36 | `census-on-calendar` | Census Marked on Calendar? |
    | 37 | `grade-deadlines-marked` | Midterm and Final Grade Deadlines Marked? |
    | 38 | `census-entered` | Census Entered? |
    | 39 | `midterm-grades-entered` | Midterm Grades Entered? |
    | 40 | `final-grades-entered` | Final Grades Entered? |

15. The two groups render as a banded group-header row above the task headers, spanning exactly
    their own columns, mirroring row 1 of the sheet. The identity columns (Course / Institution /
    Term) sit under their own leading band.
16. A unit test asserts the Term Setup catalog has exactly 40 entries, every id is unique and
    non-empty, and the group split is 17/23. The test must be written so it CANNOT pass against an
    emptied catalog (assert the count and a specific id, not just "no duplicates").
17. Every task id is unique **across both catalogs** (Term Setup ids and Daily/Weekly ids never
    collide), because both persist into the same status map. A unit test pins this.

## AC4 - Cell state model

18. A cell's status is one of exactly four values: `"open"` (the default; the sheet's blank red
    cell), `"done"` (the sheet's `Y`), `"blocked"` (the sheet's `N`), `"na"` (the sheet's `N/A`).
    A cell also carries an optional free-text `note` (max 200 characters after trim) - what the
    sheet uses when it holds `Talk with dean` or `Sharepoint` instead of a Y.
19. A cell also carries `doneAt: number | null` - epoch ms of the most recent transition INTO
    `done`, null whenever the status is not `done`. This is what makes AC14's period-scoped
    completion possible, and it mirrors `WeeklyChecklistItem.checkedAt` exactly.
20. `note` is independent of `status`: a cell may be `open` with a note ("waiting on the dean"), or
    `done` with a note ("Sharepoint"). Setting a note never silently changes the status, and
    changing the status never clears the note.
21. Status is persisted per (user, course, task). A task with no stored entry reads as
    `{status: "open", note: "", doneAt: null}` - absence and `open` are the same thing. An `open`
    cell with an empty note is DELETED from the stored map rather than written, so the payload
    stays small.
22. A coercion function parses an untrusted stored payload defensively, mirroring
    `coerceWeeklyChecklist`: a non-object, a null, an array, unknown task ids, unknown status
    strings, a non-string note, an over-long note, and a non-finite `doneAt` must all be handled
    without throwing - unknown ids are dropped, unknown statuses fall back to `open`, over-long
    notes are truncated, a bad `doneAt` becomes null. A malformed payload can never crash the tab.
23. The coercion function forces the `status`/`doneAt` pairing on read regardless of what the raw
    payload says (`doneAt` is null unless status is `done`), exactly as `coerceWeeklyChecklist`
    forces `checked`/`checkedAt`.
24. Legacy spreadsheet vocabulary is accepted by a separate exported parser so a paste/import path
    can reuse it: `Y`/`y`/`Yes` -> `done`, `N`/`n`/`No`/`N/N` -> `blocked`, `N/A`/`n/a`/`NA`/`na`
    -> `na`, `""`/whitespace -> `open`. Any OTHER non-empty string becomes
    `{status: "done", note: <the trimmed string>}` - matching the sheet, where a free-text answer
    means the question is answered.

## AC5 - Editing a cell

25. Clicking a cell opens an inline editor offering the four statuses and a note field. The control
    is a real `<button>`/`<input>`, never a div with a click handler.
26. A focused cell can be cycled without opening the editor: `Enter` or `Space` advances
    `open -> done -> blocked -> na -> open`. The cycle order is pinned by a unit test.
27. A save writes only the changed cell, via a dedicated server action that upserts one
    (course, task) entry. It must NOT round-trip the whole course record, and must NOT go through
    `updateCourseHubAction`/`courseToInput` - that path nulls unlisted scalar columns (regression
    entries 61 and 223).
28. A failed save shows an inline error and reverts the optimistic cell value; it never leaves the
    UI claiming a save that did not happen.
29. Concurrent edits to two different cells of the same course do not clobber each other: the write
    is a per-key merge performed SERVER-side against the freshly-read row, not a whole-map replace
    built from stale client state.

## AC6 - Bulk entry

30. A column header menu offers "Set every visible row to ..." for each of the four statuses,
    applying only to rows currently passing the filters (the same "in view" semantics
    `CoursesTable` already uses for copy-across). The number of rows affected is stated.
31. A row menu offers "Set every visible task in this row to ...", scoped to the currently visible
    task columns.
32. Both bulk actions are a single round trip per course, never one request per cell.
33. Both announce the count changed via `role="status"`. A bulk set that would overwrite existing
    non-`open` values asks for confirmation first, naming how many cells it would change.

## AC7 - Filtering, sorting and view state

34. A toolbar offers: free-text search (matches course name, institution, term and any cell note),
    an Institution filter, a Term filter, and a "Show only courses with outstanding tasks" toggle.
35. The Institution and Term filter options are the distinct values present in the loaded courses,
    sorted, plus an "All" option. They are not a hardcoded list.
36. Rows can be sorted by Course, Institution, Term, or Progress (asc/desc). Ties break on course
    name so the order is total and stable.
37. Task columns can be individually shown/hidden, and each group can be collapsed as a unit.
    Hiding every column in a group is allowed and does not break the header spans.
38. Every one of these controls persists across a reload under `ta-tasks-*` localStorage keys
    (project standing rule), and **the two sub-views keep SEPARATE view state** (e.g.
    `ta-tasks-term-columns` vs `ta-tasks-recurring-columns`) - hiding a column in one view must not
    hide anything in the other. The parse helpers are pure, unit-tested, and fall back to the
    default on a malformed/absent value rather than throwing.
39. A persisted column set that predates a newly added task column still shows that column - the
    versioned `{v, columns}` + `COLUMNS_ADDED_IN` union idiom from `courses-table-helpers.ts` is
    reused, not reinvented. A unit test proves a v1-stored set gains a v2 column.

## AC8 - Progress summarisation

40. Each row shows its own progress as `done / applicable`, where `applicable` excludes tasks marked
    `na`, plus a proportional bar. A row with every task `na` shows an em dash, never `0/0`,
    `NaN%` or a divide-by-zero.
41. Each task column header shows how many visible courses have that task outstanding (`open` or
    `blocked`), so the bottleneck task across courses is visible at a glance.
42. A header summary states the overall figure across visible rows.
43. Progress arithmetic is pure and unit-tested, including the all-`na`, zero-courses, and
    zero-visible-columns edge cases.
44. In the Daily/Weekly view, progress counts period-scoped completion (AC14), not raw stored status.

## AC9 - Custom tasks

45. The instructor can add a custom task column (label + which group it belongs to + which sub-view
    it belongs to + position), rename any task (built-ins included), reorder tasks within a group,
    and retire a task.
46. A retired task's stored statuses are NOT deleted - retiring hides the column; restoring the task
    brings the old values back.
47. Custom tasks are per-user and persist server-side (not just localStorage), so they survive a new
    browser.
48. A renamed built-in keeps its built-in id, so its history is preserved and a future change to the
    shipped default label never overwrites the instructor's wording.
49. Labels are trimmed, capped at 200 characters, and a blank label is rejected with an inline
    message rather than creating an unlabelled column.
50. The resolved catalog (built-ins, with per-user renames/retirements applied, plus custom tasks
    slotted in at their stored positions) is computed by a PURE function that takes
    (built-in catalog, stored defs) and returns the ordered task list. Unit-tested for: a rename, a
    retirement, a custom insert, a def naming an unknown built-in id (ignored, not crashed on), and
    two defs claiming the same position (deterministic tie-break).

## AC10 - Export

51. A "Download CSV" action exports the currently visible rows and columns as a CSV whose shape
    mirrors the source sheet: an identity block (Course, Institution, Term) then one column per
    visible task, cells rendered as `Y` / `N` / `N/A` / blank, with a note appended in parentheses
    when present.
52. CSV escaping is correct for values containing commas, double quotes and newlines, unit-tested
    against those three cases specifically.

## AC11 - Persistence layer

53. A new table `public.course_tasks` stores the per-course status map, and a new table
    `public.course_task_defs` stores per-user custom/renamed/retired task definitions. Both are
    created by ONE idempotent migration, numbered above the current highest migration (**re-check
    `supabase/migrations/` for the true maximum before naming it** - the version is a monotonic
    counter, not a real date).
54. Both tables have `user_id uuid not null references auth.users on delete cascade`, RLS enabled,
    and the four owner-scoped policies (select/insert/update/delete on `auth.uid() = user_id`),
    matching `20260910000000_create_institution_pages.sql`.
55. `course_tasks` has `course_id uuid not null references public.course_hub(id) on delete cascade`
    and a unique constraint on `(user_id, course_id)`.
56. `src/lib/supabase/types.tables-a.ts` and `src/lib/supabase/types.ts` are updated by hand with
    Row/Insert/Update types for both tables (generated types are hand-maintained in this repo).
57. Typed selects are mapped through an explicit mapper function rather than relying on the inferred
    row type (typed Supabase selects collapse to `never` here).
58. **`src/lib/supabase/courses.ts` is NOT modified.** It is at 983 lines against a 1000-line cap and
    is the wrong home for this. Nothing is added to `Course`, `CourseInput`, `courseToInput` or
    `courseToInputPayload`.

## AC12 - Accessibility

59. The grid is a real `<table>` with `<th scope="col">` on every task header, `<th scope="row">` on
    the course name cell, and a `<caption>` (visually hidden is fine) describing the table.
60. Status is never conveyed by colour alone: every cell carries a text/glyph token and an
    `aria-label` naming the course, the task and the status (WCAG 1.4.1).
61. Every interactive cell is keyboard reachable and operable, with a visible focus ring meeting
    non-text contrast (WCAG 1.4.11). Arrow-key navigation across the grid uses roving tabindex so
    the grid is ONE tab stop, not 1600.
62. Colour choices meet contrast in both light and dark themes, using the app's existing CSS
    variables. The "outstanding" highlight is a subtle tint plus a border/glyph, not the
    spreadsheet's saturated red fill.
63. Bulk actions and save failures announce via `role="status" aria-live="polite"`.
64. Group headers use `colspan` with `scope="colgroup"`.
65. The two sub-view tabs use `role="tablist"`/`role="tab"` with `aria-selected` and arrow-key
    movement, matching the existing inner-tab pattern.

## AC13 - Project gates

66. No file created or modified by this work exceeds 1000 lines.
67. No emojis anywhere (enforced by `src/lib/no-emojis.test.ts`).
68. `npx tsc --noEmit`, `npx eslint src/`, `npx vitest run` and `npx next build` (to the "Compiled
    successfully" line) all pass. **`next build` is mandatory**: this feature adds a `"use server"`
    module and client components that must not transitively import `@/lib/supabase/server`.
69. `src/app/url-state.test.ts` is updated to cover the new tab id AND the new sub-view param, and
    still passes.
70. Every new pure helper has unit tests that have been sabotage-checked (break the implementation,
    confirm the test goes red, restore).

---

## AC14 - The Daily / Weekly sub-view

71. The Daily/Weekly sub-view uses the SAME grid, the SAME four statuses, the SAME notes, the SAME
    filters/sort/columns/bulk/CSV machinery, and the SAME `course_tasks` storage as Term Setup. The
    only differences are the catalog, the group labels, and the period-scoped completion below.
72. Its two groups are **Daily** and **Weekly** (replacing Dependent/Independent), rendered with the
    same banded group-header row.
73. Every task in this catalog carries a `cadence` of `"daily"` or `"weekly"`; every Term Setup task
    carries `cadence: "once"`. Cadence lives on the task definition, not on the cell.
74. **Period-scoped completion, answered at READ time and never by mutating stored state** - this
    mirrors `isChecklistItemCheckedNow` in `src/lib/weekly-checklist.ts` exactly, and that module's
    header comment is the precedent to follow:
    - `cadence: "once"` -> `done` is persistent (Term Setup behaves exactly as today).
    - `cadence: "daily"` -> a cell reads as done only when `doneAt` falls on the SAME LOCAL DAY as
      `nowMs`; otherwise it reads back as `open`.
    - `cadence: "weekly"` -> same LOCAL WEEK as `nowMs`, weeks starting **Sunday** (0=Sunday, the
      convention `WEEKLY_CHECKLIST_WEEKDAY_LABELS` in `checklist-deadline.ts` already establishes).
    - `doneAt == null` on a `done` cell reads as done-and-never-expiring (a legacy/hand-edited row
      has no period to compare against, and silently unchecking it would look like data loss) -
      this is exactly `isChecklistItemCheckedNow`'s own documented decision.
    - `blocked` and `na` are NOT period-scoped: they persist until changed. Only completion expires.
75. `isSameLocalDay` and `isSameLocalMonth` are currently module-private in
    `src/lib/weekly-checklist.ts` (lines ~223-233). **Export them from there and import them** - add
    `isSameLocalWeek` alongside them so all period predicates live in one place. Do NOT write a
    second copy in the new module. That file is 418 lines, so it has room.
76. `isSameLocalWeek(aMs, bMs)` returns true iff both instants fall in the same Sunday-started local
    week. Unit tests must cover: same day; Saturday 23:59 vs the following Sunday 00:01 (different
    weeks); Sunday 00:01 vs the following Saturday 23:59 (same week); and a pair spanning a
    year boundary.
77. A visible, plain-language caption states the reset rule, e.g. "Daily tasks clear at midnight;
    weekly tasks clear Sunday." The instructor must never have to guess why a tick disappeared.
78. The view is time-dependent, so `nowMs` is threaded in as a prop/parameter - no pure helper calls
    `Date.now()` itself (every existing pure module in this repo takes `nowMs`; the tests depend on
    it). The component re-derives on mount and on sub-view entry; it does not need a live ticker.
79. Row progress in this view means "done in the current period", so a fresh day shows every daily
    task open again. Column counts and the header summary use the same period-scoped reading.
80. The CSV export of this view states the period it was taken for (a `Generated <date>` line or a
    column header suffix), so an exported file is not ambiguous about which day/week it describes.
81. Default Daily/Weekly catalog (12 tasks, ids unique against AC3's 40) - see A5; these are a
    starting point the instructor edits:

    **Daily (4)**
    | id | label |
    |---|---|
    | `daily-lms-inbox` | LMS inbox and student email cleared? |
    | `daily-questions-answered` | Student questions answered? |
    | `daily-submissions-pulled` | New submissions pulled and graded? |
    | `daily-attendance` | Attendance / standup recorded? |

    **Weekly (8)**
    | id | label |
    |---|---|
    | `weekly-announcement-posted` | Weekly announcement posted? |
    | `weekly-module-published` | Next module published in the LMS? |
    | `weekly-lecture-ready` | Next week's lecture materials ready? |
    | `weekly-assignment-published` | Next week's assignment published? |
    | `weekly-grades-posted` | Gradebook up to date and grades posted? |
    | `weekly-feedback-returned` | Feedback returned on last week's work? |
    | `weekly-at-risk-contacted` | At-risk students contacted? |
    | `weekly-backup` | Grades and materials backed up? |

82. A unit test asserts the Daily/Weekly catalog has exactly 12 entries split 4/8, every id unique
    and non-empty, and every id disjoint from the Term Setup catalog's ids.

---

## AC15 - Presentation decisions from the best-practices research pass

These come from a research pass over real comparable products (AG Grid, Airtable, Handsontable,
monday.com, MUI X, IBM Carbon, Salesforce SLDS, caniuse as a counterexample) and the WCAG 2.2 /
ARIA APG source text. **Where an item here conflicts with an earlier AC, this section wins.**

### Structure

83. **Build the grid by hand as a semantic `<table role="grid">` with `position: sticky`. Do NOT
    use MUI `DataGrid`.** Column pinning is MUI X Pro and cell-range selection is a paid tier, so
    the two features that matter most here are not available on the free tier - and a hand-built
    table is what the rest of this app already does (`CoursesTable.tsx`).
84. Two sticky header rows: row 1 is the group band (`colspan`, `scope="colgroup"`), row 2 is the
    task headers. Sticky z-index follows Roselli's scheme exactly: column headers `z-index: 2`,
    the sticky identity column `z-index: 1`, the top-left intersection `z-index: 3`. Every sticky
    cell must paint an OPAQUE background or content shows through it - the same rule
    `CoursesTable.module.css` already documents for `.stickyName`.
85. A group can be **collapsed to a single roll-up column** showing that group's ratio for the row
    (e.g. `8 / 17`), replacing its member columns. This is AG Grid's `columnGroupShow: 'closed'`
    idea and it is the only thing that turns a 40-column scroll into an overview without a mode
    switch. Collapse state persists per sub-view.
86. **All 40 columns are visible by DEFAULT**, faithful to the sheet. The research's advice to ship
    a narrow default set is deliberately NOT followed - the instructor asked for the sheet. Group
    collapse, the column chooser, and saved column presets are the escape hatches.
87. The horizontal scroll container is `<div tabindex="0" role="region" aria-labelledby="...">`
    with `overflow: auto`. Without all three, keyboard-only users cannot reach the right-hand
    columns at all. A scroll shadow appears on the inner edge of the frozen column and at the
    right edge whenever there is more to scroll - users demonstrably miss columns when horizontal
    scrollability is not signalled.
88. The visible table title lives OUTSIDE the table: `<caption>` does not honour `position: sticky`
    and scrolls away. Supersedes the "visually hidden `<caption>`" wording in AC12 item 59 - keep a
    hidden caption for semantics if desired, but the accessible name of the scroll region is what
    must carry the title.
89. Two-dimensional scrolling is permitted here (WCAG 2.2 SC 1.4.10 Reflow exempts "parts of the
    content which require two-dimensional layout for usage or meaning", which names data grids) -
    **but the toolbar, filters, sub-tabs and headings around the table are NOT exempt and must not
    ride the horizontal scroll.**

### Cell encoding - supersedes AC12 item 62

90. Status is encoded by **four distinct silhouettes**, not four colours, so it survives
    deuteranopia, grayscale printing and both themes with one asset set (IBM Carbon's
    shape-differentiation rule, WCAG 1.4.1):
    | status | glyph | rationale |
    |---|---|---|
    | `done` | solid check mark | closed, angular |
    | `open` | hollow ring (unfilled circle, ~1.5px stroke) | open, round - and it distinguishes "outstanding" from "never touched", which the source sheet's blank cell cannot |
    | `blocked` | filled square | solid, angular, unmistakable against the ring |
    | `na` | en dash, centred, muted | horizontal line; the established comparison-matrix convention for "deliberately not applicable" |
91. **The spreadsheet's red-blank conditional format is NOT ported.** 40 columns x 30 courses is
    1200 cells, most outstanding early in a term; a red wash over ~800 of them is sole-colour
    encoding (fails 1.4.1) and is alarm fatigue - the sheet is red on day one and stays red.
    Urgency moves to the row summary column and the "outstanding only" filter. The cell stays
    neutral. An optional "Highlight outstanding" toggle may add a low-contrast tint as a
    REDUNDANT channel only (the glyph still carries the meaning), off by default, persisted.
92. A cell carrying a note shows a **corner dog-ear marker** (Excel's cell-comment triangle) and
    truncates the note to one line. It must never grow the row - variable row heights destroy the
    vertical rhythm that makes a matrix scannable.
93. Every cell's accessible name is `"<Course>, <Task>: <Status>"` plus `", note: <note>"` when a
    note exists, so a screen reader gets the same four-way distinction as a sighted user.
94. A note must never repeat its own column's name ("Talk with dean", never "Textbook: talk with
    dean").

### Interaction - supersedes AC5 item 26 and extends AC6

95. `role="grid"` is a contract, not a label. Implement the FULL APG arrow-key model or fall back
    to `role="table"`: Left/Right/Up/Down move one cell and stop at the edges; `Home`/`End` move to
    the first/last cell in the row; `Ctrl+Home`/`Ctrl+End` move to the first cell of the first row
    and the last cell of the last row; `PageUp`/`PageDown` move by a visible page of rows.
96. Focus is managed by **roving tabindex**, not `aria-activedescendant`. The APG's own stated
    tradeoff decides it: roving tabindex gets browser-native scroll-into-view for free, which is
    worth far more than avoiding a `tabindex` swap in a ~5000px-wide grid with two sticky panes.
    The grid is ONE tab stop.
97. `Enter`/`Space` on a focused cell cycles the status (AC5 item 26 stands). Additionally, the
    single keys `d` (done), `o` (open), `b` (blocked), `n` (n/a) set the status directly. These are
    **scoped to a focused gridcell only** - that is the "Active only on focus" route to satisfying
    WCAG 2.2 SC 2.1.4 Character Key Shortcuts, and it must be implemented that way rather than as
    a document-level key handler.
98. Click-to-cycle is invisible until tried and makes "set to N/A" a three-click operation, so it
    is paired with an explicit menu (right-click, or `Enter` on the cell's menu affordance) listing
    all four states with their glyphs. Cycling is the fast path; the menu is the exact one.
99. `Ctrl+D` fills the focused cell's value DOWN its column across every visible row. This is
    AG Grid's fill-down. **Rectangular range selection (Shift+Arrow, Ctrl+Enter range stamp, drag
    fill handle) is deliberately OUT OF SCOPE for this build** - it is the largest complexity for
    the smallest gain here, because whole-column and whole-row operations are the dominant real
    edits and AC6's menus already do those in one click. Note the deferral rather than half-build it.
100. The cell editor opens as a **non-modal popover/side panel, never a modal dialog** - a modal
     obscures the very rows the instructor is comparing against (NN/g).

### Progress - supersedes AC8 items 40-41

101. Row progress is its **own second sticky column** (~88px), showing `12 / 40` as text with a
     2-3px full-width meter bar beneath it. Ratio text is exact and sortable; the bar gives the
     pre-attentive scan. This is monday.com's battery column plus its group footer, both validated
     in a shipping product.
102. Column progress lives in a **sticky `<tfoot>` row**, one cell per task, showing how many
     visible courses have it outstanding. It answers "which task am I behind on across every
     course", which is the second question after "which course is behind".
103. Percentages, if shown at all, carry no decimals (`30%`, never `30.0%`), and the raw ratio is
     preferred - 40 is not a round denominator and the instructor cares about the remaining count.
104. **No sparklines, donuts, gauges or per-cell badges.** These are booleans, not a time series;
     a sparkline needs a trend and a baseline and has neither here.
105. The same number is never shown in two places. Row totals live in the row column; task totals
     live in the footer; the header summary states only the overall figure.

### Density and typography

106. Row height **36px** default, with **32px** compact and **44px** comfortable offered by a
     density switcher that lives OUTSIDE the table and persists under `ta-tasks-density`. 36px sits
     between Carbon's short (32) and md (40), matches MUI's compact factor, and clears WCAG 2.2
     SC 2.5.8 Target Size (24x24 CSS px minimum) with room for the divider.
107. Column widths: identity column **260px** (sticky, capped so zoomed users are not left with
     nothing), status columns **120px**, group roll-up columns **72px**, row-progress column
     **88px**. Status column widths are FIXED - no flex, no auto-fit; only the identity column
     may flex.
108. Type: **13px** cell text, **12px semibold sentence-case** column headers, **13px medium**
     identity column. **No all-caps headers** - all-caps destroys the word-shape scanning that is
     the entire job of a 40-column header row. This deliberately differs from
     `CoursesTable.module.css`'s uppercase `th`; state that in a comment so it does not read as an
     oversight.
109. Padding: **0 horizontal** for status cells (fixed-width centred glyphs), **12px** for the
     identity column, **8px** for note-bearing cells. Carbon's 16px is correct at 6 columns and
     ruinous at 40.
110. Alignment: identity column left-aligned; **status glyphs centred** (uniform-width symbols in a
     fixed-width column are the documented exception to the "never centre text" rule, and centring
     is what makes the column read as a vertical rhythm).
111. Dividers: 1px horizontal row dividers throughout; **vertical dividers ONLY at group boundaries
     and at the frozen-column seam** (a shadow there, not a line). Full vertical dividers on 40
     columns produce a moire.
112. **No zebra striping.** It collides with hover/selected/focus states and produces five-plus
     competing greys. Use row hover plus a visible focus ring instead. If horizontal tracking still
     reads badly, add a single 1px slightly-darker rule every 5 rows.
113. **Row-and-column crosshair highlight on hover and on focus**, as Excel and Google Sheets do.
     In a 40-wide matrix this is worth more than any other single readability affordance.
114. Cells are vertically centred and never grow: a long note truncates to one line, with the full
     text in the cell's popover.

### Anti-patterns to avoid explicitly

115a. Colour as the sole channel; red-washing empty cells; truncated headers whose full text is only
     in a `title` attribute (a `title` satisfies none of WCAG 2.2 SC 1.4.13's Dismissible /
     Hoverable / Persistent requirements and is invisible on touch); centre-aligned text columns;
     zebra stripes alongside interactive row states; modal row detail; invisible horizontal scroll;
     a scroll container without `tabindex`/`role`/name; sticky panes that eat the viewport at
     200-400% zoom (drop stickiness below a width threshold); a `<caption>` inside a sticky table;
     `role="grid"` without the full arrow-key contract; document-scoped single-letter shortcuts;
     unlabelled icon action menus.
