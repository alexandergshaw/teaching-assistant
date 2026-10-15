-- Source ownership is enforced for service-role writes as well as browser RLS.
create unique index if not exists deck_template_files_user_id_id_key on public.deck_template_files(user_id, id);
create table if not exists public.powerpoint_template_libraries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_file_id uuid not null,
  name text not null check (char_length(name) between 1 and 160),
  definition jsonb not null check (definition->>'version' = '1' and jsonb_typeof(definition->'slides') = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint powerpoint_template_source_owner foreign key (user_id, source_file_id)
    references public.deck_template_files(user_id, id) on delete cascade
);
alter table public.powerpoint_template_libraries enable row level security;
create policy "Users manage own PowerPoint libraries" on public.powerpoint_template_libraries
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists powerpoint_template_libraries_user_updated on public.powerpoint_template_libraries(user_id, updated_at desc);
