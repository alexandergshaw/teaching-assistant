-- Custom workflow definitions built in the Workflows tab. Owner-scoped RLS; the browser reads and writes rows directly. Written idempotently.

create table if not exists public.workflow_defs (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text not null default '',
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workflow_defs_user_idx
  on public.workflow_defs (user_id, created_at desc);

alter table public.workflow_defs enable row level security;

drop policy if exists "Users read own workflow_defs" on public.workflow_defs;
create policy "Users read own workflow_defs"
  on public.workflow_defs for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own workflow_defs" on public.workflow_defs;
create policy "Users insert own workflow_defs"
  on public.workflow_defs for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own workflow_defs" on public.workflow_defs;
create policy "Users update own workflow_defs"
  on public.workflow_defs for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own workflow_defs" on public.workflow_defs;
create policy "Users delete own workflow_defs"
  on public.workflow_defs for delete
  using (auth.uid() = user_id);
