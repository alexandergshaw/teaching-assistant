-- The gated startup path provisions a policy under the account lock after it
-- has validated the owned course and a complete pinned assignment cohort.
create table public.repo_grade_preparation_policies (
  user_id uuid not null,
  course_id uuid not null,
  folder text not null check (length(folder) between 1 and 512),
  prompt_parser_version text not null check (length(prompt_parser_version) between 1 and 256),
  course_kind text not null check (course_kind in ('coding', 'applied')),
  course_kind_basis jsonb,
  primary key (course_id, user_id, folder),
  foreign key (course_id, user_id) references public.course_hub (id, user_id) on delete cascade
);

create table public.repo_grade_preparations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  course_id uuid not null,
  folder text not null,
  preparation_key text not null check (preparation_key ~ '^[0-9a-f]{64}$'),
  configuration_fingerprint text not null,
  course_config jsonb not null,
  instruction_digest text not null check (instruction_digest ~ '^[0-9a-f]{64}$'),
  instructions text not null check (octet_length(instructions) between 1 and 128000),
  token uuid not null default gen_random_uuid(),
  state text not null default 'prepared'
    check (state in ('prepared', 'started', 'expired', 'succeeded', 'failed', 'unknown')),
  claimed_at timestamptz not null default clock_timestamp(),
  unique (course_id, user_id, folder, preparation_key),
  foreign key (course_id, user_id, folder, configuration_fingerprint)
    references public.repo_grade_profile_versions on delete cascade
);

create index repo_grade_preparations_account_live_idx on public.repo_grade_preparations (user_id)
  where state in ('prepared', 'started');

-- Account-only reservations intentionally have no course or preparation FK.
create table public.repo_grade_preparation_reservations (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade
);

create index repo_grade_preparation_reservations_user_idx
  on public.repo_grade_preparation_reservations (user_id);

create table public.repo_grade_preparation_targets (
  preparation_id uuid not null references public.repo_grade_preparations (id) on delete cascade,
  repo text not null check (repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' and length(repo) <= 200),
  source_ref text not null check (length(source_ref) between 1 and 255),
  source_sha text not null check (source_sha ~ '^[0-9a-f]{40}$'),
  instruction_source jsonb not null,
  primary key (preparation_id, repo, source_ref, source_sha)
);

alter table public.repo_grade_preparation_policies enable row level security;
alter table public.repo_grade_preparations enable row level security;
alter table public.repo_grade_preparation_reservations enable row level security;
alter table public.repo_grade_preparation_targets enable row level security;

revoke all on public.repo_grade_preparation_policies, public.repo_grade_preparations,
  public.repo_grade_preparation_reservations, public.repo_grade_preparation_targets
  from public, anon, authenticated, service_role;
grant select, insert on public.repo_grade_preparation_policies to service_role;
grant update (prompt_parser_version, course_kind, course_kind_basis) on public.repo_grade_preparation_policies to service_role;
grant select, insert on public.repo_grade_preparations, public.repo_grade_preparation_targets to service_role;
grant update (token, state, claimed_at, course_config) on public.repo_grade_preparations to service_role;
grant select, insert, delete on public.repo_grade_preparation_reservations to service_role;

alter table public.repo_grade_attempts
  add column preparation_key text check (preparation_key ~ '^[0-9a-f]{64}$' and mode <> 'manual'),
  add column preparation_course_config jsonb,
  add constraint repo_grade_prepared_attempt_config_pair
    check ((preparation_key is null) = (preparation_course_config is null));

alter table public.repo_grade_current_profiles add column startup_default boolean not null default false;
grant update (startup_default) on public.repo_grade_current_profiles to service_role;

create function public.repo_grade_mark_explicit_profile()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.startup_default := false;
  return new;
end;
$$;

create trigger repo_grade_mark_explicit_profile
before update of configuration_fingerprint on public.repo_grade_current_profiles
for each row execute function public.repo_grade_mark_explicit_profile();

create or replace function public.repo_grade_read_profile(
  p_user_id uuid, p_course_id uuid, p_folder text, p_cohort_id uuid
) returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('profile', v.profile, 'receipt', null, 'startupDefault', c.startup_default)
    from public.repo_grade_current_profiles c
    join public.repo_grade_profile_versions v using (course_id, user_id, folder, configuration_fingerprint)
    where p_cohort_id is null and c.course_id = p_course_id and c.user_id = p_user_id and c.folder = p_folder
  union all
  select jsonb_build_object('profile', v.profile, 'receipt', r.receipt)
    from public.repo_grade_rubric_receipts r
    join public.repo_grade_profile_versions v using (course_id, user_id, folder, configuration_fingerprint)
    where r.cohort_id = p_cohort_id and r.course_id = p_course_id and r.user_id = p_user_id and r.folder = p_folder;
$$;

create function public.repo_grade_bootstrap_preparation(
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
    or p_prompt_parser_version !~ '^repo-grade-gemini-rubric-v1:[0-9a-f]{64}:[0-9a-f]{64}$'
  then return false; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  select * into course from public.course_hub c where c.id = p_course_id and c.user_id = p_user_id for share;
  if not found or nullif(btrim(course.github_org), '') is null
    or p_course_kind_basis is distinct from jsonb_build_array(course.name, course.course_kind)
    or case when course.course_kind in ('coding', 'applied') then course.course_kind <> p_course_kind
      else p_course_kind <> 'coding' end
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
  if found and (policy.course_kind_basis is null or
    (policy.course_kind_basis = p_course_kind_basis and
      (policy.prompt_parser_version <> p_prompt_parser_version or policy.course_kind <> p_course_kind)))
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
  on conflict (course_id, user_id, folder) do update set prompt_parser_version = excluded.prompt_parser_version,
    course_kind = excluded.course_kind, course_kind_basis = excluded.course_kind_basis
    where p.course_kind_basis is distinct from excluded.course_kind_basis;
  return true;
end;
$$;

create function public.repo_grade_preparation_required(
  p_user_id uuid, p_course_id uuid, p_folder text
) returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.repo_grade_preparation_policies policy
    join public.repo_grade_current_profiles c using (course_id, user_id, folder)
    join public.repo_grade_profile_versions v using (course_id, user_id, folder, configuration_fingerprint)
    where policy.user_id = p_user_id and policy.course_id = p_course_id and policy.folder = p_folder
      and v.profile @> '{"provider":"gemini","rubricPolicy":"generate"}'::jsonb
  );
$$;

create function public.repo_grade_preparation_key(
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
    and (not c.startup_default
      or (coalesce(course.rubric_data, '') ~ '^[[:space:]]*$' and coalesce(course.rubric_name, '') ~ '^[[:space:]]*$'))
    and p_course_config = jsonb_build_object(
      'github_org', course.github_org, 'repos', course.repos,
      'rubric_name', course.rubric_name, 'rubric_data', course.rubric_data,
      'repo_module_pairing', course.repo_module_pairing, 'student_repos', course.student_repos
    );
$$;

-- Post-dispatch expiry records uncertainty and retains the slot.
create function public.repo_grade_expire_preparations(p_user_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  with expired as (
    update public.repo_grade_preparations p set state = 'expired'
    where p.user_id = p_user_id and p.state = 'prepared'
      and p.claimed_at <= clock_timestamp() - interval '15 minutes'
    returning p.id
  )
  delete from public.repo_grade_preparation_reservations r using expired e
  where r.user_id = p_user_id and r.id = e.id;

  update public.repo_grade_preparations p set state = 'unknown'
  where p.user_id = p_user_id and p.state = 'started'
    and p.claimed_at <= clock_timestamp() - interval '15 minutes';
end;
$$;

-- Mirror the tracked grade protocol's pre-dispatch recovery when the shared
-- pool is entered through a new RPC. Legacy and started rows remain reserved.
create function public.repo_grade_expire_prepared_attempts(p_user_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  with expired as (
    update public.repo_grade_attempts a
      set status = 'failed', settled_at = clock_timestamp()
      where a.user_id = p_user_id and a.dispatch_state = 'prepared'
        and a.status in ('claimed', 'unknown') and a.reconciled_at is null
        and a.claimed_at <= clock_timestamp() - interval '15 minutes'
      returning a.generation
  )
  delete from public.repo_grade_reservations r using expired e
  where r.user_id = p_user_id and r.generation = e.generation;
end;
$$;

-- Shared by preparation and all grade claim protocols, under their account lock.
create function public.repo_grade_shared_capacity(p_user_id uuid)
returns text language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  perform public.repo_grade_expire_preparations(p_user_id);
  if exists (
    select 1 from public.repo_grade_preparation_reservations r
    left join public.repo_grade_preparations p using (id, user_id)
    where r.user_id = p_user_id and p.id is null
  ) or exists (
    select 1 from public.repo_grade_reservations r
    left join public.repo_grade_attempts a using (generation, user_id)
    where r.user_id = p_user_id and a.generation is null
  ) then return 'busy'; end if;
  if (select count(*) from public.repo_grade_reservations r where r.user_id = p_user_id)
    + (select count(*) from public.repo_grade_preparation_reservations r where r.user_id = p_user_id) >= 3
  then return 'capacity'; end if;
  return null;
end;
$$;

create function public.repo_grade_claim_preparation(
  p_user_id uuid, p_course_id uuid, p_folder text, p_course_config jsonb,
  p_fingerprint text, p_key text, p_instructions text, p_targets jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  prep public.repo_grade_preparations;
  course public.course_hub;
  profile jsonb;
  instruction_digest text;
  denial text;
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
  if prep.state = 'failed' then return jsonb_build_object('status', 'explicit-retry-required'); end if;
  if prep.state = 'unknown' then return jsonb_build_object('status', 'unknown'); end if;
  if prep.state in ('prepared', 'started') then return jsonb_build_object('status', 'busy'); end if;

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
      update public.repo_grade_preparations p set state = 'prepared', token = gen_random_uuid(),
        claimed_at = clock_timestamp(), course_config = p_course_config
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

create function public.repo_grade_begin_preparation(p_user_id uuid, p_id uuid, p_token uuid)
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
  if not found or prep.preparation_key is distinct from public.repo_grade_preparation_key(
    p_user_id, prep.course_id, prep.folder, prep.course_config, prep.configuration_fingerprint, prep.instruction_digest
  ) then return null; end if;
  remaining_ms := floor(extract(epoch from (prep.claimed_at + interval '15 minutes' - clock_timestamp())) * 1000);
  if remaining_ms <= 0 then return null; end if;
  update public.repo_grade_preparations set state = 'started' where id = p_id;
  return remaining_ms;
end;
$$;

create function public.repo_grade_preparation_rubric_fingerprint(p_rubric text)
returns text language plpgsql stable strict security invoker set search_path = '' as $$
declare
  whitespace constant text := U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]';
  normalized text;
begin
  -- The exact rubric must already be trimmed by resolveRepoGradeRubric.
  -- cleanText then collapses interior ECMAScript whitespace before hashing.
  if p_rubric = '' or p_rubric collate pg_catalog."C" ~ ('^' || whitespace || '|' || whitespace || '$') then
    return null;
  end if;
  normalized := regexp_replace(p_rubric collate pg_catalog."C", whitespace || '+', ' ', 'g');
  if octet_length(convert_to(normalized, 'UTF8')) = length(normalized) then
    normalized := lower(normalized collate pg_catalog."C");
  elsif to_regcollation('pg_catalog."und-x-icu"') is not null then
    normalized := lower(normalized collate pg_catalog."und-x-icu");
  else
    return null;
  end if;
  return encode(sha256(convert_to(normalized, 'UTF8')), 'hex');
end;
$$;

create function public.repo_grade_finish_preparation(
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
  if prep.state <> case when p_outcome = 'failed-before-dispatch' then 'prepared' else 'started' end or not exists (
    select 1 from public.repo_grade_preparation_reservations r where r.id = p_id and r.user_id = p_user_id
  ) then return jsonb_build_object('status', 'stale'); end if;
  perform 1 from public.course_hub c where c.id = prep.course_id and c.user_id = p_user_id for share;
  if not found then return jsonb_build_object('status', 'stale'); end if;

  if p_outcome = 'succeeded' then
    if prep.preparation_key is distinct from public.repo_grade_preparation_key(
      p_user_id, prep.course_id, prep.folder, prep.course_config, prep.configuration_fingerprint, prep.instruction_digest
    ) then
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

-- Grading can consume preparation only through exact, current provenance.
create function public.repo_grade_preparation_context(
  p_user_id uuid, p_course_id uuid, p_folder text, p_cohort_id uuid, p_key text,
  p_repo text, p_source_ref text, p_source_sha text, p_course_config jsonb
) returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('instructions', p.instructions, 'source', t.instruction_source)
  from public.repo_grade_preparations p
  join public.repo_grade_preparation_targets t on t.preparation_id = p.id
  where p.user_id = p_user_id and p.course_id = p_course_id and p.folder = p_folder
    and p.id = p_cohort_id and p.preparation_key = p_key and p.state = 'succeeded'
    and t.repo = p_repo and t.source_ref = p_source_ref and t.source_sha = p_source_sha
    and p.preparation_key = public.repo_grade_preparation_key(
      p.user_id, p.course_id, p.folder, p_course_config, p.configuration_fingerprint, p.instruction_digest
    );
$$;
create function public.repo_grade_claim_with_preparation(
  p_user_id uuid, p_course_id uuid, p_repo text, p_folder text, p_mode text,
  p_source_ref text, p_source_sha text, p_course_config jsonb,
  p_cohort_id uuid, p_receipt jsonb, p_preparation_key text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  new_attempt public.repo_grade_attempts;
  course_row public.course_hub;
  frozen public.repo_grade_rubric_receipts;
  preparation_context jsonb;
  denial text;
begin
  if p_user_id is null or p_mode is null or p_mode not in ('automatic', 'manual', 'retry') then
    raise exception 'invalid repo grade claim';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  if p_course_id is not null then
    select * into course_row from public.course_hub c
      where c.id = p_course_id and c.user_id = p_user_id for share;
    if not found then return jsonb_build_object('status', 'forbidden'); end if;
  end if;
  -- Compare the raw saved inputs used by planning, while holding the course
  -- row lock. Course timestamps are application-assigned and can collide.
  if p_mode <> 'manual' and (
    p_course_id is null
    or p_course_config is distinct from jsonb_build_object(
      'github_org', course_row.github_org, 'repos', course_row.repos,
      'rubric_name', course_row.rubric_name, 'rubric_data', course_row.rubric_data,
      'repo_module_pairing', course_row.repo_module_pairing, 'student_repos', course_row.student_repos
    )
    or nullif(btrim(course_row.github_org), '') is null
    or lower(btrim(course_row.github_org)) is distinct from lower(split_part(p_repo, '/', 1))
  ) then return jsonb_build_object('status', 'configuration-changed'); end if;

  if p_mode = 'manual' and p_preparation_key is not null then
    return jsonb_build_object('status', 'configuration-changed');
  end if;
  if p_mode <> 'manual' then
    select r.* into frozen
      from public.repo_grade_current_profiles c
      join public.repo_grade_profile_versions v using (course_id, user_id, folder, configuration_fingerprint)
      join public.repo_grade_rubric_receipts r using (course_id, user_id, folder, configuration_fingerprint)
      where c.user_id = p_user_id and c.course_id = p_course_id and c.folder = p_folder
        and r.cohort_id = p_cohort_id and r.receipt = p_receipt
        and (v.profile ->> 'sourceRef' is null or v.profile ->> 'sourceRef' = p_source_ref);
    if not found then return jsonb_build_object('status', 'configuration-changed'); end if;
    if p_preparation_key is not null then
      preparation_context := public.repo_grade_preparation_context(
        p_user_id, p_course_id, p_folder, p_cohort_id, p_preparation_key, p_repo, p_source_ref, p_source_sha,
        p_course_config
      );
      if preparation_context is null then return jsonb_build_object('status', 'configuration-changed'); end if;
    elsif public.repo_grade_preparation_required(p_user_id, p_course_id, p_folder) or exists (
      select 1 from public.repo_grade_preparations p where p.id = p_cohort_id
    ) then
      return jsonb_build_object('status', 'configuration-changed');
    end if;
  end if;

  if p_preparation_key is not null then
    perform public.repo_grade_expire_prepared_attempts(p_user_id);
  end if;
  update public.repo_grade_attempts
     set status = 'unknown', settled_at = clock_timestamp()
   where user_id = p_user_id and status = 'claimed'
     and claimed_at <= clock_timestamp() - interval '15 minutes';

  if p_mode = 'automatic' and exists (
    select 1 from public.repo_grade_attempts a
    where a.user_id = p_user_id and a.course_id = p_course_id and lower(a.repo) = lower(p_repo)
      and a.source_sha = p_source_sha and a.folder = p_folder
      and a.mode <> 'manual' and a.status in ('succeeded', 'no-submission')
  ) then return jsonb_build_object('status', 'terminal'); end if;

  if exists (
    select 1 from public.repo_grade_reservations r
    left join public.repo_grade_attempts a on a.generation = r.generation and a.user_id = r.user_id
    where r.user_id = p_user_id and (
      a.generation is null
      or (lower(a.repo) = lower(p_repo)
        and (a.course_id is null or p_course_id is null or a.course_id = p_course_id
          or a.mode = 'manual' or p_mode = 'manual')
        and (a.folder is null or p_folder is null or a.folder = p_folder))
    )
  ) then return jsonb_build_object('status', 'busy'); end if;

  if p_mode = 'automatic' and exists (
    select 1 from public.repo_grade_attempts a
    where a.user_id = p_user_id and a.course_id = p_course_id and lower(a.repo) = lower(p_repo)
      and a.source_sha = p_source_sha and a.folder = p_folder
      and a.mode <> 'manual'
  ) then return jsonb_build_object('status', 'explicit-retry-required'); end if;

  denial := public.repo_grade_shared_capacity(p_user_id);
  if denial is not null then return jsonb_build_object('status', denial); end if;

  insert into public.repo_grade_attempts (
    user_id, course_id, repo, folder, mode, source_ref, source_sha,
    cohort_id, configuration_fingerprint, rubric_fingerprint, profile_fingerprint,
    preparation_key, preparation_course_config, dispatch_state
  ) values (
    p_user_id, p_course_id, p_repo, p_folder, p_mode, p_source_ref, p_source_sha,
    frozen.cohort_id, frozen.configuration_fingerprint,
    frozen.receipt ->> 'rubricFingerprint', frozen.receipt ->> 'profileFingerprint',
    p_preparation_key, case when p_preparation_key is not null then p_course_config end,
    case when p_preparation_key is not null then 'prepared' end
  )
  returning * into new_attempt;
  insert into public.repo_grade_reservations (generation, user_id) values (new_attempt.generation, p_user_id);
  if preparation_context is not null then
    return jsonb_build_object('status', 'claimed', 'generation', new_attempt.generation,
      'token', new_attempt.claim_token, 'preparation', preparation_context);
  end if;
  return jsonb_build_object('status', 'claimed', 'generation', new_attempt.generation, 'token', new_attempt.claim_token);
end;
$$;

create or replace function public.repo_grade_claim_tracked(
  p_user_id uuid, p_course_id uuid, p_repo text, p_folder text, p_mode text,
  p_source_ref text, p_source_sha text, p_course_config jsonb,
  p_cohort_id uuid, p_receipt jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  response jsonb;
begin
  if p_user_id is null then raise exception 'invalid repo grade claim'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  if p_course_id is not null then
    perform 1 from public.course_hub c where c.id = p_course_id and c.user_id = p_user_id for share;
    if not found then return jsonb_build_object('status', 'forbidden'); end if;
  end if;
  perform public.repo_grade_expire_prepared_attempts(p_user_id);
  response := public.repo_grade_claim(
    p_user_id, p_course_id, p_repo, p_folder, p_mode, p_source_ref,
    p_source_sha, p_course_config, p_cohort_id, p_receipt
  );
  if response ->> 'status' = 'claimed' then
    update public.repo_grade_attempts set dispatch_state = 'prepared'
      where user_id = p_user_id and generation = (response ->> 'generation')::bigint;
  end if;
  return response;
end;
$$;

-- Keep the original RPC signature. Its tracked wrapper also uses this gate.
create or replace function public.repo_grade_claim(
  p_user_id uuid, p_course_id uuid, p_repo text, p_folder text, p_mode text,
  p_source_ref text, p_source_sha text, p_course_config jsonb,
  p_cohort_id uuid, p_receipt jsonb
) returns jsonb language sql security invoker set search_path = '' as $$
  select public.repo_grade_claim_with_preparation(
    p_user_id, p_course_id, p_repo, p_folder, p_mode, p_source_ref, p_source_sha,
    p_course_config, p_cohort_id, p_receipt, null
  );
$$;
create or replace function public.repo_grade_freeze_rubric(
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
  if public.repo_grade_preparation_required(p_user_id, p_course_id, p_folder) or exists (
    select 1 from public.repo_grade_preparations p where p.id = p_cohort_id
  ) then return null; end if;

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


create or replace function public.repo_grade_begin_dispatch(
  p_user_id uuid, p_generation bigint, p_token uuid
) returns integer language plpgsql security invoker set search_path = '' as $$
declare
  attempt public.repo_grade_attempts;
  remaining_ms integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  select a.* into attempt from public.repo_grade_attempts a
    join public.repo_grade_reservations r using (generation, user_id)
    where a.user_id = p_user_id and a.generation = p_generation and a.claim_token = p_token
      and a.status = 'claimed' and a.dispatch_state = 'prepared';
  if not found then return null; end if;
  if attempt.course_id is not null then
    perform 1 from public.course_hub c where c.id = attempt.course_id and c.user_id = p_user_id for share;
    if not found then return null; end if;
  end if;
  if attempt.mode <> 'manual' then
    if attempt.preparation_key is not null then
      if public.repo_grade_preparation_context(
        attempt.user_id, attempt.course_id, attempt.folder, attempt.cohort_id,
        attempt.preparation_key, attempt.repo, attempt.source_ref, attempt.source_sha, attempt.preparation_course_config
      ) is null then return null; end if;
    elsif public.repo_grade_preparation_required(attempt.user_id, attempt.course_id, attempt.folder) then
      return null;
    end if;
  end if;
  remaining_ms := floor(extract(epoch from (attempt.claimed_at + interval '15 minutes' - clock_timestamp())) * 1000);
  if remaining_ms <= 0 then return null; end if;

  update public.repo_grade_attempts set dispatch_state = 'started'
    where user_id = p_user_id and generation = p_generation;
  return remaining_ms;
end;
$$;


revoke all on function public.repo_grade_preparation_required(uuid, uuid, text),
  public.repo_grade_mark_explicit_profile(),
  public.repo_grade_bootstrap_preparation(uuid, uuid, text, jsonb, jsonb, text, text, text, jsonb),
  public.repo_grade_preparation_key(uuid, uuid, text, jsonb, text, text),
  public.repo_grade_expire_preparations(uuid), public.repo_grade_expire_prepared_attempts(uuid),
  public.repo_grade_shared_capacity(uuid),
  public.repo_grade_claim_preparation(uuid, uuid, text, jsonb, text, text, text, jsonb),
  public.repo_grade_begin_preparation(uuid, uuid, uuid),
  public.repo_grade_preparation_rubric_fingerprint(text),
  public.repo_grade_finish_preparation(uuid, uuid, uuid, text, text, jsonb),
  public.repo_grade_preparation_context(uuid, uuid, text, uuid, text, text, text, text, jsonb),
  public.repo_grade_claim_with_preparation(uuid, uuid, text, text, text, text, text, jsonb, uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.repo_grade_preparation_required(uuid, uuid, text),
  public.repo_grade_mark_explicit_profile(),
  public.repo_grade_bootstrap_preparation(uuid, uuid, text, jsonb, jsonb, text, text, text, jsonb),
  public.repo_grade_preparation_key(uuid, uuid, text, jsonb, text, text),
  public.repo_grade_expire_preparations(uuid), public.repo_grade_expire_prepared_attempts(uuid),
  public.repo_grade_shared_capacity(uuid),
  public.repo_grade_claim_preparation(uuid, uuid, text, jsonb, text, text, text, jsonb),
  public.repo_grade_begin_preparation(uuid, uuid, uuid),
  public.repo_grade_preparation_rubric_fingerprint(text),
  public.repo_grade_finish_preparation(uuid, uuid, uuid, text, text, jsonb),
  public.repo_grade_preparation_context(uuid, uuid, text, uuid, text, text, text, text, jsonb),
  public.repo_grade_claim_with_preparation(uuid, uuid, text, text, text, text, text, jsonb, uuid, jsonb, text)
  to service_role;
