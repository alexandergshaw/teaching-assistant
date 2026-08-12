# A common grading folder, and pulling instructions/rubric from an LMS assignment

Two additions to the GitHub-repo grading subtab (Manual > Grading > source
"GitHub repo", `GithubGradingPanel.tsx`):

- **A** - pick one COMMON FOLDER to grade inside every pulled-in student repo.
- **B** - pick an assignment from a live LMS connection OR a course export, and
  pull its instructions (and, where available, its rubric) into the two boxes
  that already drive grading.

## Reuse survey (vetted - every symbol below was read before this doc was written)

| Need | Existing symbol | Path | Notes |
| --- | --- | --- | --- |
| Scope a repo read to a folder | `ingestRepo(owner, repo, opts, ref?)`, `opts.pathPrefix` | `src/lib/github.digest.ts:53`, prefix logic `:62-64`, applied `:75` | ALREADY IMPLEMENTED. Normalizes a trailing slash and lowercases. **No change to this file is needed.** |
| The precedent that already passes it | `gradeRepoAction(repoRef, instructions, rubric, provider, branch?, pathPrefix?)` | `src/app/actions/github-repos.ts:616` | Working call site: `src/app/components/repo-grades/index.tsx:249`. |
| The action that does NOT pass it | `gradeReposAction(repos, assignmentInstructions, rubric, provider)` | `src/app/actions/github.ts:597`, hardcodes `{}` at `:609` | This is the multi-repo queue path the subtab uses. |
| Same gap, reference repo | `generateRubricFromRepoAction` | `src/app/actions/github.ts:555`, hardcodes `{}` | |
| Queue item shape | `RepoQueueItem = { repoRef; branch?; label? }` | `src/app/actions-types.ts:279` | |
| Fetch one repo's tree from the client | `getRepoTreeAction(repoRef, ref?): Promise<{tree: RepoTreeEntry[]} \| {error}>` | `src/app/actions/github-repos.ts:431` | |
| Derive candidate folders from a tree | `assignmentFoldersFromTree(paths: string[], ignore?): string[]` + `DEFAULT_IGNORED_REPO_FOLDERS` | `src/lib/repo-assignment-folders.ts:38`, `:23` | Pure, already unit-tested, drops dot-dirs, natural-numeric sort. |
| Path normalizer precedent | `normalizePath` | `src/app/components/repo-detail/useFilesTab.ts:165` | `trim().replace(/^\/+/,"").replace(/\/+$/,"")`. |
| List live assignments | `listCourseAssignmentsAction(institution, courseId)` -> `CanvasAssignmentBrief {id,name,pointsPossible}` | `src/app/actions/repo-grades.ts:33`, type `src/lib/canvas/listings.ts:8` | Carries NO description and NO rubric. |
| Get instructions + rubric | `fetchCanvasMetaAction(url) -> {description, rubricText, linkedFileIds}` | `src/app/actions/grading.ts:79` | Keyed on a Canvas **URL**, not an id. Returns Canvas's own rubric only, never synthesizes one (`:84`). |
| Rebuild that URL from an id | `repoGradeAssignmentUrl(courseCanvasUrl, assignmentId)` | `src/app/components/repo-grades/repoGradesPosting.ts` | Existing precedent, called at `repo-grades/index.tsx:290`. |
| The UI flow to copy | `handleRetrieveCanvas` | `src/app/components/GradingTab.tsx:85-117` | Sets instructions + rubric; note its "no rubric found in Canvas; none will be synthesized" message at `:109-111`. |
| Export read seam | `readExportCourseContentById(supabase, courseId)`, `ExportCourseContent {courseName, modules, pages}` | `src/lib/lms-export-source/read-export-course-content.ts:104`, `types.ts:45` | |
| Export adapter | `adaptCartridgeToCourseContent` | `src/lib/lms-export-source/adapter.ts:26-35` | Currently returns only those three fields. |
| Export rubrics, as parsed | `parseRubrics(xml): CartridgeRubric[]`, `CartridgeRubric = {title, criteria}` | `src/lib/cartridge-import.ts:169`, `src/lib/cartridge-import-shared.ts:99` | Present on the cartridge (`cartridge-import.ts:523`) but **dropped by the adapter**. |
| Export instructions | `CartridgeModuleItem.body?: string` | `src/lib/cartridge-import-shared.ts:66` | Documented at `:43-54` as exactly "the assignment's actual instructions". Survives the seam. |
| Live/export selection model | `ContentSelection = {source:"live";courseUrl} \| {source:"export";courseId}` | `src/app/components/content-tab/content-selection.ts:22` | Plus `parseContentSelection` `:37`, `serializeContentSelection` `:84`. |
| Which sources a course offers | `lmsRenderSourcesFor(c): {live, export}` | `src/lib/courses-table-helpers.ts:656` | |
| Dual-source course picker | `CoursePicker` props `showExportCourses`/`selectedExportCourseId`/`onSelectExport` | `src/app/components/CoursePicker.tsx:57-78` | Additive-by-default; a new caller opts in. |
| Persistence pattern | `loadRepoGradesUiState` / `persistRepoGradesUiState` | `src/app/components/repo-grades/repoGradesUiState.ts:86,97` | **Read `repo-grades/index.tsx:115-147` and `:171-199` first** - they record a shipped bug where a blanket persist-effect overwrote good storage with defaults on first commit. Persist at the explicit mutator, restore by render-phase compare-and-adjust. |

`GithubGradingPanel` takes **no props** (`:72`), so neither half needs any change
in `GradingTab.tsx` or `page.tsx`.

## Decisions taken with the instructor

1. **Folder input is a dropdown that is also editable.** Options come from
   scanning a queued repo's tree; a path absent from that one repo can still be
   typed, because student repos legitimately differ in layout.
2. **Export assignments fill instructions only, AND the export seam is extended
   to carry course-level rubrics.** Both, not one - see AC B4/B5. The rubric is
   picked separately by title, and the UI must never imply the export associated
   that rubric with that assignment, because it did not.

## Acceptance criteria - A, the common folder

A1. **THE MULTI-REPO PATH ACTUALLY HONOURS THE FOLDER.** `gradeReposAction` gains
a folder parameter and passes it as `ingestRepo`'s `pathPrefix` instead of the
hardcoded `{}` at `github.ts:609`. `github.digest.ts` is NOT edited - the
capability already exists there and is merely unused. Adding the parameter must
not change behaviour for any existing caller: it is optional, and omitting it
reproduces today's whole-repo read exactly.

A2. **THE FOLDER IS ONE COMMON VALUE FOR THE WHOLE QUEUE**, not per-repo. It
applies to every repo in the queue on that run.

A3. **CANDIDATE FOLDERS ARE DISCOVERED, NOT GUESSED.** A "Scan folders" affordance
reads a queued repo's tree via `getRepoTreeAction` and runs the paths through
`assignmentFoldersFromTree`. Scanning is explicit, never automatic on every queue
edit, so adding ten repos does not fire ten tree requests.

A4. **A TYPED PATH THAT NO SCAN FOUND IS STILL ALLOWED**, per decision 1. Input is
normalized the way `useFilesTab.ts:165` already does (trim, strip leading and
trailing slashes). Blank means the whole repo - today's behaviour.

A5. **THE FOLDER IS VISIBLE IN WHAT THE RUN REPORTS.** The instructor can tell from
the panel that a run was scoped, and to what - a run silently grading a
subfolder is worse than one grading everything.

A6. **A SCAN FAILURE IS NOT A GRADING FAILURE.** If the tree read fails or returns
nothing, the control degrades to free text with an explanatory note; grading
still runs.

## Acceptance criteria - B, pull from an LMS assignment

B1. **BOTH SOURCES ARE OFFERED, USING THE EXISTING MODEL.** Live Canvas and course
export, modelled on `ContentSelection` (`"live" \| "export"`) rather than a new
parallel vocabulary. Only sources a course actually has are offered - reuse
`lmsRenderSourcesFor`.

B2. **LIVE: PICK AN ASSIGNMENT, GET INSTRUCTIONS AND RUBRIC.** List via
`listCourseAssignmentsAction`. Because `CanvasAssignmentBrief` carries neither
field, rebuild the assignment URL (`repoGradeAssignmentUrl` precedent) and call
`fetchCanvasMetaAction`. Fill `instructions` from `description` and `rubric` from
`rubricText`.

B3. **A CANVAS ASSIGNMENT WITH NO RUBRIC SAYS SO AND SYNTHESIZES NOTHING.** Reuse
`GradingTab.tsx:109-111`'s existing wording and behaviour. The rubric box is left
as it was rather than filled with an invented rubric.

B4. **EXPORT: INSTRUCTIONS COME FROM THE ITEM BODY.** Assignments in an export
exist only as `CartridgeModuleItem`s inside modules, so the picker lists them
grouped by module and fills `instructions` from `body`. When `body` is absent
(unresolved), say so plainly rather than filling the box with the title.

B5. **EXPORT: RUBRICS ARE CARRIED THROUGH THE SEAM AND PICKED SEPARATELY.**
`ExportCourseContent` gains a `rubrics: CartridgeRubric[]` field and
`adaptCartridgeToCourseContent` stops dropping them. The UI offers them as a
SEPARATE by-title picker, never as "this assignment's rubric" - a cartridge
carries no rubric-to-assignment association at all (`CartridgeRubric` is
`{title, criteria}`; the only existing consumer,
`useCourseImportActions.ts:214`, just takes `rubrics[0]`). The copy must make
that explicit. An export with no rubrics offers no picker and says why.

B6. **PULLING IS EXPLICIT AND OVERWRITES ONLY ON REQUEST.** A pull happens on a
button press, never as a side effect of selecting a course or assignment, so a
misclick cannot destroy hand-written instructions. If either box already has
content, warn before replacing it.

B7. **NOTHING IS WRITTEN TO THE LMS.** Both halves are reads. No Canvas write, no
export mutation, no Supabase write beyond existing UI-state persistence.

## Cross-cutting

C1. **EVERY NEW CONTROL PERSISTS ACROSS RELOAD** under a `ta-` key, per the standing
project rule. Follow `repoGradesUiState.ts`'s module shape, and heed the
persist-at-the-mutator warning recorded at `repo-grades/index.tsx:115-147` -
a blanket persist-effect is a known shipped bug in this repo. Note the panel
currently persists only its queue, so this introduces a small UI-state module
for it.

C2. **PURE LOGIC IS SEPARATELY TESTABLE.** Folder normalization, the "which sources
does this course offer" decision, and the export assignment/rubric flattening are
pure functions in `src/lib/**`, unit-tested with in-memory fixtures and no
`vi.mock`.

C3. **NO EMOJIS. UI matches the app's existing minimal visual language** - the
same MUI `Button`/`TextField select` idiom the panel already uses, no new CSS
file.

## Limits (state, do not paper over)

- vitest here is node-env and renders no component, so no test proves the new
  controls render, are keyboard reachable, or are labelled. That is verified by
  reading only.
- An export still cannot tell you WHICH rubric belongs to an assignment. B5 makes
  the list reachable; the pairing remains the instructor's judgment.
- `assignmentFoldersFromTree` returns TOP-LEVEL folders. Nested paths must be
  typeable (A4) because the scan will not discover them.
