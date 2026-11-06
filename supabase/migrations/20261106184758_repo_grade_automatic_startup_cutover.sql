-- A NULL preference has no explicit owner decision. Owners with evidence of a
-- sealed browser startup batch inherit the previous behavior on first opening.
-- Saving or removing a daily schedule must not set an opening preference.
-- Existing false rows are preserved: older rows carry no provenance to
-- distinguish a schedule-only setting from a deliberate choice to turn off.
alter table public.repo_grade_automatic_settings alter column enabled drop not null;

create function public.repo_grade_automatic_open_enabled(p_user_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select coalesce(
    (select enabled from public.repo_grade_automatic_settings where user_id = p_user_id),
    exists (select 1 from public.repo_grade_startup_batches where user_id = p_user_id and sealed_at is not null)
  )
$$;

create function public.repo_grade_automatic_browser_active(p_user_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.repo_grade_startup_batches
    where user_id = p_user_id and sealed_at is not null and closed_at is null and expires_at > statement_timestamp())
$$;

revoke all on function public.repo_grade_automatic_open_enabled(uuid),
  public.repo_grade_automatic_browser_active(uuid) from public, anon, authenticated, service_role;
grant execute on function public.repo_grade_automatic_open_enabled(uuid),
  public.repo_grade_automatic_browser_active(uuid) to service_role;

create or replace function public.repo_grade_automatic_set_schedule(
  p_user_id uuid, p_time time without time zone, p_zone text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  next_run timestamptz;
begin
  if (p_time is null) <> (p_zone is null) or p_time >= time '24:00'
    or (p_zone is not null and (length(p_zone) > 100
      or not exists (select 1 from pg_catalog.pg_timezone_names where name = p_zone)))
  then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade-automatic:' || p_user_id::text, 0));
  next_run := public.repo_grade_automatic_next_daily(clock_timestamp(), p_time, p_zone);
  insert into public.repo_grade_automatic_settings (user_id, enabled, schedule_time, schedule_zone, next_scheduled_at)
    values (p_user_id, null, p_time, p_zone, next_run)
    on conflict (user_id) do update set
      schedule_time = excluded.schedule_time, schedule_zone = excluded.schedule_zone,
      next_scheduled_at = excluded.next_scheduled_at;
  return true;
end;
$$;

create or replace function public.repo_grade_automatic_control(
  p_user_id uuid, p_action text, p_enabled boolean default null, p_run_id uuid default null
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  new_id uuid;
  schedule public.repo_grade_automatic_settings%rowtype;
  tick_at timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade-automatic:' || p_user_id::text, 0));
  if p_action = 'preference' and p_enabled is not null then
    insert into public.repo_grade_automatic_settings as s (user_id, enabled) values (p_user_id, p_enabled)
      on conflict (user_id) do update set enabled = excluded.enabled;
    if not p_enabled then return true; end if;
  elsif p_action = 'stop' and p_run_id is not null then
    update public.repo_grade_automatic_runs set phase = 'stopped', updated_at = clock_timestamp()
      where user_id = p_user_id and id = p_run_id and phase in ('discovering', 'grading');
    return found;
  elsif p_action = 'scheduled' then
    tick_at := clock_timestamp();
    select * into schedule from public.repo_grade_automatic_settings
      where user_id = p_user_id and next_scheduled_at <= tick_at;
    if not found then return false; end if;
    update public.repo_grade_automatic_settings
      set next_scheduled_at = public.repo_grade_automatic_next_daily(tick_at, schedule.schedule_time, schedule.schedule_zone)
      where user_id = p_user_id;
  elsif p_action not in ('enqueue', 'start') or p_action is null then
    return false;
  end if;

  -- Serialize the transition with browser batch sealing. An already sealed
  -- batch can finish, and the worker waits for its close or expiry.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  if (p_action = 'enqueue' and not public.repo_grade_automatic_open_enabled(p_user_id))
    or exists (select 1 from public.repo_grade_automatic_runs r where r.user_id = p_user_id
      and (r.phase in ('discovering', 'grading') or r.lease is not null)) then
    return p_action = 'preference';
  end if;

  insert into public.repo_grade_automatic_runs (user_id) values (p_user_id) returning id into new_id;
  insert into public.repo_grade_automatic_courses (run_id, course_id, label)
    select new_id, c.id, left(coalesce(nullif(btrim(c.name), ''), 'Unnamed course'), 200)
    from public.course_hub c where c.user_id = p_user_id order by c.id limit 1001;
  if (select count(*) from public.repo_grade_automatic_courses where run_id = new_id) > 1000 then
    raise exception 'automatic repository grading course limit exceeded';
  end if;
  return true;
end;
$$;

create or replace function public.repo_grade_seal_startup(p_user_id uuid, p_batch_id uuid, p_count integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  now_at timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  now_at := clock_timestamp();
  if exists (select 1 from public.repo_grade_automatic_runs
    where user_id = p_user_id and (phase in ('discovering', 'grading') or lease_until > now_at))
  then return false; end if;
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
      lease = p_lease, lease_until = clock_timestamp() + interval '6 minutes' where id = run.id;
    return jsonb_build_object(
      'runId', run.id, 'accountId', run.user_id, 'phase', active_phase,
      'courseId', coalesce(course.course_id, target.course_id),
      'repo', target.repo, 'folder', target.folder, 'ref', target.source_ref, 'sha', target.source_sha);
  end if;
  update public.repo_grade_automatic_runs set phase = active_phase, updated_at = clock_timestamp(),
    lease = null, lease_until = null where id = run.id;
  return jsonb_build_object('phase', 'advanced');
end;
$$;

create or replace function public.repo_grade_automatic_status(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with latest as (
    select * from public.repo_grade_automatic_runs where user_id = p_user_id
      order by created_at desc, id desc limit 1
  ), target_states as (
    select t.course_id, case
      when t.state = 'queued' and r.phase = 'stopped' then 'stopped'
      when t.state = 'running' and r.lease_until <= statement_timestamp() then 'unknown'
      else t.state end as state,
      case when t.reason = 'feedback-recovery-available' then 'feedback-retention-unconfirmed' else t.reason end as reason
    from latest r join public.repo_grade_automatic_targets t on t.run_id = r.id
  ), counts as (
    select course_id, state, reason, count(*) as total from target_states group by course_id, state, reason
  ), courses as (
    select c.course_id, c.label, case when r.phase = 'stopped' and c.state = 'checking' then 'stopped'
      else c.state end as state, c.reason, c.repositories,
      coalesce((select jsonb_agg(jsonb_build_object('state', t.state, 'count', t.total, 'reason', t.reason)
        order by t.state, t.reason) from counts t where t.course_id = c.course_id), '[]'::jsonb) as counts
    from latest r join public.repo_grade_automatic_courses c on c.run_id = r.id
  )
  select jsonb_build_object(
    'enabled', public.repo_grade_automatic_open_enabled(p_user_id),
    'schedule', (select jsonb_build_object('time', left(s.schedule_time::text, 5), 'zone', s.schedule_zone,
      'nextAt', s.next_scheduled_at) from public.repo_grade_automatic_settings s
      where s.user_id = p_user_id and s.next_scheduled_at is not null),
    'recoveries', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label, 'folder', t.folder, 'repo', t.repo, 'expiresAt', t.recovery_until)
        order by t.id desc)
      from (
        select t.id, c.label, t.folder, t.repo, t.recovery_until
        from public.repo_grade_automatic_targets t
        join public.repo_grade_automatic_runs r on r.id = t.run_id
        join public.repo_grade_automatic_courses c on c.run_id = t.run_id and c.course_id = t.course_id
        where r.user_id = p_user_id and t.recovery_until > statement_timestamp()
        order by t.id desc limit 32
      ) t
    ), '[]'::jsonb),
    'preparations', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label, 'folder', t.folder)
        order by t.id desc)
      from (
        select * from (
          select distinct on (t.course_id, t.folder, t.preparation_key, t.preparation_generation)
            t.id, c.label, t.folder
          from public.repo_grade_automatic_targets t
          join public.repo_grade_automatic_runs r on r.id = t.run_id
          join public.repo_grade_automatic_courses c on c.run_id = t.run_id and c.course_id = t.course_id
          where r.user_id = p_user_id and t.preparation_key is not null
          order by t.course_id, t.folder, t.preparation_key, t.preparation_generation, t.id desc
        ) distinct_preparations order by id desc limit 32
      ) t
    ), '[]'::jsonb),
    'run', (select jsonb_build_object('id', r.id, 'phase', r.phase, 'settling', r.lease is not null,
      'waitingForBrowserStartup', r.phase in ('discovering', 'grading') and public.repo_grade_automatic_browser_active(r.user_id),
      'courses', coalesce(
      (select jsonb_agg(jsonb_build_object('courseId', c.course_id, 'label', c.label,
        'state', c.state, 'reason', c.reason, 'repositories', c.repositories, 'counts', c.counts) order by c.label, c.course_id) from courses c), '[]'::jsonb)
    ) from latest r)
  );
$$;
