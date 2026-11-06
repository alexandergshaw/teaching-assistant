-- Preserve the terminal record when an explicit retry renews a stable cohort.
create table public.repo_grade_preparation_history (
  preparation_id uuid not null references public.repo_grade_preparations (id) on delete cascade,
  generation text not null check (generation ~ '^[0-9a-f]{64}$'),
  state text not null check (state in ('failed', 'expired')),
  claimed_at timestamptz not null,
  primary key (preparation_id, generation)
);

alter table public.repo_grade_preparation_history enable row level security;
revoke all on public.repo_grade_preparation_history from public, anon, authenticated, service_role;
grant select, insert on public.repo_grade_preparation_history to service_role;

-- Expiry is proof of a pre-dispatch lease only when its reservation exists.
-- An inconsistent prepared row remains blocked.
create or replace function public.repo_grade_expire_preparations(p_user_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  with expired as (
    update public.repo_grade_preparations p set state = 'expired'
    where p.user_id = p_user_id and p.state = 'prepared'
      and p.claimed_at <= clock_timestamp() - interval '15 minutes'
      and exists (
        select 1 from public.repo_grade_preparation_reservations r where r.user_id = p.user_id and r.id = p.id
      )
    returning p.id
  )
  delete from public.repo_grade_preparation_reservations r using expired e
  where r.user_id = p_user_id and r.id = e.id;

  update public.repo_grade_preparations p set state = 'unknown'
  where p.user_id = p_user_id and p.state = 'started'
    and p.claimed_at <= clock_timestamp() - interval '15 minutes';
end;
$$;

-- The explicit generation is a selector, never a dispatch token. Validate
-- current evidence through the same path used by an ordinary startup claim.

create function public.repo_grade_claim_preparation(
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
  if p_key is null or p_key is distinct from public.repo_grade_preparation_key(
    p_user_id, p_course_id, p_folder, p_course_config, p_fingerprint, instruction_digest
  ) then return jsonb_build_object('status', 'configuration-changed'); end if;

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
        (source ->> 'kind' = 'pinned-readme' and source = jsonb_build_object('kind', 'pinned-readme', 'path', source ->> 'path'))
        or (source ->> 'kind' = 'configured-fallback' and p_instructions = profile ->> 'instructions'
          and (source = '{"kind":"configured-fallback","readmeStatus":"absent"}'::jsonb
            or source = jsonb_build_object('kind', 'configured-fallback', 'readmeStatus', 'blank', 'path', source ->> 'path')))
      end
      and (not (source ? 'path') or (
        jsonb_typeof(source -> 'path') = 'string' and octet_length(source ->> 'path') <= 4096
        and starts_with(source ->> 'path', p_folder || '/')
        and source ->> 'path' !~ '[[:cntrl:]]|(^|/)\.{1,2}(/|$)|//'
        and position(chr(92) in (source ->> 'path')) = 0
        and source ->> 'path' ~* 'readme[^/]*$'
      )), false
    ) then return jsonb_build_object('status', 'invalid-evidence'); end if;
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

-- Keep the ordinary caller signature and prevent automatic reclamation.
create or replace function public.repo_grade_claim_preparation(
  p_user_id uuid, p_course_id uuid, p_folder text, p_course_config jsonb,
  p_fingerprint text, p_key text, p_instructions text, p_targets jsonb
) returns jsonb language sql security invoker set search_path = '' as $$
  select public.repo_grade_claim_preparation(
    p_user_id, p_course_id, p_folder, p_course_config, p_fingerprint, p_key, p_instructions, p_targets, null
  );
$$;

revoke all on function public.repo_grade_claim_preparation(uuid, uuid, text, jsonb, text, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.repo_grade_claim_preparation(uuid, uuid, text, jsonb, text, text, text, jsonb, text)
  to service_role;
