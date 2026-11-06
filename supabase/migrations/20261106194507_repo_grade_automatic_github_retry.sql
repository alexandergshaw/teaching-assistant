-- The retry timer belongs to the run. Release its lease during cooldown so
-- other owners can make progress and a stopped run cannot be restarted.
alter table public.repo_grade_automatic_settings
  add column github_retry_enabled boolean not null default false;
alter table public.repo_grade_automatic_runs
  add column github_retry_at timestamptz,
  add column github_retry_count smallint not null default 0 check (github_retry_count between 0 and 3);
grant update (github_retry_enabled) on public.repo_grade_automatic_settings to service_role;
grant update (github_retry_at, github_retry_count) on public.repo_grade_automatic_runs to service_role;

create function public.repo_grade_automatic_set_github_retry(p_user_id uuid, p_enabled boolean)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  active_run uuid;
  waiting_run uuid;
begin
  if p_enabled is null then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade-automatic:' || p_user_id::text, 0));
  if not p_enabled then
    select id into active_run from public.repo_grade_automatic_runs
      where user_id = p_user_id and phase in ('discovering', 'grading') for update;
  end if;
  insert into public.repo_grade_automatic_settings (user_id, github_retry_enabled)
    values (p_user_id, p_enabled)
    on conflict (user_id) do update set github_retry_enabled = excluded.github_retry_enabled;
  if not p_enabled then
    update public.repo_grade_automatic_runs set phase = 'incomplete', github_retry_at = null, updated_at = clock_timestamp()
      where id = active_run
        and github_retry_at is not null and lease is null
      returning id into waiting_run;
    if found then
      update public.repo_grade_automatic_courses set state = 'partial', reason = 'rate-limit-retry-disabled'
        where run_id = waiting_run and state = 'checking';
      update public.repo_grade_automatic_targets set state = 'not-started', reason = 'rate-limit-retry-disabled'
        where run_id = waiting_run and state = 'queued';
    end if;
  end if;
  return true;
end;
$$;

-- Only the worker's pre-admission discovery result may use this RPC.
-- Its caller never uses it after rubric preparation or grade admission.
create function public.repo_grade_automatic_finish_github_throttle(
  p_run_id uuid, p_lease uuid, p_course_id uuid, p_discovering boolean,
  p_retry_at timestamptz, p_primary_limit boolean
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  run public.repo_grade_automatic_runs%rowtype;
  retry_at timestamptz;
  now_at timestamptz;
  cooldown interval;
begin
  select * into run from public.repo_grade_automatic_runs r
    where id = p_run_id and r.lease = p_lease and lease_until > clock_timestamp() for update;
  if not found then return false; end if;
  if p_discovering is null or (run.phase <> 'stopped'
    and run.phase is distinct from case when p_discovering then 'discovering' else 'grading' end)
  then return false; end if;
  if run.phase = 'stopped' or not exists (
    select 1 from public.repo_grade_automatic_settings
      where user_id = run.user_id and github_retry_enabled
  ) then
    if p_discovering then
      return public.repo_grade_automatic_finish_discovery(p_run_id, p_lease, p_course_id, 'partial', 'rate-limited', '[]', null);
    end if;
    return public.repo_grade_automatic_finish(p_run_id, p_lease, p_course_id, 'blocked', 'rate-limited');
  end if;
  now_at := clock_timestamp();
  -- Honor a primary reset or the first explicit Retry-After. Repeated
  -- secondary limits use an exponential floor, retaining any longer hint.
  cooldown := case run.github_retry_count when 0 then interval '1 minute'
    when 1 then interval '2 minutes' else interval '4 minutes' end;
  retry_at := case when p_retry_at is not null and (p_primary_limit or run.github_retry_count = 0)
    then greatest(now_at, p_retry_at) + interval '1 second'
    else greatest(now_at + cooldown, p_retry_at + interval '1 second') end;

  if p_discovering then
    if not exists (select 1 from public.repo_grade_automatic_courses
      where run_id = run.id and course_id = p_course_id and state = 'checking') then return false; end if;
  else
    update public.repo_grade_automatic_targets set state = 'queued'
      where run_id = run.id and course_id = p_course_id and state = 'running';
    if not found then return false; end if;
  end if;

  if run.github_retry_count >= 3 or retry_at > now_at + interval '24 hours' then
    update public.repo_grade_automatic_courses set state = 'partial', reason = 'rate-limit-retry-exhausted'
      where run_id = run.id and state = 'checking';
    update public.repo_grade_automatic_targets set state = 'not-started', reason = 'rate-limit-retry-exhausted'
      where run_id = run.id and state = 'queued';
    update public.repo_grade_automatic_runs set phase = 'incomplete', github_retry_at = null,
      updated_at = now_at, lease = null, lease_until = null where id = run.id;
    return true;
  end if;

  update public.repo_grade_automatic_runs set github_retry_at = retry_at, github_retry_count = github_retry_count + 1,
    updated_at = now_at, lease = null, lease_until = null where id = run.id;
  return true;
end;
$$;

-- Keep schedule and retry migrations independent. The base status owns run
-- selection and scope. Extend its result using the same read snapshot.
create function public.repo_grade_automatic_status_with_github_retry(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with base as (
    select public.repo_grade_automatic_status(p_user_id) as status
  )
  select status || jsonb_build_object(
    'githubRetryEnabled', coalesce((select github_retry_enabled from public.repo_grade_automatic_settings where user_id = p_user_id), false),
    'githubRetryAt', (select r.github_retry_at from public.repo_grade_automatic_runs r
      where r.user_id = p_user_id and r.id = (status #>> '{run,id}')::uuid
        and r.phase in ('discovering', 'grading'))
  ) from base
$$;

revoke all on function public.repo_grade_automatic_set_github_retry(uuid, boolean),
  public.repo_grade_automatic_finish_github_throttle(uuid, uuid, uuid, boolean, timestamptz, boolean),
  public.repo_grade_automatic_status_with_github_retry(uuid) from public, anon, authenticated, service_role;
grant execute on function public.repo_grade_automatic_set_github_retry(uuid, boolean),
  public.repo_grade_automatic_finish_github_throttle(uuid, uuid, uuid, boolean, timestamptz, boolean),
  public.repo_grade_automatic_status_with_github_retry(uuid) to service_role;

create or replace function public.repo_grade_automatic_claim(p_lease uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  run public.repo_grade_automatic_runs%rowtype;
  course public.repo_grade_automatic_courses%rowtype;
  target public.repo_grade_automatic_targets%rowtype;
  active_phase text;
begin
  if p_lease is null then return null; end if;

  update public.repo_grade_automatic_targets set recovery = null, recovery_until = null
    where id in (
      select id from public.repo_grade_automatic_targets where recovery_until <= clock_timestamp()
      order by recovery_until limit 32 for update skip locked
    );

  select * into run from public.repo_grade_automatic_runs r
    where (r.phase in ('discovering', 'grading') or r.lease is not null)
      and (r.github_retry_at is null or r.github_retry_at <= clock_timestamp())
      and (r.lease_until is null or r.lease_until <= clock_timestamp())
      and (r.phase = 'stopped' or not public.repo_grade_automatic_browser_active(r.user_id))
    order by r.updated_at, r.id limit 1 for update skip locked;
  if not found then return null; end if;

  -- A browser target may have renewed the legacy lease after candidate
  -- selection. Wait on the same lock and use a fresh statement to see it.
  if run.phase <> 'stopped' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || run.user_id::text, 0));
    if public.repo_grade_automatic_browser_active(run.user_id) then
      return jsonb_build_object('phase', 'advanced');
    end if;
  end if;
  active_phase := run.phase;

  update public.repo_grade_automatic_targets set state = 'unknown', reason = 'worker-interrupted'
    where run_id = run.id and state = 'running';
  if active_phase = 'discovering' then
    select * into course from public.repo_grade_automatic_courses
      where run_id = run.id and state = 'checking' order by course_id limit 1;
    if not found then active_phase := 'grading'; end if;
  end if;
  if active_phase = 'grading' then
    select * into target from public.repo_grade_automatic_targets
      where run_id = run.id and state = 'queued' order by course_id, id limit 1;
    if not found then
      active_phase := case when exists (
        select 1 from public.repo_grade_automatic_courses where run_id = run.id and state = 'partial'
        union all
        select 1 from public.repo_grade_automatic_targets where run_id = run.id
          and state not in ('succeeded', 'no-submission', 'already-processed')
      ) then 'incomplete' else 'complete' end;
    else
      update public.repo_grade_automatic_targets set state = 'running' where id = target.id;
    end if;
  end if;
  if active_phase in ('discovering', 'grading') then
    update public.repo_grade_automatic_runs set phase = active_phase, updated_at = clock_timestamp(),
      github_retry_at = null, lease = p_lease, lease_until = clock_timestamp() + interval '6 minutes' where id = run.id;
    return jsonb_build_object(
      'runId', run.id, 'accountId', run.user_id, 'phase', active_phase,
      'retryGithubRateLimits', exists (select 1 from public.repo_grade_automatic_settings
        where user_id = run.user_id and github_retry_enabled),
      'courseId', coalesce(course.course_id, target.course_id),
      'repo', target.repo, 'folder', target.folder, 'ref', target.source_ref, 'sha', target.source_sha);
  end if;
  update public.repo_grade_automatic_runs set phase = active_phase, updated_at = clock_timestamp(),
    lease = null, lease_until = null where id = run.id;
  return jsonb_build_object('phase', 'advanced');
end;
$$;
