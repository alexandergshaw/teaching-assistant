-- A capability is spent only after the claim is linked in the same transaction.
create table public.repo_grade_capability_recoveries (
  user_id uuid not null,
  course_id uuid not null,
  repo text not null,
  folder text not null,
  source_sha text not null,
  capability text not null,
  -- The existing atomic rate-limit rollback deletes only a still-prepared
  -- claim. Cascading its marker permits that never-dispatched retry to resume.
  generation bigint not null references public.repo_grade_attempts(generation) on delete cascade,
  primary key (user_id, course_id, repo, folder, source_sha, capability)
);
alter table public.repo_grade_capability_recoveries enable row level security;
revoke all on public.repo_grade_capability_recoveries from public, anon, authenticated;
grant select, insert on public.repo_grade_capability_recoveries to service_role;

-- The history probe is only a scheduling hint. The claim below repeats every
-- guard under the account lock. A scalar response avoids Data API row caps.
create function public.repo_grade_text_recovery_candidates(p_user_id uuid, p_course_id uuid, p_shas text[])
returns jsonb language sql security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('repo', x.repo, 'folder', x.folder, 'sha', x.source_sha)), '[]'::jsonb)
  from (
    select distinct lower(t.repo) as repo, t.folder, t.source_sha
    from public.repo_grade_automatic_targets t
    join public.repo_grade_automatic_runs r on r.id = t.run_id and r.user_id = p_user_id
    join public.repo_grade_attempts a on a.generation = t.regrade_generation
      and a.user_id = p_user_id and a.course_id = p_course_id
      and lower(a.repo) = lower(t.repo) and a.folder = t.folder and a.source_sha = t.source_sha
      and a.mode = 'retry' and a.status = 'partial' and a.dispatch_state = 'prepared'
    where t.course_id = p_course_id and t.source_sha = any(p_shas)
      and t.state = 'partial' and t.reason = 'unsupported-submission'
      and not exists (select 1 from public.repo_grade_capability_recoveries c
        where c.user_id = p_user_id and c.course_id = p_course_id and c.repo = lower(t.repo)
          and c.folder = t.folder and c.source_sha = t.source_sha and c.capability = 'text-extension-v1')
    limit 1001
  ) x;
$$;
revoke all on function public.repo_grade_text_recovery_candidates(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.repo_grade_text_recovery_candidates(uuid, uuid, text[]) to service_role;

create function public.repo_grade_claim_text_recovery(
  p_user_id uuid, p_run_id uuid, p_lease uuid, p_course_id uuid, p_repo text, p_folder text,
  p_source_ref text, p_source_sha text, p_course_config jsonb, p_cohort_id uuid,
  p_receipt jsonb, p_preparation_key text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  target public.repo_grade_automatic_targets%rowtype;
  response jsonb;
  linked_status text;
  snapshot jsonb;
begin
  perform 1 from public.repo_grade_automatic_runs r
    where r.id = p_run_id and r.user_id = p_user_id and r.lease = p_lease
      and r.lease_until > clock_timestamp() and r.phase = 'grading'
      and not r.targeted_paused for update;
  if not found then return jsonb_build_object('status', 'forbidden'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  if exists (select 1 from public.repo_grade_target_requests q where q.run_id = p_run_id and q.user_id = p_user_id) then
    return jsonb_build_object('status', 'forbidden');
  end if;
  select t.* into target from public.repo_grade_automatic_targets t
    where t.run_id = p_run_id and t.course_id = p_course_id and t.state = 'running'
      and t.repo = p_repo and t.folder = p_folder and t.source_ref = p_source_ref
      and t.source_sha = p_source_sha for update;
  if not found then return jsonb_build_object('status', 'forbidden'); end if;
  select c.pinned_inventory into snapshot from public.repo_grade_automatic_courses c
    join public.course_hub h on h.id = c.course_id and h.user_id = p_user_id
    where c.run_id = p_run_id and c.course_id = p_course_id;
  if jsonb_typeof(snapshot -> 'discovery' -> 'repos') is distinct from 'array' or not exists (
    select 1 from jsonb_array_elements(snapshot -> 'discovery' -> 'repos') row
    where row ->> 'status' = 'ready' and row ->> 'repo' = p_repo
      and row ->> 'sourceRef' = p_source_ref and row ->> 'sourceCommit' = p_source_sha
      and jsonb_typeof(row -> 'textRecoveryFolders') = 'array'
      and row -> 'textRecoveryFolders' ? p_folder
  ) then return jsonb_build_object('status', 'forbidden'); end if;
  if target.regrade_generation is not null then
    select a.status into linked_status from public.repo_grade_attempts a
      where a.generation = target.regrade_generation and a.user_id = p_user_id
        and a.course_id = p_course_id and a.repo = p_repo and a.folder = p_folder
        and a.source_ref = p_source_ref and a.source_sha = p_source_sha and a.mode = 'retry';
    return jsonb_build_object('status', 'recovered-' || case
      when linked_status in ('succeeded', 'no-submission', 'failed', 'partial') then linked_status
      else 'unknown' end);
  end if;
  if exists (select 1 from public.repo_grade_capability_recoveries c
      where c.user_id = p_user_id and c.course_id = p_course_id and c.repo = lower(p_repo)
        and c.folder = p_folder and c.source_sha = p_source_sha and c.capability = 'text-extension-v1')
    or not exists (select 1 from public.repo_grade_automatic_targets old
      join public.repo_grade_automatic_runs r on r.id = old.run_id and r.user_id = p_user_id
      join public.repo_grade_attempts a on a.generation = old.regrade_generation
        and a.user_id = p_user_id and a.course_id = p_course_id
        and lower(a.repo) = lower(p_repo) and a.folder = p_folder and a.source_sha = p_source_sha
        and a.mode = 'retry' and a.status = 'partial' and a.dispatch_state = 'prepared'
      where old.course_id = p_course_id and lower(old.repo) = lower(p_repo)
        and old.folder = p_folder and old.source_sha = p_source_sha
        and old.state = 'partial' and old.reason = 'unsupported-submission')
    or exists (select 1 from public.repo_grade_attempts a
      where a.user_id = p_user_id and a.course_id = p_course_id
        and lower(a.repo) = lower(p_repo) and a.folder = p_folder and a.source_sha = p_source_sha
        and a.mode <> 'manual' and (a.status <> 'partial' or a.dispatch_state is distinct from 'prepared'))
    or exists (select 1 from public.repo_grade_attempts a
      where a.user_id = p_user_id and lower(a.repo) = lower(p_repo) and a.mode = 'manual'
        and a.status in ('claimed', 'unknown')) then
    return jsonb_build_object('status', 'explicit-retry-required');
  end if;
  if p_preparation_key is null then
    response := public.repo_grade_claim_tracked(p_user_id, p_course_id, p_repo, p_folder,
      'retry', p_source_ref, p_source_sha, p_course_config, p_cohort_id, p_receipt);
  else
    response := public.repo_grade_claim_with_preparation(p_user_id, p_course_id, p_repo, p_folder,
      'retry', p_source_ref, p_source_sha, p_course_config, p_cohort_id, p_receipt, p_preparation_key);
  end if;
  if response ->> 'status' = 'claimed' then
    update public.repo_grade_automatic_targets set regrade_generation = (response ->> 'generation')::bigint
      where id = target.id and regrade_generation is null;
    if not found then raise exception 'repository recovery link unavailable'; end if;
    insert into public.repo_grade_capability_recoveries(user_id, course_id, repo, folder, source_sha, capability, generation)
      values (p_user_id, p_course_id, lower(p_repo), p_folder, p_source_sha, 'text-extension-v1', (response ->> 'generation')::bigint);
  end if;
  return response;
end;
$$;
revoke all on function public.repo_grade_claim_text_recovery(uuid, uuid, uuid, uuid, text, text, text, text, jsonb, uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.repo_grade_claim_text_recovery(uuid, uuid, uuid, uuid, text, text, text, text, jsonb, uuid, jsonb, text) to service_role;
