-- Finish an explicitly requested, verified-empty regrade without a model call.
-- Lock order matches ordinary claims: run, account advisory lock, target.
create function public.repo_grade_automatic_finish_empty_regrade(
  p_user_id uuid, p_run_id uuid, p_lease uuid, p_course_id uuid,
  p_repo text, p_folder text, p_source_ref text, p_source_sha text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  target public.repo_grade_automatic_targets%rowtype;
  snapshot jsonb;
begin
  perform 1 from public.repo_grade_automatic_runs r
    where r.id = p_run_id and r.user_id = p_user_id and r.lease = p_lease
      and r.lease_until > clock_timestamp() and r.phase = 'grading'
      and not r.targeted_paused for update;
  if not found then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  if not exists (select 1 from public.repo_grade_target_requests q
    where q.run_id = p_run_id and q.user_id = p_user_id and q.course_id = p_course_id and q.state = 'running')
    then return false; end if;
  select t.* into target from public.repo_grade_automatic_targets t
    where t.run_id = p_run_id and t.course_id = p_course_id and t.state = 'running'
      and t.repo = p_repo and t.folder = p_folder and t.source_ref = p_source_ref and t.source_sha = p_source_sha
    for update;
  if not found or target.regrade_generation is not null then return false; end if;
  select c.pinned_inventory into snapshot from public.repo_grade_automatic_courses c
    join public.course_hub h on h.id = c.course_id and h.user_id = p_user_id
    where c.run_id = p_run_id and c.course_id = p_course_id;
  if snapshot is null or not exists (
    select 1 from jsonb_array_elements(snapshot -> 'discovery' -> 'repos') row
    where row ->> 'status' = 'ready' and row ->> 'repo' = p_repo
      and row ->> 'sourceRef' = p_source_ref and row ->> 'sourceCommit' = p_source_sha
      and jsonb_typeof(row -> 'emptyFolders') = 'array'
      and row -> 'emptyFolders' ? p_folder
  ) then return false; end if;
  -- Do not conceal a model call whose result is still unknown, even on a
  -- different pin of the same repository folder.
  if exists (select 1 from public.repo_grade_attempts a
    where a.user_id = p_user_id and (a.course_id is null or a.course_id = p_course_id)
      and lower(a.repo) = lower(p_repo) and (a.folder is null or a.folder = p_folder)
      and a.status in ('claimed', 'unknown')) then
    return public.repo_grade_automatic_finish(p_run_id, p_lease, p_course_id, 'blocked', 'explicit-retry-required');
  end if;
  return public.repo_grade_automatic_finish(p_run_id, p_lease, p_course_id, 'no-submission', 'verified-empty-explicit');
end;
$$;

revoke all on function public.repo_grade_automatic_finish_empty_regrade(uuid, uuid, uuid, uuid, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.repo_grade_automatic_finish_empty_regrade(uuid, uuid, uuid, uuid, text, text, text, text)
  to service_role;
