# A40-D6 scope: a general guard against "column on a Row type the insert never writes"

Seat: test-notes / oracle (Opus). This is a SCOPE, not a build. One file
written; read-only otherwise. Every quantity below names the command that
produced it.

## The question this row asks

Backlog `docs/backlog.yml:787` (`A40-D6`, state `unscoped`). A nullable column
declared on a `*Row` type but never included in the insert payload is silently
always-null, and `tsc` cannot object because the corresponding `Insert` type
marks it optional. A40's own instance (`cartridge_drops.rubric_origin_scope`)
is closed by construction. This row asks whether the GENERAL case is worth a
guard, and if so how to build one - against BOTH directions of RULING 120 (the
unwritten column, AND a written column whose null conflates two meanings).

## VERDICT: WONT-DO. Close as documented, not built.

Two independent reasons, either of which is sufficient. Stated strongest-first:

1. **A sound general guard is not mechanically buildable in this repo** - not
   because the scan is hard, but because the property it must decide ("a column
   that SHOULD have been written but was not") is a statement of INTENT that no
   artifact in the tree records, and the type system, the migrations and the
   call sites are all consistent with both the correct and the buggy state.
2. **The class has exactly one member and it is already closed.** A 9-table
   sample chosen to include the highest-risk shapes found ZERO live instances.
   Building general structural infrastructure for a one-member, already-fixed
   class is the "structure test for a class with one member" the scope brief
   names as the thing not to manufacture.

Reason 1 is the load-bearing one: it holds even if a future live instance
appears, because the correct remedy for such an instance is a per-column pin
(the A40 template, below), not a general structural guard.

---

## Part 1 - Incidence survey (the evidence for reason 2)

### How the set was enumerated

- `*Row` type declarations: `grep -rEn "(type|interface)[[:space:]]+[A-Za-z0-9_]*Row[[:space:]]*[=<{]" src --include=*.ts | grep -v "\.test\.ts"` - 100+ hits, but most are VIEW-MODEL rows (`RepoGradeRow`, `TaskRow`, filter/table rows) that are never inserted into Supabase. The defect class is only about types that map to a Supabase TABLE and have an `Insert` counterpart - the `*Row` interfaces in `src/lib/supabase/types.tables-a.ts`, `types.tables-b.ts`, `types.tables-c.ts`, `types.ts`.
- Insert/upsert call sites: `grep -rEn "\.insert\(|\.upsert\(" src --include=*.ts | grep -v "\.test\.ts"` - **60 lines, ~55 real call sites** (a handful are comments).

### The nine tables measured, and the column-by-column result

For each I read the `*Row` interface and the insert/upsert payload, then
classified every column ON the Row but NOT in the insert. Commands: the
`sed -n` reads cited inline in the transcript; Row types in
`src/lib/supabase/types.tables-*.ts`; migrations under `supabase/migrations/`.

| Table | Insert site | Columns on Row omitted from insert | Any genuine always-null column? |
|---|---|---|---|
| `cartridge_drops` | `cartridge-drops.ts:58` | `error`, `csv_storage_path`, `csv_name`, `graded_at` (set-later, nullable), `created_at`, `updated_at` (DB default) | NO - `rubric_origin_scope` IS now written (`:70`); the fix already landed |
| `message_drafts` | `message-drafts.ts:145` | `id`, `created_at`, `updated_at` (DB default) | NO - every data column written |
| `grading_drafts` | `grading-drafts.ts:325` | `id`, `created_at`, `updated_at` (DB default) | NO - `source` IS written |
| `recording_files` | `recording-files.ts:96` | `id`, `created_at`, `updated_at` (DB default) | NO - all 10 data columns written |
| `avatar_likenesses` | `avatar-likeness.ts:247` | `external_id`, `error_message`, `training_progress` (set-later via `updateAvatarLikeness`, `:276-279`), `is_default` (DB `default false`, migration `20260922000000:37`), `id`/`created_at`/`updated_at` | NO - the set-later columns are filled by the update path |
| `workflow_runs` | `workflow-runs.ts:246` (start) + `:530` (safe-start upsert) | `started_at`, `finished_at`, `duration_ms`, `trigger_ref`, `step_count`, `error_count`, `detail`, `field_values` | NO - `field_values` written at `:540`; the rest by `finishWorkflowRun` |
| `institution_page_attachments` | `institution-page-attachments.ts:460` | `created_at`, `updated_at` (DB default) | NO |
| `scheduled_releases` | `scheduled-releases.ts:374` | `id`, `created_at`, `updated_at`, and later-set status fields | NO - all decision columns written |
| `live_class_sessions` | `live-class-sessions.ts:195` | `segments`, `answered` (set-later via `appendClassSessionData`), `id`, timestamps | NO - appended by the update path |

**Result: 0 live instances across 9 tables.** In every table the columns absent
from the insert are exactly the false-positive classes the brief names - DB
defaults, and columns filled later by an update/append path. The A40 origin
column was the ONE column that was genuinely always-null-but-should-be-written,
and it is fixed.

**What I could not determine:** this is a 9-of-~30 sample, not an exhaustive
audit of all ~55 call sites. I chose the highest-risk shapes (recently-added
nullable columns, `Json` blob columns, set-later fields, and the divergent
two-path `workflow_runs` writer). A full audit is possible but is exactly the
kind of speculative sweep the verdict argues against; if the owner wants
certainty it is an owner/implementer sweep, recorded as a residual below.

---

## Part 2 - Why a sound general guard is not buildable (reason 1)

A guard for this class must decide, per column, which of THREE cases it is in:

1. **DB-defaulted or generated** - legitimately omitted (`id` = `gen_random_uuid()`, `created_at`/`updated_at` = `now()`, `is_default boolean not null default false`, `field_values ... default '{}'` on the schedule/trigger tables). Readable from the migration's `DEFAULT`/`GENERATED` clause.
2. **Set later by another write path** - legitimately omitted from THIS insert (`error`, `graded_at`, `csv_*`, `external_id`, `error_message`, `training_progress`, `finished_at`, `segments`/`answered`). Correct behaviour; the column is filled by an `update`/`upsert` elsewhere.
3. **Should be written at insert but is not** - THE BUG (what `rubric_origin_scope` was).

**The obstruction is distinguishing case 2 from case 3.** Both are
nullable-with-no-DEFAULT columns absent from the insert. The type system marks
BOTH optional on the `Insert` type. The migration gives BOTH no default. The
ONLY difference is whether some OTHER write path is supposed to fill the
column - i.e. intent - and nothing in this repo records that intent
mechanically. `rubric_origin_scope` had no other writer; `error` and
`graded_at` do. A scan cannot tell them apart from structure alone.

The nearest SOUND reformulation - "every non-defaulted, non-generated column on
a Row type is written by AT LEAST ONE write path (any insert/update/upsert in
the tree)" - is conceivable but defeated by two things measured here:

- **Write-payload keys are not reliably extractable by a source scan.**
  `updateAvatarLikeness` (`avatar-likeness.ts:275-279`) writes `external_id`,
  `error_message`, `training_progress` as DYNAMIC property assignments
  (`update.external_id = patch.externalId`) inside conditionals, not object-
  literal keys. `workflow_runs` uses a conditional spread
  (`...(input.id && { id: input.id })`, `workflow-runs.ts:247`).
  `workflow-schedules.ts:425` writes `patch.field_values = ...`. The runtime-
  capture trick the A40 test uses (`Object.keys(inserts[0])`) only works
  because `cartridge-drops.ts` writes an inline literal AND the test drives the
  one path; a general guard would have to drive every update path with every
  optional field set, which is a per-table oracle, not a general scan.
- **A legitimately-not-yet-written column would false-positive.** A latent
  column awaiting a feature is a REAL, sanctioned state in this repo - see
  `A40-D5` (`docs/backlog.yml:775`), a column deliberately write-then-render-
  only until a reader exists. A guard demanding every column have a writer
  would fire RED on exactly the pattern the repo files as correct-and-waiting.

**The RULING 120 direction (ambiguous null) has NO mechanical instrument at
all.** RULING 120 was a column that WAS written yet still produced a false
sentence, because `null` meant two things (no-rubric vs unrecorded-origin).
"This nullable column's null value conflates two meanings" is a domain-semantics
property invisible to any structural scan of types, migrations or payloads. It
is catchable only by a per-column value-oracle - which A40 already has
(`rubric-origin.ts` + the three-state assertions in
`cartridge-drops.origin.test.ts`, the `describeDropRubricOrigin` cases). So
even a best-effort general guard scopes this direction OUT; there is nothing to
generalise.

### I attacked the naive guard, and it fails

The obvious implementation - "Row column set minus insert-payload column set
must be empty, modulo an allowlist" - is the guard a diligent-looking build
would produce. Run against the 9 tables above it flags EVERY one: `id`,
`created_at`, `updated_at`, `is_default`, `error`, `graded_at`, `external_id`,
`field_values`, and the rest. To go green it needs an allowlist of every
legitimately-omitted column - which is a hand-maintained denylist standing in
for an unbounded set, the exact anti-pattern this seat is charged to reject
(`traps-tests.md`; the AC checker's denylist question). It would need a new
allowlist entry on every migration that adds a defaulted or set-later column,
and the day someone forgets, it fires RED on correct code or the fix is to
"just add it to the allowlist" - at which point a real bug added the same day
sails through. The guard would not measure what it claims. That is
disqualifying, and it is why the verdict is WONT-DO rather than "build a
lighter version."

---

## Part 3 - Recommended lightweight alternative (what to do instead)

The class is real but is correctly handled PER COLUMN, at the point a column is
added, by the construction A40 already uses. Record that expectation where
inserts are authored; do not build a general structural test.

1. **Keep and name the A40 template as the pattern.** When a migration adds a
   column that must be populated at insert time, the same commit adds a
   per-column pin: an assertion that the insert payload contains that exact
   column name. Reference instance: `cartridge-drops.origin.test.ts` R2a
   (`:every payload key is a real migration column`) + R2b
   (`expect(Object.keys(inserts[0])).toContain("rubric_origin_scope")`). R2b is
   the construction that makes the bad state unrepresentable for that column -
   frozen literal column name, driven through the real `saveCartridgeDrop`
   path. This is the mirror-safe move: the value-oracle
   (`describeDropRubricOrigin` three-state) covers the RULING 120 direction for
   the same column in the same file.
2. **Document the expectation at the authoring site.** A short note in the
   data-seat brief and/or a comment convention where table writers live
   (`src/lib/supabase/` and the per-table `src/lib/*.ts` writers): "A column
   added to a `*Row` type is written by the insert if it is known at insert
   time; if it is deferred to an update path or defaulted in the migration, say
   which, in a comment on the column." This turns intent - the thing the guard
   could not read - into text a reviewer and the next author can see.
3. **Leave `A40-D5` as the live tripwire.** `docs/backlog.yml:775` already
   holds the one place a latent column becomes dangerous (a reader feeding the
   column into the wrong namespace). That row is the correct, targeted guard-
   when-buildable, and it demonstrates the repo's own rule that an assertion
   which cannot fail is not an instrument.

### Close rationale for the backlog

`A40-D6` closes as WONT-DO with the pattern documented. The specific instance
is shut by construction; the general case cannot be soundly mechanised because
the deciding property is unrecorded intent, and the naive mechanisation is a
maintenance-fragile allowlist that fails RED on correct code and GREEN on the
next real bug. The RULING 120 direction has no structural instrument and is
already covered per-column where it matters. This is a valid terminating
outcome, not a gap.

---

## Residual register

| Item | Owner | Instrument | Step that measures it |
|---|---|---|---|
| Full audit of the remaining ~21 table-backed Row types / ~46 uncovered call sites for a live always-null column | owner or a scoped implementer sweep | Per table: read the `*Row` interface, union the payload keys across all insert/update/upsert sites, subtract DB-defaulted columns (from the migration), and inspect any remainder by hand | A one-off audit pass; NOT a standing test (see reason 1 for why a standing test is unsound). Only worth spending if the owner wants certainty beyond the 9-table sample |
| Per-column pin convention documented in the data-seat brief | loop-seat (data) or owner | Prose added to `docs/loop/seats.md` Data/storage brief citing the A40 R2a/R2b template | A doc edit; verify by `grep` for the added text |

Neither residual is a build gate on any live feature. Both are optional
hardening the owner may decline.

## What this scope did not do

No code, no test, no commit, no push. Nine of ~30 table-backed Row types were
measured; the incidence claim is a sample, stated as one. The verdict does not
depend on the sample being exhaustive, because reason 1 (unsound to mechanise)
stands regardless of incidence.
