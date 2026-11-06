-- NULL preserves the original queue: every owned class in course ID order.
-- An explicit array, including the empty array, is an ordered allowlist.
alter table public.repo_grade_automatic_settings
  add column class_queue uuid[] check (cardinality(class_queue) <= 1000);
alter table public.repo_grade_automatic_courses
  add column queue_position integer check (queue_position between 1 and 1001);
grant update (class_queue) on public.repo_grade_automatic_settings to service_role;
create index repo_grade_automatic_queued_targets_idx
  on public.repo_grade_automatic_targets (run_id, course_id, id) where state = 'queued';

create function public.repo_grade_automatic_set_class_queue(p_user_id uuid, p_course_ids uuid[])
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade-automatic:' || p_user_id::text, 0));
  if p_course_ids is not null and (
    cardinality(p_course_ids) > 1000 or coalesce(array_ndims(p_course_ids), 1) <> 1
    or cardinality(p_course_ids) <> (select count(*) from public.course_hub c
      where c.user_id = p_user_id and c.id = any (p_course_ids))
  ) then return false; end if;
  insert into public.repo_grade_automatic_settings (user_id, enabled, class_queue)
    values (p_user_id, false, p_course_ids)
    on conflict (user_id) do update set class_queue = excluded.class_queue;
  return true;
end;
$$;
revoke all on function public.repo_grade_automatic_set_class_queue(uuid, uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.repo_grade_automatic_set_class_queue(uuid, uuid[]) to service_role;

create or replace function public.repo_grade_automatic_status_with_github_retry(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with base as (
    select public.repo_grade_automatic_status(p_user_id) as status,
      (select class_queue from public.repo_grade_automatic_settings where user_id = p_user_id) as selection
  )
  select status || jsonb_build_object(
    'githubRetryEnabled', coalesce((select github_retry_enabled from public.repo_grade_automatic_settings where user_id = p_user_id), false),
    'githubRetryAt', (select r.github_retry_at from public.repo_grade_automatic_runs r
      where r.user_id = p_user_id and r.id = (status #>> '{run,id}')::uuid
        and r.phase in ('discovering', 'grading')),
    'classQueue', (select case when count(*) <= 1000 then jsonb_build_object(
        'customized', selection is not null,
        'courses', coalesce(jsonb_agg(jsonb_build_object('courseId', c.id, 'label', c.label,
          'included', selection is null or c.position is not null) order by c.position nulls last, c.id), '[]'::jsonb)
      ) end
      from (select h.id, left(coalesce(nullif(btrim(h.name), ''), 'Unnamed course'), 200) as label,
        array_position(selection, h.id) as position
        from public.course_hub h where h.user_id = p_user_id order by h.id limit 1001) c)
  ) from base
$$;

create or replace function public.repo_grade_automatic_control(
  p_user_id uuid, p_action text, p_enabled boolean default null, p_run_id uuid default null
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  new_id uuid;
  schedule public.repo_grade_automatic_settings%rowtype;
  tick_at timestamptz;
  step interval;
  selection uuid[];
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

  select class_queue into selection from public.repo_grade_automatic_settings where user_id = p_user_id;
  -- An empty custom queue (including one emptied by course deletion) does
  -- not create a run. The scheduled occurrence was still advanced above.
  if selection is not null and not exists (
    select 1 from public.course_hub c where c.user_id = p_user_id and c.id = any (selection)
  ) then return p_action = 'preference'; end if;

  insert into public.repo_grade_automatic_runs (user_id) values (p_user_id) returning id into new_id;
  insert into public.repo_grade_automatic_courses (run_id, course_id, label, queue_position)
    select new_id, c.id, left(coalesce(nullif(btrim(c.name), ''), 'Unnamed course'), 200),
      row_number() over (order by array_position(selection, c.id), c.id)::integer
    from public.course_hub c
    where c.user_id = p_user_id and (selection is null or c.id = any (selection))
    order by array_position(selection, c.id), c.id limit 1001;
  if (select count(*) from public.repo_grade_automatic_courses where run_id = new_id) > 1000 then
    raise exception 'automatic repository grading course limit exceeded';
  end if;
  return true;
end;
$$;

-- Existing runs have NULL positions and keep the original course ID order.
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
      where run_id = run.id and state = 'checking' order by queue_position nulls last, course_id limit 1;
    if not found then active_phase := 'grading'; end if;
  end if;
  if active_phase = 'grading' then
    -- Look up at most one queued target per course so priority sorting is
    -- bounded by the number of courses rather than the full target backlog.
    select t.* into target from public.repo_grade_automatic_courses c
      join lateral (
        select * from public.repo_grade_automatic_targets q
        where q.run_id = c.run_id and q.course_id = c.course_id and q.state = 'queued'
        order by q.id limit 1
      ) t on true
      where c.run_id = run.id
      order by c.queue_position nulls last, c.course_id limit 1;
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
