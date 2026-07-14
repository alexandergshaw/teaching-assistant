-- Workflow run log: one row per completed workflow run, across every trigger
-- source (manual, schedule, event trigger, webhook). Its only consumer is the
-- 'workflow-completed' event source (workflow chaining): a chain trigger polls
-- this table for a run of its source workflow newer than the trigger's cursor.
-- Kept deliberately tiny (no per-step detail) - it is a signal, not an audit
-- log. Idempotent.

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workflow_id text not null,
  workflow_name text not null,
  -- 'ok' when the run finished with no genuine step failure, else 'error'.
  status text not null,
  -- How the run was started: 'manual' | 'schedule' | 'trigger' | 'webhook'.
  trigger_source text,
  created_at timestamptz not null default now()
);

-- Chain evaluation queries "latest run of workflow X for this user"; index that.
create index if not exists workflow_runs_user_wf_idx
  on public.workflow_runs (user_id, workflow_id, created_at desc);

alter table public.workflow_runs enable row level security;

drop policy if exists "Users read own workflow_runs" on public.workflow_runs;
create policy "Users read own workflow_runs"
  on public.workflow_runs for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own workflow_runs" on public.workflow_runs;
create policy "Users insert own workflow_runs"
  on public.workflow_runs for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own workflow_runs" on public.workflow_runs;
create policy "Users delete own workflow_runs"
  on public.workflow_runs for delete
  using (auth.uid() = user_id);
