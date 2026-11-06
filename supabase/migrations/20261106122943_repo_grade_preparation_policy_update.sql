-- Each explicit replacement invalidates previews of the prior policy, even if
-- its settings are later restored. The revision is not a rubric evidence key.
alter table public.repo_grade_preparation_policies
  add column policy_revision uuid not null default gen_random_uuid();
grant update (policy_revision) on public.repo_grade_preparation_policies to service_role;

-- Startup can provision a missing policy, or use the exact existing pin.
-- Course edits and deployment changes require the separate owner operation.
create or replace function public.repo_grade_bootstrap_preparation(
  p_user_id uuid, p_course_id uuid, p_folder text, p_course_config jsonb, p_course_kind_basis jsonb,
  p_course_kind text, p_prompt_parser_version text, p_expected_fingerprint text, p_profile jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  course public.course_hub;
  current_profile public.repo_grade_current_profiles;
  policy public.repo_grade_preparation_policies;
  fingerprint text := p_profile ->> 'configurationFingerprint';
begin
  if p_user_id is null or p_course_id is null or p_folder is null
    or p_course_kind is null or p_course_kind not in ('coding', 'applied')
    or fingerprint is null or fingerprint !~ '^[0-9a-f]{64}$'
    or p_prompt_parser_version is null
    or p_prompt_parser_version !~ '^repo-grade-gemini-rubric-v[1-9][0-9]*:[0-9a-f]{64}:[0-9a-f]{64}$'
  then return false; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  select * into course from public.course_hub c where c.id = p_course_id and c.user_id = p_user_id for share;
  if not found or nullif(btrim(course.github_org), '') is null
    or p_course_kind_basis is distinct from jsonb_build_array(course.name, course.course_kind)
    or (case when course.course_kind in ('coding', 'applied') then course.course_kind <> p_course_kind
      else p_course_kind <> 'coding' end)
    or p_course_config is distinct from jsonb_build_object(
      'github_org', course.github_org, 'repos', course.repos, 'rubric_name', course.rubric_name,
      'rubric_data', course.rubric_data, 'repo_module_pairing', course.repo_module_pairing, 'student_repos', course.student_repos
    )
    or right(p_prompt_parser_version, 64) is distinct from encode(sha256(convert_to(
      '[' || coalesce(to_json(course.name)::text, 'null') || ',' || coalesce(to_json(course.course_kind)::text, 'null') || ']', 'UTF8'
    )), 'hex')
  then return false; end if;

  if not coalesce(p_profile @> jsonb_build_object(
    'accountId', p_user_id, 'courseId', p_course_id, 'folder', p_folder, 'provider', 'gemini',
    'rubricPolicy', 'generate', 'rubric', '', 'runCode', false, 'targetBranch', null
  ), false) then return false; end if;

  select * into current_profile from public.repo_grade_current_profiles c
    where c.course_id = p_course_id and c.user_id = p_user_id and c.folder = p_folder;
  if current_profile.configuration_fingerprint is distinct from p_expected_fingerprint
    or (p_expected_fingerprint is not null and p_expected_fingerprint <> fingerprint) then return false; end if;
  if (p_expected_fingerprint is null or current_profile.startup_default) and
    (coalesce(course.rubric_data, '') !~ '^[[:space:]]*$' or coalesce(course.rubric_name, '') !~ '^[[:space:]]*$')
  then return false; end if;

  select * into policy from public.repo_grade_preparation_policies p
    where p.course_id = p_course_id and p.user_id = p_user_id and p.folder = p_folder;
  if found and (policy.course_kind_basis is distinct from p_course_kind_basis
    or policy.prompt_parser_version <> p_prompt_parser_version or policy.course_kind <> p_course_kind)
  then return false; end if;

  if p_expected_fingerprint is null then
    if not (p_profile @> '{"sourceRef":null,"instructions":"","useReadmeInstructions":true,"applyNamingDeduction":true}'::jsonb)
    then return false; end if;
    if not public.repo_grade_save_profile(p_user_id, p_course_id, p_folder, fingerprint, null, p_profile) then return false; end if;
    update public.repo_grade_current_profiles c set startup_default = true
      where c.course_id = p_course_id and c.user_id = p_user_id and c.folder = p_folder;
  elsif not exists (
    select 1 from public.repo_grade_profile_versions v
    where v.course_id = p_course_id and v.user_id = p_user_id and v.folder = p_folder
      and v.configuration_fingerprint = fingerprint and v.profile = p_profile
  ) then return false; end if;

  insert into public.repo_grade_preparation_policies as p
    (user_id, course_id, folder, prompt_parser_version, course_kind, course_kind_basis)
  values (p_user_id, p_course_id, p_folder, p_prompt_parser_version, p_course_kind, p_course_kind_basis)
  on conflict (course_id, user_id, folder) do nothing;
  return true;
end;
$$;

create function public.repo_grade_preparation_policy_snapshot(
  p_user_id uuid, p_course_id uuid, p_folder text
) returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'revision', p.policy_revision, 'version', p.prompt_parser_version, 'courseKind', p.course_kind,
    'basis', jsonb_build_array(course.name, course.course_kind),
    'basisMatches', p.course_kind_basis is not distinct from jsonb_build_array(course.name, course.course_kind),
    'profileFingerprint', c.configuration_fingerprint,
    'model', v.profile ->> 'model', 'graderVersion', v.profile ->> 'graderVersion'
  )
  from public.repo_grade_preparation_policies p
  join public.repo_grade_current_profiles c using (course_id, user_id, folder)
  join public.repo_grade_profile_versions v using (course_id, user_id, folder, configuration_fingerprint)
  join public.course_hub course on course.id = p.course_id and course.user_id = p.user_id
  where p.user_id = p_user_id and p.course_id = p_course_id and p.folder = p_folder
    and v.profile @> '{"provider":"gemini","rubricPolicy":"generate","runCode":false,"targetBranch":null}'::jsonb
    and nullif(btrim(course.github_org), '') is not null
    and (not c.startup_default
      or (coalesce(course.rubric_data, '') ~ '^[[:space:]]*$' and coalesce(course.rubric_name, '') ~ '^[[:space:]]*$'));
$$;

create function public.repo_grade_update_preparation_policy(
  p_user_id uuid, p_course_id uuid, p_folder text, p_expected_revision uuid,
  p_expected_fingerprint text, p_course_kind text, p_prompt_parser_version text
) returns text language plpgsql security invoker set search_path = '' as $$
declare
  current_policy jsonb;
  basis jsonb;
  live_since timestamptz;
begin
  if p_user_id is null or p_expected_revision is null or p_expected_fingerprint is null
    or p_course_kind is null or p_course_kind not in ('coding', 'applied')
    or p_prompt_parser_version is null
    or p_prompt_parser_version !~ '^repo-grade-gemini-rubric-v[1-9][0-9]*:[0-9a-f]{64}:[0-9a-f]{64}$'
  then return 'conflict'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  perform 1 from public.course_hub where id = p_course_id and user_id = p_user_id for share;
  if not found then return 'conflict'; end if;

  current_policy := public.repo_grade_preparation_policy_snapshot(p_user_id, p_course_id, p_folder);
  basis := current_policy -> 'basis';
  if current_policy ->> 'revision' is distinct from p_expected_revision::text
    or current_policy ->> 'profileFingerprint' is distinct from p_expected_fingerprint
    or p_course_kind <> (case when basis ->> 1 in ('coding', 'applied') then basis ->> 1 else 'coding' end)
    or right(p_prompt_parser_version, 64) is distinct from encode(sha256(convert_to(
      '[' || coalesce(to_json(basis ->> 0)::text, 'null') || ',' || coalesce(to_json(basis ->> 1)::text, 'null') || ']', 'UTF8'
    )), 'hex')
  then return 'conflict'; end if;
  if current_policy ->> 'version' = p_prompt_parser_version and current_policy ->> 'courseKind' = p_course_kind
    and current_policy -> 'basisMatches' = 'true'::jsonb
  then return 'current'; end if;

  -- Under the same lock as claim, begin, and finish. Leave all evidence and
  -- reservations alone, including expired and uncertain provider work.
  live_since := clock_timestamp() - interval '15 minutes';
  if exists (
    select 1 from public.repo_grade_preparations p
    where p.user_id = p_user_id and p.course_id = p_course_id and p.folder = p_folder
      and p.state in ('prepared', 'started') and p.claimed_at > live_since
  ) or exists (
    select 1 from public.repo_grade_reservations r
    join public.repo_grade_attempts a using (generation, user_id)
    where a.user_id = p_user_id and a.course_id = p_course_id and a.folder = p_folder
      and a.preparation_key is not null and a.status = 'claimed' and a.claimed_at > live_since
  ) then return 'busy'; end if;

  update public.repo_grade_preparation_policies p
  set prompt_parser_version = p_prompt_parser_version, course_kind = p_course_kind,
    course_kind_basis = basis, policy_revision = gen_random_uuid()
  where p.user_id = p_user_id and p.course_id = p_course_id and p.folder = p_folder;
  return 'updated';
end;
$$;

revoke all on function public.repo_grade_preparation_policy_snapshot(uuid, uuid, text),
  public.repo_grade_update_preparation_policy(uuid, uuid, text, uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.repo_grade_preparation_policy_snapshot(uuid, uuid, text),
  public.repo_grade_update_preparation_policy(uuid, uuid, text, uuid, text, text, text)
  to service_role;
