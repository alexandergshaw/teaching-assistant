create table if not exists public.institution_directory_decks (
  user_id uuid not null,
  acronym text not null,
  id uuid not null,
  file_name text not null check (length(btrim(file_name)) between 1 and 180 and file_name !~ '[[:cntrl:]]'),
  extension text not null check (extension in ('pptx', 'potx')),
  size_bytes integer not null check (size_bytes between 1 and 26214400),
  created_at timestamptz not null default now(),
  primary key (user_id, acronym, id),
  foreign key (user_id, acronym)
    references public.institution_directory_profiles (user_id, acronym) on delete cascade
);

alter table public.institution_directory_decks enable row level security;
revoke all on public.institution_directory_decks from public, anon, authenticated;
grant select, insert, delete on public.institution_directory_decks to service_role;

-- Lock the profile before collecting its file keys so a concurrent registration
-- either lands before this deletion or fails its foreign-key check afterward.
create or replace function public.remove_institution_directory_profile_with_decks(
  p_user_id uuid, p_acronym text
) returns setof public.institution_directory_decks
language plpgsql security invoker set search_path = ''
as $$
begin
  perform 1 from public.institution_directory_profiles
    where user_id = p_user_id and acronym = p_acronym
    for update;
  return query select * from public.institution_directory_decks
    where user_id = p_user_id and acronym = p_acronym;
  delete from public.institution_directory_profiles
    where user_id = p_user_id and acronym = p_acronym;
end;
$$;

revoke execute on function public.remove_institution_directory_profile_with_decks(uuid, text) from public, anon, authenticated;
grant execute on function public.remove_institution_directory_profile_with_decks(uuid, text) to service_role;

-- All access is through owner-scoped server actions and signed URLs. The
-- browser upload token targets a staging key only. Published files have no
-- client INSERT or UPDATE policy.
-- Abandoned staging objects have no read URL or file metadata.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('institution-directory-decks', 'institution-directory-decks', false, 26214400, array[
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.template'
])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
