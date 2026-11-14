-- Add WASI preview1 receipts while retaining existing service-only function ACLs.
create or replace function public.repo_grade_settle_general_evidence(
  p_user_id uuid,p_generation bigint,p_token uuid,p_outcome text,p_inputs_complete boolean,p_score numeric,
  p_feedback text,p_rubric jsonb,p_feedback_sections jsonb,p_feedback_retention text,p_source_sha text,p_evidence jsonb
) returns boolean language plpgsql security invoker set search_path='' as $$
declare a public.repo_grade_attempts%rowtype; accepted boolean;
begin
  select * into a from public.repo_grade_attempts where generation=p_generation and user_id=p_user_id and claim_token=p_token;
  -- A numeric result must include distinct, bounded criterion fractions. The
  -- application separately reconciles their weights and total against the
  -- frozen rubric, which can use nonuniform percentage weights.
  if p_outcome='succeeded' then
    if jsonb_typeof(p_rubric) is distinct from 'array' then raise exception 'invalid general score rubric'; end if;
    if jsonb_array_length(p_rubric) not between 1 and 40
      or exists (select 1 from jsonb_array_elements(p_rubric) r
        where jsonb_typeof(r) is distinct from 'object'
          or jsonb_typeof(r->'area') is distinct from 'string' or length(btrim(r->>'area'))=0
          or jsonb_typeof(r->'score') is distinct from 'string'
          or coalesce(r->>'score','') !~ '^[[:space:]]*[0-9]+(\.[0-9]+)?[[:space:]]*/[[:space:]]*[0-9]+(\.[0-9]+)?[[:space:]]*$'
          or case when coalesce(r->>'score','') ~ '^[[:space:]]*[0-9]+(\.[0-9]+)?[[:space:]]*/[[:space:]]*[0-9]+(\.[0-9]+)?[[:space:]]*$'
            then split_part(r->>'score','/',2)::numeric <= 0
              or split_part(r->>'score','/',1)::numeric > split_part(r->>'score','/',2)::numeric
            else false end)
      or (select count(*)<>count(distinct lower(btrim(r->>'area'))) from jsonb_array_elements(p_rubric) r)
    then raise exception 'invalid general score rubric'; end if;
  end if;
  if not found or a.mode='manual' or a.source_sha is distinct from p_source_sha or p_source_sha !~ '^[a-f0-9]{40}$'
    or p_outcome not in ('succeeded','partial') or (p_outcome='succeeded' and (p_score is null or p_inputs_complete is not true))
    or (p_outcome='partial' and (p_score is not null or p_feedback is not null or p_rubric is not null or p_feedback_sections is not null))
    or jsonb_typeof(p_evidence) is distinct from 'object' or p_evidence - array['repoCommit','inputManifest','runs','held','coverage','artifacts','policy'] <> '{}'::jsonb
    or (p_evidence ? 'policy' and p_evidence->>'policy' is distinct from 'source-only')
    or p_evidence->>'repoCommit' is distinct from p_source_sha or p_evidence->'coverage' is distinct from '{"status":"unverified"}'::jsonb
    or jsonb_typeof(p_evidence->'inputManifest') is distinct from 'array' or jsonb_typeof(p_evidence->'runs') is distinct from 'array'
    or jsonb_typeof(p_evidence->'artifacts') is distinct from 'array' or jsonb_typeof(p_evidence->'held') is distinct from 'array' or octet_length(p_evidence::text)>500000 then raise exception 'invalid general evidence'; end if;
  if jsonb_array_length(p_evidence->'inputManifest') not between 1 and 200 or jsonb_array_length(p_evidence->'runs')>10
    or jsonb_array_length(p_evidence->'held')>5
    or (p_evidence->>'policy'='source-only' and (jsonb_array_length(p_evidence->'runs')<>0 or jsonb_array_length(p_evidence->'held')<>0 or jsonb_array_length(p_evidence->'artifacts')<>0))
    or (p_outcome='succeeded' and (jsonb_array_length(p_evidence->'held')<>0 or (jsonb_array_length(p_evidence->'runs')=0 and jsonb_array_length(p_evidence->'artifacts')=0 and p_evidence->>'policy' is distinct from 'source-only')))
    or (p_outcome='succeeded' and p_evidence->>'policy'='source-only' and not exists (
      select 1 from public.repo_grade_rubric_receipts r
      join public.repo_grade_profile_versions v on v.user_id=a.user_id and v.course_id=a.course_id and v.folder=a.folder and v.configuration_fingerprint=a.configuration_fingerprint
      left join public.repo_grade_preparations prep on prep.id=a.cohort_id and prep.user_id=a.user_id and prep.course_id=a.course_id and prep.folder=a.folder and prep.preparation_key=a.preparation_key and prep.state='succeeded'
      where r.user_id=a.user_id and r.course_id=a.course_id and r.folder=a.folder and r.cohort_id=a.cohort_id
        and (v.profile->'useReadmeInstructions' is distinct from 'true'::jsonb or prep.id is not null)
        -- Match the JavaScript policy's ASCII word boundaries for written
        -- assignments and explicitly static SQL review.
        and (
          ((coalesce(r.receipt->>'rubric','') collate "C") ~* '(^|[^a-z0-9_])(essay|written response|reflection|discussion|prose|short answer|written report)([^a-z0-9_]|$)'
            and ((coalesce(r.receipt->>'rubric','') || E'\n' || coalesce(prep.instructions,v.profile->>'instructions','')) collate "C") !~* '(^|[^a-z0-9_])(code|coding|program|programming|software|script|execute|execution|executable|run|runs|running|compile|compilation|test|tests|coverage|sql|database|algorithm|function|implementation)([^a-z0-9_]|$)')
          or ((coalesce(r.receipt->>'rubric','') collate "C") ~* '(^|[^a-z0-9_])(sql|query|queries)([^a-z0-9_]|$)'
            and (coalesce(r.receipt->>'rubric','') collate "C") ~* '(^|[^a-z0-9_])(review|analyze|analyse|analysis|explain|describe)([^a-z0-9_]|$)'
            and ((coalesce(r.receipt->>'rubric','') || E'\n' || coalesce(prep.instructions,v.profile->>'instructions','')) collate "C") !~* '(^|[^a-z0-9_])(execute|execution|executable|run|runs|running|compile|compilation|test|tests|coverage|output|result|results|connect|deploy)([^a-z0-9_]|$)')
        )))
    or exists(select 1 from jsonb_array_elements(p_evidence->'held') h where jsonb_typeof(h) is distinct from 'object'
      or h - array['language','reason'] <> '{}'::jsonb or coalesce(h->>'language','') not in ('python','javascript','java','c','c++')
      or coalesce(h->>'reason','') not in ('ambiguous','no-entry-point'))
    or (select count(*)<>count(distinct h->>'language') from jsonb_array_elements(p_evidence->'held') h)
    or (select count(*)<>count(distinct (r->>'language',lower(r->>'entryPoint'))) from jsonb_array_elements(p_evidence->'runs') r)
    or exists(select 1 from jsonb_array_elements(p_evidence->'runs') r join jsonb_array_elements(p_evidence->'held') h on h->>'language'=r->>'language')
    or jsonb_array_length(p_evidence->'artifacts')>40
    or exists (select 1 from jsonb_array_elements(p_evidence->'inputManifest') f where jsonb_typeof(f) is distinct from 'object'
      or f - array['path','sha256'] <> '{}'::jsonb or jsonb_typeof(f->'path') is distinct from 'string' or length(f->>'path') not between 1 and 600
      or f->>'path' ~ '[[:cntrl:]\\]' or f->>'path' ~ '(^|/)(\.{1,2}|)(/|$)' or (a.folder<>'' and left(f->>'path',length(a.folder)+1)<>a.folder||'/')
      or coalesce(f->>'sha256','') !~ '^[a-f0-9]{64}$')
    or (select count(*)<>count(distinct lower(f->>'path')) from jsonb_array_elements(p_evidence->'inputManifest') f)
    or exists(select 1 from jsonb_array_elements(p_evidence->'runs') r where jsonb_typeof(r) is distinct from 'object'
      or coalesce(r->>'language','') not in ('python','javascript','java','c','c++') or r->>'selection' is distinct from 'heuristic'
      or r->>'networkPolicy' is distinct from 'deny-all' or coalesce(r->>'status','') not in ('observed','unsupported','ambiguous','unavailable')
      or jsonb_typeof(r->'image') is distinct from 'string' or length(r->>'image') not between 1 and 512
      or jsonb_typeof(r->'toolVersion') is distinct from 'string' or length(r->>'toolVersion') not between 1 and 512
      or not exists(select 1 from jsonb_array_elements(p_evidence->'inputManifest') f where f->>'path'=r->>'entryPoint')
      or (r->'compile' is distinct from 'null'::jsonb and not public.repo_grade_general_stage_valid(r->'compile'))
      or (r->'run' is distinct from 'null'::jsonb and not public.repo_grade_general_stage_valid(r->'run'))
      or (p_outcome='succeeded' and (r->>'status' is distinct from 'observed' or not public.repo_grade_general_stage_valid(r->'run')
        or r->'run'->'exitCode' is distinct from '0'::jsonb or r->'run'->'signal' is distinct from 'null'::jsonb or r->'run'->'timedOut' is distinct from 'false'::jsonb
        or (r->'compile' is distinct from 'null'::jsonb and (r->'compile'->'exitCode' is distinct from '0'::jsonb or r->'compile'->'signal' is distinct from 'null'::jsonb or r->'compile'->'timedOut' is distinct from 'false'::jsonb)))))
    or exists(select 1 from jsonb_array_elements(p_evidence->'artifacts') x where jsonb_typeof(x) is distinct from 'object'
      or coalesce(x->>'status','') not in ('unexamined','unsupported','observed') or jsonb_typeof(x->'kind') is distinct from 'string' or length(x->>'kind') not between 1 and 64
      or (x->>'status'='observed' and (not coalesce(
          (x->>'kind'='pe' and x->>'runtime'='wine' and x->>'architecture'='x86_64')
          or (x->>'kind'='elf' and x->>'runtime'='native' and x->>'architecture'='unknown')
          or (x->>'kind'='java-class' and x->>'runtime'='java' and x->>'architecture'='unknown')
          or (x->>'kind'='python-bytecode' and x->>'runtime'='python' and x->>'architecture'='unknown')
          or (x->>'kind'='wasm' and x->>'runtime'='wasi' and x->>'architecture'='unknown'), false)
        or x->>'repoCommit' is distinct from p_source_sha or x->>'networkPolicy' is distinct from 'deny-all'
        or x->>'sourceEquivalence' is distinct from 'unverified' or x->>'coverage' is distinct from 'unverified'
        or jsonb_typeof(x->'image') is distinct from 'string' or length(x->>'image') not between 1 and 512
        or jsonb_typeof(x->'runtimeVersion') is distinct from 'string' or length(x->>'runtimeVersion') not between 1 and 512
        or not public.repo_grade_general_stage_valid(x->'execution')))
      or (p_outcome='succeeded' and (x->>'status' is distinct from 'observed' or x->'execution'->'exitCode' is distinct from '0'::jsonb
        or x->'execution'->'signal' is distinct from 'null'::jsonb or x->'execution'->'timedOut' is distinct from 'false'::jsonb))
      or not exists(select 1 from jsonb_array_elements(p_evidence->'inputManifest') f where f->>'path'=x->>'path' and f->>'sha256'=x->>'sha256'))
    or (select count(*)<>count(distinct lower(x->>'path')) from jsonb_array_elements(p_evidence->'artifacts') x)
  then raise exception 'invalid general evidence contents'; end if;
  accepted:=public.repo_grade_settle(p_user_id,p_generation,p_token,p_outcome,p_inputs_complete,p_score,p_feedback,p_rubric,p_feedback_sections,p_feedback_retention);
  if accepted then insert into public.repo_grade_general_evidence(generation,source_sha,evidence) values(p_generation,p_source_sha,p_evidence); end if;
  return accepted;
end;
$$;

create or replace function public.repo_grade_finish_artifact_dispatch(
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
      or coalesce(p_receipt->>'kind','') not in ('pe','elf','java-class','python-bytecode','wasm')))
    or (not coalesce(unavailable,false) and (p_receipt->>'status' is distinct from 'observed' or p_receipt->>'networkPolicy' is distinct from 'deny-all'
    or p_receipt->>'coverage' is distinct from 'unverified' or p_receipt->>'sourceEquivalence' is distinct from 'unverified'
    or not coalesce((p_receipt->>'kind' = 'pe' and p_receipt->>'runtime' = 'wine' and p_receipt->>'architecture' = 'x86_64')
      or (p_receipt->>'kind' = 'elf' and p_receipt->>'runtime' = 'native' and p_receipt->>'architecture' = 'unknown')
      or (p_receipt->>'kind' = 'java-class' and p_receipt->>'runtime' = 'java' and p_receipt->>'architecture' = 'unknown')
      or (p_receipt->>'kind' = 'python-bytecode' and p_receipt->>'runtime' = 'python' and p_receipt->>'architecture' = 'unknown')
      or (p_receipt->>'kind' = 'wasm' and p_receipt->>'runtime' = 'wasi' and p_receipt->>'architecture' = 'unknown'),false)
    or jsonb_typeof(p_receipt->'image') is distinct from 'string' or length(p_receipt->>'image') not between 1 and 512
    or jsonb_typeof(p_receipt->'runtimeVersion') is distinct from 'string' or length(p_receipt->>'runtimeVersion') not between 1 and 512
    or not public.repo_grade_general_stage_valid(p_receipt->'execution')))
    then return false; end if;
  update public.repo_grade_artifact_dispatches set state='completed',receipt=p_receipt,completed_at=clock_timestamp()
    where generation=p_generation and path=p_path and state='started';
  return found;
end;
$$;

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
          and artifact->>'kind' in ('pe','elf','java-class','python-bytecode','wasm'))
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
