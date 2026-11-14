-- A started artifact is never automatically replayed.  A lost response or
-- expired worker leaves it started for explicit reconciliation.
create table public.repo_grade_artifact_dispatches (
  generation bigint not null references public.repo_grade_attempts(generation) on delete cascade,
  path text not null,
  user_id uuid not null,
  source_sha text not null,
  artifact_sha256 text not null,
  manifest_sha256 text not null,
  run_id uuid not null,
  lease uuid not null,
  state text not null check (state in ('started','completed')),
  sandbox_id text,
  reused_from_generation bigint,
  receipt jsonb,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  primary key (generation,path),
  check (source_sha ~ '^[a-f0-9]{40}$' and artifact_sha256 ~ '^[a-f0-9]{64}$' and manifest_sha256 ~ '^[a-f0-9]{64}$'),
  check (length(path) between 1 and 600 and path !~ '[[:cntrl:]\\]' and path !~ '(^|/)(\.{1,2}|)(/|$)'),
  check ((state = 'started' and receipt is null and completed_at is null and reused_from_generation is null)
    or (state = 'completed' and receipt is not null and completed_at is not null)),
  check (sandbox_id is null or (length(sandbox_id) between 1 and 200 and sandbox_id ~ '^[A-Za-z0-9_-]+$')),
  check (receipt is null or (jsonb_typeof(receipt) = 'object' and octet_length(receipt::text) <= 100000))
);
alter table public.repo_grade_artifact_dispatches enable row level security;
revoke all on public.repo_grade_artifact_dispatches from public, anon, authenticated, service_role;
grant select,insert on public.repo_grade_artifact_dispatches to service_role;
grant update (sandbox_id,state,receipt,completed_at) on public.repo_grade_artifact_dispatches to service_role;

-- Only a non-targeted retry can discover a prior recoverable partial.  Its
-- manifest must be identical and no artifact from it may remain uncertain.
create function public.repo_grade_find_artifact_resume(
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
      and exists (select 1 from public.repo_grade_artifact_dispatches d where d.generation=a.generation and d.state='completed' and d.manifest_sha256=p_manifest_sha256)
      and not exists (select 1 from public.repo_grade_artifact_dispatches d where d.generation=a.generation and d.manifest_sha256<>p_manifest_sha256)
      and not exists (select 1 from public.repo_grade_attempts newer where newer.user_id=a.user_id and newer.course_id=a.course_id
        and lower(newer.repo)=lower(a.repo) and newer.folder=a.folder
        and newer.generation>a.generation and newer.generation<p_generation)
    order by a.generation desc limit 1;
  return previous;
end;
$$;

-- Returns a previously completed receipt or marks a new irreversible dispatch
-- boundary. A started row is uncertain, never permission to send again.
create function public.repo_grade_begin_artifact_dispatch(
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
        and exists (select 1 from public.repo_grade_artifact_dispatches completed where completed.generation=a.generation
          and completed.state='completed' and completed.manifest_sha256=p_manifest_sha256)
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

-- The sandbox ID is recorded after creation. A failed or lost write remains an
-- uncertain dispatch; it is not a reason to create another sandbox.
create function public.repo_grade_record_artifact_sandbox(
  p_user_id uuid,p_generation bigint,p_token uuid,p_run_id uuid,p_lease uuid,p_path text,p_sandbox_id text
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_sandbox_id is null or length(p_sandbox_id) not between 1 and 200 or p_sandbox_id !~ '^[A-Za-z0-9_-]+$' then return false; end if;
  if not public.repo_grade_check_run_dispatch(p_user_id,p_generation,p_token,p_run_id,p_lease) then return false; end if;
  update public.repo_grade_artifact_dispatches set sandbox_id=p_sandbox_id
    where generation=p_generation and user_id=p_user_id and path=p_path and run_id=p_run_id and lease=p_lease
      and state='started' and sandbox_id is null;
  return found;
end;
$$;

create function public.repo_grade_finish_artifact_dispatch(
  p_user_id uuid,p_generation bigint,p_token uuid,p_run_id uuid,p_lease uuid,p_path text,p_receipt jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare d public.repo_grade_artifact_dispatches%rowtype; unavailable boolean;
begin
  if not public.repo_grade_check_run_dispatch(p_user_id,p_generation,p_token,p_run_id,p_lease) then return false; end if;
  select * into d from public.repo_grade_artifact_dispatches where generation=p_generation and user_id=p_user_id
    and path=p_path and run_id=p_run_id and lease=p_lease for update;
  unavailable := p_receipt->>'status' = 'unexamined' and p_receipt->>'reason' = 'runtime-unavailable';
  if not found or d.state <> 'started' or d.sandbox_id is null or jsonb_typeof(p_receipt) is distinct from 'object'
    or octet_length(p_receipt::text) > 100000 or p_receipt->>'path' is distinct from d.path
    or p_receipt->>'repoCommit' is distinct from d.source_sha or p_receipt->>'sha256' is distinct from d.artifact_sha256
    or (coalesce(unavailable,false) and (p_receipt - array['path','repoCommit','sha256','kind','status','reason'] <> '{}'::jsonb
      or coalesce(p_receipt->>'kind','') not in ('pe','elf','java-class','python-bytecode')))
    or (not coalesce(unavailable,false) and (p_receipt->>'status' is distinct from 'observed' or p_receipt->>'networkPolicy' is distinct from 'deny-all'
    or p_receipt->>'coverage' is distinct from 'unverified' or p_receipt->>'sourceEquivalence' is distinct from 'unverified'
    or not coalesce((p_receipt->>'kind' = 'pe' and p_receipt->>'runtime' = 'wine' and p_receipt->>'architecture' = 'x86_64')
      or (p_receipt->>'kind' = 'elf' and p_receipt->>'runtime' = 'native' and p_receipt->>'architecture' = 'unknown')
      or (p_receipt->>'kind' = 'java-class' and p_receipt->>'runtime' = 'java' and p_receipt->>'architecture' = 'unknown')
      or (p_receipt->>'kind' = 'python-bytecode' and p_receipt->>'runtime' = 'python' and p_receipt->>'architecture' = 'unknown'),false)
    or jsonb_typeof(p_receipt->'image') is distinct from 'string' or length(p_receipt->>'image') not between 1 and 512
    or jsonb_typeof(p_receipt->'runtimeVersion') is distinct from 'string' or length(p_receipt->>'runtimeVersion') not between 1 and 512
    or not public.repo_grade_general_stage_valid(p_receipt->'execution')))
    then return false; end if;
  update public.repo_grade_artifact_dispatches set state='completed',receipt=p_receipt,completed_at=clock_timestamp()
    where generation=p_generation and path=p_path and state='started';
  return found;
end;
$$;
revoke all on function public.repo_grade_find_artifact_resume(uuid,bigint,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.repo_grade_begin_artifact_dispatch(uuid,bigint,uuid,uuid,uuid,text,text,text,text,bigint,boolean) from public,anon,authenticated,service_role;
revoke all on function public.repo_grade_record_artifact_sandbox(uuid,bigint,uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.repo_grade_finish_artifact_dispatch(uuid,bigint,uuid,uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.repo_grade_find_artifact_resume(uuid,bigint,uuid,uuid,uuid,text) to service_role;
grant execute on function public.repo_grade_begin_artifact_dispatch(uuid,bigint,uuid,uuid,uuid,text,text,text,text,bigint,boolean) to service_role;
grant execute on function public.repo_grade_record_artifact_sandbox(uuid,bigint,uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.repo_grade_finish_artifact_dispatch(uuid,bigint,uuid,uuid,uuid,text,jsonb) to service_role;
