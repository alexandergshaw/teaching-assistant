-- Return an unstarted target to the queue when a worker has too little budget.
-- The caller must also stop its current cron tick after this succeeds.
create function public.repo_grade_defer_target(
  p_user_id uuid,p_run_id uuid,p_lease uuid,p_course_id uuid,p_repo text,p_folder text,p_source_ref text,p_source_sha text
) returns boolean language plpgsql security invoker set search_path='' as $$
declare run public.repo_grade_automatic_runs%rowtype; target public.repo_grade_automatic_targets%rowtype;
begin
  if p_user_id is null or p_run_id is null or p_lease is null or p_course_id is null or p_repo is null or p_folder is null or p_source_ref is null or p_source_sha is null then return false; end if;
  select * into run from public.repo_grade_automatic_runs r where r.id=p_run_id and r.user_id=p_user_id
    and r.phase='grading' and r.lease=p_lease and r.lease_until>clock_timestamp() for update;
  if not found then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text,0));
  select * into target from public.repo_grade_automatic_targets t where t.run_id=p_run_id and t.course_id=p_course_id
    and t.repo=p_repo and t.folder=p_folder and t.source_ref=p_source_ref and t.source_sha=p_source_sha and t.state='running' for update;
  if not found or target.regrade_generation is not null then return false; end if;
  -- Fail closed if any matching attempt could have been admitted during this
  -- run, or if an older matching attempt still reserves dispatch capacity.
  if exists (select 1 from public.repo_grade_attempts a where a.user_id=p_user_id and a.course_id=p_course_id
    and lower(a.repo)=lower(p_repo) and a.folder=p_folder and a.mode<>'manual'
    and (a.claimed_at>=run.created_at or exists(select 1 from public.repo_grade_reservations reservation
      where reservation.user_id=p_user_id and reservation.generation=a.generation))) then return false; end if;
  update public.repo_grade_automatic_targets set state='queued',reason=null where id=target.id and state='running';
  if not found then return false; end if;
  update public.repo_grade_automatic_runs set lease=null,lease_until=null,updated_at=clock_timestamp() where id=p_run_id and lease=p_lease;
  if not found then raise exception 'repository target lease changed'; end if;
  return true;
end;
$$;
revoke all on function public.repo_grade_defer_target(uuid,uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.repo_grade_defer_target(uuid,uuid,uuid,uuid,text,text,text,text) to service_role;
