# Adversarial check: docs/a40-disclosure-test-notes.md

Fresh `loop-checker`. Did not author the notes. Round 1 of at most two.
Read-only against `src/`, `supabase/` and the notes doc. **One file written:
this one.**

**VERDICT: DEFECTIVE.** 4 blockers, 3 major, 4 minor. The notes are unusually
strong on instrument construction - the two rebuilds they report are real, both
frozen literals are honestly derived, the 16-path gate is real and correctly
segregated, and every precedent citation I opened was accurate. The defects are
concentrated in three places: the R3 case table misses a reachable state that
routes straight to DECISION 3's defect, the frozen no-rubric copy asserts
something false in the default configuration, and the doc's own named
silent-green residual (A40-D2) is filed as unmeasurable while the exact
measuring technique is live in a file the notes already put in their gate.

---

## Instruments used for this check

| Quantity | Command | Result |
|---|---|---|
| notes length | `wc -l docs/a40-disclosure-test-notes.md` | 737 |
| notes length | `@(Get-Content 'docs/a40-disclosure-test-notes.md').Count` | 737 |
| panel length at check start | `wc -l src/app/components/CartridgeDropPanel.tsx` | 603 |
| panel length ~20 min later | same command | **613** |
| panel length | `@(Get-Content 'src/app/components/CartridgeDropPanel.tsx').Count` | 613 |
| `src/lib/cartridge-drops.ts` | `wc -l` / `@(Get-Content).Count` | 151 / 151 |
| `src/lib/grade/rubric-memory.ts` | `wc -l` / `@(Get-Content).Count` | 157 / 157 |
| reorder test | `wc -l src/app/components/CartridgeDropPanel.reorder.test.ts` | **132** (notes say 94) |
| migrations | `ls supabase/migrations/*.sql \| wc -l` | 109 |
| last migration | `ls supabase/migrations/ \| sort \| tail -1` | `20261021000000_create_deck_template_files.sql` |

No test suite was run. Reason stated in the stopping point.

---

## 1. Population, re-derived with my own instrument

```
$ grep -rln 'cartridge-drops\|CartridgeDrop\b' src --include=*.ts --include=*.tsx; echo "EXIT=$?"
src/app/actions/workflow-support.ts
src/app/components/CartridgeDropPanel.tsx
src/app/components/WorkflowTriggerWatcher.tsx
src/lib/cartridge-drops.ts
src/lib/workflow-triggers/decisions.ts
EXIT=0                                                             <- 5 paths
```

The notes' correction to the orchestrator's brief is CONFIRMED: `\b` excludes
`CartridgeDropPanel`, and 5 paths is not the population.

```
$ grep -rln 'cartridge-drops\|CartridgeDrop' src supabase docs/backlog.yml; echo "EXIT=$?"
src/app/actions/workflow-support.ts
src/app/components/accommodations/AccommodationsPanel.tsx
src/app/components/CartridgeDropPanel.reorder.test.ts
src/app/components/CartridgeDropPanel.tsx
src/app/components/FilesTab.tsx
src/app/components/grading-recording/GradingRecordingPanel.tsx
src/app/components/grading-results/rubricProvenanceLeaf.test.ts
src/app/components/GradingTab.tsx
src/app/components/WorkflowTriggerWatcher.tsx
src/lib/cartridge-drops.ts
src/lib/course-lms-options.test.ts
src/lib/course-lms-options.ts
src/lib/grade/rubric-memory.ts
src/lib/supabase/types.tables-a.ts
src/lib/supabase/types.ts
src/lib/workflow-triggers/decisions.ts
src/lib/workflow-triggers/event-sources.ts
src/lib/workflow-triggers.roster.test.ts
src/lib/workflow-triggers.ts
src/lib/workflows/registry/steps.grading-cartridge.test.ts
src/lib/workflows/registry/steps.grading-cartridge.ts
supabase/migrations/20260825000000_create_cartridge_drops.sql
docs/backlog.yml
EXIT=0                                                             <- 23 paths, not 22
```

**Third writer or reader: NONE, and I checked with a pattern neither the brief
nor the notes used.** The notes' pattern cannot see the table name spelled with
an underscore. I ran that separately:

```
$ grep -rln 'cartridge_drops' src supabase | sort
src/app/actions/workflow-support.ts
src/lib/cartridge-drops.ts
src/lib/supabase/types.ts
supabase/migrations/20260825000000_create_cartridge_drops.sql

$ comm -13 <(grep -rln 'cartridge-drops\|CartridgeDrop' src supabase | sort) \
           <(grep -rln 'cartridge_drops' src supabase | sort)
                                                    <- empty: nothing new
$ grep -rlniE 'cartridge[-_]drops|cartridgedrop' src supabase | sort | wc -l
22
```

So the widened grep IS a superset for `src` + `supabase`, and the notes' two
write-set conclusions both hold:

- `src/lib/supabase/types.tables-a.ts` is required for R2. **CONFIRMED** -
  `grep -n 'CartridgeDropsRow' src/lib/supabase/types.tables-a.ts` -> `116:export
  interface CartridgeDropsRow {`.
- `src/app/actions/workflow-support.ts` must not be edited. **CONFIRMED** - both
  its selects are explicit column lists (lines 67 and 129 as the notes paste
  them), and `src/lib/cartridge-drops.ts:84` is the only `select("*")`, with the
  only mapper at `:133`, private, no `export`.

MINOR-1 below records the 22-vs-23 count.

---

## 2. What I verified and found SOUND (one line each, no padding)

- **`mapCartridgeDrop` is private.** `src/lib/cartridge-drops.ts:133`
  `function mapCartridgeDrop(row: ...)`, no `export`. The notes' refusal to
  export it, and their choice to drive `saveCartridgeDrop`/`listCartridgeDrops`
  instead, is correct.
- **The insert payload is exactly the 11 keys the notes pasted**
  (`src/lib/cartridge-drops.ts:53-65`), and `.insert(p).select().single()` matches
  the notes' write-path stub shape exactly.
- **17 create-table columns.** Counted by hand off
  `supabase/migrations/20260825000000_create_cartridge_drops.sql:9-25`. Matches.
- **`-- Written idempotently.`** is verbatim at that migration's line 6, so R1d
  reads a real string.
- **`extractCreateTableColumns` precedent is real AND bounded.**
  `src/lib/cron-heartbeat.test.ts:399`, with its canary describe at `:421`. It
  slices between `create table if not exists public.<t> (` and `\n);`, so it
  cannot over-extract from this migration's `check (lms in (...))` clause, its
  trailing `create index (...)`, or its `insert into storage.buckets (id, name,
  public)`. My over-extraction attack failed.
- **R1e's two quantities are right.** 109 migrations; last basename
  `20261021000000_create_deck_template_files.sql`.
- **R1a's rebuild is real and the reported failure is the real failure.**
  `!/\S\s*--/` over a whole file does match a comment line after a non-blank
  line, because `\s*` crosses `\n`. The per-line rebuild is sound, and it is the
  necessary companion to a line-based `strip`.
- **R4's rebuild is real and the reported defeat is the real defeat.**
  `"Rubric from ."` does satisfy injectivity over four inputs, "fallback names its
  own scope", and "no-rubric names no scope". Changing kind (frozen literal +
  `present` flag) rather than lengthening the property list is the right move and
  matches `docs/loop/traps-tests.md`'s construction-not-enumeration rule.
- **Both frozen literals are DERIVED, not invented, and neither is a
  tautology.** R1c's table name comes from the real base migration's
  `create table if not exists public.cartridge_drops (`; `add column if not
  exists` is the repo's stated convention (`src/lib/recording-files.kinds.test.ts:50-51`,
  quoted accurately). R4a's sentence is a past-tense restatement of the real
  placeholder, which I read verbatim in the panel: `"Paste a rubric or grading
  criteria. If blank, the workflow will generate one."` In both cases the test
  declares the literal and the implementation must match it - the implementation
  is not the source of the expectation. **Attack failed.** (R4a is defective for a
  different reason - BLOCKER-2.)
- **R1c and R1d do not contradict R1a.** A header comment on its own line is
  allowed; only a trailing comment is banned. Consistent.
- **The 16 gate paths ALL EXIST.** Verified with a per-path `[ -f ]` loop:
  16 OK, 0 MISS. The two new paths and the new source module are genuinely
  absent (`src/lib/grade/rubric-origin.test.ts`,
  `src/lib/cartridge-drops.origin.test.ts`, `src/lib/grade/rubric-origin.ts`).
- **The segregation is NECESSARY, and I verified the mechanism rather than
  trusting the claim.** `src/tools/vitest-paths/cli.ts:36` returns
  `{ exitCode: 1, lines: ["PRE-CHECK FAILED", ...] }` *before* `deps.runVitest`
  at `:43`. So a gate listing an absent path runs nothing. The notes are right to
  keep two lists.
- **No multi-path raw `vitest` anywhere in the doc.** The gate is
  `npm run test:paths -- ...`, `"test:paths"` exists in `package.json:21`. The
  drop-a-path-and-exit-0 trap is not present.
- **`"use server"` legality: no exposure.** `head -3` on
  `src/lib/cartridge-drops.ts`, `src/lib/supabase/types.tables-a.ts` and
  `src/lib/grade/rubric-memory.ts` shows zero `use server` directives, and no
  instrument requires exporting a constant or type from a server module. This
  attack failed.
- **Every R5 quantity still reproduces on the LIVE file at 613 lines**, which is
  a stronger result than the notes claimed:

```
$ grep -o 'on[A-Z][A-Za-z]*=' src/app/components/CartridgeDropPanel.tsx | sort | uniq -c
      6 onChange=
      4 onClick=
$ grep -oE '<(Button|MenuItem|TextField|input)' ... | sort | uniq -c
      4 <Button      4 <MenuItem      5 <TextField      1 <input
$ grep -o 'styles\.[A-Za-z0-9_]*' ... | sort -u | wc -l
14
```

  The frozen 14 class names match the notes' list exactly, and
  `grep -c '^\.fieldHint' src/app/page.module.css` -> 1, so R5c is satisfiable
  with no CSS edit.
- **The `<th>` counting trap reproduces exactly as recorded.**
  `grep -oE '<th[> ]' ... | wc -l` -> 5; `grep -o '<th' ... | wc -l` -> **6**;
  `grep -oE '<td[> ]' ... | wc -l` -> 5. (R4i is still defective - MAJOR-1.)
- **`mergeSniffedValues` is quoted correctly.**
  `src/lib/submission-archive-sniff.ts:74`:
  `const effRubricText = current.rubricText || sniff.rubricText || null;`
  C8's ordering derivation is legitimate.
- **The css-orphan side effect is honestly disclosed.**
  `page-module-css-orphan-classes.test.ts:422` really does
  `fs.writeFileSync(DOCS_ORPHANS_PATH, ...)`. Warning the implementer that
  `docs/css-orphans.md` will show modified is correct, not an overreach.
- **`steps.grading-cartridge.ts:96-97` really reads `takeResult.rubricText`**, so
  its inclusion as the "server path unchanged" canary is justified.
- **R5's proxy is honest about what it cannot see.** It says a click count is
  unmeasurable, labels itself a proxy, files A40-D1, and includes the
  self-check row ("render as plain text inside the existing `<td>` -> GREEN on all
  three, and correct") that a guard owes itself. No attack landed here.
- **Nothing in the doc relies on a component rendering.** Every UI-adjacent
  assertion is a `readFileSync` source-text assertion or a pure-function call.
  Verified by reading all 25 instrument rows.

---

## 3. Blockers

### BLOCKER-1. R3's nine-case table misses a REACHABLE state, and the state it misses is DECISION 3's defect with a worse twist

**Class: coverage by enumeration presented as coverage by construction**
(`docs/loop/traps-tests.md`, "an oracle covering 5 of 13 reachable states").
**NEW.**

The notes derive nine cases and call the restriction a construction: "the cross
product ... restricted to the combinations `mergeSniffedValues` can actually
produce." The `rubricText`-empty rows (C1, C2) both carry `restored = -`, i.e.
ABSENT. The table contains **no case where `rubricText` is empty and `restored`
is present.** That combination is reachable in the shipped panel:

1. Instructor fills course + assignment. The restore effect fires and sets
   `lastRestoredRubricRef.current = loaded.entry.rubric`
   (`src/app/components/CartridgeDropPanel.tsx`, the restore effect - cited by
   content per section 0).
2. Upload 1 runs. The reset block does `setRubricText("")`. **It does not clear
   `lastRestoredRubricRef`** - and it must not, because that ref is the
   `untouched` sentinel.
3. The restore effect does not re-run: its deps are `[courseLabel,
   assignmentLabel]`, both unchanged.
4. Upload 2, same assignment, archive with no rubric. `effective.rubricText =
   "" || null = null`. The decider is now called with `rubricText: null` and
   `restored: { rubric: R, scope: "cartridge:CS101|HW1" }`.

A decider that tests `restored` before the falsy guard - e.g.
`if (restored && (!rubricText || rubricText === restored.rubric)) return restored.scope;` -
**scores 9/9 on the frozen table** (C1 and C2 never exercise the guard with
`restored` present) and writes `rubric_origin_scope = 'cartridge:CS101|HW1'`
onto a row whose `rubric_text` is NULL. The drop row then reads
"Rubric from CS101 / HW1." for a drop that carried no rubric at all. That is
worse than DECISION 3's original defect: it does not merely name the wrong
assignment, it asserts a rubric that does not exist.

Nothing else catches it. R4a/R4b only exercise `describeDropRubricOrigin(null)`
and are fed a non-null scope here. R2a-R2e assert key membership and
round-tripping, never a relation between two fields. R3e drives C5 only. M-F
("the no-rubric guard deleted") is credited to C1 and C2, which is exactly the
credit this mutant escapes.

**The remedy is cheap and fully executable, which is why this is a blocker and
not a residual.** Two cases plus one cross-field invariant:

- C10: `rubricText: null`, `currentScope: cartridge:CS101|HW2`,
  `restored: {R, cartridge:CS101|HW1}`, `sniffed: -` -> expected **`null`**.
- C11: same with `restored: {R, cartridge:CS101|HW2}` -> expected **`null`**.
- **R2f (new):** over the captured insert payload from the real
  `saveCartridgeDrop`, assert
  `payload[COL] === null || (typeof payload.rubric_text === "string" && payload.rubric_text !== "")`.
  One line, drives the real writer, and it is the only assertion in the set that
  pins the presence half of "presence plus origin" against the data rather than
  against the copy.

Also fix the accounting: M-F's kill credit must name C10/C11, not C1/C2.

### BLOCKER-2. The frozen no-rubric copy states a false fact in the DEFAULT configuration, and freezing it makes that unfixable

**Class: a frozen literal asserting an unconditional past fact about a
conditional behaviour.** **NEW.**

`FROZEN_NO_RUBRIC = "No rubric was included; the workflow generated one."`

The second clause is a completed past-tense assertion. It is false whenever
auto-grading is off, which is the default state:

- `handleToggleAutoGrade` CREATES the `cartridge-uploaded` /
  `cartridge-grading` trigger on first use; before that, `findAutoGradeTrigger()`
  returns `undefined`.
- The panel renders `"Turn on auto-grading"` and the heading `"Automatic
  grading"` in that state, and the trigger can additionally be disabled
  (`updateWorkflowTrigger(..., { enabled: false })`).
- With no enabled trigger, the drop persists with `status: "new"` and no workflow
  ever runs. The row then tells the instructor a rubric was generated when none
  was.

The derivation is sound as far as it goes - the placeholder really says "If
blank, the workflow **will** generate one", and that is a forward-looking
conditional about a workflow the instructor has already opted into by the time
they read it. The row is retrospective and is read by an instructor who may never
have opted in. Turning "will, if you have it on" into "did" is where the
derivation breaks.

Because R4a is `text === FROZEN_NO_RUBRIC` by string equality, an implementer who
notices this cannot fix it. The oracle pins the defect in place. That is the
brief's "implemented exactly as written and still produces a bad result" clause,
and it is the clause I would name if asked for only one.

**Remedy:** freeze a sentence that is true in every reachable state and still
carries the presence fact, e.g. `"No rubric was included with this upload."` -
one clause, no claim about a workflow that may not have run. Keep the string
equality; only the string changes. If DECISION 16 is read as requiring the
generation promise, that is an owner question, not an implementer one, and it
must be asked before the literal is frozen rather than after.

### BLOCKER-3. A40-D2 is filed as unmeasurable while the exact instrument is LIVE in a file the notes' own gate already runs

**Class: a residual filed where an executable instrument of a shape the same
artifact already uses is available.** **NEW.**

A40-D2 says the `handleFileSelect` callsite "is inside a component and is
therefore a SOURCE READING, not an execution", assigns it to a diff review, and
instructs: "**Do not close it by citing R3e**". The instruction is right. The
premise is wrong.

`src/app/components/CartridgeDropPanel.reorder.test.ts` - which the notes
themselves put in the gate, and describe in section 0 - now carries a **RULING
111** block that does precisely this, on precisely this handler, in precisely
this file:

```
const successStart = SOURCE.indexOf("setDrops((prev) => [drop, ...prev]);");
const successEnd = SOURCE.indexOf('window.dispatchEvent(new CustomEvent(CARTRIDGE_DROP_UPLOADED_EVENT));', successStart);
...
it("finds both the success-reset block and the catch block by their own anchors - a check over -1 proves nothing", ...)
it("the success-reset block calls setRubricOrigin(null)", () => {
  expect(SOURCE.slice(successStart, successEnd)).toMatch(/setRubricOrigin\(null\);/);
});
```

Block-anchored source assertion, an anchor-validity self-check so a `-1` slice
cannot pass vacuously, and a standing sabotage canary in the same file. The notes
already accept this shape three times in R5a-R5c and once in R1d. Declaring it
unavailable for the one route the notes call "the silent-green route that
survives the whole gate" is an internal contradiction, and it leaves the highest
consequence item in the document with no instrument at all.

**The instrument, measured today:**

```
$ grep -c 'saveScope' src/app/components/CartridgeDropPanel.tsx
3
$ grep -n 'saveScope' src/app/components/CartridgeDropPanel.tsx
260:      const saveScope = cartridgeRubricScope(effective.courseLabel, effective.assignmentLabel);
261:      if (saveScope && effective.rubricText) {
262:        saveRubricMemory(RUBRIC_MEMORY_STORAGE_KEY, saveScope, { rubric: effective.rubricText });
```

So:

- **R3f.** `SOURCE.match(/\bsaveScope\b/g).length === 3` - re-pinned at build
  start, per the doc's own rule. A fourth occurrence is a `saveScope` reaching
  somewhere new, and the decider call is the only new place it can reach.
- **R3g.** Anchor the decider call:
  `const at = SOURCE.indexOf("resolveRubricOriginScope(")`, assert `at > -1`,
  slice to the matching `)`, then assert the slice matches
  `/restored:\s*lastRestoredRubricRef\.current/` and does NOT match
  `/\bsaveScope\b/`. Both directions, with the anchor self-check the RULING 111
  block already demonstrates.

This pins the FACT and the IDENTIFIER, not the wording, so it stays inside
`docs/loop/traps-tests.md`'s over-specification rule - and the notes have already
licensed identifier-pinning ("it must then use the SAME identifier in every
assertion", S1).

A40-D2 may remain in the register as the render-time half. It must not remain as
the callsite's only coverage.

### BLOCKER-4. C7 specifies an origin token nothing in the repo can render, and it contradicts R4h's own stated purpose

**Class: an oracle specifying a value the authorized write set cannot produce or
render.** **NEW.**

C7's expected value is `archive:hw2.zip`. Measured:

```
$ grep -rn "\"archive:" src            <- no output
$ grep -rn 'upload:' src --include=*.ts --include=*.tsx
src/app/components/GradingTab.tsx:232:    const loaded = loadRubricMemory(RUBRIC_MEMORY_STORAGE_KEY, `upload:${name}`);
src/app/components/GradingTab.tsx:324:            saveRubricMemory(RUBRIC_MEMORY_STORAGE_KEY, `upload:${uploadFileName}`, {
src/lib/grade/rubric-memory.test.ts:57,76,94,...
```

Three facts follow:

1. **`archive:` does not exist anywhere.** The repo's prefix for "the scope is a
   file the instructor supplied" is `upload:<name>`, already in use by
   GradingTab path A and already covered by `rubric-memory.test.ts`.
2. **Nothing can humanise `archive:`.** `describeScope` in
   `src/lib/grade/rubric-memory.ts:140-146` handles `^upload:(.*)$` ->
   `your upload of "X"` and `^cartridge:(.*)\|(.*)$` -> `X / Y`, and otherwise
   `return scope` - the raw token. `describeScope` is **private, not exported.**
3. **R4e demands a humanisation that no code produces:** `the archive "hw2.zip"`.
   That is a third spelling of a concept the repo already spells one way.

So the two available implementations both fail something. Reuse the existing
parse and `archive:hw2.zip` falls through to the raw token, which is exactly
MUT_R and R4e goes RED. Write a private second parse inside
`describeDropRubricOrigin` and the same scope shape is rendered two different
ways depending on which surface shows it - which is the drift **R4h exists to
prevent** ("the row's parse drifts from the caption's parse, so the same rubric
is described two ways in one screen"). R4h only exercises the `cartridge:` case,
so it cannot see the contradiction it was written to catch.

Compounding it: no seam requirement authorizes the fix. S1-S4 name
`rubric-origin.ts`, the panel, `cartridge-drops.ts`, `types.tables-a.ts` and the
migration. `rubric-memory.ts` appears only as a gate path whose test "must not
drift" - never as a file the implementer may edit. The implementer has no
sanctioned route to render its own oracle's expected value.

**Remedy, pick one and state it as a requirement:** (a) C7 expects
`upload:hw2.zip`, R4e expects `your upload of "hw2.zip"`, and the row-copy
function is required to call an exported `describeScope` - which makes R4h an
identity rather than an agreement check and closes the drift by construction; or
(b) keep `archive:`, put `src/lib/grade/rubric-memory.ts` in the write set,
require an `archive:` branch in `describeScope`, and extend R4h to the archive
case. (a) is smaller and eliminates the second vocabulary; (b) needs a stated
reason why a second prefix is warranted.

---

## 4. Major

### MAJOR-1. R4i does not measure the requirement it is introduced for

**Class: an instrument that does not measure its own stated requirement. NEW.**

The notes introduce R4i under "Placement constraint, which is an instrument and
not a style note ... **It adds no table column.**" The instrument is
`th count === td count`. Adding a `<th>` AND a `<td>` - i.e. adding a table
column, the thing the sentence forbids - passes at 6 === 6. R4i only catches the
asymmetric mistake ("added a column and forgot the header"), which the notes'
direction-of-failure column states correctly while the framing sentence
overclaims. The R4 sabotage table never tries the paired mutation, so the gap is
unexercised.

**Remedy, one line:** freeze both counts. Measured now:
`grep -oE '<th[> ]' ... | wc -l` -> 5, `grep -oE '<td[> ]' ... | wc -l` -> 5.
Assert `=== 5` on each and keep the equality. Re-pin at build start with the rest
of the R5 numbers.

### MAJOR-2. A40-D3 is already owned, already fixed, and already tested by a live sibling; its own grep evidence is now false

**Class: a tree claim that a design doc records rather than measures
(`brief-from-the-tree-not-the-doc`). NEW.**

A40-D3 says `setRubricOrigin` "has exactly one callsite, in the restore effect",
cites `grep -n 'rubricOrigin\|setRubricOrigin'` returning "three hits", calls the
defect pre-existing, and prescribes "A separate backlog row. Not A40's write
set."

`src/app/components/CartridgeDropPanel.reorder.test.ts:76-132` is **RULING 111**,
and it is exactly this defect, diagnosed in the same words ("the caption ... can
go on naming a course/assignment after the rubric field it describes has been
cleared") with the fix specified ("clear it at both sites where its sibling
`setSniffHint(null)` already clears - the post-upload form reset, and the catch
block") and three assertions plus two sabotage canaries already written.

An implementer following A40-D3 would file a backlog row for work that is live in
the same file right now. The residual should point at RULING 111 and say the
remaining A40 obligation is only *not to disturb it* - which also means
`reorder.test.ts` is load-bearing for a second reason the gate justification does
not record.

I did not resolve whether RULING 111's clears have landed: my greps returned
different snapshots of `rubricOrigin` minutes apart (once showing the restore-
effect `setRubricOrigin(describeRubricOrigin(loaded, scope))` at `:138`, once
showing only the `useState` and the render). The file is being written while I
read it. The implementer must re-derive this at its own start.

### MAJOR-3. Section 0's and the gate table's claims about the reorder test are false against the tree

**Class: same as MAJOR-2 - a tree claim not measured at the moment of use.
REPEAT-OF MAJOR-2.** Recorded separately because it changes the GATE, not a
residual.

| Notes claim | Measured |
|---|---|
| reorder test is "untracked, 94 lines" | `wc -l` -> **132** |
| it carries "RULING 106's five-field ordering guard and RULING 107's `ta-` exact-key-set canary" | it carries RULING 106 (`:57`) and **RULING 111** (`:85`). Its own header at `:26` records that **RULING 109 SUPERSEDED RULING 107** |
| gate justification: "the live sibling's ordering + `ta-` key canary" | the `ta-` canary has MOVED to `src/app/components/componentStorageKeys.structure.test.ts` (untracked, new), a **non-recursive directory-wide** `ta-` exact-set canary over `src/app/components/*` that reads `CartridgeDropPanel.tsx` |

`componentStorageKeys.structure.test.ts` is a new reader of the panel and is
**absent from the 16-path gate.** Its scan pattern is
`/(?<![a-zA-Z0-9_])ta-[a-z0-9-]*[a-z0-9]/g`, quote-free, so any `ta-`-looking
substring in new copy is in scope. The planned disclosure copy contains no `ta-`
token, so the practical risk is low - but the notes' own justification for the
gate ("a gate nobody can justify gets trimmed by the next agent") is what makes a
wrong justification a defect rather than a typo. Add the path, and correct the
reorder row to name RULING 106 + RULING 111.

---

## 5. Minor

- **MINOR-1.** "22 paths" is 23. My run above: 23 lines, and the section-1 table
  accounts for 17 hidden paths while the real hidden count is 18 -
  `docs/backlog.yml` is matched by the command and absent from the table. The
  `src` + `supabase` subtotal IS 22 (`grep -rlniE 'cartridge[-_]drops|cartridgedrop'
  src supabase | wc -l` -> 22), so the likely cause is a subtotal reported
  against a command that included a third argument. Restate the quantity with the
  command that produced it.
- **MINOR-2.** R2a's direction of failure claims it catches "a column added to
  `CartridgeDropsRow` but not to the migration". R2a inspects
  `Object.keys(captured[0])` - the INSERT PAYLOAD - not the Row type. A Row field
  that the insert does not write escapes it entirely. For A40 the combination
  still holds, because R2b forces the insert to carry `COL`; the general claim
  does not, and the sabotage row "add the field to `CartridgeDropsRow` but omit
  the column from the migration -> R2a RED" is only true if the insert is edited
  too. Narrow the claim or add the Row-type side explicitly.
- **MINOR-3.** `extractCreateTableColumns` lives inside
  `src/lib/cron-heartbeat.test.ts`. The notes cite it as "Precedent and shape"
  without saying DUPLICATE. `docs/loop/traps-tests.md`: "Never import a helper
  from another `*.test.ts`" - doing so re-runs that file's describe blocks under
  the wrong setup. Add the word.
- **MINOR-4.** R4e's instrument reads "substring, where the expected rendering is
  produced by the same parse the test declares". If an implementer reads that as
  "compute the expected value with the implementation's humaniser", R4e becomes a
  tautology and kills nothing - and MUT_R (raw-scope-token) survives, leaving R4
  with the same hole its rebuild was meant to close. The table already gives the
  expected renderings as literals; say so ("frozen literals, never computed from
  the implementation").

---

## 6. The attacks that FAILED

Listed because a check with no attempted attacks is not a check, and because
these are the places a round-2 reviser should NOT spend effort.

1. **"The frozen literals are tautologies."** Both are declared by the test and
   derived from real tree text. Failed on both.
2. **"R2e's column extractor over-extracts from this migration's `check (...)`,
   `create index (...)` and `insert into storage.buckets (...)` parens."** Failed
   - the cited precedent bounds itself with `indexOf("\n);")`.
3. **"The gate lists a path that does not exist, so it never runs."** Failed -
   16/16 present, and the two absent paths are correctly quarantined. I verified
   the refusal mechanism in `cli.ts:36` rather than trusting the claim.
4. **"Some instrument needs an export from a `"use server"` module."** Failed -
   no `use server` in the write set, no constant or type crossing that boundary.
5. **"The R5 numbers are already stale."** Failed - the panel moved 603 -> 613
   during this check and every R5 quantity is unchanged. Re-pinning is still
   correct advice; the numbers themselves hold.
6. **"Something here needs a component to render."** Failed - all 25 instrument
   rows are `readFileSync` source scans or pure-function calls.
7. **"The gate runs two or more paths without the wrapper."** Failed - it uses
   `npm run test:paths --` everywhere and names the refusal behaviour.
8. **"A third writer or reader of `cartridge_drops` exists that neither the brief
   nor the notes found."** Failed, with an instrument neither used (the
   underscore table name). `comm -13` returns empty.
9. **"The R3 nine-case restriction to `mergeSniffedValues`-producible inputs is
   wrong."** Failed as stated - `rubricText: null` really does imply
   `sniffed: null`. It is the `restored` axis, not the `sniffed` axis, where the
   table is short. BLOCKER-1.
10. **"R1c's frozen body collides with `supabase-migrations.structure.test.ts`."**
    Failed - that file checks unterminated strings/dollar blocks and doubled
    apostrophes (`:142-165`); a single guarded `alter table` satisfies it, and the
    notes' S7 kill credit to the apostrophe check is accurate.

**The feature-already-exists case, argued at its strongest.** The panel already
ships presence-plus-origin: `describeRubricOrigin` renders "Rubric restored from
your last saved rubric (CS101 / HW1), saved 2 hours ago." above the field, and
`rubric-memory.test.ts` already guards that it names the ACTUAL scope and never
the requested one. So the origin sentence, the humanised scope, the
exact-vs-fallback distinction and their tests all exist. **What does not exist is
persistence past the panel's unmount**, which is the whole of RULING 105's
reasoning and which I am not reopening. The argument is weak on persistence and
strong on COPY: it says the row should speak in the vocabulary the caption
already uses. That is BLOCKER-4, and it is the one place where this argument
changes the build rather than questioning it.

---

## 7. Verdict and severity

| Severity | Count |
|---|---|
| Blocker | 4 |
| Major | 3 |
| Minor | 4 |

**DEFECTIVE.**

| # | Blocker | Class | NEW / REPEAT |
|---|---|---|---|
| B1 | R3's case table misses `rubricText` empty + `restored` present; a mutant scores 9/9 and writes an origin onto a rubric-less row. No cross-field invariant anywhere. | coverage by enumeration presented as construction | **NEW** |
| B2 | `FROZEN_NO_RUBRIC` asserts "the workflow generated one" in the default auto-grading-off state, and the string equality makes it unfixable. | frozen literal asserting an unconditional past fact about conditional behaviour | **NEW** |
| B3 | A40-D2 filed as having no executable instrument, while RULING 111 in `CartridgeDropPanel.reorder.test.ts` - already in this gate - demonstrates the exact technique on the same handler. | residual filed where a precedented executable instrument exists | **NEW** |
| B4 | C7's `archive:` token exists nowhere, cannot be humanised by anything in the repo, and forces the second parse that R4h exists to forbid; no write-set file may fix it. | oracle specifies a value the authorized write set cannot produce or render | **NEW** |

Majors: MAJOR-1 NEW (instrument does not measure its stated requirement);
MAJOR-2 NEW (tree claim recorded rather than measured); MAJOR-3
**REPEAT-OF MAJOR-2**.

---

## 8. Stopping point - what I did NOT check, and why

**What remains is DESIGN and MEASUREMENT, not rulings.** I found no defect in
the orchestrator's rulings as they bear on this artifact. RULING 105's placement
and DECISION 16's column-plus-migration shape are internally consistent with
every instrument here, RULING 100's zero-interaction requirement is honestly
proxied and honestly labelled, and the notes' refusal to re-decide them is
correct. The one ruling-adjacent finding is MAJOR-3, and it is a ruling
SUPERSESSION (107 -> 109/111) that landed after the notes were written, not a
ruling error.

Not checked, explicitly:

- **I ran no test.** `npm run test:paths` would execute
  `page-module-css-orphan-classes.test.ts`, which does
  `fs.writeFileSync('docs/css-orphans.md')`, and three implementer agents are
  live in this tree. A gate run by a checker is a write by a checker. The gate's
  16 paths are verified to EXIST and the wrapper's refusal path is verified in
  source; whether they currently pass is not established here.
- **I did not re-derive `docs/a40-check.md` B3's unmount chain.** The notes
  label it ARGUED and name it as the premise of the whole design. I confirmed
  they label it; I did not trace it. It remains the artifact's largest unverified
  premise and it is correctly filed as such.
- **I did not re-run the notes' scratchpad probes.** The pasted outputs are
  internally consistent with the real files I read (11 insert keys, 17 columns,
  `rubricOriginScope = undefined` against today's mapper), so the RED baseline
  claim for R2 is credible on inspection. It is not independently reproduced.
- **`src/app/components/CartridgeDropPanel.tsx` moved under me** (603 -> 613
  during this check) and my `rubricOrigin` greps returned two different
  snapshots. Every panel quantity in this document is a measurement of a moving
  file and must be re-pinned by the implementer at its own start, exactly as the
  notes instruct.
- **I did not audit `docs/a40-reorder-build-check.md` or
  `docs/ruling-109-111.md`** beyond what MAJOR-2 and MAJOR-3 required. RULING 108
  I read in full and it does not bear on the disclosure half.
