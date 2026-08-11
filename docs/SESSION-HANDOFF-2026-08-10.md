# Session handoff - 2026-08-10

Everything below is either verified against the code in this session or marked
as an assumption. Where a fact came from a survey rather than my own reading, it
says so. Line numbers are avoided on purpose - cite symbols and file names,
because a sweep this session found citations that had drifted twice without
anyone noticing.

---

## 1. What shipped (do not redo)

Four pushes to `main`, each gated (full suite + `tsc` + `eslint` + build
compile line) and regression-passed.

| Commit | What |
|---|---|
| `f1c2f5d` | Tasks-grid note mark: 7px dog-ear -> density-scaled wedge, ~8x area, theme-aware ink. Regression entry 252. |
| `7ad69f7` | File attachments on any Tasks-grid cell. New `course_task_attachments` table, browser-to-Storage upload, one dialog at tab level. Entry 253. |
| `94131cd` | Two upload caps production could never honour: knowledge-base attachments and syllabus upload converted to browser-to-Storage. Entry 254. |
| `c7f10eb` | `courses.ts` split 997 -> 239 lines plus three siblings; line cap now enforced by test. Entry 255. |

Both migrations (`20261002000000_course_task_attachments`,
`20261003000000_institution_attachments_size_limit`) were confirmed applied via
the GitHub Actions API - the workflow is "Apply Supabase migrations" and it runs
on push to main. There is no `gh` CLI on this machine; check runs with
`Invoke-RestMethod` against `api.github.com/repos/alexandergshaw/teaching-assistant/actions/runs`.

---

## 2. Backlog, in the order I would take it

### 2.1 Focus ring (BLOCKED on two decisions)

Research is complete and measured; nothing is written yet.

**The defect.** No MUI button anywhere in the app has a visible keyboard focus
indicator. `ButtonBase` sets `outline: 0`; the app's `:focus-visible` rule in
`globals.css` has identical specificity (0,1,0); emotion injects after the Next
stylesheet, so the library wins on source order. Proven by rendering the real
generated CSS in the real injection order, not by reasoning: the app's rule
matches and applies, but its `outline` declaration loses while its
`outline-offset: 2px` survives - which is the decisive evidence.

**`enableCssLayer` is DISQUALIFIED.** It fixes the outline and then breaks the
whole app: `globals.css` has `* { padding: 0; margin: 0 }`, and unlayered CSS
beats layered regardless of specificity, so every MUI component loses its
padding (contained Button 36.5px -> 24.5px tall, IconButton 44 -> 28, Tab and
MenuItem to zero). Measured. Do not revisit this without re-measuring.

**The recommended fix** is two things together:
- `components.MuiButtonBase.styleOverrides` in `theme.ts`. Emits at specificity
  (0,2,0) so it beats the reset regardless of injection order, and reaches
  everything built on `ButtonBase` including Checkbox/Radio/Switch via
  `SwitchBase`. Measured delta: exactly three properties change, nothing else.
- Raising `--focus-ring-color`, which currently measures **1.30:1** light and
  **1.90:1** dark - below the 3:1 that WCAG 1.4.11 requires. Proposed:
  `#1d4ed8` light (5.75-6.70:1 across the app's surfaces) and `#bfdbfe` dark
  (10.30-13.25:1).

**Decision 1 - two non-focus consumers of the token.** `page.module.css` uses
`--focus-ring-color` as a selected-card BACKGROUND and as a status BORDER. Both
become solid slabs if the token goes opaque. They need repointing to their own
token (`--accent-soft` is the obvious candidate) in the same change.

**Decision 2 - the Tasks grid double ring.** Grid cells carry a bespoke
`box-shadow: inset 0 0 0 2px var(--accent-ink)` and set no `outline: none`, so
they already receive the global outline today - invisibly. Raising the token
makes it a visible second indicator. Either suppress the outline on
`.gridFocusRing` or retire the inset ring now that the token is compliant. The
CSS comment there records that the inset ring was chosen *because* the token
fell under 3:1, so this is a real design call, not a default.

**Also known:** no single colour clears 3:1 against both the light page and the
navy TopBar (`#1a2744`, hosts real MUI buttons in both themes) - `#1d4ed8`
measures 2.21:1 there. A scoped token override on `.bar` is required, or a
two-tone ring. And MUI's `InputBase` sets `&:focus { outline: 0 }` at (0,2,0),
so text inputs beat the global rule on SPECIFICITY and are a separate problem
from the ButtonBase one.

**Regression exposure:** entry 37 already documents this defect, scoped to the
Courses cell-menu trigger. No test anywhere asserts focus styling, and the suite
renders nothing, so verification must be visual.

### 2.2 LMS generation - four chunks

Five instructor requests collapsed into one feature on one surface. The headline
finding from the survey: **most of this already exists, in the wrong place.**

**Requests, verbatim:**
1. PowerPoint from selected modules/items, using a specified template.
2. Lecture generation on the LMS page should be iterative: generate, preview,
   prompt to regenerate/refine, with versions stored.
3. Options for sample answers, anticipated Q&A, current events, "etc".
4. Draft (and possibly schedule/post) an announcement from selected material.
5. Courses with a stored export render in the tab; writing updates the export.

**Decisions already taken with the instructor - do not re-litigate:**
- "Specified template" means the EXISTING `deck_templates` (a JSON slide-role
  recipe plus five theme colours), NOT a branded `.potx`. Confirmed by the
  instructor after being shown the cost difference.
- "Writing to these courses updates the export" means SAVING GENERATED
  ARTIFACTS into the export - an append-a-file-to-the-zip operation. NOT the
  tab's full edit surface (which would be ~35 write call sites plus manifest
  surgery with no precedent in this repo).
- Export rendering covers **Modules, Pages and Files**. Not Grading or Inbox -
  an export contains no student data at all.

**Assumptions I made rather than asking (flag if wrong):** "the lecture
generation that comes up on the lms page" means the bulk-bar Generate-with-AI
flow in `AddItemRow`/`BulkModulesSection`, not the Lecture Planning tab on Build
Courses. "Schedule" means a one-off future post date, not joining the recurring
weekly series.

#### Chunk 1 - the spine (start here)

Prove the whole shape on two kinds that write nothing destructive.

1. **Baseline the LMS selection layer into `docs/REGRESSION.md` FIRST.** It is
   not covered today - entry 248 stops at `ContentTab`/`ModulesHeaderBar`.
   `useModuleSelection`, `BulkItemsSection`, `BulkModulesSection`,
   `useBulkModuleActions` and `moduleContentActions` are all unbaselined. This
   is owed before any implementer touches the file.
2. Selection -> materials: one batched gatherer over `selection.selectedItems()`
   and `selection.selectedModules`, reusing `gatherLiveModuleItems`'s per-type
   extraction and `resolveLmsCourseRowAction` to bridge the tab's `courseUrl` to
   a `course_hub` row.
3. The kind registry and config shape.
4. The versioned artifact store.
5. Preview and refine, reusing `DocumentPreviewModal` and `reviseDocumentAction`.
6. **Two kinds only: anticipated Q&A and current events.** Both are pure text,
   both already accept free-form materials text, and NEITHER writes to Canvas -
   so the chunk ships with no new destructive path.

**The one thing to get right on day one:** make the selection identity model
SOURCE-AGNOSTIC. `itemKey` currently builds `${moduleId}:${itemId}` from Canvas
numeric ids, and export items have no ids at all. Use a discriminated key
(`live:...` / `export:...`) and carry a `source` alongside the selection. This
repo already has the vocabulary - `liveModuleValue` / `exportModuleValue` /
`parseLmsModuleValue` in `src/lib/workflows/module-value.ts`, and
`LmsModuleValue.fromExport`. Reuse it. Skip this and chunk 2 rewrites the key
function, both selection `Set`s, `selectedItems()` and every consumer.

#### Chunk 2 - export-backed rendering (Modules, Pages, Files)

The read seam is clean: `listCourseContentAction` is called from exactly two
places in `ContentTab`, returning `{courseName, modules, pages}`. A second
source plugs in there.

Everything needed already exists and is used in production: `downloadCourseZipBlob`
(browser-side, signed URL, chunk reassembly), `parseCartridgeBlob` ->
`CartridgeCourseData`, and a promise cache keyed on the storage path in
`WorkflowsTab`. No server function is involved, so neither the 4.5MB body limit
nor the 60s ceiling applies to reading.

**The fidelity gap is the real constraint.** `CartridgeModuleItem` is
`{title, type, body?}` - three of `CanvasModuleItem`'s thirteen fields. Missing:
every Canvas identity field (`id`, `contentId`, `pageUrl`, `htmlUrl`), plus
`published`, `indent`, `dueAt`, `pointsPossible`. So export mode must gate
controls per-operation with a visible reason, not flip a single mode flag -
otherwise a third of the toolbar silently no-ops.

**Selection note:** `latestSourceExportFile` and `canImport` in
`courses-table-helpers.ts` are the existing "this course can be driven from an
export" predicates, but `canImport` requires `!canLms(c)`. The instructor's
request implies a course may have BOTH, so source becomes a user choice. Also:
the tab is keyed on a `courseUrl` string in localStorage while exports are keyed
on a `course_hub` row id, and there is no reverse lookup - export mode needs a
course picker the tab does not have.

#### Chunk 3 - the deck

Add `decks` as a kind. This is where the structured-vs-text seam is exercised
(`slidesJson` alongside `text`), where the template picker lands, where
`reviseLectureSlidesAction` becomes the per-kind refine, and where a commit
action first writes to Canvas.

**Do NOT rebuild `generate-presentation-from-template`** (`steps.media.ts`). It
already does template + module + materials + LLM + real `.pptx` + Files +
download, is headless-safe, and has two shipping presets. Delegate to that
chain. This repo already carries a scar from the alternative: `weekly-generator.ts`'s
header records that consolidating six duplicated per-week loops revealed one had
silently missed a quota short-circuit, so a 429 on week 1 burned every
remaining week.

This is also where the 60-second ceiling first bites. Server Actions get no
`maxDuration` on this page (Next only honours it at page level, and
`src/app/page.tsx` is a client component that sets none). Every long job in this
repo is a Route Handler - `api/accessibility/route.ts` uses 300. Follow that.

#### Chunk 4 - answers and announcements

**Sample answers.** `generateSampleAnswer` and `generateModelAnswerAction`
already exist; the workflow step loops items and accumulates one key, capped at
10 items, and quizzes are explicitly unanswerable.

**There is an academic-integrity convention, and it is destination discipline.**
`steps.assignments-answers.ts` states in two places that answers go to the
course tile and Files and are NEVER published to the LMS - and that holds in
code, not just comments (its only writes are `saveLibraryFileAction` and
`saveCourseMaterialFile`). `TestSpec.includeAnswerKey` is opt-in and inserts a
page-break marker so a key is never on the same page as question 1. There is no
watermark and no capability check. **Write an explicit criterion that the
`answers` kind's commit action cannot be "upload to Canvas"** - this button will
sit on a bulk bar whose neighbours all write to Canvas, which is the most likely
way the convention gets broken by accident.

**Announcements.** `draftAnnouncementAction` takes one free-text instruction -
fully decoupled from weeks. `buildWeeklyAnnouncementInstruction` is a pure
function taking arbitrary materials text. `message_drafts` already has an
`announcement` kind with `pending`/`reviewed`.

**Scheduling is free.** Canvas supports `delayed_post_at` natively and this repo
already uses it - `createAnnouncementAction` ALREADY takes an optional
`delayedPostAt`. No cron, no queue, no new table. The only gap is that
`MessageDraftPayload` has no `delayedPostAt` field and `postMessageDraftAction`'s
announcement branch does not pass one.

**Correction to something I said earlier in the session:** requiring
draft-then-confirm is TIGHTENING a convention, not matching one.
`schedule-weekly-announcements-for-term` is headless-safe and creates real
Canvas announcements unattended, and `announcements-panel.tsx` posts directly
from a form. Write the gate as a deliberate decision so the reviewer does not
think it was missed.

#### The abstraction (confirmed, not invented)

`WeeklyGeneratorConfig` in `src/lib/workflows/registry/weekly-generator.ts` is
already "generate kind K, ground it, render it, commit it per-kind", with hooks
`setup` / `ground` / `generate` / `validate` / `render` / `publish`. Six kinds
run through it in production. Its `publish` hook already carries exactly the
per-kind divergence this feature needs.

Copy its CONFIG SHAPE; do not reuse the runner literally - it is welded to
`ScheduleWeekPlan[]` / `GeneratedCourseFile[]` and lives in the client-reachable
registry with a documented import ban.

`OUTPUT_FAMILIES` in `src/lib/output-selection.ts` is already the kind registry:
13 frozen, append-only members. **Every requested kind is already in it except
sample answers** - adding `answers` is a one-line append plus a label.

#### Versioning - the only genuinely new thing

**Nothing in this repo versions a generated artifact.** Verified against all 91
migrations and by reading every candidate's write path. `syllabus_templates`,
`deck_templates`, `artifact_templates`, `presentation_drafts`, `grading_drafts`
and `message_drafts` all OVERWRITE in place. `recording_files` is accidentally
append-only (fresh UUID and path per save, `upsert: false`) but has no version
number, no lineage and no ordering beyond `created_at`.

**`presentation_drafts` is the cheapest home.** Its payload is already
`{presentationTitle, slides, templateName?, subject?, theme?}` and it has ZERO
callers anywhere in `src/` - the "Save as draft" button that used to write it now
calls `savePresentationFileAction` instead. It is a dormant table with the right
shape.

Structural precedents to cite: `avatar_likenesses` inserts a new row and marks
the old one `superseded` (the only keep-the-old-row pattern in the database),
and `workflow_run_steps` is append-only child rows under a parent.

**Do not lean on the workflow run log as a prompt store.** It does persist
per-step inputs, but `run-input-redaction.ts` caps values at 500 characters
BEFORE the write, so a real lecture prompt is truncated on the way in.

**Store shape:** `{kind, text, structured?}`. Text serves preview/refine/diff for
every kind; the deck needs the structured payload because `slidesToText` is
lossy (it drops code, notes and graphics). Announcements need a separate title
field. Post-state (`topic_id`, scheduled/posted) belongs on the COMMIT record,
not the versioned artifact - the repo already makes this separation, and
`weekly_announcement_schedule` deliberately omits `posted_at` because only
Canvas knows.

### 2.3 The 15 unfixed upload paths

Recorded in regression entry 254 and in
`docs/upload-body-limit-acceptance-criteria.md` AC6. Vercel caps a function
request body at 4.5MB at the platform layer; `bodySizeLimit` cannot raise it;
base64 inflates 4/3, so the real ceiling is ~3.3MB decoded.

**Nine have NO size cap at all**, client or server: the lecture-planning repo
`.zip` (routinely over 3.3MB - failing in production today), syllabus-adaptation
docx/zip/images, textbook photo extraction, `.pptx` slide extraction,
voice-clone samples, the Gemini lesson-planner path, and the workflow `uploads`
field. Two more cap above the limit. The Course Engine path caps at 4.5MB
measured on the RAW file - off by exactly the 4/3 factor, so it permits 6MB on
the wire and does not protect the request it guards. A later sweep added
`api/parse-calendar/route.ts`'s `MAX_BYTES = 10MB` - Vercel's cap applies to
Route Handlers too.

**The model for fixing them:** `src/lib/chat/attachments.ts` is the ONE correct
cap in the repo - measured in WIRE bytes against a 3.5MB budget, not file bytes.

---

## 3. Traps that will cost you a day if you do not know them

- **Five test files do `vi.mock("@/lib/supabase/courses", factory)`.** A
  module-factory mock intercepts only the exact specifier the code under test
  imports. Repointing a call site at `courses.row.ts` etc. makes the mock
  silently stop intercepting - the test then hits real Supabase code and vitest
  reports nothing. This is why `courses.ts` is a barrel.
- **Source-text guards.** `taskCellAttachments.wiring.test.ts` proves
  `deleteCourse`'s Storage-sweep ordering by searching its literal source text,
  so that function cannot move out of `courses.ts`.
  `taskInstructionIndicator.wiring.test.ts` and `taskNoteIndicator.wiring.test.ts`
  pin the exact call strings for `taskCellIndicatorSet` and
  `taskCellAccessibleName` - adding an argument to either breaks them BY DESIGN
  and they must be updated in the same change, never loosened.
- **`headless.test.ts` asserts an exact count** of headless-safe step types.
  Adding one requires bumping the canary in the same commit.
- **PostgREST truncates a plain `select()` at 1000 rows**, and `.limit(n)`
  CANNOT exceed that server ceiling - it is `db.max_rows`. Paginate with
  `.range()` and keep the page size BELOW the ceiling, or a page equal to it
  breaks the loop on the first request if the ceiling is ever lowered.
- **A client-supplied `storagePath` reaching a service-role client bypasses
  RLS.** Two guards now exist (`isSyllabusUploadPath`,
  `isInstitutionAttachmentStoragePath`), both placed inside the shared helper
  rather than the thin action wrapper so a future caller cannot route around
  them. Any new browser-to-Storage path needs the same.
- **Browser-side rollback leaves an orphan window.** Once the object write is
  client-side, the browser is the only party that sees both the Storage outcome
  and the row outcome - so if the tab closes between them, the object orphans
  with no row. Both attachment features have this property. Nothing sweeps for
  such orphans.
- **The self-consumption defect (entry 196).** `isGeneratedExportFile` /
  `latestSourceExportFile` exist to stop the app reading its own generated
  cartridges back as course INPUT. If export write-back ever expands beyond
  appending artifacts, decide explicitly whether a written-back export stays
  `generated: false` - say yes and the app reads partly-app-authored content as
  ground truth; say no and the course loses its only source export.
- **`callLlm` returns `{ok: true, text: ""}`** on `MAX_TOKENS` or a safety
  block (Gemini returns HTTP 200 with no text). Most call sites then report a
  misleading parse error. Use `describeEmptyLlmText`.

---

## 4. Tooling reality on this machine

- Drive everything from **PowerShell**; the Bash tool is unreliable here.
- Line counts: `@(Get-Content <file>).Count`. NEVER `Measure-Object -Line` - it
  skips blank lines and under-reports by roughly 10%.
- `npx vitest run <file>` - do NOT pass `--reporter=basic`, that reporter name
  errors in this vitest version.
- The lint script is `eslint`. `next lint` does NOT exist in this Next version.
- `npm run build` is EXPECTED to exit 1: it prints "Compiled successfully",
  finishes TypeScript, then fails prerendering on `@supabase/ssr: Your project's
  URL and API key are required` (the page varies - `/_not-found` or
  `/account/integrations`). The compile line is the gate; the prerender tail is
  a missing-local-env limitation.
- Multi-line commit messages: write to a file and `git commit -F <file>`. A
  PowerShell here-string broke on a message containing quotes and parentheses.
- Migrations auto-apply on push to main via the "Apply Supabase migrations"
  workflow. Verify the run; never instruct a manual apply.
- No `gh` CLI. Use `Invoke-RestMethod` against the GitHub API.
- vitest is node-env and collects only `src/**/*.test.ts`, so **no component is
  ever rendered**. A green suite proves nothing about markup, keyboard
  behaviour, focus management or painted pixels. UI findings come from reading
  the component, and from rendering a scratchpad fixture in headless Chrome
  (`"C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new
  --screenshot=out.png --window-size=W,H file:///...`).

---

## 5. Process notes worth carrying

The delivery loop is in memory and was followed throughout. Two additions this
session earned their place:

- **Write the oracle BEFORE the change, and run it.** The `courses.ts` structure
  test passed 19 of 20 pre-split, with the single failure being the target. That
  is what makes it evidence rather than a description of the result.
- **My own source-text tests twice forced worse implementations** - once
  demanding a literal `.remove(` that shaped a helper into an object with a
  `.remove()` method, once demanding a literal `aria-label` that forced
  duplicated JSX branches. Pin the FACT and the ORDERING, never the spelling.
  When an implementer reports "I had to shape it oddly to satisfy the test,"
  that is a defect in the test.

Also worth knowing: the peer sabotage-check and the regression pass both caught
real errors in MY work this session, not just implementers' - an invisible
1.3:1 design, a modal that would have mounted ~1000 times, a `.limit()` fix that
would not have worked, and a regression entry claiming a guarantee ("ALWAYS
cleans it up") the code does not provide. Keep both stages adversarial.
