-- Scheduled workflow runs: fire a saved workflow with a snapshot of its run
-- form values at a set time, optionally repeating, optionally attached to a
-- course tile and/or an institution. Idempotent.

create table if not exists public.workflow_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workflow_id text not null,
  workflow_name text not null,
  field_values jsonb not null default '{}'::jsonb,
  next_run_at timestamptz not null,
  repeat text not null default 'none',
  enabled boolean not null default true,
  course_id uuid references public.course_hub (id) on delete set null,
  institution text,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workflow_schedules_user_idx
  on public.workflow_schedules (user_id, next_run_at);

alter table public.workflow_schedules enable row level security;

drop policy if exists "Users read own workflow_schedules" on public.workflow_schedules;
create policy "Users read own workflow_schedules"
  on public.workflow_schedules for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own workflow_schedules" on public.workflow_schedules;
create policy "Users insert own workflow_schedules"
  on public.workflow_schedules for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own workflow_schedules" on public.workflow_schedules;
create policy "Users update own workflow_schedules"
  on public.workflow_schedules for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own workflow_schedules" on public.workflow_schedules;
create policy "Users delete own workflow_schedules"
  on public.workflow_schedules for delete
  using (auth.uid() = user_id);
