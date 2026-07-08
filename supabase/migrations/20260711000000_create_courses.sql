-- A "course hub": one row per course that bundles the resources associated with
-- it -- the GitHub codebase, a linked finalized syllabus, textbook details, and
-- the Canvas course URL -- so an instructor has everything for a course in one
-- place. Owner-scoped; writes go through the Supabase service-role client from
-- server actions behind requireOwner(); RLS scopes reads/writes to the owner.

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Reconcile a table that may already exist from a partial/earlier apply: add
-- any missing columns so this migration is safe to (re-)run against a courses
-- table that predates it. `add column if not exists` is a no-op when present.
alter table public.courses add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.courses add column if not exists name text;
alter table public.courses add column if not exists course_code text;
alter table public.courses add column if not exists term text;
alter table public.courses add column if not exists canvas_url text;
alter table public.courses add column if not exists github_repo text;
alter table public.courses add column if not exists github_branch text;
alter table public.courses add column if not exists textbook text;
-- The linked finalized syllabus; keep the course if the syllabus is deleted.
alter table public.courses add column if not exists syllabus_id uuid references public.course_syllabi (id) on delete set null;
alter table public.courses add column if not exists notes text;
alter table public.courses add column if not exists created_at timestamptz not null default now();
alter table public.courses add column if not exists updated_at timestamptz not null default now();

create index if not exists courses_user_idx
  on public.courses (user_id, updated_at desc);

alter table public.courses enable row level security;

drop policy if exists "Users read own courses" on public.courses;
create policy "Users read own courses"
  on public.courses for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own courses" on public.courses;
create policy "Users insert own courses"
  on public.courses for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own courses" on public.courses;
create policy "Users update own courses"
  on public.courses for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own courses" on public.courses;
create policy "Users delete own courses"
  on public.courses for delete
  using (auth.uid() = user_id);
