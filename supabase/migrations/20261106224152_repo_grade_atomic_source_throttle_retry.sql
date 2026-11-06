-- Delete only a matching, never-dispatched claim and move its durable target
-- to the existing rate-limit cooldown in the same transaction. A lost RPC
-- response is not retried by the caller; the queue remains authoritative.
create function public.repo_grade_automatic_retry_prepared_throttle(
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
      and a.course_id = p_course_id and a.mode = 'automatic'
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
