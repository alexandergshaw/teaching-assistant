-- Multi-user login, Group A: the account/role/status table that replaces the
-- OWNER_EMAILS-only allowlist as the app's only authorization decision.
-- docs/multi-user-login-acceptance-criteria.md A1-A3;
-- docs/multi-user-login-architecture.md's "RESOLVED 1"/"RESOLVED 2" settle
-- the table's name and the trigger's role over the earlier draft of that
-- document - see this migration's own notes below for what changed and why.
--
-- NAMED app_users, NOT profiles. "profile" already names something else in
-- this schema (course_hub.instructor_profile, migration
-- 20260920000000_*), so a `profiles` table here would read as the
-- instructor's teaching profile rather than the account record it actually
-- is. Roles are 'owner' | 'instructor' for the same reason - this app has no
-- concept of a generic "member".
--
-- THE TRIGGER IS LOAD-BEARING, NOT INSURANCE. Sign-up happens in the BROWSER
-- via supabase.auth.signUp(), so no server code in this repository is
-- guaranteed to run at account-creation time - there is no request for a
-- server action to hook into. The request gate that will consult this table
-- (a later wave) needs to be able to read a row on that account's very
-- first request, and it must not treat "no row" as "allowed" - that is
-- exactly the fail-open this table exists to prevent. So the row is created
-- by a database trigger on auth.users, which cannot be skipped by any
-- account-creation path (browser sign-up, the Supabase dashboard, or
-- auth.admin.inviteUserByEmail all insert into auth.users the same way).
-- The application layer (src/lib/supabase/app-users.ts, a later wave) only
-- ever RECONCILES an already-existing row against OWNER_EMAILS; it never
-- has to create one for the fast path to be safe.
--
-- THIS IS THE REPO'S FIRST SECURITY DEFINER FUNCTION AND FIRST TRIGGER ON
-- auth.users. Both are exceptions to how every other piece of business logic
-- in this schema works (plain tables, RLS, and application code), made
-- because nothing else can reach the account-creation moment:
--   - security definer is required because the trigger's inserting role
--     (whatever runs auth.users inserts) has no privilege on public.app_users
--     on its own; the function must run as its OWNER to write the row.
--   - set search_path = '' is MANDATORY per Supabase's own hardening
--     guidance for security definer functions: an unqualified name inside
--     the function body would otherwise resolve against whatever
--     search_path the CALLER happens to have, which is an injection vector
--     (a caller could create a same-named object earlier in their own
--     search_path and have this function silently operate on it instead).
--     Every reference below is schema-qualified (public.app_users) so an
--     empty search_path breaks nothing.
--
-- BACKFILL: every account that predates this migration gets status =
-- 'pending' - the column default, which is why the INSERT below does not
-- name a status column at all - NOT 'active'. An earlier draft of this
-- migration backfilled 'active' on the theory that it "preserves the status
-- quo" for pre-existing accounts. That was backwards, not conservative:
-- under today's OWNER_EMAILS-only gate (src/lib/owner.ts,
-- src/lib/supabase/middleware.ts), an account whose email is NOT in
-- OWNER_EMAILS has NO access at all - it is redirected to /login on every
-- request. Backfilling every auth.users row to 'active' would GRANT access
-- to every such account: stale test accounts, an abandoned signup, anything
-- created from the Supabase dashboard. That is a fail-open INTRODUCED by
-- this migration, not a status preserved by it.
--
-- 'pending' has neither failure mode, for either side of the allowlist:
--   - A non-allowlisted legacy account keeps exactly the no-access it has
--     today - 'pending' is not 'active', so the request gate (a later wave)
--     still turns it away, same as before this migration existed.
--   - The deployment owner is NOT locked out by it. resolveAccess (a later
--     wave - see src/lib/access.test.ts for its pinned contract) resolves an
--     OWNER_EMAILS match to 'owner' access WITHOUT consulting this table at
--     all - the break-glass path (src/lib/owner.ts#isOwnerEmail is pure and
--     needs no database row) - and ensureAppUser() (this file's sibling,
--     src/lib/supabase/app-users.ts) then reconciles that account's stored
--     row to role='owner', status='active' on its very next sign-in, the
--     same reconciliation path a brand-new owner signup goes through. See AC
--     A8 and the "AC amendments from the admin-capability pass" section of
--     docs/multi-user-login-acceptance-criteria.md.
--
-- role is likewise left at its column default ('instructor') rather than
-- guessed from an env var Postgres cannot read: OWNER_EMAILS is a
-- process.env value, and a backfill that guessed at role from a hardcoded
-- email list here would silently drift from OWNER_EMAILS the moment someone
-- edited the env var without also editing this migration. ensureAppUser()'s
-- reconciliation above is what actually sets role='owner' for an allowlisted
-- email.
--
-- A row inserted BY THE TRIGGER (i.e. every account created from now on)
-- defaults to status = 'pending', unlike the backfill above. This is
-- deliberate and fail-closed: a brand-new account must be explicitly
-- reconciled (allowlisted -> active) or approved by an owner before it can
-- do anything, per the approval-mode default in
-- docs/multi-user-login-acceptance-criteria.md.
--
-- RLS - READ THIS TWICE, IT IS THE SECURITY CORE OF THIS TABLE. Postgres RLS
-- is ROW level, not COLUMN level. A policy shaped like
-- `for update using (auth.uid() = id)` would let a signed-in user run
-- `update app_users set role = 'owner' where id = auth.uid()` and grant
-- themselves ownership - self-service privilege escalation, the single worst
-- thing this table could allow. So:
--   - Exactly ONE policy exists: `for select using (auth.uid() = id)`, so a
--     signed-in user (and only an RLS-respecting browser client - the
--     server's service-role client bypasses RLS regardless) can read their
--     own row and nothing else.
--   - There is NO insert, update, or delete policy for `authenticated`. All
--     writes - creating a row when the trigger has not (a legacy account),
--     approving, suspending, promoting, demoting - go through the
--     service-role client from src/lib/supabase/app-users.ts, gated by an
--     application-level owner check. app_users is the FIRST table in this
--     schema with zero write-policy coverage for `authenticated` - there is
--     no precedent to point to, and an earlier draft of this comment claimed
--     one that does not exist. grading_dismissals
--     (20260623000000_create_grading_dismissals.sql:18-22) is NOT that
--     precedent: it grants `authenticated` a single `for all using
--     (auth.uid() = user_id) with check (auth.uid() = user_id)` policy,
--     which covers INSERT, UPDATE and DELETE, not merely SELECT. The
--     application code in src/lib/grading-dismissals.ts happens to write
--     through the service-role client anyway, but that is a stylistic
--     choice for that (lower-stakes) module, not a constraint the schema
--     enforces there the way it does here - a cookie-bound client could
--     write to grading_dismissals directly today. app_users is stricter by
--     design: no client-side path to a write exists at all, RLS-respecting
--     or not.
--
-- BELT AND BRACES: a BEFORE UPDATE trigger additionally rejects, at the
-- database level, any update that changes `role` or `status` on a caller's
-- OWN row (auth.uid() = old.id) - even if a future migration mistakenly adds
-- a self-service update policy, or a service-role code path has a bug that
-- lets a request-scoped id flow into an update it shouldn't. This does nothing
-- to a service-role write updating SOMEONE ELSE's row (the normal admin
-- path: an owner approving another account), because auth.uid() there is
-- either null (service-role has no JWT) or does not equal the target row's
-- id. It exists purely as a second, independent layer under the policy set,
-- because "no write policy exists" is exactly the kind of invariant a later
-- migration can loosen by accident without anyone noticing until it is
-- exploited.
--
-- Written idempotently: migrations auto-apply via a GitHub Action on push to
-- main, so a non-idempotent statement here breaks every future deploy, not
-- just this one.
--
-- ============================================================================
-- IF THIS TABLE IS EVER DROPPED - EXACT DROP ORDER. There is no rollback/down
-- migration convention anywhere in supabase/migrations/ (100 files, all
-- forward-only) and this migration is not introducing one. This block exists
-- for a narrower reason: this migration leaves behind the repo's FIRST
-- trigger on auth.users, and "clean up" by dropping public.app_users without
-- dropping that trigger first leaves a trigger function that references a
-- table which no longer exists - every subsequent sign-up (browser sign-up,
-- a Supabase dashboard invite, auth.admin.inviteUserByEmail, all of them,
-- project-wide) then fires that trigger and fails at the INSERT. The
-- exception-swallow added below (see "ANY EXCEPTION IS SWALLOWED" in
-- handle_new_auth_user's own comment) makes getting this order wrong
-- SURVIVABLE - the insert fails silently and the account is still created -
-- rather than fatal. This comment is belt AND braces on top of that, not a
-- substitute for it: paste these statements, in this exact order, into a
-- manual migration or the SQL editor if this table is ever retired.
--
--   drop trigger if exists on_auth_user_created on auth.users;
--   drop function if exists public.handle_new_auth_user();
--   drop table if exists public.app_users;
--
-- (prevent_app_users_self_role_status_change's trigger lives ON app_users
-- itself, so dropping the table above cascades it automatically - only the
-- two auth.users-side objects need an explicit statement, and they need it
-- BEFORE the table, not after.)
-- ============================================================================

-- email is NULLABLE, not `not null`. auth.users.email itself is nullable
-- (phone and anonymous-provider accounts have no email at all), and the
-- handle_new_auth_user trigger below inserts new.email verbatim - a `not
-- null` constraint here would turn every phone/anonymous sign-up into a
-- trigger exception that ROLLS BACK the auth.users insert, i.e. an opaque
-- 500 with no account created. A null is the honest value for those
-- accounts; a placeholder string was considered and rejected, because it
-- would collide with itself on app_users_email_lower_idx (below) the moment
-- a second such account existed, which is the exact failure this column
-- exists to avoid. A plain unique index treats every null as distinct from
-- every other null, so any number of email-less accounts can coexist under
-- app_users_email_lower_idx without a collision.
create table if not exists public.app_users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  role text not null default 'instructor' check (role in ('owner', 'instructor')),
  approved_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.app_users.email is
  'Copied from auth.users.email at row-creation time (trigger) or backfill. NULLABLE: a phone-auth or anonymous account has no email in auth.users, and this column must accept that rather than fail the insert that creates the account - see the comment above this table.';
comment on column public.app_users.status is
  'pending: awaiting owner approval (the default for a brand-new account - see the trigger below). active: full access. suspended: access revoked. Never writable by the account''s own row - see the BEFORE UPDATE trigger.';
comment on column public.app_users.role is
  'instructor: normal account (the default). owner: full access plus the admin surface. Reconciled from OWNER_EMAILS by ensureAppUser() (src/lib/supabase/app-users.ts) on sign-in - never set directly by this migration''s backfill, because Postgres cannot read process.env. Never writable by the account''s own row.';
comment on column public.app_users.approved_at is
  'Set by setAppUserStatus (src/lib/supabase/app-users.ts) the moment a status transition lands on ''active''. Null for a row that has never been actively approved (including every OWNER_EMAILS-reconciled owner row and every pre-migration backfilled row, neither of which went through an explicit approval action).';
comment on column public.app_users.approved_by is
  'The auth.users id of the owner who approved this account, set alongside approved_at. on delete set null: the approving owner''s own account being deleted later must not cascade-delete the account they approved.';

-- Added after the table's initial shape, via idempotent ALTER TABLE rather
-- than folded into the CREATE TABLE column list above, so this migration
-- stays safe to re-run in an environment where it already ran once before
-- these two columns existed.
--
-- approved_at/approved_by (above) record only the approve transition.
-- Suspend, restore, promote and demote - the three actions that revoke
-- access and the one that grants full ownership - left no record of who did
-- it or when. These two columns cover every role/status write, not only the
-- one that lands on 'active'.
alter table public.app_users add column if not exists status_changed_at timestamptz;
alter table public.app_users add column if not exists status_changed_by uuid references auth.users (id) on delete set null;

comment on column public.app_users.status_changed_at is
  'Set by setAppUserStatus AND setAppUserRole (src/lib/supabase/app-users.ts) on every write either makes - approve, suspend, restore, promote, demote alike - unlike approved_at, which only ever stamps the transition onto ''active''. Null for a row that predates this column and has not been touched by either function since.';
comment on column public.app_users.status_changed_by is
  'The auth.users id of the owner who made the change, set alongside status_changed_at by the same two functions. on delete set null: the acting owner''s own account being deleted later must not cascade-delete the accounts whose role or status they changed.';

-- Serves the admin surface's "pending accounts sort first" listing (AC C1)
-- and any future dashboard count of accounts awaiting approval.
create index if not exists app_users_status_idx
  on public.app_users (status);

-- Enforces one account per email case-insensitively (two auth.users rows can
-- exist for differently-cased emails; this table must not treat them as two
-- distinct app accounts) and serves case-insensitive email lookups.
create unique index if not exists app_users_email_lower_idx
  on public.app_users (lower(email));

alter table public.app_users enable row level security;

drop policy if exists "Users read own app_users row" on public.app_users;
create policy "Users read own app_users row"
  on public.app_users for select
  using (auth.uid() = id);

-- Deliberately no insert/update/delete policy for `authenticated` - see the
-- header comment. All writes go through the service-role client behind an
-- application-level owner check in src/lib/supabase/app-users.ts.

-- Belt-and-braces guard against self-service privilege escalation: even a
-- write that somehow reaches this table under the caller's own identity (a
-- policy added by mistake later, or a bug in a service-role code path that
-- passes through a request-scoped id) can never change that same row's own
-- role or status. search_path is left at its normal value here (unlike the
-- insert trigger below) because this function is NOT security definer - it
-- runs as whatever role performs the update and touches no table other than
-- the one the update statement itself is already operating on.
create or replace function public.prevent_app_users_self_role_status_change()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and auth.uid() = old.id then
    if new.role is distinct from old.role or new.status is distinct from old.status then
      raise exception 'app_users: a user cannot change their own role or status';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists app_users_prevent_self_role_status_change on public.app_users;
create trigger app_users_prevent_self_role_status_change
  before update on public.app_users
  for each row execute function public.prevent_app_users_self_role_status_change();

-- Creates the row at account-creation time so the request gate never has to
-- treat "no row" as "allowed". security definer + set search_path = '' are
-- both deliberate exceptions to this schema's normal style - see the header
-- comment for why each is necessary and safe here.
--
-- This trigger runs AFTER INSERT on auth.users, so ANY exception it raises
-- rolls back that auth.users insert - the account is never created and the
-- user sees an opaque 500. Two known raisers are defused directly:
--   - `on conflict do nothing` names NO conflict target, which (per Postgres'
--     own semantics for a target-less DO NOTHING) suppresses a violation of
--     ANY unique or exclusion constraint on the table - both the `id`
--     primary key AND app_users_email_lower_idx. A narrower `on conflict
--     (id) do nothing` would leave a case-differing duplicate email (two
--     auth.users rows whose emails differ only in case) free to raise a
--     unique violation here and roll back the sign-up that triggered it.
--   - email itself can now be null (see the column's comment above), so a
--     phone/anonymous account's insert no longer raises a not-null
--     violation in the first place.
--
-- ANY EXCEPTION IS SWALLOWED, on top of those two - not only the two named
-- above. This repo has 100 migrations and an auto-applying pipeline with no
-- down migrations: `public.app_users` being dropped, or the role this
-- function runs as losing privilege on it, is a real future state this
-- trigger has to survive, not a hypothetical. Unlike a Vercel rollback (one
-- click), this trigger cannot be rolled back - it keeps firing on every
-- sign-up, including dashboard invites, until a new migration changes it.
-- Deliberately fail-open here, not fail-closed: a sign-up that succeeds with
-- no app_users row is recoverable two ways that both predate this change -
--   - ensureAppUser() (src/lib/supabase/app-users.ts) inserts the missing
--     row itself on that account's very next request, and
--   - the request gate (a later wave) treats "no row" as `pending` (no
--     access), never as `active` (full access) - so a swallowed exception
--     can only ever delay the row, never grant access it shouldn't.
-- A sign-up that cannot happen at all has no such recovery path, which is
-- why that failure mode - not this one - is the one worth trading away.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.app_users (id, email)
    values (new.id, new.email)
    on conflict do nothing;
  exception
    when others then
      return new;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Backfill: every account that predates this migration gets a row with
-- status left at its column default ('pending') and role left at its column
-- default ('instructor') - see the header comment's BACKFILL paragraph for
-- why 'pending', not 'active', is what preserves today's access rather than
-- expanding it, and why role cannot be guessed from OWNER_EMAILS here.
--
-- `on conflict do nothing` names no target, so (as in handle_new_auth_user
-- above) it absorbs a violation of EITHER unique constraint - `id` (a row
-- already created by the trigger, were this migration ever re-run after new
-- accounts exist) or app_users_email_lower_idx (two pre-existing auth.users
-- accounts whose emails differ only in case). Without that, a single
-- collision in either constraint would raise inside this bulk INSERT...SELECT
-- and fail the whole statement - and because migrations auto-apply via a
-- GitHub Action on push to main, that means failing the deploy itself, not
-- just this table's backfill. email can be null here for the same reason it
-- is nullable on the table: a pre-existing phone/anonymous auth.users row
-- has no email to copy.
insert into public.app_users (id, email)
select id, email
from auth.users
on conflict do nothing;
