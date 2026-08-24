# Repo Grades: a downloadable activity log

## Why this exists

`postCanvasGradesAction` writes to a live Canvas gradebook and, as
`src/app/components/repo-grades/repoGradesPosting.ts`'s own header comment
says, it has "no undo, no audit table and no dry-run". Today the Repo Grades
view's only record of what it did is ephemeral: a per-cell `postStatus` and a
one-line `postSummary` string, both wiped on reload and both wiped when the
instructor switches course. So the two questions an instructor actually asks
after a grading session -

- "which students did I already post, at what score, to which assignment?"
- "that one failed - what did Canvas actually say?"

- are unanswerable ten minutes later.

This feature makes the view keep an append-only activity log of its own
consequential actions and lets the instructor download it. The log is the
audit trail the posting path never had.

## Scope

In scope: recording events, persisting them per course, showing a compact
recent-events panel, downloading the whole log as CSV or JSON, clearing it.

Out of scope (say so plainly rather than half-building it): server-side
storage, a cross-course log, log retention beyond this browser's
localStorage, and any change to what posting itself does. The log observes;
it never gates.

## Acceptance criteria

### L1 - what gets recorded

The view appends a log entry for each of the following, and for nothing else
(a render must never produce an entry - REGRESSION entries 98 and 101):

1. `grade-succeeded` - an on-demand "Grade" call for one cell returned a
   score. Carries the repo, the folder and the score it produced.
2. `grade-failed` - that call returned an error. Carries the error text.
3. `post-succeeded` - one row's grade was accepted by Canvas for one
   assignment. Carries repo, folder, assignment id and the exact score sent.
4. `post-failed` - one row's grade was rejected. Carries Canvas's own
   message.
5. `post-skipped` - a post attempt produced nothing postable, or a candidate
   row was dropped by `buildRepoGradePostPlan`. Carries that row's own
   `reason` from the plan, so "why was this student not posted" is answerable
   from the log alone.
6. `post-cancelled` - the instructor declined the confirm dialog. Recorded
   because "nothing happened and I do not remember why" is exactly the
   question a log exists to answer.
7. `binding-confirmed` - a repo was bound to a roster student. Bindings
   decide who a grade lands on, so they belong in the same trail as the
   grades.
8. `assignment-mapped` - a column's Canvas assignment was chosen or cleared.
9. `scan-failed` - the org scan errored. Recorded once per distinct error
   message, never once per render.

Only outcomes are recorded, never "started" - an entry means something
finished, so the log can be read as a list of facts rather than a list of
intentions.

### L2 - the entry shape and the cap

10. Every entry carries: `at` (ISO 8601), `kind`, `courseId`, `courseName`,
    `repo`, `folder`, `assignmentId`, `score`, `detail`. Fields that do not
    apply to an entry's kind are `""`, never null or absent, so a CSV row
    always has the same column count.
11. The log is capped at 500 entries per course. Past the cap the OLDEST
    entries are dropped, never the newest - a log that stops recording once
    full is worse than useless during the exact long session that filled it.
12. Appending never mutates the existing array and always returns entries in
    oldest-first order.

### L3 - persistence

13. The log persists across a reload under a `ta-` key
    (`ta-repo-grades-log`), keyed by course id, exactly like the per-column
    assignment mapping already is - one course's log is never visible under
    another course.
14. Stored data is never trusted: a malformed blob, a non-array slice, or an
    entry missing/mistyping any field is dropped on restore rather than
    crashing the view, matching `parseAssignmentMapByCourse`'s posture.
15. Restoring writes the validated result back, so an entry dropped by
    validation is dropped from storage too rather than being re-read forever.
16. A `localStorage` write that throws (quota, private browsing) loses
    persistence for that change and nothing else - it never breaks the view.

### L4 - the panel

17. An "Activity log" panel renders below the grid whenever a course is
    chosen, showing the entry count and a breakdown (graded / posted /
    failed).
18. The panel lists the most recent 10 entries, newest first, each with its
    local time, a human label for its kind, the repo/folder it concerns, and
    its detail text. The full log is only ever seen in a download - the panel
    is a confidence check, not a viewer.
19. "Download CSV" and "Download JSON" are separate buttons (one click each -
    a format picker plus a download button would cost two), disabled when the
    log is empty.
20. "Clear log" is behind a `window.confirm` naming the entry count, because
    it destroys the only copy of the audit trail.
21. The panel announces download and clear outcomes through the view's
    existing `role="status" aria-live="polite"` region rather than adding a
    second one.

### L5 - the download itself

22. Both formats go through `triggerFileDownload`
    (`src/app/components/course-planning/utils.ts`) - never a sixth
    hand-rolled `createObjectURL`/anchor/click/revoke dance (REGRESSION entry
    267 check 4).
23. CSV fields are escaped by `escapeCsvValue`
    (`src/lib/course-tasks-view-csv.ts`), not by a new local escaper, so a
    comment containing a comma, a quote or a newline cannot corrupt the file.
24. The CSV's first row is a header naming every column.
25. The JSON export is an object (`{ exportedAt, courseId, courseName,
    entryCount, entries }`), never a bare array, so a later field can be
    added without breaking a consumer.
26. The filename carries the course and a timestamp:
    `repo-grades-log-<course-slug>-<YYYYMMDD-HHMMSS>.<ext>`. A course whose
    name slugs to nothing still yields a valid filename.

### L6 - testability

27. Every decision above (append, cap, validate, format CSV, format JSON,
    build the filename, summarise) lives in pure functions in
    `repoGradesLog.ts` that `vitest` can import directly - vitest here is
    node-env and collects only `src/**/*.test.ts`, so nothing rendered is
    ever tested. The `.tsx` only calls those functions and renders what they
    returned.
28. The wiring guard (`repoGrades.wiring.test.ts`) pins that the download and
    clear calls are click-gated, with a canary proving the checker can fail.
