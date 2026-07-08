-- A library of reusable syllabus templates for the Course Planning "Syllabus"
-- flow. Each row is a saved Word .docx (base64-encoded in `content`) plus a name,
-- owner-scoped. Writes go through the Supabase service-role client from server
-- actions behind requireOwner(); RLS scopes reads/writes to the owning user.

create table if not exists public.syllabus_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  file_name text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists syllabus_templates_user_idx
  on public.syllabus_templates (user_id, updated_at desc);

alter table public.syllabus_templates enable row level security;

drop policy if exists "Users read own syllabus templates" on public.syllabus_templates;
create policy "Users read own syllabus templates"
  on public.syllabus_templates for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own syllabus templates" on public.syllabus_templates;
create policy "Users insert own syllabus templates"
  on public.syllabus_templates for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own syllabus templates" on public.syllabus_templates;
create policy "Users update own syllabus templates"
  on public.syllabus_templates for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own syllabus templates" on public.syllabus_templates;
create policy "Users delete own syllabus templates"
  on public.syllabus_templates for delete
  using (auth.uid() = user_id);
