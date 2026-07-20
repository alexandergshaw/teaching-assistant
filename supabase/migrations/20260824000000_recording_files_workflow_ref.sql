-- Group recording_files by the workflow run that produced them, enabling
-- per-workflow-run artifact grouping in the Files tab and driving the
-- "new deliverables" badge. Idempotent.

alter table public.recording_files add column if not exists workflow_id text;
alter table public.recording_files add column if not exists workflow_run_id text;
