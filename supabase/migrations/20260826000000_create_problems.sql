-- Problems and their proposed solutions: open user problems that trigger a
-- companion workflow to propose solutions whenever any other workflow completes.
-- Owner-scoped RLS (recording_files idiom).

create table if not exists public.problems (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  detail text not null default '',
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists problems_user_idx
  on public.problems (user_id, created_at desc);

alter table public.problems enable row level security;

drop policy if exists "Users read own problems" on public.problems;
create policy "Users read own problems"
  on public.problems for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own problems" on public.problems;
create policy "Users insert own problems"
  on public.problems for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own problems" on public.problems;
create policy "Users update own problems"
  on public.problems for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own problems" on public.problems;
create policy "Users delete own problems"
  on public.problems for delete
  using (auth.uid() = user_id);

create table if not exists public.problem_solutions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  problem_id uuid not null references public.problems (id) on delete cascade,
  title text not null,
  approach text not null,
  created_at timestamptz not null default now()
);

create index if not exists problem_solutions_idx
  on public.problem_solutions (problem_id, created_at desc);

alter table public.problem_solutions enable row level security;

drop policy if exists "Users read own problem_solutions" on public.problem_solutions;
create policy "Users read own problem_solutions"
  on public.problem_solutions for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own problem_solutions" on public.problem_solutions;
create policy "Users insert own problem_solutions"
  on public.problem_solutions for insert
  with check (auth.uid() = user_id);
