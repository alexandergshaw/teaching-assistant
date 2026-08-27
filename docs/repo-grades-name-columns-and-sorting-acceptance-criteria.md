# Repo Grades: first/last name columns and sortable columns - acceptance criteria

Requested 2026-08-26: "the table in the repo grading table should have a
column for first name, a column for last name, and all columns should be
sortable", clarified with "these names should be populated from the roster in
the courses table that are associated to repos".

## N1 - There is no stored first/last split, and one option would break the app

1. `course.roster` is a single `string | null` column
   (`src/lib/supabase/courses.row.ts:48`), parsed by `rosterToRows`
   (`src/lib/courses-tab-helpers.ts:194-200`) into exactly
   `{ student, username }`. A grep for `firstName|lastName|givenName|
   familyName|splitName` across `src/` returns nothing. The name is one
   opaque display string everywhere it travels.
2. **Extending the roster line with a third pipe-separated field is REJECTED
   as actively destructive**, not merely risky. `rosterToRows` splits on
   `lastIndexOf("|")`, so `Ana Ruiz | aruiz | Ana | Ruiz` would parse
   `username` as `"Ruiz"` - eating the GitHub username the entire binding
   depends on. `rowsToRoster` (`:202-207`) re-emits only two fields, so a
   third would be silently deleted on the next Roster-tile save, and three
   writers emit that rigid shape. Do not do this.

## N2 - The derivation, using a convention this app already has

3. First/last are DERIVED from the display string. The instructor's
   correction channel is the COMMA, which this codebase already treats as a
   deliberate Last-First signal (`canonicalNameKey`,
   `rosterUsernameOverlay.ts:56-66`) and which the Roster tile already
   advertises - its placeholder is literally `"Smith, John"`
   (`RosterCell.tsx:95`).
4. The rules, in order:
   - **Comma present** -> instructor-explicit. Split at the first comma:
     last name before, first name after. Display with NO derived-marker,
     because the instructor said it.
   - **No comma, two or more tokens** -> last-word rule (final token is the
     last name, everything before is the first name). Display WITH a visible
     marker that this was derived, and tell the instructor how to correct it:
     type `van der Berg, Ana`.
   - **Single token** -> the last name is UNKNOWN. Show an em dash, never a
     guess. A one-word name is not a first name with an empty surname.
5. This requires NO roster format change and NO migration, and it degrades
   honestly on multi-part surnames, suffixes, and names already in
   "Last, First" order - the four cases a naive split silently mangles.
6. `listCourseRosterAction` already returns `CanvasRosterEntry.sortableName`
   (Canvas's own "Last, First"), and `useRepoGradesData.ts:340` currently
   drops it. Where it is present it is BETTER than any derivation, because
   Canvas holds the real split. Prefer it when available; derive only as the
   fallback. This is a free correctness win, not scope creep.

## N3 - The anti-fabrication rule (this is the one that matters)

7. The name columns derive from `row.binding.student` and NOTHING ELSE. An
   independent `course.roster` lookup is precisely how the table would come
   to show a name that disagrees with the Binding cell rendered beside it.
   The instructor asked for roster-populated names, and `binding.student`
   IS the roster-derived value - this view already bridges the two fields
   every render via `overlayRosterUsernames`
   (`useRepoGradesData.ts:437-438`).
8. A repo with no roster match shows empty name cells and its existing
   binding state - never a fabricated or guessed name.
9. Disagreements between the roster and `studentRepos` already surface
   honestly today: a name-spelling mismatch produces an AMBIGUOUS binding
   (two candidates with distinct dedupe keys,
   `repo-student-bindings.ts:113`) rather than a silent pick. Do not
   "improve" this by picking one.
10. One real leak to close: a CONFIRMED row with a blank stored `student`
    falls back to the LIVE CANVAS name (`repo-student-bindings.ts:160`), not
    the roster. That row's name therefore has a different provenance from
    every other row's. Mark the source rather than letting it pass as a
    roster name.

## N4 - Sortability

11. Today's sort is a `<select>` over TWO fields (`repo`, `binding`), not
    clickable headers. "All columns sortable" means every column gets a
    header control, including the dynamic per-folder score columns.
12. Reuse the Tasks view's solution rather than reinventing it. The exact
    precedent for every hard part is `src/lib/course-tasks-view.ts:545-747`:
    `resolveTaskSort` for stale-field resolution, `SortableValue.empty` for
    blank-sorts-last, the `Record<Field, true>` exhaustiveness trick, and
    `parseTaskSortState` for the never-trust-stored-data parse. The header
    button and `aria-sort` markup precedent is `TasksGrid.tsx:783-810`.
13. Sorting by a FOLDER column is a different comparator from sorting by a
    row-level string: the scores live in `repoGradesCellEdits.ts`, not on the
    row (`repoGradesRows.ts:76-83`). So the sort function must take
    `cellEdits`. `RepoGradesGrid.tsx:233-239` ALREADY duplicates the merge
    helper once - do not create a third copy; consolidate or reuse.
14. Blank, non-numeric, and fraction-shaped scores must all sort sensibly and
    predictably, with blanks last regardless of direction. Fixtures must
    include all three or the branch never runs.

## N5 - Three ways this ships broken with every gate green

15. `parseSortValue` (`RepoGradesControls.tsx:49-55`) coerces EVERY unknown
    field to `"repo"`. Leave it as-is and a header-set sort snaps back to
    repo the moment the instructor touches the select - the two controls
    would disagree about what the sort is.
16. The cell text and the sort key reading different name sources. They must
    read the one derivation (N3 item 7), or the table sorts by something
    other than what it displays.
17. `ta-repo-grades-sort` is a GLOBAL key, not per-course. Restoring a folder
    sort for a folder the newly-selected course does not have would render
    scan order while the header claims a sort. Either scope the key per
    course, matching `ta-repo-grades-folder`'s per-course slice
    (`repoGradesUiState.ts:373-413`), or resolve the stale field on restore
    the way `resolveTaskSort` does. State which and why.

## N6 - Size and placement

18. `index.tsx` is at 892 of the 1000-line cap. It gets NOTHING beyond
    threading arguments through. `repoGradesRows.ts` (282 lines) absorbs the
    sort work. A new pure `repoGradeStudentName.ts` owns the split, so the
    derivation rules are unit-testable without rendering anything.

## N7 - Verification

19. vitest is node-env and NEVER renders a component, so the header markup,
    `aria-sort`, and click behaviour are verified by reading only. Every
    derivation and comparator decision lives in a pure module with real
    tests.
20. Name-split fixtures MUST include: a comma form, a plain two-token name, a
    multi-part surname, a suffix, a single token, and an empty string. A
    suite that only tests `"Ana Ruiz"` proves nothing about the cases that
    make this feature honest.
21. A source-reading guard, with a canary, that the name cells and the sort
    key read the same source (N5 item 16).

## Sequencing

Begins after the current chunk - porting the three feedback boxes and the
file-viewer control into the Repo Grades view - is pushed. Both touch
`RepoGradesGrid.tsx` and the row/cell model. A BASELINE entry covering the
current two-field select sort and the current binding/name provenance goes
into `docs/REGRESSION.md` first.
