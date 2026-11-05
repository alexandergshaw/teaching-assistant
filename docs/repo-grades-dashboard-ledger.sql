-- Review draft. Create the migration with the Supabase CLI before deployment.
-- All state transitions use the same per-account transaction lock. The lock
-- also covers manual evaluations that have no course in their entry point.
alter table public.course_hub add constraint course_hub_id_user_id_unique unique (id, user_id);

create table public.repo_grade_attempts (
  generation bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  course_id uuid,
  repo text not null check (repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' and length(repo) <= 200),
  folder text check (length(folder) <= 512),
  source_ref text check (length(source_ref) between 1 and 255),
  source_sha text check (source_sha ~ '^[0-9a-f]{40}$'),
  profile_fingerprint text check (profile_fingerprint ~ '^[0-9a-f]{64}$'),
  mode text not null check (mode in ('automatic', 'manual', 'retry')),
  status text not null default 'claimed'
    check (status in ('claimed', 'succeeded', 'no-submission', 'partial', 'failed', 'unknown')),
  claim_token uuid not null default gen_random_uuid(),
  claimed_at timestamptz not null default clock_timestamp(),
  settled_at timestamptz,
  reconciled_at timestamptz,
  check (mode = 'manual' or (
    course_id is not null and folder is not null and source_ref is not null
    and source_sha is not null and profile_fingerprint is not null
  )),
  check (reconciled_at is null or status = 'unknown'),
  foreign key (course_id, user_id) references public.course_hub (id, user_id) on delete cascade
);

create index repo_grade_attempts_course_idx
  on public.repo_grade_attempts (course_id, user_id, generation desc);
create index repo_grade_attempts_history_idx
  on public.repo_grade_attempts (user_id, course_id, lower(repo), source_sha);
-- Capacity survives course deletion. These rows hold no course, repository,
-- token, or grading data. An orphan fences new dispatch for the account until
-- an operator can verify it is safe to release that reservation.
create table public.repo_grade_reservations (
  generation bigint primary key,
  user_id uuid not null references auth.users (id) on delete cascade
);
create index repo_grade_reservations_user_idx on public.repo_grade_reservations (user_id);

create table public.repo_grade_evaluations (
  generation bigint primary key references public.repo_grade_attempts (generation) on delete cascade,
  score numeric not null check (score between 0 and 100),
  feedback text not null check (length(feedback) <= 4000),
  rubric jsonb not null check (jsonb_typeof(rubric) = 'array' and octet_length(rubric::text) <= 96000)
);

alter table public.repo_grade_attempts enable row level security;
alter table public.repo_grade_evaluations enable row level security;
alter table public.repo_grade_reservations enable row level security;

revoke all on public.repo_grade_attempts, public.repo_grade_evaluations from public, anon, authenticated, service_role;
revoke all on public.repo_grade_reservations from public, anon, authenticated, service_role;
grant select (generation, user_id, course_id, repo, folder, source_ref, source_sha,
  profile_fingerprint, mode, status, claimed_at, settled_at, reconciled_at)
  on public.repo_grade_attempts to authenticated;
grant select on public.repo_grade_evaluations to authenticated;
grant select, insert on public.repo_grade_attempts to service_role;
grant update (status, settled_at, reconciled_at) on public.repo_grade_attempts to service_role;
grant select, insert on public.repo_grade_evaluations to service_role;
grant select, insert, delete on public.repo_grade_reservations to service_role;
grant usage on sequence public.repo_grade_attempts_generation_seq to service_role;

create policy repo_grade_attempts_read_own on public.repo_grade_attempts for select to authenticated
using (user_id = (select auth.uid()) and course_id is not null and mode <> 'manual');
create policy repo_grade_evaluations_read_own on public.repo_grade_evaluations for select to authenticated
using (exists (select 1 from public.repo_grade_attempts a where a.generation = repo_grade_evaluations.generation));

create function public.repo_grade_claim(
  p_user_id uuid, p_course_id uuid, p_repo text, p_folder text, p_mode text,
  p_source_ref text, p_source_sha text, p_profile_fingerprint text, p_course_config jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  new_attempt public.repo_grade_attempts;
  course_row public.course_hub;
begin
  if p_user_id is null or p_mode is null or p_mode not in ('automatic', 'manual', 'retry') then
    raise exception 'invalid repo grade claim';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  if p_course_id is not null then
    select * into course_row from public.course_hub c
      where c.id = p_course_id and c.user_id = p_user_id for share;
    if not found then return jsonb_build_object('status', 'forbidden'); end if;
  end if;
  -- Compare the raw saved inputs used by planning, while holding the course
  -- row lock. Course timestamps are application-assigned and can collide.
  if p_mode <> 'manual' and (
    p_course_id is null
    or p_course_config is distinct from jsonb_build_object(
      'github_org', course_row.github_org, 'repos', course_row.repos,
      'rubric_name', course_row.rubric_name, 'rubric_data', course_row.rubric_data,
      'repo_module_pairing', course_row.repo_module_pairing, 'student_repos', course_row.student_repos
    )
    or nullif(btrim(course_row.github_org), '') is null
    or lower(btrim(course_row.github_org)) is distinct from lower(split_part(p_repo, '/', 1))
  ) then return jsonb_build_object('status', 'configuration-changed'); end if;

  update public.repo_grade_attempts
     set status = 'unknown', settled_at = clock_timestamp()
   where user_id = p_user_id and status = 'claimed'
     and claimed_at <= clock_timestamp() - interval '15 minutes';

  if p_mode = 'automatic' and exists (
    select 1 from public.repo_grade_attempts a
    where a.user_id = p_user_id and a.course_id = p_course_id and lower(a.repo) = lower(p_repo)
      and a.source_ref = p_source_ref and a.source_sha = p_source_sha and a.folder = p_folder
      and a.mode <> 'manual' and a.status in ('succeeded', 'no-submission')
  ) then return jsonb_build_object('status', 'terminal'); end if;

  if exists (
    select 1 from public.repo_grade_reservations r
    left join public.repo_grade_attempts a on a.generation = r.generation and a.user_id = r.user_id
    where r.user_id = p_user_id and (
      a.generation is null
      or (lower(a.repo) = lower(p_repo)
        and (a.course_id is null or p_course_id is null or a.course_id = p_course_id
          or a.mode = 'manual' or p_mode = 'manual')
        and (a.folder is null or p_folder is null or a.folder = p_folder))
    )
  ) then return jsonb_build_object('status', 'busy'); end if;

  if p_mode = 'automatic' and exists (
    select 1 from public.repo_grade_attempts a
    where a.user_id = p_user_id and a.course_id = p_course_id and lower(a.repo) = lower(p_repo)
      and a.source_ref = p_source_ref and a.source_sha = p_source_sha and a.folder = p_folder
      and a.mode <> 'manual'
  ) then return jsonb_build_object('status', 'explicit-retry-required'); end if;

  if (select count(*) from public.repo_grade_reservations r where r.user_id = p_user_id) >= 3
  then return jsonb_build_object('status', 'capacity'); end if;

  insert into public.repo_grade_attempts (
    user_id, course_id, repo, folder, mode, source_ref, source_sha, profile_fingerprint
  ) values (p_user_id, p_course_id, p_repo, p_folder, p_mode, p_source_ref, p_source_sha, p_profile_fingerprint)
  returning * into new_attempt;
  insert into public.repo_grade_reservations (generation, user_id) values (new_attempt.generation, p_user_id);
  return jsonb_build_object('status', 'claimed', 'generation', new_attempt.generation, 'token', new_attempt.claim_token);
end;
$$;

create function public.repo_grade_settle(
  p_user_id uuid, p_generation bigint, p_token uuid, p_outcome text,
  p_inputs_complete boolean, p_score numeric, p_feedback text, p_rubric jsonb
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
    or (p_outcome in ('no-submission', 'failed', 'unknown') and p_score is not null)
    or (attempt.mode = 'manual' and p_score is not null)
    or (attempt.mode <> 'manual' and p_outcome = 'succeeded' and p_score is null)
  then raise exception 'invalid repo grade settlement'; end if;

  if p_score is not null then
    insert into public.repo_grade_evaluations (generation, score, feedback, rubric)
      values (p_generation, p_score, p_feedback, p_rubric);
  end if;
  update public.repo_grade_attempts set status = p_outcome, settled_at = clock_timestamp()
    where generation = p_generation;
  if p_outcome <> 'unknown' then
    delete from public.repo_grade_reservations where user_id = p_user_id and generation = p_generation;
  end if;
  return true;
end;
$$;

-- Call only after the server operator has established the old execution ended.
-- The uncertain outcome stays in history. Releasing capacity permits an explicit retry.
create function public.repo_grade_reconcile(
  p_user_id uuid, p_generation bigint
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  attempt public.repo_grade_attempts;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_user_id::text, 0));
  perform 1 from public.repo_grade_reservations r where r.user_id = p_user_id and r.generation = p_generation;
  if not found then return false; end if;
  select * into attempt from public.repo_grade_attempts a where a.user_id = p_user_id and a.generation = p_generation;
  if found then
    if attempt.status <> 'unknown' and (
      attempt.status <> 'claimed' or attempt.claimed_at > clock_timestamp() - interval '15 minutes'
    ) then return false; end if;
    if attempt.course_id is not null then
      perform 1 from public.course_hub c where c.id = attempt.course_id and c.user_id = p_user_id for share;
      if not found then return false; end if;
    end if;
    update public.repo_grade_attempts set status = 'unknown',
      settled_at = coalesce(settled_at, clock_timestamp()), reconciled_at = clock_timestamp()
      where generation = p_generation;
  end if;
  delete from public.repo_grade_reservations where user_id = p_user_id and generation = p_generation;
  return true;
end;
$$;

create function public.repo_grade_orphaned_reservations(
  p_user_id uuid
) returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(r.generation order by r.generation), '[]'::jsonb)
  from public.repo_grade_reservations r
  left join public.repo_grade_attempts a on a.generation = r.generation and a.user_id = r.user_id
  where r.user_id = p_user_id and a.generation is null;
$$;

create function public.repo_grade_history(
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
        a.claimed_at, a.settled_at, a.reconciled_at, e.score, e.feedback, e.rubric
      from public.repo_grade_attempts a
      left join public.repo_grade_evaluations e using (generation)
      where a.course_id = p_course_id and a.user_id = p_user_id and a.mode <> 'manual'
        and (p_before is null or a.generation < p_before)
      order by a.generation desc limit 100
    ) page
  );
end;
$$;

revoke all on function public.repo_grade_claim(uuid, uuid, text, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.repo_grade_settle(uuid, bigint, uuid, text, boolean, numeric, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.repo_grade_reconcile(uuid, bigint) from public, anon, authenticated;
revoke all on function public.repo_grade_orphaned_reservations(uuid) from public, anon, authenticated;
revoke all on function public.repo_grade_history(uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function public.repo_grade_claim(uuid, uuid, text, text, text, text, text, text, jsonb) to service_role;
grant execute on function public.repo_grade_settle(uuid, bigint, uuid, text, boolean, numeric, text, jsonb) to service_role;
grant execute on function public.repo_grade_reconcile(uuid, bigint) to service_role;
grant execute on function public.repo_grade_orphaned_reservations(uuid) to service_role;
grant execute on function public.repo_grade_history(uuid, uuid, bigint) to service_role;
