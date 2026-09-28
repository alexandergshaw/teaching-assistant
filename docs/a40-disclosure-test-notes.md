# A40 disclosure half: test notes and oracles

Test-notes/oracle seat. Owns WHAT IS MEASURED and HOW IT FAILS for A40's
DISCLOSURE half only. Consumers: one implementer, and a fresh `loop-checker`
who reads this before the code.

**Pre-check, run as instructed.** `ls docs/a40-*` -> `docs/a40-check.md`,
`docs/a40-scope.md` (exit 0). `ls docs/ | grep -i disclos` -> no output, exit 1.
**No prior disclosure test-notes doc exists; this is not a duplicate and nothing
is being superseded.** Read first, in full: `docs/a40-scope.md`,
`docs/a40-check.md`, `docs/DEV_LOOP.md`, `docs/loop/seats.md`,
`docs/loop/traps-tests.md`, `docs/loop/iteration-caps.md`,
`docs/owner-decisions-2026-09-27.md` DECISION 16.

**Settled and not reopened here.** DECISION 16 (owner answered (b)): presence
plus origin, on the drop row, via a new column on `cartridge_drops` plus a
migration; the render-time comparison against rubric-memory is REFUSED.
RULING 105: the disclosure lives on the DROP ROW, not in the panel's form area.
RULING 100: zero added interactions. This doc decides instruments for those
decisions; it does not re-decide them.

---

## 0. LINE NUMBERS ARE DELIBERATELY ABSENT. Cite by content.

`src/app/components/CartridgeDropPanel.tsx` is being edited by a live sibling
agent (the reorder half) while this is written. It was 600 lines when
`docs/a40-scope.md` measured it and is **603 now**, both instruments agreeing:

```
$ wc -l src/app/components/CartridgeDropPanel.tsx
603
PS> @(Get-Content "...\src\app\components\CartridgeDropPanel.tsx").Count
603
```

Every reference below names an IDENTIFIER, a KEY STRING or a CALL, never a line.
**The implementer re-pins any number it needs at build time.** Do not carry a
number out of this doc.

Two other sizes, same pair of instruments, both agreeing:
`src/lib/cartridge-drops.ts` = 151; `src/lib/grade/rubric-memory.ts` = 157.

### The reorder half already landed in the working tree

`grep -n 'id="cartridge-rubric"\|id="cartridge-file"'` puts `cartridge-rubric`
BEFORE `cartridge-file`, and `src/app/components/CartridgeDropPanel.reorder.test.ts`
exists (untracked, 94 lines) carrying RULING 106's five-field ordering guard and
RULING 107's `ta-` exact-key-set canary. **This doc must not duplicate either.**
It is named in the gate (section 6) so the disclosure cannot break it.

---

## 1. Population re-derived with my own instrument, because the one handed to me was the wrong one

The brief supplied `grep -rln 'cartridge-drops\|CartridgeDrop\b' src --include=*.ts --include=*.tsx`
and told me to widen it. I did, and **the supplied flag set is wrong - the `\b`
excludes `CartridgeDropPanel`**, which is most of the population:

```
$ grep -rln 'cartridge-drops\|CartridgeDrop\b' src --include=*.ts --include=*.tsx; echo "EXIT=$?"
src/app/actions/workflow-support.ts
src/app/components/CartridgeDropPanel.tsx
src/app/components/WorkflowTriggerWatcher.tsx
src/lib/cartridge-drops.ts
src/lib/workflow-triggers/decisions.ts
EXIT=0                                                    <- 5 paths

$ grep -rln 'cartridge-drops\|CartridgeDrop' src supabase docs/backlog.yml; echo "EXIT=$?"
... 22 paths, EXIT=0
```

The 17 the `\b` hid, and which of them matter:

| Path | Bears on |
|---|---|
| `src/lib/supabase/types.tables-a.ts` | **`CartridgeDropsRow` / `Insert` / `Update` - the new column's TYPE home. The brief did not name it and R2 is impossible without it.** |
| `src/lib/supabase/types.ts` | The `Database` map entry (`cartridge_drops: { Row: Expand<CartridgeDropsRow>; ... }`) - no edit owed, listed so it is not mistaken for one |
| `supabase/migrations/20260825000000_create_cartridge_drops.sql` | The base `create table`; the frozen column oracle in R1 is built from it |
| `src/app/components/grading-results/rubricProvenanceLeaf.test.ts` | `readFileSync`s the panel and index-scans the `id="cartridge-rubric"` TextField tag for `maxRows` - a live reader of the file being changed |
| `src/app/components/CartridgeDropPanel.reorder.test.ts` | The live sibling's own guard (section 0) |
| `src/lib/course-lms-options.test.ts` | Two `it()` descriptions only; prose, no coupling |
| `src/lib/grade/rubric-memory.ts` | Supplies `LoadedRubricMemory.scope` - the ORIGIN R3 is about |
| `src/lib/workflows/registry/steps.grading-cartridge.{ts,test.ts}` | Reads `takeResult.rubricText`; the step test already mocks `gradeAction` |
| `src/app/components/{GradingTab,FilesTab}.tsx`, `grading-recording/GradingRecordingPanel.tsx`, `accommodations/AccommodationsPanel.tsx`, `src/lib/course-lms-options.ts`, `src/lib/workflow-triggers*.{ts,test.ts}`, `src/lib/workflow-triggers/event-sources.ts` | Name-only or event-only; no coupling to the row shape |

**A finding the widened grep produced and the brief did not have.**
`src/app/actions/workflow-support.ts` selects EXPLICIT column lists, twice:

```
$ grep -n 'select(' src/app/actions/workflow-support.ts
67:  .select("id, name, course_label, assignment_label, points_possible, rubric_text, lms, storage_path, size_bytes")
129: .select("id, course_label, assignment_label, points_possible, rubric_text, lms, storage_path, size_bytes")
```

So **the server path does not need the new column and must not be edited for
it.** `src/lib/cartridge-drops.ts` is the only place using `select("*")` and the
only place with a mapper. That bounds the write set; it is not an argument, it
is what the two greps return.

---

## 2. The seam these instruments require, and why R3 has no instrument without it

**NO COMPONENT IS RENDERED BY ANY TEST HERE.** `vitest.config.ts`:
`include: ["src/**/*.test.ts"]`, `environment: "node"`. Nothing mounts
`CartridgeDropPanel`. Therefore:

**R3's subject - "the origin written at upload time is the scope the rubric
ACTUALLY came from" - is decided today inside `handleFileSelect`, inside a
component, and is therefore UNMEASURABLE BY ANY TEST IN THIS REPO.** Worse, the
wrong answer is the convenient one: `handleFileSelect` already computes

```
const saveScope = cartridgeRubricScope(effective.courseLabel, effective.assignmentLabel);
```

which is THIS assignment's scope. An implementer reaching for the variable
already in scope writes the DECISION 3 defect - the row names this week's
assignment for last week's rubric - and every gate in this repo goes green.

So the seam is a REQUIREMENT, not a suggestion:

- **S1. A pure, exported decider in a non-component module.** Reference name
  `resolveRubricOriginScope` in `src/lib/grade/rubric-origin.ts`. The implementer
  may rename the module and the function; it must then use the SAME identifier in
  every assertion. Signature, by behaviour not spelling:

  ```
  resolveRubricOriginScope(input: {
    rubricText: string | null;      // effective.rubricText, the value being uploaded
    currentScope: string;           // cartridgeRubricScope(effective.course, effective.assignment)
    restored: { rubric: string; scope: string } | null;  // what rubric-memory put in the field, with its ACTUAL scope
    sniffedRubric: string | null;   // sniffResult.rubricText
    archiveName: string;            // the chosen file's name
  }): string | null
  ```

- **S2. The panel must RETAIN the restored scope.** Today
  `lastRestoredRubricRef` (a `useRef<string | null>`) holds the restored rubric
  TEXT and the restore effect discards `loaded.scope` after passing it to
  `describeRubricOrigin`. The decider cannot answer R3 without it. The ref must
  carry `{ rubric, scope }`. This change is SOURCE-ONLY verifiable (section 5);
  its consequence is measured through the decider.

- **S3. A pure, exported row-copy function.** Reference name
  `describeDropRubricOrigin(originScope: string | null)` returning
  `{ present: boolean; text: string }`. The JSX renders only what this returns.
  Without the `present` flag the render branch is unassertable; without the
  function the copy is unassertable.

- **S4. `CartridgeDrop` gains exactly one field** carrying the origin
  (reference `rubricOriginScope: string | null`), populated by
  `mapCartridgeDrop` from the new column and written by `saveCartridgeDrop`'s
  insert.

Scope-string format, measured, not assumed:
`cartridgeRubricScope` (private, in the panel) returns
`` `cartridge:${course}|${assignment}` `` or `""`. `describeScope` inside
`rubric-memory.ts` parses `/^cartridge:(.*)\|(.*)$/` and renders `"CS101 / HW1"`.
Known limitation, recorded not required: a course label containing `|` makes the
greedy first group absorb it. Not A40's defect.

---

## 3. Requirements, instruments, directions of failure, sabotages

Every row names the OBJECT under comparison, the INSTRUMENT producing each
quantity, and the DIRECTION of failure. Every requirement carries a named
mutation, and says whether it discriminates.

### R1 - the new column exists, is additive only, and the migration is idempotent on re-apply

**Object.** The new migration file's statement body, versus a frozen literal.

**Frozen oracle, stated as a CONSTRUCTION.** Let `COL` be the single column-name
constant the test file declares once and uses everywhere. Then

```
strip(sql).replace(/\s+/g, " ").trim()
  ===  `alter table public.cartridge_drops add column if not exists ${COL} text;`
```

where `strip` drops every line whose trimmed text starts with `--`. Constructible
from the tree today: the table name comes from
`supabase/migrations/20260825000000_create_cartridge_drops.sql`
(`create table if not exists public.cartridge_drops (`), and the
`add column if not exists` form is the repo's own idempotency convention
(`src/lib/recording-files.kinds.test.ts`: "Every migration in this repo is
idempotent - CI re-runs `supabase db push`").

**Why a frozen body and not a list of banned verbs.** My first version of this
assertion was a denylist (`!/drop column|rename|alter column|update public\./`).
That is the exact forbidden shape - a denylist standing in for an unbounded set.
The frozen body makes every destructive statement UNREPRESENTABLE rather than
enumerated, and it is strictly stronger: **it killed all seven sabotages,
including the two the denylist missed.** The denylist is deleted, not lengthened.

**Instruments.**

| # | Assertion | Instrument | Direction of failure |
|---|---|---|---|
| R1a | no TRAILING `--` comment on any line | per line: `const at = line.indexOf("--"); at > 0 && line.slice(0, at).trim() !== ""` | a trailing comment appears -> RED. Without this, the line-level `strip` above is unsound and a comment can hide a statement from it |
| R1b | exactly ONE statement in the stripped body | `(strip(sql).match(/;/g) ?? []).length === 1` | a second statement of any kind -> RED |
| R1c | the stripped body equals the frozen literal | string equality above | any change to table, column name, type, guard, or nullability -> RED |
| R1d | the raw text carries the repo's idempotency note | `raw.includes("-- Written idempotently.")` | note dropped -> RED. Reads RAW deliberately: the subject IS comment text (the precedent and the reason are spelled out in `src/lib/knowledge-overview.migration.test.ts`) |
| R1e | the filename sorts AFTER `20261021000000_create_deck_template_files.sql` | string compare of basenames | a lower counter -> RED. Measured: `ls supabase/migrations/ \| sort \| tail -1` = `20261021000000_create_deck_template_files.sql`; `ls supabase/migrations/*.sql \| wc -l` = 109 |

**R1a is a REBUILT instrument, reported as such per the seat's obligation.** My
first version was `!/\S\s*--/.test(sql)` over the whole file. `\s*` matches
newlines, so any comment line following a non-blank line matched and the
assertion was **RED against a reference migration that has no trailing comment
at all**. Measured:

```
R1a trailing-comment-free (line stripper is sufficient): false     <- WRONG, on a correct file
```

Rebuilt per-line, it reads `[]`. A mutant surviving is not always a coverage gap;
here the INSTRUMENT was wrong, and it would have blocked a correct migration.

**Sabotages, all executed against the reference migration in the scratchpad.**

| Mutation | Result | Discriminates? |
|---|---|---|
| S1 `add column if not exists` -> `add column` | KILLED by R1c | YES |
| S2 `COL text;` -> `COL text not null default '';` (rewrites every existing row) | KILLED by R1c | YES |
| S3 append `alter table public.cartridge_drops drop column rubric_text;` | KILLED by R1c | YES |
| S4 append `update public.cartridge_drops set COL = course_label;` | KILLED by R1c | YES |
| S5 `add column if not exists` -> `add column -- if not exists` | KILLED by R1c + R1a | YES |
| S6 `public.cartridge_drops` -> `public.cartridge_drop` | KILLED by R1c | YES |
| S7 append `comment on column ... is 'the rubric's origin';` | KILLED by R1c + the apostrophe check in `src/supabase-migrations.structure.test.ts` | YES |

Paste of the run (scratchpad, `node --experimental-strip-types`):

```
R1a trailing comment lines: []
R1b statement count (semicolons in stripped body): 1
R1c frozen body matches exactly: true | "alter table public.cartridge_drops add column if not exists rubric_origin_scope text;"
R1d idempotency note present in RAW text: true
S1 guard removed (add column, unguarded): KILLED by frozen-body
S2 not-null default added (rewrites every existing row): KILLED by frozen-body
S3 extra destructive statement appended: KILLED by frozen-body
S4 backfill update appended: KILLED by frozen-body
S5 trailing comment hides the guard from a line stripper: KILLED by frozen-body+trailing-comment
S6 table typo: KILLED by frozen-body
S7 bare apostrophe in a comment on column: KILLED by frozen-body+apostrophe
```

**Two consequences of the frozen body the implementer must accept, stated so
they are not discovered as a surprise.** (1) The migration may carry NO
`comment on column`; rationale goes in the header comment. (2) The column is
NULLABLE with no default - NULL is the "no rubric carried" state R4 renders, and
a `not null default ''` would make the two states indistinguishable in the
database before they ever reach the copy function.

**Why R1 matters more here than for an ordinary migration.** Migrations
auto-apply on push to main via a GitHub Action, so this file reaches production
unattended, and `src/supabase-migrations.structure.test.ts`'s own header records
the case where exactly that happened: "tsc, eslint, 19903 tests and the build all
passed - none of them read SQL."

---

### R2 - `CartridgeDrop` carries the origin, and the mapper populates it

**Object.** The `CartridgeDrop` object the REAL producers emit, versus the value
the REAL writer sent - not a hand-built fixture on either side.

**The gate this requirement must NOT work around.** `mapCartridgeDrop` is
PRIVATE (`function mapCartridgeDrop(row: ...)`, no `export`). Do not export it to
test it. Drive the production path: `saveCartridgeDrop` and
`listCartridgeDrops`, both exported, both of which call the mapper. That is the
path the panel itself uses, so the test becomes MORE faithful, not less.

**Proven feasible before being specified.** A chainable stub cast to
`SupabaseClient<Database>` drives both, under node, with no network. Executed
against the REAL `src/lib/cartridge-drops.ts` in the working tree (imported by
`file:///` URL, no copy made):

```
LIST: mapper executed -> {"id":"d1","name":"hw2.zip","courseLabel":"CS101",...,"rubricText":"RUBRIC ONE",...}
LIST: unknown column dropped by mapper? rubricOriginScope = undefined
SAVE: insert payload keys -> id,user_id,name,course_label,assignment_label,points_possible,rubric_text,lms,status,storage_path,size_bytes
SAVE: returned drop.rubricText -> "RUBRIC ONE"
```

Two facts that come out of that run and are load-bearing:

- **The R2 instrument is RED against today's tree by construction.** A row
  carrying `rubric_origin_scope` maps to `rubricOriginScope === undefined`,
  because no mapper line reads it. No sabotage is needed to establish the RED
  baseline; the current tree IS it.
- `saveCartridgeDrop`'s insert payload is capturable, so the WRITE half is
  assertable without a database.

**Stub shapes, both verified to work.**

```
// read path
{ from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [row], error: null }) }) }) }) }

// write path - the stub echoes back ONLY what the writer sent, plus the
// server-side defaults the migration declares. No hand-written column name.
{ storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }) }) },
  from: () => ({ insert: (p) => { captured.push(p);
    return { select: () => ({ single: async () => ({ data: { ...p, error: null, csv_storage_path: null,
      csv_name: null, graded_at: null, created_at: "...", updated_at: "..." }, error: null }) }) }; } }) }
```

`new File([new Uint8Array(9)], "hw2.zip")` and `crypto.randomUUID()` are both
global on node v22.14.0 (`node -e "console.log(typeof File, typeof crypto.randomUUID)"`
-> `function function`), so no polyfill is owed.

**Instruments.**

| # | Assertion | Instrument | Direction of failure |
|---|---|---|---|
| R2a | every key in the captured insert payload is a real migration column | `Object.keys(captured[0])` versus the union of `create table` columns extracted from `20260825...create_cartridge_drops.sql` and `add column if not exists <name>` matches from the new migration | a misspelled column name, or a column added to `CartridgeDropsRow` but not to the migration -> RED. **This is the ONLY gate on that pair: `select("*")` returns a missing column as `undefined`, tsc believes the type, and nothing else here reads SQL** |
| R2b | the payload contains the origin column | `Object.keys(captured[0]).includes(COL)` | the writer omits it -> every row's origin is NULL forever and R4 renders the no-rubric state for every drop -> RED. **This is the silent-green direction and it has no other enforcer** |
| R2c | the value the writer sent round-trips to the mapped object | `saveCartridgeDrop(...).rubricOriginScope` versus the value passed in `meta` | mapper reads the wrong column, or the field is dropped -> RED |
| R2d | `listCartridgeDrops` maps it too, from a row whose KEYS came from the writer | feed `listCartridgeDrops` the object the write stub echoed; assert the origin | a mapper that only the insert path populates -> RED. Using the echoed row rather than a hand-typed fixture is what closes the "fixtures must match the emitted shape" trap - a rename in either direction breaks the test |
| R2e | the column-extractor discriminates | two fixtures: one where a name appears only in a `--` comment and must NOT be extracted; one with two columns that must both be | a heuristic that scrapes comments -> RED. Precedent and shape: `src/lib/cron-heartbeat.test.ts`'s `extractCreateTableColumns` canary block |

Measured against the real base migration: 17 create-table columns extracted,
`["rubric_origin_scope"]` from the reference new migration; `R2a` missing-set
`[]`; `R2b` true; `R2c`/`R2d` both `"cartridge:CS101|HW1"`.

**Sabotages.**

| Mutation | Expected | Discriminates? |
|---|---|---|
| Delete the `rubricOriginScope: row.rubric_origin_scope,` line from `mapCartridgeDrop` | R2c and R2d RED; R2a and R2b stay GREEN | YES - and the split is the point: it isolates the READ half from the WRITE half |
| Delete `rubric_origin_scope: meta.rubricOriginScope,` from the insert object | R2b RED (and R2c/R2d RED as a consequence) | YES |
| Misspell the insert key (`rubric_origin_scop`) | R2a RED | YES. This is the mutation R2a exists for: tsc cannot see it, the table access is `as any` |
| Add the field to `CartridgeDropsRow` but omit the column from the migration | R2a RED | YES - the pair-consistency mutation, and the one with no other gate |
| Remove `COL` from the frozen migration body only | R2a RED **and** R1c RED | YES, but note it is red for two reasons; do not bank it as two kills |

**One mutation I will not specify, and why.** "Change `CartridgeDrop`'s field
type from `string | null` to `string`" is red at `npx tsc --noEmit`, not in
vitest. It is a type-gate kill, not a test kill, and counting it here would
inflate the instrument's apparent reach.

---

### R3 - the origin written is the scope the rubric ACTUALLY came from

This is DECISION 3's "a correctness defect wearing a convenience feature's
clothes", and DECISION 16 exists to close it.

**Object.** `resolveRubricOriginScope`'s return value over a frozen case set,
AND the same value driven end to end through the real `saveCartridgeDrop` into
the row copy.

**Frozen case oracle, stated as a CONSTRUCTION.** The cases are the cross product
of the three sources that can put text in the rubric field - rubric-memory
(exact / fallback), the archive sniff, the instructor's own typing - with the
one branch where the field is empty, restricted to the combinations
`mergeSniffedValues` can actually produce. That restriction is derived, not
guessed: `mergeSniffedValues` is `current.rubricText || sniff.rubricText || null`,
so a non-empty current value ALWAYS wins and sniff can only contribute when the
field was empty. Nine cases result.

| Case | rubricText | currentScope | restored | sniffed | Expected |
|---|---|---|---|---|---|
| C1 | `null` | `cartridge:CS101\|HW2` | - | - | `null` |
| C2 | `""` | `cartridge:CS101\|HW2` | - | - | `null` |
| C3 | `"TYPED"` | `cartridge:CS101\|HW2` | - | - | `cartridge:CS101\|HW2` |
| C4 | `"R"` | `cartridge:CS101\|HW2` | `{R, cartridge:CS101\|HW2}` | - | `cartridge:CS101\|HW2` |
| **C5** | `"R"` | `cartridge:CS101\|HW2` | `{R, cartridge:CS101\|HW1}` | - | **`cartridge:CS101\|HW1`** |
| C6 | `"MINE"` | `cartridge:CS101\|HW2` | `{R, cartridge:CS101\|HW1}` | - | `cartridge:CS101\|HW2` |
| C7 | `"FROMZIP"` | `cartridge:CS101\|HW2` | - | `"FROMZIP"` | `archive:hw2.zip` |
| **C8** | `"R"` | `cartridge:CS101\|HW2` | `{R, cartridge:CS101\|HW1}` | `"FROMZIP"` | **`cartridge:CS101\|HW1`** |
| C9 | `"TYPED"` | `""` | - | - | `null` |

C5 and C8 ARE the requirement. C8 also pins the ORDERING fact that the restored
value outranks a sniffed one, which is `mergeSniffedValues`'s behaviour and not
a new invention.

**Satisfiability proven before hand-off.** A reference implementation written in
the scratchpad scores **9/9** on this table. The table is a specification, not a
wish list.

**Mutation accounting, run per case. This is where the honest reporting is.**

| Mutant | Killed by |
|---|---|
| M-A falsy guard narrowed to `=== null` | C2 |
| **M-B restored branch demoted below the `currentScope` fallthrough** | **C5, C8** |
| M-C archive branch deleted | C7 |
| M-D blank `currentScope` returned as `""` instead of `null` | C9 |
| M-E restored PRESENCE trusted without comparing the text | C6 |
| M-F the no-rubric guard deleted | C1, C2 |
| M-G only a memory-restored rubric gets an origin | C3, C7 |

**C4 DISCRIMINATES NOTHING in either battery, and I am not counting it as
coverage.** In the exact-match case the restored scope and the current scope are
the same string, so every mutant that returns either one passes it. It stays as
a non-discriminating regression anchor and is labelled that way in the test file.
Saying so is the point: a kill count that included C4 would be an instrument
overstating its own reach.

**M-B is THE mutant.** It is not a contrived one - it is what an implementer
writes when they reach for the `saveScope` variable already sitting in
`handleFileSelect`. Paste of the run:

```
REFERENCE: 9/9 green
SABOTAGE-B: 7/9 green
   RED  C5 THE DECISION 3 CASE: restored by CROSS-ASSIGNMENT FALLBACK: expected "cartridge:CS101|HW1" got "cartridge:CS101|HW2"
   RED  C8 restored value WINS over a sniffed one (mergeSniffedValues current-first): expected "cartridge:CS101|HW1" got "cartridge:CS101|HW2"
```

**R3 also needs an assertion that EXECUTES THE PRODUCER, because the pure test
is necessary and not sufficient.** The decider could be perfect and never
called, or called with `saveScope` in the `restored` slot. So:

| # | Assertion | Instrument | Direction of failure |
|---|---|---|---|
| R3e | end to end on C5: decider -> real `saveCartridgeDrop` -> mapper -> row copy, and the resulting SENTENCE names `HW1` and not `HW2` | capturing stub as in R2; assert on the copy function's `text` | the origin is computed from the requested scope anywhere in the chain -> RED |

Executed, with the reference tree:

```
REFERENCE: row says "Rubric from CS101 / HW1."  -> E2E assertion (names HW1, not HW2): GREEN
M-B restored-branch-demoted: row says "Rubric from CS101 / HW2."  -> E2E assertion (names HW1, not HW2): RED
rubric-less drop: present=false text="No rubric was included; the workflow generated one." -> frozen-literal assertion: GREEN
```

**What R3e still cannot reach, stated plainly.** It drives the decider and the
persistence layer, but the CALLSITE inside `handleFileSelect` - that the panel
passes the retained `{rubric, scope}` ref and not `saveScope` - is inside a
component and is therefore a SOURCE READING, not an execution. See section 5 and
residual A40-D2. Do not let R3e's green be read as proof that the panel wires it
correctly.

**Known indistinguishability, recorded rather than papered over.** If the
instructor types a string byte-identical to the restored one, the decider
attributes it to the restored scope. The discriminator is the same
text-equality the restore effect itself already uses for its `untouched` check,
so this is not a new weakness; and the attribution is not harmful in direction
(it names where that exact text was last seen). Not a requirement; recorded so
a checker does not read it as an oversight.

---

### R4 - the no-rubric state renders, and the two states are DISTINGUISHABLE

**Object.** `describeDropRubricOrigin`'s return value over a frozen four-element
input set.

**This instrument was REBUILT after I executed it against two
passing-but-wrong implementations I wrote myself, and BOTH SURVIVED.** Reporting
it because it is the whole reason this seat exists.

My first version asserted (a) the four outputs are pairwise distinct, (b) the
fallback output names its own scope and not the requested one, (c) the no-rubric
output names no scope at all. Then I wrote the defect requirement 4 literally
names - "one string that happens to read plausibly in both" - and ran it:

```
MUTANT P one-string-plausible-in-both
   A4a pairwise distinct over 4 inputs: true (4/4)
   A4b fallback names its OWN scope: true
   A4c no-rubric state names no scope at all: true
      [none] "Rubric: none."
MUTANT Q same-sentence-empty-interpolation
   A4a pairwise distinct over 4 inputs: true (4/4)
   A4b fallback names its OWN scope: true
   A4c no-rubric state names no scope at all: true
      [none] "Rubric from ."
```

`"Rubric from ."` passes every assertion in that set. An injectivity property
cannot see it, because two strings can differ and still be the same sentence
with a hole in it. **The fix changes KIND, not strength: a FROZEN COPY LITERAL
for the no-rubric sentence, which is the one case where the spelling IS the
fact**, plus a `present` boolean so the render branch is assertable without
parsing prose. Lengthening the property list would have been the forbidden move.

**Frozen oracle, as a CONSTRUCTION.** The no-rubric sentence is DERIVED from
text already in the tree, not invented by me: the rubric field's own placeholder
reads `"Paste a rubric or grading criteria. If blank, the workflow will generate
one."` The frozen literal restates its second clause in the past tense, which is
what the drop row is describing:

```
FROZEN_NO_RUBRIC = "No rubric was included; the workflow generated one."
```

The PRESENT-state copy is deliberately NOT frozen - only required to contain the
humanised scope - because there the spelling is not the fact and pinning it would
force a contorted implementation (`docs/loop/traps-tests.md`'s over-specification
class).

**Instruments.**

| # | Assertion | Instrument | Direction of failure | Discriminates |
|---|---|---|---|---|
| R4a | `f(null).text === FROZEN_NO_RUBRIC` | string equality with the literal frozen above | the no-rubric state is produced by the present-state template with a hole, or by any other wording -> RED | **kills MUT_P and MUT_Q - the two that survived everything else** |
| R4b | `f(null).present === false` | boolean | the flag lies about a rubric-less drop -> RED | kills MUT_S (flag lies) |
| R4c | for each of the three scopes, `present === true` | boolean | a present rubric renders as absent -> RED | pairs with R4b |
| R4d | for each scope, `text !== FROZEN_NO_RUBRIC` | inequality | present state collapses onto the absent state -> RED | no mutant in this battery; kept as the explicit statement of "distinguishable" |
| R4e | for each scope, `text` contains the humanised scope (`CS101 / HW1`, `the archive "hw2.zip"`) | substring, where the expected rendering is produced by the same parse the test declares | the raw scope token is dumped into the sentence -> RED | kills MUT_R (raw-scope-token) |
| R4f | the fallback sentence contains `HW1` and not `HW2` | substring both ways | the row names the requested assignment | discriminates M-B **only through R3e**; at the copy level alone it kills nothing, and is labelled a duplicate there |
| R4g | the four outputs are pairwise distinct | `new Set(...).size === 4` | two states collapse | **NOTHING in this battery. Kept as a cheap anchor and labelled non-discriminating - it is the assertion that let P and Q through** |
| R4h | the fallback sentence renders the scope the way the already-exported `describeRubricOrigin` renders it | call `describeRubricOrigin({entry:{rubric:"R",savedAt:Date.now()}, scope:"cartridge:CS101\|HW1"}, "cartridge:CS101\|HW2")` and assert both contain `CS101 / HW1` | the row's parse drifts from the caption's parse, so the same rubric is described two ways in one screen -> RED | YES for drift; does NOT prove a single implementation, only agreement. Labelled as such |

Final battery, all five mutants dead, reference green on all seven:

```
REFERENCE: SURVIVES ALL
MUT_P one-string-plausible-in-both: KILLED by A4a none.text === FROZEN literal
MUT_Q same-template-empty-hole:     KILLED by A4a none.text === FROZEN literal
MUT_R raw-scope-token:              KILLED by A4e every scope: text contains the humanised scope
MUT_S flag-lies:                    KILLED by A4b none.present === false
```

**Placement constraint, which is an instrument and not a style note.** The
disclosure renders as a `<p className={styles.fieldHint}>` inside the EXISTING
course/assignment `<td>`, mirroring the row's own
`{drop.error && <p className={styles.error}>...}` pattern in the status cell. It
adds no table column. Guard, because "added a column and forgot the header" is
silent in a repo that renders nothing:

| # | Assertion | Instrument | Direction of failure |
|---|---|---|---|
| R4i | the drops table's `<th>` count equals the row's `<td>` count | `(src.match(/<th[>\s]/g) ?? []).length === (src.match(/<td[>\s]/g) ?? []).length` | a `<td>` added without a `<th>` -> RED |

Measured now: 5 and 5. **Use `/<th[>\s]/`, not `'<th'`** - `grep -c '<th'`
returns **6** on this file because `<thead>` matches. That off-by-one is the
whole reason the pattern is spelled out here.

---

### R5 - zero added interactions (RULING 100)

**A click count is a rendered-UI property and cannot be measured by any test in
this repo. I am not going to pretend otherwise.** What IS executable is that the
panel's source gains no new interactive affordance. That is a proxy, it is
labelled a proxy, and the user-visible claim is a residual (A40-D1).

**Frozen oracle, as a CONSTRUCTION, not a denylist.** Build the exact multiset of
interactive tokens present in `CartridgeDropPanel.tsx` and freeze it. Any NEW
token, of any kind, is outside the frozen set and fails - which is the
"make the bad state unrepresentable" shape rather than a list of banned things.

Measured NOW, and **these numbers MUST be re-pinned at build start because the
reorder sibling is live in this file**:

```
$ grep -o 'on[A-Z][A-Za-z]*=' src/app/components/CartridgeDropPanel.tsx | sort | uniq -c
      6 onChange=
      4 onClick=
$ grep -oE '<(Button|MenuItem|TextField|input)' src/app/components/CartridgeDropPanel.tsx | sort | uniq -c
      4 <Button
      4 <MenuItem
      5 <TextField
      1 <input
```

| # | Assertion | Instrument | Direction of failure |
|---|---|---|---|
| R5a | the exact multiset of `on[A-Z]...=` attribute names matches the frozen one | `match(/\bon[A-Z][A-Za-z]*=/g)` tallied, compared to the frozen object | any new handler of any name -> RED. Note it is deliberately over-broad: for a zero-interaction requirement, over-broad is the safe direction |
| R5b | the exact multiset of interactive element tokens matches the frozen one | as measured above | a new `Button`, `MenuItem`, `details`/`summary`, `Tooltip`, `IconButton` etc. -> RED, because it is not in the frozen set at all |
| R5c | the `styles.*` class names used in the file are exactly the frozen 14 | `match(/styles\.[A-Za-z0-9_]*/g)` as a Set, versus the frozen set | a NEW css class -> RED, which forces reuse of `styles.fieldHint` and keeps `page-module-css-classes.test.ts` and `page-module-css-orphan-classes.test.ts` green by construction rather than by luck |

The frozen 14, measured: `card, courseScheduleTable, error, field, fieldHint,
fileField, form, ghBadgeAccent, ghBadgeDanger, ghBadgeSuccess, ghBadgeWarning,
loadingState, loadingTitle, spinner`. `.fieldHint` exists in
`src/app/page.module.css` (`grep -n '^\.fieldHint' src/app/page.module.css` ->
one hit), so R5c's requirement is satisfiable with no CSS edit.

**Sabotages.**

| Mutation | Expected | Discriminates? |
|---|---|---|
| Add a `<Button size="small">Why?</Button>` to the row | R5b RED (`<Button` count 4 -> 5) | YES |
| Add `<details><summary>Rubric source</summary>...</details>` | R5b RED (`details` is not in the frozen set) | YES |
| Render the disclosure with a new `styles.rubricOrigin` class | R5c RED, and `page-module-css-classes.test.ts` RED too | YES, twice - do not bank as two kills |
| Add an `onMouseEnter` tooltip trigger | R5a RED | YES |
| Render the disclosure as plain text inside the existing `<td>` | GREEN on all three, and correct | Confirms the instrument does not block the intended implementation - the check every guard owes itself |

**What R5's proxy CANNOT catch, said out loud.** A disclosure that renders
off-screen, requires a scroll, or overflows the cell costs the instructor
effort that no source-text count can see. A40-D1.

---

## 4. Executable here versus ARGUED

**Executable, and proven so by running it (section 3 pastes):** R1a-R1e,
R2a-R2e, R3's nine-case table and R3e, R4a-R4i, R5a-R5c.

**ARGUED, not verified - labelled as argued, asserted nowhere as measured:**

- That the disclosure is LEGIBLE and lands where the instructor is looking.
  Nothing renders. Argued from RULING 105's reasoning and from the row's
  persistence; never observed.
- That the drop row is on screen when the instructor returns after the
  auto-grade navigation. `docs/a40-check.md` B3 traced the unmount chain from
  source; I re-read the chain's endpoints and did not re-derive the whole path.
  Argued, and it is the premise of the whole design.
- That the row copy reads as a disclosure rather than as noise to a real
  instructor. Copy quality is not a test subject here.
- That `handleFileSelect` passes the retained `{rubric, scope}` to the decider
  rather than `saveScope`. Source reading only (section 2, S2).

---

## 5. What has no honest test instrument, and is an OWNER VERIFICATION instead

Named here rather than dressed as a test, per the seat's standing rule.

- The panel's callsite wiring (S2 and the decider call) - a component-internal
  data flow. A40-D2.
- The rendered markup, focus order and the cell's overflow behaviour. A40-D1.
- That `rubricOrigin` (the FORM caption) is never cleared while the field is -
  `setRubricOrigin` has exactly one callsite, in the restore effect, and the
  reset block clears `rubricText` and `sniffHint` but not it. Carried from
  `docs/a40-check.md` m2 and re-confirmed by
  `grep -n 'rubricOrigin\|setRubricOrigin'` (three hits: the `useState`, the
  restore-effect set, the render). **This is a pre-existing panel defect in the
  FORM area, which RULING 105 puts outside A40's disclosure site. It is not
  mine to fix and not mine to test.** A40-D3.

---

## 6. Gate

Multi-path runs use the wrapper. `npm run test:paths` **refuses with exit 1 and
runs nothing if any path is absent**, so the two lists are separate on purpose.

**Existing paths - all verified present today** (`for p in ...; do [ -f "$p" ] ...`,
16/16 OK):

```
npm run test:paths -- \
  src/supabase-migrations.structure.test.ts \
  src/app/components/CartridgeDropPanel.reorder.test.ts \
  src/app/components/grading-results/rubricProvenanceLeaf.test.ts \
  src/app/components/courses/page-module-css-classes.test.ts \
  src/app/components/courses/page-module-css-orphan-classes.test.ts \
  src/lib/grade/rubric-memory.test.ts \
  src/lib/submission-archive-sniff.test.ts \
  src/lib/workflows/registry/steps.grading-cartridge.test.ts \
  src/lib/client-state-sweep.registry.test.ts \
  src/lib/canvas-client-boundary.test.ts \
  src/lib/canvas-client-boundary.transitive.test.ts \
  src/lib/canvas-client-boundary.runtime-graph.test.ts \
  src/lib/module-graph/runtime-import-graph.test.ts \
  src/file-size-ceiling.structure.test.ts \
  src/lib/no-emojis.test.ts \
  src/source-bytes.structure.test.ts
```

**New paths, which DO NOT EXIST YET.** Adding them to the command above before
they are written makes the whole run refuse. Add them once created:
`src/lib/grade/rubric-origin.test.ts` (R3, R4),
`src/lib/cartridge-drops.origin.test.ts` (R1, R2, R3e).

Why each existing path is in the gate, since a gate nobody can justify gets
trimmed by the next agent:

| Path | Why |
|---|---|
| `supabase-migrations.structure.test.ts` | whole-directory walker; **auto-includes the new migration** and is the only apostrophe/lexical check before an unattended production apply |
| `CartridgeDropPanel.reorder.test.ts` | the live sibling's ordering + `ta-` key canary; the disclosure must not disturb it |
| `rubricProvenanceLeaf.test.ts` | `readFileSync`s the panel and index-scans the `id="cartridge-rubric"` TextField tag for `maxRows` |
| the two css walkers | population includes every `.tsx` importing a discovered stylesheet; the panel imports `page.module.css`. **The orphan walker regenerates `docs/css-orphans.md`, so that file will show modified after the run - expected, not an overreach** |
| `rubric-memory.test.ts` | R4h calls `describeRubricOrigin`; a change there must not drift |
| `submission-archive-sniff.test.ts` | already asserts `mergeSniffedValues` current-wins, which C8's ordering is derived from |
| `steps.grading-cartridge.test.ts` | the server path must be UNCHANGED; this is the canary that no column was needlessly threaded to it |
| `client-state-sweep.registry.test.ts`, the three `canvas-client-boundary` walkers, `module-graph/runtime-import-graph.test.ts` | population auto-includes a new `src/lib/**` module reachable from a client component |
| `file-size-ceiling`, `no-emojis`, `source-bytes` | whole-tree walkers; new copy is new text. `no-emojis` owns the emoji rule - do not hand-roll a scan |

Plus, per the standing gates: `npx tsc --noEmit`, `npm run lint` (exit 0, no NEW
warning in the touched files), and `npm run build`'s compile line. **Run them
against a `git status --short` taken at the implementer's OWN start** - lint
warning counts and tsc are shared under concurrency, and three siblings are live
in `src/` right now.

One specific tsc note: a `/s` (dotAll) regex passes vitest and FAILS tsc with
TS1501. Nothing above needs one; if the migration parser reaches for one, use
`[\s\S]` instead.

---

## 7. Residual register

Owner, instrument and step for each. Anything missing one of the three is a
deletion and is called that.

| id | Residual | Owner | Instrument | Direction of failure | Step |
|---|---|---|---|---|---|
| A40-D1 | The disclosure is actually VISIBLE and legible on the drop row after an auto-grade navigation, and costs no click. No test here renders a component. R5a-R5c are a source-text proxy and nothing more. | Repo owner, in a real browser | Upload an archive with the rubric box empty; then upload one with a rubric restored from a DIFFERENT assignment; after each, return to the Grading tab's cartridge panel and read the drop row. Count interactions against `docs/a39-census.md` path H | Any claim that the instructor sees this, absent this walk, is a reading claim | The owner verification pass, alongside RES-A39-2 and A40-R4 which it extends |
| A40-D2 | `handleFileSelect` passes the retained `{rubric, scope}` to the decider, not `saveScope`. Component-internal; R3e proves the decider and the persistence layer, never the callsite. | The implementer at build time, then the `loop-checker` reading the diff | Read the `handleFileSelect` body: the decider's `restored` argument must be the ref that the restore effect writes `loaded.scope` into. Confirm `saveScope` reaches only `saveRubricMemory` | If this is wrong, every executable assertion above is GREEN and the row names the wrong assignment - this is the silent-green route that survives the whole gate | The diff review, before the push. **Do not close it by citing R3e** |
| A40-D3 | `rubricOrigin` (the FORM caption) is never cleared while the field is, so the panel can show "Rubric restored from ..." above an empty box indefinitely. Pre-existing; in the form area RULING 105 puts outside A40's site. | Repo owner, to schedule; it needs its own row | `grep -n 'setRubricOrigin' src/app/components/CartridgeDropPanel.tsx` returns exactly one callsite (the restore effect); the reset block clears `rubricText` and `sniffHint` only | Left open, the row's true disclosure sits beside a stale form caption that contradicts it | A separate backlog row. Not A40's write set |
| A40-D4 | Whether the cross-assignment fallback in `loadRubricMemory` should exist AT ALL. DECISION 16's own closing line leaves it open. | Repo owner | `docs/a40-check.md` B4's measured trace, which I re-read and did not re-run | A40 makes the fallback VISIBLE; it does not decide whether it is right | Unchanged by DECISION 16; carried, not re-filed |

---

## 8. Concurrency

Read-only against `src/` and `supabase/`. **One file written: this one.** Every
probe lives in the session scratchpad
(`...\scratchpad\a40probe\`), which contains `probe1..9.mts`, `ref.mts`,
`mig.ref.sql` and ONE copy, `cartridge-drops.ref.ts`, made with `cp` from
`src/lib/cartridge-drops.ts` and patched IN THE SCRATCHPAD to carry the proposed
change. That copy is the reference implementation required before red tests are
handed over; it never entered the repo. `probe1.mts` and `probe7.mts` import the
REAL `src/lib/cartridge-drops.ts` and `src/lib/grade/rubric-memory.ts` by
`file:///` URL, so those two were read and not copied.

No `git stash`, no `git add -A`, no `git checkout --`. No file under `src/` or
`supabase/` was created, edited or deleted. `git status --short` at the start of
this work, recorded so the implementer's own gate is compared against ITS start
and not this one - every entry below belongs to the three live siblings:

```
 M src/app/actions.ts
 M src/app/actions/action-guard-coverage.test.ts
 M src/app/components/CartridgeDropPanel.tsx
 M src/app/components/GradingTab.tsx
 M src/app/components/autoGradeTransition.wiring.test.ts
 M src/lib/grade.ts
 M src/lib/grade/engine.ts
 M src/lib/module-graph/runtime-import-graph.test.ts
?? src/app/actions/action-guard-coverage-github-cohort.test.ts
?? src/app/actions/grading-incremental.test.ts
?? src/app/actions/grading-incremental.ts
?? src/app/api/grade-run-item/
?? src/app/components/CartridgeDropPanel.reorder.test.ts
?? src/app/components/grading/
?? src/lib/grade/reconcile.test.ts
?? src/lib/grade/reconcile.ts
```
