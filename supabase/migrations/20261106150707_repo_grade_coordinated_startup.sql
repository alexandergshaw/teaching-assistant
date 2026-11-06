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
    'rubricPolicy', 'generate', 'rubric', '', 'runCode', false, 'targetBranch', null
  ), false) then return false; end if;

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
    to_json('repo-grade-preparation-v1'::text)::text, to_json(p_user_id::text)::text,
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
    and v.profile @> '{"provider":"gemini","rubricPolicy":"generate","runCode":false,"targetBranch":null}'::jsonb
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
    and v.profile @> '{"provider":"gemini","rubricPolicy":"generate","runCode":false,"targetBranch":null}'::jsonb
    and nullif(btrim(course.github_org), '') is not null;
$$;

create or replace function public.repo_grade_start_startup_target(
  p_user_id uuid, p_batch_id uuid, p_course_id uuid, p_repo text, p_folder text, p_ref text, p_sha text
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  update public.repo_grade_startup_targets t set started_at = clock_timestamp()
  from public.repo_grade_startup_batches b
  where b.user_id = p_user_id and b.id = p_batch_id and b.sealed_at is not null
    and b.closed_at is null and b.expires_at > clock_timestamp()
    and t.user_id = b.user_id and t.batch_id = b.id and t.course_id = p_course_id
    and t.repo = p_repo and t.folder = p_folder and t.source_ref = p_ref and t.source_sha = p_sha
    and t.started_at is null;
  if not found then return false; end if;

  -- A progressing batch keeps its lease. Per-attempt dispatch leases remain
  -- independently bounded, and an idle or abandoned batch still expires.
  update public.repo_grade_startup_batches
    set expires_at = clock_timestamp() + interval '15 minutes'
    where user_id = p_user_id and id = p_batch_id;
  return true;
end;
$$;

-- A claim and its batch link commit together under the same account lock.
-- Once a prior batch expires, it cannot acquire a grade attempt. A start
-- marker without a link can then be revisited. Prep has a separate ledger.
create or replace function public.repo_grade_stage_startup(
  p_user_id uuid, p_batch_id uuid, p_course_id uuid, p_targets jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  skipped jsonb;
  now_at timestamptz;
begin
  if jsonb_typeof(p_targets) is distinct from 'array' or jsonb_array_length(p_targets) > 1000 then
    raise exception 'invalid startup plan';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  now_at := clock_timestamp();
  perform 1 from public.course_hub where id = p_course_id and user_id = p_user_id for key share;
  if not found then raise exception 'startup course unavailable'; end if;

  delete from public.repo_grade_startup_batches
    where user_id = p_user_id and sealed_at is null and created_at < clock_timestamp() - interval '1 hour';
  insert into public.repo_grade_startup_batches (user_id, id) values (p_user_id, p_batch_id)
    on conflict do nothing;
  if exists (select 1 from public.repo_grade_startup_batches
    where user_id = p_user_id and id = p_batch_id and sealed_at is not null)
  then raise exception 'startup batch already sealed'; end if;

  delete from public.repo_grade_startup_targets
    where user_id = p_user_id and batch_id = p_batch_id and course_id = p_course_id;
  with candidates as (
    select distinct target.*, prior.state as captured
    from jsonb_to_recordset(p_targets) as target(repo text, folder text, ref text, sha text)
    left join lateral (
      select case
        when a.status = 'claimed' then case
          when b.closed_at is null and b.expires_at > now_at and a.claimed_at > now_at - interval '15 minutes'
            then 'claimed' else 'unknown' end
        when a.status is not null then a.status
        when t.unlinked_status = 'already-processed' then 'terminal'
        when t.unlinked_status is not null then t.unlinked_status
        when t.started_at is not null then 'unknown'
        else 'claimed'
      end as state
      from public.repo_grade_startup_targets t
      join public.repo_grade_startup_batches b on b.user_id = t.user_id and b.id = t.batch_id
      left join public.repo_grade_attempts a on a.generation = t.attempt_generation and a.user_id = t.user_id
      where t.user_id = p_user_id and t.course_id = p_course_id and b.sealed_at is not null
        and lower(t.repo) = lower(target.repo) and t.source_sha = target.sha and t.folder = target.folder
        and ((b.closed_at is null and b.expires_at > now_at)
          or (t.started_at is not null
            and (t.attempt_generation is not null or t.unlinked_status = 'already-processed'
              or (b.expires_at > now_at and t.unlinked_status is distinct from 'not-started'))))
      order by (t.started_at is not null) desc, b.sealed_at desc, b.id desc
      limit 1
    ) prior on true
  ), installed as (
    insert into public.repo_grade_startup_targets (user_id, batch_id, course_id, repo, folder, source_ref, source_sha)
      select p_user_id, p_batch_id, p_course_id, repo, folder, ref, sha from candidates where captured is null
    returning 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('repo', repo, 'folder', folder, 'ref', ref, 'sha', sha,
    'state', captured)), '[]'::jsonb)
    into skipped from candidates where captured is not null;
  return skipped;
end;
$$;

create or replace function public.repo_grade_seal_startup(p_user_id uuid, p_batch_id uuid, p_count integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  now_at timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  now_at := clock_timestamp();
  if p_count is null or p_count < 1 or p_count > 1000 or exists (
    select 1 from public.repo_grade_startup_batches
    where user_id = p_user_id and sealed_at is not null and closed_at is null and expires_at > now_at
  ) then return false; end if;
  if (select count(*) from public.repo_grade_startup_targets where user_id = p_user_id and batch_id = p_batch_id) <> p_count
    or exists (
      select 1 from public.repo_grade_startup_targets t
      join public.repo_grade_startup_targets prior on prior.user_id = t.user_id and prior.course_id = t.course_id
        and lower(prior.repo) = lower(t.repo) and prior.source_sha = t.source_sha and prior.folder = t.folder
      join public.repo_grade_startup_batches b on b.user_id = prior.user_id and b.id = prior.batch_id
      where t.user_id = p_user_id and t.batch_id = p_batch_id and b.sealed_at is not null
        and ((b.closed_at is null and b.expires_at > now_at)
          or (prior.started_at is not null
            and (prior.attempt_generation is not null or prior.unlinked_status = 'already-processed'
              or (b.expires_at > now_at and prior.unlinked_status is distinct from 'not-started'))))
    ) then return false; end if;
  update public.repo_grade_startup_batches set sealed_at = now_at, expires_at = now_at + interval '15 minutes'
    where user_id = p_user_id and id = p_batch_id and sealed_at is null;
  return found;
end;
$$;
