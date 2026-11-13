-- Explicit owner-directed retry. The original uncertain outcome stays unknown.
create table public.repo_grade_unknown_retry_permits (
  generation bigint primary key references public.repo_grade_attempts(generation) on delete cascade,
  user_id uuid not null,
  authorized_at timestamptz not null default clock_timestamp(),
  consumed_by bigint,
  authorization_basis text not null default 'owner-requested-retry',
  prior_outcome text not null default 'unknown',
  check (generation = 1724),
  consumed_at timestamptz,
  check ((consumed_by is null) = (consumed_at is null))
);
alter table public.repo_grade_unknown_retry_permits enable row level security;
revoke all on public.repo_grade_unknown_retry_permits from public, anon, authenticated, service_role;
grant select, insert on public.repo_grade_unknown_retry_permits to service_role;
grant update (consumed_by, consumed_at) on public.repo_grade_unknown_retry_permits to service_role;

create function public.repo_grade_authorize_unknown_retry(p_user_id uuid, p_generation bigint)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare a public.repo_grade_attempts%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  select * into a from public.repo_grade_attempts where user_id = p_user_id and generation = p_generation for update;
  if p_generation <> 1724 or p_user_id <> 'e06800ce-3ea4-46da-999a-2424cdf982c0'::uuid or not found
    or a.course_id is distinct from 'ae8a6c95-4cc2-4fe7-b5ef-c0d10018d353'::uuid
    or a.repo is distinct from 'intro-to-computer-science-fall-2026/info-2350-william-jacobs'
    or a.folder is distinct from 'assignments/module_12' or a.source_ref is distinct from 'main'
    or a.source_sha is distinct from '30b24770a277a80d5f5b55fcdec4b3c11050ba4f'
    or a.status <> 'unknown' or a.reconciled_at is null or a.mode = 'manual'
    or exists (select 1 from public.repo_grade_reservations r where r.user_id = p_user_id and r.generation = p_generation)
    or exists (select 1 from public.repo_grade_attempts newer where newer.user_id = p_user_id and newer.course_id = a.course_id
      and lower(newer.repo) = lower(a.repo) and newer.folder = a.folder
      and newer.mode <> 'manual' and newer.generation > a.generation)
    then return false; end if;
  insert into public.repo_grade_unknown_retry_permits(generation,user_id) values(p_generation,p_user_id)
    on conflict do nothing;
  return found;
end;
$$;
revoke all on function public.repo_grade_authorize_unknown_retry(uuid,bigint) from public, anon, authenticated, service_role;
grant execute on function public.repo_grade_authorize_unknown_retry(uuid,bigint) to service_role;
create or replace function public.repo_grade_claim_targeted_regrade(
  p_user_id uuid, p_run_id uuid, p_lease uuid, p_course_id uuid, p_repo text, p_folder text,
  p_source_ref text, p_source_sha text, p_course_config jsonb, p_cohort_id uuid,
  p_receipt jsonb, p_preparation_key text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  target public.repo_grade_automatic_targets%rowtype;
  response jsonb;
  linked_status text;
  override_generation bigint;
begin
  -- The existing worker claims the run before taking the ledger lock.
  perform 1 from public.repo_grade_automatic_runs r
    where r.id = p_run_id and r.user_id = p_user_id and r.lease = p_lease
      and r.lease_until > clock_timestamp() and r.phase = 'grading'
      and not r.targeted_paused for update;
  if not found then return jsonb_build_object('status', 'forbidden'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  if not exists (select 1 from public.repo_grade_target_requests q
    where q.run_id = p_run_id and q.user_id = p_user_id and q.course_id = p_course_id
      and q.state = 'running') then return jsonb_build_object('status', 'forbidden'); end if;
  select t.* into target from public.repo_grade_automatic_targets t
    where t.run_id = p_run_id and t.course_id = p_course_id and t.state = 'running'
      and t.repo = p_repo and t.folder = p_folder and t.source_ref = p_source_ref
      and t.source_sha = p_source_sha for update;
  if not found then return jsonb_build_object('status', 'forbidden'); end if;
  if target.regrade_generation is not null then
    -- Never dispatch a linked generation again. Report its actual durable
    -- outcome; a live or missing receipt is uncertain, not successful.
    select a.status into linked_status from public.repo_grade_attempts a
      where a.generation = target.regrade_generation and a.user_id = p_user_id
        and a.course_id = p_course_id and a.repo = p_repo and a.folder = p_folder
        and a.source_ref = p_source_ref and a.source_sha = p_source_sha and a.mode = 'retry';
    return jsonb_build_object('status', 'recovered-' || case
      when linked_status in ('succeeded', 'no-submission', 'failed', 'partial') then linked_status
      else 'unknown' end);
  end if;
  select p.generation into override_generation from public.repo_grade_unknown_retry_permits p
    join public.repo_grade_attempts a on a.generation = p.generation and a.user_id = p.user_id
    where p.user_id = p_user_id and p.consumed_by is null and a.status = 'unknown'
      and a.reconciled_at is not null and a.course_id = p_course_id
      and lower(a.repo) = lower(p_repo) and a.folder = p_folder
      and a.source_ref = p_source_ref and a.source_sha = p_source_sha
      and not exists (select 1 from public.repo_grade_attempts newer where newer.user_id = p_user_id
        and newer.course_id = p_course_id and lower(newer.repo) = lower(p_repo) and newer.folder = p_folder
        and newer.mode <> 'manual' and newer.generation > a.generation)
    for update of p;
  if exists (select 1 from public.repo_grade_attempts a
    where a.user_id = p_user_id and a.course_id = p_course_id
      and lower(a.repo) = lower(p_repo) and a.folder = p_folder
      and a.source_sha = p_source_sha and a.mode <> 'manual'
      and a.status in ('claimed', 'unknown')
      and (a.status <> 'unknown' or a.generation is distinct from override_generation))
    then return jsonb_build_object('status', 'explicit-retry-required'); end if;
  if override_generation is null and exists (select 1 from public.repo_grade_attempts a
    where a.user_id = p_user_id and a.course_id = p_course_id
      and lower(a.repo) = lower(p_repo) and a.folder = p_folder
      and a.source_sha = p_source_sha and a.mode <> 'manual' and a.status = 'unknown')
    then return jsonb_build_object('status', 'explicit-retry-required'); end if;
  if p_preparation_key is null then
    response := public.repo_grade_claim_tracked(p_user_id, p_course_id, p_repo, p_folder,
      'retry', p_source_ref, p_source_sha, p_course_config, p_cohort_id, p_receipt);
  else
    response := public.repo_grade_claim_with_preparation(p_user_id, p_course_id, p_repo, p_folder,
      'retry', p_source_ref, p_source_sha, p_course_config, p_cohort_id, p_receipt, p_preparation_key);
  end if;
  if response ->> 'status' = 'claimed' then
    if override_generation is not null then
      update public.repo_grade_unknown_retry_permits set consumed_by = (response ->> 'generation')::bigint, consumed_at = clock_timestamp()
        where generation = override_generation and user_id = p_user_id and consumed_by is null;
      if not found then raise exception 'unknown retry permit unavailable'; end if;
    end if;
    update public.repo_grade_automatic_targets set regrade_generation = (response ->> 'generation')::bigint
      where id = target.id and regrade_generation is null;
    if not found then raise exception 'repository regrade link unavailable'; end if;
  end if;
  return response;
end;
$$;
