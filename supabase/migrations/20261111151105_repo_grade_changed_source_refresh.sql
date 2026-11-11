-- Automatic refreshes are distinct from instructor-requested retries.  Keep
-- an immutable identity after completion so remounts and multiple tabs cannot
-- repeatedly dispatch the same source revision.
alter table public.repo_grade_target_requests
  add column refresh_ref text,
  add column refresh_sha text,
  add constraint repo_grade_refresh_identity check (
    (refresh_ref is null and refresh_sha is null) or
    (refresh_ref is not null and length(refresh_ref) between 1 and 255
      and refresh_sha is not null and refresh_sha ~ '^[0-9a-f]{40}$' and repo is not null and not bulk));
create unique index repo_grade_refresh_revision_unique
  on public.repo_grade_target_requests (user_id, course_id, lower(repo), folder, refresh_ref, refresh_sha)
  where refresh_sha is not null and state in ('queued', 'paused', 'running', 'complete');

create function public.repo_grade_refresh_enqueue(
  p_user_id uuid, p_course_id uuid, p_folder text, p_repo text, p_ref text, p_sha text, p_explicit boolean
) returns text language plpgsql security invoker set search_path = '' as $$
begin
  if p_user_id is null or p_course_id is null or p_folder is null or length(p_folder) not between 1 and 512
    or p_repo is null or p_repo !~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' or length(p_repo) > 200
    or p_ref is null or length(p_ref) not between 1 and 255 or p_sha is null or p_sha !~ '^[0-9a-f]{40}$'
    or not exists (select 1 from public.course_hub c where c.id = p_course_id and c.user_id = p_user_id)
    or p_explicit is null or (not p_explicit and not exists (select 1 from public.repo_grade_automatic_settings s where s.user_id = p_user_id and s.enabled))
    then return 'invalid'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade-target-enqueue:' || p_user_id::text, 0));
  -- Only the latest receipt for this cell can authorize refresh. Later
  -- success, failures, unresolved attempts, and other refs all prevent it.
  if not exists (select 1 from public.repo_grade_attempts a where a.user_id = p_user_id
      and a.course_id = p_course_id and lower(a.repo) = lower(p_repo) and a.folder = p_folder
      and a.source_ref = p_ref and a.source_sha <> p_sha and a.status = 'no-submission'
      and a.generation = (select max(newer.generation) from public.repo_grade_attempts newer
        where newer.user_id = p_user_id and newer.course_id = p_course_id
          and lower(newer.repo) = lower(p_repo) and newer.folder = p_folder))
    then return 'invalid'; end if;
  if (select count(*) from public.repo_grade_target_requests where user_id = p_user_id and state in ('queued', 'paused', 'running')) >= 1000
    then return 'invalid'; end if;
  insert into public.repo_grade_target_requests (user_id, course_id, folder, repo, selector_key, refresh_ref, refresh_sha)
    values (p_user_id, p_course_id, p_folder, p_repo,
      md5(jsonb_build_object('refresh', true, 'folder', p_folder, 'repo', lower(p_repo), 'ref', p_ref, 'sha', p_sha)::text), p_ref, p_sha)
    on conflict do nothing;
  if found then return 'queued'; else return 'already-queued'; end if;
end;
$$;
revoke all on function public.repo_grade_refresh_enqueue(uuid, uuid, text, text, text, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.repo_grade_refresh_enqueue(uuid, uuid, text, text, text, text, boolean) to service_role;

-- Only the active worker can read the immutable request identity.
create function public.repo_grade_refresh_for_lease(p_run_id uuid, p_user_id uuid, p_lease uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select jsonb_build_object('repo', q.repo, 'folder', q.folder, 'ref', q.refresh_ref, 'sha', q.refresh_sha)
  from public.repo_grade_automatic_runs r join public.repo_grade_target_requests q on q.run_id = r.id and q.user_id = r.user_id
  where r.id = p_run_id and r.user_id = p_user_id and r.lease = p_lease
    and r.lease_until > clock_timestamp() and r.phase in ('discovering', 'grading')
    and q.state = 'running' and q.refresh_sha is not null;
$$;
revoke all on function public.repo_grade_refresh_for_lease(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.repo_grade_refresh_for_lease(uuid, uuid, uuid) to service_role;
