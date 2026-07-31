-- "In the workflow logs, also include the inputs." A step's own
-- workflow_run_steps row (and a run's own workflow_runs row) recorded
-- everything ABOUT a step's execution - timing, status, summary, error -
-- but never what the step actually RECEIVED. That is precisely what made
-- two recent incidents hard to diagnose: a step's binding looked correctly
-- configured in the builder, but resolved to an empty value at run time,
-- and nobody could see that without cross-reading the log against the
-- preset by hand. Two nullable jsonb columns close that gap:
--
--   - workflow_run_steps.inputs: the step's own resolvedInputs (what was
--     actually passed to stepDef.run), captured where the outcome is
--     logged - see src/lib/workflows/run-logging.ts's logStepOutcome,
--     called from both runners (server-runner.ts's runExpandedBodyOnce and
--     useWorkflowRun.ts's handleRun).
--   - workflow_runs.field_values: the RUN's own starting inputs (an
--     attended run's form values, or a schedule/trigger's stored
--     field_values snapshot), captured where the run starts - see
--     run-logging.ts's safeStartWorkflowRun. This is what makes "the
--     schedule was configured with Institution: None" visible without
--     opening the Automate panel.
--
-- Both columns store the ALREADY-REDACTED, ALREADY-CAPPED shape produced by
-- src/lib/workflows/run-input-redaction.ts's redactRunInputs - a flat
-- Record<string, string> with credential-shaped keys/values replaced by a
-- marker, file/base64 payloads reduced to name/type/size, and both a
-- per-value and a total-per-call length cap applied. Redaction happens
-- BEFORE the write, never at render time - buildRunLogText
-- (workflow-run-log-text.ts) only ever reads back what is already safe to
-- show, so an old row and a new row render through the exact same code
-- path with no special-casing.
--
-- Nullable, additive only - every existing row stays valid and renders
-- exactly as before (buildRunLogText renders no "Inputs"/"Field values"
-- section at all when the column is null, per this feature's AC5), the same
-- precedent as course_name in
-- supabase/migrations/20260914000000_workflow_run_step_course_name.sql.
--
-- Written idempotently.

alter table if exists public.workflow_run_steps
  add column if not exists inputs jsonb;

alter table if exists public.workflow_runs
  add column if not exists field_values jsonb;
