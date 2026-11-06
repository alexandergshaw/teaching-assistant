alter table public.repo_grade_automatic_settings
  add column schedule_time time without time zone,
  add column schedule_zone text,
  add column next_scheduled_at timestamptz,
  add constraint repo_grade_automatic_schedule_shape check (
    (schedule_time is null and schedule_zone is null and next_scheduled_at is null)
    or (schedule_time is not null and schedule_time < time '24:00'
      and schedule_zone is not null and next_scheduled_at is not null)
  );
create index repo_grade_automatic_schedule_due_idx on public.repo_grade_automatic_settings (next_scheduled_at, user_id)
  where next_scheduled_at is not null;
grant update (schedule_time, schedule_zone, next_scheduled_at) on public.repo_grade_automatic_settings to service_role;

alter table public.repo_grade_automatic_courses
  add column repositories jsonb;

-- Each occurrence is based on a local calendar date. Computing from the tick
-- time collapses delayed invocations into one catch-up rather than a backlog.
create function public.repo_grade_automatic_next_daily(
  p_now timestamptz, p_time time without time zone, p_zone text
) returns timestamptz language sql stable security invoker set search_path = '' as $$
  with local_date as (select (p_now at time zone p_zone)::date as day)
  select case when ((day + p_time) at time zone p_zone) > p_now then (day + p_time) at time zone p_zone
    else (day + 1 + p_time) at time zone p_zone end from local_date
$$;

create function public.repo_grade_automatic_set_schedule(
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
    values (p_user_id, false, p_time, p_zone, next_run)
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

  if (p_action = 'enqueue' and not exists (
      select 1 from public.repo_grade_automatic_settings s where s.user_id = p_user_id and s.enabled
    ))
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

-- Only the authenticated cron endpoint uses this wakeup. Account advisory locks
-- are taken in the same order as control writes. Never hold a settings row lock
-- before acquiring its account lock, and skip accounts another tick holds.
create function public.repo_grade_automatic_enqueue_due()
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  due_account uuid;
  accepted integer := 0;
  failed integer := 0;
begin
  for due_account in
    select user_id from public.repo_grade_automatic_settings where next_scheduled_at <= statement_timestamp()
      order by next_scheduled_at, user_id limit 32
  loop
    if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade-automatic:' || due_account::text, 0))
    then continue; end if;
    begin
      if public.repo_grade_automatic_control(due_account, 'scheduled') then
        accepted := accepted + 1;
      end if;
    exception when others then
      -- This occurrence remains due. Other accounts and the queue still move.
      failed := failed + 1;
    end;
  end loop;
  return jsonb_build_object('accepted', accepted, 'failed', failed);
end;
$$;

-- The original settlement runs under a row lock in this transaction. Attach
-- coverage only if that exact discovery lease was accepted.
create function public.repo_grade_automatic_finish_discovery(
  p_run_id uuid, p_lease uuid, p_course_id uuid, p_state text, p_reason text,
  p_targets jsonb, p_repositories jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if not public.repo_grade_automatic_finish(p_run_id, p_lease, p_course_id, p_state, p_reason, p_targets)
  then return false; end if;
  update public.repo_grade_automatic_courses set repositories = p_repositories
    where run_id = p_run_id and course_id = p_course_id and state <> 'checking';
  return true;
end;
$$;
grant update (repositories) on public.repo_grade_automatic_courses to service_role;

revoke all on function public.repo_grade_automatic_next_daily(timestamptz, time, text),
  public.repo_grade_automatic_set_schedule(uuid, time, text), public.repo_grade_automatic_enqueue_due(),
  public.repo_grade_automatic_finish_discovery(uuid, uuid, uuid, text, text, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.repo_grade_automatic_next_daily(timestamptz, time, text),
  public.repo_grade_automatic_set_schedule(uuid, time, text), public.repo_grade_automatic_enqueue_due(),
  public.repo_grade_automatic_finish_discovery(uuid, uuid, uuid, text, text, jsonb, jsonb)
  to service_role;

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
    'enabled', coalesce((select enabled from public.repo_grade_automatic_settings where user_id = p_user_id), false),
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
    'run', (select jsonb_build_object('id', r.id, 'phase', r.phase, 'settling', r.lease is not null, 'courses', coalesce(
      (select jsonb_agg(jsonb_build_object('courseId', c.course_id, 'label', c.label,
        'state', c.state, 'reason', c.reason, 'repositories', c.repositories, 'counts', c.counts) order by c.label, c.course_id) from courses c), '[]'::jsonb)
    ) from latest r)
  );
$$;
