-- Review-only drafts are separate from final numeric evaluations.
create table public.repo_grade_review_drafts (
  generation bigint primary key references public.repo_grade_attempts(generation) on delete cascade,
  feedback text not null check (length(feedback) <= 48000),
  feedback_sections jsonb not null,
  rubric jsonb not null check (jsonb_typeof(rubric) = 'array' and octet_length(rubric::text) <= 1100000),
  unexamined_artifacts jsonb not null check (jsonb_typeof(unexamined_artifacts) = 'array' and jsonb_array_length(unexamined_artifacts) between 1 and 40 and octet_length(unexamined_artifacts::text) <= 16384),
  review_reason text not null check (review_reason = 'execution-unverified')
);
alter table public.repo_grade_review_drafts enable row level security;
revoke all on public.repo_grade_review_drafts from public, anon, authenticated;
grant select, insert on public.repo_grade_review_drafts to service_role;

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
  if jsonb_array_length(p_unexamined_artifacts) not between 1 and 40
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
revoke all on function public.repo_grade_settle(uuid, bigint, uuid, text, boolean, numeric, text, jsonb, jsonb, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.repo_grade_settle(uuid, bigint, uuid, text, boolean, numeric, text, jsonb, jsonb, text, jsonb, text)
  to service_role;

create or replace function public.repo_grade_history(
  p_user_id uuid, p_course_id uuid, p_before bigint
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.course_hub c where c.id = p_course_id and c.user_id = p_user_id)
  then return null; end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(page) order by page.generation desc), '[]'::jsonb)
    from (
      select a.generation, a.repo, a.folder, a.source_ref, a.source_sha, a.profile_fingerprint,
        case when a.status = 'claimed' and a.claimed_at <= statement_timestamp() - interval '15 minutes'
          then 'unknown' else a.status end as status,
        a.claimed_at, a.settled_at, a.reconciled_at, e.score, coalesce(e.feedback,d.feedback) as feedback, coalesce(e.rubric,d.rubric) as rubric,
        coalesce(e.feedback_sections,d.feedback_sections) as feedback_sections, d.unexamined_artifacts, d.review_reason, a.feedback_retention
      from public.repo_grade_attempts a
      left join public.repo_grade_evaluations e using (generation)
      left join public.repo_grade_review_drafts d using (generation)
      where a.course_id = p_course_id and a.user_id = p_user_id and a.mode <> 'manual'
        and (p_before is null or a.generation < p_before)
      order by a.generation desc limit 100
    ) page
  );
end;
$$;
