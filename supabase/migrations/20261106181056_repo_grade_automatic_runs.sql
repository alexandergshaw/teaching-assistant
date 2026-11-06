-- A startup preference and finite, server-owned runs. Browser roles have no
-- direct access to the queue or the authority to claim and settle work.
create table public.repo_grade_automatic_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null
);

create table public.repo_grade_automatic_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  phase text not null default 'discovering'
    check (phase in ('discovering', 'grading', 'complete', 'incomplete', 'stopped')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  lease uuid,
  lease_until timestamptz,
  check ((lease is null) = (lease_until is null))
);

create unique index repo_grade_automatic_active_idx on public.repo_grade_automatic_runs (user_id)
  where phase in ('discovering', 'grading');
create index repo_grade_automatic_recent_idx on public.repo_grade_automatic_runs (user_id, created_at desc, id desc);
create index repo_grade_automatic_worker_idx on public.repo_grade_automatic_runs (updated_at, id)
  where phase in ('discovering', 'grading') or lease is not null;

create table public.repo_grade_automatic_courses (
  run_id uuid not null references public.repo_grade_automatic_runs (id) on delete cascade,
  course_id uuid not null,
  label text not null,
  state text not null default 'checking' check (state in ('checking', 'scanned', 'partial', 'not-configured')),
  reason text check (length(reason) <= 80),
  primary key (run_id, course_id)
);

create table public.repo_grade_automatic_targets (
  id bigint generated always as identity primary key,
  run_id uuid not null,
  course_id uuid not null,
  repo text not null check (repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' and length(repo) <= 200),
  folder text not null check (length(folder) <= 512),
  source_ref text not null check (length(source_ref) between 1 and 255),
  source_sha text not null check (source_sha ~ '^[0-9a-f]{40}$'),
  state text not null default 'queued' check (state in (
    'queued', 'running', 'succeeded', 'no-submission', 'partial', 'failed',
    'unknown', 'busy', 'blocked', 'already-processed', 'not-started', 'embedded-profile-required'
  )),
  reason text check (length(reason) <= 80),
  preparation_key text check (preparation_key ~ '^[0-9a-f]{64}$'),
  preparation_generation text check (preparation_generation ~ '^[0-9a-f]{64}$'),
  recovery text check (octet_length(recovery) <= 349528),
  recovery_until timestamptz,
  check ((preparation_key is null) = (preparation_generation is null)),
  check ((recovery is null) = (recovery_until is null)),
  foreign key (run_id, course_id) references public.repo_grade_automatic_courses (run_id, course_id) on delete cascade
);
create index repo_grade_automatic_targets_run_idx on public.repo_grade_automatic_targets (run_id, course_id, id);
create index repo_grade_automatic_recovery_expiry_idx on public.repo_grade_automatic_targets (recovery_until)
  where recovery_until is not null;

alter table public.repo_grade_automatic_settings enable row level security;
alter table public.repo_grade_automatic_runs enable row level security;
alter table public.repo_grade_automatic_courses enable row level security;
alter table public.repo_grade_automatic_targets enable row level security;
revoke all on public.repo_grade_automatic_settings, public.repo_grade_automatic_runs,
  public.repo_grade_automatic_courses, public.repo_grade_automatic_targets from public, anon, authenticated, service_role;
grant select, insert on public.repo_grade_automatic_settings, public.repo_grade_automatic_runs,
  public.repo_grade_automatic_courses, public.repo_grade_automatic_targets to service_role;
grant update (enabled) on public.repo_grade_automatic_settings to service_role;
grant update (phase, updated_at, lease, lease_until) on public.repo_grade_automatic_runs to service_role;
grant update (state, reason) on public.repo_grade_automatic_courses to service_role;
grant update (state, reason, preparation_key, preparation_generation, recovery, recovery_until)
  on public.repo_grade_automatic_targets to service_role;

create function public.repo_grade_automatic_control(
  p_user_id uuid, p_action text, p_enabled boolean default null, p_run_id uuid default null
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  new_id uuid;
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
  elsif p_action <> 'enqueue' or p_action is null then
    return false;
  end if;

  if not exists (select 1 from public.repo_grade_automatic_settings s where s.user_id = p_user_id and s.enabled)
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

-- An expired discovery lease can be reclaimed. An expired target is
-- ambiguous and must never be returned to the queue by a later worker.
create function public.repo_grade_automatic_claim(p_lease uuid)
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
    order by r.updated_at, r.id limit 1 for update skip locked;
  if not found then return null; end if;
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

create function public.repo_grade_automatic_finish(
  p_run_id uuid, p_lease uuid, p_course_id uuid, p_state text, p_reason text, p_targets jsonb default null,
  p_preparation_key text default null, p_preparation_generation text default null, p_recovery text default null
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  run public.repo_grade_automatic_runs%rowtype;
  final_state text := p_state;
  final_reason text := p_reason;
  recovery_value text := p_recovery;
begin
  select * into run from public.repo_grade_automatic_runs r
    where id = p_run_id and r.lease = p_lease and lease_until > clock_timestamp() for update;
  if not found then return false; end if;

  if p_targets is null and run.phase in ('grading', 'stopped') then
    if recovery_value is not null and (
      octet_length(recovery_value) > 349528 or 32 <= (
        select count(*) from public.repo_grade_automatic_targets t join public.repo_grade_automatic_runs r on r.id = t.run_id
        where r.user_id = run.user_id and t.recovery_until > clock_timestamp()
      )
    ) then
      recovery_value := null;
      final_reason := 'feedback-recovery-limit';
    end if;
    update public.repo_grade_automatic_targets set state = p_state, reason = final_reason,
      preparation_key = p_preparation_key, preparation_generation = p_preparation_generation,
      recovery = recovery_value,
      recovery_until = case when recovery_value is not null then clock_timestamp() + interval '24 hours' end
      where run_id = run.id and course_id = p_course_id and state = 'running';
    if not found then raise exception 'automatic target claim missing'; end if;
  elsif run.phase = 'stopped' then
    -- The lease holder was scanning. Do not add more work after a stop.
    null;
  elsif run.phase = 'discovering' then
    if jsonb_typeof(p_targets) is distinct from 'array' then return false; end if;
    if jsonb_array_length(p_targets) > 1000 - (
      select count(*) from public.repo_grade_automatic_targets where run_id = run.id
    ) then
      final_state := 'partial';
      final_reason := 'target-limit';
    else
      insert into public.repo_grade_automatic_targets (run_id, course_id, repo, folder, source_ref, source_sha, state, reason)
        select run.id, p_course_id, t.repo, t.folder, t.ref, t.sha, coalesce(t.state, 'queued'), t.reason
        from jsonb_to_recordset(p_targets) as t(repo text, folder text, ref text, sha text, state text, reason text);
    end if;
    update public.repo_grade_automatic_courses set state = final_state, reason = final_reason
      where run_id = run.id and course_id = p_course_id and state = 'checking';
    if not found then raise exception 'automatic course claim missing'; end if;
  else
    return false;
  end if;

  update public.repo_grade_automatic_runs set lease = null, lease_until = null, updated_at = clock_timestamp()
    where id = run.id;
  return true;
end;
$$;

create function public.repo_grade_automatic_status(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with latest as (
    select * from public.repo_grade_automatic_runs where user_id = p_user_id
      order by created_at desc, id desc limit 1
  ), target_states as (
    select t.course_id, case
      when t.state = 'queued' and r.phase = 'stopped' then 'stopped'
      when t.state = 'running' and r.lease_until <= statement_timestamp() then 'unknown'
      else t.state end as state, t.reason
    from latest r join public.repo_grade_automatic_targets t on t.run_id = r.id
  ), counts as (
    select course_id, state, reason, count(*) as total from target_states group by course_id, state, reason
  ), courses as (
    select c.course_id, c.label, case when r.phase = 'stopped' and c.state = 'checking' then 'stopped'
      else c.state end as state, c.reason,
      coalesce((select jsonb_agg(jsonb_build_object('state', t.state, 'count', t.total, 'reason', t.reason)
        order by t.state, t.reason) from counts t where t.course_id = c.course_id), '[]'::jsonb) as counts
    from latest r join public.repo_grade_automatic_courses c on c.run_id = r.id
  )
  select jsonb_build_object(
    'enabled', coalesce((select enabled from public.repo_grade_automatic_settings where user_id = p_user_id), false),
    'recoveries', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label, 'folder', t.folder, 'repo', t.repo)
        order by t.id desc)
      from (
        select t.id, c.label, t.folder, t.repo
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
    'run', (select jsonb_build_object('id', r.id, 'phase', r.phase, 'courses', coalesce(
      (select jsonb_agg(jsonb_build_object('courseId', c.course_id, 'label', c.label,
        'state', c.state, 'reason', c.reason, 'counts', c.counts) order by c.label, c.course_id) from courses c), '[]'::jsonb)
    ) from latest r)
  );
$$;

create function public.repo_grade_automatic_recovery(p_user_id uuid, p_target_id bigint)
returns text language sql stable security invoker set search_path = '' as $$
  select t.recovery from public.repo_grade_automatic_targets t
  join public.repo_grade_automatic_runs r on r.id = t.run_id
  where r.user_id = p_user_id and t.id = p_target_id and t.recovery_until > statement_timestamp()
$$;

create function public.repo_grade_automatic_retry(
  p_user_id uuid, p_target_id bigint, p_replace boolean default false,
  p_key text default null, p_generation text default null, p_expected_generation text default null
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  target public.repo_grade_automatic_targets%rowtype;
begin
  select t.* into target from public.repo_grade_automatic_targets t
  join public.repo_grade_automatic_runs r on r.id = t.run_id
  where r.user_id = p_user_id and t.id = p_target_id and t.preparation_key is not null;
  if not found then return null; end if;
  if p_replace and target.preparation_generation = p_expected_generation then
    update public.repo_grade_automatic_targets t set preparation_key = p_key, preparation_generation = p_generation
      from public.repo_grade_automatic_runs r
      where r.user_id = p_user_id and t.run_id = r.id and t.course_id = target.course_id
        and t.folder = target.folder and t.preparation_key = target.preparation_key
        and t.preparation_generation = target.preparation_generation;
  end if;
  return jsonb_build_object('courseId', target.course_id, 'folder', target.folder,
    'key', target.preparation_key, 'generation', target.preparation_generation);
end;
$$;

revoke all on function public.repo_grade_automatic_control(uuid, text, boolean, uuid),
  public.repo_grade_automatic_claim(uuid), public.repo_grade_automatic_finish(uuid, uuid, uuid, text, text, jsonb, text, text, text),
  public.repo_grade_automatic_status(uuid), public.repo_grade_automatic_recovery(uuid, bigint),
  public.repo_grade_automatic_retry(uuid, bigint, boolean, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.repo_grade_automatic_control(uuid, text, boolean, uuid),
  public.repo_grade_automatic_claim(uuid), public.repo_grade_automatic_finish(uuid, uuid, uuid, text, text, jsonb, text, text, text),
  public.repo_grade_automatic_status(uuid), public.repo_grade_automatic_recovery(uuid, bigint),
  public.repo_grade_automatic_retry(uuid, bigint, boolean, text, text, text) to service_role;
