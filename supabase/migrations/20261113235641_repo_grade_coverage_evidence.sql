-- A review draft may have no omitted optional binaries; preserve an empty list.
alter table public.repo_grade_review_drafts drop constraint repo_grade_review_drafts_unexamined_artifacts_check;
alter table public.repo_grade_review_drafts add constraint repo_grade_review_drafts_unexamined_artifacts_check
  check (jsonb_typeof(unexamined_artifacts) = 'array' and jsonb_array_length(unexamined_artifacts) between 0 and 40 and octet_length(unexamined_artifacts::text) <= 16384);
create or replace function public.repo_grade_settle(
  p_user_id uuid, p_generation bigint, p_token uuid, p_outcome text,
  p_inputs_complete boolean, p_score numeric, p_feedback text, p_rubric jsonb,
  p_feedback_sections jsonb, p_feedback_retention text, p_unexamined_artifacts jsonb, p_review_reason text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare accepted boolean;
begin
  if p_unexamined_artifacts is null or p_review_reason is distinct from 'execution-unverified'
    or p_outcome is distinct from 'partial' or p_score is not null or p_feedback is null
    or p_feedback_retention is not null or p_inputs_complete is not true
    or jsonb_typeof(p_unexamined_artifacts) is distinct from 'array'
  then raise exception 'invalid review draft'; end if;
  if jsonb_array_length(p_unexamined_artifacts) not between 0 and 40
    or octet_length(p_unexamined_artifacts::text) > 16384
    or exists (select 1 from pg_catalog.jsonb_array_elements(p_unexamined_artifacts) item
      where jsonb_typeof(item) is distinct from 'object'
        or case when jsonb_typeof(item) = 'object' then item - array['path','reason'] <> '{}'::jsonb else true end
        or jsonb_typeof(item->'path') is distinct from 'string'
        or length(item->>'path') not between 1 and 4096
        or item->>'path' ~ '[[:cntrl:]\\]'
        or item->>'path' ~ '(^|/)(\.{1,2}|)(/|$)'
        or item->>'reason' is distinct from 'optional-binary-unexamined')
  then raise exception 'invalid artifact provenance'; end if;
  if jsonb_typeof(p_feedback_sections) is distinct from 'object'
    or p_feedback_sections - array['strengths','improvements','resubmitNotice','rawScore'] <> '{}'::jsonb
    or jsonb_typeof(p_feedback_sections->'strengths') is distinct from 'string'
    or jsonb_typeof(p_feedback_sections->'improvements') is distinct from 'string'
    or jsonb_typeof(p_feedback_sections->'resubmitNotice') is distinct from 'string'
    or jsonb_typeof(p_feedback_sections->'rawScore') is distinct from 'string'
    or length(p_feedback_sections->>'strengths') > 16000 or length(p_feedback_sections->>'improvements') > 16000
    or length(p_feedback_sections->>'resubmitNotice') > 16000 or length(p_feedback_sections->>'rawScore') > 128
    or jsonb_typeof(p_rubric) is distinct from 'array'
  then raise exception 'invalid review feedback'; end if;
  if jsonb_array_length(p_rubric) > 40 or exists (
    select 1 from pg_catalog.jsonb_array_elements(p_rubric) item
    where jsonb_typeof(item) is distinct from 'object'
      or case when jsonb_typeof(item) = 'object' then item - array['area','score','comment'] <> '{}'::jsonb else true end
      or jsonb_typeof(item->'area') is distinct from 'string' or length(item->>'area') > 256
      or jsonb_typeof(item->'score') is distinct from 'string' or length(item->>'score') > 128
      or jsonb_typeof(item->'comment') is distinct from 'string' or length(item->>'comment') > 4096
  ) then raise exception 'invalid review rubric'; end if;
  accepted := public.repo_grade_settle(p_user_id, p_generation, p_token, 'partial', false,
    null::numeric, null::text, null::jsonb, null::jsonb, null::text);
  if accepted then
    insert into public.repo_grade_review_drafts(generation,feedback,feedback_sections,rubric,unexamined_artifacts,review_reason)
      values (p_generation,p_feedback,p_feedback_sections,p_rubric,p_unexamined_artifacts,p_review_reason);
  end if;
  return accepted;
end;
$$;

-- Facts observed by controlled runners, retained atomically with the draft.
-- Coverage remains unverified; this table does not authorize a numeric score.
create table public.repo_grade_partial_execution_evidence (
  generation bigint primary key references public.repo_grade_review_drafts(generation) on delete cascade,
  source_sha text not null check (source_sha ~ '^[a-f0-9]{40}$'),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object' and octet_length(evidence::text) <= 500000)
);
alter table public.repo_grade_partial_execution_evidence enable row level security;
revoke all on public.repo_grade_partial_execution_evidence from public, anon, authenticated, service_role;
grant select,insert on public.repo_grade_partial_execution_evidence to service_role;

-- These are observations only. A timed-out or signalled stage is retainable,
-- but remains unverified and must never be converted into a numeric score.
create function public.repo_grade_partial_stage_valid(s jsonb, artifact boolean) returns boolean
language sql immutable security invoker set search_path = '' as $$
  select coalesce(jsonb_typeof(s)='object'
    and jsonb_typeof(s->'command')='string' and length(s->>'command') between 1 and 1000
    and (s->'exitCode'='null'::jsonb or (jsonb_typeof(s->'exitCode')='number' and s->>'exitCode' ~ '^-?[0-9]{1,10}$'))
    and (case when artifact then s->'termination'='null'::jsonb or s->>'termination'='unknown'
      else (s->'signal'='null'::jsonb or (jsonb_typeof(s->'signal')='string' and length(s->>'signal')<=128)) and jsonb_typeof(s->'timedOut')='boolean' end)
    and jsonb_typeof(s->'stdout')='string' and length(s->>'stdout')<=10000
    and jsonb_typeof(s->'stderr')='string' and length(s->>'stderr')<=10000
    and jsonb_typeof(s->'stdoutTruncated')='boolean' and jsonb_typeof(s->'stderrTruncated')='boolean',false);
$$;

create function public.repo_grade_settle_partial_evidence(
  p_user_id uuid, p_generation bigint, p_token uuid, p_outcome text, p_inputs_complete boolean,
  p_score numeric, p_feedback text, p_rubric jsonb, p_feedback_sections jsonb, p_feedback_retention text,
  p_unexamined_artifacts jsonb, p_review_reason text, p_source_sha text, p_evidence jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare accepted boolean;
begin
  if p_outcome is distinct from 'partial' or p_score is not null or p_review_reason is distinct from 'execution-unverified'
    or p_source_sha is null or p_source_sha !~ '^[a-f0-9]{40}$'
    or not exists(select 1 from public.repo_grade_attempts a where a.generation=p_generation and a.user_id=p_user_id
      and a.claim_token=p_token and a.source_sha=p_source_sha and a.folder='assignments/module_12' and a.mode<>'manual')
    or jsonb_typeof(p_evidence) is distinct from 'object'
    or p_evidence - array['sourceReceipts','artifactReceipts','coverage'] <> '{}'::jsonb
    or octet_length(p_evidence::text) > 500000
    or jsonb_typeof(p_evidence->'sourceReceipts') is distinct from 'array'
    or jsonb_typeof(p_evidence->'artifactReceipts') is distinct from 'array'
    or p_evidence->'coverage' is distinct from '{"status":"unverified"}'::jsonb
  then raise exception 'invalid partial execution evidence'; end if;
  if jsonb_array_length(p_evidence->'sourceReceipts') <> 3
    or jsonb_array_length(p_evidence->'artifactReceipts') > 40
    or exists(select 1 from jsonb_array_elements(p_evidence->'sourceReceipts') r
      where jsonb_typeof(r) is distinct from 'object' or r->>'repoCommit' is distinct from p_source_sha
        or r->>'testCount' is distinct from 'unverified' or r->>'dependencyCompleteness' is distinct from 'unverified'
        or r->>'networkPolicy' is distinct from 'deny-all' or coalesce(r->>'sourceSha256','') !~ '^[a-f0-9]{64}$'
        or coalesce(r->>'sourcePath','') not in ('assignments/module_12/test_utils.py','assignments/module_12/TestUtils.java','assignments/module_12/test_utils.cpp')
        or jsonb_typeof(r->'inputManifest') is distinct from 'array'
        or case when jsonb_typeof(r->'inputManifest')='array' then
          jsonb_array_length(r->'inputManifest') not between 1 and 100
          or exists(select 1 from jsonb_array_elements(r->'inputManifest') f where jsonb_typeof(f) is distinct from 'object'
            or f - array['path','sha256'] <> '{}'::jsonb or coalesce(f->>'path','') !~ '^assignments/module_12/[a-zA-Z0-9_. /-]+$'
            or f->>'path' ~ '(^|/)(\.{1,2}|)(/|$)' or length(f->>'path') > 600 or coalesce(f->>'sha256','') !~ '^[a-f0-9]{64}$')
          or (select count(*)<>count(distinct lower(f->>'path')) from jsonb_array_elements(r->'inputManifest') f)
          or not exists(select 1 from jsonb_array_elements(r->'inputManifest') f where f->>'path'=r->>'sourcePath' and f->>'sha256'=r->>'sourceSha256')
          else true end
        or (r->>'sourcePath'='assignments/module_12/test_utils.py' and r->>'language' is distinct from 'python')
        or (r->>'sourcePath'='assignments/module_12/TestUtils.java' and r->>'language' is distinct from 'java')
        or (r->>'sourcePath'='assignments/module_12/test_utils.cpp' and r->>'language' is distinct from 'c++')
        or jsonb_typeof(r->'image') is distinct from 'string' or length(r->>'image') not between 1 and 512
        or jsonb_typeof(r->'compilerVersion') is distinct from 'string' or length(r->>'compilerVersion') not between 1 and 512
        or (r->'compile' is distinct from 'null'::jsonb and not public.repo_grade_partial_stage_valid(r->'compile',false))
        or (r->'run' is distinct from 'null'::jsonb and not public.repo_grade_partial_stage_valid(r->'run',false)))
    or (select count(distinct r->>'sourcePath') from jsonb_array_elements(p_evidence->'sourceReceipts') r) <> 3
    or exists(select 1 from jsonb_array_elements(p_evidence->'sourceReceipts') r where
      (select jsonb_agg(f order by f->>'path') from jsonb_array_elements(r->'inputManifest') f)
      is distinct from (select jsonb_agg(f order by f->>'path') from jsonb_array_elements(p_evidence->'sourceReceipts'->0->'inputManifest') f))
    or (select count(*) <> count(distinct r->>'path') from jsonb_array_elements(p_evidence->'artifactReceipts') r)
    or exists(select 1 from jsonb_array_elements(p_evidence->'artifactReceipts') r
      where jsonb_typeof(r) is distinct from 'object' or r->>'repoCommit' is distinct from p_source_sha
        or r->>'sourceEquivalence' is distinct from 'unverified' or r->>'testCoverage' is distinct from 'unverified'
        or r->>'networkPolicy' is distinct from 'deny-all' or coalesce(r->>'sha256','') !~ '^[a-f0-9]{64}$'
        or coalesce(r->>'path','') !~ '^assignments/module_12/(TestUtils\.class|test_utils(\.exe)?|__pycache__/test_utils\.cpython-[0-9]{2,3}\.pyc)$'
        or coalesce(r->>'kind','') not in ('java-class','elf','pe','python-bytecode')
        or r->>'kind' is distinct from case r->>'path'
          when 'assignments/module_12/TestUtils.class' then 'java-class'
          when 'assignments/module_12/test_utils' then 'elf'
          when 'assignments/module_12/test_utils.exe' then 'pe' else 'python-bytecode' end
        or coalesce(r->>'executionStatus','') not in ('observed','unsupported-platform','runtime-unavailable')
        or jsonb_typeof(r->'image') is distinct from 'string' or length(r->>'image') not between 1 and 512
        or not public.repo_grade_partial_stage_valid(r->'metadata',true) or not public.repo_grade_partial_stage_valid(r->'toolVersion',true)
        or (r->'runtimeVersion' is distinct from 'null'::jsonb and not public.repo_grade_partial_stage_valid(r->'runtimeVersion',true))
        or (r->>'executionStatus'='observed' and not public.repo_grade_partial_stage_valid(r->'execution',true))
        or (r->>'executionStatus'<>'observed' and r->'execution' is distinct from 'null'::jsonb))
  then raise exception 'invalid partial execution receipts'; end if;
  accepted := public.repo_grade_settle(p_user_id,p_generation,p_token,p_outcome,p_inputs_complete,
    p_score,p_feedback,p_rubric,p_feedback_sections,p_feedback_retention,p_unexamined_artifacts,p_review_reason);
  if accepted then insert into public.repo_grade_partial_execution_evidence(generation,source_sha,evidence) values(p_generation,p_source_sha,p_evidence); end if;
  return accepted;
end;
$$;
revoke all on function public.repo_grade_settle_partial_evidence(uuid,bigint,uuid,text,boolean,numeric,text,jsonb,jsonb,text,jsonb,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.repo_grade_settle_partial_evidence(uuid,bigint,uuid,text,boolean,numeric,text,jsonb,jsonb,text,jsonb,text,text,jsonb) to service_role;
-- Shared validation of source and artifact observations for a scored proposal.
create function public.repo_grade_scored_observations_valid(p_evidence jsonb,p_source_sha text) returns boolean
language plpgsql immutable security invoker set search_path = '' as $$
begin
  if jsonb_typeof(p_evidence) is distinct from 'object'
    or p_evidence - array['sourceReceipts','artifactReceipts','coverage'] <> '{}'::jsonb
    or octet_length(p_evidence::text) > 500000
    or jsonb_typeof(p_evidence->'sourceReceipts') is distinct from 'array'
    or jsonb_typeof(p_evidence->'artifactReceipts') is distinct from 'array'
    or p_evidence->'coverage' is distinct from '{"status":"unverified"}'::jsonb
  then return false; end if;
  if jsonb_array_length(p_evidence->'sourceReceipts') <> 3
    or jsonb_array_length(p_evidence->'artifactReceipts') > 40
    or exists(select 1 from jsonb_array_elements(p_evidence->'sourceReceipts') r
      where jsonb_typeof(r) is distinct from 'object' or r->>'repoCommit' is distinct from p_source_sha
        or r->>'testCount' is distinct from 'unverified' or r->>'dependencyCompleteness' is distinct from 'unverified'
        or r->>'networkPolicy' is distinct from 'deny-all' or coalesce(r->>'sourceSha256','') !~ '^[a-f0-9]{64}$'
        or coalesce(r->>'sourcePath','') not in ('assignments/module_12/test_utils.py','assignments/module_12/TestUtils.java','assignments/module_12/test_utils.cpp')
        or jsonb_typeof(r->'inputManifest') is distinct from 'array'
        or case when jsonb_typeof(r->'inputManifest')='array' then
          jsonb_array_length(r->'inputManifest') not between 1 and 100
          or exists(select 1 from jsonb_array_elements(r->'inputManifest') f where jsonb_typeof(f) is distinct from 'object'
            or f - array['path','sha256'] <> '{}'::jsonb or coalesce(f->>'path','') !~ '^assignments/module_12/[a-zA-Z0-9_. /-]+$'
            or f->>'path' ~ '(^|/)(\.{1,2}|)(/|$)' or length(f->>'path') > 600 or coalesce(f->>'sha256','') !~ '^[a-f0-9]{64}$')
          or (select count(*)<>count(distinct lower(f->>'path')) from jsonb_array_elements(r->'inputManifest') f)
          or not exists(select 1 from jsonb_array_elements(r->'inputManifest') f where f->>'path'=r->>'sourcePath' and f->>'sha256'=r->>'sourceSha256')
          else true end
        or (r->>'sourcePath'='assignments/module_12/test_utils.py' and r->>'language' is distinct from 'python')
        or (r->>'sourcePath'='assignments/module_12/TestUtils.java' and r->>'language' is distinct from 'java')
        or (r->>'sourcePath'='assignments/module_12/test_utils.cpp' and r->>'language' is distinct from 'c++')
        or jsonb_typeof(r->'image') is distinct from 'string' or length(r->>'image') not between 1 and 512
        or jsonb_typeof(r->'compilerVersion') is distinct from 'string' or length(r->>'compilerVersion') not between 1 and 512
        or (r->'compile' is distinct from 'null'::jsonb and (not public.repo_grade_partial_stage_valid(r->'compile',false) or r->'compile'->'exitCode' is distinct from '0'::jsonb or r->'compile'->'signal' is distinct from 'null'::jsonb or r->'compile'->'timedOut' is distinct from 'false'::jsonb))
        or (r->>'language' <> 'python' and r->'compile' is not distinct from 'null'::jsonb)
        or not public.repo_grade_partial_stage_valid(r->'run',false) or r->'run'->'exitCode' is distinct from '0'::jsonb or r->'run'->'signal' is distinct from 'null'::jsonb or r->'run'->'timedOut' is distinct from 'false'::jsonb)
    or (select count(distinct r->>'sourcePath') from jsonb_array_elements(p_evidence->'sourceReceipts') r) <> 3
    or exists(select 1 from jsonb_array_elements(p_evidence->'sourceReceipts') r where
      (select jsonb_agg(f order by f->>'path') from jsonb_array_elements(r->'inputManifest') f)
      is distinct from (select jsonb_agg(f order by f->>'path') from jsonb_array_elements(p_evidence->'sourceReceipts'->0->'inputManifest') f))
    or (select count(*) <> count(distinct r->>'path') from jsonb_array_elements(p_evidence->'artifactReceipts') r)
    or exists(select 1 from jsonb_array_elements(p_evidence->'artifactReceipts') r
      where jsonb_typeof(r) is distinct from 'object' or r->>'repoCommit' is distinct from p_source_sha
        or r->>'sourceEquivalence' is distinct from 'unverified' or r->>'testCoverage' is distinct from 'unverified'
        or r->>'networkPolicy' is distinct from 'deny-all' or coalesce(r->>'sha256','') !~ '^[a-f0-9]{64}$'
        or coalesce(r->>'path','') !~ '^assignments/module_12/(TestUtils\.class|test_utils(\.exe)?|__pycache__/test_utils\.cpython-[0-9]{2,3}\.pyc)$'
        or coalesce(r->>'kind','') not in ('java-class','elf','pe','python-bytecode')
        or r->>'kind' is distinct from case r->>'path'
          when 'assignments/module_12/TestUtils.class' then 'java-class'
          when 'assignments/module_12/test_utils' then 'elf'
          when 'assignments/module_12/test_utils.exe' then 'pe' else 'python-bytecode' end
        or coalesce(r->>'executionStatus','') not in ('observed','unsupported-platform','runtime-unavailable')
        or jsonb_typeof(r->'image') is distinct from 'string' or length(r->>'image') not between 1 and 512
        or not public.repo_grade_partial_stage_valid(r->'metadata',true) or not public.repo_grade_partial_stage_valid(r->'toolVersion',true)
        or (r->'runtimeVersion' is distinct from 'null'::jsonb and not public.repo_grade_partial_stage_valid(r->'runtimeVersion',true))
        or (r->>'executionStatus'='observed' and (not public.repo_grade_partial_stage_valid(r->'execution',true) or r->'execution'->'exitCode' is distinct from '0'::jsonb or r->'execution'->'termination' is distinct from 'null'::jsonb))
        or (r->>'executionStatus'='unsupported-platform' and (r->>'kind' <> 'pe' or r->'execution' is distinct from 'null'::jsonb))
        or r->>'executionStatus'='runtime-unavailable')
  then return false; end if;

  return true;
end;
$$;
create table public.repo_grade_scored_observations (
  generation bigint primary key references public.repo_grade_evaluations(generation) on delete cascade,
  source_sha text not null check (source_sha ~ '^[a-f0-9]{40}$'),
  unexamined_artifacts jsonb not null,
  evidence jsonb not null
);
alter table public.repo_grade_scored_observations enable row level security;
revoke all on public.repo_grade_scored_observations from public,anon,authenticated,service_role;
grant select,insert on public.repo_grade_scored_observations to service_role;
create function public.repo_grade_settle_scored_observations(
  p_user_id uuid,p_generation bigint,p_token uuid,p_outcome text,p_inputs_complete boolean,p_score numeric,
  p_feedback text,p_rubric jsonb,p_feedback_sections jsonb,p_feedback_retention text,
  p_unexamined_artifacts jsonb,p_source_sha text,p_evidence jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare accepted boolean;
begin
  if p_outcome is distinct from 'succeeded' or p_inputs_complete is not true or p_score is null or p_feedback_retention is not null
    or p_source_sha is null or p_source_sha !~ '^[a-f0-9]{40}$'
    or not exists(select 1 from public.repo_grade_attempts a join public.repo_grade_rubric_receipts r
      on r.user_id=a.user_id and r.course_id=a.course_id and r.folder=a.folder and r.cohort_id=a.cohort_id
      where a.generation=p_generation and a.user_id=p_user_id and a.claim_token=p_token and a.source_sha=p_source_sha
        and a.folder='assignments/module_12' and a.mode<>'manual'
        and encode(sha256(convert_to(r.receipt->>'rubric','UTF8')),'hex') in ('5d6383288a2eb5698251e17261879c39a5f43a9f0b01a0bf0e8496c7a0095717','fc065dfc81f80f127d60f8fdfa47d84f0e1c18afdcfff095f78c8904fb74285f'))
    or not public.repo_grade_scored_observations_valid(p_evidence,p_source_sha)
    or jsonb_typeof(p_unexamined_artifacts) is distinct from 'array'
    or jsonb_typeof(p_rubric) is distinct from 'array'
  then raise exception 'invalid scored observations'; end if;
  if jsonb_array_length(p_rubric) <> 4 or exists(select 1 from jsonb_array_elements(p_rubric) r
    where coalesce(r->>'score','') !~ '^[0-9]+(\.[0-9]+)?\s*/\s*25(\.0+)?$'
      or split_part(r->>'score','/',1)::numeric > 25)
    or (select sum(split_part(r->>'score','/',1)::numeric) from jsonb_array_elements(p_rubric) r) <> p_score
    or (select array_agg(r->>'area' order by ord) from jsonb_array_elements(p_rubric) with ordinality x(r,ord)) not in (
      array['Function Implementation','Test Coverage Quantity','Test Case Quality','Code Organization and Testing Practice'],
      array['Function Implementation','Test Suite Completeness','Test Coverage (Normal/Edge/Invalid)','Code Structure and Style'])
  then raise exception 'invalid scored rubric'; end if;
  if not exists (select 1 from public.repo_grade_attempts a join public.repo_grade_rubric_receipts r
    on r.user_id=a.user_id and r.course_id=a.course_id and r.folder=a.folder and r.cohort_id=a.cohort_id
    where a.generation=p_generation and a.user_id=p_user_id and (
      (encode(sha256(convert_to(r.receipt->>'rubric','UTF8')),'hex')='5d6383288a2eb5698251e17261879c39a5f43a9f0b01a0bf0e8496c7a0095717' and p_rubric->1->>'area'='Test Coverage Quantity')
      or (encode(sha256(convert_to(r.receipt->>'rubric','UTF8')),'hex')='fc065dfc81f80f127d60f8fdfa47d84f0e1c18afdcfff095f78c8904fb74285f' and p_rubric->1->>'area'='Test Suite Completeness')))
  then raise exception 'scored rubric does not match frozen rubric'; end if;
  if jsonb_array_length(p_unexamined_artifacts)>40 or octet_length(p_unexamined_artifacts::text)>16384
    or exists(select 1 from jsonb_array_elements(p_unexamined_artifacts) a
      where jsonb_typeof(a) is distinct from 'object' or a - array['path','reason'] <> '{}'::jsonb
        or jsonb_typeof(a->'path') is distinct from 'string' or length(a->>'path') not between 1 and 4096
        or a->>'path' ~ '[[:cntrl:]\\]' or a->>'path' ~ '(^|/)(\.{1,2}|)(/|$)'
        or a->>'reason' is distinct from 'optional-binary-unexamined') then raise exception 'invalid artifact omissions'; end if;
  accepted := public.repo_grade_settle(p_user_id,p_generation,p_token,p_outcome,p_inputs_complete,p_score,p_feedback,p_rubric,p_feedback_sections,p_feedback_retention);
  if accepted then insert into public.repo_grade_scored_observations values(p_generation,p_source_sha,p_unexamined_artifacts,p_evidence); end if;
  return accepted;
end;
$$;
revoke all on function public.repo_grade_settle_scored_observations(uuid,bigint,uuid,text,boolean,numeric,text,jsonb,jsonb,text,jsonb,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.repo_grade_settle_scored_observations(uuid,bigint,uuid,text,boolean,numeric,text,jsonb,jsonb,text,jsonb,text,jsonb) to service_role;
-- History is paged by attempt count. Do not inline raw student output or
-- repeated manifests for every attempt; those remain in the durable record.
create function public.repo_grade_evidence_summary(e jsonb) returns jsonb language sql immutable security invoker set search_path='' as $$
  select case when e is null then null else jsonb_build_object(
    'coverage', e->'coverage',
    'sourceReceipts', (select coalesce(jsonb_agg(jsonb_build_object('sourcePath',r->'sourcePath','language',r->'language',
      'compileExit',r->'compile'->'exitCode','runExit',r->'run'->'exitCode',
      'compileState',case when r->'compile'='null'::jsonb then 'not-recorded' when r->'compile'->'timedOut'='true'::jsonb then 'timed-out' when r->'compile'->'signal'<>'null'::jsonb then 'signalled' when r->'compile'->'exitCode'='null'::jsonb then 'unknown' else 'completed' end,
      'runState',case when r->'run'='null'::jsonb then 'not-recorded' when r->'run'->'timedOut'='true'::jsonb then 'timed-out' when r->'run'->'signal'<>'null'::jsonb then 'signalled' when r->'run'->'exitCode'='null'::jsonb then 'unknown' else 'completed' end)),'[]'::jsonb) from jsonb_array_elements(e->'sourceReceipts') r),
    'artifactReceipts', (select coalesce(jsonb_agg(jsonb_build_object('path',r->'path','executionStatus',r->'executionStatus',
      'exit',r->'execution'->'exitCode')),'[]'::jsonb) from jsonb_array_elements(e->'artifactReceipts') r)) end;
$$;
create or replace function public.repo_grade_history(p_user_id uuid, p_course_id uuid, p_before bigint)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.course_hub c where c.id = p_course_id and c.user_id = p_user_id) then return null; end if;
  return (select coalesce(jsonb_agg(to_jsonb(page) order by page.generation desc), '[]'::jsonb) from (
    select a.generation,a.repo,a.folder,a.source_ref,a.source_sha,a.profile_fingerprint,
      case when a.status = 'claimed' and a.claimed_at <= statement_timestamp() - interval '15 minutes' then 'unknown' else a.status end as status,
      a.claimed_at,a.settled_at,a.reconciled_at,e.score,coalesce(e.feedback,d.feedback) as feedback,coalesce(e.rubric,d.rubric) as rubric,
      coalesce(e.feedback_sections,d.feedback_sections) as feedback_sections,coalesce(scored.unexamined_artifacts,d.unexamined_artifacts) as unexamined_artifacts,
      d.review_reason,a.feedback_retention,null::jsonb as execution_receipts,public.repo_grade_evidence_summary(coalesce(scored.evidence,partial.evidence)) as module12_evidence
    from public.repo_grade_attempts a left join public.repo_grade_evaluations e using (generation)
      left join public.repo_grade_review_drafts d using (generation) left join public.repo_grade_partial_execution_evidence partial using (generation) left join public.repo_grade_scored_observations scored using (generation)
    where a.course_id=p_course_id and a.user_id=p_user_id and a.mode <> 'manual' and (p_before is null or a.generation < p_before)
    order by a.generation desc limit 100) page);
end;
$$;
