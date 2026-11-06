-- A targeted run still discovers and verifies the owned course normally.
-- These fields only narrow its server-derived targets; they never grant access.
alter table public.repo_grade_automatic_runs
  add column requested_folder text check (requested_folder is null or length(requested_folder) <= 512),
  add column requested_repo text check (requested_repo is null or (requested_repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' and length(requested_repo) <= 200)),
  add constraint repo_grade_targeted_selector_check check (requested_repo is null or requested_folder is not null);

create function public.repo_grade_automatic_start_targeted(
  p_user_id uuid, p_course_id uuid, p_folder text, p_repo text default null
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare new_id uuid;
begin
  if p_folder is null or length(p_folder) > 512 or p_folder = '' or
    (p_repo is not null and (length(p_repo) > 200 or p_repo !~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')) then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade-automatic:' || p_user_id::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  if exists (select 1 from public.repo_grade_automatic_runs r where r.user_id = p_user_id
      and (r.phase in ('discovering', 'grading') or r.lease is not null)) then return false; end if;
  if not exists (select 1 from public.course_hub c where c.id = p_course_id and c.user_id = p_user_id) then return false; end if;
  insert into public.repo_grade_automatic_runs (user_id, requested_folder, requested_repo)
    values (p_user_id, p_folder, p_repo) returning id into new_id;
  insert into public.repo_grade_automatic_courses (run_id, course_id, label, queue_position)
    select new_id, c.id, left(coalesce(nullif(btrim(c.name), ''), 'Unnamed course'), 200), 1
    from public.course_hub c where c.id = p_course_id and c.user_id = p_user_id;
  return true;
end;
$$;

create function public.repo_grade_automatic_read_target_filter(p_run_id uuid, p_user_id uuid, p_lease uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select jsonb_build_object('folder', r.requested_folder, 'repo', r.requested_repo)
  from public.repo_grade_automatic_runs r
  where r.id = p_run_id and r.user_id = p_user_id and r.lease = p_lease
    and r.phase = 'discovering' and r.lease_until > clock_timestamp();
$$;

revoke all on function public.repo_grade_automatic_start_targeted(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.repo_grade_automatic_read_target_filter(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.repo_grade_automatic_start_targeted(uuid, uuid, text, text) to service_role;
grant execute on function public.repo_grade_automatic_read_target_filter(uuid, uuid, uuid) to service_role;
