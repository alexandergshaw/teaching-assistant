-- Per-user LMS (Canvas) credentials - Group E of the multi-user login work.
-- docs/lms-credentials-acceptance-criteria.md E1-E2, DAT1, DAT3, DAT4, SEC6,
-- SEC7, SEC8, E-REL5, E-REL6. Stores one row per (user, institution): the
-- validated base URL, the AES-256-GCM-encrypted Canvas token
-- (src/lib/crypto.ts), the metadata needed to render a settings list WITHOUT
-- ever decrypting, and a small closed-vocabulary failure diagnostic. Reads
-- and writes go exclusively through src/lib/lms-credentials.ts, the ONLY
-- module that touches this table - mirrors app_users.ts's own "this is the
-- only module that writes" convention (20261012000000_create_app_users.sql).
--
-- NO FOREIGN KEY TO ANY INSTITUTIONS TABLE (DAT1). `institution` is a bare
-- acronym, exactly like microsoft_credentials.institution. There is nothing
-- to seed a table of institutions FROM (the acronym registry today lives
-- only in each browser's localStorage - src/lib/institutions.ts), and three
-- separate storage sites make a foreign key unrunnable outright:
-- workflow_defs.scope and message_drafts.payload carry the acronym inside
-- JSONB, which Postgres cannot foreign-key into, and course_hub.institution
-- is un-normalized free text from a freeSolo autocomplete
-- (courses.ts:129-139). Removing an acronym from the local registry is
-- documented, in visible product copy, as hiding rows rather than deleting
-- them (institution-removal.ts) - an FK here would make that promise false
-- in one direction (cascading a delete into someone's knowledge base) or
-- raise an error in the other. This row IS the institution record now: it
-- already carries the base URL, so a future "list institutions this user has
-- configured" query is `select distinct institution from lms_credentials
-- where user_id = $1`, not a join.
--
-- PRIMARY KEY (user_id, institution) - NOT a partial unique index (DAT4).
-- PostgREST's `.upsert({ onConflict: "user_id,institution" })` requires a
-- real, non-partial unique constraint backing that exact column list, or
-- Postgres cannot infer which constraint the ON CONFLICT clause means and
-- raises 42P10 ("there is no unique or exclusion constraint matching the ON
-- CONFLICT specification") - the same trap documented in this repo's own
-- migration history (20261011000000). A composite primary key IS that
-- constraint, with no separate index needed: the PK's leading column
-- (user_id) already serves "list this user's credentials" on its own.
--
-- RLS - READ THIS TWICE (SEC6). There is deliberately ZERO policy of any
-- kind for `authenticated` on this table - not select, not insert, not
-- update, not delete. This is stricter than the sibling
-- microsoft_credentials table (which grants `authenticated` a own-row SELECT
-- and DELETE), and that divergence is intentional, not an oversight to
-- reconcile later:
--   - RLS is ROW-level. It cannot hide a COLUMN. A `for select using
--     (auth.uid() = user_id)` policy - the obvious first draft, and the one
--     E1 originally specified before SEC6 corrected it - would still hand a
--     signed-in browser the full `encrypted_token` value on every matching
--     row. AES-256-GCM is a stream-cipher mode: it does not pad, so the
--     ciphertext's byte length equals the plaintext's byte length exactly.
--     A browser that can read its own row can therefore read its own
--     token's EXACT LENGTH straight from PostgREST - which directly
--     contradicts this feature's own masking contract (E2: "no fragment of
--     the token, through any surface") - and can bulk-exfiltrate ciphertext
--     today so that a key disclosure LATER retroactively decrypts it.
--   - Every legitimate read already goes through the service-role client
--     from src/lib/lms-credentials.ts, which bypasses RLS entirely and
--     carries no JWT (auth.uid() is NULL under it - there is no session to
--     scope a policy to in the first place). RLS on this table therefore has
--     no legitimate client-side reader to serve; adding one only ever adds a
--     leak.
-- If a future change ever "simplifies" this by adding an own-row SELECT
-- policy so some client component can read directly - stop. That is exactly
-- the mistake this comment exists to prevent, and the fix is to add a
-- server action that calls src/lib/lms-credentials.ts's listLmsCredentials,
-- which already returns the metadata-only shape a client is allowed to see.
--
-- ENCRYPTION, AAD, AND KEY ROTATION (SEC7, SEC8, E-REL5). `encrypted_token`
-- is written by src/lib/crypto.ts's encryptSecret(token, `${userId}:
-- ${institution}`) - the `aad` argument cryptographically binds the
-- ciphertext to ITS OWN (user_id, institution) pair, so a blob copied into a
-- different row (e.g. by an upsert-by-id bug elsewhere in this codebase -
-- artifact-templates.ts's own upsert/delete-by-id-alone pattern is the
-- precedent SEC7 names) fails to authenticate instead of decrypting into a
-- working token for the wrong account. Key rotation is handled entirely in
-- application code (crypto.ts's GOOGLE_TOKEN_ENC_KEY_PREVIOUS fallback) -
-- this table carries no key-id column, because the version prefix already
-- inside `encrypted_token` ("v1:iv:tag:ciphertext") is what lets crypto.ts
-- retry under a previous key with no schema change at all.
--
-- token_last_four, canvas_user_id, canvas_user_name, last_verified_at
-- (DAT3): stored so the settings list (E5) NEVER calls decryptSecret just to
-- render a row. token_last_four holds the last four characters of the raw
-- token ONLY - never the leading characters, which for a Canvas personal
-- access token encode the numeric Canvas user id and would otherwise leak
-- part of the very identity canvas_user_id already names honestly.
-- canvas_user_id/canvas_user_name come from E4's mandatory verification call
-- (a real, read-only /api/v1/users/self request) that must succeed before a
-- row is ever written - this migration does not and cannot enforce that
-- itself (it is an application-layer sequencing rule, not a data shape), so
-- it leaves both nullable rather than pretending a NOT NULL constraint
-- verified something Postgres never called Canvas to check. last_verified_at
-- is stamped only on that same successful call, and last_used_at only on a
-- later SUCCESSFUL resolver use - never on a call that started but then
-- failed - so neither timestamp can ever read as "working" for a credential
-- that is not.
--
-- last_failure_at / last_failure_kind (E-REL6): a durable diagnostic for a
-- deployment with no log aggregation, where a console.error is gone the
-- moment the process that wrote it recycles. last_failure_kind is
-- constrained to a CLOSED FOUR-VALUE ENUM via CHECK, deliberately not free
-- text - an enum cannot leak a token; free text is exactly how a stray
-- interpolated error message becomes a log leak. The four values name every
-- distinguishable way a Canvas resolution can fail for one (user,
-- institution) pair: 'no_credential' (nothing configured yet), 'unreadable'
-- (a row exists but decryptSecret could not recover a token from it - a
-- rotated-past key, or genuine tampering, which per crypto.ts's own contract
-- this table's writer cannot tell apart), 'rejected' (Canvas answered and
-- said the token is no good), and 'host_unreachable' (the network layer
-- never got a Canvas answer at all). Rows two and three are the pair E-REL6
-- singles out as mattering most: to an end user they produce the identical
-- symptom ("my Canvas stuff stopped working"), and once a log line is gone
-- there is no reconstructing after the fact which of the two actually
-- happened - these columns are what keeps that distinction alive.
-- NOTE ON THE FIRST VALUE: 'no_credential' describes the ABSENCE of a row
-- for that (user, institution) pair - there is no row to stamp it onto, so
-- in practice no writer in src/lib/lms-credentials.ts ever persists this
-- value here; it is named in the CHECK constraint for completeness against
-- the AC's own four-value list and for any future caller (e.g. a
-- schedule-level diagnostic row elsewhere) that might need the same closed
-- vocabulary. This is flagged, not silently assumed, in this change's
-- report.
--
-- Written idempotently: migrations auto-apply via a GitHub Action on push to
-- main and may re-run.

create table if not exists public.lms_credentials (
  user_id uuid not null references auth.users (id) on delete cascade,
  institution text not null,
  base_url text not null,
  encrypted_token text not null,
  token_last_four text not null,
  canvas_user_id text,
  canvas_user_name text,
  last_verified_at timestamptz,
  last_used_at timestamptz,
  last_failure_at timestamptz,
  -- THREE values, not the four the operator's mental model has. The fourth
  -- diagnostic state - "this user has no credential for this institution" -
  -- is ROW ABSENCE, and there is no row to stamp it on. Permitting it here
  -- would leave a domain value the application cannot produce, which is a
  -- value somebody eventually writes by hand and then wonders why nothing
  -- reads it. The application agrees with this constraint at the type level:
  -- recordLmsCredentialFailure's `kind` is Exclude<..., "no_credential">.
  last_failure_kind text check (
    last_failure_kind is null
    or last_failure_kind in ('unreadable', 'rejected', 'host_unreachable')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, institution)
);

comment on table public.lms_credentials is
  'One row per (user, institution): a signed-in user''s own Canvas base URL and encrypted personal access token. See this migration''s header for why there is no institutions FK, why the PK is composite rather than a partial unique index, and why RLS grants authenticated NOTHING - every read and write goes through src/lib/lms-credentials.ts using the service-role client.';
comment on column public.lms_credentials.institution is
  'Bare acronym, matching microsoft_credentials.institution - no FK (DAT1). Normalized (trim + uppercase) by src/lib/lms-credentials.ts before every read and write, the same convention google-credentials.ts and microsoft-credentials.ts already use.';
comment on column public.lms_credentials.encrypted_token is
  'AES-256-GCM via src/lib/crypto.ts, versioned payload ("v1:iv:tag:ciphertext"), bound to this exact row with additional authenticated data of `${userId}:${institution}` (SEC7) so a ciphertext copied into a different row fails to authenticate rather than decrypting into a usable token. Never selected by any client-facing read path - see the RLS section of this migration''s header.';
comment on column public.lms_credentials.token_last_four is
  'The last four characters of the RAW token only, stored so the settings list (E5) never has to call decryptSecret to render a row (DAT3). Never the leading characters - those encode the Canvas user id for a real Canvas personal access token and would partially leak canvas_user_id a second way.';
comment on column public.lms_credentials.canvas_user_id is
  'Which Canvas identity this token authenticates as, from the mandatory verification probe (E4) that must succeed before a row is ever written. Nullable here only because this migration cannot itself enforce an application-layer sequencing rule - src/lib/lms-credentials.ts always supplies it on save.';
comment on column public.lms_credentials.canvas_user_name is
  'Display name from the same E4 probe as canvas_user_id, so E5''s settings list can show a recognizable name rather than an opaque numeric id.';
comment on column public.lms_credentials.last_verified_at is
  'Stamped ONLY by a successful E4 verification call (save or replace) - never by a mere resolver read - so this column answers "was this token ever proven to work", distinct from last_used_at below.';
comment on column public.lms_credentials.last_used_at is
  'Stamped ONLY after a SUCCESSFUL Canvas call made using this credential during normal resolution - never on a call that was merely attempted - so a token that resolves but then gets a 401 from Canvas never reads as "working" (DAT3).';
comment on column public.lms_credentials.last_failure_at is
  'Paired with last_failure_kind - see this migration''s header (E-REL6) for the full reasoning and the closed vocabulary the CHECK constraint enforces. Cleared back to null by src/lib/lms-credentials.ts whenever a subsequent save or use succeeds, so this column reflects the MOST RECENT outcome, not a permanent scar.';
comment on column public.lms_credentials.last_failure_kind is
  'Closed four-value enum via CHECK, deliberately not free text - an enum cannot leak a token fragment, and free text is exactly how one reaches a log. See this migration''s header for what each of the four values means and why the first (''no_credential'') is named here but never actually written by this table''s own writer.';

alter table public.lms_credentials enable row level security;

-- Deliberately no policy at all for `authenticated` - see the RLS section of
-- this migration's header. Every legitimate access path is the service-role
-- client from src/lib/lms-credentials.ts, which bypasses RLS and carries no
-- JWT (auth.uid() is null under it, so a policy keyed on auth.uid() would
-- not even apply to that client - it exists purely for the client this table
-- must never talk to directly).
