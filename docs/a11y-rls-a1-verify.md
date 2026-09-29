# As-built verify: A11Y-RLS branch A1 (deny-all RLS on accessibility_scans)

Fresh adversarial verify of the UNCOMMITTED working-tree diff a Sonnet
implementer wrote. I did not author it. Read-and-reason only; I mutated nothing
in the repo (every red-direction check ran against in-memory copies in the
session scratchpad). No commit, no push, no `git checkout --`, no `git stash`,
no `git add -A`. My write set is this one file.

**Highest-consequence note up front:** this migration auto-applies to production
on push to main via `.github/workflows/supabase-migrations.yml`. Everything I
could verify here is repository-side (DDL text, deny-all shape, idempotency
logic, instrument red directions, accessor client type). NOTHING here proves
real RLS enforcement, that `service_role` still carries `BYPASSRLS` in the
production project, or that the Action run itself succeeds. Those are the
owner's post-apply steps, named at the end.

## Verdict

**LANDS AND PUSHES AS-IS. 0 blockers, 4 residuals (all owner post-apply /
pre-existing, none gating this migration), attacks otherwise run and empty.**

The A1 decision itself (deny-all over the scope's original four-policy form) is
DECISION 19 / the round-1 check's BLOCKER-1 and is not reopened here.

## What was verified clean

### 1. DDL matches the retired file verbatim (Attack 1) - CLEAN

`git show HEAD:src/lib/supabase/accessibility_scans.sql` vs
`supabase/migrations/20261026000000_accessibility_scans.sql:51-68`. All 12
columns identical in name, type, nullability, and default; primary key
`(user_id, institution, course_id, item_type, item_id)` identical; index
`accessibility_scans_course_idx on public.accessibility_scans (user_id,
institution, course_id)` identical in name and columns. `create table if not
exists` cannot reconcile a shape difference against a pre-existing production
table, so verbatim identity is what makes convergence hold - and it holds.

### 2. Deny-all is actually deny-all (Attack 2) - CLEAN

- `enable row level security` as a real statement appears exactly once:
  `grep -n "enable row level security;" ...` -> line 70 only. (`grep -c "enable
  row level security" ...` -> 2; the second is header prose on line 8, which
  every instrument strips.)
- Zero policies: `grep -in "create policy" ...` -> 0.
- Zero grants: `grep -in "grant" ...` -> 0.
- No FK: `grep -in "foreign key\|references" ...` -> only line 37 ("NO FOREIGN
  KEY ...") and line 41 (a comment explaining why an FK fails on apply). Both
  are `--` comment lines; no `references auth.users` constraint exists.
- Service-role bypass holds: `src/lib/supabase/server.ts:126-129`
  `createServiceClient` reads `process.env.SUPABASE_SERVICE_ROLE_KEY!` (no
  anon fallback). `src/lib/supabase/accessibility.ts` imports ONLY
  `createServiceClient` (line 1) and uses it at all three accessor call sites
  (lines 40, 63, 94: `grep -n "createServiceClient\|from(" ...`). No anon or
  browser client anywhere in the file.
- Independent sweep for any OTHER accessor:
  `grep -rn 'from("accessibility_scans"' src/ --include=*.ts --include=*.tsx`
  outside accessibility.ts -> none. The table name appears elsewhere only in
  generated type defs (`types.ts:340`, `types.tables-a.ts:1`), which is the
  exact section-5.3 latent hazard that deny-all CLOSES. Importers of the
  accessors: `src/app/api/accessibility/route.ts:17` (server route) and the
  `canvas-modules` barrel re-export. No client-side reader would be broken by
  deny-all.

### 3. Idempotency and convergence (Attack 3) - CLEAN

`create table if not exists` (guarded), `create index if not exists` (guarded),
`enable row level security` (idempotent no-op when already enabled), and zero
policies means nothing can collide on re-run. Convergent from both production
states (table pre-exists from the old hand-run DDL, or does not) BECAUSE the
DDL is byte-identical (see 1). The one non-convergent case - a production table
hand-created with a DIFFERENT shape - is NOT introduced or worsened by this
migration: `create table if not exists` no-ops, `enable row level security`
still succeeds, the migration does not fail or block the queue, and any shape
drift is a pre-existing already-swallowed write failure. Recorded as residual
R2, not a blocker.

### 4. INST-2 is load-bearing and genuinely red without the migration (Attack 4) - CLEAN

`src/supabase-migrations.rls-coverage.structure.test.ts`. Replaying its exact
logic (scratchpad, real migration files, enable line removed in memory):
with the `enable row level security` statement removed, `accessibility_scans`
stays in the created set but drops out of the RLS set, so `missing =
['accessibility_scans']` and the test goes RED. Notably `missing` is that
single element and nothing else - proving every other migration-created table
is already RLS-covered and this migration is the sole gap-closer, exactly the
claim. It uses TWO structurally different create-table detectors that are
asserted to agree (lines 52-75, 99-105), and strips both `/* */` block and
`--` line comments before matching (lines 31-42), so the scope's original
51-count prose trap (a `create table` inside a comment) cannot recur. The
created-minus-RLS difference is computed, not asserted.

### 5. INST-1 and INST-3 red directions (Attack 5) - CLEAN

INST-1 (`...accessibility-scans-rls.migration.test.ts`): replayed logic shows
removing the enable statement drops `enableCount` to 0 (fails
`toHaveLength(1)`, RED); adding a `create policy ...` line drives the policy
match to 1 and `create policy` substring true (fails both zero-policy
assertions, RED). Comment stripping is line-level, sound for this file because
none of its real statements carry a trailing same-line comment (its header
canary at lines 90-102 proves the enable match finds the statement, not the
prose).

INST-3 (`sql-citations.structure.test.ts`): the old citation
`supabase/accessibility_scans.sql` matches the candidate pattern but does NOT
resolve on disk from either the repo root or the citing file's directory (RED);
the new path `supabase/migrations/20261026000000_accessibility_scans.sql`
resolves (GREEN). The refinement is intact and asserted (require `/`, skip
`://` lines, lines 95-103): a bare filename yields no candidate. The scanner
still catches a real unresolved directory-qualified `.sql` citation - it is not
weakened.

### 6. Citation repoint (Attack 6) - CLEAN

`src/lib/supabase/accessibility.ts:6` now cites
`supabase/migrations/20261026000000_accessibility_scans.sql`, which exists on
disk. The old `supabase/accessibility_scans.sql` string is gone (INST-3's
line 112-121 asserts both directions).

### 7. Scope (Attack 7) - CLEAN

`git status --short` shows exactly the six expected entries and nothing else:
modified `accessibility.ts`, deleted `accessibility_scans.sql` (confirmed gone
from disk), the new migration, and the three new test files. No browser-client
change, no env placeholder, no product code. The deleted DDL is a working-tree
deletion (` D`), consistent.

### Gate discipline - CLEAN

Type gate `npx tsc --noEmit --incremental false` -> exit 0. The three
instruments were run through the required wrapper, `npm run test:paths --
<three paths>` -> 3 files, 18 tests passed, and the wrapper's own `COVERED`
lines confirm all three paths were matched (no silently dropped path, no raw
multi-path `vitest`). The migration timestamp `20261026000000` sorts last among
existing migrations with no filename collision (`ls supabase/migrations | grep
-c 20261026000000` -> 1).

## Residuals (none gate this migration)

**R1 - service_role BYPASSRLS is an out-of-repo fact (owner post-apply).**
Deny-all is safe ONLY if `service_role` still bypasses RLS in the production
project. This is stock Supabase and app-side evidence rules out every checkable
failure mode (no anon accessor exists), but it cannot be confirmed from this
checkout (no `.env`, no live DB, network blocked under vitest). Owner confirms
post-apply:
`select rolname, rolbypassrls from pg_roles where rolname in
('service_role','authenticated','anon');`

**R2 - production shape drift (owner post-apply / pre-existing).** If the table
was hand-created in production with columns or a primary key differing from the
retired DDL, `create table if not exists` will not reconcile it and the
`onConflict` upsert in `accessibility.ts:79` could already be failing silently.
Not introduced by this migration. Owner may confirm shape after apply.

**R3 - the Action must actually succeed (owner post-apply).** The declaration
becoming a repo fact is not the same as RLS being on in production. The
workflow header (`.github/workflows/supabase-migrations.yml`) records a prior
migration that needed a manual re-trigger. Owner confirms the run succeeded and
then:
`select relrowsecurity from pg_class where relname = 'accessibility_scans';`
expecting `true`. `gh` is not installed here, so the run cannot be checked from
this session.

**R4 - future-dated timestamp (informational).** `20261026000000` is dated
after today (2026-09-28). Harmless in isolation (sorts last, independent
table, no cross-migration dependency); noted only so that if a later migration
is authored with a timestamp between now and Oct 26 it will sort before this
one - which is fine given the table's independence.

## What I could NOT verify here (owner-only, post-apply)

- That RLS is actually enforced in production (R1, R3).
- That the production table's shape matches the DDL (R2).
- That the auto-apply Action run succeeded (R3).

## Stopping point

**Nothing.** No rulings are open (A1 is DECISION 19, not reopened), the design
is sound, and every repository-side measurement is verified with the command
behind it. The remaining items are owner post-apply confirmations that no
checkout without a live database can perform. This migration lands and pushes
as-is; the owner runs the three post-apply queries above to close R1-R3.
