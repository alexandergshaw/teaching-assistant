-- Existing evidence has no exact source sections. Keep its section payload null.
alter table public.repo_grade_evaluations
  drop constraint repo_grade_evaluations_feedback_check,
  drop constraint repo_grade_evaluations_rubric_check,
  add constraint repo_grade_evaluations_feedback_check check (length(feedback) <= 48000),
  add constraint repo_grade_evaluations_rubric_check check (
    jsonb_typeof(rubric) = 'array' and octet_length(rubric::text) <= 1100000
  ),
  add column feedback_sections jsonb check (
    feedback_sections is null or case when jsonb_typeof(feedback_sections) = 'object' then
      feedback_sections - array['strengths', 'improvements', 'resubmitNotice', 'rawScore'] = '{}'::jsonb
      and jsonb_typeof(feedback_sections->'strengths') is not distinct from 'string'
      and jsonb_typeof(feedback_sections->'improvements') is not distinct from 'string'
      and jsonb_typeof(feedback_sections->'resubmitNotice') is not distinct from 'string'
      and jsonb_typeof(feedback_sections->'rawScore') is not distinct from 'string'
      and length(feedback_sections->>'strengths') <= 16000
      and length(feedback_sections->>'improvements') <= 16000
      and length(feedback_sections->>'resubmitNotice') <= 16000
      and length(feedback_sections->>'rawScore') <= 128
    else false end
  );

alter table public.repo_grade_attempts add column feedback_retention text check (
  feedback_retention is null or (
    mode <> 'manual' and status = 'partial'
    and feedback_retention in ('overall', 'strengths', 'improvements', 'resubmitNotice', 'rawScore', 'rubric')
  )
);
grant update (feedback_retention) on public.repo_grade_attempts to service_role;

create function public.repo_grade_settle(
  p_user_id uuid, p_generation bigint, p_token uuid, p_outcome text,
  p_inputs_complete boolean, p_score numeric, p_feedback text, p_rubric jsonb,
  p_feedback_sections jsonb, p_feedback_retention text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  attempt public.repo_grade_attempts;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  select * into attempt from public.repo_grade_attempts a
    where a.user_id = p_user_id and a.generation = p_generation and a.claim_token = p_token and a.status = 'claimed';
  if not found then return false; end if;
  if attempt.course_id is not null then
    perform 1 from public.course_hub c where c.id = attempt.course_id and c.user_id = p_user_id for share;
    if not found then return false; end if;
  end if;
  if attempt.claimed_at <= clock_timestamp() - interval '15 minutes' then
    update public.repo_grade_attempts set status = 'unknown', settled_at = clock_timestamp()
      where generation = p_generation;
    return false;
  end if;

  if p_outcome is null or p_outcome not in ('succeeded', 'no-submission', 'partial', 'failed', 'unknown')
    or (attempt.mode = 'manual' and p_outcome not in ('succeeded', 'failed', 'unknown'))
    or (attempt.mode <> 'manual' and p_outcome in ('succeeded', 'no-submission') and p_inputs_complete is not true)
    or (p_score is null and (p_feedback is not null or p_rubric is not null or p_feedback_sections is not null))
    or (p_score is not null and (p_outcome <> 'succeeded' or p_feedback_sections is null))
    or (p_feedback_retention is not null and (p_outcome <> 'partial' or attempt.mode = 'manual'))
    or (attempt.mode = 'manual' and p_score is not null)
    or (attempt.mode <> 'manual' and p_outcome = 'succeeded' and p_score is null)
  then raise exception 'invalid repo grade settlement'; end if;

  if p_score is not null then
    if jsonb_typeof(p_rubric) is distinct from 'array' then
      raise exception 'invalid repo grade rubric';
    end if;
    if jsonb_array_length(p_rubric) > 40 then raise exception 'invalid repo grade rubric'; end if;
    if exists (
      select 1 from pg_catalog.jsonb_array_elements(p_rubric) as entries(item)
      where jsonb_typeof(item) is distinct from 'object'
        or case when jsonb_typeof(item) = 'object'
          then item - array['area', 'score', 'comment'] <> '{}'::jsonb
          else true end
        or jsonb_typeof(item->'area') is distinct from 'string'
        or jsonb_typeof(item->'score') is distinct from 'string'
        or jsonb_typeof(item->'comment') is distinct from 'string'
        or length(item->>'area') > 256
        or length(item->>'score') > 128
        or length(item->>'comment') > 4096
    ) then raise exception 'invalid repo grade rubric'; end if;
    insert into public.repo_grade_evaluations (generation, score, feedback, rubric, feedback_sections)
      values (p_generation, p_score, p_feedback, p_rubric, p_feedback_sections);
  end if;
  update public.repo_grade_attempts set status = p_outcome, settled_at = clock_timestamp(),
    feedback_retention = p_feedback_retention
    where generation = p_generation;
  if p_outcome <> 'unknown' then
    delete from public.repo_grade_reservations where user_id = p_user_id and generation = p_generation;
  end if;
  return true;
end;
$$;

-- Call only after the server operator has established the old execution ended.
-- The uncertain outcome stays in history. Releasing capacity permits an explicit retry.

-- Preserve the existing manual client signature. Exact evaluation evidence
-- requires the structured signature, including during a mixed-version rollout.
create or replace function public.repo_grade_settle(
  p_user_id uuid, p_generation bigint, p_token uuid, p_outcome text,
  p_inputs_complete boolean, p_score numeric, p_feedback text, p_rubric jsonb
) returns boolean language sql security invoker set search_path = '' as $$
  select public.repo_grade_settle(
    p_user_id, p_generation, p_token, p_outcome, p_inputs_complete,
    p_score, p_feedback, p_rubric, null::jsonb, null::text
  );
$$;

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
        e.feedback_sections, a.feedback_retention
      from public.repo_grade_attempts a
      left join public.repo_grade_evaluations e using (generation)
      where a.course_id = p_course_id and a.user_id = p_user_id and a.mode <> 'manual'
        and (p_before is null or a.generation < p_before)
      order by a.generation desc limit 100
    ) page
  );
end;
$$;

revoke all on function public.repo_grade_settle(uuid, bigint, uuid, text, boolean, numeric, text, jsonb, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.repo_grade_settle(uuid, bigint, uuid, text, boolean, numeric, text, jsonb, jsonb, text)
  to service_role;
