create table if not exists public.institution_directory_profiles (
  user_id uuid not null references auth.users (id) on delete cascade,
  acronym text not null check (acronym = upper(btrim(acronym)) and acronym ~ '^[A-Z0-9][A-Z0-9_-]{0,19}$'),
  full_name text not null default '',
  email_client text not null default '' check (email_client in ('', 'outlook', 'gmail', 'other')),
  email_client_other_name text not null default '',
  lms_other_name text not null default '',
  faculty_portal_url text not null default '',
  website_url text not null default '',
  department text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, acronym)
);

alter table public.institution_directory_profiles enable row level security;

drop policy if exists "Users read own institution directory profiles" on public.institution_directory_profiles;
create policy "Users read own institution directory profiles"
  on public.institution_directory_profiles for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users insert own institution directory profiles" on public.institution_directory_profiles;
create policy "Users insert own institution directory profiles"
  on public.institution_directory_profiles for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users update own institution directory profiles" on public.institution_directory_profiles;
create policy "Users update own institution directory profiles"
  on public.institution_directory_profiles for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own institution directory profiles" on public.institution_directory_profiles;
create policy "Users delete own institution directory profiles"
  on public.institution_directory_profiles for delete to authenticated
  using (auth.uid() = user_id);

revoke all on public.institution_directory_profiles from anon, authenticated;
grant select on public.institution_directory_profiles to authenticated;
grant select, insert, update, delete on public.institution_directory_profiles to service_role;

create or replace function public.save_institution_directory_profile(
  p_user_id uuid,
  p_acronym text,
  p_mode text,
  p_profile jsonb,
  p_common_values jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fields jsonb;
  v_result jsonb := '[]'::jsonb;
  v_entry jsonb;
  v_seen_email boolean := false;
  v_seen_outlook boolean := false;
  v_seen_lms boolean := false;
  v_saved_acronym text;
begin
  if p_user_id is null or p_acronym is null or p_acronym <> upper(btrim(p_acronym))
     or p_mode not in ('create', 'update') then
    raise exception 'invalid_directory_profile';
  end if;

  if p_mode = 'create' then
    insert into public.institution_directory_profiles (
      user_id, acronym, full_name, email_client, email_client_other_name,
      lms_other_name, faculty_portal_url, website_url, department, updated_at
    ) values (
      p_user_id, p_acronym,
      coalesce(p_profile ->> 'fullName', ''),
      coalesce(p_profile ->> 'emailClient', ''),
      coalesce(p_profile ->> 'emailClientOtherName', ''),
      coalesce(p_profile ->> 'lmsOtherName', ''),
      coalesce(p_profile ->> 'facultyPortalUrl', ''),
      coalesce(p_profile ->> 'websiteUrl', ''),
      coalesce(p_profile ->> 'department', ''), now()
    ) on conflict (user_id, acronym) do nothing
    returning acronym into v_saved_acronym;
    if v_saved_acronym is null then raise exception 'duplicate_directory_profile'; end if;
  else
    update public.institution_directory_profiles set
      full_name = coalesce(p_profile ->> 'fullName', ''),
      email_client = coalesce(p_profile ->> 'emailClient', ''),
      email_client_other_name = coalesce(p_profile ->> 'emailClientOtherName', ''),
      lms_other_name = coalesce(p_profile ->> 'lmsOtherName', ''),
      faculty_portal_url = coalesce(p_profile ->> 'facultyPortalUrl', ''),
      website_url = coalesce(p_profile ->> 'websiteUrl', ''),
      department = coalesce(p_profile ->> 'department', ''),
      updated_at = now()
    where user_id = p_user_id and acronym = p_acronym
    returning acronym into v_saved_acronym;
    if v_saved_acronym is null then raise exception 'directory_profile_not_found'; end if;
  end if;

  select case when jsonb_typeof(fields) = 'array' then fields else '[]'::jsonb end
    into v_fields
    from public.institution_fields
    where user_id = p_user_id and acronym = p_acronym
    for update;

  if v_fields is null then v_fields := '[]'::jsonb; end if;

  for v_entry in select value from jsonb_array_elements(v_fields)
  loop
    if jsonb_typeof(v_entry) = 'object' and v_entry ->> 'id' = 'email' then
      v_entry := jsonb_set(v_entry, '{value}', to_jsonb(case
        when p_mode = 'create' and coalesce(p_common_values ->> 'email', '') = '' then coalesce(v_entry ->> 'value', '')
        else coalesce(p_common_values ->> 'email', '') end), true);
      v_seen_email := true;
    elsif jsonb_typeof(v_entry) = 'object' and v_entry ->> 'id' = 'outlookUrl' then
      v_entry := jsonb_set(v_entry, '{value}', to_jsonb(case
        when p_mode = 'create' and coalesce(p_common_values ->> 'outlookUrl', '') = '' then coalesce(v_entry ->> 'value', '')
        else coalesce(p_common_values ->> 'outlookUrl', '') end), true);
      v_seen_outlook := true;
    elsif jsonb_typeof(v_entry) = 'object' and v_entry ->> 'id' = 'lmsUrl' then
      v_entry := jsonb_set(v_entry, '{value}', to_jsonb(case
        when p_mode = 'create' and coalesce(p_common_values ->> 'lmsUrl', '') = '' then coalesce(v_entry ->> 'value', '')
        else coalesce(p_common_values ->> 'lmsUrl', '') end), true);
      v_entry := jsonb_set(v_entry, '{lms}', to_jsonb(case
        when p_mode = 'create' and coalesce(p_common_values ->> 'lmsType', '') = '' then coalesce(v_entry ->> 'lms', '')
        else coalesce(p_common_values ->> 'lmsType', '') end), true);
      v_seen_lms := true;
    end if;
    v_result := v_result || jsonb_build_array(v_entry);
  end loop;

  if not v_seen_email then
    v_result := v_result || jsonb_build_array(jsonb_build_object('id','email','label','Email','type','text','value',coalesce(p_common_values ->> 'email','')));
  end if;
  if not v_seen_outlook then
    v_result := v_result || jsonb_build_array(jsonb_build_object('id','outlookUrl','label','Outlook URL','type','url','value',coalesce(p_common_values ->> 'outlookUrl','')));
  end if;
  if not v_seen_lms then
    v_result := v_result || jsonb_build_array(jsonb_build_object('id','lmsUrl','label','LMS','type','lms','value',coalesce(p_common_values ->> 'lmsUrl',''),'lms',coalesce(p_common_values ->> 'lmsType','')));
  end if;

  insert into public.institution_fields (user_id, acronym, fields, updated_at)
  values (p_user_id, p_acronym, v_result, now())
  on conflict (user_id, acronym) do update set fields = excluded.fields, updated_at = now();
end;
$$;

revoke all on function public.save_institution_directory_profile(uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_institution_directory_profile(uuid, text, text, jsonb, jsonb) to service_role;
