-- Course-level rubric attachments do not identify an assignment. The
-- startup default prepares a rubric from complete pinned folder evidence.
-- The original raw course snapshot comparison still guards concurrent edits.

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
    'rubricPolicy', 'generate', 'rubric', '', 'targetBranch', null
  ), false) or jsonb_typeof(p_profile -> 'runCode') is distinct from 'boolean' then return false; end if;

  select * into current_profile from public.repo_grade_current_profiles c
    where c.course_id = p_course_id and c.user_id = p_user_id and c.folder = p_folder;
  if current_profile.configuration_fingerprint is distinct from p_expected_fingerprint
    or (p_expected_fingerprint is not null and p_expected_fingerprint <> fingerprint) then return false; end if;

  select * into policy from public.repo_grade_preparation_policies p
    where p.course_id = p_course_id and p.user_id = p_user_id and p.folder = p_folder;
  if found and (policy.course_kind_basis is distinct from p_course_kind_basis
    or policy.prompt_parser_version <> p_prompt_parser_version or policy.course_kind <> p_course_kind)
  then return false; end if;

  if p_expected_fingerprint is null then
    -- Startup-created profiles remain default-off; only a previously saved
    -- exact profile may opt into sandbox execution.
    if p_profile -> 'runCode' is distinct from 'false'::jsonb then return false; end if;
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


create or replace function public.repo_grade_preparation_key(
  p_user_id uuid, p_course_id uuid, p_folder text, p_course_config jsonb,
  p_fingerprint text, p_instruction_digest text
) returns text language sql stable security invoker set search_path = '' as $$
  -- JSON.stringify of a fixed string tuple uses commas without spaces.
  select encode(sha256(convert_to('[' || array_to_string(array[
    to_json(case when v.profile -> 'useReadmeInstructions' = 'false'::jsonb then 'repo-grade-preparation-v1' else 'repo-grade-preparation-v2' end::text)::text, to_json(p_user_id::text)::text,
    to_json(p_course_id::text)::text, to_json(p_folder)::text, to_json(p_fingerprint)::text,
    to_json(case when v.profile -> 'useReadmeInstructions' = 'false'::jsonb then 'saved'
      when v.profile ->> 'instructions' <> '' then 'readme-with-configured-fallback'
      else 'readme' end)::text,
    to_json(p_instruction_digest)::text, to_json(v.profile ->> 'provider')::text,
    to_json(v.profile ->> 'model')::text, to_json(v.profile ->> 'graderVersion')::text,
    to_json(policy.prompt_parser_version)::text, to_json(policy.course_kind)::text
  ], ',') || ']', 'UTF8')), 'hex')
  from public.repo_grade_preparation_policies policy
  join public.repo_grade_current_profiles c using (course_id, user_id, folder)
  join public.repo_grade_profile_versions v using (course_id, user_id, folder, configuration_fingerprint)
  join public.course_hub course on course.id = c.course_id and course.user_id = c.user_id
  where policy.user_id = p_user_id and policy.course_id = p_course_id and policy.folder = p_folder
    and c.configuration_fingerprint = p_fingerprint
    and v.profile @> '{"provider":"gemini","rubricPolicy":"generate","targetBranch":null}'::jsonb
    and jsonb_typeof(v.profile -> 'runCode') = 'boolean'
    and v.profile ->> 'model' <> '' and v.profile ->> 'graderVersion' <> ''
    and nullif(btrim(course.github_org), '') is not null
    and (course.course_kind not in ('coding', 'applied') or course.course_kind is null
      or course.course_kind = policy.course_kind)
    and (policy.course_kind_basis is null or policy.course_kind_basis = jsonb_build_array(course.name, course.course_kind))
    and p_course_config = jsonb_build_object(
      'github_org', course.github_org, 'repos', course.repos,
      'rubric_name', course.rubric_name, 'rubric_data', course.rubric_data,
      'repo_module_pairing', course.repo_module_pairing, 'student_repos', course.student_repos
    );
$$;

create or replace function public.repo_grade_preparation_policy_snapshot(
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
    and v.profile @> '{"provider":"gemini","rubricPolicy":"generate","targetBranch":null}'::jsonb
    and jsonb_typeof(v.profile -> 'runCode') = 'boolean'
    and nullif(btrim(course.github_org), '') is not null;
$$;
