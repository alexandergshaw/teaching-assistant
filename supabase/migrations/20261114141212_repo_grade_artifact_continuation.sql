-- Only a partial result that made checkpointed artifact progress and stopped
-- before dispatching the listed paths can authorize a fresh recovery claim.
create table public.repo_grade_artifact_continuations (
  generation bigint primary key references public.repo_grade_attempts(generation) on delete cascade,
  user_id uuid not null,
  manifest_sha256 text not null check (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  remaining_paths jsonb not null check (jsonb_typeof(remaining_paths)='array' and jsonb_array_length(remaining_paths)<=40),
  remaining_sources jsonb not null check (jsonb_typeof(remaining_sources)='array' and jsonb_array_length(remaining_sources)<=5),
  consumed_by bigint,
  no_progress_count smallint not null default 0 check (no_progress_count between 0 and 1),
  created_at timestamptz not null default clock_timestamp()
);
alter table public.repo_grade_artifact_continuations enable row level security;
revoke all on public.repo_grade_artifact_continuations from public,anon,authenticated,service_role;
grant select,insert on public.repo_grade_artifact_continuations to service_role;
grant update(consumed_by) on public.repo_grade_artifact_continuations to service_role;

-- Settlement, evidence and the continuation marker commit together. The
-- calling runner supplies only supported paths skipped before dispatch due to
-- its budget; a started/unknown artifact is never eligible for continuation.
create function public.repo_grade_settle_artifact_continuation(
  p_user_id uuid,p_generation bigint,p_token uuid,p_source_sha text,p_evidence jsonb,p_review_feedback jsonb,
  p_manifest_sha256 text,p_remaining_paths jsonb,p_remaining_sources jsonb
) returns boolean language plpgsql security invoker set search_path='' as $$
declare accepted boolean; carry_only boolean; retain_marker boolean := true; a public.repo_grade_attempts%rowtype;
begin
  if p_user_id is null or p_generation is null or p_token is null or p_source_sha !~ '^[a-f0-9]{40}$'
    or p_manifest_sha256 !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_remaining_paths) is distinct from 'array'
    or jsonb_typeof(p_remaining_sources) is distinct from 'array'
    then return false; end if;
  if jsonb_array_length(p_remaining_paths)>40 or jsonb_array_length(p_remaining_sources)>5
    or jsonb_array_length(p_remaining_paths)+jsonb_array_length(p_remaining_sources)=0
    or exists(select 1 from jsonb_array_elements(p_remaining_paths) p where jsonb_typeof(p) is distinct from 'string'
      or length(p #>> '{}') not between 1 and 600)
    or (select count(*) <> count(distinct lower(p #>> '{}')) from jsonb_array_elements(p_remaining_paths) p)
    or exists(select 1 from jsonb_array_elements(p_remaining_sources) s where jsonb_typeof(s) is distinct from 'object'
      or s-array['entryPoint','language','planSha256'] <> '{}'::jsonb or jsonb_typeof(s->'entryPoint') is distinct from 'string'
      or s->>'language' is null or s->>'language' not in ('python','javascript','java','c','c++')
      or coalesce(s->>'planSha256','') !~ '^[a-f0-9]{64}$'
      or s->>'planSha256' is distinct from encode(sha256(convert_to('{"language":'||to_json(s->>'language')::text||',"entryPoint":'||to_json(s->>'entryPoint')::text||',"selection":"heuristic"}','UTF8')),'hex'))
    or (select count(*)<>count(distinct (s->>'language',lower(s->>'entryPoint'))) from jsonb_array_elements(p_remaining_sources) s)
    then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text,0));
  select * into a from public.repo_grade_attempts where generation=p_generation and user_id=p_user_id and claim_token=p_token for update;
  if not found or a.mode='manual' or a.status <> 'claimed' or a.source_sha is distinct from p_source_sha
    or jsonb_typeof(p_evidence->'inputManifest') is distinct from 'array'
    or jsonb_typeof(p_evidence->'artifacts') is distinct from 'array'
    or not exists(select 1 from public.repo_grade_artifact_dispatches d where d.generation=p_generation
      and d.user_id=p_user_id and d.state='completed'
      and d.source_sha=p_source_sha and d.manifest_sha256=p_manifest_sha256)
    or exists(select 1 from public.repo_grade_artifact_dispatches d where d.generation=p_generation
      and (d.user_id<>p_user_id or d.state<>'completed' or d.source_sha<>p_source_sha or d.manifest_sha256<>p_manifest_sha256))
    or exists(select 1 from jsonb_array_elements_text(p_remaining_paths) pending(path) where
      not exists(select 1 from jsonb_array_elements(p_evidence->'artifacts') artifact
        join jsonb_array_elements(p_evidence->'inputManifest') f on f->>'path'=artifact->>'path' and f->>'sha256'=artifact->>'sha256'
        where artifact->>'path'=pending.path and artifact->>'status'='unexamined'
          and artifact->>'kind' in ('pe','elf','java-class','python-bytecode'))
      or exists(select 1 from public.repo_grade_artifact_dispatches d where d.generation=p_generation and d.path=pending.path))
    or exists(select 1 from jsonb_array_elements(p_remaining_sources) s where
      not exists(select 1 from jsonb_array_elements(p_evidence->'inputManifest') f where f->>'path'=s->>'entryPoint')
      or exists(select 1 from public.repo_grade_source_dispatches d where d.generation=p_generation
        and d.entry_path=s->>'entryPoint' and d.language=s->>'language'))
    then return false; end if;
  carry_only := not exists(select 1 from public.repo_grade_artifact_dispatches d
    where d.generation=p_generation and d.state='completed' and d.reused_from_generation is null);
  -- One fresh-tick retry is allowed when an earlier recovery exhausted its
  -- budget before starting any new artifact. Exact unchanged provenance and
  -- a bounded count prevent this from becoming an automatic retry loop.
  if carry_only and not exists(select 1 from public.repo_grade_artifact_continuations previous
    where previous.user_id=p_user_id and previous.consumed_by=p_generation and previous.no_progress_count=0
      and previous.manifest_sha256=p_manifest_sha256 and previous.remaining_paths @> p_remaining_paths and p_remaining_paths @> previous.remaining_paths and previous.remaining_sources @> p_remaining_sources and p_remaining_sources @> previous.remaining_sources
      and not exists(select 1 from public.repo_grade_artifact_dispatches d where d.generation=p_generation
        and d.reused_from_generation is distinct from previous.generation)) then retain_marker := false; end if;
  if p_review_feedback is null then
    accepted:=public.repo_grade_settle_general_evidence(p_user_id,p_generation,p_token,'partial',false,null,null,null,null,null,p_source_sha,p_evidence);
  else
    accepted:=public.repo_grade_settle_general_partial_review(p_user_id,p_generation,p_token,p_source_sha,p_evidence,p_review_feedback);
  end if;
  if not accepted then return false; end if;
  if retain_marker then
    insert into public.repo_grade_artifact_continuations(generation,user_id,manifest_sha256,remaining_paths,remaining_sources,no_progress_count)
      values(p_generation,p_user_id,p_manifest_sha256,p_remaining_paths,p_remaining_sources,case when carry_only then 1 else 0 end);
  end if;
  return true;
end;
$$;

-- Scheduling is a hint; the claim below repeats the guards under the lock.
create function public.repo_grade_artifact_recovery_candidates(p_user_id uuid,p_course_id uuid,p_shas text[])
returns jsonb language sql security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('repo',x.repo,'folder',x.folder,'sha',x.source_sha,'ref',x.source_ref)),'[]'::jsonb)
  from (select lower(a.repo) repo,a.folder,a.source_sha,a.source_ref from public.repo_grade_artifact_continuations m
    join public.repo_grade_attempts a on a.generation=m.generation and a.user_id=m.user_id
    where m.user_id=p_user_id and m.consumed_by is null and a.course_id=p_course_id and a.source_sha=any(p_shas)
      and a.status='partial' and a.settled_at is not null
      and not exists(select 1 from public.repo_grade_reservations r where r.user_id=a.user_id and r.generation=a.generation)
      and not exists(select 1 from public.repo_grade_artifact_dispatches d where d.generation=a.generation and d.state='started')
      and not exists(select 1 from public.repo_grade_attempts newer where newer.user_id=a.user_id and newer.course_id=a.course_id
        and lower(newer.repo)=lower(a.repo) and newer.folder=a.folder and newer.generation>a.generation)
    limit 1001) x;
$$;

create function public.repo_grade_claim_artifact_recovery(
  p_user_id uuid,p_run_id uuid,p_lease uuid,p_course_id uuid,p_repo text,p_folder text,p_source_ref text,p_source_sha text,
  p_course_config jsonb,p_cohort_id uuid,p_receipt jsonb,p_preparation_key text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare target public.repo_grade_automatic_targets%rowtype; prior public.repo_grade_attempts%rowtype; response jsonb; linked_status text;
begin
  perform 1 from public.repo_grade_automatic_runs r where r.id=p_run_id and r.user_id=p_user_id and r.phase='grading'
    and not r.targeted_paused and r.lease=p_lease and r.lease_until>clock_timestamp() for update;
  if not found then return jsonb_build_object('status','forbidden'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text,0));
  perform 1 from public.repo_grade_automatic_runs r where r.id=p_run_id and r.user_id=p_user_id and r.phase='grading'
    and not r.targeted_paused and r.lease=p_lease and r.lease_until>clock_timestamp();
  if not found or exists(select 1 from public.repo_grade_target_requests q where q.run_id=p_run_id and q.user_id=p_user_id)
    then return jsonb_build_object('status','forbidden'); end if;
  select * into target from public.repo_grade_automatic_targets t where t.run_id=p_run_id and t.course_id=p_course_id
    and t.repo=p_repo and t.folder=p_folder and t.source_ref=p_source_ref and t.source_sha=p_source_sha and t.state='running' for update;
  if not found then return jsonb_build_object('status','forbidden'); end if;
  if target.regrade_generation is not null then
    select a.status into linked_status from public.repo_grade_attempts a
      where a.generation=target.regrade_generation and a.user_id=p_user_id and a.course_id=p_course_id
        and a.repo=p_repo and a.folder=p_folder and a.source_ref=p_source_ref and a.source_sha=p_source_sha and a.mode='retry';
    return jsonb_build_object('status','recovered-' || case
      when linked_status in ('succeeded','no-submission','failed','partial') then linked_status else 'unknown' end);
  end if;
  select a.* into prior from public.repo_grade_artifact_continuations m join public.repo_grade_attempts a on a.generation=m.generation and a.user_id=m.user_id
    where m.user_id=p_user_id and m.consumed_by is null and a.course_id=p_course_id and lower(a.repo)=lower(p_repo)
      and a.folder=p_folder and a.source_ref=p_source_ref and a.source_sha=p_source_sha and a.status='partial' and a.settled_at is not null
      and not exists(select 1 from public.repo_grade_reservations r where r.user_id=a.user_id and r.generation=a.generation)
      and not exists(select 1 from public.repo_grade_artifact_dispatches d where d.generation=a.generation and d.state='started')
      and not exists(select 1 from public.repo_grade_attempts newer where newer.user_id=a.user_id and newer.course_id=a.course_id
        and lower(newer.repo)=lower(a.repo) and newer.folder=a.folder and newer.generation>a.generation)
    order by a.generation desc limit 1 for update of m;
  if not found then return jsonb_build_object('status','explicit-retry-required'); end if;
  if p_preparation_key is null then
    response:=public.repo_grade_claim_tracked(p_user_id,p_course_id,p_repo,p_folder,'retry',p_source_ref,p_source_sha,p_course_config,p_cohort_id,p_receipt);
  else
    response:=public.repo_grade_claim_with_preparation(p_user_id,p_course_id,p_repo,p_folder,'retry',p_source_ref,p_source_sha,p_course_config,p_cohort_id,p_receipt,p_preparation_key);
  end if;
  if response->>'status'='claimed' then
    perform 1 from public.repo_grade_automatic_runs r where r.id=p_run_id and r.user_id=p_user_id and r.phase='grading'
      and not r.targeted_paused and r.lease=p_lease and r.lease_until>clock_timestamp();
    if not found then raise exception 'run lease expired during admission'; end if;
    if prior.configuration_fingerprint is null or not exists(select 1 from public.repo_grade_attempts fresh
      where fresh.generation=(response->>'generation')::bigint and fresh.user_id=p_user_id
        and fresh.configuration_fingerprint=prior.configuration_fingerprint)
      then raise exception 'artifact continuation configuration changed'; end if;
    update public.repo_grade_artifact_continuations set consumed_by=(response->>'generation')::bigint
      where generation=prior.generation and user_id=p_user_id and consumed_by is null;
    if not found then raise exception 'artifact continuation unavailable'; end if;
    update public.repo_grade_automatic_targets set regrade_generation=(response->>'generation')::bigint where id=target.id and regrade_generation is null;
    if not found then raise exception 'artifact continuation target unavailable'; end if;
    insert into public.repo_grade_run_dispatch_bindings(generation,user_id,run_id,target_id,lease)
      values((response->>'generation')::bigint,p_user_id,p_run_id,target.id,p_lease);
  end if;
  return response;
end;
$$;
revoke all on function public.repo_grade_settle_artifact_continuation(uuid,bigint,uuid,text,jsonb,jsonb,text,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.repo_grade_artifact_recovery_candidates(uuid,uuid,text[]) from public,anon,authenticated,service_role;
revoke all on function public.repo_grade_claim_artifact_recovery(uuid,uuid,uuid,uuid,text,text,text,text,jsonb,uuid,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.repo_grade_settle_artifact_continuation(uuid,bigint,uuid,text,jsonb,jsonb,text,jsonb,jsonb) to service_role;
grant execute on function public.repo_grade_artifact_recovery_candidates(uuid,uuid,text[]) to service_role;
grant execute on function public.repo_grade_claim_artifact_recovery(uuid,uuid,uuid,uuid,text,text,text,text,jsonb,uuid,jsonb,text) to service_role;
