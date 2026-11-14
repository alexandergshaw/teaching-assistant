-- A model-generated source review is separate from a numeric evaluation.
-- The text may contain model-authored score language; it is not a grade.
create table public.repo_grade_general_source_reviews (
  generation bigint primary key references public.repo_grade_general_evidence(generation) on delete cascade,
  feedback jsonb not null check (jsonb_typeof(feedback)='object' and octet_length(feedback::text)<=200000)
);
alter table public.repo_grade_general_source_reviews enable row level security;
revoke all on public.repo_grade_general_source_reviews from public,anon,authenticated,service_role;
grant select,insert on public.repo_grade_general_source_reviews to service_role;
create function public.repo_grade_settle_general_partial_review(
  p_user_id uuid,p_generation bigint,p_token uuid,p_source_sha text,p_evidence jsonb,p_review_feedback jsonb
) returns boolean language plpgsql security invoker set search_path='' as $$
declare accepted boolean;
begin
  if jsonb_typeof(p_review_feedback) is distinct from 'object' or p_review_feedback - array['overall','rubric'] <> '{}'::jsonb
    or jsonb_typeof(p_review_feedback->'overall') is distinct from 'string' or length(p_review_feedback->>'overall')>16000
    or jsonb_typeof(p_review_feedback->'rubric') is distinct from 'array' or octet_length(p_review_feedback::text)>200000 then raise exception 'invalid source review'; end if;
  if jsonb_array_length(p_review_feedback->'rubric')>40 or exists(select 1 from jsonb_array_elements(p_review_feedback->'rubric') r
    where jsonb_typeof(r) is distinct from 'object' or r - array['area','comment'] <> '{}'::jsonb
      or jsonb_typeof(r->'area') is distinct from 'string' or length(btrim(r->>'area'))=0 or length(r->>'area')>256
      or jsonb_typeof(r->'comment') is distinct from 'string' or length(r->>'comment')>4096)
    or (length(btrim(p_review_feedback->>'overall'))=0 and not exists(select 1 from jsonb_array_elements(p_review_feedback->'rubric') r where length(btrim(r->>'comment'))>0))
  then raise exception 'invalid source review content'; end if;
  accepted:=public.repo_grade_settle_general_evidence(p_user_id,p_generation,p_token,'partial',false,null,null,null,null,null,p_source_sha,p_evidence);
  if accepted then insert into public.repo_grade_general_source_reviews(generation,feedback) values(p_generation,p_review_feedback); end if;
  return accepted;
end;
$$;
revoke all on function public.repo_grade_settle_general_partial_review(uuid,bigint,uuid,text,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.repo_grade_settle_general_partial_review(uuid,bigint,uuid,text,jsonb,jsonb) to service_role;
create or replace function public.repo_grade_history(p_user_id uuid, p_course_id uuid, p_before bigint)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.course_hub c where c.id = p_course_id and c.user_id = p_user_id) then return null; end if;
  return (select coalesce(jsonb_agg(to_jsonb(page) order by page.generation desc), '[]'::jsonb) from (
    select a.generation,a.repo,a.folder,a.source_ref,a.source_sha,a.profile_fingerprint,
      case when a.status = 'claimed' and a.claimed_at <= statement_timestamp() - interval '15 minutes' then 'unknown' else a.status end as status,
      a.claimed_at,a.settled_at,a.reconciled_at,e.score,coalesce(e.feedback,d.feedback) as feedback,coalesce(e.rubric,d.rubric) as rubric,
      coalesce(e.feedback_sections,d.feedback_sections) as feedback_sections,coalesce(scored.unexamined_artifacts,d.unexamined_artifacts) as unexamined_artifacts,
      d.review_reason,a.feedback_retention,null::jsonb as execution_receipts,public.repo_grade_evidence_summary(coalesce(scored.evidence,partial.evidence)) as module12_evidence,public.repo_grade_general_evidence_summary(general.evidence) as general_execution_evidence,source_review.feedback as general_review_feedback
    from public.repo_grade_attempts a left join public.repo_grade_evaluations e using (generation)
      left join public.repo_grade_review_drafts d using (generation) left join public.repo_grade_partial_execution_evidence partial using (generation) left join public.repo_grade_scored_observations scored using (generation) left join public.repo_grade_general_evidence general using (generation) left join public.repo_grade_general_source_reviews source_review using (generation)
    where a.course_id=p_course_id and a.user_id=p_user_id and a.mode <> 'manual' and (p_before is null or a.generation < p_before)
    order by a.generation desc limit 100) page);
end;
$$;
