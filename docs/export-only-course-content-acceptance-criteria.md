# Stored exports are reachable without a live LMS connection

Instructor report: "even though i have exports for all of my wncc classes (and
no live lms connection), I can't pull those courses up in the manual/lms/modules
view."

The report is accurate and the cause is structural, not data-shaped. Two
independent blockers sit between a stored export and the Course Content tab.

## Blocker A - the whole tab is gated on a live-Canvas credential selector

`src/app/components/ContentTab.tsx:450` wraps the ENTIRE tab body in
`{activeInstitution && (...)}`: the course picker, the "Courses with a saved
export" chip section, the loading/empty states, and ModulesView / PagesView /
FilesView themselves. Two more places repeat the same gate:

- `ContentTab.tsx:330` - the mount auto-load effect early-returns
  `if (!activeInstitution) return;`, so a remembered EXPORT selection is not
  restored either.
- `ContentTab.tsx:166` - the initial `loadState` is
  `hasTarget && activeInstitution ? "loading" : "idle"`.

An institution acronym is nothing but a live-Canvas credential selector: the
registry is a localStorage list of acronyms (`src/lib/institutions.ts:4`) that
picks the per-school `<ACRONYM>_CANVAS_URL` / `_CANVAS_API_TOKEN` env vars on
the server. Reading a stored export needs no credential at all -
`readExportCourseContentById` resolves a `course_hub` row and downloads a
storage object, and never calls Canvas
(`src/lib/lms-export-source/read-export-course-content.ts:104`). CoursePicker's
own `showExportCourses` doc comment already states this explicitly
(`CoursePicker.tsx:57`): the export list is "institution-agnostic on purpose:
reading an export needs no Canvas credential".

So the tab currently requires a live-LMS credential in order to display content
that is defined by not needing one. An instructor with no live LMS connection
and no registered acronym sees an empty card with nothing but the institution
switcher - no picker, no chips, no explanation.

## Blocker B - the export section is silent when it is empty

`CoursePicker.tsx:292` renders the export chip section only when
`exportCourses.length > 0`. A course qualifies only when its `course_hub` row
carries a non-generated entry in `export_files`
(`lmsRenderSourcesFor` -> `latestSourceExportFile`,
`src/lib/courses-table-helpers.ts:661` and `:631`), which is written by exactly
one control in the app - the Courses table's per-course files cell
(`appendCourseExportFileAction`, called from
`src/app/components/courses/FilesCell.tsx:278`).

An instructor who has export files on disk, or attached somewhere other than
that cell, therefore gets silence: no section, no empty state, no pointer to
where an export has to live for this tab to see it. The same silence covers the
"every export on this course is app-generated" case that
`hasOnlyGeneratedExports` already exists to explain (REGRESSION entry 196).

## Acceptance criteria

**AC1. The Course Content tab renders with zero institutions registered.**
The `{activeInstitution && ...}` gate no longer wraps the tab body. With no
acronym registered or selected, the course picker renders, the export chip
section renders, and a selected export course renders its modules exactly as it
would with an acronym selected. The institution switcher itself still renders
above, unchanged - including its own existing zero-institutions hint
(`InstitutionSwitcher.tsx:19`, "No institutions yet. Add one in Settings (top
right) to choose a school."), which is NOT duplicated anywhere by this change.

**AC2. The live half of the picker explains itself instead of appearing broken.**
With no institution selected, the live Canvas course dropdown must not sit in a
permanent "Loading courses..." or bare disabled state. It reads as
unavailable-for-a-reason, with visible text (never a `title` tooltip) naming the
missing precondition and where to fix it - the Settings dropdown that manages
acronyms. Wording is defined once, next to the existing gating vocabulary, not
hand-rolled at the call site.

**AC3. A remembered export selection is restored on mount with no institution.**
`ContentTab`'s mount effect restores and loads a persisted `{source: "export"}`
selection regardless of `activeInstitution`. A persisted LIVE selection keeps
today's behaviour: it does not attempt a Canvas call without an acronym. The
implementation is specifically to MOVE the `if (!activeInstitution) return;`
guard from the top of the effect into the live branch, after the export branch
has run - not to delete it. Deleting it would fire
`listCourseContentAction(sel.courseUrl, undefined)` with no acronym on every
remembered live course.

**AC3b. An institution switch no longer discards an export selection.**
`ContentTab`'s render-phase `prevInstitution` reset currently clears
`selection`, `exportContent`, `courseName`, `expanded` and `loadState` on every
acronym change, including the transitions into and out of "". Nothing about an
export selection is institution-scoped, so the reset is narrowed to live
selections: an export-sourced selection and its loaded content survive an
institution change, while a live selection is cleared exactly as it is today
(the content belonged to the previous school). Without this, lifting the AC1
gate would introduce a new way to lose an export selection - registering a first
acronym would wipe it.

**AC4. The export section states its empty case.**
When `showExportCourses` is on and the resolved list is empty, the section still
renders with an explanatory hint rather than disappearing. The hint names the
exact place an export has to be attached for this tab to see it (the Courses
tab, the course's files cell, the LMS exports control - final label taken from
`FilesCell.tsx`, not invented here). The load-failure case
(`exportCoursesState === "error"`) stays distinct from the empty case and keeps
its own wording.

**AC5. A course whose only exports are app-generated is explained, not hidden.**
`hasOnlyGeneratedExports` already distinguishes this state. When it is true for
at least one course and no course qualifies for the section, the empty-state
hint says that the app's own generated cartridges do not count as a source
export, rather than implying no export files exist at all.

**AC6. Live behaviour with an institution selected is unchanged.**
Every existing live path - `listCourseContentAction`, `ensureTargets` /
`listAddableContentAction`, the copy/import modals, `PageEditorModal`,
`FilesView` - keeps passing `activeInstitution || undefined` exactly as it does
today, and behaves identically when an acronym is selected. No live-path call
site gains or loses a guard.

**AC7. Live-only controls stay gated when there is no live course.**
The existing `contentSourceGating.ts` table is the only source of gating
wording; nothing in this change hand-rolls a second "you can't do that here"
message. An export selection continues to report the gating reasons it reports
today.

**AC8. Nothing about a live Canvas write becomes reachable without a credential.**
Loosening the render gate must not make any Canvas-writing control clickable in
a state where it would fail with a raw technical error. Every control the
loosened gate newly renders is either read-only, or already covered by
`gateOperation`.

## Out of scope

- Attaching exports to courses from anywhere new. The files cell stays the one
  writer of `export_files`.
- The known `hasLiveCourse` conservatism recorded in `ContentTab.tsx:71` (an
  export selection reports "no live course" even when the course has a Canvas
  URL). It only ever makes gating stricter, and closing it needs a `course_hub`
  read this change does not add.
- Any change to the institution registry itself, or to how acronyms map to
  credentials.

## Reuse notes

Vetted against the codebase before hand-off. The implementer uses these rather
than writing new equivalents.

**Degrade-in-place precedent, not a new pattern.** Six call sites already
replace a Canvas-only sub-control with a hint instead of hiding it:
`files/BulkSelectionBar.tsx:91`, `files/FileRow.tsx:237`,
`workflows/RuntimeFieldInputEntityPickers.tsx:144`,
`workflows/TriggerEditForm.tsx:210`, `PublishToCanvasPage.tsx:91` ("Please add
or select a school in Settings first.") and - structurally the closest model for
AC2 - `courses/LmsCell.tsx:115`, which degrades only the Canvas Typeahead and
leaves the rest of the editor live. `KnowledgeTab.tsx:323` is the fullest
version (explanatory empty state that offers the fix inline), and REGRESSION
entry 118 check 2 already states the rule this change is applying: "No
institution registered gives a clear empty state, never a blank pane."

**Predicates already exist; only wording is new.**
`latestSourceExportFile` (`courses-table-helpers.ts:631`),
`hasOnlyGeneratedExports` (`:641`) and `lmsRenderSourcesFor` (`:661`) are all
present and unit-tested (`courses-table-helpers.exports.test.ts`,
`courses-table-helpers.lms-render-sources.test.ts`). AC5 needs NO new predicate -
`hasOnlyGeneratedExports` has zero UI consumers today (its only caller is
`workflows/registry/steps.course-schedule-from-source.ts:873`), so this is the
first surface to explain that state.

**Where the new wording lives.** A new pure module,
`src/lib/course-picker-availability.ts`, holding the live-list-unavailable
reason and a `describeExportSectionState(courses)` returning the ready / empty /
only-generated / error case. Pure and node-testable, the same shape as
`contentSourceGating.ts` (which stays untouched: it is Course-Content-specific,
whereas `CoursePicker` is shared by seven call sites). Its test file parallels
`contentSourceGating.test.ts`, including that file's header note on the node-env
constraint.

**Styles.** Reuse `styles.fieldHint` and `styles.emptyState` from
`page.module.css` - both are already imported in both files. Introduce no new
CSS class (`courses/page-module-css-classes.test.ts` walks every
`styles.<x>` reference and would fail on a typo, but adding nothing is simpler).

**Exact label for AC4's hint.** The place an export must be attached is, in
visible labels: the Courses tab, the course's **LMS Exports** cell, **Manage**,
then **Upload export** (`courses/FilesCell.tsx:259`, `:376`, `:385`). Do not
call it "the files cell" - that name is internal. Do not name the adjacent
**Materials** / **Upload zip** control (`:146`, `:153`), which is a different
store.

**Blast radius of touching CoursePicker.** Seven call sites; six either block
`""` upstream or (announcements-panel.tsx:150) already pass `""` through today
and currently render a permanently disabled "No courses found" box - the exact
state AC2 fixes, so that call site improves too. `showExportCourses` defaults to
`false` (`CoursePicker.tsx:93`), so AC4's empty-state hint is invisible to all
six non-Course-Content callers by construction.

**Verified safe under a loosened gate** (each already keyed on `courseUrl`,
which is `""` for every export selection, and each takes `acronym?` as
optional): `ensureTargets` / `listAddableContentAction`
(`ContentTab.tsx:162`), `loadContent`'s live branch (`:301`, guarded by
`parseCanvasCourseId`), `CourseCopyModal` (`:522`, gated on `courseId`),
`PageEditorModal` (`:624`, gated on `courseId`), `FilesView` (`:188`, early-
returns on `!courseUrl || source === "export"`), and `ModulesView`'s `acronym`
prop. Server-side, `resolveCourse(courseUrl, code?)` (`canvas-core.ts:210`)
falls back to host matching when no acronym is given, so an empty acronym never
throws on these paths.

**The one call that genuinely requires an acronym.**
`listCoursesAction(activeInstitution)` (`canvas-inbox.ts:47`) takes a REQUIRED
string. `CoursePicker.tsx:118`'s early return must stay; AC2 is satisfied by
giving the Typeahead an explanatory unavailable state, never by firing that
fetch with "".

## Test notes

vitest here is node-env and collects only `src/**/*.test.ts`, so no component in
either file is ever rendered and a green suite proves nothing about markup.
Split accordingly:

- Real executing tests: `course-picker-availability.test.ts` over every state of
  the new pure module (no courses at all, courses with no exports, courses whose
  exports are all generated, a mix, the error case), plus the existing
  `content-selection.test.ts` coverage for AC3's remembered-export restore.
- Verified by reading plus `tsc` / `eslint` only: the JSX gate removal, the
  mount-effect branch reorder, the `loadState` initialiser, the narrowed
  `prevInstitution` reset. Document this the way
  `courses/CoursesTable.gate.test.ts:1` documents its own untestable closure -
  a header naming what is verified by reading instead, so the gap is recorded
  rather than silently uncovered.
