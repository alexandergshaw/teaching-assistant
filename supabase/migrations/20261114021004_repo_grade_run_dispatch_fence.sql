-- A run-bound claim cannot borrow another run's live lease or target.
create table public.repo_grade_run_dispatch_bindings (
  generation bigint primary key references public.repo_grade_attempts(generation) on delete cascade,
  user_id uuid not null,
  run_id uuid not null references public.repo_grade_automatic_runs(id) on delete cascade,
  target_id bigint not null references public.repo_grade_automatic_targets(id) on delete cascade,
  lease uuid not null
);
alter table public.repo_grade_run_dispatch_bindings enable row level security;
revoke all on public.repo_grade_run_dispatch_bindings from public,anon,authenticated,service_role;
grant select,insert on public.repo_grade_run_dispatch_bindings to service_role;

create function public.repo_grade_claim_run_fenced(
  p_user_id uuid,p_run_id uuid,p_lease uuid,p_course_id uuid,p_repo text,p_folder text,p_source_ref text,p_source_sha text,
  p_course_config jsonb,p_cohort_id uuid,p_receipt jsonb,p_preparation_key text,p_kind text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare target public.repo_grade_automatic_targets%rowtype; response jsonb;
begin
  if p_kind is null or p_kind not in ('automatic','refresh','recovery','text-recovery','targeted') then return jsonb_build_object('status','forbidden'); end if;
  perform 1 from public.repo_grade_automatic_runs r where r.id=p_run_id and r.user_id=p_user_id and r.phase='grading'
    and not r.targeted_paused and r.lease=p_lease and r.lease_until>clock_timestamp() for update;
  if not found then return jsonb_build_object('status','forbidden'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text,0));
  perform 1 from public.repo_grade_automatic_runs r where r.id=p_run_id and r.user_id=p_user_id and r.phase='grading'
    and not r.targeted_paused and r.lease=p_lease and r.lease_until>clock_timestamp();
  if not found then return jsonb_build_object('status','forbidden'); end if;
  select * into target from public.repo_grade_automatic_targets t where t.run_id=p_run_id and t.course_id=p_course_id
    and t.repo=p_repo and t.folder=p_folder and t.source_ref=p_source_ref and t.source_sha=p_source_sha and t.state='running' for update;
  if not found then return jsonb_build_object('status','forbidden'); end if;
  if p_kind='automatic' and (target.regrade_generation is not null or exists
    (select 1 from public.repo_grade_target_requests q where q.run_id=p_run_id and q.user_id=p_user_id))
  then return jsonb_build_object('status','forbidden'); end if;
  if p_kind='targeted' then
    response:=public.repo_grade_claim_targeted_regrade(p_user_id,p_run_id,p_lease,p_course_id,p_repo,p_folder,p_source_ref,p_source_sha,p_course_config,p_cohort_id,p_receipt,p_preparation_key);
  elsif p_kind='refresh' then
    response:=public.repo_grade_claim_changed_refresh(p_user_id,p_run_id,p_lease,p_course_id,p_repo,p_folder,p_source_ref,p_source_sha,p_course_config,p_cohort_id,p_receipt,p_preparation_key);
  elsif p_kind='recovery' then
    response:=public.repo_grade_claim_prepared_recovery(p_user_id,p_run_id,p_lease,p_course_id,p_repo,p_folder,p_source_ref,p_source_sha,p_course_config,p_cohort_id,p_receipt,p_preparation_key);
  elsif p_kind='text-recovery' then
    response:=public.repo_grade_claim_text_recovery(p_user_id,p_run_id,p_lease,p_course_id,p_repo,p_folder,p_source_ref,p_source_sha,p_course_config,p_cohort_id,p_receipt,p_preparation_key);
  elsif p_preparation_key is null then
    response:=public.repo_grade_claim_tracked(p_user_id,p_course_id,p_repo,p_folder,'automatic',p_source_ref,p_source_sha,p_course_config,p_cohort_id,p_receipt);
  else
    response:=public.repo_grade_claim_with_preparation(p_user_id,p_course_id,p_repo,p_folder,'automatic',p_source_ref,p_source_sha,p_course_config,p_cohort_id,p_receipt,p_preparation_key);
  end if;
  if response->>'status'='claimed' then
    -- The called admission can wait too; roll back its claim if the lease
    -- expires before the binding is committed.
    perform 1 from public.repo_grade_automatic_runs r where r.id=p_run_id and r.user_id=p_user_id and r.phase='grading'
      and not r.targeted_paused and r.lease=p_lease and r.lease_until>clock_timestamp();
    if not found then raise exception 'run lease expired during admission'; end if;
    insert into public.repo_grade_run_dispatch_bindings(generation,user_id,run_id,target_id,lease)
      values((response->>'generation')::bigint,p_user_id,p_run_id,target.id,p_lease);
  end if;
  return response;
end;
$$;
revoke all on function public.repo_grade_claim_run_fenced(uuid,uuid,uuid,uuid,text,text,text,text,jsonb,uuid,jsonb,text,text) from public,anon,authenticated,service_role;
grant execute on function public.repo_grade_claim_run_fenced(uuid,uuid,uuid,uuid,text,text,text,text,jsonb,uuid,jsonb,text,text) to service_role;

-- This is a fresh check, not a revocable provider permit: it cannot prevent a
-- pause after the check returns but before an external request is sent.
create function public.repo_grade_check_run_dispatch(p_user_id uuid,p_generation bigint,p_token uuid,p_run_id uuid,p_lease uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.repo_grade_automatic_runs r where r.id=p_run_id and r.user_id=p_user_id and r.phase='grading'
    and not r.targeted_paused and r.lease=p_lease and r.lease_until>clock_timestamp() for update;
  if not found then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text,0));
  perform 1 from public.repo_grade_automatic_runs r where r.id=p_run_id and r.user_id=p_user_id and r.phase='grading'
    and not r.targeted_paused and r.lease=p_lease and r.lease_until>clock_timestamp();
  if not found then return false; end if;
  return exists(select 1 from public.repo_grade_run_dispatch_bindings b
    join public.repo_grade_attempts a on a.generation=b.generation and a.user_id=b.user_id
    join public.repo_grade_reservations reservation on reservation.generation=a.generation and reservation.user_id=a.user_id
    join public.repo_grade_automatic_targets t on t.id=b.target_id and t.run_id=b.run_id and t.course_id=a.course_id
      and t.repo=a.repo and t.folder=a.folder and t.source_ref=a.source_ref and t.source_sha=a.source_sha and t.state='running'
    where b.user_id=p_user_id and b.generation=p_generation and b.run_id=p_run_id and b.lease=p_lease
      and a.claim_token=p_token and a.status='claimed' and a.dispatch_state='started'
      and a.claimed_at>clock_timestamp()-interval '15 minutes');
end;
$$;
revoke all on function public.repo_grade_check_run_dispatch(uuid,bigint,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.repo_grade_check_run_dispatch(uuid,bigint,uuid,uuid,uuid) to service_role;
