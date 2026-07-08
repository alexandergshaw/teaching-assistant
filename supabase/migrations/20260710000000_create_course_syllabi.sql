-- A library of finalized course syllabi produced by the Course Planning
-- "Syllabus" flow. Each row is a completed Word .docx (base64-encoded in
-- `content`) plus a name and optional course code, owner-scoped. Writes go
-- through the Supabase service-role client from server actions behind
-- requireOwner(); RLS scopes reads/writes to the owning user. Mirrors
-- syllabus_templates, which stores the input templates.

create table if not exists public.course_syllabi (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  file_name text not null,
  course_code text,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists course_syllabi_user_idx
  on public.course_syllabi (user_id, updated_at desc);

alter table public.course_syllabi enable row level security;

drop policy if exists "Users read own course syllabi" on public.course_syllabi;
create policy "Users read own course syllabi"
  on public.course_syllabi for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own course syllabi" on public.course_syllabi;
create policy "Users insert own course syllabi"
  on public.course_syllabi for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own course syllabi" on public.course_syllabi;
create policy "Users update own course syllabi"
  on public.course_syllabi for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own course syllabi" on public.course_syllabi;
create policy "Users delete own course syllabi"
  on public.course_syllabi for delete
  using (auth.uid() = user_id);
