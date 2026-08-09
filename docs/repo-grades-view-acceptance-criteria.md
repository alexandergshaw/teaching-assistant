# Repo Grades: a Manual subtab for grading student repos into the LMS gradebook - acceptance criteria

A new top-level Manual subtab that lists every student repo in a course tile's
GitHub org, enumerates each repo's assignment folders, and posts grades for them
to the Canvas gradebook.

## Stated assumptions (called out because the source is ambiguous or absent)

**A1.** "Classes' rows" means course tiles - rows of the Courses table, the
`public.course_hub` table (`supabase/migrations/20260713000000_create_course_hub.sql:5`).
The org comes from that row's own `github_org` column; it is per-course, not
per-institution and not global.

**A2.** "Students' repos in the org" means one repo per student, the
`<assignment-prefix>-<student-slug>` shape `setupStudentRepoAction`
(`src/app/actions/github.ts:181-184`) already generates. A repo not bound to a
student is still listed - it is simply not postable until bound.

**A3.** "Assignment folders" means top-level folders inside a student repo, one
per assignment. Confirmed by the instructor: the view enumerates ALL of them per
repo, not one week at a time.

**A4.** "Post grades" means writing to the Canvas gradebook through the app's
existing single grade-writing function. No second posting path is created.

**A5.** Placement is a NEW top-level Manual subtab (its own row-1 chip), not a
chip under Manual > LMS and not an extension of the existing Grading view.

## Vetted existing code - reuse these, do not reinvent

Every item below was read and confirmed present during the survey for this
document.

### The GitHub side

| What | Where | Notes |
| --- | --- | --- |
| `listOrgReposAction(org, prefix?)` | `src/app/actions/github.ts:230` | Wraps `listOrgRepos` (`src/lib/github.repos.ts:128`), `GET /orgs/{org}/repos?per_page=100&sort=full_name`, optional case-insensitive prefix filter. Capped at 10 pages / 1000 repos, silently. |
| `getRepoTreeAction(repoRef, ref?)` | `src/app/actions/github-repos.ts:431` | Wraps `getRepoTree` (`src/lib/github.files.ts:17`), `git/trees/{branch}?recursive=1` - the WHOLE tree in ONE request. This is what makes folder enumeration affordable. |
| `getFileTextAction(repoRef, path, ref?)` | `src/app/actions/github-repos.ts:443` | Raw file read. |
| `gradeRepoAction(repoRef, instructions, rubric, provider, branch?, pathPrefix?)` | `src/app/actions/github-repos.ts:616` | `pathPrefix` scopes `ingestRepo` to one folder - already how folder-per-module grading works. |
| `ingestRepo(owner, repo, {maxFiles, maxBytes, perFileBytes, pathPrefix}, ref?)` | `src/lib/github.digest.ts:53` | Bounded: 40 files / 220 KB / 8 KB per file by default. |
| `parseRepoRef(ref)` | `src/lib/github.repos.ts:88` | `owner/repo` or a github.com URL. |
| `normalizeGithubHandle`, `isValidGithubUsername`, `extractGithubHandle` | `src/lib/github-usernames.ts:5`, `:18`, `:22` | Pure. `isValidGithubUsername` is GitHub's official 39-char rule. |
| `repoSlug` | `src/app/actions/github.ts:125` | `s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")` - the EXACT transform that produced the repo names, so the suffix matcher must invert this one, not a guess. |
| The student-repo week regex | `src/lib/workflows/registry/steps.grading-repos.helpers.ts:76` | `(week|wk|module|unit)[^0-9]?0*N(?![0-9])`. The existing single-folder convention. This view generalizes it; it does NOT change it. |
| `describeOrgRepoScanError(kind, ctx)` | `src/lib/workflows/registry/steps.grading-repos.helpers.ts:425` | Diagnosable blank-org / empty-org / api-error text. Reuse verbatim. |

### The Canvas side

| What | Where | Notes |
| --- | --- | --- |
| `postCanvasGrades(url, grades)` | `src/lib/canvas/grades.ts:22` | THE only grade write in the codebase. `PUT .../assignments/{id}/submissions/{userId}`, `submission[posted_grade]`, `comment[text_comment]`, optional `rubric_assessment[...]`. Sequential, fail-forward, returns `{posted, failures: [{userId, error}]}`. |
| `postCanvasGradesAction(url, grades)` | `src/app/actions/grading.ts:92` | `requireOwner()`-gated wrapper. |
| `listCourseRoster(code, courseId)` | `src/lib/canvas/listings.ts:238` | Returns `{id, name, sortableName, loginId}` per student. NO email, NO SIS id. |
| `listCourseRosterAction(code, courseId)` | `src/app/actions/canvas-inbox.ts:58` | |
| `listAssignments(code, courseId)` | `src/lib/canvas/listings.ts:171` | `CanvasAssignmentBrief = {id, name, pointsPossible}`. HAS NO SERVER-ACTION WRAPPER and zero UI consumers - this view must add the action (AC6 item 26). |
| `saveGradingDraftAction(...)` + source `"repos"` | `src/app/actions/grading.ts`, `src/lib/grading-drafts.ts:28` | The review-then-post pattern. Entry 961 requires every call site to tag its source. |

### The course tile side

| What | Where | Notes |
| --- | --- | --- |
| `CourseStudentRepo` | `src/lib/supabase/courses.ts:54` | `{student, canvasUserId: string \| null, repo, username?, email?}`. THIS ROW IS THE ENTIRE GitHub-Canvas JOIN. |
| `Course.githubOrg`, `Course.studentRepos` | `src/lib/supabase/courses.ts:70`, `:143` | Columns `github_org text`, `student_repos jsonb`. |
| `mergeOrgReposIntoStudentRepos(existing, orgRepoFullNames)` | `src/lib/courses-tab-helpers.ts:230` | Pure. Appends unmatched org repos as `{student:"", canvasUserId:null, username:null}`, dedupes case-insensitively, preserves existing rows verbatim. Pinned by REGRESSION entry 52. |
| `studentReposToRows` / `rowsToStudentReposText` | `src/lib/courses-tab-helpers.ts:209` | The `student \| canvasUserId \| repo` wire format. |
| `buildRosterUpdate` | `src/lib/workflows/roster-merge.ts:28` | Merges keyed on `canvasUserId`, skips duplicate usernames as conflicts, preserves existing repo bindings. |
| `link-github-usernames` step | `src/lib/workflows/registry/steps.course-setup.rosters.ts:34` | Reads a Canvas assignment where students submitted their handle; `canvasUserId` is the SUBMITTER'S OWN id, so it involves no guessing. This is the trusted binding source (AC2). |

### The UI side

| What | Where | Notes |
| --- | --- | --- |
| Manual rail registry | `src/app/components/manual/manual-rail.ts` | `ManualViewType` `:14`, `MANUAL_VIEW_ORDER` `:85`, `MANUAL_VIEW_LABELS` `:94`, `isManualViewType` `:111`, `getActiveDestinationId` `:129`, `resolveStateFromDestinationId` `:150`. |
| Navigation state | `src/app/components/home/useAppNavigation.ts:31`, `:38`, `:74-106` | `ManualView` alias union; `ta-manual-view` key; URL-wins-over-localStorage rule. |
| `ActiveTab` / URL | `src/app/url-state.ts:25`, `:86` | `normalizeManualView` delegates to `isManualViewType`. |
| `TabShell`, `TabHeader` | `src/app/components/TabShell.tsx:10`, `TabHeader.tsx:6` | |
| Bulk post + per-row status | `src/app/components/GradingResults.tsx:243`, `:289-354`, `:363-390`, `:653-676` | `PostState = {status:"idle"\|"posting"\|"posted"\|"error"; message?}`. Build a `userId -> student` Map BEFORE posting, then fan `result.failures[]` back per row. Copy this block. |
| Persisted selection | `src/app/components/bulk-repo/hooks/useRepoSelection.ts:7-66` | A `Set<string>` persisted as a JSON array, FILTERED against currently-valid ids on restore. |
| `useLocalStorageState<T>(key, default)` | `src/app/components/artifact-design/hooks.ts:14` | The `ta-`-namespaced persistence hook. |
| Grid mechanics | `src/app/components/tasks/TasksGrid.tsx`, `gridFocus.ts`, `columnOrder.ts`, `tasksUiState.ts` | Hand-built sticky table, `role="grid"`, roving tabindex. The courses x tasks matrix is the structural precedent for a students x assignments matrix. |
| Loading / error / empty | `src/app/components/ContentTab.tsx:266-277` | `styles.loadingState` + `role="status" aria-live="polite"`; `role="alert" className={styles.error}`; `styles.emptyState`. |

## AC1 - The subtab

1. New `ManualViewType` member `repo-grades`, label "Repo Grades". Added to
   `MANUAL_VIEW_ORDER`, `MANUAL_VIEW_LABELS`, a single-view `destinations`
   group whose `id` equals the view string, and branches in
   `getActiveDestinationId` and `resolveStateFromDestinationId`. It has no inner
   views, so `getInnerDestinations` returns null for it.
2. `useAppNavigation.ts`'s local `ManualView` alias union gains the same member,
   and `page.tsx` renders it inside `TabShell` alongside the other subtabs.
3. `manual-rail.test.ts` asserts `MANUAL_VIEW_ORDER` by EXACT array equality
   (`:170-192`) - it will fail until updated. Update it deliberately and add a
   describe block modeled on `:220-237`.
4. URL and back/forward need no special handling: `normalizeManualView`
   delegates to `isManualViewType`, which derives from `MANUAL_VIEW_ORDER`.
   `buildUrlSearch` only special-cases `course-planning`/`content`, so
   `?tab=manual&manualView=repo-grades` round-trips for free. Pin it with a test.

## AC2 - Binding a repo to a student

This is the correctness core of the feature. A wrong binding posts a grade to
the wrong student's gradebook, and this app has NO undo, NO audit table and NO
dry-run for grade posting.

5. Every row carries an explicit binding state, and it is visible:
   - `confirmed` - the tile's `studentRepos` row already has a non-blank,
     all-digits `canvasUserId`. Postable.
   - `suggested` - no stored id, but the repo name resolved to exactly one
     roster student. NOT postable until accepted.
   - `ambiguous` - resolved to more than one roster student. Not postable; the
     row offers the candidates.
   - `unbound` - no match. Not postable; the row offers a manual picker over the
     full roster.
6. NOTHING auto-applies. A `suggested` row never becomes `confirmed` without an
   explicit per-row action. There is no "accept all suggestions" control that
   skips the per-row view - a bulk accept, if offered, must list exactly what it
   is about to bind and require one confirmation naming the count.
7. The trusted source is `link-github-usernames`
   (`steps.course-setup.rosters.ts:34`), because there the `canvasUserId` is the
   submitter's own Canvas id rather than an inference. When a course has no
   confirmed rows at all, the empty state names that step by its UI label and
   says running it is the reliable way to populate bindings - it does not just
   say "no students found".
8. The suggester is ONE pure exported function in `src/lib/`:
   `suggestRepoStudentBindings(repos: string[], roster: RosterEntry[], stored: CourseStudentRepo[], orgPrefix?: string): RepoBindingSuggestion[]`.
   It performs NO I/O. Its rules, in order:
   a. A stored row matching the repo full-name case-insensitively wins outright,
      carrying its `canvasUserId` - state `confirmed` when that id is all-digits,
      otherwise `unbound`.
   b. Otherwise derive the candidate handle from the repo name by stripping the
      org prefix and any configured name filter prefix, then taking the trailing
      slug segment - inverting `repoSlug`
      (`src/app/actions/github.ts:125`), which is the transform that CREATED
      these names. Do not invent a different normalizer.
   c. Match that handle against the roster: first against any stored
      `username` (case-insensitive exact), then against `loginId`, then against
      `repoSlug(name)`. First rule that yields matches wins; later rules are not
      consulted. Exactly one match is `suggested`, more than one is `ambiguous`,
      none is `unbound`.
9. `repoSlug` collides - "Jo Smith" and "jo-smith" both slug to `jo-smith`. The
   suggester must therefore report ALL matches at a tier rather than taking the
   first, so a collision surfaces as `ambiguous` instead of silently binding the
   wrong student. Pin this with a two-student collision fixture.
10. Accepting a binding writes back to the tile's `studentRepos` through the
    EXISTING course update action, merging via the established helpers, so the
    binding persists and every other consumer (`gradeTileRepos`,
    `messaging-outlook.ts`) sees it. It never writes a parallel store.
11. A row whose `canvasUserId` is present but not all-digits is `unbound`, not
    `confirmed` - `postCanvasGrades` requires a numeric Canvas user id and
    `gradeTileRepos` already guards with `/^\d+$/`
    (`steps.grading-repos.helpers.ts:219`).

## AC3 - Enumerating assignment folders

12. Enumeration costs exactly ONE `getRepoTreeAction` call per repo:
    `git/trees/{branch}?recursive=1` returns the whole tree in one request. Do
    not walk directories.
13. A repo's assignment folders are its distinct top-level path segments of type
    `tree`, minus a configurable ignore set defaulting to dot-directories and the
    usual non-assignment folders (`.github`, `node_modules`, `docs`, `assets`,
    `img`, `images`, `.vscode`). The ignore set lives in ONE exported constant.
14. Folder discovery is a pure exported function:
    `assignmentFoldersFromTree(paths: string[], ignore: ReadonlySet<string>): string[]`,
    sorted with `localeCompare(..., {numeric: true})` so `week-2` precedes
    `week-10` - the same natural ordering `listAssignmentFolders`
    (`src/app/actions/assignment-content.ts:51`) already uses.
15. The grid's COLUMNS are the union of every repo's folders, in natural order. A
    student missing a column's folder renders as a distinct "no folder" cell -
    visually and semantically different from "folder present, not yet graded".
    That distinction is load-bearing: the existing week-folder path SKIPS such
    students with a note (`steps.grading-repos.helpers.ts:141-145`), and silently
    showing them as ungraded would hide a real problem.
16. Folder CONTENT is never read during enumeration. Reading a README or
    ingesting files happens only on an explicit action, matching REGRESSION
    entries 98 and 101, whose whole point is that per-item LLM billing and
    network cost on render is the failure mode.
17. RATE LIMITS. This codebase has NO rate-limit handling anywhere: no
    `x-ratelimit-*` read, no `Retry-After`, no backoff, and
    `checkStudentActivityAction` (`src/app/actions/github.ts:487-500`) already
    fires an unbounded `Promise.all` over every org repo. This view enumerates N
    repos at once and must not repeat that:
    a. Tree fetches go through a bounded concurrency limiter. `mapWithConcurrency`
       exists at `src/app/actions/shared.ts:662` and is currently unused by any
       GitHub code - use it rather than adding a fifth copy.
    b. A 403 from GitHub is surfaced with its real meaning. The existing message
       (`src/lib/github.repos.ts:20`) conflates rate limiting with a missing
       scope; this view must not present a rate-limit stall as a permissions
       error. Read `x-ratelimit-remaining` and `x-ratelimit-reset` when present
       and say which it was.
    c. Per-repo failure is isolated: one repo's tree failing degrades that row,
       never the grid.
18. `listOrgRepos` silently truncates at 10 pages / 1000 repos
    (`src/lib/github.repos.ts:131`). When a scan returns exactly the cap, the
    view says the list may be truncated rather than presenting it as complete.

## AC4 - The grid

19. Rows are student repos; columns are assignment folders. Every row shows the
    repo, the bound student (or its binding state), and the Canvas user id when
    confirmed.
20. A cell holds: the folder's presence, an optional score, an optional comment,
    and a post status. Score and comment are editable in place, following
    `GradingResults.tsx:781-832`'s editable-cell idiom.
21. Grading a cell reuses `gradeRepoAction(repo, instructions, rubric, provider,
    branch, folderPath)` with `folderPath` as the `pathPrefix` - the same call
    folder-per-module grading already makes. No new grading engine.
22. Sorting, filtering, column ordering and focus management follow the Tasks
    grid: pure helpers in their own modules with their own tests
    (`tasks/columnOrder.ts`, `gridFocus.ts`, `tasksUiState.ts`), leaving only
    rendering in the `.tsx`.
23. Selection is a `Set<string>` persisted under a `ta-`-prefixed key and
    FILTERED against currently-valid row ids on restore, exactly as
    `useRepoSelection.ts:17` does - a stale selection must never resurrect a row
    that no longer exists.
24. Every control in this view persists across reload under a `ta-` key
    (selected course, org prefix filter, column visibility/order, sort, the
    per-column assignment mapping). This is a standing project rule.

## AC5 - Posting

25. Each COLUMN maps to one Canvas assignment. The mapping is explicit and
    instructor-set - never inferred from a folder name resembling an assignment
    title. It persists per course under a `ta-` key. A column with no mapped
    assignment is not postable and says so.
26. The assignment picker needs `listAssignments`
    (`src/lib/canvas/listings.ts:171`), which today has NO server-action wrapper
    and zero UI consumers. Add the action; do not duplicate the lib function.
27. Posting goes through `postCanvasGradesAction`
    (`src/app/actions/grading.ts:92`) and nothing else. One call per assignment
    (per column), with the rows for that column batched into its `grades` array.
28. A row is postable only when ALL of: binding state is `confirmed`; the
    `canvasUserId` is all-digits; the column has a mapped assignment; the folder
    exists; and the score parses as a number. Postability is ONE pure exported
    predicate, so the button's enabled state and the post payload can never
    disagree.
29. Confirmation before writing, naming the count and that it writes to the live
    gradebook - the existing wording is
    `"Post N grade(s) to Canvas? This writes to the live gradebook."`
    (`GradingResults.tsx:293`).
30. Per-row status after a bulk post: build the `userId -> row` Map BEFORE
    posting, flip affected rows to `posting`, make the call, then fan
    `result.failures[]` back to individual rows with their specific messages, and
    mark the rest `posted`. A whole-request error marks every attempted row
    errored. Show an aggregate summary line. This is
    `GradingResults.tsx:300-352` - copy its structure.
31. Results are announced through a `role="status" aria-live="polite"` region,
    as the Tasks tab does (`TasksTab.tsx:717`).
32. Posting is NOT idempotent and there is no undo. The view must not imply
    otherwise: a posted cell relabels its action to "Re-post" rather than
    hiding it, matching `GradingResults.tsx:661`.

## AC6 - Boundaries and constraints

33. `src/lib/github*.ts` reads `process.env.GITHUB_TOKEN` and is server-only.
    Client components reach GitHub ONLY through `"use server"` actions. This is
    the same boundary `steps.grading-repos.helpers.ts:14-25` observes.
34. A `"use server"` module may export only async functions - no types, no
    consts, no re-exports. `tsc` and `vitest` both pass violations through;
    only `next build` catches it. `src/lib/use-server-exports.test.ts` guards it.
35. `next build` is MANDATORY for this change because it crosses the
    client/server boundary. `docs/HANDOFF.md:22-34` records two separate build
    breaks in one afternoon from exactly this, both invisible to tsc, eslint and
    vitest.
36. No file may exceed 1000 lines after the change. `src/lib/supabase/courses.ts`
    is already at 983 and is flagged to be SPLIT rather than grown;
    `GradingResults.tsx` is at 940. Plan the new view as a folder with an
    `index.tsx` plus per-panel components, as `artifact-design/` and `ppt-design/`
    do.
37. vitest is node-env and collects only `src/**/*.test.ts`, so NO component
    renders and no `.tsx` is ever loaded by a test. Every decision - binding
    suggestion, folder discovery, postability, column mapping, sort/filter,
    selection restore - lives in a pure module with its own test, leaving the
    `.tsx` to "call it and render what it says". Where a wiring gap would be
    invisible, add a source-reading guard WITH a canary pair proving the checker
    distinguishes a wired file from an unwired one
    (`useWorkflowRun.wiring.test.ts`, `page-module-css-classes.test.ts`).
38. The app cannot run locally - there is no `.env` and the middleware calls
    `createServerClient` unconditionally, so every route 500s. Nothing here is
    verifiable in a browser. Say so plainly in the entry's Limits paragraph
    rather than implying visual confirmation.
39. No emojis. `src/lib/no-emojis.test.ts` scans `src/` AND `docs/`.

## Non-goals (deliberate, not oversights)

- No change to `postCanvasGrades`, `listCourseRoster`, or the grading-draft
  schema.
- No second grade-writing path. Everything posts through
  `postCanvasGradesAction`.
- No automatic binding of a repo to a student under any confidence threshold.
- No fix to `GithubGradingPanel`'s inability to post (it passes `canvasUrl=""`
  and never sets `userId`). That panel is left alone; this view supersedes it
  for the org-repo case. Recorded so the overlap is a decision, not an oversight.
- No repo creation, no collaborator management, no org invitations.
- No grade undo, no audit table, no dry-run. Their absence is stated in the
  entry rather than quietly worked around.
- No change to the existing single-week folder-per-module grading step.
- No GitHub rate-limit RETRY. This adds bounded concurrency and honest reporting
  only; a real backoff layer is a separate change across every GitHub call site.

## Tests written BEFORE implementation

1. `suggestRepoStudentBindings`: stored-row-wins; suffix match against
   `username`, then `loginId`, then slugged name, with tier precedence; exactly
   one match is `suggested`; two matches is `ambiguous`; zero is `unbound`; a
   non-digit stored `canvasUserId` is `unbound` not `confirmed`; the "Jo Smith"
   vs "jo-smith" collision surfaces as `ambiguous`. Frozen-literal expectations.
2. `assignmentFoldersFromTree`: distinct top-level tree segments only; blobs at
   root ignored; ignore-set applied; natural ordering puts `week-2` before
   `week-10`; an empty tree yields an empty list.
3. The postability predicate: the full matrix over binding state, digit-ness,
   column mapping, folder presence, and score parseability.
4. The bulk-post failure fan-out: given a `{posted, failures}` shaped like the
   real return, every failed userId lands on its own row with its own message
   and no other row is marked errored.
5. Selection restore filters out ids no longer present.
6. `MANUAL_VIEW_ORDER` exact-equality and the
   `?tab=manual&manualView=repo-grades` URL round-trip.
7. A source-reading guard that the view calls the shared postability predicate
   rather than an inline condition, WITH a canary pair.
8. Every test sabotage-checked: break the behavior it pins, confirm it FAILS,
   restore.
