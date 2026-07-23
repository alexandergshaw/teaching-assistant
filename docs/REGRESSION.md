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

Baseline taken before the run-observability feature. Evidence: 185 tests across
server-runner.test.ts, workflow-schedules.test.ts, workflow-triggers.test.ts,
workflow-schedule-handoff.test.ts, workflow-schedules.fanout.test.ts, all passing.
These behaviors must keep working:

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
5. Run log: recordWorkflowRun writes one workflow_runs row per completed run from
   every execution path; its consumer is workflow-completed chaining
   (decideWorkflowCompleted) - chains fire on successful runs of the source
   workflow, and a skipped/errored occurrence must not fire a chain.
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
3. researchCurrentEventsAction (currently src/app/actions/llm-tools.ts) ALWAYS
   ends the report with "## Sources": deduped "- title: uri" lines with verbatim
   URLs, or an explicit no-sources line; it returns sourceCount and the step's
   summary lists "N source(s) cited" first.
4. Deliverable: docx built from the report, always saved to the Files library
   (workflow-tagged), additionally to the bound course tile; save failures become
   summary notes, never run failures.
5. registry.current-events-report.test.ts proves the deck wire from both
   generate-presentation-from-template and generate-slides-standalone.

### 2026-07-22 - Navigation restructure

1. Top-level tabs are exactly: Courses, Manual, Workflows, Files. "drafts",
   "ppt-design", and "mail" are not valid ActiveTab values; legacy saved values
   migrate (ppt-design -> Manual + PowerPoint Design subtab; drafts/grade-drafts
   -> Workflows + Drafts subtab; mail -> default).
2. PowerPoint Design is the LAST Manual subtab and renders PowerPointDesignTab.
3. The Workflows tab hosts a persisted subtab level (ta-workflows-view:
   workflows | drafts); Drafts keeps its Grades/Messages/Presentations third
   level (ta-drafts-view); the draftsInbox badge sits on the Workflows top tab;
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
   updater). Once-per-run: recents, recordWorkflowRun, and last-run write-back
   fire once, with course counts in the detail.
4. Unattended: the cron claim branch covers isCourseFanout; per-course groups
   with scopeForCourse pinning, deadline cutoff, FanoutProgress.doneCourses
   checkpointing (additive Json; old blobs parse); zero-tiles/enumeration
   errors return clean error outcomes and NEVER throw even with saveRunReport
   set (guarded courseNames map; server-runner tests pin it); reports group per
   course.
5. Guardrails: institution "*" + course fan-out rejected in both paths with the
   pick-one-dimension message; institution fan-out behavior byte-identical.

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
   group labels, no separators, not sticky. Row 1 is the five Manual subtabs -
   Build Courses, LMS, Version Control, Recording, PowerPoint Design - always
   visible, one click from anywhere in Manual. Row 2 renders ONLY when the
   active subtab has inner views - Build's [New Build, Pre Built], LMS's
   [Modules, Pages, Files, Grading, Announcements, Inbox] - so within the
   active subtab, any of its destinations is one click away; Version Control,
   Recording, and PowerPoint Design (single-view subtabs) render no row 2.
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

1. The Courses tab is a table: one row per course, sortable header
   (name/startDate, ta-courses-sort), sticky header + frozen name column via
   the container-scroll idiom (see the sticky-header entry below),
   column-visibility menu (ta-courses-columns; name/actions always shown),
   derived roster/student-repo/repo count columns.
2. Scalar fields edit inline in cells through computeFieldPatch + the update
   action with the pre-redesign patch semantics (weeks/tests numeric handling,
   lms null-when-blank, repos topic-extraction side effect); failed saves keep
   the editor open with the draft (result threaded to every commit handler).
3. Row expansion hosts the ported structural editors (repos, roster with
   stats/From-LMS/Copy, student repos, integrations, description,
   schedule-of-topics csv, rubric, materials, export package incl. the
   no-course-settings message); the SyllabusCell offers select/preview/
   download/From-LMS/From-import plus the direct-upload control (onUploaded
   updates the row and reloads the syllabus list).
4. The actions column preserves the onNavigate contract; delete uses the
   original single confirm; the add/edit form is the ported AddCourseForm.
5. Retired by user approval: the tile/card-layout system and its panels
   (custom tiles, drag/hide, institution common-fields editor,
   syllabus-template admin, per-course scheduled-workflows display) and the
   Common Resources panel (component deleted; the common-resources lib remains
   for the Starter Materials workflow). card-layout.ts remains only as a lib
   consumed by courses-tab-helpers; no layout localStorage keys are read.
6. Pure logic tested: sort comparators, column-set parsing, derived counts,
   field patches (courses-table-helpers, 25 tests) on top of Phase 1's 42.

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
   session task). Spot checks: ModulesView.tsx is a ~638-line orchestrator
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
   values (courses-table-helpers.test.ts, 26 tests).
5. Unchanged behavior: sort clicks/indicators, ta-courses-sort and
   ta-courses-columns persistence, inline cell editing, row expansion
   (RowDetail renders inside the scroller), the actions column, and the
   Phase 2 entry's checks all hold. No new persisted controls were added.
   Unit-test disposition: COLUMN_MIN_WIDTHS is the only new pure logic and is
   covered by the completeness test; the CSS module and class swaps have no
   unit-testable surface.
