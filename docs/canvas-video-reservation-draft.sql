-- Experimental only: executes inside a transaction that always rolls back.
-- No runtime code calls this draft. This is not a production migration.
begin;
create schema canvas_video_private;
revoke all on schema canvas_video_private from public;
create table canvas_video_private.reservations (
  path text primary key,
  owner_id uuid not null,
  reservation_id uuid not null unique,
  created_at timestamptz not null default clock_timestamp(),
  check (path ~ ('^' || owner_id::text || '/grading-uploads/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(mp4|webm|mov|m4v)$'))
);
alter table canvas_video_private.reservations enable row level security;
revoke all on canvas_video_private.reservations from public;
create function canvas_video_private.reserve_video(p_owner uuid, p_path text, p_reservation uuid)
returns boolean language plpgsql security invoker set search_path = pg_catalog, canvas_video_private as $$
begin
  if p_owner is null or p_path is null or p_reservation is null then return false; end if;
  insert into canvas_video_private.reservations(owner_id, path, reservation_id)
  values (p_owner, p_path, p_reservation) on conflict do nothing;
  return found;
exception when check_violation then return false;
end;
$$;
revoke all on function canvas_video_private.reserve_video(uuid, text, uuid) from public;
rollback;
