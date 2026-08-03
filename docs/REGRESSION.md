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

   AMENDED (entry 164): the repo-driven coding opener now runs inside
   `lecture-zip` before its deck, and the no-code opener already runs inside
   `lecture-materials-from-schedule`. `COURSE_REFRESH` therefore no longer
   contains a standalone `generate-class-openers` step, so neither kickoff has
   an opener `exerciseKind` override or an index-4 opener assertion. The same
   `generateWeekOpener` function and course-kind-specific no-write-code guard
   remain the single content mechanism; entry 164 changes orchestration, not
   the opener's safety contract.

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
   AMENDED (entry 156): this AC was pinned as an unconditional six-slide
   cycle, and stayed one after entry 156 added the P2 SLIDE BUDGET rule
   (`8 + concepts * 9` slides, capping in-lecture `Your Turn`/`Model
   Response` pairs at the first 2 concepts) - so `buildConceptCycleInstruction`
   (`src/lib/lecture-concepts.ts`) and `APPLIED_STRUCTURE_REQUIREMENTS`'s own
   "APPLIED CONCEPT CYCLE"/"BREADTH MINIMUM" prose (`src/lib/slide-prompt.ts`)
   both kept demanding the six-slide cycle "without exception" for EVERY
   concept, directly contradicting the cap two paragraphs later. At the
   documented 50-minute/5-concept default, 3 of 5 concepts were
   simultaneously required and forbidden to carry a `Your Turn` slide. The
   cycle is now a REQUIRED four-slide CORE (`Principle`, `In Practice`,
   `Artifact`, `Judgment Call`) that every concept gets without exception,
   plus the `Your Turn`/`Model Response` pair, in-lecture, ONLY for the
   concepts the SLIDE BUDGET rule identifies (the first 2 in the CONCEPT
   PLAN) - one rule states the cap, everywhere else defers to it instead of
   restating a number. The six title prefixes and their per-slide detail are
   unchanged; only the "every concept gets all six, unconditionally" framing
   was wrong. A concept that does not get the in-lecture pair still gets its
   hands-on task in the Post-Lecture Practice appendix
   (`APPLIED_STRUCTURE_REQUIREMENTS`'s CLOSING SECTIONS, point H).
   AMENDED (RCA round 4, RCA21): this amendment's own parenthetical still
   quotes the superseded `8 + concepts * 9` SLIDE BUDGET formula - entry 156
   AC3's own later amendment (RCA round 2, RCA8) already corrected that
   formula in place to `10 + concepts * 7`, for exactly the reason entry 156
   AC3 gives (the old formula did not match the structure this same contract
   mandates, and budgeted by slide COUNT instead of lecture DURATION), but
   this note here was never updated to match, and `slide-prompt.test.ts:661`
   independently asserts the old string `8 + concepts * 9` is ABSENT from
   the live contract. Read the parenthetical above as historical color for
   what the SLIDE BUDGET rule looked like at the time this AC was written,
   not as the rule's current formula.
2. **The coding contract is byte-identical.** `SLIDE_DECK_JSON_SHAPE` and
   `SLIDE_STRUCTURE_REQUIREMENTS` are unchanged, pinned by a test asserting
   their exact length and sha256 computed FROM THE LIVE FILE rather than a
   hand-typed hash, so a transcription error cannot produce a false pass.
   AMENDED (Group Z, entry Z4-AC0): this pin was DELIBERATELY updated, in the
   same commit as Group Z's coding-contract parity port - the user's second
   request ("port whatever lessons learned from the no code workflows ...
   over to the code kickoffs/refreshes workflows as well") means the coding
   contract now carries the SAME lecture-flow slides the applied contract
   earned (Agenda, Section dividers, Bridges, Recap, Next Week, an Appendix
   for post-lecture practice, Failure Modes, Terminology, assertion titles on
   each concept's own slide, a TIME-based slide budget, and an OPTIONAL -
   never required, never `matrix2x2` - process/table graphic). New values:
   `SLIDE_STRUCTURE_REQUIREMENTS` is 16750 chars, sha256
   `689b9b512e87d029817af36f2e053c0db88ef0577d110d6fe11d11522b6b795c`;
   `SLIDE_DECK_JSON_SHAPE` is 1871 chars, sha256
   `b29552311f3fbd714b00b76c80593f9f962f74c0e7b93ec93033204e64ff5476`.
   AMENDED (entry 185): `SLIDE_STRUCTURE_REQUIREMENTS` moved again and is now
   17835 chars, sha256
   `10ab8834bf4ec0b1bfb7e04a223f4030660a44027743c13224fb47021d6d6172`
   (verified by hashing the live constant, not copied from the test).
   `SLIDE_DECK_JSON_SHAPE` is UNCHANGED at 1871 /
   `b29552311f3fbd714b00b76c80593f9f962f74c0e7b93ec93033204e64ff5476`. Two
   additive edits on the CODING contract only moved it: the FLOW rule gained a
   concrete deletion test for whether bullets are a progression, and the notes
   handoff rule now forbids reusing stock connector phrases. See entry 185.
   `slide-prompt.test.ts`'s pin was updated in the SAME commit, never left
   stale or silently loosened - see entry 110 AC7 and entry 137 AC7 for the
   parallel notes on those two pins, which assert the exact same values.
   The pin's own module comment states why this is safe: it exists to catch
   ACCIDENTAL drift, never to forbid a deliberate, reviewed change.
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
   AMENDED (entry 156, RCA round 2): "naming the six-slide applied cycle" is
   the same stale unconditional framing AC1's own amendment above already
   corrects for `buildConceptCycleInstruction` and `APPLIED_STRUCTURE_
   REQUIREMENTS` - it was missed here when AC1 was amended. What
   `buildConceptCycleInstruction("applied")` actually names now: the
   four-slide Principle/In Practice/Artifact/Judgment Call core every
   concept gets, plus the in-lecture Your Turn/Model Response pair only for
   the concepts the SLIDE BUDGET rule identifies (the first 2) - never an
   unconditional six-slide cycle. AC1's amendment is the substance; this note
   exists only so this AC's copy of the same stale phrase does not read as
   still-true to a reader who lands on it directly.
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
   AMENDED (entry 156, RCA round 2): this arithmetic predates entry 156's P2
   lecture-flow rewrite (Agenda, Section dividers, Bridges, Recap, Next Week)
   and its own SLIDE BUDGET fix (RCA8), so it no longer matches the deck this
   app generates. Recomputed at the same 7-concept worst case: 10 fixed
   deck-level slides (title, Case Study, Agenda, Failure Modes, Documentation,
   Terminology, Recap, Next Week, Modern Tech, Doc & Refs) + in-lecture
   per-concept slides (first 2 concepts at 8 each = 16; middle concepts at 6
   each; the last concept at 5, no Bridge) = 55 in-lecture slides, plus the
   Post-Lecture Practice appendix (1 divider + 1 intro + 4 slides per concept
   x 7 = 30) = **85 slides**, up from 78. The CAP CONCLUSION IS UNCHANGED: 85
   slides at roughly 1500 chars each is about 127,500 chars, still comfortably
   under the 49152-token cap and well under `gemini-3.1-flash-lite`'s 64K
   output ceiling - the fixed deck-level count and the appendix's per-concept
   cost both grew, but not enough to threaten the headroom this AC's
   conclusion depends on.
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
   AMENDED (entry 156, RCA round 2): "the six-slide applied cycle" is the
   same unconditional-cycle phrasing entry 100 AC1 was amended to correct -
   this entry only cross-references entry 100's cycle, so the same
   correction applies here by reference: the four-slide core is unconditional,
   the Your Turn/Model Response pair is not (first 2 concepts only, per the
   SLIDE BUDGET rule). See entry 100 AC1's amendment for the full correction.
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
   AMENDED (Group Z, entry Z4-AC0/AC3): "specifically about non-code
   classes" is no longer the request - the user explicitly asked to port
   this entry's own graphics work (among other no-code lessons) to the
   coding kickoff/refresh path too. The coding contract now ALSO allows an
   OPTIONAL `process`/`table` graphic on any slide - never `matrix2x2` (no
   coding slide has a natural two-axis tradeoff the way an applied Judgment
   Call slide does), and never REQUIRED on any slide, including the Agenda
   slide (unlike applied's mandatory one) - `enforceGraphicsForApplied`
   (AC1-AC5 above) is explicitly NOT extended to coding, per this entry's own
   AC2 reasoning: a required graphic with no natural slot is exactly the
   padding a chart kind was refused for. The byte-identical PIN itself was
   also deliberately updated in the same commit, to new, documented values -
   see entry 100 AC2's amendment for the exact length/hash and the reasoning
   for why updating a pin deliberately is not the same as an accidental
   regression.
8. The applied prompt requires a graphic on EVERY Artifact slide, suggests one
   for Judgment Call, allows one for Principle, caps bullets at 2 on a graphic
   slide, and restates the no-fabrication rule explicitly for graphics -
   a graphic is exactly where a model is tempted to pad with invented
   specifics.
   AMENDED (entry 156): Judgment Call moved from SHOULD to MUST -
   `APPLIED_STRUCTURE_REQUIREMENTS` now reads "EVERY Judgment Call slide MUST
   use a `matrix2x2` or `table`" (`src/lib/slide-prompt.ts`), and
   `slide-prompt.test.ts` was updated in place to assert the MUST wording
   (`toContain("Judgment Call slides SHOULD use")` became a `.not.toContain`
   alongside the MUST assertion) without a matching amendment note here at
   the time - this line is that missing note. Why: the real 16-week MGT 422
   audit (entry 156's own measurement) found 0 of 80 shipped Judgment Call
   slides carried a graphic under the old SHOULD wording, against 38/80
   Artifact slides (48%) under the already-MUST wording for Artifact - a
   suggestion was not enough to move behavior, so Judgment Call now carries
   the same MUST as Artifact. See entry 156 AC5 for the data-layer guard
   (`enforceGraphicsForApplied`) this prompt change works alongside.

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

## 120. Back and Forward navigate between tabs

Acceptance criteria:
1. **Query params via the native History API, not the Next router.** The
   installed Next (16.2.6) documents `window.history.pushState/replaceState`
   as the sanctioned way to update the query string with no server round trip
   ("Native History API" in the linking-and-navigating guide), and this repo
   already uses that pattern in `account/integrations/page.tsx`. Path segments
   were rejected because this is a single App Router route owning all tab
   state client-side; per-tab route folders would be server-rendered by
   default, which is the round trip we are avoiding.
2. `?tab=` plus a sub-view param reflect where you are; changing tabs pushes
   exactly ONE entry, and selecting the tab you are already on pushes none.
3. **A history-driven restore must not push.** `popstate` sets state from the
   URL, and a `lastKnownSearchRef` updated by BOTH paths keeps the sync effect
   from re-pushing what it just restored - the classic bug where Back appears
   to do nothing because the app immediately pushes the state it left.
4. **The URL wins over localStorage; localStorage stays the fallback.** A load
   with no `tab` restores from `ta-active-tab` as before and then normalizes
   the URL so the first Back is predictable. A load WITH a tab (a bookmark, a
   shared link, a reload) uses the URL. Writes to localStorage continue, so a
   fresh session on a bare URL still lands where the user left off.
5. An unknown or malformed tab falls back through the SAME validation the
   persisted value already used - `normalizeActiveTab` and friends replaced
   the hand-copied ternaries rather than adding a second copy.
6. **Only the tab and the first sub-view level get history entries**
   (`manualView`, `workflowsView` - the ones with a visible tab bar).
   Second-level controls (`buildView`, `contentView`, `draftsView`) and the
   Knowledge tab's selected page do NOT: they are toggled rapidly while
   browsing, and an entry per toggle makes Back tediously granular, which is
   worse than not having it. The reasoning is recorded in `url-state.ts`.
7. Sub-view params only apply when the URL's tab matches, so a stale
   `manualView` on a different tab is ignored rather than silently applied.

## 121. The Knowledge tab owns its institution, not the header

Regression 118 scoped the Knowledge tab with the SHARED
`useInstitutionSelection()` hook, so the header switcher moved it. That
coupling was removed on request.

Acceptance criteria:
1. The tab renders its own institution picker over `useInstitutions()`.
   Changing the header no longer affects the Knowledge tab, and the tab's
   picker does not move the header - every other institution-scoped tab
   behaves exactly as before.
2. Persisted under `ta-kb-institution`. **On first use only**, it seeds from
   `readActiveInstitution()` so the tab does not open on an arbitrary school;
   after that the two are independent. A comment says so, because "it followed
   the header once and then stopped" is precisely the behaviour someone will
   later report as a bug.
3. A stored institution that is no longer registered falls back to the first
   registered one rather than showing an empty tree for a school that no
   longer exists; no institutions registered keeps the existing empty state.
4. `ta-kb-selected-page` and `ta-kb-expanded` needed no change - they already
   take the institution as a parameter, so they follow the tab's own selection
   for free. Switching institutions inside the tab restores that
   institution's own selected page and expanded nodes.
5. **Switching institutions goes through the unsaved-edits guard.** Regression
   118 deliberately exempted the GLOBAL header switcher, because that control
   is shared by every tab and intercepting it from one would change behaviour
   everywhere. That reasoning does not apply to a picker this tab owns, so
   this one is guarded - it discards the open page just as surely as
   navigating away does.
6. The seeding happens during render (the same adjust-state-during-render
   idiom already used in this file), not in an effect, so it does not trip
   the repo's setState-in-effect lint rule.

## 122. Every tab-like view gets a history entry

Regression 120 limited history to the tab plus the first sub-view level,
reasoning that an entry per toggle would make Back tediously granular. **The
instructor overruled that explicitly** - they would rather press Back several
times than remember which control they used to get somewhere. That is a
decision about their own workflow, not a technical constraint, and the stale
rationale in `url-state.ts` was rewritten rather than left to read as the
intended design.

Acceptance criteria:
1. All six view states participate: `activeTab`, `manualView`,
   `workflowsView`, and now `buildView`, `contentView` and `draftsView`.
2. **Nesting is encoded, so a URL cannot describe an impossible state.** Each
   sub-view is gated on its parent (`buildView` only under
   `manualView=course-planning`, `contentView` under `manualView=content`,
   `draftsView` under `workflowsView=drafts`), parsing drops a param whose
   parent does not match rather than applying it, and `popstate` walks the
   WHOLE chain instead of stopping at the first level - restoring a deep state
   has to set every link, not just the leaf.
3. **Params at their default are omitted**, derived from each normalizer's own
   `normalize(null)` rather than a restated default, so the common case stays
   a bare `?tab=manual` instead of carrying six params forever.
4. The legacy `version-control` migration value is deliberately excluded from
   `isContentView`, with a test pinning that - it is a historical persisted
   value, not a navigable view.
5. Every invariant from regression 120 survives: a history-driven restore does
   not push, re-selecting the current value pushes nothing, unknown values
   fall through the same normalize helpers, and localStorage keeps working as
   the bare-URL fallback.
6. The Knowledge tab's page-tree selection is still NOT in the URL. It is
   component-owned state rather than a tab, so it is outside this module's
   model - a separate decision, not an oversight.

## 123. Live class answers know the course's own rules

Live-class answers were grounded only in gathered course MATERIAL. Questions
about how the class actually runs - deadlines, late policy, attendance,
contact - had nothing to answer from, even though the course row and (since
regression 113) the institution's knowledge base both hold exactly that.

Acceptance criteria:
1. **Both loads happen once, at session start**, inside
   `buildLiveSessionContextAction`, whose own doc comment calls that "THE
   SINGLE MOST IMPORTANT LATENCY DECISION IN THIS FEATURE". The per-question
   path reads two extra fields off the already-pre-warmed context and performs
   no new I/O.
2. Course facts come from the existing `renderCourseFacts(tile)` - not a
   second renderer - and thread through `LiveSessionContext` ->
   `LiveQuestionContext` -> the answer prompt.
3. Institution policy comes from `listInstitutionPages(tile.institution)`,
   rendered by the pure `renderInstitutionPolicyText`. **A missing
   institution, an empty knowledge base, and a FAILED load all degrade to an
   empty section** - the same rule `loadVisualizerIndexAction` documents:
   optional session data must never block starting a class.
4. **A 4000-character budget, truncated on a page boundary**, with a trailing
   note naming how many pages were omitted. An unbounded section would grow
   with the knowledge base until it crowded out the lecture material, and the
   instructor would get confidently ungrounded answers with no signal that
   anything was dropped. Whole pages only - a half-rendered policy is worse
   than an absent one.
5. **Diagnosable, per the `materialsSource` precedent**: the context reports
   `courseFactsAvailable`, `policyPagesIncluded` and `policyPagesOmitted`, so
   a thin context is visible during class rather than inferred afterwards.
6. **The sections are labelled as rules, not subject matter.** `COURSE INFO`
   and `INSTITUTION POLICIES` carry an explicit instruction to use them only
   for questions about the course and its policies, and to ground
   subject-matter answers in COURSE MATERIAL and SLIDE DECK instead - so a
   late-policy question and a stakeholder-analysis question are not answered
   from the same undifferentiated blob. The sentence is added only when a
   section is present, keeping the prompt tight when unused.
7. `grounded` still keys off materials/deck only: course facts and policy text
   must not make an ungrounded subject-matter answer look grounded. Tested
   explicitly.

## 124. Live-class question detection errs toward catching questions

Requested asymmetry: a MISSED question is invisible and unrecoverable - the
student asked, nothing appeared, the moment passed. A false positive costs the
instructor a glance. Detection is biased to recall accordingly, and the
reasoning is recorded at the top of `questions.ts` so it is not later
"tightened" as a bug fix.

Acceptance criteria:
1. **A trailing "?" is decisive**, bypassing `minConfidence` entirely (still
   behind `looksLikeQuestion`'s rhetorical and one-word floors). The reported
   `confidence` stays the true `scoreQuestion` value rather than being faked
   to clear the bar.
2. Confusion and uncertainty count as questions with no interrogative form:
   "i do not get it", "i am lost", "that does not make sense", "not sure
   how/why/what", "huh", "wait", "what about". Contracted forms route through
   the existing `expandContractions` path - no duplicate spellings.
3. **Phrase matching moved from substring to word-boundary regex.** This was
   forced by the change, not incidental: once single words like "wait" and
   "huh" joined the list, a substring match would fire on "waiting" and
   "await". Pinned by a regression test.
4. `DEFAULT_MIN_CONFIDENCE` 0.5 -> 0.35, justified from `scoreQuestion`'s own
   arithmetic rather than picked by feel: the weakest legitimate signal
   ("not sure why") scores 0.40, and a no-signal declarative scores ~0, so
   0.35 sits with margin below the former and far above the latter.
5. **The floor holds, and this is the hard part.** Plain declaratives and
   classroom instructions are still rejected - "Open your books to page
   forty.", "Today we are covering stakeholder analysis.", "The midterm is
   next Tuesday.", "Let us take a ten minute break." - as explicit negative
   tests asserting both `looksLikeQuestion === false` and a ~0 score. A panel
   that flags everything carries the same information as one that flags
   nothing. A sabotage run adding an over-broad phrase ("to") was caught by
   exactly these tests.
6. `mergeInterim` and `dedupeAgainstAnswered` are tested under the new load,
   since more detections is precisely the condition that stresses them - a
   recall-biased detector must not surface one question three times as an
   interim transcript firms up.
7. One existing assertion was flipped, deliberately: "why not?" at
   `minConfidence: 0.9` is now INCLUDED, because a trailing "?" is decisive. A
   third utterance was added to that test so it still proves non-decisive text
   remains gated by `minConfidence`.

## 125. Grading follows the org, and actually reads the submitted repo

Two defects from one unattended run, both confirmed by discovery rather than
assumed.

Acceptance criteria:
1. **Discovery, defect 1**: `grade-repo` took a single `repo` text input with
   NO mechanism tying it to a course tile or org - `scopeFamilyForType` has no
   case for `"repo"`, so workflow scope never auto-filled it. `Course.githubOrg`
   existed and was read by exactly ONE place in the whole app (the attended
   roster cell). No workflow step enumerated it. That is precisely the
   reported failure: a fan-out ran the step once per tile (the "(x8)") with
   nothing to fall back to.
2. `grade-repo` gains an optional `hubCourse` input. With `repo` blank and a
   tile bound - explicitly, from workflow scope, or pinned per fan-out
   iteration, since that input type already participates in both - it
   enumerates the tile's `githubOrg` via the existing `listOrgReposAction` and
   grades each repo. **An explicit `repo` behaves exactly as before.**
3. Three distinct org failures, none of them the generic empty-input error the
   instructor already hit: no org configured on the tile, an org with no
   repositories, and a failed listing (with the reason). Each names the tile
   or org.
4. **Per-repo isolation**: one unreadable or failing repo records a note and
   the run continues. A batch dying on its third repo silently loses the other
   eight - which is how the original failure presented.
5. **Discovery, defect 2 - the serious one.** `canvasWorkToEntry` in
   `src/lib/grade/extraction.ts` is the single point where a submission URL
   becomes grading input, and it never fetched it. Its own doc comment said
   so ("Grading never fetches or runs this URL's contents"), and the test only
   asserted the URL string appeared in `content`. **Every GitHub-URL
   submission was graded as a URL string, not as code.** The fetch machinery
   (`fetchSubmissionRepoAction`, `src/lib/submission-repo.ts`) already existed
   for the on-demand "Load code" button and was simply never called during
   grading.
6. `fetchGradableRepoContent` reuses that existing machinery -
   `parseSubmissionGithubUrl`, `selectSubmissionRepoFiles`, `clampFileBytes`,
   `applyTotalByteBudget` - rather than adding a second fetch path, and folds
   the real code into `content`.
7. **A bad link never fails a run.** A non-GitHub URL, a private or missing
   repo, or a fetch failure degrades to grading whatever text exists, with a
   note saying why the repo could not be read. What it must never do again is
   silently grade a URL string as though it were code.
8. **The draft records what it graded**: `gradedRepo`/`gradedRef` thread
   through `GradeResult`, `StudentSubmissionEntry`, the engine, the embedded
   grader, and the draft strip/coerce round-trip (both sides tested
   independently), surfacing as a "Graded from" badge - a grade whose source
   is unknown cannot be defended to a student.

## 126. The drafted grades tab is dense and its categories are legible

Acceptance criteria:
1. **Density was MEASURED, not estimated.** A static reproduction of the old
   and new markup with an identical fixture (4 drafts, 5 assignment groups, 15
   students) was measured in a browser at 1280x720: row height 42px -> 34px,
   assignment-group overhead 69px -> 36px, drafts visible in a viewport 5 ->
   6, page height 1558px -> 1440px. With one draft collapsed, 1273px and every
   draft's controls reachable without scrolling.
2. **A real bug fell out of that measurement.** `.comment` was a `<span>` with
   `overflow:hidden`/`text-overflow:ellipsis` - a no-op on an inline element -
   so a long comment silently blew out the fixed-layout table (row
   `scrollWidth` 1423px against a 1098px wrapper). Fixed with
   `display: block`, re-measured, and confirmed non-overflowing down to a
   981px viewport with no horizontal page scroll.
3. **Categories are distinguished structurally, not by colour alone**, which
   fails for colour-blind users and in print: source stays a text-labelled
   badge, course becomes an OUTLINED chip (distinct in style from the filled
   source badge), and assignment becomes a full-width tinted group row that
   spans every column - a structural difference a data row cannot imitate.
   Zebra striping is decorative and carries no meaning.
4. Nothing was deleted to save space: per-student rubric areas keep their
   disclosure, and the checklist panel became an inline toggle costing zero
   height when collapsed rather than a block with fixed padding.
5. Dead CSS from the old grid-row layout was removed, but the classes
   `MessageDraftsTab.tsx` SHARES were left alone - deleting those would have
   broken a different tab silently.
6. `GradingResults.tsx` was deliberately untouched: it belongs to the classic
   grading flow, the GitHub panel and the Live Feed, not this tab, and is
   already a dense sortable matrix.
7. Collapsed-draft state persists under `ta-drafts-collapsed`, and the
   pre-existing `ta-drafts-sort` read was tightened at the same time - both
   fall back cleanly on a corrupt or unknown stored value.
8. The "Graded from" badge (regression 125) survives the rewrite, so a grade
   can still be traced to the repo and ref it came from.

## 127. The two orphaned Canvas actions are deleted

Regression 109 kept `listAssignmentsAction` and `listStudentsAction` when the
FAB windows that called them were removed, on the grounds that actions here
are meant to outlive any single UI. Deleted on request.

Acceptance criteria:
1. Both actions are gone from `src/app/actions/canvas-inbox.ts`, along with
   the imports they were the last users of (`listAssignments`, `listStudents`,
   `CanvasAssignmentBrief`, `CanvasPerson`) - a deletion that leaves unused
   imports behind is half a deletion, and eslint flags it.
2. **The underlying `listAssignments` / `listStudents` in `src/lib/canvas.ts`
   are KEPT.** They are part of the Canvas API wrapper layer, which is a
   general-purpose surface rather than a per-feature one; a wrapper outliving
   one caller is normal, unlike an action wired to a deleted window.
3. Nothing else referenced either action - confirmed repo-wide before
   deleting, with only the regression entry above mentioning them.

## 128. Automations can be kicked off manually, and status is its own column

Acceptance criteria:
1. A "Run now" control in each table's Actions column, for schedules and
   triggers alike.
2. **It runs the automation's OWN stored configuration** - the saved
   `fieldValues`, provider, disabled steps, course and institution snapshot,
   re-read fresh by id via new owner-scoped `getWorkflowSchedule` /
   `getWorkflowTrigger`. A manual kickoff running subtly different inputs
   would succeed by hand and keep failing on the cron, which is worse than no
   button.
3. **It never writes `last_run_status` / `last_run_detail`.** Those are the
   record of the automation's REAL firing history, and a manual test
   overwriting them would corrupt the exact signal the Automations tab exists
   to show. The run is still fully attributable through its own
   `workflow_runs` row (`triggerSource: "manual"`, `triggerRef` = the
   schedule/trigger id), so it appears in that row's Recent runs.
4. **The cadence is untouched**: the route never calls
   `claimWorkflowSchedule`, `claimAndAdvanceTrigger` or the fan-out
   checkpoint helpers, so `next_run_at`, `fanout_progress` and the occurrence
   claim are all left alone. A manual run cannot consume a scheduled firing.
5. A workflow that is not headless-safe gets a DISABLED button with the
   reason, re-verified server-side - rather than inviting a click that can
   only fail. A `useRef` guard (not just state) closes the double-click race,
   and the server re-validates independently.
6. Implemented as a Route Handler rather than a Server Action: Next 16
   requires Server Action `maxDuration` to be set at the PAGE level, and this
   run needs its own 60s budget, mirroring the cron and webhook routes.
7. **A truncated fan-out reports "skipped", never success.** A manual run does
   one best-effort pass with a 50s soft deadline and no cron-style
   multi-tick checkpointing, so a partial result must be reported honestly.
8. **"Last run" split into two columns**: Status and Last run (timestamp
   only), both independently sortable through the same pure comparator, with
   missing values still sorting last in both directions and status never
   conveyed by colour alone.
9. The old combined `"lastRun"` sort field was RETIRED rather than reused, so
   a persisted `ta-automations-sort` naming it is unrecognized and falls back
   to the default instead of sorting by nothing. Pinned by a migration test.

## 129. Knowledge page selection is in the browser history

Regression 122 left the Knowledge tab's page selection out of the URL as
component-owned state. Added on request, along with the institution.

Acceptance criteria:
1. **`page.tsx` remains the SINGLE history writer.** The selection and the
   tab's institution lift into `page.tsx` and thread down as props; no second
   component calls `pushState`. Two writers would fight over
   `lastKnownSearchRef` and make Back intermittently wrong - the hardest class
   of bug to reproduce.
2. **The institution is in the URL too.** A page id alone is ambiguous: the
   same id under a different institution resolves to nothing. `kbPageId` is
   gated on `kbInstitution` exactly as `contentView` is gated on `manualView`,
   so a URL cannot describe a page under the wrong institution.
3. Validity is the CALLER's job, not the parser's. `normalizeKbInstitution` /
   `normalizeKbPageId` only clean the raw param, because whether an
   institution is registered or a page exists depends on runtime data this
   pure module does not have. `pickValidPageId` reuses the tab's existing
   fallback so a stale or foreign id lands on no selection rather than a
   dangling one.
4. `normalizeKbInstitution` DELEGATES to `normalizeInstitution`, which
   `knowledge-base.ts` documents as the single place casing is normalized.
   Restating `trim().toUpperCase()` in the URL path would let it drift from
   the storage path and reintroduce the casing-mismatch bug that function
   exists to prevent. Safe to import: that module's imports are all type-only,
   so no server code reaches the client bundle.
5. **Back does not silently discard unsaved edits.** A `popstate` bypasses
   component-level guards entirely, so the guard lives inline in the one
   shared popstate handler: if the restore changes the Knowledge selection
   while the page is dirty, it prompts, and on decline pushes an entry
   matching what is actually still rendered - the browser has ALREADY moved
   the address bar by then, so returning without that push would leave the URL
   lying about where the user is.
6. **Two review findings were applied before merge:** the URL-derived
   institution is computed in a lazy initializer rather than re-parsing
   `window.location.search` twice on every render of the root component, and
   `useKbInstitutionSelection` now memoizes its setter - as a fresh arrow per
   render it was silently re-running every caller effect that listed it,
   which is also what forced a ref that is no longer needed.

## 130. A selected workflow is one page, not three tabs

The workflow editor had a Build / Run / Automate tab strip. Reaching the step
list or the scheduling form meant a tab switch that HID the run form and its
results.

Acceptance criteria:
1. **One page, no inner tab strip.** A shared header (rendered twice before -
   once by Build, once by Run), then a collapsed "Steps (X/Y enabled)"
   disclosure, then the run form and progress as the always-visible primary
   content, then a collapsed "Schedule & trigger" disclosure summarizing what
   exists ("Not scheduled", "2 schedules, 1 trigger").
2. **Condensed, not concatenated.** Three panels stacked would be worse than
   the tabs. The two rarely-used sections collapse to ~30px headers in the
   common case, against a previously always-rendered scope block plus step
   list (~300-600px) and schedule/trigger forms (~200-500px). Toggling a step
   or scheduling no longer hides the run results.
3. **Scheduling and triggering stayed HERE.** An earlier plan moved
   create/delete to the Automations tab, because removing the Automate tab
   would otherwise strand the only place to create or delete a schedule - the
   Automations tab deliberately offers neither. The instructor chose to fold
   them into this page instead, so the Automations tab is untouched and still
   needs no create/delete of its own.
4. `ScheduleSection` / `TriggerSection` / `useAutomation` are REUSED verbatim -
   validation, headless-safety gating and confirm-before-delete all survive.
   This was a relocation, not a rewrite.
5. **In-flight editing is locked, visibly.** Build and Automate were disabled
   during a run because editing steps or schedules mid-run is incoherent. A
   shared `LockableSection` states the reason inline and wraps the content in
   a native `<fieldset disabled>`, which disables every nested control without
   threading a `disabled` prop through four separate form components. The
   disclosures still open - viewing during a run is fine; only editing dies.
6. **The legacy `ta-workflows-panel` value is truly migrated**, not
   overwritten: `"build" | "run" | "automate"` map to the new per-disclosure
   keys through a tested pure helper. This matters because the Automations
   tab still WRITES `"automate"` on every jump-to-workflow click, so the
   legacy key is read fresh on each mount and then cleared.

## 131. Weekly Checklist column on the courses table

Acceptance criteria:
1. `course_hub.weekly_checklist` jsonb holds an ordered list of
   `{id, label, checked, deadline}`. Caps: 30 items (beyond that a cell stops
   being scannable) and 200-char labels (matching `MAX_NAME` in
   `course-project.ts`). `coerceWeeklyChecklist` never throws: it drops
   entries with a bad or missing id/label, trims and caps labels, treats
   `checked` as false unless literally `true`, and NULLS a malformed deadline
   while KEEPING the item - losing a checklist entry because its deadline was
   corrupt would be worse than losing the deadline.
2. **Checked state is a plain persistent boolean, cleared only by the
   instructor.** An earlier design auto-reset it each course week; the
   instructor overruled that ("don't do it for me"). The week-last-checked
   field and the dependency on `currentCourseWeek` were REMOVED, not left
   dormant - a disabled auto-reset is exactly what fires unexpectedly later.
   The feature now needs no notion of a course's current week at all, only
   the real calendar week, so the "course with no resolvable current week"
   case cannot arise.
3. A per-cell **Reset all** control: confirms with the count it will clear,
   scoped to that one course's items, disabled when nothing is checked, and
   persisting through the same optimistic path as a single toggle.
4. Deadlines are `{weekday 0=Sunday..6=Saturday, time|null}`, deliberately
   matching `workflow_schedules.days_of_week` rather than
   `assignment-due-rule.ts`'s `"sun".."sat"` strings, so the codebase converges
   on one weekday encoding.
5. **Overdue redefined for persistent checks**: an item is overdue only while
   UNCHECKED and past this week's occurrence of its deadline. Checking it
   suppresses overdue until it is unchecked or reset - otherwise a task
   finished months ago would shout overdue every week forever.
6. Never colour-only: the collapsed cell prints "K overdue" as text and each
   overdue row prints the word "Overdue"; colour is supplementary.
7. Dense-table shape: collapsed shows "N/M done" plus any overdue count and a
   Manage link; editing happens in a Popover (the `MiscFilesCell` pattern),
   never inline on the row.
8. Placed immediately after `assignmentDue` in the Assessment cadence group,
   because both encode the same "weekday plus optional time" recurring shape -
   rather than landing at the far end of a 29-column table.
9. `Course.weeklyChecklist` is optional, unlike its required array siblings:
   making it required would have forced the field into ~27 hand-built Course
   fixtures across the repo. Every real course from `toCourse` gets a concrete
   coerced array, and every read site goes through the coercion.

## 132. Checklist items reach the calendar, and the cell shows them inline

Acceptance criteria:
1. **An authorized, single-point exception to the no-emoji rule.** AGENTS.md
   forbids emojis anywhere in the codebase; the instructor asked for an emoji
   check mark in calendar titles, was told about the conflict, and reaffirmed
   it. U+2705 appears in exactly ONE place - `CHECKLIST_DONE_PREFIX` in
   `course-calendar-events.ts` - carrying a comment recording the
   authorization so a future lint sweep does not "fix" it out. A raw literal
   that leaked into a test assertion was caught and replaced with an import of
   the constant. Verified by a codepoint scan of the whole tree, not grep -P
   (which is broken in this environment).
2. **One calendar path, not two.** Checklist deadlines became a `"checklist"`
   event kind inside the existing `buildCourseEvents` planner, and
   `RECOGNIZED_KEY_PATTERN` was extended so the existing ownership mechanism
   still decides which events the sync may touch. A second writer would have
   fought the first over the same events.
3. **Recurrence is expanded per week, bounded by the tile's startDate and
   endDate.** With either missing, checklist events are SKIPPED with an
   explicit note - and the note is gated on the course actually having
   deadlined items, so a checklist-less course never gets a spurious warning.
4. **The check marks the week it was checked IN.** `checked` alone could not
   express that, so an item now records `checkedAt`, stamped on the
   unchecked->checked transition, forced null when unchecked, and cleared by
   Reset all. Only that week's event carries the prefix.
5. **Bounded write cost**: toggling calls a scoped action that computes ONLY
   the current week's event and does one `listEventsByPrivateProps` plus a
   create-or-update - never a full term resync, never a delete. The local save
   happens FIRST and a calendar failure is a non-fatal notice, never a revert
   of an already-saved check.
   KNOWN GAP, deliberate: renaming, re-timing or deleting an item updates the
   calendar on the next full "Sync course calendar" run, not instantly.
6. **The cell shows its items inline.** The shipped design summarized behind a
   "Manage" Popover on density grounds; the instructor overruled it. The
   Popover is REMOVED, not left reachable by a second path, and checkboxes are
   tickable in the cell.
7. **A 30-item cell scrolls within itself** (max height 260px) rather than
   growing the row - an unbounded row stretches every other column's cell in
   that row. Truncating to "first few plus a hidden remainder" was explicitly
   rejected: it would reintroduce the click-to-see-the-rest problem this
   redesign removed, while appearing to comply.
8. Day and time controls are permanently visible per item AND on the add row,
   committing on change with no Save button, so creating an item with a
   deadline is one pass: type label, pick day, pick time, Enter. Day and time
   PERSIST across adds while the label clears and refocuses, because
   checklists are typically several items due the same day. Deadlines stay
   optional - an item without one simply never reaches the calendar.
9. Column min width 220 -> 280 to fit the day/time pair; native inputs
   throughout, matching `AssignmentDueCell`, rather than adding a picker
   dependency for one cell.

## 133. Institutions can be added from the Knowledge tab

Adding an institution was only possible from the Settings dropdown in
TopBar, which is a trip away from the tab where a new school's pages are
actually written.

Acceptance criteria:
1. **One validation rule, two call sites.** `validateNewInstitutionAcronym`
   in `src/lib/institutions.ts` is now the single definition of a valid
   acronym (trim, uppercase, reject blank, reject duplicate). TopBar was
   refactored to call it instead of restating the check inline, so the two
   entry points cannot drift on what they accept. TopBar's observable
   behaviour is unchanged.
2. Duplicate detection normalizes BOTH sides, so an existing entry that was
   never normalized still matches - and a near-miss ("MCCX" against "MCC") is
   correctly not a duplicate. Both pinned by tests.
3. The add control appears next to the picker AND inside the zero-institutions
   empty state, so the first institution can be registered without a trip to
   Settings either.
4. **The registry is global; the SELECTION is not.** The write goes to the one
   shared registry, but nothing touches the header's active institution -
   preserving the decoupling from regression 121. Adding then switches the
   KNOWLEDGE tab to the new institution, since adding from this tab almost
   always precedes writing pages for it.
5. **The switch honours the unsaved-edits guard.** It routes through the
   existing `switchInstitution()` / `confirmDiscard()` path, and if the
   instructor cancels, the institution stays REGISTERED (it is in the picker)
   while the switch aborts - the registry write is global and non-destructive,
   so it should not be undone by a local navigation decision.
6. **It states what registering does NOT do**: "Registering an acronym here
   does not grant Canvas access - that still needs the institution's
   server-side env vars, configured separately." An acronym drives per-school
   SERVER env vars, so without that hint a new acronym looks like it should
   light up Canvas features.
7. A duplicate says so ("MCC is already registered.") rather than silently
   clearing the field, which reads as a failure.
8. **Removal is deliberately NOT offered here.** Removing an institution from
   this tab would orphan every page filed under it with no warning; that needs
   its own design (a page count, or a reassignment flow). TopBar keeps sole
   ownership of removal.

## 134. Selects inside floating windows open above them

The live-class window's course dropdown opened BEHIND the window it belongs
to - rendered, but invisible and unclickable.

Acceptance criteria:
1. **Root cause**: MUI renders a Select's menu in a portal on `<body>` at the
   theme's modal z-index (1300 by default), while the app's floating windows
   sit far above it - `.selectionChatWindow` is `z-index: 9998` and the FAB
   itself is 9999. Any select inside one of those windows therefore opened its
   menu underneath its own window.
2. `floatingWindowSelectSlotProps` in
   `src/app/components/ui/floating-window-menu.ts` lifts the menu above both,
   applied to all four selects in `SessionSetupPanel` (course, module,
   microphone, transcription path).
3. **Deliberately a shared constant, not a repeated magic number.** This
   failure is invisible in code review - the markup reads as correct, and the
   bug only appears when a window overlaps its own menu - so the next select
   added to a floating window needs an obvious thing to reuse.
4. The nesting matters and is documented on the constant: `TextField`
   forwards to `Select` through `slotProps.select`, so the menu's props are
   `slotProps.select.MenuProps`. A top-level `MenuProps` on `TextField` is not
   valid in this MUI version and fails to typecheck - which is what the first
   attempt hit.

## 135. Grades-due column, structured breaks, and Brightspace

Three courses-table requests in one change.

Acceptance criteria:
1. **Grades due is two scalar columns**, `grades_due_date date` and
   `grades_due_time text`, not one encoded string. `assignment_due_rule` uses a
   single "day|time" string precisely because it encodes a RECURRING rule; a
   grades deadline is a real calendar date, so keeping them separate lets a
   malformed date and a malformed time each degrade to null independently
   rather than one bad half poisoning the other. **A time can never persist
   without its date** - enforced on both read and write.
2. Placed immediately after `endDate`, in the term-logistics group rather than
   with `assignmentDue`/`weeklyChecklist`: it shares their one-calendar-date
   shape, not the recurring-weekday shape those two encode, and a reader
   scanning for "when does the course end" looks right beside it for "when are
   grades due". Pinned by an adjacency assertion.
3. **Breaks stays a `string | null` column.** `renderCourseFacts` feeds it
   into generated-artifact prompts and existing courses hold hand-typed prose,
   so the storage type could not change. The new controls write a canonical
   `YYYY-MM-DD..YYYY-MM-DD [| Label]` line per break - `..` avoids ambiguity
   with the hyphens inside ISO dates, and ` | ` matches the pipe convention
   already used by integrations/roster/studentRepos.
4. **Parsing is all-or-nothing per course, deliberately.** If any line fails
   to parse, the cell falls back to a plain textarea seeded with the UNTOUCHED
   raw text. A partial parse - keep the lines that match, drop the rest -
   was rejected and sabotage-tested: it would silently discard a break the
   instructor depends on.
5. **Invalid break drafts BLOCK the save** rather than saving with a warning.
   These values feed generated-artifact prompts, and a warn-and-save state
   still requires coming back to fix it, so blocking while the picker is open
   (the cheapest moment to fix it) costs nothing. Validation names the
   specific problem: end-before-start, outside the term when both term dates
   are set, and overlaps.
6. Breaks sorting moved from lexical text to the earliest structured start
   date - sorting "Fall break" against "Spring break" alphabetically was never
   meaningful. Legacy prose and unset both sort last, in both directions.
7. **One shared LMS list.** `COURSE_LMS_OPTIONS` + `courseLmsLabel()` now
   back both selects AND the display mapping, which previously was a third
   independent restatement knowing only canvas and blackboard - so any new
   option would have rendered as its raw lowercase slug. Brightspace added,
   matching the slug `CartridgeDropPanel` already uses.
8. `CartridgeDropPanel`'s list is deliberately NOT shared: it answers "what
   export format", not "what LMS does this course run in", and it carries
   Moodle, which is not being added here.
9. Selecting Brightspace records the LMS and flows into course facts. It does
   NOT create an integration - every LMS API path is Canvas-specific - and
   nothing branches on `lms` to enable features, so the option is safe and
   carries no connectivity implication in its copy.

## 136. Calendar events actually reach the calendar

Reported: "i dont see the checklist events showing up on my calendar", and
separately a request for a running term event per course. Diagnosis confirmed
FOUR causes, none of them a missing planner.

Acceptance criteria:
1. **The term event already existed.** `buildCourseEvents` has always emitted
   one all-day event spanning startDate to endDate, already handling Google's
   exclusive all-day `end`. What was missing was REACH, not the feature.
2. **Nothing pushed on create or edit.** Only the full sync (reachable solely
   through a workflow step - there was no button for it in the Courses UI) and
   a checkbox toggle ever called the Google layer, and the toggle pushed only
   the CURRENT week. Adding a deadlined item, editing a deadline, or renaming
   one never touched the calendar.
3. Every checklist mutation - add, rename, day/time change, toggle, remove,
   reset-all - now syncs, and only after a SUCCESSFUL local persist (`persist`
   returns a boolean the callers gate on). `syncChecklistItemCalendarAction`
   now covers every occurrence across the term, not just this week, and
   handles deletion so a cleared deadline's stale events are diffed away.
4. **Debounce shape**: a keyed trailing-edge debounce (800ms) applied ONLY to
   the two deadline controls, because those commit on change and a native
   `type="time"` input fires several onChange events per logical edit. Add,
   rename-on-blur, toggle, remove and reset-all are discrete single actions
   with no burst to collapse, so they push immediately. The scheduler is a
   plain utility with no React/DOM dependency, unit-tested with fake timers.
5. **The blockers are visible where the instructor is.** `courseCalendarBlockers`
   renders in the sticky NAME cell - not the checklist cell - because a course
   with no checklist at all still has its term event blocked, and the name cell
   survives whichever optional columns are toggled off. The connection status
   is fetched ONCE page-level and threaded down, so N rows never make N checks.
6. **`syncAllCoursesCalendarAction`** resolves the calendar target and token
   once (a per-user setting, not per-course), then runs every course through
   the SAME `syncOneCourseCalendar` helper extracted from the single-course
   body - one planner, one diff mechanism. Per-course try/catch, so one bad
   course cannot abort the rest, with per-course synced/skipped/error
   classification. Idempotency across both paths is proven by a test running a
   second pass over the first pass's own output.
7. **Known gap, recorded honestly**: there is no React Testing Library in this
   repo and no `.test.tsx` anywhere, so the cell's wiring is covered by the
   pure modules behind it rather than by component tests - consistent with the
   codebase's convention of pushing logic into pure, tested modules.

## 137. No-code courses stop being handed the coding contract

Reported twice, with evidence: a NO-CODE Project Management kickoff shipped
PowerPoints containing Python - 858 code-bearing lines across the decks,
slides labelled PYTHON rendering `def check_status(task_dict):` - and class
openers that asked those students to write code.

Acceptance criteria:
1. **The binding was never wrong; the PROMPT was.** `courseKind: "applied"` is
   correctly bound in the preset and correctly threaded through the step into
   the actions. THREE builders composed a deck prompt and only ONE respected
   the kind: `generateLectureFromMaterialsAction` and
   `generateSlidesForAssignment` hardcoded the imported coding constants, so
   an applied course was handed the four-slide Example/Walkthrough/Practice/
   Answer cycle with `code`/`codeLanguage` fields. The model did as told.
2. A FOURTH path was found while tracing: the `prepare-lecture` step had no
   `courseKind` input at all. It has one now.
3. The zip-upload path (`buildAssignmentPlan`) genuinely cannot know a course
   kind - it builds from an uploaded repo's READMEs and tests - so it passes
   `"coding"` EXPLICITLY with a comment rather than relying on a silent
   parameter default. A caller that cannot know must say so.
4. **A comment saying "must not contain code" was demonstrably not enough -
   this was the second occurrence - so there is now a data-layer guard.**
   `enforceNoCodeForApplied` strips `code`/`codeLanguage` from applied slides
   and RECORDS the count, surfaced in the run summary. Strip-and-record beats
   fail-loud here: failing the whole generation would cost an otherwise-good
   deck over two fixable fields, and this codebase already degrades visibly
   rather than silently. Applied at all four builders - defense in depth.
5. **The openers were downstream, and are guarded too.** They seed their
   prompt with `practiceProblems[0]`, which came from these decks, so coding
   decks produced coding openers even though the opener prompt itself forbids
   code. That injection is now gated on the exercise kind. A related gap was
   found and fixed: `steps.assignments-template.ts`'s inline opener call never
   passed `exerciseKind` at all, so it always defaulted to coding.
6. **The hands-on slot is filled with real professional tools**, per the
   instructor's direction: for an applied course, each module names the tool a
   practitioner actually uses (MS Project, Jira, Asana, Trello, Smartsheet,
   Excel - real, never invented), introduces it, and the hands-on work uses a
   FREE version, named, so no student is asked to buy anything. A
   `moduleTools` field carries the deck's chosen tool into that week's
   assignment instructions, so the deck and the assignment cannot drift onto
   different tools. This EXTENDS the existing Artifact and Your Turn slides
   rather than adding a seventh - the six-slide cycle is unchanged - and is
   distinct from the existing "Modern Tech" closing section.
   AMENDED (entry 156, RCA round 2): "the six-slide cycle is unchanged" is
   now a stale phrase - entry 156 later made the Your Turn/Model Response
   pair conditional (first 2 concepts only). This AC's SUBSTANCE still holds
   unaffected: the tool rule extends the existing Artifact and Your Turn
   slides rather than adding a seventh slide type, regardless of how many
   concepts get that pair in a given lecture - only the phrase describing the
   cycle as unconditionally six slides is stale, not the point this AC makes.
7. The coding contract and its byte-identical hash pins are untouched.
   AMENDED (Group Z, entry Z4-AC0): the coding contract and its hash pins
   were DELIBERATELY updated - see entry 100 AC2's amendment for the new
   length/hash values - as part of porting this entry's own no-code lessons
   (one verified case study per week, a concept-first opener before the
   deck, and the applied path's professional-materials lecture-flow slides:
   Agenda, Section dividers, Bridges, Recap, Next Week, an Appendix, Failure
   Modes, Terminology, an optional non-mandatory graphic) to the coding
   contract too. This is a PARITY PORT, not a merge of the two contracts:
   the coding cycle (Example/Walkthrough/Practice/Answer, with `code`/
   `codeLanguage` fields) and the applied cycle (Principle/In Practice/
   Artifact/Judgment Call/Your Turn/Model Response, with `moduleTools` and a
   MANDATORY graphic on Artifact/Judgment Call) remain genuinely different
   shapes - this entry's own AC1 (an applied course must never be handed the
   coding contract) holds unchanged in that direction; only the DIRECTION
   this note addresses (a coding course was missing lecture-flow structure
   the applied course had already earned) has changed.

## 138. The run log is readable

The downloaded run log had six defects beyond missing dividers, all visible in
a real report the instructor attached.

Acceptance criteria:
1. **Course rendered as a raw UUID** while the error line beneath it named the
   course in English. `workflow_run_steps.course_name` (new nullable column)
   is captured where the outcome is logged - the fan-out already had the name,
   it simply was not threaded - and the formatter shows
   `Prescriptive AI (1c41b131-...)`, falling back to the bare id for rows
   written before the migration.
2. **Every entry read `[0] grade-repo`** because a fan-out reuses step index 0.
   The header now reads `[0] grade-repo - MIT: Prescriptive AI - ERROR - 29.7s`.
3. **Entries were not chronological** - sorted by index and insertion, so
   timestamps ran 03:45:19, 03:46:04, 03:46:06, 03:45:20. Now sorted by
   `startedAt`, nulls last, ties preserving original order.
4. Timestamps and durations render human-readably WITH the raw value retained
   in parentheses - a log is also evidence.
5. **Timezone determinism**: the human form is built from `Date`'s UTC getters
   and a hand-written month table, never `toLocaleString`/`Intl`, which vary by
   host ICU data even with a pinned timezone. A formatter test must not fail on
   another machine.
6. Multi-repo summaries are one item per line; step metadata, progress,
   summary and error are separated by dividers.
7. The Detail block splits only at real entry boundaries, leaving
   `joinStepErrorDetail` itself untouched so the schedule's truncated
   `last_run_detail` snippet - a different consumer of the same string - is
   unaffected.

## 139. grade-repo writes its grades to Drafted Grades

The workflow named "Grade New Repo Submission (Draft)" produced no drafts:
`gradeTileRepos` (the batch step's core) called `saveGradingDraftAction`, but
`grade-repo` only formatted a run-log summary.

Acceptance criteria:
1. Both the single-repo path and the org fan-out persist through the SAME
   `saveGradingDraftAction`, payload shape and `"repos"` source the batch step
   uses - the Drafted Grades tab, its review flow and its posting flow all read
   that one shape.
2. The org fan-out writes ONE draft covering every repo it graded, not one per
   repo.
3. **The dedupe guard exists because this runs unattended every 15 minutes**,
   which would otherwise mean ~96 near-identical pending drafts a day. Identity
   is the workflow's own still-pending "repos" draft - deliberately NOT the set
   of repos graded, since that set legitimately grows as students submit, which
   would defeat the guard on the very next run.
4. **A changed score is never silently dropped.** Results are fingerprinted per
   student (score and rubric areas, comments excluded): identical fingerprints
   skip entirely; ANY difference replaces the stale pending draft with the
   current results.
5. A failed draft save never discards the grading - the LLM calls are the
   expensive part - and surfaces the failure in the summary instead. A run that
   graded nothing writes nothing.
6. `batch-grade-repos-to-draft` is untouched.

## 140. A cross-course weekly checklist view in the FAB

Acceptance criteria:
1. A third FAB action opens a modal listing every checklist item across every
   course, in a real sortable `<table>` with `aria-sort`.
2. **Modal, not a third floating window**: the FAB's two windows are
   persistent workspaces kept open while working, which is why they persist
   position and open-state. This is a glance-and-close snapshot, and a modal
   re-fetches on open rather than resurrecting stale data from a prior session.
3. Columns: course, item, weekday, time, checked, overdue - weekday and time
   separate so each sorts independently. Default sort puts OPEN items first,
   because the view exists to answer "what do I still owe".
4. Missing values sort last in both directions; ties break by course then
   label, since two courses can share an item label. Boolean columns encode
   deliberately opposite polarity (open-first, overdue-first) rather than a
   uniform rule.
5. **Read-only, deliberately**: the cell's toggle path now triggers a scoped
   Google Calendar write, and a second mutation path would race it. Recorded as
   a follow-up, not an oversight.
6. Distinct states, including "no items at all" versus "a filter hid
   everything" - the search box and hide-completed toggle make the second
   reachable, both persisted per the standing rule.

## 141. The no-code kickoff builds assignment-first

Requested principle: the assignment is the spine of a module, and every other
artifact exists to prepare students for it. Previously the order inside
`buildScheduleWeekPlan` was the reverse - slides first (which also invented
the module's tools), then the module intro grounded in nothing but the topic,
then the assignment LAST, following the deck.

Acceptance criteria:
1. Per week the order is now: pick the module's real tool(s), generate the
   ASSIGNMENT, then generate the module intro and slides IN PARALLEL, both
   grounded in the assignment text that now exists.
2. **The grounding is real, not just reordering.** The intro receives the
   assignment through a new `upcomingAssignmentContext` parameter and the deck
   through new `assignmentContext`/`requiredTools` parameters, each with an
   explicit prompt block. A deck that merely RAN after the assignment without
   seeing it would not satisfy the request, and a test pins that the text
   actually reaches each prompt.
3. Class openers and the test-template step gained an opt-in
   `groundInAssignment` input; when on they read that week's already-produced
   `role: "instructions"` file out of the accumulated files chain and fold the
   real assignment text into their prompt. `NO_CODE_KICKOFF` turns both on.

   AMENDED (entry 158): `NO_CODE_KICKOFF` no longer sets the OPENER half of
   this ("4.groundInAssignment"). Entry 158 moved opener generation inside
   `lecture-materials-from-schedule` and added COURSE_REFRESH's standalone
   `generate-class-openers` (source index 4) to that kickoff's `skipSteps`, so
   an override on a skipped step would be dead config. The BEHAVIOUR this AC
   protects is unchanged and in fact stronger: the in-plan opener receives the
   week's real assignment text directly as a parameter
   (`course-planning-grounding.ts`) rather than looking up a `role:
   "instructions"` file after the fact. The test-template half
   ("6.groundInAssignment") is untouched, and COURSE_REFRESH's own standalone
   opener step still honours the input exactly as written above.

   AMENDED (entry 164): `COURSE_REFRESH`'s standalone opener has now been
   retired too. Its repo and repoless lecture paths both emit the opener from
   their in-plan lecture step, so the old opener lookup and its runtime field no
   longer exist. Removing that source step shifts the test-template binding
   from source index 6 to 5; the no-code kickoff now pins
   `"5.groundInAssignment"` to `"1"`.
4. **The tool-flow direction from regression 137 was deliberately REVERSED**:
   the tool is now chosen once up front by `selectRequiredTools` and consumed
   by BOTH the assignment and the deck, because the assignment now runs first
   and still needs a real tool commitment. The deck keeps its per-concept
   `moduleTools` field (load-bearing for its Artifact/Your Turn slides) but
   must stay consistent with the pre-selected tools instead of inventing
   independently. This costs one extra lean LLM call per applied week.
5. **`COURSE_KICKOFF` is functionally unchanged.** It needed two blank
   `bindOverrides` only because `course-refresh` now exposes
   `groundInAssignment` as a runtime field, and a pre-existing test requires
   every step input to have some binding there - without them the field would
   have leaked onto the coding kickoff's run form. Blank still means off.
6. **Positional bindings were re-verified and pinned.** `bindOverrides` keys
   and `skipSteps` are positional and, per the existing note in
   `presets.kickoff.test.ts`, are SILENTLY SKIPPED ON A MISS - a wrong index
   does not error, it just stops applying, which is exactly how a no-code
   course would start emitting code again. New assertions pin them.
7. `generate-assignment-from-template` stays ungrounded on purpose: it is a
   separate, optional, template-driven single-topic generator, not part of the
   per-module chain the assignment feeds.

## 142. The formal assignment generator gets the deck's real-tool rule too

Entry 84.2 gave `generateAssignmentAction` a courseKind-gated tool rule, but
the applied branch was only ever a NEGATIVE constraint plus category hints
("boards, planners, SaaS free tiers") - never a requirement to actually NAME
a product, unlike the deck's "REAL PROFESSIONAL TOOLS" rule (entry 137.6).
This extends the same generator (`generateAssignmentAction`,
`src/app/actions/llm-content.ts`) - used by both kickoffs and Course Refresh
via `generate-assignment-from-template`
(`src/lib/workflows/registry/steps.assignments-template.ts`) - to match.

Acceptance criteria:
1. **A shared constant, not a second paraphrase.** `APPLIED_REAL_TOOL_RULE`
   (`src/lib/course-kind.ts`) is the ONE sentence stating the rule: name a
   REAL, widely used practitioner tool (never invented) and state the FREE
   way a student reaches it (free tier, free trial, community edition, or -
   only when truly free-less - a spreadsheet equivalent). Both the deck's
   "REAL PROFESSIONAL TOOLS" bullet (`APPLIED_STRUCTURE_REQUIREMENTS`,
   `src/lib/slide-prompt.ts`) and the assignment prompt's applied branch
   interpolate it verbatim, so the two cannot drift on what counts as an
   acceptable tool the way they had (entry 84.2's negative-only wording).
   The no-code prohibition ("do not list programming languages, IDEs, or
   developer platforms") is kept, unchanged in spirit.
2. **`generateAssignmentAction` gained an optional `requiredTools` parameter,
   last**, mirroring `generateAssignmentInstructionsForAssignment`'s
   parameter of the same name (`src/app/actions/shared.ts`, entry 141.2).
   When non-blank AND `courseKind === "applied"`, the prompt adds a
   "tool(s) already decided" sentence naming them and forbidding a different
   one; the guard on `courseKind` means even a caller that mistakenly passed
   a hint for a coding course cannot affect its prompt. Blank (the default)
   changes nothing beyond AC1's rule text - every pre-existing call site is
   unaffected.
3. **AC3 investigation: two designs were compared, and (a) was chosen.**
   (a) `generate-assignment-from-template` calls `selectRequiredTools`
   itself (now exported from `course-planning-grounding.ts`) for its own
   resolved topic/week. (b) would have the schedule-driven deck step publish
   its chosen tool as a step OUTPUT for the template step to bind. (b) is
   NOT reachable with today's plumbing and was not built: verified that
   `lecture-materials-from-schedule`'s only output is `files` - the tool
   decision is fully internal to `buildScheduleWeekPlan` and never surfaces
   per-week - and even if it did, that step processes an entire SCHEDULE (all
   weeks) in one call while the template step resolves a single week, so
   there is no scalar "this week's tools" value to bind to; building one
   would mean a new output type plus new week-selection logic that exists
   nowhere else, i.e. exactly the "speculative wiring" the brief said to
   avoid. It also crosses the include boundary into `course-refresh`'s
   positional `bindOverrides`, silently skipped on a miss (entry 141.6) -
   more fragility for a value that does not exist yet. **(a) trades exactness
   for reachability**: it is a SECOND, independent LLM call for the same
   topic (mirrors buildScheduleWeekPlan's `selectRequiredTools` call, entry
   141.4) - likely, not guaranteed, to name the same tool a same-week deck
   run already chose. This is stated in code comments at both call sites so
   the guarantee is never overclaimed.
4. `selectRequiredTools` is called only when `courseKind === "applied"` AND
   a topic actually resolved (explicit input or the tile's current week) -
   an unresolved topic has nothing meaningful to ask about, and a coding
   course never calls it (requiredTools is an applied-only concept).
5. **The `tools` field in `AssignmentData` is untouched** - still
   `string[]`, still consumed the same way downstream; only the prompt asking
   for its contents changed.
6. Coding-course behavior is unaffected: `courseKindContract`, the coding
   ternary branch text ("Python, VS Code, Google Colab, GitHub, or Replit"),
   and the rest of the template are byte-identical, pinned by a test that
   reconstructs the expected prompt from the same building blocks
   (`courseKindContract`, `PLAIN_LANGUAGE_CONTRACT`) rather than a hand-typed
   duplicate.

## 143. A workflow's own run logs are reachable from the Workflows tab

`workflow_runs`/`workflow_run_steps` (regression 138's `buildRunLogText`)
already recorded every run and rendered a readable `.txt` log, and the
Automations hub already surfaced it - but only for a run a schedule or
trigger caused. A manually-run workflow's log had no `triggerRef` at all
(regression 119) and was therefore unreachable from anywhere in the app.
This wires the same data through a second path, keyed by `workflowId`
instead, into the Workflows tab.

Acceptance criteria:
1. **Placement (WorkflowPanel.tsx): a third collapsed disclosure, "Run
   history", sits right after the run form/Run Progress block and before
   "Schedule & trigger".** Commit c6eea41's merged Workflows page already put
   the run form as the page's primary, always-visible content, with "Steps"
   collapsed *before* it and "Schedule & trigger" collapsed *after* it. Adding
   "Run history" *before* the run form (next to Steps) would push that
   primary content further down on every visit; placed after, it costs
   nothing while collapsed (the default) and reads in a coherent order:
   configure (Steps) -> do (run form + progress) -> review what already
   happened (Run history) -> automate what happens next (Schedule &
   trigger). Its toggle label carries no live run count, unlike Steps'/
   Schedule & trigger's counts (already-loaded workflow/automation state) -
   computing one would mean fetching runs just to render the CLOSED
   disclosure, which is exactly the eager query AC4 forbids.
2. **`AutomationRunsSection` (already rendering this exact table + log modal
   for the Automations hub) was generalized in place, not duplicated.** It
   now takes optional `triggerRef` OR `workflowId` (exactly one, mutually
   exclusive - AutomationRow still passes only `triggerRef`, unchanged) plus
   an `emptyMessage` override, so the same table/log-modal/artifact-download
   wiring serves both contexts. Rebuilding a second table+modal component was
   explicitly out of scope per the brief ("wire it, do not rebuild it";
   AC2's "do NOT build a second viewer").
3. **Server action: `listRunsForWorkflowAction` is a sibling of
   `listAutomationRunsAction`, not a generalized replacement.** The two
   answer different questions ("this schedule/trigger's runs" vs "this
   workflow's runs, however caused"), `triggerRef`/`workflowId` are never
   both meaningful for the same call, and `listAutomationRunsAction`'s
   `(triggerRef, limit)` signature is already pinned by
   `automation-runs.test.ts` and consumed by working call sites - reshaping
   it into a filter object would touch tested, working code for no
   behavioral gain. The actual duplication (fetch artifacts, map to
   `AutomationRunSummary`) is factored into a shared `toRunSummaries` helper
   instead, so the two actions differ by exactly the one line that is
   genuinely different: which `listRecentRuns` filter they pass. Both stay
   owner-scoped (`requireOwner` + every read `.eq("user_id", ...)`) and
   return `{error}` rather than throwing, matching every other action in the
   file; `getAutomationRunLogAction`/`getAutomationArtifactUrlAction` needed
   no changes at all - they already operate on a bare run/file id, not a
   trigger, so a missing/foreign id already errored rather than leaking
   another user's data before this feature existed.
   **Naming note**: the obvious name, `listWorkflowRunsAction`, was already
   taken by `github-repos.ts`'s GitHub Actions CI run list (an unrelated
   domain that also uses the word "workflow") and re-exported through the
   same `src/app/actions` barrel - using it would have been a compile error
   (`TS2308`, caught by `tsc`, not by lint or tests). Renamed to
   `listRunsForWorkflowAction`.
4. **Lazy (AC4), matching `AutomationRunsSection`'s existing rule**: the run
   list is fetched by the effect inside `AutomationRunsSection`, which only
   mounts when `runHistoryOpen` is true - never on tab mount, never on
   workflow selection. `runHistoryOpen` is owned by `WorkflowsTab` (mirroring
   `stepsOpen`/`automationOpen`) and persisted to
   `localStorage["ta-workflows-run-history-open"]` per the standing
   persist-UI-state rule; unlike those two, there is no legacy
   `ta-workflows-panel` value to migrate from (that tri-state only ever
   distinguished build/run/automate), so it starts closed on first load with
   no migration branch.
5. **AC6 finding: artifacts came free.** `listRecentRuns`'s `workflowId`
   filter already existed (used elsewhere for `decideWorkflowCompleted`), and
   `groupArtifactsByRun` keys off each `recording_files` row's
   `workflowRunId` regardless of how the runs were queried - so the shared
   `toRunSummaries` helper attaches artifacts identically for both the
   trigger-keyed and workflow-keyed paths with no extra plumbing.
6. Distinct loading/error/empty states were already built into
   `AutomationRunsSection`; the empty state now reads "This workflow has not
   been run yet." for the workflow-keyed path (vs. "No runs recorded yet."
   for the trigger-keyed path) via the new `emptyMessage` prop, so a workflow
   that has genuinely never run reads differently from a fetch failure.
7. New tests (`automation-runs.test.ts`) cover `listRunsForWorkflowAction`:
   the `workflowId`/`limit` pass-through, artifact attachment, an empty
   artifact array (not `undefined`) for an artifact-less run, a manual run
   with `triggerRef: null` appearing in the results (the entire reason this
   sibling exists), and both the `requireOwner`-rejects and
   `listRecentRuns`-throws error paths. Sabotage-checked: dropping the
   `workflowId` filter and short-circuiting to `{ runs: [] }` failed the four
   positive-path tests (pass-through, artifact attachment, empty-artifacts,
   manual-run-included) while leaving the two error-path tests green, as
   expected - reverted after confirming.
8. No React-rendering tests were added, per standing instruction; the
   `AutomationRunsSection`/`WorkflowPanel` JSX changes were verified by
   `tsc --noEmit` and `eslint` instead.

## 144. Module objectives pages, and openers in the materials zip

Acceptance criteria:
1. A module objectives document is produced per week for BOTH kickoffs and
   Course Refresh, generated alongside the other per-week artifacts where the
   schedule, the assignment and the week's tools are already in hand.
2. **Grounded in that week's ASSIGNMENT**, per regression 141's
   assignment-first principle: objectives state what a student must be able to
   do, and the assignment is what proves it.
3. It ships in the course materials zip with the other per-week artifacts and
   carries `role: "objectives"` so downstream steps can find it.
4. **It becomes a native LMS page through the SAME mechanism introductions
   already use** - `steps.lms-modules.ts` converts a file to a Page when it
   has `pageText` and a recognized role, and `"objectives"` was added to that
   existing gate rather than given a parallel path.
5. `moduleObjectives` is never blank on a plan: real generation, or a recorded
   failure. A week whose objectives fail degrades with a visible note through
   the existing `assembleLectureFiles` degraded-list pattern rather than
   shipping an empty document or aborting the run.
6. Class openers now land in the same materials zip.
7. **Positional index integrity re-pinned.** `bindOverrides` keys and
   `skipSteps` are positional and silently skipped on a miss (regression
   141.6), so `presets.kickoff.test.ts` gained assertions covering the new
   layout - a wrong index does not error, it quietly stops applying, which is
   how a no-code course would start emitting code again.

## 145. Module objectives adhere to Bloom's Taxonomy

The instructor asked that everything applicable - "at least the obj pages" -
adhere to Bloom's Taxonomy. Naming the taxonomy alone does not fix this: a
model told only "use Bloom's Taxonomy" still writes "students will understand
stakeholder management", which reads as compliant (it even sounds like a
level name) but is unmeasurable. Implemented:
1. **One shared constant, not a paraphrase per prompt.**
   `BLOOM_OBJECTIVES_CONTRACT` (new file, `src/lib/bloom-taxonomy.ts`) is the
   single source of truth, pushed VERBATIM into the objectives prompt -
   the same "extract once, interpolate everywhere" pattern
   `APPLIED_REAL_TOOL_RULE` established in `src/lib/course-kind.ts`. It states,
   in order: what makes an objective measurable (a named-level verb + an
   observable behavior + an assessability criterion), the banned-verb list
   with a substitution, the level-tag presentation, the alignment rule, and
   term progression.
2. **Banned verbs, with substitutions - this matters more than naming the
   taxonomy.** "know", "understand", "be familiar with", "learn about",
   "appreciate", "be aware of" are explicitly forbidden as an objective's
   verb, each described as naming an internal state nobody can grade. A
   substitution is given per level actually intended (at Understand:
   "explain"/"describe"/"summarize"; at Apply: "apply"/"use"/"demonstrate"/
   "solve"; at Analyze: "analyze"/"differentiate"/"compare"; at Evaluate:
   "evaluate"/"justify"/"critique"; at Create: "design"/"build"/"develop") so
   the model is never left to guess at a level's actual vocabulary.
3. **Presentation choice: an inline `(Bloom: Level)` tag ending each
   objective's bullet line** (e.g. "- Explain how... (Bloom: Understand)"),
   rather than grouping objectives under level subheadings. This keeps the
   existing "## Learning Objectives" + flat "- " bullet-list document shape
   intact (the docx renderer and `PLAIN_LANGUAGE_CONTRACT` already forbid
   introducing new markdown symbols into the body), while still making the
   distribution scannable at a glance.
   AMENDED (entry 179): REVERSED. The LEVEL TAG paragraph is gone from
   `BLOOM_OBJECTIVES_CONTRACT` and no generated objective carries a visible
   "(Bloom: Level)" tag any more - the user asked for the label gone, not for
   the taxonomy to stop shaping the objectives. Everything else in this entry
   still holds: the taxonomy still picks each objective's verb and level, and
   points 1, 2, 4 and 5 are untouched and still individually guard-tested. Note
   that point 4's and point 7's wording ("the tagged level", "an applied-course
   objective tagged e.g. (Bloom: Apply)") now describes an internal choice
   rather than anything printed on the document.
4. **Alignment with the assignment outranks everything else, stated
   explicitly as an outranking rule** ("ALIGNMENT - THIS RULE OUTRANKS EVERY
   OTHER RULE HERE") rather than left implicit: the tagged level must match
   what the assignment's real tasks demand, and when the demand is unclear
   the prompt is told to tag the LOWER level rather than the more impressive
   one. This is stated to outrank progression (point 5) by name, specifically
   so a model does not inflate verbs on a lower-level module to look more
   rigorous under term-progression pressure.
5. **Progression across the term, sourced from the real schedule/position,
   never fabricated.** `generateModuleObjectivesForAssignment`
   (`src/app/actions/shared.ts`) gained `weekNumber`/`totalWeeks` parameters;
   when both are known and positive it appends a "TERM POSITION: this module
   is week N of M" line telling the model how far toward Apply/Analyze/
   Evaluate/Create it is reasonable to climb. The schedule-driven caller
   (`buildScheduleWeekPlan`, `course-planning-grounding.ts`) always has this
   (its own `weekNumber` and the full `allWeeks` schedule it already receives).
   The repo-driven caller (`buildAssignmentPlan`, `shared.ts`) has no built-in
   notion of "how many weeks total" for a bare zip of assignment folders, so
   it gained its own optional `totalWeeks` parameter, threaded from both call
   sites in `lecture-plans.ts` (`bundles.length` / `folders.length`). Left at
   its 0 default (no schedule context), the line is omitted rather than
   asserting a fabricated "week N of 0".
6. **The embedded (no-LLM) scaffold path is deliberately NOT Bloom-tagged.**
   `scaffoldModuleObjectivesDoc` extracts its bullets from the source text
   VERBATIM with no model reasoning behind it ("nothing is invented" is its
   whole design point) - tagging a Bloom level there would mean fabricating
   an assessment the deterministic path cannot actually make. Bloom tagging
   is therefore a real (LLM) generation-only requirement; documented at the
   call site so this reads as a decision, not a gap.
7. **Scope decision (AC7): objectives pages only, both other candidates
   assessed and declined with reasons.**
   - Assignment instructions' steps/deliverables: NOT extended. The
     assignment already generates FIRST and is the ground truth objectives are
     graded against (regression 141's assignment-first principle, and rule 4
     above). Making the assignment generator ALSO Bloom-aware would invert
     that causality - the alignment check must read what the assignment
     already asks, never rewrite the assignment to hit a preconceived level.
   - Quiz/test generation: NOT extended. The test generator
     (`src/lib/test-brief.ts`, spec-driven via `TestSpec`/`TEST_QUESTION_KINDS`)
     has no existing per-week-objectives hook, and a test's `coverage` can
     span multiple weeks/milestones, so there is no single objectives
     document to align a test's questions to without a separate, feature-sized
     redesign of the spec model. Left as a follow-up, not silently dropped.
8. **Course-kind neutral by construction.** `BLOOM_OBJECTIVES_CONTRACT`
   contains no coding-specific language; `courseKindContract`/
   `enforceNoCodeForApplied` are unchanged and still gate code content
   independently, so an applied-course objective tagged e.g. "(Bloom: Apply)"
   remains bound to the week's named free tool via the existing REQUIRED
   TOOL(S) block, never to code.
9. Tests: `src/lib/bloom-taxonomy.test.ts` pins the constant's exact wording
   (all six levels, the banned-verb list + substitutions, the level-tag
   format, and the alignment-outranks-progression wording) so a future edit
   cannot silently soften it. `module-objectives.test.ts`,
   `schedule-week-plan.test.ts`, and `build-assignment-plan.test.ts` each
   assert the shared constant reaches their respective prompt verbatim, plus
   the term-position line's presence/absence rules. Sabotage-checked: dropping
   the constant's interpolation from the objectives prompt failed exactly the
   three "carries the Bloom's Taxonomy contract" tests (one per caller) and no
   others; dropping the term-position interpolation failed exactly the three
   "states the term position" tests, leaving the "omits" tests correctly
   green; weakening the ALIGNMENT wording in the constant itself failed
   exactly the alignment-precedence unit test in `bloom-taxonomy.test.ts` -
   all three reverted after confirming.

## 146. Course-long-project assignments chain together, with bounded student choice

The instructor asked that class assignments "build on each other when the
course-long project is selected", while students keep "freedom of choice in
terms of what project they pick, how they expand, etc" without that freedom
becoming an escape hatch from rigor.

**What already flowed before this feature, and what did not.** The
course-long project (`define-course-project`,
`src/lib/workflows/registry/steps.course-project.ts`) already writes a
`CourseProject` with one milestone per week onto the course tile
(`src/lib/course-project.ts`), and `milestoneBriefFor`/`renderMilestoneContract`
(the milestone sentence, plus up to 3 prior milestone titles) were already
wired into the TEMPLATE-DRIVEN generators - `assignment-brief.ts`
(`generate-assignment-from-template`), `class-session-brief.ts`
(`generate-class-session-from-template`), and `test-brief.ts` (the test
template step). They were NOT wired into `buildScheduleWeekPlan`
(`src/app/actions/course-planning-grounding.ts`) - the schedule-driven pipeline
behind the no-code kickoff's "Build lecture materials from schedule" step and
the "lecture-zip" step's repoless fallback - which is the pipeline that
generates the assignment FIRST, per module, from the schedule (regression
141). That is the actual per-week assignment generator this feature targets.

Acceptance criteria:
1. **Chaining (AC1).** `buildScheduleWeekPlan` gained a `courseProject`
   parameter (default `emptyCourseProject()`) and computes
   `milestoneBriefFor(courseProject, weekNumber)`, threaded as
   `generateAssignmentInstructionsForAssignment`'s new `milestone` parameter
   (`src/app/actions/shared.ts`). When set, the prompt gets a new numbered
   block (`12. COURSE PROJECT`) composing `renderMilestoneContract(milestone)`
   VERBATIM - which now explicitly says to BUILD ON prior milestones
   ("extend it, do not restart it from scratch") rather than just noting they
   happened, alongside the existing prior-titles list
   (`milestoneBriefFor`'s existing 3-title cap, unchanged).
2. **No-project path is unchanged (AC1), detected via `hasProject()`.**
   `milestoneBriefFor` already returns `null` when `!hasProject(project)` -
   `emptyCourseProject()`'s default `mode: "none"` makes this the exact same
   branch as a project explicitly switched off, so a course with no project
   gets a `null` milestone and byte-identical prompt behavior to before this
   feature.
3. **Choice, bounded by rigor (AC2/AC3), in one shared constant (AC7).**
   `PROJECT_CHOICE_CONTRACT` (`src/lib/course-project.ts`) is pushed VERBATIM
   alongside the milestone sentence, following the same "one constant,
   composed everywhere" pattern as `APPLIED_REAL_TOOL_RULE`
   (`src/lib/course-kind.ts`) and `BLOOM_OBJECTIVES_CONTRACT`
   (`src/lib/bloom-taxonomy.ts`). It states: the project's SUBJECT (which
   company/dataset/scenario) is the student's choice, not one the prompt
   fixes; give the student an explicit choice point using the
   concrete-direction rule already required elsewhere in the SAME prompt
   (`CONCRETE_DIRECTION_CONTRACT`, point 10) rather than restating its
   "2-4 examples, explicit scope, worked mini-example" requirements a second
   time; and - the rule that makes the freedom safe - "RIGOR IS NOT
   NEGOTIABLE": whatever subject the student picks, the deliverable must
   still exercise the week's module objectives at the same rigor. Because
   this constant explicitly depends on the concrete-direction rule already
   being present in the SAME prompt, it is composed only where that holds
   (`generateAssignmentInstructionsForAssignment`) - see point 7 below for
   why the template-driven assignment generator was NOT also wired to it.
4. **Continuity is honest (AC4).** Week 1 (no prior milestones) keeps
   `renderMilestoneContract`'s existing, unchanged branch: "this is the first
   milestone - do not assume any earlier project work exists", now extended to
   also say "and do not ask the student to build on something they have not
   made yet." A mid-project pivot is handled by `PROJECT_CHOICE_CONTRACT`
   itself: "if they changed subject or direction since then, follow their
   CURRENT direction instead of the original one - never penalize a change of
   direction or assume it did not happen." Neither branch invents the content
   of a specific prior artifact the model was never told about - only the
   milestone TITLE (not a fabricated description of what the student actually
   built) ever appears in the prompt.
5. **Composes with the tool commitment and the no-code guard (AC5).** The new
   `COURSE PROJECT` block is appended AFTER the existing `REQUIRED TOOL(S)`
   block (point 11) rather than replacing it, and `enforceNoCodeForApplied`
   (slide-level) and `courseKindContract` (prompt-level, unchanged) are
   untouched - an applied course's chained project inherits the SAME
   free-tool/no-code guarantees every other applied-week artifact already has.
   `generateCourseProjectAction` (`src/app/actions/course-project.ts`) already
   generates milestones through `courseKindContract`, so an applied project's
   milestones were already no-code-compatible before this feature; this
   feature only adds the per-week chaining/choice instructions on top.
6. **Course-kind neutral (AC6).** Neither `renderMilestoneContract`'s new
   sentence nor `PROJECT_CHOICE_CONTRACT` names coding or applied-specific
   vocabulary (pinned by a `course-project.test.ts` check that scans for
   "code"/"program"), and nothing in `buildScheduleWeekPlan`'s milestone
   computation branches on `courseKind` - a coding course reaching this
   pipeline (the "lecture-zip" step's repoless fallback when no repo is
   bound, or a schedule-driven Course Refresh) gets identical chaining/choice
   treatment to an applied one. **The repo/zip-driven coding pipeline
   (`buildAssignmentPlan` via `generateLecturePlansAction`, what
   `COURSE_KICKOFF`'s typical repo-bound "lecture-zip" run actually uses) was
   NOT wired**, and this is a scope decision, not an oversight: that pipeline
   derives each assignment's week number from its zip folder name AFTER
   generation (`assignWeekNumbers`/`weekMap` in `lecture-plans.ts`), so there
   is no resolved week number at generation time to look up a milestone
   against without restructuring that pipeline's ordering - a separate,
   larger change than this feature's scope.
7. **Scope decision: the template-driven `generate-assignment-from-template`
   step was NOT given `PROJECT_CHOICE_CONTRACT`, with a concrete reason.**
   `assignment-brief.ts`'s `buildAssignmentContext` already pushes
   `renderMilestoneContract` (so its chaining language improved automatically,
   for free, since it is the same shared function), but the OBJECT this
   feature targeted is `buildScheduleWeekPlan`'s per-week pipeline
   specifically (see "what already flowed" above). Checked and declined:
   `generateAssignmentAction` (`src/app/actions/llm-content.ts`, what that
   template step calls) never composes `CONCRETE_DIRECTION_CONTRACT` at all -
   `PROJECT_CHOICE_CONTRACT`'s reference to "the concrete-direction rule
   already required elsewhere in this prompt" would be false in that prompt,
   so composing it there would need CONCRETE_DIRECTION_CONTRACT added first
   (a separate, unrequested change to a different generator). Left as a
   follow-up, not silently dropped - mirrors regression 145's AC7 scope
   decision to decline quiz/test extension with stated reasons rather than
   silently narrowing scope.
8. **Tests** (`src/lib/course-project.test.ts`, `src/app/actions/shared.test.ts`,
   `src/app/actions/schedule-week-plan.test.ts`): the milestone and
   prior-week context reaching `buildScheduleWeekPlan`'s call into
   `generateAssignmentInstructionsForAssignment` (both the argument passed and
   the composed prompt text), the no-project/no-milestone-this-week path
   passing `null` unchanged, the choice/rigor clauses' exact wording, week-1's
   "nothing to build on" wording and the pivot wording, course-kind neutrality,
   and composition alongside `REQUIRED TOOL(S)`. **Sabotage-checked**:
   removing the prompt's `${projectRequirement}` interpolation failed exactly
   the 6 prompt-content assertions in `shared.test.ts`'s new describe block
   (the null-milestone and embedded-provider tests correctly stayed green);
   hardcoding `buildScheduleWeekPlan`'s computed `milestone` to `null` failed
   exactly the 4 `schedule-week-plan.test.ts` tests that expect a real
   milestone object (the 3 null-expecting tests correctly stayed green);
   removing `renderMilestoneContract`'s new build-on sentence failed exactly
   2 `course-project.test.ts` chaining tests plus 1 `shared.test.ts` test;
   removing `PROJECT_CHOICE_CONTRACT`'s rigor sentence failed exactly 2 tests
   (one per file). All four reverted after confirming.

## 147. Institutions can be removed too - resolving regression 133's deferral

Regression 133 added registering an institution acronym from the Knowledge
tab and explicitly declined to add removal there: "Removing an institution
from this tab would orphan every page filed under it with no warning; that
needs its own design... TopBar keeps sole ownership of removal." TopBar's own
removal (Settings dropdown) had no warning of any kind either - it just
called `writeInstitutions(institutions.filter(...))` directly. This feature
is that design, resolving the deferral: removal is now available from BOTH
entry points, both routed through one shared, guarded flow.

**What actually references an institution acronym (established by grepping
every `.sql` migration and the generated Supabase types for an `institution`/
`acronym` column), beyond the two already known (`institution_pages.institution`,
`course_hub.institution`):
- `workflow_schedules.institution` and `workflow_triggers.institution` - a
  schedule/trigger's institution scope (nullable; `"*"` means "every
  configured institution" per regression's fan-out doc, unaffected by this
  feature).
- `grading_dismissals.institution` - part of the primary key for a
  dismissed/seen grading notification (`user_id, scope, institution, ref_id`).
- `microsoft_credentials.institution` - one Outlook OAuth token set per
  school (`user_id, institution` primary key).
- `institution_fields.acronym` - per-institution common fields (start date,
  Outlook URL, custom entries) shown above that institution's course cards.
- `accessibility_scans.institution` - part of the cache key for a course's
  accessibility scan results.
- `workflow_run_steps.institution` - a HISTORICAL record of which institution
  a past run step executed against (an audit trail, not a live pointer) -
  removing the registry entry does not and should not touch it, the same way
  deleting a course does not rewrite its past run logs.

Only `institution_pages` and `course_hub` are counted in the confirmation
(AC1's "at minimum") - they are the two an instructor directly authors and
would notice going missing. The others are lower-visibility, server-side-only
config that this feature does not need to touch or count to be honest about
the blast radius; they are listed here so a future change knows the full set.

Acceptance criteria:
1. **Real counts, not a generic "are you sure" (AC1).**
   `getInstitutionDeletionImpactAction` (`src/app/actions/institutions.ts`)
   counts `institution_pages` (`countInstitutionPages`, a head-only exact
   count in `src/lib/knowledge-base.ts`) and `course_hub` rows
   (`countCoursesByInstitution` in `src/lib/supabase/courses.ts`) for the
   acronym, both owner-scoped. `countCoursesByInstitution` filters in JS
   rather than via `.eq()` at the DB layer, because `course_hub.institution`
   is a freeSolo Autocomplete field (`AddCourseForm.tsx`) and is NOT
   uppercased on write the way `institution_pages.institution` is (see
   `courses.ts`'s plain `clean()` versus `knowledge-base.ts`'s
   `normalizeInstitution`) - an exact-match filter would silently undercount
   a tile saved in mixed case.
2. **Precise, not just present (AC2).** `describeInstitutionRemoval`
   (`src/lib/institution-removal.ts`) states the real counts ("MCC has 3
   knowledge base pages and 2 course tiles filed under it") and is explicit,
   every time regardless of counts, that removal "does NOT delete anything
   from the database" because the pages/tiles are "stored under the text
   ..., not by this list", and that re-adding the acronym "makes them visible
   again exactly as they were." Both the "still there" and the
   "not destructive" halves are stated, since an instructor misled either way
   (believing data was deleted, or believing a loss is unrecoverable) is
   still misled.
3. **No cascade-delete option was added (AC3 - a scope decision).** A
   "delete the pages/tiles too" action was considered and declined: there is
   currently no bulk delete-by-institution operation for either
   `institution_pages` or `course_hub` (only single-row deletes,
   `deleteInstitutionPageAction`/`deleteCourseHubAction`), re-registering the
   acronym already fully restores access to hidden records, and a real
   "permanently delete N records" action would need its own dedicated,
   separately-confirmed flow per AC3's own wording - not something to bolt
   onto a registry-list edit. Left as a follow-up if ever requested, not
   silently narrowed.
4. **One shared flow, not two (AC4).** `confirmAndRemoveInstitution`
   (`src/lib/institution-removal.ts`) is the single "remove" implementation -
   mirrors how `validateNewInstitutionAcronym` is the single "add" rule.
   Order: an optional `guardUnsavedEdits()` check (synchronous, before any
   network round trip), then `fetchImpact` (the real counts), then
   `describeInstitutionRemoval`'s message through `confirm()`, and only on
   acceptance does it call `write` (`writeInstitutions`) - the ONLY side
   effect the function is capable of performing; there is no
   delete-a-database-row parameter in its signature at all, which is what
   makes a registry removal structurally unable to cascade into a database
   delete (AC3). `TopBar.tsx`'s `InstitutionsSection` and
   `KnowledgeTab.tsx`'s own picker both call it with
   `getInstitutionDeletionImpactAction` as `fetchImpact`.
5. **TopBar's silent removal is upgraded, not left as a back door (AC5).**
   The Settings dropdown's remove button used to call `writeInstitutions`
   directly with zero confirmation; it now goes through
   `confirmAndRemoveInstitution` identically to the Knowledge tab's own
   button. No unguarded removal path remains.
6. **The aftermath is coherent (AC6).** Removing the Knowledge tab's own
   active institution, or the header's shared active institution, needs NO
   new fallback code: both `useKbInstitutionSelection`'s
   `resolveActiveKbInstitution(stored, institutions, headerActive)` and
   `useInstitutionSelection`'s `institutions.includes(stored) ? stored :
   institutions[0] ?? ""` are recomputed inline on every render from the
   reactive `institutions` list (`useInstitutions`, which listens for the
   `ta-institutions-changed` event `writeInstitutions` emits) - so the moment
   the acronym is gone, both selections fall back on their own, exactly as
   they already did for any other stored-but-unregistered value (regression
   133's own case, or a foreign-tab edit). What DID need new code: the
   Knowledge tab's `removeInstitution` passes
   `guardUnsavedEdits: () => code !== active || confirmDiscard()`, so removing
   the institution currently open here - which would otherwise silently
   discard an unsaved page edit as a side effect of the reactive fallback
   above - goes through the same `confirmDiscard()`/`KB_DISCARD_MESSAGE`
   prompt as switching institution or navigating away. TopBar has no view of
   that tab's dirty state, so `page.tsx` supplies
   `guardKbUnsavedEditsForInstitutionRemoval` (mirrors its popstate handler's
   own `kbDirtyRef` check) as a new `guardKbUnsavedEdits` prop, threaded
   through `SettingsMenu` into `InstitutionsSection`; every other route that
   renders `<TopBar />` (`/knowledge`, `/account/*`) never mounts
   `KnowledgeTab.tsx`, so the prop defaults to an always-allow no-op there.
7. **Tests** (`src/lib/institution-removal.test.ts`,
   `src/app/actions/institutions.test.ts`): `describeInstitutionRemoval`
   across zero/zero, pages-only, tiles-only, both-non-zero, and singular
   wording, plus that the "not destructive"/"re-adding restores" language is
   present regardless of counts; `nextInstitutionsAfterRemoval`'s
   case-insensitive filter; `confirmAndRemoveInstitution`'s full decision
   tree (not-found, guard-declines, fetch-error fails closed, confirm-declines,
   and the success path asserted to call exactly one read and one write and
   nothing else - the concrete proof behind AC3's "no DB delete" guarantee);
   `getInstitutionDeletionImpactAction`'s owner gate, casing normalization,
   count combination, and per-count error mapping. `resolveActiveKbInstitution`'s
   existing test ("falls back to the first registered institution when the
   stored value is no longer registered") already covers AC6's fallback
   scenario unchanged, so it was not duplicated. React rendering was not
   tested, per policy. **Sabotage-check:** a first draft of the
   "names only the page count when there are zero tiles" test asserted
   `not.toContain("course tile")` against the WHOLE confirmation message; it
   failed immediately because the generic second paragraph ("Pages and
   course tiles are stored under the text...") always names both nouns
   regardless of count - the assertion was narrowed to the blast-radius
   sentence alone (the actual scoped claim), and every other new test does
   fail when its corresponding production line is deleted or its condition
   inverted.

## 148. The weekly checklist view becomes a floating window, and chat gains drag-and-drop attachments

Two requests, delivered together because both touch `AiChatFab.tsx` and
`page.module.css`: the weekly checklist overview becomes small, draggable and
resizable; dropping a file onto the chat window attaches it through the same
pipeline the paperclip control already used.

**Part A reverses regression 140's AC2.** That entry argued this view should
be a modal, not a third floating window, specifically because "the FAB's two
windows are persistent workspaces kept open while working, which is why they
persist position and open-state" while this view was "a glance-and-close
snapshot." Asking for drag and resize is asking for exactly that
floating-window behavior, so the instructor has effectively overruled that
distinction - `WeeklyChecklistOverviewModal.tsx` now renders through the same
`styles.selectionChatWindow`/`selectionChatHeader`/`selectionChatClose` shell
`AiChatWindow.tsx`/`LiveClassWindow.tsx` already use, as a third window owned
by `AiChatFab.tsx`, not a `previewBackdrop`/`previewModal`.

Acceptance criteria:
1. **Small by default**: 560x480 (`WEEKLY_CHECKLIST_OVERVIEW_WINDOW_W/H` in
   the new `weekly-checklist-overview-window.ts`), not the old modal's
   980x860 - between the AI Chatbot window (360x420, fewer columns to show)
   and the wider Live Class window (640x620, four stacked panels instead of
   one read-only table). Fits the header, the search/hide-completed toolbar,
   and roughly 8-10 rows at once.
2. **Draggable and resizable via the existing shell/pattern, not a new
   implementation.** The mousedown/mousemove/mouseup drag algorithm
   `AiChatFab.tsx` used to keep as two independent copies (one per window) is
   now `useWindowHeaderDrag` (`src/hooks/useWindowHeaderDrag.ts`), shared by
   all three windows; resize comes from the shell's existing
   `.selectionChatWindow { resize: both }`, unused by either older window
   until now. The initial (persisted-or-default) size is applied to the DOM
   node imperatively, once, in a mount effect - deliberately NOT through
   React's `style` prop, which would otherwise re-apply the same fixed value
   on every unrelated re-render (a search keystroke, data finishing loading)
   and silently undo the user's own resize-handle drag the next time
   anything caused the component to re-render.
3. **Position and size persist** under this file's own
   `ta-weekly-checklist-overview-pos`/`-size` keys (matching its pre-existing
   `-sort`/`-search`/`-hide-done` keys, not `AiChatFab.tsx`'s separate `ta:`
   colon convention for the other two windows). Size is captured via a
   debounced `ResizeObserver` on the container. `weekly-checklist-overview-window.ts`'s
   `sanitizeWindowPos`/`sanitizeWindowSize` discard anything that is not a
   plain finite-number shape (missing fields, NaN/Infinity, a size below the
   resize floor) rather than trusting it partially, and `clampWindowPos`/
   `clampWindowSize` always run afterward - on a restored value AND on a
   freshly computed default alike - so a position from a larger screen, or a
   hand-edited value, can never render the window (and its header, the only
   way to drag it back) off-screen.
4. **Staleness, handled two ways.** `AiChatFab.tsx` now persists this
   window's open/closed state too (`checklist-overview-open`, via its
   existing `readLS`/`writeLS`), matching the other two windows - it is a
   genuine floating workspace now, not a glance-and-close snapshot. That
   reopens exactly the staleness risk regression 140 built the modal to
   avoid: a window that can stay mounted for a long time while the
   instructor works elsewhere (toggling checklist items from the Courses
   tab, for instance) shows what it fetched at mount, not necessarily what
   is true right now. Handled with both prongs the acceptance criteria
   offered, not one: the fetch effect still runs on every MOUNT (a fresh
   page load with the window left open, or a dial click that reopens it, are
   both "every open re-fetches" exactly as before), and a header Refresh
   button (reusing the same fetch path the old error state's "Try again"
   used) covers a long-lived mount whose data has since drifted. No
   backdrop-click-to-close (a floating window has no backdrop) - the
   header's "x" Close button is the sole affordance, matching the other two
   windows, which never had a backdrop either.
5. Everything from regression 140 is unchanged: real `<table>` semantics with
   `aria-sort`, the missing-values-sort-last comparator, the persisted sort,
   search/hide-completed, distinct empty states, and the table's own
   horizontal scroller (`WeeklyChecklistOverviewModal.module.css`'s
   `.scroller`/`.table`) inside the window's own vertical scroll region
   (`.windowBody`, `flex: 1` + `overflow: auto`, mirroring
   `.selectionChatMessages`) - verified with 300 synthetic rows that the
   sticky header and both scroll axes keep behaving in the much smaller
   default size.
6. **Still read-only** - unchanged from regression 140's AC5; no checkbox
   was added here, since the cell's own toggle path still owns the scoped
   Google Calendar write this view would otherwise race.

**Part B**: drag-and-drop chat attachments, extending commit 1aa862a's
paperclip/chip/budget feature.

7. **One pipeline, not two.** `AiChatWindow.tsx`'s file-reading logic was
   split into a single `addFiles(files: File[])` that both the paperclip's
   `handleFileChange` and the new drop handler call - the cap and byte-budget
   checks themselves moved out to `checkAttachmentCap`/
   `checkAttachmentByteBudget` in `src/lib/chat/attachments.ts` (alongside
   the relocated `MAX_ATTACHMENTS_PER_MESSAGE` and `formatMB`), so both entry
   points are structurally incapable of disagreeing on the cap, the budget,
   or the refusal wording (AC11) - there is only one copy of each to disagree
   with.
8. **Drop affordance without flicker.** `isDragActive` is driven by a
   `dragDepthRef` counter, not a flat boolean: `dragleave` fires just as
   often when the pointer crosses from the window onto a CHILD element
   (header, message list, input row) as when it actually leaves the window,
   and a flat reset flickered the overlay off and on while the pointer moved
   over children. Only the `dragleave` that brings the counter back to zero
   hides it. A window-level `dragend`/`drop` listener is a defensive second
   layer for a cancelled drag that never reaches this component's own
   `dragleave` at all (dropped outside the browser, or cancelled outside any
   valid target).
9. **Only file drags are intercepted.** Every handler checks
   `isFileDragTypes(e.dataTransfer?.types)` (checked against `.types`, not
   `.files`, which browsers leave empty until `drop`) before doing anything;
   a non-file drag (e.g. dragging selected text) is left alone entirely -
   `preventDefault` is never called for it, so the page's own default drop
   handling elsewhere, including inside this same window's textarea, is
   unaffected. `preventDefault` IS called on both `dragover` and `drop` for
   an actual file drag, or the browser would navigate away to the dropped
   file and lose the conversation.
10. **The embedded provider stays honest.** Its attach control was already
    disabled with a reason (`attachDisabledReason`); a file dropped on it now
    surfaces that exact same reason as an `attachError`, and the overlay
    itself shows it while the drag is still in progress, rather than
    silently discarding the drop.
11. Over-cap and over-budget drops produce the identical refusal strings the
    paperclip already used - guaranteed by construction (item 7), not
    re-verified wording.
12. **Tests, sabotage-checked**: `weekly-checklist-overview-window.test.ts`
    covers `sanitizeWindowPos`/`sanitizeWindowSize`'s rejection of
    malformed/NaN/Infinity/below-floor values, `clampWindowPos`/
    `clampWindowSize` against an off-screen position and an oversized
    persisted size, and `resolveInitialWindowRect`'s combination of all of
    the above; `attachments.test.ts` covers `checkAttachmentCap`/
    `checkAttachmentByteBudget`'s exact refusal wording and
    `isFileDragTypes`'s true/false/null/undefined cases. Sabotage-checked:
    turning `clampWindowPos` into a no-op failed exactly the 4 tests that
    depend on clamping (3 direct, 1 via `resolveInitialWindowRect`) and no
    others; dropping `sanitizeWindowSize`'s floor check failed exactly the 1
    "rejects a size below the resize floor" test; making `checkAttachmentCap`
    always succeed failed exactly its 2 refusal tests; making
    `isFileDragTypes` always return `true` failed exactly its 2
    false-case tests (the true-case test correctly stayed green, since it
    cannot distinguish a real check from a hardcoded `true`). All reverted
    after confirming.

## 149. Checklist items can be one-off instead of recurring

The instructor asked to "relabel weekly checklists to checklist" and "give me
the option of not having an item be recurring." This is wave 1 of 2: the data
layer, the overdue rule, and the calendar sync for a non-recurring deadline.
The user-facing relabel (column header, cell copy, "Weekly Checklist" ->
"Checklist" everywhere it is shown) is wave 2's, and is mostly string changes
layered on top of what this feature builds.

**AC1 - shape.** `WeeklyChecklistDeadline` (`src/lib/weekly-checklist.ts`)
gained one new OPTIONAL field, `date?: string | null` ("YYYY-MM-DD"), rather
than becoming a discriminated union. Two concrete reasons, not just
convenience: (1) backward compatibility falls out for free - every payload
written before this change simply never mentions `date`, and "absent" and
"explicit null" are treated identically (RECURRING) everywhere the field is
read, so there is never a second "is this recurring" encoding to keep in
sync; (2) this codebase has two concurrently-owned consumers of this exact
type this wave was told not to edit - `weekly-checklist-table-helpers.ts`
(no exception) and `WeeklyChecklistCell.tsx` (edit only if forced to
compile) - and both already read `.weekday`/`.time` unconditionally and
construct `{weekday, time}` literals with no `date` key at several call
sites (`setItemWeekday`/`setItemTime`/`addItem`). A discriminated union would
either drop `weekday` from one variant (breaking the table helpers) or force
every existing literal to learn a new required field (forcing an edit to the
cell). The chosen shape needed **zero changes** to either file - both still
compile, and both existing test files' inline deadline literals still
pass, unmodified. For a one-off deadline, `weekday` is still populated
(derived from `date`, never trusted from raw input - see below) purely so
`weekly-checklist-table-helpers.ts`'s existing "weekday" sort column keeps
producing a real value without needing to learn one-off deadlines exist.

**AC2 - coercion stays defensive, migration verified.** `coerceDeadline`
checks `date` FIRST: a valid "YYYY-MM-DD" makes the deadline one-off, with
`weekday` DERIVED from it (raw `weekday`, if any, is ignored outright so the
two can never disagree). When `date` is absent (every pre-existing payload)
or malformed, the deadline falls back to RECURRING and validates exactly as
before - a malformed `date` is dropped while a valid `weekday` survives,
mirroring how a malformed `time` is already dropped while `weekday` survives.
`normalizeChecklistDate` rejects a wrong type, wrong format, AND a
plausible-looking but nonexistent date (e.g. "2026-02-30") by reading the
constructed `Date` back and requiring an exact year/month/day match - plain
`new Date(2026,1,30)` silently rolls forward into March, which is exactly the
"malformed date becomes a DIFFERENT, wrong date" failure AC2 called out.
Explicitly tested: a raw payload with no `date` field at all (the exact shape
every item written before this change has) coerces to a recurring deadline,
byte-identical to before.

**AC3 - overdue, and the after-checked/after-date decision.** A new
`checklistDeadlineInstant(deadline, nowMs)` is the single entry point
`isWeeklyChecklistItemOverdue` now calls: it delegates to the pre-existing
`weeklyOccurrenceInstant` unchanged for a recurring deadline, and returns a
one-off deadline's own fixed date+time instant (ignoring `nowMs` - a one-off
date does not move depending on "where are we in the week"). Decision: an
unchecked one-off item stays overdue INDEFINITELY once its date passes -
there is no "next week" to silently roll it into the way a recurring item
gets - so it keeps demanding attention until the instructor actually acts on
it. Once CHECKED, a one-off item is never overdue again, exactly like a
recurring one (checked state is already unconditionally persistent) - this is
the deliberate answer to "what happens after checked and after the date has
passed": it neither nags forever (checked already means never-overdue) nor
vanishes (nothing in this module ever removes an item on its own; removal is
always the separate, explicit `removeWeeklyChecklistItem` action) - it simply
sits in the list, checked, like any other completed item, until the
instructor removes it or runs `resetAllWeeklyChecklistChecks`.

**AC4 - one event for one-off, key scheme, switch-kind cleanup.**
`buildOneOffChecklistEvents` (`src/lib/course-calendar-events.ts`) emits
exactly one `PlannedEvent` per one-off item, keyed `checklist-<id>-once`
(never a week index, since there is only ever one occurrence) - the recurring
path (`buildChecklistEvents`, unchanged) still keys `checklist-<id>-w<N>`.
`RECOGNIZED_KEY_PATTERN` gained the `checklist-.+-once` alternative. The new
`isChecklistEventKeyForItem(key, itemId)` is the one shared definition of
"does this key belong to this item" - matching by prefix (`checklist-<id>-`)
PLUS a suffix-shape check (`once` or `w\d+`) rather than embedding `itemId`
into a regex, so an id that is a literal string-prefix of another id (e.g.
"abc" vs "abc-def") can never falsely claim the longer id's key. Both
`findAllChecklistItemEvents` (the planned side) and
`syncChecklistItemCalendarAction`'s existing-event filter
(`src/app/actions/course-calendar.ts`) now use this one function, so an item
switched from recurring to one-off (or back) has its OLD kind's now-stale
keys still recognized as "belongs to this item" - they reach
`diffPlannedEvents` and are cleaned up (deleted) once the freshly-computed
`planned` output no longer contains them, converging to exactly the new
kind's single set of events. Tested at both the pure-diff level
(`course-calendar-events.test.ts`) and the action level
(`course-calendar.test.ts`, mocking a real recurring-to-one-off and
one-off-to-recurring switch and asserting the exact delete/create counts).

**AC5 - a one-off item never needs the tile's term dates; the blocker notice
narrowed.** `buildCourseEvents`' checklist section now splits deadlined items
by kind before the term-date gate: one-off items call
`buildOneOffChecklistEvents` unconditionally (no `startDate`/`endDate` check
at all), while recurring items keep the pre-existing bounded expansion and
its "no start date or end date set - weekly checklist events were skipped"
note, verbatim, when dates are missing. Verified with a course that has only
a one-off item and no start/end date: the event still syncs, and no
"skipped" note is added. **The blocker notice DOES need narrowing** -
`courseCalendarBlockers` (used by the cell's "missing-dates" badge) would
otherwise tell an instructor "checklist deadlines can't sync, set both dates"
even when every deadlined item is a self-contained one-off that syncs fine.
`courseCalendarBlockers` itself was left unchanged (it also answers for the
always-attempted TERM event, which genuinely is still blocked by missing
dates regardless of the checklist, so narrowing its own answer would make it
wrong about the term event). Instead, a new `checklistCalendarBlockers(course,
items, googleCalendarConnected)` only reports "missing-dates" when at least
one item is RECURRING (needs the bound); a course whose deadlined items are
all one-off reports no blocker. This is exported and tested but **not wired
into `WeeklyChecklistCell.tsx`** - that file is a later wave's, and the
signature change was not required to keep it compiling, so per this wave's
brief it was left as a ready-to-adopt function rather than an unrequested
edit to owned UI.

**AC6 - the checked-week prefix for a one-off item.** `CHECKLIST_DONE_PREFIX`
marks "the week it was checked in" for a recurring item (many occurrences,
only one of which should show the checkmark). A one-off item has exactly
ONE occurrence for its entire lifetime, so there is no "which week" question
to answer: `buildOneOffChecklistEvents` applies the prefix whenever the item
is simply `checked`, full stop - `checkedAt`'s own timestamp is irrelevant to
the prefix here (it still stamps/clears normally via
`toggleWeeklyChecklistItem`; it is just never consulted for this decision).

**AC7 - naming.** No existing exported symbol, file name, or the
`weekly_checklist` jsonb column was renamed - renaming a database column for
a label change costs a migration and buys nothing, and wave 2 owns the
user-facing relabel. Every NEW identifier reads as "checklist", never "weekly
checklist": `isOneOffChecklistDeadline`, `buildOneOffChecklistDeadline`,
`checklistDeadlineInstant`, `parseChecklistDeadlineDate`,
`isChecklistEventKeyForItem`, `checklistCalendarBlockers`. A one-off deadline
is by definition not weekly, so baking "weekly" into a name for it would be
actively misleading, not just inconsistent - this reasoning is recorded in a
comment at the top of `weekly-checklist.ts` so the "weekly" names elsewhere in
the same file read as intentional, not missed.

**AC8 - tests.** New coverage spans `weekly-checklist.test.ts`
(one-off/recurring coercion including the pre-change migration payload, the
Feb-30 non-rollover, weekday-derivation-ignores-raw, `isOneOffChecklistDeadline`,
`buildOneOffChecklistDeadline`, `describeWeeklyChecklistDeadline` for a
one-off date, and overdue for both kinds including the after-the-date and
after-checked cases), `course-calendar-events.test.ts` (one event vs. N
events, the all-day/timed variants, AC5's no-term-dates sync and no-note
cases, AC6's prefix rule, `isChecklistEventKeyForItem`'s string-prefix-collision
guard, the switch-kind cleanup diff in both directions, and
`checklistCalendarBlockers`), and `course-calendar.test.ts`
(`syncChecklistItemCalendarAction` creating exactly one event for a one-off
item, syncing with no term dates, and the switch-kind cleanup in both
directions against mocked Google Calendar calls). **Sabotage-checked**:
trusting a raw (rather than derived) `weekday` on a one-off deadline failed
exactly the one "ignoring any raw weekday supplied" test; removing the
date-rollover rejection failed exactly the three tests guarding it (the
malformed-date loop, the explicit Feb-30 test, and
`buildOneOffChecklistDeadline`'s invalid-date test); letting a checked
one-off item become overdue again failed exactly the one AC3 persistence
test; re-gating one-off events behind the term-date check failed exactly the
four tests guarding AC5 (two in `course-calendar-events.test.ts`, one in
`findAllChecklistItemEvents`, one in `course-calendar.test.ts`); removing the
one-off `CHECKLIST_DONE_PREFIX` failed exactly the one AC6 test; and
weakening `isChecklistEventKeyForItem` to a plain prefix check (no
suffix-shape guard) failed exactly the one string-prefix-collision test. All
six reverted after confirming, and no other test in the suite was affected by
any of them.

## 150. Knowledge-base pages can hold file attachments: data layer (wave 1 of 2)

"Give me the chance to attach/embed all sorts of files in the knowledge
pages." This is the data layer only - `institution_page_attachments`, its
storage bucket, and the owner-scoped functions/actions that read and write
it. No UI reads any of this yet; a later wave wires the Knowledge tab (the
same wave 1/wave 2 split as regression 113/118 for `institution_pages`
itself).

Acceptance criteria:
1. **`institution_page_attachments` is a CHILD TABLE, not a jsonb column on
   `institution_pages`** (`supabase/migrations/20260915000000_institution_page_attachments.sql`).
   id/page_id (`references institution_pages on delete cascade`)/user_id
   (`references auth.users on delete cascade`)/file_name/mime_type/size_bytes/
   storage_path/created_at, owner-scoped RLS matching `institution_pages`'
   four standard policies. The migration's header comment argues the
   child-table choice explicitly, in the same style as
   `20260909000000_workflow_run_logs.sql`'s `workflow_run_steps` argument:
   (a) concurrent uploads to the same page would race on a jsonb
   read-modify-write and silently lose one file (a lost update, not an
   error) - a child table makes each upload its own independent INSERT;
   (b) `institution_pages.body` already autosaves large markdown text, and a
   jsonb attachments column would couple that unrelated, differently-timed
   write to every file upload; (c) the AC3 cascade-delete cleanup needs one
   indexed `page_id IN (...)` query across a whole subtree, not fetching
   every page row in the subtree to parse an embedded array back out.
2. **Any file type is accepted (AC2) - no allowlist.** Two caps instead:
   `MAX_ATTACHMENT_SIZE_BYTES = 6 * 1024 * 1024` (6 MB) and
   `MAX_ATTACHMENTS_PER_PAGE = 30`
   (`src/lib/institution-page-attachments.ts`). The size cap deliberately
   reuses `MAX_FILE_SIZE` from `src/lib/syllabus-upload-validation.ts`
   verbatim rather than picking a fresh number: uploads travel to the server
   action as a base64 string (matching `uploadSyllabusAction`'s `{ name,
   base64, mimeType }` shape), which inflates the wire size by ~4/3, so 6 MB
   decoded -> ~8 MB encoded stays under `next.config.ts`'s
   `experimental.serverActions.bodySizeLimit` of 10mb with headroom for the
   rest of the JSON payload - the same reasoning already vetted at that call
   site. The count cap reflects what a knowledge-base page IS (one
   policy/topic): a page needing more exhibits should be split via the
   existing page tree (`parent_id` nesting) instead of becoming a flat file
   dump, and it bounds the size of the single batched `storage.remove()`
   call AC3's cascade cleanup issues. The bucket's own `file_size_limit` is
   set to the same 6 MB (6291456 bytes) at the Storage layer in the
   migration, as a second, independent gate. A file over either cap is
   refused with a message naming the exact limit
   (`attachmentSizeCapMessage`/`attachmentCountCapMessage`, both
   exported pure functions) - never silently truncated or dropped;
   `createInstitutionPageAttachment` checks both BEFORE any Storage or row
   write.
3. **Deleting a page removes its attachments' STORAGE OBJECTS, not just
   their rows (AC3).** `institution_pages.parent_id -> on delete cascade`
   (plus this migration's own `page_id -> on delete cascade`) removes every
   row in the subtree automatically, but a foreign-key cascade never touches
   Storage - left alone, every attachment on the deleted page and its whole
   descendant tree would become an orphaned, invisible-forever blob.
   `deleteInstitutionPageAndAttachments` (`src/lib/institution-page-attachments.ts`)
   handles this explicitly: `collectSubtreePageIds`
   (`src/lib/knowledge-base.ts`, a new pure helper alongside
   `wouldCreateCycle`) walks the RAW `parent_id` relationship - not
   `computeEffectiveParents`' display-oriented reinterpretation - to get
   every page id the cascade is about to remove (mirroring exactly what the
   database will do, since that's the question being answered);
   `listInstitutionPageAttachmentsForPages` fetches every attachment across
   that whole id set in one `.in()` query; `removeAttachmentStorageObjects`
   batch-removes them; then `deleteInstitutionPage` runs. Partial-failure
   handling: `removeAttachmentStorageObjects` NEVER throws - if the batch
   remove call itself errors, that error is captured onto the returned
   `storageCleanupError` and the page delete PROCEEDS anyway (a Storage
   hiccup must not leave a user unable to delete a page for a reason that
   has nothing to do with the page), but it is not silent either:
   `deleteInstitutionPageAction` (`src/app/actions/knowledge-base.ts`) now
   returns `{ ok: true; storageCleanupError?: string }` instead of bare `{ ok:
   true }`, so a partial cleanup failure is visible to whichever wave
   surfaces it, rather than swallowed.
4. **The same care on removing a single attachment (AC4).**
   `deleteInstitutionPageAttachment` mirrors `deleteRecordingFile`'s shape
   exactly: storage object removed first (best-effort - a missing object is
   not an error), then the row, both scoped by `user_id`.
5. **Serving a file back (AC5): a signed URL, never a public one.**
   `getInstitutionPageAttachmentUrl` calls
   `storage.createSignedUrl` against the private `institution-attachments`
   bucket (`public: false` in the migration) - these are institutional
   policy documents, so this defaults to the more private option, matching
   `getRecordingFileUrl`'s own precedent. Documented caveat for whichever
   wave embeds this in the UI: a signed URL baked directly into a page's
   saved markdown body expires and the embed breaks permanently and
   silently once it does; markdown should instead store a stable reference
   (the attachment id) and resolve it to a fresh signed URL each time the
   page is rendered, rather than caching a URL that has a shelf life inside
   content that does not.
6. **Owner scoping everywhere (AC6).** Every action in the new
   `src/app/actions/institution-page-attachments.ts`
   (`listInstitutionPageAttachmentsAction`,
   `uploadInstitutionPageAttachmentAction`,
   `deleteInstitutionPageAttachmentAction`,
   `getInstitutionPageAttachmentUrlAction`) is `requireOwner()`-gated and
   returns `{error}` rather than throwing; a missing or foreign page id
   (checked via the already owner-scoped `getInstitutionPage`) or attachment
   id (via the new `getInstitutionPageAttachment`, same null-for-foreign-id
   shape as `getRecordingFileById`) returns an error before any Storage or
   row access happens. `deleteInstitutionPageAction`'s existing owner check
   is unchanged; it now also threads the already-fetched page into
   `deleteInstitutionPageAndAttachments` rather than re-fetching it.
7. **Pure helpers, exported** (`src/lib/institution-page-attachments.ts`):
   `exceedsAttachmentSizeCap`/`attachmentSizeCapMessage`/`attachmentCountCapMessage`
   (AC2's caps and refusal wording), `buildAttachmentStoragePath` /
   `attachmentFileExtension` (`${userId}/${pageId}/${attachmentId}.${ext}`,
   leading with `userId` to match the migration's
   `storage.objects` RLS `foldername(name)[1]` policies), `formatByteSize`,
   `mapInstitutionPageAttachment` (the row -> domain mapper, following
   `mapInstitutionPage`/`mapRecordingFile`), and `classifyAttachmentKind`
   (`image` vs `file` off the mime type prefix) - added per AC7's own
   suggestion, for a later UI wave to render images inline and link
   everything else, not used by anything yet.
8. **Tests** (`src/lib/institution-page-attachments.test.ts`,
   `src/lib/knowledge-base.test.ts`'s new `collectSubtreePageIds` block,
   `src/app/actions/institution-page-attachments.test.ts`, and updated
   `src/app/actions/knowledge-base.test.ts` delete-action tests): every pure
   helper (caps at and one-over the boundary, path construction with/without
   an extension, the mapper), owner-scoped CRUD against a hand-rolled fake
   Supabase client (following `recording-files.test.ts`'s pattern, extended
   with a per-table response queue and a fake `storage.from(bucket)` so one
   test can configure two different responses against the same table - e.g.
   `createInstitutionPageAttachment`'s count-query then insert),
   subtree-collection for the cascade case (root id included, descendants at
   any depth, unrelated pages excluded, a defensive cycle that still
   terminates), and the AC3 partial-failure path (batch remove errors ->
   `storageCleanupError` set, but the page-row delete still happens).
   **Sabotage-checked, one change at a time, each reverted after
   confirming**: loosening the size-cap comparison from `>` to `>=` failed
   exactly the one boundary test; disabling the count-cap check failed
   exactly the one count-cap test; dropping the root id from
   `collectSubtreePageIds`'s result failed exactly six tests across both
   `knowledge-base.test.ts` and `institution-page-attachments.test.ts` (every
   assertion that depends on the deleted page's own id being in the
   collected set); reordering `deleteInstitutionPageAttachment` to delete the
   row before removing the storage object failed exactly the one
   ordering test; making `removeAttachmentStorageObjects` throw instead of
   returning `{error}` failed exactly the two AC3 partial-failure tests;
   removing the page-ownership check from `uploadInstitutionPageAttachmentAction`
   failed exactly the one AC6 "Page not found" test; and swallowing
   `deleteInstitutionPageAction`'s `storageCleanupError` instead of returning
   it failed exactly the one test asserting it is surfaced. No other test in
   the suite was affected by any of the seven.

## 151. Checklist UI: recurring/one-off on the cell, and the user-facing relabel (wave 2 of 2)

Wave 1 (regression 149) built the data layer for a non-recurring checklist
deadline and deliberately left the UI and the "Weekly Checklist" ->
"Checklist" relabel to this wave. This entry covers that UI and relabel.

**AC1 - the recurring/one-off choice, on every item and the add row.**
`WeeklyChecklistCell.tsx` gained a "Schedule" select next to the existing
Day/Time controls. For an EXISTING item it is 3-way - "No deadline" /
"Recurring" / "One-off" - driven by the new `checklistDeadlineKind(deadline)`
(`src/lib/weekly-checklist.ts`), which classifies a deadline into exactly
those three states for the UI (a presentation-only concept - deliberately
NOT how `WeeklyChecklistDeadline` itself is modeled; wave 1's own doc comment
already explains why a discriminated union was rejected for the STORAGE
shape). Switching it calls the new `resolveDeadlineForKindChange(current,
kind, nowMs)`, also in `weekly-checklist.ts`: every mutation in this cell
commits immediately (no separate "draft" state anywhere in it), so switching
the Schedule select cannot leave an item in a half-set limbo waiting for a
second field - it always produces an immediately-valid (if provisional)
deadline of the requested kind: "none" -> null; "none"/"one-off" ->
"recurring" defaults to Sunday with no time (one-off's own case reuses its
DERIVED weekday and time, dropping only `date` - no data invented); "none"/
"recurring" -> "one-off" defaults the date to TODAY (`nowMs`-derived, so this
stays pure/testable) while carrying over any existing time. Switching to the
kind a deadline is ALREADY in is a no-op, returning the exact same object
reference. The Day select no longer has its own "No deadline" entry - that
control belongs to the Schedule select outright now, so the Day select only
ever lists the seven real weekdays, and a new `setItemDate` handler is the
one-off counterpart to the existing `setItemWeekday`. `setItemTime` was also
fixed to build its next deadline via `{...current, time}` instead of a
hand-built `{weekday, time}` literal - the old hand-built version silently
dropped a one-off item's `date` the moment its time was edited, quietly
turning it back into a recurring item.

The ADD ROW's Schedule select is deliberately only 2-way (Recurring/
One-off, no "No deadline" option): nothing commits until "Add" is clicked,
so simply leaving the Day/Date sub-field unset already means "no deadline,"
exactly as leaving the old Day select on its blank entry always did - there
is no immediate-commit limbo here to resolve the way an existing item's edit
needs `resolveDeadlineForKindChange` to resolve it. Native `type="date"`
throughout (AC2) - `@mui/x-date-pickers` is still not installed, matching
`AssignmentDueCell.tsx` and the rest of the app.

**Click count for creating a one-off item (AC1), add row, no specific
time:** open the Schedule dropdown (1), choose "One-off" (2), click into the
now-visible Date field and type the date (3), click Add (4) - 4 clicks, one
more than the pre-existing recurring flow's 3 (open Day dropdown, choose a
weekday, click Add), entirely due to the Schedule dropdown's own open+choose
- the Date field costs exactly what the Day select already cost. Setting a
specific time adds one more click to either flow (5 for one-off, 4 for
recurring), unchanged from before this wave. Typing the label and pressing
Enter (instead of clicking Add) costs the same number of clicks either way,
since Enter only commits from the label field (unchanged from wave 1's
original behavior) and returning focus there is itself one click.

**AC3 - `checklistCalendarBlockers` wired into the cell.**
`WeeklyChecklistCell.tsx`'s own `calendarBlockers` now calls
`checklistCalendarBlockers(course, items, googleCalendarConnected)` instead
of the general `courseCalendarBlockers(course, googleCalendarConnected)`
wave 1 left it on. Verified via `checklistCalendarBlockers`'s own (wave-1)
test suite in `course-calendar-events.test.ts`, unchanged by this wave: a
course whose deadlined checklist items are ALL one-off no longer reports
"missing-dates" for the cell's own badge. `courseCalendarBlockers` itself
was left wired up exactly where it already was - `CourseRow.tsx`'s
name-cell badge, which speaks for the always-attempted TERM event and
genuinely still needs both dates regardless of the checklist - confirmed by
reading that call site rather than guessing, since narrowing the wrong
badge would have silently broken a real, still-valid warning.

**AC4 - the relabel, exact list.** Every user-facing "Weekly Checklist"
occurrence found by grep, changed to "Checklist" (or removed the word
"weekly" where it appeared mid-sentence):
- Courses table column header (`CoursesTable.tsx`'s `COLUMN_LABELS.weeklyChecklist`): "Weekly Checklist" -> "Checklist".
- Courses table's "Sync all calendars" button tooltip: "...due dates, and weekly checklist deadlines to Google Calendar" -> "...and checklist deadlines...".
- The cell's own label (`WeeklyChecklistCell.tsx`): "Weekly Checklist" -> "Checklist".
- The FAB's dial action title (`AiChatFab.tsx`): "Weekly Checklist Overview" -> "Checklist Overview".
- The overview window's `aria-label` and visible header title (`WeeklyChecklistOverviewModal.tsx`): "Weekly Checklist Overview" -> "Checklist Overview".
- The overview window's idle subtitle: "Every weekly checklist item, across every course" -> "Every checklist item, across every course".
- The overview window's loading text: "Loading weekly checklist items…" -> "Loading checklist items…".
- The overview window's empty state (both lines): "No weekly checklist items yet." -> "No checklist items yet."; "Add items from a course's Weekly Checklist column..." -> "...Checklist column...".
- The overview table's merged column header: "Weekday"/"Time" -> "When" (see AC6).

The cell's own empty state ("No items yet.") never said "weekly" and needed
no change. **Deliberately NOT changed**:
`course-calendar-events.ts`'s sync-report note "no start date or end date
set - weekly checklist events were skipped" (and its three pinned assertions
in `course-calendar-events.test.ts`). Wave 1's own regression entry (149)
already committed to keeping this note verbatim, and re-reading it here:
"weekly" in that note is a technical/cadence description ("checklist events
that recur weekly," now literally accurate since this note only ever fires
for the RECURRING subset post-wave-1's kind split) rather than a reference to
the retired "Weekly Checklist" product name - the exact same sense
`buildCourseEvents`' sibling note "no assignment due rule set - weekly
due-date events skipped" already uses for a completely unrelated feature,
and that note is obviously out of scope. Relabeling the checklist one alone
would be inconsistent with its own sibling for no user-facing gain (the
notes array is a sync diagnostic, not a headline UI surface), and would
touch three exact-string test assertions to save nothing.

**AC5 - the internal/external naming mismatch, recorded where it appears.**
No file name, exported symbol, the `weekly_checklist` DB column, or any
`ta-*` localStorage key was renamed - only the four kinds of user-facing
copy AC4 lists changed. A short comment was added at each divergence point
(`WeeklyChecklistCell.tsx`'s top-of-file comment and its label's render
site; `CoursesTable.tsx`'s `COLUMN_LABELS` entry; `AiChatFab.tsx`'s
`SpeedDialAction`; `WeeklyChecklistOverviewModal.tsx`'s top-of-file comment
and its header render site) pointing back to `weekly-checklist.ts`'s own
AC7 naming note, so the mismatch reads as intentional at every place a
future reader might otherwise flag it as a missed rename.

**AC6 - the overview table's "When" column.** Chose a single merged "When"
column over the alternatives (an extra Date column, or keeping Weekday and
adding Date) because a raw weekday NUMBER and a one-off item's calendar DATE
are not comparable values - two separate columns could never honestly rank
a recurring item against a one-off one, and an instructor scanning this
table wants exactly one answer, "how soon does this come due," regardless of
kind. Implementation: `WeeklyChecklistOverviewRow` (`weekly-checklist-table-helpers.ts`)
gained `whenInstant: number | null`, computed once at row-build time via
`checklistDeadlineInstant(item.deadline, nowMs)` - the SAME single-entry-point
function `overdue` already uses, so "when does this deadline actually fall"
is answered identically for both purposes. null is the ONLY empty case
(unlike the retired "time" column, which was also empty for a deadline with
no specific time - `checklistDeadlineInstant` always resolves a real instant
once ANY deadline exists, defaulting to end-of-day). The sort-field union
dropped `"weekday"`/`"time"` in favor of a single `"when"`, sorted by
`whenInstant` with the existing empty-sorts-last contract unchanged. The
table cell itself now renders `describeWeeklyChecklistDeadline(row.deadline)`
- already exported by wave 1, built for exactly this - instead of two
separate cells, so a one-off item shows its actual date ("Aug 15, 2026 at
5:00 PM") rather than its technically-correct-but-useless derived weekday.
`weekly-checklist-table-helpers.ts`'s own duplicate `formatWeeklyChecklistTime`
(a hand-copy of a private formatter in `weekly-checklist.ts`, kept only
because wave 1 could read but not edit that concurrently-owned file) was
removed as dead code now that its one caller uses
`describeWeeklyChecklistDeadline` instead.

**Retired-field sort migration, tested.** A sort persisted before this
change (`{field:"weekday",...}` or `{field:"time",...}`) needed no new
migration code path: `parseWeeklyChecklistSortState`'s existing
`WEEKLY_CHECKLIST_SORT_FIELDS.includes(field)` check already rejects any
field not in the current union, falling back to
`DEFAULT_WEEKLY_CHECKLIST_SORT` exactly like corrupt JSON would. Pinned with
two explicit tests (one per retired field) rather than trusted to "obviously
still work," since silently losing that fallback in a future edit would be
easy to miss otherwise.

**AC8 - persisted control state, one addition, one deliberate non-addition.**
The add row's new "Schedule" preference (recurring vs one-off) persists
under `ta-weekly-checklist-new-item-kind`, defensively read (anything but
the literal string `"one-off"` falls back to `"recurring"`, matching the
pre-existing default so an instructor who never touches the control sees no
behavior change) - one shared key across every course's cell rather than
per-course, matching how the Overview window's own hide-completed/search
prefs are single global preferences rather than per-entity. The add row's
new Date value is deliberately NOT persisted: a date picked in one session
is almost always the wrong date by the next session, so restoring it would
actively mislead rather than help - the same reasoning the pre-existing
(unpersisted) Time field already relied on implicitly.

**AC9 - tests, and sabotage-check results.** New coverage:
`checklistDeadlineKind` (all three states) and `resolveDeadlineForKindChange`
(every kind transition, including both no-op cases and the "today tracks
nowMs, not a fixed value" case) in `weekly-checklist.test.ts`; `whenInstant`
computation (recurring, one-off, no-deadline, and the "end of day is a real
instant" case) and the merged "when" sort column (ascending/descending,
cross-kind ranking of a recurring item's this-week occurrence against a
one-off item's own date, epoch-0-is-not-empty, no-deadline-sorts-last) plus
the retired-field migration in `weekly-checklist-table-helpers.test.ts`. AC3
(blocker narrowing) and AC6's `describeWeeklyChecklistDeadline` needed no new
lib-level tests - both were already fully covered by wave 1's own test
suites (`course-calendar-events.test.ts`, `weekly-checklist.test.ts`); this
wave's AC3 work is UI wiring only, and AC9 explicitly excludes testing React
rendering (there is no React Testing Library in this repo).
**Sabotage-checked, one change at a time, each reverted after confirming**:
making `resolveDeadlineForKindChange`'s "none" branch return `current`
instead of `null` failed exactly the one "always returns null" test;
hard-coding one-off -> recurring's weekday to 0 instead of reusing the
derived weekday failed exactly the two tests guarding that reuse (with and
without a time); flattening `checklistDeadlineKind` to always return
"recurring" for a non-null deadline failed exactly the one "is 'one-off' for
a deadline with a date" test; marking the "when" column's null-whenInstant
case as NOT empty failed exactly one of the three sort-order tests guarding
it (the other two happened to still pass by coincidence - a tie-broken-by-
course-name ordering that matched regardless - which is itself why more than
one test exists for that behavior); re-admitting `"weekday"` into
`WEEKLY_CHECKLIST_SORT_FIELDS` failed exactly the one retired-field
migration test written for it; and hard-coding `whenInstant` to always
`null` failed exactly the three tests guarding its computation. All six
reverted after confirming, and no other test in the suite was affected by
any of them.

## 152. Course-long-project chaining reaches a run whose workflow never bound `define-course-project`

The instructor reported that a no-code course's weekly assignments were still
one-off exercises, not increments of one course-long project, despite
regression 146 having shipped exactly that chaining. **Diagnosis, confirmed
against the code before any change:** their run log ("Course Kickoff (no
codebase) (copy)") showed an 11-step workflow -
`load-course-tile, generate-schedule, lecture-materials-from-schedule,
save-csv-to-course, generate-class-openers, generate-assignment-from-template,
generate-test-from-template, save-zip-to-course, lms-wipe, lms-rubric,
lms-modules` - with **no `define-course-project` step anywhere in it**. The
current `NO_CODE_KICKOFF` preset (`src/lib/workflows/presets/course-setup.ts`)
has that step at index 3, reached indirectly by everything after it via an
`include-workflow`. A user-SAVED COPY of a preset workflow is flattened at
save time and does not inherit later preset edits - this copy was saved from
an older snapshot that either predated the step or never bound it. With no
step ever calling `setCourseProjectAction`, `tile.courseProject` stayed at
`emptyCourseProject()` (`mode: "none"`) for the life of the course, so
`hasProject()` was false on every run and `milestoneBriefFor` correctly
returned `null` everywhere it was already wired - the chaining code was
never reachable, not broken.

**AC1 - the fix lives in the generators, not in a new step.** Rather than
building a "does this workflow look kickoff-shaped" heuristic, three direct
consumers of `tile.courseProject` now ensure one exists themselves, the
moment they need it, instead of depending on a separate step having already
run:
- `generate-assignment-from-template` (`src/lib/workflows/registry/steps.assignments-template.ts`) - the graded, template-driven assignment (step 5 in the reported run).
- `generate-test-from-template` (`src/lib/workflows/registry/steps.assignments-test-template.ts`) - the graded test (step 6).
- `lecture-materials-from-schedule` (`src/lib/workflows/registry/steps.content-lectures.ts`) - the schedule-driven pipeline into `buildScheduleWeekPlan` (step 2; `src/app/actions/course-planning-grounding.ts`), the pipeline regression 146 explicitly targeted as "the per-week spine" and the only place `PROJECT_CHOICE_CONTRACT` is composed.

  All three now call the new `ensureCourseProject(tile, provider, courseKind,
  schedule?)` (`src/lib/workflows/registry/steps.course-project.ts`, exported
  alongside `weeklyTopicsFromSchedule`) before reading `tile.courseProject`,
  and use ITS returned project for the milestone lookup instead of the raw
  tile field. `ensureCourseProject` reuses the existing pieces verbatim -
  `hasProject`/`coerceCourseProject`/`renderProjectBrief`
  (`src/lib/course-project.ts`), `generateCourseProjectAction`/
  `setCourseProjectAction` (`src/app/actions/course-project.ts`) - rather than
  building a second project generator or a second milestone model.

  `lecture-zip`'s repoless fallback (`runLectureZipRepoless`, same file) was
  deliberately left unwired: it has no `courseKind` input of its own and is
  always "coding" (regression 146 point 6), and AC2's applied-only gate (next
  paragraph) would make `ensureCourseProject` a guaranteed no-op there - wiring
  it would add a call site for zero observable behavior change.

**AC2 - on-demand generation is PERSISTED, and gated to applied courses only,
with a concrete reason for each.** `setCourseProjectAction` writes the
project to the course tile immediately, the same way `define-course-project`
itself does - an in-memory-only project would mean two weeks of the SAME run
(or two separate runs, weeks apart) inventing two different projects with two
different milestone sets, which regression 106 already established must never
happen. `ensureCourseProject` checks `hasProject(existing)` FIRST and returns
the existing project completely unchanged whenever one is already there -
however it got there (this function, the step, or a manual edit) - so
persisting is also what makes the fix idempotent (AC2 continued below).

Auto-generation only fires for `courseKind === "applied"`. Every existing
course whose kind is "coding" continues to behave exactly as it did before
this feature exists: `COURSE_KICKOFF` (the coding kickoff) never turns
`autoDefine` on, so a coding course only ever gets a project when an
instructor explicitly types one into `define-course-project` - `autoDefine`
being opt-in for coding courses is a deliberate product decision, not an
oversight. Without this gate, `ensureCourseProject` would auto-generate a
project for ANY course lacking one the first time any of the three wired
steps ran - which describes most existing coding courses - silently turning
them project-based and threading invented milestones into every assignment
prompt for a course that never asked for any of it. `"applied"` is the exact
same signal `NO_CODE_KICKOFF` already bakes into these same three steps'
`courseKind` bindings (including into the broken copy itself, at save time),
so the gate fires precisely for the workflows this feature targets and never
for a plain coding course. A coding course with an EXPLICITLY defined project
is unaffected either way - the `hasProject()` check above returns it before
this gate is ever reached.

**AC3 - verified against the instructor's exact reported shape.** Every new
test that exercises the fix uses `courseKind: "applied"` with a tile whose
`courseProject` is `emptyCourseProject()` - the exact state the broken
11-step copy is in on every run - at the SAME three step types the copy
actually contains (`registry.generate-assignment-from-template.test.ts`,
`registry.generate-test-from-template.test.ts`,
`registry.lecture-materials-from-schedule.test.ts`, new
"course-long project chaining" describe blocks in each). The workflow-engine
layer itself (binding resolution across all 11 steps) was not re-tested -
every existing test in this repo already tests one step's `run()` in
isolation, and reproducing the engine here would not exercise anything this
feature changed.

**AC4 - convergence with `define-course-project`, verified directly.**
`define-course-project`'s own run function (`steps.course-project.ts`) was
UNCHANGED by this feature - it already had two independent branches that
leave an existing project alone for a blank definition
(`!definition && hasProject(existing)`, and
`hasProject(existing) && !regenerate && !(autoDefine && definition)`), and
neither had ever been directly tested. New file
`registry.define-course-project.test.ts` (the step's first direct test) below
proves a tile carrying a project `ensureCourseProject` created moments
earlier in the SAME run is left alone - no second `generateCourseProjectAction`/
`setCourseProjectAction` call - convergence is real, not merely inferred. A
non-blank, explicitly typed instructor definition still takes precedence and
regenerates, exactly as before (that branch is unchanged and was already
covered by reading the code, not touched by this fix).

  **Ordering caveat, documented rather than fixed (AC7 adjacent):**
  `lecture-materials-from-schedule` runs BEFORE `define-course-project` in
  `NO_CODE_KICKOFF`'s own step order (deliberate - the schedule generates
  first, per regression 141). If a workflow has BOTH this step's on-demand
  fallback AND an explicit `define-course-project` step AND the instructor
  types a project description on that same run, `lecture-materials-from-
  schedule`'s own already-generated output can reference the auto-derived
  project that the later, explicit definition then supersedes for the rest of
  the run (the "typed definition always wins" rule is itself unchanged and
  correct). This is a narrow, accepted tradeoff, documented in
  `ensureCourseProject`'s own doc comment: it only arises when a workflow
  BOTH runs this pipeline before its own project step AND the instructor
  types a description on that run. The common cases - no description typed
  (this function's "propose one" mode matches what `autoDefine` already
  does), or no project step at all (this feature's actual target) - converge
  cleanly on one project.

**AC5 - the milestone genuinely reaches the composed LLM prompt, verified
with `callLlm` mocked, not just that the code compiles.** New file
`src/app/actions/schedule-week-plan.ensure-project.test.ts` mocks only the
true I/O boundaries (auth, `callLlm`, and the two `@/app/actions` project
functions `ensureCourseProject` itself calls) and runs `buildScheduleWeekPlan`
and `generateAssignmentInstructionsForAssignment` (`./shared`) for REAL:
starting from a tile with `emptyCourseProject()`, `ensureCourseProject`
generates and persists a project, and the SAME returned project fed into
`buildScheduleWeekPlan` produces a real, captured prompt containing the
literal milestone sentence (`milestone 1 of the course project "..."`), the
milestone title, `PROJECT_CHOICE_CONTRACT`'s "STUDENT CHOICE WITHIN THE
PROJECT" text, and - for week 2 of the same project - the prior-milestone
"Earlier milestones are already done" / "BUILD ON what the student already
produced" language. The two template-driven steps (assignment/test) were
verified one layer up (the `context` argument handed to the mocked
`generateAssignmentAction`/`generateTestQuestionsAction`, containing the same
`renderMilestoneContract` text) since regression 146 already established, and
`course-project.test.ts`/`assignment-brief.ts`/`test-brief.ts` already prove,
that argument reaching those generators composes into their real prompts -
re-deriving that link here would not exercise anything new.

**AC6 - nothing else regressed.** `PROJECT_CHOICE_CONTRACT`, the applied-tool
commitment, `enforceNoCodeForApplied`, the Bloom objectives contract, week-1's
"nothing to build on" wording, and the pivot wording are all composed by
UNCHANGED code (`renderMilestoneContract`, `courseKindContract`,
`selectRequiredTools`) - this feature only changes how `courseProject` is
SOURCED before it reaches them. Every pre-existing test in
`registry.generate-assignment-from-template.test.ts`,
`registry.generate-test-from-template.test.ts`,
`registry.lecture-materials-from-schedule.test.ts`,
`registry.lecture-zip.test.ts`, and `schedule-week-plan.test.ts` passed
UNMODIFIED (confirmed by running them before writing a single new test) -
every existing fixture's `tile.weeks` is `null` and/or `courseKind` defaults
to "coding", so `ensureCourseProject` returns the tile's existing project
unchanged (its very first gate) in every one of them, a no-op byte-for-byte.

**AC7 - the systemic hazard, recorded, and the cheap signal chosen.** A saved
copy silently drifting from its preset (the actual root cause here) is not
fixed by this change and will happen again the next time a preset step is
added or reordered - copy-resyncing is out of scope, as directed. The cheap,
honest signal considered and adopted: whenever `ensureCourseProject` actually
creates a project (as opposed to finding one already there), the calling step
pushes a run-visible note - `"This course had no project yet - one was
generated automatically from its schedule/topics (a \"Define the course
project\" step may be missing from this workflow)."` - into its own summary,
the same list an instructor already reads after every run. This costs nothing
extra (the `created` flag `ensureCourseProject` already returns for its own
idempotency check) and gives an instructor a legible reason the course
suddenly grew a project, without building any drift-detection machinery.

**AC8 - tests, and sabotage-check results.** New/changed test files: `src/
lib/workflows/registry/steps.course-project.test.ts` (11 `ensureCourseProject`
unit tests: idempotency, the applied-only gate, week-count resolution from
the tile vs. a bound schedule, generation/save failure degrading to "no
project" rather than throwing, and two-call idempotency),
`src/app/actions/schedule-week-plan.ensure-project.test.ts` (3 tests, real
`callLlm`-mocked prompt inspection, above), `registry.generate-assignment-
from-template.test.ts` and `registry.generate-test-from-template.test.ts`
(4 and 3 new tests: on-demand creation + milestone reaching the generator's
context, no double-generation when a project already exists, the
applied-only gate, and cross-run idempotency), `registry.lecture-materials-
from-schedule.test.ts` (grew from a single input/output-shape check to 5
tests covering the same on-demand/idempotency/gate behavior at that step, plus
an unbound-`hubCourse` byte-identical-to-before check), and new file
`registry.define-course-project.test.ts` (the step's first direct test,
AC4's convergence proof). **Sabotage-checked, one change at a time, each
reverted after confirming:** removing `ensureCourseProject`'s
`hasProject(existing)` early return failed exactly the 7 idempotency-focused
tests across all 5 affected files (the other 73 in those files stayed green);
removing the `courseKind !== "applied"` gate failed exactly the 4
"coding course never auto-generates" guard tests (76 others stayed green);
disabling the `courseProject = ensured.project` reassignment in
`generate-assignment-from-template` failed exactly its one "milestone reaches
the context" test; disabling that same step's `created`-note push failed
exactly its one AC7-note assertion; and disabling BOTH of
`define-course-project`'s pre-existing "leave alone" branches together made
its new convergence test fail with a genuine (crashing) double-generation
attempt - disabling only ONE of those two branches left the other to
correctly catch it, so the test was rewritten to assert the OBSERVABLE
outcome (no generation call, existing data returned) rather than pin to
either specific branch. All five reverted after confirming; `npx vitest run`
finished at 255 files / 5022 tests, `npx tsc --noEmit`, and `npm run lint`
all clean.

## 153. Removed the "duplicate a preset" mechanism entirely - a preset edit now saves onto the preset itself

Entry 152 patched the SYMPTOM of "Course Kickoff (no codebase) (copy)" never
receiving `define-course-project`. This entry removes the mechanism that
produced it: a saved workflow that is a full, frozen snapshot of a preset,
living under its own separate id, silently shadowing every future preset
improvement. The instructor's request was blunt and correct: "if I make a
change to a preset, that preset should save to itself, not to a copy."

**Duplicate-creating entry points found (both removed):**
1. `WorkflowsTab.tsx`'s `handlePresetScope` - changing a preset's "This
   workflow is for" scope silently created `"<name> (copy)"` with a fresh
   `crypto.randomUUID()` id and a full `JSON.parse(JSON.stringify(steps))`
   snapshot, then switched selection to it.
2. `WorkflowPanel.tsx`'s "Duplicate" button (rendered for BOTH presets and
   already-custom workflows) - identical copy-with-new-id-and-frozen-steps
   logic, reachable with one click regardless of what was selected.
   Removed for custom workflows too, not just presets: it shared the exact
   same "(copy)" naming and frozen-snapshot code path, so leaving it in
   place would have kept a smaller version of the same hazard alive
   (duplicate a custom workflow, then silently diverge from then on).
   "New workflow" (AC5) + WorkflowBuilder's pre-existing "Append steps from
   workflow" (a deliberate, visible, one-time snapshot copy into a
   currently-being-built workflow) already cover "start a new workflow from
   an existing one's steps" without an implicit hidden identity.

No other entry point existed - schedules/triggers/run history never copied
a def, they only ever stored `workflow_id` (see AC4).

**What a user can actually edit, and why that matters for AC2/AC3:** scope
(workflow-level targets), and - since WorkflowBuilder was previously gated
off entirely for presets (`editing && !selectedDef.preset`) - for a preset,
historically ONLY scope. Duplicating was the ONLY way to reach step-level
editing (add/remove/reorder steps, per-input bindings, runIf gates, name/
description, include-workflow targets) on a preset at all. This feature
removes that gate: presets are now edited in place through the same
WorkflowBuilder a custom workflow already used, with edits captured as a
delta rather than a duplicate.

**AC1/AC2 - identity and delta storage (`src/lib/workflows/preset-overrides.ts`,
new).** An edited def is compared against the CURRENT code preset
(`diffAgainstPreset`) and, when possible, only the difference is stored:
- **Scope** - always a delta (a small top-level map; never indexed by
  step position).
- **Per-input bindings and `runIf` on an EXISTING step, unchanged step
  count/order** - a delta keyed by step INDEX, storing only the input keys
  that actually differ from the live preset's own binding for that key
  (never a full per-step snapshot). This is what makes a preset step
  gaining a brand-new input transparent: the override doesn't mention that
  key, so resolution simply inherits the preset's own new default for it
  (`resolvePresetOverride`, tested in `preset-overrides.test.ts`).
- **An include-workflow step's target** (`workflowId`/`skipSteps`/`remap`/
  `bindOverrides`) - stored as a wholesale replacement when it changes; it
  is already a small, complete object every time the builder writes one, so
  a finer-grained diff would not have saved anything.
- **Name/description** - stored only when they differ from the preset's own.

The stored row's own `id` equals THE PRESET'S OWN id - not a new uuid. This
is the actual mechanism behind AC1's "one identity, no duplicates":
`allWorkflows` (`presets.ts`) now merges `PRESET_WORKFLOWS` with the saved
custom rows by id - a preset with a matching custom row resolves that row's
delta on top of the CURRENT preset (`resolvePresetOverride`) instead of
listing both, and disappears from the leftover "plain custom workflows"
pass. Resolution happens in exactly ONE place - `allWorkflows` - which is
already the sole choke point every consumer (client `WorkflowsTab`, all four
server routes under `src/app/api`, `workflow-trigger-runner.ts`,
`useAutomationInventory.ts`) feeds its loaded custom defs through before
doing anything else with them (verified by reading every call site - none of
them touch the raw custom array for anything but this one call). So
`expandWorkflowDef`, `collectRuntimeFields`, the run engine, and
`headless.ts` needed ZERO changes (AC7) - they still only ever see a plain,
fully-resolved `WorkflowDef`, exactly the shape they always consumed.

**AC3 - structural edits are diverged, honestly, not silently.** Once an
edit changes step SHAPE (steps added, removed, reordered, or - treated the
same way - an include-workflow step's target changed), `diffAgainstPreset`
returns `{ diverged: true }` and the workflow's `steps` field becomes the
full, frozen, authoritative list (structurally identical to the old
"(copy)" behavior) - but stored under the SAME id as the preset, not a
second one. Considered and rejected: replaying structural edits as an
ordered op-list (insert/remove/move-step) applied over the live preset,
which AC3 explicitly preferred if avoidable. Rejected because a positional
"remove step at index 3" or "move step 2 to 5" can SILENTLY misapply to the
WRONG step the moment the base preset's own shape changes upstream too -
worse than today's honest freeze, because it corrupts quietly instead of
just going stale. Bindings-only deltas get an analogous but SAFE version of
this same risk (an index no longer matching what it was saved against), and
degrade by skipping the mismatched entry entirely - proven in
`preset-overrides.test.ts`'s "gained AFTER the override was saved" test,
which asserts the stale entry does NOT leak onto the wrong step. A
structural edit cannot degrade that gently (there is no safe partial
outcome for "insert conflicts with a shape change"), so it freezes instead,
and freezing is now VISIBLE: `WorkflowPanel.tsx` renders a standing banner
("This workflow has diverged from its preset... will NOT automatically pick
up new preset steps") the instant `presetOverride.diverged` is true - never
silent, which is the entire point of this feature. A user who manually
reshapes a diverged workflow back to the preset's current step count/order
naturally "reconverges" onto delta tracking again (an accepted, harmless
emergent property of always re-diffing from scratch rather than tracking
diverged as a one-way sticky flag).

**AC4 - migration, and the existing "(copy)" row's fate.** `workflow_id` on
`workflow_schedules`/`workflow_triggers`/`workflow_runs` has ALWAYS been a
plain `text` column, never a foreign key into `workflow_defs.id` (confirmed
by reading all three tables' migrations) - so nothing about how a schedule
resolves its workflow changes; `allWorkflows(...).find(w => w.id ===
workflow_id)` behaves exactly as before for every id that already existed.
The only schema change needed was making `workflow_defs.id` able to hold a
PRESET's plain slug id (not just a uuid) per user: migration
`20260916000000_workflow_defs_preset_overrides.sql` widens `id` from `uuid`
to `text` (every existing value is already valid text - no data rewrite)
and widens the primary key from `(id)` to `(user_id, id)` (so two different
users can each own their own override of the same preset id - required
because `id` alone is no longer guaranteed unique once a preset id is a
legal value), then adds a nullable `preset_overrides jsonb` column (the
delta itself; null for every pre-existing row).

The instructor's actual "Course Kickoff (no codebase) (copy)" row, and any
other pre-existing custom workflow, is **left exactly as it is: a plain,
independent custom workflow**, not auto-adopted as the preset's override.
Nothing in the stored data reliably proves that copy came from
`course-kickoff-no-code` specifically (only its NAME suggests it, and a
migration must not guess from a display string a user could have renamed,
translated, or reused for an unrelated duplicate) - guessing wrong would
SILENTLY change what an existing schedule pointed at that row runs, which is
precisely the class of surprise this whole feature exists to eliminate.
Its schedule keeps firing it, unchanged, forever, exactly as before this
migration. Going forward, the instructor's remaining fix is a one-time
manual step outside this migration's scope: edit the PRESET directly (now
possible in place) and repoint the schedule at it, or delete the stale copy
- both ordinary, already-supported operations, not new ones this feature
had to build.

**AC5 - from-scratch custom workflows, confirmed unaffected.** "New
workflow" is unchanged (`crypto.randomUUID()` id, empty steps) and
`getPresetDef`/`toStoredDef` treat any id that is not one of
`PRESET_WORKFLOWS`'s ids as a plain custom workflow, unconditionally - a
`crypto.randomUUID()` string can never collide with a preset's hand-written
slug id, so this path needed no special-casing at all.

**AC6 - reset to shipped.** Reuses `deleteWorkflowDef` (delete the
`workflow_defs` row for that id) verbatim - once the row is gone,
`allWorkflows` finds no custom entry for that preset id and falls straight
back to the unmodified code preset, because the preset itself is code and
always available. `WorkflowPanel.tsx` shows "Reset to shipped" (armed the
same two-click way as "Delete") exactly when `selectedDef.presetOverride`
is set, explicit that it discards the saved delta/frozen steps and scope.
Run-form values (`ta-workflow-values-<id>`) are deliberately LEFT ALONE on
reset - unlike a real delete, the id keeps meaning the same workflow, and a
remembered input is still probably a valid input for the shipped version.

**AC7 - every consumer re-verified against the resolved def.** Resolution
order is unchanged and re-pinned by a new test
(`presets.overrides.test.ts`'s "a resolved preset override survives
expandWorkflowDef unchanged in position"): `allWorkflows` resolves the
preset-override delta FIRST, and only the resulting plain `WorkflowDef` is
ever handed to `expandWorkflowDef`, so `include.bindOverrides`'/`remap`'s
existing "skip silently on a miss" contract (regression 141.6) still runs
on ordinary, already-merged bindings - a preset override cannot introduce a
NEW way for a positional override to be silently dropped, because by the
time `expandWorkflowDef` ever sees the def, the preset-override layer has
already been fully resolved out of the picture. `headless.ts` needed no
changes (verified by inspection - it only ever calls `expandWorkflowDef` on
whatever def it is handed) and the full suite (including
`headless.test.ts`'s `HEADLESS_SAFE_STEP_TYPES.size` canary) stayed green
throughout. The Automations tab and run history are both keyed by
`workflowId`/`selectedDef.id`, which never changes across an edit - the
entire point of this feature - so neither needed any code change either.

**AC8 - tests, and sabotage-check results.** New files:
`preset-overrides.test.ts` (19 tests: diffing every kind of change,
resolving including the "gained a step"/"gained an input" cases, diverged
detection and the frozen-list takeover, idempotent resolve, and
save-then-reload round-tripping via `toStoredDef`), `presets.overrides.test.ts`
(9 tests: the AC1 one-entry merge, an untouched preset with no override, a
plain custom passthrough, the AC4 legacy-copy-row passthrough, display-order
preservation, a preset gaining a step reaching a scope-only override
automatically, and the AC7 expand-survives-resolution integration test),
`workflow-defs.test.ts` (+6: `preset_overrides` round-trip through
`mapWorkflowDef`, and `upsertWorkflowDef`'s new `onConflict: "user_id,id"` /
`preset_overrides` payload), `types.workflow-edit.test.ts` (3: the new
`upsertWorkflowDefById` append-vs-replace helper every save path now uses
instead of a plain `.map`, which silently no-ops on an id it has never seen
before - exactly the FIRST-customization case this feature introduces).
**Sabotage-checked, one change at a time, each reverted after confirming:**
dropping `resolvePresetOverride`'s `expectedType` mismatch check let a stale
override leak an unrelated binding onto the WRONG (type-changed) step -
caught only after strengthening the "gained AFTER the override was saved"
test to assert the step's bindings exactly (an earlier, weaker assertion on
a single key missed it, so the test itself was fixed first); hard-coding
`diffAgainstPreset`'s `shapeMatches` to `true` failed the two diverged-
detection tests, with a genuine crash (reading `.runIf` off `undefined`) on
the count-mismatch case, proving the shape check is also what keeps index
access safe, not just correctness; reverting `allWorkflows` to a plain
`[...presets, ...custom]` concatenation (the pre-existing code, literally)
failed the one-entry-per-preset test with a real duplicate AND the AC7
integration test (since a duplicate preset entry made `.find` on the WRONG
one); always writing `edited.steps` instead of `[]` for a non-diverged
`toStoredDef` result failed exactly the one test asserting no frozen copy is
stored; changing `upsertWorkflowDef`'s `onConflict` back to bare `"id"`
failed exactly the one test pinning the new composite key; and reverting
`upsertWorkflowDefById` to a plain `.map` failed exactly the
first-customization append test. All six reverted after confirming, and no
other test in the suite was affected by any of them. `npx vitest run`
finished at 258 files / 5059 tests (37 new), `npx tsc --noEmit`, and
`npm run lint` all clean; `git status --short` shows only the files this
entry lists.

## 154. The workflow run log now includes the inputs each step actually resolved

Two production incidents (a no-code kickoff shipping wrong output twice, an
unattended grading run failing eleven times with "the Repository input
resolved to empty") were only diagnosable by cross-reading the log against
the preset by hand, because `workflow_run_steps` recorded everything ABOUT a
step's execution - timing, status, summary, error - but never what it
actually RECEIVED. This closes that gap, with redaction treated as the
primary risk rather than an afterthought (AC2's framing: "a log that leaks a
Canvas token... is a worse outcome than no feature").

**AC1 - resolved, not configured.** Both runners already build a plain
`resolvedInputs: Record<string, unknown>` object immediately before calling
`stepDef.run(resolvedInputs, ...)` (`server-runner.ts`'s
`runExpandedBodyOnce`, `useWorkflowRun.ts`'s step loop). That object - not
the step's bindings - is threaded straight into logging, so the log shows
exactly what the step call received. Both loops changed `const
resolvedInputs` (declared and scoped inside the `try`) to `let
resolvedInputs` declared ABOVE the `try`, reset to `{}` at the top of it -
so a throw partway through binding resolution (a dependency error, a
"Missing output from step N") still leaves whatever WAS resolved before the
throw available to the `catch` block's own log call. An input that resolves
to `""`/`null`/`[]`/`{}` renders as the literal string `"(empty)"`, and the
KEY is always present when the step reached that point in resolution -
never silently dropped for being falsy. An input the step's own binding
resolution never reached at all (no binding, scope doesn't cover it) is
correctly absent - it was never part of what `stepDef.run` received, so
recording nothing for it is accurate, not a gap.

**AC2 - redaction rules and caps** (all in the new, dependency-free, pure
`src/lib/workflows/run-input-redaction.ts`, ~40 unit tests in its sibling
`.test.ts`):
- **By key name**: a normalized (lowercased, punctuation-stripped) key
  containing `token`, `secret`, `password`, `pwd`, `credential`, `apikey`,
  `accesskey`, `privatekey`, or `bearer` redacts the ENTIRE value (even a
  nested object) to the literal marker `[REDACTED]` - checked BEFORE any
  recursive walk, so nothing about a credential-named field's shape leaks
  either. Deliberately does NOT match bare `auth` (would have
  false-positived on `StepRunHelpers.author`) - `token`/`secret` alone
  already catch `authToken`/`clientSecret`.
- **By value shape**, independent of key name (a credential pasted into an
  innocuous field): known formats - GitHub `ghp_`/`gho_`/`ghu_`/`ghs_`/
  `ghr_`/`github_pat_` tokens, OpenAI/Anthropic `sk-`/`sk-ant-` keys, Stripe
  `pk_`/`rk_` keys, AWS `AKIA...` access key ids, JWTs (three dot-separated
  segments), Canvas-style `<digits>~<opaque>` tokens, and a bare
  `Bearer <token>` value - plus a generic fallback for a long (>=32 char),
  whitespace-free, mixed-case opaque string that is NOT a UUID shape (course/
  user/tile ids are UUIDs and are meant to stay visible - buildRunLogText
  already prints them in the clear) and NOT a plain lowercase-hex hash (a
  git SHA/checksum - not secret, and useful evidence, so the heuristic
  deliberately leaves it alone).
- **File/binary payloads never stored**: a File/Blob-like value (duck-typed,
  not `instanceof File` - Node's global File is not guaranteed present) is
  reduced to `[file: name, type, size bytes]`; a raw base64 `data:` URL
  string is reduced to `[file data omitted - <mime>, <N> base64 characters]`
  - the content is never written, at any size, even under the length cap.
- **Caps, both with explicit markers**: `MAX_VALUE_CHARS` (500) per
  individual value, `MAX_TOTAL_CHARS` (4000) across one step's/run's whole
  payload. The total cap does NOT drop keys once exhausted - every key that
  reached this function keeps a line, its value becoming
  `"(omitted - step input payload cap of 4000 characters reached)"` - the
  same "never omit, even under pressure" rule AC1 established for empty
  values, now applied to truncation too.
- Redaction runs in ONE chokepoint - `run-logging.ts`'s `logStepOutcome`
  (steps) and `safeStartWorkflowRun` (run-level field values) - the same
  shared module both runners already funnel every log write through. Raw
  `resolvedInputs`/`fieldValues` are threaded as their own positional
  parameters (mirroring how `progress` already works there), deliberately
  NEVER attached to `StepRunOutcome` - the aggregate object that flows on
  through fan-out groups, `WorkflowRunSummary`, `buildRunReportMarkdown`, and
  several route handlers' JSON responses. Keeping raw values out of that
  long-lived object means redaction has exactly one door, not "every future
  reader of StepRunOutcome must remember not to serialize it."

**AC3 - run-level inputs.** `safeStartWorkflowRun` gained an optional
`fieldValues` parameter, redacted the same way and written to the new
`workflow_runs.field_values` column at run-start time (no extra query - it
rides the same upsert `startWorkflowRun` already does). All five unattended
entry points (both `cron/run-schedules` branches, `workflow-trigger-runner`,
`api/triggers/[token]`, `api/github/webhook`, `api/automations/run-now`) now
pass their already-in-scope `schedule.fieldValues`/`trigger.fieldValues`
(merged with any per-call overlay) at the exact call site that already
starts the run. The attended runner (`useWorkflowRun.ts`) passes `{
...values, ...uploadFiles }` - the form's text fields plus any file uploads,
the latter reduced to metadata by the same redaction path - so "the schedule
was configured with Institution: None" is visible from the downloaded log
alone, no Automate panel needed.

**AC4 - storage.** Two nullable, additive jsonb columns (migration
`20260917000000_workflow_run_inputs.sql`, auto-applies via the push Action):
`workflow_run_steps.inputs` and `workflow_runs.field_values`. Both store the
ALREADY-redacted, ALREADY-capped `Record<string, string>` shape verbatim -
no further processing at read time. `mapWorkflowRun`/`mapWorkflowRunStep`
degrade a malformed/legacy value to `null` via a new shared
`coerceStringRecord` (non-object/array/null input -> null; non-string
entries dropped; an object left with zero string entries -> null, not `{}`,
so "is there a section to render" stays a single null check) - same
defensive-mapper discipline as `coerceProgress`, same "nullable, additive,
old rows still render" precedent as `course_name` (migration
`20260914000000`).

**AC5 - rendering.** `buildRunLogText` renders a step's inputs in their own
`MINOR_RULE`-divided "Inputs:" section, positioned right after the metadata
block and BEFORE Progress/Error/Summary (what it received, before the
narrative of what happened), and the run's field values in an unindented
"Field values:" section after the header's Step/Error counts and before
Detail. Both reuse one new `renderKeyValueBullets(map, bulletIndent)`
helper - `bulletIndent` follows this file's existing "label indent + 2
spaces for its bullets" rule: `"  Inputs:"` (step-nested, 2-indent label)
bullets at `"    "` matching Progress's own `"    - "` convention;
`"Field values:"` (top-level, 0-indent label) bullets at `"  "` matching
Detail's own `"  - "` convention. A step/run with nothing recorded
(`inputs`/`fieldValues` null, OR - defensively - an empty object) renders NO
section at all, never an empty or misleading heading.

**AC6 - both runners verified.** Traced the exact same three-part change
(hoist `resolvedInputs` above the `try`, thread it as `logStep`'s new
trailing parameter, thread the redacted map through `safeStartWorkflowRun`
at the run-start call site) into `server-runner.ts` (unattended) and
`useWorkflowRun.ts` (attended). The unattended path has direct end-to-end
test coverage (`server-runner.run-log.test.ts`'s new "per-step
resolved-input logging" describe block: a runtime binding's resolved value,
an empty-resolved binding rendering visibly, a credential-shaped field
value redacted, a no-inputs step logging `null`, a disabled step logging
`null`, and a step whose `run()` throws still logging what it resolved
first). `useWorkflowRun.ts` has no dedicated test harness (a "use client"
React hook with heavy `useState`/ref wiring) - verified by code trace plus
the fact that both runners funnel through the SAME `logStepOutcome`/
`safeStartWorkflowRun` chokepoint in `run-logging.ts`, which IS directly
tested (see AC8) - a redaction bug in that shared module would fail there
regardless of which runner triggered it.

**AC7 - bounded cost.** No query added anywhere: step inputs ride the
existing per-step `recordRunStep` insert, run field values ride the existing
`startWorkflowRun` upsert. Payload size is bounded by the two caps above
regardless of how large a step's real inputs are.

**AC8 - tests and sabotage-check.** New `run-input-redaction.test.ts` (29
tests: key-name redaction incl. the deliberate `author` non-match, value-
shape redaction for every known format plus the UUID/hex-hash exclusions,
File/data-URL reduction, per-value and total truncation with markers,
empty-visibility, determinism, key-order preservation). Extended
`run-logging.test.ts` (redaction happens before the write, empty-visible,
`inputs`/`field_values: null` when absent), `workflow-runs.test.ts`
(`inputs`/`field_values` pass-through, `mapWorkflowRun`/`mapWorkflowRunStep`
well-formed-row assertions extended, `coerceStringRecord`'s malformed-value
and non-string-entry-dropping degrade paths), `workflow-run-log-text.test.ts`
(Inputs/Field values section rendering, empty-visible, null-vs-empty-object
both render no section, multi-line value continuation indent), and
`server-runner.run-log.test.ts` (the AC1/AC6 end-to-end cases above).
**Sabotage-checked, one change at a time, each reverted after confirming
red then green again:** disabling `isCredentialKeyName` failed 4 tests
across 2 files (unit-level and the end-to-end server-runner test); skipping
falsy/empty values in `redactRunInputs` (a naive "if (!value) continue" bug)
failed 5 tests across 3 files, including the exact end-to-end case that
mirrors the reported incident; disabling the File-like-value short-circuit
failed 2 file-redaction tests; disabling `capValueLength` failed exactly the
per-value truncation test (the total-cap tests kept passing, confirming the
two caps are independently enforced by design); making `logStepOutcome`
write `rawInputs` straight through without calling `redactRunInputs` failed
5 tests across 2 files; dropping the `resolvedInputs` argument from the
error-path `logStep` call in `server-runner.ts` failed exactly the "still
records what was resolved when a later step throws" test; and removing
`buildRunLogText`'s `Object.keys(...).length > 0` guard (leaving only the
null check) failed exactly the empty-object no-section test. All seven
reverted after confirming, and no other test in the suite was affected by
any of them. `npx vitest run` finished at 259 files / 5120 tests (61 new),
`npx tsc --noEmit`, and `npm run lint` all clean; `git status --short` shows
only the files this entry lists.

## 155. Course Kickoff / Course Refresh's terminal zip was missing most of what the run actually produced

A real 16-week Course Refresh run produced a zip with exactly 64 files (16
each of assignment-instructions, slide decks, module-objectives docs,
openers) even though that same run's log showed `save-csv-to-course`,
`generate-assignment-from-template`, `generate-test-from-template`, and
`lms-rubric` all running successfully. The schedule CSV, the rubric, and
both template-generated documents never reached the zip, and the zip only
ever saved to the course tile's materials list - never downloaded, so an
attended instructor had to go find it.

**AC1 - inventory.** Every registry step that produces a human-wanted
artifact (docx/pptx/xlsx/csv/zip, or LMS page text), whether it currently
contributes to the `files` (`GeneratedCourseFile[]`) chain, and why not
when it doesn't:

| Step | Artifact | files I/O? | Wired into Course Refresh's terminal zip? |
|---|---|---|---|
| `lecture-zip` / `lecture-materials-from-schedule` (via `assembleLectureFiles`) | per-week slides/objectives/instructions | in+out | Yes (chain source) |
| `generate-class-openers` | per-week opener docx | in+out | Yes (already chained) |
| `generate-assignment-from-template` | assignment handout docx | in+out | Yes (already chained) - but the OLD terminal-zip binding skipped past it (see below) |
| `generate-test-from-template` | test docx | in+out | Yes (already chained) - same OLD-binding gap |
| `save-csv-to-course` | schedule CSV | none (writes straight to the tile) | **No, until this fix** - added a `schedule` input to `save-zip-to-course` that rebuilds the identical CSV via the same `scheduleToCsv` |
| `lms-rubric` | rubric docx (`rubricFiles` output) | out only (no `files` input - it's a chain start) | **No, until this fix** - added a `rubricFiles` input to `save-zip-to-course`; safe because `lms-rubric` never throws (every failure path degrades to an empty `rubricFiles` or a note) |
| `castletop-workbook` | credit-hour workbook xlsx | none | **Deliberately still no** - see AC2 |
| `generate-syllabus` | syllabus docx (only on the rare run that actually regenerates one) | none | **Deliberately still no** - see AC2 |
| `blackboard-export` (Common Cartridge) | `.imscc` zip FOR LMS IMPORT | in only (consumes `files` + `rubricFiles`) | No, by design (see AC2) - it is an LMS-import artifact, not the instructor's own copy (this line already existed in `assembleLectureFiles`'s own comment) |
| `starter-materials` | syllabus (when a tile has none), posted straight into a Canvas module | none - loops over N LMS courses with no per-file output at all | Out of scope - would need restructuring the step's per-course loop into a per-course file list, a materially larger change than this request; no evidence pointed at this specific gap |
| ~30 other artifact-producing steps found by inventory sweep (`lecture-qa`, `tech-report`, `draft-weekly-study-guides`, `ensure-visualizer-pages(-for-deck)`, `propose-problem-solutions`, `current-events-report`, `generate-presentation-from-template`, `synthesize-narration`, `generate-concept-animations`, `draft-upcoming-lectures`, `generate-module-answers`, `export-grades-for-lms`, `grade-cartridge-submissions`, `export-course-cartridge`) | various docx/pptx/mp3/html/csv | none declare `type: "files"` I/O | Out of scope - none of these run inside Course Kickoff or Course Refresh; each belongs to its own separate, single-purpose preset (Lecture Q&A, Weekly Lecture Deck, Grade Export, etc.) with its own already-working delivery (direct download + Files-tab save). Wiring 15 unrelated steps into a `files` chain type none of them were designed to share is a distinct, much larger feature than "fix the kickoff/refresh zip," and nothing in the reported gap pointed at them. |

**AC2 - wiring.** `save-zip-to-course` (`steps.course-setup.storage.ts`)
gained two new optional inputs, `rubricFiles` (type `files`) and `schedule`
(type `schedule`, used to rebuild the CSV via the exported `scheduleToCsv`
so no second network round trip is needed). The pre-existing bug: in
`COURSE_REFRESH`, `save-zip-to-course`'s `files` binding read
`lecture-zip`'s own output (source index 3) directly - the SAME index
`generate-class-openers` reads from - instead of the fully accumulated
chain's LAST link (`generate-test-from-template`, index 6), silently
dropping everything `generate-class-openers` /
`generate-assignment-from-template` / `generate-test-from-template` added
after it. Fixed by rebinding `files` to index 6 (the same link every
LMS-posting step already reads). No step "emits its OWN standalone zip
that needed unwrapping into files" beyond what already happened:
`lecture-zip`/`lecture-materials-from-schedule` and `generate-class-openers`
already contribute FILES (not zips) to the chain via their own `files`
output - their interim zips are separate, redundant convenience downloads
that were never fed forward, so there is no zip-inside-zip today either
way.

`castletop-workbook` and `generate-syllabus` are DELIBERATELY NOT chained
in, despite both producing a real artifact. Reason: `server-runner.ts`'s
step loop cascades ANY `source: "step"` binding's failure to its
dependents (`failedSteps.add`, then every downstream step bound to that
index throws "Skipped - depends on step N... which failed" before its own
`run()` is even called) - this is unconditional, with no "soft"/optional
variant. `lms-rubric` is provably safe to depend on (every code path
degrades gracefully, confirmed by reading the whole function - never a bare
`throw`), but `castletop-workbook` (`generateCastletopWorkbookAction`
failing on real course data, or "Course tile not found") and
`generate-syllabus` ("Set a syllabus template on the course... first" - a
common, plausible configuration gap) both have real throw paths. Chaining
either into `save-zip-to-course` would turn one unrelated, narrow failure
into losing the ENTIRE zip (all 16 weeks of content, the rubric, the
schedule) - strictly worse than the instructor fetching those two files
from their own already-dedicated locations (the Castletop
column/Files tab, and the syllabus library, both unchanged by this fix).

**AC3 - one terminal zip, folder layout, collisions.**
`save-zip-to-course` merges `files` + `rubricFiles` + the CSV it builds
into one file list, then organizes the zip into `Week NN/` subfolders (one
per `weekNumber >= 1`, zero-padded) for per-module artifacts and a single
`Course-Wide/` folder for anything with `weekNumber === 0` (the rubric, the
CSV) - a flat 60+ file zip for a 16-week course is unusable, and grouping
by week mirrors both the course's own structure and the LMS modules these
same files are uploaded into. Collision strategy: a `uniquePath` helper
tracks every path already used in a `Set`; a second file landing on an
identical `folder/name` gets ` (2)`, a third ` (3)`, etc., inserted before
the extension - deterministic, order-based, and applied uniformly (not
assumed away just because `buildWorkflowFileName`'s qualifier already makes
same-week collisions rare in practice - a silent JSZip overwrite would
quietly drop a file with no error).

**AC4 - attended download.** `save-zip-to-course` now downloads the zip
(guarded by `typeof document !== "undefined"`, exactly the capability check
every other producer step in this registry already uses - not an LMS or
run-mode check) immediately before its existing `saveCourseMaterialFile`
call. Automatic, not a separate button: every other artifact-producing step
in this same registry already auto-downloads on completion (`lecture-zip`,
`generate-class-openers`, `castletop-workbook`, `blackboard-export`,
`generate-assignment-from-template`, `generate-test-from-template`) - a
manual-download design here would be the sole exception, not the norm, and
"re-running downloads again" is already accepted behavior for every one of
those sibling steps today, so this isn't a new UX regression, it's parity.
Considered and rejected reusing `downloadBase64File`
(`src/app/home-helpers.ts`, named in the reuse survey): it requires a
base64 round trip, which would roughly double this zip's peak memory
footprint for no benefit - the zip is already an in-memory `Blob` (built by
`JSZip.generateAsync({ type: "blob" })`), so `URL.createObjectURL` (the
pattern every sibling step already uses) delivers it with no extra copy.
`downloadBase64File` exists for a different calling shape entirely -
server-action responses that are already base64-encoded strings, which
nothing in this step ever produces.

**AC5 - unattended path unchanged.** Both paths traced: attended
(`typeof document !== "undefined"` is true in a browser) downloads then
calls `saveCourseMaterialFile`; unattended (`server-runner.ts`'s
`buildServerStepRunHelpers` supplies `saveCourseMaterialFile` but no
`document` global exists in Node) skips the download branch
(`downloadSkipped = true`, summary text says "Saved" instead of
"Downloaded") and calls the exact same `saveCourseMaterialFile`, unchanged
from before this fix. Verified by a dedicated unit test asserting
`saveCourseMaterialFile` is still called exactly once with no `document`
global stubbed (this suite's default test environment, matching a headless
run), and a second test with a stubbed `document` proving the download
branch fires in addition, not instead.

**AC6 - course-tile save preserved.** `saveCourseMaterialFile` is still
the LAST call in `run()`, receiving the exact same `(hubCourseId, zipBlob,
fileName)` shape as before this change; only its inputs (which files it
bundles) changed, not the save call itself or the naming logic (explicit
name -> tile-derived name -> "Course Materials" fallback, all untouched).

**AC7 - presets/step order.** `save-zip-to-course` moved from
`COURSE_REFRESH`'s source index 7 to the very end (new index 16, after
`castletop-workbook`) - a binding can only reference an EARLIER step's
output, so reaching `lms-rubric`'s rubric (index 8) requires running after
it. This was NOT achievable without moving the step: tried keeping it in
place and only fixing the `files` binding (reachable, since index 6 < 7),
but that leaves the rubric/CSV gap (AC1) entirely unaddressed, which is the
literal request ("literally all artifacts"). Every step from the OLD index
8 through 16 (`lms-wipe` through `castletop-workbook`) shifted down by
exactly one; internal references were re-pinned accordingly:
`lms-populate`/`lms-assignments`'s `modules` binding (10 -> 9, `lms-modules`'s
new index) and `blackboard-export`'s `rubricFiles` binding (9 -> 8,
`lms-rubric`'s new index). Both `COURSE_KICKOFF` and `NO_CODE_KICKOFF`'s
`bindOverrides` keys targeting the shifted range were re-verified and
re-pinned per the "silently skipped on a miss" rule (regression 141.6):
`"14.includeGithub"` -> `"13.includeGithub"`, `"15.regenerate"` ->
`"14.regenerate"`, and the six `"16.*"` Castletop-field overrides ->
`"15.*"`, in both kickoffs (16 keys total). Indices 0-6 (every step
`GENERATORS`/`POSTERS` and both kickoffs' `bindOverrides` already
reference) were untouched, so every OTHER pinned index elsewhere in the
codebase (steps.lms-integrations.ts's `integrate-source-into-lms`
deliberately avoids hardcoded indices entirely, for exactly this kind of
reorder) needed no change. `include-mirror.test.ts`'s `danglingOutputs`
assertions against the real `COURSE_REFRESH.steps` were re-derived by hand
and found UNCHANGED (same 7-8 keys either way - `save-zip-to-course`'s new
`schedule`/`rubricFiles` bindings reference steps already referenced by
other kept steps, so no new dangling key appears when steps 0/1/[3] are
skipped); only their explanatory comments were corrected. One step's
existing `run()` was NOT touched purely by this move: neither
`castletop-workbook` nor `generate-syllabus` gained bindings (see AC2), so
their behavior is byte-for-byte unchanged, just running one array slot
later relative to `save-zip-to-course`. For a KICKOFF specifically (not
standalone Course Refresh), 1-2 more steps
(`populate-lms-from-class-template`, and `integrate-source-into-lms` for
the no-code kickoff) still run after the now-last-in-course-refresh
`save-zip-to-course`, because they need the LMS course/modules the
included refresh just built and can't be reordered before the include;
both are pure LMS-posting actions with no file output of their own, so
nothing is missing from the zip's CONTENT, only the zip's download is not
the literal final tool call of a kickoff run (it is the literal final step
of a standalone Course Refresh run). Closing that last gap would mean
duplicating `save-zip-to-course` outside `course-refresh`'s own reusable
step list for zero content gain, so it was left as a documented, minor
scope boundary rather than forced.

AMENDED (RCA round 4, RCA21): this AC's index pins predate Group Q (entry
157), which inserted two MORE steps into `COURSE_REFRESH`
(`generate-course-guides` at index 7, `generate-weekly-announcements` at
index 13) and shifted everything from index 7 onward down by one, then
everything from the original index 12 onward down by one more (see
`presets.kickoff.test.ts`'s own comment on the 19-step order array, which
was already re-derived and re-pinned correctly for Group Q - only THIS
entry's prose went stale next to it). Restated for the CURRENT step order:
`save-zip-to-course` is now at index 18 of 19 (was "new index 16" above);
`lms-populate`/`lms-assignments`'s `modules` binding now targets index 10
(was 9); `blackboard-export`'s `rubricFiles` binding now targets index 9
(was 8) - BOTH re-amended by entry 164, see below; the kickoffs'
`bindOverrides` keys are now `"15.includeGithub"`,
`"16.regenerate"`, and six `"17.*"` Castletop-field overrides (was
`"13.includeGithub"`/`"14.regenerate"`/six `"15.*"`) - entry 157 AC2 already
documents this exact renumbering, independently. The "17-step canary array"
this AC's own testing implies is now 19 steps. None of this changes AC1-AC6
or AC8-AC9 below - every behavioral acceptance criterion in this entry still
holds; only the specific array-index numbers this AC quotes have moved
twice since it was written (once for this entry's own AC7, once more for
Group Q).

   AMENDED (entry 164), a THIRD move: removing `COURSE_REFRESH`'s standalone
   `generate-class-openers` step shifts every later index left by one, so
   `lms-populate`/`lms-assignments`'s `modules` binding is now index **9**
   (not 10) and `blackboard-export`'s `rubricFiles` is now index **8** (not
   9). By coincidence the OTHER numbers restated above landed back on their
   original values: `save-zip-to-course` is index 18 of 19 again, and the
   `"15.includeGithub"`/`"16.regenerate"`/six `"17.*"` override keys are
   correct as written. Every behavioral criterion in this entry still holds;
   only these two index pins moved.

**AC8 - size/memory.** No cap or streaming added. Realistic size:
`buildSlidesPptx`/`buildDocxFromPlainText` produce text-only content (no
embedded raster media unless the bound deck template supplies a background
image), so a typical week's slides+objectives+instructions+opener+
assignment+test lands in the tens-to-low-hundreds of KB; across 16 weeks
plus the rubric and CSV, a realistic total is low-single-digit MB. A deck
template with a raster background image inflates this - each week's pptx
is an independently-generated binary (no cross-file dedup possible inside a
zip of separate files), so a heavy background could add tens of MB across
16 copies. Either way this is NOT new memory pressure: the exact same file
set is already held in memory simultaneously for the rest of the run today
(`lms-populate` iterates it, `blackboard-export` independently re-bundles
the identical set into a Common Cartridge) - consolidating it into one more
`JSZip.generateAsync({ type: "blob" })` call does not meaningfully raise
the run's existing peak.

**AC9 - tests, sabotage-checked.** New
`steps.course-setup.storage.test.ts` (8 tests): empty-input skip (no save
call), Week NN / Course-Wide folder assignment for a mixed files +
rubricFiles + schedule bundle, two- and three-way name collisions get `(2)`/
`(3)` suffixes with distinct content preserved under each path, attended
download fires (`createObjectURL`/`click`/`revokeObjectURL` each called
once) plus the tile save, unattended run skips the download but still
saves, a missing `saveCourseMaterialFile` helper throws the existing
sign-in error, and a rubric-only bundle (no per-week files, no schedule)
still zips and saves correctly. JSZip cannot read a native Node `Blob` back
out of a real zip in this repo's node test environment (no jsdom/
FileReader shim - the same limitation `assembleLectureFiles.test.ts`
already documents) - rather than adding a new environment dependency, the
suite mocks `jszip` to record `(path, blob)` pairs directly, which
exercises the folder/collision logic (all of it happens BEFORE the
`zip.file()` call) exactly as thoroughly as a real zip would. Extended
`presets.test.ts` (castletop-workbook now second-to-last, save-zip-to-course
last, in both places that previously asserted castletop-workbook was last;
new "every save-zip-to-course input is bound" coverage test excluding the
deliberately-unbound `name` override) and `presets.kickoff.test.ts` (new
assertions: save-zip-to-course reads the last generator's files like every
poster; reads lms-rubric's rubricFiles and schedule-from-repo's schedule by
exact binding; does NOT bind to castletop-workbook or generate-syllabus;
save-zip-to-course is last and castletop-workbook second-to-last; the
17-step canary array reordered; both kickoffs' expanded-workflow
`files`-source-type assertions updated for the new terminal link).
**Sabotage-checked, one change at a time, each reverted after confirming
red then green again:** removing the `uniquePath` collision guard failed
the two collision tests (2 assertions); narrowing the skip condition from
"all three sources empty" to "just weekFiles empty" failed the
rubric-only-bundle test; hard-coding `downloadSkipped = true`
unconditionally failed the attended-download test; hard-coding the zip
folder to always be `"Course-Wide"` failed 3 tests (the folder-assignment
test plus both collision tests, since their expected paths depend on the
`Week 01/` prefix). At the PRESET level: reverting `save-zip-to-course`'s
binding back to the original `files: stepIndex 3` with no `rubricFiles`/
`schedule` bindings failed 5 tests across `presets.test.ts` and
`presets.kickoff.test.ts` (the new "every input bound" coverage test, the
new "reads the last generator's files" test, the new
"reads rubricFiles/schedule" test, and both kickoffs' expanded
`files`-source-type assertions for `save-zip-to-course`). All reverted
after confirming; `npx vitest run` finished at 260 files / 5159 tests
(39 new: 8 in the new file, 31 added/changed across `presets.test.ts`,
`presets.kickoff.test.ts`, `include-mirror.test.ts`), `npx tsc --noEmit`,
and `npm run lint` all clean. `git status --short` at completion also
shows unrelated, already-in-flight changes from a separate concurrent task
(course-project/course-kind "tool-churn" work touching
`src/lib/course-project.ts`, `src/lib/course-kind.ts`,
`src/app/actions/*.ts`, `steps.assignments-template.ts`,
`steps.content-lectures.ts`, `steps.course-project.ts`, and their test
files) - none of it authored by this entry; this entry's own files are
`src/lib/workflows/types.ts`,
`src/lib/workflows/registry/steps.course-setup.storage.ts` (+ its new
`.test.ts`), `src/lib/workflows/presets/course-setup.ts`,
`src/lib/workflows/presets.test.ts`,
`src/lib/workflows/presets.kickoff.test.ts`,
`src/lib/workflows/include-mirror.test.ts`, and this doc.



## 156. Generated course materials reach a professional standard

A real 16-week MGT 422 Course Kickoff run (`512bbdbf`, 67 files, 661 slides, 32
docs) was audited file by file. Three defect classes, all with the same root
cause: the contract that forbade them lived only in a prompt, with nothing in
code enforcing it. The repo had already learned this lesson once -
`enforceNoCodeForApplied` exists because "a comment telling the prompt not to
include code is demonstrably not enough on its own" (entries 83/84) - and the
lesson had never been carried over to URLs or graphics.

Measured before the fix (every URL curl-checked):

| Defect | Measurement |
|---|---|
| Dead links in student-facing docs | **37 of 73 unique URLs (51%)** returned 404/403/500 |
| Punctuation baked into the href | 14 URLs ended in `.` or `,` (e.g. `https://www.pmi.org/certifications/project-management-pmp.`) |
| Fabricated PMI deep links | 11 of 12 `pmi.org/learning/library/<slug>-<id>` URLs were 404 |
| Fabricated placeholder | Week 3 shipped `https://canvas.uw.edu/courses/1234567/pages/project-life-cycles` - a dummy course ID at another university |
| Docs with zero links | all 32 opener + module-objectives docs |
| Tool tutorials | Week 12 told students to use Asana, Google Sheets and Miro and shipped 5 links, none of them a tool tutorial |
| Slides carrying a graphic | **38 of 661 (6%)**; Artifact slides 38/80 (48%) despite the prompt saying EVERY one must; 7 of 16 weeks had zero graphics; Judgment Call slides 0/80 |
| Deck structure | all 16 decks were the identical 42-slide skeleton - slide N had the same kind in week 1 and week 16 |
| Case study reuse | the Denver airport baggage system opened **7 of the 16 weeks** (1,2,3,6,9,10,13), Sydney Opera House 3 (4,5,15), Big Dig 2 (8,11), London Olympics 2 (7,14) - and the same event was dated 1994 in four weeks and 1995 in two |

AMENDED (entry 180): the "Slides carrying a graphic" row above, and every
later number quoted from the same method, are UNRELIABLE FOR TABLE GRAPHICS
and must not be re-used as a baseline. Counting `<p:sp>` shapes per slide -
the method behind that row - cannot see a `table` graphic at all: pptxgenjs
renders a table through `addTable`, which emits a `<p:graphicFrame>`/`<a:tbl>`
and contributes ZERO `<p:sp>`. `Artifact:` is exactly the slide type the
applied contract steers to a table, so that whole slide type reads as empty
under a shape-only count. A later follow-up measurement built the same way
("~84% of Artifact slides shipped with no graphic") was traced to this blind
spot and withdrawn; see entry 180 for the table-aware audit
(`src/lib/pptx-graphics-audit.ts`) that replaces the method. The pre-fix
course this row describes was never re-measured with that audit, so the true
pre-fix figure is unknown - the row is retained as the historical record of
what was believed, not as a measurement anyone should trust.

### AC1 - the model never authors a URL; code resolves every link

`src/lib/urls.ts` (new) holds the URL primitives: `stripModelUrls` (moved
verbatim from `src/lib/live-class/links.ts`, which now imports and re-exports it
under the same name so every existing caller and every assertion in
`links.test.ts` is unchanged) plus `sanitizeResourceUrl`, which strips trailing
`.,;:!?` and unmatched `)]}`. That single function kills the 14 punctuation-baked
hrefs.

`src/lib/resource-links.ts` (new) holds two curated maps - `TOOL_TUTORIAL_MAP`
and `FIELD_RESOURCE_MAP` - matched whole-word and case-insensitively using the
same idiom as `CURATED_DOCS_MAP`'s `matchDocsKeyword`. `normalizeResourceUrl`
collapses any non-curated URL that shares an origin with a curated entry down to
that entry (so a fabricated `pmi.org/learning/library/critical-path-method-
analysis-6193` becomes the live `pmi.org` root instead of a 404), and drops
anything else. Pure: no fetch, no I/O. Deep-link rot is solved by root-only
curation, NOT a network check - a fetch per link would add latency and a new
failure mode inside an unattended run.

The assignment-instructions prompt (`src/app/actions/shared.ts`) now states, as
flatly as the applied contract states the no-code rule, that the model must never
write a URL anywhere in the document. `stripModelUrls` runs over the response as
the last line of defense, then code appends `## Tools You Will Use` and
`## Helpful Free Resources`. The same tools block is appended to module-objectives
docs and class openers - the 32 documents that previously carried no links at all.
`scaffoldAssignmentDoc` (`src/lib/embedded/docs.ts`) uses the same resolvers so
the embedded/deterministic path cannot emit a link the LLM path would reject.

AMENDED (RCA round 4, RCA21): this AC's own heading - "the model never
authors a URL" - overstates what was actually delivered. It is true of the
DOCUMENTS this AC covers (assignment instructions, module objectives, class
openers, plus the FAQ and announcements added in entry 157, and live-class
answers via the pre-existing `links.ts` path) - every one of those routes
through `stripModelUrls` or a curated-map resolver, code-enforced exactly as
described above. It is NOT true of DECKS: `enforceGraphicsForApplied`/
`enforceNoCodeForApplied` (the data-layer guards this same entry's AC5 and
entry 84 established for graphics and code respectively) have no URL
counterpart, and `slide-prompt.ts`'s applied contract still only ASKS the
model, in prose, not to fabricate a URL (`APPLIED_STRUCTURE_REQUIREMENTS`'s
Documentation & References point G: "do NOT fabricate URLs") - the exact
"a comment telling the prompt not to..." shape this entry's own opening
paragraph says is demonstrably not enough on its own. A dead or fabricated
link on a slide is the same defect as one in a document; it just was not
this entry's scope. Recorded here as a known, unclosed follow-up (see
RCA round 4's own minor-findings list for why it stays out of scope for
that round too) rather than left implied by an overstated heading.

### AC2 - curated links are help centers, not marketing homepages

The first implementation satisfied "root-only, no deep links" by collapsing every
entry to its bare domain, which produced links that resolved but taught nothing:
`label: "Miro help center"` pointing at `https://miro.com/`, a pricing page. A
label that misdescribes its destination is worse than the dead link it replaced,
because it looks like it worked.

Those are not in tension: a help-center or academy ROOT (`https://help.miro.com/`,
`https://academy.asana.com/`) is a top-level landing page, exactly as rot-proof as
a bare domain. Every `TOOL_TUTORIAL_MAP` entry now points at the tool's official
help center, academy, or guides root. Two standing tests enforce it:

1. every tool URL must have a path beyond `/` or a `help.`/`support.`/`academy.`/
   `learn.` host - a bare `https://<product>.com/` FAILS;
2. label/URL honesty - a label containing "help center", "academy", "guide" or
   "support" must point at a URL actually carrying that signal.

Sabotage-checked: reverting Miro to its bare domain fails both tests with explicit
diagnostics; restoring passes. The module header now states the rule as "the
tool's official help center, academy, or guides ROOT - never the marketing
homepage, and never a deep article link with a numeric ID or version path",
because the previous wording is what invited the bare-domain collapse.

Also fixed: `HARVARD_ONLINE` pointed at `https://online.harvard.edu/`, which fails
to connect; it is now `https://pll.harvard.edu/`. Every URL in both maps was
curl-verified. `gao.gov` and `iso.org` return 403 to a command-line agent but are
live sites; they are deliberately kept.

### AC3 - applied decks flow as a lecture

`APPLIED_DECK_JSON_SHAPE` / `APPLIED_STRUCTURE_REQUIREMENTS` gained: an `Agenda:`
slide carrying a mandatory `process` graphic of the concepts (an advance
organizer, and a guaranteed first visual); `Section <n>:` dividers before each
concept's Principle slide; `Bridge:` slides between concepts naming the next one;
a `Recap: Where We Landed` closing section that must name the opening Case Study's
organization and say what the lecture's concepts would have changed about that
outcome (it was previously opened on slide 3 and never mentioned again); a
`Next Week:` slide; and an `Appendix: Post-Lecture Practice` divider that moves 8
homework slides out of the middle of the lecture to the end. A SLIDE BUDGET rule
(`8 + concepts * 9`, at most 2 in-lecture `Your Turn` pairs) ties deck length to
`conceptCountForMinutes` - the shipped decks ran 40-43 slides for a 50-minute
session regardless of the `minutes` input. An ASSERTION TITLES rule requires the
text after each load-bearing prefix to be a short complete sentence stating the
claim, not a topic label; the prefixes themselves are unchanged because
`enforceGraphicsForApplied` and the cycle contract key off them.

AMENDED (RCA round 2, RCA8): the formula quoted above (`8 + concepts * 9`) does
not match the structure this same paragraph describes - counted from the
contract's own rules at the documented 50-minute/5-concept default, it mandates
roughly 43 in-lecture slides, not ~53, and no concept spans 9 slides (the first
2 concepts are 8 each; the middle concepts 6 each; the last, with no Bridge, is
5). Slide COUNT was also the wrong metric to budget against in the first place:
a Section divider, Bridge, Agenda, or Recap slide costs 10-20 seconds of
talking, while an in-lecture `Your Turn` task performed in a real tool costs
several minutes of class time - removing 3 in-lecture tool exercises (this
same rule's own cap) saves far more class time than the 13 signpost slides
this entry added cost, so the lecture genuinely got MORE deliverable even
though its slide count went up. The rule now budgets against the stated
LECTURE DURATION directly, states the signpost-vs-Your-Turn cost distinction
explicitly, and gives "about `10 + concepts * 7` slides, most of them fast" as
the honest structural expectation, rather than a formula contradicted by the
rules two paragraphs above it. `slide-prompt.test.ts`'s pinned string was
updated to match.

AMENDED (RCA round 3): a confirming gate read the full ~20,000-character
assembled applied prompt sentence by sentence and found four more instances of
the same defect class this AC exists to fix - a rule presupposing a slide some
concepts do not have, or two rules mandating incompatible formats for the same
title.
- **RCA11**: ASSERTION TITLES (above) required `Section <n>:` and `Bridge:`
  titles to be "a short, complete, grammatically full sentence... never a topic
  label" - directly contradicting SECTION DIVIDERS and BRIDGES, which mandate
  exactly the label form (`"Section <n>: <concept>"`, `"Bridge: <this concept>
  to <next concept>"`) for those same two prefixes. So "the prefixes themselves
  are unchanged" two paragraphs above is no longer true of ASSERTION TITLES's
  own enumerated list specifically: `Section <n>:`/`Bridge:` were removed from
  it (the six content prefixes - `Principle:`/`In Practice:`/`Artifact:`/
  `Judgment Call:`/`Your Turn:`/`Model Response:` - keep the rule, since a
  divider and a hinge are navigation furniture, not a claim, and their actual
  claim already lives in their own two mandated bullets).
- **RCA12**: the `Next Week: <next week's topic>` / `Where This Goes Next`
  slide required data the prompt never supplied - no rule named next week's
  topic or said which week of how many this was, so the model had to fabricate
  it to satisfy the requirement. `generateSlidesFromTopic`
  (`course-planning-grounding.ts`) now builds `THIS IS WEEK <n> OF <total>` and
  either `NEXT WEEK: <topic> - <summary>` (naming the exact title the closing
  slide must use, verbatim) or an explicit "this is the FINAL week" statement,
  deterministically from `allWeeks`/`weekNumber` - the same schedule data
  `PRIOR WEEKS` already builds from.
- **RCA13**: the Agenda slide's mandatory graphic was always `process`, which
  cannot render below `PROCESS_MIN_STEPS` (3) - impossible at the documented
  2-concept floor (a 20-minute lecture, entry 99 AC3) - and silently truncated
  at the 7-concept ceiling. The requirement (not the caps - entry 110 AC4's
  pins are untouched) now asks for `process` at 3-6 concepts as before, and a
  `table` (headers `Section`/`What You Will Be Able To Do`) at 2 or 7 concepts
  - the only values `conceptCountForMinutes` can produce outside 3-6. At 7, the
  table's own 6-row cap still holds only 6 concepts, so the rule also requires
  the 7th to be named in the slide's bullets (which already list every concept
  per the rule's own first sentence), so no concept is ever silently dropped.
  `enforceGraphicsForApplied` needed no change - it already accepted any
  graphic kind on the Agenda slide, never just `process`.
- **RCA14**: `"10 + concepts * 7"` was ambiguous about whether it counted
  in-lecture slides or the whole deck - entry 100 AC7's own 85-slide-at-7-
  concepts figure counts the TOTAL including the Post-Lecture Practice
  appendix, so two artifacts from the same RCA round stated incompatible
  numbers for the same contract. SLIDE BUDGET now states explicitly that its
  figure counts IN-LECTURE slides only (title slide through Recap/Next Week),
  gives the appendix its own rough size (`"2 + concepts * 4"` more slides), and
  says plainly never to read either figure as a whole-deck cap. The outer
  prompt (`course-planning-grounding.ts`, shared by both course kinds) dropped
  its own contradictory "roughly 1-2 minutes per slide" heuristic, which SLIDE
  BUDGET's own text already repudiates ("SLIDE COUNT is not what determines
  that") - the per-kind Requirements text is now the single source of truth for
  deck length in both places that build this prompt.
- The regex-over-sentences guard that was supposed to catch defects like these
  (`slide-prompt.test.ts`) is itself replaced - see RCA15 in AC5 below.

**The coding contract is untouched.** `SLIDE_STRUCTURE_REQUIREMENTS` keeps its
byte-identical hash pin (9189 bytes, sha256
`c28bda15e46f7212f538cb6ec1a96de18041bba96a8ede58f3c59eec0d4e0454`), independently
recomputed from the live module during verification, and neither coding constant
mentions graphics at all.

### AC4 - cross-week continuity and no reused case study

`generateSlidesFromTopic` builds a deterministic `PRIOR WEEKS` block from the
schedule already in hand (week 1 gets none and must not invent prior work,
mirroring `renderMilestoneContract`'s week-1 branch), plus a
`CASE STUDIES ALREADY USED IN THIS COURSE` exclusion list accumulated as each
week's deck completes. Because `mapWithConcurrency` runs 4 weeks at a time the
list is monotone but not exhaustive - the first 4 weeks see an empty list - so
`detectReusedCaseStudies` (`src/lib/case-study-reuse.ts`) runs after the whole
schedule and reports any organization named on two different weeks' Case Study
slides in the step summary. Reports rather than blocks: a collision is worth an
instructor's attention, not a failed run.

Verified against the real 16-week course: the detector finds all four genuine
collisions and groups them correctly (weeks 1,2,3,6,9,10,13 Denver; 4,5,15 Sydney;
8,11 Big Dig; 7,14 London). A `COMMON_WORD_STOPLIST` prevents sentence-initial
common words being reported as organizations - before it, the instructor-facing
summary said `Case study "Lack" appears on more than one week's Case Study slide
(weeks 4, 9, 12)`, and 2 of 6 reported groups were noise.

### AC5 - graphics enforced at the data layer

`enforceGraphicsForApplied(slides, kind)` (`src/lib/slide-graphics.ts`) mirrors
`enforceNoCodeForApplied`'s shape and returns the slides plus a list of gaps: an
applied deck's `Artifact:`, `Judgment Call:` or `Agenda:` slide carrying no valid
graphic. `fillMissingGraphics` (`src/app/actions/slide-graphics-repair.ts` - kept
out of the pure module because it makes an LLM call) then makes ONE targeted call
carrying only the offending slides' titles and bullets, restating the
no-fabrication rule verbatim; every repair goes through `coerceSlideGraphic`, so a
malformed repair degrades to no graphic exactly as before. The deck is rechecked
afterwards and any surviving gap is counted into `graphicViolations`, logged, and
surfaced in the `lecture-materials-from-schedule` step summary - reported, never
silently passed. The applied contract also changes Judgment Call from SHOULD to
"EVERY Judgment Call slide MUST use a matrix2x2 or table"; 0 of 80 carried one.

Verified behaviourally against slide data reconstructed from the real shipped
week-1 deck: the guard flags exactly the 5 Artifact/Judgment Call slides that
shipped without a graphic, does not flag the one Artifact slide that carried a
table, does not flag slides with no graphic requirement, and returns no gaps at
all for a coding course.

### RCA15 (RCA round 3) - the consistency guard is now structural, not textual

`slide-prompt.test.ts` used to guard AC3's applied contract with a regex over
sentences (`assembled.split(/(?<=[.:])\s+/)`), checking that no sentence
demanded a conditional slide (`Your Turn:`/`Model Response:`) in unconditional
language with no scoping to the cap. Three separate gate passes each found a
NEW instance of the same defect class this guard exists to catch (RCA11-14
above), because the guard parses ENGLISH: the splitter fragments on every `:`,
`e.g.`, `vs.`, and numbered list item; it never covered `Bridge:` at all (added
in RCA15); and a whole-bullet-coarse check would still miss a mention sitting
in one clause while an unrelated scoping phrase sits in another clause of the
same bullet - exactly the shape of the historical BRIDGES defect ("its own
Model Response slide" stated unconditionally in a parenthetical, while
"EXCEPT THE LAST" - present in the same bullet - actually scopes the Bridge
insertion, not the Model Response mention).

The guard now parses STRUCTURE instead: `APPLIED_STRUCTURE_REQUIREMENTS`'s
top-level `- RULE NAME: ...` bullets are an authorial convention, not
natural-language punctuation, so the contract is split there. Two checks: (1)
every mention of a conditional slide (`APPLIED_CONDITIONAL_SLIDE_PREFIXES`,
`slide-prompt.ts` - `Your Turn:`, `Model Response:`, `Bridge:`) must have a
scoping phrase, from a closed allowlist copied verbatim from the contract's own
honest wording, in its OWN clause - the interior of its nearest enclosing
parentheses when it sits inside one, otherwise the `" - "`-delimited segment
containing it (this contract's own consistent convention for setting off a
sub-clause); (2) the reverse - any prefix given a fill-in-the-blank LABEL
mandate elsewhere (`titled "X: <placeholder>"`) must not also appear in
ASSERTION TITLES's full-sentence-format prefix list, which is RCA11 caught
mechanically.

Sabotage-checked against all three historical defects (reconstructed from this
file's own prior comments, since git history for this feature predates this
round): old BRIDGES wording (an unconditional `Model Response` mention inside a
parenthetical, with `EXCEPT THE LAST` present only in the outer clause) fails;
old TOOL CONTINUITY wording (an unconditional `Your Turn` mention with no
scoping anywhere in the bullet) fails; and the current ASSERTION TITLES list
with `Section <n>:`/`Bridge:` reinstated fails the reverse check. Two
non-vacuity pins (`assertionTitlesPrefixes`/`labelMandatedPrefixes` each
extract the expected real prefix lists from the live contract) guard against
the extractor regexes silently matching nothing and the guard passing for the
wrong reason.

HONEST LIMIT, stated in the test file itself: this verifies scoping-phrase
presence (in the mention's own clause) and title-format agreement. It cannot
verify the prose is semantically consistent overall - a green run here is
evidence, not proof.

### RCA16 (RCA round 3) - two comment inaccuracies in resource-links.ts

1. The header comment above `FIELD_RESOURCE_MAP` claimed the coding half and
   AC2's `CURATED_DOCS_MAP` (`src/lib/live-class/links.ts`) "cannot silently
   diverge unnoticed" - but nothing detected divergence and no test imported
   `CURATED_DOCS_MAP`. `resource-links.test.ts`'s new "coding-tagged entries
   stay in sync with CURATED_DOCS_MAP" describe block imports it directly and
   asserts every coding-tagged entry's url matches the corresponding
   `CURATED_DOCS_MAP` entry (skipping `freecodecamp`/`microsoft learn`, which
   have no counterpart there by design) - a genuine drift guard, making the
   comment true.
2. `resource-links.ts:216` said "The four general/open-courseware entries"
   while `:309` said "the three untagged general entries (MIT OCW, OpenStax,
   Saylor)" - omitting Harvard Online, an off-by-one repeated verbatim in
   `resource-links.test.ts`. There are four untagged entries (`MIT_OCW`,
   `OPENSTAX`, `HARVARD_ONLINE`, `SAYLOR`); all three call sites now say four
   and name all four.

## 157. Course guides, instructor contact, and content-grounded weekly announcements

A course kickoff produced per-week materials and nothing course-wide: no resource
list, no at-a-glance schedule, no FAQ, no way for a student to find the
instructor's email, and no weekly announcements. Added as two steps that all three
course workflows inherit.

**AC1 - one insertion, three workflows.** `COURSE_KICKOFF` and `NO_CODE_KICKOFF`
both consume `COURSE_REFRESH` via `include-workflow`, so both new steps were added
ONCE to `COURSE_REFRESH` (`generate-course-guides` at source index 7,
`generate-weekly-announcements` at source index 13) and all three workflows get
them. The includes' `skipSteps` (`[0,1]` and `[0,1,3]`) are all below 7 and were
untouched.

AMENDED (entry 164): removing `COURSE_REFRESH`'s standalone
`generate-class-openers` step shifted both insertions left by one -
`generate-course-guides` is now source index **6** and
`generate-weekly-announcements` source index **12**. The `skipSteps` arrays are
unchanged and still below both.

**AC2 - the index shift is the hazard, and it bit.** Inserting two steps shifts
every later step, and `bindOverrides` keys are index-based. The original analysis
claimed only `courseKind` overrides needed renumbering; that was WRONG -
`starter-materials`/`generate-syllabus`/`castletop-workbook` overrides also shift
(13/14/15 -> 15/16/17). Missing this would have silently leaked `includeGithub`,
`regenerate` and the six castletop inputs back onto both kickoff run forms. Both
kickoffs now carry `"7.courseKind"` plus the corrected 15/16/17 keys.
(AMENDED, entry 164: that key is now `"6.courseKind"` - one step earlier for
the same left-shift reason. The 15/16/17 keys are unaffected.)

**AC3 - four course-wide documents**, each a .docx in the zip's `Course-Wide`
folder and an LMS page in a `Course Information` module:
- **Resources and Tutorials** - the committed toolset with curated tutorial links,
  field resources by course kind, and a Getting Help section.
- **Course Schedule** - week-by-week topics with **no dates or deadlines of any
  kind** (explicit requirement). Rendered from the schedule already in hand, never
  an LLM call. Verified by unzipping the generated .docx and asserting no year,
  month, `Due` or `Deadline` token appears; the only "due" in the document is the
  line telling students to see the syllabus for due dates. Missing weeks render as
  "To be announced" so the numbering stays continuous.
- **FAQ** - 8-12 grounded question/answer pairs; invents no policy (no grading
  weights, attendance rules or late penalties), pointing to the syllabus instead.
- **Instructor Contact** - the school email read from `Course.email`
  (`src/lib/supabase/courses.ts:94`), an optional `instructor` name input following
  `castletop-workbook`'s "Blank omits it" convention, and a note on emailing to set
  up a meeting including what to put in that email. A real `mailto:` on the page.

**AC4 - no contact page rather than an empty one.** When `tile.email` is blank the
Instructor Contact document is SKIPPED entirely and reported first in the step
summary. A student-facing contact page with a placeholder or an empty address is
worse than no page: it looks functional and leads nowhere.

**AC5 - `lms-wipe` no longer destroys the guides.** Placing the guides step before
`lms-wipe` meant the same run's wipe deleted the `Course Information` module it had
just created. `lms-wipe` now preserves that module by name.

**AC6 - announcements are grounded in real module content**, not the one-line
schedule topic - the stated reason the user wanted them generated last. Composed
per week from that week's actual generated objectives, deck, opener and assignment
via `gatherWeekMaterials`; a week with no grounding material is skipped rather than
written from the topic line. Each becomes a per-week supplement file plus an
optional scheduled LMS announcement.

**AC7 - posting defaults differ deliberately.** The guides' pages default ON; the
weekly announcements default OFF. Posting 16 announcements to a live course is
outward-facing and term-wide, so it is opt-in. An announcement is never posted with
a past release date.

**AC8 - code owns every URL**, as entry 156 established: no model-authored links in
any of the four documents or the announcements; `stripModelUrls` runs over every
LLM body; the only link in the contact document is a `mailto:` built from
`tile.email`.

**AC9 - `supplement`'s doc comment corrected.** `GeneratedCourseFile`'s comment
claimed supplements never carry `pageText` and that `lms-populate`'s role switch
excludes them. The first is now false by design (these steps publish their own
pages), and the second was never implemented - `lms-populate` has no `supplement`
exclusion, so one reaching it would be clamped into Module 01
(`steps.lms-modules.ts:168`). The comment now states both accurately.

**AC10.** Headless-safe step set grew by 2; the exact-size canary moved 140 -> 142
in the same change. Full suite 267 files / 5480 tests green.

## 158. The no-code pipeline builds in dependency order

Requested: "the no code kickoff should define the course project as soon as the
course schedule has been generated, and then build the assignments and openers to
cater to the project, and then build the lectures to cater to the assignments and
openers, and then build everything else."

**AC1 - this fixed a real defect, not only an ordering preference.**
`NO_CODE_KICKOFF` ran `lecture-materials-from-schedule` (which generates every
week's assignment) at index 2 and `define-course-project` at index 3. On a course
with no project yet - exactly the first run of a kickoff, which is what
`autoDefine` exists for - every assignment was therefore generated with NO project
and NO milestone, and the course-long-project contract only began applying on a
later run. A real MGT 422 run masked this because that course already had a
project ("Course already has a project ... left alone"). The two steps are now
swapped: project at index 2, lecture materials at index 3.

**AC2 - the opener is generated before the deck, and the deck sees it.**
`buildScheduleWeekPlan` previously ran intro + deck + objectives in one
`Promise.all`, all grounded in the assignment, and openers were a SEPARATE step
inherited from `COURSE_REFRESH` that ran afterwards. For the no-code path the
per-week sequence is now three phases: assignment instructions, then
intro/objectives/opener in parallel, then the deck alone - grounded in both the
assignment and the opener text. `generateSlidesFromTopic` gained an
`openerContext` parameter and a prompt block telling the model not to re-teach
the opener's case study or warm-up.

**AC3 - one opener generator, two call sites.** The standalone
`generate-class-openers` step's inline logic was extracted to `generateWeekOpener`
(`src/app/actions/research.ts`) - case-study lookup, the LLM call, URL stripping
and the tools section - so the step and the in-plan phase call the SAME function
rather than maintaining two opener prompts.

**AC4 - no duplicate openers.** With the opener produced inside
`lecture-materials-from-schedule`, `COURSE_REFRESH`'s own `generate-class-openers`
(source index 4) is now in `NO_CODE_KICKOFF`'s `skipSteps` (`[0,1,3]` ->
`[0,1,3,4]`). Without this the run would produce two competing opener documents
per week and both would reach the zip. The `"4.files"` remap is still required and
present - later steps bind that output even though the step itself is skipped -
while the now-dead `"4.exerciseKind"`/`"4.groundInAssignment"` overrides were
removed, with a comment recording why.

AMENDED (entry 164): the standalone source step itself is now gone from
`COURSE_REFRESH`, not merely skipped by the no-code include. Its skip list is
therefore back to `[0,1,3]`, and the dead `"4.files"` remap is gone. Both kickoff
expansions still contain exactly one opener per generated week, now produced by
their respective in-plan lecture path.

**AC5 - the coding path is behaviourally untouched.** `sequenceOpenerBeforeDeck`
defaults to `false`, so every pre-existing caller keeps the original single
`Promise.all` byte-for-byte. `COURSE_KICKOFF` and `COURSE_REFRESH` keep their step
lists; only two stale comments changed. The coding-contract hash pins are
unchanged (`SLIDE_STRUCTURE_REQUIREMENTS` 9189 / `c28bda15...`,
`SLIDE_DECK_JSON_SHAPE` 1000 / `5b2909b6...`).

AMENDED (entries 163 and 164): the coding path is no longer intended to stay
untouched. Entry 163 deliberately upgraded the coding slide contract and its
hash pins; entry 164 deliberately ports opener-before-deck sequencing to the
repo-driven coding path and removes the separate opener step. The default-off
function parameters still preserve historical behavior for callers that do not
opt in.

**AC6 - cost of the extra hop, recorded deliberately.** Moving the deck out of the
parallel group adds ONE sequential LLM round trip per week, since the deck cannot
start until the opener returns. Phase 2 stays parallel so only one hop is added,
not two.

**AC7 - a pre-existing test was reading the old index.** Two tests in
`presets.test.ts` asserted `wf!.steps[2]` was `lecture-materials-from-schedule`;
after the swap they read `steps[3]`. Found by the index-shift diligence this
document now requires for any preset reorder, not by the suite going red on its
own.

Full suite 270 files / 5531 tests green.

**AC8 - the reorder also shifts a SECOND index space, which no test covers.**
Disabled-step overlays are persisted per user in `localStorage` as raw top-level
step indices with no type guard (`src/lib/workflows/types.ts:913-941`). A user who
had disabled no-code step 2 (formerly `lecture-materials-from-schedule`) is now
silently disabling `define-course-project`, and vice versa for step 3. Saved
preset overrides are safe - `preset-overrides.ts:141` guards on `expectedType` and
DROPS a mismatch rather than misapplying it - but the disabled-step overlay has no
such guard. Recorded here because the index-shift hazard this document keeps
catching in preset bindings exists in this second, persisted index space too, and
any future preset reorder must consider it. Not fixed in this entry; a type guard
on the overlay is the fix.

**AC9 - corrections to this entry, from its own gate pass.** The suite count above
was 5531 at the time of writing and is 5547 with concurrent work included; three
comment sites changed in the untouched presets, not two. The `"3.files"` remap is
now dead config (its only consumer was the skipped opener step) - harmless, since
`expandWithTopIndices` never looks it up, and still correct if the step were
un-skipped. The no-code opener's FILE NAME also changed, from
`Week N Opener - <topic>.docx` to `<Course> - Class Opener - Week N.docx`, matching
the other `assembleLectureFiles` artifacts; the role, week number, `pageText` and
sort order are identical, so every downstream consumer (the announcements'
`gatherWeekMaterials`, the cartridge, the zip bucketing) is unaffected.

## 159. Link punctuation, resource relevance, quota fail-fast, and the log in the zip

Four fixes found by auditing a real generated zip plus its run log.

**AC1 - the docx auto-linker swallowed trailing punctuation, and entry 156 AC1's
promise was not actually kept.** Three of six hyperlink targets in a freshly
generated zip ended in a period (`https://academy.asana.com/.`,
`https://help.miro.com/.`, `https://support.google.com/docs/.`; the Miro one 403s).
`INLINE_LINK_RE`'s bare-URL branch (`src/lib/docx-blocks.ts`) ran to the next
whitespace, so it captured the sentence period after a URL. `sanitizeResourceUrl`
had cleaned the map VALUES; the renderer re-introduced the defect when auto-linking
inside prose.

Entry 156 AC1 claimed `sanitizeResourceUrl` "kills the 14 punctuation-baked
hrefs". It does not, on its own: it cleans the map VALUES, and the renderer put
the punctuation back. The feature-level criterion behind it ("no URL in any
generated document ends in `.` `,` `;` or `)`") was tested on
`sanitizeResourceUrl` in isolation and was false end to end. The branch now stops before trailing `.,;:!?` and an unbalanced `)`; the
markdown-link branch is untouched, since an explicit `[text](url)` target is
authored rather than sniffed.

**The test is the point.** A unit test on the regex is what let this ship. There
is now an END-TO-END test that renders a real `.docx`, unzips it, and asserts
`word/_rels/document.xml.rels` carries no target ending in punctuation - verified
independently against the exact failing strings, including `(https://openstax.org/)`
(paren excluded), a trailing comma and a trailing semicolon.

**AC1.1 - one instance remains, deliberately not claimed as fixed.**
`LecturePlanPreviewModal.tsx`'s `renderInline` carries the same greedy pattern.
It affects the IN-APP deck preview only, never a generated document, and is
queued rather than silently left - stated here so this entry does not repeat
entry 156 AC1's overstatement. `urls.ts`'s `BARE_URL_RE` is greedy by design: it
REMOVES model-authored URLs, where over-matching is safe.

**AC2 - curated field resources matched organization names, not subjects.** A
project-management assignment rarely contains the literal string "PMI", so nothing
matched and every assignment fell through to MIT OpenCourseWare / OpenStax /
Saylor - three generic open-courseware roots, on an assignment about critical-path
scheduling. `ResourceLink` gained `subjectKeywords` (PMI and APM now carry
"project management", "risk", "procurement", "stakeholder"), so resolution matches
on subject OR organization. Every entry also regained a one-sentence
`whyItHelps`, restoring the "title, URL, why it helps" shape that was lost when
code took the section over from the prompt. URLs stay root-only and curated.

**AC3 - a spend-cap 429 no longer burns the rest of the step.** A real run
(2f4aea3c) produced 1 of 16 weekly announcements: weeks 2-16 each returned
HTTP 429 "Your project has exceeded its monthly spending cap." The grounding logic
was never at fault - the step attempted all 16 and degraded per week, exactly as
designed - but it spent 2m 44s on 15 doomed calls after the first refusal.
`isNonTransientQuotaRefusal` now distinguishes a hard spend-cap 429 from a
transient rate limit; the loop stops after the former and reports "Stopped after
week N - M week(s) not attempted", while a transient 429 still backs off and
retries.

**AC4 - a run can no longer report success while most of a step's work failed.**
That same run's header said `Status: ok` and `Error count: 0` with 15 of 16
announcements failed, and the step said `DONE`. Graceful degradation (entry 157)
is correct and is preserved - a failing step must not cascade into the terminal
zip - but it must not render a substantially failed step invisible. A step now
carries a partial-failure detail through the existing untyped outputs bag;
`server-runner` reads it into the outcome's error field while `status` stays
`"done"`, and the log renders `DONE (PARTIAL)` per step and folds it into the
run-level status and error count.

**AC5 - the run log ships inside the terminal zip** as `Course-Wide/Run Log.txt`,
added last in the zip build, reusing `buildRunLogText` so redaction is inherited
rather than re-implemented. It is a SNAPSHOT: `save-zip-to-course` is not the final
step (it was step 19 of 22 in run 2f4aea3c), so the file's header names the run id,
the snapshot time, and the steps that had not yet run - a log that silently omitted
three steps would read as complete. A new action resolves those remaining step
types from the run's own workflow definition and returns a discriminated result, so
"genuinely the last step" is never confused with "could not determine". The log can
never fail the zip: the zip is the deliverable.

Full suite 270 files / 5596 tests green.

**AC6 - scope limits and loose ends, recorded so this entry is not read wider than
it is.**
- **AC4 is wired into the UNATTENDED runner only.** `useWorkflowRun.ts` does not
  read the partial-failure key, so an attended run's log still shows a bare `DONE`.
  The claim in AC4 ("server-runner reads it") is accurate; the coverage is
  asymmetric. Attended parity is a follow-up.
- **AC2's "root-only" applies to what this entry changed.** `FIELD_RESOURCE_MAP`
  still holds pre-existing non-root coding entries (the MDN JavaScript path,
  `git-scm.com/doc`, `sqlite.org/docs.html`) that this group did not touch. They
  are stable documentation landing pages, not deep article links, but they are not
  bare roots.
- **`Course-Wide/Run Log.txt` bypasses the `uniquePath` helper** that entry 155 AC3
  added specifically because "a silent JSZip overwrite would quietly drop a file".
  No generated artifact currently uses that name, so this is theoretical - but it
  is an exception to a rule that exists for a reason.
- **A stale comment now contradicts the snapshot behavior.**
  `steps.course-setup.storage.ts` still says the zip step is "the LAST step of
  Course Refresh (and both kickoffs)", which the snapshot comment 60 lines above it
  disproves and which entry 155's own renumbering already made false.
- **`isNonTransientQuotaRefusal` does not recognise OpenAI's `insufficient_quota`
  wording.** Behavior there is unchanged from before this entry, so nothing
  regressed; the fast-fail is simply incomplete for a provider this app does not
  currently use as its primary.

## 160. One case study per week, verified, and never silently placeholder

An audit of a generated 16-week course found the four artifacts of a single week
teaching DIFFERENT case studies. The class opener runs first in a session; the
lecture follows. Week 5's opener discussed the Mars Climate Orbiter while the deck
opened on Healthcare.gov; week 7 opener Big Dig, deck Mars; week 13 opener
Deepwater Horizon, deck CityTime. Only weeks 1 and 9 agreed. The deck's own
"Recap: Where We Landed" then closed the loop on a case the class never discussed,
and the weekly announcement followed the opener, advertising a third combination.

**AC1 - the root cause was an instruction, and it is reversed.** Entry 158 told the
deck "do not re-teach the opener's case study or re-run its warm-up". The model
obeyed literally and changed the subject. `buildOpenerContinuityBlock`
(`src/lib/case-study-prompt.ts`) now says the opener already introduced this
week's case, so build on it, do not re-narrate it, and do not substitute a
different one.

**AC2 - the case is chosen ONCE per week, up front, before any artifact.**
`planCourseCaseStudies` (`src/app/actions/case-study-plan.ts`) runs before
`mapWithConcurrency` and hands each week its anchor case plus every other week's
assignment. The previous exclusion list was populated as weeks completed while four
weeks generated at once, so the first four always saw an empty list - which is why
four organizations covered nine of fifteen weeks and Healthcare.gov opened three.
Deterministic and race-free by construction, not by timing.

**AC3 - facts come from a curated library, not model recall.**
`src/lib/case-study-library.ts` holds conservatively-dated entries (Denver 1994-95,
not the 2002 and 2011 the audit found asserted in the SAME course; FBI Virtual Case
File cancelled 2005 versus Sentinel 2012; Berlin Brandenburg planned 2011, opened
2020). Matching is whole-word. Only weeks the library cannot cover reach an LLM, in
ONE call, explicitly forbidden from asserting an unconfirmed year.

**AC4 - a year in a slide title is forbidden.** The applied contract now bars a
specific year from a Case Study or In Practice title, because a year is the detail
a student most easily checks and the one that most damages credibility.
`detectCaseStudyDateConflicts` (`case-study-reuse.ts`) reports the same case dated
differently across weeks - a contradiction detectable without knowing the truth.

**AC5 - a failed deck is no longer shipped as a lecture.** Week 10 of the audited
run contained ONE slide; the log said "slides fell back to a placeholder template",
the step reported DONE, and the placeholder was uploaded to Canvas as a normal
lecture. Root cause: the retry loop only retried a JSON-PARSE failure, never an LLM
TRANSPORT failure. Both `course-planning-grounding.ts` and `shared.ts` now retry
transport failures; a deck that still fails is marked `needsRegeneration`, titled
REGENERATE THIS WEEK, named NEEDS REGENERATION, skipped by `lms-populate` and
`blackboard-export`, and surfaced at run level through the partial-failure signal.

**AC6 - bridges anchor positionally.** Naming two possible anchor slides
("its Model Response slide for the concepts that have one, otherwise its Judgment
Call slide") produced 43 of 60 expected bridges - the model looked for the first
anchor and gave up. The rule now says "immediately after the LAST slide of each
concept's cycle, whatever slide that happens to be".

**AC7 - the coding contract is untouched.** Both pins byte-identical
(`SLIDE_STRUCTURE_REQUIREMENTS` 9189 / `c28bda15...`, `SLIDE_DECK_JSON_SHAPE`
1000 / `5b2909b6...`); only the applied variant changed.

## 161. The attended run hook is split, and a latent grading bug is fixed

**AC1 - the file-size ratchet applied.** `useWorkflowRun.ts` reached 1029 lines
(already 1006 before this work). It is now 890, with `validateRunForm` (80),
`useRunInputPrompt` (112) and `run-input-table-stats` (160) extracted, all under
the cap. Hook call ORDER is preserved - the extracted hook is called in the same
relative position the original state declarations occupied - because this file has
no test harness and drives the attended run path, so the split had to be
behaviour-preserving rather than a redesign.

**AC2 - 37 tests where there were none.** The extracted pure functions are unit
tested; the hook itself remains untested because this repo has no React-hooks
harness, which is stated plainly rather than implied.

**AC3 - three dead `useMemo` calls removed.** They computed a visible-row filter,
grade stats and a grade distribution on every render, assigned to nothing and
absent from the hook's return, while `RunInputPrompt.tsx` recomputed the same
statistics from props. Testing dead code enshrines it, so the component now uses
the extracted functions and the duplicates are gone.

**AC4 - a latent grading bug, found by refusing to assume the two implementations
agreed.** `computeGradeDistribution` did not exclude invalid grades: a grade of
150/100 bucketed as a green "success" segment, -5 as "danger", and a non-numeric
grade produced a NaN comparison that also landed in "danger". The live inline
version correctly excluded all three. It had never shipped only because the code
path was dead - and it was about to be wired into the live component. The
invalid-grade rule was stated in three places; it is now one exported `gradeIssue`
predicate that the distribution, the stats and the live band function all delegate
to, so it cannot diverge again.

Full suite 281 files / 5777 tests green.

## 162. Real rubrics, weekly knowledge checks, and a tiered free toolset

Three improvements toward a Coursera / Google Career Certificate bar, from an audit
of a generated 16-week course.

**AC1 - the grading rubric was gibberish on every assignment.** All 16 assignments
carried criteria built by extracting arbitrary WORDS from the assignment text and
phrasing them as code requirements. Verbatim from week 5 of a NO-CODE project
management course:

```
Defines Analysis (25%): Define Analysis in your code.
Defines to (25%): Define to in your code.
Mentions Critical (25%): Address "critical" in your submission.
```

`Defines to` graded the word "to". Across the set: `Mentions Them`, `Mentions But`,
`Mentions Learn`, `Mentions Four`. `Mentions Google` appeared in 9 of 16 - students
graded on whether they typed "Google". And "in your code" / "the submitted code"
appeared 10 times in a course whose premise is that it involves no code.

Root cause: `shared.ts` called `generateEmbeddedRubricText` unconditionally, which
is the OFFLINE CODING grader's builder. Its `extractCodeSymbolChecks` matches
ordinary English words like "method", "class" and "function" as if they were code
symbols, so "critical path METHOD" produced a criterion.

**AC2 - the fix is course-kind aware and cannot touch the coding path.**
`generateEmbeddedRubricText`/`buildRubricFromInstructions` take
`kind: CourseKind = "coding"`. The default preserves the old behaviour exactly, so
the four other call sites - including the real grading engine - hit the unchanged
branch and are provably unaffected. Verified by generating a coding rubric before
and after and confirming it is byte-identical.

**AC3 - an applied criterion describes the DELIVERABLE.**
`extractDeliverableQualityChecks` parses the assignment's own `## Requirements` and
`## Deliverables` sections, which are already well-formed, and turns each bullet
into a criterion. Weights are `importanceWeights`/`weightedPercentages` -
strictly decreasing and summing to exactly 100 (30/25/20/15/10 for five) rather
than a flat `100/n`.

**AC4 - two mechanical guards, because prompt rules keep failing here.**
`assertNoCodeLanguage` throws if an applied rubric contains "code", "in your code"
or "the submitted code" - modelled on `enforceNoCodeForApplied`, which exists for
the same reason. `isDegenerateCriterion` rejects a criterion whose subject is a
stopword or bare common word ("to", "each", "them", "but", "four", "where").

**AC5 - weekly knowledge checks, the largest remaining pedagogical gap.** A week
contained objectives, an opener, a 45-slide deck, an assignment and an announcement,
and NO way for a student to check understanding between reading and being graded.
`generate-knowledge-checks` produces 5-8 Apply/Analyze multiple-choice questions per
week, grounded in that week's REAL generated materials via the same
`gatherWeekMaterials` the announcements use - a week with no grounding material is
skipped with a reported reason rather than given generic questions.

**AC6 - every distractor names a misconception.** A wrong answer carries a
one-sentence explanation of why it is wrong; that explanation is what makes the
check teaching rather than testing. `isUsableKnowledgeCheckQuestion` structurally
validates every question (exactly 4 distinct choices, exactly 1 correct, a real
explanation on every wrong choice) and questions are RE-validated after
`stripModelUrls` runs, so a hollowed question is dropped rather than shipped.

**AC7 - it reuses the existing quiz creator.** `createGradableAction` /
`createQuizQuestionAction` / `bulkUpdateAction` are the same actions
`starter-materials` uses; no second quiz path was written. Posting to the LMS
defaults OFF.

**AC8 - the toolset is tiered, without undoing the churn fix.** A shipped course
used Google Sheets in 14 of 16 weeks and never opened a scheduling tool, built a
dashboard or ran a survey - one tool means one artifact shape, which is also why the
assessments were monotonous. `COMMITTED_TOOLSET_RULE` now distinguishes a CORE set
(2-3 tools, holds the student's persistent project data, never changes) from
SPECIALIST tools introduced for the one week whose work needs them, where the
deliverable is produced IN the tool and exported. The test the model applies is
stated explicitly: using a Gantt tool once and exporting a PNG is not churn;
re-entering your task list somewhere new is. Entries 137, 141 and 142's protection
is untouched - the per-artifact intersection in `renderToolsYouWillUseSection` was
not modified.

**AC9 - three tools added, one deliberately refused.** GanttProject
(`help.ganttproject.biz`) closes a real gap - no genuinely free desktop scheduler
was reachable, and MS Project, the only scheduler previously named, has no free
tier. draw.io and Google Forms added. Google Looker Studio was CONSIDERED AND
REJECTED: its help centre announces its own migration and removal, which fails this
map's anti-rot bar. The rejection is recorded in a comment so it is not
"fixed" later.

**AC10 - a pre-existing bug found in passing.** The course-wide Resources and
Tutorials document called `renderToolsYouWillUseSection` with empty body text, and
the intersection logic guarantees that renders NOTHING - so that section would have
shipped empty. A separate `renderCourseToolPlanSection` now serves the course-wide
document, deliberately leaving the per-artifact function untouched.

**AC11 - the file-size ratchet was applied.** Four files crossed 1000 lines and
were split behaviour-preservingly: `resource-links.ts` (1051 -> 519, maps into
`resource-links/tool-tutorials.ts` and `resource-links/field-resources.ts` with
their ROOT-ONLY reasoning carried across, not left behind), `embedded-grader/
rubric.ts` (1027 -> 863, applied path into `rubric-applied.ts`),
`resource-links.test.ts` (1004 -> 697) and `shared.ts` (1003 -> 893). Test count
unchanged at 5872 across the splits - no assertion was weakened or lost.

Full suite 284 files / 5872 tests green.

## 163. Case studies, concept-first openers, and the professional-materials lift reach the CODING path too

Two requests: "be sure that case studies and opening activities make their way
into the coding course kickoff and refresh workflows as well ... don't have
them write code, just have them get used to working with the concepts", and
"port whatever lessons learned from the no code workflows that you can over to
the code kickoffs/refreshes workflows as well." Before this, a coding course
received: no up-front case-study plan (each deck picked its own, with the same
reuse/wrong-date risk applied had before entry 160), an opener that asked
students to WRITE code before the lecture ever taught the concept, no
opener-before-deck sequencing, and the exact pre-professional-materials
lecture contract (no Agenda, no Section dividers, no Bridges, no Recap, no
Next Week, no Appendix, no Failure Modes, no Terminology, no assertion
titles, a slide-count-only budget) applied's own audit (entry 100 onward) had
already fixed for the no-code path.

**AC1 (Z1) - one verified case study per week, for coding too.**
`planCourseCaseStudies` (`case-study-plan.ts`) is now course-kind aware: a
new `courseKind` parameter (defaults `"applied"`, so every pre-existing
caller/test is unaffected) matches `"coding"` against `CASE_STUDIES`
(`src/lib/research/case-studies.ts`) instead of `APPLIED_CASE_STUDIES`. Both
libraries now share one scoring/exclusion mechanism, `matchBestByTopics`
(new file `src/lib/case-study-match.ts`) - same whole-word matching, same
per-run exclusion set, same "earlier entries win ties" rule, so the two
matchers cannot quietly drift apart. `matchCodingCaseStudyEntry`
(`research/case-studies.ts`) is the coding-side wrapper. A matched
`CASE_STUDIES` entry states its real year directly (`period: String(entry.year)`)
rather than hedging like `APPLIED_CASE_STUDIES` - its entries are established
facts per that module's own header comment, not the same V2 risk.

Two call paths, verified separately rather than assumed identical (this AC's
own instruction): the SCHEDULE-driven path
(`generateLectureMaterialsFromScheduleAction`, `course-planning.ts`) now
calls `planCourseCaseStudies` for BOTH course kinds, unconditionally, before
its `mapWithConcurrency` loop - previously applied-only. The REPO-ZIP path
(`generateLecturePlansAction`/`generateLecturePlanForAssignmentAction`,
`lecture-plans.ts`) is a DIFFERENT function (`buildAssignmentPlan`,
`shared.ts`) that a linked-repository "Course Kickoff"/"Course Refresh" run
actually takes - it had NO case-study plan of any kind before this. Both now
compute a whole-zip plan up front (keyed by the SAME normalized week number
`assignWeekNumbers` produces, computed once and reused rather than derived
twice) and thread the assignment into `generateSlidesForAssignment`'s prompt
via `buildCaseStudyAnchorBlock` - the SAME prompt builder the schedule-driven
path already used, generalized (see AC3 below) rather than duplicated. The
single-assignment regenerate path matches only that one week (no
cross-assignment exclusion list is available there - the same accepted
degraded state this codebase already documents for other single-week
callers).

`detectCaseStudyDateConflicts`/`detectReusedCaseStudies` (`steps.content-
lectures.ts`) already ran unconditionally over every plan regardless of
course kind - VERIFIED, not re-implemented; they already covered coding.

Coverage note (deliberately not padded): `CASE_STUDIES` has 20 entries; some
are incident-flavoured rather than concept-flavoured, so a 16-week coding
course will not match every week from the curated library alone - the
remainder falls through to the one-LLM-call pass (which forbids an
unconfirmed year, same as the applied path). A separate, already-planned
library expansion is explicitly out of scope for this change.

**AC2 (Z2) - the coding opener stops asking students to WRITE code.** The
line: reading code is fine (often ideal); writing, completing, or
debugging-by-editing it is out, because the opener runs BEFORE the lecture
teaches the concept. `generateClassOpenerAction`/`generateWeekOpener`
(`research.ts`) no longer ask for a "warm-up coding exercise" - the heading is
now `"Warm-up exercise"` for both course kinds (unified). The LLM prompt
states a six-form menu (trace and predict; order the steps; spot the flaw by
reading; compare two approaches; complete a trace table; map the analogy),
data-owned in a new file `src/lib/opener-warmup.ts`
(`CODING_WARMUP_FORMS`/`describeCodingWarmupMenu`), and explicitly forbids
write/complete/debug-by-editing language while allowing code to be shown for
reading. The embedded (no-LLM) provider's own coding branch was rewritten the
same way: it traces a REAL, already-vetted practice-bank example when one is
available (never invented), or falls back to the analogy form when none is.

**Enforced mechanically, not just in the prompt** (this AC's own explicit
instruction, mirroring `enforceNoCodeForApplied`'s precedent - a prompt rule
alone has already been shown not to be enough here, twice, per entry 137):
`enforceReadOnlyWarmup` (`opener-warmup.ts`) locates the generated warm-up
section and, if it contains write/implement/complete/debug-by-editing
language (`findWriteCodeViolation`), replaces JUST that section with a
guaranteed-safe fallback (`buildFallbackWarmup` - the analogy form, which by
construction cannot contain a code-writing instruction) rather than failing
the whole opener - the same "targeted repair over whole-document failure"
philosophy `enforceNoCodeForApplied` already established. Applies only to a
coding opener; an applied opener never involves code and is never touched by
this guard (verified with a sabotage-shaped test: applied text that WOULD
trip the guard if it ran unconditionally is left untouched).

The opener also now names the lecture's actual CONCEPT PLAN, not just the
topic line (Z2-AC5), for the coding opener specifically (Z3-AC3 says do not
disturb the applied path, and Z2's whole scope is the coding opener) -
`planWeekConcepts` (`lecture-concepts.ts`) is hoisted out of the deck
generator and computed once, alongside the intro/objectives calls, shared by
both the opener and the deck rather than derived twice.

**AC3 (Z3) - the coding deck builds on the opener, in the mechanism that
already exists.** `sequenceOpenerBeforeDeck` - the EXISTING flag
`buildScheduleWeekPlan` already had, previously gated to `courseKind ===
"applied"` - is now on for coding too, at both its call sites in
`steps.content-lectures.ts`: the `"lecture-materials-from-schedule"` step
(now always `true`, both kinds) and the repoless fallback of the
`"lecture-zip"` step (now passes `true` where it previously omitted the
argument). `buildOpenerContinuityBlock`/`buildCaseStudyAnchorBlock` were
ALREADY composed unconditionally by `generateSlidesFromTopic` regardless of
course kind - this wiring needed no change inside
`course-planning-grounding.ts` itself, only the caller-side gate flip.

**Scope, stated plainly:** the REPO-DRIVEN "Course Kickoff"/"Course Refresh"
path (a linked-repository run - the common case, since `repo-from-template`
always creates one) generates its deck via `buildAssignmentPlan`, and its
opener via the SEPARATE `generate-class-openers` step, run AFTER the deck by
the shipped presets - not through `sequenceOpenerBeforeDeck` at all. Bridging
that gap (generating the opener inside the deck step, sequenced before it,
and retiring the standalone step for this path) is architecturally the same
size as this repo's own "T2" no-code-pipeline-reorder project, and would
require re-deriving week numbers earlier plus reindexing the `bindOverrides`/
`remap` keys across BOTH `COURSE_KICKOFF` and `COURSE_REFRESH` (dozens of
position-keyed references documented throughout `course-setup.ts`) - out of
scope for this change and NOT attempted. AC1's case-study wiring (above)
DOES reach this repo-driven path; AC2's opener-content fix also reaches it
(the standalone step calls the same `generateWeekOpener`); only the
opener-BEFORE-deck SEQUENCING is still schedule-driven-path only. Recorded
here rather than silently left unstated.

AMENDED (entry 164): that stated scope gap is now closed. Repo-driven
`lecture-zip` opts into the same assignment -> concept plan -> opener -> deck
sequence, the deck receives the opener text and shared concept list, and
`COURSE_REFRESH` no longer runs a later standalone opener.

**AC4 (Z4) - the coding contract reaches parity with the applied lecture-flow
work.** `SLIDE_STRUCTURE_REQUIREMENTS`/`SLIDE_DECK_JSON_SHAPE`
(`slide-prompt.ts`) now carry the SAME flow slides `APPLIED_STRUCTURE_
REQUIREMENTS` earned: an Agenda slide (third, after Case Study), Section
dividers before each concept's own introduction slide, Bridges positioned
AFTER the last slide of each concept's cycle (learned from the applied path's
own V5 fix: never name a specific anchor slide, since exactly that produced
43 of 60 missing bridges), a TIME-based SLIDE BUDGET
(`"9 + concepts * 7"` in-lecture, `"2 + concepts * 4"` appendix, explicitly
scoped as in-lecture-only), assertion titles on each concept's own
introduction slide (never on `Example:`/`Walkthrough:`/`Practice:`/
`Answer:`, which keep their fixed prefixes, nor on the navigation-format
Section/Bridge/Agenda/Recap/Next-Week titles - learned from the applied
path's own RCA11 fix), a Recap slide naming the opening Case Study's
organization by name, a Next Week / Where This Goes Next slide (degrading to
omission absent week data), Failure Modes and Terminology as new deck-level
closing sections, and an Appendix divider moving Post-Lecture Practice to the
very end. An optional (never required, never `matrix2x2`) `process`/`table`
graphic is now allowed on any coding slide - `enforceGraphicsForApplied` is
explicitly NOT extended to coding (a required graphic with no natural slot
is exactly the padding entry 110 AC2 refused a chart kind to avoid); the
Agenda slide's graphic, unlike applied's mandatory one, is optional by
design, so the count-dependent process/table branching applied needed does
not apply here at all.

**The hash pins were updated DELIBERATELY, in this same commit, never left
stale or silently relaxed** (this AC's own explicit instruction):
`SLIDE_STRUCTURE_REQUIREMENTS` is now 16750 chars, sha256
`689b9b512e87d029817af36f2e053c0db88ef0577d110d6fe11d11522b6b795c`;
`SLIDE_DECK_JSON_SHAPE` is now 1871 chars, sha256
`b29552311f3fbd714b00b76c80593f9f962f74c0e7b93ec93033204e64ff5476`.
AMENDED (entry 185): the `SLIDE_STRUCTURE_REQUIREMENTS` half of that pin is
superseded - it is now 17835 chars, sha256
`10ab8834bf4ec0b1bfb7e04a223f4030660a44027743c13224fb47021d6d6172`, moved by
two additive edits on the CODING contract (a concrete deletion test on the FLOW
rule, and a ban on stock connector phrases in the notes handoff rule). Verified
here by hashing the live constant rather than copying the test's literal.
`SLIDE_DECK_JSON_SHAPE` is UNCHANGED at 1871 / `b295523...`. Entries
100 AC2, 110 AC7, and 137 AC7 - the three regression entries that asserted
the OLD pins and, in entry 110's case, explicitly recorded "the request was
specifically about non-code classes" as the reason the coding contract was
left alone - each carry an AMENDED note pointing here: that reasoning no
longer holds, since porting the no-code lessons to coding is now exactly the
request. `slide-token-budget.ts`'s worst-case coding-slide-count comment was
recomputed to match (88 slides at `N=7` concepts, ~31,800 tokens, up from the
old ~26,000 estimate) - still comfortably under the shared 49152-token cap,
with the applied worst case (~35,400 tokens) remaining the binding
constraint.

**AC5 (Z4) - verified rather than re-implemented.** `WORKED_EXAMPLE_
CONTRACT`, the assignment prompt's "Expected Scope and Effort"/"Before You
Submit" sections, `stripModelUrls`, and the run-level infrastructure (the
run log in the zip, `PARTIAL_FAILURE_OUTPUT_KEY`, post-run zip completion)
were ALL ALREADY course-kind-agnostic before this change - composed/invoked
unconditionally by the shared generators (`shared.ts`, `research.ts`) or the
workflow-run layer (`run-logging.ts`, `server-runner.ts`), with no
`courseKind` branch anywhere in that code. They already reached coding on
both the schedule-driven and repo-driven paths. The tools-block intersection
(`renderToolsYouWillUseSection`) is present in the same shared code but
renders nothing for coding by DESIGN, not gap - a committed toolset
(`moduleTools`) is an applied-only concept. The placeholder-deck guard
(`needsRegeneration`, V3) is likewise course-kind-agnostic in
`assembleLectureFiles` (keyed on `plan.slidesFailed`, set identically by
`buildAssignmentPlan` and `buildScheduleWeekPlan`) - verified, not
re-implemented.

**AC6 (Z4) - the applied path is unaffected.** Every pre-existing applied
assertion in `slide-prompt.test.ts`/`slide-prompt.structural-guard.test.ts`
still passes unchanged; this is a parity PORT (the coding contract gained
its own version of these rules), not a merge of the two contracts into one -
`APPLIED_STRUCTURE_REQUIREMENTS` was not touched, the two cycles
(`Example`/`Walkthrough`/`Practice`/`Answer` vs. `Principle`/`In Practice`/
`Artifact`/`Judgment Call`/`Your Turn`/`Model Response`) remain genuinely
different shapes, and entry 100's own reasoning for why an applied course
must never be handed the coding cycle holds unchanged in that direction.

**A latent defect found and fixed in passing:** `buildCaseStudyAnchorBlock`
(`case-study-prompt.ts`) told every deck "every 'In Practice' slide elsewhere
... must use a DIFFERENT organization" - a phrase that presupposes an
applied-only slide type. It was already composed unconditionally for coding
decks too (with `assignedCaseStudy` always `undefined` there, so silently
inert) - this AC1's wiring is what newly ACTIVATES it for coding, so the
stale phrasing was generalized ("every OTHER real-world example ... an 'In
Practice' slide, a case cited on a Failure Modes or Modern Tech slide, or any
other named organization/event") rather than shipped confusing a model
generating a coding deck.

Full suite 288 files / 5941 tests green (up from 284/5872); `npx tsc --noEmit`
and `npm run lint` both clean.

## 164. The repo-driven opener runs BEFORE its deck, and the standalone opener step retires

Entry 163 gave the coding path case studies, a concept-first opener, and deck
parity, but left one asymmetry standing: the no-code path generated its opener
INSIDE `lecture-materials-from-schedule`, sequenced before that module's deck,
while the repo-driven path still generated its opener in a SEPARATE
`generate-class-openers` step that ran AFTER `lecture-zip` had already built
every deck. So a coding deck could never build on its own opener - the opener
did not exist yet - and the two paths disagreed about what "the opener" was
for. This entry ports the sequencing to the repo path and then removes the now
redundant standalone step from `COURSE_REFRESH` entirely.

**AC1 - the repo-driven opener generates in-plan, before the deck.**
`buildAssignmentPlan` (`src/app/actions/shared.ts`) gains a trailing
`sequenceOpenerBeforeDeck` parameter, `false` by default so single-assignment
regeneration and every unrelated caller keep the historical repo behavior
byte-for-byte: no concept planning, no opener attempt, and both `openerText`
and `openerFailed` absent. When ON, the function splits its single
`Promise.all` into three phases mirroring `buildScheduleWeekPlan`'s own
sequencing: (1) instructions + intro + `planWeekConcepts` in parallel, (2) the
opener, grounded in the REAL generated instructions (falling back to the repo
source, never a fake grounding, when instructions failed), (3) deck +
objectives in parallel, with the deck handed both the shared concept plan and
the opener text. `generateLecturePlansAction` (`lecture-plans.ts`) threads the
same default-off flag through.

**AC2 - the deck continues the opener instead of repeating it.**
`generateSlidesForAssignment` gains `sharedConceptPlan` and `openerContext`
parameters (empty by default, preserving the historical prompt exactly). When
set, the deck prompt composes `buildConceptCycleInstruction` and
`buildOpenerContinuityBlock` - the same two helpers the no-code path already
used - so one concept plan and one case study serve both artifacts. The
embedded scaffold path (`scaffoldLessonPlan`) receives the same three values,
so the no-model path continues the opener too rather than silently ignoring it.

**AC3 - one opener per week, from one place.** `COURSE_REFRESH` no longer
contains a standalone `generate-class-openers` step. Both kickoffs now emit
their opener from their own in-plan lecture step, and `assembleLectureFiles`
ships it as a role `"opener"` docx with the SAME role and file shape the
standalone step produced, so the zip's contents are unchanged in kind. The
`generate-class-openers` step TYPE remains registered and fully functional -
it is still usable as a standalone action; it is only no longer wired into
either kickoff. Removing that source step shifts every later index left by
one, which is why `COURSE_KICKOFF`'s and `NO_CODE_KICKOFF`'s `bindOverrides`
and `skipSteps` are renumbered throughout; `presets.test.ts`,
`presets.kickoff.test.ts` and `presets.course-kickoff-no-code.test.ts` assert
the new indices, and the no-code include's skip list is back to `[0,1,3]` with
the dead `"4.files"` remap gone.

**AC4 - the read-only warm-up guard no longer eats the opener's own context.**
(CORRECTED after this entry's regression pass - the first version of this AC,
and the fix it described, were both wrong. The original text is kept below the
correction because the reasoning error is worth recording.)

The fix that shipped is STRUCTURAL, not another screen. `Concepts to preview:`
and `Assignment connection:` now live in their own `## Before the warm-up`
section, emitted BEFORE the `## Warm-up exercise` heading - outside the range
`enforceReadOnlyWarmup` scans, so the guard cannot delete them no matter what
fires it. When neither line applies, no heading is emitted at all.

Why the first attempt was wrong: it screened only the practice-bank block and
claimed "the guard never has to fire on this path". But the assignment title
(lifted verbatim from the assignment's first H1-H3 by `assignmentFocus`) and
the concept names are two MORE unscreened values interpolated into the same
section. An assignment titled "Write a Function to Reverse a String" - an
entirely ordinary coding assignment title - still fired the guard and still
deleted both lines. Screening inputs one at a time can never be complete, which
is the general lesson: do not put durable content inside a region some guard is
entitled to replace wholesale. The structural fix also recovered two things the
guard had been silently destroying: the fallback warm-up is now built from
`concepts[0]` rather than the bare topic, and the "Then explain ... changes the
reasoning" continuation survives.

A second correction, to how this is TESTED: asserting `findWriteCodeViolation`
over the WHOLE opener is the wrong contract and produces false failures. When
the instructor's assignment is genuinely titled with write-code language, the
opener correctly NAMES that assignment, so the phrase legitimately appears in
the document. Only the warm-up SECTION must be clean. `opener.test.ts` extracts
the section using `enforceReadOnlyWarmup`'s own boundary logic and asserts over
that, with a comment warning the next reader not to "tighten" it back.

**AC4 (original, superseded) - screening the bank entry.**
The embedded opener composes a curated practice-bank entry into the warm-up as
READING material, but the bank's titles are authored for a "solve this"
context ("Write a function that converts..."), which tripped
`enforceReadOnlyWarmup`. That guard's repair is to replace the whole warm-up
SECTION body - so it also deleted the `Concepts to preview:` and
`Assignment connection:` lines the same section deliberately carries, silently
undoing AC1's and entry 163's Z2-AC5 grounding. The bank entry is now screened
with `findWriteCodeViolation` BEFORE it is composed in, and the whole entry is
dropped in favour of `buildFallbackWarmup` when it violates, so the guard never
has to fire on this path and the context lines survive. The guard call remains
as a backstop, and the debrief branch is gated on the SAME screened value as
the warm-up, so the debrief can no longer discuss a trace the warm-up never
showed. One related fix: the fallback's own trailing sentence said "Do not
write code", which matched the guard's own write-code pattern and made the
scaffold repair itself in a loop; it now says the same thing in prose that does
not match.

**AC5 - file-size ratchet.** Wiring AC4 pushed `research.ts` to 1004 lines. The
deterministic embedded opener - pure text assembly, no model call, no I/O, no
Date, no randomness - moved out to `src/lib/embedded/opener.ts`
(`buildEmbeddedOpener`), joining its siblings `deck.ts`/`scaffold.ts` in the
directory that already holds exactly this kind of builder. `research.ts` ends
at 886 lines and the new module at 197. `shared.ts` was split the same way
earlier in this entry's work: `assignment-content.ts` (zip parsing, 130 lines)
and `writing-style-block.ts` (style sample, 33 lines) are now their own
modules, re-exported from `shared.ts` so no caller changed. That split is what
kept `shared.ts` under the ratchet while AC1's three-phase sequencing was added
to it: 907 lines at `c80231d`, 863 now.

**AC6 - behavior held constant where it was not meant to change.** The
default-off parameters are covered directly:
`build-assignment-plan.opener-sequence.test.ts` asserts the historical parallel
phase still runs first when the flag is omitted, that an opener FAILURE degrades
to `openerFailed` without blocking the deck or leaking the error string into any
downstream prompt, and that instruction/intro failures still fall back to
source-grounded scaffolds with the rest of the sequence intact.
`build-assignment-plan.embedded-opener.test.ts` covers the embedded path end to
end, and `src/lib/embedded/opener.test.ts` covers the extracted builder
directly - including that a rejected bank entry keeps both context lines, that
the warm-up and debrief stay in agreement, that an applied course never receives
a coding bank entry that reached it, and that the builder is deterministic.

**AC7 - a no-code course still never gets a programming warm-up.** Found by
this entry's own regression pass, as a consequence of AC3. Removing
`COURSE_REFRESH`'s standalone opener step removed the only step that exposed
`exerciseKind`, and the in-plan opener that replaced it was coding-only: the
repoless `lecture-zip` branch passed `undefined` for `courseKind`, which
defaults to `"coding"`. A standalone Course Refresh against a no-code course -
a reachable, supported scenario, since that workflow still surfaces
`courseKind` as a runtime field for its other steps - therefore produced a
coding warm-up and fetched coding practice problems, violating entry 80 AC7.
`lecture-zip` now declares its own `courseKind` input (consulted on the
repoless branch only; the repo branch is coding by construction and ignores
it), `COURSE_REFRESH` binds it to the same runtime field its sibling steps
already use, and `COURSE_KICKOFF` pins it to `"coding"` so no dead question
appears on its form. `NO_CODE_KICKOFF` skips `lecture-zip` entirely and needed
no change. The chain is proven across three test files: `registry.lecture-zip`
asserts the argument reaches the action, `schedule-week-plan.opener-phase`
asserts it becomes `exerciseKind`, and `research.test.ts` asserts an applied
`exerciseKind` never reaches `findPracticeProblemsAction`.

**Two claims in this entry were overstated and are corrected here.**
- AC1 said default-off callers keep the historical behavior "byte-for-byte".
  They do not: intro/instructions failure handling moved OUTSIDE the
  `sequenceOpenerBeforeDeck` branch, so every caller - including
  `generateLecturePlanForAssignmentAction`'s single-assignment regeneration -
  now gets source-grounded scaffolds and `introFailed`/`instructionsFailed`
  flags where it previously got `""`. This is an improvement (it extends entry
  81 AC4 to the repo path) but it is a behavior CHANGE, not a preservation, and
  it was not what the AC claimed.
- AC3 said the zip's contents are "unchanged in kind". The opener's role
  (`opener`), `sortOrder`, `weekNumber` and `pageText` are indeed identical,
  but the FILE NAME changes: the standalone step produced
  `Week N Opener - <topic>.docx`, `assembleLectureFiles` produces
  `<Course> - Class Opener - <label>.docx`. Entry 158 AC9 recorded this same
  rename for the no-code path; it applies to the repo path too.

Entry 77's AC2/AC3 step-order pins ("lecture-zip, THEN openers / assignment /
test") name a step that no longer exists. The BEHAVIORAL properties they pin -
all generators before all posters, an unbroken files chain, posters reading the
last generator - were re-verified against the current expansion and still hold.

Full suite 293 files / 5990 tests green (up from 291/5960 before this entry's
extraction, tests, and regression fixes); `npx tsc --noEmit`, `npx eslint`, and
the `next build` compile phase all clean.

## 165. A "use server" module may export nothing but async functions

Found while gating entry 164, NOT introduced by it: `npx next build` was
failing on `main`. All seven erroring files were byte-identical to `c80231d`,
and `git log -S` places the trigger inside `c80231d` itself - so the previous
push shipped a production build that does not compile. Vercel deploys `main`
automatically, so this was live.

**The rule.** A module carrying the `"use server"` directive may export NOTHING
but async functions. Turbopack rejects everything else with "Only async
functions are allowed to be exported in a 'use server' file". Illegal forms:
`export const/let/var`, `export class`, a synchronous `export function`,
`export { x } from "./y"`, and `export * from "./y"`. A re-export is illegal by
FORM, not by what it names - the compiler cannot see through it to prove the
binding is async, so even re-exporting a genuinely async function fails. Legal:
`export async function`, `export default async function`, and type-only exports
(`export type ...`, `export interface ...`), which are erased before the rule
applies.

**Why it reached main.** Both `npx tsc --noEmit` and `npx vitest run` pass
straight through this - it is neither a type error nor a runtime error. A gate
of "tests + typecheck + lint" cannot see it. Only `next build` can, and only
its COMPILE phase (the prerender tail then fails for an unrelated, expected
reason: no Supabase env vars locally).

**AC1 - the two violations are fixed at the source, not papered over.**
`course-planning-grounding.ts` no longer re-exports `selectRequiredTools`/
`selectCourseTools` from `./course-tools-selection`; `@/app/actions` keeps
exposing both by barrelling `./actions/course-tools-selection` directly, which
is a plain module and can legally `export *`, so the public surface is
unchanged. `knowledge-check.ts`'s two count constants and its pure
`isUsableKnowledgeCheckQuestion` predicate moved verbatim into the new plain
module `src/lib/knowledge-check-shape.ts`; the action module imports them back
and re-exports ONLY the two types (legal, and it keeps
`import type { KnowledgeCheckQuestion } from "@/app/actions"` working for
existing callers). Neither fix deletes a needed directive, and neither wraps a
synchronous function in a pointless `async` shim to sneak it past the rule.

**AC2 - the predicate is still genuinely exercised.**
`steps.knowledge-checks.ts` now imports `isUsableKnowledgeCheckQuestion` from
the shape module, so `steps.knowledge-checks.test.ts`'s
`vi.mock("@/app/actions", ...)` factory no longer supplies it at all. The
predicate is therefore unmocked rather than stubbed, and the two tests that
depend on re-validation after `stripModelUrls` ("drops a question when
stripModelUrls hollows out its explanation", "keeps a week's other questions
when only one is hollowed out") still run the real thing. This was checked, not
assumed - a mock factory silently supplying a stale property is exactly how a
test starts passing for the wrong reason.

**AC3 - the guard, which is the actual deliverable.**
`src/lib/use-server-exports.test.ts` walks every non-test `.ts`/`.tsx` under
`src/`, selects the modules whose first non-blank, non-comment line is the
directive (handling leading line and block comments), and fails naming the
file, line number and line text of any illegal export. Two properties make it
trustworthy rather than decorative:
- Its two detectors are PURE functions over file text, and a canary suite
  drives them with in-memory fixtures - proving they flag a known-bad fixture
  and stay silent on a clean one covering every legal form. This repo has
  already shipped one scanner that matched nothing and reported "clean" (the
  emoji scan built on a broken `grep -P`), so a detector that cannot be shown
  to fire is not accepted.
- It asserts more than 30 `"use server"` modules were found, so it can never
  pass by scanning zero files.

**Sabotage-checked twice, with two different illegal forms.** Appending
`export const FOO = 1;` to a `"use server"` module failed the guard; so did
re-appending the exact `export { selectRequiredTools } from ...` re-export that
broke `main`, reported at `course-planning-grounding.ts:886`. Both reverts were
confirmed byte-clean by `git diff`.

**AC4 - the gate itself changes.** `npx next build` joins the pre-push gate.
Its COMPILE phase must be clean; its prerender/data-collection tail is expected
to fail locally with "@supabase/ssr: Your project's URL and API key are
required" and that failure alone is not a blocker.

Full suite 293 files / 5984 tests green; `npx tsc --noEmit`, `npx eslint`, and
the `next build` compile phase all clean.

## 166. Course selectors keep their NAME across a refresh, never falling back to an id

User report: "course tile and canvas course selectors on workflows go back to
their id after a page refresh." Both selectors persisted only the selected
item's id/url and never its display LABEL, so on reload there was nothing to
resolve the id to a name until the options list finished loading - and nothing
at all if that load failed.

**AC1 - the raw id is never shown as a label.** `resolveSelectorLabel`
(`src/lib/course-selector-labels.ts`, pure - no I/O, no Date, no randomness)
resolves in a fixed priority order: the loaded options list, then the persisted
cache, then a neutral placeholder. The id is not a candidate at any tier. A
test asserts specifically that the fallback is NOT the raw id, because
"falls back to something" would otherwise pass while reproducing the bug.

**AC2 - the loaded list always wins over the cache.** The cache is a display
convenience, never a source of truth: a course renamed upstream must show its
new name the moment the list loads. Pinned by a freshness test.

**AC3 - a stale label can never corrupt the submitted value.** The id/url
remains what the form submits regardless of what the cache says.
`resolveSelectorLabel`'s return type deliberately carries no id, so a caller
cannot accidentally submit a label.

**AC4 - one shared cache, not a per-workflow one.** `ta-course-selector-labels`
holds a single id-to-name object with keys namespaced `hubCourse:<id>` /
`lmsCourse:<id>`. A course's name is a property of the COURSE, not of the
workflow that happens to reference it, so a name learned anywhere benefits
every field referencing that id. It is a sibling key, leaving the existing
`ta-workflow-values-<id>` record's shape untouched - changing that shape would
have invalidated every already-saved run form. Follows the project's `ta-`
localStorage convention.

**AC5 - the deeper defect this exposed.** `CoursePicker`'s existing
"keep a saved pill's label fresh" effect only ever reacted to its `courseName`
PROP. Every other call site passes that prop (`ContentTab`,
`announcements-panel`, `FileRow`, `BulkSelectionBar`, `PublishToCanvasPage`) -
but `RuntimeFieldInput` and `TriggerEditForm`, the two workflow surfaces where
the bug was reported, do NOT. So a "Save course" pill created from a workflow
run form was permanently stuck on the literal `Course <id>` fallback, not
merely until a load finished. The effect now also treats the loaded course list
as a name source, and `readSavedCourses` detects and repairs the literal
`Course <id>` strings already sitting in existing users' localStorage.

Sabotage-checked: swapping the cache above the options list fails the freshness
test; making the fallback return the id fails two tests naming that exact
requirement; making the cache write a no-op fails six, including the
submitted-value-independence test. 18 unit tests on the pure module.

## 167. Knowledge pages hold attachments in the UI, and KnowledgeTab is split apart

Wave 2 of entry 150. That entry built the data layer
(`institution_page_attachments`, its storage bucket, the server actions and the
pure helpers) and shipped no UI. This is the UI, plus the file split that made
room for it.

**AC1 - an attachment is referenced from the page body by a text token, not by
HTML.** `buildAttachmentEmbedReference` (`src/app/components/knowledge/
attachment-embed.ts`, pure - no I/O, no React) emits
`[label](attachment://<id>)`. The page body stays plain markdown text, so an
attachment reference survives every existing edit/save/search path untouched.
`sanitizeEmbedLabel` strips `[` and `]` from the file name (either would corrupt
the `[label](href)` syntax) and falls back to the literal "Attachment" when
nothing is left.

**AC2 - a reference is recognized only on a line of its own.**
`splitBodyIntoSegments` splits the body into markdown runs and embed segments,
matching `/^[ \t]*\[([^\]]+)\]\(attachment:\/\/([^)\s]+)\)[ \t]*$/` per line. A
reference typed INLINE mid-sentence is deliberately left alone and degrades to
an ordinary markdown link. Whitespace-only markdown runs are dropped, so a body
that is nothing but an embed produces exactly one segment. CRLF is normalized
first.

**AC3 - a missing attachment is distinguishable from a not-yet-loaded one.**
`useKbAttachments` resets its list to `null` (not `[]`) when the selected page
changes; `PageBody`'s embed block renders "Loading attachment..." while the list
is `null` and only says the attachment "is no longer available" once a real list
has come back. Collapsing those two states would make every embed flash a
false "removed" message on each page change. NOTE the seam: a failed LIST call
also sets the list to `[]`, so a transient load error is reported to the reader
as a permanent removal.

**AC4 - insertion into the draft body is boundary-safe.**
`insertEmbedReferenceIntoBody` clamps the selection into range and handles a
REVERSED selection (end before start) - an unclamped `slice` pair would
duplicate the overlapping characters. It pads with `""`/`"\n"`/`"\n\n"` per side
depending on what the neighbouring text already ends or starts with, so the
reference is always blank-line-isolated without doubling existing separators,
and returns the cursor position after the inserted block.

**AC5 - the caps are enforced client-side using the SERVER's own message
functions.** `AttachmentsPanel` disables the attach control at
`MAX_ATTACHMENTS_PER_PAGE`, refuses an oversize file per file, and takes both
refusal texts from `attachmentCountCapMessage`/`attachmentSizeCapMessage` in
`src/lib/institution-page-attachments.ts` - the same functions the server action
throws with, so the two can never word the same refusal differently. The client
compares raw `File.size` and the server compares the decoded base64 length, which
is the same quantity.

**AC6 - the split is pre-emptive, not cap-forced, and is behaviour-preserving.**
`KnowledgeTab.tsx` went from 893 to 582 lines - it was never over the project's
1000-line cap; adding the attachments UI inline would have taken it past.
(Several of the new files' own comments say they were "split out during the
1000-line-cap refactor"; that is wrong and should not be repeated in an AC.)
Five hooks were extracted - `useKbPageTree`, `useKbEditSession`,
`useKbTreeActions`, `useKbInstitutionPicker`, `useKbAttachments` - plus two
components (`AttachmentsPanel`, `PageBody`) and the pure `attachment-embed`
module. `KnowledgeTab` keeps only genuinely cross-cutting state
(`pendingAction`, `actionError`, `search`) and the three compositions that span
hooks. Hook call ORDER and effect dependency stability were preserved (the one
added dependency, `closeEditSession`, is a `useCallback(..., [])`).

**AC7 - the view-mode body is now several DOM nodes, not one.** `PageBody`
renders one child `div` per markdown run plus an embed node per reference,
inside the same `.kbBody` wrapper. This is safe ONLY because every `.kbBody`
rule in `page.module.css` is a descendant selector - no `>` child combinators,
no `:first-child`/`:last-child`. A future `.kbBody > p` rule would silently
break every knowledge page's styling.

**Limits and known gaps.** This repo cannot test React at all: `vitest.config.ts`
is `environment: "node"` and `include: ["src/**/*.test.ts"]`, so a `.test.tsx`
would not even be collected, and there is no renderer or DOM in
`package.json`. Nothing renders `AttachmentsPanel`, `PageBody`, or any of the
five hooks; pure extraction is the only safety net, and an argument transposed
at a hook's call site is invisible to every test in the repo. Only
`attachment-embed.ts` and the two helpers appended to `knowledge-helpers.ts`
(`isDraftDirty`, `parseTagsInput`) are covered. Two specific untested behaviours
are worth knowing: `splitBodyIntoSegments` has NO fenced-code-block awareness,
so an `attachment://` line inside a ``` fence is torn out as a live embed and
leaves two unclosed fence halves; and `attachmentId` is interpolated into the
reference without validation, so an id containing `)` or whitespace would
produce a token the module's own recognizer rejects (unreachable today - ids are
server-generated uuids - but unguarded).

**Stray scope, recorded so it is not looked for here later.**
`extractSyllabusTextAction` (`src/app/actions/syllabus-upload.ts`) shipped in
this commit with zero callers and zero tests; it belongs to entry 169's
syllabus-document source, which is where its first caller and its tests arrived.

## 168. Multi-select fields get a real control in both the run form and the builder

A `StepInputSpec` could already declare `options` plus `multi`, but nothing
rendered it: an instructor typed newline-separated option keys into a textarea.

**AC1 - the stored format is newline-joined, and one module owns it.**
`src/lib/multi-select-value.ts` exports `parseMultiSelectValue` (split on `\n`,
trim each line, drop blanks, de-duplicate keeping first occurrence),
`serializeMultiSelectValue` (defined AS `parse(values.join("\n")).join("\n")`,
so writing applies exactly the same normalization as reading), and
`usesMultiSelect` (`options` non-empty AND `multi` - either alone is false).
The run form (`RuntimeFieldInput.tsx`) and the builder's literal editor
(`LiteralEditor.tsx`) import the SAME three functions; the previous private
split/join inside the builder's `OptionsSelect` was deleted, and that component
is no longer exported. This matters because the two surfaces write values that
must round-trip through each other.

**AC2 - the multi-select check runs BEFORE any type branch.** Both controls test
`usesMultiSelect(field)` ahead of the `longtext`/`text`/etc. switch, which is
why `course-build`'s own `outputs` field renders as a compact chip picker
despite being declared `longtext`. Anything keying off "is this field tall"
(entry 176's grouping) must consult `usesMultiSelect` first for the same reason.

**AC3 - a stored value naming an option that no longer exists is preserved, not
silently dropped.** The module never sees the option list, so it round-trips
byte-identically; both controls are `freeSolo` and render the unknown entry as a
selected chip. The seam this creates is deliberate but must be understood: the
CONSUMER decides. `parseOutputSelection` (`output-selection.ts`) throws on a
line outside `OUTPUT_FAMILIES`, so a stale `outputs` value looks fine in the form
and fails loudly at run time rather than silently generating the wrong set.

**Limits.** This repo has no React test harness (`vitest.config.ts` is
`environment: "node"`, `include: ["src/**/*.test.ts"]`, and there is no
`.test.tsx` anywhere), so neither control is rendered by any test. What IS
tested is the pure module (blank, whitespace-only, order, per-line trim,
dedupe, stale entry, round-trip idempotence, and all four `usesMultiSelect`
truth-table cases) and, via fixtures, that the REAL production `StepInputSpec`s
still route the way the controls expect. Two of the builder-side test files
duplicate assertions the pure suite already makes, and one
(`InputBindingRow.options-select.test.ts`) re-implements the component's routing
condition inside the test and then asserts its own expression - a change to the
component's ternary would not fail it. Treat those as documentation, not
coverage. Untested: an entry containing an embedded newline, which
`serializeMultiSelectValue` silently splits into two selections.

## 169. One combined Course Build workflow, from any input, with per-deliverable images

`COURSE_BUILD` replaces the four-way kickoff/refresh split with one workflow:
the instructor picks the INPUT; the OUTPUT is the same Common Cartridge and zip
the no-code kickoff produces. It lives in its own file
(`src/lib/workflows/presets/course-build.ts`) because adding it pushed
`presets/course-setup.ts` past the 1000-line cap; `COURSE_KICKOFF`,
`NO_CODE_KICKOFF` and `COURSE_REFRESH` did not move.

**AC1 - the source switch is INSIDE one step, never preset topology.**
`course-schedule-from-source` (`steps.course-schedule-from-source.ts`) always
runs and always produces (or fails trying to produce) a schedule. Gating three
front-end steps on "which source" would have been fatal: `server-runner.ts`
cascades a skipped step's skip transitively to everything bound to its output,
so the branches that did NOT run would have taken the shared tail - including
the terminal cartridge and zip - down with them. There is no "first available"
binding form to route around that. The durable check: this preset contains no
`runIf` on any schedule-producing step.

**AC2 - it emits the same three outputs `schedule-from-repo` does, plus two
more.** `schedule`/`courseTitle`/`weeks` keep every downstream binding from
`NO_CODE_KICKOFF` unchanged. The additions are `resolvedSourceMaterial` (the
web-search-derived table of contents when the chosen branch's
`generateSchedulePlanAction` call produced one, otherwise the shared Source
material field unchanged) and `courseKind`. Before `resolvedSourceMaterial`
existed the preset bound the RAW runtime field downstream, so an instructor who
pasted a bare URL got a schedule grounded in a derived TOC and lecture materials
grounded only in the bare citation.

**AC3 - `courseKind` is resolved once, where the source is known.** Only
`codebase` (and later `tile-repo`) implies a programming course; every other
source resolves to `"applied"`. It is exposed as an output and consumed by step
4, step 5 and six `bindOverrides` (`4`/`5`/`6`/`13`/`14`/`15`.`courseKind`)
rather than duplicating a source-to-kind mapping per consumer. It goes through
`resolveCourseKind`, so it can never emit a value a consumer's own
`resolveCourseKind` would not recognize. A non-codebase source is byte-identical
to `NO_CODE_KICKOFF`'s hard-coded `"applied"`.

**AC4 - three families, not seven implementations.** `codebase` and `tile-repo`
share one `scheduleFromRepo` closure; `course-description` and
`syllabus-document` both delegate to `generateSchedulePlanAction` (a syllabus's
extracted text IS a course description that came from a file); `course-cartridge`,
`existing-lms-course` and `tile-export` all reduce to "an ordered list of
{title, items}" and share ONE normalizer (`src/lib/course-structure-schedule.ts`).
The tile-export branch reuses `helpers.loadCourseExport`, which already runs the
same `parseCartridgeBlob` the cartridge branch calls by hand.

**AC5 - no branch reports success on an empty schedule.** `finalize` throws when
`schedule.length === 0`, and each branch throws its own named error for a
missing per-source input. `courseTitle` falls back to the hub tile's name, then
the literal `"Course"`.

**AC6 - module selection narrows exactly ONE binding.**
`select-course-modules` (step 2) validates the "modules" spec (blank, a number,
a list, a range, or any mix) against the schedule that was actually produced and
narrows it. Only `lecture-materials-from-schedule` (step 5) reads that narrowed
output; `define-course-project` and every course-refresh step reached through
the include's `"1.schedule"`/`"1.weeks"` remap still read step 1's FULL
schedule, because the syllabus, the workload workbook, the course guides, the
grading rubric and the LMS module count all describe the whole course.
`lms-assignments` is deliberately in that group too - narrowing it would
overwrite non-selected weeks' Canvas assignments with boilerplate. A selection
naming a module absent from the schedule THROWS, naming every missing module
and the schedule's real range - never a silent empty success. Blank returns the
schedule unchanged.

**AC7 - output selection is NOT implemented by gating steps off.**
`select-course-outputs` (step 3) parses the multi-select into one boolean per
family, and each boolean is consumed as an ordinary INPUT by the generator it
matches. A deselected generator does no work and passes its `files` through
UNCHANGED, so it never leaves the accumulator chain and the terminal cartridge
and zip always still run - they are not even listed among the selector's
options. Gating with `runIf` instead would have silently produced no zip the
moment one family was deselected. Blank means ALL
(`isGeneratorSelected(undefined) === true`, and a blank spec sets every flag to
`"1"`), so an existing saved run form keeps generating everything.
"Module introductions" have no toggle: they ride as the deck's opening-slide
speaker notes, so `selectedDecks` covers them.

**AC8 - every deliverable gets its OWN image, not one photo per week.**
`fetch-deliverable-images` fetches an Unsplash photo per generated deliverable
file, keyed to that file's own text (`pageText` when it has any, otherwise a
title derived from its file name), with a companion credits file naming the
photographer as Unsplash's terms require, and fires the download-tracking
endpoint per photo used. Course-wide (`weekNumber === 0`) files are excluded -
they have no week topic to key an image to.

**AC9 - a course build never fails over images.** No `UNSPLASH_ACCESS_KEY`, a
rate limit, a network error, or a malformed response all degrade to "no image
for this deliverable" with one note in the run report, never a throw. Empty
results and a malformed response are distinct, independently testable failure
REASONS that happen to degrade the same way. A defensive
`MAX_UNSPLASH_REQUESTS_PER_RUN = 200` ceiling exists (exported, so the test sizes
its fixture off the real constant) because per-deliverable fetching multiplies
the old per-week count by roughly the number of roles a week produces.

**AC10 - the instructor-facing result is the same ARTIFACT SET regardless of
source.** "Identical" means a cartridge and a zip with the same roles - never
that every source is forced through the same pedagogy. A codebase-sourced run
gets coding materials everywhere a codebase kickoff would.

**Limits.** Most of what an instructor judges here is model prose. The tests pin
the wiring (which binding reads which output), the parsers (module and output
selection are pure and exhaustively covered), the per-source delegation and
error messages, and the image step's degradation paths. They do not prove a
model produces a good schedule from any given source.

## 170. Generated course projects get plain names, not codenames

A generated ethical-hacking course named its term project "Project Aegis". The
prompt asked only for "a short, concrete project name", which left a model free
to invent operation-style codenames - and for a security course that reads like
a real named operation rather than coursework.

**AC1 - the instruction names the deliverable, not the project.** The
`name` requirement in `generateCourseProjectAction`'s prompt
(`src/app/actions/course-project.ts`) now says the name must plainly describe
what the student produces over the term, gives two worked examples, and
explicitly rules out codenames, "Project <word>" constructions, and
mythological/military/brand-like words (naming "Aegis", "Phoenix", "Sentinel"
as examples). The stated test is that a reader can tell what the deliverable IS
from the name alone.

**AC2 - this was the only model-named field.** Every other name-generating
prompt was checked: slide titles are constrained to fixed structural prefixes,
message titles are email subjects, and the assignment/test/session brief
generators have no model-named field at all. Re-check that claim before adding
one.

**Limit, stated plainly.** This is a PROMPT change. The tests can only pin that
the prompt text carries the constraint and the examples; nothing here can prove
a model complies, and there is no post-generation guard that rejects a codename.

## 171. The core toolset is chosen for the course's field, not assumed to be project admin

The same generated ethical-hacking course committed to Notion and Airtable as
the tools students use every week, with Lucidchart and draw.io as specialists -
no lab environment, no scanner, no packet analyzer. Week 3's network
reconnaissance assignment asked for "a link to your updated Airtable base".

**AC1 - the machinery was not the defect; the prompt was.** The same code path
correctly gave a project-management course Asana, Google Sheets and Miro. The
old prompt went straight to "choose 2-3 tools that hold the student's persistent
project data", illustrated only with a board-plus-spreadsheet example - a
framing that conflates "applied, no programming" with "project-administration
shaped".

**AC2 - the prompt reasons about the FIELD first.**
`src/app/actions/course-tools-selection.ts` now asks what a working practitioner
in the course's own subject actually uses, and only then narrows to what must
persist for the term. The project-management illustration is explicitly framed
as one field's example rather than the default, and the course's own description
and topics are carried into the prompt.

**AC3 - deliberately NOT a lookup table.** No tool names are hardcoded, so it
generalizes to statistics, design, network administration or anything else. The
free-access requirement is preserved and reinforced - a free domain tool should
beat a generic app.

**AC4 - the free-resource map gained subject coverage.** OWASP and CISA were
added and NIST gained subject keywords in
`src/lib/resource-links/field-resources.ts`, so a security course is no longer
offered only MIT OpenCourseWare and OpenStax. That half IS deterministic and
directly testable.

**Limit, stated plainly.** The toolset tests mock the model. They pin that the
prompt now carries the course's own description and topics and instructs
domain-first reasoning; they do not prove a model complies. Entry 162's AC8
tiering (CORE vs SPECIALIST) and the per-artifact intersection are untouched.

## 172. Course Build can build from the LMS export already on the course tile

The sixth source, "tile-export".

**AC1 - it asks for nothing new.** Like `tile-repo` after it (entry 181), it
reads the tile id off the SAME `hubCourse` binding the preset already had, so
adding it did not grow the run form by a field.

**AC2 - it reuses the loader, not the parser-by-hand.**
`helpers.loadCourseExport` (server half in `step-helpers-server.ts`, attended
half in `WorkflowsTab.tsx`'s `loadCourseExportData`) already finds the tile,
takes the NEWEST of its saved exports by `addedAt`, downloads the blob and runs
`parseCartridgeBlob`. The branch then applies the SAME
`CartridgeCourseData -> CourseStructureModule` mapping the cartridge branch
uses and hands off to the shared normalizer - never a fourth parallel
implementation.

**AC3 - three distinct failure messages, none of them silent.** No tile chosen,
`loadCourseExport` not wired for this run context, and a tile with no export on
file are separate errors; the last names the TILE (falling back to the raw tile
id when the name cannot be resolved) and says to upload one to its Files tab or
pick a different source. An export with no modules fails in `finalize`'s
zero-week check rather than reporting success.

**AC4 - it forwards the Source material field unchanged.** This source's
schedule comes entirely from the export's own module list; there is no
TOC-derivation call to fold in, so `resolvedSourceMaterial` passes through -
blanking it would silently strip a hand-pasted table of contents.

## 173. Assignments drop the duplicated rubric, and course projects get hands-on

Two changes from analysing three real generated courses.

**AC1 - the per-week assignment document no longer contains a rubric.**
`generateAssignmentInstructionsForAssignment` (`src/app/actions/shared.ts`) used
to append a `## Grading Rubric` section built by `generateEmbeddedRubricText`
onto EVERY week's student-facing assignment sheet, in the same tiered
percentage format the standalone Grading Rubric document already carries - all
16 weeks of a real course repeated it. That append is gone. The check is
structural: `shared.ts` no longer imports `generateEmbeddedRubricText` at all.

**AC2 - the assignment's own expectations survive.** "Expected Scope and Effort"
and "Before You Submit" were never part of the append; they are still required
by the prompt. A test proves a model's own submit checklist comes through with
nothing appended after it.

**AC3 - the standalone rubric document is deliberately KEPT.** It is the
course's one legitimate course-wide grading artifact, nothing reads it back for
grading, and with the per-week duplication gone there is no leak.
`generateEmbeddedRubricText` itself is unchanged and still backs that document
and the grading engine.

This AMENDS entry 162: its AC1-AC4 describe the per-assignment embedded rubric
that used to be appended to each assignment sheet. That machinery still exists
and is still course-kind aware, but as of this entry NO generated assignment
document contains it - so "an applied criterion describes the DELIVERABLE"
(162 AC3) is now a property of a code path the shipped assignment sheet does not
use. 162's AC2 (the coding default is byte-identical) and AC4 (the two
mechanical guards) still apply wherever the builder IS called.

**AC4 - one constant carries hands-on and authorization together.**
`PROJECT_HANDS_ON_CONTRACT` (`src/lib/course-project.ts`) states both halves:
every milestone's deliverable should be an artifact a working practitioner would
actually produce (a completed analysis, a working configuration, a real
finding), never a plan/summary/report/diagram ABOUT the work when the work
itself can be done and evidenced; AND, whenever the field's real work involves
testing, scanning, probing, configuring or altering a system, every milestone
must direct the student at an intentionally vulnerable practice target, their
own isolated environment, or a scoped environment the instructor provides -
never a real system they do not own or have written permission to test. Shipping
both in ONE constant is the point: the safety cannot be separated from the
feature by a later edit, and it is gated on the WORK involving probing, not on a
security keyword, so it reaches any field where it applies.

**AC5 - it travels to every generator that carries a milestone forward.**
`shared.ts`'s item 14, `assignment-brief.ts`, `class-session-brief.ts` and
`test-brief.ts` each push it VERBATIM alongside `renderMilestoneContract`.
Each of those is a SEPARATE generation call that never saw the project-design
prompt, so a missing push would let that path elaborate a hands-on milestone
back into a documentation-only deliverable. The durable check is that every
call site of `renderMilestoneContract` also emits `PROJECT_HANDS_ON_CONTRACT`.

**AC6 - applied courses are not pushed toward code.** The contract ties hands-on
explicitly to the field's own real professional tools and says outright that it
never means writing or running a program.

**Limit, stated plainly.** AC4-AC6 are a prompt contract. The tests pin that the
constant contains both halves and that every milestone-carrying generator emits
it verbatim; they cannot prove a model produces hands-on work or stays inside
the authorization boundary.

## 174. Markdown tables become real Word tables, and typography is normalized

Generated documents shipped raw pipe rows as paragraphs, and the em dashes and
curly quotes a model reaches for by default.

**AC1 - a table is recognized by exactly two conditions.**
`parseMarkdownTable` (`src/lib/docx-blocks.ts`) requires (a) a non-empty trimmed
line containing at least one pipe not preceded by a backslash, and (b) the NEXT
line matching `/^:?-+:?$/` per cell. Nothing else. Two consequences a reader
must know: the header candidate does NOT have to start with `|` (any prose line
with a pipe qualifies if a separator follows it, so `## A | B` over a separator
becomes a table header - `docx.ts`'s comment claiming this ordering "never
steals a line that would otherwise have been a heading" is wrong as written),
and the separator's column count is NOT validated against the header's (GFM
would reject the mismatch; this accepts it).

**AC2 - a malformed table degrades to the original text, never a throw.**
`parseMarkdownTable` returns `null` and the line falls through to normal
heading/list/paragraph handling. There is no throw path.

**AC3 - ragged rows are normalized at RENDER time, and long rows lose cells.**
`normalizeTableRowWidth` pads short rows with trailing `""` and TRUNCATES cells
past the header's column count. Truncation is silent; the header alone
determines the width.

**AC4 - the header row is a real Word header row.** Row 0 sets
`tableHeader: true`, which serializes as `<w:tblHeader/>`; every other row
serializes `<w:tblHeader w:val="false"/>`. Pinned by value, not by presence.
Header cells are white bold Calibri on navy `1A2744`; table width is 100%.
Deliberately NOT set: borders (whatever the docx library defaults to), column
widths, and alignment - `:---:` colons are parsed and DISCARDED, so every
generated table renders at the paragraph default.

**AC5 - inline formatting inside cells is deliberately asymmetric.** Body cells
go through `runsFromText`, so bare URLs and `[text](url)` become real
hyperlinks; header cells are a single plain `TextRun`, so a URL in a header is
text. Neither path applies `buildLabeledRuns`, so a `Label: value` cell is not
bolded the way an ordinary paragraph is.

**AC6 - `\|` is escaped through a placeholder.** `splitTableRow` swaps escaped
pipes for U+E000 before splitting and restores them per cell. Two edge cases
follow from that and are unguarded: `\\|` (escaped backslash, then a real pipe)
is misread as an escaped pipe, and a pre-existing U+E000 in the source text
comes out as a literal `|`.

**AC7 - typography normalization is wired into the shipped path, not just
exported.** `normalizeTypography` (`src/lib/text-normalize.ts`) is called by
`buildDocxFromPlainText` on the whole payload BEFORE the line split (so heading
detection, table parsing and inline tokenization all see ASCII) and by
`buildSlidesPptx` field-by-field via the exported `normalizeSlideTypography`
(title, bullets, notes, and every text field of a `matrix2x2`/`process`/`table`
graphic). Entry 179 later closed two remaining bypasses (the course schedule
document and the legacy lesson zip).

**AC8 - four substitutions, in a fixed order, skipping code fences and URLs.**
(1) an EN DASH between digits collapses to a bare hyphen with no spaces, and
must run first so its own output is not re-matched; (2) any remaining em or en
dash becomes `" - "` with exactly one space each side; (3) curly single
quotes/apostrophes become `'`; (4) curly double quotes become `"`. Fenced lines
are skipped via `CodeFenceTracker`; `https?://[^\s)]+` spans are skipped inside
a line. A string containing none of the six target characters returns by
identity. Explicitly NOT handled: the ellipsis U+2026, non-breaking space, and
other dash characters.

**AC9 - `slide.code` and `slide.codeLanguage` are never normalized.** Folding a
dash or a quote inside a code sample would change what the code MEANS. (Note
that `author` is also excluded, undocumented.)

**Known defect this introduced, unfixed and untested.**
`buildDocxFromPlainText` normalizes the body text but NOT `templateHeadings`:
the allow-list is built from the raw parameter through `normalizeHeading`, which
only lowercases, strips numbering and strips trailing punctuation. Template
headings are extracted from an instructor's uploaded .docx
(`extractDocxTemplateHeadings`), where Word's autocorrect produces curly
apostrophes and en dashes by default. After this commit a body line reading
`Instructor's Notes` is folded to ASCII while the allow-list entry keeps its
curly apostrophe, so the heading no longer matches and renders as body text.
Reachable from `LecturePlanningTab.tsx` and from `assembleLectureFiles`'
assignment-instructions document. The only allow-list test uses pure ASCII.

**Other honest limits.** The doc comment on the numeric-range rule claims an EM
dash between digits also collapses; the regex matches EN DASH only, so
`2013-2016` written with an em dash comes out spaced. Rule 2's `\s*` on the left
consumes leading whitespace, so a nested bullet written with a leading em dash
loses its indentation and drops a nesting level. Several tests in this area
assert on ASCII-only fixtures that take `normalizeTypography`'s identity
fast path and therefore cannot detect the exclusion they appear to guard
(`codeLanguage: "javascript"`, a `"Fill-in"` quadrant label); one fence test
uses a fixture with no separator row, so it would pass with the fence guard
deleted. The end-to-end blocks that unzip real OOXML are the strong part.
No coverage at all for: a table inside a list (indentation is discarded and the
table is emitted top-level), two tables separated only by a blank line (adjacent
`<w:tbl>` with no paragraph between - Word merges them), a code span containing
a pipe inside a real table, or the themed pptx render path.

## 175. One download per course, and a failed run says what actually broke

Two defects from real run `556b49f0` (49 errors, 0 of 3 courses ok).

**AC1 - a step hands its blob to the runner; it never downloads on its own.**
Ten step files used to each trigger their own browser download, so a
three-course Course Build produced roughly eighteen. Each now attaches
`DOWNLOADABLE_OUTPUT_KEY` (`run-logging.ts`) to its outputs instead, guarded by
`typeof document !== "undefined"` (or the step's existing `downloadSkipped`
flag). Steps still persist their files to the tile and to storage exactly as
before - only the browser download moved.

**AC2 - the attended runner flushes ONCE per course, when that course
finishes.** `planCourseDownload` (`attended-fanout.ts`) is pure and returns a
PLAN, never a blob: `none` for nothing handed off, `single` for exactly one file
(downloaded outright - which is also the standalone single-step case, unchanged
from before), and `zip` for two or more. Building the zip and the DOM download
mechanics stay in `useWorkflowRun.ts`, which is what makes the decision itself
unit-testable with no DOM and no zip library.

**AC3 - names inside the combined zip are collision-safe.**
`uniqueZipEntryName` returns the name unchanged the first time and inserts
` (2)`, ` (3)` before the extension on repeats, adding whatever it returns to
the `used` set. The caller MUST reuse one `used` set across every file going
into one zip; a fresh set per call silently disables the dedup.

**AC4 - unattended runs are untouched.** The server runner never reads
`DOWNLOADABLE_OUTPUT_KEY`. Verifiable by grep: the only readers are
`run-logging.ts`'s own accessor and `useWorkflowRun.ts`.

**AC5 - a storage failure names the object, the tile and the file.**
`getCourseZipUrl` wraps `createSignedUrl`'s returned error with the object path;
`downloadCourseZipBlob` wraps a raw `fetch` rejection (which fires before any
response exists and carries zero context) with the path being downloaded; and
both loader closures - server (`buildServerMaterialLoaders`) and attended
(`WorkflowsTab.tsx`'s `loadCourseExportData`) - wrap those with the COURSE TILE
name and the export/materials FILE name. The underlying "Failed to fetch" was
never reproduced without live credentials and is NOT fixed; the next occurrence
will say which file and which stage.

**AC6 - the attended runner's failure Detail reuses the deduping helper.** It
used to join every message, which did not even match the log renderer's own
bullet regex - which is why one root failure rendered as an undifferentiated
wall repeated three times. Root failures now lead and cascades collapse to a
count. The cascade mechanism itself is unchanged.

**AC7 - the attended materials loader is its own module and mirrors the server
one BY HAND.** `load-course-materials-attended.ts` exists because
`useWorkflowRun.ts` is at the 1000-line cap, and it shares no import with
`step-helpers-server.ts` because one talks to Supabase Storage from the browser
and the other from the server. The contract kept in sync is which outcomes
return `null` (course/tile not found, nothing on the tile, the list action
itself erroring - all normal "nothing to load" outcomes for a fail-forward
source) versus which throw (a genuine download failure, wrapped with the tile
and file names). Note the deliberate asymmetry: the SERVER's `loadCourseExport`
throws when the list action errors, while both `loadCourseMaterials` halves
return `null`.

## 176. The run form asks only what applies, and puts the gating decisions up front

Course Build's own step declares seven sources and five per-source inputs; a
flat required/optional form showed all of them at once.

**AC1 - `visibleWhen` is exact-match, on the run form's flat value map.**
`StepInputSpec.visibleWhen = { fieldKey, equals }`, and `isFieldVisible`
(`src/lib/workflow-field-visibility.ts`) is
`(values[gate.fieldKey] ?? "") === gate.equals` - case-sensitive, no trim, no
normalization; a field with no gate is always visible; a missing controller
coerces to `""` and hides the field. The doc comments say the controller is
"another input of the SAME step"; the code does not scope by step at all - it
reads the run form's flat `fieldKey` map, which is shared across steps
(first occurrence wins), so a same-named field from another step can satisfy a
gate.

**AC2 - visibility is enforced in three places, all through that one
predicate.** Rendering (`WorkflowPanel.tsx` filters before handing fields to
`RunFormFields`), validation (`validate-run-form.ts` SKIPS a hidden required
field, so an unfillable field can never deadlock Run - and this is load-bearing,
because the caller passes the UNFILTERED list), and submission
(`useWorkflowRun.ts` forces `[]` for a hidden `uploads` field and `""` for
everything else). The STORED value is deliberately left alone, so switching the
controlling field back restores what was typed; only what is submitted is
suppressed.

**AC3 - the SERVER runner does not apply visibility.** `server-runner.ts`
resolves runtime bindings with no `isFieldVisible` check, so an unattended run
passes every snapshot value through regardless of the source picked. This is
harmless only because the single step using `visibleWhen` today reads exactly
one input per source and ignores the rest. A future step that reads a gated
field unconditionally would diverge between attended and unattended runs.

**AC4 - every visible field lands in exactly one ordered, labelled section.**
`groupRunFormFields` (`src/lib/workflow-field-groups.ts`) emits
Setup, then Details, Templates, Posting in that fixed order, omitting any empty
section - so a small workflow renders ONE section, never four near-empty ones.
Each is a native `fieldset`/`legend`. The three deferred sections share ONE
disclosure labelled "More settings (N)".

**AC5 - membership is decided by structure, never by fieldKey.** Tier first
(`partitionVisibleFields`): `required` or currently-`visibleWhen`-gated fields
are primary and uncapped; then up to `DEFAULT_BONUS_CAP` (4) further fields are
promoted, in declaration order, if they are COMPACT (`usesMultiSelect` first,
then any type outside `longtext`/`concepts`) - a tall field does not consume a
bonus slot. Then group (`groupSecondaryFields`): `boolean` to Posting, any type
matching `/template/i` to Templates, everything else to Details as the fallback.

**AC6 - what that actually produces for Course Build, which is the point of the
feature.** With the default cap the four bonus promotions are `modules`,
`outputs`, `deckTemplate` and `sources` - so Setup is
`hubCourse, source, [the one gated per-source field, if any], modules, outputs,
deckTemplate, sources`. The module and output selectors DO land up front, which
is the claim; but the cap is exactly consumed, so adding ONE earlier compact
optional field to any step before `select-course-outputs` would silently demote
`outputs` into Details. Note also that `deckTemplate` sits in Setup while
`assignmentTemplate`/`testTemplate` sit in Templates. This is a property of the
whole preset's field ORDER, not of the grouping module, and it is the thing to
re-check when a step gains an input.

**AC7 - the disclosure's open state persists.** `ta-workflows-optional-open`
(the project's `ta-` convention), defaulting to OPEN when unset; the retired tab
key `ta-workflows-optional-tab` is proactively removed on mount.
`DisclosureToggle` itself is a pure controlled button and persists nothing - a
future caller gets no persistence for free.

**Limits.** None of this is rendered by any test (no React harness - see entry
168). The pure modules are covered: visibility (no gate, exact match, mismatch,
absent controller, blank controller, sibling gates), validation (including the
positive case that a gated required field IS enforced once its controller
matches), and grouping (exactly-one-section membership, tall fields not
consuming a bonus slot, empty sections omitted). Two grouping tests are weak in
a way that matters: the bonus-cap default test derives BOTH sides from the
imported constant, so it passes for any cap including 0, and the
"course-build's own field set" test passes `bonusCap: 2` - not the production
default of 4 - which is exactly why AC6's real Setup contents are not pinned
anywhere. Untested entirely: the submission-side suppression in
`useWorkflowRun.ts`, the localStorage read/write, and case sensitivity or
whitespace in `visibleWhen`.

## 177. Run form textareas are compact instead of eight rows tall

**AC1 - two independent floors both had to come down.** A `longtext`/`concepts`
control was tall because MUI's `minRows` was 4 AND `page.module.css`'s global
`.field textarea` sets `min-height: 220px; padding: 16px 18px`.
`RuntimeFieldInput.tsx` now passes `minRows={2}` plus an inline
`htmlInput` style of `{ minHeight: "72px", padding: "8px 12px" }`. The global
rule is untouched; the inline style is the override mechanism, so no CSS
specificity or module source-order question arises.

**AC2 - the floor is fixed; growth above it is not.** There is no `maxRows`, so
MUI's autosize grows the box without limit as content is typed, and
`resize: vertical` is inherited from the untouched global rule, so the box stays
user-resizable.

**AC3 - the builder's own longtext editor is deliberately not in scope.**
`LiteralEditor` still uses `minRows={3}`, so the two surfaces now differ.

**Limits.** This commit added ZERO tests (one file, +40/-1), and nothing pins
`minRows === 2` or the 72px floor. The comment's "about two and a half rows"
arithmetic depends on a line-height and a font size set elsewhere and is not
enforced anywhere.

## 178. Course export sources accept Blackboard archives, not just Common Cartridge

`parseCartridgeBlob` gained a second format, so both the uploaded-cartridge
source and the tile-export source can read a Blackboard course archive.

**AC1 - detection has two signals, and the MARKER FILES win.**
`detectCartridgeFormat(manifestXml, hasBlackboardMarkerFiles)` returns
`"blackboard"` when the caller found `.bb-package-info`, `.bb-log-info` or
`.bb-package-sig` at the zip root; otherwise `"blackboard"` when the manifest
text contains `http://www.blackboard.com/content-packaging/`; otherwise
`"common-cartridge"` when the text matches `/<manifest\b/i`; otherwise
`"unknown"`. The precedence is marker-files-first, which is the opposite of what
the commit message claims. The namespace check is a bare substring search over
the WHOLE document - not scoped to `xmlns:`, not to an attribute, not to the
root element - so a Common Cartridge that merely mentions that URL anywhere is
classified Blackboard.

**AC2 - `"unknown"` is not acted on.** `parseCartridgeBlob` branches only on
`=== "blackboard"`; `"common-cartridge"` and `"unknown"` are behaviourally
identical. A zip that is neither format returns an all-null
`CartridgeCourseData` with `modules: []` and does NOT throw - it fails later,
downstream, with "Could not build a schedule from the selected source - no weeks
were produced", which names neither the file nor the expected formats.

**AC3 - it is a second implementation converging on one shape, not a shared
path.** The Blackboard chain (`parseBlackboardResources`,
`parseBlackboardItemTree`, `isBlackboardScaffoldNode`,
`collectBlackboardModules`, `collectBlackboardItems`,
`resolveBlackboardItemTypes`) is all new; it shares only the low-level XML
utilities (`decodeXml`, `tagText`, `findDirectChildItemBlocks`,
`getItemInnerContent`) and returns before any Canvas post-processing. Modules
are taken in DOCUMENT order with `position = i + 1` - there is no `<position>`
equivalent and, unlike the Canvas path, no sort.

**AC4 - scaffolding nodes are dropped on EITHER signal, not both.**
`isBlackboardScaffoldNode` drops a node whose title is one of
`ROOT`/`--TOP--`/`INTERACTIVE`/`INDIRECT` OR whose resource type is
`course/x-bb-coursetoc`. The comment calls the type "corroborating"; the code
treats either alone as sufficient, so a real content area backed by a coursetoc
resource is dropped regardless of its name.

**AC5 - item types come from the resource file, with a two-step fallback.**
`resolveBlackboardItemTypes` opens each referenced `resNNNNN.dat` and reads
`<CONTENTHANDLER value>`, falling back to the manifest resource `type`, then
`""`, caching per `identifierref`. A MISSING `.dat` degrades silently by design;
a CORRUPT one does not - there is no `try/catch` anywhere in that function,
contrary to its own comment, so a rejecting read fails the whole import.

**AC6 - the course title comes from the first `course/x-bb-coursesetting`
resource's `bb:title`, with NO fallback.** A Blackboard archive with no such
resource yields `title: null`, absorbed downstream by
`finalize(data.title ?? "")` into the hub tile's name and then the literal
"Course".

**AC7 - a Blackboard-flagged archive with no manifest, or a manifest with no
`<organizations`, throws a message naming the format.** That is the one loud
failure this format has.

**Contract violations and silent-empty paths, recorded because they are
load-bearing.** The Blackboard return sets `hasCourseSettings: true` for a
format that by definition has no Canvas `course_settings` folder, directly
contradicting that field's own documented meaning; five import buttons in
`useCourseImportActions.ts` gate on `!hasCourseSettings`, so they now proceed
past that gate and fail on a later, less accurate check. The `hasOrganizations`
field its own doc comment says the caller uses is read by NO production code -
`parseBlackboardArchive` does its own, differently-specified regex check before
calling the parser, and that guard (`/<organizations\b/i`) accepts inputs the
parser's own regex (case-sensitive, requires a closing tag) then yields nothing
for, so `<organizations/>` and `<ORGANIZATIONS>` both return an empty module
list without throwing. `description` is extracted, is three-state
(string/null/undefined depending on format), and is read by nothing. The
`course-cartridge` input still declares `accept: ".imscc"` with help text naming
Common Cartridge, so the file picker for that source does not offer a Blackboard
`.zip` by default; the tile-export path accepts `.zip`.

**Test limits.** All XML is hand-written; the zips are real bytes but their
contents are synthetic, and no real Blackboard export is committed. Two tests
are worth naming: "detects a Common Cartridge manifest as common-cartridge"
passes on the `/<manifest\b/i` arm alone and asserts nothing about Common
Cartridge, and "reports unknown for a manifest with neither signal" asserts
`common-cartridge` for exactly that input - the name contradicts the assertion.
The `coursetoc` half of AC4 is redundant against every fixture (the same nodes
are also reserved-titled), so deleting it breaks no test. There is no test
comparing the Blackboard output to the Common Cartridge output, so the
merged-path tautology risk does not arise here.

## 179. Rubrics know the course kind, objectives drop the Bloom tag, schedule docs get normalized

Four fixes, written test-first.

**AC1 - `generateRubric` is course-kind aware, and the coding path is
untouched.** `generateRubric(instructions, provider, courseKind = "coding")`
(`src/lib/grade/rubric.ts`) used to hard-code "every criterion must evaluate
only the presence or absence of things in the submitted code itself" for every
course on earth, which is why a no-code ethical-hacking course received criteria
grading "code blocks", "code snippets" and "properly commented code". The
applied branch interpolates the applied course-kind contract and swaps the
closing rule for one that forbids assuming a programming course. The `"coding"`
DEFAULT means every caller that omits the argument, and every stored workflow
that predates the fix, gets the identical prompt as before.

**AC2 - the deterministic path was pure wiring.** An applied implementation with
a no-code invariant already existed (entry 162 AC2-AC4); `generateRubric`'s
embedded branch and `generate-rubric-offline` simply never passed it their kind.
`generate-rubric-offline` and `lms-rubric` both gained a `courseKind` input read
through the same `resolveCourseKind(values.courseKind)` idiom eleven other steps
already use.

**AC3 - the applied course-kind contract dropped two words, deliberately.**
`courseKindContract("applied")` no longer says "do not include code snippets or
syntax". The rubric prompt interpolates that contract VERBATIM and must also
satisfy it for itself, so a literal-word ban on "syntax"/"code snippets" made
the two requirements mutually exclusive. "Do NOT ask students to read, write, or
run code" plus "do not illustrate ideas with software APIs or libraries" cover
the same ground. The mechanical backstop is unchanged:
`enforceNoCodeForApplied` still strips code from applied decks regardless of
what any prompt says.

**AC4 - module objectives no longer print a "(Bloom: Level)" tag, and that is
enforced in CODE, not only in the prompt.** The LEVEL TAG paragraph is removed
from `BLOOM_OBJECTIVES_CONTRACT` (`src/lib/bloom-taxonomy.ts`), AND
`generateModuleObjectivesForAssignment` runs `stripVisibleBloomTag` over the
model's output regardless of what the model actually did - the same
belt-and-braces shape `stripModelUrls` already has on that path. Amends entry
145 point 3, which pinned the visible tag as a deliberate presentation choice.
Everything else in that contract is untouched and
each part is pinned by its own guard test, specifically so the label could not
be removed by tearing out Bloom's taxonomy with it: the measurable-verb
requirement, the banned-verb list with its per-level substitutions, the
ALIGNMENT rule that outranks every other rule, and term PROGRESSION as
explicitly subordinate to alignment. A pre-existing test that pinned the
opposite behaviour was inverted deliberately rather than deleted quietly.

**AC5 - two typography bypasses closed.** The course schedule document
(`steps.course-guides.ts`) and the legacy lesson zip (`page.tsx`) both built
.docx directly and never reached `normalizeTypography` - so the very documents
entry 174 existed for still carried long dashes and curly quotes. Both now
normalize.

**AC6 - a signing failure can no longer escape unwrapped.** `getCourseZipUrl`
checked the error VALUE supabase-js returns but had no guard around the `await`
itself, so a THROWN rejection reached the run log as a bare "Failed to fetch"
with no path. Both failure shapes now produce the same named message. The
underlying cause is still unknown; this only closes the diagnostic gap.

**Limits.** AC1, AC3 and AC4 are prompt changes. The tests pin the prompt text -
that the applied branch is selected, that the coding branch is byte-identical,
that each Bloom rule survives and the tag string does not - and, for the
deterministic rubric builder only, the real generated criteria. Nothing here
proves what a model writes. See also the regression noted against AC2 in the
pass that followed: no preset binds `lms-rubric`'s new `courseKind` input.

## 180. A missing deck graphic is reported on every path, and a truncated repair keeps what arrived

An investigation into "84% of Artifact slides shipped with no graphic" found the
MEASUREMENT was wrong, not the pipeline. Counting `<p:sp>` shapes per slide is
blind to a `table` graphic: pptxgenjs renders a table through `addTable`, which
emits a `<p:graphicFrame>`/`<a:tbl>` and contributes zero `<p:sp>` - and
`Artifact:` is exactly the slide type the applied contract steers to a table, so
that whole slide type read as empty. Entry 156's own graphics row is amended in
place for the same reason. Nothing about the graphic vocabulary or the
required-prefix list changed. Two real defects sat underneath it.

**AC1 - the surviving-gap report is at a choke point, not on one step.** It used
to be computed by `lecture-materials-from-schedule` alone. Two other steps ship
applied decks: `lecture-zip`'s repoless branch (which threads `courseKind`
straight into `generateLectureMaterialsFromScheduleAction`, so it generates
Artifact/Judgment Call/Agenda slides too) and `prepare-lecture`. The computation
now lives in `graphicsGapReportLines` (`src/lib/workflows/registry-helpers.ts`,
exported), called once inside `assembleLectureFiles` - so every caller inherits
it, present and future. `prepare-lecture` sits outside that helper and calls
the same exported function directly. The durable check: `assembleLectureFiles`
has exactly one `graphicsGapReportLines` call site and no step recomputes gaps
of its own.

**AC2 - `courseKind` defaults to "coding", which is a no-op.**
`graphicsGapReportLines(plans, courseKind = "coding")` returns `[]` for any kind
other than `"applied"`, because `enforceGraphicsForApplied` is a no-op there by
construction. That default is what let the parameter be added without touching
any of the 36 pre-existing `assembleLectureFiles` tests. A coding deck's summary
is byte-for-byte unchanged - pinned by a test that feeds an `Artifact:`-titled
slide with no graphic through both an omitted `courseKind` and an explicit
`"coding"` and asserts silence both times.

**AC3 - two return fields that read as coverage were deleted, not wired.**
`graphicViolations` and `graphicsMissing` were returned by
`course-planning.ts`/`course-planning-grounding.ts` and read by NO caller
anywhere. They are gone rather than plumbed through, because the choke point
recomputes the same thing from each plan's own final slides and a threaded count
would be a second source of truth that could drift. A grep for either name
returning nothing is the check.

**AC4 - a truncated repair no longer discards the repairs that arrived.**
`fillMissingGraphics` (`src/app/actions/slide-graphics-repair.ts`) makes ONE call
covering every gap in a deck under a fixed 4096-token budget, so a deck with
enough gaps can be cut off mid-array; `jsonObjectSlice`'s brace-to-brace slice
then lands mid-object, `JSON.parse` throws, and the catch used to throw away the
whole response including graphics that came back complete.
`parseRepairEntries` keeps the whole-object parse as the fast path (unchanged
cost, unchanged behaviour when nothing was truncated) and only on failure runs
`extractGraphicsArrayEntries`, an incremental scan that pulls out array elements
that are themselves balanced. It is STRING-LITERAL AWARE (tracks `inString` and
escapes) so a `{` inside a table cell or caption cannot desync the brace count.
A truncated tail element is left unrepaired, never guessed at; every salvaged
entry still goes through `coerceSlideGraphic`, so a malformed repair degrades to
no graphic exactly as before. Batching was considered and rejected: it only
raises the gap count at which truncation starts.

**AC5 - a deck-level audit exists so the blind spot cannot recur unnoticed.**
`auditPptxGraphics` (`src/lib/pptx-graphics-audit.ts`) unzips a FINISHED .pptx
and counts BOTH `<a:tbl>` tables and `<p:txBody>` text-bearing shapes; a slide
counts as carrying a graphic when `tableCount > 0 || textShapeCount > 2`. Text
shapes, not raw `<p:sp>`, is what makes the threshold theme-independent: the
untutored rendering path draws three decorative `<p:sp>` shapes per content
slide that carry no `<p:txBody>`, the themed path draws none, and a graphic's
own background rectangles are also `<p:sp>` with no text. Table cells use
`<a:txBody>` inside `<a:tbl>` - a different tag - which is exactly why the table
count is needed alongside. slide1.xml (the title slide) is excluded so `index`
lines up with the `SlideData[]` array. The module is DIAGNOSTIC ONLY: it is
imported by no generation path, gates nothing, and exists to be run against a
real deck.

**Honest limits.** The narrative counts do not reconcile and neither is a
durable check: the commit message says "176 of 176 required graphics present",
while the test file's own background comment says 159/159 Artifact plus 32/32
Agenda (191) with "exactly ONE slide in 350" genuinely missing one. Treat both
as anecdote. What IS checkable is the audit's counting rule (AC5), which is
sabotage-tested by removing the table counting and confirming the false gap
reappears. Also note what the step-level tests do and do not prove:
`registry.graphics-gap-reporting.test.ts` mocks `assembleLectureFiles` and calls
the real `graphicsGapReportLines` from inside that mock, so it pins that BOTH
steps pass the right plans and the right `courseKind` through - it does not
prove the real helper calls the function. That half is pinned separately, on
the real `assembleLectureFiles`, in
`registry-helpers.assembleLectureFiles.test.ts`. Neither is vacuous; both are
needed.

## 181. Course Build can build from the repository already linked on the course tile

The seventh source, "tile-repo" - the direct analogue of "tile-export" for a
repository instead of an LMS export.

**AC1 - it asks for nothing new.** No binding was added to `COURSE_BUILD` for
this source: it reads the tile id off the SAME `hubCourse` binding the preset
already had, so the run form did not grow by a field. Verifiable structurally -
`course-schedule-from-source` declares no new input for it, and the preset's
step-1 bindings are unchanged.

**AC2 - it shares the codebase source's path rather than resembling it.** Both
branches call one `scheduleFromRepo(repo)` closure inside the step; the only
difference between them is where the repo string came from (a typed/picked
runtime field vs. `tile.repos[0].repo`). A test pins the identical positional
call shape `(repo, weeks, tests, provider, context)` for both, and a second
asserts the two sources' entire `outputs` bags are equal given the same repo.
Note the second test's schedule comparison is trivially true (one mocked return
feeds both runs); what it genuinely pins is the DERIVED outputs - `repo`,
`isCodebase`, `courseKind`, `courseTitle`, `resolvedSourceMaterial`.

**AC3 - multi-repo rule: the FIRST linked repository, never "newest".**
`tile.repos[0]`, matching every other place this codebase resolves a tile's repo
to a single value (`load-course-tile`'s own `repo` output, `steps.github.ts`,
`resolveClassRepoRef`, the Courses tab's "primary" display). `CourseRepo`
carries no timestamp, so "newest" - the rule tile-export uses for
`CourseMaterialFile` - is not available here. It reads `repos`, NOT
`studentRepos` (a different column mapping students to their own submission
repos).

**AC4 - a tile with no repository fails loudly, naming the tile.** Never an
empty schedule reported as success. The message names the tile (falling back to
the raw tile id when the tile itself cannot be resolved) and says where to fix
it, exactly like the tile-export branch's missing-export message.

**AC5 - it resolves `courseKind` to "coding".** It is the same kind of input as
"codebase" - a repository - just obtained differently, so a tile-repo run gets
coding materials everywhere a codebase kickoff would. `isCodebase` is `"1"` on
the same condition.

**AC6 - one tile lookup per run.** `resolveHubTile` is memoized (`hubTileLoaded`
latch) and shared by this branch, the tile-export branch's error message, and
`finalize`'s `courseTitle` fallback, so a run never pays for `listCourseHubAction`
twice.

## 182. Weekly significance and per-module instructor notes as selectable outputs

Two new per-week output families, spliced into `COURSE_REFRESH` right after
`generate-knowledge-checks` (source indices 14 and 15), which is why
`fetch-deliverable-images` and everything after it shifted right by two -
`starter-materials`' include is now source index 18, `generate-syllabus` 19,
`castletop-workbook` 20. Every preset's `bindOverrides` keys were renumbered with
it; the durable check is that each `"N.key"` still lands on the step it names
(see entry 183's AC5).

**AC1 - "Significance of the Material" is grounded in the week's OWN assigned
case study, never a fresh one.** `generate-weekly-significance` reads the case
study off a file this RUN already produced
(`incoming.find(f => f.weekNumber === n && f.caseStudy)`), and SKIPS the week
with a reported reason when there is none - either the module was not generated
this run, or no case study could be confidently matched. It never re-derives or
re-chooses one, which is what would reintroduce entry 160's cross-artifact
disagreement.

**AC2 - instructor notes are per-module, tool-grounded, and default to
unpublished.** `generate-instructor-notes` resolves each module's tools from the
tile's committed toolset intersected with what that week's generated materials
actually mention (`resolveModuleTools`), and skips a week with a reported reason
when neither yields a tool - never generic advice. When `postToLms` is on, the
LMS page it creates is always unpublished/invisible to students.

**AC3 - both degrade per week and stop cleanly on a quota refusal.** A per-week
error is recorded in the step's report and the loop continues; a non-transient
quota refusal (`isNonTransientQuotaRefusal`) breaks out, counts the
not-attempted weeks, and says so - the same shape
`generate-weekly-announcements`/`generate-knowledge-checks` already use.

**AC4 - both are ordinary `files`-chain members.** Each takes `files` in and
returns `files` out (plus `count`/`report`), so the chain
guides -> announcements -> knowledge checks -> significance -> instructor notes
-> images -> cartridge/zip stays a strict accumulator and the terminal
deliverables see everything. Each also honours a `selected` input the same way
(entry 183 AC1) and declares `passThroughOnFailure: { files: "files" }` (entry
184).

**AC5 - both are headless-safe, and the canary was bumped in the same commit.**
Neither sets `requireInput`/`requireConfirmation`; both are in
`HEADLESS_SAFE_STEP_TYPES`, and `headless.test.ts`'s exact-size assertion moved
with them (it is 150 as of entry 183's two additions).

**AC6 - `courseKind` reaches both.** All three course-setup presets add a
`"14.courseKind"`/`"15.courseKind"` bindOverride - literal `"coding"` for
`COURSE_KICKOFF`, literal `"applied"` for `NO_CODE_KICKOFF`, and COURSE_BUILD's
source-derived `courseKind` output for Course Build.

**Honest limit.** Both steps' user-visible value is model prose. The tests pin
the prompt's construction, the grounding inputs, the skip reasons, the file
naming and the LMS publish state; they cannot pin what the model writes.

## 183. Codebase and Start Here as selectable Course Build outputs

Two more families on `select-course-outputs`, bringing `OUTPUT_FAMILIES` to
eleven. Both were APPENDED, never inserted - the keys are stored inside saved
workflow bindings, so their order is part of the contract.

**AC1 - "codebase" reuses the repository this run is already anchored to; it
never creates one.** `resolve-codebase-repo` (`steps.course-build-codebase.ts`)
takes `course-schedule-from-source`'s own `repo` output and the selector's
`selectedCodebase` boolean and emits one `repo` output. Deselected: emits `""`,
which is byte-identical to the hard-coded `"0.repo"` remap that preceded it.
Selected WITH a codebase-anchored source: passes the repo through, which then
(a) gates `fill-readmes` via `runIf` and (b) feeds `lms-assignments`' existing
README-grounding through the `"11.repo"` bindOverride. Selected WITHOUT one:
throws a message naming both fixes (pick a codebase source, or deselect the
output). Deliberately NOT built: auto-creating a repository from a template.

**AC2 - `fill-readmes` is the ONE step in this preset gated by `runIf`, and that
is safe only because it declares no outputs.** Nothing can bind to a step with
no outputs, so the transitive skip cascade (`server-runner.ts`) has nothing to
reach. Every other output family is gated by a `selected` INPUT instead. A
future output declaring outputs must not copy the `runIf` pattern.

**AC3 - "startHere" gates an EXISTING step rather than adding one.**
`starter-materials` gained an optional `selected` input; previously it ran
unconditionally in every course-setup preset. `isGeneratorSelected(undefined)`
is `true`, so every other preset that leaves it unbound is unchanged - the
durable check is that `COURSE_KICKOFF`/`NO_CODE_KICKOFF`/`COURSE_REFRESH` still
have no `"18.selected"` override and still seed the Start Here module.

**AC4 - the GitHub sign-up assignment follows the SOURCE, not the codebase
family's selection.** `"18.includeGithub"` binds to
`course-schedule-from-source`'s `isCodebase` output, so an instructor can want
the Start Here module without the codebase family (or the reverse). Every other
course-setup preset still pins the literal `""` there, so GitHub sign-up stays
off in them.

**AC5 - the bindOverride/remap indices are checkable, and were re-checked.**
Every `"N.key"` in every preset resolves to a step at source top-index N that is
not skipped and that actually declares input `key`; every `remap` key names a
SKIPPED step's real output. Recomputing this independently (expand each preset,
map flat steps back through `topIndices`, look each key up in the registry)
finds no orphan in `course-kickoff`, `course-kickoff-no-code`, `course-refresh`
or `course-build` at the tree this entry was written against. This is the check
to re-run whenever a step is inserted, because an orphaned key fails SILENTLY.

**AC6 - `select-course-outputs` throws on an unrecognized family.** The run form
offers a fixed option list, so a value outside `OUTPUT_FAMILIES` can only be a
stale or typo'd saved binding. Note the seam: the multi-select control is
`freeSolo` and shows a stale entry as a selected chip, so an invalid value is
visible in the form and fails at run time rather than at edit time.

## 184. One failed generator no longer takes the whole run down with it

A mid-chain generator throwing used to cost both terminal deliverables (the
Common Cartridge export and the course zip) everything every earlier generator
had produced, because both read the TAIL of a strict `files` accumulator and a
failed step's dependents cascade.

**AC1 - the mechanism is declarative and per-step.**
`StepDefinition.passThroughOnFailure` (`registry-helpers.ts`) is a map of
`{ outputKey: inputKey }`. On a throw, the run loop republishes the value the
named INPUT was bound to as the named OUTPUT. Eight steps declare
`{ files: "files" }`: assignment template, test template, course guides, weekly
announcements, knowledge checks, weekly significance, instructor notes, and
deliverable images. A step that does not declare it takes today's path
byte-for-byte.

**AC2 - a pass-through step is deliberately NOT added to `failedSteps`.** That
is precisely what stops the cascade and lets the next step resolve its binding
normally. It IS added to `passThroughFailures`, which `isRunOk`
(server-runner.ts) and `isGroupGenuineFailure` (useWorkflowRun.ts) both consult -
so the run still reports as failed. Resilience must never become silence. A test
covers the case where a step passed through but `failedSteps` is empty and
asserts the run is still not ok.

**AC3 - the salvage cascades.** When two consecutive generators fail, the
second's `files` binding points at the first, which itself passed through - so
its `stepOutputs` entry already holds the salvaged value and the second passes
the same list on. Pinned by fixture.

**AC4 - only the mapped outputs survive.** A pass-through republishes ONLY the
declared keys; every other output of that step stays undefined, so a dependent
bound to a different output of it still fails with "Missing output from step N".
In today's course-setup presets no step binds anything but `files` from these
eight, which is what makes the declaration sufficient there - a new preset
binding, say, `generate-knowledge-checks`' `report` would not be covered.

**AC5 - the two run loops are independent implementations, and the test
guards against the tautology.** `server-runner.ts` and `useWorkflowRun.ts` each
carry their own `resolvePassThroughOutputs` (they share no code by design: one
must stay free of client-only modules, the other is `"use client"`).
`pass-through-on-failure.test.ts` runs every fixture through BOTH and asserts
each against an EXPLICIT expected value as well as against each other, so two
implementations agreeing on the wrong answer still fails. This is also the only
coverage `useWorkflowRun.ts`'s copy gets at all - the repo has no React-hooks
harness, which is why both functions are plain exported functions.

**AC6 - the schedule step stays fatal.** No schedule means nothing to generate;
`course-schedule-from-source` declares no pass-through and a failure there still
takes the run down. `lecture-materials-from-schedule` also deliberately declares
none.

## 185. The coding Example/Walkthrough/Practice/Answer cycle is enforced at the data layer

Scope first, because this is easy to overstate: across two real generated
courses, 31 of 32 coding weeks had the full four-slide cycle intact. The defect
is ONE capstone week - every one of that week's five concept cycles arrived with
a Walkthrough, a Practice and an Answer slide but NO Example before it, while
every other week in the same course was correct. This is a model failing under
the load of a dense final-week deck, not a systemic pipeline fault, and the fix
is sized accordingly.

**AC1 - the repair is mechanical, with no extra model call.** The Walkthrough
slide is already REQUIRED to carry the exact `code`/`codeLanguage` of the
Example it explains (CODING CONCEPTS item 2), so the missing Example's content
is already sitting on the very next slide. `enforceCodingCycle`
(`src/lib/slide-prompt.ts`) synthesizes it from there: title
`Example: <the Walkthrough's own topic>`, empty bullets, the Walkthrough's code
and language, and a fixed handoff note. Unlike the graphics gap (entry 156 AC5),
which needs an LLM call because a graphic's content has to be invented, this
cannot partially fail and therefore needs no recheck pass.

**AC2 - it joins the guard family, at the same point in the pipeline.** It is
wired into BOTH deck generators - `generateSlidesFromTopic`
(`course-planning-grounding.ts`) and `generateSlidesForAssignment`
(`shared.ts`) - alongside the two guards already at that point,
`enforceNoCodeForApplied` (same module) and `enforceGraphicsForApplied`
(`slide-graphics.ts`); `enforceReadOnlyWarmup` (`opener-warmup.ts`) is the same
family of "a prompt rule is not enough on its own" guard but sits on the OPENER
path, not this one. It runs BEFORE
`propagateExampleCodeToFollowups`, so a synthesized Example still gets to be its
cycle's single source of truth for the Practice slide below it, exactly as a
model-authored Example would. A repair is reported through `console.error` with
the count and the topic; there is no instructor-visible surface for it (unlike
the graphics gap, which reaches the run report).

**AC3 - the no-op for an applied course is explicit, not incidental.**
`if (kind !== "coding") return { slides, repaired: 0 }` is the first line, and
it returns the input array by reference. `Walkthrough:` is not a prefix this app
ever asks an applied deck for, so the guard would be inert anyway - the explicit
check exists so that stays true by construction rather than by vocabulary
accident, mirroring `enforceNoCodeForApplied`'s own style. Pinned by a test that
feeds a genuine Walkthrough-shaped gap through the applied path and asserts zero
repairs and an unchanged deck.

**AC4 - it repairs every gap, never only the first, and never fabricates.**
The scan walks the OUTPUT array, so `precededByExample` sees a repair it just
inserted; a multi-concept deck with two gaps gets two Examples, each before its
own Walkthrough. A Walkthrough with no `code`/`codeLanguage` is left alone -
there is nothing to copy, and inventing code would be exactly the fabrication
this family of guards exists to prevent. Neither the input array nor any input
slide object is mutated.

**AC5 - two additive edits to the CODING contract, and the hash pin moved with
them in the same commit.** The FLOW rule gained a concrete, checkable test for
whether bullets are a progression rather than parallel facts ("if you deleted
any one bullet, would the bullet after it stop making sense?", with a
four-parallel-facts counterexample), and the notes handoff rule now requires the
handoff to be built from what THIS slide just established and forbids reusing a
stock connector ("let's see this in code", "now try it yourself", "let's break
this down") slide after slide - a deck where every Example-to-Walkthrough
transition uses the same phrase reads as a filled-in template even though every
handoff is technically present. `SLIDE_STRUCTURE_REQUIREMENTS` is now 17835
chars, sha256
`10ab8834bf4ec0b1bfb7e04a223f4030660a44027743c13224fb47021d6d6172`;
`SLIDE_DECK_JSON_SHAPE` is UNCHANGED at 1871 chars, sha256
`b29552311f3fbd714b00b76c80593f9f962f74c0e7b93ec93033204e64ff5476`. Both values
above were regenerated by hashing the live constants, not copied from the test.
Entries 100 (AC2's Group Z amendment) and 163 carry AMENDED notes pointing
here; entries 110 AC7, 137 AC7 and 160 AC7 quote the OLDER 9189/`c28bda15...`
value as a historical "unchanged at that time" statement and are deliberately
left alone.

**AC6 - the applied contract was deliberately not touched, so the two now
DIVERGE on these two rules.** `APPLIED_STRUCTURE_REQUIREMENTS` still carries its
own (unrefined) FLOW paragraph and handoff-sentence paragraph; neither the
deletion test nor the stock-connector ban reaches it. That is a real, checkable
asymmetry against entry 163's parity work and should be a deliberate decision on
the next pass, not a discovery.

**Limits.** AC5 is a PROMPT change: the pin proves the text is present and
unchanged-by-accident, and nothing more - no test can show a model writes a
better progression or a less generic handoff. AC1-AC4 are real data-layer
behaviour and are covered by six unit tests on the pure function (applied no-op,
already-present Example, single gap with the full insertion asserted
field-by-field, two gaps in one deck, a codeless Walkthrough, and
non-mutation). What is NOT covered anywhere: that either generator actually
calls the guard - both call sites are unit-tested nowhere, so the wiring in AC2
is verified by reading only.

## 186. page.tsx splits into three hooks, and the in-session banner finally arrives somewhere

Two changes in one entry because the first gates the second: the banner's
click-through had to modify `page.tsx`, and `page.tsx` was 1247 lines, over the
project's 1000-line cap. The split came first, the feature second.

**AC1 - the split is behaviour-preserving and follows the CoursesTab idiom.**
`page.tsx` goes 1247 -> 390 lines by moving three self-contained units into
`src/app/components/home/`, mirroring how `CoursesTab.tsx` (387 lines)
delegates to `courses/` hooks plus pure modules. `useAppNavigation.ts` (442)
takes the active tab, every sub-view, the Knowledge (institution, page)
selection, both localStorage persistence effects, the URL-sync effect and the
popstate handler - everything that reads or writes the URL. `useLessonPlanner.ts`
(495) takes the whole Manual > Build Courses > Pre Built flow: form fields,
the five preview slices, `buildLessonZip`, download and attach-to-course.
`WorkflowsPanel.tsx` (115) takes the Workflows subnav JSX and holds no state
of its own. Nothing else in the repo imported anything from `page.tsx`, so the
move has no other call sites. `page.tsx` is now off the over-cap list, leaving
five files above 1000 lines (was six): `course-calendar-events.test.ts` 1138,
`steps.course-schedule-from-source.test.ts` 1100, `workflow-runs.test.ts` 1079,
`steps.grading-repos.ts` 1078, `RuntimeFieldInput.tsx` 1012.

**AC2 - the genuinely pure logic came out into a tested module, which is the
part that actually gains coverage.** vitest here runs `environment: "node"`
over `src/**/*.test.ts` only (see `vitest.config.ts`) - no jsdom, no testing
library - so anything living inside a React component is unreachable from a
test by construction. Four functions that were buried inside `buildLessonZip`
and `saveLessonFieldEdit` now live in `lesson-bundle-format.ts` with 17 tests:
`formatRubricText` (parsed rows, the bare-weight `%` suffix, the
unparseable-rubric fallback), `formatExamplesText` (banner emitted once, code
bodies left un-prefixed, per-example comment marker, heading underline sized to
its heading, blank explanation lines staying blank), `bundleFileBaseName`, and
`parseLessonFieldKey`. All 17 were sabotage-checked: ten separate one-line
breakages of the module were applied, each confirmed to turn the suite red, and
the file restored byte-identical.

**AC3 - one latent bug closed in passing.** The old `saveLessonFieldEdit` chain
hand-counted a `slice()` offset per prefix (`"assignment-step-"` and
`"example-content-"` are both 16, `"example-explanation-"` is 20) and then did
`parseInt`, so a key like `"slide-x"` reached `slides[NaN] = ...` and silently
grew a junk property instead of failing. `parseLessonFieldKey` derives the
offset from the prefix's own length and rejects any suffix that is not a
non-negative integer. No caller can currently produce such a key - they are all
built from real indices - so this closes a hole rather than changing a live
path.

**AC4 - the banner click-through is wired end to end, on both routes.**
`resolveFocusedCourse` (in `in-session-banner-display.ts`) was already written
and tested but had no caller, so clicking a course chip switched tabs and
stopped. `page.tsx` now passes `onSelectCourse` to `TopBar`, which forwards it
to `InSessionBanner`; on the Home route that stays in-page (set the pending
focus, switch to the Courses tab). `/knowledge` and `/account/*` render
`<TopBar />` with no handler, so there the banner keeps its existing fallback
of pushing `/?tab=courses&focusCourse=<id>`, and `useAppNavigation` reads that
param in its initializer as the same pending focus. Both paths converge on one
piece of state.

**AC5 - the focus is consumed exactly once, and a stale id cannot pin it open.**
`CoursesTab` resolves the pending id against its loaded courses through
`resolveFocusedCourse` - the same resolver the banner uses - then clears it via
`onFocusHandled`. It waits while `state === "loading"` rather than treating an
id as unresolvable before the courses have arrived, and it clears the id even
when it resolves to nothing (a course deleted since the banner rendered), so
the effect cannot stay armed. An active search filter is cleared first, since it
could otherwise be hiding the very row being focused, which would make the click
look like it did nothing. `focusCourseId` is deliberately NOT part of
`buildUrlSearch`'s canonical query string: it is a one-shot intent, not a
location, so the next URL sync drops it and a later Back/Forward through that
entry does not re-fire a focus the instructor already saw.

**AC6 - the arrival is visible, audible, and motion-safe.** The row is scrolled
to `block: "center"` (clear of the sticky header, not flush under it) and
tinted for 2400ms. The tint repaints `td.stickyName` as well, for the same
reason the existing zebra rule does - the frozen name cell paints its own
background, so a tint set only on the `<tr>` stops at that cell's edge - and
both selectors carry an extra element so they beat `:nth-child(even)` on
specificity rather than on source order. The left marker is an inset
`box-shadow`, not a border: under `border-collapse: separate` a border on a
`<tr>` is never painted, and thickening the cell's border would shift every
column by a pixel as the highlight fades. The `transition` sits on the base row
rather than on `.rowHighlighted`, or the tint would fade in but snap out. A
`role="status"` live region announces `Showing <name>.` because a tint is
invisible to a screen reader, and both the scroll behaviour and the transition
are gated on `prefers-reduced-motion`.

**Limits.** AC1 and AC4-AC6 are React wiring, and this repo has no environment
in which React can be rendered under test - so they are verified by reading,
by `tsc --noEmit`, by `eslint`, and by `next build` reaching "Compiled
successfully", and by nothing else. They were NOT exercised in a browser: the
app has no local `.env`, and its middleware calls `createServerClient`
unconditionally, so without Supabase credentials no page renders at all on this
machine - the dev server returns a 500 before any component mounts. Specifically
unproven by any automated check: that the banner chip reaches
`onSelectCourse`, that the scroll lands where intended, that the tint and the
live region fire, and that the `/knowledge` -> `/?focusCourse=` round trip
re-mounts Home with the param intact. The full suite (335 files, 6773 tests)
passes, but 17 of those tests are new and all 17 cover AC2's pure formatters
only. AC3's hardening is likewise proven only at the parse level - that no
caller can emit a malformed key is an argument from reading the call sites, not
a test.

## 187. The Courses search bar stays put while the list scrolls

**AC1 - the action bar is sticky; the table header was never the problem.**
`CoursesTable.tsx`'s action bar (New course / Refresh / Sync all calendars /
search / Columns) was plain content in normal flow above `.scroller`, so any
page-level scroll carried it away. It now carries a second class, `.actionBar`
in `CoursesTable.module.css`, pinning it at
`calc(var(--topbar-height) + var(--in-session-banner-height, 0px) + 45px)` -
the same page-level sticky idiom page.tsx's Tabs strip already uses, the 45px
clearing the Tabs strip itself. `z-index: 20` sits above the table's own
sticky header (2/3) and below the Tabs strip's 40; `background:
var(--card-background)` stops rows showing through the gaps between controls
once the bar is pinned mid-page.

**AC2 - the WRONG diagnosis, recorded so it is not re-attempted.** The first
hypothesis was that `.scroller`'s `max-height` failed to subtract
`--in-session-banner-height`, letting the page overflow by the banner's
height. That gap was real and is now fixed, but it was NOT the cause: page
scroll here has several other triggers (a short viewport, the add/edit course
form open, an error banner, the calendar-sync report). Tuning the banner term
alone would not have kept the bar on screen in any of those. The sticky rule
is the fix; the max-height correction is a separate, documented improvement
and is commented as such.

**AC3 - the file's existing warning is not contradicted.**
`CoursesTable.module.css`'s header says a page-level sticky offset never
engages here, because the wrapper would need unbounded height. That is about
the TABLE HEADER row, which grows with the course count. The action bar is a
few dozen pixels tall regardless and sits one level up from `.scroller`, so it
is precisely the case that warning does not cover - now stated in the CSS so
the two rules cannot be read as contradictory.

**Limits.** CSS only. Verified by reading and by `next build`; NOT seen in a
browser, because this app cannot run locally (no .env, and the middleware
calls createServerClient unconditionally, so every route 500s before
rendering). Nothing here is unit-testable. Noticed and NOT fixed:
`.courseGroupSticky` and its siblings in page.module.css appear to be dead CSS
with no .tsx consumer.

## 188. The workflow run's step tracker moves into a sidebar

**AC1 - the correct region was moved.** The tracker is the `RunStepCard`
region of `WorkflowPanel.tsx` (per-step status, progress, errors, pause and
input prompts during a run). `StepOverviewRow` was deliberately NOT touched:
it is the PRE-RUN enable/disable checklist, is wrapped in a disabled
`<fieldset>` during a run, and carries no run state at all. The main column
keeps every RunStepCard, the group headers, the stop-after-this-course control
and the post-run course table; the new `RunProgressSidebar` renders a compact
persistent step list beside it.

**AC2 - presentation only.** Neither run loop changed - not
`server-runner.ts` (unattended) nor `useWorkflowRun.ts` (attended). The
sidebar consumes state both already expose, so the two loops cannot drift
because of this change.

**AC3 - the testable part was extracted.** `run-progress-sidebar.ts` holds
`countSettledSteps`, `findRunningStep` and `describeRunProgressAnnouncement`
(14 tests). `stepStatusLabel` was lifted out of an inline ternary in
`RunStepCard.tsx` so the sidebar and the main-column cards render identical
status wording from one source rather than two.

**AC4 - narrow viewports and accessibility are part of the feature.** A CSS
breakpoint at 900px (matching the existing `.ghSplit` idiom at 920px)
collapses the grid to one column and switches the sidebar to
`position: static; order: -1`, stacking it full-width ABOVE the run output
rather than crushing it - pure CSS, no JS viewport detection, so no hydration
mismatch. The step list is a semantic `<ol>`/`<li>` per group; the running or
awaiting-input step carries `aria-current="step"` as well as a tint, so the
state is never conveyed by colour alone; an `aria-live="polite"` region
announces step transitions only, not every status change. Collapse state
persists under `ta-workflow-run-progress-open`, matching the `ta-` convention.

**Limits.** The sidebar component itself is unverifiable here - no jsdom, no
browser. Only the three extracted pure functions are covered by tests.
Whether the layout actually reads well at any width, and whether the live
region is appropriately quiet in a real run, are unverified by any automated
check.

## 189. Run-form option lists are cached, and that cache cannot cross users

**AC1 - the measured diagnosis.** The seven option lists in
`useWorkflowOptions.ts` already fetched in parallel (seven independent effects
firing in one tick after commit) and were already guarded against per-render
refetch by a stable `useMemo`'d dependency plus a `!== null` check. The real
cost was the absence of a CROSS-MOUNT cache: `WorkflowsTab` sits behind two
`{condition && <Component/>}` guards (page.tsx's `activeTab === "workflows"`
and WorkflowsPanel's `workflowsView === "workflows"`), so leaving the
Workflows tab fully unmounts the subtree and every list refetches cold on
return - each repeating `requireOwner()`, with the Canvas and GitHub lists
additionally making live external API calls.

**AC2 - the fix.** `run-form-options-cache.ts` holds a module-scope `Map`
seeded into each `useState` through a lazy initializer, so a warm remount
inside the TTL starts non-null and the effects skip their fetches entirely -
0 round trips instead of up to 7. A cold mount behaves exactly as before. The
cache deliberately lives in a module containing no component and no hook, so
eslint's `react-hooks/globals` rule does not fire and the `hubCache`
setState-updater workaround is unnecessary. Invalidation is explicit:
`hubCourses` is busted whenever `setHubCourses(null)` is called (the existing
post-run signal in `useWorkflowRun.ts`, since a run can change a course's
linked repos), and every list carries a 2-minute TTL as a backstop. Error and
fallback branches never cache, so a transient failure retries fresh.

**AC3 - the cross-user leak this first shipped with, and how it was closed.**
The first implementation keyed the cache on static strings
(`"workflowOptions:hubCourses"` and friends) with NO user scoping, on the
stated reasoning that "a full page reload always starts cold". That is true,
and it is exactly the point: SIGN-OUT IS NOT A PAGE RELOAD. `TopBar.tsx` does
`signOut()`, then `router.refresh()`, then `router.push("/login")` - both
client-side Next navigations, so the JS module registry is never torn down and
the Map survives sign-out intact. User A signs out, user B signs in in the
same tab, opens Workflows inside the TTL, and the run-form pickers render A's
course tiles, LMS course names, GitHub organisation names and template names.
B never fires a request that would correct it, because the `!== null` effect
guards see the cached value and skip the fetch. Closed with an explicit cache
OWNER: `setCacheOwner(userId | null)` clears the entire map when the id
differs from the recorded owner, and is a deliberate NO-OP when it matches -
called from BOTH the initial `getSession()` resolution and the
`onAuthStateChange` subscription in `SupabaseProvider.tsx`, so a user already
signed in when the provider mounts is covered, not only later transitions.
Tests pin the clear on owner change, on sign-out (owner becomes null), on
sign-in from null, and the no-op on repeat - without which every render would
wipe the cache and silently undo the whole optimisation.

**Limits.** The hook itself is untestable here; only the pure cache module is
covered (24 tests). That a same-user remount actually skips the fetches is
established by code trace and by the no-op test, never observed in a running
app. The 2-minute TTL means an external change (a template added elsewhere)
can stay invisible for that long; a full page reload always starts cold.
Noticed and NOT fixed: `listCourseHubAction` returns full `Course` rows when
the run form needs only `id`/`name`/`canvasUrl`/`repos`; and the
`lmsCourseOptions` effect guard does not account for `activeInstitution`
changing after that list has loaded, so the picker can keep showing a
different institution's courses.

## 190. A case study must be on-domain, not merely word-adjacent

**AMENDED - see entry 199. This entry FAILED its regression gate and its AC3
mechanism was replaced; read 199 for what actually shipped.**

**AC1 - the mechanism, reproduced.** `matchBestByTopics` scored
`APPLIED_CASE_STUDIES` entries by counting whole-word tag hits against a
week's topic plus summary, with NO floor - a single incidental word could win
outright when nothing else scored. The curated library pools aerospace,
government web, airport logistics, construction and oil-and-gas cases under a
shared vocabulary of generic project words (`risk`, `web`, `testing`,
`communication`, `requirements`, `launch`). Reproduced concretely: the real
BIT 320 week title "Web Application Security" plus a sentence mentioning a
launch scores Healthcare.gov 2 points on `web` + `launch` while every other
entry scores 0. The same pattern was confirmed for Challenger
(`risk` + `communication`), Mars Climate Orbiter
(`interfaces` + `requirements`) and Denver (`testing` + `risk`) - the exact
four cases reported as off-domain.

**AC2 - what signal the matcher actually receives.** Only `week.topic` and
`week.summary` reach it. `courseKind` selects WHICH library is searched and
nothing inside it. `courseDescription` reaches `planCourseCaseStudies` but
feeds only the LLM fallback prompt, never the deterministic matcher. Course
name, code and textbook reach nothing at all. Any fix therefore had to work
from per-week text plus the library's own data - a fix assuming a course-level
signal would have been a no-op, which this codebase has shipped twice before.

**AC3 - the fix, and why it generalises.** An opt-in
`requireDistinctiveMatch` parameter on `matchBestByTopics` (default false, so
the coding bank and `matchCodingCaseStudyEntry` are untouched;
`matchCaseStudyLibraryEntry` opts in). A candidate must clear
`hasDistinctiveEvidence`: at least one matched tag is a MULTI-WORD PHRASE
(which requires exact adjacent phrasing and is intrinsically hard to hit by
coincidence), or the match covers essentially all of that entry's single-word
tags up to a cap of 5. Driven entirely by the library's own tag structure -
no course name, no denylist of case titles, no per-entry special-casing.
REJECTED in code, with reasoning: IDF/rarity weighting, which would make this
strictly worse - tags like `web`, `interfaces` and `handoff` are rare WITHIN
the library (df=1) yet common English with no real tie to their entry's story,
so IDF would have amplified exactly the false positives being removed.

**Limits.** A rejected curated match now degrades to `null` and falls through
to the LLM pass, which does see the course description - so the failure mode
moves from "confidently wrong curated case" to "model-sourced case", not to
"no case". CONFIRMED CONTENT GAP, not fixed: all 12 `APPLIED_CASE_STUDIES`
entries are project-management megaproject failures (Denver baggage,
Healthcare.gov, Big Dig, Berlin Brandenburg, FBI VCF, FBI Sentinel, Mars
Climate Orbiter, CityTime, Boeing 787, London Ambulance CAD, Challenger,
Deepwater Horizon). There is not one cybersecurity entry, so for a course like
BIT 320 essentially EVERY week will now correctly fall through rather than
receive a curated pick. The backlog item "validated case studies, one per week
per course" is therefore partly a CONTENT task, not a matching-logic one.

## 191. Q&A and current events as selectable Course Build outputs

**AC1 - reuse, not rebuild.** `researchCurrentEventsAction` and its pure
helpers in `current-events-report.ts` were reused UNCHANGED; only a per-week
orchestration step is new, because the existing `current-events-report` step
takes a single deck, has no `files` input/output and no `selected` gate, and
so cannot join COURSE_BUILD's per-week chain. Q&A likewise reuses
`generateLectureQaAction` and `src/lib/lecture-qa.ts`, grounded per week via
`gatherWeekMaterials` - the same shape `generate-weekly-significance` already
established, so a week with no generated material this run is SKIPPED rather
than invented. Q&A deliberately does not post to the LMS: the standalone
`lecture-qa` step does not either, and an anticipated-questions document is a
preparation aid rather than student-facing content.

**AC2 - the two family keys are append-only.** `"qa"` and `"currentEvents"`
were appended to `OUTPUT_FAMILIES` strictly after `"startHere"`, never
inserted and never reordered, because those keys are persisted inside saved
run forms. `OUTPUT_FAMILY_LABELS` stays in the same order. "Blank means ALL"
still holds and now includes both new families, which the existing
`OUTPUT_FAMILIES.length`-driven tests cover automatically.

**AC3 - preset indices were recomputed from source, never trusted to
comments.** Final COURSE_BUILD step order after the change: 0
load-course-tile, 1 course-schedule-from-source, 2 select-course-modules, 3
select-course-outputs, 4 define-course-project, 5
lecture-materials-from-schedule, 6 generate-weekly-qa, 7
generate-weekly-current-events, 8 resolve-codebase-repo, 9 fill-readmes, 10
include-workflow, 11 integrate-source-into-lms, 12
populate-lms-from-class-template. Three references pointing past the insertion
shifted (`fill-readmes.repo` 6->8, its `runIf` 6->8, `bindOverrides["11.repo"]`
6->8), and `remap["3.files"]` was re-pointed 5->7 so both new families'
documents survive into the zip and the cartridge.

**AC4 - a deselected family passes files through.** Both steps gate on
`isGeneratorSelected` rather than a `runIf`, so a deselected family still
forwards the accumulated `files` chain that `blackboard-export` and
`save-zip-to-course` read from its tail. Sabotage confirmed this: re-pointing
the current-events `files` binding one step earlier turned the chain test red
immediately.

**Limits.** Three files outside the intended scope had to change, recorded
here rather than hidden. `step-categories.ts` gained 2 lines because
`registry.structure.test.ts` requires every registered step type to be
categorised. `presets.course-build.test.ts` and
`presets.course-build.scope.test.ts` hard-code exact step indices and were
RE-POINTED, not weakened - every removed assertion has an updated counterpart
(`stepIndex` 6->8 and 5->7, `noCodeTypes.length + 4` -> `+ 6`,
`buildTypes[6..7]` -> `[8..9]`) and new assertions were added for the two new
steps; this was verified by reading the diff directly, not accepted on report.
Whether either generator produces GOOD content is unverified - only the
wiring, the selection gate and the pass-through behaviour are covered.
`types.ts`'s `sortOrder` doc comment still lists the old scheme and does not
mention the new 6.6/6.7 values.

**AC5 - both families are IN THE DEFAULT RUN, deliberately, and that carries a
real cost.** Because "blank means ALL" (AC2), a run with no explicit output
selection now performs TWO additional per-week LLM fan-outs: a Q&A pass and a
multi-topic web-research pass. On a 16-week course that is roughly 32 extra
model calls per full build, one family of which does live web research - a
substantial increase in wall-clock time and model spend over the pre-change
default. This was raised with the instructor when a regression pass flagged
that no entry recorded it, and the instructor's explicit decision (2026-08-03)
was to LEAVE IT IN THE DEFAULT RUN rather than make the two new families
opt-in. Recorded here so the cost is a known, chosen property rather than a
later surprise; anyone reversing it should change the default selection, not
the pass-through wiring in AC4.

## 192. The chat bot grounds on the institution or class a question names

**AC1 - the trigger is an ENTITY NAMED IN THE QUESTION.** `resolveChatEntities`
(`src/lib/chat/entity-grounding.ts`) matches registered institution acronyms
and the user's own courses against the message text. Institution matching is
whole-word and case-insensitive, so `"ASUS laptops"` and `"gcurriculum"` do
NOT resolve ASU or GCU - the single biggest false-positive risk, since
acronyms are two to five letters. Courses match on course code with tolerant
spacing (`"BIT 320"` and `"BIT320"` both hit) and on full name subject to a
minimum-length floor, so a course literally named "AI" cannot hijack every
message that mentions AI - its CODE still matches.

**AC2 - naming a class pulls in its institution.** A resolved course
contributes its own `institution` to the result, so asking about a class also
brings that institution's knowledge pages into scope - which is usually what
the answer needs (late-work policy, grading rules).

**AC3 - the deictic fallback is narrow.** "this institution" / "this school"
resolves to the client-supplied active institution and marks the result
`viaFallback`. An unrelated message does NOT ground merely because an
institution is active - grounding every turn would burn tokens and drag
irrelevant policy into plain questions. An explicitly named institution always
beats the active one.

**AC4 - the institution set is derived SERVER-SIDE; the client hint is never
an access key.** The user's registered institution list lives in localStorage
(`src/lib/institutions.ts`), so the server cannot enumerate it. The candidate
set is instead the distinct non-null `institution` values across the user's
own course rows UNION their own `institution_pages` rows, both scoped by
`userId`. The client's `activeInstitution` is validated against that derived
set and silently ignored otherwise. An anonymous session (no userId) gets NO
grounding at all.

**AC5 - the block is framed as reference, not instruction.** Knowledge page
bodies are free text the instructor authored and can read like commands, so
`buildGroundingBlock` prepends a fixed header telling the model to treat the
section as background record to consult, never as instructions to follow, and
the route injects it as a synthetic leading user/model exchange (mirroring the
existing `selectionChatAction` "HIGHLIGHTED TEXT" idiom) rather than folding it
into the system instruction. The block emits no markdown, since the chat is
under a plain-text-only rule, and is budgeted at 6000 characters - anchored to
the existing 4000-character `POLICY_TEXT_CHAR_BUDGET` precedent, with headroom
because this block carries both course facts and pages. Truncation is
deterministic and says so.

**AC6 - failure is non-fatal.** A failed courses or pages lookup degrades to
an ungrounded reply, matching how `getWritingStyleBlock` already behaves. The
`embedded` provider branch is untouched: it makes no model call, so grounding
there would be dead weight.

**Limits.** 26 tests cover the pure resolver and block builder; the route glue
and the client change are verified by reading only. A GAP IN THIS ENTRY'S OWN
TESTS was found by sabotage during implementation and recorded here rather
than quietly patched: removing the check that `activeInstitution` is a member
of the derived candidate set did NOT turn the suite red, because no fixture
exercised a hint outside that set. The validation was always present in the
implementation (AC4 requires it), it was merely unpinned. NOW CLOSED: a test
resolves a deictic message with `activeInstitution: "MIT"` against
`institutions: ["GCU","ASU"]` and requires an empty result, and the same
sabotage (replacing the membership predicate with `() => true`, trusting the
client hint outright) has been re-run and now turns the suite red. This is the
security boundary of the feature - without it a forged hint could name any
institution and pull its pages - so it is pinned rather than merely asserted. `SelectionChatWidget` sends
through `selectionChatAction` in `llm-tools.ts`, a structurally separate path
that never touches `/api/ai-chat`, so the highlight-text chat remains
UNGROUNDED - not a regression, but not covered by this feature either.

## 193. Attached knowledge-page docs can be previewed in place

**AC1 - the mode is chosen from mime type, with the extension as fallback.**
`attachmentPreviewMode(mimeType, fileName)` returns
`"image" | "pdf" | "text" | "unsupported"`. A specific mime type is trusted
over the extension (a PNG named `report.pdf` previews as an image). The
extension is consulted only when the mime type is empty or the uselessly
generic `application/octet-stream` - which is what the upload path itself
defaults to (`file.type || "application/octet-stream"` in AttachmentsPanel),
so a `.md` uploaded that way still previews as text rather than being written
off. Matching is case-insensitive, tolerates surrounding whitespace, and
ignores mime parameters (`text/plain; charset=utf-8`).

**AC2 - a binary Office document is UNSUPPORTED, never text.** A `.docx` is a
zip; rendering it in a `<pre>` shows binary noise and reads as a broken
preview. `.docx`, `.xlsx`, `.zip` and `application/octet-stream` with no
usable extension all resolve to `"unsupported"`, which shows an honest short
message naming the file type and keeps Download as the way to open it. No
fetch is attempted at all in that mode, so up to 6 MB is never pulled just to
be discarded.

**AC3 - it agrees with the existing classifier.** Anything
`classifyAttachmentKind` calls an image previews as an image, pinned by test,
so the two functions answering overlapping questions cannot drift.

**AC4 - the modal is its own component, not the grading one.**
`AttachmentPreviewModal.tsx` reuses the existing `preview*` class vocabulary
from page.module.css (read-only) but is deliberately NOT built on
`FilePreviewModal.tsx`, which is coupled to grading (a `student` field,
`runSubmissionCodeAction`, a RUNNABLE_EXTENSIONS code runner) - reusing it
would have dragged the code runner into the knowledge base.

**AC5 - accessibility gaps in the existing modal were closed, not copied.**
`role="dialog"`, `aria-modal="true"`, an accessible name naming the file;
ESCAPE closes; focus moves into the dialog on open and returns to the exact
triggering row button on close (captured from `event.currentTarget`, not
`document.activeElement`). `FilePreviewModal` does none of this; the gap was
deliberately not carried over. Text mode caps rendering at 200,000 characters
with a `previewNotice` when truncated - the fetch is never truncated, so
Download always gets the whole file. The object URL is revoked on close and on
attachment change.

**Limits.** Only `attachmentPreviewMode` is unit-tested (12 tests); the modal
and the panel wiring are verified by reading. One sabotage (removing
`application/octet-stream` from the generic set) was only coincidentally
caught, because a non-generic `application/octet-stream` still resolves to
`"unsupported"` by the mime branch - noted as a double-cover, not a gap.

## 194. The Significance of the Material document has a fixed shape

**AC1 - the shape.** A short opening paragraph, then exactly THREE bullets,
then a short closing paragraph. Previously it was "3-5 short paragraphs" with
no bullets. `SIGNIFICANCE_BULLET_COUNT` pins the count at 3.

**AC2 - the prompt was changed consistently.** Both the structure instruction
and the trailing formatting rule in `weekly-significance.ts` changed together;
the previous text asked for paragraphs in one sentence and forbade other
headings in another, and a half-change would have produced neither shape.

**AC3 - the EMBEDDED branch was changed too, and it is the only guaranteed
one.** That provider makes no model call and built its text inline in the
action, so a prompt-only change would have left it emitting the old
paragraphs-only shape forever. The text now comes from
`buildEmbeddedSignificanceDocument` in a plain module, and a test asserts its
output satisfies `significanceShapeIssues` with zero issues - the one branch
whose output CAN be guaranteed is therefore actually guaranteed. It omits the
period entirely when the case study has none, rather than emitting an empty
paren or a literal "null".

**AC4 - the helpers live outside the action because they must.**
`weekly-significance.ts` carries `"use server"` and may export only async
functions; `significance-document.ts` is a plain module. `tsc` and vitest both
pass violations of that rule through - only `next build` catches them.

**AC5 - bullets already render correctly in both renderers, verified not
assumed.** `buildDocxFromPlainText` (via `docx-blocks.ts`) already strips
`- `/`* `/`1. ` markers and emits real Word bullet paragraphs;
`markdownLiteToHtml` already wraps such lines in `<ul><li>`. NO change was
needed to `docx.ts` or `markdown-lite.ts`, so no existing caller's rendering
moved. This was checked by reading both, because the failure mode - literal
"- " characters in a Word document handed to students - is visible and
embarrassing.

**Limits.** `significanceShapeIssues` deliberately does its own block
accounting rather than reusing the lenient parser, so malformed cases (two
bullet lists, two closing paragraphs) are caught instead of silently merged.
Nothing verifies that the MODEL obeys the new prompt - only the embedded
branch is guaranteed, and only the shape, never the quality, of any output.

## 195. Checklist items can repeat daily or monthly

**AC1 - two new kinds on one object shape.** `WeeklyChecklistDeadline` gains
optional `frequency` (`"daily" | "monthly"`) and `dayOfMonth`, keeping the
established ONE-SHAPE-PLUS-OPTIONAL-FIELD convention rather than becoming a
discriminated union - two live consumers read `.weekday` unconditionally, and
every pre-existing payload must keep parsing and keep meaning weekly.
`ChecklistDeadlineKind` gains `"daily"` and `"monthly"`; the existing
`"recurring"` was NOT renamed to `"weekly"`, per that module's own deferred-
rename note. Precedence: a present `date` means one-off and WINS over any
frequency; an unrecognised frequency degrades to `"recurring"`. Both round-trip
through the jsonb column via `coerceDeadline` with the same precedence on read.

**AC2 - a daily or monthly check applies to its own period, WITHOUT mutating
anything.** `isChecklistItemCheckedNow(item, nowMs)` is a READ-TIME
computation: a daily check counts only for the calendar day of `checkedAt`, a
monthly one only for its calendar month. Weekly and one-off items are
unchanged and stay checked until reset. The stored row keeps `checked` and
`checkedAt` untouched - so there is no write path, no migration, no background
job, and the module's documented "no implicit clearing anywhere in this
module" invariant remains literally true. A checked item with no `checkedAt`
(rows predating that field) counts as checked, never silently unchecked, which
would look like data loss.

**AC3 - the toggle flips the EFFECTIVE state.** A daily item whose raw
`checked` is stale renders as unchecked; flipping the raw flag would have left
it still looking unchecked. `toggleWeeklyChecklistItem` now decides from
`isChecklistItemCheckedNow`, so clicking a visually-unchecked box checks it.
This was found during implementation, not specified up front, and carries its
own regression test.

**AC4 - monthly clamps to a real calendar day.** Day 31 in a 30-day month
resolves to the 30th; day 30 in February resolves to the 28th. Rolling into
the next month is the classic bug here and is pinned by test.
`buildMonthlyChecklistDeadline` rejects a day outside 1-31 or non-integer
rather than storing nonsense.

**AC5 - calendar fan-out is bounded for daily, normal for monthly.** A daily
item emits events only for the Sunday-anchored calendar week containing today,
further clamped by the course term - never more than 7 events, verified across
a January-April term. Without that bound a 16-week course would put roughly
112 real events per item into a Google Calendar. Keys are
`checklist-<id>-d<YYYY-MM-DD>`, so a same-week re-sync updates in place and a
week rollover produces a clean create/delete split with zero orphans, proven
against the real `diffPlannedEvents`. Monthly uses a term-relative
`checklist-<id>-m<N>`, mirroring the existing weekly `-w<N>` scheme.
`RECOGNIZED_KEY_PATTERN` learned both new shapes - without that, the diff
cleanup stops recognising keys it should delete and orphans accumulate in a
real calendar.

**AC6 - every display and count site was audited.** Switched to the
period-aware check: `summarizeWeeklyChecklist`, `isWeeklyChecklistItemOverdue`,
the toggle's flip decision, `countOpenWeeklyChecklistItems` /
`countCheckedWeeklyChecklistItems` (now taking an OPTIONAL `nowMs`, so
untouched callers keep compiling and keep their exact prior meaning),
`buildWeeklyChecklistOverviewRows`, and WeeklyChecklistCell's checkbox, label
and count. Deliberately left on the raw flag, with reasons: `confirmResetAll`'s
`affected` filter (calendar-sync relevance, not display),
`resetAllWeeklyChecklistChecks` itself, and `courses-table-helpers.ts`'s sort
column, whose own comment states it is intentionally time-independent.
`WeeklyChecklistOverviewModal` inherits the fix through `row.checked` and
needed no edit.

**Limits.** The two instructor-facing decisions here (auto-clear per period,
and daily-calendar-current-week-only) were chosen by the instructor, not
derived. The UI additions in `WeeklyChecklistCell.tsx` are verified by reading
only. Nothing verifies behaviour against a real Google Calendar; the orphan
claim rests on `diffPlannedEvents` unit tests. Noticed and NOT fixed:
`checklistCalendarBlockers`'s doc comment still says its cell wiring is left
to a later wave, though that wiring already exists.

## 196. Module titles stop accumulating, and a topic with no subject matter stops producing confident output

Reported as: a 45-slide Week 8 lecture deck for "INFO 1020 - Computer Science
Principles" that had nothing to do with object-oriented programming. It
taught "Object-Oriented Logic Mapping" - a Google Sheets exercise mapping
"health objects" to municipal resources for city health policy. Internally
coherent, structurally correct, about a subject that does not exist.

**AC0 - the evidence chain, established by running the real code on the real
files, not by reading.** (a) The instructor's genuine Canvas export parses
CORRECTLY: `parseCartridgeBlob` against the actual `.imscc` returns 12 modules
with full names, including `Module 08 - Survey of Object Oriented Programming`.
The parser is not at fault. (b) That run's schedule nonetheless carried
`topic: "Module 08: Module 08"`, and its log recorded digesting ELEVEN module
names - a different, degraded source. (c) The Common Cartridge that run
GENERATED contains module titles `Module 02: Module 02: Module 02` and
`Module 08: Module 08: Module 08` - THREE levels where its input had two.
(d) `courseKind` resolved to `applied`, which is why every artifact was
spreadsheets and policy rather than code.

**AC1 - the loop, fully traced.** `steps.lms-export.ts`'s `blackboard-export`
step builds a cartridge whose modules are titled `Module NN: <topic>`, then
calls `helpers.saveCourseExportFile(...)`, which resolves through
`server-runner.ts` to `uploadCourseZipChunked` plus
`appendCourseExportFileAction` (`course-hub-core.ts`) and appends it to the
course tile's exports list. On the read side,
`steps.course-schedule-from-source.ts`'s `tile-export` source (and its
`course-cartridge` source) take THE NEWEST saved export, download it, and run
`parseCartridgeBlob` to build the next run's schedule. The app's own freshly
written output is by construction the newest export, so it always wins over an
instructor's real upload. Output becomes input, and each pass adds one more
`Module NN: ` prefix. The instructor's real subject was overwritten runs ago.

**AC2 - title composition is now IDEMPOTENT.** `composeModuleTitle(topic, week)`
(`src/lib/module-title.ts`) peels leading structural labels REPEATEDLY until
none remains, then composes once - so composing a title from its own output
any number of times yields the same string, pinned by a self-application test
applied three times. `planCartridgeModules` in `week-numbering.ts` delegates
to it instead of unconditionally prefixing. Required behaviours, each tested:
`"Survey of Object Oriented Programming"` at week 8 still yields
`"Module 08: Survey of Object Oriented Programming"`;
`"Module 08 - Survey of Object Oriented Programming"` - the instructor's REAL
title - does NOT gain a second label and keeps its subject; a label-only topic
collapses to bare `"Module 08"`, identical to how an empty topic is handled,
since neither carries information beyond restating its own position; and a
MISMATCHED label (`"Module 07: Recursion"` at week 8) is deliberately NOT
stripped, because a mismatch is real evidence something upstream put the wrong
content in this slot and silently discarding it would erase the only signal.
The leading-label detector is anchored, so
`"Comparing Module 07 and Module 08 approaches"` is real subject text even
though it names a module number equal to the current week.

**AC3 - a topic with no subject matter no longer produces confident output.**
`isPlaceholderTopic` (`src/lib/schedule-topic-quality.ts`) detects a topic that
carries no subject: blank, pure course furniture, a bare structural label, or
a label followed only by another label or furniture. It splits on `"; "`
(courseStructureToSchedule's own joiner) and is a placeholder only when EVERY
segment is empty - one real segment keeps the whole topic real.
`isFileManifestSummary` detects the `"Covers: <file names>"` shape, including
the CIRCULAR case where a week's summary names files that same run generates
(Week 8's summary listed `INFO 1020 - Lecture Slides - Week 8.pptx`, the deck
citing itself, which is why the generated deck's own agenda slide read "1.
Week 8 course announcement / 2. Module 08 lecture slides"). A placeholder
topic still PROCEEDS when real material exists - either the shared
`resolvedSourceMaterial` or the week's own non-manifest summary - so a badly
named module with real content is not refused. Only "placeholder AND no
material" is refused, and then only that week: its topic and summary are
cleared, reusing the existing "blank topic = skip this week" convention, and a
note naming the week is surfaced through the schedule summary's existing
`notes` field. One unusable week never aborts the run.

**AC4 - the guard is DEPTH-INDEPENDENT, which it was not when first written.**
The first implementation caught exactly one level: `"Module 08: Module 08"` was
flagged but `"Module 08: Module 08: Module 08"` passed as a real topic. Since
the instructor's tile already held THREE levels, the guard would have waved the
live corruption straight through while appearing to work. Verified by calling
the shipped function directly rather than trusting its report. It now peels
repeatedly, sharing the peel-to-fixed-point loop with `module-title.ts` through
an exported `peelRepeatedly` so there is one implementation of that algorithm
rather than two that can drift, while each file keeps its own vocabulary-
specific single step. Peeling here is NUMBER-AGNOSTIC (the guard has no week
in hand and is asking "is there any subject at all"), which continues the
original single-level policy rather than changing it. Termination is
guaranteed twice over: each peel returns either null or a strictly shorter
string, and the loop independently stops if a step fails to shrink.
Independently re-verified across depths 1-4, mixed separators, a deep stack
that ENDS in real subject matter (which correctly passes as real), a passing
mention, and every one of the instructor's ten genuine module titles.

**Limits.** These two fixes stop the corruption COMPOUNDING and stop confident
generation from an empty topic. NEITHER closes the loop itself: the app still
writes its generated cartridge into the tile's export slot and still reads the
newest export back as a schedule source. That is recorded as outstanding work,
with both viable remedies identified (mark app-generated cartridges so a
schedule source refuses them, or never write a generated cartridge into that
slot). NEITHER repairs an already-corrupted tile - the INFO 1020 tile still
holds an 11-module app-generated cartridge in place of the instructor's
12-module Canvas export, and re-uploading alone will not hold while the newest
export always wins. The THIRD contributing factor is also outstanding and
confirmed: `sourceDerivedKind` in `steps.course-schedule-from-source.ts`
resolves to `"applied"` for every source except `codebase`/`tile-repo`, and
nothing inspects the course name, so "Computer Science Principles" defaults to
applied unless the tile's `courseKind` column is explicitly set. All three
were deliberately kept out of these fixes so they would not tangle. One
sabotage of `composeModuleTitle` went uncaught (a redundant `.trim()` whose
effect the regex already covers) and is recorded rather than hidden.

## 197. BACKFILL - one cumulative zip at the end, carrying the run's complete log (commit 807ae01)

Recorded late. This feature shipped without an entry, which meant the
regression gate was reading a document that did not describe the current code
- exactly the false-clean failure this document exists to prevent. Written
from the code and from a fresh trace, not from the original session.

**AC1 - one download per run, not one per course.** `pendingRunDownloads`
accumulates across the whole run and is flushed once at the true end
(`useWorkflowRun.ts`), rather than firing a browser download per fanned-out
course.

**AC2 - the embedded log is completed, not a snapshot.** The log inside a
`save-zip-to-course` archive used to be frozen at the moment that step ran -
step 19 of 22 in a real run, so its own outcome and everything after it were
missing. `finalizeRunDownload` now fetches
`getCompleteRunLogTextAction(workflowRunId, ok)` AFTER every fan-out group's
step loop has finished and been await-logged, then `patchEmbeddedRunLog`
reopens the `savedZipRef`-tagged entry and overwrites
`Course-Wide/Run Log.txt` with the complete text; `withTopLevelRunLog` adds a
top-level `Run Log.txt` for multi-artifact zips.

**AC3 - the terminal fields are synthesized, because finishWorkflowRun has not
run yet.** `buildCompleteRunLogText` (`zip-run-log-completion.ts`) derives
`status`, `finishedAt`, `durationMs`, `stepCount` and `errorCount` from `ok`
plus the fetched steps rather than reading them off a run row that is not yet
final.

**Limits - a REMAINING, VERIFIED GAP.** `buildCompleteRunLogText` does NOT
synthesize `run.detail`; it inherits it verbatim from `getRun()`. `detail` is
written ONLY by `finishWorkflowRun`, and the ordering is deterministic, not
racy, in both loops: attended, `finalizeRunDownload` is awaited to completion
before `finishWorkflowRun` fires; unattended, `completeCourseZipRunLogs` runs
inside `runWorkflowUnattended` before it returns, while every caller computes
`detail` only after that returns. So the `Detail:` section - the course
fan-out summary and deduped failure list, the most useful part of the log on a
failed run - is deterministically EMPTY in every downloaded zip. Not covered
by any test: `zip-run-log-completion.test.ts`'s fixture hardcodes
`detail: null`. A fix spans `zip-run-log-completion.ts`,
`automation-runs.ts`, `useWorkflowRun.ts` and `server-runner.ts` plus its
callers, and is outstanding. Also stale, not fixed:
`steps.course-setup.storage.ts`'s `buildRunLogSnapshotHeader` comment and its
embedded SNAPSHOT NOTICE still claim the downloaded copy can never be updated,
which AC2 made untrue for the attended path.

## 198. Course Build decks read item BODIES, and the graded assignment anchors the week

**AMENDED - see entry 199. Three defects in AC3/AC5 were found against real
data after this entry was written and are fixed there.**

Reported as: "the course build ppt pulled way too much from the
non-assignment content, and way too little from the actual assignment." The
Week 8 deck for INFO 1020 had five sections, three of which were LMS
housekeeping pages - "Module 08 Objectives and Tasks", "Module 08 Learning
Materials", "Module 08 Discussion Forum" - with slides teaching that a
discussion forum exists. There was no section for the assignment at all.

**AC0 - the mechanism, established by running the real code on the real
export.** `CartridgeModuleItem` was `{ title, type }`, with no body field, and
BOTH course-export branches in `registry-helpers.sources.ts` emitted only
`` `${item.type}: ${item.title}` ``. So the deck was written from a table of
contents. Meanwhile `gatherLiveModuleItems` immediately below already did
proper per-item content pulls for the LIVE-LMS source - the export source was
structurally blind in a way the live source was not. The run log said it
plainly: `digested 11 course-export module name(s) and item titles`,
`sourceMaterial: (empty)`, `selectedAssignments: (empty)`. With seven equal
title strings and no bodies, six of them housekeeping, the generator turned
the housekeeping into sections. The real assignment body was present in the
export the whole time at
`g7db8c94d1acfa7b47cf79a901fe19f1f/module-08-assignment.html` and named
`mod10.zip`, Try It Out on Page 330 (10.38-10.45), a `####.png` screenshot
convention and a GitHub submission - none of which appeared in the 48 slides.

**AC1 - the cartridge carries item bodies.** An item's `identifierref` (Canvas
`module_meta.xml`) or `identifierref` attribute (generic Common Cartridge) is
joined to the manifest's `<resources>` block, taking the resource's own `href`
first and then each `<file href=...>` child, keeping the first `.html`/`.htm`
candidate; that file is read from the zip, stripped to text and capped at
`MAX_CARTRIDGE_ITEM_BODY_CHARS` (3000). An item with no resolvable resource
keeps an empty body rather than failing. Title and module-name extraction are
UNCHANGED - they were already correct and verified. `identifierref` is
deliberately kept OFF the public `CartridgeModuleItem` shape (carried through
an item-identity-keyed Map consumed inside `parseCartridgeBlob`) because this
app's own `buildModuleMetaXml` always emits one, so an optional public field
would have broken existing `toEqual` fixtures. No existing caller of
`parseCartridgeBlob` needed a change: every one reads only `.title`/`.type`.

**AC2 - the export branches emit bodies.** Both branches route through a
shared `formatExportModuleMaterials`, reusing `DESCRIPTION_FETCH_LIMIT` (6) as
a cross-module body budget with the same "further ... omitted (N more)" note
convention `gatherLiveModuleItems` already uses. Titles are never dropped -
only body text beyond the budget is.

**AC3 - items are classified, and administrative shell cannot become a
section.** `classifyCourseItemKind` (`src/lib/course-item-classifier.ts`)
sorts an item into assignment / quiz / instructional / administrative from
type family plus generic title vocabulary, never from literal titles - proven
by a second, differently-named fixture set (MATH 2010: Homework, Midterm Exam,
Discussion Board, Icebreaker) alongside the INFO 1020 one. Unmatched items
default to instructional, so nothing is silently dropped or wrongly promoted.
The selected assignment is emitted FIRST and labelled
`"GRADED ASSIGNMENT (what students are evaluated on)"` with its body;
administrative items collapse into one compact parenthetical line rather than
each getting its own `type: title` line, which is precisely what a downstream
generator reads as a candidate section. Sabotage confirmed the causal link:
emitting admin items as titled lines again reproduces the reported bug.

**AC4 - a permissive TYPE cannot promote housekeeping to graded work.** The
first implementation checked TYPE before title vocabulary, so
`"(Optional) Module 08 Status Update"` - which Canvas stores with
`type=Assignment` - classified as an ASSIGNMENT, giving the week two competing
graded items and an ambiguous anchor. That is the reported defect in a new
shape. Two demotion signals now run BEFORE a type-matched assignment is
returned: a leading `(Optional)`/`[Optional]`/`Optional:` marker
(`hasLeadingOptionalMarker`, sufficient on its own), and a narrower
participation vocabulary that deliberately EXCLUDES "discussion" and is
skipped when the title also carries explicit assignment vocabulary. Excluding
"discussion" outright rather than guarding it is load-bearing:
`"Graded Discussion Post"` has no assignment word for a guard to key on, so a
guard alone would still have demoted it. Verified against the real export:
`(Optional) Module 08 Status Update` -> administrative,
`Module 08 Assignment` -> assignment, and `Discussion Assignment`,
`Graded Discussion Post`, `Week 3 Discussion Essay` all -> assignment.

**AC5 - anchor selection is deterministic and total.**
`selectAssignmentAnchor` picks by first difference: prefer non-optional, then
the longer body, then first-in-module order as a stable tiebreak. It returns
null only for an empty list, never throws, and reports only strict
improvements so it cannot oscillate. Any other assignment-kind item still
appears, just not as the anchor.

**Limits.** Everything here is verified by unit test and by running the
parser/classifier against the instructor's real `.imscc`; NO deck was
regenerated to confirm the slides actually improve, because this app cannot
run locally. That the generator makes better use of a labelled anchor and real
bodies is an expectation, not a measured result. Two items legitimately carry
no body: Canvas stores discussions as topics and quizzes as QTI, not as HTML
resources, so `Module 08 Discussion` and `Module 8 Chapter 10 Quiz` extract
empty - harmless today since neither is instructional, but quiz content is
therefore unavailable to any future generator that wants it. A pre-existing
fixture gap was found and closed in passing: `registry-helpers.sources.test.ts`
gave its status-update item `type: ""` rather than Canvas's real `Assignment`
type, so it never exercised the type-shadow path and passed both before and
after the AC4 bug. Two of eight sabotages on the AC4/AC5 work were initially
UNCAUGHT (the "not also assignment-titled" guard, and the anchor tie-break
direction); both were genuine coverage gaps, both were closed with new tests
and re-confirmed, and both are recorded here rather than hidden.

## 199. AMENDMENTS to entries 190 and 198, after the regression gate failed them

**SUPERSEDED IN PART - see entry 200. A second regression pass falsified three
of this entry's claims (the gate-inversion guarantee, the off-domain probe
evidence, and the every-added-tag-is-literal claim). Read 200 for what shipped.**

Entries 190 and 198 were written from the implementations as first delivered.
A regression pass then ran both against real data and found 190 outright
broken and 198 wrong on the instructor's own export. Both were fixed before
this batch pushed. The original entries are LEFT IN PLACE as the record of
what was attempted and why; this entry states what actually shipped, and
supersedes them where they disagree.

**190 was a genuine FAIL, reproduced against its own fix.** The distinctiveness
test was applied as a PRE-FILTER over candidates before ranking, so it could
only ever REMOVE candidates - eliminating a high-scoring correct entry tagged
with single words while a low-scoring wrong entry that happened to hit one
phrase tag survived and won by default. The filter inverted the ranking
instead of qualifying it. Reproduced by calling the shipped
`matchCaseStudyLibraryEntry` on Denver's OWN library text:

    denver-baggage:  score=2  matched=["scope","testing"]        distinctive=FALSE
    healthcare-gov:  score=1  matched=["integration testing"]    distinctive=TRUE
    RESULT: healthcare-gov

Denver's own lesson sentence says "skipped integration testing" - a phrase tag
belonging to Healthcare.gov. Entry 190 AC3's premise, that a multi-word phrase
is "intrinsically hard to hit by coincidence", is FALSE for this library:
`risk management`, `quality assurance`, `integration testing`, `decision
making`, `supply chain` and `iterative delivery` are generic project vocabulary
that recur across unrelated entries' own prose while each asserting one named
case. Measured: only 2 of 12 entries matched themselves, and 3 of 12 resolved
to a DIFFERENT case. It also silently gutted an earlier guarantee - entry 160
AC3's "facts come from a curated library, not model recall" - because with
10/12 entries failing to match their own text, nearly every week fell through
to the LLM branch.

**190 AS SHIPPED: score first, gate second, and gate only the winner.** Every
candidate is scored as before; a single winner is chosen by a total
deterministic tiebreak (higher score, then phrase-backed over word-only, then
declared order); the qualification test is applied to THAT WINNER ALONE, and a
rejected winner returns null rather than falling back. A worse candidate can
now never beat a better one - that structure, not the threshold, is the fix.
Qualification is a weighted evidence floor: `qualifyingEvidenceScore` = 3 per
matched phrase tag + 1 per matched word tag, against `QUALIFY_FLOOR = 4`. A
lone generic phrase scores 3 and is therefore NOT sufficient alone; it needs
corroboration. The phrase signal was reweighted, not discarded - phrases still
outweigh words and still win ties, they just no longer bypass the floor.
Reaching an 11/12 self-match also required adding tags to 9 entries, each a
word or phrase LITERALLY PRESENT in that entry's own existing text (Denver's
organization field already says "baggage system"; Big Dig's summary already
says "epoxy"; Challenger's already says "O-ring") - curation, not fitting to
the test.

**190 verified independently, not accepted on report.** Calling the shipped
function over the real library: **self-match 11/12, cross-contamination 0, one
accepted miss (`citytime`, whose own write-up genuinely reuses only one of its
own tag words - documented in code rather than padded with invented tags).**
All six off-domain probes return null, including two the implementer never
tested: "Web Application Security", "Cybersecurity: threat modeling", "Sprint
planning and iterative delivery", "Quality assurance basics", "Introduction to
Python", "Object Oriented Programming". Entry 160 AC3's curated-library
guarantee is restored on that evidence.

**Three tests were DELETED, deliberately.** `case-study-match.test.ts`'s "one
matched phrase tag is self-sufficient evidence", "a small weak-only entry
needs ALL of its single-word tags (3 of 3)", and "a large weak-only entry
needs 5 of its 6 single-word tags" all asserted the SHAPE of the replaced
mechanism, and the first asserted the defect itself. They were removed rather
than rewritten, with the full reasoning left as a comment at their former site
so they are not reinstated by someone reading git history as lost coverage.
The contract they reached for is now covered at a higher level by the "score
first, gate second" describe block and by the data-driven self-match suite
that loops the real `APPLIED_CASE_STUDIES`.

**198 passed its stated ACs but was WRONG on the instructor's real export.**
Three defects, all of the same class as the bug 198 set out to fix, all now
closed and re-verified against that export:

1. The `GRADED ASSIGNMENT` anchor preferred the LONGEST BODY, so Module 05
   anchored on `"Code Walk 1 of 2"` (body 1191) instead of
   `"Module 05 Assignment"` (1122), and Module 10 on `"Code Walk 2 of 2"`
   (1164) instead of `"Module 10 Assignment"` (612) - 2 of the 10 numbered
   modules anchored on a supplementary activity. FIXED with an
   `echoesModuleLabel` tier placed between "prefer non-optional" and "prefer
   longest body": an item whose title carries the SAME module number as the
   module's own name wins, derived with the same `MODULE_NUMBER_PATTERN`
   idiom `findModuleByNumber` already uses, so it generalises to any
   "Module NN"/"Week N" naming rather than being a title list. Pinned by a
   test asserting exactly ONE `GRADED ASSIGNMENT` marker, that it names
   `Module 05 Assignment`, that it does NOT name `Code Walk 1 of 2`, and that
   Code Walk still appears as a plain assignment line rather than being
   dropped.
2. `"Sign up for Group Project Groups"` (a `WikiPage`) was PROMOTED to
   assignment because "project" is assignment vocabulary. FIXED with a
   `TITLE_ACTION_PATTERN` (sign up, register, office hours, status update,
   icebreaker, introduce yourself, check-in, survey) checked unconditionally
   and BEFORE the assignment vocabulary, mirroring how the leading
   `(Optional)` marker already demotes. `"Week 3 Discussion Essay"` and the
   other counter-examples are unaffected because they carry no action
   vocabulary.
3. `"Getting Started"` (a `WikiPage` with a 1398-character body) was demoted
   to administrative and its body DISCARDED into the one-line parenthetical.
   So AC3's claim that nothing is "silently dropped or wrongly promoted" was
   false in BOTH directions. FIXED with a `TITLE_AMBIGUOUS_ADMIN_PATTERN`
   (announcements, orientation, getting started, welcome) that demotes ONLY
   when the item lacks a substantial body (threshold 200 chars, well clear of
   the real 1398 so it is not tuned to it). A further gap was found in
   passing: the instructional branch emitted `type: title` only, so even
   correctly-classified content pages never passed their bodies through -
   every instructional item's resolved body now rides along after its title.

**198 verified against the real export after the fix:** `Getting Started` ->
instructional (body preserved), `Sign up for Group Project Groups` ->
administrative, `GitHub Sign Up` -> administrative (a correct side effect of
the same action rule), and every prior case unchanged -
`(Optional) Module 08 Status Update` -> administrative,
`Module 08 Assignment` -> assignment, `Module 08 Objectives & Tasks` and
`Module 08 Learning` -> instructional, `Module 08 Discussion` ->
administrative, `Module 8 Chapter 10 Quiz` -> quiz, and the three discussion
counter-examples still assignments.

**Limits.** 190's self-match figure is measured against the library's own
text, which is a necessary but weak proxy for "picks the right case for a real
teaching week" - it proves the matcher is no longer self-inconsistent, not
that its picks are pedagogically good. The library still contains no
cybersecurity entry (entry 190's original Limits), so a security course still
correctly reaches the LLM fallback every week; that remains a CONTENT gap.
198's heuristics are still validated against exactly ONE real export, and no
deck was regenerated to confirm the slides actually improve - the chain from
"better input" to "better slides" remains an expectation, not a measured
result.

## 200. AMENDS entry 199, after a SECOND regression gate failed it

**CORRECTED - see entry 201. A third gate found the Module 07 statement false,
the 87-item differential over-read, and three behaviours unrecorded.**

Entry 199 was written from the first round of fixes. A second regression pass
then found three of its load-bearing claims false, one of them against an
input from its own named probe family. This entry states what finally shipped
and supersedes 199 where they disagree. 199 is left in place as the record of
what was attempted; the pattern of it being wrong twice is itself the useful
part, and is why the Limits below are stated the way they are.

**199's three false claims, and what was actually wrong.**

**(a) The gate-inversion guarantee was FALSE.** 199 claimed a worse candidate
"can structurally never beat a better one". It could. The fix ranked
candidates by RAW MATCHED-TAG COUNT but gated the winner by
`qualifyingEvidenceScore` - two different measures, so they disagreed.
Reproduced on the real library:

    ("Cybersecurity: threat modeling",
     "Students build a threat model and a risk management plan for a web app,
      with quality assurance.")
      -> denver-baggage     (raw 2, evidence 4)   RETURNED
         deepwater-horizon  (raw 2, evidence 6)   passed over

Both scored 2 on raw count, so declaration order decided and the
weaker-evidenced entry won. Synthetically: A(raw 3, ev 3) vs B(raw 2, ev 6)
returned null, SUPPRESSING a candidate that qualified on its own. This is the
same class of defect as the original pre-filter inversion, merely relocated
from the filter into the ranking/gate mismatch.

**(b) The off-domain evidence was DEGENERATE.** Two of the six probes 199
cited passed an EMPTY summary. With an empty summary a lone phrase scores 3
against a floor of 4, so those assertions could not fail - they were
tautological. The real caller passes `week.topic, week.summary ?? ""`
(`case-study-plan.ts`), so an empty summary is not the normal case. Given one
ordinary corroborating word, they flipped: `("Quality assurance basics",
"unit testing")` returned denver-baggage, and `("Web Application Security",
"...public launch... quality assurance.")` returned healthcare-gov - entry
190's ORIGINAL headline defect, still live at the time 199 declared it fixed.

**(c) The self-match number was PARTLY BOUGHT.** Tags added to reach 11/12
created new false positives: `("Call center operations", "Managing call
volume, staffing, and service levels in operations.")` -> london-ambulance-cad,
and `("Code review practices", "Adopt a review process for requirements and
communication between teams.")` -> mars-climate-orbiter-pm.

**AS SHIPPED - one metric, end to end.** `matchBestByTopics` now computes
exactly ONE number per candidate, `rankingScore(matchedTopics,
requireDistinctiveMatch)`: the weighted evidence score under the flag, plain
raw count otherwise (so the coding bank's default path is byte-identical -
its gate never runs). That same number ranks the candidates AND is what the
gate checks. There is no second measure left in the function for the two
steps to disagree about, which is a stronger property than the previous
"gate only the winner" fix - that one still had two metrics. Tiebreak, total:
higher rankingScore, then higher raw match count, then declared order.
`QUALIFY_FLOOR` raised 4 -> 5, because unifying the metric alone did not close
(b): healthcare-gov reached evidence 5 on "launch" + "quality assurance" once
the degenerate empty-summary probes were replaced with realistic ones.

**Tags retuned, and one honest correction to 199.** Removed as false-positive
fuel: `operations` (london-ambulance-cad), `requirements` and `communication`
(mars-climate-orbiter-pm), `web` (healthcare-gov), `software` (fbi-sentinel),
`risk management` (deepwater-horizon). Added as self-evidence for the raised
floor, each a verbatim phrase from that entry's OWN write-up: `single owner`,
`warning signs`, `waterfall contract`, `inadequate inspection`,
`changed sponsors`, `prime contractor`. ONE EXCEPTION, which 199's blanket
claim that every added tag is "literally present in that entry's own existing
text" did not survive: `scope creep` was added to denver-baggage as
THEMATICALLY apt rather than literal, to keep an out-of-scope caller test
(`case-study-plan.test.ts`'s "Scope Management" case) passing once the floor
rose. That is a real departure from the stated rule and is recorded rather
than glossed.

**Measured independently, not accepted on report.** Calling the shipped
function over the real library: **self-match 11/12, cross-contamination 0**,
one accepted miss (`citytime`, evidence 1). All five previously-leaking inputs
now return null. Eight FRESH probes written after the fix and never seen by
the implementer: `Object Oriented Programming`, `File I/O and Big Data`,
`Algorithms and Data Structures`, `Database normalization`, `Network security
fundamentals`, `Technical writing for engineers`, `Intro to spreadsheets` all
return null; on-domain controls still match (a Denver-flavoured week ->
denver-baggage, a Challenger-flavoured week -> challenger).

**A residual characteristic, deliberately NOT tuned away.** Phrase weight is 3
against a floor of 5, so TWO generic phrase tags alone clear the bar. An
"Agile retrospectives" week mentioning "schedule pressure" and "decision
making" resolves to challenger. That was initially written down as a leak and
is recorded here as a JUDGEMENT: Challenger is the canonical
decision-making-under-schedule-pressure case, so for a project-management
library that is a defensible match rather than a false positive. Tightening
further would start costing self-match. Anyone revisiting this should decide
deliberately rather than assume it was an oversight.

**198's action rule was ALSO over-broad, and is now grammatical rather than
lexical.** `TITLE_ACTION_PATTERN` demoted unconditionally on any title
containing `survey` or `register`, so `"Survey Design Assignment"`,
`"Literature Survey"`, `"Shift Register Lab"` and `"Register Allocation
Homework"` all became administrative with their bodies DISCARDED - and so
would `"Survey of Object Oriented Programming"`, which is this very
instructor's own Module 08 name and was a section title in the originally
reported bad deck. The mirror image of the bug the rule was added to fix.
Fixed in two stages: `survey`/`register` moved into a GUARDED
`TITLE_AMBIGUOUS_ACTION_PATTERN` (demote only when the title carries no
explicit assignment word AND the item has no substantial body - both guards
verified independently load-bearing, 4 of the 7 defect titles saved by one and
3 by the other); then, for the residual case where a title carries BOTH
ambiguous vocabulary and an assignment word - `"Register for Your Homework
Partner"` (logistics) versus `"Register Allocation Homework"` (graded) - a
GRAMMATICAL discriminator, since no vocabulary can separate them. Logistics
items are phrased as instructions to the student and lead with an imperative
verb plus a complement (`Register for`, `Submit your`); graded work is a noun
phrase. `TITLE_LEADING_IMPERATIVE_PATTERN` is anchored to the title start and
REQUIRES the for/to/your complement - without it, "Register" alone opens both
titles identically. It is consulted only AFTER the ambiguous-vocabulary gate
already passed, so its deliberately broad verb set cannot reach an ordinary
title: `"Submit your final project"` with a substantial body classifies as an
assignment because "final project" carries no ambiguous vocabulary at all.
The body guard remains absolute and is NOT overridable by phrasing. This was
implemented by extracting one shared `isAmbiguousLogisticsTitle` used from
both existing call sites rather than adding a fourth parallel demotion
mechanism.

**Verified against the real export by differential comparison, not by
inspection.** A reconstructed pre-fix baseline classifier was run alongside
the fixed one over the instructor's actual `.imscc`: all 87 items across 12
modules classify IDENTICALLY. Nine of the twelve modules carry a graded
anchor; Instructor Resources and Start Here are orientation-only, and Module
07 genuinely has no Assignment-typed item in this export - correcting an
earlier pass's claim that all 12 anchor.

**Two more files crossed the line cap and were split.**
`registry-helpers.sources.ts` (1042) and its test (1074) - neither over cap at
the start of this batch - were split by extracting the anchor/weighting unit
into `export-module-materials.ts` (273) with its own test (514) and a shared
`registry-helpers.sources.fixtures.ts` (97), leaving the originals at 809 and
517. Test count identical, 42 before and after. `MODULE_NUMBER_PATTERN` is now
DUPLICATED across the two modules rather than imported, because it is used by
code on both sides of the seam and an import back would create a cycle - the
same trade-off `blobToBase64Local` already makes in that file. That is a real
drift risk and is recorded here as such.

**Limits.** Self-match is measured against the library's own text, which
proves the matcher is not self-inconsistent - it does not prove its picks are
pedagogically good for a real teaching week. The library still contains no
cybersecurity entry, so a security course still correctly reaches the LLM
fallback every week; that remains a CONTENT gap, not a matching one. The
classifier's heuristics are still validated against exactly ONE real export.
No deck was regenerated at any point in this batch, so the chain from "better
input" to "better slides" remains an expectation rather than a measured
result. Most importantly: entries 190, 198 and 199 were each declared correct
and were each subsequently falsified by running the shipped code against real
data. The lesson recorded for anyone extending this area is that a confident
rationale in this codebase's matching and classification logic has repeatedly
failed to survive contact with the instructor's actual files, and should not
be trusted without a differential or data-driven check.

## 201. CORRECTIONS to entry 200, from the final gate

Entry 200's structural claims held - but a third gate found one statement
false, one piece of headline evidence that does not prove what it is offered
for, and three unrecorded behaviours. Recorded here because this document is
only worth anything if it is trustworthy, and this area has now been wrong on
three consecutive passes.

**What the gate CONFIRMED, by execution rather than reading.** The one-metric
claim is TRUE this time: `matchBestByTopics` is a strict argmax on
`rankScore`, with `rawCount` used only as a tiebreak and never as a gate.
Attacked exhaustively - 30,625 two-entry library pairs and 200,000 randomised
libraries of 2 to 8 entries - with ZERO violations across all three failure
modes (lower-evidence winner, qualifying candidate suppressed, below-floor
candidate returned). Self-match 11/12 and cross-contamination 0 reproduced
independently. Critically, the raise of `QUALIFY_FLOOR` to 5 did NOT kill true
positives: realistic week topics written for all twelve curated cases -
including Challenger, Healthcare.gov's integration failure and the Big Dig -
all still resolve to their own entry, 12/12. Test-count integrity across the
split verified by diffing `it()` titles: 28 -> 42, zero lost, zero renamed,
assertions 76 -> 134. The two copies of `MODULE_NUMBER_PATTERN` are
byte-identical today.

**CORRECTION 1 - entry 200's Module 07 statement is FALSE.** It says "Module
07 genuinely has no Assignment-typed item in this export". Module 07 contains
`(Optional) Module 07 Status Update`, which IS type `Assignment`. What it has
no item of is assignment-KIND, after the optional-marker demotion. The
conclusion (Module 07 carries no anchor) is right; the stated reason is wrong.

**CORRECTION 2 - the 87-item differential proves LESS than entry 200 implies.**
That differential (a reconstructed pre-fix classifier run beside the shipped
one over the instructor's real `.imscc`, 0 differences across 87 items and 12
modules) is real and valuable, but ZERO of those 87 item titles contain
"survey" or "register" - "Survey of Object Oriented Programming" is a MODULE
name, never an item title. So a 0-diff result was guaranteed whether or not
the new rules work. It is a NO-REGRESSION proof only. It is not evidence that
the survey/register guard or the leading-imperative discriminator behave
correctly; that rests entirely on constructed fixtures. Given this area has
been falsified twice by exactly this kind of over-read, the distinction is
recorded rather than left implicit.

**UNRECORDED BEHAVIOUR 1 - an off-domain leak survives at floor 5.**

    ("Secure software development lifecycle",
     "Integrating security requirements, code review, and quality assurance into
      each phase of delivery, including a pre-launch security gate before rollout.")
      -> healthcare-gov   (evidence 6: rollout + requirements + launch + quality assurance)

Not one of those four terms is specific to Healthcare.gov. This is entry 190's
ORIGINAL defect class - a security week handed a federal-website case -
surviving the raised floor. It now needs four generic hits rather than two, so
it is much harder to trigger, but the class is NOT closed. `QUALIFY_FLOOR`'s
own comment says "None of the eight reaches 5", which is true of the eight
probes tested and misleading as a general statement.

**UNRECORDED BEHAVIOUR 2 - the thematic `scope creep` tag matches across
domains.** Entry 200 records that the tag is thematic rather than literal; it
does not record the consequence. Any week carrying "scope creep" plus one more
Denver word (schedule / testing / risk / logistics) reaches exactly 5 and is
handed Denver's airport baggage system, whatever the field: a nursing
informatics EHR rollout, a marketing-campaign scope week, a change-control
week, and a statement-of-work writing week all resolve to `denver-baggage`.
Defensible as a judgement, since Denver IS the canonical scope-creep case -
but it is the same shape as the Challenger/Agile-retrospectives case entry 200
DID write down, and it was omitted.

**UNRECORDED BEHAVIOUR 3 - the body guard does not exist on the Blackboard
path, so the imperative rule demotes graded work unconditionally there.** This
is the most consequential omission. `parseCartridgeBlob` returns from
`parseBlackboardArchive` (`cartridge-import.ts:911`) BEFORE
`resolveCartridgeItemBodies` (line 963), so EVERY Blackboard item has
`body === undefined` and `hasSubstantialBody` is universally false. On Canvas,
titles like `Complete Your Literature Survey Assignment`,
`Submit Your Survey Design Project` and `Post Your Welcome Video Assignment`
are demoted at body 0 but recover to `assignment` at body 800 - the body guard
covers them. On Blackboard that recovery can never happen. Blackboard archives
are a supported schedule source (entry 178). Entry 200 claims the discriminator
"costs nothing"; it costs this.

That same fact carries a SECOND, larger implication entry 198 did not state:
because `resolveCartridgeItemBodies` is unreachable on the Blackboard path,
entry 198 AC1's whole body-extraction feature does NOT apply to Blackboard
archives. A Blackboard-sourced Course Build still generates decks from item
TITLES ALONE - the exact defect 198 was written to fix, unfixed for that
source. This is NOT a regression (Blackboard was title-only before this batch
too) and so did not block the push, but it means the reported deck problem is
only solved for Common Cartridge sources.

**Also noted, deliberately left alone.** `TITLE_AMBIGUOUS_ACTION_PATTERN`'s
`register(?:ing|ration)?` alternation expands to
register | registering | registerration - it never matches the correctly
spelled "registration". So `Submit Your Course Registration` classifies as an
assignment and `Course Registration Form` (a WikiPage) as INSTRUCTIONAL, which
emits a pure logistics page's full body as lecture material. The gap is
PRE-EXISTING (the previous `registers?` did not match "registration" either)
and is documented from the other side in the module's test file. A code
comment asserting the opposite has been corrected in place; the regex itself
was deliberately NOT changed in this batch, because that is a behaviour change
and belongs in its own verified pass rather than being smuggled in beside a
documentation fix. Related: eight of the ten imperative verbs can only fire in
co-occurrence with one of six ambiguous words, so the verb set is close to
inert for any logistics title worded differently - `Enroll for Lab Section`
and `Join to the Study Group` both sail through.

**Verdict recorded with this batch.** All gates green: 356 files / 7178 tests,
`tsc` clean, `eslint` clean, `next build` compiled, no file over the 1000-line
cap, Node emoji scan with a live canary clean over every changed file. Zero
behaviour change against the instructor's real export. No test lost or
weakened. The batch pushed on that evidence, with the four items above carried
forward as known, written-down gaps rather than surprises.

## 202. The app stops eating its own cartridge, and a course's NAME finally counts toward its kind

Closes the three items entry 196 deliberately carried forward as outstanding
(see its own closing paragraph: the loop itself, the corrupted tile, and
`sourceDerivedKind` ignoring the course name). Entry 196 AC1 is the already
written trace of the defect and is not restated here.

**AC0 - one correction to the recorded trace.** Entry 196 AC1 and the session
handoff both say the `tile-export` AND `course-cartridge` schedule sources take
the newest saved export. Only `tile-export` reads the tile.
`course-cartridge` parses an uploaded `File` off `values.cartridge`
(`steps.course-schedule-from-source.ts`) and never touches `export_files` at
all. The read-as-input sites are three, and they were found by grepping every
consumer of `exportFiles` rather than by trusting the earlier note:
`loadCourseExport` (`step-helpers-server.ts`, unattended),
`loadCourseExportData` (`WorkflowsTab.tsx`, attended), and `getCourseCartridge`
(`useCourseImportActions.ts`, the Courses tab's own "import from export"
affordance) - that third one was in neither the entry nor the handoff.

**AC1 - the fix chosen, and the one rejected.** Entry 196 named two remedies:
mark app-generated cartridges so a schedule source refuses them, or never write
a generated cartridge into the tile's export slot. The second was REJECTED: the
LMS Exports list is where the instructor actually collects the built cartridge,
so deleting that write would remove working behaviour to fix a read-side bug.
Marking is exact and durable, needs no migration (`export_files` is jsonb and
`supabase/courses.ts`'s row mapper passes whole objects through, so a new
optional property rides along untouched), and it lets the UI label the file.

**AC2 - the write side marks, in BOTH run loops.** `CourseMaterialFile` gains
`generated?: boolean`. Both `saveCourseExportFile` implementations set it -
`server-runner.ts` (unattended) and `attended-step-helpers.ts` (attended) - per
this codebase's standing two-run-loops rule; landing it in one only would be
the defect, not the fix. The helper marks UNCONDITIONALLY with no caller
opt-in, because it has exactly one call site (`steps.lms-export.ts`) and exists
solely to save app output; that reasoning now lives on the `saveCourseExportFile`
declaration in `registry-helpers.ts`, which is where `StepRunHelpers` actually
is - NOT `types.ts`, where the acceptance criteria first sent an implementer.
No instructor path marks: neither `FilesCell.tsx`'s upload nor
`useCourseImportActions.ts`'s live-LMS pull, since a cartridge pulled from the
instructor's real Canvas course is genuine course content, not app output.

**AC3 - the read side skips, through ONE shared rule.**
`latestSourceExportFile` (`courses-table-helpers.ts`) returns the newest export
the INSTRUCTOR provided; `isGeneratedExportFile` and `hasOnlyGeneratedExports`
sit beside it. All three read-as-input sites call it instead of running their
own "greatest addedAt" reduce, so the rule cannot drift between them.
`latestExportFile` was DELETED once nothing called it rather than left as a
dead export beside its replacement. An entry with no `generated` property
counts as instructor-provided, which is what makes every file written before
this field existed keep working.

`canImport` also changed, and this was not in the original defect report: it
was `!canLms(c) && c.exportFiles.length > 0`, so a tile holding nothing but
app-generated cartridges still offered "import from export" - the same
self-consumption defect reached through the Courses table instead of a
workflow. It now asks `latestSourceExportFile(c) !== null`.

`loadCourseExport`'s contract is UNCHANGED and this matters: null for expected
absence, throw-with-context for genuine I/O failure (the deliberate contract
recorded in the previous handoff as already-correct). "Exports exist but every
one is generated" is an expected absence, so it returns null rather than
throwing.

**AC4 - the instructor is told WHY, not just that nothing is there.** Returning
null for the all-generated case would otherwise surface as `tile-export`'s
existing "has no LMS export on file" message, which is actively false when the
tile visibly holds several. That branch now distinguishes the two using the
tile it has ALREADY memoized, and names the real situation: the exports were
produced by Course Build itself and using one would feed the app its own output
back in. The genuinely-empty case keeps its old message verbatim.

**AC5 - the corrupted tile is NOT repaired by code, and cannot be.** The
11-module cartridge already sitting on the INFO 1020 tile predates the flag, so
nothing can identify it retroactively - no heuristic on the stored row, and no
in-cartridge stamp either, since the file was built before any stamp existed.
This is stated plainly rather than papered over with a guess. What ships
instead is the affordance that makes the manual repair unambiguous: the Files
tab's LMS Exports list labels app-generated entries "Generated by Course
Build" in secondary text, reusing the styling already on the sibling date line,
with no badge at all on instructor files. The instructor deletes the marked one
and re-uploads the real Canvas export; from that point the labels keep the two
kinds apart, and AC3 keeps a fresh generated cartridge from burying the
re-upload on the next run. Stamping generated cartridges internally, so that a
re-uploaded one could also be recognized, is NOT done here and is recorded as
open - it lands in `cartridge-import.ts`, which belongs to a different chunk.

**AC6 - a course's NAME is now a third precedence tier for `courseKind`.**
`courseKindFromCourseName` (`course-kind.ts`) reads a coding signal off the
name. Precedence is `tileKind ?? nameKind ?? sourceDerivedKind`: the tile's
explicit column still wins (entry 196's F3 rule, unchanged), the name signal
sits in the middle, and the source-derived default applies only when neither
fires. It is computed inside `finalize`, not beside `sourceDerivedKind`,
because it needs the RESOLVED `courseTitle`, which does not exist until then;
it checks that title first and falls back to the tile's own name, which earns
its place when a cartridge carries a title of "Course" while the tile is named
"INFO 1020 - Computer Science Principles".

The function can return ONLY `"coding"` or null - there is no code path
producing `"applied"`, which is a stronger guarantee than merely not doing so
today. The asymmetry is the point: `sourceDerivedKind`'s `"coding"` for a
repository source is real evidence (there IS a repository), while its
`"applied"` for everything else is a bare default with nothing behind it. A
name signal may upgrade an evidence-free default; it must never overturn real
evidence. The vocabulary is deliberately conservative - multi-word subject
phrases and named languages only, word-boundary matched - because this whole
course-kind distinction exists because a project-management course received
Python exercises, and a false `"coding"` recreates exactly that. Bare
"computer", bare "software", bare "database", bare "technology", and bare
course-code prefixes are all excluded on purpose, with the reasoning recorded
at the pattern list. `isCodebase` is untouched: it is a structural fact about
whether the run is anchored to a repository, not a pedagogy choice.

**Process note, recorded because it cost real time.** One implementer reported
"all well within the 1000-line cap" while its own numbers showed the test file
it had grown at 1036 - over. The cap check caught it, again, exactly as entry
196's own process note predicted; the file was split into
`courses-table-helpers.exports.test.ts` plus a shared
`courses-table-helpers.fixtures.ts`, with the pre-split test count pinned as
the check so nothing was silently dropped in the move. Two further implementers
were killed mid-flight by a process exit and never reported at all; their work
was recovered by reading the tree and re-running the full gate rather than by
trusting any summary. Every claim in this entry was verified against the diff.

**Verdict recorded with this batch.** All gates green: 357 files / 7200 tests
(from 356 / 7178), `tsc` clean, `eslint` clean, no file over the 1000-line cap
(`server-runner.ts` is the tightest at 997 - the next edit to it must split
something), Node emoji scan with a live canary clean over all 1167 scanned
files apart from the single authorized `CHECKLIST_DONE_PREFIX` exception. Not
verified by running the app: there is no local `.env` and every route 500s, so
the Files-tab label and the new error message are covered by reasoning and
types, not by a live click-through.

## 203. The rest of the backlog, plus a real deck audited artifact-by-artifact

One batch, twelve concurrent agents on disjoint file sets, closing CHUNKS B, C, E and F
of `docs/HANDOFF.md` plus two instructor asks and five defects found by taking a REAL
generated run apart at the OOXML level. Every claim below was verified against the diff
or against the shipped artifact, not taken from an agent's summary - two agents in the
previous batch misreported, and this one had its own.

### AC1 - Blackboard archives finally get item bodies

`parseCartridgeBlob` returned from `parseBlackboardArchive` BEFORE
`resolveCartridgeItemBodies` ran, so every Blackboard item had `body === undefined`. The
whole body-extraction feature (entry 198 AC1) therefore did not apply to Blackboard at
all: a Blackboard-sourced Course Build still wrote decks from item TITLES ALONE - the
exact reported defect, fixed for Canvas and never for Blackboard - and `hasSubstantialBody`
was universally false there, so the leading-imperative rule demoted graded work
unconditionally. Not a regression (Blackboard was title-only before too); an unfinished
feature. `resolveBlackboardItemTypes` now builds the identifierref side table as it
creates each item, and a new `buildBlackboardBodyPaths` maps each resource identifier to
its `resNNNNN.dat` path. Blackboard content is inline in that XML, so the EXISTING
strip-tags-and-collapse step extracts it with no Blackboard-specific extraction logic.

`cartridge-import.ts` (974) was split THREE ways BEFORE editing, to avoid an import
cycle: `cartridge-import-shared.ts` (226, depends on neither), `-blackboard.ts` (442),
and `cartridge-import.ts` (465) re-exporting the moved names so no other import in the
repo changed.

### AC2 - `register`/`registration` now matches

`register(?:ing|ration)?` expanded to `register|registering|registerration` - a doubled
"r" that could never match. Replaced with a shared stem, `regist(?:er(?:ing)?|ration)`.
"Course Registration Form" classifies administrative instead of instructional, so a pure
logistics page stops being emitted as lecture material.

The imperative-verb near-inertness (8 of 10 verbs can only fire alongside one of six
ambiguous words, so "Enroll for Lab Section" sails through) was ASSESSED AND DELIBERATELY
NOT FIXED: broadening the verb set would reintroduce the over-demotion bug an earlier fix
closed, since `TITLE_ASSIGNMENT_PATTERN` is currently what saves "Submit Your Final
Project". Recorded as its own follow-up in the module's header comment.

### AC3 - generic tags stop qualifying an off-domain case study

Entry 190's defect class survived at `QUALIFY_FLOOR = 5`: the security pair ("Secure
software development lifecycle", "...code review, and quality assurance...") returned
healthcare-gov on evidence 6. Reproduced against the REAL matcher before any change. Root
cause was not the floor: `"quality assurance"` is tagged on 8 of the original 12 entries
and `"vendor management"` on 7, and both were collecting the 3x phrase bonus for being
ordinary cross-industry vocabulary. `GENERIC_TAG_MIN_DF = 4` caps the phrase bonus to
word-equivalent weight for any tag matched in that many DISTINCT entries. Deliberately an
ABSOLUTE count, not a fraction of library size - a fraction misfires on the 2-3 entry
synthetic libraries used elsewhere in the suite. It only ever caps DOWN, never boosts a
rare tag, so it is explicitly not the previously-rejected IDF alternative.

A pre-existing test was found to be passing for the WRONG reason: "Scope Management" was
matching denver-baggage on four entirely generic words. The fixture was strengthened with
a genuinely Denver-specific phrase rather than deleted, so it now passes for a real
reason.

### AC4 - the curated library gets its first cybersecurity entries

All 12 entries were project-management megaproject failures, so a security course fell
through to the LLM every week. Three real, heavily documented incidents added following
the existing entries' shape and tone: Microsoft's Trustworthy Computing initiative
(2001 Code Red/Nimda, the 2002 memo, later formalized as the SDL), Equifax 2017 (unpatched
Struts CVE, expired inspection certificate), and Target 2013 (third-party HVAC vendor
credentials, segmentation failure, ignored alerts). Figures the author was not confident
of were LEFT OUT rather than approximated. Every tag is a literal phrase from that entry's
own text - no invented tags. Self-match across all 15 is 14/15 (citytime remains the one
documented pre-existing miss), zero cross-contamination, and every previously-established
off-domain probe still returns null - the additions bought coverage without buying false
positives.

### AC5 - the run log's `Detail:` section is no longer always empty

Entry 197's artifact shipped with its most useful section blank on every run.
`buildCompleteRunLogText` inherited `run.detail` from `getRun()`, but `detail` is written
only by `finishWorkflowRun`, which runs AFTER the log is built in BOTH loops -
deterministic ordering, not a race. Proven independently in each loop and pinned with a
failing test before any change.

Fixed with an optional `detailOverride` rather than by reordering, because reordering
would write terminal DB state before the run's own post-run stages finish. Unattended
computes `ok ? "" : joinStepErrorDetail(steps)` - the identical formula every entry point
already uses - at the existing call site; attended passes the `detail` it had already
computed. With no override, the builder self-computes the deduped-failure half rather than
emitting nothing.

RESIDUAL, recorded not hidden: `finalize-run-download.ts` calls the builder before the
attended loop finishes computing `detail`, so that ONE artifact gets the failure list
without the course fan-out prefix. Closing it needs files outside that agent's scope.

`server-runner.ts` was at 997; `buildServerStepRunHelpers` moved to a new
`server-runner-helpers.ts` (163), leaving it at 885, with a re-export so no caller changed.

### AC6 - run-form scope trimming: the reported defect did not exist

CHUNK C2 claimed the run form asks for fields the run then ignores. VERIFIED FALSE before
coding: `collectRuntimeFields` already drops every scope-covered field, confirmed against
single-course, multi-course `"*"` and institution-`"*"` scopes, and `REGRESSION.md` already
said so. A display-layer filter was added anyway as defense-in-depth, reusing
`scopeCoversType` rather than reimplementing it, matching this codebase's existing habit
(`useWorkflowRun.ts` independently re-derives the same rule). Recorded plainly: this is
redundant code for a non-bug, kept deliberately, not a fix.

`RuntimeFieldInput.tsx` (1012, over cap) split by field-type family into
`RuntimeFieldInputEntityPickers.tsx` (392) and `RuntimeFieldInputTemplates.tsx` (199),
leaving 531.

### AC7 - CHUNK E and CHUNK F

`workflow-runs.test.ts` (1079) split three ways plus a fixtures module, 80 tests before
and 19+28+33 = 80 after. `steps.grading-repos.ts` (1078) split at the helpers/registry
boundary (695 + 426), with the moved helpers re-exported so its existing test files needed
zero changes; its 51 covering tests stayed 51.

CHUNK F's eight items were each VERIFIED against the code before being rewritten, since
the handoff's own descriptions were second-hand. Notable: `MODULE_NUMBER_PATTERN`'s
duplication was de-duplicated rather than cross-referenced, because the feared cycle
proved one-directional; `summarizeWeeklyChecklist` was confirmed caller-less and deleted
with its tests; `chat/entity-grounding.ts` now normalizes a matched course's institution
so `"GCU"` and `"gcu"` cannot both enter the resolved set; and both weekly-Q&A step types
joined `HEADLESS_SAFE_STEP_TYPES` with the exact-size canary bumped 150 -> 152 IN THE SAME
CHANGE, per that canary's own rule.

### AC8 - default projects are everyday by default

Instructor ask: "all default projects should be approachable, simple, things that people
would encounter everyday." `PROJECT_EVERYDAY_CONTRACT` was ADDED beside
`PROJECT_HANDS_ON_CONTRACT`, not merged into it - that constant's example list is pinned
by exact-substring tests and it is domain-neutral by design, so it was never the cause.
Composed ONLY in propose mode (`ask ? "" : ...`): when the instructor states their own
project idea, their idea governs and this contract stays out of the prompt entirely.

It constrains SUBJECT ONLY, and says so in its own text - "a household budget tracker and
a penetration test are both real artifacts", everyday-ness and hands-on-ness are
orthogonal axes - modelled on `projectChoiceContract`'s existing RIGOR IS NOT NEGOTIABLE
precedent, which resolves a structurally identical tension. It also states that an everyday
context IS a real practice setting (so it does not contradict `courseKindContract`'s "real
organizations"), and that a serious field keeps its own identity: a security course hardens
a home network, it does not become a different course.

The two canned preset descriptions were rewritten. Neither had any test pinning its text;
both now do.

### AC9 - the class-session project override becomes reachable

`projectMode`/`projectDescription` were bound to LITERAL `""` in COURSE_BUILD - not hidden
by the disabled-steps overlay, bound out at preset-authoring level, so nothing could ever
set them. Now bound to runtime fields, with the value proven end to end rather than
assumed: through `collectRuntimeFields`, past `scopeCoversType` (null for text types), the
identical binding resolution in both loops, into `values.projectMode`. Sabotage-confirmed
by reverting to `""` (4 tests failed). The step's existing precedence rule was extracted
verbatim into a pure `resolveClassSessionProjectOverrides` purely to make it testable, and
all eight combinations pinned.

BEHAVIOUR CHANGE: `"none"` now genuinely forces the project off even when the tile carries
a persisted course-long project. LIMITATION, recorded: explicit `"template"` remains
indistinguishable from blank - both still defer to the persisted project - so of three
dropdown values only two actually force anything. Pre-existing in the step's own rule, not
introduced here.

### AC10 - a coding deck can finally carry a graphic

Found by auditing a real 50-slide OOP deck: across all 50 slides, zero `<p:graphicFrame>`,
zero `<a:tbl>`, zero `<p:pic>`. Not one class diagram in a lecture about classes. Cause:
`enforceGraphicsForApplied` opened `if (kind !== "applied") return ...`, and the coding
contract explicitly said "No coding slide is REQUIRED to carry a graphic." Sharpened by
entry 202 AC6, which correctly reclassified this course as coding and therefore REDUCED
its visuals.

Three coding slides now require one: the Agenda (guaranteeing at least one visual per
deck), each concept's own intro slide, and every Terminology slide as a Term/Definition
table. Only `process` and `table` are offered - never `matrix2x2`, never a chart - so the
original no-fabrication reasoning is extended rather than replaced; the Terminology table
restates bullets already on the slide, so it cannot invent anything.

The graphic sits on the concept INTRO slide, not the Example/Walkthrough/Practice/Answer
slides, because `pptx.ts` ignores `graphic` whenever `code` is present - a graphic there
would have rendered nothing at all. Coding's required prefixes live in a SEPARATE array
from applied's, so `pptx-graphics-audit.ts` (which reads applied's with no kind-awareness)
does not start misflagging applied decks. `pptx.ts` and `decks/generate.ts` needed no
change and got none.

### AC11 - the gap report stops naming slide types the deck cannot have

AC10 made `graphicsGapReportLines` reachable for coding decks while its text still read
"missing a required graphic (Artifact/Judgment Call/Agenda)" - slide types a coding deck
does not have. A defect this batch itself created, so it was fixed in this batch. The
parenthetical is now DERIVED from `slide-graphics.ts`'s own prefix arrays rather than a
third hardcoded copy, and the literal template - previously duplicated in
`steps.content-lectures.prepare.ts` - now exists exactly once, the cycle having been
checked and found absent.

### AC12 - Word documents stop rendering markup as punctuation, and stop breaking code

Both found by reading the shipped Class Opener's OOXML.

Nine runs carried unrendered markdown - `**Model Scenario:`, `*Result:*`, backticked
`` `BankAccount` `` - so the student read asterisks and backticks. `docx.ts` handled
hyperlinks, "Label:" bolding, headings, pipe tables and fenced blocks, but no inline
emphasis. Now parsed into real runs, with inline code in CODE_FONT, composed with the
existing tokenizer rather than beside it. A guard handles the case where "Label:" bolding
would sever a bold span mid-way ("**Model Scenario: A Library Book System**"); disabling
it reproduces exactly the predicted mangled output.

More serious: the opener shipped SYNTACTICALLY INVALID PYTHON - `class BankAccount:` /
`def __init__(self):` / `self.balance = 0`, every line flush left, in a programming
course. The same code in the same run's DECK kept its indentation, which is what located
the fault. It was NOT in the Word writer: `buildCodeParagraph` passes its line verbatim
and `normalizeTypography` is fence-aware. `stripModelUrls` (`urls.ts`) was flattening
every line - `.map(line => line.replace(/[ \t]+/g," ").trim())` - with no fence awareness
at all. That function is now fence-aware, and the no-op for fence-free input is PROVEN by
a test that reimplements the pre-fix algorithm and asserts equality, which matters because
roughly 20 callers pass short single-field strings where collapsing is intended.
Unterminated fences defer to `CodeFenceTracker`'s existing documented contract rather than
a newly invented rule.

WIDENING, recorded deliberately: the whole function is now fence-aware, so a URL inside a
fence is no longer stripped either. Justified by existing precedent (`docx.ts` already
documents that fenced lines get no URL linkification) and by the fact that
`requests.get("https://...")` is legitimate code that stripping would corrupt. The
tradeoff is that a fabricated URL inside a fence would now survive.

### Process notes

The batch was gated with `git status --short` against each brief. No agent exceeded its
file list this time - a change from the previous batch, and the explicit "peers are
editing this same tree" framing in every brief is the likely reason. One agent grew a test
file past the cap, noticed, and reverted it BYTE-IDENTICAL rather than shipping it,
putting the new coverage in two new files.

Two briefs contained errors that the agents caught rather than followed: one pointed at
the wrong file for a doc comment (fixed directly), and one attributed the indentation loss
to the Word writer when it was two modules upstream. Both agents stopped and reported
instead of editing outside scope, which is exactly the behaviour the briefs asked for.

### Verdict recorded with this batch

All gates green: **363 files / 7306 tests** (from 357 / 7200), `tsc` clean, `eslint`
clean, ZERO files over the 1000-line cap, Node emoji scan with a live canary clean over
1180 files apart from the single authorized `CHECKLIST_DONE_PREFIX` exception.

THE CAP IS CROWDED AND THIS IS THE WARNING: thirteen files now sit between 950 and 997
lines, including `registry-helpers.ts` and `steps.github.ts` at 997 and
`workflows/types.ts` at 994. `registry-helpers.ts` reached 997 only because an agent
compressed two multi-line expressions to fit. The next edit to any of these forces a
split - budget for it rather than discovering it.

NOT verified by running the app: there is no local `.env` and every route 500s. The deck
graphics, the Word rendering, and the new run-form controls are covered by types, unit
tests, and OOXML-level reading of real generated artifacts - not by a live click-through.
