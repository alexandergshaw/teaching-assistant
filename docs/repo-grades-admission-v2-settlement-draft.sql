-- REVIEW DRAFT ONLY. Run only after a disposable committed copy of the base
-- draft. The final ROLLBACK discards this extension. Do not deploy this file.
-- Account and generation identify the sealed attempt. The authenticated
-- executor and protocol must match that attempt. No API role may call these
-- routines or write evidence. The schema owner is the trusted review operator.
-- A future verifier must authenticate the executor and independently establish
-- the claims before inserting evidence. No receipt or settlement verifier is
-- implemented here. In particular, provider completion alone does not prove
-- that a permit is retired and cannot be dispatched again.

begin;

do $$
begin
  if current_user in ('anon', 'authenticated', 'service_role') or not exists (
    select 1 from pg_catalog.pg_namespace n where n.nspname = 'repo_grade_admission_private'
      and pg_catalog.pg_get_userbyid(n.nspowner) = current_user
  ) then raise exception 'expected the private admission schema owner'; end if;
end;
$$;

-- Keep the base active/unknown unique index and all existing routines intact.
alter table repo_grade_admission_private.sealed_attempts
  drop constraint sealed_attempts_disposition_check,
  add constraint sealed_attempts_disposition_check
    check (disposition in ('active', 'unknown', 'revoked', 'settled')),
  add unique (account_id, generation, protocol, executor_id);

alter table repo_grade_admission_private.operation_slots
  add unique (account_id, generation, slot_id, permit_id, kind, provider, model, input_digest);

-- The owner inserts only already verified terminal evidence. The unique
-- permit and immutable row bind one verdict to the exact consumed operation.
create table repo_grade_admission_private.verified_transport_receipts (
  receipt_id uuid primary key,
  account_id uuid not null,
  generation bigint not null,
  protocol text collate "C" not null,
  executor_id text collate "C" not null,
  slot_id text collate "C" not null,
  permit_id uuid not null unique,
  kind text collate "C" not null,
  provider text collate "C" not null,
  model text collate "C" not null,
  input_digest text collate "C" not null,
  outcome text collate "C" not null check (outcome in ('completed', 'refused', 'never-dispatched')),
  evidence_digest text collate "C" not null check (evidence_digest ~ '^[0-9a-f]{64}$'),
  foreign key (account_id, generation, protocol, executor_id)
    references repo_grade_admission_private.sealed_attempts (account_id, generation, protocol, executor_id),
  foreign key (account_id, generation, slot_id, permit_id, kind, provider, model, input_digest)
    references repo_grade_admission_private.operation_slots
      (account_id, generation, slot_id, permit_id, kind, provider, model, input_digest),
  unique (receipt_id, account_id, generation, slot_id, permit_id, outcome)
);

-- Unclosed slots have null proof and outcome. The base null-pair checks
-- require both on closure, so the FK then enforces the exact receipt verdict.
alter table repo_grade_admission_private.operation_slots
  add foreign key (terminal_proof_id, account_id, generation, slot_id, permit_id, terminal_outcome)
    references repo_grade_admission_private.verified_transport_receipts
      (receipt_id, account_id, generation, slot_id, permit_id, outcome);

-- The owner independently verifies the aggregate outcome and result digest.
-- A terminal transport receipt proves execution safety, not grade validity,
-- complete repository inputs, or conclusive no-submission. Keep only digests
-- and protocol metadata here. A candidate row is not published history.
create table repo_grade_admission_private.verified_settlement_claims (
  settlement_id uuid primary key,
  account_id uuid not null,
  generation bigint not null,
  protocol text collate "C" not null,
  executor_id text collate "C" not null,
  outcome text collate "C" not null check (outcome in ('succeeded', 'no-submission', 'partial', 'failed')),
  result_digest text collate "C" check (result_digest ~ '^[0-9a-f]{64}$'),
  evidence_digest text collate "C" not null check (evidence_digest ~ '^[0-9a-f]{64}$'),
  check ((outcome = 'succeeded' and result_digest is not null)
    or (outcome in ('no-submission', 'failed') and result_digest is null)
    or outcome = 'partial'),
  foreign key (account_id, generation, protocol, executor_id)
    references repo_grade_admission_private.sealed_attempts (account_id, generation, protocol, executor_id),
  unique (account_id, generation, settlement_id)
);

-- A row commits the selected immutable claim (including its result digest),
-- operation counters, and release together. This is private admission history
-- with no dashboard read path or public evaluation write.
create table repo_grade_admission_private.settlement_history (
  account_id uuid not null,
  generation bigint not null,
  settlement_id uuid not null,
  settled_at timestamptz not null default pg_catalog.clock_timestamp(),
  untouched bigint not null check (untouched >= 0),
  completed bigint not null check (completed >= 0),
  refused bigint not null check (refused >= 0),
  never_dispatched bigint not null check (never_dispatched >= 0),
  primary key (account_id, generation),
  foreign key (account_id, generation, settlement_id)
    references repo_grade_admission_private.verified_settlement_claims (account_id, generation, settlement_id)
);

alter table repo_grade_admission_private.verified_transport_receipts enable row level security;
alter table repo_grade_admission_private.verified_settlement_claims enable row level security;
alter table repo_grade_admission_private.settlement_history enable row level security;

-- Guard against incidental default ACLs and accidental rewrites. A database
-- administrator can still change DDL. Database administrators are trusted.
create function repo_grade_admission_private.guard_settlement_insert()
returns trigger language plpgsql volatile security invoker set search_path = '' as $$
begin
  if tg_op <> 'INSERT' or pg_catalog.current_setting('transaction_isolation') <> 'read committed'
    or not exists (
    select 1 from pg_catalog.pg_namespace n where n.nspname = 'repo_grade_admission_private'
      and pg_catalog.pg_get_userbyid(n.nspowner) = current_user
  ) then raise exception 'expected an append by the private admission schema owner'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || new.account_id::text, 0));
  return new;
end;
$$;

create trigger verified_transport_receipts_append_only
  before insert or update or delete on repo_grade_admission_private.verified_transport_receipts
  for each row execute function repo_grade_admission_private.guard_settlement_insert();
create trigger verified_transport_receipts_no_truncate
  before truncate on repo_grade_admission_private.verified_transport_receipts
  for each statement execute function repo_grade_admission_private.guard_settlement_insert();
create trigger verified_settlement_claims_append_only
  before insert or update or delete on repo_grade_admission_private.verified_settlement_claims
  for each row execute function repo_grade_admission_private.guard_settlement_insert();
create trigger verified_settlement_claims_no_truncate
  before truncate on repo_grade_admission_private.verified_settlement_claims
  for each statement execute function repo_grade_admission_private.guard_settlement_insert();
create trigger settlement_history_append_only
  before insert or update or delete on repo_grade_admission_private.settlement_history
  for each row execute function repo_grade_admission_private.guard_settlement_insert();
create trigger settlement_history_no_truncate
  before truncate on repo_grade_admission_private.settlement_history
  for each statement execute function repo_grade_admission_private.guard_settlement_insert();

create function repo_grade_admission_private.close_operation(
  p_account_id uuid, p_generation bigint, p_protocol text, p_executor_id text, p_receipt_id uuid
) returns text language plpgsql volatile security invoker set search_path = '' as $$
declare
  receipt repo_grade_admission_private.verified_transport_receipts;
  slot repo_grade_admission_private.operation_slots;
begin
  if p_account_id is null or pg_catalog.current_setting('transaction_isolation') <> 'read committed'
    or not exists (
      select 1 from pg_catalog.pg_namespace n where n.nspname = 'repo_grade_admission_private'
        and pg_catalog.pg_get_userbyid(n.nspowner) = current_user
    ) then return 'rejected'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_account_id::text, 0));

  select r.* into receipt from repo_grade_admission_private.verified_transport_receipts r
  where r.receipt_id = p_receipt_id and r.account_id = p_account_id and r.generation = p_generation
    and r.protocol = p_protocol and r.executor_id = p_executor_id;
  if not found then return 'rejected'; end if;

  select s.* into slot from repo_grade_admission_private.operation_slots s
  where s.account_id = receipt.account_id and s.generation = receipt.generation
    and s.slot_id = receipt.slot_id and s.permit_id = receipt.permit_id;
  if not found then return 'rejected'; end if;
  if slot.closed_at is not null then
    return case when slot.terminal_proof_id = receipt.receipt_id and slot.terminal_outcome = receipt.outcome
      then 'replayed' else 'rejected' end;
  end if;

  -- Preserve terminal evidence after deletion. This cannot release the fence.
  update repo_grade_admission_private.operation_slots s
  set closed_at = pg_catalog.clock_timestamp(), terminal_proof_id = receipt.receipt_id,
    terminal_outcome = receipt.outcome
  where s.account_id = slot.account_id and s.generation = slot.generation and s.slot_id = slot.slot_id
    and s.permit_id = slot.permit_id and s.closed_at is null;
  if not found then raise exception 'consumed operation changed while holding the account lock'; end if;
  return 'applied';
end;
$$;

create function repo_grade_admission_private.settle_attempt(
  p_account_id uuid, p_generation bigint, p_protocol text, p_executor_id text, p_settlement_id uuid
) returns text language plpgsql volatile security invoker set search_path = '' as $$
declare
  attempt repo_grade_admission_private.sealed_attempts;
  claim repo_grade_admission_private.verified_settlement_claims;
  prior_settlement_id uuid;
begin
  if p_account_id is null or pg_catalog.current_setting('transaction_isolation') <> 'read committed'
    or not exists (
      select 1 from pg_catalog.pg_namespace n where n.nspname = 'repo_grade_admission_private'
        and pg_catalog.pg_get_userbyid(n.nspowner) = current_user
    ) then return 'rejected'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_account_id::text, 0));

  select a.* into attempt from repo_grade_admission_private.sealed_attempts a
  where a.account_id = p_account_id and a.generation = p_generation
    and a.protocol = p_protocol and a.executor_id = p_executor_id;
  if not found then return 'rejected'; end if;

  select c.* into claim from repo_grade_admission_private.verified_settlement_claims c
  where c.settlement_id = p_settlement_id and c.account_id = attempt.account_id and c.generation = attempt.generation
    and c.protocol = attempt.protocol and c.executor_id = attempt.executor_id;
  if not found then return 'rejected'; end if;

  -- A replay reports the status only, even after deletion. It writes nothing.
  if attempt.disposition = 'settled' then
    select h.settlement_id into prior_settlement_id from repo_grade_admission_private.settlement_history h
    where h.account_id = attempt.account_id and h.generation = attempt.generation;
    return case when prior_settlement_id = claim.settlement_id then 'replayed' else 'rejected' end;
  end if;

  if not exists (
    select 1 from repo_grade_admission_private.accounts a
    where a.account_id = p_account_id and a.origin = 'v2-only' and a.deleted_at is null
  ) or exists (
    select 1 from repo_grade_admission_private.course_tombstones t
    where t.account_id = p_account_id and t.course_id = attempt.course_id
  ) then return 'rejected'; end if;
  if exists (select 1 from public.repo_grade_reservations r where r.user_id = p_account_id) then
    return 'fenced';
  end if;

  perform 1 from auth.users u where u.id = p_account_id for key share;
  if not found then return 'rejected'; end if;
  if attempt.course_id is not null then
    perform 1 from public.course_hub c where c.id = attempt.course_id and c.user_id = p_account_id for share;
    if not found then return 'rejected'; end if;
  end if;

  attempt.disposition := repo_grade_admission_private.expire_attempt(
    p_account_id, p_generation, p_protocol, p_executor_id
  );
  if attempt.disposition not in ('active', 'unknown') then return 'rejected'; end if;

  if exists (
    select 1 from repo_grade_admission_private.operation_slots s
    where s.account_id = attempt.account_id and s.generation = attempt.generation
      and s.consumed_at is not null and s.closed_at is null
  ) then return 'fenced'; end if;

  insert into repo_grade_admission_private.settlement_history
    (account_id, generation, settlement_id, untouched, completed, refused, never_dispatched)
  select attempt.account_id, attempt.generation, claim.settlement_id,
    count(*) filter (where s.consumed_at is null), count(*) filter (where s.terminal_outcome = 'completed'),
    count(*) filter (where s.terminal_outcome = 'refused'), count(*) filter (where s.terminal_outcome = 'never-dispatched')
  from repo_grade_admission_private.operation_slots s
  where s.account_id = attempt.account_id and s.generation = attempt.generation;

  update repo_grade_admission_private.sealed_attempts a set disposition = 'settled'
  where a.account_id = attempt.account_id and a.generation = attempt.generation
    and a.disposition in ('active', 'unknown');
  if not found then raise exception 'sealed attempt changed while holding the account lock'; end if;
  return 'applied';
end;
$$;

revoke all on table repo_grade_admission_private.verified_transport_receipts,
  repo_grade_admission_private.verified_settlement_claims, repo_grade_admission_private.settlement_history
  from public, anon, authenticated, service_role;
revoke all on function repo_grade_admission_private.guard_settlement_insert(),
  repo_grade_admission_private.close_operation(uuid, bigint, text, text, uuid),
  repo_grade_admission_private.settle_attempt(uuid, bigint, text, text, uuid)
  from public, anon, authenticated, service_role;

rollback;
