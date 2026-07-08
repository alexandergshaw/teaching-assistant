-- A "course hub": one row per course that bundles the resources associated with
-- it -- the GitHub codebases, a linked finalized syllabus, textbook details, the
-- GitHub org, and the Canvas course URL -- so an instructor has everything for a
-- course in one place. Owner-scoped; writes go through the Supabase service-role
-- client from server actions behind requireOwner(); RLS scopes reads/writes.
--
-- A partial/mismatched `courses` table (missing columns) was left behind by an
-- earlier interrupted apply and never held data (every insert errored). Drop it
-- and recreate the correct schema so this migration is a reliable one-shot
-- regardless of what partial state exists. (No-op DROP on a fresh database.)

drop table if exists public.courses cascade;

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  course_code text,
  term text,
  canvas_url text,
  -- Multiple codebases: a jsonb array of { repo, branch } (current app).
  repos jsonb not null default '[]'::jsonb,
  github_org text,
  -- Legacy single-repo columns, kept nullable so older app builds that still
  -- write github_repo/github_branch keep working during a rolling deploy. The
  -- current app reads/writes `repos`; these are superseded and can be dropped
  -- once every client is on the new build.
  github_repo text,
  github_branch text,
  textbook text,
  -- The linked finalized syllabus; keep the course if the syllabus is deleted.
  syllabus_id uuid references public.course_syllabi (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
