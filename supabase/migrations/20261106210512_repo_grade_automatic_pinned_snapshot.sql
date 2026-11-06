-- Snapshots are internal, bounded, and written only by discovery settlement.
alter table public.repo_grade_automatic_courses
  add column pinned_inventory jsonb check (pinned_inventory is null or (
    jsonb_typeof(pinned_inventory) = 'object' and octet_length(pinned_inventory::text) <= 2097152
  ));
grant update (pinned_inventory) on public.repo_grade_automatic_courses to service_role;

create function public.repo_grade_automatic_finish_pinned_discovery(
  p_run_id uuid, p_lease uuid, p_course_id uuid, p_state text, p_reason text,
  p_targets jsonb, p_repositories jsonb, p_snapshot jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_snapshot is null or p_state is distinct from 'scanned'
    or jsonb_typeof(p_targets) is distinct from 'array' or jsonb_typeof(p_snapshot) is distinct from 'object'
    or octet_length(p_snapshot::text) > 2097152 then return false; end if;
  if not public.repo_grade_automatic_finish_discovery(
    p_run_id, p_lease, p_course_id, p_state, p_reason, p_targets, p_repositories
  ) then return false; end if;
  -- Settlement holds the run lock until this transaction ends. A stopped
  -- discovery or a course rejected at the run target limit has no queued work.
  update public.repo_grade_automatic_courses c set pinned_inventory = p_snapshot
    where c.run_id = p_run_id and c.course_id = p_course_id
      and c.state = 'scanned' and c.pinned_inventory is null
      and exists (select 1 from public.repo_grade_automatic_targets t
        where t.run_id = c.run_id and t.course_id = c.course_id and t.state = 'queued');
  return true;
end;
$$;

-- Null snapshot within an authorized claim denotes a pre-snapshot run.
-- Null result denotes a denied claim; neither a caller nor another run may
-- use a course selector without the live lease and its running target.
create function public.repo_grade_automatic_read_pinned_inventory(
  p_run_id uuid, p_lease uuid, p_user_id uuid, p_course_id uuid
) returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('snapshot', c.pinned_inventory)
    from public.repo_grade_automatic_runs r join public.repo_grade_automatic_courses c on c.run_id = r.id
    where r.id = p_run_id and r.user_id = p_user_id and r.phase = 'grading'
      and r.lease = p_lease and r.lease_until > statement_timestamp()
      and c.course_id = p_course_id and exists (
        select 1 from public.repo_grade_automatic_targets t
          where t.run_id = r.id and t.course_id = c.course_id and t.state = 'running'
      )
$$;

revoke all on function public.repo_grade_automatic_finish_pinned_discovery(uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb),
  public.repo_grade_automatic_read_pinned_inventory(uuid, uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.repo_grade_automatic_finish_pinned_discovery(uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb),
  public.repo_grade_automatic_read_pinned_inventory(uuid, uuid, uuid, uuid) to service_role;

-- Each folder may retain one complete verified README cohort for its active
-- run. Its reuse key binds the exact pin set and current preparation policy.
create table public.repo_grade_automatic_evidence (
  run_id uuid not null,
  course_id uuid not null,
  folder text not null check (length(folder) <= 512),
  basis text not null check (basis ~ '^[0-9a-f]{64}$'),
  evidence jsonb not null check (
    jsonb_typeof(evidence) = 'object' and octet_length(evidence::text) <= 1048576
  ),
  primary key (run_id, course_id, folder),
  foreign key (run_id, course_id) references public.repo_grade_automatic_courses (run_id, course_id) on delete cascade
);
alter table public.repo_grade_automatic_evidence enable row level security;
revoke all on public.repo_grade_automatic_evidence from public, anon, authenticated, service_role;
grant select, insert, delete on public.repo_grade_automatic_evidence to service_role;
grant update (basis, evidence) on public.repo_grade_automatic_evidence to service_role;

create function public.repo_grade_automatic_read_pinned_evidence(
  p_run_id uuid, p_lease uuid, p_user_id uuid, p_course_id uuid, p_folder text, p_basis text
) returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('evidence', e.evidence)
    from public.repo_grade_automatic_runs r
    join public.repo_grade_automatic_targets t on t.run_id = r.id and t.course_id = p_course_id
    join public.repo_grade_automatic_courses c on c.run_id = t.run_id and c.course_id = t.course_id
    left join public.repo_grade_automatic_evidence e
      on e.run_id = t.run_id and e.course_id = t.course_id and e.folder = t.folder and e.basis = p_basis
    where r.id = p_run_id and r.user_id = p_user_id and r.phase = 'grading'
      and r.lease = p_lease and r.lease_until > statement_timestamp()
      and t.state = 'running' and t.folder = p_folder and c.pinned_inventory is not null
$$;

create function public.repo_grade_automatic_save_pinned_evidence(
  p_run_id uuid, p_lease uuid, p_user_id uuid, p_course_id uuid, p_folder text, p_basis text, p_evidence jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.repo_grade_automatic_runs r
    where r.id = p_run_id and r.user_id = p_user_id and r.phase = 'grading'
      and r.lease = p_lease and r.lease_until > clock_timestamp() for update;
  if not found or not exists (
    select 1 from public.repo_grade_automatic_targets t
      join public.repo_grade_automatic_courses c on c.run_id = t.run_id and c.course_id = t.course_id
      where t.run_id = p_run_id and t.course_id = p_course_id and t.folder = p_folder
        and t.state = 'running' and c.pinned_inventory is not null
  ) then return false; end if;
  insert into public.repo_grade_automatic_evidence as e (run_id, course_id, folder, basis, evidence)
    values (p_run_id, p_course_id, p_folder, p_basis, p_evidence)
    on conflict (run_id, course_id, folder) do update set basis = excluded.basis, evidence = excluded.evidence
      where e.basis <> excluded.basis;
  return true;
end;
$$;

-- Permanent grade provenance lives in the admission ledger. Temporary
-- evidence is needed only while this run may still start another grade.
create function public.repo_grade_automatic_clear_pins()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.repo_grade_automatic_evidence where run_id = new.id;
  update public.repo_grade_automatic_courses set pinned_inventory = null
    where run_id = new.id and pinned_inventory is not null;
  return new;
end;
$$;
create trigger repo_grade_automatic_clear_pins after update of phase on public.repo_grade_automatic_runs
  for each row when (old.phase is distinct from new.phase and new.phase in ('complete', 'incomplete', 'stopped'))
  execute function public.repo_grade_automatic_clear_pins();

revoke all on function public.repo_grade_automatic_read_pinned_evidence(uuid, uuid, uuid, uuid, text, text),
  public.repo_grade_automatic_save_pinned_evidence(uuid, uuid, uuid, uuid, text, text, jsonb),
  public.repo_grade_automatic_clear_pins() from public, anon, authenticated, service_role;
grant execute on function public.repo_grade_automatic_read_pinned_evidence(uuid, uuid, uuid, uuid, text, text),
  public.repo_grade_automatic_save_pinned_evidence(uuid, uuid, uuid, uuid, text, text, jsonb) to service_role;
