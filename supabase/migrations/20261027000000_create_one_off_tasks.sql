-- One-off tasks: a per-user to-do list, optionally tagged with a college
-- (institution acronym) and a due date. Owner-scoped RLS (problems idiom).

create table if not exists public.one_off_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  college text,
  done boolean not null default false,
  notes text not null default '',
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists one_off_tasks_user_idx
  on public.one_off_tasks (user_id, created_at desc);

alter table public.one_off_tasks enable row level security;

drop policy if exists "Users read own one_off_tasks" on public.one_off_tasks;
create policy "Users read own one_off_tasks"
  on public.one_off_tasks for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own one_off_tasks" on public.one_off_tasks;
create policy "Users insert own one_off_tasks"
  on public.one_off_tasks for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own one_off_tasks" on public.one_off_tasks;
create policy "Users update own one_off_tasks"
  on public.one_off_tasks for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own one_off_tasks" on public.one_off_tasks;
create policy "Users delete own one_off_tasks"
  on public.one_off_tasks for delete
  using (auth.uid() = user_id);
