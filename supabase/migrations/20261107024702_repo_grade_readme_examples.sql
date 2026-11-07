alter table public.repo_grade_automatic_targets add column readme_example jsonb
  check (readme_example is null or octet_length(readme_example::text) <= 600);

-- Atomically retain a bounded example alongside the ordinary blocked outcome.
-- Names come from the trusted server-side pinned cohort. A targeted run may
-- stage only one repository even though the cohort includes others.
create function public.repo_grade_automatic_finish_readme_example(
  p_run_id uuid, p_lease uuid, p_user_id uuid, p_course_id uuid, p_reason text, p_example jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare target_id bigint; target_folder text; example_kind text; example_repo text; compared_repo text;
begin
  perform 1 from public.repo_grade_automatic_runs r where r.id = p_run_id and r.user_id = p_user_id
    and r.lease = p_lease and r.lease_until > clock_timestamp() and r.phase = 'grading' for update;
  if not found then return false; end if;
  select id, folder into target_id, target_folder from public.repo_grade_automatic_targets
    where run_id = p_run_id and course_id = p_course_id and state = 'running' for update;
  if not found or jsonb_typeof(p_example) <> 'object' or octet_length(p_example::text) > 600 then return false; end if;
  example_kind := p_example->>'kind'; example_repo := p_example->>'repo'; compared_repo := p_example->>'comparedRepo';
  if example_kind is null then return false; end if;
  if example_repo is null or length(example_repo) > 220 or example_repo !~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' then return false; end if;
  if p_reason = 'missing-instruction-evidence' then
    if example_kind not in ('absent', 'blank') or compared_repo is not null then return false; end if;
    p_example := jsonb_build_object('kind', example_kind, 'repo', example_repo);
  elsif p_reason = 'conflicting-instructions' then
    if example_kind <> 'conflict' or compared_repo is null or length(compared_repo) > 220
      or compared_repo !~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' then return false; end if;
    p_example := jsonb_build_object('kind', example_kind, 'repo', example_repo, 'comparedRepo', compared_repo);
  else return false; end if;
  if not public.repo_grade_automatic_finish(p_run_id, p_lease, p_course_id, 'blocked', p_reason) then return false; end if;
  update public.repo_grade_automatic_targets set readme_example = p_example where id = target_id;
  return true;
end;
$$;
revoke all on function public.repo_grade_automatic_finish_readme_example(uuid, uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.repo_grade_automatic_finish_readme_example(uuid, uuid, uuid, uuid, text, jsonb) to service_role;
