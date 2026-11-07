-- One bounded recovery generation for a partial result that never dispatched.
-- The target/run fence and ledger lock are checked atomically; history's
-- client-side classification is only a scheduling hint, never authorization.
create function public.repo_grade_claim_prepared_recovery(
  p_user_id uuid, p_run_id uuid, p_lease uuid, p_course_id uuid, p_repo text, p_folder text,
  p_source_ref text, p_source_sha text, p_course_config jsonb, p_cohort_id uuid,
  p_receipt jsonb, p_preparation_key text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  target public.repo_grade_automatic_targets%rowtype;
  response jsonb;
  linked_status text;
begin
  perform 1 from public.repo_grade_automatic_runs r
    where r.id = p_run_id and r.user_id = p_user_id and r.lease = p_lease
      and r.lease_until > clock_timestamp() and r.phase = 'grading'
      and not r.targeted_paused for update;
  if not found then return jsonb_build_object('status', 'forbidden'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  if exists (select 1 from public.repo_grade_target_requests q
    where q.run_id = p_run_id and q.user_id = p_user_id) then
    return jsonb_build_object('status', 'forbidden');
  end if;
  select t.* into target from public.repo_grade_automatic_targets t
    where t.run_id = p_run_id and t.course_id = p_course_id and t.state = 'running'
      and t.repo = p_repo and t.folder = p_folder and t.source_ref = p_source_ref
      and t.source_sha = p_source_sha for update;
  if not found then return jsonb_build_object('status', 'forbidden'); end if;
  if target.regrade_generation is not null then
    select a.status into linked_status from public.repo_grade_attempts a
      where a.generation = target.regrade_generation and a.user_id = p_user_id
        and a.course_id = p_course_id and a.repo = p_repo and a.folder = p_folder
        and a.source_ref = p_source_ref and a.source_sha = p_source_sha and a.mode = 'retry';
    return jsonb_build_object('status', 'recovered-' || case
      when linked_status in ('succeeded', 'no-submission', 'failed', 'partial') then linked_status
      else 'unknown' end);
  end if;
  -- Retry once only: any prior retry, dispatch or non-partial outcome blocks it.
  if not exists (select 1 from public.repo_grade_attempts a
      where a.user_id = p_user_id and a.course_id = p_course_id
        and lower(a.repo) = lower(p_repo) and a.folder = p_folder and a.source_sha = p_source_sha
        and a.mode = 'automatic' and a.status = 'partial' and a.dispatch_state = 'prepared')
    or exists (select 1 from public.repo_grade_attempts a
      where a.user_id = p_user_id and a.course_id = p_course_id
        and lower(a.repo) = lower(p_repo) and a.folder = p_folder and a.source_sha = p_source_sha
        and a.mode <> 'manual' and (a.mode <> 'automatic' or a.status <> 'partial' or a.dispatch_state is distinct from 'prepared'))
    or exists (select 1 from public.repo_grade_attempts a
      where a.user_id = p_user_id and lower(a.repo) = lower(p_repo) and a.mode = 'manual'
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
    if not found then raise exception 'repository recovery link unavailable'; end if;
  end if;
  return response;
end;
$$;
revoke all on function public.repo_grade_claim_prepared_recovery(uuid, uuid, uuid, uuid, text, text, text, text, jsonb, uuid, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function public.repo_grade_claim_prepared_recovery(uuid, uuid, uuid, uuid, text, text, text, text, jsonb, uuid, jsonb, text)
  to service_role;
