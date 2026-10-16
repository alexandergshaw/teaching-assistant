create table public.document_template_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 180),
  source_file_name text not null check (char_length(source_file_name) between 1 and 180),
  source_kind text not null check (source_kind in ('docx', 'pdf')),
  source_base64 text not null check (char_length(source_base64) between 1 and 3670016),
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  definition jsonb not null check (definition->>'version' = '1'),
  template_base64 text not null check (char_length(template_base64) between 1 and 3670016),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index document_template_files_user_updated on public.document_template_files(user_id, updated_at desc);
alter table public.document_template_files enable row level security;
create policy document_template_files_select on public.document_template_files for select to authenticated using ((select auth.uid()) = user_id);
create policy document_template_files_insert on public.document_template_files for insert to authenticated with check ((select auth.uid()) = user_id);
create policy document_template_files_update on public.document_template_files for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- The original and its owner are immutable, including writes through an authenticated client.
create function public.document_template_files_preserve_source() returns trigger language plpgsql set search_path = public as $$
begin
  if new.user_id is distinct from old.user_id or new.source_file_name is distinct from old.source_file_name or new.source_kind is distinct from old.source_kind or new.source_base64 is distinct from old.source_base64 or new.source_sha256 is distinct from old.source_sha256 then
    raise exception 'Document template source is immutable';
  end if;
  return new;
end;
$$;
create trigger document_template_files_preserve_source before update on public.document_template_files for each row execute function public.document_template_files_preserve_source();
