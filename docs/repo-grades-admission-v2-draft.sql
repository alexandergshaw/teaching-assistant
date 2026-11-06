-- REVIEW DRAFT ONLY. Do not deploy or copy into the migration directory.
-- The final ROLLBACK keeps this draft disposable. Review an executable copy
-- only in an isolated PostgreSQL test database with the v1 schema installed.
-- Keep this schema outside the Supabase Data API's exposed schemas.
--
-- This slice models retention, lease expiry, and slot consumption. A future
-- trusted boundary must verify the complete sealed plan, provision accounts
-- with positive origin evidence, install the plan and all its slots atomically,
-- and authenticate the bound executor. The arguments here are internal claims
-- from that boundary. They are neither credentials nor a proof verifier.
--
-- Before enabling v2, fence every legacy/manual dispatch route in both
-- directions under the same account lock and close the v1 provider bypasses.
-- An empty v1 reservation table is not proof of v2-only origin. For adoption,
-- unresolved legacy execution keeps an account fenced. Install, deletion,
-- receipt verification, settlement, and independent recovery are future
-- transactions. In particular, no path in this draft releases an unknown fence.

begin;

create schema repo_grade_admission_private;
revoke all on schema repo_grade_admission_private from public, anon, authenticated, service_role;

-- These are internal safety identities. Keep them and their children separate
-- from auth.users, course_hub, grading receipts, and evaluation content. Course
-- and account deletion must record durable tombstones without deleting these
-- rows. Store only opaque identifiers, digests, and bounded protocol metadata.
create table repo_grade_admission_private.accounts (
  account_id uuid primary key,
  origin text collate "C" not null default 'legacy-unverified'
    check (origin in ('legacy-unverified', 'v2-only')),
  deleted_at timestamptz
);

create table repo_grade_admission_private.course_tombstones (
  account_id uuid not null references repo_grade_admission_private.accounts (account_id),
  course_id uuid not null,
  deleted_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (account_id, course_id)
);

create table repo_grade_admission_private.sealed_attempts (
  account_id uuid not null references repo_grade_admission_private.accounts (account_id),
  generation bigint not null check (generation between 1 and 9007199254740991),
  protocol text collate "C" not null check (protocol = 'repo-grade-queue-v2'),
  executor_id text collate "C" not null check (octet_length(executor_id) between 1 and 200),
  course_id uuid,
  plan_digest text collate "C" not null check (plan_digest ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null check (pg_catalog.isfinite(expires_at)),
  disposition text collate "C" not null default 'active'
    check (disposition in ('active', 'unknown', 'revoked')),
  primary key (account_id, generation)
);

-- Keep active reservations and unknown attempts mutually exclusive across the
-- whole account, including attempts whose course or result has been deleted.
create unique index sealed_attempts_account_fence
  on repo_grade_admission_private.sealed_attempts (account_id)
  where disposition in ('active', 'unknown');

create table repo_grade_admission_private.operation_slots (
  account_id uuid not null,
  generation bigint not null,
  slot_id text collate "C" not null check (octet_length(slot_id) between 1 and 200),
  slot_index integer not null check (slot_index >= 0),
  kind text collate "C" not null check (kind in ('rubric', 'grade')),
  provider text collate "C" not null check (octet_length(provider) between 1 and 128),
  model text collate "C" not null check (octet_length(model) between 1 and 200),
  input_digest text collate "C" not null check (input_digest ~ '^[0-9a-f]{64}$'),
  consumed_at timestamptz,
  permit_id uuid unique,
  closed_at timestamptz,
  terminal_proof_id uuid unique,
  terminal_outcome text collate "C" check (terminal_outcome in ('completed', 'refused', 'never-dispatched')),
  primary key (account_id, generation, slot_id),
  unique (account_id, generation, slot_index),
  foreign key (account_id, generation)
    references repo_grade_admission_private.sealed_attempts (account_id, generation),
  check ((consumed_at is null) = (permit_id is null)),
  check ((closed_at is null) = (terminal_proof_id is null)),
  check ((closed_at is null) = (terminal_outcome is null)),
  check (closed_at is null or consumed_at is not null)
);

create unique index operation_slots_one_unresolved
  on repo_grade_admission_private.operation_slots (account_id, generation)
  where consumed_at is not null and closed_at is null;

alter table repo_grade_admission_private.accounts enable row level security;
alter table repo_grade_admission_private.course_tombstones enable row level security;
alter table repo_grade_admission_private.sealed_attempts enable row level security;
alter table repo_grade_admission_private.operation_slots enable row level security;

-- This is owner-only review code. Use a fresh READ COMMITTED transaction per
-- call so statements after the lock observe the winner's commit. Every future
-- writer must use the account lock before touching these rows or locking the
-- corresponding auth/course rows. The lock key matches public.repo_grade_claim.
create function repo_grade_admission_private.expire_attempt(
  p_account_id uuid, p_generation bigint, p_protocol text, p_executor_id text
) returns text language plpgsql volatile security invoker set search_path = '' as $$
declare
  attempt repo_grade_admission_private.sealed_attempts;
begin
  if p_account_id is null or pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    return 'rejected';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_account_id::text, 0));

  select a.* into attempt from repo_grade_admission_private.sealed_attempts a
  where a.account_id = p_account_id and a.generation = p_generation
    and a.protocol = p_protocol and a.executor_id = p_executor_id;
  if not found then return 'rejected'; end if;
  if attempt.disposition <> 'active' or pg_catalog.clock_timestamp() < attempt.expires_at then
    return attempt.disposition;
  end if;

  update repo_grade_admission_private.sealed_attempts a
  set disposition = case when exists (
    select 1 from repo_grade_admission_private.operation_slots s
    where s.account_id = a.account_id and s.generation = a.generation and s.consumed_at is not null
  ) then 'unknown' else 'revoked' end
  where a.account_id = attempt.account_id and a.generation = attempt.generation
  returning a.disposition into attempt.disposition;
  return attempt.disposition;
end;
$$;

-- Consume one exact slot, once. Return the permit identity only to the first
-- winner. A future trusted caller must commit before handing it to transport.
-- A lost commit response must never be treated as proof that dispatch is safe.
-- Transport must independently enforce single use of the exact permit binding.
create function repo_grade_admission_private.begin_operation(
  p_account_id uuid, p_generation bigint, p_protocol text, p_executor_id text,
  p_slot_id text, p_kind text, p_provider text, p_model text, p_input_digest text
) returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  attempt repo_grade_admission_private.sealed_attempts;
  slot repo_grade_admission_private.operation_slots;
  consumed_time timestamptz;
  issued_permit_id uuid;
begin
  if p_account_id is null or pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    return pg_catalog.jsonb_build_object('status', 'rejected');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_account_id::text, 0));

  select a.* into attempt from repo_grade_admission_private.sealed_attempts a
  where a.account_id = p_account_id and a.generation = p_generation
    and a.protocol = p_protocol and a.executor_id = p_executor_id;
  if not found then return pg_catalog.jsonb_build_object('status', 'rejected'); end if;

  select s.* into slot from repo_grade_admission_private.operation_slots s
  where s.account_id = attempt.account_id and s.generation = attempt.generation
    and s.slot_id = p_slot_id and s.kind = p_kind and s.provider = p_provider
    and s.model = p_model and s.input_digest = p_input_digest;
  if not found then return pg_catalog.jsonb_build_object('status', 'rejected'); end if;
  -- The reference model applies expiry before returning a replay. This draft
  -- returns replay for a consumed slot before checking expiry. Both paths keep
  -- the account fenced and return no permit. Align the expiry transition before
  -- using the draft at runtime.
  if slot.consumed_at is not null then return pg_catalog.jsonb_build_object('status', 'replayed'); end if;

  if not exists (
    select 1 from repo_grade_admission_private.accounts a
    where a.account_id = p_account_id and a.origin = 'v2-only' and a.deleted_at is null
  ) or exists (
    select 1 from repo_grade_admission_private.course_tombstones t
    where t.account_id = p_account_id and t.course_id = attempt.course_id
  ) then return pg_catalog.jsonb_build_object('status', 'rejected'); end if;

  if exists (select 1 from public.repo_grade_reservations r where r.user_id = p_account_id) then
    return pg_catalog.jsonb_build_object('status', 'fenced');
  end if;

  -- Live scope checks supplement the durable tombstones. Row locks serialize
  -- the checks with deletion until commit. They do not cancel a consumed slot.
  perform 1 from auth.users u where u.id = p_account_id for key share;
  if not found then return pg_catalog.jsonb_build_object('status', 'rejected'); end if;
  if attempt.course_id is not null then
    perform 1 from public.course_hub c where c.id = attempt.course_id and c.user_id = p_account_id for key share;
    if not found then return pg_catalog.jsonb_build_object('status', 'rejected'); end if;
  end if;

  consumed_time := pg_catalog.clock_timestamp();
  if consumed_time >= attempt.expires_at then
    perform repo_grade_admission_private.expire_attempt(p_account_id, p_generation, p_protocol, p_executor_id);
    return pg_catalog.jsonb_build_object('status', 'expired');
  end if;
  if attempt.disposition <> 'active' then return pg_catalog.jsonb_build_object('status', 'rejected'); end if;

  if exists (
    select 1 from repo_grade_admission_private.operation_slots s
    where s.account_id = slot.account_id and s.generation = slot.generation
      and s.consumed_at is not null and s.closed_at is null
  ) then return pg_catalog.jsonb_build_object('status', 'fenced'); end if;
  if exists (
    select 1 from repo_grade_admission_private.operation_slots s
    where s.account_id = slot.account_id and s.generation = slot.generation
      and s.slot_index < slot.slot_index and s.consumed_at is null
  ) then return pg_catalog.jsonb_build_object('status', 'rejected'); end if;

  update repo_grade_admission_private.operation_slots s
  set consumed_at = consumed_time, permit_id = pg_catalog.gen_random_uuid()
  where s.account_id = slot.account_id and s.generation = slot.generation
    and s.slot_id = slot.slot_id and s.consumed_at is null
  returning s.permit_id into issued_permit_id;
  if not found then return pg_catalog.jsonb_build_object('status', 'replayed'); end if;
  return pg_catalog.jsonb_build_object('status', 'permitted', 'permitId', issued_permit_id);
end;
$$;

revoke all on all tables in schema repo_grade_admission_private from public, anon, authenticated, service_role;
revoke all on all functions in schema repo_grade_admission_private from public, anon, authenticated, service_role;

-- Before migration generation, run isolated PostgreSQL DDL and concurrent
-- transactions under actual roles. Cover direct grants, schema exposure,
-- first-winner replay, rollback/lost response, expiry races, course/account
-- deletion, scope/binding drift, and legacy coexistence. Exercise a verified
-- single-use transport and independent recovery before allowing dispatch.
rollback;
