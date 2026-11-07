-- Partial instruction evidence is temporary and cannot itself authorize a grade.
create table public.repo_grade_automatic_evidence_progress (
  run_id uuid not null,
  course_id uuid not null,
  folder text not null check (length(folder) <= 512),
  basis text not null check (basis ~ '^[0-9a-f]{64}$'),
  progress jsonb not null check (jsonb_typeof(progress) = 'object' and octet_length(progress::text) <= 1048576),
  primary key (run_id, course_id, folder),
  foreign key (run_id, course_id) references public.repo_grade_automatic_courses (run_id, course_id) on delete cascade
);
alter table public.repo_grade_automatic_evidence_progress enable row level security;
revoke all on public.repo_grade_automatic_evidence_progress from public, anon, authenticated, service_role;
grant select, insert, delete on public.repo_grade_automatic_evidence_progress to service_role;
grant update (basis, progress) on public.repo_grade_automatic_evidence_progress to service_role;

create function public.repo_grade_automatic_read_evidence_progress(
  p_run_id uuid, p_lease uuid, p_user_id uuid, p_course_id uuid, p_folder text, p_basis text
) returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('progress', e.progress)
    from public.repo_grade_automatic_runs r
    join public.repo_grade_automatic_targets t on t.run_id = r.id and t.course_id = p_course_id
    join public.repo_grade_automatic_courses c on c.run_id = t.run_id and c.course_id = t.course_id
    left join public.repo_grade_automatic_evidence_progress e on e.run_id = t.run_id and e.course_id = t.course_id
      and e.folder = t.folder and e.basis = p_basis
    where r.id = p_run_id and r.user_id = p_user_id and r.phase = 'grading'
      and r.lease = p_lease and r.lease_until > statement_timestamp()
      and t.state = 'running' and t.folder = p_folder and c.pinned_inventory is not null
$$;

create function public.repo_grade_automatic_continue_evidence(
  p_run_id uuid, p_lease uuid, p_user_id uuid, p_course_id uuid, p_folder text, p_basis text, p_progress jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_basis !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_progress) is distinct from 'object'
    or octet_length(p_progress::text) > 1048576 then return false; end if;
  perform 1 from public.repo_grade_automatic_runs r where r.id = p_run_id and r.user_id = p_user_id
    and r.phase = 'grading' and r.lease = p_lease and r.lease_until > clock_timestamp() for update;
  if not found then return false; end if;
  update public.repo_grade_automatic_targets t set state = 'queued' where t.run_id = p_run_id
    and t.course_id = p_course_id and t.folder = p_folder and t.state = 'running'
    and exists (select 1 from public.repo_grade_automatic_courses c where c.run_id = t.run_id
      and c.course_id = t.course_id and c.pinned_inventory is not null);
  if not found then return false; end if;
  insert into public.repo_grade_automatic_evidence_progress as e (run_id, course_id, folder, basis, progress)
    values (p_run_id, p_course_id, p_folder, p_basis, p_progress)
    on conflict (run_id, course_id, folder) do update set basis = excluded.basis, progress = excluded.progress;
  update public.repo_grade_automatic_runs set lease = null, lease_until = null, updated_at = clock_timestamp()
    where id = p_run_id;
  return true;
end;
$$;

create function public.repo_grade_automatic_clear_evidence_progress() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.repo_grade_automatic_evidence_progress where run_id = new.id;
  return new;
end;
$$;
create trigger repo_grade_automatic_clear_evidence_progress after update of phase on public.repo_grade_automatic_runs
  for each row when (old.phase is distinct from new.phase and new.phase in ('complete', 'incomplete', 'stopped'))
  execute function public.repo_grade_automatic_clear_evidence_progress();

revoke all on function public.repo_grade_automatic_read_evidence_progress(uuid, uuid, uuid, uuid, text, text),
  public.repo_grade_automatic_continue_evidence(uuid, uuid, uuid, uuid, text, text, jsonb),
  public.repo_grade_automatic_clear_evidence_progress() from public, anon, authenticated, service_role;
grant execute on function public.repo_grade_automatic_read_evidence_progress(uuid, uuid, uuid, uuid, text, text),
  public.repo_grade_automatic_continue_evidence(uuid, uuid, uuid, uuid, text, text, jsonb) to service_role;
