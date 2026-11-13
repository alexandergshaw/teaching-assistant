-- Metadata records files deliberately left unexamined. NULL means no exception.
alter table public.repo_grade_evaluations add column unexamined_artifacts jsonb
  check (unexamined_artifacts is null or case when jsonb_typeof(unexamined_artifacts) = 'array' then
    jsonb_array_length(unexamined_artifacts) between 1 and 40
    and octet_length(unexamined_artifacts::text) <= 16384
  else false end);
grant update (unexamined_artifacts) on public.repo_grade_evaluations to service_role;

create function public.repo_grade_settle(
  p_user_id uuid, p_generation bigint, p_token uuid, p_outcome text,
  p_inputs_complete boolean, p_score numeric, p_feedback text, p_rubric jsonb,
  p_feedback_sections jsonb, p_feedback_retention text, p_unexamined_artifacts jsonb
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare accepted boolean;
begin
  if p_unexamined_artifacts is not null then
    if jsonb_typeof(p_unexamined_artifacts) is distinct from 'array' then raise exception 'invalid unexamined artifact provenance'; end if;
    if p_score is null or p_outcome <> 'succeeded'
      or jsonb_array_length(p_unexamined_artifacts) not between 1 and 40
      or octet_length(p_unexamined_artifacts::text) > 16384
      or exists (select 1 from pg_catalog.jsonb_array_elements(p_unexamined_artifacts) item
        where jsonb_typeof(item) is distinct from 'object'
          or case when jsonb_typeof(item) = 'object' then item - array['path','reason'] <> '{}'::jsonb else true end
          or jsonb_typeof(item->'path') is distinct from 'string'
          or length(item->>'path') not between 1 and 4096
          or item->>'path' ~ '[[:cntrl:]\\]'
          or item->>'path' ~ '(^|/)(\.{1,2}|)(/|$)'
          or item->>'reason' is distinct from 'optional-binary-unexamined')
    then raise exception 'invalid unexamined artifact provenance'; end if;
  end if;
  accepted := public.repo_grade_settle(p_user_id, p_generation, p_token, p_outcome,
    p_inputs_complete, p_score, p_feedback, p_rubric, p_feedback_sections, p_feedback_retention);
  if accepted and p_unexamined_artifacts is not null then
    update public.repo_grade_evaluations set unexamined_artifacts = p_unexamined_artifacts
      where generation = p_generation;
    if not found then raise exception 'missing repository evaluation'; end if;
  end if;
  return accepted;
end;
$$;
revoke all on function public.repo_grade_settle(uuid, bigint, uuid, text, boolean, numeric, text, jsonb, jsonb, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.repo_grade_settle(uuid, bigint, uuid, text, boolean, numeric, text, jsonb, jsonb, text, jsonb)
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
        a.claimed_at, a.settled_at, a.reconciled_at, e.score, e.feedback, e.rubric,
        e.feedback_sections, e.unexamined_artifacts, a.feedback_retention
      from public.repo_grade_attempts a
      left join public.repo_grade_evaluations e using (generation)
      where a.course_id = p_course_id and a.user_id = p_user_id and a.mode <> 'manual'
        and (p_before is null or a.generation < p_before)
      order by a.generation desc limit 100
    ) page
  );
end;
$$;


