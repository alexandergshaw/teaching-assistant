-- Private durable state for a single owner-bound notebook execution attempt.
-- External dispatch must never be retried merely because its response was lost.
create table public.notebook_execution_attempts (
  owner_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  attempt_id uuid not null,
  input_sha256 text not null check (input_sha256 ~ '^[0-9a-f]{64}$'),
  grade_binding_sha256 text not null check (grade_binding_sha256 ~ '^[0-9a-f]{64}$'),
  source_url text not null check (length(source_url) between 1 and 2000),
  notebook_path text not null check (length(notebook_path) between 1 and 200),
  commit_sha text not null check (commit_sha ~ '^[0-9a-f]{40}$'),
  expected_cells integer[] not null check (cardinality(expected_cells) between 1 and 200),
  status text not null check (status in ('reserved', 'dispatching', 'recovering', 'running', 'succeeded', 'failed', 'unknown', 'cancelling', 'cancelled', 'retryable', 'expired')),
  sandbox_id text check (sandbox_id is null or sandbox_id ~ '^sbx_[A-Za-z0-9]{1,128}$'),
  sandbox_name text check (sandbox_name is null or sandbox_name ~ '^[A-Za-z0-9_-]{1,128}$'),
  command_id text check (command_id is null or command_id ~ '^cmd_[A-Za-z0-9]{1,128}$'),
  result jsonb,
  grade_request jsonb,
  created_at timestamptz not null default now(),
  dispatch_started_at timestamptz,
  expires_at timestamptz not null,
  primary key (owner_id, attempt_id),
  check (expires_at > created_at),
  check ((status <> 'running') or (sandbox_id is not null and sandbox_name is not null and command_id is not null)),
  check (result is null or status in ('succeeded', 'failed')),
  check (grade_request is null or pg_catalog.octet_length(grade_request::text) <= 3700000)
);
alter table public.notebook_execution_attempts enable row level security;
revoke all on public.notebook_execution_attempts from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.notebook_execution_attempts to service_role;
create index notebook_execution_attempts_expiry_idx on public.notebook_execution_attempts (expires_at);
create unique index notebook_execution_attempts_active_binding_idx on public.notebook_execution_attempts (owner_id, session_id, grade_binding_sha256, source_url)
  where status in ('reserved', 'dispatching', 'recovering', 'running', 'succeeded', 'failed', 'unknown', 'cancelling');

create function public.reserve_notebook_execution(p_owner uuid, p_session uuid, p_attempt uuid, p_digest text, p_grade_binding text, p_source_url text, p_notebook_path text, p_commit text, p_expected integer[], p_grade_request jsonb, p_name text)
returns table(canonical_attempt uuid, canonical_name text, status text, input_matches boolean, expired boolean)
language plpgsql security invoker set search_path = '' as $$
declare existing public.notebook_execution_attempts%rowtype;
begin
  if p_owner is null or p_session is null or p_attempt is null or p_digest is null or p_digest !~ '^[0-9a-f]{64}$' or p_grade_binding is null or p_grade_binding !~ '^[0-9a-f]{64}$' or p_source_url is null or length(p_source_url) not between 1 and 2000 or p_notebook_path is null or length(p_notebook_path) not between 1 and 200 or p_commit is null or p_commit !~ '^[0-9a-f]{40}$' or p_expected is null or cardinality(p_expected) not between 1 and 200 or p_grade_request is null or pg_catalog.octet_length(p_grade_request::text) > 3700000 or p_name is null or p_name !~ '^nb-[a-f0-9]{40}$' or exists (select 1 from unnest(p_expected) n where n is null or n < 0 or n >= 500) then raise exception 'Invalid notebook attempt'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text || ':' || p_session::text || ':' || p_grade_binding || ':' || p_source_url, 0));
  select a.* into existing from public.notebook_execution_attempts a where a.owner_id = p_owner and a.attempt_id = p_attempt;
  if found then
    if existing.session_id <> p_session then return query select null::uuid, null::text, 'unknown'::text, false, false; return; end if;
    return query select existing.attempt_id, existing.sandbox_name, existing.status, existing.session_id = p_session and existing.input_sha256 = p_digest and existing.grade_binding_sha256 = p_grade_binding and existing.source_url = p_source_url and existing.notebook_path = p_notebook_path and existing.commit_sha = p_commit and existing.expected_cells = p_expected and existing.grade_request = p_grade_request, existing.expires_at <= now();
    return;
  end if;
  update public.notebook_execution_attempts a set status = 'expired', result = null, grade_request = null
    where a.owner_id = p_owner and a.session_id = p_session and a.grade_binding_sha256 = p_grade_binding and a.source_url = p_source_url and a.expires_at <= now() and a.status in ('reserved', 'dispatching', 'recovering', 'running', 'succeeded', 'failed', 'unknown', 'cancelling');
  select a.* into existing from public.notebook_execution_attempts a where a.owner_id = p_owner and a.session_id = p_session and a.grade_binding_sha256 = p_grade_binding and a.source_url = p_source_url and a.status in ('reserved', 'dispatching', 'recovering', 'running', 'succeeded', 'failed', 'unknown', 'cancelling') limit 1;
  if found then
    return query select existing.attempt_id, existing.sandbox_name, existing.status, existing.input_sha256 = p_digest and existing.notebook_path = p_notebook_path and existing.commit_sha = p_commit and existing.expected_cells = p_expected and existing.grade_request = p_grade_request, false;
    return;
  end if;
  insert into public.notebook_execution_attempts(owner_id, session_id, attempt_id, input_sha256, grade_binding_sha256, source_url, notebook_path, commit_sha, expected_cells, grade_request, sandbox_name, status, expires_at)
  values (p_owner, p_session, p_attempt, p_digest, p_grade_binding, p_source_url, p_notebook_path, p_commit, p_expected, p_grade_request, p_name, 'reserved', now() + interval '24 hours')
  on conflict (owner_id, attempt_id) do nothing;
  return query select a.attempt_id, a.sandbox_name, a.status, a.input_sha256 = p_digest and a.grade_binding_sha256 = p_grade_binding and a.source_url = p_source_url and a.notebook_path = p_notebook_path and a.commit_sha = p_commit and a.expected_cells = p_expected and a.grade_request = p_grade_request, a.expires_at <= now()
    from public.notebook_execution_attempts a where a.owner_id = p_owner and a.session_id = p_session and a.attempt_id = p_attempt;
end $$;
-- Keep tombstones for idempotency while removing expired student output.
create function public.scrub_expired_notebook_results()
returns integer language plpgsql security invoker set search_path = '' as $$
declare updated integer;
begin
  with batch as (select owner_id, attempt_id from public.notebook_execution_attempts where expires_at <= now() and (result is not null or grade_request is not null) order by expires_at limit 100 for update skip locked)
  update public.notebook_execution_attempts a set result = null, grade_request = null from batch b where a.owner_id = b.owner_id and a.attempt_id = b.attempt_id;
  get diagnostics updated = row_count;
  return updated;
end $$;
create function public.cancel_notebook_execution(p_owner uuid, p_session uuid, p_attempt uuid)
returns table(sandbox_id text, sandbox_name text, state text) language plpgsql security invoker set search_path = '' as $$
begin
  return query update public.notebook_execution_attempts a set status = case when a.status = 'reserved' then 'cancelled' else 'cancelling' end, result = null
    where a.owner_id = p_owner and a.session_id = p_session and a.attempt_id = p_attempt and a.status in ('reserved', 'dispatching', 'recovering', 'running', 'unknown', 'failed') and a.expires_at > now()
    returning a.sandbox_id, a.sandbox_name, a.status;
end $$;

-- The successful transition is the sole permit to issue an external dispatch.
-- A lost response stays dispatching and is never automatically redispatched.
create function public.begin_notebook_execution(p_owner uuid, p_session uuid, p_attempt uuid, p_digest text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare updated integer;
begin
  update public.notebook_execution_attempts set status = 'dispatching', dispatch_started_at = now()
    where owner_id = p_owner and session_id = p_session and attempt_id = p_attempt and input_sha256 = p_digest and status = 'reserved' and expires_at > now();
  get diagnostics updated = row_count;
  return updated = 1;
end $$;
-- Called only after the server has independently confirmed this exact VM
-- session is stopped. An unbound dispatch is never automatically replayed.
create function public.recover_notebook_unknown(p_owner uuid, p_session uuid, p_attempt uuid, p_sandbox text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare updated integer;
begin
  update public.notebook_execution_attempts set status = 'retryable'
    where owner_id = p_owner and session_id = p_session and attempt_id = p_attempt and sandbox_id = p_sandbox and status in ('running', 'cancelling', 'unknown');
  get diagnostics updated = row_count;
  return updated = 1;
end $$;
-- Fence a start whose response/ledger binding was lost. The stable name was
-- recorded before dispatch, so a later poll can locate and stop that VM.
create function public.claim_unbound_notebook_recovery(p_owner uuid, p_session uuid, p_attempt uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare updated integer;
begin
  update public.notebook_execution_attempts set status = 'recovering'
    where owner_id = p_owner and session_id = p_session and attempt_id = p_attempt and status = 'dispatching' and sandbox_id is null and dispatch_started_at < now() - interval '2 minutes';
  get diagnostics updated = row_count;
  return updated = 1;
end $$;
create function public.finish_unbound_notebook_recovery(p_owner uuid, p_session uuid, p_attempt uuid, p_name text, p_sandbox text)
returns text language plpgsql security invoker set search_path = '' as $$
declare final_state text;
begin
  if p_name is null or p_name !~ '^nb-[a-f0-9]{40}$' or p_sandbox is null or p_sandbox !~ '^sbx_[A-Za-z0-9]{1,128}$' then raise exception 'Invalid notebook recovery'; end if;
  update public.notebook_execution_attempts set sandbox_id = p_sandbox, status = case when status = 'cancelling' then 'cancelled' else 'retryable' end
    where owner_id = p_owner and session_id = p_session and attempt_id = p_attempt and sandbox_name = p_name and sandbox_id is null and status in ('recovering', 'cancelling')
    returning status into final_state;
  return final_state;
end $$;
create function public.confirm_notebook_cancelled(p_owner uuid, p_session uuid, p_attempt uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare updated integer;
begin
  update public.notebook_execution_attempts set status = 'cancelled' where owner_id = p_owner and session_id = p_session and attempt_id = p_attempt and status = 'cancelling';
  get diagnostics updated = row_count;
  return updated = 1;
end $$;
create function public.bind_notebook_execution(p_owner uuid, p_session uuid, p_attempt uuid, p_digest text, p_sandbox text, p_name text, p_command text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare updated integer;
begin
  if p_sandbox is null or p_sandbox !~ '^sbx_[A-Za-z0-9]{1,128}$' or p_name is null or p_name !~ '^[A-Za-z0-9_-]{1,128}$' or p_command is null or p_command !~ '^cmd_[A-Za-z0-9]{1,128}$' then raise exception 'Invalid notebook handles'; end if;
  update public.notebook_execution_attempts set status = 'running', sandbox_id = p_sandbox, sandbox_name = p_name, command_id = p_command
    where owner_id = p_owner and session_id = p_session and attempt_id = p_attempt and input_sha256 = p_digest and sandbox_name = p_name and status = 'dispatching' and expires_at > now();
  get diagnostics updated = row_count;
  return updated = 1;
end $$;
create function public.settle_notebook_execution(p_owner uuid, p_session uuid, p_attempt uuid, p_status text, p_result jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare updated integer;
begin
  if p_status is null or p_status not in ('succeeded', 'failed') or p_result is null or pg_catalog.octet_length(p_result::text) > 1200000 then raise exception 'Invalid notebook result'; end if;
  update public.notebook_execution_attempts set status = p_status, result = p_result
    where owner_id = p_owner and session_id = p_session and attempt_id = p_attempt and status = 'running' and expires_at > now();
  get diagnostics updated = row_count;
  return updated = 1;
end $$;
revoke all on function public.reserve_notebook_execution(uuid, uuid, uuid, text, text, text, text, text, integer[], jsonb, text) from public, anon, authenticated;
revoke all on function public.begin_notebook_execution(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.bind_notebook_execution(uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.settle_notebook_execution(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.cancel_notebook_execution(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.recover_notebook_unknown(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.confirm_notebook_cancelled(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_unbound_notebook_recovery(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.finish_unbound_notebook_recovery(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.scrub_expired_notebook_results() from public, anon, authenticated;
grant execute on function public.reserve_notebook_execution(uuid, uuid, uuid, text, text, text, text, text, integer[], jsonb, text) to service_role;
grant execute on function public.begin_notebook_execution(uuid, uuid, uuid, text) to service_role;
grant execute on function public.bind_notebook_execution(uuid, uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.settle_notebook_execution(uuid, uuid, uuid, text, jsonb) to service_role;
grant execute on function public.cancel_notebook_execution(uuid, uuid, uuid) to service_role;
grant execute on function public.recover_notebook_unknown(uuid, uuid, uuid, text) to service_role;
grant execute on function public.confirm_notebook_cancelled(uuid, uuid, uuid) to service_role;
grant execute on function public.claim_unbound_notebook_recovery(uuid, uuid, uuid) to service_role;
grant execute on function public.finish_unbound_notebook_recovery(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.scrub_expired_notebook_results() to service_role;
