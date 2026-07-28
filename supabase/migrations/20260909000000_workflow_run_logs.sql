-- Detailed workflow run logs: extends workflow_runs with a start-then-finish
-- lifecycle and adds a workflow_run_steps child table, so a run that is
-- killed by the Vercel 60s cap, crashes, or loses its browser tab still
-- leaves a row behind - today workflow_runs is written with a single INSERT
-- after the run finishes (see 20260813000000_create_workflow_runs.sql), so a
-- run that never reaches that point is invisible. The run id is already
-- minted with crypto.randomUUID() before the run starts at every call site,
-- so a caller can insert a "running" row immediately, do the work, and
-- update that same row when (if) it finishes.
--
-- workflow_runs stays the same table (it has a live consumer: the
-- 'workflow-completed' event source polls it for the latest run of a source
-- workflow) - this migration only adds nullable columns, so every existing
-- row stays valid: started_at/finished_at bound the run, duration_ms is
-- computed at finish time, trigger_ref names the schedule/trigger id that
-- caused the run (when any), step_count/error_count summarize the child
-- rows, and detail carries the full failure detail - unlike
-- workflow_schedules.last_run_detail / workflow_triggers.last_run_detail,
-- this is NOT truncated, because it is the source of the downloadable log,
-- not a status-panel snippet.
--
-- This migration also adds an UPDATE policy on workflow_runs. Its absence
-- until now was deliberate (workflow_runs was insert-once, never mutated
-- after creation - see the original migration's "a signal, not an audit
-- log" framing); it is being added on purpose here, because the new
-- start-then-finish lifecycle needs to update a run's own row from
-- "running" to its final status, and without this policy that update
-- silently fails under RLS (0 rows affected, no error).
--
-- The status check is widened to admit 'running' (a row can now exist while
-- its run is in flight), alongside the existing 'ok' / 'error' / 'skipped'.
--
-- workflow_run_steps is a CHILD TABLE, not a jsonb column on workflow_runs
-- (unlike class_session_transcripts.segments/answered). Three reasons,
-- together: (1) a run can have many steps, written one at a time as the run
-- proceeds, not appended in a couple of batches; (2) they are written
-- incrementally from a server function operating under a 60-second budget,
-- so each step is its own small insert rather than a read-modify-write of a
-- growing array; (3) most importantly, a run that dies mid-flight must
-- retain the steps it already wrote - a jsonb column updated by
-- read-modify-write would require the whole array to be rewritten on every
-- step and would lose everything written so far if the process died before
-- that rewrite landed. A child table lets each step insert independently
-- and survive on its own.
--
-- Written idempotently.

alter table if exists public.workflow_runs
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists duration_ms integer,
  add column if not exists trigger_ref text,
  add column if not exists step_count integer,
  add column if not exists error_count integer,
  add column if not exists detail text;

alter table public.workflow_runs drop constraint if exists workflow_runs_status_check;
alter table public.workflow_runs add constraint workflow_runs_status_check
  check (status in ('ok', 'error', 'skipped', 'running'));

drop policy if exists "Users update own workflow_runs" on public.workflow_runs;
create policy "Users update own workflow_runs"
  on public.workflow_runs for update
  using (auth.uid() = user_id);

create table if not exists public.workflow_run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.workflow_runs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  step_index integer not null,
  step_type text not null,
  status text not null check (status in ('done', 'error', 'disabled', 'needs-interaction', 'skipped', 'running')),
  error text,
  summary text,
  -- Ordered onProgress messages emitted while the step ran.
  progress jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  institution text,
  course_id text,
  created_at timestamptz not null default now()
);

-- A run's log view reads all of its steps in order; index that.
create index if not exists workflow_run_steps_run_idx
  on public.workflow_run_steps (run_id, step_index);

-- Owner-scoped listing/cleanup independent of any one run.
create index if not exists workflow_run_steps_user_idx
  on public.workflow_run_steps (user_id, created_at desc);

alter table public.workflow_run_steps enable row level security;

drop policy if exists "Users read own workflow_run_steps" on public.workflow_run_steps;
create policy "Users read own workflow_run_steps"
  on public.workflow_run_steps for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own workflow_run_steps" on public.workflow_run_steps;
create policy "Users insert own workflow_run_steps"
  on public.workflow_run_steps for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own workflow_run_steps" on public.workflow_run_steps;
create policy "Users update own workflow_run_steps"
  on public.workflow_run_steps for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own workflow_run_steps" on public.workflow_run_steps;
create policy "Users delete own workflow_run_steps"
  on public.workflow_run_steps for delete
  using (auth.uid() = user_id);
