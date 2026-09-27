-- A library of owner-uploaded .pptx templates for the PowerPoint Design
-- generator (A43-T, docs/a43-scope.md section 11.3). Each row is a saved
-- PowerPoint .pptx (base64-encoded in `content`) plus a name, owner-scoped -
-- the same shape as 20260709000000_create_syllabus_templates.sql, whose
-- generateCourseSyllabusAction this feature ports and generalises. Writes go
-- through the Supabase service-role client from server actions behind
-- requireUser(); RLS scopes reads/writes to the owning user.
--
-- template_sha256 is a stamped provenance column (docs/a43-scope.md
-- RES-A43-9): which uploaded template's bytes produced a given filled deck,
-- without inventing a second provenance shape - a hash of `content` is
-- computed by the application before insert, not by this migration.

create table if not exists public.deck_template_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  file_name text not null,
  content text not null,
  template_sha256 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deck_template_files_user_idx
  on public.deck_template_files (user_id, updated_at desc);

alter table public.deck_template_files enable row level security;

drop policy if exists "Users read own deck template files" on public.deck_template_files;
create policy "Users read own deck template files"
  on public.deck_template_files for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own deck template files" on public.deck_template_files;
create policy "Users insert own deck template files"
  on public.deck_template_files for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own deck template files" on public.deck_template_files;
create policy "Users update own deck template files"
  on public.deck_template_files for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own deck template files" on public.deck_template_files;
create policy "Users delete own deck template files"
  on public.deck_template_files for delete
  using (auth.uid() = user_id);
