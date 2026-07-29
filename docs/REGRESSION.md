# Regression Checklist

Living regression document for the AC -> code -> verify -> regression delivery loop.

- After a feature passes verification, its acceptance criteria are appended here as
  durable behavioral checks (an entry per feature, newest at the bottom).
- BEFORE a feature is implemented - once its acceptance criteria and reuse survey
  have fixed which files/subsystem it will change - the orchestrator checks
  whether this document already covers that code area. Only if it does not, the
  orchestrator characterizes the area's existing functionality (running its
  tests, tracing its live behaviors) and records it here as an "Area baseline"
  entry, so pre-existing behavior in the touched area is guarded by the very next
  regression run, not just the new feature's own checks. Areas already documented
  here are not re-baselined or duplicated.
- After every feature (before push), an Opus regression agent runs this ENTIRE
  document - the standing gates plus every feature entry, not just the newest one -
  and reports a per-check pass/fail verdict.
- On any failure: the orchestrator writes detailed root cause analysis notes
  (failing check, observed vs required, the causal chain through the code with
  file:line evidence, prescribed fix), hands the RCA to a fix subagent, then re-runs
  this entire document. That loop repeats until the document passes 100 percent -
  no partial passes, no failures waived beyond what a check itself explicitly
  allows. Nothing is pushed until then.
- Checks must be written so a fresh agent can execute them without session context:
  name the files, the behavior, and how to observe it (test, grep, code trace, or
  browser).

## Standing gates (run every time)

- G1: `npx eslint .` exits 0 with zero errors and zero warnings.
- G2: `npx tsc --noEmit` is clean.
- G3: `npm run build` reaches a successful compile line ("Compiled successfully").
  Env-dependent prerender failures after compile are acceptable; compile or type
  errors are not. The acceptable failure class is any page's prerender failing on
  the missing Supabase URL/API key (@supabase/ssr) when env vars are absent; the
  first page to fail varies between runs (/_not-found and /account/integrations
  have both been observed - the build exits on whichever errors first).
- G4: `npm test` (vitest) passes fully.
- G5: No emojis anywhere in source files. Scope: git-tracked source files (exclude
  node_modules/ and .next/). Emoji means true emoji codepoints (pictographs,
  emoticons, dingbats, regional indicators, variation selector U+FE0F); typographic
  arrows (e.g. U+2192) and math symbols do not count.

## Area baselines

### 2026-07-22 - Workflow automation subsystem (schedules, triggers, unattended runner)

Baseline taken before the run-observability feature. Evidence at baseline time:
185 tests across server-runner.test.ts, workflow-schedules.test.ts,
workflow-triggers.test.ts, workflow-schedule-handoff.test.ts,
workflow-schedules.fanout.test.ts, all passing. Since then the monolithic
workflow-triggers.test.ts was SPLIT into workflow-triggers.{comparisons,
messages,repo,roster,scheduling,trigger-utils}.test.ts (run those instead) and
the count has grown to 194 with no losses. These behaviors must keep working:

1. At-most-once execution: claimWorkflowSchedule and claimAndAdvanceTrigger use
   atomic conditional updates (check_version / conditional claim) so an
   occurrence can only ever be claimed once across browser tabs, the in-app
   watchers, and the cron endpoint - concurrent callers see "already claimed".
2. Pacing: the browser watchers claim at most ONE due schedule (and evaluate one
   due trigger) per ~60s tick; the cron endpoint processes at most 5 schedules
   per tick then evaluates unattended triggers in an isolated try so trigger
   failures never mask schedule results (run-schedules route).
3. Claim-and-skip: invalid or non-headless-safe scheduled workflows are still
   claimed (next_run_at advances) and skipped, so they never wedge the due queue.
4. Institution fan-out: claimFanoutSchedule / checkpointFanoutInstitution /
   deferFanoutResume / finishFanoutSchedule checkpoint per-institution progress;
   a truncated tick resumes remaining institutions next tick.
5. Run log: AMENDED 2026-07-28 by entry 94. This check described
   `recordWorkflowRun` writing one row per COMPLETED run from every execution
   path. That function is no longer called by any execution path: all five now
   call `startWorkflowRun` before executing (inserting a "running" row) and
   `finishWorkflowRun` after, so a run that dies leaves evidence.
   `recordWorkflowRun` is retained but unused outside its own tests.
   THE BEHAVIORAL GUARANTEE THIS CHECK PROTECTS IS UNCHANGED and is what to
   verify: workflow-completed chaining (decideWorkflowCompleted) fires on
   successful runs of the source workflow, and a skipped/errored occurrence
   must not fire a chain. A "running" row must not fire one either - the four
   read helpers exclude non-terminal runs and order by completion time (entry
   94 point 8).
6. Deliverables: buildServerStepRunHelpers.saveRunReport writes Markdown to the
   Files library tagged source "workflow" / origin "unattended" with workflow
   id/name/runId; report saving is best-effort and never fails the run.
7. Automate panel: schedule and trigger create/edit/toggle/delete flows work;
   unattended scheduling is gated on workflow headless-safety; cadence and
   next-run render per schedule (ScheduleSection/TriggerSection).

### 2026-07-22 - Workflow scope subsystem

Baseline taken before the concepts-scope feature. Evidence: 129 tests across
types.scope.test.ts, scope.test.ts, scope.classrepo.test.ts, types.expand.test.ts,
presets.test.ts, all passing. These behaviors must keep working:

1. Families: scopeFamilyForType maps institution, hubCourse(+List),
   lmsCourse(+List), org(+List) to their WorkflowScope families and the scalar
   families lookahead / moduleOffset to theirs; unknown types map to null.
2. Coverage semantics (applyWorkflowScope): a non-empty run-form value always
   wins; a list input takes the scope value as-is ("*" expanded later by the
   engine); a single-entity input takes the first concrete item and never "*";
   scalar families return the scope value with "*" rejected. scopeCoversType is
   true for institution when scope.institution is "*" (fan-out fills it).
3. Run form: collectRuntimeFields drops inputs whose type the workflow scope
   covers (types.ts ~:367-375), and the builder shows "From workflow scope"
   instead of asking per step (InputBindingRow scopeFamily logic).
4. Scope expansion: expandScopedValue turns "*" into concrete newline lists per
   type (hubCourseList filtered by active institution, lmsCourseList requires an
   institution, orgList enumerates orgs); non-"*" values pass through untouched.
5. Tile references: "@class-repo[:id]" resolves to a tile's first linked repo and
   "@class-tile[:id]" to the tile's canvasUrl/startDate/institution by consuming
   input type, defaulting to the workflow-scoped hub-course tile when no id.
6. The WorkflowScopeControl UI exposes Institution (with All), Course tiles,
   Canvas courses, and Organizations pickers and writes the scope object on the
   workflow def (persisted for custom workflows).

### 2026-07-22 - Workflows tab interaction layer

Baseline taken before the UX overhaul (code-traced; no component test suite
exists for this surface). These behaviors must survive any restructuring:

1. Search: the sidebar filter (persisted under ta-workflows-search) narrows the
   workflow list by name match; an empty result shows a hint, never an empty
   crash.
2. Selection: the selected workflow persists (ta-workflows-selected) and
   restores on reload; a missing/deleted id falls back to the first workflow.
3. Per-workflow run values persist under ta-workflow-values-<workflowId> and
   rehydrate when switching workflows (handleWorkflowChange).
4. Automation at a glance: rows show the scheduled (accent) and has-triggers
   (success) dots derived from automationByWorkflow.
5. The Build / Run / Automate panel switcher works for every workflow; Build
   renders WorkflowBuilder for custom workflows and the read-only overview for
   presets; a scheduled/triggered handoff auto-selects the workflow and lands on
   the Run panel with the run visible.
6. Run flow: validation errors render in the Run panel; disabled-step toggles
   persist; the Run button starts the run and mid-run pause/input prompts
   render inline at the paused step.

### 2026-07-22 - Files library interaction layer

Baseline taken before the preview-button feature (code-traced; no component test
suite). These behaviors must keep working:

1. Row actions (files/FileRow.tsx): Play toggles the inline player (the play URL
   auto-loads while expanded), Download fetches the blob, Strip audio appears
   only for video kinds, Add to module and Delete (with confirm) and Rename all
   work per row; the extension chip shows the mime-derived ext with the full
   mimeType as its title.
2. Library controls (FilesTab): search, kind filter, sort, grouped/flat view
   (FilterToolbar), upload drop zone, and bulk selection with add-to-module /
   delete (BulkSelectionBar) all function; the Library/Submissions subtab bar
   persists via ta-files-view.
3. Data flows through src/lib/recording-files.ts (listRecordingFiles,
   getRecordingFileUrl, downloadRecordingFile, renameRecordingFile,
   deleteRecordingFile) - typed mappers, no any-casts.

### 2026-07-22 - Course kickoff / planning / repo-fill subsystem

Baseline taken before the kickoff-context feature. Evidence: 87 tests across
registry.structure.test.ts, presets.test.ts, include-mirror.test.ts,
github.copyrepo.test.ts, workflow-form-helpers.test.ts, all passing. These
behaviors must keep working:

1. Preset compositions: COURSE_KICKOFF (load-course-tile, generate-schedule,
   repo-from-template, fill-readmes, include-workflow) and NO_CODE_KICKOFF
   (load-course-tile, generate-schedule, lecture-materials-from-schedule,
   include-workflow) keep their step order and binding compatibility
   (presets.test.ts outputFeedsInput checks).
2. Include expansion: include-workflow steps expand the source workflow with
   remapped step references and bindOverrides keyed
   "<sourceTopIndex>.<inputKey>" (types.ts expansion + include-mirror tests).
3. generate-schedule (steps.planning.ts) takes description/weeks/tests/
   schedule/courseTitle and produces its schedule outputs via
   generateSchedulePlanAction; fill-readmes (steps.github.ts) takes
   repo/schedule/description and fills per-assignment READMEs via
   fillAssignmentReadmesAction; lecture-materials-from-schedule
   (steps.content-lectures.ts) generates weekly materials from the schedule.
4. Run form: only bound inputs are asked (collectRuntimeFields ignores unbound
   inputs; presets bind what should be asked - the unbound-inputs rule).

### 2026-07-22 - Drafted grades review surface

Baseline taken before the comment preview/edit feature (code-traced; no
component test suite). These behaviors must keep working:

1. Each grading draft card renders its per-student results with rubric-area
   rows (area name, score, comment text - DraftedGradesTab.tsx ~:541), the
   source badge / class label / From-workflow link (per the source-marking
   entry), and the summary title.
2. Draft actions work: mark reviewed, delete, and post-to-LMS flows (the
   grading actions listPendingGradingDraftsAction / markGradingDraftReviewedAction
   / deleteGradingDraftAction / postGradingDraftAction), plus
   updateGradingDraftPayloadAction persists payload changes.
3. The overall per-student comment is carried as a rubric-area entry whose
   comment holds the overall text (grade.ts ~:869-878); posting reads comments
   from the payload, so payload edits flow into what posts.

### 2026-07-22 - Courses tab management surface

Baseline taken before the table-view redesign (code-traced; no component test
suite). Whatever the presentation becomes, these CAPABILITIES must survive:

1. Course CRUD: add a course (form with name/institution/dates/etc.), edit
   every field, delete with confirmation; changes persist via the course-hub
   actions and reload correctly.
2. Inline-editable per-course fields (the InlineField set in CoursesTab):
   githubOrg, textbook, roster, repos, syllabusId, integrations, csv,
   startDate, description, weeks, tests, lms, dayTime, studentRepos - each
   editable and saving via the update action (courseToInput mapping).
   CORRECTED 2026-07-26: this list is the baseline-era subset and is NOT
   exhaustive - InlineField (src/lib/courses-tab-helpers.ts) has since grown
   to include modality, topicOutline, syllabusTemplateId, endDate, breaks,
   assignmentDueRule, email, emailClient, classLengthMinutes, and possibly
   more added after this note. Treat the type definition as the source of
   truth rather than enumerating it here; the behavioral guarantee (each
   field is editable and saves via the update action) applies to the type's
   current full union, not just the fields listed above.
3. Roster and student-repos parsing: rosterStats/rosterToRows/rowsToRoster and
   studentReposToRows/rowsToStudentReposText round-trip the text formats; the
   roster editor offers the table editor, stats, From-LMS draft fill, and Copy
   (roster and the schedule-of-topics csv are independent fields - an earlier
   wording here wrongly implied a roster-CSV upload); export-package upload
   populates course fields (with the no-course-settings message when absent).
   NOTE (2026-07-22, user-approved scope): the tile-layout system and its
   panels (custom tiles, drag/hide, the per-institution common-fields editor,
   syllabus-template admin, the per-course scheduled-workflows display) were
   retired with the table redesign; mergeCardLayout/mergeInstitutionFields
   remain as tolerant pure helpers only.
4. Navigation: per-course actions reach course planning, version control, and
   workflows via the onNavigate contract with page.tsx.
5. Institution fields (mergeInstitutionFields) and any saved layout state load
   without crashing even when stale keys/unknown entries are present.
6. Docx download helpers (downloadDocx/readFileBase64/readFileText) keep
   working for the flows that produce/consume files.

### 2026-07-22 - Manual tab navigation shell

Baseline taken before the Manual UX overhaul (code-traced). Beyond the
nav-restructure entry's subtab/migration checks, these must keep working:

1. The LMS subtab's inner views (modules, pages, files, grading, announcements,
   and any others ContentTab renders) each render their content and persist the
   active view under VIEW_KEY (content-tab/constants); the Canvas URL persists
   under its CONTENT_URL_KEY.
2. Build Courses' third level (new | prebuilt) persists under ta-build-view
   with the legacy lesson-planning migration (page.tsx BuildView initializer).
3. Recording stays MOUNTED across subtab/tab switches (display:none, not
   unmount) so an in-progress recording survives navigation.
4. The version-control VIEW_KEY migration (old Integrations VC view lands on
   the standalone subtab and resets the LMS view to modules) keeps working.

### 2026-07-22 - Recording surface (record / caption / narrate)

Baseline taken before the RecordingTab under-1000 split + TabShell convergence
(code-traced from RecordingTab.tsx at commit 9455385; the lib layer under it is
covered by backup-dir.test.ts, caption-burn.test.ts, recording-files.test.ts -
36 tests, all passing at baseline time). These behaviors must keep working:

1. Keep-mounted contract: page.tsx renders RecordingTab inside an always-mounted
   display:none wrapper (visible only on Manual > Recording), and inside the tab
   the three inner views (Record, Caption a video, Narrate a deck) persist the
   selection under ta-rec-view and ALL stay mounted behind display:none wrappers
   - a live preview, the takes list, and an in-progress caption burn survive any
   navigation. The `active` prop gates only the R/P/M keyboard shortcuts (which
   also ignore keys typed into inputs/textareas/contenteditables).
2. Preview gating: persisted device choices never auto-start a stream on mount;
   a preview starts only after an explicit user pick or the Start preview button
   (userPickedRef), and while idle a change to source/camera/mic/resolution/
   noise/echo/gain restarts the preview via the appliedCfgRef config-signature
   comparison - never during a recording. Device lists filter out the empty
   deviceIds browsers return pre-permission, re-enumerate on devicechange, and
   the Grant access button runs a throwaway getUserMedia probe (video+audio,
   falling back to audio-only) purely to unlock device labels.
3. Recording pipeline: video sources record through the hidden canvas pipeline
   (canvas.captureStream(30) plus the stream's audio tracks) so mirror (camera
   only), background blur/image (MediaPipe ImageSegmenter, lazily dynamic-
   imported, disabled gracefully with a note when the model fails), the webcam
   PiP bubble (screen source only, 4 corner presets), annotation strokes
   (pen/highlighter/eraser, undo/clear), and title/closing cards are burned into
   the take. Audio-only records the raw stream with the audio mime fallback
   chain; video uses the mp4-then-webm fallback chain.
4. Record lifecycle: optional 3-2-1 countdown before start; pause/resume;
   auto-stop timer (5/10/15/30 min) enforced from the elapsed-seconds interval;
   REC/PAUSED badge with elapsed time and MB counter; mic mute toggles
   track.enabled without stopping the stream; title card records first with mic
   muted and an on-preview countdown notice, and the closing card is appended
   after Stop while the transport shows a disabled "Finishing..." state.
5. Takes: finished takes are in-memory object URLs named `Take N` where N is
   the takes count captured when recording STARTED (stale-closure semantics -
   deliberate); rows support rename drafts (renaming does not rename the copy
   already saved to the library), Download (extension derived from mime),
   Delete (revokes the URL), inline playback, and "Audio only" extraction via
   extractAudioOnly that appends a derived take. Every finished take is saved
   automatically to the chosen backup folder (File System Access handle
   persisted in IndexedDB via backup-dir) and to the Supabase library via
   saveRecordingFile, each with independent pending/done/failed badges.
6. Script and teleprompter: topic/objectives/length draft a script through
   generateLectureScriptAction with the stored LLM provider; the script is
   editable, shows a word count and pace estimate, copies to clipboard, and
   renders as a teleprompter overlay (sm/md/lg) above the stage while recording.
7. localStorage contract: every Recording control persists under its exact
   ta-rec-* key. These names are a cross-component API: CaptionStudio's
   gatherRecordingContext() reads ta-rec-script-topic, ta-rec-script-objectives,
   ta-rec-script, ta-rec-card-title, ta-rec-card-subtitle, ta-rec-card-closing,
   ta-rec-cards, and ta-rec-card-secs directly to give the caption LLM context.
8. Caption flow (CaptionStudio, props takes + backupDir, `Take` type imported
   from ./RecordingTab): pick a session take, backup-folder video, or library
   file; keyframes are sampled client-side and a vision LLM writes timed
   captions; captions are editable, preview as native subtitles, export as
   .vtt, and can be burned into the video (caption-burn lib) with optional
   narration.
9. Narrate flow (SlideStudio, no props): extract pptx slides, generate
   per-slide narration, ElevenLabs voice clone/synthesis and HeyGen avatar via
   server actions only (in-house constraint), render the narrated video, save
   through saveRecordingFile.
10. Cleanup: unmounting stops the recorder/streams/meter/pipeline, revokes all
    take object URLs, and closes the MediaPipe segmenter (unmount-only effect
    reading latest values through refs).

### 2026-07-27 - Concept visualizer subsystem

Baseline taken before the deck-driven visualizer feature. This area had ZERO
coverage in this document beforehand ("visualiz" appeared nowhere in it).
Evidence at baseline time: `npx vitest run src/lib/visualizer.test.ts
src/lib/workflows/registry.ensure-visualizer-pages.test.ts` passes.

1. `src/lib/visualizer.ts` is pure (no "use server", no imports beyond types)
   and exports: VISUALIZER_BASE_URL ("https://programming-concept-visualizer.vercel.app"),
   VISUALIZER_REPO ("alexandergshaw/programming-concept-visualizer"),
   TOPIC_ROUTES, TOPIC_TO_EXPORT_MAP, TOPIC_TO_DIR_MAP, normalizeConceptKey,
   parseNavItems, conceptUrl, matchConcept, insertNavLeaf, insertTopicPageCase.
2. TOPIC_ROUTES' 15 route paths all resolve on the live visualizer: seven
   `/languages/<slug>` (html, javascript, php, python, react, sql, typescript)
   and eight `/skills/<slug>` (cybersecurity, databases, deploying-a-website,
   github, programming-basics, project-management, software-testing,
   website-management). Observe: the visualizer repo has a directory per slug
   under `src/app/languages/` and `src/app/skills/`.
3. `parseNavItems` handles the REAL navItems.ts, which uses a
   `: SidebarItem[]` type annotation, single quotes, and nested `children`
   arrays. Against the live file it returns 157 leaf entries across exactly 10
   exports: programmingBasics 12, python 27, javascript 26, react 12, sql 29,
   databases 22, cybersecurity 15, softwareTesting 2, websiteManagement 4,
   projectManagement 8. Observe by fetching
   `https://raw.githubusercontent.com/alexandergshaw/programming-concept-visualizer/main/components/pageComponents/navItems.ts`
   and running the function over it. Nested parents are skipped (they carry a
   `children:` key after `value:`); only leaves are returned, which is correct.
4. `matchConcept` matches on normalized value OR label via
   `normalizeConceptKey` (lowercase, strip every non-alphanumeric).
5. `findVisualizerConceptAction` (src/app/actions/research.ts) calls
   requireOwner, reads navItems.ts through getFileText, and returns
   `{found:true,url,topic,slug,label}` / `{found:false}` / `{error}`. A concept
   whose export name has no TOPIC_TO_EXPORT_MAP reverse entry returns
   `{found:false}`, not an error.
6. `createVisualizerConceptAction(concept, context, provider)` refuses the
   "embedded" provider with "Creating visualizer pages requires an LLM
   provider.", LLM-picks a topic key (falling back to "programming-basics"
   when the answer is not in TOPIC_ROUTES), generates a component, validates it
   (must have `export default function` and `ConceptWrapper`, must NOT contain
   a hex color) with ONE retry, then commits three files via putFile in order:
   the component, the topic page, then navItems.ts.
7. Step "ensure-visualizer-pages" (src/lib/workflows/registry/steps.knowledge.ts)
   keeps: name "Ensure concept visualizer pages"; a REQUIRED `courses`
   (hubCourseList) input; optional `lookahead`, `concepts` (longtext, one per
   line), `maxConcepts` (number, default 3, clamped 1-6); outputs `report`,
   `links`, `hasCreated`. With `concepts` set it skips deriving from courses;
   with neither concepts nor a derivable week it throws "No concepts to check.
   Provide concepts or ensure courses have upcoming weeks." It is headless-safe
   and is step index 2 of the weekly-everything-prep preset with
   `courses` literal "*", `lookahead` runtime, `maxConcepts` literal "3".
8. KNOWN DEFECTS AT BASELINE - these are what the new feature fixes, so a
   regression run must NOT treat them as behavior to preserve:
   (a) `insertNavLeaf`'s export-locating regex omits the optional type
   annotation that `parseNavItems` allows, so against the real
   `export const pythonNavItems: SidebarItem[] = [` it matches nothing and the
   function always returns null - making `createVisualizerConceptAction` fail
   every time with "Concept already exists or could not update navItems."
   (b) TOPIC_TO_DIR_MAP implies `components/pageComponents/SQL/SQLPage.tsx`,
   but SQL's page is `components/pageComponents/SqlPage.tsx` (top level) and
   its concept components live in `SQL/`, so its concept import prefix is
   `./SQL/`, not `./`.
   (c) Five of the fifteen topics - html, php, typescript,
   deploying-a-website, github - are UnderConstruction stubs of 4-5 lines with
   no nav array and no switch, so a concept routed to them cannot be created.

### 2026-07-27 - The .docx builder (src/lib/docx.ts)

Baseline taken before the current-events hierarchy and Q&A example-program
features, both of which change this file. Previously referenced only in
passing (lines 436, 2302, 2852), never characterized.

1. `buildDocxFromPlainText(text, templateHeadings?, author?)` is the single
   .docx renderer for generated documents; `docx` is imported dynamically so it
   stays out of the main bundle.
2. Palette and typography are fixed: Calibri, body 1F2937 at size 22 with
   line 276 / after 140, title navy 1A2744 bold size 36 with a navy bottom
   border, section headings navy bold size 24 allCaps with a D1D5DB divider,
   links 2563EB underlined, footer page number 6B7280 size 18 centered, 1 inch
   margins on all four sides.
3. Heading resolution: a `#`..`######` markdown line is always a heading and a
   single `#` is the title; otherwise, when `templateHeadings` is non-empty
   ONLY lines whose normalized form is in that set are headings; otherwise a
   line under 80 chars that is not a list item, is surrounded by blank lines,
   and is not an assignment slug is a heading. The first heading is the title.
4. Bare URLs anywhere in a line become real ExternalHyperlink runs; a leading
   "Label:" of at most 80 chars is bolded and the remainder left normal.
5. Numbered and bulleted lines both render as bullets (`1.` is stripped) - the
   builder never emits a numbered list.
6. `stampDocxAppProperties` rewrites docProps/app.xml to Word's own extended
   properties and repacks with DEFLATE; every document passes through it.
   `creator`/`lastModifiedBy` are the author or "" (never "Un-named").
7. LIMITATIONS AT BASELINE (what the features change, not behavior to keep):
   headings are directly-formatted runs and carry NO Word paragraph style, so
   the file has no Heading1/Heading2 pStyle, no outline levels, and no
   navigation-pane structure; bullets are hardcoded to `bullet: {level: 0}` so
   nested/indented list items are impossible; and fenced code blocks are not
   recognized at all.

### 2026-07-27 - Lecture Q&A generation

Baseline taken before the example-programs feature. Only the slidesText wire
(line 370) was previously covered.

1. Step "lecture-qa" (src/lib/workflows/registry/steps.content-insights.ts),
   name "Anticipate lecture Q&A": inputs hubCourse (hubCourse, REQUIRED),
   moduleId (lmsModule), slides (uploads, accept
   ".pptx,.pdf,.docx,.ppt,.doc", up to 3 files), slidesText (longtext),
   modulesAhead (moduleOffset), sources (sourcePolicy). Outputs: qaText
   (longtext), moduleName (text).
2. `qaText` is the questions joined as `Q<n>: <question>\n\nA: <answer>`
   separated by two blank lines.
3. The document text is built as `# <course> - <module>: Anticipated student
   questions` followed by `## Q<n>: <question>` then the answer, rendered by
   buildDocxFromPlainText with no templateHeadings, and saved with
   buildWorkflowFileName({course, artifact:"Lecture Q&A", qualifier:moduleName,
   ext:"docx"}) to the course tile and the Files library.
4. `generateLectureQaAction(courseName, moduleName, materialsText, slideFiles,
   provider)` returns `{questions:[{question,answer}]}` or `{error}`; it asks
   for 10-16 student-voiced questions with 2-5 sentence answers, retries a
   JSON parse failure ONCE, and has an embedded-provider branch that templates
   questions from material headings (never calling an LLM).
5. A run returning zero questions throws "The model returned no questions. Try
   again."
6. There is no course-type signal on this step at baseline: the Q&A prompt is
   identical for a coding and an applied course.

### 2026-07-27 - Template-driven deck generation engine (src/lib/decks)

Baseline taken before the topic-sequencing feature. This engine had no entry in
this document; only the slide-prompt CONSTANTS were covered (feature entry
"Course-type signal threaded through every generator"). Evidence at baseline
time: `npx vitest run src/lib/decks/ src/lib/slide-prompt.test.ts
src/lib/course-kind.test.ts` passes with 101 tests across 4 files.

1. A `DeckTemplate` is an ordered slide-spec list plus named loop groups.
   `SLIDE_ROLES` (src/lib/decks/types.ts:160) defines exactly these 19 roles:
   title, agenda, objectives, concept, definition, example, walkthrough,
   practice, answer, quiz, discussion, activity, case-study, summary,
   reference, deadlines, office-hours, section, custom. `LoopSourceKind` is
   "literal" | "runtime" | "courseTopics".
2. `expandTemplate(template, loopItems)` (types.ts:431) finds each contiguous
   run of slides sharing a `loopGroupId` and repeats that block once per loop
   item, in the loop item array's order. LOOP ITEM ORDER IS SECTION ORDER in
   the finished deck.
3. `generateDeckFromTemplate` (generate.ts:317) runs a breadth pre-pass before
   expansion: a loop group with breadth "full" goes through
   `enumerateBreadthFull` (one LLM call, capped at 8 items, seeds retained
   first, deduped case-insensitively on exact equality, falling back to the
   seeds on embedded provider / LLM error / parse failure); breadth "core"
   goes through `trimBreadthCore` (first 2 seeds); breadth "standard" is
   untouched.
4. The LLM path makes ONE call at temperature 0.6, maxOutputTokens 12288,
   responseMimeType application/json, with a 2-attempt guarded parse
   (`sliceJsonObject` + JSON.parse, retrying once). Failure messages are
   exactly "Could not parse slide data.", "Model did not return a valid slides
   array.", and "The model returned no usable slides. Try generating again.".
5. `buildDeckPrompt` (generate.ts:57) numbers every resolved slide, states its
   role, its title prefix requirement, its loop item, its code requirement and
   its max bullets, and demands EXACTLY that many slides "in that exact order
   and count", forbidding the model to add, remove, merge or reorder slides.
6. `roleTitlePrefix` maps example/walkthrough/practice/answer/case-study to
   their "Example:"-style prefixes and returns null for every other role.
7. `propagateExampleCode` copies an Example slide's code and codeLanguage onto
   the following Walkthrough and Practice slides, so all three show the same
   reference code.
8. `provider === "embedded"` returns `scaffoldDeck` deterministically with no
   LLM call; `toDeckSlide` clamps bullets to each spec's `maxBullets`.
9. LIMITATION AT BASELINE (what the feature changes, not behavior to keep):
   nothing anywhere orders the loop items. Seeds keep their authored order and
   enumerated subtopics are appended in model order, so one subject can be
   split across distant sections, "Advanced" sections can precede
   introductory ones, and the agenda slide is generated independently of the
   body's actual section order. Observed in a real 77-slide deck whose regex
   material appeared as both section 2 ("Introduction to Regular Expressions")
   and section 6 ("Introduction to Pattern Matching"), whose "Data Structures
   Overview" was section 4 behind two sections depending on it, and whose
   4-item agenda did not match its 9 body sections.

## Feature entries

### 2026-07-22 - Workflow components split under 1000 lines

Context: WorkflowsTab.tsx (2815) and WorkflowBuilder.tsx (1773) were split into
hooks/components under src/app/components/workflows/ (commit 091e397). Checks 3-8
correspond to regressions the first pass actually introduced; they are the seams
most likely to break again when these files are edited.

1. Size limit holds for the workflow subsystem: src/app/components/WorkflowsTab.tsx,
   src/app/components/WorkflowBuilder.tsx, and every .tsx/.ts file under
   src/app/components/workflows/ (recursively, including builder/) are each under
   1000 lines (wc -l). Note: other components (e.g. CoursesTab.tsx) are known to
   exceed 1000 lines and are out of scope for this entry.
2. Export surface: WorkflowsTab and WorkflowBuilder remain the default exports of
   src/app/components/WorkflowsTab.tsx and WorkflowBuilder.tsx; `BuilderPickerData`
   is importable from the WorkflowBuilder module.
3. Mid-run input prompts resolve: in WorkflowsTab.tsx, RunInputPrompt's onSubmit and
   onSkip resolve `workflowRun.inputResolverRef.current` (submit passes the value,
   skip passes null). A step returning `requireInput` must never leave
   useWorkflowRun's handleRun awaiting an unresolvable promise (run stuck with
   running === true).
4. Course export loading is real: `loadCourseExportData` in WorkflowsTab.tsx reads
   the course hub, picks the newest export file, and pipes
   `downloadCourseZipBlob` -> `parseCartridgeBlob`, with per-path promise caching in
   `courseExportCacheRef` and cache eviction on failure. It must not be a stub
   returning null; its consumers are useWorkflowOptions (module export fallback) and
   useWorkflowRun (loadCourseExport step helper).
5. Post-run hub refresh: at the end of a run, useWorkflowRun calls
   `onSetHubCourses(null)` and that callback is useWorkflowOptions' real
   `setHubCourses`, so the guarded hub-course effect refetches (it only fetches when
   hubCourses is null).
6. Schedule/trigger forms load courses: useWorkflowOptions' needsHubCourse condition
   includes `scheduleForm !== null || triggerForm !== null` (deps include both), so
   opening a schedule or trigger form populates its course picker even when no
   runtime field needs hub courses.
7. Orphan-run errors are visible: when a scheduled/triggered run references a
   missing workflow or custom workflows fail to load, the message is written via
   useWorkflowRun's `setValidationError` (rendered in the Run panel error paragraph),
   not into discarded state.
8. Orphan disable is optimistic: after server-side disabling of an orphaned schedule
   or trigger, the consume effect chains `automation.setSchedules` /
   `automation.setTriggers` updates marking it enabled:false locally; that effect has
   NO dependency array (runs every render, matching pre-split behavior).
9. Pure-move seams stay quiet: no new eslint-disable comments in WorkflowsTab.tsx,
   WorkflowBuilder.tsx, or src/app/components/workflows/ beyond the 8 inventoried
   ones (6x no-explicit-any in useWorkflowRun's typing plus 1 each in BuildPanel.tsx and useAutomation.ts). A new disable in these files is a smell
   that plumbing broke. (The handoff effect's exhaustive-deps disable, present
   through the 2026-07-22 split, was removed by the UX-overhaul feature below: its
   deps array now depends on the whole workflowRun object, which makes the rule's
   dependency list genuinely exhaustive without suppression.)

### 2026-07-22 - PPT deck outputs feed later steps

1. generate-presentation-from-template (src/lib/workflows/registry/steps.media.ts)
   declares 5 outputs including presentationTitle (text), deck (longtext, label
   "Deck (readable)"), and slidesJson (longtext, label "Slides (JSON)"), matching
   generate-slides-standalone's conventions, and its run returns them: deck is the
   title line + "## slide title" + "- bullet" lines with a fenced code block when
   a slide carries code; slidesJson is JSON.stringify of the slides.
2. lecture-qa (currently src/lib/workflows/registry/steps.content-insights.ts)
   keeps its slidesText longtext input whose help names the template step as a
   bindable source, and folds prior-step deck text into the QA prompt materials.
3. registry.generate-presentation-from-template.test.ts asserts all 5 outputs and
   that outputFeedsInput holds for deck -> slidesText and slidesJson -> slidesText.

### 2026-07-22 - Current-events research step

1. Step "current-events-report" exists (knowledge category, headless-safe; the
   headless canary counts it). Inputs: slides (uploads, .pptx), slidesText
   (longtext), recentWindow (text, blank means "the past 30 days"), hubCourse
   (optional). Outputs: reportText (longtext), fileName (text). Both deck inputs
   empty -> the run throws asking for a deck.
2. src/lib/llm.ts: LlmRequest.webSearch forwards tools [{ google_search: {} }];
   parseGroundingSources is an exported pure function (never throws, undefined on
   malformed metadata) with unit tests in src/lib/llm.test.ts.

SUPERSEDED 2026-07-23 (see below): points 3-4 described a single whole-deck
grounded call producing a Markdown-headed report saved as a .docx. That shape
no longer exists.

3. registry.current-events-report.test.ts proves the deck wire from both
   generate-presentation-from-template and generate-slides-standalone (still
   holds - unchanged by the pipeline rework).

### 2026-07-23 - Current-events research pipeline and .txt report

Supersedes the "Current-events research step" entry's points 3-4 above.

1. researchCurrentEventsAction moved to src/app/actions/current-events.ts
   ("use server", re-exported from actions.ts) to keep llm-tools.ts under 1000
   lines; the export name and its two required positional args (deckText,
   recentWindow) are unchanged, plus a new optional 4th `provider` and 5th
   `options: { maxTopics?, itemsPerTopic?, extraFocus? }` arg - the only
   caller (steps.knowledge.ts) is the only one that needed updating.
2. Pipeline: topic extraction (no web search, JSON with a tolerant line-parse
   fallback) -> per-topic research issued in parallel via Promise.allSettled
   (each spanning news/research/industry/incidents/policy angles, one retry on
   a transient failure or empty result) -> a best-effort synthesis pass
   (cross-cutting themes, what-changed, discussion prompts) whose failure is a
   NOTE, not a step failure.
   AMENDED 2026-07-27 (see entry 87): the per-topic research is no longer ONE
   grounded call. It is now TWO sequential calls per topic - a grounded
   (webSearch: true) prose search followed by an ungrounded structuring call -
   because demanding "ONLY valid JSON" in the same call as the search
   suppressed Gemini's decision to search at all, which is what produced
   source-less reports full of fabricated URLs. The parallel-across-topics
   fan-out, the one-retry behavior and the synthesis pass are unchanged. Check
   the CURRENT shape against entry 87, not this line.
3. Robustness: a failed/empty topic becomes a NOTES-section line, never a run
   failure; when topic extraction finds nothing OR every topic fails, the
   pipeline degrades to a single whole-deck grounded search (today's original
   shape) and marks the report "(DEGRADED - see NOTES)"; the action only
   returns an error (which the step throws) when there is no content at all -
   extraction failed AND the whole-deck fallback also failed.
4. New step inputs (all optional): maxTopics (number, default 6, clamped
   1-12), itemsPerTopic (number, default 5, clamped 1-10), extraFocus
   (longtext, folded into every per-topic and fallback prompt). Clamping is
   pure (clampMaxTopics/clampItemsPerTopic). The pure helpers - the clamps,
   the tolerant parsers, and the report builder - live in
   src/lib/workflows/current-events-report.ts (a "use server" file may only
   export async functions), tested there; the action itself is tested in
   src/app/actions/current-events.test.ts. No preset in
   src/lib/workflows/presets.ts contains current-events-report, so no preset
   bindings were needed.
5. Report: a plain-text document (CURRENT EVENTS REPORT title, Generated
   timestamp, Recency window, a "Coverage: N topic(s) x M item(s), S
   source(s)" line, one TOPIC: section per topic with dated items, CROSS-
   CUTTING THEMES, WHAT CHANGED SINCE THIS DECK WAS WRITTEN, DISCUSSION
   PROMPTS, a numbered SOURCES section (deduped by URL across every call,
   explicit no-sources line when empty), and a NOTES section).
   CORRECTED 2026-07-27: this entry described a .txt save, but commit d427c90
   ("current-events report as a Word document") had already changed it and this
   check was never updated - it had been failing silently ever since. The
   report is saved as a WORD DOCUMENT: steps.knowledge.ts imports
   buildDocxFromPlainText, renders `reportMarkdown` through it, and saves with
   fileExt "docx" / mimeType DOCX_MIME via saveLibraryFileAction
   (workflow-tagged) and helpers.saveCourseMaterialFile; the browser download
   is also .docx. The flat plain-text rendering above remains the step's
   `reportText` output, which other steps bind to. See entry 85 for the .docx
   contract and entry 87 for the document's heading/nesting structure.
   Outputs add sourceCount (number) and topicsCovered (number); reportText and
   fileName keep their existing keys/types.
6. Unit tests (src/app/actions/current-events.test.ts): the clamps, the topic
   parser (JSON, tolerant line fallback, junk -> []), the item parser, the
   URL dedupe, and the report builder (all sections present, sources
   numbered/deduped, notes rendered, no-sources line, degraded marker) are
   pure and directly tested; researchCurrentEventsAction is tested with a
   mocked callLlm covering the happy path, one topic failing, all topics
   failing (degraded fallback), extraction failure (degraded fallback), total
   failure (informative error), and options passthrough.

### 2026-07-22 - Navigation restructure

1. Top-level tabs are exactly: Courses, Manual, Workflows, Files. "drafts",
   "ppt-design", and "mail" are not valid ActiveTab values; legacy saved values
   migrate (ppt-design -> Manual + PowerPoint Design subtab; drafts/grade-drafts
   -> Workflows + Drafts subtab; mail -> default).
2. CORRECTED 2026-07-27: this check asserted PowerPoint Design is the LAST
   Manual subtab. It no longer is - `artifact-design` was appended after it by
   an earlier change (entry 71), and `live-class` by entry 90, so the order is
   now Build Courses, LMS, Version Control, Recording, PowerPoint Design,
   Artifact Templates, Live Class. The requirement worth keeping is the one
   this check was really protecting: PowerPoint Design is a Manual subtab that
   renders PowerPointDesignTab, and the legacy ppt-design top-level value still
   migrates onto it. Assert that, not its position - new subtabs are appended
   and the position is not a contract.
3. The Workflows tab hosts a persisted subtab level (ta-workflows-view:
   workflows | drafts); Drafts keeps a persisted third level (ta-drafts-view)
   - Grades/Messages/Presentations at the time of this entry, SUPERSEDED by
   the presentations-to-Files entry below (Presentations removed; a stored
   "presentations" migrates to "grades"); the draftsInbox badge sits on the
   Workflows top tab;
   openWorkflow and both watcher callbacks force the "workflows" subtab so runs
   are visible; refreshDrafts fires on entering the Drafts subtab.
4. Mail is gone from the nav (MailTab.tsx deleted) while mail/message server
   actions and messaging workflow steps keep working.

### 2026-07-22 - Files Submissions subtab + instant upload trigger

1. The Files tab has Library and Submissions subtabs (ta-files-view persisted,
   default library); Submissions renders CartridgeDropPanel (heading "Student
   submissions"); the same panel still renders inside GradingTab.
2. A successful upload dispatches CARTRIDGE_DROP_UPLOADED_EVENT (constant
   exported from src/lib/cartridge-drops.ts) and WorkflowTriggerWatcher's
   listener immediately evaluates enabled "cartridge-uploaded" triggers through
   the same evaluate -> claim -> enqueue path as the poller (claim lock prevents
   double-fire); the 15-minute-minimum poll remains as fallback.
3. The event source keeps type id "cartridge-uploaded" with user-facing label
   "Submissions uploaded".

### 2026-07-22 - Auto-grading on submissions upload

1. Preset id "cartridge-grading" is named "Grade Uploaded Submissions"; its
   description references Files > Submissions and the "Submissions uploaded
   trigger"; step type id "grade-cartridge-submissions" unchanged.
2. CartridgeDropPanel's "Automatic grading" control provisions an enabled
   trigger (eventType cartridge-uploaded, workflowId cartridge-grading,
   unattended true) idempotently - re-clicking enables an existing disabled row
   rather than creating duplicates; the off affordance disables, never deletes.
3. The full chain holds: upload -> drop row (status new) -> instant event ->
   watcher evaluation -> claim -> enqueueScheduledRun -> grade-cartridge-
   submissions -> graded drop + gradebook CSV + grading draft.

### 2026-07-22 - Courses/Manual notification bubbles removed

1. The Courses and Manual top tabs render plain labels (no NavTabLabel counts);
   the Manual LMS and Version Control subtabs have no navBadge spans. The
   Workflows and Files tab badges, the Workflows > Drafts subtab badge, and the
   Drafts inner subtab badges remain. The document.title aggregate still counts
   grading/unread/VC attention.

### 2026-07-22 - Grading drafts source marking

1. grading_drafts has a nullable source column (migration 20260827); the domain
   type GradingDraftSource is the closed union "repos" | "lms" | "cartridge";
   the mapper validates values (unknown -> undefined); createGradingDraft
   persists source (unit tested, including null when omitted).
2. All saveGradingDraftAction call sites tag their source: the LMS submissions
   grader "lms", batch-grade-repos-to-draft "repos", grade-cartridge-submissions
   "cartridge" (currently in the split files steps.grading-*.ts).
3. DraftedGradesTab shows a source badge ("Repo grade" / "LMS grade" /
   "Submissions zip grade"), a class label derived from the payload runs'
   courseName values, and the existing "From workflow" link; drafts with null
   source render exactly as before.

### 2026-07-22 - Batch file splits (structure guard)

1. Aggregators reproduce original order exactly: gradingSteps
   (steps.grading.ts concatenating -run/-draft-flow/-repos/-singles/-cartridge),
   contentSteps (steps.content.ts concatenating -lectures/-insights/-generators),
   and allWorkflows() in presets.ts (importing from presets/grading,
   course-setup, content, communication) - every previously-exported symbol
   still importable from its original module path.
2. src/lib/supabase/types.tables-a.ts and types.tables-b.ts import type { Json }
   from ./types and every JSON column is typed Json / Json | null - never
   unknown (a drift here breaks typed mappers repo-wide).
3. Split-file sizes hold: WorkflowsTab/WorkflowBuilder aside (covered by their
   own entry), every file this split produced or reduced is at or under 1000
   lines: src/app/components/files/*, src/app/components/home/*,
   steps.grading.ts + steps.grading-run/-draft-flow/-repos/-singles/-cartridge,
   steps.content.ts + steps.content-lectures/-insights/-generators,
   presets.ts + presets/*, actions/llm-content.ts, actions/llm-tools.ts,
   actions/grading.ts, actions/grading-inbox.ts, actions.ts, page.tsx,
   home-helpers.ts, supabase/types.ts + types.tables-a.ts + types.tables-b.ts.
   Note: other registry step files and action files predate this work, may
   exceed 1000 lines, and are out of scope here - they enter the ratchet when a
   work item touches them.

### 2026-07-22 - Unattended run observability

1. workflow_schedules and workflow_triggers carry last_run_status /
   last_run_detail (migration 20260828); domain fields are typed with the closed
   union "started" | "ok" | "error" | "skipped" (src/lib/workflow-run-status.ts)
   through the typed mappers.
2. Claims stamp started: claimWorkflowSchedule and claimFanoutSchedule always;
   claimAndAdvanceTrigger ONLY when the evaluation fired (cursor-only advances
   and touchTriggerChecked never touch the status columns). The at-most-once
   claim WHERE-conditions are unchanged.
3. Every path that ends a run writes back ok/error/skipped with human-readable
   detail (capped 500 chars): the cron route including its claimed-skip branches
   (workflow not found / not headless-safe / fan-out abandon), the unattended
   trigger runner, and the attended completion site (handoff scheduleId /
   triggerId -> updateScheduleRunOutcome / updateTriggerRunOutcome).
4. buildRunReportMarkdown yields a report for every non-empty run: error steps
   get sections with the error text, skipped/disabled/needs-interaction steps
   get one-line sections with the reason, and an all-done-no-text run gets a
   fallback body; null only for an empty outcomes array. Unattended runs always
   save the report to Files (only a truncated fan-out tick defers); the cron's
   claimed-skip branches persist a "run skipped" mini-report to Files AND record
   a workflow_runs row with status "skipped".
5. A workflow_runs row with status "skipped" never satisfies workflow-completed
   chaining (decideWorkflowCompleted excludes it; a decisions test proves it).
6. The Automate panel shows a last-run chip + detail per schedule and trigger
   (ok/error/skipped/started via the ghBadge classes); a "started" older than 10
   minutes (schedules anchored on lastRunAt, triggers on lastFiredAt) renders as
   "Did not finish" with a timeout hint.

### 2026-07-22 - Concepts + course-tile workflow scoping

1. "concepts" is a first-class input value type: in the WorkflowValueType union,
   LITERAL_CAPABLE_TYPES, scopeFamilyForType (family "concepts"), and
   WorkflowScope.concepts (src/lib/workflows/types.ts). applyWorkflowScope
   treats it as a scalar family: fills an empty run value from scope, never
   overrides a non-empty one, rejects "*". describeWorkflowScope and the
   per-input fill description include a concepts part.
2. generate-presentation-from-template's concepts input has type "concepts"
   (steps.media.ts:51); its run logic still splits the value on newlines.
3. Every longtext special case treats "concepts" identically:
   RuntimeFieldInput's multiline textarea branch, builder LiteralEditor
   multiline, the "Fixed value" label lists in InputBindingRow and
   DanglingOutputs, and useWorkflowRun's fieldTypes array.
4. outputFeedsInput allows longtext OUTPUTS to feed concepts INPUTS (types.ts
   ~:90); the reverse direction is not added.
5. WorkflowScopeControl has a Concepts multiline textarea (one per line, no
   "All" option) writing scope.concepts; typing Enter at the end of a line
   WORKS - the onChange stores the raw value and clears only when
   whitespace-only (never trims per keystroke; WorkflowScopeControl.tsx ~:258).
6. End-to-end: with scope { hubCourse, concepts } on a deck-workflow copy,
   collectRuntimeFields drops both fields from the run form and the step
   receives the scope values at run time (covered by the concepts suite in
   types.scope.test.ts).

### 2026-07-22 - Course-tile fan-out (deck workflows run from scope)

1. fanout.ts: isCourseFanout is true for scope.hubCourse "*" or 2+ newline ids
   (false for one id; institution "*" takes precedence); scopeForCourse pins a
   tile; resolveFanoutCourses enumerates institution-filtered tiles for "*" and
   resolves concrete lists skipping unresolvable ids with notes.
2. Coverage: a SINGLE hubCourse input is covered (dropped from the run form)
   under course fan-out; single-id behavior is the unchanged applyWorkflowScope
   path (types.scope tests pin both).
3. Attended: useWorkflowRun loops the whole run per course with per-course
   runState groups (courseId/courseName/courseStatus); RunPanel renders
   "Course i of N: name" headers, a dual-dimension progress line (courses count
   via countOkCourses - only courseStatus "ok"), a per-course results block
   with the summary "Generated ok of N courses' runs; failed...; skipped...",
   and a "Stop after this course" button that finishes the current course and
   marks the rest skipped (attended-fanout.ts pure helpers, tested). Hard-
   cancel mid-fan-out marks remaining courses skipped in BOTH runState and the
   persisted detail (courseOutcomes pushed synchronously, never inside a state
   updater). Once-per-run: recents, the run-row write, and last-run write-back
   fire once, with course counts in the detail. (AMENDED 2026-07-28: the
   run-row write is now `finishWorkflowRun` paired with a `startWorkflowRun`
   at the top of the run, not the old single `recordWorkflowRun` insert - see
   entry 94. The once-per-run requirement is unchanged.)
4. Unattended: the cron claim branch covers isCourseFanout; per-course groups
   with scopeForCourse pinning, deadline cutoff, FanoutProgress.doneCourses
   checkpointing (additive Json; old blobs parse); zero-tiles/enumeration
   errors return clean error outcomes and NEVER throw even with saveRunReport
   set (guarded courseNames map; server-runner tests pin it); reports group per
   course.
5. Guardrails: institution fan-out behavior byte-identical. (The original
   institution-"*"-plus-course-fan-out rejection was REPLACED by composed
   execution - see the "Composed fan-out" entry below, which supersedes this
   check's rejection wording.)

### 2026-07-22 - Automations subtab (monitoring hub)

1. The Workflows top tab has three subtabs - Workflows | Automations | Drafts -
   persisted via ta-workflows-view (stored "automations" restores).
2. AutomationsPanel lists every workflow with at least one schedule or trigger
   (enabled or disabled - fully-disabled ones render dimmed via the
   every-automation-disabled rule) showing per-automation cadence/describeTrigger,
   unattended chips, last-run chips + detail via the SHARED
   lastRunChip/isStaleStarted helpers (single 10-minute threshold definition,
   correct anchors: schedules lastRunAt, triggers lastFiredAt), and
   enable/disable toggles that update optimistically with rollback + a
   user-visible one-line error on failure (no full-panel loading flash).
3. Attention-first ordering: error / stale-started workflows sort first under a
   "Needs attention" flag (automation-inventory-logic tests pin ordering,
   filtering, and the needs-attention predicate incl. boundary).
4. Clicking a workflow name deep-links to its Automate panel (openWorkflow with
   panel targeting via ta-workflows-panel); the per-workflow Automate panel
   contains ONLY the selected workflow's sections (the old cross-workflow
   overview block is gone; AutomateOverview.tsx deleted).

### 2026-07-22 - Files tab file preview

1. Every Files library row has a Preview button: playable media delegates to
   the existing inline player (routed BEFORE any download via
   getPreviewStrategy); pdf/images open in FilesTab's own FilePreviewModal
   instance via object URLs (revoked on close AND on switching files);
   text-like files render as text capped at 200 KB with a truncation note;
   docx/pptx preview via server-side extraction (extractDocxTextAction /
   extractPptxSlidesAction); zip bundles list entries with (dir) markers (the
   jszip public API exposes no sync uncompressed size - documented in code);
   unknown types get an explicit no-preview note.
2. The strategy resolution is pure and tested (file-preview.test.ts);
   FilePreviewModal itself is unmodified and its other consumer sites
   unaffected.

### 2026-07-22 - Submission archive sniffing (Submissions panel prefill)

1. Selecting an archive sniffs it BEFORE upload and the same drop receives the
   effective values (mergeSniffedValues: user-typed values always win, sniff
   fills only blanks, lms gated on the chosen flag - pure and tested); a
   throwing sniff (malformed cartridge) degrades to no prefill and the upload
   proceeds; the detected-from-archive hint line shows and clears.
2. Fingerprints: cartridge (imsmanifest/course_settings - reuses
   parseCartridgeBlob for title/rubric/points) wins first; otherwise the
   MAJORITY pattern wins by matching-entry count with fixed-order tie-break
   (moodle/canvas/brightspace/blackboard; Canvas needs >50 percent); Blackboard
   filenames yield course/assignment labels and companion txt points.
3. Explicit LMS choices are never clobbered: ta-cartridge-lms-chosen set on any
   user selection, with the migration that a persisted non-default lms counts
   as chosen. Upload flow, CARTRIDGE_DROP_UPLOADED_EVENT, ta-cartridge-*
   persistence, and the auto-grading control are unchanged.

### 2026-07-22 - Grading-comment preview/edit modal

1. Every rubric-area comment row in a draft (including the synthetic Overall
   area) has a "Preview / edit" affordance opening CommentEditModal: preview
   renders the comment as it will post (pre-wrap), the textarea edits it, Save
   persists via updateGradingDraftPayloadAction and updates local state only on
   ok, errors render inline, and dirty close paths (cancel, backdrop, X) gate
   on an inline "Discard changes?" confirm.
2. replaceAreaComment(payload, runIndex, resultIndex, areaName, newComment) is
   pure, run-isolated (editing runs[k] never touches other runs - the
   multi-run isolation test pins it; drafts hold one run per assignment), and
   no-ops on a missing target.

### 2026-07-22 - Courses tab Phase 1 (structure guard)

1. The pure helpers live in src/lib/courses-tab-helpers.ts (CourseForm,
   formFromCourse/courseToInput, roster and student-repo parsers, file
   readers, downloadDocx, mergeCardLayout/mergeInstitutionFields) with the
   42-test suite; icons in courses/icons.tsx.
2. useCoursesData owns the data layer AND the module-level caches: the setters
   it returns (setCourses/setSyllabi/setOrgs) update the cache inside the
   setState updater (the module-cache idiom), CoursesTab holds ZERO direct
   cache assignments, and remounting the tab hits the cache instead of
   refetching.
3. CoursesTab renders identically to pre-extraction (the redesign is Phase 2);
   every file the extraction produced is under 1000 lines.

### 2026-07-22 - Syllabus direct upload (backend + control)

1. uploadSyllabusAction accepts .docx/.pdf/.txt/.md up to ~6 MB (extension-only
   gating, documented; validation pure + tested), extracts text (docx via
   parseOfficeParagraphs, pdf via officeparser's PDF path, txt/md decoded),
   creates the syllabus record via the SAME createSyllabus store
   import-lms-syllabus lands on (course_syllabi), THEN sets the course's
   syllabus_id via updateCourse (record-first ordering documented; toRow omits
   materials columns so no data loss).
2. SyllabusUploadControl exists (theme-token styled, light/dark correct),
   unmounted pending the Courses table Phase 2 which mounts it in the syllabus
   editor.

### 2026-07-22 - Manual tab flattened rail

1. Two quiet subnav rows use the pre-existing chip idiom EXACTLY (styles.
   manualSubnav wrapping styles.lessonInnerTabs/lessonInnerTab/
   lessonInnerTabActive - the same markup as the Workflows subtab bar): no
   group labels, no separators, not sticky. Row 1 is EVERY Manual subtab -
   always visible, one click from anywhere in Manual. Row 2 renders ONLY when
   the active subtab has inner views - Build's [New Build, Pre Built], LMS's
   [Modules, Pages, Files, Grading, Announcements, Inbox] - so within the
   active subtab, any of its destinations is one click away; single-view
   subtabs render no row 2.
   CORRECTED 2026-07-27: this check named "the five Manual subtabs" and listed
   them. That count was already stale before this batch (entry 71 added
   Artifact Templates, making six) and this batch's Live Class makes seven, so
   it had been failing silently. The subtab LIST is not the contract - the
   chip idiom, Row 1 showing every subtab, and Row 2 appearing only for
   subtabs with inner views are. Version Control, Recording, PowerPoint
   Design, Artifact Templates and Live Class are all single-view and render no
   Row 2; the authoritative list lives in manual-rail.ts's destinations array
   and is pinned by manual-rail.test.ts.
   Exactly one active chip per row. No destination header (name + description)
   renders above content - content areas own their own headings.
2. All persistence and migrations hold (ta-manual-view, ta-build-view,
   VIEW_KEY + legacy mappings per the Manual-shell baseline); page.tsx owns
   contentView as ContentTab's REQUIRED controlled prop (no uncontrolled
   fallback; ContentTab's inner tab bar is gone); Recording keeps its
   keep-mounted treatment; CoursesTab deep-links land correctly.
3. The LMS destination list is compile-time exhaustive over ContentView
   (LMS_VIEW_PRESENCE Record - a new ContentView member fails tsc until added
   to the rail); manual-rail.test.ts pins active-resolution, transitions, and
   completeness. One canonical definition per persistence key.

### 2026-07-22 - Files name/extension normalization

1. Stored file names are canonical extension-less: saveRecordingFile strips ONE
   matching trailing ".ext" (case-insensitive) via stripMatchingExt (pure,
   tested incl. multi-layer collapse and .tar.gz outer-only); downloads append
   the extension only when the name does not already end with it. Extension
   accumulation ("x.docx.docx") can no longer occur through save/download/
   re-upload cycles; the ext chip display is unchanged.

### 2026-07-22 - Kickoff context, source alignment, and LMS tool integration

1. generate-schedule, fill-readmes, and lecture-materials-from-schedule accept
   an optional context (longtext) threaded into their prompts as a delimited
   instructor-context section; COURSE_KICKOFF binds it on its two generative
   steps and NO_CODE_KICKOFF on its two, all via the shared "context" fieldKey
   (asked once).
2. generate-schedule and lecture-materials-from-schedule accept sourceMaterial
   (longtext); NO_CODE_KICKOFF binds it (shared fieldKey). The schedule prompt
   encodes the balanced-hybrid policy (densest-chapter Part I/II splits;
   group-adjacent-never-drop; standard review/exam/project non-content weeks;
   never invent source content; instructor context overrides where it speaks);
   the materials prompt emits review guides / practice sets / project briefs
   for non-content weeks grounded in already-covered chapters
   (isNonContentWeekText + describeCoveredChapters, exported and tested).
3. Post-generation validation: parseTocChapters (tolerant "Chapter N:",
   "N.", "Unit N -" formats) + validateScheduleAlignment +
   formatBalanceSummary run in generate-schedule when a TOC parses, and the
   balance line + anomalies land in the schedule summary's notes (rendered in
   run-results); unparseable TOCs note name-only grounding. Blank
   sourceMaterial with a tile textbook falls back to name-only grounding via
   the shared hubCourse binding (asked once; tests assert the exact action
   args).
4. integrate-source-into-lms (steps.lms-integrations.ts, headless-safe,
   canary-counted): appended last in NO_CODE_KICKOFF; matches week modules
   tolerantly (/(?:module|week)\s*0*(\d+)/i - "Module 01" works; binding an
   absorbed include's output is impossible by design, documented inline);
   creates per-chapter-week pages and online_url assignments with
   match-by-title idempotent skip (existing titles enumerated; within-run
   double-create prevented and tested); skips cleanly (with notes) when no
   live connection or no source; no quiz creation (no create-quiz action
   exists - only question-level).

### 2026-07-22 - Courses tab table view (Phase 2)

1. The Courses tab is a table: one row per course, sortable header (EVERY
   data column since the cards-to-columns entry below; ta-courses-sort),
   sticky header + frozen name column via the container-scroll idiom (see
   the sticky-header entry below), column-visibility menu
   (ta-courses-columns; name/actions always shown).
2. Scalar fields edit inline in cells through computeFieldPatch + the update
   action with the pre-redesign patch semantics (weeks/tests numeric handling,
   lms null-when-blank, repos topic-extraction side effect); failed saves keep
   the editor open with the draft (result threaded to every commit handler).
3. The former row-expansion structural editors are COLUMNS (superseding
   entry: "sort any column + expansion cards become columns" below); every
   ported behavior listed there must hold. The SyllabusCell offers select/
   preview/download/From-LMS/From-import plus the direct-upload control
   (onUploaded updates the row and reloads the syllabus list).
4. The actions column preserves the onNavigate contract; delete uses the
   original single confirm; the add/edit form is the ported AddCourseForm.
5. Retired by user approval: the tile/card-layout system and its panels
   (custom tiles, drag/hide, institution common-fields editor,
   syllabus-template admin, per-course scheduled-workflows display) and the
   Common Resources panel (component deleted; the common-resources lib remains
   for the Starter Materials workflow). card-layout.ts remains only as a lib
   consumed by courses-tab-helpers; no layout localStorage keys are read.
   Also retired by user direction (cards-to-columns): row expansion, the
   chevron, RowDetail*.tsx, and the separate count columns (superseded by
   the repos/roster/studentRepos cells displaying the same counts).
6. Pure logic tested: sort machinery, column-set parsing incl. legacy-id
   migration, derived counts, field patches (courses-table-helpers, 47
   tests) on top of Phase 1's 42.

### 2026-07-22 - TabShell layout normalization

1. Every tab-level surface renders inside the shared TabShell component
   (section.card): Courses, Files library, Workflows root, Automations,
   the three Drafts views, and the Manual destination containers - structural
   convergence with byte-equivalent DOM where .card already applied;
   AutomationsTabView gained the standard container. RecordingTab is the one
   exception (deferred to its split). Zero new CSS or class names.

### 2026-07-22 - Automations hub full view/edit

1. The schedule/trigger edit-form bodies live in shared
   ScheduleEditForm/TriggerEditForm components consumed by BOTH the
   per-workflow Automate panel (byte-identical rendering - the only added
   error line is gated behind an error prop the panel passes null) and the
   hub; the pure validators live in workflow-form-helpers (exported, 26
   tests covering interval minimums, runAt rules, per-event required config,
   and scope fallbacks - the 53 recorded at entry time was an implementer
   overcount, corrected 2026-07-22 after a regression run counted the file).
2. Every hub row has a Details disclosure showing cadence/runAt/interval or
   event + every configured field (event-source labels, resolved display
   names), course, institution, unattended, full last-run, and a field-values
   snapshot; Edit swaps in the shared form pre-filled via
   scheduleToForm/triggerToForm, validates with the shared validators, saves
   through the store functions with optimistic update + rollback + inline
   error; unattended gating uses headless-safety from the inventory's defs;
   one editor open at a time; delete remains panel-only.

### 2026-07-22 - Repo-wide downsizing (structure guard extension)

1. No tracked source file under src/ exceeds 1000 lines, with the sole
   documented exception of RecordingTab.tsx (its split runs as a separate
   session task).
   SUPERSEDED (see "Recording tab split under 1000 lines + TabShell" below):
   RecordingTab.tsx was itself split and the exception no longer applies.
   As of 2026-07-26 the 1000-line limit holds with NO documented exception;
   the largest tracked file under src/ is steps.github.ts at 996 lines.
   Spot checks: ModulesView.tsx is a ~638-line orchestrator
   over content-tab/modules/ (10 hooks + 8 components); RepoDetail.tsx is an
   orchestrator over repo-detail/; the former giants canvas-modules.ts,
   canvas.ts, github.ts, grade.ts are thin barrels over domain modules
   (canvas-modules/, canvas/, github.*.ts, grade/) whose export surfaces
   match their pre-split originals symbol-for-symbol; steps.course-setup/
   steps.lms/steps.assignments are in-order aggregators over sibling group
   files (create-canvas-quiz last among assignment steps); actions/canvas.ts
   and actions/course-hub.ts re-export their cluster modules with every
   symbol exported exactly once into the actions.ts star-export graph.
2. The split test files (workflow-triggers.*.test.ts x6,
   github.copyrepo.*.test.ts x5) collectively reproduce their baseline
   suites; the original monolithic test files are deleted.
3. listCourseContentAction returns { courseName, modules, pages } - the pages
   field is load-bearing for ContentTab's Pages view and the
   integrate-source-into-lms step (a split once dropped it; never again).

### 2026-07-22 - Workflows tab UX overhaul (grouped sidebar, fewer-click run)

1. src/app/components/workflows/WorkflowListSidebar.tsx owns the sidebar list;
   src/app/components/workflows/workflow-grouping.ts exports groupWorkflows(),
   covered by workflow-grouping.test.ts (14 tests: category grouping, custom
   grouping, recent ordering/dedup/cap-at-5, unresolvable recent ids skipped,
   flat search results, case-insensitive name/description match).
2. WorkflowDef.category (src/lib/workflows/types.ts) is
   "grading" | "course-setup" | "content" | "communication", set on every
   preset in src/lib/workflows/presets/{grading,course-setup,content,
   communication}.ts (46 defs total); custom workflows never set it.
3. Sidebar group order: Recent (only when non-empty) -> Custom (only when
   custom workflows exist) -> Grading -> Course setup -> Content & lectures ->
   Communication & briefings. A non-empty search collapses to the flat
   filtered list (name-or-description match, case-insensitive) with no group
   headers - same predicate as the pre-overhaul filteredWorkflows.
4. Persistence: collapsed group ids under "ta-workflows-groups-collapsed"
   (JSON array, default all-expanded, WorkflowListSidebar.tsx); the last 5
   distinct workflow ids whose run actually STARTED (validateForm passed)
   under "ta-workflows-recent" - recorded via the onRunStart callback
   useWorkflowRun's handleRun invokes right after validateForm succeeds
   (useWorkflowRun.ts), never on a blocked/invalid Run click; the Build/Run/
   Automate panel choice under "ta-workflows-panel" (default "run"); the
   optional-fields disclosure open state under "ta-workflows-optional-open"
   (default closed, RunPanel.tsx).
5. Each sidebar row shows a "Run <name>" button (real <button>, aria-label)
   when the row is selected OR hovered (WorkflowListSidebar hoveredWorkflowId
   state); clicking it selects the workflow and switches to the Run panel in
   one call (WorkflowsTab's onRunClick handler).
6. RunPanel.tsx header shows the workflow name, description, and - only when
   describeWorkflowScope(selectedDef.scope) is non-empty - a "Scoped: ..."
   line. Required runtime fields render before optional ones; optional fields
   collapse under an "Optional inputs (N)" disclosure only when there are 3 or
   more of them (fewer than 3: all fields render directly, no disclosure).
7. Size/typing: WorkflowsTab.tsx, WorkflowListSidebar.tsx, RunPanel.tsx, and
   workflow-grouping.ts are all under 1000 lines; no `as any` / `as unknown`
   casts or new eslint-disable comments were introduced by this feature (the
   props RunPanel forwards to RunStepCard/RunInputPrompt/SummaryView/GradeBadge
   use those components' real exported signatures).

### 2026-07-22 - Recording tab split under 1000 lines + TabShell

Context: RecordingTab.tsx (2313) was split pure-move into hooks/components
under src/app/components/recording/ plus a new shared TabShell.tsx root
container, per the WorkflowsTab/CoursesTab split precedents. The Recording
surface area baseline above guards the behavior; these checks guard the seams
this split created.

1. Size limit holds: src/app/components/RecordingTab.tsx,
   src/app/components/TabShell.tsx, and every .ts/.tsx under
   src/app/components/recording/ are each at or under 1000 lines (wc -l; also
   enforced at test time by recording-split.structure.test.ts).
2. Export surface: RecordingTab remains the default export of
   src/app/components/RecordingTab.tsx with the { active?: boolean } prop;
   `Take` remains importable via `import type { Take } from "./RecordingTab"`
   (re-exported from recording/types.ts). CaptionStudio.tsx and page.tsx
   needed no changes for the split and must keep compiling against these
   exact surfaces.
3. TabShell parity: TabShell.tsx renders exactly section.card + TabHeader
   (eyebrow/title/subtitle) so a converged tab's root DOM is identical to the
   hand-rolled idiom. RecordingTab uses it with eyebrow "Recording", title
   "Record from a camera", and the pre-split subtitle. Other tab surfaces may
   converge later; they are not required to by this entry.
4. Keep-mounted seams: the three inner views (record / captions / slides) stay
   mounted behind display:none wrappers keyed on recView (persisted under
   ta-rec-view); the record view is hidden, never unmounted, and CaptionStudio
   receives takes + backupDir from useTakes.
5. Immutability seam: every `.current =` assignment in RecordingTab.tsx and
   src/app/components/recording/ targets a directly-bound ref (local ref,
   direct hook arg, or destructured prop) - never through an object member
   (settings.*, bg.*, pip.*, cards.*, pipeline.*). That discipline is what
   keeps react-hooks/immutability at 0 errors; new mutation sites must get
   the ref as a direct arg/prop.
6. Deps seam: no whole hook-return object (settings/cards/pip/pipeline/bg)
   appears in any dependency array in these files - member expressions only.
   loadDevices in useDevices.ts stays a useCallback (its stability keeps
   startPreview and the restart-preview effect from re-firing every render).
7. Quirk guards: the keyboard-shortcuts effect in useRecorder.ts keeps NO
   dependency array (re-subscribes every render by design, gated on `active`);
   take numbering stays `Take ${takesLength + 1}` from the render-captured arg
   (stale-closure semantics, deliberate); the appliedCfgRef signature string
   and restart-effect condition are byte-identical between startPreview and
   the restart effect.
8. localStorage canary: the full ta-rec-* key set is pinned by
   recording-split.structure.test.ts (scan of recording/ + RecordingTab.tsx,
   *.test.ts excluded); adding or removing a key must bump that test in the
   same commit. CaptionStudio reads several of these keys directly.
9. Hygiene: no eslint-disable comments and no emojis anywhere in
   RecordingTab.tsx, TabShell.tsx, or src/app/components/recording/.

### 2026-07-22 - Courses table sticky header + column min-widths

Context: the Phase 2 header carried position: sticky with a page-level offset,
but its overflow-x wrapper was a scroll container, so sticky never engaged;
and the table borrowed .courseScheduleTable, whose positional width rules
(built for the course-planning schedule shape) squeezed Name/Institution/
Actions. Replaced with a dedicated colocated module using the
container-scroll idiom.

1. Dedicated styles: the Courses table uses
   src/app/components/courses/CoursesTable.module.css (.scroller/.table/
   .stickyName) and does NOT reference .courseScheduleTable;
   .courseScheduleTable in page.module.css is untouched and still styles the
   course-planning schedule table exactly as before.
2. Sticky mechanics (container-scroll): .scroller is the scroll box
   (max-height calc(100vh - topbar - 160px), overflow auto); thead th sticks
   to top: 0 (z-index 2, opaque color-mix background); the name header is the
   sticky corner (left: 0, z-index 3); body name cells use .stickyName
   (left: 0, z-index 1, opaque background with an even-row zebra override).
   Verified live: with the container scrolled on both axes, the header row
   and name column stay pinned to the scroller edges.
3. Sticky-safe borders: the table uses border-collapse: separate with
   border-spacing 0 and one-sided cell borders (bottom + right, outer edges
   suppressed) - required because collapsed borders scroll away from a sticky
   header. No positional td width rules exist in the module.
4. Column widths: COLUMN_MIN_WIDTHS (courses-table-helpers.ts) maps every
   ColumnId plus name/actions to a px minimum applied as each th's inline
   minWidth; the table has no hard element-level minWidth. A completeness
   test pins the key set to ALL_COLUMN_IDS + name/actions with positive
   values (the ColumnId set has since widened - see the cards-to-columns
   entry; the completeness test tracks it by construction).
5. Unchanged behavior: sort clicks/indicators, ta-courses-sort and
   ta-courses-columns persistence, inline cell editing, the actions column,
   and the Phase 2 entry's checks all hold. No new persisted controls were
   added. (Row expansion, mentioned here originally, was later retired by
   the cards-to-columns entry.) Unit-test disposition: COLUMN_MIN_WIDTHS is
   the only new pure logic and is covered by the completeness test; the CSS
   module and class swaps have no unit-testable surface.

### 2026-07-22 - Courses table: sort any column + expansion cards become columns

Context: user-directed replacement - every row-expansion card is now a
column, and every data column sorts. Row expansion, the chevron, the five
RowDetail* files, and the three separate count columns are retired (counts
now display inside the repos/roster/studentRepos cells).

1. Column model: ALL_COLUMN_IDS = the nine scalar columns + repos, roster,
   studentRepos, integrations, description, scheduleCsv, rubric, materials,
   lmsExports. DEFAULT_VISIBLE_COLUMNS (also the malformed-persist fallback)
   is the pre-widening twelve-column face; the six heavy new columns default
   hidden, discoverable via the Columns menu.
   SUPERSEDED 2026-07-26 by commit 8f921fc "reveal all hidden columns by
   default": DEFAULT_VISIBLE_COLUMNS now contains EVERY id in
   ALL_COLUMN_IDS - the six heavy columns (integrations, description,
   scheduleCsv, rubric, materials, lmsExports) are visible by default, and
   COLUMNS_ADDED_IN[2] unions them into pre-existing persisted sets. The
   Columns menu still hides them on request. parseColumnSet migrates legacy
   persisted ids (rosterCount -> roster, studentRepoCount -> studentRepos,
   reposCount -> repos, deduped).
2. Sorting: SORT_FIELDS = ["name", ...ALL_COLUMN_IDS] by construction
   ("actions" excluded - not data). One pure extractor sortValueFor(course,
   field, ctx) feeds one generic comparator: text sorts case-insensitive,
   numbers numeric, EMPTY values always last in both directions, ties break
   by name ascending independent of direction. syllabusId sorts by the
   RESOLVED syllabus name (ctx.syllabusNameById built from the syllabi prop;
   raw id fallback); repos/roster/studentRepos/integrations/materials/
   lmsExports sort by count (zero is ordinary, never "empty");
   scheduleCsv/rubric/description sort by content text (unset last).
   name/startDate semantics byte-identical to the pre-widening comparator.
3. Header: every data th (name + all columns) is clickable with
   cursor: pointer + the ascending/descending indicator; persistence stays
   in ta-courses-sort (parseSortState accepts every SORT_FIELDS member,
   legacy values valid, junk falls back). Header cells map over
   ALL_COLUMN_IDS filtered by visibility; CourseRow renders cells in the
   same canonical order, so header/cell alignment is order-independent of
   the persisted visibility array. The Actions th has no sort affordance.
4. Cells preserve 100% of the former cards' behaviors: RepoCell (codebase
   editor + ownedRepos), RosterCell (editor + stats + From-LMS draft),
   StudentReposCell, Integrations/Description via EditableCell (multiline,
   truncated display, the Integrations format hint via EditableCell's new
   optional hint prop), ScheduleCsvCell + RubricCell (Set/Not set display,
   Preview, From LMS, From import, editor), MaterialsCell + LmsExportsCell
   (compact summary + a Manage-anchored MUI Popover hosting the card bodies
   verbatim: upload/replace/remove-with-confirm, per-file download/remove,
   export upload, all busy states). saveField/computeFieldPatch semantics
   unchanged (Phase 2 check 2).
5. Structure: RowDetail.tsx, RowDetailRepos.tsx, RowDetailRoster.tsx,
   RowDetailSchedule.tsx, RowDetailFiles.tsx deleted (git-recoverable);
   cell files RepoCell/RosterCell/ScheduleCell/FilesCell each at or under
   1000 lines; EditableCell's only change is the additive hint prop.
6. Pure logic tested (courses-table-helpers.test.ts, 47 tests at the time of
   this entry; 56 since the modality column added its 9): legacy-id
   migration + dedup, DEFAULT_VISIBLE_COLUMNS excludes the six heavy ids
   (SUPERSEDED 2026-07-26 by 8f921fc - the test now asserts the inverse,
   "includes all column ids by default"; see the supersession on check 1),
   min-widths completeness vs the widened set, parseSortState over all
   fields, sortValueFor per column class, comparator empty-last both
   directions + tie-break, SORT_FIELDS completeness vs ALL_COLUMN_IDS.
   Unit-test disposition: cell components are markup + moved bodies over
   already-tested actions; code-trace coverage accepted.

### 2026-07-22 - Composed fan-out (all institutions + course multiplicity)

Context: scopes with institution "*" AND hubCourse "*"/multi-line died in
both runners with "pick one fan-out dimension", killing autonomous lecture
prep/deck runs. A course tile belongs to exactly one institution, so the
composition collapses to a course-dimension fan-out with each group's
institution derived from its tile.

1. fanout.ts: hasCourseMultiplicity(scope) extracted (hubCourse "*" or 2+
   newline-separated ids) and used by isCourseFanout AND both former guard
   sites; isComposedFanout = institution fan-out + course multiplicity;
   isCourseFanout still false when institution is "*" (public semantics
   unchanged). resolveFanoutCourses items carry institution: string | null.
   composedGroupLabel renders "<institution>: <course>" (course name alone
   when institution is empty).
2. Unattended (server-runner.ts): the rejection guard is REPLACED by a
   composed branch - courses resolved with activeInstitution null, each
   group's scope pinned via scopeForInstitution(scopeForCourse(...), tile
   institution or ""), reusing the CourseGroupOutcome loop, doneCourses
   checkpointing, deadline checks, and countOkCourses progress unchanged;
   CourseGroupOutcome gains optional institution. Zero courses resolving is
   an explicit error outcome, never a silent success. The cron route
   classifies composed runs by hasCourseMultiplicity so checkpointing keys
   on doneCourses (not doneInstitutions).
3. Attended (useWorkflowRun.ts): the validation error is replaced by
   composed entities (institution + courseId/courseName) built by the pure
   buildComposedFanoutEntities/pinComposedGroupScope helpers
   (attended-fanout.ts); the existing course-fanout UI machinery
   (stop-after-course, course outcomes) applies; RunPanel group headers show
   the composed label. Single-dimension paths are the original code verbatim.
4. Stuck-run stamping: the cron route's per-schedule catch AND
   workflow-trigger-runner's per-trigger catch now stamp
   updateScheduleRunOutcome/updateTriggerRunOutcome(..., "error", message)
   best-effort, so a post-claim throw surfaces as a failed run with detail
   instead of a permanent "started"/"Did not finish" row. Residual (out of
   scope, documented): a HARD platform kill (60s Vercel cap) inside a single
   group iteration still cannot stamp; the 10-minute "Did not finish" chip
   remains the honest surface for that case; composed/course fan-outs
   mitigate it by checkpointing at the ~50s soft deadline.
5. Tests: server-runner fan-out describes moved byte-identical to
   server-runner.fanout.test.ts (both files at or under 950; shared fixtures
   duplicated verbatim); the old rejection test is REPLACED by composed
   tests - scope pinning per group asserted via probe steps, empty
   institution "" case, multi-line + "*" composition, checkpoint resume via
   skipCourses. fanout.test.ts covers hasCourseMultiplicity/
   isComposedFanout/composedGroupLabel/institution field;
   attended-fanout.test.ts covers the pure entity builders. The route/
   trigger catch stamping is code-trace covered (exact calls quoted in the
   entry's implementing commit).

### 2026-07-22 - Source-URL TOC derivation (grounding ladder)

Context: pasting a platform URL (e.g. a uCertify course link) as kickoff
sourceMaterial produced an unaligned schedule - parseTocChapters finds no
chapters in a URL and the name-only branch forbids alignment; the platform
page itself is a login-walled SPA, so fetching cannot recover a TOC.

1. Grounding ladder in generateSchedulePlanAction: (a) pasted TOC parses ->
   aligned branch, byte-identical to before (the balancing policy text is
   the shared CHAPTER_ALIGNMENT_POLICY constant, not duplicated); (b) no
   parse AND shouldDeriveToc (URL present, or short identifier-like text,
   pure predicate in source-alignment.ts) -> deriveTocFromSource
   (course-planning-grounding.ts, a "use server" sibling re-exported via
   actions.ts) makes ONE webSearch-grounded callLlm call (the
   researchCurrentEventsAction idiom) asking for the official outline,
   parses it with parseTocChapters, and on success drives the SAME aligned
   branch with the derived TOC (original text still shown as the primary
   source); (c) derivation failure of any kind returns null and falls back
   to the name-only branch - never throws, never blocks the schedule.
2. The generate-schedule step reports the grounding tier in its summary
   notes (pasted TOC / derived TOC with chapter + source counts / name-only)
   and lists the derivation's web sources (title + URL).
3. Materials threading via output binding (no second search call):
   generate-schedule exposes a resolvedSourceMaterial output (derived TOC
   when found, otherwise the exact input text); NO_CODE_KICKOFF binds
   lecture-materials-from-schedule.sourceMaterial to that output, so the
   materials action's own parseTocChapters test sees a real TOC and takes
   its pre-existing aligned branch. Pasted-TOC and name-only tiers pass
   through byte-identical text.
4. Headless-safe: the ladder runs inside server actions (no browser APIs);
   unattended runs get identical grounding. The return type additions
   (derivedToc/derivedSources) are optional - existing callers unaffected.
5. Tests: shouldDeriveToc six cases (URL-only, URL-in-short-text, real
   multi-line TOC, long prose, empty, short citation);
   buildTocDerivationPrompt asserted directly; deriveTocFromSource tested
   with a MOCKED callLlm across success/zero-chapters/HTTP-failure/blank/
   thrown paths (all failure paths return null); step-level tests assert the
   tier notes, sources listing, and resolvedSourceMaterial fallback; a
   presets test pins the new output binding. source-alignment.test.ts grew
   27 -> 35 with the original 27 untouched.

### 2026-07-23 - Workflows deep links honor async custom defs

Context: deep links from the Automations/Drafts/Files surfaces always landed
on workflows[0] ("Announcement draft") because WorkflowsTab's selection
initializer validated ta-workflows-selected against a list that does not yet
contain the async-loaded Supabase custom defs, then persisted the fallback
over the target.

1. The initializer keeps a non-empty saved id UNVALIDATED; selectedDef's
   find-or-first fallback covers rendering until the custom defs land.
2. loadedForIdRef tracks which id values/disabledSteps reflect; the shared
   loadWorkflowFormState loader gives handleWorkflowChange (synchronous
   update, byte-identical click behavior) and the reconciliation effect the
   exact same reload semantics.
3. The reconciliation effect (cancelled-flag async idiom, no eslint-disable)
   acts only when selection drifted without a click: a resolving deep-link
   id reloads form state for the real id; a stale id falls back to
   workflows[0] ONLY after the custom load settled successfully
   (customLoaded && !customLoadFailed) - a failed load never discards the
   target. Decision logic is pure: resolveSelectionReconciliation
   (selection-reconciliation.ts, 5 tests: honored pre-load, reload on
   resolve, fallback rules incl. load-failure, no-op on match, empty list).
4. Clicking any workflow link on the Automations subtab lands on THAT
   workflow with the Automate panel open, its own saved values, and its own
   disabled-steps overlay; ta-workflows-selected now persists the deep-link
   id (never the fallback) through the async window.

### 2026-07-23 - Source-resolution policy for lecture-building steps

Context: user-configurable list/order/strategy of course-material sources
for all six lecture-building steps; previously the resolver chain was
hard-coded and the uploaded materials zip was read by no lecture step.

1. Pure model (source-policy.ts, 16 tests): SourceKind = live-lms |
   course-export | materials-zip | repo | tile-meta; SourcePolicy = ordered
   deduped subset + strategy (first-success | merge-all | until-failure);
   tolerant decode (junk/unknown -> dropped or null); DEFAULT_SOURCE_POLICY
   = live-lms -> course-export -> tile-meta, first-success - exactly the
   legacy chain, so unset/legacy values change nothing (default-equivalence
   proven in registry-helpers.sources.test.ts, 12 tests: live success,
   live-fail->export with the coupled note wording, explicit export pick,
   terminal tile-meta, no-canvasUrl no-op).
2. gatherModuleMaterials moved to registry-helpers.sources.ts (re-exported;
   registry-helpers.ts well under the 1000-line cap - 688 at the time of the
   current-module entry below) and parameterized by policy;
   per-kind gatherers include the NEW materials-zip source (newest tile zip
   via downloadCourseZipBlob + extractZipMaterialsTextAction wrapping the
   server-only office-extract, names+sizes fallback over 8 MB or on error)
   and the NEW repo digest source (tile repo via ingestRepoAction). Notes
   name every source checked in order and what it yielded; caps and
   never-hard-fail semantics preserved.
3. Input plumbing: "sourcePolicy" WorkflowValueType with a scope family
   (set once per workflow via WorkflowScopeControl; the no-per-step-prompt
   rule), SourcePolicyEditor composite (checkbox list + reorder + strategy
   select) shared by RuntimeFieldInput/LiteralEditor/scope control; value
   persists via ta-workflow-values-<id>. The "sources" input (required
   false) exists on lecture-zip, lecture-materials-from-schedule,
   prepare-lecture, lecture-qa, generate-presentation-from-template,
   draft-upcoming-lectures (registry.source-policy-input.test.ts) and is
   bound in every preset using those steps (prepare-lecture, lecture-qa,
   module-slides-from-template, weekly-lecture-deck, next-week-lectures,
   weekly-everything-prep, course-kickoff-no-code, course-refresh).
4. Step wiring: the module-materials consumers pass the decoded policy
   through; repo-driven lecture-zip treats a policy "repo" entry as its own
   repo input (noted when excluded); supplemental materials fold into
   generateLecturePlansAction / generateLectureMaterialsFromScheduleAction
   via delimited sections (optional trailing params). Headless-safe set
   UNCHANGED (canary count untouched). StepRunHelpers gained
   loadCourseMaterials in both runners.
5. Repoless lecture-zip (follow-up fix, same batch): the repo input is
   required FALSE; with a repo the pipeline is byte-identical; without one
   the step (a) errors clearly when hubCourse is also blank, (b) gathers
   via the policy, resolves the schedule from the bound input else tile
   csvData (csvToSchedule), (c) errors with the gather notes when neither
   materials nor schedule exist - NEVER a silent skip, (d) generates via
   generateLectureMaterialsFromScheduleAction + assembleLectureFiles with
   the summary labeled "Built from course sources - no repository linked"
   and an includeInstructions-inapplicable note
   (registry.lecture-zip.test.ts, incl. error paths).
6. File hygiene: course-planning.ts at 807 after moving
   buildScheduleWeekPlan/generateSlidesFromTopic to the grounding sibling
   (284); every touched file at or under 1000 lines.

### 2026-07-23 - Repoless lecture-zip schedule ladder (amends the source-policy entry)

Context: the repoless path could reach
generateLectureMaterialsFromScheduleAction with a schedule holding zero
topic-bearing weeks, surfacing its raw "No weeks with topics found in the
schedule." to the user with no guidance. (Investigation also established
that schedule-type inputs arrive as already-parsed arrays from step
bindings; JSON-string handling is defensive for literal bindings, not the
reported cause.)

1. resolveRepolessSchedule (registry/schedule-resolution.ts, pure, 6 tests)
   resolves in tiers, filtering EVERY tier to weeks with a non-empty
   trimmed topic (mirroring the action's own filter): bound schedule value
   (array, or JSON string tolerantly parsed - malformed falls through) ->
   csvToSchedule(tile.csvData) -> synthesis from the tile's topics lines
   ({ week: i+1, topic, summary: "", assignmentTitle/assignmentSlug/
   testName: null } matching ScheduleWeekPlan). Returns the winning tier's
   note plus a `tried` audit trail naming what each tier held.
2. The step never calls the action with an empty/topic-less schedule: with
   no materials AND no schedule it throws the no-content error including
   the tier audit; with materials but no topic-bearing weeks it throws
   "No weeks with topics for <course>: add a schedule with topics to the
   course tile, bind a schedule, or fill the tile's topics field" plus the
   audit. The action's own "Schedule is empty."/"No weeks with topics"
   strings never surface.
3. The winning tier's note is appended to the run summary items alongside
   the source-gather notes.
4. Repo-present lecture-zip path untouched; registry.lecture-zip.test.ts
   covers the new error message, the bound-JSON-string path, and the
   topics-synthesis path reaching the action with the derived schedule.

### 2026-07-23 - Course-level material sources + source platform URL

Context: a user selected "Live LMS connection" for weekly lecture prep and it
was silently ignored - the gatherer only acted with a module id, and the
repoless lecture-zip always passes "" - then the run failed listing ONLY
schedule tiers, with no source notes at all (the silence was the tell).

1. No silent sources: every gatherer emits at least one note whenever it
   yields no material, naming the source and the reason (the previously
   note-less live-LMS fall-through included). A live-lms policy on a tile
   with no canvasUrl produces a note saying so; the export helper explains
   an unwired loader and a missing/module-less export. ONE deliberate
   exception: the standalone course-export entry stays silent when live-lms
   already ran, because that gatherer tried the export as its own fallback
   and already reported the outcome - a note here would repeat in every
   default-policy run (pinned by the default-policy note-list test).
2. Course-level gathering when no module is selected: live-lms auto-picks
   the current week's module (reusing resolveTileCurrentWeek +
   findModuleForWeek - the same pairing steps.content-generators.ts uses)
   and gathers it with the byte-identical per-item logic; when the week does
   not resolve it digests every module's name + item titles (no page/file
   body fetches - noted). course-export digests all export modules the same
   way. Module-SELECTED behavior is byte-identical to before.
3. gatherModuleMaterials returns optional moduleNames (the gathered or
   digested module names); the repoless lecture-zip threads it into the
   schedule ladder.
4. Schedule ladder tier order: bound input -> tile CSV (with aliasing per
   check 5) -> LMS/export module names -> tile topics -> empty. The LMS tier
   maps ordered module names to weeks, dropping review/exam-style names via
   isNonContentWeekText unless filtering would empty the list (then all are
   kept, noted). Notes/`tried` audit name the winning tier and its count.
5. CSV topic aliasing lives in schedule-resolution.ts (shared csvToSchedule
   NOT modified, reusing parseCsvRows): when the CSV yields weeks but none
   has a topic, topics are read from the first present alias header among
   topics/title/subject/lesson/module/description; an exact non-blank
   "topic" column always wins; the note names the column used.
6. End-to-end guard (registry.lecture-zip.test.ts) reproduces the reported
   scenario: live-lms policy + tile with canvasUrl and modules + a CSV with
   10 topic-less weeks + blank topics field -> the step SUCCEEDS, materials
   from the LMS, weeks from module names.
7. "Source platform URL" material source: SourceKind "source-url" (label
   "Source platform URL") in ALL_SOURCE_KINDS after "course-export", so it
   appears in every checklist incl. both kickoff variants (COURSE_KICKOFF
   surfaces `sources` through its included course-refresh's lecture-zip -
   runtime bindings pass through expansion unchanged, verified by test; no
   preset wiring was needed). It resolves a URL from an explicit step hint
   (lecture-materials-from-schedule passes its sourceMaterial), else the
   tile's integrations links, else a URL in the tile's textbook, then
   derives the official outline via the EXISTING deriveTocFromSource -
   never fetching the login-walled platform page. No URL, or a null
   derivation, is a note; never throws. DEFAULT_SOURCE_POLICY unchanged
   (opt-in only). gatherModuleMaterials gained an additive options
   parameter (sourceHint); all prior call sites byte-identical.
8. No module cycle: resolveTileCurrentWeek lives in tile-week.ts because
   registry-helpers.ts re-exports the gatherers that need it;
   registry-helpers.ts imports it locally and re-exports it (import surface
   unchanged), and the only edges from tile-week.ts and
   registry-helpers.sources.ts back to registry-helpers.ts are `import type`
   (erased - no runtime cycle). A future value import there would
   reintroduce the cycle; keep them type-only.

### 2026-07-23 - Current-module control on Build lecture materials zip

Context: the lecture-zip step needed a control naming the module the course is
currently on, fillable from the "Find the current week and module" step's
output or from Workflow Scope. That step produces a NAME
("Module 05: Loops"), never a live module id, and no name-only module
encoding existed - so four supporting pieces landed with the control.

1. Module value encoding (module-value.ts): new "name|<name>" form parsing
   to { liveId: null, name, fromExport: false, byName: true } via
   nameModuleValue(); LmsModuleValue gained byName (false for every other
   form). "", "<id>|<name>", "export|<name>", and bare "<id>" parse
   BYTE-IDENTICALLY (pinned by tests) - "name|" is matched BEFORE the
   generic separator split so it cannot be read as a live id.
2. Match-by-name (registry-helpers.sources.ts findModuleByName): exact
   case-insensitive name match first, then a tolerant module-NUMBER match on
   both sides via /(?:module|week)\s*0*(\d+)/i (so "Module 05: Loops" finds
   "Module 5" or "Week 5 - Loops"). No match: a note naming the wanted
   module and up to 5 available ones, then the existing export-by-name ->
   course-level fallthrough. Never throws.
3. Sentinel guard: course-progress emits "Not started"/"Complete" instead of
   a module name; both are recognized (raw or carried inside a byName/export
   value) and produce a clear note instead of a bogus lookup, in BOTH the
   live and export gatherers.
4. course-progress gained output moduleRef (type lmsModule):
   nameModuleValue(moduleName) when in progress, the RAW sentinel otherwise
   (so check 3's guard sees it). Its moduleName text output is unchanged, so
   existing bindings behave identically. This makes the step's output a
   type-valid source for any lmsModule input (outputFeedsInput).
5. Workflow Scope covers modules: WorkflowScope.lmsModule +
   scopeFamilyForType("lmsModule") + applyWorkflowScope (rejecting "*" like
   the other scalar families) + describeWorkflowScope/describeScopeForType;
   WorkflowScopeControl renders a text control storing nameModuleValue(...)
   (a picker needs one concrete course's module list, which scope cannot
   guarantee when it targets several/all courses - the encoding is identical
   either way). Every lmsModule input (lecture-zip's new one plus
   prepare-lecture, lecture-qa, generate-presentation-from-template) is
   scope-fillable and dropped from the run form when scope sets it.
6. The control: lecture-zip input { key: "moduleId", label: "Current
   module", type: "lmsModule", required: false }; threaded into BOTH the
   repo-driven supplemental gather and the repoless gather (replacing the
   hardcoded ""). Blank = today's course-level auto-pick/digest exactly.
7. Single-week targeting: when the chosen module's name yields a week number
   matching a week in the resolved schedule, the repoless run narrows to
   that week. (The original "otherwise the full schedule is used" clause is
   SUPERSEDED by the targeted-module entry below, which synthesizes the
   module's own week instead.) Every branch emits a summary note, so a
   chosen module is never silently ignored.
8. Bindings: course-refresh's lecture-zip binds moduleId runtime with the
   shared fieldKey "moduleId" (it has no course-progress step). The
   source-policy input-count canary for lecture-zip is 8.
   CORRECTED 2026-07-26: this check originally said "both kickoff
   variants inherit it through their include of course-refresh". That
   is true of COURSE_KICKOFF but NOT of NO_CODE_KICKOFF, whose include
   skips the lecture-zip step (skipSteps includes its index - see
   presets/course-setup.ts). The inaccuracy dates from the introducing
   commit add7432 and was never a behavior regression; only this
   description was wrong.

### 2026-07-23 - A targeted module drives the lecture (never substituted)

Context: a user targeted "Module 07: Algorithms and Data Structures" and got a
Week 1 deck about "Start Here" - their Canvas course holds only a "Start Here"
module, the ladder built a one-week schedule from it, week 7 was absent, and
the code fell back to that unrelated schedule.

1. parseTargetedModule (schedule-resolution.ts, pure, exported): "Module 07:
   Algorithms and Data Structures" -> { week: 7, topic: "Algorithms and Data
   Structures" }; "Week 5 - Loops" -> { week: 5, topic: "Loops" };
   "Module 3" -> { week: 3, topic: "" }; "Algorithms" -> { week: null,
   topic: "Algorithms" }; "" -> { week: null, topic: "" }.
2. Targeted-module precedence (steps.content-lectures.ts): when the resolved
   schedule contains the targeted week, narrow to it (unchanged). When it
   does NOT, synthesize exactly one week from the module name itself
   ({ week: parsed.week ?? 1, topic: parsed.topic || the module name,
   summary "", assignment/test fields null}) and use ONLY that - the
   full-schedule fallback for a targeted module is REMOVED. A bare live id
   with no name cannot be parsed and keeps the full schedule, noted.
3. Notes: matched -> `targeted week N for module "<name>"`; synthesized ->
   `module "<name>" is not in the resolved schedule - generated week N from
   the module name itself`.
4. Front-matter filtering: isFrontMatterModuleText (source-alignment.ts, NEW
   and unit-tested; isNonContentWeekText UNCHANGED) recognizes course
   furniture - start here, welcome, orientation, getting started, syllabus,
   course information/info, resources, readme, announcements. The
   LMS-module-names ladder tier filters with BOTH predicates and keeps the
   pre-existing keep-all-if-filtering-empties safeguard; the tier note names
   which filtering applied ("non-content", "front-matter", or both).
5. Honest post-failure note: after a by-name module lookup fails, the
   course-level digest reports `module "<name>" was not found - digested N
   LMS module name(s) and item titles as course-level context (page/file
   bodies not fetched)`, and materialsSource says the same, so the digest
   can never be misread as the target module's materials. The genuinely-no-
   module wording is unchanged. (The export-side digest is reachable only
   when no module was selected, so its wording is correct as-is.)
6. End-to-end guard (registry.lecture-zip.test.ts) reproduces the report:
   targeted "Module 07: Algorithms and Data Structures" + a live LMS holding
   only "Start Here" + no CSV topics + blank tile topics -> exactly ONE deck
   for week 7 built from "Algorithms and Data Structures", never week 1 /
   Start Here.
7. Blank/unset moduleId: byte-identical to the prior behavior (the targeting
   block does not run); pinned by the existing unchanged test.

### 2026-07-23 - Unattended schedules stay server-side + stale-claim recovery

Context: a weekly schedule "didn't finish" on its automated run but completed
when run manually. Evidence: the GitHub cron is healthy (last 100 runs of
unattended-runs.yml = 9 runs, ALL success/HTTP 200; a Vercel 60s kill would
be a 504 and a FAILED action). The real cause was in-browser claiming.

1. Claim ownership: WorkflowScheduleWatcher (60s poll) previously claimed ANY
   due schedule - including unattended ones the server runner owns - and ran
   it in the tab; the cron fires only ~hourly, so the browser almost always
   won the atomic claim. A closed/navigated tab then left the row stuck at
   last_run_status "started" with next_run_at ALREADY advanced, silently
   skipping the occurrence. Now the watcher filters candidates through the
   pure shouldWatcherClaim(schedule, now, graceMs): attended rows are always
   claimable (byte-identical behavior); unattended rows are skipped UNLESS
   overdue past WATCHER_UNATTENDED_GRACE_MS (45 min), which keeps a backstop
   for a lagging or unregistered cron (this repo has seen both).
2. Stale-claim recovery: migration 20260829000000 adds recovery_attempts
   (default 0) to workflow_schedules and workflow_triggers. The cron route
   sweeps rows whose last_run_status is "started" and last_run_at is older
   than STALE_CLAIM_MS (15 min - deliberately longer than the 10-minute
   display threshold in automation-inventory-logic.ts, which is untouched,
   so a live run is never swept mid-flight). Each swept row is stamped
   "error" with a detail naming the interruption AND whether a retry was
   scheduled; the sweep is per-row try/catch so one failure cannot abort the
   tick.
3. Retry policy: schedules with recovery_attempts 0 are re-armed once
   (next_run_at = now, attempts -> 1) so the missed occurrence actually
   runs; at >= 1 no further retry is scheduled (no loops) and the detail
   says so. A successful run resets recovery_attempts to 0
   (updateScheduleRunOutcome / updateTriggerRunOutcome on "ok").
4. Triggers: the same claimed-then-abandoned window exists
   (WorkflowTriggerWatcher -> claimAndAdvanceTrigger stamps "started" then
   hands the run to the tab), so the sweep is mirrored for triggers -
   stamping only. Trigger occurrences are event-driven and their cursor has
   already advanced past the firing event, so they are deliberately NOT
   re-armed; the detail states that. Watcher-side gating is schedules-only.
5. Unchanged: claim atomicity and one-run-per-tick semantics,
   listDueWorkflowSchedules' signature/behavior (its only caller is the
   watcher), listDueUnattendedWorkflowSchedules, the Automations chip
   semantics (a swept row now reads as a failed run with an explanatory
   detail instead of a permanent "Did not finish").

### 2026-07-23 - Presentations land in Files; Presentations subtab removed

Context: user direction - every workflow-generated presentation belongs in the
Files tab, and the Drafts > Presentations subtab is retired. Previously the
deck step's PRIMARY deliverable was a presentation DRAFT (throwing on
failure) with the real .pptx only best-effort copied to Files, so a failed
copy left a draft and no file.

1. Deck step (steps.media.ts): savePresentationDraftAction is GONE from the
   step; savePresentationFileAction is the primary deliverable and THROWS on
   failure (a run can no longer "succeed" without producing the file). It
   still passes workflowName/workflowId/workflowRunId, so the Files row stays
   source-tagged. The summary names the saved .pptx and the Files library.
2. Step OUTPUTS are unchanged in shape and keys (presentationTitle, deck,
   slidesJson, slideCount, draftId - draftId now carries the Files row id),
   so "PPT deck outputs feed later steps" keeps holding; the lecture-qa wire
   and the metadata test are untouched and pass.
3. Manual PPT Design (ppt-design): its save flow writes to Files via
   savePresentationFileAction instead of creating a draft; button and
   success/error copy say Files. The tab's other pre-existing direct
   save-to-Files button is unchanged (both destinations are now Files).
4. Nav: DraftsView is "grades" | "messages"; the Presentations chip and
   render branch are removed and PresentationDraftsTab.tsx deleted
   (git-recoverable); a persisted ta-drafts-view of "presentations" migrates
   to "grades" so a stale value never lands on a dead view.
5. Badge accounting: DraftedGradesInbox no longer counts presentation
   drafts (countPendingPresentationDrafts removed from workflow-support.ts -
   its only consumer was that badge; grep-confirmed); the draftsInbox
   aggregate on the Workflows tab is grades + messages.
6. Data safety (explicit): the presentation_drafts table, lib/presentation-
   drafts.ts, savePresentationDraftAction, and the Supabase types are
   RETAINED and untouched - no drop, no row deletion, no migration. Existing
   drafts remain readable programmatically but have no UI surface; they were
   also largely copied to Files already by the old best-effort path, so no
   backfill was run (it would duplicate them).
7. Run-level test (registry.generate-presentation-from-template-run.test.ts)
   asserts the Files save receives the workflow ids, the outputs are
   populated, the summary names the Files library and not Drafts, and that a
   Files-save failure makes the step throw.

### 2026-07-23 - Course modality (async/sync) column + step gating

Context: user request - a Courses-table column saying whether a course is
async or sync, usable as a condition on whether steps run. Step gating
(runIf) already existed; this only adds boolean sources for it.

1. Data: Course/CourseInput/CourseRow carry modality ("async" | "sync" |
   null; null = not set, never defaulted). Migration
   20260830000000_course_modality.sql adds course_hub.modality text null in
   the established `alter table if exists ... add column if not exists`
   form. courses-tab-helpers' CourseForm/EMPTY_FORM/formFromCourse/
   courseToInput carry it too, so full-input round-trip updates never blank
   it.
2. Column: ColumnId "modality" sits after "institution" with label
   "Modality", a COLUMN_MIN_WIDTHS entry, membership in
   DEFAULT_VISIBLE_COLUMNS, a sortValueFor text case (unset sorts last), and
   a computeFieldPatch case mapping "" to null. The cell is EditableCell's
   NEW "select" kind (options Not set / Asynchronous / Synchronous) - chosen
   over a bespoke cell because the editor needs no async data (unlike
   LmsCell); saving flows through the existing saveField/computeFieldPatch
   path, so failed-save-keeps-the-editor-open still holds. AddCourseForm
   offers the same select.
3. Persisted-column-set VERSIONING (without this a new column can never
   appear for an existing user): ta-courses-columns now stores
   { v: CURRENT_COLUMNS_VERSION, columns: [...] }; parseColumnSet accepts
   the legacy bare array as v0 and unions in every column listed in
   COLUMNS_ADDED_IN for versions greater than the stored one. Unknown ids
   are still dropped, the legacy count-id migrations still apply, and a
   malformed value still falls back to DEFAULT_VISIBLE_COLUMNS.
4. Gating sources: load-course-tile gains outputs modality (text), isAsync
   (boolean), isSync (boolean) with its EXISTING outputs unchanged; a new
   headless-safe step "course-modality" (Course modality; input hubCourse;
   the same three outputs) lets any workflow gate without restructuring. An
   unset modality yields "" / false / false - a gate on an unclassified
   course is false for BOTH directions, never silently true.
5. Because the builder's "Run only if" control enumerates earlier steps'
   boolean outputs, these appear automatically; runIf itself (types.ts,
   server-runner evaluation, include remapping) is UNCHANGED.
6. Registration seam: steps.course-setup.ts hand-indexes each domain
   module's array (courseSetupTilesSteps[n]) rather than spreading it, so a
   new step must be appended there or it is silently unreachable despite
   being defined. The headless canary is 131 (was 130).
   SUPERSEDED 2026-07-26: the canary went to 132, bumped by the
   "castletop-workbook" step (see section 56 check 19), then on to 134 as
   further headless-safe steps were registered. The canary count is
   a moving target by design - each new headless-safe step bumps it in the
   same commit; what must hold is not any specific number recorded in this
   document but that the assertion and the test title agree and that the
   count matches HEADLESS_SAFE_STEP_TYPES.size (currently 134, in
   headless.test.ts).

### 2026-07-23 - Professional workflow file names

Context: user request - workflow-produced files need professional,
descriptive, concise names. The tree carried epoch timestamps
(`..._1753280000000.txt`), a raw database id (`<drop.id>-grades.csv`),
underscore-mashed names, and lowercase-hyphen grade exports.

1. One convention, one pure module (src/lib/workflows/file-names.ts, 16
   tests): buildWorkflowFileName({ course?, artifact, qualifier?, date?,
   ext }) joins present parts with " - " as
   "<course> - <artifact> - <qualifier> - <YYYY-MM-DD>.<ext>".
   sanitizeFileNamePart strips filesystem-illegal characters and control
   chars and collapses whitespace/underscores; courseFileLabel prefers a
   non-empty Course.courseCode over a WORD-BOUNDARY-shortened name; the
   total is capped at 100 chars, truncating the QUALIFIER (never the
   extension). Pure and deterministic; absent parts are omitted.
2. NEVER emitted any more: epoch timestamps, raw database ids,
   underscore-mashed names. Dates are ISO and appear only where the
   artifact recurs (current events, grade exports); per-week/module
   artifacts carry the week/module as the qualifier.
3. Applied at every producing site: current events, cartridge + single
   grade exports, lecture script/lesson plan/slides/narration, lecture
   Q&A, study guide, module lecture deck, class openers (zip + items),
   assembleLectureFiles' per-week set AND its zip, homework answers, the
   schedule CSV default, course-setup storage and materials/syllabus.
   A user-supplied filename input remains an override - only defaults
   changed.
4. Consistency invariant fixed in passing: assembleLectureFiles previously
   downloaded "<base>.zip" while saving the bundle as bare "<base>";
   download, library save and course-tile save now share ONE built name at
   every site.
5. Unchanged: extensions and MIME types at every site (so the Files tab's
   extension normalization, stripMatchingExt and preview strategies keep
   working), workflow tagging (workflowId/workflowName/workflowRunId), and
   file CONTENTS.
6. Out of scope (documented, not an omission): steps.lms-export.ts and
   steps.media.ts carry their own ad-hoc sanitizers tied to Common
   Cartridge display titles; they were not part of the surveyed offender
   set and were left untouched.

## 52. Pull repos from org (Student repos cell)

Acceptance criteria (a20fd09+):
1. StudentReposCell shows a "Pull repos from org" button (secondary,
   matching linkButton idiom) plus an optional "Name filter" text field.
   On click it calls listOrgReposAction with the tile's githubOrg; if
   githubOrg is empty the button is disabled with a visible hint.
2. Merge semantics (mergeOrgReposIntoStudentRepos): existing rows
   preserved verbatim, new org repos appended as unassigned rows
   (student blank), case-insensitive dedup (both directions), dedupe
   within incoming list. Unit-tested.
3. Pull populates the editor draft only (not auto-saved); user must
   still click Save. Cancel discards the pull along with any other
   unsaved edits - consistent with existing cell semantics.
4. Error handling: action errors surface inline (danger color), busy
   flag always cleared. Zero-result shows a note (not an error). On
   success shows "Added N repos (M already listed)." count feedback.
5. No new server action needed (reuses listOrgReposAction).

## 53. Folder-per-module grading (batch-grade-repos-to-draft)

Acceptance criteria (cb76e74+):
1. ingestRepo gains pathPrefix opt: when set, only files under that
   prefix are ingested. gradeRepoAction gains a matching pathPrefix
   param, threaded through. Both are backwards compatible (omit =
   whole repo).
2. Folder-per-module mode (default, no instructionsRepo): for each
   student repo, discovers the top-level folder matching the week
   regex, reads its README.md as instructions, synthesizes a rubric
   (cached across students with identical READMEs), and grades only
   that folder via pathPrefix.
3. Shared-instructions mode (instructionsRepo provided): existing
   behavior preserved as fallback - shared instructions + rubric
   applied to all students.
4. Students without a matching folder are skipped with a note, not
   thrown. Progress messages show student and folder name.
5. Draft assembly (GradingRunEntry shape, saveGradingDraftAction call)
   is unchanged - the grading panel, Canvas posting, and grade export
   flows are unaffected.

## 54. Topic Outline column and source kind

Acceptance criteria (196c1e8+):
1. New topic_outline text column on course_hub (migration
   20260831000000). Course/CourseInput/CourseRow types updated.
   COLUMNS select string includes topic_outline; toCourse/toRow map it.
2. Courses table: topicOutline added to ALL_COLUMN_IDS,
   DEFAULT_VISIBLE_COLUMNS, COLUMN_MIN_WIDTHS (260px), sortValueFor,
   COLUMN_LABELS ("Topic Outline"), computeFieldPatch (coerces empty
   to null). Column version bumped to 3; COLUMNS_ADDED_IN[3] unions
   it into existing persisted sets.
3. CourseRow renders a multiline EditableCell with placeholder
   "Paste topic outline from Cengage, uCertify, etc." and truncated
   display (80 chars).
4. New "topic-outline" SourceKind in source-policy.ts (added to
   SourceKind union, ALL_SOURCE_KINDS, SOURCE_KIND_LABELS). Gatherer
   in registry-helpers.sources.ts reads tile.topicOutline; returns
   the outline text when set, a "no topic outline" note when empty.
5. Existing source kinds, strategies, DEFAULT_SOURCE_POLICY, and the
   gather switch are unchanged. The new kind only fires when selected
   in the source policy editor.

## 55. Generate course schedule: source policy input

Acceptance criteria (d0e4b35+):
1. generate-schedule step gains a `sources` input (type sourcePolicy,
   optional). SourcePolicyEditor renders automatically for it. Workflow
   scope's sourcePolicy fills it via applyWorkflowScope when blank.
2. Runtime priority chain: explicit sourceMaterial text (always wins)
   > source policy gatherers (gatherModuleMaterials course-level with
   empty moduleIdRaw) > tile textbook fallback > nothing. Course tile
   loaded once and cached across both policy and textbook branches.
3. Gather notes appended to the step's summary notes under "Source
   resolution:" when the policy branch fires.
4. COURSE_KICKOFF and NO_CODE_KICKOFF presets bind `sources` to
   `{ source: "runtime", fieldKey: "sources" }` on their
   generate-schedule steps.
5. Existing sourceMaterial free-text input preserved. Existing
   alignment check (pasted TOC / derived TOC / name-only) works
   unchanged on whatever sourceMaterial was resolved.
   resolvedSourceMaterial output passes the resolved value forward.

## 56. Castletop workload workbook (column, button, workflow step)

Acceptance criteria (8d7af88+):

Workbook format (src/lib/castletop.ts, src/lib/castletop-plan.ts):
1. buildCastletopWorkbook emits the Castletop credit-hour worksheet:
   A1 title "<courseCode> <name>, <instructor>"; merged group headers
   C2:E2 "Pre class work", F2:G2 "In class work", H2:I2 "After class
   work"; row-3 column headers with C3 filled FFFFFF99; K3 holding the
   contact-minute divisor (default 50).
2. Per content row: E = (B/D)*60 when qty and rate are present,
   K = G/$K$3, L = (E+I)/$K$3, M = L+K. Per week total row:
   K/L/M = SUM over the block, N = M. Grand totals sum the week total
   rows in REVERSE order; M = SUM(N4:N<last+2>); Average = grand/weeks.
3. Calibri 11 throughout, accounting number format on numeric cells,
   fixed column widths (A 3.71 ... K 8.29), freeze pane at ySplit 3,
   week label merged down each block including its total row.
4. The three work columns are PARALLEL LISTS indexed independently per
   row - not aligned records.
5. An empty weeks array emits the header only and skips the
   grand-total block (no formula over an empty set).
6. Provenance (NOT machine-checkable here - no reference workbook is
   committed, deliberately: the only real sample is a user's own course
   data). During development the generated output was compared against a
   real Castletop file and its formula semantics reproduced that file's
   Week-1 per-row values and all three week totals to 1e-9, with header
   text, merges, fill, number format and column widths matching exactly.
   What a regression run CAN check is checks 1-5 above: the committed
   tests in castletop.test.ts read the produced workbook back and assert
   the literal formula strings, so any drift in those formulas fails.

Week bucketing (src/lib/castletop-sources.ts):
7. Assignments are placed by name-number match
   (/(?:module|week|unit)\s*0*(\d+)/i) first, then by due-date
   arithmetic from startDate, else reported unplaced.
8. Date parsing accepts BOTH a bare YYYY-MM-DD and a full ISO
   timestamp (Canvas due_at is always a full timestamp). An
   unparseable date is reported as unplaced and must NOT increment the
   due-date count. No non-finite value may ever become a week key.
9. A brief whose name matches an existing item (case-insensitive,
   trimmed) fills in that item's missing points instead of duplicating.
10. Schedule-derived items default to 60 minutes (assignment) and 30
    minutes (test). These are NOT the contact-minute divisor or the
    class-session length - wiring those in is a regression.

Generation action (src/app/actions/castletop.ts):
11. Weeks ladder: tile.weeks (positive integer) -> schedule length ->
    16. Zero and negative tile.weeks are treated as unset.
12. The action RETURNS the weeks it used. No caller may recompute it -
    the step's reported count must always equal the workbook's real
    week-label count.
13. LMS enrichment is attempted only when the tile has both lms and
    canvasUrl, and is non-fatal: an error or a throw becomes a note and
    generation still succeeds.
14. File name via buildCastletopFileName (src/lib/castletop-plan.ts), NOT
    buildWorkflowFileName: "<instructor, file-as>_<course code>_<course
    name>_Castletop.xlsx", underscore-separated and including the FULL
    course name. Blank parts are omitted (no doubled/trailing
    underscores); "Castletop" is always present, so the floor is
    "Castletop.xlsx". The instructor part prefers instructorFileAs (e.g.
    "Loring, William") and falls back to instructor (e.g. "William A
    Loring") when instructorFileAs is blank - a DIFFERENT form of the
    name than the A1 title, which always uses instructor. Deliberately
    carries NO date: one Castletop file per course per term, and
    appendCourseCastletopFile dedupes by name so regenerating REPLACES
    the previous file instead of accumulating dated copies. Capped at
    150 chars total, truncating the course name at a word boundary
    first (never the extension or the "Castletop" suffix) when over.

Column and cell:
15. castletop_files is a jsonb column written ONLY by its dedicated
    writers (appendCourseCastletopFile / removeCourseCastletopFile) -
    toRow never writes it, so updateCourse cannot clobber it.
16. Column id "castletop" is registered in ALL_COLUMN_IDS,
    DEFAULT_VISIBLE_COLUMNS, COLUMN_MIN_WIDTHS, sortValueFor (count),
    COLUMN_LABELS; COLUMNS_ADDED_IN[4] = ["castletop"] so the column
    appears for existing persisted column sets.
    SUPERSEDED 2026-07-26 as to the version number only: this check
    originally read "CURRENT_COLUMNS_VERSION is 4", then 5 (section 60
    check 1), then 6 (section 62 check 1). The version is a moving target
    by design - each new column bumps it (now 7). What must hold is not
    any specific number recorded in this document but that
    COLUMNS_ADDED_IN[4] still lists "castletop" and that every prior
    version's entry is retained, so a set persisted at ANY earlier
    version still unions in every column added since.
17. CastletopCell shows the generated files with Download/Remove and a
    Generate button that runs the action, uploads via uploadCourseFile
    ("xlsx"), appends to the column, and deletes any replaced object.
    Its config controls persist to localStorage per course.
18. uploadCourseZip still delegates to the generalized uploadCourseFile
    - all pre-existing zip callers unchanged.

Workflow step:
19. Step "castletop-workbook" is registered in the course-setup
    aggregator, CATEGORY_MEMBERS, and HEADLESS_SAFE_STEP_TYPES; the
    canary asserted 132 and its title matched at the time this step was
    added.
    SUPERSEDED 2026-07-26: the canary has since moved to 134 (see section
    50 check 6 - it is a moving target by design, so treat
    HEADLESS_SAFE_STEP_TYPES.size / headless.test.ts as the source of
    truth rather than the number recorded here).
20. The step's browser download is guarded by
    `typeof document !== "undefined"` - this is what makes it
    headless-safe.
21. The step saves to the CASTLETOP column via
    helpers.saveCourseCastletopFile (implemented in BOTH the browser
    runner and the headless server runner), never to materialsFiles,
    and also to the Files tab with workflow tagging. A Files-tab error
    or a null helper is a note, not a failure.

## 57. Castletop finishes every kickoff / refresh workflow

Acceptance criteria (2235ab1+):
1. `castletop-workbook` is the FINAL step of `COURSE_REFRESH`, with all
   seven of its inputs bound (hubCourse, instructor, instructorFileAs,
   contactMinutes, readingRate, pagesPerChapter, classSessionMinutes).
   An unbound input never reaches the run form, so a binding-completeness
   test derives the expected key set from the step definition itself
   rather than a hardcoded list.
2. `COURSE_KICKOFF` and `NO_CODE_KICKOFF` contain NO direct
   `castletop-workbook` step. Both END by including `course-refresh`, so
   they inherit it exactly once; adding it directly would run it twice.
3. CORRECTED 2026-07-27: this check asserted that `COURSE_KICKOFF`'s last step
   remains the `include-workflow` -> `course-refresh` entry. Commit 5926e32
   appended `populate-lms-from-class-template` after it (see entry 75), so the
   include is no longer last and this check had been failing silently since
   then. The requirement it was protecting still holds in the form that
   matters: `COURSE_KICKOFF` still ENDS BY INCLUDING `course-refresh` exactly
   once (presets/course-setup.ts, the include-workflow step), so the Castletop
   workbook is still inherited rather than duplicated. What follows the include
   is the class-template LMS population step, which creates no Castletop work.
   Assert the include is present and singular - not that it is the final entry.
4. Known and deliberate: in `NO_CODE_KICKOFF`, `integrate-source-into-lms`
   runs AFTER the include, so the Castletop is second-to-last there and
   does not reflect pages/assignments that step creates. Recorded in a
   code comment and in that preset's description. Not "fixed" by
   reordering, which would shift the include's remap stepIndex refs.
5. All three preset descriptions state that the run finishes by
   producing the Castletop workbook.

## 58. Artifact template store (foundation for course artifact templates)

Acceptance criteria (2235ab1+):
1. ONE table `artifact_templates` with a `kind` discriminator
   (assignment | test | discussion | quiz | class-session) plus a jsonb
   `spec` - not five tables. Owner-only RLS, mirroring `deck_templates`.
2. `src/lib/artifact-templates/types.ts` and `presets.ts` are PURE - no
   I/O, no Date, no randomness. Ids and timestamps are caller-supplied,
   which is why `emptyArtifactTemplate` / `duplicateArtifactTemplate`
   take an id parameter.
3. `coerceAssignmentSpec` is defensive against untrusted jsonb: null,
   undefined, a string, an array, a number, `{}`, and out-of-union
   enum values ALL yield the documented defaults without throwing.
   `deliverables` keeps only non-blank strings.
4. `duplicateArtifactTemplate` deep-clones `spec` - mutating the copy
   must never affect the original.
5. Preset ids start with `preset-`; `upsertArtifactTemplate` and the
   save/delete actions REFUSE them (presets are code, not rows).
6. `getArtifactTemplateAction` resolves over `[...presets, ...userRows]`
   by id FIRST then case-insensitive name, so a workflow can bind a
   template by a human name.
7. `mapArtifactTemplate` routes coercion by kind; an unknown or
   malformed kind yields `{}` rather than fabricated structure.
8. Only the assignment spec is designed; the other four kinds are
   placeholders pending their own kickoffs.

## 59. Database type shape: Expand<> + Relationships

Acceptance criteria (2235ab1+):
1. `src/lib/supabase/types.ts` wraps every table's Row/Insert/Update in
   `Expand<T> = { [K in keyof T]: T[K] }` and gives every table entry
   `Relationships: []`. This is what makes `.insert`/`.upsert`/`.update`
   typecheck without `as any`: postgrest-js requires each table to
   satisfy `GenericTable`, and named interfaces lack the implicit index
   signature that a mapped type provides.
2. **`Expand<T>` MUST remain identity-preserving.** Optional fields stay
   optional, required stay required, and value types are unchanged.
   Verify by type-probe: a minimal `course_hub` Insert literal with only
   the required keys must compile, omitting a required key must error,
   and `Row["weeks"]` must accept `number`/`null` and reject a string.
   A regression here would silently make every Insert all-required or
   all-optional, and existing `as any` call sites would NOT catch it.
3. `types.ts` has ZERO runtime exports - it is type-only, so this
   carries no runtime effect.
4. The ~150 Row/Insert/Update interfaces in types.tables-a/-b are
   untouched by this mechanism.

## 60. Syllabus template column + Generate button

Acceptance criteria (2235ab1+):
1. New per-course `syllabus_template_id` column, surfaced as the
   `syllabusTemplate` table column (introduced at version 5,
   `COLUMNS_ADDED_IN[5] = ["syllabusTemplate"]`). Unlike the file
   columns it IS written by `toRow` and IS carried by `courseToInput` -
   it is a plain scalar the user edits inline.
   SUPERSEDED 2026-07-26 as to the version number only: `COLUMNS_ADDED_IN[5]`
   is unchanged, but `CURRENT_COLUMNS_VERSION` is a moving target by design
   (now 7, see section 56 check 16) and has moved past 5 - "version 5" names
   when this column was introduced, not the current version.
2. `SyllabusTemplateCell` selects from the user's syllabus templates,
   loaded via a 4th `listSyllabusTemplatesAction()` element in
   `useCoursesData`'s Promise.all and threaded through CoursesTable ->
   CourseRow.
3. The Syllabus cell's Generate button is disabled with an explanatory
   title + hint until `syllabusTemplateId` is set.
4. Generation REUSES the existing `generateCourseSyllabusAction` - a new
   caller, not a new generator. Facts come from the row via the pure
   `buildSyllabusFactsFromCourse`; `email` and `lmsUrl` come from the
   institution's fields and, when blank, are reported in a note rather
   than silently producing a thinner document (the generator leaves
   those template paragraphs untouched).
5. **`createFinalizedSyllabusAction` does NOT write
   `course_hub.syllabus_id`** (unlike `uploadSyllabusAction`, which does
   it server-side). So the Generate flow MUST persist the link itself
   via the cell's `onSave` before calling `onUploaded` - otherwise the
   UI shows a linked syllabus that reverts on refresh.

## 61. courseToInputPayload carries every Course field

Acceptance criteria (2235ab1+):
1. `courseToInputPayload` (registry-helpers.ts) must carry EVERY
   `Course` field except a named, commented exclusion list (`id`,
   `updatedAt`, and the dedicated-writer-only file/zip fields).
   Omission is NOT neutral: `toRow`'s `clean()` maps `undefined` to
   `null`, so a missing string field WIPES that column.
2. Regression fixed here: the function previously omitted `modality`,
   `topicOutline`, `syllabusTemplateId` and `hiddenTiles`. It has six
   call sites including `starter-materials`, which `course-refresh`
   includes and both kickoffs include in turn - so every Kickoff and
   Refresh run silently erased the tile's Modality, Topic Outline and
   Syllabus template. Topic Outline is also a registered source kind, so
   the loss silently degraded downstream lecture/schedule generation.
3. `hiddenTiles` was NOT wiped (toRow yields `undefined` for arrays and
   JSON.stringify drops undefined keys before the request), but it is
   carried now for completeness.
4. A drift-proof test derives the checked key set from a fully-populated
   `Course` fixture rather than a hardcoded list, so a future `Course`
   field that is neither carried nor consciously excluded FAILS. Verified
   by sabotage: removing any single carried field fails the test.

## 62. Group A course columns (end date, breaks, due rule, email, client)

Acceptance criteria (5dfb38a+):
1. Five columns in ONE migration and ONE version bump:
   `end_date`, `breaks`, `assignment_due_rule`, `email`,
   `email_client`. Column ids `endDate`, `breaks`, `assignmentDue`,
   `email`, `emailClient`; version 6 with
   `COLUMNS_ADDED_IN[6]` listing all five.
   SUPERSEDED 2026-07-26 as to the version number only: `COLUMNS_ADDED_IN[6]`
   still lists exactly these five ids, but `CURRENT_COLUMNS_VERSION` is a
   moving target by design (now 7, see section 56 check 16) and has since
   advanced past 6 - "version 6" names when these five columns were
   introduced, not the current version.
2. **`breaks` is ANNOTATION ONLY.** It must never shift week
   numbering. `weekDeadline`, `resolveTileCurrentWeek`,
   `courseProgressStatus` and the Castletop week blocks are untouched
   by it. A change that makes a break shift weeks is a regression.
3. `assignmentDueRule` is a RECURRING RULE stored as one encoded
   string `"<day>|<HH:MM>"` (e.g. `"sun|23:59"`), not per-week dates.
   The column id (`assignmentDue`) and the Course field
   (`assignmentDueRule`) deliberately differ, like
   `syllabusTemplate`/`syllabusTemplateId`.
4. `parseAssignmentDueRule` rejects, returning null and never
   throwing: blank, whitespace, missing separator, unknown day, hour
   > 23, minute > 59, and a malformed minute (`"9:5"`). It accepts a
   case-insensitive day (`"SUN"`) and normalizes a single-digit hour
   (`"9:05"` -> `"09:05"`).
5. `describeAssignmentDueRule` renders 12-hour correctly at BOTH
   edges: `"wed|12:00"` -> "Wednesdays at 12:00 PM" and
   `"fri|00:00"` -> "Fridays at 12:00 AM". Naive conversion yields
   "0:00 PM"/"0:00 AM" here - that is the regression to catch.
6. The cell defaults to Sunday 23:59, matching the deadline the app
   already hardcodes, so an untouched course behaves as before.
7. All five fields are carried by BOTH `courseToInput` AND
   `courseToInputPayload` - omission wipes the column (section 61).
8. Deliberately NOT done in this group: making `weekDeadline` and its
   three call sites consume the rule, and calendar sync.

## 63. Syllabus generation in every kickoff / refresh workflow

Acceptance criteria (5dfb38a+):
1. **The template precedence rule lives in ONE place:**
   `resolveSyllabusTemplateId(courseTemplateId, institutionFields)` in
   `src/lib/syllabus-facts.ts`, returning
   `{ templateId, source: "course" | "institution" | "none" }`.
   The per-course `syllabusTemplateId` column wins; the institution's
   `syllabusTemplate` field is the fallback; a whitespace-only course
   value falls through rather than winning.
2. **Both callers use that helper** - `starter-materials`
   (steps.course-setup.materials.ts) and the `generate-syllabus` step
   (steps.syllabus.ts). Neither may re-implement the ladder. Verified
   by sabotage: flipping the precedence inside the helper fails tests
   in BOTH call sites, not just the helper's own.
   This was a real defect - the rule was duplicated verbatim and the
   `starter-materials` copy had NO test, despite being the path that
   actually generates the syllabus on a normal run (the new step
   short-circuits when one already exists).
3. `starter-materials` keeps its `!syllabusId` gate and distinguishes
   its note by the resolved `source`.
4. New `generate-syllabus` step: `hubCourse` required, `regenerate`
   boolean (default off). Skips with the existing id when a syllabus
   is linked and `regenerate` is off; throws when no template resolves
   anywhere; notes (never throws) blank institution email/LMS URL and a
   failed tile-link. Headless-safe; canary is 133.
5. Appended to `COURSE_REFRESH` ONLY, immediately before
   `castletop-workbook` (so the Castletop stays last). Both kickoffs
   inherit it exactly once through their include - a direct copy in
   either would double-run it.
6. Facts come from the shared pure `buildSyllabusFactsFromCourse` - no
   caller re-implements the 12-key mapping.

## 64. Upload a syllabus template from its column

Acceptance criteria (5dfb38a+):
1. The Syllabus template cell's editor uploads a `.docx` via the
   existing `createSyllabusTemplateAction` (which already enforces the
   extension and a ~6 MB cap) - a new caller only.
2. Because that action RETURNS the created template, no list reload is
   needed: the new template is handed to the parent, appended to the
   shared list (deduped by id), and appears in the dropdown.
3. The upload sets the cell's PENDING selection but does NOT auto-save.
   The user still presses Save - matching every sibling cell, and
   keeping "add a template to the library" and "use it for this course"
   as separate intents. Cancel leaves the template in the library
   unlinked.
4. `templateNameFromFileName` strips only the LAST extension and never
   returns empty: `"Fall 2026 v1.2.docx"` -> `"Fall 2026 v1.2"`,
   `".docx"` -> `".docx"`, `"template"` -> `"template"`, and
   surrounding whitespace is trimmed.

## 65. Course calendar sync (Group B)

Acceptance criteria (6ea6505+):

Safety - the target is the user's OWN "Adjuncting" calendar:
1. Every event the sync writes carries private properties
   `taCourseId` / `taKind` / `taKey`. It finds its own work by querying
   `taCourseId` and may touch ONLY those events.
2. An existing event with a missing or unrecognised `taKey` is LEFT
   ALONE and counted as `skippedUntagged` - NEVER deleted. Enforced in
   two independent places (the action filters before diffing, and
   `diffPlannedEvents` also refuses), sharing one
   `isRecognizedEventKey` predicate.
3. `resolveCalendarTarget` NEVER falls back to `primary`. A missing
   calendar returns `calendar-not-found` with a message listing the
   writable calendars actually found; no token returns `not-connected`.
   Falling back would scatter course events through personal ones.
4. The sync never wipes or rebuilds a calendar.

Correctness:
5. Google all-day `end` is EXCLUSIVE - the term event adds one day to
   `endDate` or the final day silently vanishes.
6. Missing `classLengthMinutes` SKIPS all class meetings with a note.
   No invented default - the user chose to specify it per course.
7. Derived test dates state in the description that they are derived.
   `Course.tests` is only a count; there is no stored test-date source,
   so the event must not imply authority it lacks.
8. `breaks` is annotation-only here too: events are NOT skipped for
   break weeks; a note records that breaks are not applied.
9. Partial success: per-event catch, keep going, report real counts
   plus per-failure notes (capped, with a "+N more"). Deliberately NOT
   the fail-fast Canvas precedent, which abandons its loop and orphans
   what it created.
10. `dryRun` returns counts without writing.
11. Pagination is followed on BOTH calendarList and events.list -
    silent truncation would report "calendar not found" for a calendar
    that exists.
12. `deleteCalendarEvent` treats HTTP 404 AND 410 as success, so a
    re-sync converges instead of erroring on an already-deleted event.
13. `createCalendarEvent` defaults preserve the pre-existing
    meeting-booking behavior exactly: `calendarId` "primary" and
    `withMeet` TRUE when omitted. Course sync passes `withMeet: false`
    so class meetings never get phantom Meet rooms.

## 66. weekDeadline consumes the per-course due rule

Acceptance criteria (6ea6505+):
1. **ONE implementation.** `weekDeadline(start, week, rule?)` delegates
   to `dueDateForWeek(start, week, rule ?? { day: "sun", time: "23:59" })`.
   There must never be a second copy of this derivation - this file's
   history contains five instances of a duplicated rule drifting.
2. Backward compatible: with no rule argument the result is IDENTICAL
   to the historical Sunday 23:59 behavior. Pinned by an equivalence
   test across all seven term-start weekdays and weeks 1-20.
3. All three call sites pass the tile's rule:
   `lms-assignments`, `assign-week-deadlines`, and the cartridge
   export. `parseAssignmentDueRule` returns null for blank/malformed
   input and null means "use the default", so no call site branches.
4. **`assign-week-deadlines` resolves the rule PER COURSE, inside its
   loop.** It runs over a hubCourseList; hoisting the resolution out
   makes every course silently inherit the first course's due day.
   Pinned by a two-course test with different rules - verified by
   sabotage to fail ("expected 3 to be 5") when hoisted.
5. A summary note names the applied rule only when one is set; no note
   when behavior is unchanged.

## 67. parseDayTime parses concatenated day codes

Acceptance criteria (6ea6505+):
1. Concatenated forms yield EVERY day: `MW` -> {Mon,Wed},
   `MWF` -> {Mon,Wed,Fri}, `TTh` -> {Tue,Thu}, `TR` -> {Tue,Thu},
   `MTWRF` -> all five, `SU` -> {Sun}, `SA` -> {Sat}.
   Regression fixed here: the tokenizer previously matched at most ONE
   code per whitespace-separated token, so `MW 10:00-11:15` - the
   app's own placeholder in the Day/Time cell - yielded Monday only.
   Class-meeting sync and `schedule-lecture-announcement` both silently
   lost days.
2. **Spelled-out names must NOT regress.** A full day-name match (first
   three letters against SUN/MON/TUE/WED/THU/FRI/SAT) is tried BEFORE
   the concatenated-code scan, because scanning `FRI` would match F
   (Friday) then R (Thursday). `FRI` -> {Fri} and must NOT contain Thu;
   `Mon Wed Fri` -> exactly {Mon,Wed,Fri}.
3. Separator forms still work: `M/W/F`, `M, W, F` -> {Mon,Wed,Fri}.
4. Time parsing is unchanged, including the documented
   `hour <= 7 && no meridiem -> PM` rule.
5. Deliberate behavior change on the record: this corrects
   `schedule-lecture-announcement` for MW/TTh courses, which had been
   scheduling only their first day.

## 68. Misc files column (Group C)

Acceptance criteria (d5fdffa+):
1. Per-course `misc_files` jsonb column holding arbitrary supporting
   files, stored in SUPABASE. Google Drive was explicitly ruled out by
   the user; no Drive scope or client exists and none may be added.
   The Google OAuth scopes stay calendar-only.
2. **File columns are DEDICATED-WRITER-ONLY.** `miscFiles` appears in
   `Course`, the `COLUMNS` select, the private `CourseRow`, `toCourse`,
   and its own append/remove writers - and NOWHERE ELSE. It must stay
   absent from `CourseInput`, from `toRow`'s returned object, from
   `courseToInput`, and from `courseToInputPayload`, exactly like
   `materialsFiles` / `castletopFiles` / `exportFiles`. Adding it to
   any of those makes `updateCourse`'s full-input round-trip wipe the
   column on every unrelated save.
   Note this is the EXACT INVERSE of the rule for scalar columns
   (section 61), which must appear in both carriers or they get wiped.
   Same files, opposite rules - do not "fix" one into the other.
3. `registry-helpers.courseToInputPayload.test.ts` lists `miscFiles` in
   its `EXCLUDED_COURSE_KEYS` allowlist with the dedicated-writer
   rationale, so the drift-proof test treats the omission as
   deliberate rather than failing on it.
4. Column id `miscFiles`, version 8 with
   `COLUMNS_ADDED_IN[8] = ["miscFiles"]`; a count column in
   `sortValueFor`; no `computeFieldPatch` case (not inline-editable).
5. `MiscFilesCell` accepts ANY file type (no accept filter), caps at
   50 MB matching MaterialsCell, and on a name collision deletes the
   replaced storage object returned by the append action.
6. `storageExtFromFileName` takes only the LAST extension and never
   returns empty: `"notes.tar.gz"` -> `"gz"`, `"a.PDF"` -> `"pdf"`,
   `"README"` / `".hidden"` / `"x."` / `""` -> `"bin"`, whitespace
   trimmed. A leading dot is not an extension.

## 69. Assignment template step (Group D, D1)

Acceptance criteria (uncommitted, Group D):
1. `assignmentTemplate` is a runtime step-input type wired at ALL EIGHT
   points: `WorkflowValueType` + `LITERAL_CAPABLE_TYPES`
   (`workflows/types.ts`), the loader in `useWorkflowOptions.ts`, the
   picker in `RuntimeFieldInput.tsx`, the builder picker in
   `builder/LiteralEditor.tsx`, `BuilderPickerData` in
   `builder/builder-shared.ts`, all THREE `optionsForFields` sites in
   `RunPanel.tsx`, the two keys in `WorkflowsTab.tsx`, AND the
   `fieldTypes` allowlist array in `useWorkflowRun.ts`. Dropping the
   allowlist entry makes required-field validation silently skip the
   field; dropping a `RunPanel` site makes the picker render empty in
   that panel only.
2. `generate-assignment-from-template` turns a saved assignment
   template into a handout `.docx`, a grading rubric, and - only when
   `postToCanvas` is on - an UNPUBLISHED Canvas assignment draft. It
   never publishes.
3. Failure policy: template resolution and assignment generation are
   FATAL (throw). Everything else degrades with a note - a missing
   course tile, an unresolvable week/topic, a Files-tab save failure, a
   course-tile save failure, an opener-generation failure, a rubric
   failure, and a Canvas failure.
4. The Canvas draft's description reuses the handout text from BEFORE
   the opener/closer are appended: those are in-person facilitation
   notes, not part of the student-facing prompt.
5. The in-class closer is DETERMINISTIC (`renderAssignmentCloser`), not
   a second call to the opener generator. `generateClassOpenerAction`
   hard-codes an opener's shape in both its prompt and its embedded
   fallback, so reusing it for a closer would mislabel the section and,
   under the embedded provider, echo the opener almost verbatim.
6. `src/lib/assignment-brief.ts` is pure: no I/O, no `Date`, no
   randomness, so it is unit-testable without mocking a server action.
   The aptitude and grouping `promptContract` strings are incorporated
   VERBATIM from `TECHNICAL_APTITUDES` / `GROUPINGS` rather than
   re-described, so the vocabulary and the prompt cannot drift.

## 70. Test template step (Group D, D2)

Acceptance criteria (uncommitted, Group D):
1. `TestSpec` is a real designed spec (goal, coverage, aptitude,
   format, minutes, sections, allowedResources, includeAnswerKey,
   includeStudyGuide) - no longer a `Record<string, never>` stub. It
   REUSES the `TechnicalAptitude` vocabulary rather than defining a
   parallel one.
2. `TEST_QUESTION_KINDS[].canvasType` is the SINGLE source of truth
   mapping a question kind to its Canvas classic-quiz question type.
   The step looks it up; it must never re-derive the mapping in a local
   switch. The four kinds exist because they are exactly the four
   `QuizQuestionType` values the Canvas layer can create - a fifth kind
   would be one the LMS half could not post.
3. `coerceTestSpec` never throws on `null` / `undefined` / a string /
   an array / a number, and falls back per-field. Sections are the one
   exception to "fall back to the default": a section with an
   unrecognized `kind`, a non-integer `count`, or a negative
   `pointsEach` is DROPPED, not defaulted - defaulting an unknown kind
   would silently turn it into multiple choice.
4. `coerceArtifactSpec` in `src/lib/artifact-templates.ts` has a
   `kind === "test"` branch. Without it a test template read back from
   Supabase arrives with an empty spec and NOTHING errors - the step
   would generate from defaults silently. The remaining three kinds
   (discussion/quiz/class-session) still return `{}`.
5. `generateTestQuestionsAction` validates every parsed question before
   it can reach Canvas: an unrecognized `kind` is dropped, a
   `multiple_choice` question with fewer than 2 choices is dropped, and
   a non-numeric `points` falls back to the section's `pointsEach`. A
   non-ok LLM response returns `{ error }` and never throws. Under the
   `embedded` provider it scaffolds deterministically via
   `scaffoldQuizQuestions` with no model call.
6. `generate-test-from-template` produces the test `.docx`, plus an
   answer key when `includeAnswerKey` and a study guide when
   `includeStudyGuide`. The answer key is separated by a page-break
   marker so it never lands on the same page as question 1. The study
   guide is DETERMINISTIC and spec-derived, so it can never echo the
   generated questions.
7. Essay grading guidance is generated ONLY when the spec has at least
   one `essay` section; with no essay section the rubric action is not
   called at all.
8. The Canvas draft is a `"Quiz"` gradable - that branch is the one
   sending `quiz[published]=false` - followed by one
   `createQuizQuestionAction` per question. Answer shapes per kind:
   multiple choice sends every choice with `correct` on the match;
   true/false sends `True`/`False`; short answer sends the answer with
   `correct: true`; essay sends `answers: []`. A per-question failure
   is counted and reported but does NOT abort the remaining questions
   and does NOT throw. With `postToCanvas` off, or with no Canvas URL,
   no Canvas call is made at all.
9. The "Points possible" input takes effect on the DOCUMENT'S total,
   not on Canvas. `createGradable`'s Quiz branch discards
   `points_possible` (Canvas computes a classic quiz's total from its
   questions), so `renderTestDocument`'s `totalPointsOverride` is the
   only place the input can do anything. Without it the input is inert
   despite its help text. `testTotalPoints` remains the default source
   of truth.
10. `renderTestDocument` always emits the `## Instructions` heading;
    only the per-kind SECTION headings are conditional. A test
    asserting the document contains no `##` at all contradicts this and
    is wrong.
11. Headless: `generate-test-from-template` is headless-safe (it never
    pauses for a human and its Canvas item is always unpublished). The
    `headless.test.ts` size assertion AND its test title agree with each other
    and with `HEADLESS_SAFE_STEP_TYPES.size`. CORRECTED 2026-07-28: this check
    named the literal 136, which had been failing silently since entries 75+
    added more headless-safe steps; it reads 140 today. The count is a
    deliberate moving target - the requirement is that the title, the
    assertion and the set stay in agreement and are updated in the SAME commit
    as any step added to or removed from the set, not that it equals any
    particular number.

## 71. Artifact template builder page (Group D, D3)

Acceptance criteria (uncommitted, Group D):
1. ONE builder page with a kind switcher, not one page per kind -
   matching the single-table-with-a-kind-discriminator storage design.
   Reached from Manual > Artifact Templates.
2. Modelled on the PowerPoint builder (`src/app/components/ppt-design/`):
   built-in presets listed SEPARATELY from "Your templates", New /
   Duplicate / Delete-with-confirm, and an 800 ms debounced autosave.
3. **The autosave SKIPS preset ids.** Presets are code, not rows, and
   `saveArtifactTemplateAction` rejects them outright
   (`isPresetArtifactTemplateId`). A preset is shown read-only with a
   "duplicate it to make your own" notice.
4. Persistence goes through the SERVER ACTIONS, not a browser Supabase
   client. Unlike deck templates - which the browser writes directly -
   the artifact template actions run `requireOwner()` plus a
   service-role client, so there is no client-side equivalent.
5. Selected kind and selected template id both persist across reloads
   (`ta-artifact-kind`, `ta-artifact-selected-id`), per the standing
   rule that every new UI control persists.
6. Switching kinds clears the selection: a stored id belongs to the old
   kind, and the page falls back to the new kind's first template.
7. SUPERSEDED 2026-07-28 by entry 75 (Group G), which added
   `class-session` as a third editable kind - `EDITABLE_KINDS` now reads
   `["assignment", "test", "class-session"]`. This check named only
   `assignment` and `test` and had been failing silently since then. The
   requirement that survives: a kind NOT in `EDITABLE_KINDS` is stored and
   listed but says plainly that its spec is not designed yet, rather than
   rendering an empty form. Verify against `EDITABLE_KINDS`, not a literal
   list restated here.
8. `ListFieldEditor` holds its raw text LOCALLY and has no effect
   syncing back from props. Filtering blank lines straight back into
   the value would delete the empty line the instant the user pressed
   Enter, making a second list item impossible to type. Switching
   templates instead remounts the editors via `key={selected.id}`.
9. Section counts are rounded to integers in the editor because
   `coerceTestSpec` DROPS a section whose count is not an integer - a
   fractional count would silently delete the section on reload.
10. No setState is reached synchronously from an effect (the repo's
    `react-hooks/set-state-in-effect` rule). `loading` is DERIVED from
    a `loadedKind` state rather than being set at the top of the load
    effect.

## 72. Template steps in Course Refresh (Group D, D4)

Acceptance criteria (uncommitted, Group D):
1. `generate-assignment-from-template` and `generate-test-from-template`
   are appended to COURSE_REFRESH **only**. Both kickoffs end by
   including course-refresh, so adding either to all three would run it
   twice in each kickoff. Guarded by tests that assert exactly one
   occurrence in course-refresh and zero direct occurrences in both
   kickoffs.
2. **Both steps' `template` input is OPTIONAL, and blank is a no-op.**
   A required template would force every single Course Refresh run to
   pick an assignment template and a test template before it could run
   at all. Blank returns empty outputs and a plain text summary saying
   nothing was generated - the same "report success on a deliberate
   skip" idiom `generate-syllabus` uses when it leaves an existing
   syllabus alone. A test asserts the input is not required.
3. EVERY input of both step definitions has a binding in
   course-refresh's entry, checked by a test derived from the step
   definition's own inputs rather than a hardcoded list - so a future
   input added without a binding fails the test. An unbound input is
   silently skipped and never appears on the run form.
4. SUPERSEDED 2026-07-28. This check said all bindings are `runtime` and
   neither step references another step's output. Entries 77 (the files-chain
   reorder) and 78 (the project-based mode override) changed that: the
   assignment step now takes `files` from step 4 and the test step takes
   `files` from step 5 with a literal `mode`, so the check had been failing
   silently since. The property that actually matters and still holds:
   appending these steps does not introduce a dangling output for any skip set
   - verify that through `include-mirror.test.ts` directly rather than through
   a claim about binding sources.
5. **castletop-workbook is still the LAST step of course-refresh.** The
   two template steps are inserted BEFORE it, both because section 57's
   invariant (and its test) require castletop last, and because
   castletop reads the assignments the workflow just created - which
   now includes any draft these steps produced.

## 73. Shared document preview/edit window (Group F, F1)

Acceptance criteria (Group F):
1. ONE shared window (`DocumentPreviewModal`) serves every generated
   document. It is deliberately TEXT-only: every generator in the app
   builds a plain markdown-ish string that
   `buildDocxFromPlainText` later renders, so text is the single
   representation they all share and the only one a model can revise.
2. It offers a read view, a direct edit view, Save, Download, and
   Revert, plus an instructions box that re-prompts the model.
3. **A revision is never persisted on its own.** `reviseDocumentAction`
   replaces the DRAFT and switches the window into edit mode so the
   rewrite is reviewable; only Save writes it back.
4. `onSave` is OPTIONAL. A document with no inline-editable home on the
   course row (a rubric, and the syllabus - which lives in the syllabus
   library as a .docx) gets the window WITHOUT a save handler, and the
   window says so and offers Download instead. It must never silently
   accept edits it cannot persist.
5. `reviseDocumentAction`'s contract is REPLACEMENT, not commentary -
   it returns the complete revised document, because the caller writes
   the result straight over the document being edited. It guards an
   empty document and empty instructions before calling the model,
   returns `{ error }` (never throws) on a failed or rejected call, and
   treats an EMPTY model response as an error rather than as an empty
   document.
6. Under the `embedded` provider it makes NO model call and returns the
   document with the request appended as an explicit
   "not applied" note. Silently returning the input unchanged would
   look like a revision that quietly did nothing.
7. The three specialised preview modals (syllabus, schedule CSV,
   rubric) keep their structured read-only rendering and gain an
   "Edit with AI" action that hands their text to the shared window -
   a plain textarea would otherwise lose the rubric and CSV table
   views.

## 74. Courses table column order (Group F, F2 + F3)

Acceptance criteria (Group F):
1. **`CourseRow` renders cells from a `Record<ColumnId, ReactNode>` map
   driven by the ordered column list, not from hardcoded JSX order.**
   The header renders from the SAME ordered list, so a header and its
   cells cannot fall out of alignment - which a hardcoded cell order
   plus a user-arrangeable header would guarantee.
2. Column order persists across reloads under
   `ta-courses-column-order`, separate from the visibility set under
   `ta-courses-columns`.
3. `parseColumnOrder` always returns a COMPLETE, duplicate-free
   ordering of every column id: stored ids first in stored order, then
   every unmentioned id appended in ALL_COLUMN_IDS order. So a column
   added after the value was written still appears, and filtering the
   result by the visible set yields a total order with no gaps. It
   accepts the versioned shape and the legacy bare array, migrates the
   legacy count ids, drops unknown ids, and falls back to the default
   order on anything malformed.
4. `moveColumnInOrder` swaps with the nearest VISIBLE neighbour, not
   the raw array neighbour. Swapping raw neighbours would move a
   column past a hidden one and look to the user like the button did
   nothing. It is a no-op for a hidden column and at either visible
   edge, and never adds, drops, or duplicates a column.
5. ALL_COLUMN_IDS is grouped so related columns are adjacent: term
   logistics, assessment cadence, connected systems, people and
   contact, course content, then generated artifacts and files. Tests
   pin the adjacency of the term dates, the email pair, the two
   syllabus columns, and the contiguous file columns.
6. `DEFAULT_VISIBLE_COLUMNS` is DERIVED from ALL_COLUMN_IDS
   (`[...ALL_COLUMN_IDS]`) rather than restated, so the two lists
   cannot drift apart as columns are added - they were previously two
   hand-maintained copies of the same list.

## 75. Class session templates and LMS population (Group G)

Acceptance criteria (Group G):
1. **The no-code course's class template and the codebase course's are ONE
   template family with a `variant` discriminator**, not two parallel
   families. They differ only in how the hands-on assignment is
   submitted, and `CLASS_SESSION_VARIANTS[].submissionType` is the single
   place that difference lives: `online_url` for the codebase course (the
   student submits a GitHub URL), `online_text_entry` for no-code.
2. A class session bundles four legs: a recent-events case study from the
   research layer, a discussion board post about it, a hands-on
   assignment, and a quiz on the week's material.
3. `DiscussionSpec`, `QuizSpec`, and `ClassSessionSpec` are all designed
   for real - none is a `Record<string, never>` placeholder any more.
   Discussion and quiz are their own specs (rather than fields buried in
   the bundle) so each stays reusable on its own, but they ship no
   standalone presets because they exist today only as legs of a session.
4. `coerceArtifactSpec` now has a branch per kind. An UNRECOGNIZED kind
   value still falls through to `{}` rather than guessing which spec it
   meant.
5. `coerceClassSessionSpec` never throws on junk, falls back on an
   unknown variant or aptitude, and rejects a BLANK `caseStudyWindow` -
   an empty window would mean searching on nothing.
   `coerceQuizSpec` drops unknown question kinds and falls back when none
   survive, because an empty kind list means a quiz with no answerable
   question.
6. `quizSectionsFor` splits the quiz's question count as evenly as
   possible across its kinds, giving the remainder to the earlier kinds,
   and never emits a zero-count section. The totals always add back up to
   the requested count.
7. The variant and aptitude `promptContract` strings reach the assignment
   prompt VERBATIM. The variant contract is what makes the codebase
   course's assignment ask for a repository URL, so a paraphrase here
   silently breaks the whole distinction between the two templates.
8. The case study keeps its source URL as an explicit line. The research
   layer attaches provenance to live-web material; dropping it would
   present a scraped extract as if it were curated fact.
9. **Failure policy.** For the single-week step, the template and the
   assignment are FATAL; a missing course tile, an unresolvable
   week/topic, a failed case-study search, a failed quiz, and any Canvas
   failure are all NOTES. For the population step, ONE bad week must
   never abandon the remaining weeks - the per-week body is guarded and
   recorded, and the step reports how many weeks of how many succeeded.
10. The population step REFUSES to invent a week range: with no
    `toWeek` and no course week count it stops with an explanatory
    summary rather than guessing and filling the course with the wrong
    number of weeks.
11. Every Canvas item either step creates is UNPUBLISHED. Neither
    publishes anything.
12. **`populate-lms-from-class-template` is appended to each KICKOFF, not
    to course-refresh** - the exact inverse of the rule for the
    assignment and test steps (section 72). The two kickoffs need
    DIFFERENT template variants, and the shared refresh would force one
    variant on both. Guarded by tests asserting exactly one occurrence in
    each kickoff, zero in course-refresh, and that every input is bound.
13. It runs AFTER the course-refresh include, because it needs the LMS
    course and modules the refresh just created. This means
    castletop-workbook is no longer the last step of a kickoff RUN -
    it remains last within course-refresh, which is what section 57
    actually protects.
14. Both steps' `template` input is optional and blank is a no-op, so a
    kickoff run is never forced to pick a class template.
15. Both steps build each week from the SAME pure helpers in
    `class-session-brief.ts`, so a single-week package and a populated
    course cannot diverge.

## 76. Ask AI, course-design settings, workflow folders (Group E)

Acceptance criteria (Group E):
1. **Ask AI** sits at the end of every course row and answers a free-form
   question grounded in that course's own recorded facts.
2. `renderCourseFacts` OMITS an unset field rather than emitting
   "Textbook: (none)". A wall of "(none)" lines reads to the model as
   recorded fact - "this course has no textbook" - when it usually just
   means nobody filled the column in. A whitespace-only value counts as
   unset; a ZERO does not (zero tests is a real answer). `repos` are
   `{ repo, branch }` objects and must be mapped before joining, or the
   model receives a line of "[object Object]".
3. The course's schedule CSV is included IN FULL rather than summarized
   as a row count - it is the single most useful thing to ground an
   answer in.
4. `askAboutCourseAction` takes a pre-rendered fact block rather than a
   Course, so it stays free of the Supabase row shape. It guards an
   empty question, returns `{ error }` rather than throwing, treats an
   empty model response as an error, and under the `embedded` provider
   makes no model call and says plainly that nothing was answered
   instead of fabricating one.
5. **Course-design settings** (semester-long project, where hands-on
   activities come from, how much instructor setup is allowed) are
   per-run OVERRIDES applied on top of a class-session template, not
   fields inside it: a kickoff asks them once and they shape every
   week. This is deliberately the SAME setting as
   `ClassSessionSpec.assignment.buildsTowardProject` rather than a
   second, competing control.
6. Every override field defaults to `"template"`, and
   `applyClassSessionOverrides` RETURNS THE SAME OBJECT for an all-default
   override - a run that sets nothing produces exactly the spec the
   template stored. It never mutates its input.
7. A run-supplied project description wins over the template's, because
   the run is the more specific instruction; a blank one keeps the
   template's.
8. `ACTIVITY_SOURCES` and `SETUP_BURDENS` use an EMPTY `promptContract`
   for their `"template"` value, so an unset choice adds nothing to the
   prompt rather than a sentence that says nothing. The chosen contracts
   reach the prompt verbatim.
9. `RuntimeField` now carries `options`, and the run form renders a
   select for an options-bearing text input. Without this an enum input
   degrades to a free text box at run time, where a typo silently
   becomes an unrecognized value. The options branch must sit BEFORE the
   plain `text` branch in the chain, or it is unreachable.
10. **Workflow folders** are a local organizing layer - a map of
    workflow id to folder name plus an explicit folder order, persisted
    under `ta-workflow-folders`. They are deliberately NOT stored on the
    workflow, because presets are code, not rows, and cannot carry user
    state.
11. A filed workflow appears in its folder ONLY. Listing it in both its
    folder and its category would look like two different workflows with
    the same name.
12. Folders sort first, in the user's order, then the built-in
    Recent/Custom/category groups for everything unfiled. A folder with
    no workflows left in it disappears. Search still flattens, ignoring
    folders entirely.
13. `parseFolderState` degrades to "no folders" on anything malformed
    rather than throwing, and a BLANK folder name means "unfile" rather
    than creating a folder with an empty name.
14. **The folder picker is a real control, not a `window.prompt`.** One
    combined filter-and-create field over the folder list: typing
    narrows it, and a name that does not exist offers to create it, so
    filing into an existing folder and into a new one are the SAME
    gesture. "Create" is offered only when the typed name is not already
    a folder, or the same name would appear twice - once as a match and
    once as a create row that does nothing new. Enter commits only when
    the choice is unambiguous (a new name, or exactly one match).
    "Remove from folder" appears only when the workflow is filed.
15. Each folder header carries a rename / move / delete menu.
    **Renaming ONTO an existing folder is a merge, not an error**, and
    the order must not then list the surviving folder twice.
    **Deleting a folder UNFILES its workflows, never deletes them** - a
    folder is only an organizing layer - and the menu item says so, so
    the action does not read as destructive. Unfiled workflows return to
    their built-in Recent/Custom/category groups.

## 77. Generation precedes posting in Course Refresh

Acceptance criteria:
1. **Every generator runs BEFORE every step that posts to the LMS.**
   Course Refresh previously ran `lms-wipe` / `lms-modules` /
   `lms-populate` / `lms-assignments` / `blackboard-export` at steps
   5-10 and only then generated class openers (11), the assignment (14)
   and the test (15). Those artifacts could therefore never be part of
   the modules that were built or the cartridge that was exported -
   each one posted its own separate Canvas draft afterwards, and the
   Common Cartridge shipped without any of them.
2. The order is now: load tile, schedule, save CSV, lecture-zip, THEN
   openers / assignment / test, THEN save zip, wipe, rubric, modules,
   populate, assignments, export, include, syllabus, castletop.
3. **The generators form one unbroken `files` chain.** Each takes the
   accumulated `GeneratedCourseFile[]` and emits it plus its own
   document: lecture-zip -> openers -> assignment -> test. A generator
   that replaced the set instead of appending would silently drop
   everything produced before it.
4. A generator with nothing to do must PASS THE INCOMING SET THROUGH.
   Both template steps return the incoming files unchanged on their
   no-template no-op path - returning an empty array there would wipe
   the run's file set whenever a template was left blank.
5. Every posting step reads the LAST generator's files, not
   `lecture-zip`'s. Reading the zip's set directly is what the old
   wiring did and is exactly the bug.
6. Steps 0-3 keep their positions, because both kickoffs' includes
   remap `0.*`, `1.*` and `3.files` and skip `[0,1]` / `[0,1,3]` by
   index. The reorder moved only steps at index 4 and beyond, and every
   in-workflow `stepIndex` that pointed past the insertion point was
   updated with it (`lms-modules` and `lms-rubric` moved).
7. `GeneratedCourseFile.role` gained `opener`, `assignment` and `test`.
   `assignment` and `test` deliberately do NOT carry `pageText`, so
   `lms-populate` uploads them as downloadable files rather than
   turning them into Canvas Pages - the gradable Canvas item itself is
   created separately by the step that generated it.
8. Class openers previously claimed `role: "instructions"` with
   `sortOrder: 0`, which made `lms-populate` turn each opener into a
   Page and sort it above the week's introduction. They are now
   `role: "opener"` at `sortOrder: 3`.
9. `castletop-workbook` is still the last step of course-refresh, and
   both kickoffs still reach the refresh through their include.

## 78. Hands-on (project-based) tests

Acceptance criteria:
1. `TestSpec.mode` is `written | project-based`. A project-based test
   walks the student back through the motions their own semester
   project has already required of them, so it measures whether they
   can PERFORM the work rather than describe it.
2. It lives on the SPEC, not in the per-run overrides: it is a property
   of what the test IS, unlike the course-design choices of section 76
   which a run makes once and applies to every week.
3. It defaults to `written`, and `coerceTestSpec` falls back to
   `written` on an unrecognized value - so every test template stored
   before this existed keeps behaving exactly as it did.
4. The mode's `promptContract` reaches the model VERBATIM, following the
   same idiom as the aptitude and format vocabularies. A paraphrase here
   is how a hands-on test quietly turns back into a written one.
5. **The mode contract is stated BEFORE the aptitude and format
   contracts.** Whether the student performs the work or writes about it
   reframes every other constraint, so the model must read it first.
6. The project-based contract demands tasks, not recall: it requires
   every question to be something the student DOES, requires a stated
   starting point and definition of done, and explicitly forbids
   definitions and abstract explanation.
7. A project-based test says so on the student-facing document; a
   written one adds no such line.
8. **Tests generated by a kickoff or refresh run are hands-on.**
   `generate-test-from-template` declares an optional `mode` override
   (`template | written | project-based`, where `template` and anything
   unrecognized leave the template's own mode alone), and COURSE_REFRESH
   binds it to the LITERAL `project-based`. Both kickoffs inherit that
   through their include.
9. The shipped midterm and comprehensive-final presets are
   project-based; the low-stakes weekly quiz stays written, since a
   quick recall check is what it is for.

## 79. The course-long project (first-class)

Acceptance criteria:
1. A course has ONE project: `course_project`, a jsonb column on
   `course_hub` holding `{ mode, name, definition, brief,
   briefFileName, milestones[], generatedAt }`. `definition` is the
   instructor's INPUT; `brief` and `milestones` are the generated
   ARTIFACT.
2. **`courseProject` is DEDICATED-WRITER-ONLY.** `updateCourseProject`
   is the sole writer. It is absent from `CourseInput`, from `toRow`'s
   returned object, from `courseToInput` and from
   `courseToInputPayload`, exactly like the file columns - and is
   listed in the payload test's `EXCLUDED_COURSE_KEYS`. This is the
   INVERSE of the plain-scalar rule (section 61): a scalar must be in
   both carriers or it gets wiped; this must be in neither, or
   `updateCourse`'s full-input round-trip wipes it on every unrelated
   save from a kickoff or refresh run.
3. `coerceCourseProject` never throws on any junk, and DROPS a
   malformed milestone rather than defaulting it - inventing a week
   number or title would silently mis-order the semester. Duplicate
   weeks keep the FIRST; output is sorted ascending; the brief,
   definition and milestone list are all capped, because the whole
   column is selected on every tile read.
4. `milestoneForWeek` matches EXACTLY, with no nearest-neighbour
   fallback: handing week 7's work to week 9 would duplicate an
   assignment the student already did.
5. `milestoneBriefFor` returns null when `mode` is `"none"` even if
   milestones are stored - turning the project off silences every
   downstream prompt without losing the plan.
6. `renderMilestoneContract` is the SINGLE source of truth for the
   prompt sentence, pushed VERBATIM by all four generators exactly the
   way `promptContract` strings are. It names the milestone, the
   project, the deliverable, and forbids re-specifying earlier
   milestones or reaching ahead. For week 1 it says plainly that no
   earlier project work exists.
7. `define-course-project` turns a one-line definition into a named
   project, a brief, and one milestone per week, and SAVES it to the
   tile. It runs BEFORE the course-refresh include in both kickoffs, so
   every generator downstream can read it.
8. **A blank definition never CLEARS a project.** A kickoff run that
   leaves the box empty leaves an existing project alone; clearing is
   done deliberately from the Courses table. A course that already has
   a project is left alone unless Rebuild is turned on.
9. Without a week count the step REFUSES to invent milestones and says
   why, rather than misaligning every week of the course. A week with
   no milestone is reported, not silently generated without context.
10. Precedence for the class-session steps is template < course project
    < explicit run override, resolved BEFORE
    `applyClassSessionOverrides` so that function's identity guarantee
    (section 76 check 6) stays intact.
11. The quiz legs keep their own hand-rolled context and are NOT routed
    through `buildTestContext`: a `QuizSpec` is not a `TestSpec`, and
    synthesizing one would inject the aptitude and format contracts and
    change quiz output far beyond the milestone. The contract is
    appended to the existing literal instead.
12. **The kickoff run forms are short.** Both went from 32/34 runtime
    fields to 12. `courseProject` is asked for; topic/week/points/
    post-to-Canvas duplicates across the two template steps, the
    Castletop defaults, the GitHub sign-up assignment, the syllabus
    regenerate flag and the class-session week range are all literals
    or course-derived. `moduleId` STAYS runtime-bound - an existing
    invariant (AC6) requires it.
13. `classSessionPostToCanvas` remains an explicit field rather than an
    always-on literal: every kickoff run would otherwise create Canvas
    items without the user opting in.
14. **The project is editable by hand from the Courses table.**
    `ProjectCell` is the ONLY place a project can be edited or cleared -
    the kickoff step deliberately never clears one, so a run that leaves
    its box empty cannot wipe a plan the term depends on. Generate is
    disabled with an explanatory title until both a definition and a
    course week count exist.
15. Adding the column required the full checklist: `courseProject` in
    `ALL_COLUMN_IDS` (in the generated-artifacts group), a
    `COLUMN_MIN_WIDTHS` entry, a `sortValueFor` case returning the
    milestone count (a switched-off project sorts as 0, with the
    unplanned courses), `CURRENT_COLUMNS_VERSION` 8 -> 9 AND
    `COLUMNS_ADDED_IN[9]`. Without BOTH of the last two the column is
    invisible to anyone with a saved column set - the version-union
    tests pin every older version's expected gain.
16. There is deliberately NO `computeFieldPatch` case: the cell saves
    through `setCourseProjectAction`, and `courseProject` is not in the
    `InlineField` union.
17. **Ask AI is grounded in the project.** `renderCourseFacts` emits the
    project name, its definition, and every milestone (week, title, and
    the deliverable when there is one) - and OMITS the whole block when
    there is no project or it is switched off, never "(none)", per
    section 76 check 2.
18. The project brief opens in the shared document window (section 73)
    WITHOUT a save handler: the brief is regenerated from its
    definition, so hand-edits to it would be silently lost on a rebuild.

## 80. Whole-document fence unwrapping, and no-code warm-ups

Acceptance criteria:
1. **`unwrapDocumentFence` strips ONLY a fence wrapping the entire
   response.** The regex it replaces -
   ``/```(?:markdown|md|text)?\s*([\s\S]*?)```/i`` - had an OPTIONAL
   language tag and was UNANCHORED, so on any document containing a code
   block it matched from that inner fence to its close and returned just
   the code. An entire 16-week set of Project Management class openers
   shipped as bare Python fragments with every word of prose destroyed.
2. It returns the text UNCHANGED - never a fragment - when the response
   is not wholly wrapped. Being too conservative leaves a stray
   "```markdown" line; being too eager destroys the document.
3. A fence whose opening tag names a PROGRAMMING language is never
   treated as a wrapper: a document opening with ```python is a document
   that starts with a code block. Only an empty tag or a document-ish one
   (markdown / md / text / txt) qualifies.
4. A document that merely ENDS with a code block, or merely STARTS with
   one, is left alone; a genuine wrapper is unwrapped even when the
   document inside contains its own fences.
5. It never returns an empty string, and it is idempotent.
6. All FOUR prose-generating sites use it (`generateClassOpenerAction`,
   the markdown site in `llm-tools.ts`, and both sites in
   `syllabus-adapt.ts`, which used an even broader `(?:\w+)?` tag). The
   JSON sites are deliberately left alone: a wrong slice there fails
   loudly at `JSON.parse` rather than silently shipping a fragment.
7. **A no-code course never gets a programming warm-up.**
   `generate-class-openers` takes an `exerciseKind` of
   `coding | applied`. Under `applied` the opener asks for a practical
   exercise producing a written artifact, the prompt explicitly forbids
   code, and `findPracticeProblemsAction` is NOT CALLED AT ALL - the
   practice bank holds coding problems, so even fetching them risks
   leaking a program into the course.
8. `coding` stays the default, so every existing caller is unchanged.
9. Neither kickoff asks: the no-code kickoff pins `applied` and the
   codebase kickoff pins `coding`, both through `bindOverrides` on their
   course-refresh include. Those keys are POSITIONAL against
   COURSE_REFRESH's array, so a test asserts index 4 really is
   `generate-class-openers` - a reorder would silently void both.

## 81. Lecture notes and assignment instructions are really generated

Acceptance criteria:
1. **`buildScheduleWeekPlan` generates the module introduction and the
   assignment instructions with the MODEL.** They were previously built
   by `scaffoldModuleIntroDoc` / `scaffoldAssignmentDoc`
   UNCONDITIONALLY - the comment even said "deterministically" - so a
   user who had selected an LLM still received placeholder prose. A real
   16-week Project Management course shipped lecture notes reading
   "This module introduces week 1 and why it matters" and, in a
   student-facing document, the literal instructor TODO "Add two or
   three concrete examples your students will recognize."
2. The scaffold is now ONLY the `embedded`-provider path and the
   degraded fallback.
3. **The TOPIC is the display title, not the week label.** Passing
   "Week 1" is what produced "introduces week 1"; the week label remains
   the fallback for a week with no topic.
4. A failure degrades rather than losing the week: the scaffold still
   supplies text, and `introFailed` / `instructionsFailed` record it.
   A failure on one document must not affect the other.
5. **Degradation is VISIBLE.** `assembleLectureFiles` lists every week
   that fell back at the TOP of its summary. `slidesFailed` had existed
   for a long time and was surfaced NOWHERE, which is precisely how 16
   weeks of placeholder notes reached a real course looking like a clean
   success.

## 82. Lecture notes live in the deck, not a separate document

Acceptance criteria:
1. **No separate lecture-notes .docx is generated.** The block in
   `assembleLectureFiles` that built a "Lecture Notes" file with
   `role: "introduction"` is gone. A lecture's notes belong with the
   slides they narrate, not in a second file the instructor opens
   alongside them.
2. `PptxSlide` and `SlideData` carry `notes`, and `buildSlidesPptx`
   writes them into the deck's real speaker-notes pane via `addNotes`,
   in BOTH the themed and the standard layouts. Missing it in one would
   silently drop notes for every deck built with that theme.
3. The slide prompt requires `notes` on every slide: 3-6 sentences of
   real teaching narration, the transition into the next slide, and a
   question to ask the class - explicitly NOT a repeat of the bullets
   and never a placeholder.
4. `toSlideData` keeps a `notes` field and drops a blank one, so a model
   that omits it produces a slide with no notes rather than an empty
   notes pane.
5. `withDeckNotes` folds the week's module introduction onto the OPENING
   slide's notes. It never overwrites notes a slide already has - a
   per-slide note is more specific than the deck-level intro - treats
   whitespace-only existing notes as absent, is a no-op for a blank
   introduction or an empty deck, and never mutates its input.
6. **Consequence to remember:** the notes file also carried `pageText`,
   which is what made `lms-populate` create a Canvas *Page* for each
   week's introduction. Removing the file removes that page. The
   introduction now reaches the instructor through the deck instead.

## 83. Course-type signal threaded through every generator

Acceptance criteria:
1. `CourseKind` (`coding | applied`) in `src/lib/course-kind.ts` is the
   ONE vocabulary for whether a course teaches programming. It follows
   the same `{value,label,hint,promptContract}` shape as
   TECHNICAL_APTITUDES and CLASS_SESSION_VARIANTS, and every caller
   pushes the contract VERBATIM.
2. **`resolveCourseKind` defaults to `coding` for anything
   unrecognized**, so every pre-existing caller and stored workflow
   behaves exactly as before. `applied` is strictly opt-in.
3. The applied contract forbids code outright: it states plainly that
   this is NOT a programming course, forbids reading/writing/running
   code and code snippets, and redirects examples to real organizations
   and the artifacts practitioners produce.
4. `slideDeckJsonShape` / `slideStructureRequirements` select by kind.
   **The coding branch returns the EXISTING constants unchanged**, so
   the 40+ assertions already pinning `SLIDE_DECK_JSON_SHAPE` and
   `SLIDE_STRUCTURE_REQUIREMENTS` stay meaningful.
5. The applied deck shape carries NO `code` or `codeLanguage` field at
   all, and its requirements forbid them explicitly - and it keeps the FULL
   pedagogical shape. An applied deck is a different deck, not a lesser one.
   Both variants still require speaker notes on every slide.
   AMENDED 2026-07-28 by entry 100: the applied cycle named here
   (Example, Walkthrough, Practice, Answer) was a clone of the coding
   contract and has been REPLACED, because "Walkthrough" means explaining
   code line by line and "Answer" implies a single correct response -
   neither fits a course teaching professional judgment. The applied cycle
   is now Principle / In Practice / Artifact / Judgment Call / Your Turn /
   Model Response, plus Failure Modes and Terminology sections. What
   survives unchanged from this check and must still hold: Case Study,
   Post-Lecture Practice, Documentation, Modern Tech, References, BREADTH,
   the no-code rule, speaker notes on every slide, and the principle that
   the applied deck is not a lesser deck. Verify the current cycle against
   entry 100, and note the coding contract is byte-identical (entry 100
   point 2 pins it by sha256).
6. The signal reaches all three schedule-driven generators - the slide
   deck, the module introduction, and the assignment instructions -
   through `buildScheduleWeekPlan` and
   `generateLectureMaterialsFromScheduleAction`.
7. `generateSlidesForAssignment` in `shared.ts` deliberately keeps the
   coding-only contract: it is repo-driven (READMEs, unit tests) and is
   inherently a programming deck.
8. **The openers' `OpenerExerciseKind` is an ALIAS of `CourseKind`**,
   not a parallel union - the two describe the same distinction, and
   two vocabularies for one idea is how they drift apart.
9. The no-code kickoff pins `courseKind: "applied"` on
   `lecture-materials-from-schedule`, and a test asserts it AGREES with
   the opener's `exerciseKind` override - an applied course cannot have
   a coding warm-up.

## 84. No generator in a no-code kickoff can produce code

Acceptance criteria:
1. **Five code-capable generators are pinned**, not one:
   `lecture-materials-from-schedule` (courseKind),
   `generate-class-openers` (exerciseKind),
   `generate-assignment-from-template` (courseKind),
   `generate-test-from-template` (courseKind), and
   `define-course-project` (courseKind). A single one left on the
   `coding` default is a leak, and section 83 only covered the first two.
2. `generateAssignmentAction`'s tool-list rule named "Python, VS Code,
   Google Colab, GitHub, Replit" unconditionally - THE reason a project
   management course got coding assignments. It now names those only for
   a coding course, and for an applied course explicitly forbids
   languages, IDEs and developer platforms.
3. `generateTestQuestionsAction` and `generateCourseProjectAction` carry
   the contract too.
4. The class-session steps derive the kind from the template's own
   `variant` (`no-code` -> `applied`) rather than taking a new input:
   the variant IS the distinction.
5. **The curated case-study bank is a SOFTWARE bank.** Searching it for
   "Foundations of Project Management" returned the npm left-pad
   incident, which then framed the whole opener. An applied course skips
   the bank entirely and the model is asked for a widely-documented real
   event from the course's own field instead - with the never-invent
   guard kept, and the blanket no-invention rule narrowed so it cannot
   forbid naming that case study.
6. Course Refresh binds `courseKind` as a RUNTIME field on both template
   steps, so a standalone refresh asks once; both kickoffs override it,
   so neither asks.
7. **The tests assert the EXPANDED workflow, not the preset source.**
   A `bindOverrides` key is positional against COURSE_REFRESH's array
   and is skipped SILENTLY on a miss, so asserting the override entry
   exists proves nothing about what the step receives. Section 83's test
   made exactly that mistake.

## 85. Current events ships as a Word document; decks download

Acceptance criteria:
1. **The current-events report is a formatted .docx**, built the same
   way the lecture Q&A document is: markdown headings handed to
   `buildDocxFromPlainText`, saved with the docx mime type and a .docx
   extension.
2. `buildCurrentEventsDocMarkdown` is a SECOND rendering of the same
   input, not a replacement. `buildCurrentEventsReport`'s flat text is
   unchanged: it is the step's `reportText` output, other steps bind to
   it, and its format is pinned by existing tests.
3. Both renderings are built from ONE `CurrentEventsReportInput` in
   `researchCurrentEventsAction`, so the document and the bound text can
   never describe different findings.
4. The markdown uses exactly one level-1 title and level-2 section
   headings. The docx builder keys off those; an ALL-CAPS line like
   "CROSS-CUTTING THEMES" renders as ordinary body text, which is why
   the flat report could never be a professional document on its own.
   URLs are left bare so the builder turns them into real hyperlinks.
5. An empty topic says so plainly rather than emitting nothing, and a
   degraded run is marked in the coverage line.
6. **`generate-presentation-from-template` downloads the .pptx** as well
   as saving it to the Files library, so the weekly lecture deck
   workflow - and any user copy of it, which is a stored row that code
   cannot edit - ends with the deck in the user's Downloads. The fix is
   in the STEP for exactly that reason.
7. The download is guarded by `typeof document !== "undefined"` for
   headless runs, and a download failure is a NOTE in the summary, never
   a thrown error: the library copy has already succeeded by then, so a
   deck is never lost to it.
8. The downloaded deck is rebuilt with `buildSlidesPptx` from the same
   title/slides/theme/author the action used. That function is
   deterministic, so this is the same deck the library stored rather
   than a second, differently-generated one.

## 86. Deck-driven concept-visualizer coverage (Feature A)

Acceptance criteria:
1. **A new step type `ensure-visualizer-pages-for-deck`** ("Ensure visualizer
   pages for a deck") lives in its own module
   `src/lib/workflows/registry/steps.visualizer.ts` and is aggregated into
   `STEP_REGISTRY` via `visualizerSteps` in `src/lib/workflows/registry.ts`.
   The pre-existing `ensure-visualizer-pages` step is UNCHANGED - its name,
   its required `courses` input, its optional inputs and its three outputs all
   still hold (`registry.ensure-visualizer-pages.test.ts`).
2. Inputs are exactly `slides` (uploads, accept ".pptx"), `slidesText`
   (longtext), `hubCourse` (hubCourse), `maxConcepts` (number) and `create`
   (boolean) - ALL optional. Outputs are exactly `report` (longtext), `links`
   (longtext), `created` (number), `missing` (number) and `hasCreated`
   (boolean).
3. Both deck inputs empty throws exactly "Provide a slide deck - upload a
   .pptx or bind a deck from an earlier step." An upload is extracted through
   `extractPptxSlidesAction`; otherwise `slidesText` is used.
4. `create` defaults ON: unset or blank both mean on. Only an explicit value
   other than "1" turns it off, and then the creator action is never called
   and the report line reads `<concept>: MISSING (creation disabled)`.
5. A creator error reaches the report VERBATIM as
   `<concept>: creation failed - <error>`. One concept failing (error result
   or thrown) never aborts the remaining concepts.
6. **The create path actually works against the real visualizer repo.**
   `insertNavLeaf` tolerates the TypeScript type annotation exactly as
   `parseNavItems` does. Observe: fetch
   `https://raw.githubusercontent.com/alexandergshaw/programming-concept-visualizer/main/components/pageComponents/navItems.ts`
   (every export is `export const xNavItems: SidebarItem[] = [`, with nested
   `children`), then `insertNavLeaf(src, "pythonNavItems", "Bubble Sort",
   "bubble-sort")` must return a non-null source that inserts into that export
   ONLY, exactly once, and reparse to one more leaf than before (157 -> 158 at
   the time of writing). Before this feature the function returned null for
   every real export, so `createVisualizerConceptAction` always failed with
   "Concept already exists or could not update navItems."
7. **`VISUALIZER_TOPICS` is the single source of truth** for route, nav export,
   concept directory, page path, concept import prefix and `creatable`. It has
   15 entries of which exactly 10 are creatable. `TOPIC_ROUTES`,
   `TOPIC_TO_EXPORT_MAP` and `TOPIC_TO_DIR_MAP` keep their previous values for
   backward compatibility and must NOT be treated as the source of truth for
   page paths. Pinned values: sql -> page
   `components/pageComponents/SqlPage.tsx` (top level, NOT SQL/SQLPage.tsx),
   conceptDir `SQL`, import prefix `./SQL/`; deploying-a-website -> conceptDir
   `DeployingPage`, page
   `components/pageComponents/DeployingPage/DeployingPage.tsx`;
   html/php/typescript -> top-level `HtmlPage.tsx`, `PhpPage.tsx`,
   `TypeScriptPage.tsx`; html, php, typescript, deploying-a-website and github
   are all `creatable: false` (UnderConstruction stubs with no nav array).
8. `createVisualizerConceptAction` offers the model ONLY creatable topic keys,
   falls back to `programming-basics` when the pick is not creatable, and takes
   the topic page path and concept import prefix from the picked topic's entry.
9. `extractDeckConceptsAction` (in `src/app/actions/visualizer.ts`, a new
   "use server" file re-exported from `actions.ts` because research.ts was at
   995 of its 1000-line budget) returns `{concepts}` or `{error}`; the
   `embedded` provider returns slide-title concepts with NO LLM call; a model
   result parsing to zero concepts falls back to slide titles rather than
   erroring; the count is clamped by `clampDeckConcepts` (default 8, range
   1-20).
10. The step is in `HEADLESS_SAFE_STEP_TYPES` and in `STEP_CATEGORIES`
    (knowledge). The headless exact-count canary in `headless.test.ts` reads
    140.
11. Preset wiring, APPENDED so no existing step-index binding shifts:
    `weekly-lecture-deck` gains it at index 2 with `slidesText` bound to
    {step 1, `deck`}; `module-slides-from-template` gains it at index 1 with
    `slidesText` bound to {step 0, `deck`}. Both also bind `hubCourse`
    (runtime), `maxConcepts` literal "8" and `create` literal "1".
    `weekly-everything-prep` is UNCHANGED - inserting there would invalidate
    compose-briefing's four step bindings and grade-to-draft's runIf.
    Both ids are in `DEEP_CHECK_PRESET_IDS` in presets.test.ts.
12. A Markdown coverage artifact is saved through `saveLibraryFileAction`
    named via `buildWorkflowFileName` with artifact "Visualizer Coverage" and
    ext "md"; a failed save degrades to a note and never throws the step.

## 87. Current-events report: grounded sources and real hierarchy (Feature B)

Context: a shipped report cited four fabricated URLs (two on `www.example.com`,
one on `research.cs.example.edu`, one on `engineering.example.com`), reported
"0 source(s)", carried 2024- and 2025-dated items under a "past 30 days"
window, and was not marked degraded.

Acceptance criteria:
1. **Two-call research shape.** Per topic, `researchTopicOnce` makes a GROUNDED
   call (`webSearch: true`) asking for browsable PROSE - it must NOT demand
   "ONLY valid JSON", because that instruction is what suppressed Gemini's
   decision to search - followed by an UNGROUNDED structuring call
   (`structureProseIntoItems`) that converts the prose into the existing
   items JSON shape parsed by `parseTopicItems`. `runWholeDeckSearch` has the
   same two-call shape. The per-topic `Promise.allSettled` fan-out and the
   one-retry behavior are preserved.
2. **Grounding sources are matched against Gemini's REAL metadata shape.**
   `groundingChunks[].web.uri` is always a
   `https://vertexaisearch.cloud.google.com/grounding-api-redirect/<token>`
   redirect, never the publisher URL, and `web.title` carries the DOMAIN
   (e.g. "python.org") or a bare registrable label (e.g. "aljazeera").
   `verifyItemUrls` therefore corroborates against BOTH the source uri host
   AND the source title read as a domain, normalizing (lowercase, strip
   leading `www.`, strip trailing dot) and accepting a subdomain or a
   bare-label match. `vertexaisearch.cloud.google.com` is explicitly excluded
   so a model-invented redirect URL can never self-corroborate. A title
   containing whitespace is a page title, not a domain, and is not used for
   title-matching.
   Observe: an item on `https://www.python.org/downloads/` with a source of
   title "python.org" and a grounding-redirect uri KEEPS its URL and is not
   unverified. `https://docs.python.org/...` against the same source also
   keeps it. `https://www.aljazeera.com/news/x` against title "aljazeera"
   keeps it. An unrelated host, a sentence-like title, an empty source list,
   and any example.* host are all blanked and marked unverified.
3. `isPlaceholderUrl` is true for any host with `example` as a dot-separated
   label (covering example.com/.org/.net/.edu and subdomains), localhost, a
   bare IPv4 or IPv6 host, and any unparseable URL. `parseTopicItems` rejects a
   placeholder URL up front.
4. An unverified item is LABELLED, never silently presented: the flat report
   appends " [unverified - no web source]" and omits the Source line; the doc
   markdown carries the same label and renders
   "  - Source: not corroborated by a web search result".
5. **A source-less report is degraded.** When the deduped source list is empty
   the action sets `degraded = true` and pushes the note "No web sources were
   returned - the model answered without searching, so every item in this
   report is unverified." Both renderers surface `degraded` in the coverage
   line.
6. Out-of-window items are labelled, not silently mixed in. `windowCutoff`
   parses "the past 30 days", "the last 3 months", "the past 2 weeks", "the
   past year" and bare "30 days", returning null when unparseable (then no
   filtering). `markOutOfWindow` sets `background: true` on an item older than
   the cutoff that is not already flagged, surfacing the existing
   `[background]` label. An unparseable date is left alone.
7. **`buildCurrentEventsDocMarkdown` emits a real outline**: `# Current Events
   Report` as the title, the meta block as body, `## <topic>` per topic, and
   within a topic the item headline as a level-0 bullet with `Why it matters`
   and `Source` as level-1 sub-bullets indented by EXACTLY two spaces. The
   trailing `## Cross-cutting themes`, `## What changed since this deck was
   written`, `## Discussion prompts`, `## Sources` and `## Notes` sections keep
   their level.
8. `buildCurrentEventsReport` (the flat `reportText` other steps bind to) is
   otherwise UNCHANGED - byte-identical for identical input apart from the
   degraded marker and the unverified/background labels above.
9. `researchCurrentEventsAction`'s exported signature and its
   `ResearchCurrentEventsResult` shape (`report`, `reportMarkdown`,
   `sourceCount`, `topicsCovered`) are unchanged, so `steps.knowledge.ts`
   needs no edit.

## 88. Worked example programs in the lecture Q&A document (Feature C)

Acceptance criteria:
1. The `lecture-qa` step gains a `courseKind` input (type "text", options
   coding/applied, optional, the same shape the other generators use),
   resolved with `resolveCourseKind` and passed to the action. The step's
   other input keys and its two output keys are unchanged; the input-count
   assertion in `registry.lecture-qa.test.ts` reads 7.
2. `generateLectureQaAction` takes the course kind as an OPTIONAL trailing
   parameter defaulting to "coding", so its one existing call site is
   unaffected. Its return type extends to `{ questions, examples? }`.
3. **An applied (no-code) course gets NO code anywhere.** Its prompt contains
   no request for example programs and no code-bearing JSON shape, and
   examples are only ever parsed when the kind is coding - an applied course
   yields an empty list even if the model returns an examples array. This
   keeps entry 84 ("No generator in a no-code kickoff can produce code")
   green.
4. `parseQaExamples` is defensive: a missing or malformed value degrades to an
   empty list and never fails the run, entries with an empty title or code are
   dropped, and the list is clamped to at most 3.
5. "Where applicable" means BOTH the course is coding AND at least one usable
   example came back. Otherwise the document omits the section entirely - no
   empty heading, no placeholder.
6. The document renders `## Example programs`, then per example
   `### <title>`, the explanation as body, and the code inside a fence opened
   with three backticks plus the language - which `buildDocxFromPlainText`
   turns into a real monospace (Consolas) shaded code block with the
   indentation preserved and no stray backticks in the output.
7. `qaText` keeps its existing question format byte-identical, with the
   examples appended as a delimited block only when point 5 is satisfied.
8. The embedded provider fabricates no code - it returns no examples and makes
   no LLM call.
9. `LECTURE_QA` binds `courseKind` as a runtime field. (Unbound step inputs are
   skipped by both runners and never appear in the run form.)

## 89. Generated lecture decks sequence their topics logically (Feature D)

Context: a real 77-slide deck ("Module 07 - Algorithms and Data Structures")
split its regex material across two distant sections ("Introduction to Regular
Expressions" at slide 12 and "Introduction to Pattern Matching" at slide 40),
scattered three "Advanced ..." sections among introductory ones, placed the
foundational "Data Structures Overview" fourth behind two sections that depend
on it, and carried a 4-item agenda that did not match its 9 body sections.
Root cause: `expandTemplate` emits one contiguous deck section per loop item in
array order, so loop-item order IS section order - and nothing ever ordered
them. `enumerateBreadthFull` appends model-supplied subtopics after the seeds
and dedupes only on exact case-insensitive equality.

Acceptance criteria:
1. **A new pure module `src/lib/decks/sequence.ts`** exports
   `mergeNearDuplicates(items, subject?)`,
   `sequenceConceptsDeterministic(items, subject?)`, `sequenceConcepts(subject,
   items, provider)` and the `SequencedConcepts` shape
   (`items`, `merged`, `reordered`).
2. `mergeNearDuplicates` collapses items naming the same subject, not just
   exact duplicates: it normalizes away leading qualifiers ("introduction to",
   "understanding", "advanced", "basics of", "overview of", ...) and trailing
   "overview"/"basics"/"fundamentals", and merges on equality, whole-word
   containment, or a shared synonym key. The synonym table covers at least
   regular expressions / regex / pattern matching, dictionary / dict / hash
   map, list / array, efficiency / performance / complexity / big o, and data
   redundancy / single source of truth / normalization. It is idempotent.
3. **Ordering rules**, applied deterministically (no `Date.now`, no
   `Math.random`): subject-level foundations first, then ordinary items, then
   advanced items last; items sharing a subject family stay contiguous with
   the family's most foundational member leading; equal-ranked items keep
   their input relative order.
4. **A subject-level foundation outranks a topic-level introduction.** An item
   is subject-level when its residual topic (after stripping qualifiers) is
   empty, equals the normalized deck subject, or is a whole-word subsequence
   of it. An item that merely STARTS with "Introduction to" but names an
   unrelated sub-topic gets no foundational boost. This is what stops a deck
   from opening with the wrong topic.
5. **Pinned fixtures** (execute `sequenceConceptsDeterministic`):
   - Input ["Advanced List Functions", "Introduction to Regular Expressions",
     "Algorithmic Problem Solving", "Data Structures Overview", "Advanced
     Algorithmic Concepts", "Introduction to Pattern Matching", "Understanding
     Data Redundancy", "Advanced Data Handling"] with subject "Algorithms and
     Data Structures" yields, in order: Data Structures Overview; Introduction
     to Regular Expressions; Algorithmic Problem Solving; Understanding Data
     Redundancy; Advanced List Functions; Advanced Algorithmic Concepts;
     Advanced Data Handling. `merged` reports exactly one group, the two regex
     labels, and the survivor is "Introduction to Regular Expressions".
   - Input ["Advanced Joins", "Introduction to Indexing", "SQL Basics", "Query
     Performance Tuning", "Understanding Normalization"] with subject "SQL for
     Data Analysis" leads with "SQL Basics", with "Introduction to Indexing"
     demoted among the ordinary items.
   - Both are idempotent, and the output is always a permutation of the merged
     input - never an invented, renamed or dropped concept.
6. **The subject parameter is strictly additive.** Calling either function
   WITHOUT a subject reproduces the previous prefix-only behavior exactly (for
   fixture 1 that means leading with "Introduction to Pattern Matching"), so no
   existing caller changes behavior implicitly.
7. `sequenceConcepts` uses the LLM only to REORDER. The response must be a
   permutation of the input compared case-insensitively after trimming; a
   renamed, missing, extra or unparseable result is DISCARDED and
   `sequenceConceptsDeterministic` is used instead. The `embedded` provider
   never calls the model. It never throws.
8. `generateDeckFromTemplate` runs every loop group with more than one item
   through `sequenceConcepts` after the breadth pre-pass and before
   `expandTemplate`, regardless of the group's breadth setting. A group with 0
   or 1 items is passed through with no LLM call.
9. **The agenda matches the body.** `DeckGenContext` gains an OPTIONAL
   `orderedConcepts?: string[]` (additive, so existing callers and tests
   compile unchanged), and `buildDeckPrompt` injects the final ordered concept
   list with an instruction that the agenda slide must list exactly those
   topics in that order when the resolved deck contains an `agenda` or
   `objectives` role slide.
10. `SLIDE_STRUCTURE_REQUIREMENTS` and `APPLIED_STRUCTURE_REQUIREMENTS` in
    `src/lib/slide-prompt.ts` each carry one ORDER bullet immediately after
    their BREADTH bullet, so the three prompt-driven generators
    (`course-planning-grounding.ts`, `course-planning.ts`, `shared.ts`) inherit
    the same rule. The coding branch of `slideDeckJsonShape` /
    `slideStructureRequirements` still returns the existing constants, so entry
    83's assertions stay meaningful.
11. `expandTemplate`, the `DeckTemplate` / `ResolvedSlideSpec` types, every
    slide role, and `enumerateBreadthFull`'s contract are UNCHANGED.

## 90. Live class mode: transcribe, detect questions, answer in real time

A mode the instructor turns on at the start of class. It transcribes the room
live, detects student questions in the stream, and answers them from the
course material while the class is running. Entirely new code apart from the
navigation registration and one extraction in the workflow runner.

Acceptance criteria:
1. SUPERSEDED 2026-07-28 by entry 92. This point described a Manual subtab
   `live-class`. The feature was moved into the floating-action-button menu
   and the subtab was REMOVED at the user's request. There must be NO
   `live-class` entry in `ManualViewType`, the `destinations` array, the order
   list, `MANUAL_VIEW_LABELS`, `ManualView` in page.tsx, or the saved-view
   restore guard, and no `LiveClassTab.tsx`. See entry 92 for the current
   placement and for the migration rule covering a user whose persisted Manual
   view is still `"live-class"`.
2. **Two transcription paths**, chosen by the pure
   `selectTranscriptionPath(capabilities, override)`:
   - `auto` prefers Web Speech, falls back to the segmented-audio path, then
     `none`.
   - An EXPLICIT override that the browser cannot support returns `none` - it
     must never silently run the other path. This matters: a user who selects
     the segmented path should never be quietly switched to Web Speech, which
     ships room audio to Google.
3. **The Web Speech path survives a full class.** Chrome ends a continuous
   session after roughly 60s of silence and fires `onend` with no warning, so
   the recognizer restarts on `onend` while the session is active.
   `decideRestartOnEnd(state, nowMs)` with `recordRecognitionStart`:
   a session that ran longer than the fast-end threshold (3000ms) restarts
   immediately and RESETS `consecutiveFastEnds` to 0; a fast end increments it
   and backs off 500/1000/2000/4000ms; at 5 consecutive fast ends it returns
   `give-up` and a visible error is surfaced instead of looping.
   Observe: three ~60s runs then five 200ms runs produces
   restart(0), restart(0), restart(0), restart(500), restart(1000),
   restart(2000), restart(4000), give-up - and a healthy run afterwards
   resets the counter to 0. `no-speech` is never treated as an error.
4. **The segmented path re-encodes to WAV.** MediaRecorder timeslice chunks
   are NOT independently decodable (WebM/Opus fragments after the first carry
   no header), so a FRESH MediaRecorder is stopped and restarted per segment.
   Gemini does not accept audio/webm, so each segment is decoded with
   `AudioContext.decodeAudioData`, downsampled to `LIVE_SAMPLE_RATE` mono and
   encoded to 16-bit PCM WAV via `src/lib/live-class/wav.ts` before upload
   through `transcribeLiveAudioAction`, carrying the session's `hintTerms`.
   Do not "simplify" this back to posting recorder chunks.
5. **Question detection does not fire on instructor filler.**
   `looksLikeQuestion` rejects an explicit rhetorical-prompt list ("any
   questions", "does that make sense", "make sense?", "everyone good",
   "any thoughts", "right?", "ok?") and bare fragments under three words
   unless they end in "?". Observe: over a corpus of 11 instructor-filler
   utterances it returns false for every one.
6. **Confusion-form questions are not lost.** `scoreQuestion` credits an
   EMBEDDED ASK marker with the same weight as an interrogative opener, and
   both functions read one shared `EMBEDDED_ASK_PHRASES` list.
   `DEFAULT_MIN_CONFIDENCE` is exported and `detectQuestions` defaults off it,
   so the scorer and the cutoff cannot drift apart. Regression: "I'm confused
   about how the dictionary get method works." and "I don't understand why we
   need f-strings here." each score at or above the default (0.55 at the time
   of writing) and SURVIVE `detectQuestions` at its default threshold. They
   previously scored 0.45 and were silently dropped - the most valuable
   utterances in a classroom.
7. `dedupeAgainstAnswered` drops exact, contained and near-duplicate restatements
   (shorter at least 60 percent of the longer) so a revised transcript cannot
   trigger the same answer twice. `mergeInterim` replaces an interim result by
   id rather than appending, so revisions do not duplicate the transcript.
8. **Answering is single-flight and FIFO.** `enqueueQuestion` /
   `startNextIfIdle` / `completeInFlight`: at most one
   `answerLiveQuestionAction` is in flight; the rest wait in ask order. An
   answer that was not grounded in the course material is clearly marked.
9. **Context is gathered ONCE per session.** `buildLiveSessionContextAction`
   runs at start, not per question - this is what keeps answers real-time
   (the repo's measured baseline is ~2-5s for one ungrounded Gemini call).
   It passes REAL material loaders via `buildServerMaterialLoaders`
   (src/lib/workflows/step-helpers-server.ts), NOT nulls, so the
   course-export source can contribute; it returns `materialsSource` so a
   thin context is diagnosable rather than silent. A loader that throws is
   caught and degrades to the next source.
10. `buildServerMaterialLoaders` is ONE implementation shared by
    `server-runner.ts` and `live-class.ts`. server-runner's behavior is
    unchanged by the extraction (server-runner.test.ts and
    server-runner.fanout.test.ts stay green).
11. **A persistent recording indicator is visible for as long as the session is
    active**, showing elapsed time, without scrolling. The user explicitly
    chose an indicator and NO consent-acknowledgement gate; do not add one
    without being asked.
    AMENDED 2026-07-28 by entry 92: the indicator now lives on the FAB itself,
    not inside a tab, because the feature moved into a CLOSABLE floating
    window. The requirement is unchanged and is now stricter to satisfy - it
    must remain visible while the window is closed AND while the dial is
    expanded. See entry 92 points 4-6.
12. **Live mode has its own capture settings.** `noiseSuppression`,
    `echoCancellation` and `autoGainControl` default OFF (they are tuned for a
    single close presenter and suppress a student speaking across the room)
    and persist under `ta-live-*` keys. The `ta-rec-*` keys are NOT reused or
    mutated.
13. **No state updates at audio-frame rate.** Final utterances update state
    immediately; interim churn is flushed at about 3 times a second. Setting
    state per result previously "re-rendered the whole tab and broke the MUI
    device dropdowns out from under clicks" (the comment at
    useRecorder.ts:154).
14. Timers use `startFrameTicker` (worker-backed) for the segment and autosave
    cadences, because an instructor leaves the tab hidden behind slides and
    requestAnimationFrame halts while main-thread timers throttle to ~1/s.
15. **Persistence is an incremental append.** `unsyncedSegments` sends only
    segments after the last synced id (the server-action body cap is 10MB, so
    the whole transcript is never resent), and `appendClassSessionData`
    dedupes by id so a retried append cannot duplicate. Table
    `public.class_session_transcripts` (migration
    20260908000000) is owner-scoped with RLS on select/insert/update/delete
    and indexed on (user_id, started_at desc); every query in
    `src/lib/live-class-sessions.ts` filters by user_id, and every row goes
    through the explicitly typed `mapClassSession` (a malformed jsonb value
    degrades to [], an unknown status to "ended"). The table is registered in
    BOTH types.tables-a.ts and the `Database.public.Tables` map wrapped in
    `Expand<>`, or typed selects collapse to never.
16. **Stopping does not lose the tail of the class.** On stop, in-flight
    segment transcriptions are settled BEFORE the final autosave and the docx
    build. `decideSettle(pendingCount, elapsedMs, timeoutMs)` returns
    `proceed` when nothing is pending, `wait` while pending under the timeout,
    and `proceed-with-warning` at or past it - it must NEVER return a plain
    `proceed` while work is outstanding, so a truncated transcript is always
    visible. Queued-but-unstarted questions are dropped deliberately (no new
    LLM calls after class) and reported. `decideStop` makes the stop path
    idempotent: pressing Stop repeatedly runs the save exactly once.
17. The end-of-class artifact is `buildSessionMarkdown` rendered through
    `buildDocxFromPlainText` and saved to the Files library (and the course's
    misc files when a tile is selected). A save failure surfaces a note and
    never throws.
18. Cleanup on unmount and on stop stops the recognizer, stops every
    MediaStream track, closes the AudioContext and stops every ticker. A
    leaked mic stream would leave the browser's own recording indicator lit
    after the user navigates away.

## 91. The weekly announcement pulls the module it names (Feature F)

Reported: an announcement said "We are moving into Module 07 this week" and
then described Module 06's content (external text files, while loops over
large datasets, f-strings, CSV and JSON) for a Canvas course whose Module 07
is Algorithms and Data Structures.

Acceptance criteria:
1. **Root cause, fixed:** `pull-current-materials`
   (src/lib/workflows/registry/steps.rubrics.ts) selected the Canvas module by
   ARRAY POSITION (`content.modules[displayWeek - 1]`). Any entry before
   Module 01 - a "Course Information", "Start Here", "Welcome" or "Syllabus"
   module - shifts every lookup by one, so week 7 read the seventh entry,
   Module 06. Positional indexing is no longer the primary path.
2. `extractModuleNumber(name)` and `findModuleByNumber(modules, target)` are
   pure and exported from `src/lib/workflows/module-value.ts`. The pattern
   extracts the first integer after a "module" or "week" token,
   case-insensitively, tolerating zero-padding, no separator, and trailing
   topic text. Observe, against a list whose first entry is "Course
   Information": `findModuleByNumber(list, 7)` returns "Module 07: Algorithms
   and Data Structures" while `list[6]` is "Module 06". `extractModuleNumber`
   yields 7 for "Module 07: Algorithms", "Module 7", "Module07", "Week 7 -
   Recursion" and "module 7"; null for "Course Information" and "Start Here";
   and 7 must NOT match "Module 17" or "Module 70".
3. The step gains an optional `moduleRef` (lmsModule) input. When bound it is
   passed straight to `gatherModuleMaterials` (which already matches a
   `name|<name>` reference) with NO positional lookup.
4. When `moduleRef` is unbound the step matches BY NAME first and falls back to
   `content.modules[displayWeek - 1]` only when nothing matches - and records
   an explicit note when it does. A silent positional guess is what caused
   this bug and must never be silent again.
5. After resolving, the step compares the pulled module's number against the
   target week and pushes a visible note when they disagree. It does not
   throw - an oddly numbered course may legitimately differ - but it is never
   invisible.
6. **The name and the content come from ONE source.** In
   `WEEKLY_KICKOFF_ANNOUNCEMENT` (presets/communication.ts),
   `pull-current-materials.moduleRef` binds from step 0's `moduleRef`, and
   `compose-weekly-announcement.moduleName` binds from STEP 1's `moduleName`
   (the module actually pulled), not step 0's. Previously the title came from
   step 0 and the body from step 1, so a mismatch could never be noticed.
7. `pull-current-materials` is used by exactly one preset; every preset using
   the step binds the new input (an unbound step input is silently skipped by
   both runners).
8. Unchanged: the week-resolution precedence (explicit bound week >
   modulesAhead > derived), the 20000-character materials cap, the repo-pull
   loop, and the step's five output keys.

## 92. Live class lives in the FAB, not a Manual subtab

Supersedes entry 90 point 1 and amends entry 90 point 11. The user asked for
the feature to be "inserted into the fab" opening "in a floating modal like
the ai chat", and then for the subtab to be removed.

Acceptance criteria:
1. **The Manual subtab is GONE.** No `live-class` in `ManualViewType`, the
   `destinations` array, the order list, `MANUAL_VIEW_LABELS`, any
   active/resolve helper, `ManualView` in page.tsx, or the saved-view restore
   guard. `LiveClassTab.tsx` is deleted and nothing imports it. Observe:
   `grep -rn "live-class\|LiveClassTab" src/app/components/manual/manual-rail.ts src/app/page.tsx`
   returns nothing.
2. A user whose persisted Manual view is still `"live-class"` falls back to a
   valid subtab on load rather than rendering nothing.
3. **A fifth FAB dial entry** opens the feature in a draggable floating window,
   following the four existing entries' pattern: its own persisted open state
   and position in localStorage, a viewport-derived default position, and its
   own size constants. The window body reuses `SessionSetupPanel`,
   `LiveStatusBar`, `TranscriptPanel` and `AnswersPanel` unchanged - this was a
   relocation, not a redesign - with each panel scrolling internally so the
   window never overflows the viewport.
4. **Closing the window does NOT stop the class.** `useLiveClassSession()` is
   called EXACTLY ONCE, in `AiChatFab.tsx`, which `src/app/layout.tsx` mounts
   once app-wide. The open flag only controls whether `LiveClassWindow`
   renders; the hook, its state and its media capture never unmount when the
   window closes. Toggling the window must not re-run session setup, must not
   re-request the microphone, and must not create a second session row. Only
   the explicit End control stops a session. Observe: `grep -rn
   "useLiveClassSession(" src/app` returns exactly one call site outside the
   hook's own file.
5. Only ONE live session can exist at a time - which follows structurally from
   point 4's single hook instance, not from a runtime guard.
6. **The recording indicator lives on the FAB** and is visible whenever a
   session is active, INDEPENDENT of whether the window is open and whether
   the dial is expanded. Its visibility is driven by
   `isLiveClassSessionActive(phase)`.
7. **The indicator cannot collide with the dial.** The SpeedDial expands
   vertically from the FAB; `computeLiveBadgePosition` places the badge in a
   horizontal column beside the FAB, vertically centred on it, so a collision
   is impossible BY CONSTRUCTION at any number of dial entries rather than
   tuned for the current five. Observe, with dial margins 24 and a 56px FAB:
   the badge lands at right 92 / bottom 36-68 while the FAB occupies right
   24-80 / bottom 24-80 - left of the FAB, never above its top edge, and
   overlapping none of five simulated dial actions. Do not "simplify" this
   back to a fixed offset above the FAB.
8. Badge `z-index` (10000) outranks the SpeedDial (9999) and every floating
   window (9998, the shared `.selectionChatWindow` class), so a window dragged
   over that corner cannot hide it. It keeps `pointer-events: none` so it
   never intercepts a click meant for the FAB.
9. `LiveClassSessionPhase` is declared EXACTLY ONCE (in the pure,
   zero-import `fab-live-indicator.ts`) and imported where needed.
   `isLiveClassSessionActive` resolves through a
   `Record<LiveClassSessionPhase, boolean>` table, so adding a phase to the
   union without deciding its active-ness is a COMPILE ERROR rather than a
   silently wrong indicator. Every terminal path in `useLiveClassSession.ts`
   returns to `"idle"`, so the badge goes dark when a session really ends,
   while `starting` and `ending` still count as active so it does not blink
   off mid-transition.
10. Cleanup still holds on stop and on FAB unmount: the recognizer stops,
    every MediaStream track stops, the AudioContext closes, every ticker
    stops. A leaked mic stream would leave the browser's own recording
    indicator lit after the user navigates away.

## 93. Live class answers are bullets with links the code resolved

The user: "all answers that are output should be output in the form of
bullets, not paragraphs" and "the answers should also provide helpful links
and visuals. preference the links to the appropriate pages in the visualizer,
and the official documentation" - scoped explicitly to the LIVE CLASS PANEL.

Acceptance criteria:
1. **Bullets, not prose.** `buildAnswerPrompt` requires 3-6 bullets as "- "
   lines within the existing word budget, each a scannable point the
   instructor can glance at and speak from. The previous instruction ("plain
   spoken sentences, no headings, no bullet points, no markdown") is gone.
2. **The model NEVER emits links; code resolves them.** The prompt forbids
   URLs and markdown links and instead requires a trailing `CONCEPTS:` line of
   at most 4 canonical concept names. This is deliberate: entry 87 exists
   because a model invented four `example.com` citations, and a fabricated URL
   shown to a class mid-lesson is the same failure with an audience.
3. `stripModelUrls` removes any URL or markdown link the model emits anyway,
   keeping a markdown link's TEXT. Observe: "Read the [official
   docs](https://example.com/fake)" becomes "Read the official docs".
4. **Unmapped concepts get NO link, never a guess.** `CURATED_DOCS_MAP` is an
   explicit exported constant of official documentation ROOTS (never deep
   links that rot). Observe: "python" resolves to docs.python.org, "react" to
   react.dev, a named engine like "mysql" to dev.mysql.com - while generic
   "sql", "databases" and an unknown concept resolve to NOTHING. There is
   deliberately no generic SQL or databases entry.
5. **Visualizer links are never fabricated.** `resolveVisualizerLinks` matches
   locally against the parsed visualizer index and returns nothing for a
   concept absent from it - a dead link in front of a class is worse than no
   link. It matches both label and slug forms.
6. **The visualizer index is loaded ONCE per session**, by
   `loadVisualizerIndexAction` called via `Promise.all` alongside
   `buildLiveSessionContextAction` in `useLiveSessionPersistence.start()`, and
   threaded into every answer call thereafter. `findVisualizerConceptAction`
   fetches navItems.ts from GitHub per call and must NOT be on the
   per-question path. Observe: answering makes no `getFileText` call. A failed
   index load is a quiet warning and never blocks starting a class.
7. `answerLiveQuestionAction` still makes exactly ONE `callLlm` per question -
   link resolution is local and adds no model call - and keeps its existing
   `answer`, `grounded` and `sources` fields plus the `NOT_IN_MATERIAL`
   sentinel and `SOURCES:` parsing from entry 90.
8. `dedupeLinks` dedupes by url, orders visualizer links before docs links,
   and caps the list (default 4).
9. **The panel renders bullets and links properly**, with a small
   dependency-free renderer - no markdown library, no
   `dangerouslySetInnerHTML`. Bullets become a real list; a non-bullet line
   still renders readably rather than disappearing; links are anchors with
   `target="_blank"` and `rel="noopener noreferrer"`, badged to distinguish a
   visualizer link from a documentation link.
10. **The saved document matches what was shown live.** `buildSessionMarkdown`
    renders an answer's links as a parent bullet with two-space-indented
    `[label](url)` children, mirroring the existing `- Sources` idiom, so
    `buildDocxFromPlainText` produces real hyperlinks with the LABEL visible
    rather than a wall of raw URLs. Omitted entirely when an answer has no
    links.
11. **Links survive the database round trip.** `coerceAnswer` in
    `live-class-sessions.ts` reads `links` with the same defensive discipline
    as the rest of that mapper: a non-array degrades to none without throwing,
    malformed entries are dropped, and an entry whose `kind` is neither
    "visualizer" nor "docs" is DROPPED rather than defaulted - a wrong badge
    on a link is worse than no link. A row written before this change, with no
    `links` key, still maps cleanly.
12. Scope: NO other answer generator changed. `generateLectureQaAction`,
    `generate-module-answers`, `buildSampleAnswerPrompt` and the grading
    prompts all still produce prose, and entry 88's byte-identical `qaText`
    format still holds.

## 94. Detailed workflow run logs, downloadable as text

Before this, `workflow_runs` held 7 columns, written ONCE after a run ended.
Its own migration header called it "a signal, not an audit log". The
consequence that mattered: a run killed by the Vercel 60s cap, a crash, or a
closed browser tab wrote NO ROW AT ALL - the failures most worth logging were
invisible.

Acceptance criteria:
1. **A run row exists from the moment a run starts.** All five call sites call
   `startWorkflowRun` BEFORE any step executes and `finishWorkflowRun` after,
   REPLACING the terminal `recordWorkflowRun` insert (never both - that would
   write two rows). Observe the ordering in each: cron route (mint at :150 ->
   start :155 -> finish :174 on the skip branch; mint :186 -> start :190 ->
   run :194 -> finish :249), workflow-trigger-runner (:130 -> :138 -> :145 ->
   :173), triggers/[token] route (:108 -> :110 -> :117 -> :142), github/webhook
   route (:131 -> :133 -> :141 -> :164), useWorkflowRun (:364 -> :371 -> ... ->
   :942). A start row written after the first step would defeat the feature.
2. A run that dies mid-flight leaves a row stuck in "running" with its
   `started_at` and whatever step rows were already written. A cron tick
   truncated by the soft deadline finishes as "skipped" instead, so a
   deliberate deferral does not look identical to a crash.
3. **Per-step rows are written as the run proceeds**, never batched at the end,
   so a run killed at the cap retains the steps that completed. Each carries
   index, type, terminal status, the FULL untruncated error, a summary when the
   step produced one, the ordered progress messages, and start/finish instants
   from which `recordRunStep` derives a duration. Step timings did not exist
   before this and were introduced here.
4. **Progress messages are captured in BOTH runners.** The unattended runner
   previously passed `const noopProgress = () => {}` to every step, discarding
   every message from a cron/trigger/webhook run (~45 step modules emit them).
   It now collects them, capped per step so a chatty step cannot bloat a row.
   The attended runner keeps its existing single-string UI display unchanged
   AND accumulates the full ordered list. Both runners share
   `src/lib/workflows/run-logging.ts` so their log shape cannot diverge.
5. **Fan-out is attributable.** `institution` and `courseId` from the server
   runner's outcomes reach `recordRunStep`, so a per-course failure is
   identifiable rather than flattened into one list.
6. **Logging never breaks a run.** `safeStartWorkflowRun`, `finishWorkflowRun`
   and `logStepOutcome` all swallow their failures (verify: each wraps in
   try/catch, and `logStepOutcome` returns early when logging is unavailable).
   A logging outage degrades to a missing log, never a failed workflow.
7. `buildRunLogText(run, steps)` in `src/lib/workflow-run-log-text.ts` is PURE
   (no Supabase import, no `Date.now()`) and renders: a header (workflow name
   and id, run id, trigger source and ref, status, started/finished, duration,
   step and error counts), the full untruncated detail, one block per step in
   index order with duration, institution/course, ordered progress messages,
   the full error and the summary, and - for a run with no finish record - the
   trailing line "This run has no finish record: it did not complete (killed by
   a time limit, a crash, or an interruption)."
8. **The workflow-completed trigger does not fire on unfinished runs.** Run
   rows now appear at START, which would otherwise mis-fire
   `decideWorkflowCompleted` (its filter is only `status !== "skipped"` when
   `requireSuccess` is false) AND then swallow the real completion, because
   finishing is an UPDATE so `created_at` never changes and the row falls
   behind the cursor. All four read helpers in `workflow-runs.ts`
   (`latestWorkflowRun`, `runsSinceForWorkflow`, `latestRunAnyWorkflow`,
   `runsSinceAnyWorkflow`) therefore EXCLUDE non-terminal runs at the query
   level AND again in JS (two independent layers - removing either alone must
   not let a running row through), and report/order/compare by
   `finished_at ?? created_at` rather than `created_at`. That fallback keeps
   pre-change rows working, and the completion-time comparison is what stops a
   long run that spans a poll interval being missed. `decisions.ts` and
   `event-sources.ts` are NOT modified.
9. `listRecentRuns` and `getRun` deliberately DO return running rows - a stuck
   run is exactly what a log view should show. Only the trigger reads exclude
   them.
10. The `workflow_runs` UPDATE policy added by migration
    20260909000000 is required: without it the finish-update silently fails
    under RLS. `workflow_run_steps` is a child table (not jsonb) because steps
    are written incrementally from a function under a 60s budget and a failed
    run must retain what it wrote - a read-modify-write of one jsonb column
    would lose exactly that.
11. Fixed along the way: `useWorkflowRun.ts` numbered errors by position in the
    FILTERED error list (`allErrors.map((msg, i) => \`step ${i + 1}\`)`), so
    "step 2 failed" could name the wrong step. It now uses the real step index.

## 95. Live class question detection handles contractions

Reported: "it doesn't seem to recognize contractions are also questions (what
is the complexity vs what's the...)".

Acceptance criteria:
1. `expandContractions(text)` is exported and pure, normalizing contracted
   forms before ANY matching. It handles BOTH the straight apostrophe and the
   typographic apostrophe (U+2019) - a speech recognizer and a phone keyboard
   emit different characters, so missing one leaves the bug live for half of
   real input. Word-boundary matched, so the real words "wont" and "cant" are
   untouched while "won't" and "can't" expand.
2. BOTH `looksLikeQuestion` and `scoreQuestion` normalize through it, so a
   contraction and its expansion are treated identically. The invariant is
   EQUAL SCORES, not merely both above threshold - equal scores are what stop
   contractions drifting back toward the cutoff.
   Observe, for each pair: "What's the complexity of this loop?" scores 0.90
   like its expansion (was 0.65); "Where's the file saved?" scores 0.90 (was
   0.50, exactly on the cutoff); "I'm confused about recursion" scores 0.55
   and SURVIVES `detectQuestions` (was 0.40 and dropped); "It's confusing how
   the loop ends" is detected (was missed in both spellings).
3. The reported case works: "What's a dictionary comprehension" with NO
   question mark is detected and survives `detectQuestions` at the default
   threshold. It was dropped before while its expansion was caught.
4. `EMBEDDED_ASK_PHRASES` holds EXPANDED forms only, so both spellings match
   through normalization; "it is confusing" was added, being the same signal
   as "i am confused".
5. The rhetorical filter still rejects instructor filler AFTER normalization -
   "that's" normalizes to "that is", so re-verify the whole corpus: "any
   questions", "does that make sense", "make sense?", "everyone good",
   "any thoughts", "right?", "ok?", plus the newly-relevant "that's fine",
   "that's it", "let's move on". Zero leaks.
6. Fixed by scoring, NOT by lowering `DEFAULT_MIN_CONFIDENCE` (still 0.5) -
   lowering it would let genuinely marginal text through.

## 96. Live class Q&A: text log download and new-answer alerting

Two requests: "give me downloadable logs in text files for the live class q&a
feature" and "the q&a session also needs to do a better ux job of alerting the
user when a new answer appears".

Acceptance criteria:
1. `buildSessionLogText(state, meta)` in `src/lib/live-class/session-log.ts` is
   pure and deterministic (all timestamps from its arguments), producing plain
   text: a header (course, module, start, end or still-running, elapsed,
   segment and answer counts); a questions-and-answers section with each
   answer's asked/answered offsets, question, answer bullets as lines, grounded
   flag, links as label-and-url lines, and sources; then a full transcript with
   `[mm:ss]` prefixes. A session with no answers renders an explicit line, not
   an empty section.
2. A "Download log" control in the live class window works BOTH during a live
   session and after it ends, downloading a `.txt` via the browser-download
   idiom. `hasSessionLog` gates whether it is offered.
3. The `.txt` is ALSO saved to the Files tab at end of session ALONGSIDE the
   existing Word document, not instead of it. A save failure degrades to a
   visible note. `buildSessionMarkdown` and the docx artifact are unchanged.
4. **Alerting escalates beyond the panel**, because the window is usually
   closed (it lives in the FAB), the tab is usually hidden behind slides, and
   the instructor is teaching: a per-answer "New" marker plus an "N new
   answers - jump to newest" affordance in the panel when scrolled away; an
   unread count on the FAB when the window is CLOSED, distinct from the plain
   recording state; and a `(N)` prefix on `document.title` while the tab is
   hidden, restored exactly on clear, on session end, and on unmount.
5. The panel affordance must NOT auto-scroll the instructor away from what
   they are reading - the existing `isAtBottom` / `nextAutoScrollState`
   suppression keeps holding.
6. **Unread state has ONE source.** `unreadState` in `useLiveClassSession.ts`
   feeds the panel markers, the FAB badge and the title prefix, and is cleared
   only through `markAnswersSeen`, triggered from exactly two places (the
   window-open effect and `onAnswersVisibilityChange`). Three independent
   counters that can disagree is the failure mode this avoids.
7. The optional sound cue is OFF BY DEFAULT behind a persisted `ta-live-*`
   setting - a classroom is exactly where an unexpected noise is unwelcome -
   and never plays for an answer already seen.
8. `useLiveClassSession` takes `{ windowOpen }`; `AiChatFab` passes the live
   class window's open flag. Closing the window still does not stop the class
   (entry 92 point 4).

## 97. The lecture zip actually reaches the instructor

The user asked for the no-code kickoff to produce a module-content zip. It
already did - `save-zip-to-course` runs, fed from
`lecture-materials-from-schedule` through the `"3.files"` remap that
compensates for the skipped `lecture-zip` step. The real defect was DELIVERY:
they never received it.

Acceptance criteria:
1. `assembleLectureFiles` auto-downloads the zip whenever a DOM is present.
   The previous condition also required `tileLms !== "blackboard" && tileLms
   !== "canvas"`, so a Canvas-connected course - the common case - never
   downloaded. Only the `typeof document !== "undefined"` guard remains,
   because that is a genuine capability check (a headless run has no DOM), not
   a policy choice. `tileLms` and its institution-fields lookup were removed
   as dead code.
2. The comment above that block states why: the cartridge from
   `steps.lms-export.ts` is an import artifact FOR the LMS, while the zip is
   the instructor's own copy - they are not substitutes.
3. `downloadSkipped` is true ONLY for the no-DOM case, and the step summary
   then names the artifact and where it landed: "zip saved to the Files tab as
   \"<name>\" - this run had no browser to download it to". An unattended run
   must not leave the user unable to find the file.
4. Both kickoff paths are covered because both route through
   `assembleLectureFiles`: `lecture-zip` (COURSE_KICKOFF) and
   `lecture-materials-from-schedule` (NO_CODE_KICKOFF).
5. No artifact, name, or save location changed - this is delivery only. The
   Files tab's per-row Download is unconditional (unlike Play and Strip audio,
   which are gated on file kind), so bundle rows were always retrievable
   there; the defect was that nothing told the user so.

## 98. GitHub submission code reaches the drafted grades page

Asked to pull code from GitHub-URL submissions, the prerequisite turned out to
be that such submissions were never graded at all.

Acceptance criteria:
1. **URL-only submissions are no longer dropped.** `CanvasSubmission`
   (`src/lib/canvas/submissions.ts`) now declares and reads `url` and
   `submission_type` - Canvas returns both as standard fields regardless of
   `include[]`, but they were never declared, so they were never read. The
   drop condition is now `!text && files.length === 0 && !submittedUrl`; a
   submission with nothing at all is still skipped. Before this, a student
   who submitted only a link had no body and no attachments and was skipped
   silently before grading.
2. The URL is read only for link-shaped submission types (guarded against
   `on_paper` / `none`), carried onto `CanvasStudentWork`, and through
   `canvasWorkToEntry` onto `StudentSubmissionEntry`, whose `content` gains a
   `Submitted link: <url>` line and a "Submission link" entry in
   `submittedFiles` - so the grading prompt never receives an empty string.
3. **The workflow does not fetch the repo.** The user's architecture: "have
   the logic that retrieves the code at the github url ... be something the
   draft page calls". Nothing under `src/lib/workflows/` changed. Verify with
   `git log`/`git show` that this commit touched no workflow file.
4. `parseSubmissionGithubUrl` handles the forms students actually paste:
   plain, trailing slash, `/tree/<ref>`, `/tree/<ref>/<subpath>`, `.git`, and
   `www.`. A non-GitHub host returns an error naming the host; garbage and
   empty return clear errors. It NEVER throws.
5. **The fetch is bounded**, by named constants:
   `MAX_SUBMISSION_REPO_FILES` 80, `MAX_SUBMISSION_FILE_BYTES` 300000,
   `MAX_SUBMISSION_REPO_TOTAL_BYTES` 3000000, plus
   `SUBMISSION_SOURCE_EXTENSIONS`. Observe: a tree containing `main.py`,
   `src/utils.js`, `README.md`, `node_modules/lib/index.js`, `.git/config`,
   `assets/logo.png`, `package-lock.json`, `dist/out.min.js` and an oversized
   `huge.py` keeps only the first three and sets `truncated`. Only `blob`
   entries are considered.
6. **The page shows WHICH code it fetched.** The action resolves the ref to a
   commit SHA and pins every tree/content call to it; the panel displays the
   repo and ref with a warning, because the draft was graded against the repo
   as it stood during the run while the page fetches live. Presenting live
   code as the graded code would silently mislead.
7. Loading is on demand, not on render - fetching every student's repo at page
   load would hammer the GitHub API.
8. Running reuses the pre-existing `runSubmissionCodeAction` and
   `src/lib/code-runner.ts`, which executes through EXTERNAL services (Piston,
   falling back to keyless Wandbox) and never in process. Realistically
   runnable languages are those in the runner's extension map: Python,
   JavaScript, TypeScript, Java, C, C++. Anything else displays but reports
   plainly that there is nothing runnable, and code needing dependencies
   surfaces as a stderr/exit-code failure rather than silence.
9. Nothing fetched is written to the persisted draft payload - the page reuses
   its existing lazy submission pull, which is what keeps the live-vs-graded
   distinction honest.

## 99. Lecture decks plan their concepts instead of stopping at one

A generated MGT 422 week ("Project Integration and Initiation") was 16 slides
covering ONE concept, the Project Charter: 46 bullets (2.9 per slide against a
maximum of 4), 10,140 characters, roughly 2,817 output tokens against a 12,288
cap - **23% utilisation**. The ceiling was never the constraint. The contract
said "maximum breadth" but then described a structure that one concept
satisfies completely, so the model met every literal requirement and stopped.

Acceptance criteria:
1. **Concepts are planned before slides are generated.** `planWeekConcepts`
   (`src/lib/lecture-concepts.ts`) runs before the slide prompt is built,
   reusing `enumerateBreadthFull` from the deck engine and `sequenceConcepts`
   for pedagogical ordering. Note `enumerateBreadthFull` is called with an
   EMPTY seed list, not `[topic]` - seeding it with the topic let the raw
   topic line survive alongside its own decomposition.
2. `splitCompoundTopic` is the deterministic degrade path for the exact input
   that produced the failure: a bare compound week title. Observe:
   "Project Integration and Initiation" yields ["Project Integration",
   "Initiation"]; "Risk Management, Procurement and Stakeholder Engagement"
   yields three; "Loops" stays one.
3. **Concept count scales with lecture length** via `conceptCountForMinutes`,
   with named bounds (MIN 2, MAX 7, ~10 minutes per concept), clamped over a
   20-150 minute range. Observe: 50 minutes yields 5; 5 and 20 minutes yield
   2; 75 minutes and above yield 7.
4. The prompt names the planned concepts explicitly and states that each needs
   its own complete cycle - "do not stop after only the first one", "a concept
   is not covered until its own full cycle appears", "do not merge two listed
   concepts into a single cycle". This wording exists because the observed
   failure was the model stopping after one.
5. **The token budget follows the breadth.** Raising concept count without
   raising the cap would move truncation rather than remove it. See entry 100
   for the final figure and its arithmetic.
6. Bullets must carry named frameworks, real figures and named artifacts
   rather than generic statements; speaker notes carry a concrete 60-120 word
   target (the observed average was 255 characters).
7. Both course kinds get the breadth floor - a programming lecture is no more
   entitled to one concept than an applied one.

## 100. Applied (non-code) courses get a purpose-built lecture cycle

The applied contract was a clone of the coding one - Concept, Example,
Walkthrough, Practice, Answer. Two of its assumptions do not hold outside
programming: "Walkthrough" means explaining code line by line, and "Answer"
implies a single correct response, which is the wrong lesson for a course
teaching professional judgment.

Acceptance criteria:
1. The applied per-concept cycle is SIX slides with these title prefixes:
   `Principle:`, `In Practice:`, `Artifact:`, `Judgment Call:`, `Your Turn:`,
   `Model Response:`. Plus two deck-level sections applied courses need and
   coding ones do not: `Failure Modes:` and `Terminology:`. The deck-opening
   `Case Study:` is kept - it motivates the lecture while `In Practice:`
   grounds each concept.
2. **The coding contract is byte-identical.** `SLIDE_DECK_JSON_SHAPE` and
   `SLIDE_STRUCTURE_REQUIREMENTS` are unchanged, pinned by a test asserting
   their exact length and sha256 computed FROM THE LIVE FILE rather than a
   hand-typed hash, so a transcription error cannot produce a false pass.
3. `Example:`, `Walkthrough:` and `Answer:` must NOT appear in the applied
   requirements, and a test asserts their absence - so re-cloning the coding
   cycle into applied is caught rather than tolerated. Note `Practice:` is a
   substring of both `In Practice:` and `Post-Lecture Practice:`, so any
   assertion on it must match precisely or be omitted.
4. **Entry 84 stays true**: the applied JSON shape carries no `code` or
   `codeLanguage` anywhere and the requirements forbid them explicitly.
5. `buildConceptCycleInstruction(concepts, kind)` is course-kind aware,
   naming the six-slide applied cycle or the five-slide coding one, and
   `generateSlidesFromTopic` threads the kind through.
6. Nothing that keys off the old title prefixes breaks. Verified consumers:
   `propagateExampleCodeToFollowups` (reached by the applied path, inert both
   before and after because applied slides carry no code), `roleTitlePrefix` /
   `propagateExampleCode` in the deck-template engine (unreachable from the
   applied path - that engine imports the CODING constants directly and takes
   no course kind), and `src/lib/pptx.ts` (branches on the presence of a
   `code` field, never on title text). Re-check these before renaming any
   prefix again.
7. Token cap is 49152, sized for the applied worst case: 8 fixed deck slides
   plus 10 slides per concept (6-cycle plus 4 post-lecture practice) times 7
   concepts = 78 slides at roughly 1500 chars each, about 32,500 tokens. That
   is three quarters of `gemini-3.1-flash-lite`'s documented 64K output
   ceiling, leaving real headroom.
8. `course-kind.test.ts`'s "the applied requirements keep the full pedagogical
   shape" guard exists to stop the applied deck degrading into a lesser copy
   of the coding one. Its marker list was updated to the new shape and is
   strictly MORE demanding (14 markers, up from 10) - do not fix a future
   failure of it by deleting markers.

## 101. The instruction checklist is surfaced on the drafted grades page

A full-credit checklist derived from the assignment instructions was ALREADY
generated, persisted and readable - and never displayed.

Acceptance criteria:
1. The existing chain is intact and is what the page reads:
   `synthesizeFullCreditChecklist` runs in parallel with Canvas grading
   (`src/app/actions/grading.ts`), is merged onto the run, survives
   `stripGradingRunForDraft` (which spreads `...run` and maps only `results`),
   and is coerced back by `src/lib/grading-drafts.ts`.
2. **One panel per ASSIGNMENT, never per student.**
   `buildAssignmentChecklistSections` returns one section per run entry.
   Observe: two assignments across five student results yield two sections.
3. An empty checklist renders an honest message, never an empty list -
   `hasRenderableChecklist(checklist)` takes the ARRAY and is
   `checklist.length > 0`.
4. **Derivation is on demand, never on render.** Deriving for every assignment
   at page load would bill an LLM call per assignment per open.
   `deriveAssignmentChecklistAction` is reachable only from an explicit
   control.
5. It reuses `synthesizeFullCreditChecklist` rather than a second prompt - two
   prompts producing two different checklists for one assignment is the
   divergence this avoids.
6. **A derived checklist surfaces failure instead of filler.**
   `deriveFullCreditChecklist` returns `{error}` on an LLM failure rather than
   falling back to `defaultFullCreditChecklist()`, because an instructor who
   explicitly asked must not be shown generic boilerplate that looks
   assignment-specific. The eager path keeps its graceful degrade.
7. The result is cached back onto `grading_drafts.payload` (jsonb, no
   migration) via `applyDerivedChecklist`, which is immutable and writes only
   the target run - so reopening does not re-derive or re-bill.
8. No grading workflow, step or preset changed.

## 102. Zero-out and repo grading run across every course, unattended

Two jobs were requested on a 15-minute unattended cadence across all courses
in all institutions. The cadence already existed (a GitHub Action at cron
`4,19,34,49`); both presets were single-course.

Acceptance criteria:
1. `draft-missing-zeros` gains an optional `courses` (`hubCourseList`) input
   and `batch-grade-repos-to-draft` gains an optional `hubCourses`
   (`hubCourseList`). Both single-course inputs became optional, validated in
   `run()`, so a schedule binding only `"*"` needs no other input. The
   single-course paths are unchanged.
2. `batch-grade-repos-to-draft`'s former body is extracted to
   `gradeTileRepos()` and shared by both paths - one implementation, so they
   cannot drift.
3. **"Currently running" is enforced on the all-courses paths.** Each tile's
   status comes from `resolveTileCurrentWeek` + `courseProgressStatus`;
   not-started and complete tiles are SKIPPED with a note. This is a safety
   property: drafting zeros into a course that has not begun would write bogus
   grades to a live LMS, repeatedly, on a 15-minute cadence. NOTE the
   single-course batch-grade path deliberately retains its looser prior
   behavior (it computes status only to label the module name and still
   grades) - that is backward compatibility, not an oversight.
4. **Current-module scoping** for the zero-out sweep: `listCourseContentAction`
   loads the tile's modules, the module matching the current week is found by
   its "Week N" / "Module N" title token, and only that module's Assignment
   items are zeroed. A tile whose modules do not match the convention, or
   whose module has no assignments, is SKIPPED with a note rather than
   falling back to sweeping the whole course.
5. **Per-course failure is isolated**: each tile runs in its own try/catch, so
   a missing Canvas URL, a 403, or no configured repos records a note and the
   loop continues.
6. Two presets appended (never inserted, so no index shifts):
   `zero-missing-submissions-all-courses` and
   `batch-grade-student-repos-all-courses`, each binding the list input to
   literal `"*"`. Both step types were already headless-safe, so the canary
   stays at 140.
7. **Scheduling caveat that determines whether this works at all.** The
   Automate panel's Institution dropdown DEFAULTS to the app's active
   institution and stores it verbatim, which would silently narrow an
   all-institutions run to one school. Both Institution and Course must be
   left as "None". "Run unattended in the cloud" must be checked - the cron
   query only selects schedules with `unattended = true`.
   `MIN_INTERVAL_MINUTES` is 15, so a 15-minute cadence is exactly the floor
   the UI offers.

## 103. A failed schedule generation names its cause

Reported from Course Kickoff (no codebase): step 2 "Generate course schedule"
failed with "The model returned no schedule." That message was a dead end - it
was returned for every `{ok:false}` from `callLlm` and discarded the HTTP
status and body, so a quota 429, a 503, a bad key and a network drop were
indistinguishable. Step 2 is the FIRST LLM call in that preset, which is why
any provider-level problem surfaces exactly there.

Acceptance criteria:
1. `describeLlmFailure(result, label)` in `src/lib/llm.ts` formats a failed
   call as `<label>: HTTP <status> — <body first 200 chars>`, matching the
   convention already used at ~35 other call sites. `status === 0` is the
   network/transport case (the catch block in `callGemini`) and reads
   `network error` instead, because "HTTP 0" is nonsense. An empty body drops
   the trailing dash segment rather than emitting a dangling " — ".
2. **A 200 response with no text is now distinguishable from unparseable
   output.** `callGemini` returns `{ok:true, text:""}` when Gemini answers 200
   with no text parts (`finishReason: MAX_TOKENS`, a safety block); callers
   previously reported "Could not parse", which pointed at the parser rather
   than the model. `parseFinishReason` reads `candidates[0].finishReason`,
   falling back to `BLOCKED_<promptFeedback.blockReason>`, and the `ok:true`
   branch of `LlmResult` carries it as an optional `finishReason`.
   `describeEmptyLlmText` renders it.
3. Both schedule actions - `generateSchedulePlanAction`
   (`course-planning.ts`) and `generateSchedulePlanFromRepoAction`
   (`github-content.ts`) - use both helpers, and their two "Could not parse"
   messages each append `The model returned: "<first 160 chars, whitespace
   collapsed>"` from a single shared local. The "wrong number of weeks"
   message is unchanged.
4. `MAX_ATTEMPTS` 4 -> 5 and `MAX_DELAY_MS` 8000 -> 10000 in the shared
   transport. Worst-case backoff is ~9s across 4 retries, still far under the
   60s Vercel function cap. `RETRYABLE_STATUS`, `BASE_DELAY_MS` and the
   Retry-After handling are untouched.
5. **Additive only.** `finishReason` is optional and spread in only when
   present (the same style as `sources`), `callLlm`'s signature is unchanged,
   and no other call site was touched - so every other feature's error copy
   still reads exactly as it did.
6. This is a diagnosis change, not a cure: the underlying provider failure is
   unknown until the workflow is run again, and the point of the change is
   that the next run states it.

## 104. Gemini 3 generation config is normalized at one choke point

The default model is `gemini-3.1-flash-lite`. Two vendor facts made the
per-call `generationConfig` literals scattered across ~78 call sites wrong for
that family: Google's Gemini 3 guide recommends leaving `temperature` at its
1.0 default (lower values "may lead to unexpected behavior, such as looping or
degraded performance", and a looping model exhausts its budget into an empty
MAX_TOKENS response), and thinking tokens are drawn from the SAME budget as
`maxOutputTokens`, so the call sites capping output at 50-120 tokens could be
consumed entirely by thinking with no answer left.

Acceptance criteria:
1. **No call site changed.** All of it happens in `callGemini`, via
   `normalizeGenerationConfig(config, model, tuning)` in `src/lib/llm.ts`. The
   ~78 `generationConfig` literals are untouched, so the per-feature intent
   stays readable in the source and still applies verbatim if `GEMINI_MODEL`
   is pointed at a non-Gemini-3 model.
2. `isGemini3Model` gates everything: `gemini-3`, `gemini-3-flash`,
   `gemini-3.1-flash-lite`, `gemini-3.1-pro-preview` match; `gemini-2.5-flash`,
   `gemini-30-something` and `""` do not. A non-match returns the caller's
   config by reference - byte-identical requests for every other family.
3. For Gemini 3.x: a `temperature` below 1 is OMITTED (not rewritten to 1, so
   the request is identical to an unset temperature); `maxOutputTokens` below
   the floor is raised to it; anything else, including `responseMimeType`,
   passes through. The caller's object is never mutated - some call sites pass
   shared constants, where mutation would be a cross-request bug.
4. **This changes generation behavior across every LLM feature in the app**,
   most notably the ones that deliberately ran near-deterministic: live-class
   transcription (`live-class.ts`, was temperature 0), grading
   (`grade/engine.ts` and `grade/rubric.ts`, were 0 to 0.3) and the JSON
   classification in `messaging.ts` (was 0). `GEMINI_ALLOW_LOW_TEMPERATURE=1`
   restores the previous behavior globally without a code change - that is the
   documented escape hatch if grading consistency or transcript fidelity
   visibly drifts.
5. `GEMINI_MIN_OUTPUT_TOKENS` (default 512) is the floor. It only ever raises a
   cap, so no call site can be squeezed by it. Call sites that used a tiny cap
   as a length control (e.g. the 50-token topic pick in `visualizer.ts`) rely
   on their prompt for brevity and already tolerate a longer answer.
6. `GEMINI_THINKING_LEVEL` (unset by default) is the only way a
   `thinkingConfig` is sent. It stays off because flash-lite already defaults
   to `minimal` thinking, and because `thinkingLevel` is a 400 error on models
   that do not accept it - the opt-in exists so a `GEMINI_MODEL` switch to a
   high-thinking Gemini 3 model can be pinned without a deploy.
7. All three knobs are documented in README.md's Environment Variables list.

## 105. The FAB keeps only the AI chatbot and Live Class

The quick-actions SpeedDial had grown to five entries. Three were removed on
request: Deadlines & Events, Pull back submission, and Class rosters.

Acceptance criteria:
1. `AiChatFab.tsx` renders exactly two `SpeedDialAction`s: AI Chatbot and Live
   Class. Every trace of the removed three is gone with them - imports, the
   `deadlines-open` / `pullback-open` / `roster-open` state and their persist
   effects, the deadlines position state, ref, setter, drag handler and
   `DEADLINES_W` / `DEADLINES_H`, the window renders, and the now-unused
   `CalendarIcon` / `PullbackIcon` / `RosterIcon` components. Dead state behind
   a removed control is how a "removed" feature comes back.
2. The live-class hoisting (the single `useLiveClassSession` owned by the
   always-mounted FAB), the recording badge, and the unread-answer badge are
   untouched - none of them referenced the removed entries.
3. `DeadlinesWindow.tsx`, `SubmissionPullbackWindow.tsx` and
   `RosterWindow.tsx` are left on disk but are now UNREACHABLE: the FAB was
   their only entry point. They are dead code pending a decision to delete
   them, not a feature that still works from somewhere else.
4. The stale `ta:deadlines-*` / `ta:pullback-open` / `ta:roster-open`
   localStorage keys are simply orphaned. Nothing reads them, so no migration
   or cleanup is warranted.

## 106. A no-code kickoff designs its own hands-on project

Two behaviours were wrong for the no-code kickoff. A blank project control
returned "this course is not project-based" and generated nothing, and -
separately - a description the instructor DID type was silently ignored
whenever the tile already had a project, because the preset binds `regenerate`
off and that branch returned early.

Acceptance criteria:
1. Two new optional inputs on `define-course-project`: `schedule` (the
   generated schedule, read with the same `scheduleToCsv` shape `tile.csvData`
   already carries, via the exported `weeklyTopicsFromSchedule`) and
   `autoDefine`. **With `autoDefine` off every branch behaves exactly as
   before** - an unbound optional input resolves to "", so every existing
   preset and saved workflow is untouched, `COURSE_KICKOFF` included.
2. With `autoDefine` on: a non-blank definition TAKES PRECEDENCE and is
   generated from even when the tile already has a project, without needing
   Rebuild; a blank definition with no existing project generates one from the
   schedule instead of returning "not project-based".
3. **A blank definition with an EXISTING project still leaves it alone**,
   autoDefine or not. Kickoff is re-run routinely, and replacing a project
   mid-term would invalidate every assignment, test and class session already
   derived from its milestones.
4. **The stored definition falls back to the generated name** when the
   instructor typed nothing. `hasProject()` is `mode === "course-long" &&
   definition.trim() !== ""`, so persisting a blank definition would read as
   "no project" on the next run and invent a second project on top of the
   first - defeating criterion 3 on the very next kickoff.
5. `generateCourseProjectAction` accepts a blank definition: the prompt's
   project-idea section switches to PROPOSE-one, required to be hands-on
   (something students build, produce or run - never an essay about the
   topic), with the course-kind contract, milestone count and JSON contract
   all identical either way. The non-blank wording is byte-identical to
   before. It still errors when definition, course facts AND weekly topics are
   all blank, naming what is missing.
6. Week count falls back to the bound schedule's length when the tile has
   none, which also clears the "Set the course's week count" dead end for a
   fresh tile that just generated a schedule.
7. The `embedded` provider never returns a blank project name: it falls back
   to the first weekly topic, then to "Course project".

## 107. One voice contract for every student-facing artifact

An instructor review of a real generated course (16-week MGT 422 project
management) found three failures that were the same failure: slides written in
professional register with no connective tissue ("the levers of project
success", "the social architecture of the project environment", four
same-length parallel declaratives per slide), assignment instructions saying
"select a real-world project" with no examples and "comprehensive" with no
length, and a class opener asking students to fill a 2x2 grid without ever
showing one filled in.

Acceptance criteria:
1. **One contract, composed verbatim - not N tuned prompts.**
   `src/lib/artifact-voice.ts` exports `PLAIN_LANGUAGE_CONTRACT` (write for a
   reader with no prior experience; everyday word over the professional one;
   a required field term gets a plain-English gloss on FIRST use then is used
   normally, because a certification-facing course still needs the exam's
   vocabulary; no abstract filler; short sentences; address the reader as
   "you"; plain is not casual) and `CONCRETE_DIRECTION_CONTRACT` (2-4 specific
   real example directions, explicit scope - how many, how long, what format -
   and ONE worked mini-example, stated to be a model rather than a template).
   Composed the same way `courseKindContract` is, so there is exactly one
   place to tune the voice.
2. `PLAIN_LANGUAGE_CONTRACT` is composed into both slide-structure constants,
   the class opener, the assignment-instruction generator, module intros,
   assignment/test/examples generation.
   `CONCRETE_DIRECTION_CONTRACT` additionally goes into the two the
   instructor named - the opener (pointed at the warm-up) and the assignment
   instructions (pointed at the Instructions section).
3. **Slide FLOW and CONNECT-TO-THE-STUDENT rules**, added to BOTH course
   kinds: bullets must read as a progression rather than four statements at
   the same altitude, every slide's notes but the last must close with a
   handoff naming the next slide's idea, and every concept must be grounded in
   a situation the student has actually been in - explicitly IN ADDITION to
   the required Case Study / In Practice cases, never replacing them.
4. **The pedagogy is untouched.** The Case Study rules, the four-slide coding
   cycle, the six-slide applied cycle, BREADTH/ORDER, the closing sections and
   the no-fabrication rules all survive. The byte-identical pin on
   `SLIDE_DECK_JSON_SHAPE` still holds; the pin on the coding REQUIREMENTS
   prose was deliberately re-baselined (that prose is what this entry
   changes) and re-pinned post-rewrite, so a future accidental edit is still
   caught.
5. The opener's `maxOutputTokens` goes 3000 -> 4096: the prompt now demands
   worked examples, and the old ceiling would truncate them.
6. Regression 100's applied-deck "Model Response" slide (strong response plus
   a distinct weak one, each with reasoning) was already the pattern that
   worked - the openers and assignments now borrow it rather than replace it.

## 108. The FAB chatbot always writes in the instructor's tone

The FAB chat sent one system instruction (the plain-text-only rule) and never
saw the writing sample recorded in Voice & Writing Style settings, even though
several generators already compose it.

Acceptance criteria:
1. `/api/ai-chat` resolves the authenticated user ONCE, up front, and that one
   lookup now serves both the tone injection and the exchange logging that
   already needed it (it used to run after the model call, for logging alone).
2. `buildChatSystemInstruction(styleBlock)` in `src/lib/chat/system-instruction.ts`
   is pure and unit-tested. **The plain-text-only rule survives verbatim and
   comes FIRST**, with the tone instruction appended after it and explicitly
   subordinated to it - a matched tone that starts emitting markdown is a
   regression, not a feature. A blank style block leaves the instruction
   byte-identical to before.
3. It reuses `getWritingStyleBlock`, which already strips the settings page's
   PROMPT/RESPONSE scaffolding and truncates to 1500 chars, and which returns
   "" for an anonymous session, a missing sample or a failed lookup - so the
   chat degrades to today's behaviour rather than erroring.
4. **The chip cannot lie.** `getChatToneStatusAction` calls the SAME
   `getWritingStyleBlock` the route calls and reports active only when it
   comes back non-empty. There is deliberately no second "has a sample" check,
   which could drift from what the route actually sent.
5. Three honest chip states: active, no-sample (linking to
   `/account/voice-style`), and embedded. The embedded engine never calls a
   model, so it gets its OWN wording rather than reusing "no sample", which
   would wrongly imply that recording one would help.
6. The status is fetched only when the chat window opens - the FAB is mounted
   on every page, so fetching on mount would cost a request per page load. The
   effect follows the repo's setState-in-effect idiom (async IIFE, `cancelled`
   flag, setState only after an await), including the embedded branch, which
   otherwise trips `react-hooks/set-state-in-effect`.
7. The chip is its own strip below the existing selection-context chip, never
   nested inside it, so the two cannot overlap when both are shown. Colors
   come from the app's CSS variables, so both themes work.

## 109. The orphaned FAB windows are deleted

Regression 105 removed three entries from the FAB and noted that their window
components were left on disk but unreachable. They are now deleted.

Acceptance criteria:
1. `DeadlinesWindow.tsx`, `SubmissionPullbackWindow.tsx` and
   `RosterWindow.tsx` are removed. No source file references them; the one
   stale mention (a comment in `LiveClassWindow.tsx` citing RosterWindow's
   viewport-clamping pattern) is rewritten rather than left pointing at a
   file that no longer exists.
2. **No server action was deleted with them.** Every action they called still
   has other callers, except `listAssignmentsAction` and `listStudentsAction`
   in `canvas-inbox.ts`, which now have none. They are deliberately KEPT: this
   codebase is building an atomic action library where actions are expected to
   outlive any one UI that happened to call them, and removing them is a
   separate decision from removing a window.
3. The full suite, tsc and eslint pass with the files gone - nothing imported
   them, which is what "unreachable" meant.

## 110. Applied decks carry real graphics

Non-code decks were all prose. The Artifact slide's job is to show the REAL
document a practitioner produces - a register, a charter, a matrix, a worked
calculation - and bullets are the wrong shape for that.

Acceptance criteria:
1. **A closed vocabulary of three kinds** in `src/lib/slide-graphics.ts`:
   `matrix2x2` (axis labels plus four quadrants), `process` (3-6 ordered
   steps), `table` (headers plus rows).
2. **No chart kind, deliberately.** A bar/line/pie chart needs invented
   numbers - axes, data points - and the no-fabrication rules governing the
   rest of the deck contract exist precisely to stop that. A table, matrix or
   process box can only restate content the slide's own bullets already
   ground; a chart cannot make that promise. The reasoning is recorded in the
   module header so it is not silently "fixed" later.
3. **Real PowerPoint shapes and tables, never an image.** pptxgenjs cannot
   take SVG, and a rasterized graphic would not be editable or print cleanly.
   No image-generation dependency and no external call was added.
4. `coerceSlideGraphic` is pure and defensive: a malformed or partial graphic
   degrades to no graphic rather than a broken slide, with hard caps (4 items
   per quadrant, 3-6 steps, 5 columns, 6 rows) so the layout cannot overflow.
   Ragged table rows are padded or truncated, never rendered ragged.
5. The layout arithmetic lives in the pure module and is unit-tested without
   pptxgenjs; `src/lib/pptx.ts` only draws. Both render loops (themed and
   standard) handle graphics. **A slide with both `code` and a `graphic`
   renders the code and ignores the graphic** - stacking both overflows.
6. `LecturePlanPreviewModal` renders all three kinds on screen, so the
   instructor never has to download the .pptx to judge a graphic.
7. **The coding contract is untouched**: `SLIDE_DECK_JSON_SHAPE` and
   `SLIDE_STRUCTURE_REQUIREMENTS` keep their byte-identical hash pins, and a
   new test asserts the coding prose never mentions graphics at all. The
   request was specifically about non-code classes.
8. The applied prompt requires a graphic on EVERY Artifact slide, suggests one
   for Judgment Call, allows one for Principle, caps bullets at 2 on a graphic
   slide, and restates the no-fabrication rule explicitly for graphics -
   a graphic is exactly where a model is tempted to pad with invented
   specifics.

## 111. Every automation shows its recent runs, logs and artifacts

The Automations tab surfaced only a last-run chip. The plumbing for more
already existed and was simply not wired up: `workflow_runs` +
`workflow_run_steps` record every run start-to-finish (including runs killed
mid-flight), `buildRunLogText` already formats the log, and every persisted
deliverable carries a `workflow_run_id`.

Acceptance criteria:
1. `listRecentRuns` gains an optional `triggerRef` filter - additive, no
   behaviour change when absent - so a row can ask for the runs IT caused
   rather than every run of the workflow.
2. `listRecordingFilesForRuns` fetches all runs' artifacts in ONE
   `.in("workflow_run_id", runIds)` query, not N. Grouping is a pure,
   unit-tested helper.
3. Three owner-scoped actions (list runs with artifacts, get one run's log
   text, mint a signed artifact URL). **A missing or foreign run/file id
   returns an error, never another user's data** - unit-tested, since these
   take ids straight from the client.
4. **Lazy loading is a requirement, not an optimization.** The runs table
   fetches only when a row's existing Details disclosure opens. The hub
   renders every schedule and trigger, so fetching on mount would fire a query
   per row on every page load.
5. Preview and download are ONE control: the log opens in the existing
   read-only `DocumentPreviewModal` with `downloadFileName` set, rather than a
   bespoke viewer plus a separate download button. Log text is fetched on
   demand per run, never prefetched for the whole table.
6. Distinct loading, error and empty states - "no runs recorded yet" must not
   look like a failure, and a run with no artifacts says so rather than
   rendering an empty cell.
7. The runs-count control (5/10/20, default 5) persists under
   `ta-automation-runs-limit`, per the standing rule that every new control
   survives a reload.

## 112. Any file can be uploaded to the AI chatbot

Acceptance criteria:
1. **One extraction path, not two.** The chat reuses `filesToLlmParts`, which
   already sends PDFs and images to Gemini inline and extracts everything else
   (docx, pptx, xlsx, csv, code, text) to text server-side. No second
   implementation and no new dependency.
2. **The 3.5MB budget is a platform constraint, not a preference.** Vercel
   caps a serverless request body at about 4.5MB and the chat posts JSON, so
   base64 attachments are capped below that. Enforced at selection time AND at
   send time, so the request is refused with a real reason instead of failing
   opaquely. Cap of 6 files per message.
3. **Attachments ride along with their message on later turns**, or a
   follow-up question about a document would be answered blind. When the
   transcript exceeds the budget, the OLDEST attachments drop first (earlier
   replies already summarize them) and the newest message's own attachments
   are never dropped - if that message alone exceeds the budget it is rejected
   outright. `trimAttachmentsToBudget` is pure and unit-tested.
4. **A skipped file is never silent.** `filesToLlmPartsDetailed` returns the
   names of files that produced nothing (unreadable, empty, extraction
   failure); `filesToLlmParts` now delegates to it with an unchanged signature
   for its two existing callers. The route returns those names and the window
   shows them, so "I uploaded it and it did not help" is diagnosable.
5. **The embedded engine is honest.** `routeRequest` is text-only, so the
   attach control is disabled with an explanation and the route ignores
   attachments on that path rather than pretending to have read them. The
   shared chat window is also used by the selection widget, whose attach
   control is explicitly disabled for the same reason - a shared component
   must not silently drop files.
6. Logged exchanges record the attachment names, so the chat log is not
   misleading about what the model actually saw.
7. The attachment chips sit below the message list and above the input row, so
   the existing selection-context and writing-tone chips at the top never
   shift.

## 113. Per-institution knowledge base: data layer (wave 1 of 2)

A Confluence/Notion-style page tree per institution, for the policies, rules
and deadlines that differ from school to school. This entry covers the data
layer only; the tab is wave 2.

Acceptance criteria:
1. `institution_pages`: id, user_id, `institution text` (uppercased acronym),
   self-referencing nullable `parent_id`, title, body (markdown), `tags
   text[]`, `position`, timestamps. One composite index and the same four
   owner-scoped RLS policies as `artifact_templates`. Idempotent.
2. **`institution` is plain text, not a foreign key**, because there is no
   institutions table - `src/lib/institutions.ts` keeps the acronym registry
   in browser localStorage. `normalizeInstitution` (trim + uppercase) is
   applied at the ACTION boundary so casing can never fork the data and make a
   page invisible to the tab that saved it.
3. **`parent_id` cascades on delete**: a page's subtree goes with it. The
   alternative (orphans silently jumping to the root) is quieter and more
   confusing. The UI is required to warn with the count first.
4. **Tree safety is server-side, not a UI convention**, because the UI can be
   bypassed and either failure would break every consumer:
   `buildPageTree` surfaces a page whose parent is MISSING at the root rather
   than dropping it (a lost page is worse than a misplaced one) and detects
   parent cycles instead of looping forever; `pageBreadcrumb` is cycle-safe;
   and a move that would make a page its own ancestor is REJECTED by
   `wouldCreateCycle` before it reaches the database.
5. Rows are read through an explicitly typed mapper (`mapInstitutionPage`),
   since typed Supabase selects collapse to `never` in this codebase.
6. `updated_at` is written on every mutation - a knowledge base whose "last
   edited" is wrong is untrustworthy.
7. Five owner-scoped actions (list/create/update/move/delete), each returning
   `{error}` rather than throwing, each rejecting an id that is missing or not
   owned rather than touching another user's row.

## 114. A failed grade-repo run says what actually failed

An unattended "grade repo" schedule reported, in full: "step 1 grade-repo:
Provide a repository." repeated seven times, mixed with "Provide the
assignment instructions." three times. Three defects, none of them a
misconfiguration:

Acceptance criteria:
1. **The README is a real source of instructions, not an afterthought.** When
   `grade-repo`'s `instructions` input is blank, the step reads the assignment
   folder's README first (via a new optional `folder` input), then the
   repository root README, reusing the `getRepoTreeAction`/`getFileTextAction`
   pattern that already existed in this same file for batch grading. It only
   fails when neither yields usable text.
2. **A graded result names what it was graded against.** The summary is
   prefixed with "Instructions read from <path>." whenever the fallback fired,
   because a grade whose source is ambiguous cannot be defended to a student.
   Nothing is prefixed when instructions were supplied directly.
3. **Errors carry the context the step already had.** `describeGradeRepoInputError`
   (pure, unit-tested) names the repository, branch and folder, says WHICH
   input resolved empty, and for the instructions case lists the README paths
   it tried. "Provide a repository." told an instructor running eleven repos
   nothing at all.
4. **The aggregate stops repeating itself.** `joinStepErrorDetail` in
   `src/lib/workflows/run-detail.ts` collapses identical entries to one with a
   `(xN)` count, preserves first-appearance order, and truncates on entry
   boundaries with "(+N more)" rather than mid-word. It is now the ONE
   implementation, shared by the cron route and the trigger route, which each
   built that string separately - which is why this had to be fixed twice
   before.
5. **No behaviour change when things work**: a `grade-repo` step with both
   inputs supplied produces exactly today's result and summary format. The new
   `folder` input is optional and unbound in every existing preset, so it is
   skipped and nothing changes for them.

## 115. The Automations tab is one sortable table, grouped by kind

Acceptance criteria:
1. Every schedule and every trigger appears as a row in a real `<table>`
   (semantic markup, `<th scope="col">`, `aria-sort` on the active column),
   with columns: Name, Fires, Last run, Next run, Enabled, Unattended,
   Actions.
2. **Grouped into Scheduled and Triggered, each with a visible count, and
   sorting happens WITHIN a group.** `buildAutomationRows` returns the two as
   separate arrays and `sortAutomationRows` runs per group, so a sort can
   never interleave them - the two answer different questions ("what runs on a
   clock" versus "what reacts to an event") and a mixed list makes neither
   legible.
3. **"Next run" is honest.** It renders as empty for a trigger, which is
   event-driven and has no deterministic next firing, and for a disabled
   schedule, which has nothing pending. Inventing a value there would be a
   lie the instructor would plan around.
4. `compareAutomationRows` is pure and unit-tested: stable, ties broken by
   name, and missing `lastRun`/`nextRun` sorting LAST in both directions
   rather than wherever the comparator happens to drop them.
5. The sort persists under `ta-automations-sort`; `parseAutomationSortState`
   never throws - an unknown field, bad direction, wrong shape or corrupt JSON
   all fall back to the default.
6. **Expansion survived the rewrite.** An expanded row's Details/Edit content
   renders as a full-width `<tr>` with a spanning `<td>`, and
   `AutomationRunsSection` (regression 111) still mounts lazily, only for the
   row actually expanded - the whole point of that lazy mount was to avoid a
   query per row on page load, and a table rewrite is exactly where that gets
   lost.
7. Distinct empty states for the whole panel, for an empty Scheduled group and
   for an empty Triggered group; each group heading shows its count even at
   zero, so empty never reads as broken.
8. Each group table scrolls in its own `overflow-x` container, matching
   `CoursesTable`, so a narrow viewport never scrolls the whole page sideways.

## 116. A weekly schedule can fire on several days

A weekly schedule ran on exactly one day, and that day was never stored - it
was implied by the weekday of `next_run_at`, which is why
`describeScheduleCadence` derived its label by formatting that timestamp.

Acceptance criteria:
1. `workflow_schedules.days_of_week` is an integer array (0=Sunday..6=Saturday),
   **nullable with no default, deliberately.** Every pre-existing weekly
   schedule encodes its day implicitly in `next_run_at`; there was never an
   explicit selection to backfill, so a default would silently claim a
   concrete day set on their behalf. Null reads back as `[]`.
2. **An empty array means "unchanged": keep using the day implied by
   `next_run_at`.** Every schedule created before this change keeps firing
   exactly when it does today, and `computeNextRunAt`'s new parameter is
   optional and defaults to empty, so every call site behaves identically
   without it.
3. `mapDaysOfWeek` is defensive - drops non-integers and anything outside
   0-6, dedupes, sorts ascending.
4. `computeNextRunAt` steps day by day to the next SELECTED weekday, keeping
   both existing properties: local calendar arithmetic (so wall-clock time
   survives DST) and collapsing a pile of missed occurrences into the single
   next future one rather than a backlog.
5. `describeScheduleCadence` renders "weekly (Fri, Sat, Sun)" in Monday-first
   calendar order for a multi-day selection; the single-day and every other
   cadence string is unchanged.
6. **Zero days can never be saved.** `resolveScheduleDays` falls back to the
   weekday implied by the form's run time, so an empty selection can never
   persist and silently mean something different. Extracted as a pure helper
   rather than buried in a handler.
7. The whole path carries it: `scheduleToForm` prefills from the stored
   selection (falling back to the implied weekday, so opening and saving an
   untouched schedule cannot move it), both editors (`useAutomation` for the
   per-workflow panel, `AutomationsTabView` for the hub) pass it on create and
   update, and `reenableSchedule` / `claimWorkflowSchedule` /
   `claimFanoutSchedule` all pass `schedule.daysOfWeek` - so an unattended
   cloud run computes the next occurrence with the same days instead of
   reverting to one day a week after its first firing. The cron route needed
   no change: it only calls the claim functions, which now carry it.

## 117. A workflow does not need an institution picked in the header

Acceptance criteria:
1. **Discovery first, not a blanket rewrite.** `helpers.activeInstitution` is
   read at ~60 sites across ~25 step files, but almost none were actually
   blocked: they pass the acronym alongside a course URL, and the Canvas layer
   resolves everything from the host via `resolveInstitution(url)`. Only four
   sites genuinely blocked - calls with NO course URL to key off, which reach
   `resolveInstitutionByCode`, the one function that throws on an empty
   acronym: `link-github-usernames` and `fetch-course-roster`
   (`steps.course-setup.rosters.ts`), `check-needs-grading`
   (`steps.grading-repos.ts`), and `grading-preflight`'s institution-wide
   branch (`steps.grading-run.ts`), which did not consult the header at all.
2. Three other explicit-throw sites (`configure-institution-feeds`,
   `check-mailbox-connection`, `list-deadlines-from-feed`) mark their
   `institution` input `required: true`, so the builder forces a binding
   before the workflow can be saved - the header was never a precondition
   there. Deliberately left alone.
3. **One shared ladder** (`src/lib/institution-resolution.ts`, pure): an
   explicit bound value, then the course tile's own institution, then the
   header, then the single configured institution when EXACTLY one exists,
   then failure. The tile and single-configured rungs are the new links; the
   bound and header rungs keep each site's existing precedence, so a run that
   works today is unchanged.
4. **The header is now a fallback, not a precondition** - which is what makes
   unattended runs work. A schedule stores its own nullable institution and
   there is no browser to read a header from, so "Institution: None" now
   resolves through the tile or the single-configured rung instead of
   throwing. Fan-out semantics (`scope.institution` of `"*"`, run once per
   configured institution) are untouched - this is about a run that names no
   institution at all, not about the wildcard.
5. The failure names every remedy rather than restating the requirement:
   "Could not determine which institution to use. Bind an institution on this
   step, set one on the course tile, pick one in the header, or configure
   exactly one institution."
6. The single-configured rung fires ONLY when exactly one institution is
   configured - never when two are, where a guess would silently address the
   wrong school.

## 118. Per-institution knowledge base: the Knowledge tab (wave 2 of 2)

The tab built on regression 113's data layer.

Acceptance criteria:
1. A "Knowledge" tab in the main tab list, added to the `ActiveTab` union and
   the persisted-tab validation so an unknown stored value still falls back
   safely. `page.tsx` changes by 8 lines; everything real lives in
   `KnowledgeTab.tsx` and `src/app/components/knowledge/`.
2. Scoped to the active institution through the SAME
   `useInstitutionSelection()` the other institution-scoped tabs use, so
   switching in the header switches the tree. No institution registered gives
   a clear empty state, never a blank pane.
3. Two panes: the collapsible tree (from `buildPageTree`) with add/rename/
   delete, and the selected page with breadcrumb, tags, body and last-edited
   time. The body is markdown, rendered with `markdownToHtml` for viewing and
   edited raw.
4. **Editing is explicit and unsaved work is defended.** Edit, then
   Save/Cancel; navigating to another page while dirty warns, and
   `beforeunload` covers tab close and reload. For a knowledge base, silently
   discarding a policy someone just typed is the worst possible failure.
   SCOPE NOTE recorded in the code: the guard does NOT hijack the global
   institution switcher in `TopBar`, because that control is shared by every
   institution-scoped tab and intercepting it from one tab would change
   behaviour everywhere.
5. **Delete states the real consequence.** `parent_id` cascades, so the
   confirmation names how many descendant pages go with it, counted from the
   tree - not a generic "are you sure".
6. Search uses `searchPages` and shows snippets; selecting a hit opens that
   page. It overlays rather than replacing the tree, so navigation is never
   lost.
7. Reordering and re-parenting use explicit move controls rather than
   drag-and-drop, which is a large surface to make usable and accessible. The
   parent picker never OFFERS the page itself or a descendant - the server
   rejects those via `wouldCreateCycle` regardless, and a UI that offers what
   the server will refuse is a bug report waiting to happen.
8. Selected page and expanded-node state persist per institution under
   `ta-kb-selected-page` and `ta-kb-expanded`; a stored id that no longer
   exists falls back to no selection rather than throwing.

## 119. Unattended runs record which automation caused them

Regression 111's per-automation "Recent runs" table filters `workflow_runs` by
`trigger_ref`, and reported "No runs recorded yet" for a schedule that had
visibly just failed. The runs were being written - with `trigger_ref` null.

Acceptance criteria:
1. Every unattended run-start now passes `triggerRef`: all five
   `safeStartWorkflowRun` sites in the cron route pass `schedule.id`, and the
   token-trigger route, the GitHub webhook route and the trigger runner pass
   `trigger.id`.
2. The column and the filter both already existed - the 20260909000000
   migration defines `trigger_ref` as "the schedule/trigger id that caused the
   run" and `listRecentRuns` filters on it. Nothing was ever written into it,
   so the feature that consumed it could only ever show an empty table.
3. **Historical runs stay invisible in the per-automation table**, because
   their `trigger_ref` is null and cannot be reconstructed - a run row does not
   record enough to attribute it after the fact. Only runs from this change
   forward appear. That is a real gap, not a bug to chase.
4. The attended runner (`useWorkflowRun`) is unchanged: a manual run has no
   schedule or trigger to reference.
