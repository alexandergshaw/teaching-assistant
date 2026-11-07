-- Pausing a targeted run prevents future claims, not an already leased request.
alter table public.repo_grade_automatic_runs add column targeted_paused boolean not null default false;
alter table public.repo_grade_automatic_runs add column target_folders text[], add column target_repos text[], add column target_pairs jsonb, add column target_bulk boolean not null default false;
grant update (targeted_paused) on public.repo_grade_automatic_runs to service_role;

-- Targeted requests wait durably while another run for the owner is active.
create table public.repo_grade_target_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null,
  folder text not null check (length(folder) between 1 and 512),
  repo text check (repo is null or (length(repo) <= 200 and repo ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')),
  folders text[],
  repos text[],
  pairs jsonb,
  bulk boolean not null default false,
  selector_key text not null check (selector_key ~ '^[0-9a-f]{32}$'),
  state text not null default 'queued' check (state in ('queued', 'paused', 'running', 'stopped', 'complete', 'incomplete')),
  run_id uuid references public.repo_grade_automatic_runs(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  reason text check (reason is null or reason ~ '^[a-z0-9-]{1,80}$'),
  check (state <> 'running' or run_id is not null)
);
create unique index repo_grade_target_request_pending_unique on public.repo_grade_target_requests
  (user_id, course_id, selector_key)
  where state in ('queued', 'paused', 'running');
create index repo_grade_target_request_waiting on public.repo_grade_target_requests (created_at, id) where state = 'queued';
alter table public.repo_grade_target_requests enable row level security;
revoke all on public.repo_grade_target_requests from public, anon, authenticated, service_role;
grant select, insert, update on public.repo_grade_target_requests to service_role;
grant usage, select on sequence public.repo_grade_target_requests_id_seq to service_role;

create function public.repo_grade_target_request_enqueue(p_user_id uuid, p_course_id uuid, p_folder text, p_repo text)
returns text language plpgsql security invoker set search_path = '' as $$
begin
  if p_user_id is null or p_course_id is null or p_folder is null or length(p_folder) not between 1 and 512
    or (p_repo is not null and (length(p_repo) > 200 or p_repo !~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'))
    or not exists (select 1 from public.course_hub c where c.id = p_course_id and c.user_id = p_user_id) then return 'invalid'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade-target-enqueue:' || p_user_id::text, 0));
  if (select count(*) from public.repo_grade_target_requests where user_id = p_user_id and state in ('queued', 'paused', 'running')) >= 1000 then
    return 'invalid';
  end if;
  insert into public.repo_grade_target_requests (user_id, course_id, folder, repo, selector_key)
    values (p_user_id, p_course_id, p_folder, p_repo, md5(jsonb_build_object('folder',p_folder,'repo',p_repo)::text)) on conflict do nothing;
  if found then return 'queued'; else return 'already-queued'; end if;
end;
$$;

-- Null means all folders or all repositories; non-null arrays select their intersection.
create function public.repo_grade_target_request_enqueue_bulk(p_user_id uuid, p_course_id uuid, p_folders text[], p_repos text[])
returns text language plpgsql security invoker set search_path = '' as $$
declare ordered_folders text[]; ordered_repos text[];
begin
  if p_user_id is null or p_course_id is null
    or (p_folders is not null and (cardinality(p_folders) not between 1 and 1000
      or exists (select 1 from unnest(p_folders) f where f is null or length(f) not between 1 and 512)))
    or (p_repos is not null and (cardinality(p_repos) not between 1 and 1000
      or exists (select 1 from unnest(p_repos) r where r is null or length(r) > 200 or r !~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$')))
    or not exists (select 1 from public.course_hub c where c.id = p_course_id and c.user_id = p_user_id) then return 'invalid'; end if;
  if p_folders is not null then select array_agg(distinct f order by f) into ordered_folders from unnest(p_folders) f; end if;
  if p_repos is not null then select array_agg(distinct r order by r) into ordered_repos from unnest(p_repos) r; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade-target-enqueue:' || p_user_id::text, 0));
  if (select count(*) from public.repo_grade_target_requests where user_id = p_user_id and state in ('queued', 'paused', 'running')) >= 1000 then return 'invalid'; end if;
  insert into public.repo_grade_target_requests (user_id, course_id, folder, repo, folders, repos, bulk, selector_key)
    values (p_user_id, p_course_id, '*', null, ordered_folders, ordered_repos, true,
      md5(jsonb_build_object('folders',ordered_folders,'repos',ordered_repos)::text)) on conflict do nothing;
  if found then return 'queued'; else return 'already-queued'; end if;
end;
$$;

-- Explicit cells avoid grading an unintended cross product of selections.
create function public.repo_grade_target_request_enqueue_cells(p_user_id uuid, p_course_id uuid, p_pairs jsonb)
returns text language plpgsql security invoker set search_path = '' as $$
declare ordered_pairs jsonb;
begin
  if p_user_id is null or p_course_id is null or jsonb_typeof(p_pairs) is distinct from 'array'
    or not exists (select 1 from public.course_hub c where c.id = p_course_id and c.user_id = p_user_id) then return 'invalid'; end if;
  if jsonb_array_length(p_pairs) not between 1 and 1000 then return 'invalid'; end if;
  if exists (select 1 from jsonb_array_elements(p_pairs) p
    where jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'folder') is distinct from 'string'
      or jsonb_typeof(p->'repo') is distinct from 'string' or length(p->>'folder') not between 1 and 512
      or length(p->>'repo') > 200 or p->>'repo' !~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$') then return 'invalid'; end if;
  select jsonb_agg(jsonb_build_object('folder', f, 'repo', r) order by f, r) into ordered_pairs
  from (select distinct p->>'folder' f, p->>'repo' r from jsonb_array_elements(p_pairs) p) selected;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade-target-enqueue:' || p_user_id::text, 0));
  if (select count(*) from public.repo_grade_target_requests where user_id = p_user_id and state in ('queued', 'paused', 'running')) >= 1000 then return 'invalid'; end if;
  insert into public.repo_grade_target_requests (user_id, course_id, folder, pairs, bulk, selector_key)
    values (p_user_id, p_course_id, '*', ordered_pairs, true, md5(jsonb_build_object('pairs',ordered_pairs)::text)) on conflict do nothing;
  if found then return 'queued'; else return 'already-queued'; end if;
end;
$$;

-- Each promotion is one transaction: no request is lost between start and link.
create function public.repo_grade_target_request_promote() returns boolean
language plpgsql security invoker set search_path = '' as $$
declare request public.repo_grade_target_requests%rowtype; active_id uuid;
begin
  -- Reconcile only linked runs whose leases have settled.
  update public.repo_grade_target_requests q set state = finished.phase
  from (select q2.id, r.phase from public.repo_grade_target_requests q2
    join public.repo_grade_automatic_runs r on r.id = q2.run_id
    where q2.state = 'running' and r.phase in ('complete', 'incomplete', 'stopped') and r.lease is null
    order by q2.id limit 32 for update of q2 skip locked) finished where q.id = finished.id;
  select q.* into request from public.repo_grade_target_requests q
    where q.state = 'queued' and not exists (select 1 from public.repo_grade_automatic_runs r
      where r.user_id = q.user_id and (r.phase in ('discovering', 'grading') or r.lease is not null))
    order by q.created_at, q.id limit 1 for update skip locked;
  if not found then return false; end if;
  if not exists (select 1 from public.course_hub c where c.id = request.course_id and c.user_id = request.user_id) then
    update public.repo_grade_target_requests set state = 'incomplete', reason = 'course-unavailable' where id = request.id;
    return true;
  end if;
  if request.bulk then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade-automatic:' || request.user_id::text, 0));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || request.user_id::text, 0));
    if exists (select 1 from public.repo_grade_automatic_runs r where r.user_id = request.user_id
      and (r.phase in ('discovering', 'grading') or r.lease is not null)) then return false; end if;
    insert into public.repo_grade_automatic_runs (user_id, target_bulk, target_folders, target_repos, target_pairs)
      values (request.user_id, true, request.folders, request.repos, request.pairs) returning id into active_id;
    insert into public.repo_grade_automatic_courses (run_id, course_id, label, queue_position)
      select active_id, c.id, left(coalesce(nullif(btrim(c.name), ''), 'Unnamed course'), 200), 1
      from public.course_hub c where c.id = request.course_id and c.user_id = request.user_id;
    if not found then raise exception 'targeted course no longer available'; end if;
  else
    if not public.repo_grade_automatic_start_targeted(request.user_id, request.course_id, request.folder, request.repo) then return false; end if;
    select id into active_id from public.repo_grade_automatic_runs where user_id = request.user_id
      and phase in ('discovering', 'grading') and requested_folder = request.folder
      and requested_repo is not distinct from request.repo;
  end if;
  if active_id is null then raise exception 'targeted run could not be linked'; end if;
  update public.repo_grade_target_requests set state = 'running', run_id = active_id where id = request.id;
  return true;
end;
$$;

create function public.repo_grade_target_request_status(p_user_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'courseId', q.course_id, 'folder', q.folder,
    'repo', q.repo, 'bulk', q.bulk, 'folders', q.folders, 'repos', q.repos, 'pairs', q.pairs,
    'state', case when q.state = 'running' and r.phase in ('complete', 'incomplete', 'stopped') and r.lease is null then r.phase
      when q.state = 'running' and r.targeted_paused then 'paused-running' else q.state end,
    'runId', q.run_id, 'inFlight', coalesce(r.lease is not null and r.lease_until > clock_timestamp(), false),
    'reason', coalesce(q.reason,
      (select c.reason from public.repo_grade_automatic_courses c where c.run_id = q.run_id
        and c.reason ~ '^[a-z0-9-]{1,80}$' order by c.course_id limit 1),
      (select t.reason from public.repo_grade_automatic_targets t where t.run_id = q.run_id
        and t.reason ~ '^[a-z0-9-]{1,80}$' order by t.id limit 1)),
    'counts', coalesce((select jsonb_object_agg(counted.state, counted.total)
      from (select t.state, count(*) as total from public.repo_grade_automatic_targets t
        where t.run_id = q.run_id group by t.state) counted), '{}'::jsonb)) order by q.created_at, q.id), '[]'::jsonb)
  from (select * from public.repo_grade_target_requests where user_id = p_user_id
    and (state in ('queued', 'paused', 'running') or id in (
      select recent.id from public.repo_grade_target_requests recent where recent.user_id = p_user_id
        and recent.state in ('complete', 'incomplete', 'stopped') order by recent.id desc limit 100
    )) order by created_at, id limit 1100) q
  left join public.repo_grade_automatic_runs r on r.id = q.run_id and r.user_id = p_user_id;
$$;

create function public.repo_grade_target_request_control(p_user_id uuid, p_id bigint, p_action text) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare request public.repo_grade_target_requests%rowtype;
begin
  if p_action is null or p_action not in ('pause', 'resume', 'stop') then return false; end if;
  select * into request from public.repo_grade_target_requests where id = p_id and user_id = p_user_id for update;
  if not found then return false; end if;
  if request.state = 'running' and p_action = 'stop' then
    update public.repo_grade_automatic_runs set phase = 'stopped', targeted_paused = false, updated_at = clock_timestamp()
      where id = request.run_id and user_id = p_user_id and phase in ('discovering', 'grading');
    return found;
  elsif request.state = 'running' and p_action in ('pause', 'resume') then
    update public.repo_grade_automatic_runs set targeted_paused = (p_action = 'pause'), updated_at = clock_timestamp()
      where id = request.run_id and user_id = p_user_id and phase in ('discovering', 'grading')
        and targeted_paused is distinct from (p_action = 'pause');
    return found;
  end if;
  if request.state = 'queued' and p_action = 'pause' then
    update public.repo_grade_target_requests set state = 'paused' where id = p_id; return true;
  elsif request.state = 'paused' and p_action = 'resume' then
    update public.repo_grade_target_requests set state = 'queued' where id = p_id; return true;
  elsif request.state in ('queued', 'paused') and p_action = 'stop' then
    update public.repo_grade_target_requests set state = 'stopped', reason = 'stopped-by-user' where id = p_id; return true;
  end if;
  return false;
end;
$$;

revoke all on function public.repo_grade_target_request_enqueue(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.repo_grade_target_request_enqueue_bulk(uuid, uuid, text[], text[]) from public, anon, authenticated;
revoke all on function public.repo_grade_target_request_enqueue_cells(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.repo_grade_target_request_promote() from public, anon, authenticated;
revoke all on function public.repo_grade_target_request_status(uuid) from public, anon, authenticated;
revoke all on function public.repo_grade_target_request_control(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.repo_grade_target_request_enqueue(uuid, uuid, text, text) to service_role;
grant execute on function public.repo_grade_target_request_enqueue_bulk(uuid, uuid, text[], text[]) to service_role;
grant execute on function public.repo_grade_target_request_enqueue_cells(uuid, uuid, jsonb) to service_role;
grant execute on function public.repo_grade_target_request_promote() to service_role;
grant execute on function public.repo_grade_target_request_status(uuid) to service_role;
grant execute on function public.repo_grade_target_request_control(uuid, bigint, text) to service_role;

create or replace function public.repo_grade_automatic_read_target_filter(p_run_id uuid, p_user_id uuid, p_lease uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select jsonb_build_object('folder', r.requested_folder, 'repo', r.requested_repo,
    'bulk', r.target_bulk, 'folders', r.target_folders, 'repos', r.target_repos, 'pairs', r.target_pairs)
  from public.repo_grade_automatic_runs r
  where r.id = p_run_id and r.user_id = p_user_id and r.lease = p_lease
    and r.phase = 'discovering' and r.lease_until > clock_timestamp();
$$;
create or replace function public.repo_grade_automatic_claim(p_lease uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  run public.repo_grade_automatic_runs%rowtype;
  course public.repo_grade_automatic_courses%rowtype;
  target public.repo_grade_automatic_targets%rowtype;
  active_phase text;
begin
  if p_lease is null then return null; end if;

  update public.repo_grade_automatic_targets set recovery = null, recovery_until = null
    where id in (
      select id from public.repo_grade_automatic_targets where recovery_until <= clock_timestamp()
      order by recovery_until limit 32 for update skip locked
    );

  select * into run from public.repo_grade_automatic_runs r
    where (r.phase in ('discovering', 'grading') or r.lease is not null)
      and (not r.targeted_paused or r.phase = 'stopped')
      and (r.github_retry_at is null or r.github_retry_at <= clock_timestamp())
      and (r.lease_until is null or r.lease_until <= clock_timestamp())
      and (r.phase = 'stopped' or not public.repo_grade_automatic_browser_active(r.user_id))
    order by r.updated_at, r.id limit 1 for update skip locked;
  if not found then return null; end if;

  -- A browser target may have renewed the legacy lease after candidate
  -- selection. Wait on the same lock and use a fresh statement to see it.
  if run.phase <> 'stopped' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || run.user_id::text, 0));
    if public.repo_grade_automatic_browser_active(run.user_id) then
      return jsonb_build_object('phase', 'advanced');
    end if;
  end if;
  active_phase := run.phase;

  update public.repo_grade_automatic_targets set state = 'unknown', reason = 'worker-interrupted'
    where run_id = run.id and state = 'running';
  if active_phase = 'discovering' then
    select * into course from public.repo_grade_automatic_courses
      where run_id = run.id and state = 'checking' order by queue_position nulls last, course_id limit 1;
    if not found then active_phase := 'grading'; end if;
  end if;
  if active_phase = 'grading' then
    -- Look up at most one queued target per course so priority sorting is
    -- bounded by the number of courses rather than the full target backlog.
    select t.* into target from public.repo_grade_automatic_courses c
      join lateral (
        select * from public.repo_grade_automatic_targets q
        where q.run_id = c.run_id and q.course_id = c.course_id and q.state = 'queued'
        order by q.id limit 1
      ) t on true
      where c.run_id = run.id
      order by c.queue_position nulls last, c.course_id limit 1;
    if not found then
      active_phase := case when exists (
        select 1 from public.repo_grade_automatic_courses where run_id = run.id and state = 'partial'
        union all
        select 1 from public.repo_grade_automatic_targets where run_id = run.id
          and state not in ('succeeded', 'no-submission', 'already-processed')
      ) then 'incomplete' else 'complete' end;
    else
      update public.repo_grade_automatic_targets set state = 'running' where id = target.id;
    end if;
  end if;
  if active_phase in ('discovering', 'grading') then
    update public.repo_grade_automatic_runs set phase = active_phase, updated_at = clock_timestamp(),
      github_retry_at = null, lease = p_lease, lease_until = clock_timestamp() + interval '6 minutes' where id = run.id;
    return jsonb_build_object(
      'runId', run.id, 'accountId', run.user_id, 'phase', active_phase,
      'retryGithubRateLimits', exists (select 1 from public.repo_grade_automatic_settings
        where user_id = run.user_id and github_retry_enabled),
      'courseId', coalesce(course.course_id, target.course_id),
      'repo', target.repo, 'folder', target.folder, 'ref', target.source_ref, 'sha', target.source_sha);
  end if;
  update public.repo_grade_automatic_runs set phase = active_phase, updated_at = clock_timestamp(),
    lease = null, lease_until = null where id = run.id;
  return jsonb_build_object('phase', 'advanced');
end;
$$;
