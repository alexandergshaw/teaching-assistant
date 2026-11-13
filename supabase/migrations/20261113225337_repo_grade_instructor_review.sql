-- An instructor's separate decision; the provisional evidence remains intact.
create table public.repo_grade_instructor_reviews (
  review_id bigint generated always as identity primary key,
  generation bigint not null references public.repo_grade_review_drafts(generation) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_sha text not null check (source_sha ~ '^[a-f0-9]{40}$'),
  criteria jsonb not null,
  feedback text not null check (length(feedback) between 1 and 16000),
  score numeric not null check (score between 0 and 100),
  revision_scope text not null default 'historical-unverified' check (revision_scope = 'historical-unverified'),
  reviewed_at timestamptz not null default clock_timestamp()
);
alter table public.repo_grade_instructor_reviews enable row level security;
revoke all on public.repo_grade_instructor_reviews from public, anon, authenticated, service_role;
grant select, insert on public.repo_grade_instructor_reviews to service_role;
grant usage on sequence public.repo_grade_instructor_reviews_review_id_seq to service_role;
create index repo_grade_instructor_reviews_generation_idx on public.repo_grade_instructor_reviews(generation,review_id desc);

-- Advisory only: saving rechecks these predicates under the account lock.
create function public.repo_grade_instructor_review_eligible(p_user_id uuid,p_course_id uuid,p_generation bigint,p_source_sha text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.repo_grade_attempts a
    join public.repo_grade_review_drafts d on d.generation=a.generation and d.review_reason='execution-unverified'
    join public.repo_grade_rubric_receipts r on r.user_id=a.user_id and r.course_id=a.course_id and r.folder=a.folder and r.cohort_id=a.cohort_id
    where a.user_id=p_user_id and a.course_id=p_course_id and a.generation=p_generation and a.source_sha=p_source_sha
      and a.status='partial' and a.mode<>'manual' and a.folder='assignments/module_12'
      and lower(split_part(a.repo,'/',1))='intro-to-computer-science-fall-2026'
      and not exists (select 1 from public.repo_grade_attempts n where n.user_id=a.user_id and n.course_id=a.course_id
        and lower(n.repo)=lower(a.repo) and n.folder=a.folder and n.mode<>'manual' and n.generation>a.generation)
      and jsonb_typeof(d.rubric)='array' and jsonb_array_length(d.rubric)=4
      and ((encode(sha256(convert_to(r.receipt->>'rubric','UTF8')),'hex')='5d6383288a2eb5698251e17261879c39a5f43a9f0b01a0bf0e8496c7a0095717'
        and (select array_agg(x->>'area' order by ord) from jsonb_array_elements(d.rubric) with ordinality z(x,ord)) = array['Function Implementation','Test Coverage Quantity','Test Case Quality','Code Organization and Testing Practice'])
      or (encode(sha256(convert_to(r.receipt->>'rubric','UTF8')),'hex')='fc065dfc81f80f127d60f8fdfa47d84f0e1c18afdcfff095f78c8904fb74285f'
        and (select array_agg(x->>'area' order by ord) from jsonb_array_elements(d.rubric) with ordinality z(x,ord)) = array['Function Implementation','Test Suite Completeness','Test Coverage (Normal/Edge/Invalid)','Code Structure and Style']))
  );
$$;
revoke all on function public.repo_grade_instructor_review_eligible(uuid,uuid,bigint,text) from public, anon, authenticated, service_role;
grant execute on function public.repo_grade_instructor_review_eligible(uuid,uuid,bigint,text) to service_role;

create function public.repo_grade_save_instructor_review(
  p_user_id uuid, p_course_id uuid, p_generation bigint, p_source_sha text, p_criteria jsonb, p_feedback text, p_expected_review_id bigint
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare draft public.repo_grade_review_drafts%rowtype; a public.repo_grade_attempts%rowtype; total numeric; rubric_hash text; latest_id bigint;
begin
  if p_user_id is null or p_course_id is null or p_generation is null or p_source_sha is null
    or p_source_sha !~ '^[a-f0-9]{40}$' or p_feedback is null or length(btrim(p_feedback)) = 0
    or length(p_feedback) > 16000 or jsonb_typeof(p_criteria) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_criteria) <> 4 or octet_length(p_criteria::text) > 40000 then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  if not public.repo_grade_instructor_review_eligible(p_user_id,p_course_id,p_generation,p_source_sha) then return false; end if;
  select * into a from public.repo_grade_attempts where generation = p_generation and user_id = p_user_id
    and course_id = p_course_id and source_sha = p_source_sha and status = 'partial' and mode <> 'manual' for update;
  if not found or a.folder <> 'assignments/module_12' or lower(split_part(a.repo,'/',1)) <> 'intro-to-computer-science-fall-2026'
    or exists (select 1 from public.repo_grade_attempts newer where newer.user_id = p_user_id and newer.course_id = p_course_id
      and lower(newer.repo) = lower(a.repo) and newer.folder = a.folder and newer.mode <> 'manual' and newer.generation > a.generation)
  then return false; end if;
  select * into draft from public.repo_grade_review_drafts where generation = p_generation and review_reason = 'execution-unverified';
  if not found or jsonb_typeof(draft.rubric) is distinct from 'array' then return false; end if;
  select encode(sha256(convert_to(receipt->>'rubric','UTF8')),'hex') into rubric_hash
    from public.repo_grade_rubric_receipts where user_id=p_user_id and course_id=p_course_id
      and folder=a.folder and cohort_id=a.cohort_id;
  if rubric_hash is null or rubric_hash not in ('5d6383288a2eb5698251e17261879c39a5f43a9f0b01a0bf0e8496c7a0095717','fc065dfc81f80f127d60f8fdfa47d84f0e1c18afdcfff095f78c8904fb74285f') then return false; end if;
  if jsonb_array_length(draft.rubric) <> 4 or (select array_agg(item->>'area' order by ord)
    from jsonb_array_elements(draft.rubric) with ordinality r(item,ord)) not in (
      array['Function Implementation','Test Coverage Quantity','Test Case Quality','Code Organization and Testing Practice'],
      array['Function Implementation','Test Suite Completeness','Test Coverage (Normal/Edge/Invalid)','Code Structure and Style']
    ) or (rubric_hash = '5d6383288a2eb5698251e17261879c39a5f43a9f0b01a0bf0e8496c7a0095717'
      and draft.rubric->1->>'area' is distinct from 'Test Coverage Quantity')
    or (rubric_hash = 'fc065dfc81f80f127d60f8fdfa47d84f0e1c18afdcfff095f78c8904fb74285f'
      and draft.rubric->1->>'area' is distinct from 'Test Suite Completeness') or exists (
    select 1 from generate_series(0,3) i where
      jsonb_typeof(p_criteria->i) is distinct from 'object'
      or (p_criteria->i) - array['area','score','note'] <> '{}'::jsonb
      or jsonb_typeof(p_criteria->i->'area') is distinct from 'string'
      or p_criteria->i->>'area' is distinct from draft.rubric->i->>'area'
      or jsonb_typeof(p_criteria->i->'score') is distinct from 'number'
      or jsonb_typeof(p_criteria->i->'note') is distinct from 'string'
      or length(btrim(p_criteria->i->>'note')) = 0 or length(p_criteria->i->>'note') > 4000
  ) then return false; end if;
  if exists (select 1 from jsonb_array_elements(p_criteria) c
    where (c->>'score')::numeric < 0 or (c->>'score')::numeric > 25
      or (c->>'score')::numeric <> round((c->>'score')::numeric, 2)) then return false; end if;
  select sum((c->>'score')::numeric) into total from jsonb_array_elements(p_criteria) c;
  select review_id into latest_id from public.repo_grade_instructor_reviews where generation=p_generation order by review_id desc limit 1;
  if latest_id is distinct from p_expected_review_id then return false; end if;
  insert into public.repo_grade_instructor_reviews(generation,user_id,source_sha,criteria,feedback,score)
    values (p_generation,p_user_id,p_source_sha,p_criteria,p_feedback,total);
  return true;
end;
$$;
revoke all on function public.repo_grade_save_instructor_review(uuid,uuid,bigint,text,jsonb,text,bigint) from public, anon, authenticated, service_role;
grant execute on function public.repo_grade_save_instructor_review(uuid,uuid,bigint,text,jsonb,text,bigint) to service_role;

create function public.repo_grade_read_instructor_review(p_user_id uuid,p_course_id uuid,p_generation bigint)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select to_jsonb(r) from public.repo_grade_instructor_reviews r
  join public.repo_grade_attempts a on a.generation = r.generation and a.user_id = r.user_id
  where r.user_id = p_user_id and a.course_id = p_course_id and r.generation = p_generation order by r.review_id desc limit 1;
$$;
revoke all on function public.repo_grade_read_instructor_review(uuid,uuid,bigint) from public, anon, authenticated, service_role;
grant execute on function public.repo_grade_read_instructor_review(uuid,uuid,bigint) to service_role;
