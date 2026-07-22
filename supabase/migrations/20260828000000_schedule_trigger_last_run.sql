-- Add last-run status and detail columns to schedule and trigger tables for observability.
alter table if exists public.workflow_schedules add column if not exists last_run_status text;
alter table if exists public.workflow_schedules add column if not exists last_run_detail text;
alter table if exists public.workflow_triggers add column if not exists last_run_status text;
alter table if exists public.workflow_triggers add column if not exists last_run_detail text;
