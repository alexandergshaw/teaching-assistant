# A23 - test notes and oracle (the instruments, and how each fails)

**Row:** `docs/backlog.yml:429` (`id: 'A23'`), `kind: 'bug'` at `:438`.
**Seat:** test notes and oracle (`loop-test-author`). **Round 2.**
**Date:** 2026-09-21.
**Consumes:** `docs/a23-criteria.md` at `c458f7a` (round 3, disposal) and
`docs/a23-architecture.md` **at `0665018`** - the m-3 withdrawal, which landed
after round 1 of this document was written. **Every `docs/a23-architecture.md:<n>`
cite below was re-resolved and re-opened at `0665018`**; round 1's cites were
pinned to `182ecc6` and the two intervening commits (`fe261bd`, `0665018`) moved
them. The SHAPE is settled and this document does not redesign it: a transitive
runtime-import-graph walk from a tree-derived root set, under a capability
predicate on the RESOLVED path, with edge extraction by `ts.createSourceFile`.
**Write scope:** exactly one path, `docs/a23-test-notes.md`. `git status --short`
before and after this pass returned `M docs/css-orphans.md` only - dirty from
work outside this loop and not touched here.
**Tree:** every quantity below was produced by a command stated at its point of
use, run in this checkout at HEAD `0665018` (`git log --oneline -1`). **Round 1's
figures were NOT carried forward.** The reference implementation was rebuilt from
scratch for this round and every number re-measured; where a round-1 figure did
not reproduce, section 10 says so and names both.

---

## 0. What this document is, and the two things it refuses to be

It is the fixture set, the frozen oracles, the numbered requirements with their
failure directions, the sabotage design, and the landing order. It is NOT a
second architecture pass and NOT the test code - `loop-implementer` writes the
code from here.

**Leverage line - FIRED AND DECLINED.** `docs/backlog.yml:438` carries
`kind: 'bug'`; `seats.md:70-75` rules that a bug fix makes no leverage claim.
Trigger fired: bug fix. There is therefore **no removal test** to build, and
inventing one would describe the app rather than this work.

**NO COMPONENT IS RENDERED BY ANY TEST HERE.** Every requirement below is a
property of a string, a file list, or a module graph. None needs a render, and
none is written as though a green suite proved anything about markup.

---

## 1. Disposition of round 1 - every finding, and the id column derived LAST

`iteration-caps.md:117-122` requires a restructuring round to ship this table,
and requires the checker to audit it before reading the new round on its own
terms. The id column was filled in after every row's disposition was written,
so a row cannot have been shaped to fit an id it was assigned first.

### 1.1 The four blockers

| Finding (round 1) | Disposition | Where it lands now |
|---|---|---|
| **B-1.** O-A claims the fixture set "is a product, not a hand-written list", but the product is over SEPARATORS x QUOTES only; CONSTRUCTS is a hand-written 25 - the thing `traps-tests.md:22` condemns. An implementation omitting ONE export-side guard passes all 132 fixtures while dropping `export {} from "@/lib/grade"`. | **KEPT, by CONSTRUCTION (Ruling W2).** IMPORT/EXPORT is now a third product dimension over the clause shapes. The missing cell is unrepresentable: 3 new shape/side cells (24 fixtures) exist because the product emits them, not because anyone wrote them down. The mutant that motivated the blocker is now **M13** and it is **killed** (section 6), **with an import-side twin M17 added by Ruling V4 so the kill does not hinge on the one contested compiler-configuration cell (section 3.4).** | O-A, section 4; R-6; M13, M17 |
| **B-2.** R-5's "the same options object the real assertion uses and only the root set replaced" is the entire reason the canary means anything, and nothing asserts it. A guard whose REAL walk passes `forbiddenPathPrefixes: []` is byte-identical to baseline. | **KEPT, by CONSTRUCTION (Ruling W3).** ONE `const OPTIONS`, both call sites take it, plus a parsed assertion over the guard file's own source that every `walkRuntimeGraph` call's second argument is the SAME bare identifier. I built the decorative implementation and two further attacks and ran the instrument against all three: it REDS all three and PASSES the correct one (section 5.3). | R-5e; section 5.3 |
| **B-3.** R-8's failure direction pins the LOOSENED prefix form and cites `classTrendsDraft.not-postable.test.ts:46-53` as authority, but that header records the OPPOSITE defect. | **KEPT, INVERTED (Ruling W1).** R-8's direction is now "a SIBLING is NOT flagged". The citation is relocated to the line that documents the direction it now asserts. M9 is now the WITHDRAWN m-3 fix and is killed two-sidedly. | R-8; M9 |
| **B-4.** R-11's three clauses describe three different sets; `[].every(p => p.endsWith(".test.ts"))` is true forever. | **KEPT, RECONCILED (Ruling W4).** All three clauses now bind the same set (EVERY file under `src/`, test and non-test) and the vacuous form is made unrepresentable by a min-count clause, not by prose. | R-11 |

### 1.2 The four majors

| Finding (round 1) | Disposition | Where it lands now |
|---|---|---|
| **MJ-1.** Ruling Y3's re-derivation was reported discharged and was not delivered; and the instrument has no column for guard 2's U3 line filter. | **KEPT, DELIVERED.** A fifth extractor column (`u3`) was added and the whole of criteria 2.3 and 6 re-derived cell by cell. **Five cells of criteria 2.3 are wrong and two more are now measured where the document says UNMEASURED** - section 2. | Section 2; O-A's `u3` column |
| **MJ-2.** O-C's "successor rather than a second copy" was true at `182ecc6` and is FALSE at HEAD; `[G2]` would carry THREE representations of the same eleven names. | **KEPT, REBUILT against HEAD.** O-C no longer declares a literal at all: it reuses the EXISTING `CLIENT_FILES` literal. `[G2]` carries TWO representations - one literal, two independent computed derivations. Measured equal. | O-C, section 4 |
| **MJ-3.** R-5c silently corrects the architecture, whose literal `.startsWith` form is wrong. | **KEPT, and the ROOT CAUSE named instead of the symptom.** The real defect is that `Violation.resolved`'s PATH FORM is unspecified in the seam, so the same literal assertion is true or false depending on an unspecified choice. **Measured: under the src-relative POSIX form BOTH `.startsWith` and `contains` are true.** The fix is to pin the path form, then keep `contains`. | R-5c; section 3.3 |
| **MJ-4.** `classifySpecifier` has no fixture coverage; three of five buckets have zero positive control anywhere. | **KEPT, NEW REQUIREMENT R-14.** An 18-row table, five buckets x the four resolution candidates, built by O-A's own construction. **Two new mutants, M15 and M16; M15 is killed by NOTHING ELSE in this document.** | R-14; O-E; M15, M16 |

### 1.3 The six minors

| # | Finding (round 1) | Disposition |
|---|---|---|
| mn-1 | `traps-tests.md:24-29` cited for a rule stated at `:22`. | **FIXED.** Every citation of that card re-opened; the rule is `traps-tests.md:22`, the condemning sentence is `:28`, the count-assertion rule is `:30-33`, the cross-test-file-import rule is `:46-50`. |
| mn-2 | "the five that got `VALUE_IMPORT_PATTERN` withdrawn" - upstream says FOUR plus a fifth. | **FIXED.** `docs/a23-criteria.md:377-382`: FOUR cited by Ruling U3 (`export * from`, `export { x } from`, `require(<literal>)`, `import(<literal>)`) plus the FIFTH the measurement added (bare side-effect `import "<banned>";`). `next-dynamic` is a SPELLING of `import(<literal>)`, not a sixth member. |
| mn-3 | R-10 freezes three of five policy lists. | **FIXED.** R-10 freezes all five. `FORBIDDEN_PATH_PREFIXES` and `ALLOWED_ASSET_EXTENSIONS` were unfrozen; narrowing the former was caught only by R-5c, and deleting `ALLOWED_ASSET_EXTENSIONS`'s only entry is now also caught by R-14 (M16). |
| mn-4 | whole-`src` parse measured at 2029ms on a fifth run, above all four figures reconciled. | **FIXED, and widened to EIGHT measurements.** Section 8. |
| mn-5 | `.mts` is in `tsconfig.json`'s include and both `directoryRoots` and the derivation skip it. | **FIXED, measured.** Zero `.mts`/`.cts` files under `src/` (`MTS.under_src=0`). Fail-open, one line, section 9. |
| mn-6 | the `want=residue` axis has exactly ONE fixture; a SUBSTITUTED template is a different node kind and unpinned. | **FIXED.** `template-substituted` is a shape now; the residue axis has TWO fixtures on TWO distinct AST node kinds (`Identifier` and `TemplateExpression`). M5 now reds both. |

### 1.4 Round-1 requirements, kept / changed / withdrawn

**Correction against my own table, per orchestrator Ruling MAJOR-3.** Four
rows below were reported "KEPT unchanged" or "KEPT" while their SCOPE tag
changed - R-1, R-3 and R-4 dropped `[LEAF]` (now `[G1] [G2]` only) and R-9
gained it (now `[LEAF] [G1] [G2]`). No enforcer is lost: the assertions still
exist in the guard files, and R-9's instrument is honestly stated as "R-1's own
numbers" rather than an independent one. But `iteration-caps.md:117-122` makes
this table mandatory precisely so a scope change cannot hide behind "KEPT",
and a checker is told to audit it before reading the round on its own terms.
The Scope column below is the fix - "unchanged" is now reserved for rows whose
tag truly did not move.

| Round-1 id | Status | Scope | Note |
|---|---|---|---|
| R-1 | KEPT, **scope narrowed** | `[G1][G2][LEAF]` -> `[G1][G2]` | assertions unchanged; `[LEAF]` no longer separately claims this row |
| R-2 | KEPT, O-C's oracle rebuilt (MJ-2) | `[G1][G2]` unchanged | O-B unchanged |
| R-3 | KEPT, **scope narrowed** | `[G1][G2][LEAF]` -> `[G1][G2]` | the checker ruled O-1's honesty SUFFICIENT; the caveat stands |
| R-4 | KEPT, **scope narrowed** | `[G1][G2][LEAF]` -> `[G1][G2]` | same |
| R-5 | KEPT, clause **R-5e ADDED** (W3) | `[G1][G2]` unchanged | R-5c's wording now flags the architecture divergence (MJ-3) |
| R-6 | KEPT, table rebuilt on the 3-dimension product | `[LEAF]` unchanged | 132 -> 157 |
| R-7 | KEPT unchanged | `[LEAF]` unchanged | now ALSO killed by R-6a, because the JSX shape is a fixture |
| R-8 | KEPT, **DIRECTION INVERTED** (W1) | `[LEAF]` unchanged | |
| R-9 | KEPT, **scope widened** | `[G1][G2]` -> `[LEAF][G1][G2]` | its count is explicitly NOT frozen; the count moved 105 -> 104 between rounds (section 10); **the new `[LEAF]` scope has no enforcer of its own - its Instrument line says so, naming R-1's numbers, which is honest given R-1 is no longer `[LEAF]`** |
| R-10 | KEPT, widened from three lists to five (mn-3) | `[LEAF]` unchanged | |
| R-11 | KEPT, **all three clauses reconciled** (W4) | `[LEAF]` unchanged | |
| R-12, R-13 | KEPT unchanged | gate rows, no scope tag | |
| - | **R-14 NEW** (MJ-4) | `[LEAF]` | `classifySpecifier`'s bucket/candidate table |
| - | **R-15 NEW** (MJ-3) | `[LEAF]` | pins `Violation.resolved`'s path form |
| RES-T-1..7, RES-A23-12, -13 | all KEPT | n/a | RES-T-3 re-scoped by W4; RES-T-6 closed this round (Ruling V1); RES-T-7 added (mn-5) |

**Nothing from round 1 was withdrawn.** No requirement lost its enforcer; two
scope tags moved without their enforcer moving with them, and that movement is
now named rather than hidden inside "unchanged".

---

## 2. MJ-1: Ruling Y3's re-derivation, DELIVERED - five wrong cells and two now measured

**SUPERSESSION (Ruling V5, disposing MJ-1). This section SUPERSEDES
`docs/a23-criteria.md` sections 2.3 and 6 as the measured map.** `docs/a23-criteria.md`
is at its own round cap (`iteration-caps.md`, cap 2); this section's
re-derivation found five wrong cells in those tables, one of them refuted by
code already committed in the guarded file
(`gradingResultsHelpersWiring.test.ts:99,101,106`, which feeds single-quoted
fixtures to `fires()` and asserts `true`, directly contradicting the criteria
cell that calls the single-quoted form "ESCAPES"). No criteria round follows
from this, and no acceptance criterion needs rescoping: `BANNED_IMPORT_PATTERNS`,
the mechanism the wrong cells describe, is deleted outright by this row's fix
in favour of the `ts.createSourceFile` walk, so the wrong cells describe a
mechanism that does not survive the wave. **A reader of either document should
land here, not there, for guard 2's behaviour.**

`docs/a23-criteria.md:237-243` obliges this seat to re-derive criteria sections
2.3 and 6 **from its own run** and report every cell those tables got wrong.
Round 1 reported three conflicts, all against the architecture, none a cell of
either table. That obligation is discharged here.

**Why round 1 could not discharge it: the instrument had four columns and guard
2 has TWO instruments.** Guard 2 is not one check:

- **G2-SWEEP** (`gradingResultsHelpersWiring.test.ts:112-117`) applies
  `BANNED_IMPORT_PATTERNS` (`:89-94`) to the WHOLE raw source of each
  `CLIENT_FILES` entry - no line filter, no type filter, and the patterns are
  `["']`, so it is **quote-INSENSITIVE**.
- **G2-U3** (`gradingResultsHelpersWiring.test.ts:128-131`) is the Ruling U3
  walled-set line filter over `types.ts` - `line.includes(' from "')`, so it is
  **double-quote-ONLY by construction**.

Round 1's `sweep` column reproduced G2-SWEEP (the checker granted this as a
partial mitigation). It had no column for G2-U3, which is exactly the instrument
the struck H6/H10 cells are about. Both are now columns.

**Command.** `node --experimental-strip-types <sandbox>/rederive.ts`.
Each cell reads CAUGHT / escapes for a `want=edge` construct, and
`FALSE-POS*` / ok for a `want=erased` one.

| Criteria cell | want | G1-lines | G2-SWEEP | G2-U3 |
|---|---|---|---|---|
| P1/H1 value import, double | edge | CAUGHT | CAUGHT | CAUGHT |
| P1/**H2** value import, single | edge | CAUGHT | **CAUGHT** | escapes |
| P2a/**H6** brace-wrap, double | edge | escapes | CAUGHT | CAUGHT |
| P2a/**H6** brace-wrap, single | edge | escapes | **CAUGHT** | escapes |
| P2b/H7 from-wrap, either quote | edge | escapes | escapes | escapes |
| P2c/H8 tab, either quote | edge | escapes | escapes | escapes |
| **P3** inline ALL-TYPE, double | erased | FALSE-POS* | **FALSE-POS*** | **FALSE-POS*** |
| P3 inline ALL-TYPE, single | erased | FALSE-POS* | **FALSE-POS*** | ok |
| **P4** mixed `{ type X, y }`, double | edge | CAUGHT | **CAUGHT** | **CAUGHT** |
| P4 mixed, single | edge | CAUGHT | **CAUGHT** | escapes |
| **P5** default + inline type, double | edge | CAUGHT | **CAUGHT** | **CAUGHT** |
| P5 default + inline type, single | edge | CAUGHT | **CAUGHT** | escapes |
| P6/H9 bare side-effect, either quote | edge | escapes | escapes | escapes |
| C1/**H5** `export * from`, double | edge | escapes | **CAUGHT** | **CAUGHT** |
| C1/**H5** `export * from`, single | edge | escapes | **CAUGHT** | escapes |
| C2/**H10** `export { x } from`, double | edge | escapes | CAUGHT | CAUGHT |
| C2/**H10** `export { x } from`, single | edge | escapes | **CAUGHT** | escapes |
| C3/H3 `require(<literal>)`, either | edge | escapes | escapes | escapes |
| C4/H4 `await import(<literal>)`, either | edge | escapes | escapes | escapes |

### 2.1 Every cell criteria 2.3 got wrong

**Guard 1's whole column reproduces exactly. Every error is in the guard 2
column, and every one has the same mechanism: a property of G2-U3 written as a
property of "guard 2".**

1. **"single-line value import, single quote -> ESCAPES (H2)" is WRONG for
   G2-SWEEP.** It is CAUGHT. This is not only my measurement: **guard 2's own
   committed canary asserts it**, at `gradingResultsHelpersWiring.test.ts:99`
   and `:101`, which feed single-quoted fixtures to `fires()` and
   `expect(...).toBe(true)`. A `file:line` in the guarded file itself contradicts
   the criteria cell.
2. **"`export * from` -> single-quoted ESCAPES (H5)" is WRONG for G2-SWEEP.**
   CAUGHT in both quote styles. And the "double-quoted UNMEASURED" half of that
   cell is now MEASURED: CAUGHT by both instruments. The Ruling Y3 strike was
   right to strike it; the replacement value is CAUGHT, not unknown.
3. **"`export { x } from` -> single-quoted UNMEASURED" is now MEASURED**, and
   the two instruments disagree: CAUGHT by G2-SWEEP, ESCAPES G2-U3. Stating it
   as one verdict is what produced the struck cell in the first place.
4. **"wrap inside the braces -> single-quoted UNMEASURED" is now MEASURED**:
   CAUGHT by G2-SWEEP, ESCAPES G2-U3.
5. **"inline ALL-TYPE import -> not applicable (guard 2 is a walled-set count,
   not a classifier)" is WRONG, and it is the most consequential cell.** Guard 2
   carries the SAME false positive as guard 1: G2-SWEEP flags a double- OR
   single-quoted legitimate `import type { X } from "@/lib/grade"`, and G2-U3
   flags the double-quoted one. The criteria used "not applicable" to justify
   binding AC-2 to guard 1 alone. **Measured, the false-positive direction is
   shared.** It does not red the tree today only because no current
   `CLIENT_FILES` entry carries that exact import - `@/lib/grade/types` is
   exempted by the negative lookahead at `:91`. That is coverage by omission,
   which is the class this row exists to remove.
6. **"mixed `{ type X, y }` -> not applicable" and "default binding -> not
   applicable" are WRONG.** Both are measurable against both guard-2 instruments
   and both produce verdicts (CAUGHT / CAUGHT for G2-SWEEP).

### 2.2 Section 6's rows, re-derived

H1, H3, H4, H9 reproduce exactly. **H2 and H5 are wrong** for G2-SWEEP (item 1
and 2 above). **H6 and H10's Ruling Y3 qualification ("DOUBLE-QUOTED ONLY") is
correct but attached to the wrong instrument** - it is true of G2-U3 and false
of G2-SWEEP, which catches both quote styles. The strike was warranted; the
reason given for it was half right.

### 2.3 One cell neither table has, measured because the harness was already there

G2-U3's comment exclusion is `!/^\s*(\*|\/\/)/.test(line.trim())` - a
LINE-LEVEL test, so it is blind to a trailing comment and to the first line of a
`/* ... */` block. Measured
(`node --experimental-strip-types <sandbox>/trailing.ts`):

```
own-line // comment   u3_flags=false  sweep_flags=true
TRAILING // comment   u3_flags=true   sweep_flags=true
block-comment * line  u3_flags=false  sweep_flags=true
block-comment /* line u3_flags=true   sweep_flags=true
```

**Both blind spots are in the FALSE-POSITIVE direction** (a comment flagged as a
real import), so they are fail-closed and are not holes. Recorded because a
future reader will otherwise re-derive it. This is also the exact shape my own
seat brief warns about - the anchored comment-stripping form is
trailing-comment-blind - and here it is, executing in a shipped guard.

### 2.4 What survives from round 1's three conflicts

The checker settled 1.1 and 1.2 in my favour and confirmed 1.3. All three are
carried to section 10 unchanged in substance and re-measured this round:
`unresolvable` is 0 across 1560 files (not `residue=1`); the architecture's
0/19/22/20 scoreboard does not reproduce; Z3's "2 runtime edges into `types.ts`"
is right for the closure and 13 for the whole of `src/`.

---

## 3. Three rulings I am applying, and one conflict I am REPORTING rather than adopting

### 3.1 W1 - the prefix is character-by-character, NO trailing slash, and R-8 INVERTS

The orchestrator's ruling, and the architecture already carries the correction at
`docs/a23-architecture.md:545-577` ("MINOR m-3 - WITHDRAWN 2026-09-21 BY
ORCHESTRATOR RULING"), landed in `0665018` after round 1 of this document was
written. Round 1's R-8 pinned the loosened form. It inverts.

**The authority, opened.** `classTrendsDraft.not-postable.test.ts:46-53` records
the defect in the direction OPPOSITE to round 1's reading: a prefix WITH a
trailing slash MISSES `src/app/actions.ts`, "a real file, a pure re-export
barrel that fronts the whole actions directory". The rule is stated as a contract
in code at `:64-66`: "the resolved import target's own path, **character-by-
character prefix matched, never segment-by-segment**", implemented at `:67-70`.
The live value at `:58` is five directory-level prefixes with no slash.

**Round 1's citation was to the right header for the wrong claim.** It is
relocated: R-8's authority is now `classTrendsDraft.not-postable.test.ts:46-53`
for the `app/actions.ts` instance and `:64-66` for the rule, and R-8 asserts
what those lines assert.

**The architecture's `m-3` is SUPERSEDED by this ruling** and the architecture
says so itself at `:545-577`. The standing rule it violated is "never ship a
loosened guard without the feature it was loosened for", and the ground the
orchestrator gives is the one to carry forward: **a zero count is a reason to
leave a guard alone, never a reason to weaken it.**

### 3.2 W2 and W3 - both disposed by construction, both attacked before shipping

Section 4 (O-A) and section 5.3. Each is a construction that makes the bad state
unrepresentable, not a longer list; `iteration-caps.md:16-19` rules that
strengthening the same mechanism never ends a class.

### 3.3 MJ-3 - the divergence is NOT a spelling difference; the seam leaves the path form UNSPECIFIED

`docs/a23-architecture.md:1276` prescribes:

```ts
expect(violations.some((v) => v.resolved?.startsWith("lib/supabase/server"))).toBe(true);
```

Round 1 quietly wrote `contains` instead. **Both round 1's silent correction and
the architecture's literal form are treating a symptom.** The seam at
`docs/a23-architecture.md:905-1014` declares `Violation { trail: string[];
specifier: string; resolved: string | null }` and **says nothing about what form
`resolved` takes** - absolute, repo-relative, or src-relative. Measured, on a
reference implementation that returns the src-relative POSIX form:

```
CANARY.barrel_resolved_sample=["lib/supabase/server.ts","lib/supabase/effective-identity.ts", ...]
R5c.trail_contains_supabase_server=true
R5c.trail_startsWith_supabase_server=true
```

**Under the src-relative form BOTH are true.** The checker measured the
architecture's own probe printing `src/lib/supabase/server.ts`, under which
`.startsWith` is FALSE and `contains` is true. So the literal assertion is not
wrong - it is UNDERDETERMINED, and an implementer who picks the other path form
while following the architecture verbatim gets a red canary on correct code.

**What I am doing about it, and it is a change of kind:** R-5c asserts `contains`
(insensitive to the path form) **and** the seam contract gains one pinned
sentence, R-15 below. Flagging the divergence rather than fixing it silently is
the obligation; pinning the form is what stops it recurring.

### 3.4 THE CONFLICT I AM REPORTING: `want` for the empty-brace shapes is COMPILER-CONFIGURATION-DEPENDENT

This is new in round 2, found by an oracle round 1 did not have, and I adopt no
value silently.

Round 1's O-A said `erased` means "erased by the TypeScript transform, so no
edge", as though the language settled it. It does not. I built an INDEPENDENT
oracle for the `want` column - the TypeScript compiler's own emit, rather than my
own classifier - and ran every clause shape through `ts.transpileModule` twice:
once under the repo's own `tsconfig.json` options, once with
`verbatimModuleSyntax: true`. Every VALUE binding is used in the oracle's
sources, so an elision can only mean "the clause emptied", not "the binding was
unused" (the first run of this oracle was contaminated by exactly that and is
discarded).

Command: `node --experimental-strip-types <sandbox>/emit-oracle2.ts`.
**Six of the nineteen clause/side cells diverge, and they are exactly the cells
whose import clause EMPTIES after type-stripping** (O-A's shape table below
lists 19 clause/side rows, not twenty):

| shape/side | repo `tsconfig.json` emits the edge | `+ verbatimModuleSyntax` emits the edge | my `want` |
|---|---|---|---|
| `inline-type-1/import` (`import { type X } from S`) | false | **true** | erased |
| `inline-type-1/export` | false | **true** | erased |
| `inline-type-2/import` | false | **true** | erased |
| `inline-type-2/export` | false | **true** | erased |
| `empty-braces/import` (`import {} from S`) | **false** | true | **edge** |
| `empty-braces/export` (`export {} from S`) | **false** | true | **edge** |

The other fourteen cells agree with my `want` under BOTH configurations. The
exact emissions:

```
"import { type X } from \"@/lib/grade\";"  repo-> "export {};"   verb-> "import {} from \"@/lib/grade\";"
"import type { X } from \"@/lib/grade\";"  repo-> "export {};"   verb-> "export {};"
"export {} from \"@/lib/grade\";"          repo-> "export {};"   verb-> "export {} from \"@/lib/grade\";"
```

**The decision I am making, its ground, and what would overturn it.** I pin
`want=edge` for both `empty-braces` cells, **fail-closed**, because:

- plain ES module semantics make `import {} from S` and `export {} from S`
  ModuleRequests - the module IS evaluated;
- `verbatimModuleSyntax` is a one-line `tsconfig.json` change away and is the
  direction TypeScript has been moving;
- `next build` uses SWC, not `tsc`, and **SWC's behaviour on these six cells is
  UNMEASURED here** - I cannot run `next build` in this checkout;
- the cost of a false positive is a guard red a human reads; the cost of a false
  negative is the exact defect this row exists to fix.

And I keep `want=erased` for the four `inline-type` cells, which matches the
repo's tsconfig today and matches AC-2(a)'s permitted set - changing it would
contradict a criterion, which is not this seat's to do.

**This is a fail-closed choice on one axis and a criteria-conformant choice on
the other, and the two are not the same rule.** That asymmetry is deliberate.

**RES-T-6 CLOSED BY ORCHESTRATOR RULING V1, measured, not argued.** Section 12
and this document's first version asserted `next build` was the only instrument
for SWC's erasure semantics and that this checkout could not run it. That is
false: `@next/swc-win32-x64-msvc` is installed and exposes `transformSync`.
Measured directly against it (`node <sandbox>/swc-probe.ts`, the raw binding
called the way `node_modules/next/dist/build/swc/index.js:1174-1194` calls it -
`bindings.transformSync(src, false, Buffer.from(JSON.stringify(options)))`,
`jsc.parser.syntax: "typescript"`, `module.type: "es6"`):

```
"import {} from \"@/lib/grade\";"   -> emits "import \"@/lib/grade\";"   (a real edge)
"export {} from \"@/lib/grade\";"   -> emits ""                          (erased - nothing)
"import { type X } from ...";  "export { type X } from ...";
"import type { X } from ...";  "export type { X } from ...";            -> all four emit "" (erased)
```

**`empty-braces/import` is a measured SWC edge and `empty-braces/export` is a
measured SWC erasure.** The repo's own `tsc` was the outlier on the import cell,
not SWC - had the reference implementation followed `tsc`'s reading instead of
reasoning fail-closed, the import cell would have pinned a hole. The four
`inline-type` cells are measured safe under SWC in the permissive direction,
confirming section 3.4's `want=erased` pin for that axis.

Confirmed separately: Next never passes `verbatimModuleSyntax` to SWC -
`grep -rln verbatimModuleSyntax node_modules/next/dist/` finds it only in
`lib/typescript/writeConfigurationDefaults.js` (the file that WRITES a
`tsconfig.json` default), never in `build/swc/options.js` or `build/swc/index.js`
where the transform options are built. So the `verbatimModuleSyntax` column of
section 3.4's table describes a configuration SWC is never handed; it is useful
only as the ES-semantics cross-check it was built for.

**Disposition on `want=edge` for `empty-braces/{import,export}`: KEPT for BOTH
cells**, and for different reasons now that they are separately measured -
`import` because SWC agrees it is a real edge, `export` because plain ES module
semantics still make it a `ModuleRequest` even though SWC elides it, and a false
positive there is cheaper than the false negative this row exists to fix (the
same fail-closed ground section 3.4 already gave, now resting on a measured
divergence rather than an unmeasured one). One line on the other engine, per the
orchestrator's allowance: Turbopack is a separate engine and its emit for these
six cells was not measured here.

---

## 4. The frozen oracles, as CONSTRUCTIONS

Five oracles. Each says how the set is built; each construction was executed
against this tree.

### O-A. The construct cross-product, now on THREE dimensions (obligation O-3, Ruling W2)

**Construction.**

```
CLAUSE FIXTURES  = CLAUSE_SHAPES x SIDE x SEPARATORS x QUOTES
NONCLAUSE FIXTURES = NONCLAUSE_SHAPES x QUOTES
```

filtered by applicability rules stated below. `traps-tests.md:22` requires
coverage to be a property of construction; `:28` rules that "a hand-written list
of five" can silently miss a case. Round 1's CONSTRUCTS column was that list.
**SIDE is now a dimension**, so for every clause shape both the `import` and the
`export` form are emitted, and the only way a cell can be absent is an
applicability rule that says the syntax does not exist.

- **`SIDE` (2):** `import`, `export`. A shape whose head on one side is `null`
  is not legal syntax there and emits no cell - `export *` has no import form,
  `import D` has no export form. **That is the ONLY legal absence**, and it is
  data in the shape table, not a decision made per row.
- **`SEPARATORS` (4):** `inline` (one line, single spaces - the control);
  `brace-wrap` (a newline just inside `{` and just inside `}`); `from-wrap` (a
  newline between the `from` token and the specifier); `tab` (a TAB, not a
  space, between `from` and the specifier). This is AC-1's axis, and
  `docs/a23-criteria.md:315-325` already records WHY it is not "multi-line": the
  tab case is a single line and still escapes.
- **`QUOTES` (2):** `"` and `'`.
- **Applicability:** `brace-wrap` applies only to a head containing `{`;
  `from-wrap` and `tab` only to a head with a literal `from` token; both quote
  styles only where the specifier sits in a swappable quote.
- **The specifier is always `@/lib/grade`**, the barrel every chartered guard
  names.

**TWO CONVENTIONS THAT ARE LOAD-BEARING AND WERE UNSTATED IN ROUND 1.** The
checker rebuilt this oracle independently and reports that getting either wrong
yields 50/69/77 instead of round 1's 51/72/78. Whoever rebuilds it needs both:

1. **`want=residue` scores as a DISAGREEMENT for ALL THREE text comparators, by
   construction.** None of `valueImportSpecifiers`, G1-lines or G2-SWEEP has a
   residue channel at all - they return "flagged" or "not flagged", and neither
   is "I saw an import site whose specifier I cannot read". A comparator with no
   channel for the correct answer cannot give the correct answer, so the cell is
   a disagreement whatever it returns. Scoring it by `!flagged` would silently
   credit three extractors with a verdict none of them can express.
2. **`brace-wrap` of an EMPTY-brace head is `{\n}`, one newline, not `{\n\n}`.**
   The two insertion points ("just inside `{`" and "just inside `}`") coincide
   when there is nothing between them. Emitting two newlines changes what the
   line classifiers see and moves the scoreboard.

**THE SHAPE TABLE.** 12 clause shapes x SIDE, plus 10 non-clause shapes.
Columns: `n` = fixture count for that shape/side; then per-cell DISAGREEMENT
counts for five extractors - the AST classifier, `valueImportSpecifiers`
(duplicated verbatim from `classTrendsDraft.not-postable.test.ts:96-113`),
guard 1's line classifier
(`repoGradesFeedbackAndFiles.wiring.test.ts:295-301`), G2-SWEEP
(`gradingResultsHelpersWiring.test.ts:89-94,112-117`) and G2-U3
(`gradingResultsHelpersWiring.test.ts:128-131`). Produced by
`node --experimental-strip-types <sandbox>/harness.ts`.

| shape | side | want | n | ast | vis | g1 | sweep | u3 |
|---|---|---|---|---|---|---|---|---|
| `{ x }` named value | import | edge | 8 | 0 | 4 | 6 | 4 | 6 |
| `{ x }` named value | **export** | edge | 8 | 0 | 4 | **8** | 4 | 6 |
| `type { X }` type-only clause | import | erased | 8 | 0 | 0 | 0 | 4 | 2 |
| `type { X }` type-only clause | export | erased | 8 | 0 | 0 | 0 | 4 | 2 |
| `{ type X }` inline type | import | erased | 8 | 0 | 0 | 2 | 4 | 2 |
| `{ type X }` inline type | **export** | erased | 8 | 0 | 0 | 0 | 4 | 2 |
| `{ type X, type Y }` | import | erased | 8 | 0 | 0 | 2 | 4 | 2 |
| `{ type X, type Y }` | **export (NEW)** | erased | 8 | 0 | 0 | 0 | 4 | 2 |
| `{ type X, y }` MIXED | import | edge | 8 | 0 | 4 | 6 | 4 | 6 |
| `{ type X, y }` MIXED | **export (NEW)** | edge | 8 | 0 | 4 | **8** | 4 | 6 |
| `{}` EMPTY BRACES | import | edge | 8 | 0 | 4 | 6 | 4 | 6 |
| `{}` EMPTY BRACES | **export (NEW)** | edge | 8 | 0 | 4 | **8** | 4 | 6 |
| `* as N` namespace | import | edge | 6 | 0 | 3 | 4 | 4 | 5 |
| `* as N` namespace | export | edge | 6 | 0 | 3 | 6 | 4 | 5 |
| `*` star | export only | edge | 6 | 0 | 3 | 6 | 4 | 5 |
| `D` default | import only | edge | 6 | 0 | 3 | 4 | 4 | 5 |
| `type D` type default | import only | erased | 6 | 0 | 0 | 0 | 2 | 1 |
| `D, { type X }` | import only | edge | 8 | 0 | **8** | 6 | 4 | 6 |
| `D, * as N` | import only | edge | 6 | 0 | 3 | 4 | 4 | 5 |
| `import S;` bare side-effect | - | edge | 2 | 0 | 2 | 2 | 2 | 2 |
| `require(S)` | - | edge | 2 | 0 | 2 | 2 | 2 | 2 |
| `await import(S)` | - | edge | 2 | 0 | 2 | 2 | 2 | 2 |
| `dynamic(() => import(S))` | - | edge | 2 | 0 | 2 | 2 | 2 | 2 |
| ``await import(`S`)`` no-substitution template | - | edge | 1 | 0 | 1 | 1 | 1 | 1 |
| `await import(pathVar)` computed | - | **residue** | 1 | 0 | 1 | 1 | 1 | 1 |
| ``await import(`${base}/grade`)`` SUBSTITUTED (NEW) | - | **residue** | 1 | 0 | 1 | 1 | 1 | 1 |
| `// import { x } from S;` in a COMMENT | - | none | 2 | 0 | 0 | 0 | **2** | 0 |
| `'never import from "S" here'` in a STRING | - | none | 2 | 0 | 0 | 0 | **2** | 1 |
| `.tsx`: `<div>{require(S)}</div>` | - | edge | 2 | 0 | 2 | 2 | 2 | 2 |

```
XP.fixtures=157
XP.scoreboard ast=0 vis=60 g1=89 sweep=91 u3=94
XP.positive_controls=60 XP.regression_canaries=97
SHAPES clause=12 nonclause=10
```

**The four cells the SIDE dimension added, and they are the blocker.**
`{ type X, type Y }/export`, `{ type X, y }/export`, `{}/export` (8 fixtures
each) plus the substituted template. **`empty-braces/export` is the cell the
checker's passing-but-wrong implementation dropped**, and it is now a fixture
because the product emits it - nobody added a 26th row. Sabotage **M13** is that
implementation, and it reds those 8 fixtures (section 6).

**`want` is the ground truth about the MODULE GRAPH**, not about any guard:
`edge` = a real runtime edge; `erased` = the declaration disappears; `residue` =
the specifier is not a string literal, so the extractor must REPORT it as
unclassifiable and emit no edge; `none` = the text is not an import at all.
**Six of the nineteen clause/side cells' ground truth was compiler-
configuration-dependent under `tsc` and is now measured under SWC - see
section 3.4, which states which way each is pinned and why.**

**`XP.fixtures = 157` is itself an assertion** (R-6c): deleting a shape, a side
or an applicability rule changes it. The per-cell `n` column is the frozen
breakdown, so a wrong total names the cell that moved.

**AC-3's construct set, correctly counted (mn-2).** `docs/a23-criteria.md:377-382`:
FOUR constructs Ruling U3 cited when it withdrew `VALUE_IMPORT_PATTERN` -
`export * from`, `export { x } from`, `require(<literal>)`, `import(<literal>)` -
plus the FIFTH the measurement added, the bare side-effect `import "<banned>";`.
Those are shapes `star/export`, `named-value/export`, `require`,
`dynamic-import` and `side-effect`. `next-dynamic` is a spelling of
`import(<literal>)`, not a sixth member. Shape `D, { type X }` is AC-2(c)'s
default-binding trap. The four `type`-bearing clause shapes are AC-2(a)'s
permitted set. `in-comment` and `in-string` are the false-positive direction and
are the two G2-SWEEP fails - which is what `classTrendsEntry.ts:28` and
RES-A22-1 exist to work around today, and what the parser makes unnecessary.

**AC-11's six regression canaries map onto this table**, so nothing currently
caught is dropped: P1 -> `named-value/import/inline/{double,single}`;
P4 -> `mixed-inline/import/inline/*`; P5 -> `default-inline-type/import/inline/*`;
H1 -> `named-value/import/inline/double`;
H6 -> `named-value/import/brace-wrap/double`;
H10 -> `named-value/export/inline/double`. **The `u3` column is what makes this
claim checkable for the guard-2 rows** - round 1's four columns could not
express H6 or H10's instrument at all, which is MJ-1's substance.

**Known bound, recorded rather than extended (minor (f)).** The shape axis is
still a hand-written list, and two legal shapes are missing from it: `import
type * as N from S` (measured `grep -rn "import type \* as" src/` -> 0
occurrences repo-wide) and `export type * from S` (measured `grep -n "export
type \* from" src/lib/use-server-exports.test.ts` -> 4 hits, all string
fixtures inside that test, not a real emitted shape). Both are legal TypeScript
the product cannot emit today. Both are fail-closed in every mishandling
direction available to this walker - a mishandled `type *` clause can only
either wrongly emit an edge (safe, over-flags) or wrongly erase one that was
never real to begin with (there is no runtime specifier for the AST classifier
to drop). This is a REPEAT of B-1's class - a hand-written enumeration missing
a legal cell - so per `iteration-caps.md`'s cap it routes to disposal, not
another round of the oracle. **Recording it as a known bound; the shape table
above is not extended with it.**

**AC-8's direction labels fall out of the table mechanically**: a fixture is a
**POSITIVE CONTROL** (expected RED at landing step 1) iff `valueImportSpecifiers`
disagrees with its `want`, and a **REGRESSION CANARY** (expected GREEN
throughout) otherwise. Measured split: **60 positive controls, 97 regression
canaries.** Nothing is adopted with its currently-observed value as its
expectation; `want` is derived independently (section 3.4).

### O-B. The repo-grades root set - HAND-FROZEN (obligation O-2)

**Construction.** The 32 non-test, non-`.d.ts` `.ts`/`.tsx` basenames of
`src/app/components/repo-grades/`, transcribed as a literal array at `0665018`
and compared against `directoryRoots(dir)` with both sides sorted.
`ls src/app/components/repo-grades/ | grep -E '\.(ts|tsx)$' | grep -v '\.test\.'
| grep -v '\.d\.ts$' | wc -l` -> `32`. Re-measured this round:
`R2.rg_roots=32`, `R2.rg_roots_match_frozen=true`.

```
LinkUsernamesPanel.tsx  LinkUsernamesRosterSection.tsx  RepoBindingControl.tsx
RepoGradeCellControl.tsx  RepoGradesControls.tsx  RepoGradesGrid.tsx
RepoGradesLogPanel.tsx  RepoGradesStatusBanners.tsx  index.tsx
linkRepoUsernames.ts  repoGradePostScore.ts  repoGradeScoreDisplay.ts
repoGradeStudentName.ts  repoGradeTreeLink.ts  repoGradesAssignmentMapping.ts
repoGradesAssignmentSources.ts  repoGradesBindingConfirm.ts  repoGradesBulkGrade.ts
repoGradesCellEdits.ts  repoGradesCoursePicker.ts  repoGradesFolderSelection.ts
repoGradesLog.ts  repoGradesPosting.ts  repoGradesRows.ts  repoGradesRubricCache.ts
repoGradesRubricSource.ts  repoGradesUiState.ts  rosterUsernameOverlay.ts
useRepoGradesBulkGrade.ts  useRepoGradesData.ts  useRepoGradesGradingActions.ts
useRepoGradesRubricSource.ts
```

**It must be a LITERAL, not a second `readdirSync`.** A `directoryRoots` vs
`readdirSync` comparison is circular and discharges nothing: both go to zero
together. The guards-the-guard precedent is
`canvas-client-boundary.transitive.test.ts:170-177` ("finds the client entry
points at all", commented "if the directive scan broke, the walk below would
start from nothing and pass vacuously forever").

**Maintenance contract, and it is deliberate:** adding a file to this directory
reds this assertion until the literal is updated in the same commit. That is the
`headless.test.ts` count-canary discipline (`traps-tests.md:30-33`), not a defect.

### O-C. The grading-results root set - REBUILT AGAINST HEAD, no new literal (MJ-2)

**Round 1's version is withdrawn as stated.** It declared a fresh 13-name
literal and called it "the successor rather than a second copy" of
`gradingResultsHelpersWiring.test.ts:136-167`. That was true at `182ecc6`;
`fe261bd` changed the reuse row, and at HEAD
`docs/a23-architecture.md:1320` says `:136-167` is **NOT** the root set but the
separate completeness control KEPT ALONGSIDE `directoryRoots(dir)`. Under that
ruling round 1's literal would have made `[G2]` carry THREE representations of
the same eleven names, two of them hand-maintained and both redding on any file
addition.

**Construction, corrected by orchestrator Ruling V2.** This document's own
round-2 text defined `[G2]`'s root set two incompatible ways: this section said
`roots = CLIENT_FILES.map(...) ++ [types.ts]` (the hand-maintained literal IS
the walk's roots), while the trap paragraph below said "with `directoryRoots`
returning `[]` the grading-results closure is still 93 nodes" - a sentence only
meaningful if `directoryRoots` FEEDS the roots. `docs/a23-architecture.md:1332`
and `:1661-1667` rule this explicitly, twice: **the walk's root set IS
`directoryRoots(dir)`'s output, for BOTH guarded directories**, and the
frozen-`CLIENT_FILES`-comparison is the SEPARATE completeness control kept
alongside it - never the roots themselves. Under the literal reading this
section shipped, `[G2]`'s walk would be list-bounded, which is exactly the
coverage-by-omission shape RES-A23-2 already records against this row.

O-C declares NO literal of its own either way - only the WIRING changes:

```
roots = directoryRoots(dir)                                   // the walk's
                                                              // real roots
        ++ [ ../GradingResults.tsx, src/lib/grade/types.ts ]  // Ruling Z3
```

`CLIENT_FILES` is the COMPARISON ONLY - R-2's frozen-literal check, `directoryRoots(dir)`
mapped to `./<basename>` against `CLIENT_FILES.filter(p => p.startsWith("./"))`,
the existing literal, not a new one. Measured today (`OC.derived_eq_existing_literal=true`
below): `directoryRoots(dir)` and `CLIENT_FILES`'s `./` half name the SAME 11
files, so this correction changes no number in this document - it changes which
object the walk is wired to, which is exactly the thing M1 (section 6) is owed
against. **The vacuity-trap paragraph originally at this point in the document
stands as written**; it was the tell, not the error.

```
node --experimental-strip-types <sandbox>/probe5.ts
OC.derived_eq_existing_literal=true derived=11 literal=11
OC.roots=13 v=0 un=0 ua=0 n=93
```

**This is not a tautology and I checked that it is not.** `:136-167` compares
`readdirSync(dir)` + predicate against `CLIENT_FILES`; R-2 compares
`directoryRoots(dir)` against the same literal. Two INDEPENDENT derivations
against one frozen literal. If `directoryRoots` breaks, R-2 reds and `:136-167`
stays green - which is exactly the discrimination M1 needs. The
`refactor-disarms-tests` failure is merging the two derivations; nothing here
merges them.

`[G2]` therefore carries TWO representations, not three: ONE hand-maintained
literal and TWO computed derivations of it.

**This root set has a trap the repo-grades one does not, and I re-measured it.**
With `directoryRoots` returning `[]`, the grading-results closure is **still 93
nodes**, because `GradingResults.tsx` transitively reaches all eleven local
files - so a vacuous root set is INVISIBLE here, where in repo-grades it drops
the closure from 149 nodes to 0. The frozen-list assertion is the only thing
that sees it in either directory, and in grading-results it is the only thing
that sees it at all.

### O-D. The FIVE policy lists - FROZEN LITERALS, plus disjointness (mn-3)

All five constants of `src/lib/module-graph/client-boundary-policy.ts`
(`docs/a23-architecture.md:495-527`) are asserted as frozen literal arrays,
exactly as written there, plus `ALLOWED_BARE_SPECIFIERS` and
`FORBIDDEN_BARE_SPECIFIERS` asserted DISJOINT as raw arrays.

| constant | entries today | what freezing it catches |
|---|---|---|
| `FORBIDDEN_PATH_PREFIXES` | 1 | **NEW in round 2.** A silent NARROWING. Round 1 left it unfrozen and it was caught only by R-5c. |
| `BROWSER_SAFE_MODULES` | 1 | RES-A23-15's instrument: a silent widening |
| `FORBIDDEN_BARE_SPECIFIERS` | 3 | diagnostics drifting from the allow list |
| `ALLOWED_BARE_SPECIFIERS` | 14 | a silent widening of the fail-closed default |
| `ALLOWED_ASSET_EXTENSIONS` | 1 | **NEW in round 2.** Deleting its only entry turns every `.css` into an `unallowed` - measured as M16, `ua` 0 -> 23 on repo-grades. |

Measured: `R10.lists=[1,1,3,14,1] R10.disjoint=true`. Compare raw literals,
never coerced or validated values - `coercion-changes-set-membership` is a
recorded defect in this repo.

### O-E. `classifySpecifier`'s buckets x the four resolution candidates (MJ-4, NEW)

**Construction.** `five buckets x {the four resolution candidates} x {alias form,
relative form}`, with every input taken from the REAL tree so no fixture uses a
shape the code never sees. For the `module` bucket the candidate axis is
positive - one row per candidate, each on a real path that resolves via THAT
candidate and no earlier one. For the other four buckets the candidate axis
DEGENERATES and the degeneration is itself the assertion: all four candidates
must MISS, and the bucket is then decided by whether `base` is a file on disk
(`asset`), the specifier is a builtin (`node-builtin`), it is bare (`package`),
or none of those (`missing`).

The four candidates, in order, are `${base}.ts`, `${base}.tsx`,
`${base}/index.ts`, `${base}/index.tsx` (`docs/a23-architecture.md:905-1014`'s
seam; the same order as `classTrendsDraft.not-postable.test.ts:86`).

| row | specifier | bucket | candidate |
|---|---|---|---|
| module / `.ts` / alias | `@/lib/grade/types` | module | 0 |
| module / `.ts` / relative | `./ungradedRowLabel` | module | 0 |
| module / `.tsx` / alias | `@/app/components/grading-results/icons` | module | 1 |
| module / `.tsx` / relative | `./icons` | module | 1 |
| module / `index.ts` / alias | `@/lib/prose` | module | 2 |
| module / `index.ts` / relative | `../../../lib/prose` | module | 2 |
| module / `index.tsx` / alias | `@/app/components/repo-grades` | module | 3 |
| module / `index.tsx` / relative | `../repo-grades` | module | 3 |
| asset / `.css` / relative | `./../../account/people/people.module.css` | asset | none |
| asset / `.css` / alias | `@/app/account/people/people.module.css` | asset | none |
| node-builtin / prefixed | `node:crypto` | node-builtin | none |
| node-builtin / bare | `fs` | node-builtin | none |
| missing / alias | `@/lib/grade/NoSuchModule` | missing | none |
| missing / relative | `./NoSuchModule` | missing | none |
| missing / directory with no index | `@/app/components` | missing | none |
| package / scoped | `@mui/material` | package | none |
| package / unscoped | `react` | package | none |
| package / deep | `@mui/material/Button` | package | none |

```
node --experimental-strip-types <sandbox>/assert.ts
MJ4.classify_rows=18 MJ4.mismatches=0 []
```

**The construction was checked against the tree before it was written down, and
one row moved.** `@/lib/workflows/registry` was my first candidate-2 example and
it resolves via candidate **0** - `src/lib/workflows/registry.ts` exists beside
the directory. A directory scan found the four directories under `src/` with an
`index.ts` and NO sibling file (`lib/embedded-grader`, `lib/lms-export-source`,
`lib/prose`, `lib/research`) and six with an `index.tsx` only; `@/lib/prose` and
`@/app/components/repo-grades` are taken from those.

**Why this oracle exists.** Measured over every walk in this document, the real
`unallowed` population is **6 node-builtin + 1 package, with ZERO asset and ZERO
missing** (`CLASSIFY.unallowed_bucket_census=[["node-builtin",6],["package",1]]`).
Three of five buckets have no positive control anywhere on the real tree, so
deleting the `missing` branch changes nothing observable. M15 proves it:
**M15 is killed by this table and by NOTHING else in this document.**

### One item is the owner's and blocks nothing - a (b) reduce, with the measurement attached

Distinct from the residual register (section 11): this is a scope question,
not an unmeasured fact, so `iteration-caps.md`'s disposal (b) is the right
shape rather than a residual triple. Under the capability walk, **ELEVEN
modules besides `types.ts` move from banned to permitted** relative to the
name-based list this row replaces - `class-trends{,-draft,-insight}`,
`constants`, `parsing`, `postable`, `prompts`, `repo-content`, `rubric-tiers`,
`submission-kind`, `utils` - against **four that stay banned**: `lib/grade.ts`,
`grade/engine.ts`, `grade/extraction.ts`, `grade/rubric.ts`. That is the
design's stated intent, and none of today's closures on the real tree contain
any of the eleven, so **nothing changes on this tree** whether or not the
question is answered now. AC-11's discharge never states the set explicitly,
though, and how much name-based coverage the capability model may retire is a
product call, not a test-notes call. **THE QUESTION FOR THE OWNER:** should
AC-11's discharge name this eleven/four split explicitly, so a future reader
does not have to re-derive it from the capability walk's rules by hand? Ships
either way; nothing in this wave depends on the answer.

---

## 5. The requirements

Each names the **object**, the **instrument** producing each quantity, and the
**DIRECTION of failure**. `[LEAF]` = `src/lib/module-graph/runtime-import-graph.test.ts`.
`[G1]` = `src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts`.
`[G2]` = `src/app/components/grading-results/gradingResultsHelpersWiring.test.ts`.

### R-1 - Both real closures carry ZERO violations `[G1] [G2]`

- **Object.** `walkRuntimeGraph(roots, OPTIONS).violations` over the repo-grades
  root set (O-B) and the grading-results root set (O-C), against the unmodified
  tree.
- **Instrument.** `npx vitest run <G1> <G2>` after the fix. Measured now by the
  reference implementation: `R1/R3/R4.RG v=0 ... n=149`,
  `R1/R3/R4.GR v=0 ... n=93`.
- **Direction.** Non-empty. A violation on the real tree fails AC-12(a) and the
  fix must not ship. Equally: this assertion is the one a vacuous root set makes
  meaningless, which is why R-2 exists.
- **Sabotage.** M8 (`v` 0 -> 104), M10 (`v` 0 -> 1). Both discriminate.

### R-2 - Each guard file asserts its DERIVED root set against a HAND-FROZEN literal `[G1] [G2]`

- **Object.** `directoryRoots(dir)` mapped to basenames and sorted, against
  oracle O-B (32 names) in `[G1]`, and against **the existing `CLIENT_FILES`
  literal's `./` half** (11 names, `gradingResultsHelpersWiring.test.ts:62-80`)
  in `[G2]`; plus, in `[G2]`, the assertion that the full root array contains
  `../GradingResults.tsx` and `src/lib/grade/types.ts` by name.
- **Instrument.** `toEqual` on two sorted string arrays, one of them a literal in
  the test file. **NOT a second `readdirSync`**, and in `[G2]` **NOT a new
  literal** - O-C.
- **Direction.** The derived set is SHORTER than the literal (the vacuous-pass
  direction, which R-1 cannot see) or LONGER (a file was added without updating
  the literal). Both red.
- **Sabotage.** M1 (`R2.rg_roots` 32 -> 0, `R2.gr_local_roots` 11 -> 0) while
  `RG.violations` stays 0 and both canaries stay GREEN. **R-2 is the only
  requirement that catches M1**, and 32 files go unguarded without it.
- **This is obligation O-2 and it is the row's single highest-value assertion.**

### R-3 - `unallowed` is EMPTY over each closure `[G1] [G2]`

- **Object.** `WalkResult.unallowed` over each of the two root sets.
- **Instrument.** `expect(result.unallowed).toEqual([])` - assert the ARRAY, not
  its length, so the failure message names the specifier and the trail.
  Measured now: `ua=0` on both.
- **Direction.** Non-empty: a literal specifier reached either closure that is
  neither a walked module, nor an allowed asset, nor on
  `ALLOWED_BARE_SPECIFIERS`. This is the fail-CLOSED default Ruling Z1 bought,
  and `@mui/material/Dialog` arriving transitively is the expected shape of a
  future red (RES-A23-14).
- **It also catches a mis-wired walk, measured.** M2 (`srcRoot` = repo root):
  `ua` 0 -> 23 on repo-grades and 0 -> 4 on grading-results; `nodes` 149 -> 45.
  So R-3 doubles as the control proving the walk resolved anything at all.
  M16 (asset bucket deleted) also reds it, `ua` 0 -> 23.
- **What it does NOT catch: see section 6, M6.** Deleting the `unallowed` bucket
  entirely leaves this assertion GREEN, because there is nothing unallowed today.
  R-5b is the instrument that kills that one.

### R-4 - `unresolvable` is EMPTY over each closure `[G1] [G2]`

- **Object.** `WalkResult.unresolvable` over each of the two root sets.
- **Instrument.** `expect(result.unresolvable).toEqual([])`. Measured now:
  `un=0` on both, and whole-`src` `unclassifiable_sites=0` across 1560 non-test
  files on three consecutive runs - so this is satisfiable and RES-A23-1's
  computed-specifier narrowing stops being a hand-wave.
- **Direction.** Non-empty: a computed (non-literal) import or require specifier
  entered a guarded closure and the guard REPORTS it rather than skipping it.
- **Honest limit, unchanged from round 1 and judged SUFFICIENT by the checker:
  this assertion is GREEN in both directions against M5** (section 6). The
  instrument that discriminates the "silently drop non-literals" mutation is the
  pair of residue fixtures in R-6, not this assertion. Both are required; neither
  alone is coverage. **R-3 and R-4 are KEPT AS WRITTEN with this caveat** -
  R-3 is the only killer of M2.

### R-5 - Each guard file carries a PLANTED POSITIVE, built from ONE shared options object `[G1] [G2]`

Ruling Z2, `docs/a23-architecture.md:1218-1290`. **Round 1 stated the shared-
options requirement in prose and asserted nothing about it. That was blocker
B-2 and Ruling W3 disposes it by construction, not by stronger prose.**

- **R-5a. `violations.length > 0`.** Measured 4 today. **Assert `> 0`, never
  `=== 4`** - the count is a property of an unrelated part of the tree, and the
  architecture already measured it moving 5 -> 4 when the prefix widened
  (`docs/a23-architecture.md:1283-1290`).
- **R-5b. `unallowed.length > 0`.** Measured 6 today (first is `node:crypto`).
  **NOT in the architecture's Z2 table; added by this document**, because M6
  measures that without it, deleting the entire `unallowed` bucket - the pre-Z1
  hole, the founding defect of this row's replacement - survives every other
  assertion here.
- **R-5c. The trail names the hazard.** At least one violation's `resolved`
  **CONTAINS** `lib/supabase/server`. Measured `true`. **This DIVERGES from
  `docs/a23-architecture.md:1276`, which prescribes `.startsWith`, and the
  divergence is flagged rather than quietly fixed - section 3.3.** `contains` is
  insensitive to a path form the seam does not pin; `.startsWith` is not, and an
  implementer following the architecture verbatim can get a red canary on correct
  code. R-15 pins the form so both become well-defined.
- **R-5d. The second canary**, cheap and measured (`nodes=3`):
  `src/lib/supabase/owner-context.ts`, the only file in `src/` that imports
  `node:async_hooks` (the X4 path). `violations > 0` and one `unallowed`
  specifier is exactly `node:async_hooks`. Both measured `true`. **Ruling W3
  makes this one non-optional**, because it is the second call site that gives
  R-5e something to compare.
- **R-5e (NEW, Ruling W3). ONE options object, and the test PROVES both call
  sites take it.** Two clauses:
  - **(i) Construction.** Each guard file declares exactly one
    `const OPTIONS: WalkOptions` whose every field is a NAMED IMPORT from
    `src/lib/module-graph/client-boundary-policy.ts`, and passes that identifier
    to every `walkRuntimeGraph` call. Plus `expect(OPTIONS.forbiddenPathPrefixes)
    .toEqual(FORBIDDEN_PATH_PREFIXES)` and the same for the other four, so a
    hand-typed copy of a list is caught as well as a dropped one.
  - **(ii) The assertion that makes (i) checkable.** `[LEAF]`'s own test parses
    BOTH guard files' source and asserts, PER FILE: at least 2 `walkRuntimeGraph`
    calls; EVERY call's second argument is a bare `Identifier` (never an
    `ObjectLiteralExpression`); and, WITHIN THAT FILE, all those identifiers are
    the SAME name. **This is a within-file comparison only** - `[G1]` and `[G2]`
    are two separate files and this clause does not compare their identifiers
    to each other, so it does not pin either file's spelling, and it does not
    require the two guard files to name their options object the same thing.
    The identifier's SPELLING is not pinned - the FACT is "one object, every
    call, per file".
- **Direction.** Any of a-d false: the detector has stopped discriminating, and
  every green in R-1/R-3/R-4 is vacuous. For (e): a call site with an inline
  object literal, a second separately-built options object, or fewer than two
  calls.

#### 5.3 I attacked R-5e before shipping it, which is the point of the clause

`loop-test-author.md:59-61`. I wrote the passing-but-wrong guard file myself -
the one the checker built, whose REAL walk passes `forbiddenPathPrefixes: []`
while its canary uses the shared constant - plus two further attacks, and ran the
instrument against all four.

First, the measurement that makes the attack necessary. With
`forbiddenPathPrefixes: []` the real walks are **byte-identical to baseline**:

```
node --experimental-strip-types <sandbox>/probe.ts
W3.rg_with_empty_prefixes violations=0 unallowed=0 unresolvable=0 nodes=149
W3.gr_with_empty_prefixes violations=0 unallowed=0 unresolvable=0 nodes=93
W3.rg_identical_to_baseline=true
W3.gr_identical_to_baseline=true
```

R-1, R-3, R-4, all three R-5 clauses and R-10 pass. The guard is fully
decorative and nothing sees it. **This is the ONE options field that is silently
droppable**: `srcRoot` is caught by M2, `treatUseServerAsWall` by M8,
`allowedBareSpecifiers` reds immediately, `browserSafeModules` by M10.

Then the instrument, run against four implementations
(`node --experimental-strip-types <sandbox>/rebuilds2.ts`):

```
CORRECT                              PASSES  2 calls, all take OPTIONS
DECORATIVE (real walk drops field)   REDS    argument kinds ["ObjectLiteralExpression","Identifier"]
TWO SEPARATE OBJECTS                 REDS    2 distinct option identifiers ["OPTIONS","CANARY_OPTIONS"]
CANARY DELETED                       REDS    only 1 walkRuntimeGraph calls, expected >= 2
```

The min-call clause is what keeps it non-vacuous: both guard files have
`walkRuntimeGraph_calls=0` today, so without it the assertion would be
`[].every(...)` - the same defect W4 disposes in R-11, and I checked for it here
rather than shipping it twice.

**This drives the production path, it does not route around a gate**
(`loop-test-author.md:109-117`). `[LEAF]`'s test already parses the whole of
`src/` for R-11, and it loads `typescript` through the same
`createRequire(import.meta.url)("typescript")` form the seam itself specifies.
**No new export is added to the seam** and no gate is loosened; the test reads
the guard files as the files they are.

### R-6 - The cross-product `[LEAF]`

- **R-6a. Every fixture's AST verdict matches its `want`.** Object: for each of
  the 157 fixtures, `scanRuntimeEdges(source, fileName)`. Pass: for `want=edge`,
  `edges` contains the specifier and `unresolvable` is empty; for `want=erased`
  and `want=none`, neither; for `want=residue`, `unresolvable` is non-empty and
  `edges` does not contain the specifier. Instrument: `it.each` over the
  GENERATED table. Direction: any disagreement. Measured:
  `R6a.fixtures=157 R6a.disagreements=0`.
- **R-6b. Each fixture carries its direction label** (positive control /
  regression canary), per O-A's mechanical rule. Direction: an unlabelled
  fixture, or one labelled from its currently-observed value rather than from
  `want` (AC-8's failure direction).
- **R-6c. `fixtures.length === 157`,** with O-A's per-cell `n` column frozen
  alongside, and `CLAUSE_SHAPES.length === 12` / `NONCLAUSE_SHAPES.length === 10`
  frozen too. Direction: any other number - a shape, a side or an applicability
  rule was deleted, and the `n` column names which. This is the count assertion
  `traps-tests.md:30-33` requires; its demonstrated failure mode is M13, which
  reds 8 of the cells the SIDE dimension added.
- **Do not import the fixture table from another `*.test.ts`.** It lives in
  `[LEAF]` and is consumed there. `traps-tests.md:46-50`.
- **Sabotage.** M3 (8 red), M4 (8 red), M5 (2 red), M7 (2 red), **M13 (8 red)**.
  All discriminate.

### R-7 - A `.tsx` source is parsed as TSX `[LEAF]`

- **Object.** `scanRuntimeEdges(src, "fixture.tsx").edges` where `src` is
  `export function C() { return <div>{require("@/lib/grade")}</div>; }`.
- **Instrument.** The `require-inside-jsx` fixtures, scanned with a `.tsx` file
  name, plus the explicit TS/TSX pair.
- **Direction.** Empty under `.tsx`. Measured: `R7.tsx=["@/lib/grade"]
  R7.ts=[]`. The edge is LOST when the script kind is wrong, silently, in the
  permissive direction - and both guarded directories are full of `.tsx` files.
- **This requirement exists because a mutant survived in round 1.** Section 6, M7.
  In round 2 M7 is caught TWICE - by R-7 and by R-6a - because the JSX shape is
  now a fixture as well as a named requirement.

### R-8 - The forbidden-path prefix is CHARACTER-BY-CHARACTER, and a SIBLING FILE IS FLAGGED `[LEAF]`

**INVERTED from round 1 by Ruling W1.** Round 1 asserted a `/` boundary and named
"a SIBLING is flagged" as the failure. That is backwards: the no-slash form is
the repo's documented idiom and exists SO THAT a sibling is caught.

- **Object.** Three booleans from three one-root walks of `walkRuntimeGraph`,
  each with `browserSafeModules: []` and `treatUseServerAsWall: false` (a
  configuration oracle, not a real-tree assertion - with the wall on, a
  `"use server"` root stops the walk at node 1 and the oracle measures nothing).
  The roots are chosen because their OWN direct edges reach each side of the
  boundary, so no clause depends on traversal order:

  | clause | root | prefix | assert |
  |---|---|---|---|
  | R-8a | `src/app/account/diagnostics/page.tsx` | `app/actions` | `app/actions.ts` IS among the flagged resolved paths |
  | R-8b | `src/lib/course-intel/canvas-readers.ts` | `lib/canvas` | `lib/canvas.ts` IS flagged |
  | R-8c | `src/lib/canvas/announcements.ts` | `lib/canvas` | some flagged path starts with `lib/canvas/` |

- **Instrument.** `node --experimental-strip-types <sandbox>/assert.ts`. Measured
  today: `R8a=true`, `R8b(canvas sibling)=true`, `R8c(canvas inside)=true`.
- **Direction of failure: a SIBLING IS NOT FLAGGED** (R-8a, R-8b), or nothing
  inside the directory is (R-8c). Measured with the boundary added (mutant M9):
  `R8a true -> false` and `R8b true -> false`. **That is the m-3 fix going red,
  which is the whole point of the inversion.**
- **Authority, relocated to the line that documents this direction.**
  `classTrendsDraft.not-postable.test.ts:46-53` - a prefix WITH a trailing slash
  MISSES `src/app/actions.ts`; `:64-66` - "character-by-character prefix matched,
  never segment-by-segment"; `:58` - the live five-prefix value, no slashes.
  **Real siblings exist for FOUR of that walker's five prefixes.**
- **The two forms are NOT nested**, re-measured here on the documented instance:
  `R8.actions/noslash violations=11 nodes=68 actions_ts_hit=true` against
  `R8.actions/withslash violations=53 nodes=69 actions_ts_hit=false`. Each misses
  what the other catches.
- **No count is frozen by this requirement, deliberately.** The orchestrator's
  ruling reports `v=3` on the `lib/canvas`-from-barrel configuration where I
  measure `v=2` (`nodes=44` agrees in both). I could not reconcile that
  difference and I am not adopting either number: R-8 asserts only the three
  booleans, and the booleans agree in both measurements. **Section 10 records
  the unreconciled figure rather than hiding it.**
- **This is a REBUILT mutant, not a bad one banked as a kill.** See section 6, M9.

### R-9 - A `"use server"` module is a WALL `[LEAF] [G1] [G2]`

- **Object.** `walkRuntimeGraph` over each real root set with
  `treatUseServerAsWall: true`, the directive read from the PARSED prologue
  rather than a text slice.
- **Instrument.** R-1's own numbers are the enforcer. Measured with the wall
  removed (M8): repo-grades `violations 0 -> 104`, `nodes 149 -> 454`;
  grading-results `violations 0 -> 104`, `nodes 93 -> 418`.
- **Direction.** The closures explode. **Assert the EXPLOSION, never a frozen
  count** - the violation count moved 105 -> 104 between rounds of this document
  alone (section 10). **R-1's own numbers are the enforcer, not a separate
  ratio**: R-1 already asserts each closure's `violations` array is empty on
  the real tree, so `violations` going from 0 to a triple-digit count with the
  wall removed is what R-1 catches when the wall is missing - stating a
  multiplier on top (measured 454/149 = 3.047x, a 1.5% margin above a naive
  "3x" threshold) adds a second, more brittle instrument for the same fact.
  Assert `violations` going from 0 to more than 50 in both closures, which
  clears with a wide margin (104 measured, more than double), and nothing else.
- This is the 339-false-positive incident
  (`canvas-client-boundary.transitive.test.ts:34-37`) and the architecture's own
  reproduction, measured a third time here.
- **Note the divergence from the other in-repo walker:**
  `classTrendsDraft.not-postable.test.ts:115-118` explicitly has NO wall. Do not
  copy that walker's control flow; copy `canvas-client-boundary`'s.

### R-10 - All FIVE policy lists are frozen, and two of them are disjoint `[LEAF]`

- **Object.** The five exported literal arrays of
  `src/lib/module-graph/client-boundary-policy.ts` (oracle O-D).
- **Instrument.** `toEqual` against literals in the test, plus an intersection
  over the two specifier lists asserted empty. Measured
  `R10.lists=[1,1,3,14,1] R10.disjoint=true`.
- **Direction.** A list changed without the test changing; or a specifier
  appears on both lists, letting the diagnostic contradict the allow list.
- **Round 1 froze three of five (mn-3).** `FORBIDDEN_PATH_PREFIXES` was caught
  only by R-5c and `ALLOWED_ASSET_EXTENSIONS` by nothing. Both are frozen now;
  two lines.
- **Honest limit, unchanged:** this is a structural freeze. It makes a silent
  widening or narrowing unrepresentable; it detects nothing about whether an
  entry is CORRECT. **RES-T-4.**

### R-11 - The leaf is not reachable from a client bundle `[LEAF]`

**RECONCILED by Ruling W4.** Round 1's three clauses bound three different sets;
over a set of non-test files `every(p => p.endsWith(".test.ts"))` is
`[].every(...)`, true forever, and the post-wave count of 3 could not appear in
a non-test sweep at all. **The reading kept is the architecture's own
(`docs/a23-architecture.md:1005-1013`): EVERY file under `src/`.**

- **Object.** **Every file under `src/` - test AND non-test - whose PARSED edges
  name the leaf's specifier.** One set, named once, used by both clauses.
- **Instrument.** A whole-`src` parsed sweep in `[LEAF]`'s own test, over all
  2652 `.ts`/`.tsx` files, asserting TWO things:
  - **(i) ANTI-VACUITY: the set has at least 3 members.** This is what makes the
    `every` clause mean something; without it the assertion is true over the
    empty set. It is the same "finds the entry points at all" precedent as
    `canvas-client-boundary.transitive.test.ts:170-177`.
  - **(ii) every member's path ends in `.test.ts`.**
- **Direction.** (i) fewer than 3 importers - the sweep resolved nothing, the
  specifier form changed, or the leaf was renamed, and (ii) has gone vacuous.
  (ii) a non-test importer appears: the leaf pulls in `typescript` and `node:fs`,
  and a value import from a client file is a real build hazard.
- **Measured today:** `R11.all_src_files=2652 R11.importers_of_leaf=0`,
  `R11.every_is_test=true (vacuous today: set is EMPTY)`. **So clause (i) is RED
  before the wave and GREEN after it** - which is exactly the positive control
  RES-T-3 said R-11 did not have. **W4 converts RES-T-3 from "no control until
  the wave" into "a control that lands with the wave".**
- **Cost, measured, because this sweep is the expensive part of the row:**
  section 8. **Carry `{ timeout: 30000 }` on this sweep and on both directory
  walks.**

### R-12 (GATE, not a test) - Both guard files in ONE commit

- **Object.** The wave's file set. **Instrument.** `git status --short` at the
  wave gate against the assignment, plus `git diff --name-only`.
- **Direction.** Exactly one of `[G1]`/`[G2]` touched. AC-10; also forced by the
  one-wave plan at `docs/a23-architecture.md:1144-1217`.

### R-13 (GATE, not a test) - The pre-existing gates hold

- `npx tsc --noEmit` (no output, exit 0) - **one caller, the wave gate.**
  **Grep the diff for the dotAll `/s` flag before running it**: it passes vitest
  and fails tsc with TS1501, and it has been hit twice in one day here by two
  implementers. Nothing in these notes needs it.
- `npm run lint` - `4 problems (0 errors, 4 warnings)` is the baseline.
- `npx vitest run` - the full suite. The pre-fix figures at `c458f7a` quoted in
  `docs/a23-criteria.md:628-630` are `Test Files 1092` / `Tests 21761`;
  **I did not re-measure those and they are quoted, not measured here.**
  Re-measure at the gate.
- Line budget: `@(Get-Content <file>).Count` at the gate, never
  `Measure-Object -Line`. Re-measured this round: `[G1]` **305**, `[G2]` **241**,
  `classTrendsDraft.not-postable.test.ts` 232.

### R-14 (NEW, MJ-4) - `classifySpecifier` returns the right bucket by the right candidate `[LEAF]`

- **Object.** `classifySpecifier(specifier, importerAbs, srcRoot)` over oracle
  O-E's 18 rows.
- **Instrument.** For each row, `disposition.kind` against the frozen bucket; and
  for a `module` row, the INDEX of the resolution candidate that produced
  `resolved`, against the frozen index. Asserting the index rather than the
  string is what makes the candidate axis real - a `module` verdict reached by
  the wrong candidate is a different behaviour with the same answer.
  Measured: `MJ4.classify_rows=18 MJ4.mismatches=0`.
- **Direction.** Any bucket mismatch, or a `module` resolved by a candidate other
  than the frozen one. In particular: `missing` collapsing into `package`
  (M15 - **killed by nothing else here**), the asset check deleted (M16), or
  `srcRoot` mis-wired (M2 reds 5 of the 18 alias rows).
- **Why it is owed, measured:** the real `unallowed` population across every walk
  in this document is 6 node-builtin + 1 package, **zero asset and zero missing**.

### R-15 (NEW, MJ-3) - `Violation.resolved`'s PATH FORM is pinned by the seam `[LEAF]`

- **Object.** `Violation.resolved` and `Unallowed`'s trail entries, for any
  violation produced by any walk.
- **Instrument, corrected by orchestrator Ruling V3.** The regex pair this
  clause originally specified does not bind: `"src/lib/supabase/server.ts"` -
  the exact value section 3.3 says the architecture's own probe printed, and
  the entire reason MJ-3 exists - **passes both** `expect(v.resolved).toMatch(/^[a-z]/)`
  and `expect(v.resolved).not.toContain("\\")`, and so does a lowercase drive
  letter. A regex enumeration is not a construction; the seam stays
  underdetermined and nothing reds. **`[LEAF]` instead asserts a COMPUTED
  expectation**: `expect(v.resolved).toBe(relative(srcRoot, abs).split(sep).join("/"))`,
  built with Node's own `path.relative`/`path.sep`, for every violation on the
  R-5 canary walk - the construction, not an enumeration of its properties.
  Measured today: `["lib/supabase/server.ts","lib/supabase/effective-identity.ts", ...]`,
  which is exactly what the computed expectation yields on this tree.
- **Direction.** An absolute or repo-relative path. That is not a cosmetic
  failure: it is what makes `docs/a23-architecture.md:1276`'s prescribed
  `.startsWith("lib/supabase/server")` true in one implementation and false in
  another, with no line of the seam to appeal to. **Pinning the form is the
  change of KIND; R-5c's `contains` is the belt.**
- **This requirement was NOT in round 1.** Round 1 silently wrote `contains`
  instead of `.startsWith` and called it a note to the implementer.

---

## 6. The sabotage pass - seventeen mutants, three rebuilt, and what got through

**Method.** Each mutation was applied to a COPY of the reference implementation
(`cp`-backup, never `git checkout --`, which reverts to the index and destroys
uncommitted work), the compact assertion probe re-run **in a fresh node
process**, and the file restored. Restore verified by re-running the probe and
byte-comparing to the baseline: every row reports `restore_ok=true`, and the
driver's final line is `FINAL restore_ok=true`. **Each mutation also reports its
anchor-occurrence count**, so a mutation that matched nothing, or matched more
than intended, is visible rather than silent - every one reports exactly 1.

Command: `node --experimental-strip-types <sandbox>/mutants.ts` and
`<sandbox>/rebuilds2.ts`.

| Mutant | Mutation | Result | Killed by | Discriminates? |
|---|---|---|---|---|
| **M1** | `directoryRoots` returns `[]` | `R2.rg_roots` 32 -> **0**, `gr_local_roots` 11 -> **0**; `RG.violations` 0 (green both ways); `RG.nodes` 149 -> 0; both canaries green | **R-2 only** | YES - the ONLY mutant R-2 catches and nothing else does |
| **M2** | `srcRoot` = repo root, not `src/` | `RG.ua` 0 -> **23**, `GR.ua` 0 -> **4**; `nodes` 149 -> 45; `MJ4.mismatches` 0 -> **5** | **R-3, R-14** | YES |
| **M3** | `importClauseIsErased` ignores the DEFAULT binding | **CORRECTED (as-built verification, 2026-09-21): 14 fixtures red, not 8, and a second shape - measured 6 `default/import/*` plus 8 `default-inline-type/import/*`.** | **R-6a** | YES - this is AC-2(c) |
| **M4** | import side: `.some` not `.every` | 8 fixtures red, all `mixed-inline/import`; `RG.nodes` 149 -> 127; `R5d.owner_v_gt0` true -> **false**; `RG.violations` stays 0 | **R-6a, R-5d** | YES - note R-1 does NOT see it |
| **M5** | non-literal specifiers silently dropped (the pre-Z1 `continue`) | **2** fixtures red (`computed`, `template-substituted`); both closures unchanged | **R-6a only** | YES via the fixtures; **R-4 is green in BOTH directions and discriminates NOTHING here** |
| **M6** | the `unallowed` bucket removed - **REBUILT this round, see below** | `R5b.barrel_ua_gt0` true -> **false**; `R5d.owner_names_async_hooks` true -> **false** | **R-5b, R-5d** | YES after the rebuild; **R-3 is green in BOTH directions.** Without R-5b this mutant SURVIVES the entire suite |
| **M7** | `ScriptKind` always TS, never TSX | 2 fixtures red (`require-inside-jsx/*`); `R7.tsx` `["@/lib/grade"] -> []` | **R-7, R-6a** | YES - rebuilt in round 1; now caught twice |
| **M8** | the `"use server"` wall removed | `RG` `v 0 -> 104, ua 0 -> 12, n 149 -> 454`; `GR` `v 0 -> 104, n 93 -> 418` | **R-1, R-3** (**CORRECTED, 2026-09-21: NOT R-9** - R-9's own oracle already sets `treatUseServerAsWall: false`, so it cannot discriminate a change to that same field) | YES |
| **M9** | `isForbiddenPath` gains a `/` boundary - **THE WITHDRAWN m-3 FIX** | `R8a` true -> **false**; `R8b(canvas sibling)` true -> **false**; `R8c(canvas inside)` false -> true | **R-8 only** | YES, two-sidedly |
| **M10** | `browserSafeModules` ignored | `RG.violations` 0 -> **1** (`index.tsx -> useRepoGradesData.ts -> SupabaseProvider.tsx` value-imports `@/lib/supabase/client`) | **R-1** | YES |
| **M11** | the forbidden-path check removed entirely | `barrel v` 4 -> **0**; `R5c` both forms true -> **false**; `R5d.owner_v_gt0` -> false; all three R-8 booleans -> false | **R-5c, R-5d, R-8** (**CORRECTED, 2026-09-21: NOT R-5a** - with the path check gone the walk recurses INTO `lib/supabase/server.ts`, which value-imports `next/headers`, so `FORBIDDEN_BARE_SPECIFIERS` keeps `violations` non-empty and R-5a's `> 0` assertion still passes) | YES |
| **M12** | the walk never recurses (direct-only) | `barrel v` 4 -> **0**, `barrel ua` 6 -> **0**; `RG.nodes` 149 -> 32; `GR.nodes` 93 -> 13 | **R-5a, R-5b** | YES |
| **M13** | **NEW.** EXPORT side: the `elements.length > 0` guard dropped - the checker's passing-but-wrong implementation | **8 fixtures red, all `empty-braces/export/*`**; every closure, canary and policy assertion unchanged | **R-6a only, via cells that did not exist in round 1** | YES - **this is blocker B-1, and only the SIDE dimension kills it** |
| **M17** | **NEW (Ruling V4). IMPORT side: the same `elements.length > 0` guard dropped, on the import clause instead of the export clause - the import-side twin of M13.** | **8 fixtures red, all `empty-braces/import/*`**; every closure, canary and policy assertion unchanged | **R-6a only, via cells that did not exist in round 1** | YES - independent of the compiler-configuration question section 3.4 argues: SWC (Ruling V1) measures `empty-braces/import` a real edge under BOTH configurations, so this kill does not hinge on the contested cell the way M13's does |

**CORRECTION (as-built verification, 2026-09-21): M13 and M17 are NOT
independent against the SHIPPED code.** The shipped `namedElementsConveyValue`
(`runtime-import-graph.ts:68-74`) is ONE function used on both the import and
the export side (`:88` and `:103`) - it was never written as two separate
`elements.length > 0` guards, one per side, the way M13/M17's descriptions
imply. A single edit to that one function reds BOTH sides' `empty-braces/*`
cells at once; the SIDE dimension still reds both cells either way, so no
coverage is lost, but a report that runs M13 and M17 as two distinct mutants
is describing the same mutation twice, not two independent kills.
| **M15** | **NEW.** `classifySpecifier`'s `missing` branch deleted (falls through to `package`) | `MJ4.mismatches` 0 -> **3**; every closure, canary and fixture assertion unchanged | **R-14 only** | YES - **killed by NOTHING ELSE in this document** |
| **M16** | **NEW.** `classifySpecifier`'s asset check deleted | `RG.ua` 0 -> **23**, `GR.ua` 0 -> **10**; `MJ4.mismatches` 0 -> **2** | **R-3, R-14** | YES |
| **M14** | the DECORATIVE guard file: the real walk passes `forbiddenPathPrefixes: []`, the canary keeps the shared constant | **byte-identical to baseline on every walk**; R-1, R-3, R-4, R-5a-d and R-10 all pass | **R-5e only** | YES - section 5.3 runs the instrument against it and two further attacks |

### The mutants I rebuilt rather than banked, reported explicitly

`loop-test-author.md:100-107`: a surviving mutant may be a bad instrument rather
than a kill I am owed. **Three rebuilds are on record across the two rounds, and
one of them is a rebuild OF A ROUND-1 REBUILD.**

**M6 was a BAD MUTANT AGAIN THIS ROUND, and I nearly banked it.** The round-2
driver's M6 replaced only the `package` branch's `unallowed.push`. The bucket has
FOUR push sites, so `node:crypto` still landed in it and `R5b.barrel_ua_gt0`
stayed `true (6) -> true (5)` - **R-5b GREEN on the exact mutation it exists to
catch.** That is my own brief's named failure mode: a sabotage that mutates the
wrong object. Rebuilt with a regex over all four sites, verified
`remaining=0` in the mutated source, and re-run:

```
=== M6-REBUILT: all 4 unallowed.push sites removed (remaining=0)
  WAS: R5b.barrel_ua_gt0=true (6)     NOW: R5b.barrel_ua_gt0=false (0)
  WAS: R5d.owner_names_async_hooks=true  NOW: ...=false
  restore_ok=true
```

**Reporting this matters more than the kill does.** Had I taken the round-2 M6 at
face value I would have concluded that R-5b does not discriminate and gone
looking for a stronger assertion - adding mechanism to fix a broken instrument,
which is the class `iteration-caps.md:16-19` says never ends a chain.

**M7 (round 1) was bad because it mutated a property the WALK cannot see.** A
whole-tree walk parses `.tsx` files whose imports are all at the top, where
TS-kind and TSX-kind parsing agree, so the mutation produced no observable
difference over 149 + 93 nodes. Rebuilt in round 1 as a UNIT fixture with a JSX
expression container around the import site; measured across four candidate
shapes, exactly one discriminated. **In round 2 it is caught twice**, because
that shape is now a product cell as well as requirement R-7.

**M9 (round 1) was bad because its premise is absent from this tree** -
`ls src/lib | grep ^supabase` returns the directory with no sibling file, so
under `forbiddenPathPrefixes: ["lib/supabase"]` a boundary-less `startsWith`
cannot differ from a boundary-ed one on any real path
(`R8.supabase_siblings_on_disk=["supabase"]`, re-measured). Rebuilt as a
CONFIGURATION oracle. **Round 1 rebuilt it in the WRONG DIRECTION** - it asserted
the boundary and called the sibling a defect. Ruling W1 inverts it; the rebuilt
mutant now IS the withdrawn m-3 fix and R-8 kills it two-sidedly.

### Requirements with NO executed sabotage, said plainly

- **R-10** (frozen policy lists, disjointness). A mutation of a frozen literal is
  detected by definition; there is no interesting mutant, and claiming a kill
  would be inflating the count. Its honest value is that it makes a silent
  widening or narrowing unrepresentable, not that it detects a bad entry.
  **RES-T-4.** (M16 does red `ALLOWED_ASSET_EXTENSIONS`'s effect, but through
  R-3 and R-14, not through R-10.)
- **R-6b** (direction labels). The label is derived from `want` by a rule, so a
  wrong label means a wrong rule, and the rule is one expression. No mutant
  distinguishes it from R-6a.
- **R-11's clause (ii)** has no positive control until the wave lands - zero
  non-test importers exist today and none can be planted without writing a file
  into `src/`, which this pass may not do. **Clause (i) DOES have one**: it is
  RED today and GREEN after step 3. **RES-T-3, re-scoped.**
- **R-12, R-13, R-15** - R-12 and R-13 are gate rows. R-15 is a shape assertion
  on a field whose form the seam does not yet pin; there is no mutant until the
  seam pins it, which is the requirement.
- **R-5e clause (i)** is a source-construction requirement. Clause (ii) is what
  executes, and section 5.3 runs it against three attacks.

### I attacked my own instrument set again, and here is what still gets through

Round 1's answer was **M5 + M6 together** - an implementation that drops every
non-literal specifier AND deletes the `unallowed` bucket is green on both real
closures, on `unresolvable`, on `unallowed`, on violations, and on the Z2 canary
**as the architecture specifies it**. That remains true and is caught only by
**R-5b** and the residue fixtures. **Round 2 adds three more that the
architecture's specified assertions alone do not catch:**

- **M13** - caught only by cells the SIDE dimension created.
- **M17** - the import-side twin of M13 (Ruling V4), caught the same way, on a
  cell SWC (Ruling V1) confirms is not compiler-configuration-dependent.
- **M14** - caught only by R-5e, and byte-identical to baseline otherwise.
- **M15** - caught only by R-14, and invisible to every walk on the real tree.

**If a checker removes R-5b, the SIDE dimension, R-5e or R-14, say which mutant
comes back.** None of the four instruments was in my inputs.

---

## 7. Landing order - what makes AC-7 dischargeable (obligation O-4)

**The measured fact AC-7 rests on, re-measured this round:**

```
npx vitest run src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts \
               src/app/components/grading-results/gradingResultsHelpersWiring.test.ts
Test Files  2 passed (2)
Tests  52 passed (52)
Duration  1.33s
```

Both guard files read FIXED sources - guard 1 from four module-level constants,
guard 2 from `readFileSync` of the real `types.ts` - and **neither takes a
fixture**, so neither can record a pre-fix RED. `docs/a23-criteria.md:518-523`
requires the red to be observed "inside the suite that will carry the fixtures
forward"; under this shape that suite is `[LEAF]`, not the two guard files, and
`docs/a23-architecture.md:1210-1217` relocates AC-7 there as an
`iteration-caps.md:60-62` disposal (a). **This section is the receiver's
obligation discharged.**

**The order. Step 1's red is the whole point of the ordering; do not merge it
into step 2.**

0. Commit and re-run the architecture's ten probes (RES-A23-13) before touching
   any guard file. A number that does not reproduce means the design rests on a
   measurement that is not real.
1. **Land `[LEAF]`'s fixture table and its assertions with `valueImportSpecifiers`
   - duplicated verbatim, never imported from another `*.test.ts` - as the
   extractor.** Run `npx vitest run src/lib/module-graph/runtime-import-graph.test.ts`
   and **RECORD THE RED**. Expected, measured against this table
   (`node --experimental-strip-types <sandbox>/step1.ts`):
   **60 of 157 fixtures fail, 97 pass.** The shape/side cells that must be RED:

   ```
   named-value/{import,export}   mixed-inline/{import,export}
   empty-braces/{import,export}  namespace/{import,export}
   star/export   default/import   default-inline-type/import  default-namespace/import
   side-effect   require   dynamic-import   next-dynamic   template-nosub
   computed   template-substituted   require-inside-jsx
   ```

   The cells that must be GREEN at step 1 - the regression canaries - are
   `type-only-clause/{import,export}`, `inline-type-1/{import,export}`,
   `inline-type-2/{import,export}`, `type-default/import`, `in-comment` and
   `in-string`. Any of those red means the table is wrong, not the extractor.
   **The recorded evidence is the failing-test LIST, not the number.** If your
   table differs from O-A, re-derive the count from your table; do not carry 60
   forward as a frozen expectation.
2. Land `runtime-import-graph.ts` and `client-boundary-policy.ts`; re-point
   `[LEAF]` at `scanRuntimeEdges`. Re-run; record GREEN (**expected 0
   disagreements**). R-7, R-8, R-9, R-10, R-11, R-14, R-15 land here too.
3. Re-point both guard files at the leaf, in ONE commit. Each lands its own
   R-2 frozen root set, its own R-1/R-3/R-4 assertions, its own R-5 canary with
   all five clauses, and the single `const OPTIONS`. `[LEAF]`'s R-5e clause (ii)
   and R-11 clause (i) BOTH flip from red to green at this step - they are the
   step's own controls.
4. Wave gate: R-12 and R-13.

**Direction of failure for AC-7 itself:** the fix lands and every fixture is
green at the moment it lands. That is the state Ruling U3 shipped in, and
`traps-tests.md:8` rules a test is not evidence until you have watched it fail.

---

## 8. Cost: eight measurements of the whole-`src` parse, none adopted silently (mn-4)

The whole-`src` parsed sweep is the expensive part of this row, and it now has
eight independent wall-clock figures over the same 1560 non-test files:

| source | ms |
|---|---|
| round 1 of this document, two consecutive runs | 1415, 1385 |
| **round 2 of this document, three consecutive runs** | **1644, 1491, 1522** |
| `docs/a23-architecture.md`'s own probe, two runs | 1800, 1847 |
| the architecture's checker | 1929 |
| this document's checker, a fifth run | **2029** |

**I adopt none of them.** The conclusion is identical under all eight, and the
honest statement is the one against the WORST: 30000 / 2029 = **a margin of at
least 14x across eight measurements**, against the `{ timeout: 30000 }` both
precedent walkers carry. Round 1 said "15-21x" from five figures and was
therefore quoting a margin the sixth-to-eighth measurements do not support.
**Carry that timeout on this sweep and on both directory walks.**

Command for the round-2 figures:
`node --experimental-strip-types <sandbox>/probe2.ts`, `PARSE.run` lines.

---

## 9. Executable here versus argued

**EXECUTED in this pass** (all by `node --experimental-strip-types` against a
sandbox reference implementation, commands at each point of use): the
157-fixture three-dimension cross-product against FIVE extractors; the
independent `ts.transpileModule` emit oracle under two compiler configurations;
the full re-derivation of criteria 2.3 and 6 with guard 2's two instruments
separated; both real closures' violations, residue and unallowed; both root-set
derivations against their literals, with O-C's proved equal to the EXISTING
`CLIENT_FILES` half; both planted-positive canaries with all clauses; the
decorative-guard measurement and the R-5e instrument against three attacks;
seventeen mutants with anchor-occurrence counts and restore verification; the
`classifySpecifier` 18-row table and the directory scan that built it; the
whole-`src` residue count and parse ceiling, three times; the `.tsx`
script-kind discrimination; the prefix-boundary pair on the documented
`app/actions` instance; the `.mts` census; the Z3 closure edge count under both
wall settings; the pre-fix guard-file colour under vitest; the seam's strict
typecheck.

**ARGUED, NOT VERIFIED - do not read any of these as measured:**

- **That the shipped tests will behave as the reference did under VITEST.** The
  reference ran under node. vitest transforms modules through vite, and the leaf
  loads an 8 MB CJS `typescript` bundle via `createRequire`. The mechanism is
  argued sound (`createRequire` bypasses vite's pipeline) and it is RES-A23-12.
- **The walk's cost under vitest.** The figures in section 8 are node wall time.
  vitest adds transform and setup; the architecture's 3.5%-of-suite estimate is
  not re-derived here.
- **That SWC's emit for the six diverging cells is measured** (section 3.4,
  10.4) - `transformSync` from the installed `@next/swc-win32-x64-msvc`
  package, not `next build` itself, which this checkout still cannot run.
  **RES-T-6 is closed on that measurement.** What remains argued, and is not
  the same claim: that `next build`'s full pipeline (loader config, Turbopack
  vs. the webpack/SWC path actually selected) treats these two cells the same
  way the bare `transformSync` call does, and that Turbopack's own emit agrees
  with SWC's.
- **That `next build` still compiles after the change.** RES-A23-5; the build
  gate is the `Compiled successfully` line and never the exit code
  (`this-repo.md:52-54`). Nothing here changes runtime code, but that is a
  reading claim.
- **That R-11's sweep will find exactly three importers after the wave.** Zero
  today is measured; three is predicted, which is why R-11 clause (i) asserts
  `>= 3` rather than `=== 3`.
- **`.mts` (mn-5).** `tsconfig.json`'s `include` carries `"**/*.mts"`, and both
  `directoryRoots`'s `/\.(ts|tsx)$/` predicate and this document's derivation
  skip it. Measured: **`MTS.under_src=0`** - zero `.mts` and zero `.cts` under
  `src/`. So the gap is fail-OPEN with no occurrence today. I am not widening the
  predicate (a zero count is not a reason to change a guard in either direction -
  section 3.1's ruling cuts both ways), and I am recording it so the first
  `.mts` under `src/` is not silently unguarded. **RES-T-7.**
- **Anything about markup, focus or keyboard behaviour.** Nothing in this row
  touches a surface, and no test here could see it if it did.

### Sandbox safety, verified

Throwaway tree at `.vercel/a23ref/` - `.vercel` is gitignored
(`git check-ignore -v .vercel` -> `.gitignore:38`) AND is in
`src/source-bytes.structure.test.ts:38`'s `SKIP_DIRS`, so a sandbox there cannot be
collected by the repo-root byte walker. **`node_modules` was never junctioned,
symlinked or touched**; measured before and after:
`@(Get-ChildItem node_modules -Force).Count` -> `450` both times, and
`@(Get-ChildItem node_modules -Force | Where-Object { $_.Attributes -band
[IO.FileAttributes]::ReparsePoint }).Count` -> `0` both times. Torn down with
`rm -rf .vercel/a23ref` and proved: `ls -a .vercel` -> `./ ../` only, then
`rmdir .vercel` -> `.vercel` absent; `git status --short` ->
`M docs/css-orphans.md`, unchanged.

**The seam typechecks under `--strict`, and the form is safe beside the wave
gate:**

```
npx tsc --noEmit --strict --skipLibCheck --module esnext --moduleResolution bundler \
  --target es2022 --allowImportingTsExtensions <sandbox>/runtime-import-graph.ts <sandbox>/fixtures.ts
tsc exit=0   (no output)
md5 before: febba08198005975b2191ed3d852ca81 *tsconfig.tsbuildinfo
md5 after:  febba08198005975b2191ed3d852ca81 *tsconfig.tsbuildinfo
```

`tsc` with EXPLICIT FILE ARGUMENTS does not read `tsconfig.json`, so it never
writes `tsconfig.tsbuildinfo` - **measured by md5 immediately before and after,
in round 1 and again in round 2.** The bare `npx tsc --noEmit` still has exactly
one caller, the wave gate.

---

## 10. Conflicts I am reporting rather than adopting

Round 1 reported three; the checker settled all three in my favour. They are
re-measured here and carried forward, plus two new ones.

### 10.1 `unresolvable` is ZERO in the grading-results closure today, not 1 (round 1, CONFIRMED)

My round-1 dispatch brief stated that "a computed import measures `residue=1` in
the grading-results closure today". **Measured, that is false**, in both rounds:
`GR.unresolvable=0`, and whole-`src` `unclassifiable_sites=0` across 1560
non-test files on three consecutive runs. `residue=1` is a SABOTAGE ROW, not a
tree measurement - the computed specifier is INJECTED. The checker verified this
independently: `unresolvable` is 0 across 1560 files.

**Why it matters:** if `unresolvable` were really 1 today, "assert `unresolvable`
is empty over the closure" would be a requirement the tree could not satisfy. It
is 0, so the requirement is satisfiable - **and it also means that assertion is
GREEN in both directions against M5.** The discriminating instrument is the
residue FIXTURE PAIR, not the closure assertion. O-1 is discharged with both
stated, because only the pair is honest. **RES-T-2.**

### 10.2 The architecture's 0 / 19 / 22 / 20 scoreboard does NOT reproduce (round 1, CONFIRMED)

The 23-construct list "appears nowhere" (`docs/a23-architecture.md:1333-1341`),
so its scoreboard cannot be re-derived - which is why Ruling M2 relocated it
here. I build the product from construction rather than reconstructing a list I
cannot see:

| Extractor | architecture 3.2 (46 fixtures, list unavailable) | round 1 (132) | **round 2 (157)** |
|---|---|---|---|
| AST classifier | 0 | 0 | **0** |
| `valueImportSpecifiers` | 19 | 51 | **60** |
| guard 1 line classifier | 22 | 72 | **89** |
| G2-SWEEP (OPTION (b)) | 20 | 78 | **91** |
| G2-U3 line filter | not scored | not scored | **94** |

The AST column reproduces. The others do not, and their RELATIVE ORDER changes:
the architecture has the sweep (20) better than guard 1 (22); mine has the sweep
worst, because my product includes the two false-positive shapes (a banned
specifier in a comment and in a string) that only a raw-source sweep fails, and
weights the separator axis more heavily. **The checker rebuilt round 1's
scoreboard cell for cell and confirmed the order change genuinely does not
reproduce.**

**The round-2 deltas are fully accounted for by the SIDE dimension**, which is
the check that the table did not drift for some other reason:
`vis 51 + 0 + 4 + 4 + 1 = 60`; `g1 72 + 0 + 8 + 8 + 1 = 89`;
`sweep 78 + 4 + 4 + 4 + 1 = 91` - the four addends being
`inline-type-2/export`, `mixed-inline/export`, `empty-braces/export` and
`template-substituted`.

**The G2-SWEEP column's definition, stated as code**, because round 1 named it
only as "the OPTION (b) unconditional sweep" and a rebuilder has to get it
exactly right:

```ts
// gradingResultsHelpersWiring.test.ts:89-94 applied as :112-117 applies it:
// the WHOLE raw source, no line filter, no type filter.
const BANNED = [/from ["']@\/lib\/grade["']/, /from ["']@\/lib\/grade\/(?!types["'])/];
const g2sweep = (source: string) => BANNED.some((p) => p.test(source));
```

Only the first pattern is exercised, because the product's specifier is exactly
`@/lib/grade`. **No requirement rests on either scoreboard.** Its role is the
step-1 RED COUNT (section 7), where the number that matters is the one produced
by the table as landed. **RES-T-1.**

### 10.3 Z3's "two runtime edges into `types.ts`" is right - for the closure, not for `src/` (round 1, CONFIRMED)

`docs/a23-architecture.md:413-421` reports 2 runtime edges into
`src/lib/grade/types.ts`. Re-measured this round, with the configuration stated
because it is what makes the number:

```
node --experimental-strip-types <sandbox>/probe3.ts
Z3.with_wall nodes=93 distinct_importers=2
             who=["app/components/grading-results/ungradedDisclosure.ts","lib/grade/class-trends.ts"]
Z3.no_wall   nodes=418 distinct_importers=6
Z3.whole_src_edges=13 distinct_files=13
Z3.textual_mentions=20
```

**The architecture's 2 is measured WITH the `"use server"` wall on**, which is
the shipping configuration, and the two files it names are exactly the two.
**Ruling Z3 stands, and its ground is now measured three times.** I record the
other two figures so nobody later reads "2" as a whole-tree fact: without the
wall the closure has 6 importers, and across all of `src/` the file is reached
by 13 runtime edges.

### 10.4 The `want` column for the empty-brace shapes was compiler-configuration-dependent under `tsc` - CLOSED under SWC (Ruling V1)

Section 3.4. Six of the nineteen clause/side cells diverge between the repo's
own `tsconfig.json` and `verbatimModuleSyntax`. `want=edge` for
`empty-braces/{import,export}` and `want=erased` for the four `inline-type`
cells are both KEPT. **Round 1's O-A asserted the language settled this; it
does not - but SWC, measured this round, does**: `empty-braces/import` is a
real SWC edge and `empty-braces/export` is an SWC erasure, so the `edge` pin on
the export cell is a measured false-positive in the safe direction, not an
unmeasured guess. RES-T-6 is closed.

### 10.5 NEW: an R-8 count I could not reconcile, and am therefore not asserting

Ruling W1 reports, on the `lib/canvas`-from-barrel configuration, "no-slash gives
`v=3 n=45`"; my measurement on what I believe is the same configuration
(`forbiddenPathPrefixes: ["lib/canvas"]`, `browserSafeModules: []`, root
`src/lib/grade.ts`) gives `violations=2 nodes=44`. **`nodes` agrees; `violations`
differs by one and I could not determine why.** The load-bearing boolean -
`canvas.ts` flagged - is `true` in both.

**So I am not adopting either count, and R-8 asserts NO count.** It asserts three
booleans from three deliberately-chosen roots, and those booleans agree across
both measurements. Recording the disagreement rather than quietly taking my own
number is the whole of the handling; a frozen count here would have been an
instrument that disagrees with the ruling that created it.

---

## 11. Residual register

Every entry carries an owner, an instrument and a step. An entry missing one of
the three is a deletion and I would call it that; none is. New ids are prefixed
`RES-T-` to avoid colliding with the `RES-A23-n` sequence the criteria and the
architecture share, whose retired ids (3, 6) stay retired.

| Id | Residual | Owner | Instrument | Step that will measure it |
|---|---|---|---|---|
| RES-T-1 | **The architecture's 0/19/22/20 scoreboard is not reproducible; my 0/60/89/91/94 replaces it for a different fixture set (10.2).** Anyone citing either must name the table. | Orchestrator, at the backlog reconciliation | `node docs/a23/a23-shape-probe.mjs` (once RES-A23-13 commits it) against `[LEAF]`'s landed table; compare shape lists, not totals | A23's push |
| RES-T-2 | **My round-1 brief's `residue=1` claim is false against the tree (10.1).** If it came from a document rather than the brief, that document needs the same correction. | Orchestrator | `node --experimental-strip-types` over the grading-results closure, or the committed `a23-reach.mjs`; both give 0 | A23's backlog reconciliation |
| RES-T-3 | **RE-SCOPED by Ruling W4. R-11 clause (ii) has no positive control until the wave lands** - zero non-test importers exist and none can be planted without writing a file into `src/`. **Clause (i) DOES have one and it lands at step 3** (red before, green after), so the requirement is no longer wholly uncontrolled. | Implementer, wave step 3 | clause (i) flipping red -> green at step 3 IS the control; for clause (ii), accept the post-wave importer list and read it | Wave step 3 |
| RES-T-4 | **R-10 has no executed sabotage** (section 6). A frozen-literal freeze prevents a silent widening or narrowing; it detects nothing about whether an entry is CORRECT. `BROWSER_SAFE_MODULES` having one entry and no minimality test is RES-A23-15's substance. | Repo owner, at review | read the diff of any commit that changes one of the five lists | Every future wave that touches either directory |
| RES-T-5 | **R-2's frozen root lists go stale by design.** Adding a file to either guarded directory reds the guard until the literal is updated in the same commit. Intended contract, and also friction. **Reduced for `[G2]` by MJ-2**: it now reds the EXISTING `CLIENT_FILES` literal, which already had this contract, rather than a second one. | Repo owner | the failing assertion names the added file | The next row that adds a file to either directory |
| RES-T-6 | **CLOSED by orchestrator Ruling V1, measured (3.4, 10.4).** SWC (`@next/swc-win32-x64-msvc`, installed, called via `transformSync` through `createRequire`) measures `empty-braces/import` a real edge and `empty-braces/export` an erasure; Next never passes `verbatimModuleSyntax` to it. `want=edge` is KEPT for both cells on separately-measured grounds (SWC agreement for import, ES-semantics fail-closed for export). Turbopack's emit for these six cells remains unmeasured and is a separate engine. | Closed - no further owner action | `node <sandbox>/swc-probe.ts` against the installed `@next/swc-win32-x64-msvc`, reproduced in this round | Closed this round |
| RES-T-7 | **NEW. `.mts` is in `tsconfig.json`'s `include` and is skipped by `directoryRoots` and by this document's derivation (mn-5).** Measured zero `.mts`/`.cts` under `src/` today. Fail-OPEN. Not widened, because a zero count is not a reason to change a guard in either direction (3.1). | Implementer, at the first row that adds a `.mts` under `src/` | `find src -name '*.mts' -o -name '*.cts' \| wc -l`; non-zero means `directoryRoots`'s predicate needs widening in that same commit | The first row that adds one |
| RES-A23-12 | Unchanged from the architecture: whether `typescript` loads under vitest at all is UNMEASURED; the `createRequire` form is measured working under node, here and there. **Widened by R-5e clause (ii)**, which needs `typescript` in `[LEAF]`'s test too - same loader, same risk, no new one. | Implementer | `npx vitest run src/lib/module-graph/runtime-import-graph.test.ts` with each form | Wave step 2 |
| RES-A23-13 | Unchanged: the architecture's ten probes are not committed, so its quantities are not re-runnable from the repo. **My own probes are not committed either**, for the same reason - this pass owns one path - and this document states every command and every input needed to rebuild them. | Implementer (wave step 0) | commit the probes to `docs/a23/`, re-run, diff against the architecture's sections and this document's sections 4-8 | Wave step 0 |

**None of these exist until they are in `docs/BACKLOG.md`** (`DEV_LOOP.md:79-84`).
`docs/backlog.yml` is the orchestrator's file and this seat may not write it.

---

## 12. What I could not determine

- **Why Ruling W1's `v=3` and my `v=2` differ on the same R-8 configuration**
  (10.5). `nodes` agrees at 44 and the load-bearing boolean agrees. R-8 asserts
  no count, so nothing rests on it, but I did not close it.
- **What SWC emits for the six diverging cells of section 3.4 - RESOLVED this
  round**, by Ruling V1's measurement against the installed
  `@next/swc-win32-x64-msvc`. RES-T-6 is closed. What is still open is whether
  `next build`'s selected pipeline and Turbopack agree with the bare
  `transformSync` reading - unmeasured, and named in section 9.
- **Whether the architecture's 23-construct list, had it existed, would agree
  with mine.** I built the product from construction rather than guessing at a
  list I cannot read. Unknowable without the probe (RES-A23-13).
- **Whether any of this behaves identically under vitest.** Section 9.
- **Whether `unallowed` will stay empty as the two closures drift.** It is empty
  today across 149 and 93 nodes; RES-A23-14 already owns the friction.
- **Whether the guards ever let a real defect through historically.** I measured
  the working tree only, like both documents before me. I did not walk the
  history and I am not claiming the guards have never been decorative.
- **Whether the surviving-mutant accounting is complete.** Sixteen mutants plus
  three rebuilds is not an exhaustive mutation of a ~200-line module. The
  checker ruled on round 1's section-9 ask: `classifySpecifier` was a REAL gap
  and is closed by R-14; **memo ordering and the cycle guard are NOT gaps** -
  memo ordering is a COST property (the precedent's own comment records a
  timeout, not a wrong answer) and a broken cycle guard fails loudly against the
  30s timeout. I did not spend effort mutating those two, on that ruling.
