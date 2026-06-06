-- Migration: create courses schema.
--
-- courses holds all one-to-one course data (title, description, term,
-- schedule, gemini_prompt, codebase).
--
-- File columns store Supabase Storage paths within the "course-files" bucket:
--   courses.schedule_file_path  – CSV  (.csv)
--   courses.codebase_file_path  – ZIP  (.zip)
--   lectures.file_path          – PowerPoint (.pptx / .ppt)
--   assignment_instructions.file_path  – Word document (.docx)
--   module_introductions.file_path     – Word document (.docx)
--
-- lectures, assignment_instructions, and module_introductions each have
-- a many-to-one relationship with courses.
--
-- Apply with:
--   supabase db push
-- or by pasting into the Supabase SQL editor.

-- ── storage bucket ────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('course-files', 'course-files', false)
on conflict (id) do nothing;

-- Only the file owner may read/write objects in the bucket.
-- Objects are stored under {user_id}/{course_id}/... paths.

create policy "course_files_select_own"
  on storage.objects for select
  using (
    bucket_id = 'course-files'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  );

create policy "course_files_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'course-files'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  );

create policy "course_files_update_own"
  on storage.objects for update
  using (
    bucket_id = 'course-files'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  );

create policy "course_files_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'course-files'
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  );

-- ── courses ──────────────────────────────────────────────────────────────────

create table if not exists public.courses (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  title                 text not null,
  description           text,
  term                  text,
  -- Storage path to the uploaded CSV schedule file.
  schedule_file_path    text,
  schedule_file_name    text,
  gemini_prompt         text,
  -- Storage path to the uploaded ZIP codebase archive.
  codebase_file_path    text,
  codebase_file_name    text
);

alter table public.courses enable row level security;

create policy "courses_select_own"
  on public.courses for select
  using (auth.uid() = user_id);

create policy "courses_insert_own"
  on public.courses for insert
  with check (auth.uid() = user_id);

create policy "courses_update_own"
  on public.courses for update
  using (auth.uid() = user_id);

create policy "courses_delete_own"
  on public.courses for delete
  using (auth.uid() = user_id);

-- ── lectures ─────────────────────────────────────────────────────────────────

create table if not exists public.lectures (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  course_id  uuid not null references public.courses (id) on delete cascade,
  title      text not null,
  -- Storage path to the uploaded PowerPoint lecture file (.pptx / .ppt).
  file_path  text,
  file_name  text
);

alter table public.lectures enable row level security;

create policy "lectures_select_own"
  on public.lectures for select
  using (
    exists (
      select 1 from public.courses
      where courses.id = lectures.course_id
        and courses.user_id = auth.uid()
    )
  );

create policy "lectures_insert_own"
  on public.lectures for insert
  with check (
    exists (
      select 1 from public.courses
      where courses.id = lectures.course_id
        and courses.user_id = auth.uid()
    )
  );

create policy "lectures_update_own"
  on public.lectures for update
  using (
    exists (
      select 1 from public.courses
      where courses.id = lectures.course_id
        and courses.user_id = auth.uid()
    )
  );

create policy "lectures_delete_own"
  on public.lectures for delete
  using (
    exists (
      select 1 from public.courses
      where courses.id = lectures.course_id
        and courses.user_id = auth.uid()
    )
  );

-- ── assignment_instructions ───────────────────────────────────────────────────

create table if not exists public.assignment_instructions (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  course_id  uuid not null references public.courses (id) on delete cascade,
  title      text not null,
  -- Storage path to the uploaded Word document (.docx).
  file_path  text,
  file_name  text
);

alter table public.assignment_instructions enable row level security;

create policy "assignment_instructions_select_own"
  on public.assignment_instructions for select
  using (
    exists (
      select 1 from public.courses
      where courses.id = assignment_instructions.course_id
        and courses.user_id = auth.uid()
    )
  );

create policy "assignment_instructions_insert_own"
  on public.assignment_instructions for insert
  with check (
    exists (
      select 1 from public.courses
      where courses.id = assignment_instructions.course_id
        and courses.user_id = auth.uid()
    )
  );

create policy "assignment_instructions_update_own"
  on public.assignment_instructions for update
  using (
    exists (
      select 1 from public.courses
      where courses.id = assignment_instructions.course_id
        and courses.user_id = auth.uid()
    )
  );

create policy "assignment_instructions_delete_own"
  on public.assignment_instructions for delete
  using (
    exists (
      select 1 from public.courses
      where courses.id = assignment_instructions.course_id
        and courses.user_id = auth.uid()
    )
  );

-- ── module_introductions ──────────────────────────────────────────────────────

create table if not exists public.module_introductions (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  course_id  uuid not null references public.courses (id) on delete cascade,
  title      text not null,
  -- Storage path to the uploaded Word document (.docx).
  file_path  text,
  file_name  text
);

alter table public.module_introductions enable row level security;

create policy "module_introductions_select_own"
  on public.module_introductions for select
  using (
    exists (
      select 1 from public.courses
      where courses.id = module_introductions.course_id
        and courses.user_id = auth.uid()
    )
  );

create policy "module_introductions_insert_own"
  on public.module_introductions for insert
  with check (
    exists (
      select 1 from public.courses
      where courses.id = module_introductions.course_id
        and courses.user_id = auth.uid()
    )
  );

create policy "module_introductions_update_own"
  on public.module_introductions for update
  using (
    exists (
      select 1 from public.courses
      where courses.id = module_introductions.course_id
        and courses.user_id = auth.uid()
    )
  );

create policy "module_introductions_delete_own"
  on public.module_introductions for delete
  using (
    exists (
      select 1 from public.courses
      where courses.id = module_introductions.course_id
        and courses.user_id = auth.uid()
    )
  );
