-- Cache of per-item accessibility scan results (backlog row A11Y-RLS, branch A1
-- - deny-all). Formerly hand-run from src/lib/supabase/accessibility_scans.sql
-- ("Run once in the Supabase SQL editor"); that file sat outside
-- supabase/migrations, so this repo could never tell whether the table existed
-- in production or whether RLS had been enabled on it by hand
-- (docs/accessibility-scans-rls-scope.md section 2, section 7 item 1-2). This
-- migration is the fix for that half regardless of which production state it
-- finds: `create table if not exists` and `enable row level security` both
-- converge to the same end state whether the table already exists (created by
-- the old hand-run DDL) or does not exist yet - so this migration is safe to
-- apply without knowing which one is true.
--
-- All 12 columns and the one index are carried over VERBATIM from the retired
-- DDL file; nothing about the table's shape changes here.
--
-- RLS - READ THIS TWICE, same shape as
-- supabase/migrations/20261015000000_lms_credentials.sql's SEC6 note. There is
-- deliberately ZERO policy of any kind on this table - not select, not insert,
-- not update, not delete. The only legitimate accessor is the service-role
-- client in src/lib/supabase/accessibility.ts (createServiceClient, three call
-- sites), which bypasses RLS entirely and carries no JWT - auth.uid() is null
-- under it, so an own-row policy would not even apply to that client. Deny-all
-- closes the cross-tenant exposure the docs/accessibility-scans-rls-scope.md
-- and its check documented (any holder of the anon key could otherwise reach
-- this table's rows directly through PostgREST, with no route or guard of
-- this app's own in between) while the feature keeps working exactly as
-- before, because nothing that keeps working reads or writes this table any
-- other way.
--
-- If a future change ever "simplifies" this by adding an own-row SELECT (or
-- any other) policy so some client component can read or write directly -
-- stop. That is exactly the mistake this comment exists to prevent. Every
-- legitimate read and write already goes through
-- src/lib/supabase/accessibility.ts's three accessors using the service-role
-- client; add a server action that calls one of those instead.
--
-- NO FOREIGN KEY to auth.users, unlike every sibling user_id column in this
-- migration history. Adding one here is not safe by construction: if the
-- table already exists in production and holds rows whose user_id no longer
-- has an auth.users row (exactly what a table with no cascade accumulates),
-- `alter table ... add constraint ... references auth.users` fails on apply,
-- and a failed migration under this repo's auto-apply Action blocks every
-- migration after it. The cache is regenerable by design (rows are keyed by a
-- change-detection fingerprint and are safe to lose), so an orphaned row costs
-- storage and nothing else - a decision an owner can revisit later as its own
-- row, never bundled with this deny-all fix.
--
-- Written idempotently: migrations auto-apply via a GitHub Action on push to
-- main and may re-run.

create table if not exists public.accessibility_scans (
  user_id          uuid        not null,
  institution      text        not null default '',
  course_id        text        not null,
  item_type        text        not null,
  item_id          text        not null,
  item_title       text        not null default '',
  fingerprint      text        not null,
  error_count      integer     not null default 0,
  warning_count    integer     not null default 0,
  suggestion_count integer     not null default 0,
  issues           jsonb       not null default '[]'::jsonb,
  scanned_at       timestamptz not null default now(),
  primary key (user_id, institution, course_id, item_type, item_id)
);

create index if not exists accessibility_scans_course_idx
  on public.accessibility_scans (user_id, institution, course_id);

alter table public.accessibility_scans enable row level security;

-- Deliberately no policy at all - see the RLS section of this migration's
-- header. Every legitimate access path is the service-role client from
-- src/lib/supabase/accessibility.ts, which bypasses RLS and carries no JWT
-- (auth.uid() is null under it, so a policy keyed on auth.uid() would not
-- even apply to that client - it exists purely for the client this table
-- must never talk to directly).
