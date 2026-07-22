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
   WorkflowBuilder.tsx, or src/app/components/workflows/ beyond the 9 inventoried
   ones (6x no-explicit-any on Supabase generics/run-result typing, 1x
   exhaustive-deps on the handoff effect that predates the split, plus the 2 in
   useWorkflowRun's runInputDetails typing). A new disable in these files is a smell
   that plumbing broke.

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
