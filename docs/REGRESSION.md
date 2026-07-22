# Regression Checklist

Living regression document for the AC -> code -> verify -> regression delivery loop.

- After a feature passes verification, its acceptance criteria are appended here as
  durable behavioral checks (an entry per feature, newest at the bottom).
- BEFORE a feature is implemented - once its acceptance criteria and reuse survey
  have fixed which files/subsystem it will change - the orchestrator characterizes
  that area's existing functionality (running its tests, tracing its live
  behaviors) and records it here as an "Area baseline" entry, so pre-existing
  behavior in the touched area is guarded by the very next regression run, not
  just the new feature's own checks.
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
  errors are not. The known acceptable failure is /_not-found prerendering failing
  with a missing Supabase URL/API key (@supabase/ssr) when env vars are absent.
- G4: `npm test` (vitest) passes fully.
- G5: No emojis anywhere in source files. Scope: git-tracked source files (exclude
  node_modules/ and .next/). Emoji means true emoji codepoints (pictographs,
  emoticons, dingbats, regional indicators, variation selector U+FE0F); typographic
  arrows (e.g. U+2192) and math symbols do not count.

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
