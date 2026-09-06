-- Multi-user login follow-up: write app_users.display_name AT INSERT TIME,
-- from the trigger, instead of leaving it for application code to fill in
-- later. See supabase/migrations/20261012000000_create_app_users.sql for the
-- table, the trigger this migration replaces, and every constraint on
-- handle_new_auth_user this migration must preserve exactly.
--
-- THE BUG THIS FIXES: nothing in this repository writes `user_metadata`, so
-- the application-side fallback that reads a name out of it
-- (`nameFromAuthMetadata`, src/lib/supabase/app-users.ts) has never had
-- anything to read - every row's display_name has been null since the table
-- was created. That is already a latent gap, but it is not the sharp part.
-- The sharp part is WHO it hits: `nameFromAuthMetadata` only ever runs from
-- `ensureAppUser`, and `ensureAppUser` is only ever reached from
-- `requireUser()` AFTER that function's own deny check - so a `pending` or
-- `suspended` account is turned away before `ensureAppUser` runs for it at
-- all. The account sitting in the owner's approval queue is exactly the
-- account whose name can never be written by the application layer, and the
-- pending-accounts screen is the one place in this app where a human name is
-- the entire point - an owner would triage a list of blank names next to bare
-- email addresses. Filling the name from the TRIGGER, which fires
-- unconditionally on every `auth.users` insert regardless of the account's
-- resulting status, is what reaches that population at all.
--
-- WHERE THE NAME COMES FROM AND WHY: `new.raw_user_meta_data->>'full_name'`
-- is the same field `nameFromAuthMetadata`'s own fallback chain checks first
-- (src/lib/supabase/app-users.ts), and it is populated whenever a caller
-- passes `options: { data: { full_name: ... } }` to `supabase.auth.signUp()`
-- - the standard place a sign-up form's display name ends up in Supabase Auth
-- before any application code ever runs. `trim()` collapses a
-- whitespace-only value to empty, `nullif(..., '')` turns that empty string
-- into `null` (so a blank submission stores `null`, not `''`), and
-- `left(..., 120)` bounds the length.
--
-- WHY 120, AND WHY THIS IS A BACKSTOP, NOT THE SANITISER: 120 matches
-- `DISPLAY_NAME_MAX_LENGTH` in src/lib/display-name.ts exactly, so a name
-- that reaches this trigger already within the application's own bound is
-- never further truncated by this migration on top of that. But `left()`
-- here is a length backstop ONLY - a raw character count, unicode-code-point-
-- unaware at surrogate-pair boundaries, and it does nothing at all about
-- control characters, zero-width characters, or the bidi-override characters
-- that `clampDisplayName` (src/lib/display-name.ts) exists specifically to
-- strip (see that module's own header comment: this is about impersonation
-- and layout, not just a length limit). `raw_user_meta_data` is writable
-- directly from the browser against Supabase Auth with the public anon key,
-- so a value can reach this trigger having gone through no application
-- validation at all. This migration does not attempt that sanitisation in
-- SQL - `clampDisplayName` remains the one real sanitiser, and it still runs
-- on the application side: `nameFromAuthMetadata`/`ensureAppUser` apply it to
-- the SAME `raw_user_meta_data` fields on every request that reaches
-- `requireUser()`'s reconciliation path, and `displayNameFillNeeded` means an
-- unclamped value written here by this trigger is only ever a STARTING
-- point - the first authorized request for that account that finds the
-- stored name still equal to whatever this trigger wrote will not re-fill it
-- (the column is already non-empty), but any code that renders
-- `display_name` must still treat it as self-asserted, not previously
-- untrusted, exactly as display-name.ts's own header comment already
-- requires of every caller. Put plainly: this migration exists to make sure
-- the column is filled in for the population that could never reach the
-- application-side clamp in the first place, not to replace that clamp.
--
-- OBSERVABILITY FIX: the exception handler now RAISES A WARNING, with the
-- failing id and the underlying SQLSTATE/SQLERRM, BEFORE it returns - the
-- reliability review's finding that a swallowed insert here previously left
-- no trace anywhere. Deliberately `raise warning`, not `raise exception`:
-- this trigger's entire reason for swallowing `others` (see the 20261012
-- migration's own header, "ANY EXCEPTION IS SWALLOWED") is that a failure
-- here must never roll back the `auth.users` insert it is attached to and
-- break sign-up - a `raise warning` writes to the Postgres log and does not
-- interrupt execution, whereas `raise exception` would re-introduce exactly
-- the failure mode this trigger was built to avoid. This is the only change
-- to that exception path; the swallow itself, and every reason for it, is
-- unchanged from the prior migration.
--
-- EVERYTHING ELSE IS UNCHANGED FROM THE PRIOR MIGRATION, on purpose, because
-- each of the following is independently load-bearing (see
-- 20261012000000_create_app_users.sql for the full reasoning behind each):
--   - `security definer` and `set search_path = ''` are both kept, and every
--     table reference remains schema-qualified (`public.app_users`). The
--     three new built-ins this insert calls - `trim`, `nullif`, `left` - are
--     all resolved from `pg_catalog`, which Postgres always searches
--     regardless of `search_path` (including when it is empty), so none of
--     them need - or accept - schema-qualification.
--   - `on conflict do nothing` remains TARGET-LESS. Naming a target (e.g.
--     `on conflict (id) do nothing`) would stop absorbing a violation of the
--     separate unique `lower(email)` index (a case-differing duplicate
--     email), exactly the regression the prior migration's own comment
--     warns against.
--   - The blanket `exception when others then ... return new` still runs
--     for ANY failure, not only a display_name-related one, so this trigger
--     still can never roll back the `auth.users` insert it is attached to.
--   - The statement is a `create or replace function`, so this migration is
--     safe to re-run - migrations in this repository auto-apply via a
--     GitHub Action on push to main, and a non-idempotent statement here
--     would break every future deploy, not just this one. The trigger
--     itself (`on_auth_user_created`) is not redefined by this migration:
--     it already points at `public.handle_new_auth_user` by name, and
--     replacing that function's body is sufficient to change its behavior
--     on the very next invocation - no `drop trigger`/`create trigger` is
--     needed alongside a body-only change.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.app_users (id, email, display_name)
    values (
      new.id,
      new.email,
      left(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), 120)
    )
    on conflict do nothing;
  exception
    when others then
      -- Observability fix: a swallowed insert used to leave no trace
      -- anywhere, making a row-less account undiagnosable. This does not
      -- change control flow - `return new` still runs immediately after,
      -- and `auth.users` is never rolled back.
      raise warning 'handle_new_auth_user: could not create app_users row for auth.users id %: % (SQLSTATE %)',
        new.id, sqlerrm, sqlstate;
      return new;
  end;
  return new;
end;
$$;
