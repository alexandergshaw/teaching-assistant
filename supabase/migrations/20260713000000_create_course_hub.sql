-- Course hub: one row per course, bundling the resources associated with it --
-- the GitHub codebases (a jsonb array of { repo, branch }), the GitHub org, a
-- linked finalized syllabus, textbook details, and the Canvas course URL.
--
-- Uses a DEDICATED table name (course_hub) rather than "courses" because this
-- database already contains an unrelated `courses` table (with its own schema)
-- that this feature must not touch. Owner-scoped; writes go through the Supabase
-- service-role client from server actions behind requireOwner(); RLS scopes
-- reads/writes to the owning user. Written idempotently so it is safe to re-run.

create table if not exists public.course_hub (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.course_hub add column if not exists name text;
alter table public.course_hub add column if not exists course_code text;
alter table public.course_hub add column if not exists term text;
alter table public.course_hub add column if not exists canvas_url text;
-- Multiple codebases per course.
alter table public.course_hub add column if not exists repos jsonb not null default '[]'::jsonb;
alter table public.course_hub add column if not exists github_org text;
alter table public.course_hub add column if not exists textbook text;
-- The linked finalized syllabus; keep the course if the syllabus is deleted.
alter table public.course_hub add column if not exists syllabus_id uuid references public.course_syllabi (id) on delete set null;
alter table public.course_hub add column if not exists notes text;

create index if not exists course_hub_user_idx
  on public.course_hub (user_id, updated_at desc);

alter table public.course_hub enable row level security;

drop policy if exists "Users read own course_hub" on public.course_hub;
create policy "Users read own course_hub"
  on public.course_hub for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own course_hub" on public.course_hub;
create policy "Users insert own course_hub"
  on public.course_hub for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own course_hub" on public.course_hub;
create policy "Users update own course_hub"
  on public.course_hub for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own course_hub" on public.course_hub;
create policy "Users delete own course_hub"
  on public.course_hub for delete
  using (auth.uid() = user_id);
