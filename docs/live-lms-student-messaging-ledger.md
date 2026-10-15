# Live-LMS student messaging - DATA/STORAGE pass: the send ledger (R-W2-7, R-W2-11)

Companion to `docs/live-lms-student-messaging-ops.md` (the W2 ops design, REVISION 2,
whose section 3 R6 holds the RECONCILE / DUP / CLAIM / SETTLE requirements this pass
implements) and `docs/live-lms-student-messaging-scope.md`. Backlog row
LIVE-LMS-STUDENT-MESSAGING. Seat: data/storage design pass (loop-seat). READ-ONLY:
no production code, no migration file, no test written. Consumer: the W4 plan, test
and build seats (the W4 build brief is BLOCKED on this document).

**CONDITIONAL ON OWNER DECISION D2 (ops doc section 1).** This whole document
assumes D2 = DURABLE Supabase ledger (the recommended default). If the owner picks the
browser-only ledger ("tier 0", ops doc R6 last paragraph), THIS PASS IS DROPPED: no
table, no RPC, no migration, no RLS, and R-W2-11 reverts to a browser-only question
(a `ta-` localStorage ledger cannot see a second tab's claim at all, so the two-tab
race is open by construction there). Nothing below is salvageable in that case except
the state machine.

**REVISION 2 (applies round-1 check adf366a3; transcription of accepted findings, not a
new round).** One blocker fixed, two minor notes applied; everything else is unchanged.
(1) BLOCKER: CLAIM, the third caller of `live_message_dup_rows`, now reconciles THIS
KEY's stale `sending` rows inside the advisory lock before its guard (section 4.4,
F-L6), so it no longer depends on a prior Start / lookup having reconciled. CLAIM gains
a fourth parameter `p_stale_ms`. New scenario L14, new pin DL-14, DL-13 count 51 -> 52.
(2) DL-2 instrument spec now filters the `or`/`and` continuation lines of the multi-line
CHECK as well as table-level `constraint` lines. (3) Implicit reliance note below.
F-L1 (the `settled_at` reset in CLAIM and REQUEUE and the `state_shape` CHECK) is
untouched.

**IMPLICIT RELIANCE THE BUILD SEAT MUST PRESERVE (SECURITY INVOKER / DEFINER).**
`public.live_message_uid()` is deliberately SECURITY INVOKER (no `security definer`
clause) and `public.live_message_dup_rows(...)` is internal with execute revoked from
every API role (section 7); both are called ONLY from the `security definer` public
functions, which run as the function owner (the owner keeps execute; `auth.uid()` reads
the request JWT claims setting, which does not depend on the current role). The
migration must keep (a) `live_message_uid` invoker, (b) `dup_rows` callable from the
definer functions, and (c) no `grant execute` of either to an API role. Unverified until
the Action run and R-L-3 (R-L-1, R-L-4).

Tree and instruments (every figure names its command):
- HEAD when measured: `git rev-parse --short HEAD` -> `d4421dba` (the task was issued
  at `dcce6f79`; main moved while I worked; nothing I read below changed in
  `supabase/` or `docs/live-lms-student-messaging-ops.md` - the latter is 1048 lines
  by `@(Get-Content docs/live-lms-student-messaging-ops.md).Count`).
- Migrations on disk: `ls supabase/migrations | wc -l` -> 113; newest:
  `ls supabase/migrations | tail -1` -> `20261028000000_add_cartridge_drop_assignment_description.sql`.
- `user_id` is the house owner column: `grep -rln "user_id" supabase/migrations | wc -l`
  -> 47 files; `grep -rn "owner_id" supabase/migrations | wc -l` -> 0 (grep canary: the
  first command returning 47 shows the instrument works in this shell).
- No existing ledger: `grep -rn "live_message_sends\|SENDING_STALE_MS\|DUP_WINDOW_MS\|send-ledger\|live_message_" src supabase .github -l`
  printed nothing; `ls src/lib/live-messaging` lists 12 files (six modules plus six
  tests: connected-institutions, enrollment-aggregator, enrollment-readers, pager,
  table-filter-model, template-substitution) and NO constants leaf and NO ledger module.
- No local Postgres exists: `which psql postgres pg_ctl docker` -> none found;
  `ls node_modules | grep -i -E "pglite|pg-mem|^pg$|postgres|sqlite"` -> nothing. So
  EVERY SQL statement below is unexecuted. This is the dominant limit of the pass
  (section 12).
- Migration/structure gates green before any change, through the wrapper
  (`npm run test:paths <4 paths>`):
```
COVERED src/supabase-migrations.structure.test.ts files=1 passed=3
COVERED src/supabase-migrations.rls-coverage.structure.test.ts files=1 passed=4
COVERED src/sql-citations.structure.test.ts files=1 passed=6
COVERED src/supabase-migrations.accessibility-scans-rls.migration.test.ts files=1 passed=8
```

---

## 0. Findings against the ops doc (read first; each changes what gets built)

The task said "implement the ops design's R6 exactly". I did, and while writing the DDL
found five places where doing it EXACTLY reproduces a defect. Each is stated as an
amendment with the worked failure. The orchestrator rules on them; the design below
already applies them and says where.

| ID | Ops doc says | Problem found | Amendment (applied below) |
|---|---|---|---|
| F-L1 | CLAIM sets `status='sending', attempt+1, claimed_at=now()` (ops R6 CLAIM). It does not touch `settled_at`. DUP anchors the window on `COALESCE(settled_at, claimed_at, created_at)` (ops R6 DUP). | A refused row that is requeued (A8) keeps its old `settled_at`. Worked failure: row refused and settled 30h ago, requeued, claimed now -> status `sending`, `claimed_at` = now, `settled_at` still = 30h ago. COALESCE picks `settled_at` first = 30h ago, OUTSIDE the 24h window, so the in-flight `sending` row is INVISIBLE to DUP. A second tab/Preview then re-sends. This re-opens the exact hole Finding 1 closed. | CLAIM also sets `settled_at = null, code = null, http_status = null`; REQUEUE nulls `claimed_at, settled_at, code, http_status`; a table CHECK (`live_message_sends_state_shape`, section 2) makes any other combination unrepresentable. Scenario C6 pins it. |
| F-L2 | R-W2-11: "an advisory lock keyed on a hash of (owner, institution, course, recipient, digest) taken inside an RPC that performs DUP + insert". | A lock around DUP + INSERT does not close the race, because DUP deliberately EXCLUDES `pending` (ops R6 DUP note 2: old `pending` rows must not block reload-and-rebuild). Two serialized Starts both pass DUP (the first batch's rows are only `pending`) and both insert; both then claim their OWN row. | The lock moves to CLAIM, wrapping a cross-batch guard: under the lock, refuse the claim if ANY OTHER row for the same key is `accepted`/`unknown`/`sending` inside the window. Start needs no lock. Section 6. |
| F-L3 | "Resend anyway" is an explicit per-recipient flag in the Start payload (ops R6 retry matrix and cross-batch guard). | With a claim-time guard (F-L2) a flag that lives only in the Start payload is gone by claim time, so an intended override is refused at claim. | One persisted boolean `allow_resend` per row, with a decision HORIZON: an override row ignores other rows whose anchor is not later than the override row's own `created_at`. Section 6.3. |
| F-L4 | Ledger column list in the task brief and in the ops R6 paragraph "Ledger". | The brief lists nine columns but omits `code` and `http_status`; the ops doc's own RECONCILE sets `code = 'unknown-stale-claim'` and its progress contract returns `{key, status, code, httpStatus}`. Without them RECONCILE cannot be written. | Included (`code`, `http_status`), plus `allow_resend` (F-L3). 15 columns total (counted from section 2; DL-2 pins the list). |
| F-L5 | Ops doc names the owner column `owner_id` ("illustrative"). | Repo convention is `user_id uuid not null references auth.users (id) on delete cascade` (47 migration files; 0 use `owner_id`, commands above). | Column is `user_id`. Ops-doc predicates read `user_id = auth.uid()` here. |

Also recorded (not defects, but consequences a builder must know):
- **F-L6 - ordering is a hidden requirement of DUP.** DUP is only correct AFTER
  RECONCILE: a `sending` row claimed 48h ago and never reconciled has anchor `claimed_at`
  = 48h ago, outside the 24h window, so raw DUP does not return it; after RECONCILE it is
  `unknown` with `settled_at = now()` and is returned. Ops says "runs AFTER reconcile" in
  prose. This design makes it a CONSTRUCTION: the two RPCs that expose DUP
  (`live_message_dup_lookup`, `live_message_start_batch`) call RECONCILE internally in the
  same transaction, so no caller can run DUP unreconciled. Scenario D14 vs C1.
  **Revision 2: CLAIM is the THIRD caller of the DUP predicate and was the one that did
  NOT reconcile** - a `sending` sibling claimed over 24h ago and never reconciled has its
  anchor outside the window and was invisible to CLAIM's guard, reopening this hole at the
  last line of defence. CLAIM now runs a key-scoped reconcile inside its advisory lock
  before the guard (4.4), so all three DUP callers reconcile by construction and CLAIM
  does not rely on an un-enforced "a Start/lookup ran first" ordering across RPCs.
  Scenario L14 vs L12.
- **F-L7 - RECONCILE re-anchors the window.** RECONCILE stamps `settled_at = now()` (ops
  text), so an abandoned-3-days `sending` row blocks resend for a further 24h from the
  reconcile, not from the original claim. The direction is conservative (blocks a resend,
  owner can override) and the case is rare; I kept the ops behaviour. Recorded as R-L-8.
- **F-L8 - the existing sweep cannot prune this table.** The ops doc proposed "the
  existing sweep pattern (`.github/workflows/sweep-orphan-uploads.yml`, ...; I did not
  open them)". I opened both: the workflow calls `/api/cron/sweep-orphan-uploads`, whose
  route imports `listFilesAs`/`removeFilesAs` from `@/lib/supabase/storage` and
  `SYLLABUS_UPLOAD_BUCKET` (`src/app/api/cron/sweep-orphan-uploads/route.ts:3-5`): it
  lists and removes Storage OBJECTS, not table rows. It also warns that reusing
  `CRON_SECRET` already "widens that one secret's blast radius"
  (`.github/workflows/sweep-orphan-uploads.yml`, header comment). Section 10 therefore
  does not reuse it.

---

## 1. Decision register for this pass

"Design" = this pass decides, the checker may attack. "Owner" = a policy call with a
recommended default (a default is NOT a measured or Postgres-verified fact).

| ID | Decision | Recommended | Kind | Cost if wrong |
|---|---|---|---|---|
| DL-D1 | R-W2-11 mechanism (two tabs confirming one Preview at once) | Advisory-lock CLAIM RPC with a cross-batch guard (option B, section 6) | Owner (ties to ops R-W2-11) | Option A (documented acceptance) costs nothing to build and leaves a millisecond-scale two-tab window; option B adds one plpgsql function (about 65 lines), a persisted `allow_resend` column, and moves CLAIM off plain PostgREST filters (so the in-suite instrument for CLAIM weakens, section 11) |
| DL-D2 | Access path: the app's session-JWT client calling `security definer` RPCs that derive the owner from `auth.uid()`; no service-role client touches the ledger | As stated | Design | If rejected, fall back to the `lms_credentials` precedent (service-role client, zero policies, explicit `user_id` argument); the DB then cannot fail closed on the unattended runner path and relies on pin P12 alone (section 7) |
| DL-D3 | Ledger retention | 90 days from `created_at`, pruned lazily and best-effort by an RPC called at Prepare (A4) | Owner | Longer = more rows of low-value data; shorter than `DUP_WINDOW_MS + SENDING_STALE_MS` would break the guard (DL-10 pins `retention > window + stale`) |
| DL-D4 | `SENDING_STALE_MS` | 120000 (2 minutes) - the ops default | Owner | Too small marks a still-in-flight send `unknown` early (safe: a late settle then no-ops and the row reads `unknown`); too large delays resend eligibility. Ops arithmetic: unit worst case 36s (ops R6 timing), so 120s is 3.3x |
| DL-D5 | `DUP_WINDOW_MS` | 86,400,000 (24h) - the ops default | Owner | NOTE the consequence: an IDENTICAL daily message (same rendered text) sent at 09:00:05 yesterday is still blocked at 09:00:00 today (23h59m55s); the owner overrides per recipient. A rendered body that embeds a date or a changing count has a different digest and is unaffected |
| DL-D6 | Digest function | Plain sha256 as the ops doc fixes it; record the brute-force residual (R-L-6) | Owner | A sha256 over low-entropy inputs (a grade like 87.5 in a known template) is recoverable by dictionary guessing by anyone who can read the ledger AND knows the template; an HMAC under a server key closes it but needs an owner-set env var this checkout cannot verify |
| DL-D7 | `allow_resend` horizon semantics | As section 6.3 | Design | Without a horizon, two tabs that both override send twice; without persistence the override cannot work at all |
| DL-D8 | Adopt an in-process Postgres (PGlite) as a devDependency so vitest can run the migration SQL | Not now; recorded as an owner decision (R-L-7) | Owner | Needs `npm install` (network) and auth stubs; this environment blocks the network (`this-repo.md` section 2). Without it every SQL claim is "asked for", not "executed" |

---

## 2. TABLE DDL (specification, not a file)

Name `public.live_message_sends` (the ops doc's name; `grep` above shows it is unused).
One row per `(batch_id, course_id, recipient_id)`. NO name, subject, body, score or
message-text column of any kind (ops S3); the only message-derived value is the digest.
`recipient_id` and `course_id` are Canvas numeric ids - indirect identifiers, which ops
S3 permits; treat them as sensitive (they say which student was messaged, when).

Types and why (each against the precedents opened):
- ids are `uuid ... default gen_random_uuid()` (precedent: `20260817000000_create_message_drafts.sql:7`,
  `20261008000000_scheduled_releases.sql:93`).
- `status` and `code` are `text` + CHECK, NOT enums: the repo has no enum type
  (`grep -rn "create type" supabase/migrations` -> no output) and the precedent for a
  closed vocabulary is text + CHECK (`scheduled_releases` status, `:109`; `lms_credentials`
  `last_failure_kind`, whose header argues "an enum cannot leak a token; free text is
  exactly how a stray interpolated error message becomes a log leak"). The same argument
  applies to `code`: a closed CHECK means a Canvas error string can never be stored.
- `course_id`, `recipient_id` are `text` (the ops doc and app carry them as digit strings,
  S1 step 3 `^\d{1,12}$`), CHECK-constrained to that shape so a `course_123` broadcast
  token is unstorable.
- timestamps are `timestamptz`; `created_at` defaults to `now()`; `claimed_at`/`settled_at`
  are written ONLY by the RPCs below, always with `now()` (the DB clock; never a value
  from the caller).
- `institution` is a bare uppercase code, no FK (precedent and reasoning: `lms_credentials`
  header "NO FOREIGN KEY TO ANY INSTITUTIONS TABLE (DAT1)").
- No `updated_at`: `claimed_at`/`settled_at` ARE the transition times and no trigger is
  needed. Deliberate.

```sql
create table if not exists public.live_message_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  batch_id uuid not null,
  institution text not null,
  course_id text not null,
  recipient_id text not null,
  -- sha256 hex of: code LF courseId LF userId LF subject LF body (ops I-BIND-3).
  -- Covers the SUBJECT despite the name; the name is the ops doc's.
  body_digest text not null,
  status text not null default 'pending',
  code text,
  http_status smallint,
  attempt smallint not null default 0,
  allow_resend boolean not null default false,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  settled_at timestamptz,
  constraint live_message_sends_batch_recipient_key unique (batch_id, course_id, recipient_id),
  constraint live_message_sends_institution_shape check (institution ~ '^[A-Z0-9][A-Z0-9_-]{0,15}$'),
  constraint live_message_sends_course_id_shape check (course_id ~ '^[0-9]{1,12}$'),
  constraint live_message_sends_recipient_id_shape check (recipient_id ~ '^[0-9]{1,12}$'),
  constraint live_message_sends_digest_shape check (body_digest ~ '^[0-9a-f]{64}$'),
  constraint live_message_sends_status_vocab check (status in ('pending', 'sending', 'accepted', 'refused', 'unknown')),
  constraint live_message_sends_http_status_range check (http_status is null or http_status between 100 and 599),
  constraint live_message_sends_attempt_nonneg check (attempt >= 0),
  constraint live_message_sends_state_shape check (
    (status = 'pending' and claimed_at is null and settled_at is null and code is null and http_status is null)
    or (status = 'sending' and claimed_at is not null and settled_at is null and code is null and http_status is null)
    or (status = 'accepted' and claimed_at is not null and settled_at is not null and code = 'ok')
    or (status = 'refused' and claimed_at is not null and settled_at is not null
        and code in ('refused-pre-send', 'refused-http', 'refused-rate-limited'))
    or (status = 'unknown' and claimed_at is not null and settled_at is not null
        and code in ('unknown-http', 'unknown-no-response', 'unknown-stale-claim'))
  )
);
```

`live_message_sends_state_shape` is the construction that carries F-L1: a `sending` row
cannot carry a `settled_at`, so DUP's COALESCE anchor for `sending` is always
`claimed_at`; a `pending` row cannot carry stale timestamps; and the `(status, code)`
pairs are exactly the ops R5 codes (`ok`, `refused-pre-send`, `refused-http`,
`refused-rate-limited`, `unknown-http`, `unknown-no-response`) plus the ledger-only
`unknown-stale-claim`. With this CHECK in place the third arm of DUP's
`COALESCE(settled_at, claimed_at, created_at)` is unreachable for the statuses DUP
selects; it is KEPT in the SQL for fidelity with the ops text.

Idempotency note for the build seat: `create table if not exists` will NOT apply a
changed CHECK on re-run; any later change to a constraint is a new migration with
`alter table ... drop constraint if exists ... ; alter table ... add constraint ...`.
Likewise `create or replace function` cannot change a return type; a later change to a
function's `returns` needs `drop function if exists` first.

Statements the lexical gate reads (`src/supabase-migrations.structure.test.ts`): it
rejects an apostrophe between two letters outside `--` comments and dollar-quoted
bodies, and requires every string closed. The DDL above and the function bodies below
contain no such apostrophe; every function body is wrapped in `$fn$ ... $fn$` (the gate
strips `$tag$` bodies, tag letters/underscores only). Any `comment on ... is '...'`
text the build seat adds must double its apostrophes (`''`) or, simpler, avoid them.

## 3. INDEXES

```sql
create index if not exists live_message_sends_dup_idx
  on public.live_message_sends (user_id, institution, course_id, recipient_id, body_digest);

create index if not exists live_message_sends_sending_idx
  on public.live_message_sends (user_id, claimed_at)
  where status = 'sending';

create index if not exists live_message_sends_user_created_idx
  on public.live_message_sends (user_id, created_at);
```

| Query | Predicate columns | Index that serves it | Notes |
|---|---|---|---|
| RECONCILE | `user_id`, `status = 'sending'`, `claimed_at < cutoff` | `live_message_sends_sending_idx` (partial) | Partial on an immutable predicate; holds only in-flight rows, so it is tiny. Precedent shape: `scheduled_releases_claimed_idx` (`20261008000000_scheduled_releases.sql:144-146`). |
| DUP (and the CLAIM guard, which calls the same internal function) | `user_id`, `institution`, `course_id`, `recipient_id`, `body_digest` equality; `status IN (...)` and the window on the matching few heap rows | `live_message_sends_dup_idx` | Leads with exactly the five equality columns, as ops DUP note 5 requires. Not partial: a partial index on `status in (...)` is only usable if the planner proves the query's list implies it, and at this table's size a full btree costs nothing measurable (volume arithmetic below). The digest already binds code/course/user (sha256 of those fields), so the four-column match is belt-and-braces; the index follows the ops text. |
| CLAIM / SETTLE | `id` (and `user_id`) | primary key | One row. |
| A6 pre-claim read; A7 poll; REQUEUE | `(batch_id, course_id, recipient_id)`; `batch_id`; `user_id, batch_id, status='refused'` | the unique-constraint index `live_message_sends_batch_recipient_key` (its `batch_id` prefix serves the poll and requeue) | The unique key is the ops-required per-batch key. |
| PRUNE | `user_id`, `created_at < cutoff` | `live_message_sends_user_created_idx` | |

Volume (ILLUSTRATIVE ARITHMETIC from stated assumptions; no command can measure it here -
no database): assume the ops cap `MAX_BATCH_RECIPIENTS = 250` per batch (ops table L), an
assumed 300 batches a year, an assumed 250 bytes per row including index overhead:
`250 * 300 = 75,000` rows; `75,000 * 250 = 18,750,000` bytes (about 18.8 MB) per year at
the ceiling; at 90-day retention the steady state is `18,750,000 * 90 / 365` =
4,623,288 bytes (about 4.6 MB). The conclusion that matters - the table stays small enough that index choice is about
correctness, not speed - rests on those assumptions; R-L-5 owns replacing them with an
`EXPLAIN` on the live database.

---

## 4. THE QUERY SHAPES (the double-send fix)

### 4.0 Shared conventions for every function

- One migration creates 9 functions, all in `public`, all `plpgsql` except the internal
  DUP helper, all explicitly `volatile` (see 4.6 for why `volatile` is load-bearing),
  all `set search_path = ''` with every object schema-qualified (the hardening the repo's
  own `security definer` function states as MANDATORY:
  `20261012000000_create_app_users.sql:36-41`, function at `:299-303`).
- **The owner is never a parameter.** Every public function starts by calling
  `public.live_message_uid()` (below), which returns `auth.uid()` or raises. No function
  has a `user_id`/`owner` parameter, so a caller cannot name another owner (DL-4 pins
  this).
- Window and stale thresholds are PARAMETERS (`p_window_ms`, `p_stale_ms`) passed from
  the TS constants leaf, so the TS `effectiveStatus` and the SQL read ONE constant (ops
  P22). Each function range-checks them (sanity floors/ceilings, NOT copies of the
  defaults) so a zero or absurd value fails closed instead of silently disabling the
  guard (`p_window_ms = 0` would make DUP match nothing).
- Time is `now()` (transaction start, the DB clock) everywhere. Inside CLAIM the
  advisory-lock wait can make `now()` a little earlier than the real claim instant; the
  wait is bounded by `lock_timeout` (4.4), so the skew is bounded by seconds against a
  120-second stale threshold.

```sql
create or replace function public.live_message_uid()
returns uuid
language plpgsql
volatile
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'live_message: not authenticated' using errcode = '28000';
  end if;
  return v_uid;
end;
$fn$;
```

Error contract the TS wrapper relies on: ANY error from an RPC (auth, range, lock
timeout, constraint, network) is the same outcome to the app - `ok: false` ->
`ledger-unavailable` (ops R6 "fail closed on the ledger"). The wrapper never inspects
the message.

### 4.1 RECONCILE (step Z) - ops R6 requirement RECONCILE

```sql
create or replace function public.live_message_reconcile(p_stale_ms bigint)
returns table (reconciled integer, db_now timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := public.live_message_uid();
  v_n integer;
begin
  if p_stale_ms is null or p_stale_ms < 30000 or p_stale_ms > 3600000 then
    raise exception 'live_message: stale threshold out of range' using errcode = '22023';
  end if;
  update public.live_message_sends s
     set status = 'unknown', code = 'unknown-stale-claim', settled_at = now()
   where s.user_id = v_uid
     and s.status = 'sending'
     and s.claimed_at < now() - p_stale_ms * interval '1 millisecond';
  get diagnostics v_n = row_count;
  return query select v_n, now();
end;
$fn$;
```

- **Exact predicate:** `user_id = auth.uid() AND status = 'sending' AND claimed_at <
  now() - SENDING_STALE_MS ms`. Strict `<`: a row claimed exactly `p_stale_ms` ago is NOT
  reconciled (mirrors the strict-greater-than convention in
  `isClaimStale`, `src/lib/scheduled-releases.ts:194-204`, whose comment says a claim
  exactly `staleMs` old is NOT yet stale). Touches no other status. DB clock.
- **Index:** `live_message_sends_sending_idx`.
- **Transaction/isolation:** a single UPDATE inside the RPC's own transaction, READ
  COMMITTED. Idempotent: a second run matches nothing. Concurrent with itself the second
  UPDATE waits on the first's row locks, then re-evaluates the WHERE on the new row
  version (status is now `unknown`, so it no longer matches) -> 0 rows. Concurrent with
  SETTLE: whichever commits first wins and the other's WHERE no longer matches (a late
  settle then returns false, and the row stays `unknown`; a reconcile after a settle
  finds `accepted` and skips it). The Postgres rule relied on is the documented READ
  COMMITTED re-evaluation of an UPDATE's WHERE against the concurrently updated row
  version (PostgreSQL manual, Transaction Isolation, "Read Committed"); I did not run it
  (section 12).
- **Callers:** A7 standalone; A4 via `live_message_dup_lookup`; A5 via
  `live_message_start_batch` (both call it internally, F-L6); and CLAIM, which runs the
  same UPDATE inlined and SCOPED TO ITS OWN KEY (4.4, revision 2) rather than calling this
  user-wide function (reason in 4.4). It returns `db_now`, the DB
  clock, so the browser's `effectiveStatus(row, now)` display can use DB time instead of
  a possibly skewed client clock.
- **Fail closed:** a thrown/failed reconcile -> the calling RPC raises -> A4/A5 refuse
  `ledger-unavailable`. A7: the task statement ("a failed write must fail closed (the
  action refuses)") applies to all three call sites, so A7 also returns
  `ledger-unavailable`; this withholds only a DISPLAY (no send risk at A7) and the build
  or UX seat may soften A7 to "show unreconciled statuses with a flag" without touching
  safety. Default: refuse.

### 4.2 DUP (the duplicate lookup) - ops R6 requirement DUP

One internal function owns the predicate; three callers reuse it so the predicate exists
exactly once in the schema:

```sql
create or replace function public.live_message_dup_rows(
  p_uid uuid,
  p_institution text,
  p_course_ids text[],
  p_recipient_ids text[],
  p_digests text[],
  p_window_ms bigint,
  p_exclude_id uuid,
  p_after timestamptz
)
returns setof public.live_message_sends
language sql
volatile
set search_path = ''
as $fn$
  select s.*
    from unnest(p_course_ids, p_recipient_ids, p_digests) as t (course_id, recipient_id, body_digest)
    join public.live_message_sends s
      on s.user_id = p_uid
     and s.institution = p_institution
     and s.course_id = t.course_id
     and s.recipient_id = t.recipient_id
     and s.body_digest = t.body_digest
   where s.status in ('accepted', 'unknown', 'sending')
     and coalesce(s.settled_at, s.claimed_at, s.created_at) > now() - p_window_ms * interval '1 millisecond'
     and (p_exclude_id is null or s.id <> p_exclude_id)
     and (p_after is null or coalesce(s.settled_at, s.claimed_at, s.created_at) > p_after);
$fn$;
```

- **Exact predicate** (ops DUP, verified against ops R6 lines 553-571): same
  `user_id`, `institution`, `course_id`, `recipient_id`, `body_digest`; `status IN
  ('accepted','unknown','sending')`; anchor `COALESCE(settled_at, claimed_at, created_at)
  > now() - DUP_WINDOW_MS`. `pending` and `refused` are EXCLUDED (never POSTed /
  provably not delivered). Strict `>`: an anchor exactly `p_window_ms` old is outside.
  `sending` is in the set at ANY age (ops Finding 1 fix), still bounded by the window
  through its `claimed_at` anchor - which is why DUP must run after RECONCILE (F-L6).
  The two optional arguments are NOT in the ops text: `p_exclude_id` (the CLAIM guard
  excludes its own row) and `p_after` (the override horizon, 6.3). The two public
  callers below pass `null` for both, so the ops predicate is reproduced unchanged.
  The third caller, CLAIM (4.4), passes both and, like the other two, runs a reconcile
  first (key-scoped, inside its lock).
- **Index:** `live_message_sends_dup_idx` via the join's equality columns.
- **Transaction/isolation:** read-only; READ COMMITTED; the snapshot is taken at statement
  start (volatile, 4.6). At Prepare it is advisory by construction (a row inserted a
  moment later is not seen); the AUTHORITATIVE use is inside CLAIM after the advisory
  lock, where it sees everything prior lock holders committed.
- `language sql` plus `set search_path` means the planner does not inline it; it runs as
  a function with a fresh snapshot per query (volatile). Not load-bearing, noted so a
  future "optimise by inlining" edit is recognised as a semantics change.

The public lookup (A4) and its input checks:

```sql
create or replace function public.live_message_dup_lookup(
  p_institution text,
  p_course_ids text[],
  p_recipient_ids text[],
  p_digests text[],
  p_window_ms bigint,
  p_stale_ms bigint
)
returns setof public.live_message_sends
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := public.live_message_uid();
begin
  if p_course_ids is null or p_recipient_ids is null or p_digests is null
     or cardinality(p_course_ids) < 1 or cardinality(p_course_ids) > 500
     or cardinality(p_course_ids) <> cardinality(p_recipient_ids)
     or cardinality(p_course_ids) <> cardinality(p_digests) then
    raise exception 'live_message: bad recipient arrays' using errcode = '22023';
  end if;
  if p_window_ms is null or p_window_ms < 3600000 or p_window_ms > 2592000000 then
    raise exception 'live_message: window out of range' using errcode = '22023';
  end if;
  perform 1 from public.live_message_reconcile(p_stale_ms);
  return query
    select * from public.live_message_dup_rows(
      v_uid, p_institution, p_course_ids, p_recipient_ids, p_digests, p_window_ms, null, null);
end;
$fn$;
```

It returns full ledger rows (ids and statuses only; no PII columns exist), which the
mapper maps; the app groups them by `(course_id, recipient_id)` for the confirm dialog
("already messaged or possibly messaged"). 500 is a payload sanity ceiling above the ops
cap of 250, not a copy of it.

### 4.3 START (A5): create the batch - not a numbered ops query, but the only insert

```sql
create or replace function public.live_message_start_batch(
  p_institution text,
  p_course_ids text[],
  p_recipient_ids text[],
  p_digests text[],
  p_allow_resend boolean[],
  p_window_ms bigint,
  p_stale_ms bigint,
  p_max_recipients integer
)
returns table (o_batch_id uuid, o_course_id text, o_recipient_id text, o_outcome text, o_dup_status text)
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := public.live_message_uid();
  v_batch uuid := gen_random_uuid();
begin
  if p_course_ids is null or p_recipient_ids is null or p_digests is null or p_allow_resend is null
     or p_max_recipients is null or p_max_recipients < 1 or p_max_recipients > 500
     or cardinality(p_course_ids) < 1 or cardinality(p_course_ids) > p_max_recipients
     or cardinality(p_course_ids) <> cardinality(p_recipient_ids)
     or cardinality(p_course_ids) <> cardinality(p_digests)
     or cardinality(p_course_ids) <> cardinality(p_allow_resend) then
    raise exception 'live_message: bad recipient arrays' using errcode = '22023';
  end if;
  if p_window_ms is null or p_window_ms < 3600000 or p_window_ms > 2592000000 then
    raise exception 'live_message: window out of range' using errcode = '22023';
  end if;
  perform 1 from public.live_message_reconcile(p_stale_ms);
  return query
  with req as (
    select t.course_id, t.recipient_id, t.body_digest, coalesce(t.allow_resend, false) as allow_resend
      from unnest(p_course_ids, p_recipient_ids, p_digests, p_allow_resend)
           as t (course_id, recipient_id, body_digest, allow_resend)
  ),
  dups as (
    select d.course_id, d.recipient_id,
           (array_agg(d.status order by case d.status when 'sending' then 0 when 'unknown' then 1 else 2 end))[1]
             as dup_status
      from public.live_message_dup_rows(
             v_uid, p_institution, p_course_ids, p_recipient_ids, p_digests, p_window_ms, null, null) d
     group by d.course_id, d.recipient_id
  ),
  ins as (
    insert into public.live_message_sends
           (user_id, batch_id, institution, course_id, recipient_id, body_digest, allow_resend)
    select v_uid, v_batch, p_institution, r.course_id, r.recipient_id, r.body_digest,
           (r.allow_resend and x.course_id is not null)
      from req r
      left join dups x on x.course_id = r.course_id and x.recipient_id = r.recipient_id
     where x.course_id is null or r.allow_resend
    returning course_id, recipient_id
  )
  select v_batch, r.course_id, r.recipient_id,
         case when i.course_id is not null then 'inserted' else 'duplicate' end,
         x.dup_status
    from req r
    left join ins i on i.course_id = r.course_id and i.recipient_id = r.recipient_id
    left join dups x on x.course_id = r.course_id and x.recipient_id = r.recipient_id;
end;
$fn$;
```

- Everything is one transaction: reconcile, DUP, insert. A duplicate `(course_id,
  recipient_id)` pair in the arrays violates `live_message_sends_batch_recipient_key`
  (23505) and rolls the WHOLE batch back - all-or-nothing batch creation, backing the
  server-side uniqueness check (ops S1 step 4).
- `batch_id` is generated here (`gen_random_uuid()`); a client cannot choose or collide
  one. The app stores the returned id in the single opaque `ta-` key (ops S3).
- `allow_resend` is stored `true` only for a recipient that was BOTH flagged by the owner
  AND actually had a blocking row (so the flag records a real decision).
- This is the authoritative-for-UX exclusion (ops "A5 re-runs DUP"). It is no longer the
  last line of defence: CLAIM (4.4) is.
- Start needs no advisory lock (F-L2); two concurrent Starts produce two batches of
  `pending` rows, which is not a double send.
- Output columns carry an `o_` prefix on purpose: a plpgsql `returns table` column named
  `course_id` would be ambiguous against the table column inside the body.

### 4.4 CLAIM (atomic) - ops R6 requirement CLAIM, amended by F-L1, F-L2, F-L3

```sql
create or replace function public.live_message_claim(
  p_id uuid,
  p_digest text,
  p_window_ms bigint,
  p_stale_ms bigint
)
returns setof public.live_message_sends
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := public.live_message_uid();
  v_row public.live_message_sends%rowtype;
  v_out public.live_message_sends%rowtype;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'live_message: claim requires READ COMMITTED' using errcode = '25000';
  end if;
  if p_window_ms is null or p_window_ms < 3600000 or p_window_ms > 2592000000 then
    raise exception 'live_message: window out of range' using errcode = '22023';
  end if;
  if p_stale_ms is null or p_stale_ms < 30000 or p_stale_ms > 3600000 then
    raise exception 'live_message: stale threshold out of range' using errcode = '22023';
  end if;
  select * into v_row from public.live_message_sends where id = p_id and user_id = v_uid;
  if not found then
    return;
  end if;
  perform set_config('lock_timeout', '2000', true);
  perform pg_advisory_xact_lock(hashtextextended(
    v_uid::text || ':' || v_row.institution || ':' || v_row.course_id || ':'
    || v_row.recipient_id || ':' || v_row.body_digest, 0));
  -- Revision 2: reconcile stale sending rows of THIS KEY under the lock, BEFORE the guard,
  -- so a sibling claimed over the window ago and never reconciled is re-anchored inside
  -- the window (settled_at = now()) and the guard sees it. Scoped to the lock key.
  update public.live_message_sends s
     set status = 'unknown', code = 'unknown-stale-claim', settled_at = now()
   where s.user_id = v_uid
     and s.institution = v_row.institution
     and s.course_id = v_row.course_id
     and s.recipient_id = v_row.recipient_id
     and s.body_digest = v_row.body_digest
     and s.status = 'sending'
     and s.claimed_at < now() - p_stale_ms * interval '1 millisecond';
  if exists (
    select 1 from public.live_message_dup_rows(
      v_uid, v_row.institution, array[v_row.course_id], array[v_row.recipient_id],
      array[v_row.body_digest], p_window_ms, v_row.id,
      case when v_row.allow_resend then v_row.created_at else null end)
  ) then
    return;
  end if;
  update public.live_message_sends s
     set status = 'sending', attempt = s.attempt + 1, claimed_at = now(),
         settled_at = null, code = null, http_status = null
   where s.id = p_id and s.user_id = v_uid and s.status = 'pending' and s.body_digest = p_digest
  returning * into v_out;
  if found then
    return next v_out;
  end if;
  return;
end;
$fn$;
```

- **Exact predicate of the claim UPDATE** (ops R6 CLAIM, verified against its text at
  ops lines 572-582): `id = $id AND user_id = auth.uid() AND status = 'pending' AND
  body_digest = $D`, setting `status='sending'`, `attempt = attempt + 1`, `claimed_at =
  now()`, RETURNING the row. The task brief's `WHERE id=$id` form and the ops doc's
  `(owner, batch, course, recipient)` form name the same single row (the unique key
  makes the triple map 1:1 to an id within an owner); this design addresses it by `id`
  and lets A6 read the row first by the triple (ops: "A6 first reads the row to learn
  code/course/user"). Added by this pass: `settled_at = null, code = null, http_status =
  null` (F-L1), the guard block (F-L2/F-L3), and (revision 2) the key-scoped in-lock
  reconcile of stale `sending` rows that runs between the lock and the guard (F-L6).
  The reconcile's write is committed even when the claim then returns 0 rows (the
  function returns normally, it does not raise), which is what makes L14's stored state
  durable. Consequence recorded under R-L-8: because the reconcile stamps `settled_at =
  now()`, an override row (`allow_resend`) whose stale `sending` sibling is reconciled at
  claim time sees that sibling re-anchored LATER than its own `created_at` and is
  blocked; the owner re-overrides with a fresh Start. Conservative direction.
- **Zero rows returned** means skipped: no such row for this owner, an advisory-guard
  hit, or the row was not `pending`, or the digest differed. NO POST in every case. The
  app tells "someone else holds it / is terminal" from "blocked as a duplicate" by one
  follow-up read of the row: a row still `pending` after a 0-row claim with a matching
  digest can only mean the guard blocked it. A guard-blocked row is left `pending`
  (no state write): it displays as "not attempted", and its reason is shown from that
  read. Marking it `refused` was rejected because `refused` is requeue-eligible and
  would inflate the "Messages refused by Canvas" diagnostic (ops R8) with a non-Canvas
  outcome.
- **Index:** primary key for the row read and the UPDATE; `live_message_sends_dup_idx`
  for the guard and for the in-lock reconcile (same five equality columns).
- **Transaction/isolation: READ COMMITTED is REQUIRED and asserted** (first statement).
  Why: the lock is acquired by one statement; the in-lock reconcile and then the guard
  `exists (...)` are the NEXT statements and, because the function is `volatile`, each
  takes a FRESH snapshot that includes everything a previous lock holder committed before
  releasing the lock. Under
  REPEATABLE READ or SERIALIZABLE the snapshot is fixed at the transaction's first query
  (before the lock), the guard would not see the previous holder's commit, and the
  claim UPDATE would additionally raise a serialization failure on a concurrently
  updated row. PostgREST uses the database default (READ COMMITTED) unless the project
  changed `default_transaction_isolation` - not verifiable here (no database, and
  `supabase/config.toml` is 8 lines with no isolation setting:
  `grep -n -i "isolation" supabase/config.toml` -> no output) - hence the in-function
  assertion: a mis-set isolation level fails closed (error -> `ledger-unavailable`)
  instead of silently reopening the race.
- **Lock details.** `pg_advisory_xact_lock` is the TRANSACTION-scoped variant, which is
  the form that is safe under a transaction-pooling connection pooler (a session-scoped
  advisory lock could be left held or taken on a different backend; I did not verify
  which pooler mode this project uses). The key is one 64-bit hash of `user : institution
  : course : recipient : digest`; a hash collision merely serializes two unrelated
  claims. It is one lock per call, so there is no multi-lock ordering to get wrong.
  `lock_timeout` 2000 ms (below the ops 3s claim ceiling) bounds the wait; whether
  `lock_timeout` governs advisory-lock waits, and Supabase's per-role `statement_timeout`
  for `authenticated`, are not verified here - if `lock_timeout` does not apply, the
  ops 3s application-side race and the platform statement timeout still end the wait and
  the outcome is the same fail-closed `ledger-unavailable`.
- **Deadlock argument (revised in revision 2).** CLAIM holds one advisory lock, then
  row-locks the stale `sending` rows OF ITS OWN KEY (the in-lock reconcile) and its own
  `pending` row. No other function takes an advisory lock, and no function waits on an
  advisory lock while holding a row lock, so there is no advisory/row cycle. A row-lock
  cycle needs two statements that both update two or more of the same rows in opposite
  orders: the only overlap is CLAIM's key-scoped reconcile against a concurrent
  user-wide RECONCILE (standalone, `dup_lookup` or `start_batch`) when one key has two
  or more stale `sending` rows. SETTLE locks one row and so cannot close a cycle. That
  residual cycle is NOT proven impossible; if it occurs Postgres's deadlock detector
  aborts one statement (SQLSTATE 40P01), which reaches the app as `ledger-unavailable`
  = fail closed, never a send. Why the in-lock reconcile is key-scoped and inlined
  instead of calling `live_message_reconcile`: that function is user-wide and would
  row-lock stale rows of OTHER keys while this claim holds its key's advisory lock,
  widening exactly this overlap; scoping to the five lock-key columns (served by
  `live_message_sends_dup_idx`) touches only rows the advisory lock already serializes
  against other claims. It preserves `live_message_sends_state_shape`: it moves a
  `sending` row (claimed_at set, settled_at null) to `unknown` with `settled_at =
  now()` and `code = 'unknown-stale-claim'`, which is the CHECK's `unknown` arm (the
  same write RECONCILE already does). It does not touch the `sending` arm's
  `settled_at is null` rule, which only CLAIM's own UPDATE and REQUEUE produce, so F-L1
  is untouched. Measured by R-L-2.
- **`hashtextextended`** needs PostgreSQL 11 or newer; the project's major version is
  not recorded in the repo (`supabase/config.toml` has no `major_version`:
  `grep -n -i "major_version" supabase/config.toml` -> no output). The Action run is the
  check (R-L-4); `hashtext(text)` (int4) is the older-version fallback.

### 4.5 SETTLE - ops R6 settle

```sql
create or replace function public.live_message_settle(
  p_id uuid,
  p_status text,
  p_code text,
  p_http_status smallint
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := public.live_message_uid();
  v_n integer;
begin
  if p_status is null or p_status not in ('accepted', 'refused', 'unknown') then
    raise exception 'live_message: bad settle status' using errcode = '22023';
  end if;
  update public.live_message_sends s
     set status = p_status, code = p_code, http_status = p_http_status, settled_at = now()
   where s.id = p_id and s.user_id = v_uid and s.status = 'sending';
  get diagnostics v_n = row_count;
  return v_n = 1;
end;
$fn$;
```

- **Exact predicate:** `id = $id AND user_id = auth.uid() AND status = 'sending'`,
  setting the outcome and `settled_at = now()`. The `status = 'sending'` condition is
  the whole point (ops: "a late settle can never overwrite a row step Z has already
  moved to unknown").
- **Index:** primary key. **Isolation:** one conditional UPDATE, READ COMMITTED; against a
  concurrent RECONCILE the second writer re-evaluates its WHERE after the first commits
  (see 4.1).
- **Returns false** (0 rows) when the row was reconciled to `unknown`, or was never
  `sending`: the unit still returns its real result to the client (ops), and the ledger
  keeps the conservative `unknown`.
- A `(status, code)` pair that violates `live_message_sends_state_shape` raises 23514.
  That is a settle-write failure by the ops definition: the row stays `sending`, then
  reconciles to `unknown` - conservative, never a double send. The TS side makes the
  incoherent pair unrepresentable (`ledgerOutcomeFor`, DL-9), so this is a backstop.

### 4.6 `volatile` is not optional

Every function above is declared `volatile`. A `stable` or `immutable` function runs its
queries on the SNAPSHOT OF THE CALLING STATEMENT; in CLAIM that would make the guard read
a pre-lock snapshot and silently defeat the advisory lock. The default is volatile, but
a later "this only reads, mark it stable" edit is exactly the plausible mistake, so
DL-4 pins that no function in the migration contains `stable` or `immutable`.

### 4.7 REQUEUE (A8) and PRUNE (A4, best-effort)

```sql
create or replace function public.live_message_requeue_refused(
  p_batch_id uuid,
  p_max_attempts integer
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := public.live_message_uid();
  v_n integer;
begin
  if p_max_attempts is null or p_max_attempts < 1 or p_max_attempts > 10 then
    raise exception 'live_message: attempts out of range' using errcode = '22023';
  end if;
  update public.live_message_sends s
     set status = 'pending', claimed_at = null, settled_at = null, code = null, http_status = null
   where s.user_id = v_uid and s.batch_id = p_batch_id
     and s.status = 'refused' and s.attempt < p_max_attempts;
  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

create or replace function public.live_message_prune(
  p_retention_days integer,
  p_limit integer
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := public.live_message_uid();
  v_n integer;
begin
  if p_retention_days is null or p_retention_days < 8 or p_retention_days > 3650
     or p_limit is null or p_limit < 1 or p_limit > 2000 then
    raise exception 'live_message: prune arguments out of range' using errcode = '22023';
  end if;
  delete from public.live_message_sends
   where id in (
     select d.id from public.live_message_sends d
      where d.user_id = v_uid and d.created_at < now() - p_retention_days * interval '1 day'
      order by d.created_at
      limit p_limit);
  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;
```

REQUEUE keeps `attempt` (so `MAX_ATTEMPTS` is a true total) and clears every
transition field, which together with the CHECK is the second half of F-L1. It acts only
on `refused`, so it cannot touch an in-flight or possibly-sent row. The prune's
`p_retention_days >= 8` floor exists so a bad argument can never delete rows younger than
the 7-day region; the real policy value lives in the constants leaf (DL-D3, DL-10).

### 4.8 Isolation summary

| Statement | Own transaction | Isolation required | Why it is correct under READ COMMITTED | If violated |
|---|---|---|---|---|
| RECONCILE | one UPDATE per RPC call | READ COMMITTED (default) | idempotent; a concurrent updater's row version is re-checked against `status='sending'` | none beyond a stale count |
| DUP (Prepare) | read-only | READ COMMITTED | statement snapshot; advisory only at Prepare | a just-inserted row is missed - by design |
| START | reconcile + DUP + INSERT in one function transaction | READ COMMITTED | worst concurrent case is two batches of `pending` rows, not a send | none (the guard is in CLAIM) |
| CLAIM | advisory lock + key-scoped reconcile + guard + UPDATE in one function transaction | READ COMMITTED, asserted in the function | fresh per-statement snapshot after the lock sees the prior holder's commit; the reconcile and the UPDATE WHERE are re-evaluated | under RR/SERIALIZABLE the guard is blind and the UPDATE can error: the assertion makes that fail closed |
| SETTLE | one conditional UPDATE | READ COMMITTED | `status='sending'` re-evaluated after any concurrent reconcile | none |
| REQUEUE / PRUNE | one statement | READ COMMITTED | touch only `refused` / old rows | none |

I stated the isolation behaviour from the PostgreSQL manual's documented READ COMMITTED
semantics. I could not execute any of it. R-L-2 (concurrency) is the owner instrument.

---

## 5. Scenario oracle (a LITERAL TABLE; expected values are not computed from any implementation)

All times are relative to `T0` = the DB `now()` of the call under test. Constants used
in every scenario: `STALE = 120 s` (120000 ms), `WINDOW = 24 h` (86,400,000 ms),
`MAX_ATTEMPTS = 3`, `RETENTION = 90 d`. Key `K` = `(user U, institution MCC, course
100, recipient 200)` and digest `D1` unless a row says otherwise. Ledger rows are written
`id:status[claimed,settled]`. "Stored after" is the table state, not any helper's
opinion.

### 5.1 RECONCILE

| ID | Input rows | Call | Expected stored after | Expected return |
|---|---|---|---|---|
| Z1 | a:sending claimed T0-121s | reconcile | a: unknown, code unknown-stale-claim, settled T0 | reconciled=1 |
| Z2 | a:sending claimed T0-120s exactly | reconcile | a unchanged: sending | reconciled=0 |
| Z3 | a:sending claimed T0-119s | reconcile | a unchanged | 0 |
| Z4 | one row each: pending; accepted (claimed T0-1h, settled T0-1h); refused (claimed T0-1h, settled T0-1h); unknown (claimed T0-1h, settled T0-1h) | reconcile | all four unchanged | 0 |
| Z5 | a:sending claimed T0-300s but user V (another owner), caller U | reconcile as U | a unchanged | 0 |
| Z6 | state after Z1 | reconcile again | unchanged | reconciled=0 (idempotent) |
| Z7 | `p_stale_ms` = 0 and 10 and 7,200,000 | reconcile | raises (22023); nothing changes | error |

### 5.2 DUP (predicate in isolation, no reconcile run)

Window anchor shown is `COALESCE(settled_at, claimed_at, created_at)`.

| ID | Row (key K, digest D1 unless noted) | Returned by DUP? |
|---|---|---|
| D1 | accepted settled T0-1h | YES |
| D2 | accepted settled T0-23h59m | YES |
| D3 | accepted settled T0-24h exactly | NO (strict >) |
| D4 | accepted settled T0-25h | NO |
| D5 | unknown settled T0-1h | YES |
| D6 | sending claimed T0-30s (young) | YES |
| D7 | sending claimed T0-300s (older than STALE) | YES |
| D8 | pending created T0-1h | NO |
| D9 | refused settled T0-1h | NO |
| D10 | accepted settled T0-1h, digest D2 | NO |
| D11 | accepted settled T0-1h, recipient 201 | NO |
| D12 | accepted settled T0-1h, institution XYZ | NO |
| D13 | accepted settled T0-1h, user V (other owner) | NO |
| D14 | sending claimed T0-48h, never reconciled | NO (anchor outside window) - this is why reconcile must run first (F-L6) |

### 5.3 Composite: DUP after RECONCILE (the public `dup_lookup` / `start_batch` path)

| ID | Input | Call | Expected |
|---|---|---|---|
| C1 | D14's row (sending claimed T0-48h) | `live_message_dup_lookup` | row stored `unknown` settled T0 (reconciled in the same transaction) AND returned in the lookup |
| C2 | the incident: row sending claimed T0-60s after a failed settle; new Preview then Start for K, D1, no override | `live_message_start_batch` | outcome `duplicate`, dup_status `sending`; NO new row inserted |
| C3 | same as C2 but override flag true for K | `live_message_start_batch` | outcome `inserted`; new row `pending` with allow_resend=true; the old `sending` row unchanged (still within STALE) |

### 5.4 CLAIM

(Scenario calls write `claim(id, digest)`; the other two arguments, `p_window_ms` =
WINDOW and `p_stale_ms` = STALE, are always passed as the constants above.)

| ID | Input rows | Call | Expected | Stored after |
|---|---|---|---|---|
| L1 | a:pending (attempt 0, digest D1) | claim(a, D1) | 1 row: sending, attempt 1, claimed T0, settled null, code null, http null | as returned |
| L2 | a:pending digest D1 | claim(a, D2) | 0 rows | a unchanged: pending |
| L3 | a:sending claimed T0-30s (young; revision 2: a stale a would be reconciled to unknown by the in-lock reconcile, still 0 rows) | claim(a, D1) | 0 rows | unchanged |
| L4 | a:accepted | claim(a, D1) | 0 rows | unchanged |
| L5 | a:pending owned by V, caller U | claim(a, D1) | 0 rows | unchanged |
| L6 (F-L1) | a:refused [claimed T0-31h, settled T0-30h] attempt 1; requeue a; claim(a, D1) | requeue then claim, then `dup_lookup` for K, D1 | requeue: a pending with claimed/settled/code/http all null, attempt 1; claim: sending attempt 2, claimed T0, settled null; lookup RETURNS a. Under the ops-literal CLAIM (settled_at kept) the lookup would NOT return a (anchor T0-30h) - that is the defect |
| L7 (F-L2) | a:pending (batch B1), b:pending (batch B2), same K, D1 | claim(a) then claim(b) | claim(a): 1 row. claim(b): 0 rows (a is sending, anchor T0 inside window) | b still pending |
| L8 | a:accepted settled T0-10m; b:pending, same K | claim(b) | 0 rows | b pending |
| L9 | a:accepted settled T0-25h; b:pending | claim(b) | 1 row (a outside window) | b sending |
| L10 (F-L3) | b:pending allow_resend=true created T0-5m; a:accepted settled T0-1h | claim(b) | 1 row (a's anchor T0-1h is not later than b.created_at T0-5m, so the override ignores it) | b sending |
| L11 (F-L3) | b allow_resend=true created T0-5m; a:accepted settled T0-2m | claim(b) | 0 rows (a settled AFTER the override decision) | b pending |
| L12 | a:sending claimed T0-300s (stale, unreconciled); b:pending same K | claim(b) | 0 rows (the in-lock reconcile moves a to unknown, which is in the guard set; revision 2 changes a's stored state, not the return) | b pending; a: unknown, code unknown-stale-claim, settled T0 |
| L13 | claim with `p_window_ms` = 0; and (separately) with `p_stale_ms` = 0 | claim | raises (22023) | unchanged |
| L14 (F-L6, revision 2) | a:sending claimed T0-48h, NEVER reconciled (no Start, `dup_lookup` or `reconcile` has run); b:pending same K, D1, allow_resend false; the first and only call is claim(b) | claim(b, D1, WINDOW, STALE) | 0 rows - CLAIM alone reconciles a, so the guard sees it and EXCLUDES the recipient (no second send) | a: unknown, code unknown-stale-claim, settled T0 (committed although the claim returned 0 rows); b still pending. Under a CLAIM with no in-lock reconcile a's anchor is T0-48h, outside WINDOW, the guard is empty and b is claimed (the defect) |

### 5.5 SETTLE

| ID | Input | Call | Expected return | Stored after |
|---|---|---|---|---|
| S1 | a:sending | settle(a, accepted, ok, 200) | true | a: accepted, code ok, http 200, settled T0 |
| S2 | a:unknown (reconciled; code unknown-stale-claim) | settle(a, accepted, ok, 200) | false | unchanged: unknown, unknown-stale-claim |
| S3 | a:pending | settle(a, accepted, ok, 200) | false | unchanged |
| S4 | a:sending | settle(a, pending, ...) | raises | unchanged |
| S5 | a:sending | settle(a, accepted, refused-http, 400) | raises (CHECK 23514) | unchanged: sending |
| S6 | a:sending | settle(a, unknown, unknown-http, 503) | true | unknown, unknown-http, http 503 |

### 5.6 START, REQUEUE, PRUNE

| ID | Input | Call | Expected |
|---|---|---|---|
| T1 | empty ledger, 3 recipients | start_batch | 3 rows `inserted`, one shared new batch id, all `pending`, attempt 0, allow_resend false |
| T2 | 251 recipients, `p_max_recipients` 250 | start_batch | raises; zero rows persisted |
| T3 | arrays of unequal length | start_batch | raises; zero rows |
| T4 | same (course, recipient) pair twice in the arrays | start_batch | raises (23505); zero rows persisted (whole batch rolled back) |
| T5 | no auth (service-role or anon call) | any of the 7 public functions | raises 28000 |
| Q1 | a:refused attempt 1, b:refused attempt 3, c:accepted, d:refused in another batch; `p_max_attempts` 3 | requeue_refused(batch of a,b,c) | returns 1; a pending (nulls), attempt 1; b, c, d unchanged |
| P1 | rows created T0-91d (any status), T0-89d, and another owner's T0-91d | prune(90, 500) | returns 1; only U's 91-day row deleted |
| P2 | 700 rows created T0-100d | prune(90, 500) | returns 500; 200 remain |

---

## 6. R-W2-11 - the two-tab race: DECISION

**The gap, restated from the ops doc and the tree.** Two tabs confirming one Preview at
once each call Start and each get their own `pending` row under their own `batch_id`
(the per-batch unique key cannot collide across batches). Each then claims its OWN row;
under READ COMMITTED neither claim sees the other, and `pending` is deliberately not in
DUP's status set. Both POST.

### 6.1 The three options

| Option | Mechanism | Closes it? | Cost | Verdict |
|---|---|---|---|---|
| A. Documented acceptance | Single-flight `canStartSend` (ops S4 item 6) and the frozen digest narrow the SAME-BROWSER case only; nothing at the DB | No: a second tab, or a double click that races the single-flight flag, still double-sends | Zero build. Impact if it fires: one student gets one duplicate message (irreversible, mild) | Acceptable only if the owner explicitly accepts that exposure |
| B. Advisory lock + cross-batch guard in the CLAIM RPC (this section) | One `pg_advisory_xact_lock` per claim over the recipient key, guard (`live_message_dup_rows`) inside the lock, then the conditional UPDATE | Yes for every simultaneous claim of the same `(user, institution, course, recipient, digest)`; a second claimant waits, then sees the first's `sending` / `accepted` / `unknown` and gets 0 rows | One plpgsql function (about 65 lines of SQL, section 4.4, including the in-lock reconcile), one persisted boolean column (`allow_resend`), a claim that is an RPC instead of a PostgREST filter chain (weaker in-suite instrument, section 11), an extra lock round trip inside the same transaction | RECOMMENDED |
| C. A "recorded-acceptance" construct: a unique index over `(user_id, institution, course_id, recipient_id, body_digest) where status in ('sending','accepted','unknown')` so the second claimant hits a unique violation | Partly: blocks the concurrent claim, but a plain partial unique index cannot express the 24h window (`now()` is not allowed in an index predicate - the ops doc already rejected this for the same reason, ops R6 "Known race" bullet) and it makes "Resend anyway" impossible (the override row would violate it). A token table with expiry sweeps would re-implement the window by hand | Not adopted | - | Rejected, reasons as stated |

### 6.2 Why the lock belongs at CLAIM, not at Start (F-L2)

A lock around the Start-time DUP + INSERT serializes the two Starts, but the second
Start's DUP still finds only the first batch's `pending` rows, which DUP ignores by
design. Making DUP include `pending` would break the reload-and-rebuild path (an
abandoned batch's `pending` rows would block the rebuilt batch for ever). The only point
at which "someone else is about to POST this" is true and decidable is the claim, and the
only thing a claim can safely test is the committed state of OTHER rows for the same key.
Hence: lock, guard, claim, in one transaction (4.4).

What option B does NOT close, stated so it is not oversold:
- Two tabs with DIFFERENT rendered text (different digest) are different messages by the
  ops definition and both send.
- A platform kill between the POST and the settle is handled by RECONCILE, not the lock.
- Two tabs that BOTH override the same recipient within one decision: both override rows
  ignore rows that predate their own `created_at`, but each sees the other's `sending`
  /`accepted` row if it was claimed/settled AFTER its own creation (L11), so the second
  override claimant is blocked; only a pair whose creation and claim interleave so that
  neither's anchor is later than the other's `created_at` could both pass - a window of
  one transaction. Recorded as R-L-2's check 4, not as closed.

### 6.3 `allow_resend` and the decision horizon (F-L3, DL-D7)

The owner's "Resend anyway" is a decision made at the confirm dialog about the world as
it was THEN. So an override row ignores any other row whose anchor is NOT later than its
own `created_at` (`p_after = created_at` in 4.4), and still honours a send that happened
after the owner decided (the other tab's override send). `created_at` is immutable (no
function updates it), so the horizon cannot move. A row without the flag (`allow_resend =
false`) ignores nothing.

### 6.4 Cost summary for the owner

Build: one 65-line function and one boolean column on top of the work the ledger needs
anyway. Run: one extra advisory lock plus one indexed read per recipient claim (57 per
class send), inside an already-existing round trip. The price is on the TEST side:
CLAIM's behaviour cannot be exercised in vitest (section 11).

---

## 7. RLS, grants, and walling off the unattended runner

**The finding that shapes this section.** `requireAppOwner` honours an impersonated
owner identity (`src/lib/supabase/auth.ts:408-415`) with NO browser session, and
`getImpersonatedOwner()` is checked FIRST. An unattended runner that reached the send
path would pass the app-level gate. The ops doc walls this off with import pin P12. The
database can add a second, independent wall because every unattended path has no user
JWT.

**Design (DL-D2).**
- RLS ON (`alter table public.live_message_sends enable row level security;` - the form
  `src/supabase-migrations.rls-coverage.structure.test.ts` requires for every created
  table; its regex accepts the `public.` prefix).
- Exactly ONE policy, SELECT, own rows:

```sql
drop policy if exists "Users read own live_message_sends" on public.live_message_sends;
create policy "Users read own live_message_sends"
  on public.live_message_sends for select
  using (auth.uid() = user_id);
```

  No insert, update or delete policy for `authenticated`: the ONLY writes are the seven
  public RPCs, which are `security definer` and bound to `auth.uid()`. So a browser
  client cannot forge a transition (for example `refused -> pending`) even with the
  owner's own token; it can call only the state-machine functions, each of which
  enforces its own `WHERE status = ...`. Precedent for "no client-side write path at
  all": `20261012000000_create_app_users.sql:95-113` (app_users: select-own policy, "NO
  insert, update, or delete policy for authenticated").
- Defence in depth on privileges (idempotent, harmless if the role does not hold the
  privilege):

```sql
revoke insert, update, delete, truncate on public.live_message_sends from anon, authenticated;
revoke all on public.live_message_sends from anon;
```

- Function execute rights. Supabase grants `execute` on new `public` functions to
  `anon`, `authenticated` and `service_role` by default privileges (my knowledge of
  Supabase, NOT verified in this repo: `grep -rn "grant \|revoke " supabase/migrations`
  found no precedent). So the migration revokes from all four roles explicitly, then
  grants the seven public functions to `authenticated` only:

```sql
revoke all on function public.live_message_uid() from public, anon, authenticated, service_role;
revoke all on function public.live_message_dup_rows(uuid, text, text[], text[], text[], bigint, uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.live_message_reconcile(bigint) from public, anon, authenticated, service_role;
grant execute on function public.live_message_reconcile(bigint) to authenticated;
-- ... the same revoke-then-grant pair for dup_lookup, start_batch, claim, settle,
-- requeue_refused and prune, each with its full argument-type signature.
```

**What this gives, honestly.**
1. Cross-owner isolation: every function filters on `auth.uid()`; the SELECT policy is
   the same predicate. A non-owner active account (the app has them,
   `20261012000000_create_app_users.sql`) that reached the RPCs directly could only
   create and read its OWN rows, which carry no Canvas capability.
2. The unattended runner is walled TWICE. Pin P12 stops the import; and even if a future
   step imported the send action, the runner has no user JWT, so `auth.uid()` is null and
   `public.live_message_uid()` raises -> every ledger call fails -> A5/A6 refuse
   `ledger-unavailable` -> NOTHING is sent. A service-role call fails the same way.
   This is a runtime fail-closed property that depends on the ledger module being handed
   the cookie-session client (`createClient()` in `src/lib/supabase/server.ts:91`) and
   NEVER `createServiceClient()` (`:126`). DL-11 pins that the ledger module and the
   walled action files do not reference `createServiceClient` or
   `SUPABASE_SERVICE_ROLE_KEY`.
3. What it does NOT give: the `service_role` key bypasses RLS and holds table
   privileges, so anyone with that key can edit the ledger directly. That is the trust
   root of the whole app; only owner-secret handling protects it (same as
   `lms_credentials`, `accessibility_scans`).

**Why the database does not also check "is an owner".** The obvious extra layer - an
`exists (select 1 from app_users where id = auth.uid() and role = 'owner' and status =
'active')` inside each function - would be WRONG: `resolveAccess` returns `owner` for an
allowlisted, email-verified address WITHOUT consulting the stored row
(`src/lib/access.ts:168-170`, then the stored-row path at `:176-190`). An allowlisted
owner with no `owner` row in `app_users` would be locked out by the SQL while the app
considers them the owner. The owner decision stays single-sourced in `requireAppOwner`;
the database scopes by identity only.

**Honest limit.** Whether the grants, the policy and the `auth.uid()` null path behave as
described is exactly what no test here can show (`this-repo.md` section 6: no live
database). Owner check R-L-3: call each RPC with (a) the owner's browser token, (b) the
service-role key, (c) the anon key, and confirm only (a) succeeds.

**Session-refresh note.** The JWT client inherits whatever `requireAppOwner` already does
per action (`resolveSessionAccess` calls the cookie client per request,
`auth.ts:141`); concurrent A6 calls at `L = 3` share a session cookie. I did not measure
refresh-token behaviour under concurrency; R-L-9.

---

## 8. TYPED MAPPER and the module surface

Memory `supabase-types-never-rows` and the precedents (`mapRecordingFile` at
`src/lib/recording-files.ts:261`; for tables the generated `Database` type does not
know, `mapScheduledRelease` at `src/lib/scheduled-releases.ts:265` and `table()` at `:292`;
`heartbeatTable()` at `src/lib/cron-heartbeat.ts:74` and `mapCronHeartbeat` at `:83`) establish
the pattern: a single `any`-cast table accessor confined to one function, rows mapped
field by field from `Record<string, unknown>`. This design follows the scheduled-releases
form and does NOT edit `src/lib/supabase/types*.ts` (the new table is deliberately
absent from the generated `Database` type; `grep -n "scheduled_releases\|cron_heartbeat"
src/lib/supabase/types*.ts` -> no output confirms the two precedents are absent from it
too).

New file `src/lib/live-messaging/send-ledger.ts` (inside the ops-doc walled glob
`src/lib/live-messaging/**`), exporting:

```ts
export type LedgerStatus = "pending" | "sending" | "accepted" | "refused" | "unknown";
export type LedgerCode =
  | "ok" | "refused-pre-send" | "refused-http" | "refused-rate-limited"
  | "unknown-http" | "unknown-no-response" | "unknown-stale-claim";

export interface LedgerRow {
  id: string;
  batchId: string;
  institution: string;
  courseId: string;
  recipientId: string;
  bodyDigest: string;
  status: LedgerStatus;
  code: LedgerCode | null;
  httpStatus: number | null;
  attempt: number;
  allowResend: boolean;
  createdAt: string;
  claimedAt: string | null;
  settledAt: string | null;
}

export function mapLedgerRow(row: Record<string, unknown>): LedgerRow;
```

Mapper rules (each pinned by DL-7 against LITERAL rows):
- Field by field; never a spread. The output has exactly the 14 keys above. `user_id` is
  deliberately NOT carried (the app never needs it, and a field never read is a field
  that cannot leak). Unknown extra input keys (for example a future `student_name`) never
  appear in the output.
- `status`: a closed validator; an unrecognised value maps to `"unknown"`, the
  never-resend state, NEVER to `"pending"` and NEVER throws (a ledger that guards
  against double sends must fail toward "possibly sent"). `code`: closed validator,
  unrecognised -> `null`.
- `httpStatus`, `claimedAt`, `settledAt`, `code`: null stays null (tri-state, the
  `optionalBoolean` lesson at `scheduled-releases.ts:257-262`); `attempt` coerces with
  `Number(...)` and defaults 0; timestamps pass through as the ISO strings PostgREST
  returns (as `scheduled-releases.ts:282` does).
- A pure `ledgerKey(row)` = `${courseId}:${recipientId}` (the ops opaque recipient key).

RPC wrapper layer (same file or `send-ledger-rpc.ts`, plan seat's choice; size is far
under the 1000-line ceiling enforced by `src/file-size-ceiling.structure.test.ts`):
- ONE private accessor `ledgerTable(supabase)` (the only `as any` in the module, with the
  same eslint-disable comment the precedents carry) and ONE private
  `callLedgerRpc(supabase, name, args)` whose `name` is a closed union of the 7 public
  function names. Each public wrapper returns
  `{ ok: true; ... } | { ok: false }`; `ok: false` covers an RPC error object, a thrown
  rejection AND the ops 3s race timeout. The caller NEVER treats `ok: false` as "no
  rows" (that is the dangerous swallow DL-8 mutates).
- Wrappers: `reconcileStale`, `lookupDuplicates`, `startBatch`, `claimRow`, `settleRow`,
  `requeueRefused`, `pruneOld` (names illustrative), plus reads `readRowByKey` (A6) and
  `readBatchRows` (A7), which are plain selects through the SELECT policy and the mapper.
- `ledgerOutcomeFor(result: StudentSendResult): { status; code; httpStatus }` is a pure,
  total mapping from the ops R5 result to a `(status, code, httpStatus)` triple that is
  guaranteed to satisfy `live_message_sends_state_shape`: accepted -> `accepted`/`ok`;
  refused `refused-pre-send`/`refused-http`/`refused-rate-limited` -> `refused` + the
  same code; unknown `unknown-http`/`unknown-no-response` -> `unknown` + the same code.
- The constants leaf (ops: "ONE constants leaf") gains `SENDING_STALE_MS`,
  `DUP_WINDOW_MS`, `LEDGER_RETENTION_DAYS`, `PRUNE_BATCH_LIMIT` next to the ops limits.
  It does not exist yet (`ls src/lib/live-messaging` above); whichever wave creates it
  owns the file and the plan seat must not create it twice.

Reachability (an assignment must include the file that CALLS each export): this module
has NO caller until the W4 actions (A4-A8) exist. The W4 plan must put the ledger module
and the action file in the same wave, or the module ships dead with every gate green
(`traps-spec.md`, "An assignment must include the file that CALLS the new export").

---

## 9. MIGRATION

- One new file under `supabase/migrations/`, named by the house convention
  `<14-digit timestamp>_<snake_case>.sql`, for example
  `<next>_create_live_message_sends.sql`. The version MUST be strictly greater than the
  newest on disk AT BUILD TIME: re-derive with `ls supabase/migrations | tail -1`
  (`20261028000000_...` when I measured). Supabase's CLI refuses to push a migration
  whose version sorts before one already applied unless `--include-all` is passed - my
  knowledge of the CLI, not verified here, and the workflow runs a bare `supabase db push`
  (`.github/workflows/supabase-migrations.yml`, last step). The existing files already
  skip dates (for example `20260925...` then `20260930...`), so "next day" is not a rule;
  "greater than the tail" is.
- It applies itself: `.github/workflows/supabase-migrations.yml` runs on push to main
  when `supabase/migrations/**` changes (its `on.push.paths`), pinned CLI 2.111.0,
  serialized by `concurrency: supabase-migrations`. So the Action run is the first and
  only real execution of this SQL (R-L-1); a red run means the schema did not land while
  any TypeScript depending on it did - the exact failure the lexical structure test's
  header describes. THEREFORE the TS wiring that calls the RPCs should land in the same
  push as, or after, a green Action run, and the build seat reads the Action result
  before declaring done (memory: `migrations-auto-apply-via-action`; no manual apply is
  ever instructed).
- Contents, in order: table + constraints; three indexes; `enable row level security`;
  the one SELECT policy; the privilege revokes; `live_message_uid`; `live_message_reconcile`;
  `live_message_dup_rows`; `live_message_dup_lookup`; `live_message_start_batch`;
  `live_message_claim`; `live_message_settle`; `live_message_requeue_refused`;
  `live_message_prune`; the revoke/grant block. 9 functions. Every statement idempotent
  (`if not exists`, `drop policy if exists`, `create or replace`, repeatable revoke/grant).
- A header comment in the house style: why `user_id` not `owner_id`, why text+CHECK not
  enum, why no PII column, why the claim is an RPC, why `volatile`, the `created_at`
  horizon, why CLAIM reconciles its own key inside the lock (so it never depends on a
  prior Start), the "no service-role" rule, and the implicit reliance stated under the
  REVISION 2 header (`live_message_uid` SECURITY INVOKER, `live_message_dup_rows` callable
  from the definer functions, neither granted to an API role) - the `lms_credentials` header is the model for
  "write the reasoning where the next editor will read it" (its RLS section warns
  against the exact simplification a later editor would be tempted by).
- Gates the build must run, through the wrapper, in addition to the new tests:
  `npm run test:paths src/supabase-migrations.structure.test.ts
  src/supabase-migrations.rls-coverage.structure.test.ts src/sql-citations.structure.test.ts
  src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts
  src/source-bytes.structure.test.ts`. The `sql-citations` test applies the moment any
  `.ts` file cites a directory-qualified `.sql` path; the citation must resolve, so cite
  only after the file exists in the same commit.

---

## 10. RETENTION (D-limit)

Recommendation (DL-D3): **90 days from `created_at`**, enforced by a lazy, best-effort,
bounded prune.

- Basis: the guard needs only `DUP_WINDOW_MS + SENDING_STALE_MS` (24h plus 2 minutes) of
  history; the rest is audit. 90 days matches the ops default and covers a term.
  Invariant: `LEDGER_RETENTION_DAYS * 86_400_000 > DUP_WINDOW_MS + SENDING_STALE_MS`
  (DL-10), so a prune can never remove a row the guard still needs.
- **What deletes it** (the question the Data checklist demands be answered):
  `live_message_prune(p_retention_days, p_limit)` (4.7), called by A4 (Prepare) after the
  reconcile/lookup, with `p_limit = 500`, and its failure IGNORED (best-effort: it is not
  safety-critical, unlike reconcile). It deletes only the caller's own rows. It runs when
  the feature is used, so an unused feature neither grows nor needs a job - the table is
  self-bounding by use.
- Plus `on delete cascade` from `auth.users`: removing the account removes its ledger.
- Alternatives rejected: (1) reuse `sweep-orphan-uploads` - it prunes Storage objects,
  not rows (F-L8); (2) a new cron route + workflow mirroring the sweep - three new files
  and a further widening of `CRON_SECRET`'s blast radius (the sweep workflow's own
  header comment) for a table of megabytes; (3) `pg_cron` - `grep -rn "pg_cron\|cron.schedule"
  supabase` found nothing, so it would be a first-of-its-kind extension dependency this
  environment cannot verify.
- A4's contract changes slightly versus the ops text ("writes ONLY the Z reconcile"): it
  also issues the best-effort prune. Recorded; harmless to the safety argument.
- Pending rows older than the retention are deleted with everything else (an abandoned
  batch's "not attempted" rows, ops R6 reload paragraph, are removed by this, as the ops
  text says "removed by retention").

---

## 11. INSTRUMENTS for the later build and test seats

**The central limit, stated first.** Because CLAIM (and, for DB-clock and atomicity,
RECONCILE, DUP and SETTLE) are RPCs, their predicates live in SQL that vitest cannot
execute. The ops doc's pins P33a, P33b and P33e (and the CLAIM half of P21) were written
for a "recording client plus in-memory emulation of the recorded FILTER CHAINS" - there
are no filter chains to record any more. This is an instrument change, not just a
relocation, and it is the price of option B and of the DB clock (DL-D1). Three layers
replace it:

1. **TS wrapper layer - executed.** Mapper, wrapper fail-closed behaviour, outcome
   mapping, constants: tested against a fake client that records `.rpc(name, args)`.
2. **SQL TEXT layer - executed, but a source-text instrument.** Offline structural tests
   over the migration file in the repo's existing idiom
   (`src/supabase-migrations.accessibility-scans-rls.migration.test.ts`,
   `src/lib/knowledge-overview.migration.test.ts`, and the column-extractor-with-canary in
   `src/lib/cron-heartbeat.test.ts:384-475`). They pin FACTS (a clause exists, a status
   list equals a literal), not spelling (memory `source-text-tests-overspecify`). They
   prove the SQL TEXT asks for the right thing; they cannot prove Postgres does it.
3. **Scenario oracle - two consumers of ONE literal table (section 5).** (a) A TS
   fixture file holds the section-5 tables as data. An in-test MODEL of the ledger
   (written by the test seat) is run against it: this proves the SPEC is self-consistent
   - for example, that the ops-literal CLAIM (no `settled_at` reset) fails scenario L6 -
   and NOTHING MORE; the P33 caveat applies in full (a model written from the same
   reading as the SQL agrees with it by construction). (b) The same table is rendered to
   a SQL script the OWNER runs against a throwaway database (R-L-1), where it is
   executed for real. Expected values come from the literal table only; the model never
   produces an expected value.

| Pin | Object under comparison | Instrument | Red when | Mutant that must flip it |
|---|---|---|---|---|
| DL-1 | the new migration file vs the lexical and RLS gates | existing `supabase-migrations.structure.test.ts` + `.rls-coverage.structure.test.ts` + `sql-citations.structure.test.ts` via `npm run test:paths` | any gate red (undoubled apostrophe, no RLS enable) | add `it's` outside a comment; delete the `enable row level security` line |
| DL-2 | columns extracted from `create table if not exists public.live_message_sends (` vs the literal 15-name list `id, user_id, batch_id, institution, course_id, recipient_id, body_digest, status, code, http_status, attempt, allow_resend, created_at, claimed_at, settled_at`; and a forbidden-name scan (`name`, `email`, `subject`, `body`, `message`, `score`, `grade`, `first`, `last`) | cron-heartbeat extractor idiom WITH its canary (a fixture proving it discriminates). The idiom's extractor (`extractCreateTableColumns`, `src/lib/cron-heartbeat.test.ts:399-419`, line matcher `/^([a-z_][a-z0-9_]*)\b/` at `:415`) takes ANY trimmed body line that starts with an identifier, so on this table it would also return the first word of every table-level `constraint` line AND of the `or ...` / `and ...` continuation lines of the multi-line `live_message_sends_state_shape` CHECK. The test seat must therefore skip BOTH (a) lines beginning `constraint` and (b) lines beginning `or` or `and` (equivalently: keep only lines indented exactly two spaces that are not `constraint` lines), or the exact-match column assertion is wrong. The canary fixture must include a multi-line CHECK with `or`/`and` continuations and prove they are not returned | any extra or missing column; any forbidden name | add `student_name text` |
| DL-3 | policy statements for the table: exactly one `create policy`, and it is `for select`; zero `for insert|update|delete|all`; the `revoke ... from anon, authenticated` line present | SQL text, comments stripped (accessibility-scans idiom) | policy count or kind differs | add `for all` policy |
| DL-4 | function set, attributes and signatures: names equal the literal 9; the 7 public ones contain `security definer`, `set search_path = ''`, `volatile`, and call `public.live_message_uid()` in their DECLARE block (before any statement); no function contains `stable` or `immutable`; no parameter named `p_user_id`, `p_uid`-in-a-public-function or `p_owner`; grants: `to authenticated` for exactly the 7 public names and none for `live_message_uid`/`live_message_dup_rows`; each revoke names `public, anon, authenticated, service_role` | SQL text structure test | any deviation | mark `live_message_claim` `stable`; add `p_user_id uuid` to settle |
| DL-5 | predicate FACTS per query: RECONCILE has `status = 'sending'`, a strict `<` on `claimed_at`, `now()`; DUP's `status in (...)` list parsed and equal to the set {accepted, unknown, sending} and contains the `coalesce(settled_at, claimed_at, created_at)` anchor and a strict `>`; CLAIM contains `status = 'pending'`, `body_digest = p_digest`, `pg_advisory_xact_lock`, a `transaction_isolation` assertion, `settled_at = null`, and (revision 2) an in-lock reconcile UPDATE (see DL-14); SETTLE contains `status = 'sending'`; REQUEUE nulls `claimed_at` and `settled_at`; START calls reconcile before DUP | SQL text, parsed lists (not substring-only) | any fact missing or list differs | CLAIM without `status = 'pending'`; DUP list `('accepted','unknown')`; remove the reconcile call from `dup_lookup`; drop `settled_at = null` from CLAIM |
| DL-6 | every `.rpc("<name>", {keys})` in `send-ledger*.ts`: name is one of the 9 function names (7 callable) and each argument key equals a parameter name of that function (parsed from the signature) | TS source scan + SQL signature parse | a name or key without a match (PostgREST resolves RPCs by name AND parameter names; a typo is invisible to tsc because the accessor is `any`, and fails only at runtime, as `ledger-unavailable` on every send) | rename one argument key |
| DL-7 | `mapLedgerRow` over LITERAL rows: a full row; nulls preserved; an unknown status string -> `"unknown"`; an unknown code -> `null`; extra key `student_name` absent from output; output key set equals the literal 14 | vitest, table-driven | any mismatch | map unknown status to `"pending"`; spread the row |
| DL-8 | each of the 7 wrappers with a fake client that (a) returns `{error}`, (b) rejects, (c) never resolves within the 3s ceiling (fake timers), (d) returns rows | vitest, recording fake client | (a)-(c) not `{ok:false}`; (d) not mapped | swallow `error` and return empty rows |
| DL-9 | `ledgerOutcomeFor` over EVERY R5 result code; each triple vs the `(status, code)` pairs parsed from the migration's `live_message_sends_state_shape` CHECK | vitest + SQL text parse | any produced pair not allowed by the CHECK, or any allowed pair unreachable | map `refused-rate-limited` to status `unknown` with its refused code |
| DL-10 | constants: `SENDING_STALE_MS` in [30000, 3600000]; `DUP_WINDOW_MS` in [3600000, 2592000000]; `LEDGER_RETENTION_DAYS * 86400000 > DUP_WINDOW_MS + SENDING_STALE_MS`; `LEDGER_RETENTION_DAYS >= 8`; the SAME `SENDING_STALE_MS` export is imported by `effectiveStatus` and by the ledger wrapper (ops P22) | vitest on the constants leaf + import scan | an inequality fails or two thresholds exist | set retention to 1; hard-code 120000 in the wrapper |
| DL-11 | the ledger module and the walled action files: no identifier `createServiceClient`, no `SUPABASE_SERVICE_ROLE_KEY`; exactly one `as any` (the accessor) in the ledger module | AST identifier scan (idiom ops P3/P18) | any hit | import `createServiceClient` |
| DL-12 | the section-5 scenario table vs (a) the test seat's model and (b) the owner's SQL rendering | vitest (a, spec-consistency only); owner run (b, R-L-1) | model disagrees with a literal expected row | model CLAIM without the `settled_at` reset -> L6 flips; model DUP without `sending` -> D6/D7, C2 flip; model CLAIM without the in-lock reconcile -> L14 flips (and L12's stored-after) |
| DL-13 | a canary for the section-5 fixture: scenarios count equals the literal count (Z 7, D 14, C 3, L 14, S 6, T 5, Q 1, P 2 = 52 scenarios) so a dropped row is red | vitest | count differs | delete scenario L7 |
| DL-14 (revision 2) | CLAIM self-sufficiency: (a) the body of `live_message_claim` in the migration vs the ORDER of its statements; (b) scenario L14 through the DL-12 model | (a) SQL text structure test, comments stripped, positions of three anchors in the function body; (b) vitest model run | (a) any of: no `update public.live_message_sends` with `set status = 'unknown'` and `code = 'unknown-stale-claim'` in the body; its WHERE lacks `status = 'sending'`, a strict `<` on `claimed_at`, or any of the five key columns (`user_id`, `institution`, `course_id`, `recipient_id`, `body_digest`); or the three anchors are not in the order `pg_advisory_xact_lock` < that UPDATE < `live_message_dup_rows`; or the signature lacks `p_stale_ms`. (b) L14 expects anything but 0 rows with a reconciled to unknown | CLAIM with the in-lock reconcile deleted (L14 reds: b is claimed, a stays sending); the reconcile moved AFTER the guard (order assertion reds; L14 reds because the guard ran blind); the reconcile's key columns dropped so it is user-wide (key-column assertion reds) |

Wave-gate canaries to carry (always `npm run test:paths <p1> <p2> ...`, never a raw
multi-path vitest): the four gates in the baseline block at the top (re-run), plus
`src/file-size-ceiling.structure.test.ts`, `src/lib/no-emojis.test.ts`,
`src/source-bytes.structure.test.ts`, and the W4 files' own tests.

---

## 12. What I could not determine (not filled in)

- **Every SQL statement is unexecuted.** No Postgres, no docker, no PGlite in
  `node_modules`, network blocked. The syntax is hand-checked; a typo would only surface
  as a red migration Action. The lexical gate (`supabase-migrations.structure.test.ts`)
  checks quoting only. Specific constructs I am LEAST sure of without a run:
  `returns table` with `with ... insert ... returning` inside `return query` (4.3);
  `bigint * interval` operator resolution (standard but unrun); `perform set_config(
  'lock_timeout', '2000', true)` governing advisory waits (4.4); `update ... returning *
  into` with `found` (4.4); `hashtextextended` availability (PG version unrecorded).
- Supabase specifics stated from knowledge, not from this repo: default function
  privileges to `anon`/`authenticated`/`service_role`; the per-role `statement_timeout`;
  the pooler mode; `auth.uid()` returning null for service-role and cookie-less calls;
  the CLI's refusal of out-of-order migration versions.
- Real index use and timing (no `EXPLAIN` possible).
- Whether the JWT-client path survives session refresh under concurrent A6 calls (R-L-9).
- Files named but NOT opened: `src/lib/orphan-upload-sweep.ts`, `src/lib/supabase/types.ts`
  (and the `types.tables-*` files beyond the greps above), `src/app/api/cron/run-schedules/route.ts`,
  `src/lib/supabase/owner-context.ts` beyond its header, `docs/loop/iteration-caps.md`,
  `docs/loop/traps-tests.md`, `traps-search.md`, `traps-orchestration.md`,
  `src/lib/knowledge-overview.migration.test.ts` (cited by the header of the
  accessibility-scans test I did open). The middle of `20261015000000_lms_credentials.sql`
  beyond the header and DDL was read; the middle of `20261012000000_create_app_users.sql`
  was read at lines 95-135 and 222-240 plus a grep.
- No reference implementation was built, so "satisfiable" is argued, not demonstrated
  (`seats.md` test seat practice 1).

---

## 13. Disposition of the ops-doc requirements this pass took over

(This pass amends the ops doc rather than restructuring a prior version of itself; the
table is kept so no ops requirement or pin is silently dropped.)

| Ops requirement / pin | Status | Where / receiver |
|---|---|---|
| Ledger table, unique `(batch_id, course_id, recipient_id)`, status vocabulary, no PII columns | KEPT; columns added: `code`, `http_status` (ops listed them), `allow_resend` (F-L3) | section 2, DL-2 |
| Column name `owner_id` | CHANGED to `user_id` (house convention) | F-L5 |
| RECONCILE (persist stale `sending` -> `unknown`, DB clock, A4/A5/A7, fail closed) | KEPT; runs inside `dup_lookup` and `start_batch` by construction (F-L6) | 4.1, DL-5 |
| DUP (statuses, window anchor, pending/refused excluded, post-reconcile) | KEPT unchanged, single internal function | 4.2, DL-5 |
| CLAIM (atomic, `status='pending' AND body_digest`) | KEPT + AMENDED (F-L1 reset; F-L2 guard; by `id`; revision 2: key-scoped in-lock reconcile before the guard, new `p_stale_ms` parameter, scenario L14, pin DL-14) | 4.4 |
| SETTLE (conditional on `sending`) | KEPT | 4.5 |
| R-W2-7 (a) DUP, (b) RECONCILE, (c) CLAIM + SETTLE shapes | DISCHARGED as specification; execution proof is R-L-1 | sections 4, 5 |
| R-W2-7 (d) indexes, DDL, RLS, typed mapper, retention | DISCHARGED as specification | 2, 3, 7, 8, 10 |
| R-W2-11 simultaneous Starts | DECIDED (option B, claim-time lock); execution proof R-L-2 | 6 |
| Existing `(owner, institution, course, recipient, digest)` index | KEPT (as `live_message_sends_dup_idx`) | 3 |
| RECONCILE index "size an index or accept a scan" | DECIDED: partial index | 3 |
| "Retention via the existing sweep pattern" | WITHDRAWN: the sweep prunes Storage objects, not rows (F-L8). No enforcer was protected (nothing pruned this table before). Replaced by lazy prune | 10 |
| A4 "writes ONLY the Z reconcile" | CHANGED: also a best-effort prune | 10 |
| A5 DUP "authoritative" | KEPT as authoritative-for-UX; CLAIM is the final authority | 4.3, 4.4 |
| P22 (one stale constant) | KEPT, extended to the window and retention | DL-10 |
| P33a (DUP predicate), P33b (RECONCILE stored write), P33e (claim/settle shapes) | INSTRUMENT CHANGED: filter-chain emulation does not exist for RPCs; replaced by DL-5 (SQL-text facts) + DL-12 (scenario oracle, model + owner SQL). Handed to the test seat; weakness stated in section 11 | 11 |
| P33c (incident end to end, A6 settle fails then A4/A5), P33d (A5 re-runs DUP, fails closed) | HANDED OVER to the W4 test seat (they exercise TS actions A4-A6 against a fake client); the SQL they depend on is specified here (scenarios C1-C3) | W4 |
| P21 (A6 twice / concurrently, one POST) | HANDED OVER: the TS half (a 0-row claim means no POST) is the W4 test seat's; the Postgres half is R-L-2 | W4, R-L-2 |
| P23 (claim rejects/times out -> no POST), P31 (window inside/outside) | KEPT; P23 is W4 (wrapper `ok:false`, DL-8); P31's SQL half is scenarios D1-D4 | W4, 5.2 |

---

## 14. Residual register (owner / instrument / step; a missing one is a deletion)

| ID | Not proven now | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R-L-1 | The SQL in this document has never executed: syntax, the `returns table`/CTE insert, the CHECK shapes, the grants, the scenario results | repo owner (with the W4 build seat) | the migration Action run (`supabase db push`) for "applies", then the section-5 scenarios rendered to SQL and run on a throwaway Supabase project with `request.jwt.claims` set to the owner uid | W4 build: Action run read before done; owner walk after the W4 push |
| R-L-2 | Concurrency: (1) two simultaneous claims on one row, (2) two simultaneous claims on different rows with one key (the F-L2 race), (3) reconcile vs settle, (4) two tabs both overriding one recipient, (5) the in-lock key-scoped reconcile against a concurrent user-wide reconcile on one key with two or more stale `sending` rows (deadlock-or-not; a 40P01 is acceptable and fails closed) | repo owner | two browser tabs confirming one Preview at once on a throwaway course, then reading the Canvas Sent folder; plus two SQL sessions (`begin; select ... claim`, hold, second session claims) | owner walk after the W4 push (extends ops R-W2-1/-4) |
| R-L-3 | RLS, grants and the null-`auth.uid()` fail-closed path behave as specified | repo owner | call each of the 7 RPCs with the owner token, the service-role key, and the anon key; confirm only the owner call succeeds, and that a direct `update` from the browser client is refused | owner walk after the W4 push |
| R-L-4 | Platform facts used but unverified: Postgres major version (`hashtextextended`), default function privileges, `lock_timeout` on advisory waits, per-role statement timeout, pooler mode, default isolation, CLI migration ordering | repo owner | Supabase dashboard (database version, pooler settings) and the Action log | before the W4 build brief is written (version) / W4 build (rest) |
| R-L-5 | Index plans and the volume arithmetic (assumed 300 batches a year, 250 bytes a row) | repo owner / ops | `EXPLAIN` of the DUP and RECONCILE statements and `select count(*)` on the live table after a term | after first real use; no code blocks on it |
| R-L-6 | Digest brute-force: sha256 over low-entropy fields is guessable by someone with ledger read plus the template (DL-D6) | repo owner (security decision) | decision whether to HMAC under a server env key; if yes, an env var set in Vercel and a one-function change | owner decision at W4 brief time; default plain sha256 |
| R-L-7 | No in-process Postgres, so predicates are "asked for", not "executed", in the suite (DL-D8) | repo owner | decision to add PGlite as a devDependency (network install, auth-schema stubs); with it the migration and scenarios run in vitest | owner decision; not blocking W4 |
| R-L-8 | RECONCILE stamps `settled_at = now()`, so a long-abandoned `sending` row blocks resend for a fresh 24h (F-L7) | repo owner | observe on the owner walk whether it matters; the alternative is anchoring reconciled rows on their `claimed_at`. Revision 2 adds a second effect of the same re-anchor: an `allow_resend` row whose stale `sending` sibling is reconciled at CLAIM time is blocked (the sibling is now anchored after the override row's `created_at`); the owner re-overrides via a fresh Start. Not pinned by a scenario | owner walk; no code unless it bites |
| R-L-9 | JWT-client session refresh under concurrent A6 calls (`L = 3`) | W4 build seat, then owner | Browser pane network log during a 57-recipient owner walk: any 401/refresh storm on RPC calls | owner walk after the W4 push (shares ops R-W2-3/-4) |
| R-L-10 | The section-5 model/oracle agrees with Postgres | W4 test seat, then owner | DL-12(a) in vitest; DL-12(b) run by the owner | W4 test; R-L-1 |

Owner decisions this pass hands up, each with its recommended default (an answer ends
the activity; the artifact ships with the answer applied and the rest in the register):
DL-D1 advisory-lock claim (B); DL-D2 JWT + definer RPCs; DL-D3 retention 90 days via
lazy prune; DL-D4 `SENDING_STALE_MS` 120000; DL-D5 `DUP_WINDOW_MS` 24h (with the
identical-daily-message consequence noted); DL-D6 plain sha256 now; DL-D7 horizon
semantics; DL-D8 PGlite not now.

## 15. Commands run (provenance)

- Revision 2 additions: `grep -n "match(/" src/lib/cron-heartbeat.test.ts` (pattern
  `\^\(\[a-z_\]`) -> line 415 `line.match(/^([a-z_][a-z0-9_]*)\b/)`, and
  `src/lib/cron-heartbeat.test.ts:399-419` opened (the extractor); claim function length
  by `awk` from its `create or replace function` line to the closing `$fn$;` -> 65 lines;
  scenario count re-derived from section 5 (Z 7 + D 14 + C 3 + L 14 + S 6 + T 5 + Q 1 +
  P 2) = 52. No test or gate was re-run (document-only edit; SQL still unexecuted).
- `git rev-parse --short HEAD` -> `d4421dba` (task issued at `dcce6f79`).
- `@(Get-Content docs/live-lms-student-messaging-ops.md).Count` -> 1048.
- `ls supabase/migrations | wc -l` -> 113; `ls supabase/migrations | tail -1` ->
  `20261028000000_add_cartridge_drop_assignment_description.sql`.
- `grep -rln "user_id" supabase/migrations | wc -l` -> 47; `grep -rn "owner_id"
  supabase/migrations | wc -l` -> 0.
- `grep -rn "create type" supabase/migrations` -> no output; `grep -rn "grant \|revoke "
  supabase/migrations` -> only two comment mentions of "grant" in app_users migrations.
- `grep -rn "live_message_sends\|SENDING_STALE_MS\|DUP_WINDOW_MS\|send-ledger\|live_message_"
  src supabase .github -l` -> no output; `ls src/lib/live-messaging` -> 12 files.
- `grep -rn "pg_cron\|cron\.schedule" supabase | wc -l` -> 0 (no pg_cron use in the
  migrations; this grep was not run against `src`).
- `grep -n -i "pool\|isolation\|major_version\|statement_timeout" supabase/config.toml`
  -> no output; `wc -l supabase/config.toml` -> 8.
- `which psql postgres pg_ctl docker` -> none; `ls node_modules | grep -i -E
  "pglite|pg-mem|^pg$|postgres|sqlite"` -> no output.
- `npm run test:paths src/supabase-migrations.structure.test.ts
  src/supabase-migrations.rls-coverage.structure.test.ts src/sql-citations.structure.test.ts
  src/supabase-migrations.accessibility-scans-rls.migration.test.ts` -> four COVERED lines
  quoted at the top (21 passed).
- Files opened in full: `docs/DEV_LOOP.md`, `docs/live-lms-student-messaging-ops.md`,
  `docs/loop/traps-spec.md`, `supabase/migrations/20260817000000_create_message_drafts.sql`,
  `20261008000000_scheduled_releases.sql`, `20260703000000_knowledge_usage.sql`,
  `.github/workflows/supabase-migrations.yml`, `.github/workflows/sweep-orphan-uploads.yml`,
  `src/supabase-migrations.structure.test.ts`, `src/supabase-migrations.rls-coverage.structure.test.ts`,
  `src/sql-citations.structure.test.ts` (to line 122),
  `src/supabase-migrations.accessibility-scans-rls.migration.test.ts`. Opened in part:
  `docs/loop/seats.md` (Data/storage section), `docs/loop/this-repo.md` (sections 1-6),
  `20261015000000_lms_credentials.sql`, `20261012000000_create_app_users.sql`,
  `20261018000000_course_intel_answers.sql`, `src/lib/scheduled-releases.ts`,
  `src/lib/cron-heartbeat.ts`, `src/lib/cron-heartbeat.test.ts:384-475`,
  `src/lib/recording-files.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/auth.ts`,
  `src/lib/access.ts`, `src/app/api/cron/sweep-orphan-uploads/route.ts`.
