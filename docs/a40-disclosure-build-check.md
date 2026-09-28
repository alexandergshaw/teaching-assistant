# A40 disclosure half: adversarial build check of `8708009`

Fresh checker. I did not author the build, the notes, or the rulings. Subject is
the as-built DISCLOSURE diff only; `docs/a40-reorder-build-check.md` owns the
reorder half and is not re-litigated here. Specification checked against:
`docs/a40-disclosure-test-notes.md` (1294 lines by `wc -l docs/a40-*.md`).

Tree state at the start and at the end of this check: `git status --short` prints
nothing, exit 0. Nothing under `src/` or `supabase/` was created, edited or
deleted. No `git stash`, no `git add -A`, no `git checkout --`. Every probe lives
in the session scratchpad (`...\scratchpad\a40chk\`: `probe.mjs`, `mut2.mjs`,
`r5gap.mjs`) and reads the real files with `readFileSync`, splicing mutations into
an in-memory string only.

---

## Verdict

**DEFECTIVE.**

| Severity | Count |
|---|---|
| Blocker | 4 |
| Major | 2 |
| Minor | 6 |
| Clean (attacked, found nothing) | 7 areas, listed in section 12 |

Two of the four blockers land on the SPECIFICATION and the RULINGS, not on the
implementer: BL1 is a gap the notes never instrumented, and BL2 is a state the
notes' own oracle case C9 requires. One lands on the ORCHESTRATOR's push
reconciliation (BL4). Only BL3 is the implementer's.

**Measurement discipline.** Every quantity below names the command that produced
it. Line counts are reported as the pair this repo requires:

| File | `wc -l` | PowerShell `@(Get-Content <path>).Count` |
|---|---|---|
| `src/app/components/CartridgeDropPanel.tsx` | 632 | 632 |
| `src/lib/grade/rubric-origin.ts` | 62 | 62 |
| `src/lib/grade/rubric-origin.test.ts` | 226 | 226 |
| `src/lib/cartridge-drops.origin.test.ts` | 281 | 281 |
| `src/lib/grade/rubric-memory.ts` | 162 | 162 |
| `src/lib/cartridge-drops.ts` | 158 | 158 |
| `supabase/migrations/20261025000000_add_cartridge_drop_rubric_origin_scope.sql` | 7 | 7 |

The two tools agree on all seven. The panel is 632 against a 1000-line ceiling.

**Gate runs I made myself, both through the wrapper, never a raw multi-path
`vitest`:**

```
npm run test:paths -- src/lib/grade/rubric-origin.test.ts src/lib/cartridge-drops.origin.test.ts \
  src/lib/grade/rubric-memory.test.ts src/app/components/CartridgeDropPanel.reorder.test.ts \
  src/supabase-migrations.structure.test.ts
  -> Test Files 5 passed (5) | Tests 66 passed (66) | EXIT=0
  -> COVERED lines printed for all five paths

npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts \
  src/file-size-ceiling.structure.test.ts src/app/components/componentStorageKeys.structure.test.ts \
  src/lib/submission-archive-sniff.test.ts
  -> Test Files 5 passed (5) | Tests 77 passed (77) | EXIT=0
  -> COVERED lines printed for all five paths
```

`rubric-origin.test.ts` reports 30 tests and `cartridge-drops.origin.test.ts`
reports 15, which independently confirms the shared-`it()` deviation reported in
section 5b (11 oracle + 5 R3g + 2 R3h + 8 R4 clauses + 1 R4i + 3 R5 = 30, i.e.
R4a and R4b are ONE test, not two).

I deliberately did NOT run `page-module-css-orphan-classes.test.ts` (it
`writeFileSync`s `docs/css-orphans.md`, which would dirty the tree), and did not
run `npx tsc --noEmit` or `npm run build` (the brief says skip unless needed, and
`tsc` races on `tsconfig.tsbuildinfo`). **So no type or build claim in this
document is mine; the commit message's are unverified here.** Said plainly per
the brief.

---

## 1. BL1 - the disclosure can be DELETED and every instrument stays green

**This is the silent-green failure the brief asks for, and it is the one the
notes never instrumented.**

The entire user-visible deliverable of A40 is two lines:

```
src/app/components/CartridgeDropPanel.tsx:577-580
                      <p className={styles.fieldHint}>
                        {describeDropRubricOrigin(drop.rubricOriginScope).text}
                      </p>
```

**Mutation R-DEL:** delete that `<p>` block, and drop the now-unused
`describeDropRubricOrigin` binding from the import at `:26` so lint's
`no-unused-vars` stays quiet. Result: the column is still written, the mapper
still reads it, and the instructor sees nothing, forever.

Executed (`scratchpad/a40chk/mut2.mjs`, which reads the real panel and mutates an
in-memory string):

```
REAL TREE 8708009                                 : ALL GREEN = true  (R3g block width 377)
MUT R-DEL disclosure <p> + import binding deleted : ALL GREEN = true  (R3g block width 377)
MUT mentions describeDropRubricOrigin anywhere? false
MUT styles.fieldHint remaining uses: 4
```

where "ALL GREEN" is the conjunction of every assertion in the item's own
instruments that reads the panel: R4i (`<th>`=5, `<td>`=5), R5a (handler
multiset), R5b (element multiset), R5c (`styles.*` set size 14), R3g-1..R3g-5
(the producer callsite), R3h (the memory write). All eleven clauses survive the
deletion.

**Why R5c does not catch it, measured rather than assumed:**

```
$ grep -o 'styles\.[A-Za-z0-9_]*' src/app/components/CartridgeDropPanel.tsx | sort | uniq -c
      5 styles.fieldHint     <- the disclosure is 1 of 5; removing it leaves 4, so the SET is unchanged
$ grep -o 'styles\.[A-Za-z0-9_]*' src/app/components/CartridgeDropPanel.tsx | sort -u | wc -l
14
```

**Population of everything else that could catch it, derived rather than
asserted.** Every test file that reads the panel at all:

```
$ grep -rln "CartridgeDropPanel" --include=*.test.ts src/ | sort
src/app/components/CartridgeDropPanel.reorder.test.ts
src/app/components/componentStorageKeys.structure.test.ts
src/app/components/grading-results/rubricProvenanceLeaf.test.ts
src/lib/course-lms-options.test.ts
src/lib/grade/rubric-origin.test.ts
```

Of those five, four assert facts R-DEL does not touch: field source order and
`setRubricOrigin(null)` (reorder), the directory-wide `ta-` key set
(componentStorageKeys), the `id="cartridge-rubric"` `maxRows` scan
(rubricProvenanceLeaf), the LMS option list (course-lms-options). The fifth is
A40's own, and its panel clauses are the eleven above. And the whole population of
references to the feature anywhere in `src/`:

```
$ grep -rn "rubricOriginScope\|rubric_origin_scope\|describeDropRubricOrigin" src/
  -> 4 hits in CartridgeDropPanel.tsx (:26 import, :272 producer, :287 write, :579 THE RENDER),
     the rest in cartridge-drops.ts, types.tables-a.ts and the two new test files
```

`:579` is the only consumer, and nothing asserts it exists.

**Where the defect lives.** The notes pin the PRODUCER callsite with five
anchored-slice clauses (R3g-1..5) precisely because round 1 had filed it as
unmeasurable and RULING 114 rejected that. The same instrument shape - a
block-anchored `indexOf` slice with a both-ends validity check - applies verbatim
to the consumer, and was never specified for it. `R4i` looks like the render-side
instrument but only counts columns; a table with 5 `<th>` and 5 `<td>` and no
disclosure passes it.

**Corrective rule.** Pin the consumer the way R3g pins the producer: anchor on the
drops-table row (the `{drop.courseLabel}` cell), assert both ends resolve, assert
the slice contains `describeDropRubricOrigin(drop.rubricOriginScope)` exactly once,
and bound the slice width. That is the identical rule that closed A40-D2.

**Class:** *unpinned callsite - a wiring fact with no source instrument.*
**REPEAT-OF-A40-D2's class** (the producer callsite, filed as unmeasurable in
round 1 and closed by RULING 114 with exactly this corrective rule). I am
labelling it REPEAT rather than inventing a new name, per the anti-gaming rule:
the same corrective rule fixes both, and the only difference is which end of the
data flow it is applied to. Calling it NEW would buy a round it has not earned.

**This lands on the notes, not the implementer.** The implementer built what the
notes specified and the notes specified no consumer pin.

---

## 2. BL2 - a drop that DOES carry a rubric renders "No rubric was included with this upload."

`null` in `rubric_origin_scope` is doing two incompatible jobs: "this drop carried
no rubric" and "this drop carried a rubric whose origin is not recorded". The copy
function asserts the first for both:

```
src/lib/grade/rubric-origin.ts:58-60
  if (!originScope) {
    return { present: false, text: FROZEN_NO_RUBRIC };
  }
```

and the render is unconditional (`:579` renders `.text` for every row). Two
reachable states produce a FALSE sentence on a row whose `rubric_text` is
non-empty.

**Instance (a): the notes' own oracle case C9.** C9 is
`rubricText: "TYPED", currentScope: "", expected: null`
(`src/lib/grade/rubric-origin.test.ts:42`). `currentScope` is `saveScope`, and
`cartridgeRubricScope` returns `""` unless BOTH labels are non-blank
(`CartridgeDropPanel.tsx:41`). The upload is not gated on the labels - the file
input is only `disabled={loading}`:

```
src/app/components/CartridgeDropPanel.tsx:491-498
            <input ref={fileInputRef} id="cartridge-file" type="file"
              accept=".zip,.imscc,application/zip"
              onChange={handleFileSelect} disabled={loading} />
```

and `handleFileSelect` guards only `if (!file || !user)`. The rubric is persisted
regardless (`rubricText: effective.rubricText` is passed unconditionally at
`:288`). So: paste a rubric, leave Assignment blank, upload. The row stores the
rubric and tells the instructor no rubric was included.

**Instance (b): every row that predates the migration.** The column is added
nullable with no default and no backfill - correctly, since the origin of a
historical rubric is unknowable, and R1's frozen body makes a backfill
`update` unrepresentable (sabotage S4). But `mapCartridgeDrop` maps that NULL to
`rubricOriginScope: null` (`src/lib/cartridge-drops.ts:156`), and `:579` then
prints the frozen no-rubric sentence on every pre-existing drop, including the ones
that did carry a rubric. Production has been accepting cartridge drops with a
rubric field since `20260825000000_create_cartridge_drops.sql`.

**Why no instrument sees either.** R2f's invariant is deliberately
one-directional: `payload[COL] === null || rubric_text is a non-empty string`
(`src/lib/cartridge-drops.origin.test.ts:225`). It forbids origin-without-rubric
and PERMITS rubric-without-origin, which is exactly both instances. The notes say
so explicitly ("R2f is the presence half") without noticing that the permitted
direction also produces a false sentence.

**Corrective rule.** The sentence's precondition must be the fact it asserts.
Either derive `present` from the drop's `rubricText` rather than from the origin
(`CartridgeDrop.rubricText` is already on the object at `cartridge-drops.ts:15`
and already at the callsite), or add a third state for
`rubricText != null && origin == null` ("Rubric included; source not recorded.").
Both are decisions about product copy, so this is a (b)-shaped disposal, not
another instrument.

**Class:** *a retrospective disclosure asserted in a state where it is false.*
**REPEAT-OF-RULING-113's class.** RULING 113 replaced
`"No rubric was included; the workflow generated one."` because it was false
whenever auto-grading is off. The corrective rule it applied - one clause, true in
every reachable state - is the same rule that fixes this, and the shipped sentence
fails it in two reachable states. Labelling this NEW would relabel to buy a round.

**This lands on the notes and on RULING 112/113's reasoning, not the implementer.**
C9's expected value is specified as `null`; the build matches the oracle exactly.

---

## 3. BL3 - R1e does not fail on the mutation it exists for

The notes specify R1e as "the filename sorts AFTER
`20261021000000_create_deck_template_files.sql` | string compare of basenames | a
lower counter -> RED". What shipped:

```
src/lib/cartridge-drops.origin.test.ts:92-99
  it("R1e: the filename sorts after 20261021000000_create_deck_template_files.sql", () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    expect(files).toContain(path.basename(NEW_MIGRATION_PATH));
    expect(files[files.length - 1] >= "20261021000000_create_deck_template_files.sql").toBe(true);
  });
```

The second assertion's subject is `files[files.length - 1]` - the LAST file in the
directory - not the new migration. On any tree whose last migration is at or after
the reference, it is true by construction, whatever the new file is called.

Executed (`scratchpad/a40chk/mut2.mjs`), mutating only the NAME in the file list
(the same rename an implementer makes when it picks the wrong counter, and it
updates `NEW_MIGRATION_PATH` to match, so the `readFileSync` still resolves):

```
R1e AS SHIPPED, real tree                          : true
R1e AS SHIPPED, new migration given a LOWER counter: true   <- the mutation R1e exists for
R1e AS SPECIFIED (basename of the NEW file vs ref) : false
last file on the mutated tree                      : 20261021000000_create_deck_template_files.sql
position of the mutated name in sort order         : 57 of 110 (files that would sort AFTER it: 53)
```

A migration named `20260826000000_...` - sorting before 53 others - passes R1e as
built and fails R1e as specified. **This is the only ordering guard on a file that
`.github/workflows/supabase-migrations.yml` applies to production unattended via
`supabase db push`**, and out-of-order local migrations are exactly what that
command refuses.

**Corrective rule.** Assert the object the direction-of-failure column names:
`expect(path.basename(NEW_MIGRATION_PATH) > REF).toBe(true)`.

**Class:** *an assertion that passes the mutation its own direction-of-failure
column names.* **REPEAT-OF-MAJOR-1's class** (the round-1 R4i, which asserted
`th === td` only and was satisfied by adding a column; corrected in round 2 by
freezing the quantity the framing claimed). Same corrective rule: bind the
assertion to the object or quantity it says it protects. The second instance of
this class in the same diff is MA1 below, so it is one class with two instances,
not two classes.

**Remedy is execution, not argument.** A one-line assertion repair is a step that
executes, and steps that execute are never capped.

---

## 4. BL4 - A40's residual register does not exist in `docs/BACKLOG.md`

The notes close with four open residuals (section 7): A40-D1, A40-D4, A40-D5,
A40-D6, each with owner, instrument and step. `DEV_LOOP.md` step 0 and
`iteration-caps.md` both rule that a residual which lives only in the authoring
artifact is a deletion with extra steps. Derived population, every id and every
distinctive phrase from their instruments, counted with `grep -ac` (the `-a` this
repo requires on that file):

```
$ for t in A40-D1 A40-D4 A40-D5 A40-D6 rubric_origin_scope rubricOriginScope; do printf '%-22s ' "$t"; grep -ac "$t" docs/BACKLOG.md; done
A40-D1                 0
A40-D4                 0
A40-D5                 0
A40-D6                 0
rubric_origin_scope    0
rubricOriginScope      0

$ for t in RES-A39-2 "C10 path" rubric-less loadRubricMemory CartridgeDropsRow; do printf '%-22s ' "$t"; grep -ac "$t" docs/BACKLOG.md; done
RES-A39-2              0
C10 path               0
rubric-less            0
loadRubricMemory       0
CartridgeDropsRow      0
```

Reading the A40 row itself (`docs/BACKLOG.md:106`) rather than trusting the grep:

- **A40-D4 IS present in substance.** The row's prose carries "STILL WITH THE
  OWNER: B4, whether the cross-assignment rubric fallback should exist at all".
  Kept, no finding.
- **A40-D1 is NOT.** The row does carry an OWNER/INSTRUMENT/STEP triple, but it is
  A39's ("pick a file with the rubric box still empty, then type a rubric, and
  check whether the resulting run reflects it") - the reorder claim, not A40-D1's
  three-upload walk ending in the C10 path. The one owner verification that could
  observe whether the shipped disclosure is legible at all is unrecorded.
- **A40-D5 (the `upload:` namespace shared with `GradingTab.tsx`'s rubric-memory
  storage keys) and A40-D6 (a `CartridgeDropsRow` field written nowhere) are
  absent entirely**, by id and by every phrase from their instruments. A40-D6 the
  notes explicitly route to "a backlog row, to be taken by the next
  `cartridge_drops` column change". There is no such row.
- **The R5b gap is recorded as prose, not as a residual.** The row says "AND IT
  FOUND A REAL GAP IN THE NOTES: ... That gap is open." No owner, no instrument,
  no step. By the rule the loop applies to everyone else, that is a deletion, and
  it should be called one.

**Class:** *a residual recorded only in the authoring artifact.* **NEW** in this
item's rounds. **This lands on the orchestrator's push reconciliation, not on any
seat.** Three of four residuals plus the one gap the implementer went out of its
way to find are, as of `8708009`, deleted while the push reported success.

---

## 5. The three self-reported deviations, judged

### 5a. The MUT_T / MUT_U mutants delete the import - MAJOR (MA2)

The notes' MUT_T and MUT_U are a SECOND parse that coexists with the retained
import; the notes' own battery shows them killed by R4j only, with R4h green,
because R4h "kills nothing ... only if it replaces the import". The implementer's
variants delete the import outright, which is why R4h also went red.

**Judgement: that is a DIFFERENT mutant, and it leaves the intended defect
unprobed.** A mutant that trips a strictly larger set of assertions is not
stronger evidence for R4j; it is evidence for R4h, which the notes already
concede is an identity that cannot discriminate. As reported, R4j - the only
assertion in the whole document able to detect a second humaniser - had never been
proven red by the mutation it exists for.

**I supplied the missing evidence rather than leaving it open**
(`scratchpad/a40chk/probe.mjs`, replicating the real humaniser and the copy
function, with the import RETAINED and a second parse used instead):

```
REAL              : R4j=true  R4e=true  text(cartridge:A|B|C)="Rubric from A|B / C."
MUT_T split-on-bar: R4j=false R4e=true  text(cartridge:A|B|C)="Rubric from A / B."
MUT_U lazy-group  : R4j=false R4e=true  text(cartridge:A|B|C)="Rubric from A / B|C."
```

R4j is sound and discriminates both coexisting second parses; R4e does not. The
finding is the invalid evidence, not a broken instrument, and it is now closed.

### 5b. R4a and R4b share one `it()` - MINOR, acceptable

`src/lib/grade/rubric-origin.test.ts:109-113`. The implementer's claim that both
still discriminate independently is TRUE, and the reason is ordering: the text
equality runs first, so MUT_P (`"Rubric: none."`) and MUT_Q (`"Rubric from ."`)
redden the block on line 111, and MUT_S (the lying flag) passes line 111 and
reddens line 112. Each mutant makes the block red via its own clause. The cost is
diagnostic granularity only, and the test name carries both ids. Accepted.

### 5c. The R5b gap is REAL - MAJOR (MA1), and a broader instrument was owed

Confirmed by execution, not by reading (`scratchpad/a40chk/r5gap.mjs`, splicing a
native disclosure widget into an in-memory copy of the real panel):

```
REAL TREE 8708009          : R5a=true R5b=true R5c=true R4i(th/td)=true  -> ALL GREEN = true
MUT R5-DETAILS (adds click): R5a=true R5b=true R5c=true R4i(th/td)=true  -> ALL GREEN = true
MUT contains <details>/<summary>: true
```

The instrument is `/<(Button|MenuItem|TextField|input)/g`
(`rubric-origin.test.ts:213`) - an enumerated list. `<details>`, `<summary>`,
`<Tooltip>`, `<IconButton>`, `<select>`, a lowercase `<button>` and a bare `<a>`
are all outside it, and a native `<details>` needs no handler, so R5a does not see
it either. A mutation that ADDS A CLICK - the precise subject of RULING 100 -
passes all three R5 assertions plus R4i.

**Judgement, in two parts.**

1. **Leaving the instrument as specified and filing the gap was the right call for
   the implementer.** It is not the seat that decides what is measured, and
   improvising a broader tag scan mid-build is how an instrument stops matching
   the document that justifies it.
2. **But the notes owed a broader instrument, and the gap is the SAME class as
   BL3.** R5b's framing sentence in the notes reads "Build the exact multiset of
   interactive tokens present ... Any NEW token, of any kind, is outside the frozen
   set and fails - the 'make the bad state unrepresentable' shape rather than a
   list of banned things." The instrument is a list of four names. That is
   MAJOR-1's mechanism verbatim: the framing overclaims while the assertion states
   a narrower truth, and the sabotage table then banks a kill
   ("Add `<details><summary>...` -> R5b RED") that the instrument cannot make. The
   cheap fix exists and is a KIND change, not a longer list: tally EVERY JSX tag
   (`/<[A-Za-z][A-Za-z0-9]*/g`) and freeze that multiset, which makes a new token
   of any kind red by construction.

---

## 6. Attack 2 - does the origin record the scope the rubric ACTUALLY came from?

**Yes. This is the one thing A40 exists to get right, and it is right.** Traced
end to end, on the shipped files:

1. `loadRubricMemory` returns the ACTUAL scope, not the requested one. The exact
   branch returns `{ entry: exact, scope }`; the fallback branch returns
   `{ entry, scope: savedScope }` from the map iteration
   (`src/lib/grade/rubric-memory.ts:113-124`). `LoadedRubricMemory`'s own doc
   comment states it (`:82-86`).
2. The restore effect retains that scope alongside the text:
   `lastRestoredRubricRef.current = { rubric: loaded.entry.rubric, scope: loaded.scope }`
   (`CartridgeDropPanel.tsx:139`). The ref changed shape from `string | null` to
   `{ rubric, scope } | null` (`:81`) and the `untouched` sentinel was updated to
   `?.rubric` (`:134`), so A39's overwrite protection is intact.
3. The callsite passes the RETAINED value into the `restored` slot and the current
   one only into `currentScope` (`:272-278`):
   `restored: lastRestoredRubricRef.current`, `currentScope: saveScope`.
4. The decider returns `restored.scope` when the text still matches
   (`rubric-origin.ts:41-43`), ahead of the sniff branch and ahead of the
   `currentScope` fallthrough.

**The convenient wrong answer the brief names - reaching for the `saveScope`
variable already in scope - is M-B, and it is killed twice**: by oracle cases C5
and C8 (`rubric-origin.test.ts:38,41`) and by R3g-4's positive pin on the
`restored:` slot (`:80`). I re-derived the ordering premise rather than inheriting
it: `submission-archive-sniff.ts`'s current-wins rule is what makes the restored
branch outrank the sniffed one, and `submission-archive-sniff.test.ts` (46 tests,
green in my run) is its enforcer.

One ordering nuance I checked and it holds: `setCourseLabel`/`setAssignmentLabel`
run before the decider (`:245-246`), so the restore effect could in principle
re-run and overwrite the ref mid-handler. It cannot change the answer - the effect
runs after the commit, while `handleFileSelect` proceeds synchronously to the
decider, and in the only case where the labels actually change, the retained scope
is still the scope the text came from. Clean.

---

## 7. Attack 1 - the migration

**Independently verified, and it is sound.** Full body, all 7 lines
(`@(Get-Content).Count` = 7, `wc -l` = 7):

```sql
-- Cartridge drops: track which scope (a course/assignment pair, or an
-- uploaded archive) the persisted rubric text actually came from, per
-- DECISION 16 - the drop row discloses presence plus origin. Additive only;
-- safe to re-apply.
-- Written idempotently.

alter table public.cartridge_drops add column if not exists rubric_origin_scope text;
```

- **One statement, additive, nullable, no default, no destructive verb.**
  Confirmed by reading, and R1b/R1c pin it by equality against a frozen literal.
- **Re-applying it genuinely no-ops.** `add column if not exists` is a catalog-only
  change; with no default there is no table rewrite even on a large table, and a
  second apply is a no-op notice rather than an error. Nothing in the file is
  order-dependent or data-dependent.
- **It sorts after every existing migration.**
  `ls supabase/migrations/ | sort | tail -1` returns
  `20261025000000_add_cartridge_drop_rubric_origin_scope.sql`;
  `ls supabase/migrations/*.sql | wc -l` returns 110 (109 before this commit,
  matching the notes' measurement).
- **No interaction with the table's constraints or policies.** The only CHECK
  constraints on `cartridge_drops` are on `lms` and `status`
  (`20260825000000_create_cartridge_drops.sql:16-17`); the four RLS policies and
  the four storage-object policies are all row-scoped on `auth.uid() = user_id` or
  `bucket_id`, with no column lists anywhere, so a new column inherits them with
  no grant work. `listCartridgeDrops` uses `select("*")`, so it picks the column up
  with no query change.
- **`grep -rln "cartridge" supabase/migrations/` returns 3 files**, and the third
  (`20260827000000_grading_drafts_source.sql`) does not touch this table's shape -
  so there is no later migration whose assumptions this one could break.

Two operational findings ride on it, both minor, in section 8.

---

## 8. Minors

**MI1 - R5c shipped as a cardinality assertion where the notes specify set
membership.** The notes: "the `styles.*` class names used in the file are exactly
the frozen 14 ... as a Set, versus the frozen set", with the 14 names written out.
What shipped is `expect(found.size).toBe(FROZEN_STYLE_CLASS_COUNT)`
(`rubric-origin.test.ts:224`). The stated direction of failure ("a NEW css class
-> RED") therefore holds only when no existing class disappears in the same edit;
a swap keeps the size at 14 and passes. Unreported deviation. For A40's own likely
mutation (adding `styles.rubricOrigin` while `fieldHint` stays) the count does go
to 15 and red, which is why this is minor rather than major.

**MI2 - the migration counter skips 20261022, 23 and 24.** This repo's convention
is strictly +1: `git log --diff-filter=A --name-only -- supabase/migrations/`
shows `...21`, `...20`, `...19`, `...18` on consecutive feature commits. The new
file is `...25`. It sorts last, so today's apply is fine. The hazard is the gap:
`supabase db push` refuses local migrations that sort before the last applied one,
and R1e's own reference pins `20261021000000` as the file to sort after - so a
future agent following that reference picks `20261022000000` and gets a failed
unattended production apply. One-character fix, and worth taking before anyone
else writes a migration.

**MI3 - the deploy window.** The Vercel build and
`.github/workflows/supabase-migrations.yml` both trigger on the same push to main,
and the Action does `supabase link` then `supabase db push` after installing a
pinned CLI. Until it finishes, the deployed client sends
`rubric_origin_scope` in EVERY insert (`cartridge-drops.ts:70`, unconditional even
for a rubric-less drop), so every cartridge upload in that window fails with a
PostgREST unknown-column error, surfaces as "Could not upload cartridge." and has
its storage object removed (`:75-79`). This is a repo-wide pattern across 110
migrations rather than an A40 regression, so it is not a blocker - but it is the
first time the item's own artifacts could have named it, and none of them do.

**MI4 - two non-discriminating assertions are not labelled.** The notes mark R4d
as "no mutant in this battery; kept as the explicit statement of
'distinguishable'". The test file labels C4 (`:35-36`), R4f (`:141-144`), R4g
(`:150-151`), R4h (`:162-163`) and R3h (in its describe name) honestly and
accurately - and does NOT label R4d (`:121`). R1e should now carry the label too,
for the reason in BL3. No non-discriminating assertion is presented as a kill
anywhere, so this is completeness, not misrepresentation.

**MI5 - the form placeholder still promises what RULING 113 proved false.**
`CartridgeDropPanel.tsx:482` still reads
`"Paste a rubric or grading criteria. If blank, the workflow will generate one."`
RULING 113's whole argument is that this claim is false when no enabled
auto-grade trigger exists, which is the default state. The ruling treated the
placeholder as acceptable because it is forward-looking and conditional - but its
condition is "if blank", not "if auto-grading is on", so as written it promises
generation to an instructor who has never turned it on. **This lands on RULING
113**: it established the truth condition, moved the row's copy, and left the
sentence that carries the falsehood in place with no residual filed. Out of A40's
write set as scoped; unrecorded is the finding.

**MI6 - `present` has no production consumer.** The render uses
`describeDropRubricOrigin(...).text` only (`:579`); `present` is read solely by the
tests. R4b's kill (MUT_S, "the `present` flag lies") therefore protects a field
nothing in the product reads. Not wrong - the flag is the honest way to make the
branch assertable without parsing prose - but it should not be counted as coverage
of a user-visible fact.

---

## 9. Attack 4 - the frozen no-rubric sentence

**Sound.** The shipped literal is
`"No rubric was included with this upload."` (`rubric-origin.ts:21`), which is the
true sentence: it carries the presence fact and makes no claim about a workflow.
It is pinned by string EQUALITY in two places - `expect(result.text).toBe(FROZEN_NO_RUBRIC)`
(`rubric-origin.test.ts:111`) and, independently, as a bare literal in the
end-to-end test (`cartridge-drops.origin.test.ts:279`), so a silent edit of the
exported constant alone does not slip through. Nothing in the diff reintroduces
the generation promise:

```
$ grep -n "workflow will generate\|If blank" src/app/components/CartridgeDropPanel.tsx
482:            placeholder="Paste a rubric or grading criteria. If blank, the workflow will generate one."
```

one hit, pre-existing, unmodified by this commit, and it is MI5.

The one thing the frozen sentence does NOT cover is the state where it is false -
BL2. A frozen literal pins a defect exactly as hard as a requirement, which is the
notes' own lesson, and BL2 is that lesson recurring one level up: the sentence is
now correct and its PRECONDITION is wrong.

---

## 10. Attack 5 - the renamed export

**Sound, all three clauses.**

- **No behaviour changed.** `git show 8708009 -- src/lib/grade/rubric-memory.ts`
  shows exactly two changed lines: `describeScope(` -> `describeRubricScope(` at
  the single call site, and `function` -> `export function` on the declaration
  (plus a 5-line comment). The body - the `upload:` branch, the greedy
  `^cartridge:(.*)\|(.*)$` branch, the passthrough - is untouched, which matters
  because R4j depends on the greedy first group.
- **Every former caller still resolves.** The function was private, so its callers
  were confined to the module; `grep -rn "describeRubricScope" src/` shows the one
  former call at `rubric-memory.ts:134` inside `describeRubricOrigin`, plus the new
  import and use in `rubric-origin.ts:16,61`. `rubric-memory.test.ts` (7 tests,
  green in my run) covers `describeRubricOrigin` for both prefixes and is
  unchanged.
- **No collision of its own.** The only near-name in the tree is a module-local
  `describeRubricScopeHint` at
  `src/app/components/repo-grades/RepoGradesControls.tsx:158` - a different
  identifier, not exported, in an unrelated module. The colliding name the notes
  reached for is confirmed still taken: `describeScope` is exported from
  `src/lib/knowledge-overview-scope.ts:193` with a three-argument signature and
  re-exported through `src/lib/knowledge-scope-context.ts:64`.

---

## 11. Attack 6 - non-discriminating assertions

**Honest, with one omission (MI4).** The labels the commit message claims - one
case, two clauses, an identity - are present and accurate: C4 at `:35-36` with the
right reason (restored scope and current scope are the same string), R4f at
`:141-144` naming its real discriminator (R3 C5/C8), R4g at `:150-151` naming the
failure it caused (it let MUT_P and MUT_Q through), R4h at `:162-163` correctly
called an identity. R3h is labelled a regression canary in its describe name
(`:88`). No assertion is presented as coverage it does not have. R4d is unlabelled,
and R1e now needs a label; both are MI4.

---

## 12. Attacks that found nothing

Listed because a check with no attempted attacks is not a check.

1. **The migration.** Body, idempotency, sort position, table constraints, RLS and
   storage policies, and whether a later migration touches the same table.
   Section 7. Sound.
2. **The attribution chain** - whether the value reaching the write is the retained
   scope or the current one, traced through four files rather than read off the
   callsite. Section 6. Sound, and this is the item's whole point.
3. **The renamed export** - behaviour, callers, collisions. Section 10. Sound.
4. **The frozen sentence** - is the shipped literal the true one, pinned by
   equality, and unreintroduced elsewhere. Section 9. Sound.
5. **The feature-already-exists case, argued at its strongest.** A39 already
   computes the true origin string and already renders it, via
   `describeRubricOrigin` and the `rubricOrigin` state - so A40 reads like the same
   sentence moved to a different surface. **The case fails, and the reason is
   RULING 111**: that caption is cleared on both the success reset and the error
   path (`CartridgeDropPanel.tsx:282`, `:293`), by the very upload whose row A40
   labels, and it was never persisted. Nothing durable existed. The reframing worth
   keeping is that A40 is a DURABILITY feature, not a disclosure feature - which is
   also why BL1 bites: the durable half shipped and the visible half is unguarded.
6. **R4j's soundness** - proven red against both coexisting second parses by my own
   probe (section 5a), which is the evidence the build's own mutants did not
   supply.
7. **The gate shape.** Both of my runs used `npm run test:paths --` and both
   printed a COVERED line for every path; the notes' 19-path gate uses the wrapper
   and cites `src/tools/vitest-paths/cli.ts:36` for the refuse-on-missing-path
   behaviour. I found no raw multi-path `vitest` or `npm test` in the diff or in
   the notes' gate section. The emoji rule was left to
   `src/lib/no-emojis.test.ts` (18 tests, green) and not hand-rolled; `grep -P` was
   not used anywhere in this check.

**The weakest requirement, as the brief asks: R5, zero added interactions
(RULING 100).** Implemented exactly as written it still produces a bad result. A
source-text tally cannot see a hint line that overflows the cell, wraps to three
lines on every row, or renders below the fold - and, as section 5c proves by
execution, it cannot see a native `<details>` that adds the very click the ruling
forbids. The notes label it a proxy and file A40-D1, which is the right shape; the
failure is that A40-D1 then did not reach the backlog (BL4).

**No disposition table was owed.** This is the build activity, not a restructuring
round of the notes; nothing prior was reorganised.

---

## 13. Stopping point

**What remains: RULINGS, plus one measurement repair and one bookkeeping repair.**

- **Rulings.** BL1 and BL2 are decisions, not seat revisions. The notes have had
  their two rounds, so per `AGENTS.md` "Two rounds, then ask" neither goes back to
  the test-author. BL1 needs a ruling on whether the consumer callsite gets the
  R3g treatment before anything else lands in this panel. BL2 needs a product call
  on what a row says when `rubric_text` is present and the origin is null - branch
  `present` on `rubricText`, add a third sentence, or accept the false sentence and
  record it - and the answer must terminate the activity rather than open another
  round. Both questions are shaped so every answer ships the artifact as it
  stands.
- **Measurement.** BL3 (R1e's subject) and MA1's cheap fix (tally every JSX tag
  rather than four names) are instrument repairs. Those execute; they are not
  argument and are not capped.
- **Bookkeeping.** BL4: A40-D1, A40-D5, A40-D6 and the R5b gap need rows in
  `docs/BACKLOG.md` with owner, instrument and step, or they are deleted.
- **Nothing** remains on the decider, the migration, the rename, the frozen
  sentence, or the attribution chain. Those are the load-bearing parts and they
  are correct.

**What I did not check, and why.**

- `npx tsc --noEmit` and `npm run build` - not run, per the brief (tsc races on
  `tsconfig.tsbuildinfo`). The commit's tsc, lint and build claims are unverified
  here.
- The full suite - not run. I ran 10 paths (143 tests, two wrapper invocations,
  both exit 0); the brief's 1146 files / 22994 tests figure is not mine.
- `page-module-css-orphan-classes.test.ts` and
  `page-module-css-classes.test.ts` - deliberately not run; the first writes
  `docs/css-orphans.md` and would dirty the tree.
- Anything rendered. Nothing in this repo renders a component under vitest, so
  every claim here about what the instructor SEES on the drop row - including the
  `<p>` inside the `<td>`, the `fieldHint` styling in a table cell, and the row
  being on screen after the auto-grade navigation - is a reading claim. **A40-D1
  stays open and this document closes no part of it.**
- Whether production actually holds `cartridge_drops` rows with a non-null
  `rubric_text` (BL2 instance b). I cannot query production. What I verified is
  that the render is unconditional and the mapper passes NULL through, so IF such
  rows exist the false sentence appears on them - which is why BL2 is filed on the
  code path rather than on a row count.
