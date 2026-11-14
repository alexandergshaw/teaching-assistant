-- Source plans are irreversible provider dispatches too. A started checkpoint
-- is uncertain and must not be automatically replayed.
create table public.repo_grade_source_dispatches (
  generation bigint not null references public.repo_grade_attempts(generation) on delete cascade,
  entry_path text not null,
  language text not null check (language in ('python','javascript','java','c','c++')),
  user_id uuid not null,
  source_sha text not null check (source_sha ~ '^[a-f0-9]{40}$'),
  plan_sha256 text not null check (plan_sha256 ~ '^[a-f0-9]{64}$'),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  run_id uuid not null,
  lease uuid not null,
  state text not null check (state in ('started','completed')),
  sandbox_id text,
  reused_from_generation bigint,
  receipt jsonb,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  primary key (generation,language,entry_path),
  check (length(entry_path) between 1 and 600 and entry_path !~ '[[:cntrl:]\\]' and entry_path !~ '(^|/)(\.{1,2}|)(/|$)'),
  check ((state='started' and receipt is null and completed_at is null and reused_from_generation is null)
    or (state='completed' and receipt is not null and completed_at is not null)),
  check (sandbox_id is null or (length(sandbox_id) between 1 and 200 and sandbox_id ~ '^[A-Za-z0-9_-]+$')),
  check (receipt is null or (jsonb_typeof(receipt)='object' and octet_length(receipt::text)<=100000))
);
alter table public.repo_grade_source_dispatches enable row level security;
revoke all on public.repo_grade_source_dispatches from public,anon,authenticated,service_role;
grant select,insert on public.repo_grade_source_dispatches to service_role;
grant update(sandbox_id,state,receipt,completed_at) on public.repo_grade_source_dispatches to service_role;

create function public.repo_grade_begin_source_dispatch(
  p_user_id uuid,p_generation bigint,p_token uuid,p_run_id uuid,p_lease uuid,p_source_sha text,
  p_entry_path text,p_language text,p_plan_sha256 text,p_manifest_sha256 text,
  p_resume_generation bigint default null,p_allow_start boolean default true
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.repo_grade_attempts%rowtype; d public.repo_grade_source_dispatches%rowtype;
begin
  if p_user_id is null or p_generation is null or p_token is null or p_run_id is null or p_lease is null
    or p_source_sha is null or p_source_sha !~ '^[a-f0-9]{40}$' or p_manifest_sha256 is null or p_manifest_sha256 !~ '^[a-f0-9]{64}$'
    or p_plan_sha256 is null or p_plan_sha256 !~ '^[a-f0-9]{64}$' or p_entry_path is null or length(p_entry_path) not between 1 and 600
    or p_entry_path ~ '[[:cntrl:]\\]' or p_entry_path ~ '(^|/)(\.{1,2}|)(/|$)'
    or p_language is null or p_language not in ('python','javascript','java','c','c++') or p_allow_start is null
    or p_plan_sha256 is distinct from encode(sha256(convert_to('{"language":'||to_json(p_language)::text||',"entryPoint":'||to_json(p_entry_path)::text||',"selection":"heuristic"}','UTF8')),'hex')
    then return jsonb_build_object('status','forbidden'); end if;
  if not public.repo_grade_check_run_dispatch(p_user_id,p_generation,p_token,p_run_id,p_lease) then return jsonb_build_object('status','forbidden'); end if;
  select * into a from public.repo_grade_attempts where generation=p_generation and user_id=p_user_id and claim_token=p_token;
  if not found or a.source_sha is distinct from p_source_sha or (a.folder<>'' and left(p_entry_path,length(a.folder)+1)<>a.folder||'/')
    then return jsonb_build_object('status','forbidden'); end if;
  select * into d from public.repo_grade_source_dispatches where generation=p_generation and language=p_language and entry_path=p_entry_path for update;
  if found then
    if d.user_id<>p_user_id or d.source_sha<>p_source_sha or d.plan_sha256<>p_plan_sha256 or d.manifest_sha256<>p_manifest_sha256
      or d.run_id<>p_run_id or d.lease<>p_lease then return jsonb_build_object('status','conflict'); end if;
    if d.state='completed' then return jsonb_build_object('status','completed','receipt',d.receipt); end if;
    return jsonb_build_object('status','unknown');
  end if;
  if exists(select 1 from public.repo_grade_source_dispatches old join public.repo_grade_attempts prior on prior.generation=old.generation and prior.user_id=old.user_id
    where old.user_id=p_user_id and old.state='started' and old.entry_path=p_entry_path and old.language=p_language
      and old.source_sha=p_source_sha and old.plan_sha256=p_plan_sha256 and prior.course_id=a.course_id
      and lower(prior.repo)=lower(a.repo) and prior.folder=a.folder and prior.generation<p_generation)
    then return jsonb_build_object('status','unknown'); end if;
  if p_resume_generation is not null then
    if a.mode<>'retry' or p_resume_generation>=p_generation
      or exists(select 1 from public.repo_grade_target_requests q where q.run_id=p_run_id and q.user_id=p_user_id)
      then return jsonb_build_object('status','forbidden'); end if;
    perform 1 from public.repo_grade_attempts prior
      join public.repo_grade_artifact_continuations m on m.generation=prior.generation and m.user_id=p_user_id
      where prior.generation=p_resume_generation and prior.user_id=p_user_id
        and prior.status='partial' and prior.settled_at is not null and prior.course_id=a.course_id and lower(prior.repo)=lower(a.repo)
        and prior.folder=a.folder and prior.source_ref=a.source_ref and prior.source_sha=a.source_sha
        and prior.configuration_fingerprint ~ '^[a-f0-9]{64}$' and prior.configuration_fingerprint=a.configuration_fingerprint
        and m.manifest_sha256=p_manifest_sha256 and m.consumed_by=p_generation
        and (m.remaining_sources @> jsonb_build_array(jsonb_build_object('entryPoint',p_entry_path,'language',p_language,'planSha256',p_plan_sha256))
          or exists(select 1 from public.repo_grade_source_dispatches completed where completed.generation=prior.generation
            and completed.entry_path=p_entry_path and completed.language=p_language and completed.state='completed'))
        and not exists(select 1 from public.repo_grade_reservations r where r.generation=prior.generation and r.user_id=p_user_id)
        and not exists(select 1 from public.repo_grade_source_dispatches pending where pending.generation=prior.generation
          and (pending.state='started' or pending.manifest_sha256<>p_manifest_sha256))
        and not exists(select 1 from public.repo_grade_artifact_dispatches pending where pending.generation=prior.generation
          and (pending.state='started' or pending.manifest_sha256<>p_manifest_sha256))
        and not exists(select 1 from public.repo_grade_attempts newer where newer.user_id=p_user_id and newer.course_id=prior.course_id
          and lower(newer.repo)=lower(prior.repo) and newer.folder=prior.folder and newer.generation>prior.generation and newer.generation<p_generation);
    if not found then return jsonb_build_object('status','conflict'); end if;
    select * into d from public.repo_grade_source_dispatches old where old.generation=p_resume_generation
      and old.entry_path=p_entry_path and old.language=p_language;
    if found then
      if d.user_id<>p_user_id or d.source_sha<>p_source_sha or d.plan_sha256<>p_plan_sha256
        or d.manifest_sha256<>p_manifest_sha256 or d.state<>'completed' then return jsonb_build_object('status','conflict'); end if;
      insert into public.repo_grade_source_dispatches(generation,entry_path,language,user_id,source_sha,plan_sha256,manifest_sha256,run_id,lease,state,sandbox_id,reused_from_generation,receipt,completed_at)
        values(p_generation,p_entry_path,p_language,p_user_id,p_source_sha,p_plan_sha256,p_manifest_sha256,p_run_id,p_lease,'completed',d.sandbox_id,p_resume_generation,d.receipt,clock_timestamp());
      return jsonb_build_object('status','completed','receipt',d.receipt);
    end if;
  end if;
  if not p_allow_start then return jsonb_build_object('status','deferred'); end if;
  insert into public.repo_grade_source_dispatches(generation,entry_path,language,user_id,source_sha,plan_sha256,manifest_sha256,run_id,lease,state)
    values(p_generation,p_entry_path,p_language,p_user_id,p_source_sha,p_plan_sha256,p_manifest_sha256,p_run_id,p_lease,'started');
  return jsonb_build_object('status','started');
end;
$$;

create function public.repo_grade_record_source_sandbox(p_user_id uuid,p_generation bigint,p_token uuid,p_run_id uuid,p_lease uuid,p_entry_path text,p_language text,p_sandbox_id text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if p_sandbox_id is null or length(p_sandbox_id) not between 1 and 200 or p_sandbox_id !~ '^[A-Za-z0-9_-]+$' then return false; end if;
  if not public.repo_grade_check_run_dispatch(p_user_id,p_generation,p_token,p_run_id,p_lease) then return false; end if;
  update public.repo_grade_source_dispatches set sandbox_id=p_sandbox_id where generation=p_generation and user_id=p_user_id
    and entry_path=p_entry_path and language=p_language and run_id=p_run_id and lease=p_lease and state='started' and sandbox_id is null;
  return found;
end;
$$;

create function public.repo_grade_finish_source_dispatch(p_user_id uuid,p_generation bigint,p_token uuid,p_run_id uuid,p_lease uuid,p_entry_path text,p_language text,p_receipt jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare d public.repo_grade_source_dispatches%rowtype;
begin
  if not public.repo_grade_check_run_dispatch(p_user_id,p_generation,p_token,p_run_id,p_lease) then return false; end if;
  select * into d from public.repo_grade_source_dispatches where generation=p_generation and user_id=p_user_id
    and entry_path=p_entry_path and language=p_language and run_id=p_run_id and lease=p_lease for update;
  if not found or d.state<>'started' or d.sandbox_id is null or jsonb_typeof(p_receipt) is distinct from 'object' or octet_length(p_receipt::text)>100000
    or p_receipt->>'entryPoint' is distinct from d.entry_path or p_receipt->>'language' is distinct from d.language
    or p_receipt->>'selection' is distinct from 'heuristic' or p_receipt->>'status' is distinct from 'observed'
    or p_receipt->>'networkPolicy' is distinct from 'deny-all'
    or jsonb_typeof(p_receipt->'image') is distinct from 'string' or length(p_receipt->>'image') not between 1 and 512
    or jsonb_typeof(p_receipt->'toolVersion') is distinct from 'string' or length(p_receipt->>'toolVersion') not between 1 and 512
    or (p_receipt->'compile' is distinct from 'null'::jsonb and not public.repo_grade_general_stage_valid(p_receipt->'compile'))
    or (p_receipt->'run' is distinct from 'null'::jsonb and not public.repo_grade_general_stage_valid(p_receipt->'run'))
    then return false; end if;
  update public.repo_grade_source_dispatches set state='completed',receipt=p_receipt,completed_at=clock_timestamp()
    where generation=p_generation and entry_path=p_entry_path and language=p_language and state='started';
  return found;
end;
$$;
revoke all on function public.repo_grade_begin_source_dispatch(uuid,bigint,uuid,uuid,uuid,text,text,text,text,text,bigint,boolean) from public,anon,authenticated,service_role;
revoke all on function public.repo_grade_record_source_sandbox(uuid,bigint,uuid,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.repo_grade_finish_source_dispatch(uuid,bigint,uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.repo_grade_begin_source_dispatch(uuid,bigint,uuid,uuid,uuid,text,text,text,text,text,bigint,boolean) to service_role;
grant execute on function public.repo_grade_record_source_sandbox(uuid,bigint,uuid,uuid,uuid,text,text,text) to service_role;
grant execute on function public.repo_grade_finish_source_dispatch(uuid,bigint,uuid,uuid,uuid,text,text,jsonb) to service_role;

-- BEGIN GENERATED CONTINUATION FENCES
create or replace function public.repo_grade_settle_artifact_continuation(
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

    or exists(select 1 from public.repo_grade_artifact_dispatches d where d.generation=p_generation
      and (d.user_id<>p_user_id or d.state<>'completed' or d.source_sha<>p_source_sha or d.manifest_sha256<>p_manifest_sha256))
    or exists(select 1 from public.repo_grade_source_dispatches d where d.generation=p_generation
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
    where d.generation=p_generation and d.state='completed' and d.reused_from_generation is null)
    and not exists(select 1 from public.repo_grade_source_dispatches d where d.generation=p_generation and d.state='completed' and d.reused_from_generation is null);
  -- One fresh-tick retry is allowed when an earlier recovery exhausted its
  -- budget before starting any new artifact. Exact unchanged provenance and
  -- a bounded count prevent this from becoming an automatic retry loop.
  if carry_only and exists(select 1 from public.repo_grade_artifact_continuations consumed where consumed.consumed_by=p_generation) and not exists(select 1 from public.repo_grade_artifact_continuations previous
    where previous.user_id=p_user_id and previous.consumed_by=p_generation and previous.no_progress_count=0
      and previous.manifest_sha256=p_manifest_sha256 and previous.remaining_paths @> p_remaining_paths and p_remaining_paths @> previous.remaining_paths and previous.remaining_sources @> p_remaining_sources and p_remaining_sources @> previous.remaining_sources
      and not exists(select 1 from public.repo_grade_artifact_dispatches d where d.generation=p_generation
        and d.reused_from_generation is distinct from previous.generation)
      and not exists(select 1 from public.repo_grade_source_dispatches d where d.generation=p_generation
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

create or replace function public.repo_grade_artifact_recovery_candidates(p_user_id uuid,p_course_id uuid,p_shas text[])
returns jsonb language sql security invoker set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('repo',x.repo,'folder',x.folder,'sha',x.source_sha,'ref',x.source_ref)),'[]'::jsonb)
  from (select lower(a.repo) repo,a.folder,a.source_sha,a.source_ref from public.repo_grade_artifact_continuations m
    join public.repo_grade_attempts a on a.generation=m.generation and a.user_id=m.user_id
    where m.user_id=p_user_id and m.consumed_by is null and a.course_id=p_course_id and a.source_sha=any(p_shas)
      and a.status='partial' and a.settled_at is not null
      and not exists(select 1 from public.repo_grade_reservations r where r.user_id=a.user_id and r.generation=a.generation)
      and not exists(select 1 from public.repo_grade_artifact_dispatches d where d.generation=a.generation and d.state='started')
      and not exists(select 1 from public.repo_grade_source_dispatches d where d.generation=a.generation and d.state='started')
      and not exists(select 1 from public.repo_grade_attempts newer where newer.user_id=a.user_id and newer.course_id=a.course_id
        and lower(newer.repo)=lower(a.repo) and newer.folder=a.folder and newer.generation>a.generation)
    limit 1001) x;
$$;

create or replace function public.repo_grade_claim_artifact_recovery(
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
      and not exists(select 1 from public.repo_grade_source_dispatches d where d.generation=a.generation and d.state='started')
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

create or replace function public.repo_grade_find_artifact_resume(
  p_user_id uuid,p_generation bigint,p_token uuid,p_run_id uuid,p_lease uuid,p_manifest_sha256 text
) returns bigint language plpgsql security invoker set search_path = '' as $$
declare attempt public.repo_grade_attempts%rowtype; previous bigint;
begin
  if p_manifest_sha256 is null or p_manifest_sha256 !~ '^[a-f0-9]{64}$'
    or not public.repo_grade_check_run_dispatch(p_user_id,p_generation,p_token,p_run_id,p_lease) then return null; end if;
  select * into attempt from public.repo_grade_attempts where generation=p_generation and user_id=p_user_id and claim_token=p_token;
  if not found or attempt.mode <> 'retry' or attempt.configuration_fingerprint is null
    or attempt.configuration_fingerprint !~ '^[a-f0-9]{64}$'
    or exists (select 1 from public.repo_grade_target_requests q where q.run_id=p_run_id and q.user_id=p_user_id) then return null; end if;
  select a.generation into previous from public.repo_grade_attempts a
    where a.user_id=p_user_id and a.course_id=attempt.course_id and lower(a.repo)=lower(attempt.repo)
      and a.folder=attempt.folder and a.source_ref=attempt.source_ref and a.source_sha=attempt.source_sha
      and a.configuration_fingerprint=attempt.configuration_fingerprint and a.status='partial' and a.settled_at is not null
      and a.generation<p_generation
      and exists (select 1 from public.repo_grade_artifact_continuations continuation where continuation.generation=a.generation
        and continuation.user_id=p_user_id and continuation.manifest_sha256=p_manifest_sha256 and continuation.consumed_by=p_generation)
      and not exists (select 1 from public.repo_grade_reservations r where r.generation=a.generation and r.user_id=a.user_id)
      and not exists (select 1 from public.repo_grade_artifact_dispatches p where p.generation=a.generation and p.state='started')

      and not exists (select 1 from public.repo_grade_source_dispatches d where d.generation=a.generation and (d.state='started' or d.manifest_sha256<>p_manifest_sha256))
      and not exists (select 1 from public.repo_grade_artifact_dispatches d where d.generation=a.generation and d.manifest_sha256<>p_manifest_sha256)
      and not exists (select 1 from public.repo_grade_attempts newer where newer.user_id=a.user_id and newer.course_id=a.course_id
        and lower(newer.repo)=lower(a.repo) and newer.folder=a.folder
        and newer.generation>a.generation and newer.generation<p_generation)
    order by a.generation desc limit 1;
  return previous;
end;
$$;

create or replace function public.repo_grade_begin_artifact_dispatch(
  p_user_id uuid, p_generation bigint, p_token uuid, p_run_id uuid, p_lease uuid,
  p_source_sha text, p_path text, p_artifact_sha256 text, p_manifest_sha256 text,
  p_resume_generation bigint default null, p_allow_start boolean default true
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare attempt public.repo_grade_attempts%rowtype; existing public.repo_grade_artifact_dispatches%rowtype; prior public.repo_grade_artifact_dispatches%rowtype;
begin
  if p_user_id is null or p_generation is null or p_token is null or p_run_id is null or p_lease is null or p_allow_start is null
    or p_source_sha is null or p_artifact_sha256 is null or p_manifest_sha256 is null
    or p_source_sha !~ '^[a-f0-9]{40}$' or p_artifact_sha256 !~ '^[a-f0-9]{64}$'
    or p_manifest_sha256 !~ '^[a-f0-9]{64}$' or p_path is null or length(p_path) not between 1 and 600
    or p_path ~ '[[:cntrl:]\\]' or p_path ~ '(^|/)(\.{1,2}|)(/|$)' then return jsonb_build_object('status','forbidden'); end if;
  if not public.repo_grade_check_run_dispatch(p_user_id,p_generation,p_token,p_run_id,p_lease)
    then return jsonb_build_object('status','forbidden'); end if;
  select * into attempt from public.repo_grade_attempts where generation=p_generation and user_id=p_user_id and claim_token=p_token;
  if not found or attempt.source_sha is distinct from p_source_sha
    or (attempt.folder <> '' and left(p_path,length(attempt.folder)+1) <> attempt.folder || '/')
    then return jsonb_build_object('status','forbidden'); end if;
  select * into existing from public.repo_grade_artifact_dispatches where generation=p_generation and path=p_path for update;
  if found then
    if existing.user_id <> p_user_id or existing.source_sha <> p_source_sha or existing.artifact_sha256 <> p_artifact_sha256
      or existing.manifest_sha256 <> p_manifest_sha256 or existing.run_id <> p_run_id or existing.lease <> p_lease
      then return jsonb_build_object('status','conflict'); end if;
    if existing.state = 'completed' then return jsonb_build_object('status','completed','receipt',existing.receipt); end if;
    return jsonb_build_object('status','unknown');
  end if;
  -- A prior started dispatch may still be running even if its surrounding
  -- attempt was mistakenly closed; do not send it again automatically.
  if exists (select 1 from public.repo_grade_artifact_dispatches unresolved
    join public.repo_grade_attempts a on a.generation=unresolved.generation and a.user_id=unresolved.user_id
    where unresolved.user_id=p_user_id and unresolved.state='started' and unresolved.path=p_path
      and unresolved.source_sha=p_source_sha and unresolved.artifact_sha256=p_artifact_sha256
      and a.course_id=attempt.course_id and lower(a.repo)=lower(attempt.repo) and a.folder=attempt.folder
      and a.generation<p_generation) then return jsonb_build_object('status','unknown'); end if;
  -- Reuse is explicit and only for a recovery attempt.  A manual/targeted
  -- regrade must get fresh executions even at the same Git revision.
  if p_resume_generation is not null then
    if attempt.mode <> 'retry' or p_resume_generation >= p_generation
      or exists (select 1 from public.repo_grade_target_requests q where q.run_id=p_run_id and q.user_id=p_user_id)
      then return jsonb_build_object('status','forbidden'); end if;
    perform 1 from public.repo_grade_attempts a
      where a.generation=p_resume_generation and a.user_id=p_user_id and a.status='partial' and a.settled_at is not null
        and a.course_id=attempt.course_id and lower(a.repo)=lower(attempt.repo) and a.folder=attempt.folder
        and a.source_ref=attempt.source_ref and a.source_sha=attempt.source_sha
        and a.configuration_fingerprint ~ '^[a-f0-9]{64}$'
        and a.configuration_fingerprint = attempt.configuration_fingerprint
        and exists (select 1 from public.repo_grade_artifact_continuations continuation where continuation.generation=a.generation
          and continuation.user_id=p_user_id and continuation.manifest_sha256=p_manifest_sha256 and continuation.consumed_by=p_generation
          and (continuation.remaining_paths ? p_path or exists (select 1 from public.repo_grade_artifact_dispatches completed
            where completed.generation=a.generation and completed.path=p_path and completed.state='completed')))
        and not exists (select 1 from public.repo_grade_reservations r where r.generation=a.generation and r.user_id=a.user_id)
        and not exists (select 1 from public.repo_grade_artifact_dispatches pending where pending.generation=a.generation and pending.state='started')

        and not exists (select 1 from public.repo_grade_source_dispatches pending where pending.generation=a.generation
          and (pending.state='started' or pending.manifest_sha256<>p_manifest_sha256))
        and not exists (select 1 from public.repo_grade_artifact_dispatches mismatched where mismatched.generation=a.generation
          and mismatched.manifest_sha256<>p_manifest_sha256)
        and not exists (select 1 from public.repo_grade_attempts newer where newer.user_id=a.user_id and newer.course_id=a.course_id
          and lower(newer.repo)=lower(a.repo) and newer.folder=a.folder
          and newer.generation>a.generation and newer.generation<p_generation);
    if not found then return jsonb_build_object('status','conflict'); end if;
    select * into prior from public.repo_grade_artifact_dispatches old where old.generation=p_resume_generation and old.path=p_path;
    if found then
      if prior.user_id<>p_user_id or prior.source_sha<>p_source_sha or prior.artifact_sha256<>p_artifact_sha256
        or prior.manifest_sha256<>p_manifest_sha256 or prior.state<>'completed' then return jsonb_build_object('status','conflict'); end if;
      insert into public.repo_grade_artifact_dispatches(generation,path,user_id,source_sha,artifact_sha256,manifest_sha256,run_id,lease,state,sandbox_id,receipt,completed_at,reused_from_generation)
        values(p_generation,p_path,p_user_id,p_source_sha,p_artifact_sha256,p_manifest_sha256,p_run_id,p_lease,'completed',prior.sandbox_id,prior.receipt,clock_timestamp(),p_resume_generation);
      return jsonb_build_object('status','completed','receipt',prior.receipt);
    end if;
    -- No prior dispatch exists for this path; after validating the prior
    -- partial attempt and complete pinned manifest, it may start exactly once.
  end if;
  -- A budget-constrained recovery can copy completed receipts while refusing
  -- to create a new dispatch marker for an unfinished path.
  if not p_allow_start then return jsonb_build_object('status','deferred'); end if;
  insert into public.repo_grade_artifact_dispatches(generation,path,user_id,source_sha,artifact_sha256,manifest_sha256,run_id,lease,state)
    values(p_generation,p_path,p_user_id,p_source_sha,p_artifact_sha256,p_manifest_sha256,p_run_id,p_lease,'started');
  return jsonb_build_object('status','started');
end;
$$;
