# A40 disclosure half: test notes and oracles

Test-notes/oracle seat. Owns WHAT IS MEASURED and HOW IT FAILS for A40's
DISCLOSURE half only. Consumers: one implementer, and a fresh `loop-checker`
who reads this before the code.

**ROUND 2 of two. This is the final revision of this activity.** It applies
RULING 112, RULING 113, RULING 114 and RULING 115 and the three measurement
corrections from `docs/a40-disclosure-test-notes-check.md`. Everything the check
listed in its section 6 ("the attacks that FAILED") is confirmed sound and is
NOT re-derived here: both frozen literals genuinely derived and
non-tautological, all gate paths present, the wrapper's refusal mechanism at
`src/tools/vitest-paths/cli.ts:36`, no `"use server"` exposure, and every R5
quantity reproducing on the live file. After this doc, anything unresolved is a
residual in section 7 with an owner, an instrument and a step.

**Settled and not reopened here.** DECISION 16 (owner answered (b)): presence
plus origin, on the drop row, via a new column on `cartridge_drops` plus a
migration; the render-time comparison against rubric-memory is REFUSED.
RULING 105: the disclosure lives on the DROP ROW, not in the panel's form area.
RULING 100: zero added interactions. This doc decides instruments for those
decisions; it does not re-decide them.

**Three things a ruling above turned out to be wrong about.** Each is recorded
at the point of use with the command that shows it, and all three are collected
in section 9 so nobody has to hunt:

1. RULING 114's frozen `saveScope` count of 3 is RED against a correct
   implementation (which has 4) and DEFEATABLE at 4 by a wrong one. Rebuilt.
2. RULING 114's "the slice does NOT match `/\bsaveScope\b/`" is RED against a
   correct implementation, because `saveScope` is the right argument for the
   `currentScope` slot. Rebuilt.
3. RULING 115 requires the row copy to call an exported `describeScope`. That
   name is ALREADY exported, with an incompatible signature, from
   `src/lib/knowledge-overview-scope.ts:193`. Option (a) stands; the export name
   must not be `describeScope`.

A fourth, smaller one: the check's instruction "M-F's kill credit must name
C10/C11, not C1/C2" is wrong. M-F is killed by all four.

---

## 0. LINE NUMBERS. The panel is a MOVING FILE; everything here is re-pinned at `ceab414`

The round-1 version of this doc banned line numbers because a sibling agent was
writing the panel live. That sibling has landed. Measured at the start of this
revision:

```
$ git rev-parse --short HEAD
ceab414
$ git status --short
?? docs/a39-wave4-build-check.md
```

So `src/` and `supabase/` are clean at `ceab414` and every number below is a
measurement of the COMMITTED tree, not of a file in flight. The panel moved
600 -> 603 -> 613 across the scope pass, the round-1 notes and the check. It is
613 now:

```
$ wc -l src/app/components/CartridgeDropPanel.tsx
613
PS> @(Get-Content "...\src\app\components\CartridgeDropPanel.tsx").Count
613
```

Line numbers ARE used below where a citation needs one, because the tree is
committed and stable. **The implementer still re-pins every panel quantity at
its OWN start** - a doc checker is live in `docs/` right now and other agents
may reach `src/` before the build begins. Re-pinning is cheap; a stale frozen
count is a test that cannot fail or one that blocks a correct build. Both
happened in this document's own history.

Other sizes, both instruments agreeing (`wc -l` and
`@(Get-Content ...).Count`):

| File | Lines |
|---|---|
| `src/lib/cartridge-drops.ts` | 151 |
| `src/lib/grade/rubric-memory.ts` | 157 |
| `src/lib/grade/rubric-memory.test.ts` | 137 |
| `src/app/components/CartridgeDropPanel.reorder.test.ts` | 132 |
| `src/app/components/componentStorageKeys.structure.test.ts` | 260 |

### What the reorder half actually landed - MAJOR-3 corrected

The round-1 version said the reorder test was "untracked, 94 lines" carrying
"RULING 106's five-field ordering guard and RULING 107's `ta-` exact-key-set
canary". **All three of those facts were wrong.** Measured:

```
$ git ls-files --error-unmatch src/app/components/CartridgeDropPanel.reorder.test.ts
src/app/components/CartridgeDropPanel.reorder.test.ts        <- TRACKED, not untracked
$ wc -l src/app/components/CartridgeDropPanel.reorder.test.ts
132
```

Read in full, it carries:

- **RULING 106** at `:57` - the five-field source-order guard.
- **RULING 111** at `:85` - `setRubricOrigin(null)` at both clear sites, with an
  anchor-validity self-check at `:101` and two standing sabotage canaries at
  `:123` and `:128`.
- Its own header at `:25-31` records that **RULING 109 SUPERSEDED RULING 107**
  and that the single-file `ta-` canary "has been removed; do not reintroduce a
  per-file duplicate of that canary."

The `ta-` canary now lives in `src/app/components/componentStorageKeys.structure.test.ts`
(tracked, 260 lines), which is **a real reader of the panel and was absent from
the round-1 gate**. It is added in section 6 with a justification.

### RULING 111's fix HAS LANDED, which deletes a residual

```
$ grep -n 'rubricOrigin\|setRubricOrigin' src/app/components/CartridgeDropPanel.tsx
75:  const [rubricOrigin, setRubricOrigin] = useState<string | null>(null);
138:      setRubricOrigin(describeRubricOrigin(loaded, scope));
282:      setRubricOrigin(null);
293:      setRubricOrigin(null);
469:          {rubricOrigin && <p className={styles.fieldHint}>{rubricOrigin}</p>}
```

Five hits, three `setRubricOrigin` callsites, two of them clears. The round-1
residual A40-D3 claimed "exactly one callsite" and "three hits". **Both are
false against the committed tree.** A40-D3 is DELETED in section 7. This is the
`brief-from-the-tree-not-the-doc` failure committed inside a document whose own
section 0 says to measure: the round-1 claim was carried forward from
`docs/a40-check.md` m2 and re-stated as a measurement.

---

## 1. Population - MINOR-1 corrected, and the number moved again

Three commands, three different numbers, each stated with the command that
produced it. The round-1 doc reported "22 paths" against a three-argument
command, which is the subtotal of a two-argument one.

```
$ grep -rln 'cartridge-drops\|CartridgeDrop\b' src --include=*.ts --include=*.tsx | wc -l
5                                                    <- the brief's own pattern
$ grep -rln 'cartridge-drops\|CartridgeDrop' src supabase | wc -l
23
$ grep -rln 'cartridge-drops\|CartridgeDrop' src supabase docs/backlog.yml | wc -l
24
$ grep -rlniE 'cartridge[-_]drops|cartridgedrop' src supabase | wc -l
23
```

So: **24 paths on the widened command, of which 19 are hidden by the `\b`.** The
brief's `\b` excludes `CartridgeDropPanel`, which is most of the population;
that correction is confirmed by the check and stands.

**The number moved between the check and this revision.** The check measured 23
on the three-argument command and 22 on the case-insensitive two-argument one.
Both are now one higher, and the delta is exactly one path:
`src/app/components/componentStorageKeys.structure.test.ts`, created by RULING
109 and committed in `ceab414`. That is the same file MAJOR-3 is about. A
population count on this table is a measurement with a timestamp; the
implementer re-runs it.

The 19 the `\b` hides, and which of them matter:

| Path | Bears on |
|---|---|
| `src/lib/supabase/types.tables-a.ts` | **`CartridgeDropsRow` at `:116` / `Insert` at `:136` / `Update` - the new column's TYPE home. The brief did not name it and R2 is impossible without it.** |
| `src/lib/supabase/types.ts` | The `Database` map entry - no edit owed, listed so it is not mistaken for one |
| `supabase/migrations/20260825000000_create_cartridge_drops.sql` | The base `create table`; R1's and R2a's frozen column oracle is built from it |
| `src/app/components/componentStorageKeys.structure.test.ts` | **A real reader of the panel** (`:101-111`: non-recursive scan of `src/app/components/*`, non-test `.ts`/`.tsx`, read with `readFileSync`). Matches the grep only in prose at `:2` and `:6`, so it is easy to dismiss as name-only. It is not. Gate path. |
| `src/app/components/CartridgeDropPanel.reorder.test.ts` | RULING 106 + RULING 111 (section 0). This doc must not duplicate either |
| `src/app/components/grading-results/rubricProvenanceLeaf.test.ts` | `readFileSync`s the panel and index-scans the `id="cartridge-rubric"` TextField tag for `maxRows` (`:86-89`) - a live reader of the file being changed |
| `src/lib/grade/rubric-memory.ts` | Supplies `LoadedRubricMemory.scope` (the ORIGIN R3 is about) and, per RULING 115, the humaniser R4e renders with. **Now in the write set, export only** |
| `src/lib/course-lms-options.test.ts` | Two `it()` descriptions only; prose, no coupling |
| `src/lib/workflows/registry/steps.grading-cartridge.{ts,test.ts}` | Reads `takeResult.rubricText` (`steps.grading-cartridge.ts:96-97`); the step test already mocks `gradeAction` |
| `src/app/components/{GradingTab,FilesTab}.tsx`, `grading-recording/GradingRecordingPanel.tsx`, `accommodations/AccommodationsPanel.tsx`, `src/lib/course-lms-options.ts`, `src/lib/workflow-triggers{,.roster.test}.ts`, `src/lib/workflow-triggers/event-sources.ts`, `docs/backlog.yml` | Name-only or event-only; no coupling to the row shape |

**The write-set bound, re-measured.** `src/app/actions/workflow-support.ts`
selects EXPLICIT column lists, twice:

```
$ grep -n 'select(' src/app/actions/workflow-support.ts
67:  .select("id, name, course_label, assignment_label, points_possible, rubric_text, lms, storage_path, size_bytes")
129: .select("id, course_label, assignment_label, points_possible, rubric_text, lms, storage_path, size_bytes")
```

So the server path does not need the new column and must not be edited for it.
`src/lib/cartridge-drops.ts:84` is the only `select("*")` and `:133` the only
mapper, private. That bounds the write set; it is what the greps return, not an
argument.

---

## 2. The seam these instruments require

**NO COMPONENT IS RENDERED BY ANY TEST HERE.** `vitest.config.ts`:
`include: ["src/**/*.test.ts"]`, `environment: "node"`. Nothing mounts
`CartridgeDropPanel`.

**R3's subject - "the origin written at upload time is the scope the rubric
ACTUALLY came from" - is decided today inside `handleFileSelect`, inside a
component.** The pure part of it must therefore be lifted out; the CALLSITE is
reachable only as source text, which R3f-R3h now do measurably (RULING 114).

The wrong answer is the convenient one. `handleFileSelect` already computes, at
`src/app/components/CartridgeDropPanel.tsx:260`:

```
const saveScope = cartridgeRubricScope(effective.courseLabel, effective.assignmentLabel);
```

which is THIS assignment's scope. An implementer reaching for the variable
already in scope for the `restored` slot writes the DECISION 3 defect - the row
names this week's assignment for last week's rubric.

The seam is a REQUIREMENT, not a suggestion:

- **S1. A pure, exported decider in a non-component module.** Reference name
  `resolveRubricOriginScope` in `src/lib/grade/rubric-origin.ts`. The implementer
  may rename the module and the function; it must then use the SAME identifier in
  every assertion, and in the R3g anchor. Signature, by behaviour not spelling:

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
  TEXT; the restore effect at `:137-138` discards `loaded.scope` after passing it
  to `describeRubricOrigin`. The decider cannot answer R3 without it. The ref must
  carry `{ rubric, scope } | null`. Its `untouched` comparison at `:130` must
  then read `lastRestoredRubricRef.current?.rubric`.
- **S3. A pure, exported row-copy function.** Reference name
  `describeDropRubricOrigin(originScope: string | null)` returning
  `{ present: boolean; text: string }`. The JSX renders only what this returns.
  Without the `present` flag the render branch is unassertable; without the
  function the copy is unassertable.
- **S4. `CartridgeDrop` gains exactly one field** carrying the origin
  (reference `rubricOriginScope: string | null`), populated by
  `mapCartridgeDrop` from the new column and written by `saveCartridgeDrop`'s
  insert.
- **S5 (NEW, RULING 115). `rubric-memory.ts`'s private humaniser becomes
  exported, under a NON-COLLIDING NAME, and is the ONLY humaniser.**
  `describeScope` at `src/lib/grade/rubric-memory.ts:140-146` is private. RULING
  115 requires the row copy to call it rather than parse the scope again, which
  is what makes R4h an identity instead of an agreement check. **Its literal
  name cannot be used:**

  ```
  $ grep -rn 'export function describeScope' src
  src/lib/knowledge-overview-scope.ts:193:export function describeScope(
  ```

  That one takes `(pages: InstitutionPage[], scopePageId: string | null, institution: string)`
  and is re-exported through `src/lib/knowledge-scope-context.ts:64`. Two
  exported `describeScope` functions with incompatible signatures is not a
  compile error and is exactly the kind of thing that later resolves to the
  wrong import. **Reference name `describeRubricScope`**, exported from
  `src/lib/grade/rubric-memory.ts` with the body unchanged. The implementer may
  choose another name; it must be a name `grep -rn 'export function <name>' src`
  shows zero times before the change, and the same identifier must appear in
  R4h's assertion.

  Write-set addition: `src/lib/grade/rubric-memory.ts`, **for the export
  keyword and the rename only. No behaviour change.** Nothing in the tree pins
  that module's export set (`grep -rln 'unused export\|export sweep' src --include=*.test.ts`
  -> no output), and `rubric-memory.test.ts` already exercises both branches
  INDIRECTLY through `describeRubricOrigin` - `:83` for `upload:` and `:116` for
  `cartridge:`. There is no direct test of the humaniser today; R4e and R4j
  become the first.

Scope-string format, measured, not assumed. `cartridgeRubricScope` (private, in
the panel, `:40-42`):

```
return course.trim() && assignment.trim() ? `cartridge:${course}|${assignment}` : "";
```

and the humaniser at `rubric-memory.ts:140-146`:

```
const uploadMatch = /^upload:(.*)$/.exec(scope);
if (uploadMatch) return `your upload of "${uploadMatch[1]}"`;
const cartridgeMatch = /^cartridge:(.*)\|(.*)$/.exec(scope);
if (cartridgeMatch) return `${cartridgeMatch[1]} / ${cartridgeMatch[2]}`;
return scope;
```

The greedy first group means a course label containing `|` is absorbed into it:
`cartridge:A|B|C` renders `"A|B / C"`. In round 1 that was recorded as a known
limitation and nothing else. **It is now load-bearing: it is the differential
that makes R4j able to detect a second parse.** See R4j.

### The copy principle, carried per RULING 115

The check's strongest finding is that the panel's FORM CAPTION already ships
presence-plus-origin with the humanised scope and the exact-versus-fallback
distinction (`describeRubricOrigin`, `rubric-memory.ts:132-138`, guarded by
`rubric-memory.test.ts`). What does not exist is persistence past unmount, which
is RULING 105's reasoning and is not reopened.

**So the row must not invent copy. It says what the caption says, in the
caption's vocabulary.** Concretely: the caption reads
`Rubric restored from your last saved rubric (CS101 / HW1), saved 2 hours ago.`
and the row reads `Rubric from CS101 / HW1.` - same verb family, same
humanisation, same `Rubric ...` opening. This is not a style note; it is the
reason S5 exists and the reason C7 uses `upload:` rather than a third prefix.
The repo has already REJECTED three spellings in this family:
`rubricProvenanceLeaf.test.ts:58-62` asserts the provenance surface never says
`"Rubric applied"`, `"Rubric source"` or `"Graded against"`. Those three are out
of bounds for the row copy too.

---

## 3. Requirements, instruments, directions of failure, sabotages

Every row names the OBJECT under comparison, the INSTRUMENT producing each
quantity, and the DIRECTION of failure. Every requirement carries a named
mutation, and says whether it discriminates.

### R1 - the new column exists, is additive only, and the migration is idempotent on re-apply

Unchanged from round 1. The check attacked both the frozen body and the
extractor's over-extraction and neither landed; nothing in the rulings touches
R1. Restated, not re-derived.

**Object.** The new migration file's statement body, versus a frozen literal.

**Frozen oracle, stated as a CONSTRUCTION.** Let `COL` be the single column-name
constant the test file declares once and uses everywhere. Then

```
strip(sql).replace(/\s+/g, " ").trim()
  ===  `alter table public.cartridge_drops add column if not exists ${COL} text;`
```

where `strip` drops every line whose trimmed text starts with `--`. Constructible
from the tree today: the table name comes from
`supabase/migrations/20260825000000_create_cartridge_drops.sql:8`
(`create table if not exists public.cartridge_drops (`), and the
`add column if not exists` form is the repo's own idempotency convention
(`src/lib/recording-files.kinds.test.ts:50-51`: "Every migration in this repo is
idempotent - CI re-runs `supabase db push`").

**Why a frozen body and not a list of banned verbs.** The first version of this
assertion was a denylist (`!/drop column|rename|alter column|update public\./`).
That is the forbidden shape - a denylist standing in for an unbounded set. The
frozen body makes every destructive statement UNREPRESENTABLE rather than
enumerated, and it is strictly stronger: **it killed all seven sabotages,
including the two the denylist missed.** The denylist is deleted, not lengthened.

**Instruments.**

| # | Assertion | Instrument | Direction of failure |
|---|---|---|---|
| R1a | no TRAILING `--` comment on any line | per line: `const at = line.indexOf("--"); at > 0 && line.slice(0, at).trim() !== ""` | a trailing comment appears -> RED. Without this, the line-level `strip` above is unsound and a comment can hide a statement from it |
| R1b | exactly ONE statement in the stripped body | `(strip(sql).match(/;/g) ?? []).length === 1` | a second statement of any kind -> RED |
| R1c | the stripped body equals the frozen literal | string equality above | any change to table, column name, type, guard, or nullability -> RED |
| R1d | the raw text carries the repo's idempotency note | `raw.includes("-- Written idempotently.")` | note dropped -> RED. Reads RAW deliberately: the subject IS comment text. The string is verbatim at `20260825000000_create_cartridge_drops.sql:6`; the precedent is `src/lib/knowledge-overview.migration.test.ts` |
| R1e | the filename sorts AFTER `20261021000000_create_deck_template_files.sql` | string compare of basenames | a lower counter -> RED. Re-measured at `ceab414`: `ls supabase/migrations/ \| sort \| tail -1` -> `20261021000000_create_deck_template_files.sql`; `ls supabase/migrations/*.sql \| wc -l` -> 109 |

**R1a is a REBUILT instrument, reported as such per the seat's obligation.** The
first version was `!/\S\s*--/.test(sql)` over the whole file. `\s*` matches
newlines, so any comment line following a non-blank line matched and the
assertion was **RED against a reference migration that has no trailing comment
at all**:

```
R1a trailing-comment-free (line stripper is sufficient): false     <- WRONG, on a correct file
```

Rebuilt per-line, it reads `[]`. A mutant surviving is not always a coverage gap;
here the INSTRUMENT was wrong, and it would have blocked a correct migration.
**That is the same failure RULING 114 asks for twice in R3f/R3g, and the reason
this document refuses it there.**

**Sabotages, all executed against the reference migration in the scratchpad.**

| Mutation | Result | Discriminates? |
|---|---|---|
| S1 `add column if not exists` -> `add column` | KILLED by R1c | YES |
| S2 `COL text;` -> `COL text not null default '';` (rewrites every existing row) | KILLED by R1c | YES |
| S3 append `alter table public.cartridge_drops drop column rubric_text;` | KILLED by R1c | YES |
| S4 append `update public.cartridge_drops set COL = course_label;` | KILLED by R1c | YES |
| S5 `add column if not exists` -> `add column -- if not exists` | KILLED by R1c + R1a | YES |
| S6 `public.cartridge_drops` -> `public.cartridge_drop` | KILLED by R1c | YES |
| S7 append `comment on column ... is 'the rubric's origin';` | KILLED by R1c + the apostrophe check in `src/supabase-migrations.structure.test.ts:142-165` | YES |

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

**Two consequences of the frozen body the implementer must accept.** (1) The
migration may carry NO `comment on column`; rationale goes in the header
comment. (2) The column is NULLABLE with no default - NULL is the "no rubric
carried" state R4 renders, and a `not null default ''` would make the two states
indistinguishable in the database before they ever reach the copy function. R2f
depends on that: its invariant is written against `null`, not `""`.

**Why R1 matters more here than for an ordinary migration.** Migrations
auto-apply on push to main via a GitHub Action, so this file reaches production
unattended, and `src/supabase-migrations.structure.test.ts`'s own header records
the case where exactly that happened: "tsc, eslint, 19903 tests and the build all
passed - none of them read SQL."

---

### R2 - `CartridgeDrop` carries the origin, the mapper populates it, and origin never contradicts presence

**Object.** The `CartridgeDrop` object the REAL producers emit, versus the value
the REAL writer sent - not a hand-built fixture on either side.

**The gate this requirement must NOT work around.** `mapCartridgeDrop` is
PRIVATE (`src/lib/cartridge-drops.ts:133`, `function mapCartridgeDrop(row: ...)`,
no `export`). Do not export it to test it. Drive the production path:
`saveCartridgeDrop` and `listCartridgeDrops`, both exported, both of which call
the mapper. That is the path the panel itself uses, so the test becomes MORE
faithful, not less.

**Proven feasible before being specified.** A chainable stub cast to
`SupabaseClient<Database>` drives both, under node, with no network. Executed
against the REAL `src/lib/cartridge-drops.ts` (imported by `file:///` URL, no
copy made):

```
LIST: mapper executed -> {"id":"d1","name":"hw2.zip","courseLabel":"CS101",...,"rubricText":"RUBRIC ONE",...}
LIST: unknown column dropped by mapper? rubricOriginScope = undefined
SAVE: insert payload keys -> id,user_id,name,course_label,assignment_label,points_possible,rubric_text,lms,status,storage_path,size_bytes
SAVE: returned drop.rubricText -> "RUBRIC ONE"
```

The 11 keys are re-confirmed against `src/lib/cartridge-drops.ts:53-65` at
`ceab414`, including `status: "new"` at `:62`. Two facts from that run are
load-bearing:

- **The R2 instrument is RED against today's tree by construction.** A row
  carrying `rubric_origin_scope` maps to `rubricOriginScope === undefined`,
  because no mapper line reads it (`:133-150`, 16 fields, none of them the
  origin). No sabotage is needed to establish the RED baseline; the current tree
  IS it.
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
| R2a | every key in the captured insert payload is a real migration column | `Object.keys(captured[0])` versus the union of `create table` columns extracted from `20260825...create_cartridge_drops.sql` and `add column if not exists <name>` matches from the new migration | a misspelled column name **in the insert** -> RED. **This is the ONLY gate on that pair: `select("*")` returns a missing column as `undefined`, tsc believes the type (the table access is cast `as any` at `src/lib/cartridge-drops.ts:51-52`), and nothing else here reads SQL.** MINOR-2: R2a inspects the INSERT PAYLOAD, **not** `CartridgeDropsRow`. A Row field the insert never writes escapes it entirely. The narrower true claim is the one stated here |
| R2b | the payload contains the origin column | `Object.keys(captured[0]).includes(COL)` | the writer omits it -> every row's origin is NULL forever and R4 renders the no-rubric state for every drop -> RED. **This is the silent-green direction and it has no other enforcer.** It is also what makes R2a's narrow claim sufficient FOR A40 specifically: R2b forces `COL` into the insert, so R2a then does compare it against SQL |
| R2c | the value the writer sent round-trips to the mapped object | `saveCartridgeDrop(...).rubricOriginScope` versus the value passed in `meta` | mapper reads the wrong column, or the field is dropped -> RED |
| R2d | `listCartridgeDrops` maps it too, from a row whose KEYS came from the writer | feed `listCartridgeDrops` the object the write stub echoed; assert the origin | a mapper that only the insert path populates -> RED. Using the echoed row rather than a hand-typed fixture is what closes the "fixtures must match the emitted shape" trap - a rename in either direction breaks the test |
| R2e | the column-extractor discriminates | two fixtures: one where a name appears only in a `--` comment and must NOT be extracted; one with two columns that must both be | a heuristic that scrapes comments -> RED |
| **R2f** | **NEW (RULING 112). Over the captured insert payload: `payload[COL] === null \|\| (typeof payload.rubric_text === "string" && payload.rubric_text !== "")`** | the same capturing stub as R2a-R2d, driving the REAL `saveCartridgeDrop`; one line, no new harness | **an origin written onto a row whose `rubric_text` is NULL -> RED.** This is the only assertion in the whole set that pins a RELATION between two fields rather than one field's value, and it is the only one that pins the PRESENCE half of "presence plus origin" against the DATA rather than against the copy |

**R2e is a DUPLICATE, not an import - MINOR-3.** `extractCreateTableColumns`
lives inside `src/lib/cron-heartbeat.test.ts:399`, with its own canary describe
at `:421`. **Copy it; do not import it.** `docs/loop/traps-tests.md`: importing a
helper from another `*.test.ts` re-runs that file's `describe` blocks inside the
importing file's run, under the wrong setup. The check verified the precedent
bounds itself with `indexOf("\n);")`, so it cannot over-extract from this
migration's `check (lms in (...))` clause, its trailing `create index (...)`, or
its `insert into storage.buckets (id, name, public)`.

Measured against the real base migration: **17 create-table columns** extracted
(hand-counted off `20260825000000_create_cartridge_drops.sql:9-25`, and
`CartridgeDropsRow` at `types.tables-a.ts:116-134` has the same 17 fields);
`["rubric_origin_scope"]` from the reference new migration; `R2a` missing-set
`[]`; `R2b` true; `R2c`/`R2d` both `"cartridge:CS101|HW1"`.

**R2f executed against the reference decider and every mutant**, over all eleven
R3 cases, with `payload = { rubric_text: input.rubricText, [COL]: decider(input) }`:

```
REFERENCE: R2f violations = none
M-A falsy guard narrowed to === null: R2f violations = C2,C11
M-B restored branch demoted below currentScope: R2f violations = none
M-C archive branch deleted: R2f violations = none
M-D blank currentScope returned as empty string: R2f violations = none
M-E restored PRESENCE trusted, text not compared: R2f violations = none
M-F no-rubric guard deleted: R2f violations = C1,C2,C10,C11
M-G only a memory-restored rubric gets an origin: R2f violations = none
M-H (B1) restored tested BEFORE the falsy guard: R2f violations = C10,C11
```

**R2f discriminates M-A, M-F and M-H, and NOTHING ELSE - stated because a
reader could assume an invariant covers everything.** M-B, M-C, M-D, M-E and
M-G are all ATTRIBUTION errors: they write a wrong-but-present origin onto a row
that really does carry a rubric, and no presence invariant can see that. R2f is
the presence half; R3's table is the attribution half. Neither substitutes for
the other, and R2f's value is that it is the only one of the two that runs
against the real writer.

**Sabotages.**

| Mutation | Expected | Discriminates? |
|---|---|---|
| Delete the `rubricOriginScope: row.rubric_origin_scope,` line from `mapCartridgeDrop` | R2c and R2d RED; R2a, R2b, R2f stay GREEN | YES - and the split is the point: it isolates the READ half from the WRITE half |
| Delete `rubric_origin_scope: meta.rubricOriginScope,` from the insert object | R2b RED (and R2c/R2d RED as a consequence) | YES |
| Misspell the insert key (`rubric_origin_scop`) | R2a RED | YES. This is the mutation R2a exists for: tsc cannot see it, the table access is cast `as any` |
| **Add the field to `CartridgeDropsRow` AND to the insert, but omit the column from the migration** | R2a RED | YES - the pair-consistency mutation, and the one with no other gate. **MINOR-2's correction is applied to the mutation too:** the round-1 version of this row omitted "and to the insert", and without that edit R2a does NOT go red, because it never reads the Row type |
| Add the field to `CartridgeDropsRow` only, writing it nowhere | **GREEN on everything here.** Named as a KNOWN HOLE, not banked as a kill | NO. `npx tsc --noEmit` does not catch it either (an unwritten optional Row field is legal). Residual A40-D6 |
| Remove `COL` from the frozen migration body only | R2a RED **and** R1c RED | YES, but note it is red for two reasons; do not bank it as two kills |
| Pass a non-null origin for a rubric-less drop (`meta.rubricText = null`, `meta.rubricOriginScope = "cartridge:CS101|HW1"`) | **R2f RED**; R2a-R2d all GREEN | YES, and R2f is the ONLY thing that catches it |

**One mutation I will not specify, and why.** "Change `CartridgeDrop`'s field
type from `string | null` to `string`" is red at `npx tsc --noEmit`, not in
vitest. It is a type-gate kill, not a test kill, and counting it here would
inflate the instrument's apparent reach.

---

### R3 - the origin written is the scope the rubric ACTUALLY came from

This is DECISION 3's "a correctness defect wearing a convenience feature's
clothes", and DECISION 16 exists to close it.

**Object.** `resolveRubricOriginScope`'s return value over a frozen case set;
the same value driven end to end through the real `saveCartridgeDrop` into the
row copy; and the CALLSITE as source text.

**Frozen case oracle, stated as a CONSTRUCTION.** The cases are the cross product
of the two independent axes the decider reads - what put text in the rubric
field (nothing / the instructor's own typing / the archive sniff / rubric-memory
at an exact scope / rubric-memory at a fallback scope) and whether a RESTORED
value is retained in the ref - restricted to the combinations
`mergeSniffedValues` can actually produce. That restriction is derived, not
guessed: `src/lib/submission-archive-sniff.ts:74` is
`const effRubricText = current.rubricText || sniff.rubricText || null;`, so a
non-empty current value ALWAYS wins and sniff can only contribute when the field
was empty.

**Round 1 got the restriction right on the SNIFF axis and wrong on the RESTORED
axis, and that is RULING 112.** It produced nine cases, all of which pair an
empty `rubricText` with an ABSENT `restored`. That pairing is not forced by
anything. **Verified against the committed panel, not taken from the ruling:**

1. `src/app/components/CartridgeDropPanel.tsx:137` -
   `lastRestoredRubricRef.current = loaded.entry.rubric` in the restore effect.
2. The post-upload reset at `:276-285` does `setRubricText("")`,
   `setSniffHint(null)` and (RULING 111) `setRubricOrigin(null)`. **It does not
   clear `lastRestoredRubricRef`** - and it must not, because `:130` uses that
   ref as the `untouched` sentinel.
3. The restore effect does not re-run: its deps at `:144` are
   `[courseLabel, assignmentLabel]`, both unchanged when the instructor typed
   them and the sniff confirmed the same values (`:242-243` set them from
   `effective`).
4. Upload 2, same assignment, archive with no rubric. `effective.rubricText =
   "" || null || null = null`. The decider is called with `rubricText: null` and
   `restored: { rubric: R, scope: "cartridge:CS101|HW1" }`.

So the reset, the deps and the sentinel are exactly as RULING 112 describes; the
one thing I add is step 3's precondition (the sniff must not CHANGE
course/assignment, or the effect re-runs). The state is reachable, and two cases
close it.

| Case | rubricText | currentScope | restored | sniffed | Expected |
|---|---|---|---|---|---|
| C1 | `null` | `cartridge:CS101\|HW2` | - | - | `null` |
| C2 | `""` | `cartridge:CS101\|HW2` | - | - | `null` |
| C3 | `"TYPED"` | `cartridge:CS101\|HW2` | - | - | `cartridge:CS101\|HW2` |
| C4 | `"R"` | `cartridge:CS101\|HW2` | `{R, cartridge:CS101\|HW2}` | - | `cartridge:CS101\|HW2` |
| **C5** | `"R"` | `cartridge:CS101\|HW2` | `{R, cartridge:CS101\|HW1}` | - | **`cartridge:CS101\|HW1`** |
| C6 | `"MINE"` | `cartridge:CS101\|HW2` | `{R, cartridge:CS101\|HW1}` | - | `cartridge:CS101\|HW2` |
| C7 | `"FROMZIP"` | `cartridge:CS101\|HW2` | - | `"FROMZIP"` | **`upload:hw2.zip`** |
| **C8** | `"R"` | `cartridge:CS101\|HW2` | `{R, cartridge:CS101\|HW1}` | `"FROMZIP"` | **`cartridge:CS101\|HW1`** |
| C9 | `"TYPED"` | `""` | - | - | `null` |
| **C10** | `null` | `cartridge:CS101\|HW2` | `{R, cartridge:CS101\|HW1}` | - | **`null`** |
| **C11** | `""` | `cartridge:CS101\|HW2` | `{R, cartridge:CS101\|HW2}` | - | **`null`** |

C5 and C8 ARE the attribution requirement. C8 also pins the ORDERING fact that
the restored value outranks a sniffed one, which is `mergeSniffedValues`'s
behaviour, not a new invention. C10 and C11 are the presence requirement at the
decider; R2f is the same requirement at the writer.

**C7's expected value changed from `archive:hw2.zip` to `upload:hw2.zip`
(RULING 115, option (a)).** Re-measured: `archive:` exists nowhere as a scope
prefix -

```
$ grep -rn '"archive:\|`archive:\|'"'"'archive:' src supabase; echo "EXIT=$?"
EXIT=1                                                       <- no hits
```

(the bare token `archive:` DOES appear 11 times, all inside prose sentences such
as `Detected from the archive: ...` at `CartridgeDropPanel.tsx:252` - a narrower
statement than "appears nowhere in src", and the narrow one is the true one).
The repo's prefix for "the scope is a file the instructor supplied" is
`upload:<name>`, already used at `GradingTab.tsx:232` and `:324` and already
covered by `rubric-memory.test.ts:57-99`. Option (b) - a new `archive:` branch -
is refused: it invents a third vocabulary for a concept that already has one,
which is the drift R4h exists to prevent.

**Satisfiability proven before hand-off, per the seat's first obligation.** A
reference implementation written in the scratchpad scores **11/11** on this
table. The table is a specification, not a wish list.

```
=== 11-case oracle ===
REFERENCE: 11/11
```

**Mutation accounting, run per case. This is where the honest reporting is.**

| Mutant | Score | Killed by |
|---|---|---|
| M-A falsy guard narrowed to `=== null` | 9/11 | C2, **C11** |
| **M-B restored branch demoted below the `currentScope` fallthrough** | 9/11 | **C5, C8** |
| M-C archive branch deleted | 10/11 | C7 |
| M-D blank `currentScope` returned as `""` instead of `null` | 10/11 | C9 |
| M-E restored PRESENCE trusted without comparing the text | 10/11 | C6 |
| M-F the no-rubric guard deleted | 7/11 | **C1, C2, C10, C11** |
| M-G only a memory-restored rubric gets an origin | 8/11 | C3, C6, C7 |
| **M-H restored tested BEFORE the falsy guard (RULING 112's mutant)** | 9/11 | **C10, C11 - and nothing else in this document** |

**The check's instruction that "M-F's kill credit must name C10/C11, not C1/C2"
is WRONG, and the measurement is above.** M-F deletes the guard outright, so it
is killed by all four null/empty cases. What is true - and is the thing that
instruction was reaching for - is that **M-F's kills do not cover M-H.** M-H
keeps the guard and merely tests `restored` in front of it, so it passes C1 and
C2 (no `restored` present) and dies only on C10 and C11. Confirmed by running
M-H against the OLD table alone:

```
=== M-H against the OLD nine-case table only (C1..C9) ===
M-H on C1..C9: 9/9
```

**That 9/9 is the whole of RULING 112.** A mutant that writes
`rubric_origin_scope = 'cartridge:CS101|HW1'` onto a row whose `rubric_text` is
NULL - so the row reads "Rubric from CS101 / HW1." for a drop that carried no
rubric at all - scored full marks on the round-1 oracle. That is worse than
DECISION 3's original defect: it does not merely name the wrong assignment, it
asserts a rubric that does not exist. C10, C11 and R2f are the three assertions
that catch it, and before this revision there were none.

**C4 DISCRIMINATES NOTHING in either battery, and I am not counting it as
coverage.** In the exact-match case the restored scope and the current scope are
the same string, so every mutant that returns either one passes it. It stays as
a non-discriminating regression anchor and is labelled that way in the test file.
A kill count that included C4 would be an instrument overstating its own reach.

**M-B is still THE attribution mutant.** It is not contrived - it is what an
implementer writes when they reach for the `saveScope` variable already sitting
in `handleFileSelect`:

```
M-B restored branch demoted below currentScope: 9/11
   RED C5 expected "cartridge:CS101|HW1" got "cartridge:CS101|HW2"
   RED C8 expected "cartridge:CS101|HW1" got "cartridge:CS101|HW2"
```

#### R3e - the producer executes, because the pure test is necessary and not sufficient

The decider could be perfect and never called, or called with `saveScope` in the
`restored` slot.

| # | Assertion | Instrument | Direction of failure |
|---|---|---|---|
| R3e | end to end on C5: decider -> real `saveCartridgeDrop` -> mapper -> row copy, and the resulting SENTENCE names `HW1` and not `HW2` | capturing stub as in R2; assert on the copy function's `text` | the origin is computed from the requested scope anywhere in the chain -> RED |

Executed, with the reference tree and the RULING 113 literal:

```
REFERENCE: row says "Rubric from CS101 / HW1."  -> E2E assertion (names HW1, not HW2): GREEN
M-B restored-branch-demoted: row says "Rubric from CS101 / HW2."  -> E2E assertion (names HW1, not HW2): RED
rubric-less drop: present=false text="No rubric was included with this upload." -> frozen-literal assertion: GREEN
```

#### R3f, R3g, R3h - the CALLSITE, which round 1 filed as unmeasurable and RULING 114 correctly rejected

**The round-1 reasoning was wrong and the check's refutation is accepted
without argument.** `src/app/components/CartridgeDropPanel.reorder.test.ts:76-132`
does precisely this shape on precisely this handler: block-anchored
`SOURCE.indexOf(...)` slices (`:88-99`), an anchor-validity self-check that names
its own reason (`:101` - "a check over -1 proves nothing"), a `toMatch` on an
identifier inside the block (`:110`), and two standing sabotage canaries
(`:123`, `:128`). This document already accepts that shape four times, in
R5a-R5c and R1d. A40-D2 is DELETED from the residual register.

**But RULING 114's two specified instruments are both RED against a correct
implementation, and I executed them to find out.** The probe splices a decider
callsite into the real 613-line panel just before the existing
`saveCartridgeDrop(` call - the only place the data flow permits - and runs the
instrument against a correct variant and five wrong ones.

**Disproof 1: the frozen `saveScope` count.**

```
/\bsaveScope\b/g on the REAL tree (pre-build)   : 3
/\bsaveScope\b/g on the CORRECT implementation  : 4
/\bsaveScope\b/g on BAD-1 .. BAD-4              : 5
/\bsaveScope\b/g on BAD-5                       : 4
```

Freezing at 3 is RED against the correct build, because `currentScope: saveScope`
is the RIGHT argument for the `currentScope` slot - `saveScope` IS this
assignment's scope, which is exactly what C3 expects the decider to return.
Freezing at 4 instead looks like it works (it passes the correct build and fails
BAD-1..BAD-4 at 5) and is DEFEATED by BAD-5, which re-calls
`cartridgeRubricScope(effective.courseLabel, effective.assignmentLabel)` inline
in the `restored` slot and keeps the count at 4:

```
BAD-5 (re-calls cartridgeRubricScope in the restored slot)
  /saveScope/g count : 4   <- a frozen 4 would PASS this wrong build
  cartridgeRubricScope( count: 4
```

A count of a variable name is not the fact under measurement. It is a spelling,
and pinning a spelling is `docs/loop/traps-tests.md`'s over-specification class -
which is why the fix changes KIND rather than picking a different number.

**Disproof 2: "the slice does NOT match `/\bsaveScope\b/`".** Same cause. The
correct implementation's block legitimately contains `saveScope`:

```
GOOD  ref passed directly    ... hasRef=true hasSaveScope=true
   verdict (anchorsOk && hasRef && !hasSaveScope): false     <- RED on a correct build
```

**The rebuilt instrument, and it is a KIND change: two POSITIVE identifier pins
plus a uniqueness assertion. No denylist anywhere.**

| # | Assertion | Instrument | Direction of failure |
|---|---|---|---|
| R3g-1 | both anchors resolve, in order | `start = SOURCE.indexOf("resolveRubricOriginScope(")`, `end = SOURCE.indexOf("saveCartridgeDrop(", start)`; assert `start > -1` **and** `end > start` | either anchor missing -> RED. **Both ends, per this repo's own `slice(start, -1)` silent-widening failure.** `end > start` is also a real wiring fact: the decider must be called before the insert that consumes its result |
| R3g-2 | the slice is a CALL, not most of the file | `block.length < 2000` | a pathological anchor that widens the slice -> RED. Measured: the correct call's block is **378 chars** of a 22635-char file (1.6%); the five wrong variants are 405-434. The bound is 5x the measured width, not a tight fit |
| R3g-3 | there is exactly ONE `restored:` argument in the block | `(block.match(/\brestored:/g) ?? []).length === 1` | a second `restored:` added beside a correct one -> RED. This is what makes the positive pin below sufficient: without it, BAD-4 satisfies the pin and is still wrong |
| R3g-4 | the `restored:` argument IS the retained ref | `/restored:\s*lastRestoredRubricRef\.current\s*,/.test(block)` | any other value in that slot -> RED, including a two-line object literal, an inline `{rubric, scope}`, and a re-call of `cartridgeRubricScope` |
| R3g-5 | the `currentScope:` argument IS `saveScope` | `/currentScope:\s*saveScope\s*,/.test(block)` | the two arguments swapped, or `currentScope` fed from the ref -> RED |
| R3h | `saveScope` still reaches `saveRubricMemory` unchanged | `start = SOURCE.indexOf("const saveScope = cartridgeRubricScope(")`, `end = SOURCE.indexOf("saveCartridgeDrop(", start)`, both asserted; then `/saveRubricMemory\(RUBRIC_MEMORY_STORAGE_KEY,\s*saveScope,/.test(block)` | the A39 memory-write behaviour is broken while wiring the origin -> RED. **GREEN on today's tree**, so this is a regression canary, not a TDD-red requirement |

**Executed. The correct variant passes; all five wrong ones fail, each on a
different clause.**

```
=== REBUILT R3g ===
  GOOD  ref passed directly           pass=true  anchors=true width=true(378) restoredCount=1 restoredIsRef=true  currentIsSaveScope=true
  BAD-1 saveScope inline in the slot   pass=false anchors=true width=true(405) restoredCount=1 restoredIsRef=false currentIsSaveScope=true
  BAD-2 saveScope over two lines       pass=false anchors=true width=true(434) restoredCount=1 restoredIsRef=false currentIsSaveScope=true
  BAD-3 ref text but the CURRENT scope pass=false anchors=true width=true(422) restoredCount=1 restoredIsRef=false currentIsSaveScope=true
  BAD-4 a second restored: added       pass=false anchors=true width=true(431) restoredCount=2 restoredIsRef=true  currentIsSaveScope=true
  BAD-5 re-calls cartridgeRubricScope  pass=false (restoredIsRef=false)
  REAL tree (pre-build): {"anchorsResolve":false,"pass":false}       <- correctly RED before the build
```

BAD-2 is why the rebuild is positive rather than a narrowed negative: a
same-line negative regex such as `/restored:[^\n]*\bsaveScope\b/` kills BAD-1
and BAD-3 and **misses BAD-2 entirely**, because the offending token is on a
later line. The positive pin plus the uniqueness count makes the bad state
unrepresentable instead of enumerated.

**The `-1` widening trap, demonstrated on this very anchor** so the
anchor-resolves assertion is not taken on faith:

```
start=-1 on the pre-build tree; an UNCHECKED slice(start, ...) covers 0 chars of a 22635-char file
and /restored:\s*lastRestoredRubricRef\.current/ over that widened slice: false
```

Here the unchecked version happens to fail closed. That is luck, not design: with
`end` unresolved instead, `slice(start, -1)` is nearly the whole file and the
`toMatch` would pass on any occurrence anywhere. **R3g-1 asserts both ends.**

**R3f is DELETED and replaced.** There is no frozen `saveScope` count in this
document. The fact "the origin is not computed from the requested scope" is
measured by R3g-3/4/5, which do not depend on how many times a variable is
spelled. If a future reader wants a count, the counts that ARE stable at
`ceab414` and do measure something are recorded here so nobody re-derives them
wrongly: `saveRubricMemory(` -> 1, `cartridgeRubricScope(` -> 3,
`lastRestoredRubricRef` -> 3, `saveCartridgeDrop(` -> 1 (the import is on a
different line and `indexOf(..., start)` never sees it).

**Known indistinguishability, recorded rather than papered over.** If the
instructor types a string byte-identical to the restored one, the decider
attributes it to the restored scope. The discriminator is the same
text-equality the restore effect itself already uses for its `untouched` check
(`:130`), so this is not a new weakness; and the attribution is not harmful in
direction (it names where that exact text was last seen). Not a requirement;
recorded so a checker does not read it as an oversight.

---

### R4 - the no-rubric state renders, the two states are DISTINGUISHABLE, and there is ONE humaniser

**Object.** `describeDropRubricOrigin`'s return value over a frozen input set.

**This instrument was REBUILT in round 1 after being executed against two
passing-but-wrong implementations, and BOTH SURVIVED.** The first version
asserted (a) the outputs are pairwise distinct, (b) the fallback output names its
own scope and not the requested one, (c) the no-rubric output names no scope at
all. Then the defect requirement 4 literally names - "one string that happens to
read plausibly in both" - was written and run:

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
with a hole in it. **The fix changed KIND, not strength: a FROZEN COPY LITERAL
for the no-rubric sentence, which is the one case where the spelling IS the
fact**, plus a `present` boolean so the render branch is assertable without
parsing prose.

#### The frozen literal CHANGES (RULING 113)

```
FROZEN_NO_RUBRIC = "No rubric was included with this upload."
```

Round 1 froze `"No rubric was included; the workflow generated one."`, derived
from the rubric field's own placeholder at `CartridgeDropPanel.tsx:466`:
`"Paste a rubric or grading criteria. If blank, the workflow will generate one."`

**The derivation was sound and the result was still false.** The placeholder is a
forward-looking conditional read by an instructor at the moment of upload; the
row is a retrospective assertion read later, by an instructor who may never have
turned auto-grading on. Re-measured at `ceab414`:

```
$ grep -n 'handleToggleAutoGrade\|findAutoGradeTrigger\|Turn on auto-grading' src/app/components/CartridgeDropPanel.tsx
328:  const findAutoGradeTrigger = (): WorkflowTrigger | undefined => {
334:  const handleToggleAutoGrade = async () => {
504:              {findAutoGradeTrigger()?.enabled ? (
522:              variant={findAutoGradeTrigger()?.enabled ? "outlined" : "contained"}
523:              onClick={() => void handleToggleAutoGrade()}
526:              {findAutoGradeTrigger()?.enabled ? "Turn off" : "Turn on auto-grading"}
```

The toggle CREATES the trigger on first use; until then `findAutoGradeTrigger()`
returns `undefined`, the button reads `"Turn on auto-grading"`, and the trigger
can additionally be disabled (`:340`,
`updateWorkflowTrigger(..., { enabled: false })`). With no enabled trigger the
drop persists at `status: "new"` (`src/lib/cartridge-drops.ts:62`) and no
workflow runs. The round-1 row would have told the instructor a rubric was
generated when none was - and because R4a is string EQUALITY, an implementer who
noticed could not have fixed it. **A frozen literal pins a defect exactly as
hard as it pins a requirement.** That is the failure mode of this seat's
strongest tool, and it is worth more than the four assertions it protects.

**Turning "will, if you have it on" into "did" is where the derivation broke.**
The replacement carries the presence fact and makes no claim about a workflow:
one clause, true in every reachable state. `"upload"` is the panel's own word for
the action (`CARTRIDGE_DROP_UPLOADED_EVENT`, "Upload with effective values").

**Collision check, because RULING 113 conditions on it.** The literal is new and
collides with nothing:

```
$ grep -rn 'with this upload' src; echo "EXIT=$?"
EXIT=1
$ grep -rn 'No rubric' src supabase docs/backlog.yml | wc -l
33
```

None of the 33 is this sentence. The nearest neighbours are
`" No rubric was found in Canvas; none will be synthesized."`
(`GradingTab.tsx:166`, `useLmsAssignmentPull.ts:278`) - a different surface, a
different fact, and notably a sentence that DOES name a consequence because on
that path the consequence is known. The three spellings
`rubricProvenanceLeaf.test.ts:58-62` has already rejected
(`"Rubric applied"`, `"Rubric source"`, `"Graded against"`) are avoided.

**The PRESENT-state copy is deliberately NOT frozen** - only required to contain
the humanised scope - because there the spelling is not the fact and pinning it
would force a contorted implementation.

**Instruments.**

| # | Assertion | Instrument | Direction of failure | Discriminates |
|---|---|---|---|---|
| R4a | `f(null).text === FROZEN_NO_RUBRIC` | string equality with the literal frozen above, declared by the TEST | the no-rubric state is produced by the present-state template with a hole, or by any other wording -> RED | **kills MUT_P and MUT_Q - the two that survived everything else** |
| R4b | `f(null).present === false` | boolean | the flag lies about a rubric-less drop -> RED | kills MUT_S |
| R4c | for each of the three scopes, `present === true` | boolean | a present rubric renders as absent -> RED | pairs with R4b |
| R4d | for each scope, `text !== FROZEN_NO_RUBRIC` | inequality | present state collapses onto the absent state -> RED | no mutant in this battery; kept as the explicit statement of "distinguishable" |
| R4e | for each scope, `text` contains **a FROZEN LITERAL** humanisation | substring against `{"cartridge:CS101\|HW1": "CS101 / HW1", "cartridge:CS101\|HW2": "CS101 / HW2", "upload:hw2.zip": 'your upload of "hw2.zip"'}`, **written out in the test file as literals. NEVER computed with the implementation's humaniser** | the raw scope token is dumped into the sentence -> RED | kills MUT_R |
| R4f | the fallback sentence contains `HW1` and not `HW2` | substring both ways | the row names the requested assignment | discriminates M-B **only through R3e**; at the copy level alone it kills nothing, and is labelled a duplicate there |
| R4g | the four outputs are pairwise distinct | `new Set(...).size === 4` | two states collapse | **NOTHING in this battery. Kept as a cheap anchor and labelled non-discriminating - it is the assertion that let P and Q through, and it is still true for all six mutants** |
| R4h | the row copy and the form caption use ONE humaniser | the copy function calls the exported humaniser from `src/lib/grade/rubric-memory.ts` (S5), and the test asserts the origin module imports it: `originModuleSource` matches `/from "\.\/rubric-memory"/` and `/\bdescribeRubricScope\b/` | a private second parse in the origin module -> RED **only if it replaces the import**. **Per RULING 115 this is now an IDENTITY, not a comparison.** Say so plainly: as a behavioural assertion it kills nothing, because a function cannot disagree with itself. Its discriminating partner is R4j | NO, on its own |
| **R4j** | **NEW. `f("cartridge:A\|B\|C").text` contains `"A\|B / C"`** | substring against a frozen literal | **a SECOND parse that coexists with the import -> RED.** The real humaniser's first group is GREEDY (`/^cartridge:(.*)\|(.*)$/`), so it absorbs the inner bar | **YES. This is the only assertion that can detect a second implementation, and it does it by construction rather than by banning a regex** |

**R4e's instrument wording is MINOR-4's correction, and it is not cosmetic.**
Round 1 read "substring, where the expected rendering is produced by the same
parse the test declares". An implementer reading that as "compute the expected
value with the implementation's humaniser" turns R4e into a tautology, MUT_R
survives, and R4's whole rebuild is undone. The expected renderings are FROZEN
LITERALS in the test file.

**R4j replaces a denylist I would otherwise have needed.** The requirement "one
humaniser, not two" has an obvious wrong instrument: assert the origin module's
source does not contain `/^cartridge:` or `/^upload:`. That is a denylist
standing in for an unbounded set - a third spelling of the same parse defeats it.
R4j measures the CONSEQUENCE instead. Executed against two hand-written second
parses that are indistinguishable from the real one on every ordinary input:

```
=== R4j differential probe on cartridge:A|B|C ===
  real describeScope : "A|B / C"
  split-on-bar mutant: "A / B"
  lazy-group   mutant: "A / B|C"
  both mutants agree with the real parse on the three ordinary scopes? true
```

The `|`-in-a-course-label behaviour that round 1 recorded as a harmless known
limitation is what makes this work. It is a quirk, which is precisely why a
reimplementation will not reproduce it.

**Final battery, executed. Six mutants, each killed, and the two
non-discriminating assertions labelled.**

```
=== R4 battery ===
  REFERENCE R4a=true  R4b=true  R4c=true R4d=true R4e=true  R4g=true R4j=true
  MUT_P     R4a=false R4b=true  R4c=true R4d=true R4e=true  R4g=true R4j=true
  MUT_Q     R4a=false R4b=true  R4c=true R4d=true R4e=true  R4g=true R4j=true
  MUT_R     R4a=true  R4b=true  R4c=true R4d=true R4e=false R4g=true R4j=false
  MUT_S     R4a=true  R4b=false R4c=true R4d=true R4e=true  R4g=true R4j=true
  MUT_T     R4a=true  R4b=true  R4c=true R4d=true R4e=true  R4g=true R4j=false
  MUT_U     R4a=true  R4b=true  R4c=true R4d=true R4e=true  R4g=true R4j=false
```

| Mutant | Killed by | Note |
|---|---|---|
| MUT_P one string plausible in both (`"Rubric: none."`) | R4a only | the frozen literal is the only thing that sees it |
| MUT_Q the present template with an empty hole (`"Rubric from ."`) | R4a only | as above |
| MUT_R the raw scope token in the sentence | R4e **and** R4j | two reasons; do not bank as two kills |
| MUT_S the `present` flag lies | R4b only | |
| **MUT_T second parse, `split("\|")`** | **R4j only** | passes R4a-R4g |
| **MUT_U second parse, lazy group `(.*?)`** | **R4j only** | passes R4a-R4g |

Reference outputs, for the implementer to match:

```
null                  -> {"present":false,"text":"No rubric was included with this upload."}
"cartridge:CS101|HW1" -> {"present":true,"text":"Rubric from CS101 / HW1."}
"cartridge:CS101|HW2" -> {"present":true,"text":"Rubric from CS101 / HW2."}
"upload:hw2.zip"      -> {"present":true,"text":"Rubric from your upload of \"hw2.zip\"."}
"cartridge:A|B|C"     -> {"present":true,"text":"Rubric from A|B / C."}
```

Only the first of those five is frozen by equality. The other four are frozen
only in the substring R4e and R4j read.

#### Placement, which is an instrument and not a style note

The disclosure renders as a `<p className={styles.fieldHint}>` inside the
EXISTING course/assignment `<td>` (`CartridgeDropPanel.tsx:559-562`), mirroring
the row's own `{drop.error && <p className={styles.error}>...}` pattern in the
status cell at `:567`. **It adds no table column.**

| # | Assertion | Instrument | Direction of failure |
|---|---|---|---|
| R4i | the drops table's `<th>` count is **exactly 5** AND its `<td>` count is **exactly 5** AND the two are equal | `(src.match(/<th[>\s]/g) ?? []).length === 5`, `(src.match(/<td[>\s]/g) ?? []).length === 5`, and the equality kept as a third clause | **a column ADDED (a `<th>` and a `<td>` together) -> RED**, which the round-1 equality-only version passed at 6 === 6; and a `<td>` added without a `<th>` -> RED on the equality |

**MAJOR-1 corrected.** Round 1 introduced R4i under "It adds no table column"
and then asserted only `th === td`, which is satisfied by adding a column. The
framing sentence overclaimed while the direction-of-failure column stated the
narrow truth, and the R4 sabotage table never tried the paired mutation. Both
counts are now frozen and the equality is kept, so all three mistakes are red:
add a column (both counts move), forget the header (equality breaks), forget the
cell (equality breaks).

Re-measured at `ceab414`:

```
$ grep -oE '<th[> ]' src/app/components/CartridgeDropPanel.tsx | wc -l
5
$ grep -oE '<td[> ]' src/app/components/CartridgeDropPanel.tsx | wc -l
5
$ grep -o '<th' src/app/components/CartridgeDropPanel.tsx | wc -l
6                                        <- the trap: <thead> matches
```

**Use `/<th[>\s]/`, not `'<th'`.** That off-by-one is the whole reason the
pattern is spelled out here. The five headers are `Name`, `Course / Assignment`,
`Status`, `Created`, `Actions` at `:548-552`.

**Sabotage for R4i.**

| Mutation | Expected | Discriminates? |
|---|---|---|
| Add `<th>Rubric</th>` and a matching `<td>` | **R4i RED on both frozen counts (6 and 6)**; the equality clause alone would be GREEN | YES - and this is the mutation the round-1 instrument could not see |
| Add a `<td>` only | R4i RED on the `<td>` count and on the equality | YES |
| Render the disclosure as a `<p>` inside the existing `<td>` | GREEN, and correct | Confirms the instrument does not block the intended implementation - the check every guard owes itself |

---

### R5 - zero added interactions (RULING 100)

**A click count is a rendered-UI property and cannot be measured by any test in
this repo. I am not going to pretend otherwise.** What IS executable is that the
panel's source gains no new interactive affordance. That is a proxy, it is
labelled a proxy, and the user-visible claim is a residual (A40-D1).

**Frozen oracle, as a CONSTRUCTION, not a denylist.** Build the exact multiset of
interactive tokens present in `CartridgeDropPanel.tsx` and freeze it. Any NEW
token, of any kind, is outside the frozen set and fails - the "make the bad state
unrepresentable" shape rather than a list of banned things.

Re-measured at `ceab414` on the 613-line file. **Every quantity is unchanged
across 600 -> 603 -> 613 lines, which is a stronger result than round 1 claimed
and which the check independently reproduced. Re-pin anyway:**

```
$ grep -o 'on[A-Z][A-Za-z]*=' src/app/components/CartridgeDropPanel.tsx | sort | uniq -c
      6 onChange=
      4 onClick=
$ grep -oE '<(Button|MenuItem|TextField|input)' src/app/components/CartridgeDropPanel.tsx | sort | uniq -c
      4 <Button
      4 <MenuItem
      5 <TextField
      1 <input
$ grep -o 'styles\.[A-Za-z0-9_]*' src/app/components/CartridgeDropPanel.tsx | sort -u | wc -l
14
```

| # | Assertion | Instrument | Direction of failure |
|---|---|---|---|
| R5a | the exact multiset of `on[A-Z]...=` attribute names matches the frozen one | `match(/\bon[A-Z][A-Za-z]*=/g)` tallied, compared to the frozen object | any new handler of any name -> RED. Deliberately over-broad: for a zero-interaction requirement, over-broad is the safe direction |
| R5b | the exact multiset of interactive element tokens matches the frozen one | as measured above | a new `Button`, `MenuItem`, `details`/`summary`, `Tooltip`, `IconButton` etc. -> RED, because it is not in the frozen set at all |
| R5c | the `styles.*` class names used in the file are exactly the frozen 14 | `match(/styles\.[A-Za-z0-9_]*/g)` as a Set, versus the frozen set | a NEW css class -> RED, which forces reuse of `styles.fieldHint` and keeps `page-module-css-classes.test.ts` and `page-module-css-orphan-classes.test.ts` green by construction rather than by luck |

The frozen 14, re-measured: `card, courseScheduleTable, error, field, fieldHint,
fileField, form, ghBadgeAccent, ghBadgeDanger, ghBadgeSuccess, ghBadgeWarning,
loadingState, loadingTitle, spinner`. `.fieldHint` exists in
`src/app/page.module.css` (`grep -c '^\.fieldHint' src/app/page.module.css` ->
1), so R5c's requirement is satisfiable with no CSS edit.

**Sabotages.**

| Mutation | Expected | Discriminates? |
|---|---|---|
| Add a `<Button size="small">Why?</Button>` to the row | R5b RED (`<Button` count 4 -> 5) | YES |
| Add `<details><summary>Rubric source</summary>...</details>` | R5b RED (`details` is not in the frozen set) | YES |
| Render the disclosure with a new `styles.rubricOrigin` class | R5c RED, and `page-module-css-classes.test.ts` RED too | YES, twice - do not bank as two kills |
| Add an `onMouseEnter` tooltip trigger | R5a RED | YES |
| Render the disclosure as plain text inside the existing `<td>` | GREEN on all three, and correct | Confirms the instrument does not block the intended implementation |

**What R5's proxy CANNOT catch, said out loud.** A disclosure that renders
off-screen, requires a scroll, or overflows the cell costs the instructor
effort that no source-text count can see. A40-D1.

---

## 4. Executable here versus ARGUED

**Executable, and proven so by running it (section 3 pastes):** R1a-R1e,
R2a-R2f, R3's eleven-case table, R3e, R3g-1 through R3g-5, R3h, R4a-R4j,
R5a-R5c.

**ARGUED, not verified - labelled as argued, asserted nowhere as measured:**

- That the disclosure is LEGIBLE and lands where the instructor is looking.
  Nothing renders. Argued from RULING 105's reasoning and from the row's
  persistence; never observed. A40-D1.
- That the drop row is on screen when the instructor returns after the
  auto-grade navigation. `docs/a40-check.md` B3 traced the unmount chain from
  source; I re-read the chain's endpoints and did not re-derive the whole path.
  **Argued, and it is the premise of the whole design.** The check did not
  re-derive it either and recorded that; so it has now been carried, unverified,
  through three artifacts. A40-D1 covers observing it; nothing here proves it.
- That the row copy reads as a disclosure rather than as noise to a real
  instructor. Copy quality is not a test subject here. The COPY PRINCIPLE in
  section 2 (say what the caption says) is the substitute, and it is a reading
  claim.
- That `componentStorageKeys.structure.test.ts` will not be disturbed. Argued
  from its scan pattern and the planned copy containing no `ta-` token; the gate
  run is what verifies it.

**No longer argued, and this is the round-2 change:** the `handleFileSelect`
callsite. Round 1 listed it here and in the residual register. It is now
R3g-1..R3g-5, executed against one correct and five wrong implementations.

---

## 5. What has no honest test instrument, and is an OWNER VERIFICATION instead

Named here rather than dressed as a test, per the seat's standing rule.

- The rendered markup, focus order, and the cell's overflow behaviour. A40-D1.
- Whether the instructor is looking at the drops table at the moment the
  disclosure would inform a decision. A40-D1.

**Two items moved OFF this list in round 2.** The panel callsite is now
executable (R3g). The `rubricOrigin` form-caption defect is already fixed and
tested in the tree (RULING 111, section 0), so it is not an owner verification -
it is done.

---

## 6. Gate

Multi-path runs use the wrapper. `npm run test:paths` **refuses with exit 1 and
runs nothing if any path is absent** - verified in source at
`src/tools/vitest-paths/cli.ts:36`, which returns
`{ exitCode: 1, lines: ["PRE-CHECK FAILED", ...] }` before `deps.runVitest` at
`:43`. So the two lists below are separate on purpose, and a raw multi-path
`vitest`/`npm test` is never used: that form drops any argument it does not match
and still exits 0.

**Existing paths - 17, all verified present at `ceab414`** (per-path `[ -f "$p" ]`
loop, `OK=17 MISS=0`):

```
npm run test:paths -- \
  src/supabase-migrations.structure.test.ts \
  src/app/components/CartridgeDropPanel.reorder.test.ts \
  src/app/components/componentStorageKeys.structure.test.ts \
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

**New paths, which DO NOT EXIST YET** (verified absent at `ceab414`). Adding them
to the command above before they are written makes the whole run refuse. Add them
once created:
`src/lib/grade/rubric-origin.test.ts` (R3's table, R3g, R4),
`src/lib/cartridge-drops.origin.test.ts` (R1, R2, R3e).
The new source module `src/lib/grade/rubric-origin.ts` is also absent.

Why each existing path is in the gate, since a gate nobody can justify gets
trimmed by the next agent:

| Path | Why |
|---|---|
| `supabase-migrations.structure.test.ts` | whole-directory walker; **auto-includes the new migration** and is the only apostrophe/lexical check before an unattended production apply. Its own checks are at `:142-165` |
| `CartridgeDropPanel.reorder.test.ts` | **RULING 106's five-field source-order guard (`:57`) AND RULING 111's `setRubricOrigin(null)` block assertions (`:85-132`)**. Round 1 named RULING 107 here; RULING 107 was superseded by RULING 109 and its canary has moved. The disclosure must disturb neither - and R3g's anchors sit in the same `handleFileSelect` body that RULING 111's success-reset anchor slices |
| **`componentStorageKeys.structure.test.ts`** | **ADDED in round 2 (MAJOR-3).** Non-recursive directory-wide `ta-` exact-key-set canary over `src/app/components/*` non-test `.ts`/`.tsx` (`:101-116`), which INCLUDES `CartridgeDropPanel.tsx`. Its pattern `/(?<![a-zA-Z0-9_])ta-[a-z0-9-]*[a-z0-9]/g` is quote-free by design (RULING 110 found the quoted-only version under-counted), so **any `ta-`-looking substring in new copy is in scope** and `expect(keys).toEqual(EXPECTED_TA_KEYS)` at `:235` goes RED. The planned copy contains no such token, so the practical risk is low - the reason it belongs in the gate is that it is a READER of the file being changed, and round 1's justification for a path it did not include was factually wrong |
| `rubricProvenanceLeaf.test.ts` | `readFileSync`s the panel and index-scans the `id="cartridge-rubric"` TextField tag for `maxRows` (`:86-89`). Also holds the three REJECTED copy spellings at `:58-62` |
| the two css walkers | population includes every `.tsx` importing a discovered stylesheet; the panel imports `page.module.css`. **`page-module-css-orphan-classes.test.ts:422` does `fs.writeFileSync(DOCS_ORPHANS_PATH, ...)`, so `docs/css-orphans.md` will show modified after the run - expected, not an overreach.** Do not run that walker outside the wave's own gate window |
| `rubric-memory.test.ts` | **R4h and S5 change this module's exports.** Its 137 lines cover `describeRubricOrigin` for `upload:` (`:83`) and `cartridge:` (`:116`); the humaniser's behaviour must not drift while it is being exported |
| `submission-archive-sniff.test.ts` | already asserts `mergeSniffedValues` current-wins (`submission-archive-sniff.ts:74`), which C8's ordering is derived from |
| `steps.grading-cartridge.test.ts` | the server path must be UNCHANGED; this is the canary that no column was needlessly threaded to it. `steps.grading-cartridge.ts:96-97` reads `takeResult.rubricText` |
| `client-state-sweep.registry.test.ts`, the three `canvas-client-boundary` walkers, `module-graph/runtime-import-graph.test.ts` | population auto-includes a new `src/lib/**` module reachable from a client component - which `rubric-origin.ts` will be |
| `file-size-ceiling`, `no-emojis`, `source-bytes` | whole-tree walkers; new copy is new text. `no-emojis` owns the emoji rule - do not hand-roll a scan. The panel is 613 lines against a 1000-line ceiling, so the disclosure has room, but re-check after the edit |

Plus, per the standing gates: `npx tsc --noEmit`, `npm run lint` (exit 0, no NEW
warning in the touched files), and `npm run build`'s compile line. **Run them
against a `git status --short` taken at the implementer's OWN start** - lint
warning counts and tsc are shared under concurrency, and `npx tsc --noEmit` has
exactly one legal caller because it races on `tsconfig.tsbuildinfo`.

One specific tsc note: a `/s` (dotAll) regex passes vitest and FAILS tsc with
TS1501. Nothing above needs one; if the migration parser reaches for one, use
`[\s\S]` instead. Grep the test diff for `/s` and `/gs` before the type gate.

---

## 7. Residual register

Owner, instrument and step for each. Anything missing one of the three is a
deletion and is called that.

**DELETED in round 2, with the reason:**

- **A40-D2** (the `handleFileSelect` callsite). **Deleted, not softened**
  (RULING 114). It was filed as having no executable instrument. It has five:
  R3g-1 through R3g-5, executed against one correct and five wrong
  implementations, on the shape `CartridgeDropPanel.reorder.test.ts:76-132`
  already uses on the same handler.
- **A40-D3** (the `rubricOrigin` form caption outliving its field). **Deleted:
  already fixed and already tested in the committed tree.** RULING 111 landed
  `setRubricOrigin(null)` at `CartridgeDropPanel.tsx:282` and `:293`, with three
  assertions and two standing canaries at `reorder.test.ts:85-132`. The round-1
  residual's own evidence ("exactly one callsite", "three hits") is false against
  `ceab414`: `grep -n 'rubricOrigin\|setRubricOrigin'` returns five hits and
  three `setRubricOrigin` callsites. An implementer following A40-D3 would have
  filed a backlog row for work already done.

**Open:**

| id | Residual | Owner | Instrument | Direction of failure | Step |
|---|---|---|---|---|---|
| A40-D1 | The disclosure is actually VISIBLE and legible on the drop row after an auto-grade navigation, and costs no click. No test here renders a component. R5a-R5c are a source-text proxy and nothing more. This also covers the unverified premise that the row is on screen when the instructor returns (`docs/a40-check.md` B3's unmount chain, argued through three artifacts and never observed). | Repo owner, in a real browser | Upload an archive with the rubric box empty; then upload one with a rubric restored from a DIFFERENT assignment; then upload a SECOND rubric-less archive for the same assignment (the C10 path). After each, return to the Grading tab's cartridge panel and read the drop row. Count interactions against `docs/a39-census.md` path H | Any claim that the instructor sees this, absent this walk, is a reading claim | The owner verification pass, alongside RES-A39-2 and A40-R4 which it extends |
| A40-D4 | Whether the cross-assignment fallback in `loadRubricMemory` should exist AT ALL. DECISION 16's own closing line leaves it open. | Repo owner | `docs/a40-check.md` B4's measured trace, which I re-read and did not re-run | A40 makes the fallback VISIBLE; it does not decide whether it is right | Unchanged by DECISION 16; carried, not re-filed |
| **A40-D5** (NEW) | The origin column stores `upload:<archiveName>` for a sniffed rubric (C7, RULING 115). That is the SAME namespace `GradingTab.tsx:232` and `:324` use as a rubric-memory STORAGE key. Today the column is write-then-render only, so nothing collides. If any later change feeds the column value back into `loadRubricMemory`, it will read GradingTab's namespace instead of the cartridge one and silently restore the wrong rubric. | The next agent that reads `rubricOriginScope` for anything other than rendering | `grep -n 'loadRubricMemory' src/app/components/CartridgeDropPanel.tsx src/lib/grade/rubric-origin.ts` - no occurrence may take the origin column value as its `scope` argument. Today: the origin module does not exist and the panel's only `loadRubricMemory` call takes `cartridgeRubricScope(...)` (`:128`) | Silent wrong-rubric restore, with every assertion in this document green - none of them reads the memory store | The diff review on whatever change first reads the column. Not A40's write set, and not an instrument A40 can usefully add, because the bad callsite does not exist yet |
| **A40-D6** (NEW) | A field added to `CartridgeDropsRow` that the insert never writes is invisible to every instrument here. R2a reads `Object.keys(captured[0])` - the INSERT PAYLOAD - not the Row type (MINOR-2), and `npx tsc --noEmit` accepts an unwritten optional Row field. For A40 specifically the hole is closed by R2b forcing `COL` into the insert; the general hole stays open. | Whoever next adds a column to `cartridge_drops` | Add the Row side explicitly: extract the `CartridgeDropsRow` field names from `src/lib/supabase/types.tables-a.ts:116-134` by source scan and compare to the migration column union, as a sibling of R2a. Constructible today; deliberately NOT in A40's scope because it asserts over a file A40 edits by one line | A Row field with no column: `select("*")` returns `undefined`, tsc believes the type, no test reads SQL. The same silent-green route `supabase-migrations.structure.test.ts`'s header records | A backlog row, to be taken by the next `cartridge_drops` column change |

---

## 8. Concurrency

Read-only against `src/` and `supabase/`. **One file written: this one.** Every
probe lives in the session scratchpad (`...\scratchpad\a40r2\` for this round,
`...\scratchpad\a40probe\` from round 1). Round 2 added `ref.mjs` (the 11-case
oracle, eight decider mutants, the R2f invariant, the R4 battery and the R4j
differential probe), `src.mjs` and `src2.mjs` (the R3f/R3g source instruments,
which read the REAL `CartridgeDropPanel.tsx` with `readFileSync` and splice
synthetic callsites into an in-memory STRING only). **No file under `src/` or
`supabase/` was created, edited or deleted, and no copy of one was written
anywhere.** No `git stash`, no `git add -A`, no `git checkout --`. No test suite
was run: `page-module-css-orphan-classes.test.ts` writes `docs/css-orphans.md`,
and running a gate is a write.

Tree state at the start of this revision, recorded so the implementer's gate is
compared against ITS start and not this one:

```
$ git rev-parse --short HEAD
ceab414
$ git status --short
?? docs/a39-wave4-build-check.md
```

`src/` and `supabase/` clean. The one untracked entry is a doc a live checker is
writing. **That is a different tree from round 1's**, which had eight modified
and eight untracked `src/` paths belonging to three live siblings - all since
committed in `ceab414`.

---

## 9. The four things the rulings and the check got wrong, with the command

Collected here because the brief asks for them in one place and because each was
found by EXECUTING an instrument rather than reading it.

| # | Claim | What the measurement shows | Command |
|---|---|---|---|
| 1 | RULING 114: freeze `saveScope` "at its measured occurrence count (it measured 3)" | **3 is RED against a correct implementation**, which has 4, because `currentScope: saveScope` is the right argument for the `currentScope` slot. **4 is DEFEATED** by a wrong build that re-calls `cartridgeRubricScope` inline in the `restored` slot and stays at 4. There is no correct number; the count is a spelling, not the fact | `node scratchpad/a40r2/src2.mjs` - `/\bsaveScope\b/g`: REAL 3, GOOD 4, BAD-1..4 5, BAD-5 **4** |
| 2 | RULING 114: "assert the slice ... does NOT match `/\bsaveScope\b/`" | **RED against a correct implementation** for the same reason. Rebuilt as two positive identifier pins (R3g-4, R3g-5) plus a uniqueness assertion (R3g-3), which kills all five wrong variants including the two-line one a narrowed negative regex misses | same run - `GOOD ... hasSaveScope=true`, so the negative clause fails the correct build |
| 3 | RULING 115: "the row copy is required to call an EXPORTED `describeScope`" | Option (a) stands, but **`describeScope` is ALREADY exported**, with an incompatible three-argument signature, and is re-exported through a second module. The export must take a non-colliding name (reference `describeRubricScope`) | `grep -rn 'export function describeScope' src` -> `src/lib/knowledge-overview-scope.ts:193`; re-export at `src/lib/knowledge-scope-context.ts:64` |
| 4 | The check: "M-F's kill credit must name C10/C11, not C1/C2" | **M-F is killed by all four** (C1, C2, C10, C11) - it deletes the guard outright. The true statement is that M-F's kills do not COVER M-H, which keeps the guard and dies only on C10/C11 | `node scratchpad/a40r2/ref.mjs` - `M-F ... 7/11  RED C1 RED C2 RED C10 RED C11` |

Two smaller wording corrections, same spirit: RULING 115's "`archive:` appears
nowhere in `src`" is true only of the scope-prefix LITERAL - the bare token
appears 11 times in prose (`grep -rn "archive:" src --include=*.ts --include=*.tsx | wc -l`
-> 11; `grep -rn '"archive:\|`archive:' src supabase` -> exit 1). And RULING
115's "`rubric-memory.test.ts` already covers its cases" is true INDIRECTLY, via
`describeRubricOrigin` at `:83` and `:116`; there is no direct test of the
humaniser, because it is private today. R4e and R4j become the first.

**Nothing in this section changes a ruling's decision.** RULING 112's two cases
and cross-field invariant, RULING 113's replacement sentence, RULING 114's
verdict that A40-D2 is a gap rather than a residual, and RULING 115's option (a)
are all applied as decided. What changed is three instruments and one kill
credit, each because running it showed it measuring something other than what it
claimed - which is the only kind of correction this seat is entitled to make
after the decision has been taken.
