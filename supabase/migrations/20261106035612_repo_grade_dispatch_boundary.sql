-- Null identifies claims issued by older servers. They have no durable proof
-- of whether execution started, so they retain their existing recovery rules.
alter table public.repo_grade_attempts add column dispatch_state text
  check (dispatch_state in ('prepared', 'started'));
grant update (dispatch_state) on public.repo_grade_attempts to service_role;

create function public.repo_grade_claim_tracked(
  p_user_id uuid, p_course_id uuid, p_repo text, p_folder text, p_mode text,
  p_source_ref text, p_source_sha text, p_course_config jsonb,
  p_cohort_id uuid, p_receipt jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  response jsonb;
begin
  if p_user_id is null then raise exception 'invalid repo grade claim'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  if p_course_id is not null then
    perform 1 from public.course_hub c where c.id = p_course_id and c.user_id = p_user_id for share;
    if not found then return jsonb_build_object('status', 'forbidden'); end if;
  end if;

  -- Only this claim protocol can produce prepared rows. Once the deadline
  -- passes, begin_dispatch also refuses them under the same lock.
  with expired as (
    update public.repo_grade_attempts a
      set status = 'failed', settled_at = clock_timestamp()
      where a.user_id = p_user_id and a.dispatch_state = 'prepared'
        and a.status in ('claimed', 'unknown') and a.reconciled_at is null
        and a.claimed_at <= clock_timestamp() - interval '15 minutes'
      returning a.generation
  )
  delete from public.repo_grade_reservations r using expired e
    where r.user_id = p_user_id and r.generation = e.generation;

  response := public.repo_grade_claim(
    p_user_id, p_course_id, p_repo, p_folder, p_mode, p_source_ref,
    p_source_sha, p_course_config, p_cohort_id, p_receipt
  );
  if response ->> 'status' = 'claimed' then
    update public.repo_grade_attempts set dispatch_state = 'prepared'
      where user_id = p_user_id and generation = (response ->> 'generation')::bigint;
  end if;
  return response;
end;
$$;

create function public.repo_grade_begin_dispatch(
  p_user_id uuid, p_generation bigint, p_token uuid
) returns integer language plpgsql security invoker set search_path = '' as $$
declare
  attempt public.repo_grade_attempts;
  remaining_ms integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  select a.* into attempt from public.repo_grade_attempts a
    join public.repo_grade_reservations r using (generation, user_id)
    where a.user_id = p_user_id and a.generation = p_generation and a.claim_token = p_token
      and a.status = 'claimed' and a.dispatch_state = 'prepared';
  if not found then return null; end if;
  if attempt.course_id is not null then
    perform 1 from public.course_hub c where c.id = attempt.course_id and c.user_id = p_user_id for share;
    if not found then return null; end if;
  end if;
  remaining_ms := floor(extract(epoch from (attempt.claimed_at + interval '15 minutes' - clock_timestamp())) * 1000);
  if remaining_ms <= 0 then return null; end if;

  update public.repo_grade_attempts set dispatch_state = 'started'
    where user_id = p_user_id and generation = p_generation;
  return remaining_ms;
end;
$$;

revoke all on function public.repo_grade_claim_tracked(uuid, uuid, text, text, text, text, text, jsonb, uuid, jsonb),
  public.repo_grade_begin_dispatch(uuid, bigint, uuid) from public, anon, authenticated;
grant execute on function public.repo_grade_claim_tracked(uuid, uuid, text, text, text, text, text, jsonb, uuid, jsonb),
  public.repo_grade_begin_dispatch(uuid, bigint, uuid) to service_role;
