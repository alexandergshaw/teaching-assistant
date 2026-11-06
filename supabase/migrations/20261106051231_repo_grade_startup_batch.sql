-- Startup stores only pinned selectors and receipt references. The grading
-- ledger remains the authority for dispatch, capacity, and settlement.
create table public.repo_grade_startup_batches (
  user_id uuid not null references auth.users (id) on delete cascade,
  id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  sealed_at timestamptz,
  expires_at timestamptz,
  closed_at timestamptz,
  primary key (user_id, id)
);

create index repo_grade_startup_latest_idx
  on public.repo_grade_startup_batches (user_id, sealed_at desc) where sealed_at is not null;

create table public.repo_grade_startup_targets (
  user_id uuid not null,
  batch_id uuid not null,
  course_id uuid not null,
  repo text not null check (repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' and length(repo) <= 200),
  folder text not null check (length(folder) <= 512),
  source_ref text not null check (length(source_ref) between 1 and 255),
  source_sha text not null check (source_sha ~ '^[0-9a-f]{40}$'),
  started_at timestamptz,
  unlinked_status text check (unlinked_status in ('not-started', 'unknown', 'failed', 'already-processed')),
  attempt_generation bigint unique references public.repo_grade_attempts (generation) on delete cascade,
  foreign key (user_id, batch_id) references public.repo_grade_startup_batches (user_id, id) on delete cascade,
  foreign key (course_id, user_id) references public.course_hub (id, user_id) on delete cascade
);

create index repo_grade_startup_capture_idx
  on public.repo_grade_startup_targets (user_id, course_id, lower(repo), source_sha);
create index repo_grade_startup_target_batch_idx
  on public.repo_grade_startup_targets (user_id, batch_id, course_id);

alter table public.repo_grade_startup_batches enable row level security;
alter table public.repo_grade_startup_targets enable row level security;
revoke all on public.repo_grade_startup_batches, public.repo_grade_startup_targets
  from public, anon, authenticated, service_role;
grant select, insert, delete on public.repo_grade_startup_batches, public.repo_grade_startup_targets to service_role;
grant update (sealed_at, expires_at, closed_at) on public.repo_grade_startup_batches to service_role;
grant update (started_at, unlinked_status, attempt_generation) on public.repo_grade_startup_targets to service_role;

create function public.repo_grade_stage_startup(
  p_user_id uuid, p_batch_id uuid, p_course_id uuid, p_targets jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  skipped jsonb;
  now_at timestamptz;
begin
  if jsonb_typeof(p_targets) is distinct from 'array' or jsonb_array_length(p_targets) > 1000 then
    raise exception 'invalid startup plan';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  now_at := clock_timestamp();
  perform 1 from public.course_hub where id = p_course_id and user_id = p_user_id for key share;
  if not found then raise exception 'startup course unavailable'; end if;

  delete from public.repo_grade_startup_batches
    where user_id = p_user_id and sealed_at is null and created_at < clock_timestamp() - interval '1 hour';
  insert into public.repo_grade_startup_batches (user_id, id) values (p_user_id, p_batch_id)
    on conflict do nothing;
  if exists (select 1 from public.repo_grade_startup_batches
    where user_id = p_user_id and id = p_batch_id and sealed_at is not null)
  then raise exception 'startup batch already sealed'; end if;

  delete from public.repo_grade_startup_targets
    where user_id = p_user_id and batch_id = p_batch_id and course_id = p_course_id;
  with candidates as (
    select distinct target.*, prior.state as captured
    from jsonb_to_recordset(p_targets) as target(repo text, folder text, ref text, sha text)
    left join lateral (
      select case
        when a.status = 'claimed' then case
          when b.closed_at is null and b.expires_at > now_at and a.claimed_at > now_at - interval '15 minutes'
            then 'claimed' else 'unknown' end
        when a.status is not null then a.status
        when t.unlinked_status = 'already-processed' then 'terminal'
        when t.unlinked_status is not null then t.unlinked_status
        when t.started_at is not null then 'unknown'
        else 'claimed'
      end as state
      from public.repo_grade_startup_targets t
      join public.repo_grade_startup_batches b on b.user_id = t.user_id and b.id = t.batch_id
      left join public.repo_grade_attempts a on a.generation = t.attempt_generation and a.user_id = t.user_id
      where t.user_id = p_user_id and t.course_id = p_course_id and b.sealed_at is not null
        and lower(t.repo) = lower(target.repo) and t.source_sha = target.sha and t.folder = target.folder
        -- After close or expiry, only a selector with no committed start
        -- marker can be captured by a new opening.
        and (t.started_at is not null or (b.closed_at is null and b.expires_at > now_at))
      order by (t.started_at is not null) desc, b.sealed_at desc, b.id desc
      limit 1
    ) prior on true
  ), installed as (
    insert into public.repo_grade_startup_targets (user_id, batch_id, course_id, repo, folder, source_ref, source_sha)
      select p_user_id, p_batch_id, p_course_id, repo, folder, ref, sha from candidates where captured is null
    returning 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('repo', repo, 'folder', folder, 'ref', ref, 'sha', sha,
    'state', captured)), '[]'::jsonb)
    into skipped from candidates where captured is not null;
  return skipped;
end;
$$;

create function public.repo_grade_seal_startup(p_user_id uuid, p_batch_id uuid, p_count integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  now_at timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  now_at := clock_timestamp();
  if p_count is null or p_count < 1 or p_count > 1000 or exists (
    select 1 from public.repo_grade_startup_batches
    where user_id = p_user_id and sealed_at is not null and closed_at is null and expires_at > now_at
  ) then return false; end if;
  if (select count(*) from public.repo_grade_startup_targets where user_id = p_user_id and batch_id = p_batch_id) <> p_count
    or exists (
      select 1 from public.repo_grade_startup_targets t
      join public.repo_grade_startup_targets prior on prior.user_id = t.user_id and prior.course_id = t.course_id
        and lower(prior.repo) = lower(t.repo) and prior.source_sha = t.source_sha and prior.folder = t.folder
      join public.repo_grade_startup_batches b on b.user_id = prior.user_id and b.id = prior.batch_id
      where t.user_id = p_user_id and t.batch_id = p_batch_id and b.sealed_at is not null
        and (prior.started_at is not null or (b.closed_at is null and b.expires_at > now_at))
    ) then return false; end if;
  update public.repo_grade_startup_batches set sealed_at = now_at, expires_at = now_at + interval '15 minutes'
    where user_id = p_user_id and id = p_batch_id and sealed_at is null;
  return found;
end;
$$;

create function public.repo_grade_start_startup_target(
  p_user_id uuid, p_batch_id uuid, p_course_id uuid, p_repo text, p_folder text, p_ref text, p_sha text
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  update public.repo_grade_startup_targets t set started_at = clock_timestamp()
  from public.repo_grade_startup_batches b
  where b.user_id = p_user_id and b.id = p_batch_id and b.sealed_at is not null
    and b.closed_at is null and b.expires_at > clock_timestamp()
    and t.user_id = b.user_id and t.batch_id = b.id and t.course_id = p_course_id
    and t.repo = p_repo and t.folder = p_folder and t.source_ref = p_ref and t.source_sha = p_sha
    and t.started_at is null;
  return found;
end;
$$;

create function public.repo_grade_claim_startup_target(
  p_user_id uuid, p_batch_id uuid, p_course_id uuid, p_repo text, p_folder text,
  p_source_ref text, p_source_sha text, p_course_config jsonb, p_cohort_id uuid,
  p_receipt jsonb, p_preparation_key text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  response jsonb;
  target public.repo_grade_startup_targets%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  select t.* into target from public.repo_grade_startup_targets t
  join public.repo_grade_startup_batches b on b.user_id = t.user_id and b.id = t.batch_id
  where t.user_id = p_user_id and t.batch_id = p_batch_id and t.course_id = p_course_id
    and t.repo = p_repo and t.folder = p_folder and t.source_ref = p_source_ref and t.source_sha = p_source_sha
    and t.started_at is not null and t.unlinked_status is null and t.attempt_generation is null
    and b.sealed_at is not null and b.expires_at > clock_timestamp();
  if not found then return jsonb_build_object('status', 'forbidden'); end if;

  if p_preparation_key is null then
    response := public.repo_grade_claim_tracked(
      p_user_id, p_course_id, p_repo, p_folder, 'automatic', p_source_ref, p_source_sha,
      p_course_config, p_cohort_id, p_receipt);
  else
    response := public.repo_grade_claim_with_preparation(
      p_user_id, p_course_id, p_repo, p_folder, 'automatic', p_source_ref, p_source_sha,
      p_course_config, p_cohort_id, p_receipt, p_preparation_key);
  end if;
  if response ->> 'status' = 'claimed' then
    update public.repo_grade_startup_targets set attempt_generation = (response ->> 'generation')::bigint
      where user_id = target.user_id and batch_id = target.batch_id and course_id = target.course_id
        and repo = target.repo and folder = target.folder and source_ref = target.source_ref and source_sha = target.source_sha;
    if not found then raise exception 'startup claim link unavailable'; end if;
  end if;
  return response;
end;
$$;

create function public.repo_grade_finish_startup_target(
  p_user_id uuid, p_batch_id uuid, p_course_id uuid, p_repo text, p_folder text, p_ref text, p_sha text, p_status text
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_status is null or p_status not in ('not-started', 'unknown', 'failed', 'already-processed') then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  update public.repo_grade_startup_targets set unlinked_status = p_status
    where user_id = p_user_id and batch_id = p_batch_id and course_id = p_course_id
      and repo = p_repo and folder = p_folder and source_ref = p_ref and source_sha = p_sha
      and started_at is not null and attempt_generation is null and unlinked_status is null;
  return found or exists (select 1 from public.repo_grade_startup_targets
    where user_id = p_user_id and batch_id = p_batch_id and course_id = p_course_id
      and repo = p_repo and folder = p_folder and source_ref = p_ref and source_sha = p_sha
      and (attempt_generation is not null or unlinked_status = p_status));
end;
$$;

create function public.repo_grade_close_startup(p_user_id uuid, p_batch_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  update public.repo_grade_startup_batches set closed_at = coalesce(closed_at, clock_timestamp())
    where user_id = p_user_id and id = p_batch_id and sealed_at is not null;
  return found;
end;
$$;

create function public.repo_grade_read_startup(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with latest as (
    select *, closed_at is null and expires_at > statement_timestamp() as active
    from public.repo_grade_startup_batches
    where user_id = p_user_id and sealed_at is not null order by sealed_at desc, id desc limit 1
  ), progress as (
    select t.course_id, case
      when a.status = 'claimed' then
        case when b.active and a.claimed_at > statement_timestamp() - interval '15 minutes' then 'busy' else 'unknown' end
      when a.status is not null then a.status
      when t.unlinked_status is not null then t.unlinked_status
      when t.started_at is not null then case when b.active then 'running' else 'unknown' end
      when b.active then 'queued'
      else 'not-started'
    end as state
    from latest b join public.repo_grade_startup_targets t on t.user_id = b.user_id and t.batch_id = b.id
    left join public.repo_grade_attempts a on a.generation = t.attempt_generation and a.user_id = t.user_id
  ), counts as (
    select course_id, state, count(*) as count from progress group by course_id, state
  )
  select jsonb_build_object('active', b.active, 'counts', coalesce(
    (select jsonb_agg(jsonb_build_object('courseId', course_id, 'state', state, 'count', count)
      order by course_id, state) from counts), '[]'::jsonb))
  from latest b
$$;

revoke all on function public.repo_grade_stage_startup(uuid, uuid, uuid, jsonb),
  public.repo_grade_seal_startup(uuid, uuid, integer),
  public.repo_grade_start_startup_target(uuid, uuid, uuid, text, text, text, text),
  public.repo_grade_claim_startup_target(uuid, uuid, uuid, text, text, text, text, jsonb, uuid, jsonb, text),
  public.repo_grade_finish_startup_target(uuid, uuid, uuid, text, text, text, text, text),
  public.repo_grade_close_startup(uuid, uuid), public.repo_grade_read_startup(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.repo_grade_stage_startup(uuid, uuid, uuid, jsonb),
  public.repo_grade_seal_startup(uuid, uuid, integer),
  public.repo_grade_start_startup_target(uuid, uuid, uuid, text, text, text, text),
  public.repo_grade_claim_startup_target(uuid, uuid, uuid, text, text, text, text, jsonb, uuid, jsonb, text),
  public.repo_grade_finish_startup_target(uuid, uuid, uuid, text, text, text, text, text),
  public.repo_grade_close_startup(uuid, uuid), public.repo_grade_read_startup(uuid)
  to service_role;
