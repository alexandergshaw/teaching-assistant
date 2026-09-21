# A23 - acceptance criteria

**Row:** `docs/backlog.yml:429` (`id: 'A23'`, `kind: 'bug'`, `state: 'unscoped'`).
**Seat:** acceptance criteria (`loop-ac`). **Date:** 2026-09-20. **Tree:** `b90cf03`.
**Prior version of this document:** none. `ls docs/ | grep -i a23` returns nothing,
so there is no disposition table to ship - this is round 1.

**Scope of this document:** WHAT must hold and HOW ITS FAILURE WOULD SHOW. The
choice of construction is the architect's, the oracle and the sabotage design
are the test seat's, and neither is decided here.

---

## 0. Leverage line - FIRED AND DECLINED

`docs/backlog.yml:438` carries `kind: 'bug'`, and `seats.md` ("Acceptance
criteria") rules that on a bug fix "there is no claim to make; record that as
the fired trigger and move on." Trigger fired: **bug fix**. **No leverage
claim.** This row builds no capability a user reaches; it repairs two shipped
guards. There is no removal test to hand the test seat, and inventing a class
here would describe the app rather than this work.

---

## 1. The owner's words this document is written from

From `docs/backlog.yml`, row A23:

- `title` (`:431`): "The type-only import classifier ... collects ONLY lines
  matching /^\s*import\b/, so a MULTI-LINE VALUE IMPORT of the banned
  @/lib/grade barrel is never tested at all - and separately it flags an inline
  all-type import that should pass."
- `note` (`:439`): "SO THIS ROW NOW COVERS TWO GUARDS, not one, because they are
  the same class with the same corrective rule: a text filter inferring import
  intent, defeated by a form nobody enumerated. **Fix them together or
  neither.**"
- `note` (`:439`): "WHAT THIS ROW MUST NOT DO: reach for a better regex."
- `note` (`:439`): "whoever takes this must state WHICH DIRECTION each frozen
  fixture pins - the third repo-grades fixture currently pins WRONG behaviour".
- `note` (`:439`): "FIRST STEP, owed before any fix: find out what the guard was
  protecting and whether the false negative has already let something through."

Where these criteria and those sentences diverge, the sentences win. Two places
below say plainly where I narrowed a sentence, and why.

---

## 2. The measurement owed before criteria - has the permissive direction already let something through?

**Answer: NO, on the row's own test - and the hole is nonetheless live.**

**Command.** A multi-line-aware import scanner over every non-test `.ts`/`.tsx`
file in `src/app/components/repo-grades/`, run as
`node <scratchpad>/scan.js src/app/components/repo-grades`. It matched
`/(^|\n)[ \t]*(import\b[\s\S]*?from\s*(['"])([^'"]+)\3)/g` plus `require(...)`
and dynamic `import(...)`, and classified each hit as VALUE / TYPE(keyword) /
TYPE(inline-all) with its line span.

**Result.** 32 files scanned, 171 import statements seen, 3 hits on a banned
specifier:

| Site | Specifier | Lines spanned | Kind |
|---|---|---|---|
| `repoGradesCellEdits.ts:30` | `@/lib/grade` | 1 | TYPE (keyword) |
| `repoGradesPosting.ts:56` | `@/lib/grade/postable` | 1 | **VALUE** |
| `repoGradesPosting.ts:72` | `@/lib/grade` | 1 | TYPE (keyword) |

Zero `require(...)`, zero dynamic `import(...)`, **zero multi-line imports of a
banned specifier anywhere in the directory.** So on the row's stated test - "any
file in repo-grades currently carrying a multi-line value import of the barrel" -
nothing has escaped, and **A23 is a hygiene chore, not a bug fix in the sense of
having shipped a live client-bundle defect.**

**Two qualifications that stop that from being reassuring, both measured.**

1. **The multi-line form is already present in the guarded files.** Command:
   the same scanner restricted to the four files in `REPO_GRADES_CLIENT_FILES`
   (`repoGradesFeedbackAndFiles.wiring.test.ts:265-270`). Result:
   `RepoGradeCellControl.tsx` 19 imports / 0 multi-line;
   `repoGradesCellEdits.ts` 4 / 0; `useRepoGradesGradingActions.ts` 12 /
   **2 multi-line**; `useRepoGradesBulkGrade.ts` 6 / **1 multi-line**. Three
   statements the guard reads and silently skips today. Only the specifier has
   not yet been a banned one. The hole is not theoretical; it is exercised.
2. **A file carrying a banned-specifier VALUE import is outside the guard's
   list entirely.** `repoGradesPosting.ts:56` value-imports
   `@/lib/grade/postable`, which `BANNED_IMPORT_PATTERNS` (`:258-263`, the `@/lib/grade/` prefix at `:260`) bans,
   and that file is not one of the four the guard asserts over. That is a
   COVERAGE-BY-OMISSION gap, a different defect class from the line filter, and
   it is **not chartered by this row** - see RES-A23-2. It is also not a bundle
   hazard today: `grep -n "^import\|^export \*\|require(" src/lib/grade/postable.ts`
   returns exactly one line, `:70 import type { GradeResult, RubricAreaResult } from "./types";`,
   and `src/lib/grade/types.ts:1` is likewise a single type-only import.

**Both guards re-measured here, not recalled.** Command:
`node <scratchpad>/probe.js src/lib/grade/types.ts`, which runs each guard's
filter verbatim (guard 1 from
`repoGradesFeedbackAndFiles.wiring.test.ts:295-297`, measured - the row's
`title` and `instrument` fields still cite the stale `:287-291`, see F-1; guard
2 from `gradingResultsHelpersWiring.test.ts:128-131`, measured and matching the
row exactly: file 241 lines by `wc -l`, `it(` at `:123`, filter `:128-130`,
frozen literal `:131`).

```
GUARD 1  P1 single-line VALUE import : flagged=true  want=true   OK
GUARD 1  P2 MULTI-LINE VALUE import  : flagged=false want=true   FAIL (false negative)
GUARD 1  P3 inline ALL-TYPE import   : flagged=true  want=false  FAIL (false positive)

GUARD 2  H0 unmodified real types.ts : passes=true (want true)
GUARD 2  H1 double-quoted server VALUE import  : caught
GUARD 2  H2 SINGLE-QUOTED server VALUE import  : ESCAPES
GUARD 2  H3 require()                          : ESCAPES
GUARD 2  H4 dynamic await import()             : ESCAPES
GUARD 2  H5 SINGLE-QUOTED export *             : ESCAPES
GUARD 2  H6 MULTI-LINE double-quoted import    : caught
```

H6 is mine, not the row's, and it matters: **the two guards do not share a
failure MODE.** Guard 1 is defeated by line wrapping; guard 2 is immune to line
wrapping and defeated by quote style and by non-`import` constructs. They share
a CLASS ("a text filter inferring import intent") and a corrective rule, which
is what justifies the row's "together or neither" - but a criterion written as
"close the multi-line hole in both" would bind guard 2 to a hole it does not
have. AC-3 and AC-4 are written to guard 2's measured holes.

---

## 3. The one line this seat owes

**What the original U3 ruling lacked, and what every criterion below has: a
pass condition that can only be discharged by OBSERVING THE GUARD'S VERDICT
CHANGE on an input it must reject - red before, green after - rather than by
describing the mechanism it is built from.** "Replace the regex with a walled
set" is satisfied the moment a walled set is written; "the guard must report
this single-quoted import" is satisfied only by running it. Every criterion
below names a verdict, not a shape.

---

## 4. Constraints inherited, not authored here

Stated so the architect and test seat do not re-derive them, and so a checker
can tell inherited from invented.

- **C-1.** `iteration-caps.md:41-43` - "the second attempt **must change kind,
  not strength**. Strengthening the same mechanism is forbidden at the second
  failure." This is the second measured failure in this family; the row names
  a third ("a phrase denylist catching ZERO of nine attack constructions").
- **C-2.** `iteration-caps.md:13-16` - the three moves that have ended a chain
  here: relocate, escalate, or replace the assertion with a construction that
  makes the bad state unrepresentable. The row names the in-repo shapes:
  a walled set derived from the tree, a transitive import-graph walk
  (`classTrendsDraft.not-postable.test.ts`, described at `leverage.md:152-162`),
  or a computed-rather-than-hand-maintained expectation (A22, `7375a21`).
- **C-3.** `vitest` is node-env and collects only `src/**/*.test.ts`. No
  component is rendered. No criterion below needs either.

---

## 5. Acceptance criteria

Each names the **object** under comparison, the **instrument** producing each
quantity, and the **direction of failure**.

### AC-1 - Guard 1's verdict does not depend on line wrapping

- **Object.** The repo-grades client-bundle guard's verdict on a source
  containing a value import of a banned specifier written across MORE THAN ONE
  LINE, compared against its verdict on the byte-equivalent single-line form of
  the same import.
- **Instrument.** The delivered guard executed -
  `npx vitest run src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts` -
  against each form in turn. Not a reading of the filter; reading is what let
  this ship.
- **Direction of failure.** The two verdicts DIFFER. Specifically: the guard is
  GREEN on the multi-line form. A silent pass is the defect, which is why this
  criterion is discharged only by an observed RED on the multi-line form before
  the fix (measured today: `flagged=false`, P2) and an observed GREEN after.

### AC-2 - Guard 1 permits an all-type import in every spelling, and permits nothing more

- **Object.** Two verdicts, compared as a pair:
  (a) the guard's verdict on `import { type X } from "<banned>"` - every binding
  carrying the inline `type` modifier - against its verdict on
  `import type { X } from "<banned>"`; these must be the SAME, and both must be
  "permitted";
  (b) the guard's verdict on a MIXED import, `import { type X, y } from "<banned>"`,
  which must be "flagged" - `y` is a value binding and is not erased.
- **Instrument.** The delivered guard executed over each of the three forms.
- **Direction of failure.** TWO directions, and the second is the one that
  matters more. (i) The two spellings in (a) disagree - measured today they do:
  P3 `flagged=true` where the keyword form is `flagged=false`. (ii) The fix
  closes (a) by widening what is permitted until (b) is also permitted, which
  converts a false positive into a false negative and is strictly worse than the
  defect being closed. A fix that turns (a) green while turning (b) green is a
  FAILURE of this criterion, not a partial pass.

### AC-3 - Guard 2's verdict does not depend on quote style

- **Object.** Guard 2's verdict on `src/lib/grade/types.ts` carrying a value
  import of a server-only module written with SINGLE quotes, compared against
  its verdict on the same import written with DOUBLE quotes.
- **Instrument.** The delivered guard executed -
  `npx vitest run src/app/components/grading-results/gradingResultsHelpersWiring.test.ts` -
  against a copy of the real `types.ts` with each form injected. `types.ts` is
  read-only to this guard (S14's precedent, `gradingResultsHelpersWiring.test.ts:122`),
  so the injection is into a copy, never the tree.
- **Direction of failure.** The single-quoted form is GREEN where the
  double-quoted form is RED. Measured today: H2 escapes, H1 is caught.

### AC-4 - Guard 2 sees the four constructs that got its predecessor withdrawn

- **Object.** Guard 2's verdict on `types.ts` reaching another module through
  each of the four constructs Ruling U3 cited when it withdrew
  `VALUE_IMPORT_PATTERN` - the ruling's own words, quoted from
  `gradingResultsHelpersWiring.test.ts:119-120`: "VALUE_IMPORT_PATTERN was
  withdrawn (misses re-exports/require/dynamic import)". Concretely:
  `export ... from`, `export * from`, `require(<literal>)`, and
  `import(<literal>)` - each in BOTH quote styles.
- **Instrument.** The delivered guard executed against a copy of the real
  `types.ts` with each construct injected, one at a time.
- **Direction of failure.** ANY of the eight leaves the guard GREEN. Measured
  today three of them do (H3, H4, H5); the row's own count is "TWO of the four
  constructs that got the ORIGINAL regex withdrawn still escape its
  REPLACEMENT". A replacement that fails on the same construct list as the thing
  it replaced is the defect this row exists to name.
- **NARROWED, and I am saying so.** The row's sentence is unqualified about
  "dynamic import()". A criterion demanding that a dynamic import with a
  RUNTIME-COMPUTED specifier (`import(pathVar)`) be caught is **not satisfiable
  by any construction available here** - no static instrument in a node-env
  vitest run can resolve it, and I could describe no implementation that passes.
  So AC-4 binds to constructs whose specifier is a **static string literal**.
  The computed-specifier case is RES-A23-1, not a deletion.

### AC-5 - Every criterion above is discharged by an observed colour CHANGE

- **Object.** For each of AC-1 through AC-4, two recorded guard runs: one
  against the tree as it stands before the fix, one after.
- **Instrument.** The two `npx vitest run` commands named above, with their
  output recorded in the shipping report.
- **Direction of failure.** A criterion whose hazard fixture was NEVER OBSERVED
  RED. If the fix lands and every fixture is green at the moment it lands, this
  criterion has failed regardless of what the guard now contains - that is
  exactly the state Ruling U3 shipped in, and `traps-tests.md:8` already rules
  "A test is not evidence until you have watched it fail."

### AC-6 - Every adopted fixture states the direction it pins

- **Object.** The label carried by each fixture the fix adopts, against the
  fixture's CURRENT observed value.
- **Instrument.** The table in section 6 of this document, re-run by whoever
  adopts the fixtures, via the two commands above.
- **Direction of failure.** A fixture adopted with its current observed value as
  its expectation. Two of the three repo-grades fixtures currently observe the
  WRONG value (P2 and P3), so freezing observed values immortalises two defects
  as expectations.
- **A dropped clause, and I am restoring it rather than inheriting the narrow
  half.** `a22-scope.md:611-618` states the obligation for ALL THREE fixtures -
  fixture 1 "pins CORRECT behaviour and is a regression canary", fixture 2 "pins
  the FALSE NEGATIVE and must go RED against today's filter before any fix, as a
  positive control", fixture 3 "pins the FALSE POSITIVE and must be asserted in
  the FIXED direction". The BACKLOG ROW carried only the fixture-3 half forward
  ("the third repo-grades fixture currently pins WRONG behaviour"). Reading the
  row alone would leave fixture 2 unlabelled, and fixture 2 is the one pinning
  the false negative this row is named after. This is the two-clause-rule
  failure `seats.md` already makes this seat's checker ask about.

### AC-7 - The fix changes kind, not strength

- **Object.** The delivered guard's decision procedure, classified as either
  (i) a predicate over raw source TEXT whose completeness depends on having
  enumerated syntactic forms, or (ii) one of the three shapes at C-2.
- **Instrument.** The architect's design artifact must NAME which of the three
  C-2 shapes it took; a checker reads the delivered test for a surviving
  per-line or per-quote-style text filter on the decision path.
- **Direction of failure.** The delivered guard is classified (i). A third
  pattern - however much better - is a REPEAT of a class that has now failed
  three times in this tree, and `iteration-caps.md:41-43` forbids it at the
  second. Naming a shape is not choosing one: which shape, and whether the
  answer is option (b) deletion, is the architect's call.

### AC-8 - Both guards, or neither

- **Object.** The shipped diff's file set, against the two paths the row names:
  `src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts` and
  `src/app/components/grading-results/gradingResultsHelpersWiring.test.ts`.
- **Instrument.** `git status --short` at the wave gate, and `git diff --name-only`
  on the chunk.
- **Direction of failure.** Exactly one of the two paths is touched. The row's
  words: "Fix them together or neither." Shipping one half leaves a guard the
  next reader believes in, which is the precise mechanism this row documents.

### AC-9 - Nothing currently caught stops being caught

- **Object.** Guard 1's verdict on a single-line value import (P1, correct
  today) and guard 2's verdict on a double-quoted value import (H1, correct
  today), before and after the fix.
- **Instrument.** The two `npx vitest run` commands, with P1 and H1 as the
  fixtures.
- **Direction of failure.** Either goes from RED-on-hazard to GREEN-on-hazard.
  These two are regression canaries, not targets; a fix that closes the misses
  by restructuring the guard and loses a working catch is a net loss. This is
  the failure direction the row warns about when it says a broken guard "does
  not fail loudly - it passes."

### AC-10 - The real tree still passes

- **Object.** The two guard test files' results against the UNMODIFIED tree,
  before and after the fix.
- **Instrument.** `npx vitest run src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts src/app/components/grading-results/gradingResultsHelpersWiring.test.ts`,
  plus the repo gates from `this-repo.md:19-24`: `npx tsc --noEmit` (no output,
  exit 0), `npm run lint` (4 warnings, 0 errors), `npm test`.
- **Direction of failure.** The fix turns the real tree RED. This is the
  satisfiability boundary on the row's option (b) - "delete the classifier and
  let the barrel ban stand unconditionally in that directory". I MEASURED
  whether any guarded file legitimately needs a type-only barrel import, as the
  row instructs: **`repoGradesCellEdits.ts:30` carries
  `import type { RubricAreaResult, SubmittedFileInfo } from "@/lib/grade"`, and
  it IS one of the four files the guard asserts over.** An unconditional ban in
  that directory therefore fails AC-10 unless that import is first moved. Option
  (b) is not off the table; it is not free, and the row's "MEASURE whether any
  does before choosing this" is hereby discharged: **one does.**

---

## 6. Fixture direction table - what each pins, and why

Required by the row. "Observed today" is from the commands in section 2.

| # | Fixture | Observed today | What it pins | Expected colour BEFORE the fix | Role |
|---|---|---|---|---|---|
| P1 | single-line VALUE import of a banned specifier | flagged | **CORRECT behaviour** | RED on hazard (guard fires) | regression canary (AC-9) |
| P2 | MULTI-LINE VALUE import of a banned specifier | not flagged | **the FALSE NEGATIVE** | must be observed GREEN-on-hazard, i.e. the guard fails to fire | positive control (AC-1, AC-5) |
| P3 | inline ALL-TYPE import of a banned specifier | flagged | **the FALSE POSITIVE** | must be asserted in the FIXED direction (not flagged), RED today | positive control (AC-2, AC-5) |
| P4 | MIXED `{ type X, y }` import of a banned specifier | not measured - see RES-A23-3 | the hole AC-2's naive fix would open | unknown | negative control (AC-2) |
| H1 | double-quoted server VALUE import into `types.ts` | caught | **CORRECT behaviour** | RED on hazard | regression canary (AC-9) |
| H2 | SINGLE-QUOTED server VALUE import | escapes | a MISS | GREEN-on-hazard | positive control (AC-3) |
| H3 | `require(<literal>)` | escapes | a MISS | GREEN-on-hazard | positive control (AC-4) |
| H4 | dynamic `await import(<literal>)` | escapes | a MISS | GREEN-on-hazard | positive control (AC-4) |
| H5 | single-quoted `export * from` | escapes | a MISS | GREEN-on-hazard | positive control (AC-4) |
| H6 | MULTI-LINE double-quoted import into `types.ts` | caught | **CORRECT behaviour - guard 2 has no multi-line hole** | RED on hazard | canary against over-generalising A23 (section 2) |

**Nothing in this table is adopted as-is.** P2, P3, H2, H3, H4 and H5 pin
defects; they are expectations only after their direction is INVERTED.

---

## 7. Findings

- **F-1 (stale citation, in the row itself).** `docs/backlog.yml`'s `title`
  (`:431`) and `instrument` (`:435`) fields both locate guard 1 at
  `repoGradesFeedbackAndFiles.wiring.test.ts:287-291`. Measured by
  `sed -n '293,300p'` plus `grep -n`, the filter is at **`:295-297`** in a
  305-line file (`wc -l`). `a22-scope.md:573-576` already recorded this
  ("Round 1 cited `:287-291`; that was stale - major M1"). The row's `note`
  field re-pinned guard 2 after `7375a21` and did not re-pin guard 1. This is
  the stale citation the row itself warns would be "the tenth" - present in the
  row. The generated `docs/BACKLOG.md:31` mirrors it. Owner: orchestrator
  (`backlog.yml` is not mine to write).
- **F-2 (coverage gap, adjacent class, NOT chartered).** `repoGradesPosting.ts:56`
  value-imports `@/lib/grade/postable`, a specifier `BANNED_IMPORT_PATTERNS:269`
  bans by prefix, and that file is absent from `REPO_GRADES_CLIENT_FILES:265-270`.
  Not a bundle hazard today (section 2). This is coverage-by-omission, the class
  A22 closed in `grading-results/` with a directory sweep, and chartering it here
  would widen the row. RES-A23-2.
- **F-3 (third site of the same line-filter idiom).** `Grep` for
  `/^\s*import\b/` across `src` returns two sites:
  `repoGradesFeedbackAndFiles.wiring.test.ts:297` and
  `snapshot-grading.structure.test.ts:801`. The second is the same mechanism
  (an import-intent decision from a per-line text filter) guarding Ruling
  B35-20. It is not currently leaking - `node -e` over
  `src/app/actions/snapshot-grade.ts` reports 6 import statements, 0 multi-line,
  and the only mention of `extractRubricCriteria` is a comment at `:73` - and it
  has a partial backstop at `:806` (a comment-stripped whole-file check for a
  live call), which an import-without-call re-export would still escape.
  **A bash `grep -rn` for this pattern returned EMPTY through shell escaping;
  the `Grep` tool found both. The canary (`grep -c 'from "'` on a known-matching
  string = 1) is what caught the false absence.** Whether A23 covers a third
  site is a scope question for the owner, not a defect. RES-A23-4.
- **F-4 (no live contradiction from A22).** `grep -rn 'CodeRunResult } from "../code-runner"' src`
  returns 5 hits; exactly one is an assertion -
  `gradingResultsHelpersWiring.test.ts:131`, the frozen literal A23 will change.
  A22's AC-3 pinned it as a criterion in `a22-scope.md`, but no SECOND test in
  the tree asserts it, so changing it breaks no landed gate.

---

## 8. Concurrency and write-set flags

- Expected write set spans `src/app/components/repo-grades/` and
  `src/app/components/grading-results/`, per the row.
- **No collision with live A21 work.** The A21 implementer holds
  `src/app/actions/`, `src/lib/prompt-announcement-*`, and
  `src/app/components/canvas-tab/`. `git status --short` at `b90cf03` shows 18
  paths, all under those three roots plus `docs/css-orphans.md`. Intersection
  with A23's expected write set: **empty**.
- **A22 sequencing is discharged.** A22 landed at `7375a21`; `git log -1` confirms
  the commit. A23 is unblocked.
- This document wrote exactly one path: `docs/a23-criteria.md`.

---

## 9. Residual register

Every entry carries an owner, an instrument and a step. Any entry missing one of
the three would be a deletion and I would say so; none is.

| Id | Residual | Owner | Instrument | Step that will measure it |
|---|---|---|---|---|
| RES-A23-1 | AC-4 is narrowed to STATIC-LITERAL specifiers. A dynamic `import(pathVar)` with a runtime-computed specifier is caught by no construction available here. | Test seat, then repo owner if it must be closed | `grep -rn "import(" src/lib/grade/ --include=*.ts` re-run at the fix (0 today), plus a stated non-goal in the delivered test's comment | The test seat's oracle round on A23 |
| RES-A23-2 | F-2: `repoGradesPosting.ts` carries a banned-specifier VALUE import and is not in the guard's file list. Coverage-by-omission, adjacent class, not chartered by A23. | Repo owner (scope call), then orchestrator as a backlog row | `node <scratchpad>/scan.js src/app/components/repo-grades` re-run, cross-referenced against `REPO_GRADES_CLIENT_FILES` | Escalated at A23's disposal round; a row filed if the owner widens scope |
| RES-A23-3 | P4, the MIXED `{ type X, y }` fixture, is NOT YET MEASURED against either guard. AC-2 depends on it and I did not execute it. | Test seat | The guard's filter executed over `import { type X, y } from "@/lib/grade";` | The test seat's oracle round, before the implementer is briefed |
| RES-A23-4 | F-3: `snapshot-grading.structure.test.ts:801` is a third site of the same line-filter idiom, not leaking today. | Repo owner (scope call) | `Grep` for `\^\\s\*import\\b` over `src` (2 sites today) with a matching-string canary - never bash `grep -rn`, which returned a false empty | Escalated with RES-A23-2 at A23's disposal round |
| RES-A23-5 | Client-bundle safety's only true oracle is `next build`'s compile stage; these guards are proxies for it. This checkout has no `.env`, so the build gate is read as the `Compiled successfully` line, never exit 0 (`this-repo.md:26-40`). | Repo owner | `npm run build`, grepping for `Compiled successfully`; then the Vercel deploy log | A23's push |
| RES-A23-6 | F-1: the row's own `title` and `instrument` fields cite guard 1 at the stale `:287-291`; measured `:295-297`. | Orchestrator | `grep -n` on `repoGradesFeedbackAndFiles.wiring.test.ts` against `docs/backlog.yml:431,435` | Backlog reconciliation at A23's push |

**These residuals are not in `docs/BACKLOG.md` yet, and until they are they do
not exist** (`DEV_LOOP.md:79-84`). `docs/backlog.yml` is the orchestrator's file
and this seat may not write it; recording them there is owed at A23's
reconciliation.

---

## 10. What I could not determine

- **Whether the guard's false negative ever let something through HISTORICALLY.**
  Section 2 measures the tree at `b90cf03` only. A multi-line banned import that
  existed and was later removed would leave no trace in a working-tree scan. I
  did not walk the history, and I am not claiming the guard has never been
  decorative - only that it is not decorative today.
- **Whether `repoGradesPosting.ts` is reachable from a client bundle at all.**
  That is a module-graph question and belongs to the architect. I measured only
  that its banned-specifier import resolves to a leaf whose sole import is
  type-only, so it is not a hazard by that path.
- **Which of the three C-2 shapes the fix should take**, and whether option (b)
  (deletion) survives AC-10 once `repoGradesCellEdits.ts:30` is accounted for.
  Deliberately not decided here - that is the architect's lane, and AC-7 and
  AC-10 are written to constrain the choice without making it.
