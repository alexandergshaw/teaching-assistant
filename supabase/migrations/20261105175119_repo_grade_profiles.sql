-- Profile versions and rubric receipts are append-only. Only the current
-- configuration pointer can change. A cohort UUID is stable across retries.
create table public.repo_grade_profile_versions (
  user_id uuid not null,
  course_id uuid not null,
  folder text not null check (length(folder) between 1 and 512),
  configuration_fingerprint text not null check (configuration_fingerprint ~ '^[0-9a-f]{64}$'),
  profile jsonb not null,
  primary key (course_id, user_id, folder, configuration_fingerprint),
  foreign key (course_id, user_id) references public.course_hub (id, user_id) on delete cascade,
  check (jsonb_typeof(profile) = 'object' and profile @> jsonb_build_object(
    'accountId', user_id, 'courseId', course_id, 'folder', folder,
    'configurationFingerprint', configuration_fingerprint
  ))
);

create table public.repo_grade_current_profiles (
  user_id uuid not null,
  course_id uuid not null,
  folder text not null,
  configuration_fingerprint text not null,
  primary key (course_id, user_id, folder),
  foreign key (course_id, user_id, folder, configuration_fingerprint)
    references public.repo_grade_profile_versions on delete cascade
);

create table public.repo_grade_rubric_receipts (
  user_id uuid not null,
  course_id uuid not null,
  folder text not null,
  configuration_fingerprint text not null,
  cohort_id uuid not null,
  receipt jsonb not null,
  primary key (course_id, user_id, folder, cohort_id),
  foreign key (course_id, user_id, folder, configuration_fingerprint)
    references public.repo_grade_profile_versions on delete cascade,
  check (jsonb_typeof(receipt) = 'object' and receipt @> jsonb_build_object(
    'accountId', user_id, 'courseId', course_id, 'folder', folder,
    'configurationFingerprint', configuration_fingerprint
  )),
  check (coalesce(
    jsonb_typeof(receipt -> 'rubric') = 'string' and length(receipt ->> 'rubric') > 0
    and receipt ->> 'rubricFingerprint' ~ '^[0-9a-f]{64}$'
    and receipt ->> 'profileFingerprint' ~ '^[0-9a-f]{64}$', false
  ))
);

create index repo_grade_rubric_receipts_version_idx
  on public.repo_grade_rubric_receipts (course_id, user_id, folder, configuration_fingerprint);

alter table public.repo_grade_profile_versions enable row level security;
alter table public.repo_grade_current_profiles enable row level security;
alter table public.repo_grade_rubric_receipts enable row level security;

-- Raw instructions and rubrics are available through authorized server calls.
revoke all on public.repo_grade_profile_versions, public.repo_grade_current_profiles,
  public.repo_grade_rubric_receipts from public, anon, authenticated, service_role;
grant select, insert on public.repo_grade_profile_versions, public.repo_grade_current_profiles,
  public.repo_grade_rubric_receipts to service_role;
grant update (configuration_fingerprint) on public.repo_grade_current_profiles to service_role;

create function public.repo_grade_save_profile(
  p_user_id uuid, p_course_id uuid, p_folder text, p_configuration_fingerprint text,
  p_expected_configuration_fingerprint text, p_profile jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  current_fingerprint text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  perform 1 from public.course_hub c
    where c.id = p_course_id and c.user_id = p_user_id for share;
  if not found then return false; end if;

  select c.configuration_fingerprint into current_fingerprint from public.repo_grade_current_profiles c
    where c.course_id = p_course_id and c.user_id = p_user_id and c.folder = p_folder;
  if current_fingerprint is distinct from p_configuration_fingerprint
    and current_fingerprint is distinct from p_expected_configuration_fingerprint then
    return false;
  end if;

  insert into public.repo_grade_profile_versions (course_id, user_id, folder, configuration_fingerprint, profile)
    values (p_course_id, p_user_id, p_folder, p_configuration_fingerprint, p_profile)
    on conflict (course_id, user_id, folder, configuration_fingerprint) do nothing;
  if not exists (
    select 1 from public.repo_grade_profile_versions v
    where v.course_id = p_course_id and v.user_id = p_user_id and v.folder = p_folder
      and v.configuration_fingerprint = p_configuration_fingerprint and v.profile = p_profile
  ) then return false; end if;

  insert into public.repo_grade_current_profiles (course_id, user_id, folder, configuration_fingerprint)
    values (p_course_id, p_user_id, p_folder, p_configuration_fingerprint)
    on conflict (course_id, user_id, folder)
    do update set configuration_fingerprint = excluded.configuration_fingerprint;
  return true;
end;
$$;

create function public.repo_grade_freeze_rubric(
  p_user_id uuid, p_course_id uuid, p_folder text, p_configuration_fingerprint text,
  p_cohort_id uuid, p_receipt jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  existing public.repo_grade_rubric_receipts;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  perform 1 from public.course_hub c
    where c.id = p_course_id and c.user_id = p_user_id for share;
  if not found then return null; end if;

  select * into existing from public.repo_grade_rubric_receipts r
    where r.course_id = p_course_id and r.user_id = p_user_id and r.folder = p_folder
      and r.cohort_id = p_cohort_id;
  if found then
    if existing.configuration_fingerprint = p_configuration_fingerprint then return existing.receipt; end if;
    return null;
  end if;

  if not exists (
    select 1 from public.repo_grade_current_profiles c
    where c.course_id = p_course_id and c.user_id = p_user_id and c.folder = p_folder
      and c.configuration_fingerprint = p_configuration_fingerprint
  ) then return null; end if;

  insert into public.repo_grade_rubric_receipts (course_id, user_id, folder, configuration_fingerprint, cohort_id, receipt)
    values (p_course_id, p_user_id, p_folder, p_configuration_fingerprint, p_cohort_id, p_receipt);
  return p_receipt;
end;
$$;

create function public.repo_grade_read_profile(
  p_user_id uuid, p_course_id uuid, p_folder text, p_cohort_id uuid
) returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('profile', v.profile, 'receipt', null)
    from public.repo_grade_current_profiles c
    join public.repo_grade_profile_versions v using (course_id, user_id, folder, configuration_fingerprint)
    where p_cohort_id is null and c.course_id = p_course_id and c.user_id = p_user_id and c.folder = p_folder
  union all
  select jsonb_build_object('profile', v.profile, 'receipt', r.receipt)
    from public.repo_grade_rubric_receipts r
    join public.repo_grade_profile_versions v using (course_id, user_id, folder, configuration_fingerprint)
    where r.cohort_id = p_cohort_id and r.course_id = p_course_id and r.user_id = p_user_id and r.folder = p_folder;
$$;

revoke all on function public.repo_grade_save_profile(uuid, uuid, text, text, text, jsonb),
  public.repo_grade_freeze_rubric(uuid, uuid, text, text, uuid, jsonb),
  public.repo_grade_read_profile(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.repo_grade_save_profile(uuid, uuid, text, text, text, jsonb),
  public.repo_grade_freeze_rubric(uuid, uuid, text, text, uuid, jsonb),
  public.repo_grade_read_profile(uuid, uuid, text, uuid) to service_role;
