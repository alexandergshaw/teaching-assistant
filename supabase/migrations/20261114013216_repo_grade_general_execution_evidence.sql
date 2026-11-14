-- A general repository assessment retains bounded execution observations in the
-- same transaction as its fenced outcome. Coverage is never claimed verified.
create table public.repo_grade_general_evidence (
  generation bigint primary key references public.repo_grade_attempts(generation) on delete cascade,
  source_sha text not null check (source_sha ~ '^[a-f0-9]{40}$'),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object' and octet_length(evidence::text) <= 500000)
);
alter table public.repo_grade_general_evidence enable row level security;
revoke all on public.repo_grade_general_evidence from public,anon,authenticated,service_role;
grant select,insert on public.repo_grade_general_evidence to service_role;

create function public.repo_grade_general_stage_valid(s jsonb) returns boolean language sql immutable security invoker set search_path='' as $$
  select coalesce(jsonb_typeof(s)='object' and jsonb_typeof(s->'command')='string' and length(s->>'command') between 1 and 1000
    and (s->'exitCode'='null'::jsonb or (jsonb_typeof(s->'exitCode')='number' and s->>'exitCode' ~ '^-?[0-9]{1,10}$'))
    and (s->'signal'='null'::jsonb or (jsonb_typeof(s->'signal')='string' and length(s->>'signal')<=128))
    and jsonb_typeof(s->'timedOut')='boolean' and jsonb_typeof(s->'stdout')='string' and length(s->>'stdout')<=10000
    and jsonb_typeof(s->'stderr')='string' and length(s->>'stderr')<=10000
    and jsonb_typeof(s->'stdoutTruncated')='boolean' and jsonb_typeof(s->'stderrTruncated')='boolean',false);
$$;
revoke all on function public.repo_grade_general_stage_valid(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.repo_grade_general_stage_valid(jsonb) to service_role;
create function public.repo_grade_settle_general_evidence(
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
          or (x->>'kind'='python-bytecode' and x->>'runtime'='python' and x->>'architecture'='unknown'), false)
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
revoke all on function public.repo_grade_settle_general_evidence(uuid,bigint,uuid,text,boolean,numeric,text,jsonb,jsonb,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.repo_grade_settle_general_evidence(uuid,bigint,uuid,text,boolean,numeric,text,jsonb,jsonb,text,text,jsonb) to service_role;
-- Paged history contains bounded status summaries, never raw student output or manifests.
create function public.repo_grade_general_evidence_summary(e jsonb) returns jsonb language sql immutable security invoker set search_path='' as $$
  select case when e is null then null else jsonb_build_object('coverage',e->'coverage','held',e->'held',
    'runs',(select coalesce(jsonb_agg(jsonb_build_object('language',r->'language','entryPoint',r->'entryPoint','status',r->'status',
      'compileExit',r->'compile'->'exitCode','runExit',r->'run'->'exitCode',
      'compileState',case when r->'compile'='null'::jsonb then 'not-recorded' when r->'compile'->'timedOut'='true'::jsonb then 'timed-out' when r->'compile'->'signal'<>'null'::jsonb then 'signalled' when r->'compile'->'exitCode'='null'::jsonb then 'unknown' else 'completed' end,
      'runState',case when r->'run'='null'::jsonb then 'not-recorded' when r->'run'->'timedOut'='true'::jsonb then 'timed-out' when r->'run'->'signal'<>'null'::jsonb then 'signalled' when r->'run'->'exitCode'='null'::jsonb then 'unknown' else 'completed' end)),'[]'::jsonb) from jsonb_array_elements(e->'runs') r),
    'artifacts',(select coalesce(jsonb_agg(jsonb_build_object('path',x->'path','kind',x->'kind','status',x->'status',
      'runtime',x->'runtime','executionExit',x->'execution'->'exitCode',
      'executionState',case when x->'execution' is null or x->'execution'='null'::jsonb then 'not-recorded' when x->'execution'->'timedOut'='true'::jsonb then 'timed-out' when x->'execution'->'signal'<>'null'::jsonb then 'signalled' when x->'execution'->'exitCode'='null'::jsonb then 'unknown' else 'completed' end)),'[]'::jsonb) from jsonb_array_elements(e->'artifacts') x)) || case when e->>'policy'='source-only' then '{"policy":"source-only"}'::jsonb else '{}'::jsonb end end;
$$;
revoke all on function public.repo_grade_general_evidence_summary(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.repo_grade_general_evidence_summary(jsonb) to service_role;
create or replace function public.repo_grade_history(p_user_id uuid, p_course_id uuid, p_before bigint)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.course_hub c where c.id = p_course_id and c.user_id = p_user_id) then return null; end if;
  return (select coalesce(jsonb_agg(to_jsonb(page) order by page.generation desc), '[]'::jsonb) from (
    select a.generation,a.repo,a.folder,a.source_ref,a.source_sha,a.profile_fingerprint,
      case when a.status = 'claimed' and a.claimed_at <= statement_timestamp() - interval '15 minutes' then 'unknown' else a.status end as status,
      a.claimed_at,a.settled_at,a.reconciled_at,e.score,coalesce(e.feedback,d.feedback) as feedback,coalesce(e.rubric,d.rubric) as rubric,
      coalesce(e.feedback_sections,d.feedback_sections) as feedback_sections,coalesce(scored.unexamined_artifacts,d.unexamined_artifacts) as unexamined_artifacts,
      d.review_reason,a.feedback_retention,null::jsonb as execution_receipts,public.repo_grade_evidence_summary(coalesce(scored.evidence,partial.evidence)) as module12_evidence,public.repo_grade_general_evidence_summary(general.evidence) as general_execution_evidence
    from public.repo_grade_attempts a left join public.repo_grade_evaluations e using (generation)
      left join public.repo_grade_review_drafts d using (generation) left join public.repo_grade_partial_execution_evidence partial using (generation) left join public.repo_grade_scored_observations scored using (generation) left join public.repo_grade_general_evidence general using (generation)
    where a.course_id=p_course_id and a.user_id=p_user_id and a.mode <> 'manual' and (p_before is null or a.generation < p_before)
    order by a.generation desc limit 100) page);
end;
$$;
