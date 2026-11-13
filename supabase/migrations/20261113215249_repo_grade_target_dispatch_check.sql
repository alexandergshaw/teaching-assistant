-- Recheck a targeted retry before each additional provider dispatch. The check
-- is not a revocable permit and cannot fence a pause after the RPC returns.
create function public.repo_grade_check_target_dispatch(
  p_user_id uuid, p_generation bigint, p_token uuid, p_run_id uuid, p_lease uuid
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_user_id is null or p_generation is null or p_token is null or p_run_id is null or p_lease is null then return false; end if;
  -- Match claim/control lock order: run first, then account ledger.
  perform 1 from public.repo_grade_automatic_runs r where r.id = p_run_id and r.user_id = p_user_id
    and r.lease = p_lease and r.lease_until > clock_timestamp()
    and r.phase = 'grading' and not r.targeted_paused for update;
  if not found then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  return exists (
    select 1 from public.repo_grade_attempts a
    join public.repo_grade_reservations reservation using (generation, user_id)
    join public.repo_grade_automatic_targets target on target.regrade_generation = a.generation
      and target.run_id = p_run_id and target.course_id = a.course_id and target.state = 'running'
      and target.repo = a.repo and target.folder = a.folder and target.source_ref = a.source_ref and target.source_sha = a.source_sha
    join public.repo_grade_target_requests request on request.run_id = p_run_id and request.user_id = a.user_id
      and request.course_id = a.course_id and request.state = 'running'
    where a.user_id = p_user_id and a.generation = p_generation and a.claim_token = p_token
      and a.mode = 'retry' and a.status = 'claimed' and a.dispatch_state = 'started'
      and a.claimed_at > clock_timestamp() - interval '15 minutes'
  );
end;
$$;
revoke all on function public.repo_grade_check_target_dispatch(uuid,bigint,uuid,uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.repo_grade_check_target_dispatch(uuid,bigint,uuid,uuid,uuid) to service_role;
