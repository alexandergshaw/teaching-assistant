# A23 - acceptance criteria (round 3 - DISPOSAL ROUND)

**Row:** `docs/backlog.yml:429` (`id: 'A23'`, `kind: 'bug'` at `:438`,
`state: 'unscoped'` at `:430`).
**Seat:** acceptance criteria (`loop-ac`). **Date:** 2026-09-20.
**Tree.** The two most load-bearing quotes this document builds on (C-4/AC-12
and section 2.3) actually landed at `e71a085`, not `a0c1b53` as round 2's header
claimed - corrected here (MJ-c). Re-measured quantities in this round (MJ-a, MJ-b,
MJ-f, the line counts) are read at the current session HEAD, `5ed14cd`
(`git log --oneline -1`).
**Prior version:** round 1, committed at `52af8d0`; round 2, committed at
`1dc28a3`. Round 1's fresh checker returned NOT CLEAN: 2 blockers, 2 majors, 5
minors, disposed by rulings X1 and X2. Round 2's fresh checker returned NOT
CLEAN: 3 blockers (BL-1 through BL-3, two of them REPEATs of the round-1
classes) plus six mechanical (MJ) corrections and several minors. Per
`iteration-caps.md:44-49` (cap 2), this is the disposal round: no new
requirements, dispositions only. Rulings Y1-Y5 dispose BL-1 through BL-3;
Ruling Y4 applies the six MJ corrections and the minors; Ruling Y5 relocates
Appendix A. Section 11 is round 1's finding disposition table; section 12 is
round 1's criterion disposition table; section 13 is round 2's finding
disposition table; section 14 is round 2's criterion disposition table. All four
ids columns were derived LAST, after all renumbering.

**Scope of this document:** WHAT must hold and HOW ITS FAILURE WOULD SHOW. The
choice of construction is the architect's; the oracle, the sabotage design and
**the enumerated fixture cross-product** are the test seat's (Ruling X2 (d)).
Neither is decided here.

---

## 0. Leverage line - FIRED AND DECLINED

`docs/backlog.yml:438` carries `kind: 'bug'`, and `seats.md:70-75`
("Acceptance criteria") rules that on a bug fix "there is no claim to make;
record that as the fired trigger and move on." Trigger fired: **bug fix**.
**No leverage claim.** This row builds no capability a user reaches; it repairs
two shipped guards. There is no removal test to hand the test seat, and
inventing a class here would describe the app rather than this work.

---

## 1. The owner's words this document is written from

From `docs/backlog.yml`, row A23, as it reads at `e71a085` (**corrected in round
3, Ruling Y4/MJ-c** - round 2 cited `a0c1b53` here, but the row's own correction
by the orchestrator, and the load-bearing quotes below, land one commit later at
`e71a085`; round 1's F-1 is discharged and its residual struck - see section
11).

- `title` (`:431`): "... The type-only import classifier at
  `repoGradesFeedbackAndFiles.wiring.test.ts:295-297` collects ONLY lines
  matching `/^\s*import\b/`, so a MULTI-LINE VALUE IMPORT of the banned
  `@/lib/grade` barrel is never tested at all - and separately it flags an
  inline all-type import that should pass."
- `note` (`:439`): "SO THIS ROW NOW COVERS TWO GUARDS, not one, because they are
  the same class with the same corrective rule: a text filter inferring import
  intent, defeated by a form nobody enumerated. **Fix them together or
  neither.**"
- `note` (`:439`): "**THE FIX MUST BIND EACH GUARD TO EACH CONSTRUCT PER WRAP
  POSITION PER QUOTE STYLE, measured, not reasoned from one guard to the
  other.**"
- `note` (`:439`): "ORCHESTRATOR RULING, 2026-09-20: OPTION (b) - delete the
  classifier and let the whole-file ban stand unconditionally - **IS OFF THE
  TABLE.**"
- `note` (`:439`): "WHAT THIS ROW MUST NOT DO: reach for a better regex."
- `note` (`:439`): "whoever takes this must state WHICH DIRECTION each frozen
  fixture pins - the third repo-grades fixture currently pins WRONG behaviour".
- `note` (`:439`): "FIRST STEP, owed before any fix: find out what the guard was
  protecting and whether the false negative has already let something through."

Where these criteria and those sentences diverge, the sentences win. Section 5
says plainly at each point where I narrowed a sentence, and why.

---

## 2. The measurement owed before criteria

Every quantity below was produced by one of the two scripts named in
**Appendix A**, committed at `docs/a23/a23-probe.mjs` and
`docs/a23/a23-scan.mjs` (**relocated there in round 3, Ruling Y5** - round 2
reproduced them as fenced code blocks in this document; a committed file is
strictly more re-runnable than a fenced block, which needed an extractor before
anyone could run it). Round 1's numbers came from a session-local scratchpad
script that no longer exists; the numbers were independently reproduced by the
checker to the digit, but they were not re-runnable. That is fixed here, not
re-asserted.

### 2.1 Has the permissive direction already let something through?

**Answer: NO, on the row's own test - and the hole is nonetheless live.**

**Command.** `node docs/a23/a23-scan.mjs src/app/components/repo-grades` (Appendix A.2),
a multi-line-aware import scanner over every non-test `.ts`/`.tsx` file in that
directory.

```
root=src/app/components/repo-grades
files scanned = 32
import statements (from-bearing) = 171
require( occurrences = 0
dynamic import( occurrences = 3
banned-specifier hits:
  src/app/components/repo-grades/repoGradesCellEdits.ts:30  @/lib/grade  lines=1  TYPE(keyword)
  src/app/components/repo-grades/repoGradesPosting.ts:56  @/lib/grade/postable  lines=1  VALUE
  src/app/components/repo-grades/repoGradesPosting.ts:72  @/lib/grade  lines=1  TYPE(keyword)
per-file, the four files in REPO_GRADES_CLIENT_FILES (imports / multi-line):
  RepoGradeCellControl.tsx         19 / 0
  repoGradesCellEdits.ts           4 / 0
  useRepoGradesGradingActions.ts   12 / 2
  useRepoGradesBulkGrade.ts        6 / 1
```

**The `dynamic import( occurrences = 3` line is a false positive of my own
counter and I am saying so rather than letting it read as three dynamic
imports.** Command:
`grep -rn "import *(" src/app/components/repo-grades --include=*.ts --include=*.tsx | grep -v "\.test\."`
returns three lines, all of them the English phrase "Type-only import (erased at
build time" in a comment - `repoGradesCellEdits.ts:25`, `repoGradesPosting.ts:67`,
`useRepoGradesData.ts:58`. **Real dynamic imports in the directory: zero.**
Round 1's "zero dynamic import" was correct; the scanner's regex is the thing
that is loose.

**So on the row's stated test** - "any file in repo-grades currently carrying a
multi-line value import of the barrel" - nothing has escaped, and **A23 is a
hygiene chore on that test, not a bug fix in the sense of having shipped a live
client-bundle defect.**

**Two qualifications that stop that from being reassuring, both measured.**

1. **The multi-line form is already present in the guarded files.** Per-file, in
   the scan output above: `useRepoGradesGradingActions.ts` carries 2 multi-line
   statements, `useRepoGradesBulkGrade.ts` 1. Three statements the guard reads
   and silently skips today. Only the specifier has not yet been a banned one.
   The hole is not theoretical; it is exercised.
2. **A file carrying a banned-specifier VALUE import is outside the guard's list
   entirely.** `repoGradesPosting.ts:56` value-imports `@/lib/grade/postable`,
   which the `@/lib/grade/` prefix pattern at
   `repoGradesFeedbackAndFiles.wiring.test.ts:260` bans (the constant opens at
   `:258` and closes at `:263`), and that file is not one of the four in
   `REPO_GRADES_CLIENT_FILES` (`:265-270`). That is a COVERAGE-BY-OMISSION gap, a
   different defect class from the line filter, and it is **not chartered by
   this row** - see F-2 and RES-A23-2. It is also not a bundle hazard today:
   `grep -n "^import\|^export \*\|require(" src/lib/grade/postable.ts` returns
   exactly one line,
   `:70 import type { GradeResult, RubricAreaResult } from "./types";`, and
   `sed -n '1,3p' src/lib/grade/types.ts` shows `:1` is likewise a single
   type-only import.

### 2.2 Both guards re-measured PER CONSTRUCT, by execution

**Command.** `node docs/a23/a23-probe.mjs` from the repo root (Appendix A.1). It runs each
guard's decision procedure verbatim:

- **Guard 1** - `repoGradesFeedbackAndFiles.wiring.test.ts`: the patterns at
  `:258-263`, the line filter at `:295-297`, the assertion at `:298-301`.
  305 lines by `wc -l`.
- **Guard 2** - `gradingResultsHelpersWiring.test.ts`: the `fromLines` filter at
  `:128-130` with its frozen literal at `:131`, inside the `it(` opened at
  `:123`. 241 lines by `wc -l`. The Ruling U3 comment it implements is at
  `:119-122`; `types.ts` is read-only to it per S14's precedent (`:122`).

Guard 1, double-quoted specifier. **The single-quoted block of the same output
is line-for-line identical**, because guard 1's four patterns all carry `["']`
(`:259-262`):

```
G1 P1   single-line VALUE import                       flagged=true  want=true  OK
G1 P2a  WRAP inside the braces                         flagged=false want=true  FAIL(ESCAPES)
G1 P2b  WRAP between from and the specifier            flagged=false want=true  FAIL(ESCAPES)
G1 P2c  TAB between from and the specifier             flagged=false want=true  FAIL(ESCAPES)
G1 P3   inline ALL-TYPE import                         flagged=true  want=false FAIL(false positive)
G1 P4   MIXED inline-type + value binding              flagged=true  want=true  OK
G1 P5   DEFAULT value binding + inline-type binding    flagged=true  want=true  OK
G1 P6   bare SIDE-EFFECT import                        flagged=false want=true  FAIL(ESCAPES)
G1 C1   export * from                                  flagged=false want=true  FAIL(ESCAPES)
G1 C2   export { x } from                              flagged=false want=true  FAIL(ESCAPES)
G1 C3   require(<literal>)                             flagged=false want=true  FAIL(ESCAPES)
G1 C4   await import(<literal>)                        flagged=false want=true  FAIL(ESCAPES)
```

Guard 2, injected one construct at a time into a copy of the real
`src/lib/grade/types.ts`:

```
G2 H0   unmodified real types.ts                       passes=true  OK
G2 H1   DOUBLE-quoted server VALUE import              passes=false caught
G2 H2   SINGLE-quoted server VALUE import              passes=true  ESCAPES
G2 H3   require(<literal>)                             passes=true  ESCAPES
G2 H4   await import(<literal>)                        passes=true  ESCAPES
G2 H5   SINGLE-quoted export * from                    passes=true  ESCAPES
G2 H6   WRAP inside the braces, double-quoted          passes=false caught
G2 H7   WRAP between from and the specifier            passes=true  ESCAPES
G2 H8   TAB between from and the specifier             passes=true  ESCAPES
G2 H9   bare SIDE-EFFECT import                        passes=true  ESCAPES
G2 H10  export { x } from, double-quoted               passes=false caught
```

### 2.3 The failure-mode map, MEASURED PER GUARD PER CONSTRUCT

Round 1 wrote a symmetry claim. This is not a symmetry claim; it is the two
measured result sets set side by side. Nothing here is inferred from one guard
to the other. Every cell is a line of the output above.

| Construct | Guard 1 | Guard 2 |
|---|---|---|
| single-line value import, double quote | caught (P1) | caught (H1) |
| single-line value import, single quote | caught (P1, single block) | **ESCAPES** (H2) |
| wrap inside the braces | **ESCAPES** (P2a) | caught double-quoted (H6); single-quoted UNMEASURED - **round 2's blanket "no brace-wrap hole" claim is STRUCK (Ruling Y3), see section 6** |
| wrap between `from` and the specifier | **ESCAPES** (P2b) | **ESCAPES** (H7) |
| TAB between `from` and the specifier | **ESCAPES** (P2c) | **ESCAPES** (H8) |
| bare side-effect `import "<spec>";` | **ESCAPES** (P6) | **ESCAPES** (H9) |
| `export * from` | **ESCAPES** (C1) | single-quoted **ESCAPES** (H5); **double-quoted UNMEASURED - no double-quoted probe exists in Appendix A. Round 2's "caught double-quoted" cell was an INFERRED verdict and is STRUCK (Ruling Y3).** |
| `export { x } from` | **ESCAPES** (C2) | caught double-quoted (H10); **single-quoted UNMEASURED here. Round 2 omitted stating this; the omission is STRUCK (Ruling Y3).** |
| `require(<literal>)` | **ESCAPES** (C3) | **ESCAPES** (H3) |
| `await import(<literal>)` | **ESCAPES** (C4) | **ESCAPES** (H4) |
| inline ALL-TYPE import | **false positive** (P3) | not applicable (guard 2 is a walled-set count, not a classifier) |
| mixed `{ type X, y }` | caught (P4) | not applicable |
| default binding `Grade, { type X }` | caught (P5) | not applicable |

**The measured reading.** The two guards share a CLASS (a text filter inferring
import intent), share a corrective rule, and share FIVE HOLES EXACTLY: from-wrap,
tab-separator, bare side-effect import, `require(<literal>)` and
`await import(<literal>)`. What they do not share is at least one hole: guard 1
additionally misses brace-wrap and carries a false positive; guard 2's
double-quoted brace-wrap is caught (H6) but its single-quoted twin is
UNMEASURED here, and guard 2's `export * from` and `export { x } from` cells
carry the three STRUCK claims of round 3 (Ruling Y3, see section 2.3's cells and
section 6) - so "guard 2 additionally misses every single-quoted form, which
guard 1 handles" is the part of round 2's claim that is actually SOUND (guard
2's own filter requires a literal double quote, `gradingResultsHelpersWiring.test.ts:130`),
but round 2 then wrote three specific export/brace-wrap cells as if they were
exceptions to that same mechanism, without probing them. **So the row's original
framing and round 1's correction are each half right, and the row at `e71a085`
now says so itself** - but three of round 2's own cells overstated how much of
guard 2's behaviour was actually observed.

**RE-DERIVATION OWED, Ruling Y3.** Struck, not re-measured here (round 3 is a
disposal round and this class is a REPEAT of the asymmetric-evidence class -
`iteration-caps.md:41-43` forbids re-litigating it a second time). **The test
seat that builds the enumerated cross-product below must RE-DERIVE sections 2.3
and 6 from its own run and REPORT EVERY CELL THIS DOCUMENT GOT WRONG** - not only
the three named here, in case the same omission recurs elsewhere in either
table.

**What the asymmetric evidence cost, in one line:** round 1 measured guard 2
across six constructs and guard 1 across only the three probes the row handed it,
and the resulting map named a difference that is only half true (guard 2 catches a
brace-wrap but not a from-wrap) while concealing five holes the guards genuinely
share - and because round 1's AC-4 bound ONLY guard 2 to that construct set and no
criterion bound guard 1 to it at all, a fix that joined continuation lines and
treated an all-braced-`type` import as erased would have passed every round-1
criterion and every repo gate while shipping guard 1 with the exact hole Ruling U3
was ordered to close.

**The enumerated cross-product is not built here.** Per Ruling X2 (d), each guard
x {single-line, brace-wrap, from-wrap, tab} x {single, double quote} x the
construct list belongs to the test seat. The table above is the TODAY-STATE
measurement that seat starts from, not its fixture set.

---

## 3. The one line this seat owes

**What the original U3 ruling lacked, and what every criterion below has: a pass
condition that can only be discharged by OBSERVING THE GUARD'S VERDICT CHANGE on
an input it must reject - red before, green after - rather than by describing the
mechanism it is built from.** "Replace the regex with a walled set" is satisfied
the moment a walled set is written; "the guard must report this single-quoted
import" is satisfied only by running it. Every criterion below names a verdict,
not a shape.

---

## 4. Constraints inherited, not authored here

Stated so the architect and test seat do not re-derive them, and so a checker can
tell inherited from invented.

- **C-1.** `iteration-caps.md:41-43` - "the second attempt **must change kind,
  not strength**. Strengthening the same mechanism is forbidden at the second
  failure." This is the second measured failure in this family; the row names a
  third ("a phrase denylist catching ZERO of nine attack constructions").
- **C-2.** `iteration-caps.md:13-16` - the three moves that have ended a chain
  here: relocate, escalate, or replace the assertion with a construction that
  makes the bad state unrepresentable. The row names the in-repo shapes: a
  walled set derived from the tree, a transitive import-graph walk
  (**corrected in round 3, MJ-e** - round 2 cited
  `classTrendsDraft.not-postable.test.ts:50`, which is mid-comment; the walk's
  own constants are `FORBIDDEN_PATH_PREFIXES` at `:58` and
  `walkForForbiddenImports` at `:119`; the `leverage.md:154` cite this was
  inherited from is stale in that file separately and is not this document's to
  fix), or a computed-rather-than-hand-maintained expectation (A22, `7375a21`).
  **THE OMITTED IDIOM, added in round 3 (MJ-e).** This list presents itself as
  the set of in-repo shapes while omitting `valueImportSpecifiers`
  (`classTrendsDraft.not-postable.test.ts:98`), the tree's own dominant idiom,
  duplicated across five test files and measured (round 2's checker) to FAIL
  AC-2(c) and every single-quoted case. `traps-spec.md:30-33` already rules
  "the orchestrator's enumeration is a FLOOR, never the set" - the same rule
  applies to a criteria document's own enumeration of in-repo shapes, and is
  stated here for that reason.
- **C-3.** `vitest` is node-env and collects only `src/**/*.test.ts`. No
  component is rendered. There is no API key and the network is blocked. No
  criterion below needs any of those.
- **C-4 (Ruling X1, inherited not authored).** Option (b) is EXCLUDED. AC-12
  states it and gives the measured ground.

---

## 5. Acceptance criteria

Each names the **object** under comparison, the **instrument** producing each
quantity, and the **direction of failure**. AC-1 to AC-3 bind guard 1; AC-4 to
AC-6 bind guard 2; AC-7 to AC-12 bind both.

### AC-1 - Guard 1's verdict does not depend on WHERE the statement wraps, or on which whitespace separates its tokens

- **Object.** Guard 1's verdict on a value import of a banned specifier written
  at each of four TOKEN-SEPARATION POSITIONS, each compared against its verdict
  on the single-line, single-space form of the same import: (i) single line,
  single spaces - the control; (ii) a newline INSIDE the braces; (iii) a newline
  BETWEEN `from` AND THE SPECIFIER; (iv) a TAB, rather than a space, between
  `from` and the specifier. **Round 1 said "more than one line". That is the
  wrong axis and I am naming why: position (iv) is a single line and still
  escapes, and guard 2 distinguishes (ii) from (iii), so "multi-line" does not
  partition these verdicts. The axis is WRAP POSITION AND SEPARATOR KIND.**
- **Instrument.** `node docs/a23/a23-probe.mjs` (Appendix A.1) against the tree before the
  fix, and the delivered guard executed -
  `npx vitest run src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts` -
  against fixtures the test seat adds, after. Not a reading of the filter;
  reading is what let this ship.
- **Direction of failure.** Any of the four verdicts DIFFERS from the control's.
  Specifically the guard is GREEN on (ii), (iii) and (iv) - a silent pass, which
  is the defect. Measured today: P2a, P2b, P2c all `flagged=false` where P1 is
  `flagged=true`, in both quote styles.
- **Obligation handed on.** The test seat owns enumerating this axis against the
  construct list of AC-3 and both quote styles (Ruling X2 (d)).

### AC-2 - Guard 1 permits an all-type import in every spelling, and permits nothing more

- **Object.** Four verdicts, compared as one set:
  (a) `import { type X } from "<banned>"` - every braced binding carrying the
  inline `type` modifier - against `import type { X } from "<banned>"`; these
  must be the SAME, and both must be "permitted";
  (b) a MIXED import, `import { type X, y } from "<banned>"`, which must be
  "flagged" - `y` is a value binding and is not erased;
  (c) a DEFAULT-plus-inline-type import,
  `import Grade, { type X } from "<banned>"`, which must be "flagged" - the
  default binding is a value binding even though every BRACED binding carries
  `type`;
  (d) a bare side-effect import, `import "<banned>";`, which must be "flagged" -
  it is erased by nothing and executes the module for its effects.
- **Instrument.** `node docs/a23/a23-probe.mjs` before the fix; the delivered guard
  executed over each of the five spellings after.
- **Direction of failure.** THREE directions, and the last two matter more than
  the first. (i) The two spellings in (a) disagree - measured today they do: P3
  `flagged=true` where the keyword form is permitted. (ii) The fix closes (a) by
  widening what is permitted until (b) is ALSO permitted, converting a false
  positive into a false negative, which is strictly worse than the defect being
  closed. (iii) **The fix closes (a) by testing whether every BRACED binding
  carries `type` - which satisfies (a) and (b) and still lets (c) through, and
  (c) is `flagged=true` today (P5).** A fix that turns (a) green while turning
  (b), (c) or (d) green is a FAILURE of this criterion, not a partial pass.
- **Measured today (RES-A23-3 of round 1, discharged here, not deferred).**
  P4 mixed `{ type RubricAreaResult, composeOverallComment }` is `flagged=true`;
  P5 default-plus-inline-type is `flagged=true`; P6 bare side-effect import is
  `flagged=false` and is therefore also a live miss, carried into AC-3.
  Clauses (b) and (c) are regression canaries today, not targets; clause (d) is
  a target.

### AC-3 - Guard 1 sees the SAME non-`import`-statement construct set that got `VALUE_IMPORT_PATTERN` withdrawn

**This criterion is new in round 2 (Ruling X2 (a)). Round 1 bound this construct
set to guard 2 only; nothing in round 1 bound guard 1 to it at all.**

- **Object.** Guard 1's verdict on a guarded file reaching a banned specifier
  through each construct that is NOT a `import ... from` statement - the four
  Ruling U3 cited when it withdrew `VALUE_IMPORT_PATTERN`, quoted from
  `gradingResultsHelpersWiring.test.ts:119-120` ("VALUE_IMPORT_PATTERN was
  withdrawn (misses re-exports/require/dynamic import)"), plus the fifth the
  measurement adds: `export * from`, `export { x } from`,
  `require(<literal>)`, `import(<literal>)`, and the bare side-effect
  `import "<banned>";`. **Each in BOTH quote styles**, the same obligation AC-6
  carries for guard 2.
- **Instrument.** `node docs/a23/a23-probe.mjs` before the fix (C1, C2, C3, C4, P6, each
  run in both quote styles); the delivered guard executed over each construct
  after.
- **Direction of failure.** ANY of the ten leaves the guard GREEN. Measured today
  **all ten do** - C1, C2, C3, C4 and P6 are `flagged=false` in both quote
  styles. A guard that a `export * from "@/lib/grade"` walks straight past is not
  a client-bundle guard; and a fix for AC-1 and AC-2 alone passes every other
  criterion here while leaving all ten open, which is the specific silent-green
  Ruling X2 was issued to close.
- **NARROWED, and I am saying so** - identically to AC-6. `require` and
  `import()` bind to a **static string literal** specifier only. A
  runtime-computed specifier (`import(pathVar)`) is caught by no construction
  available in this repo. RES-A23-1, not a deletion.

### AC-4 - Guard 2's verdict does not depend on quote style

- **Object.** Guard 2's verdict on `src/lib/grade/types.ts` carrying a value
  import of a server-only module written with SINGLE quotes, compared against its
  verdict on the same import written with DOUBLE quotes.
- **Instrument.** `node docs/a23/a23-probe.mjs` before the fix (H1 against H2); the
  delivered guard executed -
  `npx vitest run src/app/components/grading-results/gradingResultsHelpersWiring.test.ts` -
  against a copy of the real `types.ts` with each form injected, after.
  `types.ts` is read-only to this guard (S14's precedent,
  `gradingResultsHelpersWiring.test.ts:122`), so the injection is into a copy,
  never the tree.
- **Direction of failure.** The single-quoted form is GREEN where the
  double-quoted form is RED. Measured today: H2 `passes=true` (escapes), H1
  `passes=false` (caught).

### AC-5 - Guard 2's verdict does not depend on WHERE the statement wraps, or on which whitespace separates its tokens

**This criterion is new in round 2. Round 1 asserted guard 2 was "immune to line
wrapping"; that is FALSE for one of the two wrap positions and Ruling X2 half B
settled it by execution. WIDENED in round 3 (Ruling Y1) - see object clause (ii).**

- **Object.** TWO verdicts, on the same four token-separation positions AC-1
  names (single line/single spaces, the control; a newline inside the braces; a
  newline between `from` and the specifier; a TAB between `from` and the
  specifier): (i) guard 2's verdict - the walled-set count at
  `gradingResultsHelpersWiring.test.ts:128-130` - on `types.ts` carrying a
  double-quoted value import of a server-only module; (ii) **the CLIENT_FILES
  sweep's verdict** - `BANNED_IMPORT_PATTERNS` at `gradingResultsHelpersWiring.test.ts:89-94`,
  applied per-file by the `it.each` at `:112-117`, twenty lines above guard 2 in
  the SAME file A23 already edits - on the same four positions in a guarded
  client file. **Clause (ii) is new in round 3, Ruling Y1.** The round-2 checker
  measured that `:112-117`'s check shares guard 2's identical five-hole set
  (from-wrap, tab-separator, bare side-effect import, `require(<literal>)`,
  `dynamic(() => import(...))`, both quote styles), so a fix that only touches
  `:128-130` ships `:112-117` with the exact hole this row exists to close.
  AC-10's file set already covers this file; no new file is added.
- **Instrument.** `node docs/a23/a23-probe.mjs` before the fix (H1 as control, against H6,
  H7, H8) for clause (i). For clause (ii), the SAME instrument's `guard1SweepFlags`
  function (Appendix A.1 / `docs/a23/a23-probe.mjs`) is the correct proxy,
  verified rather than assumed: `BANNED_IMPORT_PATTERNS` (`:89-94`) and guard 1's
  `BANNED` sweep array differ only in one negative lookahead exempting
  `@/lib/grade/types` (immaterial to every P/H fixture, none of which use that
  specifier), and both apply as a whole-source regex test with no per-line
  filtering - the same mechanism. The delivered guard for both (i) and (ii)
  executed - `npx vitest run src/app/components/grading-results/gradingResultsHelpersWiring.test.ts` -
  against a copy of `types.ts` (i) and a copy of a CLIENT_FILES member (ii) with
  each form injected, after.
- **Direction of failure.** Any verdict DIFFERS from its control's by being
  GREEN, in EITHER clause. Measured today for (i): the brace-wrap is CAUGHT (H6
  `passes=false`) and **both the from-wrap and the tab ESCAPE** (H7, H8
  `passes=true`). H6 is the reason the round-1 challenge to the row's blanket
  claim was warranted; H7 and H8 are the reason it was over-corrected into a
  blanket claim of its own. Measured today for (ii), via the equivalent sweep
  fixtures already run in AC-12's OPTION (b) measurement: the from-wrap (P2b)
  and the tab (P2c) are both `flagged=false` - GREEN-on-hazard, in both quote
  styles. This criterion carries all of it.
- **Obligation handed on.** The test seat's enumerated cross-product (Ruling
  X2 (d)) must include clause (ii)'s file and construct set alongside guard 2's.

### AC-6 - Guard 2 sees the constructs that got its predecessor withdrawn

**WIDENED in round 3 (Ruling Y1) - see object clause (ii).**

- **Object.** TWO verdicts on each construct Ruling U3 cited when it withdrew
  `VALUE_IMPORT_PATTERN` - the ruling's own words, quoted from
  `gradingResultsHelpersWiring.test.ts:119-120`: "VALUE_IMPORT_PATTERN was
  withdrawn (misses re-exports/require/dynamic import)". Concretely:
  `export * from`, `export { x } from`, `require(<literal>)` and
  `import(<literal>)`, **each in BOTH quote styles**, plus the bare side-effect
  `import "<spec>";` that the round-2 measurement adds: (i) guard 2's verdict -
  `types.ts` reaching another module through each construct; (ii) **the
  CLIENT_FILES sweep's verdict** (`gradingResultsHelpersWiring.test.ts:112-117`,
  `BANNED_IMPORT_PATTERNS` at `:89-94`) - a guarded client file reaching another
  module through each construct. **Clause (ii) is new in round 3, Ruling Y1**, for
  the same reason AC-5 states it: `:112-117` is twenty lines from `:128-130` in
  the same file, shares the identical class and corrective rule, and AC-10's
  file set already covers it.
- **Instrument.** `node docs/a23/a23-probe.mjs` before the fix (H3, H4, H5, H9, H10) for
  clause (i). For clause (ii), the same OPTION (b) sweep instrument AC-5 names -
  verified equivalent to `BANNED_IMPORT_PATTERNS` for every fixture used here.
  The delivered guard executed against a copy of the real `types.ts` (i) and a
  copy of a CLIENT_FILES member (ii), each construct injected one at a time,
  after.
- **Direction of failure.** ANY construct leaves EITHER guard GREEN. Measured
  today for (i): H3 (`require`), H4 (dynamic `import`), H5 (single-quoted
  `export *`) and H9 (bare side-effect import) escape; H10 (double-quoted
  `export { x } from`) is caught. Measured today for (ii), via AC-12's OPTION (b)
  sweep fixtures: C3 (`require`), C4 (dynamic `import`) and P6 (bare side-effect
  import) are `flagged=false` in both quote styles - three of the same misses;
  the export forms (C1, C2) are `flagged=true` under the sweep mechanism because
  it matches `from ["']` anywhere in raw source, unlike guard 2's line-filtered
  check. The row's own count is "TWO of the four constructs that got the
  ORIGINAL regex withdrawn still escape its REPLACEMENT". A replacement that
  fails on the same construct list as the thing it replaced is the defect this
  row exists to name, in both checks.
- **Obligation handed on.** Same as AC-5: the test seat's cross-product (Ruling
  X2 (d)) covers clause (ii) too.
- **NARROWED, and I am saying so.** The row's sentence is unqualified about
  "dynamic import()". A criterion demanding that a dynamic import with a
  RUNTIME-COMPUTED specifier (`import(pathVar)`) be caught is **not satisfiable
  by any construction available here** - no static instrument in a node-env
  vitest run can resolve it, and I could describe no implementation that passes.
  So AC-6, like AC-3, binds to constructs whose specifier is a **static string
  literal**. The computed-specifier case is RES-A23-1, not a deletion.

### AC-7 - Every criterion above is discharged by an observed colour CHANGE, and the instrument for "before" is named correctly

- **Object.** For each of AC-1 through AC-6, two recorded runs: one against the
  tree as it stands before the fix, one after.
- **Instrument, CORRECTED in round 2 and this is the correction.** Both guards
  read FIXED sources - guard 1 from four module-level constants, guard 2 from
  `readFileSync` of the real `types.ts` - and neither takes a fixture. So
  **`npx vitest run` on either file is GREEN against the pre-fix tree and CANNOT
  record any "before" red.** Measured:
  `npx vitest run src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts src/app/components/grading-results/gradingResultsHelpersWiring.test.ts`
  reports `Test Files 2 passed (2)` / `Tests 52 passed (52)`. The "before"
  instrument is therefore **`node docs/a23/a23-probe.mjs` (Appendix A.1)**, whose output
  is section 2.2. The "after" instrument is the two `npx vitest run` commands,
  and they become capable of recording a red only under the LANDING ORDER below.
- **LANDING ORDER, which is what makes this criterion dischargeable at all.**
  The hazard fixtures are ADDED to the two guard test files FIRST, as their own
  assertions, and observed RED under `npx vitest run` BEFORE the decision
  procedure is changed. A fix that lands the new procedure and the new fixtures
  in one step has discharged nothing, because no red was ever observed inside
  the suite that will carry the fixtures forward.
- **Direction of failure.** A criterion whose hazard fixture was NEVER OBSERVED
  RED - by the probe before the fix AND by `npx vitest run` after the fixtures
  land and before the procedure changes. If the fix lands and every fixture is
  green at the moment it lands, this criterion has failed regardless of what the
  guard now contains - that is exactly the state Ruling U3 shipped in, and
  `traps-tests.md:8` already rules "A test is not evidence until you have watched
  it fail."

### AC-8 - Every adopted fixture states the direction it pins

- **Object.** The label carried by each fixture the fix adopts, against the
  fixture's CURRENT observed value in section 2.2.
- **Instrument.** The table in section 6 of this document, re-derived by whoever
  adopts the fixtures, via `node docs/a23/a23-probe.mjs`.
- **Direction of failure.** A fixture adopted with its current observed value as
  its expectation. Most of the fixtures in section 6 currently observe the WRONG
  value, so freezing observed values immortalises the defects as expectations.
- **A dropped clause, and I am restoring it rather than inheriting the narrow
  half.** `a22-scope.md:611-618` states the obligation for ALL THREE repo-grades
  fixtures - fixture 1 "pins CORRECT behaviour and is a regression canary",
  fixture 2 "pins the FALSE NEGATIVE and must go RED against today's filter
  before any fix, as a positive control", fixture 3 "pins the FALSE POSITIVE and
  must be asserted in the FIXED direction". The BACKLOG ROW carried only the
  fixture-3 half forward ("the third repo-grades fixture currently pins WRONG
  behaviour"). Reading the row alone would leave fixture 2 unlabelled, and
  fixture 2 is the one pinning the false negative this row is named after. This
  is the two-clause-rule failure `seats.md:97-102` already makes this seat's
  checker ask about.

### Policy (not a pass condition) - the fix should change kind, not strength

**DELETED as a pass condition in round 3, Ruling Y2. Kept below as stated policy
only - no colour, no criterion number, and a checker does not gate on it.**

Round 2's AC-9 asked a checker to read a PROSE CLASSIFICATION - which of three
C-2 shapes the architect says each guard took - and pass or fail on that label.
`seats.md:103-114` already rules a weaker check standing in for a criterion is
itself the defect, and the round-2 checker measured exactly that: a guard built
from `valueImportSpecifiers` (`classTrendsDraft.not-postable.test.ts:98`, the
tree's own dominant idiom, duplicated across five test files) is classification
(ii) under AC-9's own scheme, satisfies it, and CARRIES MORE HOLES than the
per-line classifier it would replace - it escapes on the default-binding-plus-
inline-type form (AC-2 clause (c)) and on every single-quoted case (AC-4). A
label a strictly worse guard can satisfy is not a pass condition; it is prose
that looks like one.

**Deleting AC-9 removes no enforcer.** The obligation it stood in front of - that
the fix must not be another hand-enumerated text filter wearing a new shape - is
already discharged by criteria that ARE executable and were never redundant with
it: **AC-2 clauses (c) and (d)** (the default-binding-plus-inline-type trap and
the bare side-effect import must both still be flagged, whatever the guard's
shape), **AC-3** (guard 1 bound to all five non-`import` constructs, both quote
styles), and **AC-6** (guard 2, now widened to both checks per Ruling Y1, bound
to the same five constructs). A guard that passes those four cannot be the
`valueImportSpecifiers`-shaped guard the checker broke, because that guard fails
AC-2(c) and every single-quoted case AC-3/AC-4/AC-6 require caught. **This is not
a second attempt at the same mechanism** - `iteration-caps.md:41-43`'s cap
binds AC-9 as a defect class (a checkable classification), not the underlying
policy sentence, and the policy is kept, unenforced by any single criterion,
precisely because AC-2/AC-3/AC-6 already enforce its substance by measurement.
**Option (b) is still excluded** - see C-4 and AC-12, which do not depend on
this policy note.

### AC-10 - Both guards, or neither

- **Object.** The shipped diff's file set, against the two paths the row names:
  `src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts` and
  `src/app/components/grading-results/gradingResultsHelpersWiring.test.ts`.
- **Instrument.** `git status --short` at the wave gate, and
  `git diff --name-only` on the chunk.
- **Direction of failure.** Exactly one of the two paths is touched. The row's
  words: "Fix them together or neither." Shipping one half leaves a guard the
  next reader believes in, which is the precise mechanism this row documents -
  and section 2.3 now shows the two guards share five holes exactly, so half a
  fix leaves five of them open in a guard nobody will re-measure.

### AC-11 - Nothing currently caught stops being caught

- **Object.** Five verdicts that are CORRECT today, before and after the fix:
  guard 1 on a single-line value import (P1, both quote styles), on a mixed
  `{ type X, y }` import (P4), and on a default-plus-inline-type import (P5);
  guard 2 on a double-quoted value import (H1), on a brace-wrapped double-quoted
  import (H6), and on a double-quoted `export { x } from` (H10).
- **Instrument.** `node docs/a23/a23-probe.mjs` before, and the two `npx vitest run`
  commands with these as fixtures after.
- **Direction of failure.** Any goes from RED-on-hazard to GREEN-on-hazard. These
  are regression canaries, not targets; a fix that closes the misses by
  restructuring the guard and loses a working catch is a net loss. This is the
  failure direction the row warns about when it says a broken guard "does not
  fail loudly - it passes."

### AC-12 - The real tree still passes, and option (b) is EXCLUDED

- **Object.** (a) The two guard test files' results against the UNMODIFIED tree,
  before and after the fix, plus the whole-repo gates. (b) The classification of
  option (b) - "let the whole-file `BANNED_IMPORT_PATTERNS` sweep stand
  unconditionally in that directory" - against the enumerated-text-filter
  failure mode the deleted AC-9 policy note (above AC-10) names.
- **Instrument.** For (a):
  `npx vitest run src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts src/app/components/grading-results/gradingResultsHelpersWiring.test.ts`
  (green today: `Test Files 2 passed (2)` / `Tests 52 passed (52)`), plus the
  repo gates from `this-repo.md:19-24`: `npx tsc --noEmit` (no output, exit 0),
  `npm run lint` (`4 problems (0 errors, 4 warnings)`, exit 0), `npm test`
  (**re-measured in round 3, MJ-a - round 2's `Test Files 1017 passed` /
  `Tests 20200 passed` was stale by 75 files and 1561 tests -** `npx vitest run`
  now reports `Test Files 1092 passed (1092)` / `Tests 21761 passed (21761)`,
  exit 0; lint re-run and unchanged at `4 problems (0 errors, 4 warnings)`, exit
  0). For (b): `node docs/a23/a23-probe.mjs` (relocated there, Ruling Y5),
  whose `OPTION (b)` block runs the unconditional sweep over the same
  constructs.
- **Direction of failure.** For (a): the fix turns the real tree RED. For (b):
  the delivered fix IS option (b).
- **RULING X1, inherited. OPTION (b) IS EXCLUDED, on two independent measured
  grounds, and I am recording both rather than leaving it "live but costly" as
  round 1 did.**
  1. **It is the enumerated-text-filter shape the deleted AC-9 policy note
     forbids strengthening again.** The unconditional sweep is the four regexes
     at `:259-262`, all of which require the literal token `from` followed by a
     quote. Measured, `OPTION (b)` block of `docs/a23/a23-probe.mjs`: the sweep is
     `flagged=false` on the from-wrap (P2b), on the tab separator (P2c), on the
     bare side-effect import (P6), on `require(<literal>)` (C3) and on
     `await import(<literal>)` (C4) - **five misses, in both quote styles**. Its
     completeness depends entirely on which syntactic forms were enumerated,
     which is the shape the row forbids ("WHAT THIS ROW MUST NOT DO: reach for a
     better regex").
  2. **AC-2 independently forbids it.** The sweep is `flagged=true` on the inline
     ALL-TYPE import (P3), and - measured against the real file, not a fixture -
     `flagged=true` on `src/app/components/repo-grades/repoGradesCellEdits.ts`
     itself, because `:30` carries
     `import type { RubricAreaResult, SubmittedFileInfo } from "@/lib/grade";`
     and that file IS one of the four in `REPO_GRADES_CLIENT_FILES:265-270`. An
     unconditional sweep therefore turns the real tree RED on a legitimate
     type-only import, failing clause (a) of AC-12 and clause (a) of AC-2 at
     once. **The row's own instruction, "MEASURE whether any does before choosing
     this", is discharged: one does, and it is named.**
  - **What round 1 got wrong here, stated plainly.** Round 1 wrote "Option (b) is
    not off the table; it is not free". That left AC-12 permitting a course AC-2
    forbade on its own, and the architect is the immediate consumer of that
    contradiction. The measurement round 1 made was sound; the conclusion it drew
    from it was not.

---

## 6. Fixture direction table - what each pins, and why

Required by the row ("state WHICH DIRECTION each frozen fixture pins"). This
table states DIRECTIONS for the constructs the criteria name. **It is not the
test seat's fixture set** - the enumerated cross-product of guard x wrap position
x quote style x construct is that seat's, per Ruling X2 (d). "Observed today" is
from `node docs/a23/a23-probe.mjs` (section 2.2).

| # | Fixture | Observed today | What it pins | Expected colour BEFORE the fix | Role |
|---|---|---|---|---|---|
| P1 | guard 1, single-line VALUE import, either quote style | flagged | **CORRECT behaviour** | RED on hazard (guard fires) | regression canary (AC-11) |
| P2a | guard 1, wrap INSIDE the braces | not flagged | **a FALSE NEGATIVE** | GREEN-on-hazard, i.e. the guard fails to fire | positive control (AC-1, AC-7) |
| P2b | guard 1, wrap between `from` and the specifier | not flagged | **a FALSE NEGATIVE** | GREEN-on-hazard | positive control (AC-1, AC-7) |
| P2c | guard 1, TAB between `from` and the specifier | not flagged | **a FALSE NEGATIVE on a SINGLE LINE** | GREEN-on-hazard | positive control (AC-1); the fixture that disproves "multi-line" as the axis |
| P3 | guard 1, inline ALL-TYPE import | flagged | **the FALSE POSITIVE** | must be asserted in the FIXED direction (not flagged), RED today | positive control (AC-2, AC-7) |
| P4 | guard 1, MIXED `{ type X, y }` | flagged | **CORRECT behaviour** | RED on hazard | regression canary (AC-2 (b), AC-11) |
| P5 | guard 1, DEFAULT binding `Grade, { type X }` | flagged | **CORRECT behaviour - and the form a naive every-braced-binding fix would open** | RED on hazard | regression canary (AC-2 (c), AC-11) |
| P6 | guard 1, bare side-effect `import "<banned>";` | not flagged | **a FALSE NEGATIVE** | GREEN-on-hazard | positive control (AC-2 (d), AC-3) |
| C1 | guard 1, `export * from` | not flagged | a MISS | GREEN-on-hazard | positive control (AC-3) |
| C2 | guard 1, `export { x } from` | not flagged | a MISS | GREEN-on-hazard | positive control (AC-3) |
| C3 | guard 1, `require(<literal>)` | not flagged | a MISS | GREEN-on-hazard | positive control (AC-3) |
| C4 | guard 1, `await import(<literal>)` | not flagged | a MISS | GREEN-on-hazard | positive control (AC-3) |
| H1 | guard 2, double-quoted server VALUE import | caught | **CORRECT behaviour** | RED on hazard | regression canary (AC-11) |
| H2 | guard 2, SINGLE-QUOTED server VALUE import | escapes | a MISS | GREEN-on-hazard | positive control (AC-4) |
| H3 | guard 2, `require(<literal>)` | escapes | a MISS | GREEN-on-hazard | positive control (AC-6) |
| H4 | guard 2, dynamic `await import(<literal>)` | escapes | a MISS | GREEN-on-hazard | positive control (AC-6) |
| H5 | guard 2, single-quoted `export * from` | escapes | a MISS | GREEN-on-hazard | positive control (AC-6) |
| H6 | guard 2, wrap INSIDE the braces, double-quoted | caught | **CORRECT behaviour, DOUBLE-QUOTED ONLY.** Round 2's claim here read "guard 2 has no brace-wrap hole" (unqualified) - **STRUCK, Ruling Y3**: no single-quoted brace-wrap probe exists, and guard 2's filter requires a literal double quote (`gradingResultsHelpersWiring.test.ts:130`), so a single-quoted brace-wrap is not shown caught by anything measured here. | RED on hazard (double-quoted case only) | regression canary (AC-5, AC-11), double-quoted case only; single-quoted brace-wrap is unmeasured and owed to the test seat's cross-product (Ruling X2 (d), re-derivation obligation in section 2.3) |
| H7 | guard 2, wrap between `from` and the specifier | escapes | **a FALSE NEGATIVE round 1 asserted did not exist** | GREEN-on-hazard | positive control (AC-5) |
| H8 | guard 2, TAB between `from` and the specifier | escapes | **a FALSE NEGATIVE on a SINGLE LINE** | GREEN-on-hazard | positive control (AC-5) |
| H9 | guard 2, bare side-effect `import "<spec>";` | escapes | a MISS | GREEN-on-hazard | positive control (AC-6) |
| H10 | guard 2, double-quoted `export { x } from` | caught | **CORRECT behaviour, DOUBLE-QUOTED ONLY.** Round 2 reported this cell as "caught" without stating the single-quoted twin is UNMEASURED and, by guard 2's own double-quote-only filter, escapes - **the omission is STRUCK, Ruling Y3**. | RED on hazard (double-quoted case only) | regression canary (AC-11), double-quoted case only; single-quoted `export { x } from` owed to the test seat's cross-product |

**Nothing in this table is adopted as-is.** Every row whose "Observed today" is
`not flagged` or `escapes`, plus P3, pins a defect; each is an expectation only
after its direction is INVERTED.

---

## 7. Findings

- **F-1 (stale citation, in the row itself) - DISCHARGED, carried for the
  record.** Round 1 found `docs/backlog.yml`'s `title` and `instrument` fields
  locating guard 1 at `repoGradesFeedbackAndFiles.wiring.test.ts:287-291` where
  the measured address is `:295-297`. The orchestrator corrected the row at
  `a0c1b53`; measured here, `sed -n '429,440p' docs/backlog.yml` shows `:431`
  and `:435` now carry `:295-297`. **RES-A23-6 of round 1 is STRUCK.**
- **F-2 (coverage gap, adjacent class, NOT chartered).** `repoGradesPosting.ts:56`
  value-imports `@/lib/grade/postable`, a specifier the prefix pattern at
  `repoGradesFeedbackAndFiles.wiring.test.ts:260` bans (the constant spans
  `:258-263`), and that file is absent from `REPO_GRADES_CLIENT_FILES:265-270`.
  **Round 1 cited this pattern at `:269`; measured, `:269` is
  `{ label: "useRepoGradesBulkGrade.ts", source: BULK_HOOK_SOURCE },`, inside a
  different constant. Round 1's own section 2 cited it correctly at `:258-263`;
  the finding text contradicted it. Corrected here.** Not a bundle hazard today
  (section 2.1). This is coverage-by-omission, the class A22 closed in
  `grading-results/` with a directory sweep, and chartering it here would widen
  the row. RES-A23-2.
- **F-3 (third site of the same line-filter idiom).** The `Grep` tool for
  `/^\s*import\b/` across `src` returns two sites:
  `src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts:297`
  and `src/app/components/snapshot-grading/snapshot-grading.structure.test.ts:801`.
  The second is the same mechanism (an import-intent decision from a per-line
  text filter) guarding Ruling B35-20. It is not currently leaking - the
  `docs/a23/a23-scan.mjs` statement regex applied to `src/app/actions/snapshot-grade.ts`
  alone (`node -e` over that one file, **123** lines by
  `@(Get-Content src/app/actions/snapshot-grade.ts).Count` - **corrected in
  round 3, MJ-f: round 2 said 124, off by one in the `split("\n").length`
  direction `this-repo.md:147-151` already names**) reports 6 import statements
  and 0 multi-line, and `grep -n "extractRubricCriteria" src/app/actions/snapshot-grade.ts`
  returns exactly one line, the comment at
  `:73` - and it has a partial backstop at **`:807-809`** (a comment-stripped
  whole-file check for a live call, `it(` at `:807`, body `:808-809`; **round 1
  cited `:806`, which is blank, and cited the file by bare basename - both
  corrected here**), which an import-without-call re-export would still escape.
  Whether A23 covers a third site is a scope question for the owner, not a
  defect. RES-A23-4.
- **F-4 (no live contradiction from A22).**
  `grep -rn 'CodeRunResult } from "../code-runner"' src` returns 5 hits; exactly
  one is an assertion - `gradingResultsHelpersWiring.test.ts:131`, the frozen
  literal A23 will change. The other four are real imports
  (`src/lib/grade/engine.ts:8`, `types.ts:1`, `utils.ts:2`, `utils.test.ts:8`).
  A22's AC-3 pinned it as a criterion in `a22-scope.md`, but no SECOND test in
  the tree asserts it, so changing it breaks no landed gate.
- **F-5 (NEW in round 2; a live `import()` inside a guarded file, adjacent class,
  NOT chartered).** Measured across the full guarded set - the four files of
  `REPO_GRADES_CLIENT_FILES:265-270`, the **TWELVE** of guard 2's `CLIENT_FILES`
  (`gradingResultsHelpersWiring.test.ts:62-80` - **corrected in round 3, MJ-b:
  round 2 said "thirteen" twice; `CLIENT_FILES` is a 12-entry array, re-counted
  by opening the array literal**) and `src/lib/grade/types.ts` -
  `grep -c "import *(\|require *("` returns non-zero for exactly two files, and
  only one of them is code: **`grading-results/SubmittedFilesPanel.tsx:25`
  carries `const MonacoFileEditor = dynamic(() => import("../MonacoFileEditor"), {`**
  (the other, `repoGradesCellEdits.ts:25`, is comment prose). Its specifier is a
  static literal, so AC-3's and AC-6's narrowing does not exclude it - but it
  means the `next/dynamic` + `import()` idiom is LIVE inside a file guard 2
  sweeps, and guard 2's sweep over `CLIENT_FILES` (`:112-117`) is four regexes
  all requiring `from`, which no `import()` carries. A `dynamic(() => import("@/lib/grade"))`
  added to that file today would be flagged by nothing. Adjacent class
  (coverage of a non-`from` construct in the SWEEP rather than in the two guards
  the row names), deliberately not folded in. RES-A23-7.

---

## 8. Concurrency and write-set flags

- Expected write set spans `src/app/components/repo-grades/` and
  `src/app/components/grading-results/`, per the row.
- **No collision with live A21 work.** The A21 implementer holds
  `src/app/actions/`, `src/lib/prompt-announcement-*`, and
  `src/app/components/canvas-tab/`. **Round 1 reported "18 paths" from a
  `git status --short` taken at `b90cf03`; that reading is not reproducible
  post-hoc and I am withdrawing the number rather than restating it.** Measured
  now at `a0c1b53`, `git status --short` returns one path, `M docs/css-orphans.md`.
  Intersection with A23's expected write set by exact path: **empty**. The
  disjointness conclusion holds under both readings; only the count was
  unverifiable.
- **A22 sequencing is discharged.** A22 landed at `7375a21`; `git log` confirms
  the commit, and the row's predicted line shift for guard 2 (`:128-130` filter,
  `:131` literal) is measured correct in section 2.2.
- This document wrote exactly one path: `docs/a23-criteria.md`, verified by
  `git status --short` before and after.

---

## 9. Residual register

Every entry carries an owner, an instrument and a step. Any entry missing one of
the three would be a deletion and I would say so; none is.

**NO RESIDUAL ID CHANGES MEANING BETWEEN ROUNDS, and that constrains the
numbering here.** Round 1's RES-A23-3 is closed by measurement inside AC-2 and
round 1's RES-A23-6 is struck (F-1 discharged at `a0c1b53`). Those two ids are
RETIRED, not reissued - the backlog row at `a0c1b53` already names round 1's
residuals by number, and reusing a retired number for a different residual is
the stale-citation class wearing a new hat. So RES-A23-4 and RES-A23-5 keep the
meanings they had in round 1, and the two residuals round 2 adds take fresh
numbers, RES-A23-7 and RES-A23-8.

| Id | Residual | Owner | Instrument | Step that will measure it |
|---|---|---|---|---|
| RES-A23-1 | AC-3 and AC-6 are narrowed to STATIC-LITERAL specifiers. A dynamic `import(pathVar)` with a runtime-computed specifier is caught by no construction available here. **Instrument RE-BOUND in round 2: round 1 named `grep -rn "import(" src/lib/grade/ --include=*.ts` and called it "0 today"; executed, that command returns SEVEN, five of them live dynamic imports at `src/lib/grade/engine.ts:403,404,405,473,474`, and it scans a directory no guard asserts over.** The object is a computed specifier inside a GUARDED file. | Test seat, then repo owner if it must be closed | `grep -c "import *(\|require *("` over the 17 guarded files - the four of `REPO_GRADES_CLIENT_FILES:265-270`, the **twelve** of `CLIENT_FILES` at `gradingResultsHelpersWiring.test.ts:62-80` (**corrected in round 3, MJ-b: `CLIENT_FILES` is a 12-entry array; 4 + 12 + 1 = 17, so the 17 total was right only because the part used to derive it was never actually 13 - round 2's "thirteen" and "17" were not cross-checked against each other**), and `src/lib/grade/types.ts` - re-run at the fix. Measured now: two non-zero, one comment prose and one a STATIC-literal `dynamic(() => import(...))` (F-5); **computed specifiers in the guarded set: zero.** Plus a stated non-goal in the delivered test's comment | The test seat's oracle round on A23 |
| RES-A23-2 | F-2: `repoGradesPosting.ts:56` carries a banned-specifier VALUE import and is not in the guard's file list. Coverage-by-omission, adjacent class, not chartered by A23. | Repo owner (scope call), then orchestrator as a backlog row | `node docs/a23/a23-scan.mjs src/app/components/repo-grades` (Appendix A.2) re-run, cross-referenced against `REPO_GRADES_CLIENT_FILES:265-270` | Escalated at A23's disposal round; a row filed if the owner widens scope |
| RES-A23-4 | F-3: `snapshot-grading.structure.test.ts:801` is a third site of the same line-filter idiom, not leaking today, partial backstop at `:807-809`. | Repo owner (scope call) | `Grep` tool for `/^\s*import\b/` over `src` (2 sites today) with a matching-string canary - never bash `grep -rn`, which returns a false empty (see RES-A23-8) | Escalated with RES-A23-2 at A23's disposal round |
| RES-A23-5 | Client-bundle safety's only true oracle is `next build`'s compile stage; these guards are proxies for it. This checkout has no `.env`, so the build gate is read as the `Compiled successfully` line, never exit 0 (**corrected in round 3, MJ-`this-repo.md`**: the build-gate statement is at `this-repo.md:52-54`, not `:24,26`). | Repo owner | `npm run build`, grepping for `Compiled successfully`; then the Vercel deploy log | A23's push |
| RES-A23-7 | **WIDENED in round 3, Ruling Y1** - round 2 stated this only as F-5's single live `dynamic(() => import("../MonacoFileEditor"))` at `grading-results/SubmittedFilesPanel.tsx:25`, chartered by neither guard. F-5 stays as that instance (Ruling Y1: "F-5 stays as the instance it is"), but this residual now names the MECHANISM: `gradingResultsHelpersWiring.test.ts:112-117`'s `BANNED_IMPORT_PATTERNS` sweep (`:89-94`) over `CLIENT_FILES` shares guard 2's identical five-hole set (from-wrap, tab-separator, bare side-effect import, `require(<literal>)`, `dynamic(() => import(...))`, both quote styles) - AC-5 and AC-6 now bind the fix criteria to it (Ruling Y1), but this residual remains for what the fix criteria narrow away: a computed (non-literal) specifier reaching a guarded file through any of those five constructs, which is unmeasurable here for the same reason RES-A23-1 narrows to static literals. Adjacent class, not chartered beyond what AC-5/AC-6 now cover. | Repo owner (scope call), then orchestrator as a backlog row | **Widened from a presence-only grep to the five-construct mechanism - the round-2 instrument saw only 2 of 5 holes (require/dynamic-import presence).** `node docs/a23/a23-probe.mjs`'s (`docs/a23/a23-probe.mjs`) `guard1SweepFlags`-equivalent applied to `BANNED_IMPORT_PATTERNS` (verified regex-equivalent to guard 1's `BANNED` for every fixture here, AC-5/AC-6), run against each CLIENT_FILES member with the from-wrap, tab-separator, bare-side-effect-import, `require(<literal>)` and `dynamic(() => import(...))` fixtures injected, both quote styles, cross-referenced against `BANNED_IMPORT_PATTERNS` at `:89-94` | Escalated with RES-A23-2 at A23's disposal round |
| RES-A23-8 | **TRAP-CARD CANDIDATE, not only a residual.** A bash `grep -rn '/^\s*import\b/' src --include=*.ts` returns EMPTY through shell escaping while the `Grep` tool returns both sites; the canary is what distinguished false absence from true absence. `traps-search.md:6` already carries the general canary rule and `:110-121` carries the same CLASS for heredocs (backslashes arriving different through bash), but **no `grep`-argument instance is on the card.** Reproduced by two agents. | Orchestrator (`traps-search.md` is not this seat's to write) | The pair, run together: `grep -rn '/^\s*import\b/' src --include=*.ts` (empty) against the `Grep` tool for the same pattern (2 sites), with the canary `grep -rc 'from "' src/lib/grade/types.ts` returning 2 to prove the bash grep works at all | A23's backlog reconciliation, at the push |

**These residuals are not in `docs/BACKLOG.md` yet, and until they are they do
not exist** (`DEV_LOOP.md:79-84`). `docs/backlog.yml` is the orchestrator's file
and this seat may not write it; recording them there is owed at A23's
reconciliation.

**CORRECTED in round 3, Ruling Y4/MJ-d.** Round 2 wrote that "the backlog row at
`a0c1b53` already names round 1's residuals by number" and ordered the
reconciliation to STRIKE RES-A23-3 and RES-A23-6 there. **That ground is false**:
`sed -n '429,440p' docs/backlog.yml`'s `note` field at the cited commit contains
ONLY `RES-A23-1` and `RES-A23-2` by number - RES-A23-3 and RES-A23-6 were never
written into the row at all, so an instruction to strike them there orders an
edit to text that does not exist.

**THE CORRECT RECONCILIATION**, owed at A23's push, is instead: re-bind
RES-A23-1's instrument to the round-3 wording above (the twelve-entry
`CLIENT_FILES` correction, MJ-b); **ADD RES-A23-7 and RES-A23-8** to A23's `note`
field, both by number, with their round-3 statements and instruments; and
**RECORD RES-A23-3 and RES-A23-6 there AS RETIRED** (added, not struck - they
were never present to strike) so nothing in the backlog reissues those numbers
for a different residual once this document is superseded. RES-A23-2, RES-A23-4
and RES-A23-5 are unchanged in meaning and need no row edit beyond what is
already there.

---

## 10. What I could not determine

- **Whether the guard's false negative ever let something through
  HISTORICALLY.** Section 2.1 measures the tree at `a0c1b53` only. A multi-line
  banned import that existed and was later removed would leave no trace in a
  working-tree scan. I did not walk the history, and I am not claiming the guard
  has never been decorative - only that it is not decorative today.
- **Whether `repoGradesPosting.ts` is reachable from a client bundle at all.**
  That is a module-graph question and belongs to the architect. I measured only
  that its banned-specifier import resolves to a leaf whose sole import is
  type-only.
- **Which of the three C-2 shapes each fix should take.** Deliberately not
  decided here - that is the architect's lane, and AC-2, AC-3, AC-6 and AC-12
  are written to constrain the choice without making it (the policy note above
  AC-10, round 3, names why no single criterion classifies the shape directly).
  Option (b) is excluded by Ruling X1; the two shapes the row leaves live are a
  walled set derived from the tree at test time and a transitive import-graph
  walk.
- **Whether guard 1 and guard 2 should converge on ONE construction or stay two.**
  Section 2.3 shows five holes shared exactly and four not shared, which is an
  argument in both directions. The architect owns it; AC-10 only requires that
  whatever is chosen lands for both.

---

## 11. Disposition of round 1's findings

Every finding the checker returned, mapped to one of the four legal disposals
(`iteration-caps.md:55-72`) or to a ruling. The id column was derived after all
renumbering.

| Round-1 finding | Disposal | Where it landed |
|---|---|---|
| **B1** - guard 1 never bound to the non-`import` construct set; symmetry claim from asymmetric evidence | **Ruling X2**, then revised | **AC-3** (new criterion, guard 1 x five constructs x both quote styles); **AC-1** rewritten to the wrap-position/separator axis; **AC-5** added for guard 2's from-wrap and tab holes; section 2.3 restated as a measured per-guard-per-construct map; the one-line cost statement at the end of section 2.3. Cross-product relocated to the test seat per X2 (d) and named as an obligation in AC-1 and AC-3. |
| **B2** - AC-10 kept option (b) live while AC-2 and AC-7 forbade it; the architect is the immediate consumer of the contradiction | **Ruling X1**, then revised | **AC-12** states option (b) is EXCLUDED with two independent measured grounds (the sweep's five misses; the sweep reddening the real `repoGradesCellEdits.ts`), **C-4** records it as inherited, **AC-9** closes by naming it removed from the choices. The `repoGradesCellEdits.ts:30` measurement is KEPT and is what makes the exclusion concrete. |
| **M1** - RES-A23-1's instrument returns 7, not 0, and measures the wrong object | **Revised (instrument re-bound and re-measured)** | **RES-A23-1**: the old command and its true output (7, five live at `engine.ts:403,404,405,473,474`) are recorded as the error; the new instrument scans the 17 GUARDED files and measures zero computed specifiers. The narrowing itself is unchanged - it was honest. |
| **M2** - `:269` cited as a specifier pattern; it is inside `REPO_GRADES_CLIENT_FILES` | **Revised (citation corrected)** | **F-2** now cites the prefix pattern at `:260` inside `:258-263`, and records what `:269` actually is. Section 2.1 qualification 2 carries the same corrected cites. |
| **m1** - AC-5's `npx vitest run` instruments are green pre-fix and cannot record the demanded red | **Revised (instrument corrected, landing order added)** | **AC-7**: the "before" instrument is now `node docs/a23/a23-probe.mjs`; the measured green (`2 passed` / `52 passed`) is recorded; a red-first LANDING ORDER is stated that makes the criterion dischargeable inside the suite. The demand is unchanged. |
| **m2** - section 2's quantities came from a vanished scratchpad script | **Revised (made re-runnable)** | **Appendix A** reproduces both scripts in full; section 2 names them by command. Also corrected in passing: the scan's `dynamic import(` counter is over-broad and its 3 resolve to comment prose. |
| **m3** - F-3's backstop is `:807-809` not `:806`; file cited by bare basename | **Revised (both corrected)** | **F-3**, with the full path `src/app/components/snapshot-grading/snapshot-grading.structure.test.ts` and `:807-809` measured (`:806` is blank). |
| **m4** - RES-A23-3 deferred a one-line measurement AC-2 presupposes | **Closed by measurement; residual withdrawn** | **AC-2** now carries P4 (`flagged=true`), P5 (`flagged=true`) and P6 (`flagged=false`) as measured facts, and P4/P5/P6 are rows in section 6. No residual survives. The checker's added form - the DEFAULT value binding - is clause (c) of AC-2 and an explicit failure direction (iii). |
| **m5** - section 8's "18 paths" unverifiable post-hoc | **Withdrawn (d), enforcer named** | **Section 8** withdraws the number, records the current measurement (1 path at `a0c1b53`), and states that the disjointness conclusion - the thing the number was protecting - holds under both readings. The enforcer is unchanged: `git status --short` at the wave gate, per AC-10. |

---

## 12. Disposition of round 1's criteria

Round 1 shipped AC-1 to AC-10 and RES-A23-1 to RES-A23-6. This table maps every
one. **The id column was derived LAST, after all renumbering.** Criteria ids are
positional and were re-derived freely; residual ids were NOT, because the backlog
row at `a0c1b53` already cites them by number - a withdrawn residual's id is
retired rather than reissued.

| Round-1 id | Disposition | Round-2 id |
|---|---|---|
| AC-1 (guard 1, "more than one line") | **KEPT, axis corrected** - the object is now wrap position and separator kind, which the tab fixture (P2c, single-line, escapes) proves is the real axis | AC-1 |
| AC-2 (guard 1, type/value pair) | **KEPT, widened by measurement** - clauses (c) default binding and (d) bare side-effect import added; failure direction (iii) added | AC-2 |
| - (did not exist) | **NEW** - guard 1 bound to the non-`import` construct set, Ruling X2 (a) | AC-3 |
| AC-3 (guard 2, quote style) | **KEPT unchanged in substance**; instrument split into before (probe) / after (vitest) | AC-4 |
| - (did not exist) | **NEW** - guard 2 bound to wrap position and separator kind, from Ruling X2 half B (H7, H8 escape) | AC-5 |
| AC-4 (guard 2, U3 construct set) | **KEPT, widened** - `export { x } from` and the bare side-effect import added; the narrowing note is unchanged and was called honest | AC-6 |
| AC-5 (observed colour change) | **KEPT, instrument corrected** - m1; red-first landing order added | AC-7 |
| AC-6 (fixture direction labels) | **KEPT unchanged**, including the restored `a22-scope.md:611-618` fixture-2 clause | AC-8 |
| AC-7 (kind not strength) | **KEPT, scoped to both guards**, and option (b) removed from its choices per Ruling X1 | AC-9 |
| AC-8 (both guards or neither) | **KEPT**, with the five-shared-holes measurement added as the reason half a fix is worse than it looks | AC-10 |
| AC-9 (nothing caught stops being caught) | **KEPT, widened** from two canaries to six, all measured correct today | AC-11 |
| AC-10 (real tree still passes; option (b)) | **KEPT, conclusion reversed by Ruling X1** - the `repoGradesCellEdits.ts:30` measurement is kept and is now the second of two grounds for exclusion | AC-12 |
| RES-A23-1 (computed specifier) | **KEPT, instrument re-bound** - M1 | RES-A23-1 |
| RES-A23-2 (F-2 coverage gap) | **KEPT unchanged** | RES-A23-2 |
| RES-A23-3 (P4 unmeasured) | **WITHDRAWN (d)** - closed by measurement in AC-2; enforcer it protected is now AC-2 clause (b) plus the P4 row of section 6, both with observed values | - (id RETIRED, not reissued) |
| RES-A23-4 (F-3 third site) | **KEPT, id unchanged**; `:806` corrected to `:807-809` and the bare basename replaced with the full path | RES-A23-4 |
| RES-A23-5 (`next build` is the true oracle) | **KEPT, id unchanged**; `this-repo.md:22,26` corrected to `:24,26` | RES-A23-5 |
| RES-A23-6 (row's stale cite) | **STRUCK** - discharged by the orchestrator at `a0c1b53`; re-measured here and the row now carries `:295-297` | - (id RETIRED, not reissued) |
| - (did not exist) | **NEW** - F-5, the live `import()` inside a swept file | RES-A23-7 |
| - (did not exist) | **NEW** - the bash-grep false absence, promoted from a method note inside F-3 to a trap-card candidate with its own owner, instrument and step | RES-A23-8 |

---

## 13. Disposition of round 2's findings

Round 2's fresh checker returned NOT CLEAN: three blockers (BL-1 through BL-3)
and six mechanical (MJ) corrections, plus minors. Per `iteration-caps.md:44-49`
(cap 2) this is the disposal round: no new requirements, dispositions only.
Two of the three blockers are REPEATs of round-1 classes and are disposed by
relocation and strike per `iteration-caps.md:55-72`, not re-litigated.

| Round-2 finding | Class | Disposal | Where it landed |
|---|---|---|---|
| **BL-1** - three claims in section 2.3 and section 6 are measured false: `:582`'s (round-2 numbering) "guard 2 has no brace-wrap hole" (single-quoted brace-wrap DOES escape); the `export { x } from` guard-2 cell reporting "caught double-quoted" while omitting the single-quoted twin escapes; the `export * from` guard-2 cell claiming "caught double-quoted" when no double-quoted probe exists (an INFERRED verdict, which is exactly what section 2.3's own header disclaims) | **REPEAT of the asymmetric-evidence class** (round 1's B1) | **(a) Relocate + (d) strike, Ruling Y3.** All three claims STRUCK, not re-measured (a second attempt at the same class is forbidden, `iteration-caps.md:41-43`). | Section 2.3's cells (wrap-inside-braces, `export * from`, `export { x } from` rows) and section 6's H6 and H10 rows now mark what is measured vs. UNMEASURED per quote style. The obligation to re-derive sections 2.3 and 6 and report every wrong cell is attached to the already-relocated test-seat cross-product (Ruling X2 (d)). |
| **BL-2** - guard 2 is named only as the `:128-130` walled-set check, but `:112-117`'s `CLIENT_FILES` sweep (`BANNED_IMPORT_PATTERNS` at `:89-94`), twenty lines above in the same file, shares the identical five-hole set (from-wrap, tab-separator, bare side-effect import, `require(<literal>)`, `dynamic(() => import(...))`, both quote styles) and nothing in round 2 bound it to any criterion | **NEW - a scope-boundary gap** (not a repeat: round 1 never named `:112-117` at all) | **Ruling Y1 - IN SCOPE**, a scope call only the orchestrator can make. Widen the affected criteria's OBJECT to name both checks; no new criteria invented. | AC-5 and AC-6 widened to bind clause (ii), the `:112-117` sweep, alongside guard 2's `:128-130` check. RES-A23-7 widened from a presence-only grep (2 of 5 holes) to the five-construct mechanism. F-5 unchanged as the instance. |
| **BL-3** - AC-9 asked a checker to read a PROSE CLASSIFICATION (which of three C-2 shapes a guard took) and pass/fail on the label; measured, a guard built from `valueImportSpecifiers` (the tree's own dominant idiom, five test files) satisfies classification (ii) while carrying MORE holes than the classifier it replaces | **REPEAT of "a check whose assertion cannot fail"** (a weaker check standing in for a criterion, `seats.md:103-114`) | **(d) Delete, Ruling Y2.** AC-9 deleted as a pass condition; strengthening the classification a second time is the forbidden second attempt (`iteration-caps.md:41-43`). | Kept as an unnumbered POLICY note above AC-10, enforcement transferred to AC-2(c)/(d), AC-3 and AC-6 (already executable, never redundant with AC-9). Every cross-reference to AC-9 as a live pass condition (AC-12, section 10) repointed to those four criteria or to the policy note by name, not by a reissued number. |
| **MJ-a** - AC-12's pass condition quoted `npm test` as `Test Files 1017 passed` / `Tests 20200 passed`, stale against HEAD | Mechanical (stale re-quoted number) | **Revised - re-measured** | AC-12 now quotes `npx vitest run`: `Test Files 1092 passed (1092)` / `Tests 21761 passed (21761)`, re-run 2026-09-20; `npm run lint` re-run and unchanged at `4 problems (0 errors, 4 warnings)`. |
| **MJ-b** - "the THIRTEEN of `CLIENT_FILES`" (F-5, RES-A23-1) and "the 17 guarded files" - `CLIENT_FILES` is a 12-entry array, and 4+13+1=18 not 17 | Mechanical (uncross-checked arithmetic) | **Revised - re-counted** | F-5 and RES-A23-1 now say TWELVE, with the array re-opened and counted; the 17 total is noted as correct only because the actual part was always 12, never 13. |
| **MJ-c** - header said `Tree: a0c1b53`, but the two most load-bearing quotes (C-4/AC-12's option-b exclusion, section 2.3) landed at `e71a085`, one commit later | Mechanical (stale tree citation) | **Revised - corrected** | Header and section 1 now cite `e71a085` for the row; re-measured round-3 quantities are flagged as read at current HEAD, `5ed14cd`. |
| **MJ-d** - section 9 claimed "the backlog row at `a0c1b53` already names round 1's residuals by number" and ordered a STRIKE of RES-A23-3 and RES-A23-6 there; measured, the row's `note` names only RES-A23-1 and RES-A23-2 | Mechanical (instruction targeting text that does not exist) | **Revised - reconciliation corrected** | Section 9's closing paragraph now orders: re-bind RES-A23-1's instrument, ADD RES-A23-7 and RES-A23-8 to the row, and RECORD RES-A23-3 and RES-A23-6 there AS RETIRED (added, not struck). |
| **MJ-e** - C-2 cited `classTrendsDraft.not-postable.test.ts:50` (mid-comment) for the transitive-walk shape, and the shape list omitted `valueImportSpecifiers`, the tree's own dominant idiom | Mechanical (stale line cite) + entry-gate (an enumeration presented as the set) | **Revised - corrected and widened** | C-2 now cites `FORBIDDEN_PATH_PREFIXES` at `:58` and `walkForForbiddenImports` at `:119`; `valueImportSpecifiers` (`:98`) is named as the omitted idiom, with `traps-spec.md:30-33`'s "an enumeration is a floor" rule stated at the point the list appears. |
| **MJ-f** - F-3 said `snapshot-grade.ts` is "124 lines" | Mechanical (off-by-one, `split("\n").length` direction) | **Revised - re-measured** | F-3 now cites 123, via `@(Get-Content src/app/actions/snapshot-grade.ts).Count`. |
| **Minors** - document line count (978 vs. measured 977), section 1's title quote lacking a leading ellipsis, Appendix A's non-re-runnable fenced form | Mechanical / entry-gate | **Revised** | Title quote now opens with `...`; Appendix A relocated per Ruling Y5 below, which supersedes the line-count and section-length minors (the document's shape changed). |

## 14. Disposition of round 2's criteria

Round 2 shipped AC-1 to AC-12 (with AC-9 as a checkable classification) and
RES-A23-1 to RES-A23-8. This table maps every one to its round-3 disposition.
**The id column was derived LAST.** Criteria ids remain positional; residual ids
are NOT reissued, per section 9's numbering rule.

| Round-2 id | Disposition | Round-3 id |
|---|---|---|
| AC-1 through AC-4 | **KEPT unchanged in substance** - no round-2 finding touched them | AC-1 through AC-4 |
| AC-5 (guard 2, wrap/separator) | **KEPT, WIDENED** - object clause (ii) added for the `:112-117` sweep, Ruling Y1 | AC-5 |
| AC-6 (guard 2, U3 construct set) | **KEPT, WIDENED** - object clause (ii) added for the `:112-117` sweep, Ruling Y1 | AC-6 |
| AC-7, AC-8 | **KEPT unchanged in substance** | AC-7, AC-8 |
| AC-9 (fix changes kind, not strength) | **DELETED as a pass condition, Ruling Y2** - kept as an unnumbered policy note; enforcement transferred to AC-2(c)/(d), AC-3, AC-6 | - (id RETIRED, not reissued; the policy note carries no number) |
| AC-10, AC-11 | **KEPT unchanged in substance**; every internal cross-reference to the deleted AC-9 repointed | AC-10, AC-11 |
| AC-12 (real tree passes; option (b) excluded) | **KEPT, re-measured (MJ-a)**; its clause (b) reasoning repointed from "AC-9's two-way classification" to the enumerated-text-filter failure mode the policy note names | AC-12 |
| RES-A23-1 (computed specifier) | **KEPT, instrument re-derivation corrected (MJ-b)** - twelve, not thirteen, `CLIENT_FILES` entries | RES-A23-1 |
| RES-A23-2, RES-A23-4, RES-A23-5 | **KEPT unchanged in meaning**; RES-A23-5's `this-repo.md` cite corrected to `:52-54` (MJ-d/minors) | RES-A23-2, RES-A23-4, RES-A23-5 |
| RES-A23-3, RES-A23-6 | **KEPT RETIRED from round 1**; round 2's instruction to "strike" them at the backlog row is corrected (MJ-d) to "record as retired", since the row never carried them to begin with | - (ids remain RETIRED, not reissued) |
| RES-A23-7 (live `import()` in a swept file) | **KEPT, WIDENED (Ruling Y1)** from a single-file instance to the five-construct mechanism shared by both checks; instrument widened from a presence-only grep to the full construct sweep | RES-A23-7 |
| RES-A23-8 (bash-grep false absence, trap-card candidate) | **KEPT unchanged** | RES-A23-8 |

---

## Appendix A - the instruments (relocated, Ruling Y5)

**MOVED OUT in round 3.** Round 2 reproduced both scripts in full as fenced code
blocks (roughly 190 lines, about 20% of that version of this document). The
round-2 checker settled the round-1 author's own stated dilemma - a fenced block
is LESS re-runnable than a file, because the checker had to write an extractor
just to run them. **Both scripts now live as committed, directly-runnable files:**

- **`docs/a23/a23-probe.mjs`** - runs both guards' decision procedures verbatim,
  plus the OPTION (b) unconditional sweep. Run from the repo root:
  `node docs/a23/a23-probe.mjs`.
- **`docs/a23/a23-scan.mjs`** - the multi-line-aware import scanner over a
  directory. Run from the repo root:
  `node docs/a23/a23-scan.mjs <dir>` (default `src/app/components/repo-grades`).

Both were re-run from their new location to confirm the move changed nothing:
`node docs/a23/a23-probe.mjs` reproduces section 2.2 to the digit (including the
OPTION (b) sweep's five misses - P2b, P2c, P6, C3, C4, both quote styles - that
AC-5 and AC-6 now cite for the widened `:112-117` object, Ruling Y1) and
`node docs/a23/a23-scan.mjs src/app/components/repo-grades` reproduces section
2.1 to the digit. **This is the strictly-stronger fix the checker asked for**:
nothing about the scripts changed, and nothing else crossed the seat boundary -
no generator, no axes, no expected-value table was added, and section 10 still
explicitly refuses to choose the fix mechanism.

**These remain MEASUREMENT INSTRUMENTS, not a proposed mechanism and not an
oracle.** They run the two shipped guards' existing decision procedures against
synthetic inputs so the today-state in section 2 can be re-derived; they propose
no construction for the fix (the architect's lane) and they enumerate no fixture
set (the test seat's lane, Ruling X2 (d)).

### A.1 `docs/a23/a23-probe.mjs`

Runs guard 1's line filter, guard 1's OPTION (b) unconditional sweep, and guard
2's walled-set count, each against the twelve P-fixtures (both quote styles) and
eleven H-fixtures named in sections 2.2 and 2.3. Full source: the committed
file. Re-run: `node docs/a23/a23-probe.mjs` from the repo root.

### A.2 `docs/a23/a23-scan.mjs`

The multi-line-aware import scanner over a directory, used for section 2.1.
Known limitation, stated in the file's own header: the `dynamic import(
occurrences` counter is a bare regex over raw source and also counts the
English phrase "import (" in comments - disambiguate any non-zero result with
`grep -rn "import *(" <dir> --include=*.ts --include=*.tsx | grep -v "\.test\."`.
Full source: the committed file. Re-run:
`node docs/a23/a23-scan.mjs <dir>` (default `src/app/components/repo-grades`).
