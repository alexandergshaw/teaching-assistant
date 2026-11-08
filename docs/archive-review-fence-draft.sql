-- ROLLBACK-ONLY DRAFT. No runtime roles, endpoints, Storage policy or grants.
-- A trusted future server must verify the owner/auth session and independently
-- establish the Storage writer boundary before calling these functions.
begin;

create schema archive_review_private;
revoke all on schema archive_review_private from public;

create table archive_review_private.sources (
  review_id uuid primary key,
  owner_id uuid not null,
  auth_session_id uuid not null,
  grading_session_id uuid not null,
  source_id uuid not null unique,
  source_path text generated always as (owner_id::text || '/grading-review-uploads/' || review_id::text || '/' || source_id::text || '.zip') stored unique,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  phase text not null default 'active' check (phase in ('active', 'deleting', 'deleted')),
  source_sha256 text check (source_sha256 is null or source_sha256 ~ '^[a-f0-9]{64}$'),
  snapshot jsonb check (snapshot is null or (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 1048576)),
  writer_boundary_verified boolean not null default false,
  capabilities_never_issued boolean not null default false,
  delete_token uuid,
  check (review_id <> '00000000-0000-0000-0000-000000000000'::uuid and owner_id <> '00000000-0000-0000-0000-000000000000'::uuid and auth_session_id <> '00000000-0000-0000-0000-000000000000'::uuid and grading_session_id <> '00000000-0000-0000-0000-000000000000'::uuid and source_id <> '00000000-0000-0000-0000-000000000000'::uuid),
  check (expires_at > created_at and expires_at <= created_at + interval '1 hour'),
  check ((phase = 'active' and delete_token is null) or (phase in ('deleting', 'deleted') and delete_token is not null))
);

create table archive_review_private.operations (
  review_id uuid not null references archive_review_private.sources(review_id),
  operation_id uuid not null check (operation_id <> '00000000-0000-0000-0000-000000000000'::uuid),
  kind text not null check (kind in ('read', 'write')),
  phase text not null check (phase in ('active', 'ended')),
  primary key (review_id, operation_id)
);
create index archive_review_active_ops on archive_review_private.operations(review_id, kind) where phase = 'active';
create index archive_review_expiry on archive_review_private.sources(expires_at) where phase = 'active';
alter table archive_review_private.sources enable row level security;
alter table archive_review_private.operations enable row level security;
revoke all on all tables in schema archive_review_private from public;

-- These functions are SECURITY INVOKER. Their principal arguments are not
-- authentication; only a trusted server with independently verified claims
-- could ever be granted access, which this draft deliberately does not do.
create function archive_review_private.start_operation(
  p_owner uuid, p_auth_session uuid, p_grading_session uuid, p_review uuid, p_operation uuid, p_kind text
) returns text language plpgsql set search_path = pg_catalog as $$
declare s archive_review_private.sources%rowtype;
begin
  select * into s from archive_review_private.sources where review_id = p_review and owner_id = p_owner and auth_session_id = p_auth_session and grading_session_id = p_grading_session for update;
  if not found or s.phase <> 'active' or s.expires_at <= clock_timestamp() or not s.writer_boundary_verified or not s.capabilities_never_issued or p_operation is null or p_operation = '00000000-0000-0000-0000-000000000000'::uuid or p_kind not in ('read', 'write') or p_kind is null then return 'unavailable'; end if;
  if (select count(*) from archive_review_private.operations where review_id = p_review) >= 1000 or exists (select 1 from archive_review_private.operations where review_id = p_review and operation_id = p_operation) then return 'unavailable'; end if;
  if p_kind = 'write' and (s.source_sha256 is not null or exists (select 1 from archive_review_private.operations where review_id = p_review and phase = 'active')) then return 'unavailable'; end if;
  if p_kind = 'read' and (s.source_sha256 is null or s.snapshot is null or exists (select 1 from archive_review_private.operations where review_id = p_review and phase = 'active' and kind = 'write')) then return 'unavailable'; end if;
  insert into archive_review_private.operations(review_id, operation_id, kind, phase) values (p_review, p_operation, p_kind, 'active');
  return 'started';
end $$;

-- The trusted future caller must independently prove external work quiescent;
-- a timeout, expired lease or lost response is not such proof.
create function archive_review_private.finish_operation(
  p_owner uuid, p_auth_session uuid, p_grading_session uuid, p_review uuid, p_operation uuid, p_outcome text, p_sha256 text default null, p_snapshot jsonb default null
) returns text language plpgsql set search_path = pg_catalog as $$
declare s archive_review_private.sources%rowtype; op archive_review_private.operations%rowtype;
begin
  select * into s from archive_review_private.sources where review_id = p_review and owner_id = p_owner and auth_session_id = p_auth_session and grading_session_id = p_grading_session for update;
  if not found or s.phase <> 'active' then return 'unavailable'; end if;
  select * into op from archive_review_private.operations where review_id = p_review and operation_id = p_operation and phase = 'active';
  if not found then return 'unavailable'; end if;
  if op.kind = 'read' and (p_outcome is distinct from 'read-quiesced' or p_sha256 is not null or p_snapshot is not null) then return 'pending'; end if;
  if op.kind = 'write' then
    if p_outcome = 'write-verified-stored' and p_sha256 ~ '^[a-f0-9]{64}$' and s.source_sha256 is null and s.snapshot is null then
      if jsonb_typeof(p_snapshot) is distinct from 'object' or p_snapshot->>'sourceSha256' is distinct from p_sha256 or jsonb_typeof(p_snapshot->'members') is distinct from 'array' or octet_length(p_snapshot::text) > 1048576 then return 'pending'; end if;
      if jsonb_array_length(p_snapshot->'members') = 0 or jsonb_array_length(p_snapshot->'members') > 1000 then return 'pending'; end if;
      update archive_review_private.sources set source_sha256 = p_sha256, snapshot = p_snapshot where review_id = p_review;
    elsif p_outcome = 'write-verified-absent' and p_sha256 is null and p_snapshot is null and s.source_sha256 is null and s.snapshot is null then
      null;
    else return 'pending'; end if;
  end if;
  update archive_review_private.operations set phase = 'ended' where review_id = p_review and operation_id = p_operation and phase = 'active';
  return 'ended';
end $$;

-- Tombstones have no timeout and are never deleted by this draft. Returned
-- paths are internal only; they are not a grant to access Storage.
create function archive_review_private.tombstone_source(
  p_owner uuid, p_auth_session uuid, p_grading_session uuid, p_review uuid, p_token uuid
) returns table (status text, source_path text, token uuid) language plpgsql set search_path = pg_catalog as $$
declare s archive_review_private.sources%rowtype;
begin
  select * into s from archive_review_private.sources where review_id = p_review and owner_id = p_owner and auth_session_id = p_auth_session and grading_session_id = p_grading_session for update;
  if not found then return query select 'unavailable'::text, null::text, null::uuid; return; end if;
  if s.phase = 'deleting' then return query select 'deleting'::text, s.source_path, s.delete_token; return; end if;
  if s.phase <> 'active' or s.expires_at > clock_timestamp() or not s.writer_boundary_verified or not s.capabilities_never_issued or p_token is null or p_token = '00000000-0000-0000-0000-000000000000'::uuid or exists (select 1 from archive_review_private.operations where review_id = p_review and phase = 'active') then return query select 'unavailable'::text, null::text, null::uuid; return; end if;
  update archive_review_private.sources set phase = 'deleting', delete_token = p_token where review_id = p_review;
  return query select 'deleting'::text, s.source_path, p_token;
end $$;

-- The trusted caller must first verify the exact Storage delete response.
-- Empty, ambiguous, timed-out or lost responses must not call this function.
create function archive_review_private.mark_deleted(
  p_owner uuid, p_auth_session uuid, p_grading_session uuid, p_review uuid, p_token uuid, p_removed_path text
) returns text language plpgsql set search_path = pg_catalog as $$
declare s archive_review_private.sources%rowtype;
begin
  select * into s from archive_review_private.sources where review_id = p_review and owner_id = p_owner and auth_session_id = p_auth_session and grading_session_id = p_grading_session for update;
  if not found or s.phase <> 'deleting' or s.delete_token is distinct from p_token or s.source_path is distinct from p_removed_path then return 'unavailable'; end if;
  update archive_review_private.sources set phase = 'deleted' where review_id = p_review;
  return 'deleted';
end $$;

revoke all on all functions in schema archive_review_private from public;
rollback;
