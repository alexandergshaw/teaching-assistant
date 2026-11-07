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

create function public.repo_grade_template_preparation_key(p_base text, p_source jsonb)
returns text language sql immutable security invoker set search_path = '' as $$
  select case when p_base is null then null when p_source ->> 'kind' = 'template-readme' then
    encode(sha256(convert_to('[' || array_to_string(array[
      to_json('repo-grade-template-key-v1'::text)::text, to_json(p_base)::text,
      to_json(p_source ->> 'repo')::text, to_json(p_source ->> 'sourceRef')::text,
      to_json(p_source ->> 'sourceCommit')::text
    ], ',') || ']', 'UTF8')), 'hex') else p_base end;
$$;
revoke all on function public.repo_grade_template_preparation_key(text,jsonb) from public, anon, authenticated;
grant execute on function public.repo_grade_template_preparation_key(text,jsonb) to service_role;

create or replace function public.repo_grade_claim_preparation(
  p_user_id uuid, p_course_id uuid, p_folder text, p_course_config jsonb,
  p_fingerprint text, p_key text, p_instructions text, p_targets jsonb, p_retry_generation text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  prep public.repo_grade_preparations;
  course public.course_hub;
  profile jsonb;
  instruction_digest text;
  denial text;
  retry_generation text;
  evidence jsonb;
  target jsonb;
  source jsonb;
  target_repo text;
  target_ref text;
  seen_repos text[] := '{}';
  template_source jsonb;
begin
  if p_user_id is null or p_course_id is null or p_folder is null then
    return jsonb_build_object('status', 'forbidden');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  select * into course from public.course_hub c where c.id = p_course_id and c.user_id = p_user_id for share;
  if not found then return jsonb_build_object('status', 'forbidden'); end if;
  if not public.repo_grade_preparation_required(p_user_id, p_course_id, p_folder) then
    return jsonb_build_object('status', 'disabled');
  end if;
  if p_instructions is null or p_instructions ~ '^[[:space:]]*$'
    or octet_length(p_instructions) > 128000 or jsonb_typeof(p_targets) is distinct from 'array'
  then return jsonb_build_object('status', 'invalid-evidence'); end if;
  if jsonb_array_length(p_targets) not between 1 and 4000 then
    return jsonb_build_object('status', 'invalid-evidence');
  end if;
  instruction_digest := encode(sha256(convert_to(p_instructions, 'UTF8')), 'hex');
  if p_key is null or p_key is distinct from public.repo_grade_template_preparation_key(public.repo_grade_preparation_key(
    p_user_id, p_course_id, p_folder, p_course_config, p_fingerprint, instruction_digest
  ), p_targets -> 0 -> 'source') then return jsonb_build_object('status', 'configuration-changed'); end if;

  select v.profile into profile from public.repo_grade_profile_versions v
  where v.course_id = p_course_id and v.user_id = p_user_id and v.folder = p_folder
    and v.configuration_fingerprint = p_fingerprint;
  for evidence in select value from jsonb_array_elements(p_targets) loop
    target := evidence -> 'target';
    source := evidence -> 'source';
    target_repo := (target ->> 'owner') || '/' || (target ->> 'repo');
    target_ref := target ->> 'sourceRef';
    if not coalesce(
      jsonb_typeof(target) = 'object' and jsonb_typeof(source) = 'object'
      and target = jsonb_build_object('owner', target ->> 'owner', 'repo', target ->> 'repo',
        'sourceRef', target_ref, 'sourceCommit', target ->> 'sourceCommit')
      and evidence = jsonb_build_object('target', target, 'source', source)
      and target_repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' and length(target_repo) <= 200
      and target_repo !~ '^\.{1,2}/|/\.{1,2}$'
      and lower(btrim(course.github_org)) = lower(target ->> 'owner')
      and lower(target_repo) <> all (seen_repos)
      and length(target_ref) between 1 and 255
      and target_ref !~ '[[:cntrl:][:space:]]'
      and target_ref !~ '(^|/)\.|\.lock(/|$)|\.$|\.\.|//|^/|/$|@\{|^@$|[~^:?*]'
      and position(chr(91) in target_ref) = 0 and position(chr(92) in target_ref) = 0
      and (profile ->> 'sourceRef' is null or profile ->> 'sourceRef' = target_ref)
      and target ->> 'sourceCommit' ~ '^[0-9a-f]{40}$'
      and case when profile -> 'useReadmeInstructions' = 'false'::jsonb then
        source = '{"kind":"saved"}'::jsonb and p_instructions = profile ->> 'instructions'
      else
        (source ->> 'kind' = 'template-readme'
          and source = jsonb_build_object('kind', 'template-readme', 'path', source -> 'path',
            'repo', source ->> 'repo', 'sourceRef', source ->> 'sourceRef', 'sourceCommit', source ->> 'sourceCommit',
            'blobSha', source -> 'blobSha', 'readmeStatus', source ->> 'readmeStatus', 'instructionSha256', source ->> 'instructionSha256')
          and source ->> 'sourceCommit' ~ '^[0-9a-f]{40}$'
          and length(source ->> 'sourceRef') between 1 and 255
          and source ->> 'sourceRef' !~ '[[:cntrl:][:space:]]|(^|/)\.|\.lock(/|$)|\.$|\.\.|//|^/|/$|@\{|^@$|[~^:?*]'
          and position(chr(91) in source ->> 'sourceRef') = 0 and position(chr(92) in source ->> 'sourceRef') = 0
          and ((source ->> 'readmeStatus' = 'present' and source ->> 'blobSha' ~ '^[0-9a-f]{40}$')
            or (source ->> 'readmeStatus' = 'blank' and source ->> 'blobSha' ~ '^[0-9a-f]{40}$' and p_instructions = profile ->> 'instructions')
            or (source ->> 'readmeStatus' = 'absent' and source -> 'blobSha' = 'null'::jsonb and source -> 'path' = 'null'::jsonb and p_instructions = profile ->> 'instructions'))
          and jsonb_typeof(to_jsonb(course.repos)) = 'array'
          and exists (select 1 from jsonb_array_elements(to_jsonb(course.repos)) cr
            where cr ->> 'repo' = source ->> 'repo' and (nullif(btrim(cr ->> 'branch'), '') is null or cr ->> 'branch' = source ->> 'sourceRef'))
          and (jsonb_array_length(to_jsonb(course.repos)) = 1 or to_jsonb(course.repo_module_pairing) ->> 'repoRef' = source ->> 'repo')
          and source ->> 'instructionSha256' = instruction_digest)
      end
      and (not (source ? 'path') or (source ->> 'readmeStatus' = 'absent' and source -> 'path' = 'null'::jsonb) or (
        jsonb_typeof(source -> 'path') = 'string' and octet_length(source ->> 'path') <= 4096
        and starts_with(source ->> 'path', p_folder || '/')
        and source ->> 'path' !~ '[[:cntrl:]]|(^|/)\.{1,2}(/|$)|//'
        and position(chr(92) in (source ->> 'path')) = 0
        and source ->> 'path' ~* '(^|/)(readme|([^/]*[._ -])?readme([._ -][^/]*)?\.(md|mdx|markdown|txt|rst|adoc|asciidoc|html|htm|tex|xml))$'
      )), false
    ) then return jsonb_build_object('status', 'invalid-evidence'); end if;
    if source ->> 'kind' = 'template-readme' then
      if template_source is not null and template_source is distinct from source then return jsonb_build_object('status', 'invalid-evidence'); end if;
      template_source := source;
    end if;
    seen_repos := array_append(seen_repos, lower(target_repo));
  end loop;

  perform public.repo_grade_expire_preparations(p_user_id);
  select * into prep from public.repo_grade_preparations p
  where p.course_id = p_course_id and p.user_id = p_user_id and p.folder = p_folder and p.preparation_key = p_key;

  if prep.id is not null and (prep.configuration_fingerprint is distinct from p_fingerprint
    or prep.instruction_digest is distinct from instruction_digest or prep.instructions is distinct from p_instructions
  ) then return jsonb_build_object('status', 'configuration-changed'); end if;
  if prep.state = 'unknown' then return jsonb_build_object('status', 'unknown'); end if;
  if prep.state in ('prepared', 'started') then return jsonb_build_object('status', 'busy'); end if;
  if prep.state in ('failed', 'expired') then
    if prep.course_config is distinct from p_course_config then
      return jsonb_build_object('status', 'configuration-changed');
    end if;
    if exists (select 1 from public.repo_grade_preparation_reservations r where r.id = prep.id)
      or exists (select 1 from public.repo_grade_rubric_receipts r where r.cohort_id = prep.id)
    then return jsonb_build_object('status', 'unknown'); end if;
    retry_generation := encode(sha256(convert_to(prep.token::text, 'UTF8')), 'hex');
    if p_retry_generation is null then
      return jsonb_build_object('status', 'explicit-retry-required', 'retryGeneration', retry_generation);
    end if;
  end if;
  if p_retry_generation is not null and p_retry_generation is distinct from retry_generation then
    return jsonb_build_object('status', 'retry-unavailable');
  end if;

  if prep.state is distinct from 'succeeded' then
    perform public.repo_grade_expire_prepared_attempts(p_user_id);
    denial := public.repo_grade_shared_capacity(p_user_id);
    if denial is not null then return jsonb_build_object('status', denial); end if;
    if prep.id is null then
      insert into public.repo_grade_preparations (
        user_id, course_id, folder, preparation_key, configuration_fingerprint, course_config, instruction_digest, instructions
      ) values (
        p_user_id, p_course_id, p_folder, p_key, p_fingerprint, p_course_config, instruction_digest, p_instructions
      ) returning * into prep;
    else
      -- Keep the terminal generation before reusing the stable cohort identity.
      insert into public.repo_grade_preparation_history (preparation_id, generation, state, claimed_at)
      values (prep.id, retry_generation, prep.state, prep.claimed_at);
      update public.repo_grade_preparations p set state = 'prepared', token = gen_random_uuid(),
        claimed_at = clock_timestamp()
      where p.id = prep.id returning p.* into prep;
    end if;
    insert into public.repo_grade_preparation_reservations (id, user_id) values (prep.id, p_user_id);
  end if;

  -- The input key can reuse a rubric across source commits. A new commit
  -- appends its own exact evidence and may never replace an existing capture.
  if exists (
    select 1 from jsonb_array_elements(p_targets) e(value)
    join public.repo_grade_preparation_targets t on t.preparation_id = prep.id
      and t.repo = ((e.value -> 'target' ->> 'owner') || '/' || (e.value -> 'target' ->> 'repo'))
      and t.source_ref = e.value -> 'target' ->> 'sourceRef'
      and t.source_sha = e.value -> 'target' ->> 'sourceCommit'
    where t.instruction_source is distinct from e.value -> 'source'
  ) then
    raise exception 'conflicting repo grade target evidence';
  end if;
  insert into public.repo_grade_preparation_targets (preparation_id, repo, source_ref, source_sha, instruction_source)
  select prep.id, (e.value -> 'target' ->> 'owner') || '/' || (e.value -> 'target' ->> 'repo'),
    e.value -> 'target' ->> 'sourceRef', e.value -> 'target' ->> 'sourceCommit', e.value -> 'source'
  from jsonb_array_elements(p_targets) e(value)
  on conflict (preparation_id, repo, source_ref, source_sha) do nothing;

  if prep.state = 'succeeded' then
    return (
      select jsonb_build_object('status', 'ready', 'cohortId', prep.id, 'receipt', r.receipt)
      from public.repo_grade_rubric_receipts r
      where r.user_id = p_user_id and r.course_id = p_course_id and r.folder = p_folder and r.cohort_id = prep.id
    );
  end if;
  return jsonb_build_object('status', 'claimed', 'cohortId', prep.id, 'token', prep.token);
end;
$$;

create or replace function public.repo_grade_preparation_context(
  p_user_id uuid, p_course_id uuid, p_folder text, p_cohort_id uuid, p_key text,
  p_repo text, p_source_ref text, p_source_sha text, p_course_config jsonb
) returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('instructions', p.instructions, 'source', t.instruction_source)
  from public.repo_grade_preparations p
  join public.repo_grade_preparation_targets t on t.preparation_id = p.id
  where p.user_id = p_user_id and p.course_id = p_course_id and p.folder = p_folder
    and p.id = p_cohort_id and p.preparation_key = p_key and p.state = 'succeeded'
    and t.repo = p_repo and t.source_ref = p_source_ref and t.source_sha = p_source_sha
    and p.preparation_key = public.repo_grade_template_preparation_key(public.repo_grade_preparation_key(
      p.user_id, p.course_id, p.folder, p_course_config, p.configuration_fingerprint, p.instruction_digest
    ), t.instruction_source);
$$;

create or replace function public.repo_grade_begin_preparation(p_user_id uuid, p_id uuid, p_token uuid)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  prep public.repo_grade_preparations;
  remaining_ms integer;
begin
  if p_user_id is null then return null; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  select p.* into prep from public.repo_grade_preparations p
  join public.repo_grade_preparation_reservations r using (id, user_id)
  where p.user_id = p_user_id and p.id = p_id and p.token = p_token and p.state = 'prepared';
  if not found then return null; end if;
  perform 1 from public.course_hub c where c.id = prep.course_id and c.user_id = p_user_id for share;
  if not found or not exists (select 1 from public.repo_grade_preparation_targets t where t.preparation_id = prep.id)
    or prep.preparation_key is distinct from public.repo_grade_template_preparation_key(public.repo_grade_preparation_key(
    p_user_id, prep.course_id, prep.folder, prep.course_config, prep.configuration_fingerprint, prep.instruction_digest
  ), (select t.instruction_source from public.repo_grade_preparation_targets t where t.preparation_id = prep.id limit 1)) then return null; end if;
  remaining_ms := floor(extract(epoch from (prep.claimed_at + interval '15 minutes' - clock_timestamp())) * 1000);
  if remaining_ms <= 0 then return null; end if;
  update public.repo_grade_preparations set state = 'started' where id = p_id;
  return remaining_ms;
end;
$$;

create or replace function public.repo_grade_finish_preparation(
  p_user_id uuid, p_id uuid, p_token uuid, p_key text, p_outcome text, p_receipt jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  prep public.repo_grade_preparations;
  final_state text := case when p_outcome = 'failed-before-dispatch' then 'failed' else p_outcome end;
  response text := final_state;
begin
  if p_user_id is null or p_outcome is null
    or p_outcome not in ('succeeded', 'failed', 'unknown', 'failed-before-dispatch') then
    return jsonb_build_object('status', 'forbidden');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  perform public.repo_grade_expire_preparations(p_user_id);
  select * into prep from public.repo_grade_preparations p
  where p.user_id = p_user_id and p.id = p_id and p.token = p_token and p.preparation_key = p_key;
  if not found then return jsonb_build_object('status', 'stale'); end if;
  if prep.state = 'succeeded' and p_outcome = 'succeeded' and exists (
    select 1 from public.repo_grade_rubric_receipts r where r.user_id = p_user_id
      and r.course_id = prep.course_id and r.folder = prep.folder and r.cohort_id = p_id and r.receipt = p_receipt
  ) then return jsonb_build_object('status', 'succeeded', 'receipt', p_receipt); end if;
  if prep.state in ('failed', 'unknown') and prep.state = final_state and p_receipt is null then
    return jsonb_build_object('status', prep.state);
  end if;
  if prep.state = 'unknown' then return jsonb_build_object('status', 'unknown'); end if;
  -- A failure reported before begin must never release a reservation for
  -- which another worker already received the single-use dispatch permit.
  if prep.state <> (case when p_outcome = 'failed-before-dispatch' then 'prepared' else 'started' end) or not exists (
    select 1 from public.repo_grade_preparation_reservations r where r.id = p_id and r.user_id = p_user_id
  ) then return jsonb_build_object('status', 'stale'); end if;
  perform 1 from public.course_hub c where c.id = prep.course_id and c.user_id = p_user_id for share;
  if not found then return jsonb_build_object('status', 'stale'); end if;

  if p_outcome = 'succeeded' then
    if not exists (select 1 from public.repo_grade_preparation_targets t where t.preparation_id = prep.id)
      or prep.preparation_key is distinct from public.repo_grade_template_preparation_key(public.repo_grade_preparation_key(
      p_user_id, prep.course_id, prep.folder, prep.course_config, prep.configuration_fingerprint, prep.instruction_digest
    ), (select t.instruction_source from public.repo_grade_preparation_targets t where t.preparation_id = prep.id limit 1)) then
      final_state := 'failed';
      response := 'configuration-changed';
    else
      -- Require both the normalized fingerprint and the separate hash of the
      -- exact rubric text and configuration.
      if not coalesce(jsonb_typeof(p_receipt) = 'object'
        and octet_length(p_receipt ->> 'rubric') between 1 and 128000, false
      ) then return jsonb_build_object('status', 'invalid-receipt'); end if;
      if not coalesce(p_receipt = jsonb_build_object(
        'accountId', p_user_id, 'courseId', prep.course_id, 'folder', prep.folder,
        'configurationFingerprint', prep.configuration_fingerprint,
        'rubric', p_receipt ->> 'rubric',
        'rubricFingerprint', public.repo_grade_preparation_rubric_fingerprint(p_receipt ->> 'rubric'),
        'profileFingerprint', encode(sha256(convert_to(
          '["repo-grade-profile-v1",' || to_json(prep.configuration_fingerprint)::text || ','
          || to_json(p_receipt ->> 'rubric')::text || ']', 'UTF8'
        )), 'hex')
      ) and p_receipt ->> 'rubricFingerprint' ~ '^[0-9a-f]{64}$', false
      ) then return jsonb_build_object('status', 'invalid-receipt'); end if;
      insert into public.repo_grade_rubric_receipts (user_id, course_id, folder, configuration_fingerprint, cohort_id, receipt)
      values (p_user_id, prep.course_id, prep.folder, prep.configuration_fingerprint, p_id, p_receipt);
    end if;
  elsif p_receipt is not null then
    return jsonb_build_object('status', 'invalid-receipt');
  end if;

  update public.repo_grade_preparations set state = final_state where id = p_id;
  if final_state <> 'unknown' then
    delete from public.repo_grade_preparation_reservations r where r.id = p_id and r.user_id = p_user_id;
  end if;
  if final_state = 'succeeded' then return jsonb_build_object('status', response, 'receipt', p_receipt); end if;
  return jsonb_build_object('status', response);
end;
$$;
