alter table public.repo_grade_automatic_settings
  add column interval_count integer,
  add column interval_unit text,
  drop constraint repo_grade_automatic_schedule_shape,
  add constraint repo_grade_automatic_schedule_shape check (
    (interval_count is null and interval_unit is null and (
      (schedule_time is null and schedule_zone is null and next_scheduled_at is null)
      or (schedule_time is not null and schedule_time < time '24:00'
        and schedule_zone is not null and next_scheduled_at is not null)
    ))
    or (schedule_time is null and schedule_zone is null and next_scheduled_at is not null
      and interval_count is not null and interval_unit is not null
      and ((interval_unit = 'hours' and interval_count between 1 and 720)
        or (interval_unit = 'days' and interval_count between 1 and 30)))
  );
grant update (interval_count, interval_unit) on public.repo_grade_automatic_settings to service_role;

-- Days here mean elapsed 24-hour periods. Use the hours field of the interval,
-- since a PostgreSQL day interval across DST may have a different duration.
create function public.repo_grade_automatic_interval_length(p_count integer, p_unit text)
returns interval language sql immutable strict security invoker set search_path = '' as $$
  select case
    when p_unit = 'hours' and p_count between 1 and 720 then make_interval(hours => p_count)
    when p_unit = 'days' and p_count between 1 and 30 then make_interval(hours => p_count * 24)
  end
$$;

create function public.repo_grade_automatic_set_interval(p_user_id uuid, p_count integer, p_unit text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  step interval := public.repo_grade_automatic_interval_length(p_count, p_unit);
begin
  if step is null then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade-automatic:' || p_user_id::text, 0));
  insert into public.repo_grade_automatic_settings as s
    (user_id, enabled, interval_count, interval_unit, next_scheduled_at)
    values (p_user_id, null, p_count, p_unit, clock_timestamp() + step)
    on conflict (user_id) do update set
      interval_count = excluded.interval_count, interval_unit = excluded.interval_unit,
      schedule_time = null, schedule_zone = null, next_scheduled_at = excluded.next_scheduled_at
      where (s.interval_count, s.interval_unit) is distinct from (excluded.interval_count, excluded.interval_unit);
  return true;
end;
$$;

-- Preserve the daily RPC and its remove operation for existing callers.
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
  insert into public.repo_grade_automatic_settings as s (user_id, enabled, schedule_time, schedule_zone, next_scheduled_at)
    values (p_user_id, null, p_time, p_zone, next_run)
    on conflict (user_id) do update set
      schedule_time = excluded.schedule_time, schedule_zone = excluded.schedule_zone,
      interval_count = null, interval_unit = null, next_scheduled_at = excluded.next_scheduled_at
      where s.interval_count is not null
        or (s.schedule_time, s.schedule_zone) is distinct from (excluded.schedule_time, excluded.schedule_zone);
  return true;
end;
$$;

revoke all on function public.repo_grade_automatic_interval_length(integer, text),
  public.repo_grade_automatic_set_interval(uuid, integer, text) from public, anon, authenticated, service_role;
grant execute on function public.repo_grade_automatic_interval_length(integer, text),
  public.repo_grade_automatic_set_interval(uuid, integer, text) to service_role;

create or replace function public.repo_grade_automatic_control(
  p_user_id uuid, p_action text, p_enabled boolean default null, p_run_id uuid default null
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  new_id uuid;
  schedule public.repo_grade_automatic_settings%rowtype;
  tick_at timestamptz;
  step interval;
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
    step := public.repo_grade_automatic_interval_length(schedule.interval_count, schedule.interval_unit);
    update public.repo_grade_automatic_settings
      set next_scheduled_at = case when step is null
        then public.repo_grade_automatic_next_daily(tick_at, schedule.schedule_time, schedule.schedule_zone)
        -- Advance to the first future slot, keeping the original interval anchor.
        else date_bin(step, tick_at, schedule.next_scheduled_at) + step end
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
    'schedule', (select case when s.interval_count is null
      then jsonb_build_object('kind', 'daily', 'time', left(s.schedule_time::text, 5), 'zone', s.schedule_zone,
        'nextAt', s.next_scheduled_at)
      else jsonb_build_object('kind', 'interval', 'count', s.interval_count, 'unit', s.interval_unit,
        'nextAt', s.next_scheduled_at) end from public.repo_grade_automatic_settings s
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
