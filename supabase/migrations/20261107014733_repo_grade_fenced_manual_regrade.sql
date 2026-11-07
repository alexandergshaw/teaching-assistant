-- Link each explicit regrade to its durable target before returning a claim.
-- This prevents a worker restart from creating a second paid attempt after a
-- successful result has been settled but the target has not yet been settled.
alter table public.repo_grade_automatic_targets
  add column regrade_generation bigint references public.repo_grade_attempts(generation) on delete set null;
grant update (regrade_generation) on public.repo_grade_automatic_targets to service_role;

create function public.repo_grade_claim_targeted_regrade(
  p_user_id uuid, p_run_id uuid, p_lease uuid, p_course_id uuid, p_repo text, p_folder text,
  p_source_ref text, p_source_sha text, p_course_config jsonb, p_cohort_id uuid,
  p_receipt jsonb, p_preparation_key text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  target public.repo_grade_automatic_targets%rowtype;
  response jsonb;
  linked_status text;
begin
  -- The existing worker claims the run before taking the ledger lock.
  perform 1 from public.repo_grade_automatic_runs r
    where r.id = p_run_id and r.user_id = p_user_id and r.lease = p_lease
      and r.lease_until > clock_timestamp() and r.phase = 'grading'
      and not r.targeted_paused for update;
  if not found then return jsonb_build_object('status', 'forbidden'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  if not exists (select 1 from public.repo_grade_target_requests q
    where q.run_id = p_run_id and q.user_id = p_user_id and q.course_id = p_course_id
      and q.state = 'running') then return jsonb_build_object('status', 'forbidden'); end if;
  select t.* into target from public.repo_grade_automatic_targets t
    where t.run_id = p_run_id and t.course_id = p_course_id and t.state = 'running'
      and t.repo = p_repo and t.folder = p_folder and t.source_ref = p_source_ref
      and t.source_sha = p_source_sha for update;
  if not found then return jsonb_build_object('status', 'forbidden'); end if;
  if target.regrade_generation is not null then
    -- Never dispatch a linked generation again. Report its actual durable
    -- outcome; a live or missing receipt is uncertain, not successful.
    select a.status into linked_status from public.repo_grade_attempts a
      where a.generation = target.regrade_generation and a.user_id = p_user_id
        and a.course_id = p_course_id and a.repo = p_repo and a.folder = p_folder
        and a.source_ref = p_source_ref and a.source_sha = p_source_sha and a.mode = 'retry';
    return jsonb_build_object('status', 'recovered-' || case
      when linked_status in ('succeeded', 'no-submission', 'failed', 'partial') then linked_status
      else 'unknown' end);
  end if;
  if exists (select 1 from public.repo_grade_attempts a
    where a.user_id = p_user_id and a.course_id = p_course_id
      and lower(a.repo) = lower(p_repo) and a.folder = p_folder
      and a.source_sha = p_source_sha and a.mode <> 'manual'
      and a.status in ('claimed', 'unknown')) then
    return jsonb_build_object('status', 'explicit-retry-required');
  end if;
  if p_preparation_key is null then
    response := public.repo_grade_claim_tracked(p_user_id, p_course_id, p_repo, p_folder,
      'retry', p_source_ref, p_source_sha, p_course_config, p_cohort_id, p_receipt);
  else
    response := public.repo_grade_claim_with_preparation(p_user_id, p_course_id, p_repo, p_folder,
      'retry', p_source_ref, p_source_sha, p_course_config, p_cohort_id, p_receipt, p_preparation_key);
  end if;
  if response ->> 'status' = 'claimed' then
    update public.repo_grade_automatic_targets set regrade_generation = (response ->> 'generation')::bigint
      where id = target.id and regrade_generation is null;
    if not found then raise exception 'repository regrade link unavailable'; end if;
  end if;
  return response;
end;
$$;
revoke all on function public.repo_grade_claim_targeted_regrade(uuid, uuid, uuid, uuid, text, text, text, text, jsonb, uuid, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function public.repo_grade_claim_targeted_regrade(uuid, uuid, uuid, uuid, text, text, text, text, jsonb, uuid, jsonb, text)
  to service_role;

-- A live queue lease is required even to identify an explicit run.
create function public.repo_grade_automatic_is_targeted(p_run_id uuid, p_user_id uuid, p_lease uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select exists (select 1 from public.repo_grade_target_requests q
    where q.run_id = r.id and q.user_id = r.user_id and q.state = 'running')
  from public.repo_grade_automatic_runs r where r.id = p_run_id and r.user_id = p_user_id
    and r.lease = p_lease and r.lease_until > clock_timestamp() and r.phase = 'grading';
$$;
revoke all on function public.repo_grade_automatic_is_targeted(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.repo_grade_automatic_is_targeted(uuid, uuid, uuid) to service_role;

-- A retry claim may be released only while still prepared and linked to this target.
-- Delete only a matching, never-dispatched claim and move its durable target
-- to the existing rate-limit cooldown in the same transaction. A lost RPC
-- response is not retried by the caller; the queue remains authoritative.
create or replace function public.repo_grade_automatic_retry_prepared_throttle(
  p_user_id uuid, p_run_id uuid, p_lease uuid, p_course_id uuid,
  p_generation bigint, p_token uuid, p_retry_at timestamptz, p_primary_limit boolean
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  attempt public.repo_grade_attempts%rowtype;
  run public.repo_grade_automatic_runs%rowtype;
begin
  select * into run from public.repo_grade_automatic_runs r
    where r.id = p_run_id and r.user_id = p_user_id and r.lease = p_lease
      and r.lease_until > clock_timestamp() and r.phase = 'grading' for update;
  if not found then return false; end if;
  -- Match the worker claim path: lock its run before the account ledger.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  select a.* into attempt from public.repo_grade_attempts a
    join public.repo_grade_reservations r using (generation, user_id)
    where a.user_id = p_user_id and a.generation = p_generation and a.claim_token = p_token
      and a.course_id = p_course_id and (a.mode = 'automatic' or (a.mode = 'retry' and exists (select 1 from public.repo_grade_automatic_targets linked where linked.run_id = p_run_id and linked.regrade_generation = a.generation)))
      and a.status = 'claimed' and a.dispatch_state = 'prepared' for update of a;
  if not found then return false; end if;
  if not exists (select 1 from public.repo_grade_automatic_targets t
    where t.run_id = p_run_id and t.course_id = p_course_id and t.state = 'running'
      and t.repo = attempt.repo and t.folder = attempt.folder
      and t.source_ref = attempt.source_ref and t.source_sha = attempt.source_sha)
    or exists (select 1 from public.repo_grade_startup_targets s where s.attempt_generation = p_generation)
    or exists (select 1 from public.repo_grade_evaluations e where e.generation = p_generation)
  then return false; end if;

  delete from public.repo_grade_reservations where generation = p_generation and user_id = p_user_id;
  delete from public.repo_grade_attempts where generation = p_generation and user_id = p_user_id;
  if not public.repo_grade_automatic_finish_github_throttle(
    p_run_id, p_lease, p_course_id, false, p_retry_at, p_primary_limit
  ) then raise exception 'repository grading cooldown transition failed'; end if;
  return true;
end;
$$;
revoke all on function public.repo_grade_automatic_retry_prepared_throttle(uuid, uuid, uuid, uuid, bigint, uuid, timestamptz, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.repo_grade_automatic_retry_prepared_throttle(uuid, uuid, uuid, uuid, bigint, uuid, timestamptz, boolean)
  to service_role;

-- Restore the known result of an interrupted, already-settled regrade.
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
      and (not r.targeted_paused or r.phase = 'stopped')
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

  -- A linked retry may have settled before the worker lost its lease.
  -- Recover its durable outcome without dispatching the evaluation again.
  update public.repo_grade_automatic_targets t set
    state = case when a.status in ('succeeded', 'no-submission', 'failed', 'partial') then a.status else 'unknown' end,
    reason = case when a.status in ('succeeded', 'no-submission') then null else 'worker-interrupted' end
    from public.repo_grade_attempts a
    where t.run_id = run.id and t.state = 'running' and t.regrade_generation = a.generation
      and a.user_id = run.user_id and a.course_id = t.course_id and a.repo = t.repo
      and a.folder = t.folder and a.source_ref = t.source_ref and a.source_sha = t.source_sha
      and a.mode = 'retry';
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
