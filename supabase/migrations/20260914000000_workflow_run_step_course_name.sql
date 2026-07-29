-- The downloadable run log (buildRunLogText, src/lib/workflow-run-log-text.ts)
-- printed a course fan-out step's course as a raw UUID
-- ("Course: 1c41b131-f052-4da6-a077-ae5178271cea") because workflow_run_steps
-- only ever carried course_id, never a human name. The name IS known at the
-- point the step outcome is logged (the fan-out loop that produces course_id
-- also has the course tile's own .name - see runWorkflowUnattended's
-- courseGroups.push in server-runner.ts and useWorkflowRun.ts's
-- fanoutEntities), so this adds a column to carry it through rather than
-- having the formatter guess or re-look-up the name at render time.
--
-- Nullable, additive only - every existing row stays valid and renders
-- exactly as before (buildRunLogText falls back to course_id when
-- course_name is null, which is what every row written before this migration
-- will have).
--
-- Written idempotently.

alter table if exists public.workflow_run_steps
  add column if not exists course_name text;
