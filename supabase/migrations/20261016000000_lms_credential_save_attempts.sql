-- A per-user log of Canvas credential save/probe attempts, backing SEC9's
-- rate limit (docs/lms-credentials-acceptance-criteria.md). Read and written
-- exclusively through src/lib/lms-credential-save-attempts.ts, the ONLY
-- module that touches this table - the same "one module owns this table"
-- convention 20261015000000_lms_credentials.sql already documents for
-- lms_credentials.
--
-- WHY THIS TABLE HAS TO EXIST AT ALL. E-UX3 gives the credential-save flow a
-- fourth, more precise failure outcome ("that host answered, but it is not a
-- Canvas host"), and the AC states plainly that keeping that outcome distinct
-- "hands a signed-in user a reachability probe of public hosts - and that
-- trade is CONDITIONAL on SEC9's rate limit shipping in the same change. If
-- it does not, the outcomes collapse." The rate limit therefore has to be
-- REAL - durable and shared across every server instance answering a
-- request - not a per-process convenience. An in-memory counter inside the
-- server action (this table's predecessor) resets on every cold start and is
-- not visible to any other concurrently running instance, which on this
-- deployment (Vercel, serverless) is equivalent to no limit at all.
--
-- WHAT A ROW MEANS AND WHY THE PK IS A BARE SURROGATE ID, NOT A COMPOSITE
-- NATURAL KEY. Each row is one attempt event: this user, at this instant -
-- nothing else (see the column comments below for why not one field more).
-- There is no natural uniqueness here the way (user_id, institution) is
-- naturally unique for lms_credentials: two attempts by the same user can
-- legitimately land in the same request or the same millisecond (a client
-- double-submit, two browser tabs), so (user_id, attempted_at) is not a safe
-- uniqueness key even though attempted_at is NOT NULL. `id uuid primary key
-- default gen_random_uuid()` sidesteps the question entirely by not deriving
-- identity from the attempt's own data at all.
--
-- THIS TABLE NEVER UPSERTS, AND THAT IS THE POINT, NOT AN OVERSIGHT. This
-- repo has a hard-won lesson on record (20261011000000, and again in
-- 20261015000000's own header): a nullable column cannot serve as a
-- PostgREST upsert arbiter - `.upsert({ onConflict: ... })` needs a real,
-- non-partial unique constraint backing that exact column list, or Postgres
-- raises 42P10 because it cannot infer which constraint ON CONFLICT means. It
-- is called out here even though it does not bite this table, precisely
-- because it is the kind of trap a later "simplification" reaches for
-- without reading this far: a tempting-looking alternative design collapses
-- every user's attempts into ONE row per user (or per user+window-bucket)
-- with a count column, upserted and incremented on each attempt. That design
-- would need a real unique constraint on user_id (or on (user_id,
-- window_bucket)) to upsert against, so the 42P10 trap would apply to IT -
-- but it is rejected here for a more basic reason first: the rate limiter's
-- own decision function, mayAttemptLmsCredentialSave
-- (src/lib/lms-credential-save-limit.ts), implements a genuine SLIDING
-- window and needs the actual timestamp of each individual recent attempt to
-- compute retryAtMs (the window reopens exactly WINDOW_MS after the OLDEST
-- currently-counted attempt, not at a fixed reset boundary). A single count
-- column cannot answer that question no matter how it is keyed. So this
-- table is an append-only log of individual attempts, written with plain
-- INSERTs; no code path in src/lib/lms-credential-save-attempts.ts ever
-- calls .upsert() against it.
--
-- HOW OLD ROWS ARE REMOVED: CLEANUP ON WRITE, NOT A CRON JOB OR A TTL INDEX.
-- Postgres has no built-in row-expiry mechanism (unlike, say, a Mongo TTL
-- index), and this deployment has no scheduled job runner inside Postgres
-- itself - every "clean up periodically" mechanism this app already has
-- (workflow schedules, the recovery-attempt sweep) is driven from application
-- code on a timer, which would mean standing up a NEW unattended job for a
-- table whose own writer already runs on every attempt. Instead,
-- recordLmsCredentialSaveAttempt deletes this same user's rows older than the
-- caller-supplied retention cutoff in the SAME call that inserts the new one
-- - see that function's own doc comment. This bounds the table to
-- (LMS_CREDENTIAL_SAVE_LIMIT_MAX_ATTEMPTS, currently 5) live rows per
-- ACTIVELY-ATTEMPTING user at any time, self-cleaning with no separate
-- process, and with no window during which a user who stops attempting
-- leaves rows behind forever (the NEXT user who attempts anything is the one
-- whose write sweeps their own prior rows - a user who never attempts again
-- after their last row ages out of the window does leave that last handful of
-- rows in place indefinitely, which is the one gap this design accepts: an
-- abandoned account's final few attempt timestamps are not swept by anyone
-- once no further attempt ever arrives to trigger the cleanup. Given the
-- per-user cap of 5, that is a bounded, small amount of data - name, no
-- token, no URL - left in the least churned accounts, not an unbounded
-- append-only log).
--
-- RLS: NO POLICY FOR `authenticated`, AT ALL - same reasoning as
-- 20261015000000_lms_credentials.sql's RLS section, restated for this table
-- specifically: a rate limit a signed-in browser could read or write is not a
-- rate limit. A client that could read this table would learn exactly how
-- close it is to being throttled and time a burst around that; a client that
-- could WRITE this table could insert attempt rows for a user it does not
-- control, incorrectly throttling that other person's own future saves. Every
-- legitimate access goes through the service-role client in
-- src/lib/lms-credential-save-attempts.ts, which bypasses RLS and carries no
-- JWT, so auth.uid() is null under it regardless.
--
-- WHAT IS DELIBERATELY NOT STORED HERE. Per this feature's own brief: "an
-- attempt row records that an attempt happened, by whom, and when. Nothing
-- else." No institution, no base URL, no token fragment, no outcome. The
-- limit itself is per-user across every institution (checkAndRecordAttempt in
-- src/app/account/integrations/lms-actions.ts takes only a user id, never an
-- institution), so there is nothing an institution column would even scope.
--
-- Written idempotently: migrations auto-apply via a GitHub Action on push to
-- main and may re-run.

create table if not exists public.lms_credential_save_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

comment on table public.lms_credential_save_attempts is
  'One row per Canvas credential save/probe attempt: who, and when - nothing else. Backs SEC9''s rate limit (docs/lms-credentials-acceptance-criteria.md). See this migration''s header for why the PK is a bare surrogate id, why this table never upserts, how rows are removed (cleanup on write, not a cron job), and why RLS grants authenticated NOTHING. Every read and write goes through src/lib/lms-credential-save-attempts.ts using the service-role client.';
comment on column public.lms_credential_save_attempts.user_id is
  'references auth.users(id) on delete cascade - an attempt log for a deleted account is meaningless and must not outlive the account, mirroring lms_credentials.user_id''s own cascade.';
comment on column public.lms_credential_save_attempts.attempted_at is
  'When this attempt occurred - the only fact mayAttemptLmsCredentialSave (src/lib/lms-credential-save-limit.ts) needs to compute a genuine sliding window and a precise retryAtMs. Defaults to now() but src/lib/lms-credential-save-attempts.ts always supplies it explicitly, so the same clock reading a call site used for its own window arithmetic is the one persisted, rather than a second, independent server clock reading.';

-- The only query shapes this table ever serves: "this user''s attempts at or
-- after some instant" (the rate-limit read) and "this user''s attempts before
-- some instant" (the cleanup delete on write) - both filter on user_id first
-- and range-scan attempted_at, so a single composite index covers both
-- without a separate index on user_id alone.
create index if not exists lms_credential_save_attempts_user_id_attempted_at_idx
  on public.lms_credential_save_attempts (user_id, attempted_at);

alter table public.lms_credential_save_attempts enable row level security;

-- Deliberately no policy at all for `authenticated` - see the RLS section of
-- this migration's header. Every legitimate access path is the service-role
-- client from src/lib/lms-credential-save-attempts.ts, which bypasses RLS and
-- carries no JWT (auth.uid() is null under it, so a policy keyed on
-- auth.uid() would not even apply to that client).
