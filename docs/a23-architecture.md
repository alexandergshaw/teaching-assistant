# A23 - architecture pass (the SHAPE)

**Row:** `docs/backlog.yml:429` (`id: 'A23'`), `kind: 'bug'` at `:438`.
**Seat:** architecture (`loop-architect`). **Date:** 2026-09-20.
**Tree:** every quantity below was measured at `c458f7a`
(`git log --oneline -1`), the session HEAD when this pass ran. Working tree at
the start and end of this pass: `M docs/css-orphans.md` only
(`git status --short`), which is outside this loop and was not touched.
**DELTA, 2026-09-20.** A fresh checker returned NOT CLEAN (2 blockers, 5
majors, 4 minors). This is a NARROW DELTA applied at `d7f69c5`
(`git log --oneline -1`), not a revision round: only what the rulings name is
changed, and every quantity added below was re-measured at `d7f69c5` by a
command stated at its point of use. Rulings disposed: **Z1** (blocker - the
deny list becomes an ALLOW list, section 4.2), **Z2** (blocker - a planted
positive in each guard file, section 8), **Z3** (`types.ts` becomes a named
ROOT, section 4.1), M1/M4/M5 and m1-m4 as marked, and M2 RELOCATED
(section 9). What the checker re-derived and CONFIRMED, so it is not restated
apologetically here: every real-tree number in sections 4.3 and 4.4, the
39-violations-with-the-wall-off incident in 4.5, all four TypeScript claims,
the `owns` derivation, the line budgets, the one-wave caller rule, AC-7's
relocation, and every `file:line` in the document.
**Consumes:** `docs/a23-criteria.md` at `c458f7a` (round 3, disposal round).
The criteria are settled; this document decides mechanism only, which is the
lane section 10 of that document explicitly leaves open
("Which of the three C-2 shapes each fix should take ... that is the
architect's lane", `docs/a23-criteria.md:851-857`).
**DISPOSAL, 2026-09-21.** A narrow check of the delta returned 2 blockers, 3
majors, 5 minors, measured against `182ecc6` (`git log --oneline -1`). Both
blockers are REPEAT classes, so under `iteration-caps.md:41-45` they go to
disposal now rather than a third revision of this document, and the architect
is NOT re-dispatched for them: **B-1 and B-2 are RELOCATED to the test
seat**, recorded in full in new section 13. The three majors (M-1 through M-3)
and five minors (m-1 through m-5) are applied in place, below. Working tree at
the start and end of this pass: `M docs/css-orphans.md` only
(`git status --short`), unrelated and not touched.

---

## 0. Leverage - FIRED AND DECLINED

`docs/backlog.yml:438` carries `kind: 'bug'`. `seats.md:70-75` rules that on a
bug fix "there is no claim to make; record that as the fired trigger and move
on." **Trigger fired: bug fix. No leverage claim.** This row repairs three
shipped guards and builds no capability a user reaches, so there is no removal
test to hand the test seat and no class in `docs/loop/leverage.md` this work
could earn. Recording the fired trigger rather than omitting the line.

---

## 1. Three corrections, measured

`loop-architect.md:64-66` requires refusing a ruling the tree disproves. Two
against my brief, and - added in the delta under Ruling M1 - one against a
premise of the criteria I consume. A measurement that contradicts a document
I am building on has to be FLAGGED, not quietly overwritten, which is this
document's own standing definition; I measured the contradiction in section
3.2 and did not flag it, and that is the defect M1 names.

**(1) The brief says the `CLIENT_FILES` sweep "protects THIRTEEN client
files". It protects TWELVE.** Command and output:

```
sed -n '62,80p' src/app/components/grading-results/gradingResultsHelpersWiring.test.ts \
  | grep -c '^\s*"\./\|^\s*"\.\./'
12
```

The twelve, by the same `sed` window with `grep -o '"\.[^"]*"'`:
`./gradingResultsHelpers.ts`, `./RowFeedbackBoxes.tsx`,
`./SubmittedFilesPanel.tsx`, `./icons.tsx`, `./useResultsSort.ts`,
`./ResultsTableHeaderRow.tsx`, `./FeedbackExpandModal.tsx`, `./FilesCell.tsx`,
`./ungradedDisclosure.ts`, `./ungradedRowLabel.ts`, `./classTrendsEntry.ts`,
`../GradingResults.tsx`. This is not a new finding - the criteria's round 3
already corrected it as MJ-b (`docs/a23-criteria.md:932`); my brief inherited
the pre-round-3 number. I adopt **12** and neither value silently.

**(2) The sweep returns FIVE FILES, carrying SIX instances of the class, of
which A23 charters three.** A23 charters three and I am not widening it. But
an `owns` list that says "three" is wrong, and a residual that says "a third
site" names the wrong denominator. **Ruling M5: the ordinals in the first
version of this document were incoherent** - section 1 called the two workflow
files "sites 4 and 5" while section 7's `owns` table also called
`ungradedDisclosure.test.ts` "site 4", putting three files under two ordinals.
The numbering used everywhere below, fixed once here:

| # | File | Status |
|---|---|---|
| file 1 | `repoGradesFeedbackAndFiles.wiring.test.ts` | holds **instance 1** (guard 1) - CHARTERED |
| file 2 | `gradingResultsHelpersWiring.test.ts` | holds **instances 2 and 3** (guard 2 and the `:112-117` sweep) - CHARTERED |
| file 3 | `ungradedDisclosure.test.ts` | holds **instance 4** - not chartered (RES-A23-9) |
| file 4 | `course-schedule-docx.test.ts` | holds **instance 5** - not chartered (RES-A23-9) |
| file 5 | `steps.weekly-announcement-schedule.test.ts` | holds **instance 6** (three `it` blocks over three objects) - not chartered (RES-A23-9) |

Five files, six instances, three chartered. Command, with
the canary `iteration-caps`/`traps-search` require, since a bash grep for an
anchored import pattern has already returned a false empty twice on this row:

```
# CANARY - a string I KNOW is in guard 1; a zero here would mean the instrument is broken
grep -rlF 'REPO_GRADES_CLIENT_FILES' src --include=*.test.ts
src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts

# the real sweep: tests asserting a from-clause against a server-only specifier
grep -rlF -e 'from ["' src --include=*.test.ts \
  | xargs grep -lE 'supabase.server|next.headers|lib..grade' | sort
src/app/components/grading-results/gradingResultsHelpersWiring.test.ts
src/app/components/grading-results/ungradedDisclosure.test.ts
src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts
src/lib/workflows/course-schedule-docx.test.ts
src/lib/workflows/registry/steps.weekly-announcement-schedule.test.ts
```

Instances 5 and 6 are the identical mechanism, opened and read:
`course-schedule-docx.test.ts:42-48` and
`steps.weekly-announcement-schedule.test.ts:63-69,79-86,100-102`. Both are
whole-source regex bans requiring the literal token `from` plus a quote, so
both carry the same five holes, and both are DIRECT-ONLY (each reads one
file's own source), so both additionally miss every transitive case.
`steps.weekly-announcement-schedule.test.ts:89-94`'s own comment records that
its list was hand-extended once already after a leaf extraction opened a gap -
the lengthening-the-denylist history this row forbids repeating. Registered as
RES-A23-9; not chartered here. **Their SEVERITY is now measured, not adjectival
- see RES-A23-9 in section 11 and the closing bullet of section 12.**

**(3) The criteria's premise for Ruling Y2 is contradicted by my own
measurement, and I failed to flag it.** `docs/a23-criteria.md:564` (opened;
**MINOR m-1 correction - the first version of this document cited `:559-562`
twice for this phrase; `grep -n "CARRIES MORE HOLES" docs/a23-criteria.md`
puts it at `:564`**) states that a guard built from `valueImportSpecifiers`
"CARRIES MORE HOLES than the per-line classifier it would replace". My section
3.2 probe measures the
opposite on the aggregate: **19 disagreements for `valueImportSpecifiers`
against 22 for guard 1's line classifier** over the same 46 fixtures - FEWER by
three, and guard 1's classifier is the only comparator that sentence names.
The criteria's two named clauses are both true (it does escape on the
default-binding-plus-inline-type form, AC-2(c), and on every single-quoted
case, AC-4); what the tree disproves is the aggregate word "MORE". **I adopt
neither value silently: the rejection of `valueImportSpecifiers` stands, but it
stands on the executable criteria AC-2(c)/AC-3/AC-4/AC-6, never on a
holes-count comparison.** Flagged here per Ruling M1; no criterion changes,
because Y2 already deleted the criterion that rested on the label.

---

## 2. What all three sites are actually asking

Read the three guards' own headers, not their code:

- `repoGradesFeedbackAndFiles.wiring.test.ts:246-256`: "Client-bundle safety -
  the exact class of defect REGRESSION entry 355 shipped with once already (a
  client module value-importing `@/lib/grade`, caught by nothing but
  `next build`'s compile stage)."
- `gradingResultsHelpersWiring.test.ts:49-61`: the barrel "transitively
  imports server-only code (grade.ts -> grade/rubric.ts ->
  research/rubric-bank.ts -> research/db.ts -> src/lib/supabase/server.ts,
  which imports next/headers)".
- `gradingResultsHelpersWiring.test.ts:119-122` (Ruling U3): types.ts must
  carry exactly one from-clause, because the `@/lib/grade/types` exemption at
  `:91` is only safe while types.ts itself reaches nothing server-only.

**All three ask one question: can a browser bundle rooted at these files reach
a server-only module?** That is a REACHABILITY question over the module graph.
Every one of the three answers it by pattern-matching the TEXT of ONE HOP, and
each has a different hand-maintained approximation of "which specifier names
are dangerous". The five measured holes are not five bugs; they are five
symptoms of binding a graph question to a text object.

The second guard makes this explicit. Ruling U3's walled-set count on types.ts
is a hand-rolled, one-level, text-shaped approximation of "types.ts reaches
nothing server-only". It is the transitive question, asked badly.

**This repo already asks the question properly.**
`src/lib/canvas-client-boundary.transitive.test.ts` walks value-import edges
from every `"use client"` file to a target, with a `"use server"` wall
(`:147-150`), a type-erasure rule (`:91-106`) and a cycle guard (`:151`). Its
header at `:27-44` states the three rules, and rule 2 at `:34-37` records the
339-false-positive incident behind the wall. `classTrendsDraft.not-postable.test.ts` is the same walker with
a PATH-PREFIX PREDICATE instead of a single target (`FORBIDDEN_PATH_PREFIXES`
at `:58`, `walkForForbiddenImports` at `:119` - both opened; the `:50` cite
that propagated through `leverage.md` into the criteria is mid-comment and is
not what I built on).

So the shape is not an invention. It is the shape this repo already trusts for
exactly this question, and the three A23 sites are directory-local text
approximations of it.

---

## 3. The shape, chosen

> **A transitive runtime-import-graph walk, from a root set derived from the
> tree at test time, under a capability predicate on the RESOLVED path - with
> the edge extraction done by the TypeScript compiler's own parser rather than
> by any pattern.**

The two options the criteria left live are not alternatives. The walled set
answers *which roots*; the walk answers *what is reachable from them*. A22
already shipped the root-derivation half for `grading-results/`
(`gradingResultsHelpersWiring.test.ts:136-167`), and this design KEEPS it
unchanged and feeds it as the walk's root set. repo-grades gets the same
derivation, which it does not have today.

### 3.1 Why this is a change of KIND, not a fourth pattern

The row's central prohibition is `iteration-caps.md:41-43`: the second attempt
must change kind, not strength. The honest test is not "is my regex nicer" but
**which direction does an un-enumerated form fail in**.

**This table is stated on TWO axes, because Ruling Z1 measured that the first
version of it was true on one and false on the other.** A defence that holds
on syntax and fails on specifiers is not a change of kind; it is half a change
of kind, and the half that failed is the half the REGRESSION-355 class lives
in.

**Axis 1 - SYNTAX (the form of the import). Stated correctly the first time.**

| | The three broken guards | This design |
|---|---|---|
| What is enumerated | the spellings of a BANNED import | nothing - the grammar is the TypeScript parser's |
| Object under test | one line, or one file's raw text | the resolved module graph |
| An un-enumerated syntax | is not matched, so the file is **PERMITTED** - silent green | is not an erased import, so it is **an edge to follow** - loud |
| Completeness rests on | a human having listed every form | `ts.createSourceFile` covering the language |

**Axis 2 - SPECIFIER (which module the import names). FALSE in the first
version of this document; true only after Ruling Z1's fix.**

| | The three broken guards | This design, as first written | This design, as corrected by Z1 |
|---|---|---|---|
| What is enumerated | banned specifier spellings (`BANNED_IMPORT_PATTERNS`) | banned specifier spellings (`FORBIDDEN_BARE_SPECIFIERS`) - **a deny list wearing a parser's clothes** | browser-SAFE specifiers (`ALLOWED_BARE_SPECIFIERS`) |
| An un-enumerated specifier | not matched -> **PERMITTED**, silent green | `resolveSpecifier` returns `null` -> `continue` -> **PERMITTED**, silent green | not on the allow list -> **FAILS**, loud |
| Completeness rests on | a human having listed every hazard | a human having listed every hazard | a human having listed every SAFE thing, measured complete today (section 4.2) |

The delta's own killer case, measured: `node:async_hooks` was enumerated and
**`async_hooks` without the prefix was not** - the same module, the same
`AsyncLocalStorage` import that `src/lib/supabase/owner-context.ts:1` actually
makes, the exact module the REGRESSION-355 class is about, and accepted by
`tsc` with no error. Under the first version of this design it was silently
permitted, inside the replacement for a guard withdrawn for exactly that.
Section 4.2 shows it failing with the deny list emptied entirely.

The default flips - on BOTH axes, which is what Z1 bought. That is the whole
argument, and it is the only kind of change `iteration-caps.md:13-16` records
as ever ending a chain here: replace the assertion with a CONSTRUCTION that
makes the bad state unrepresentable. The bad state here is "a runtime
dependency nobody enumerated". Under a parser plus an allow list there is no
such state to be in - every module specifier in the file is either an erased
type import, a followed edge, an explicitly allowed non-module, or a failure.

**Two syntactic misses are NOT covered by the parser and are NOT covered here,
because `npx tsc --noEmit` backstops both at the wave gate** (section 8 step
4 runs it; `tsconfig.json:10` is `"module": "esnext"` and there is no
`allowImportingTsExtensions` key, which is what makes both errors fire). Named
rather than left implicit:

```
# explicit .ts extension - import { x } from "./t.ts";
npx tsc --noEmit --isolatedModules --strict --module esnext --moduleResolution bundler <tmp>/ext.ts <tmp>/t.ts
ext.ts(1,19): error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.

# import-equals - import g = require("./t");
npx tsc --noEmit --isolatedModules --strict --module esnext --moduleResolution bundler <tmp>/eq.ts <tmp>/t.ts
eq.ts(1,1): error TS1202: Import assignment cannot be used when targeting ECMAScript modules.
```

I am not claiming the result cannot be wrong. I am claiming it cannot be
**silently permissive by omission**, which is the specific failure this family
has now committed three times - and, after Z1, that claim is true of the
specifier as well as the syntax.

### 3.2 The dominant idiom, MEASURED before adopting anything from it

The brief names the trap: `valueImportSpecifiers` is duplicated across five
files, looks like an import-graph walk, and is measured worse than what it
would replace. Spread, re-measured:

```
grep -rc 'valueImportSpecifiers' src --include=*.ts | grep -v ':0'
src/app/actions/prompt-announcement-draft.test.ts:2
src/app/components/canvas-tab/announcements-panel.wiring.test.ts:2
src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts:2
src/lib/canvas-client-boundary.transitive.test.ts:8
src/lib/prompt-announcement-route.test.ts:2
```

Five files, sixteen occurrences. **I did not adopt or adapt it.** I duplicated
it verbatim from `classTrendsDraft.not-postable.test.ts:96-113` into a probe
and ran it against the full construct list, both quote styles, alongside the
two shipped guards and the proposed AST classifier.

**Instrument.** `a23-shape-probe.mjs`, run as `node <probe>` from the repo
root (section 9 states where it lives and why it is not committed - RES-A23-13).
23 constructs x 2 quote styles = 46 fixtures. `want` is the ground truth: VALUE = a real runtime edge, TYPE =
erased at build, RESIDUE = the extractor must REPORT it as unclassifiable,
none/VALUE-other = not a hit on the banned specifier.

```
DISAGREEMENTS WITH THE WANT COLUMN, over 46 fixtures:
  AST classifier            0
  valueImportSpecifiers     19
  guard 1 line classifier   22
  unconditional sweep       20
```

`valueImportSpecifiers`'s 19, itemised from the probe output: **every
single-quoted fixture** (its `IMPORT_RE` at `:96` ends `from\s+"([^"]+)"` -
double quotes are literal), plus, in BOTH quote styles, the
default-binding-plus-inline-type form (`:108`'s "every braced part starts with
`type`" test does not look at `clause.name`), the bare side-effect import,
`require(<literal>)` and `import(<literal>)`. It is genuinely better than
guard 1 on wrap and tab - `\s` in its character class spans newlines - and
that is exactly what makes it a trap: **it is better on the axis the row's
title names, and, on this scoreboard, better overall too - 19 against guard
1's 22.** Ruling M1 corrects the first version of this sentence, which said
"worse overall" against its own numbers. The correction matters in only one
direction: an argument that rests on a holes COUNT would now favour the idiom,
so no argument here rests on one. **The rejection stands entirely on the
executable criteria AC-2(c), AC-3, AC-4 and AC-6**, each of which it fails and
section 4's design passes by measurement. See section 1 correction (3) for the
conflict this creates with `docs/a23-criteria.md:564`, which is Ruling
Y2's premise, and which I measured against without flagging.

**A criterion that merely required naming a shape would have been satisfied by
it.** `docs/a23-criteria.md:553-585` already deleted that criterion (Ruling
Y2) for this reason. I am satisfying the executable criteria instead: AC-2(c),
AC-3, AC-4 and AC-6, which this idiom fails and section 4's design passes by
measurement.

### 3.3 Can TypeScript or the build hold any of it? Measured, and mostly no

The brief asks specifically. `tsconfig.json:13` sets `"isolatedModules": true`;
there is no `verbatimModuleSyntax` key (`cat tsconfig.json`, full
`compilerOptions` read). Both facts are relevant, in opposite directions.

**`isolatedModules: true` makes half the classifier EXACT, and this is
measured, not recalled.** Under it, re-exporting a type without `export type`
is a compile error:

```
npx tsc --noEmit --isolatedModules --strict --module esnext --moduleResolution bundler <tmp>/reexport.ts <tmp>/imp.ts
reexport.ts(1,10): error TS1205: Re-exporting a type when 'isolatedModules' is enabled requires using 'export type'.
```

where `reexport.ts` is `export { T } from "./t";` and `T` is a type. So an
unmarked `export { x } from` in this repo is guaranteed to be a runtime
re-export, and classifying it as a value edge cannot over-approximate. `npx
tsc --noEmit` is the enforcer, and it already runs at the wave gate.

**The absence of `verbatimModuleSyntax` is why the OTHER half
over-approximates - in the safe direction.** The same command shows
`import { T } from "./t";` with `T` a type produces NO error. So an unmarked
`import { X }` may in fact be type-only, and this design counts it as a
runtime edge anyway. That is the fail-loud direction, and its cost on the real
tree is measured at zero: both root sets return zero violations today
(section 4.4). Turning `verbatimModuleSyntax` on would remove the
over-approximation - and it would not remove the need for the guard, because
it says nothing about reachability. It is a repo-wide flag change that would
error on a large number of existing imports, and it is **out of scope for
A23**; registered as RES-A23-11 with an owner and an instrument, not smuggled
in here.

**Nothing else at type or build level can hold it.**

- The type system cannot express "module A must not transitively reach module
  B at runtime". There is no type-level construction available, and I could
  describe no implementation that would provide one.
- `eslint-plugin-import` IS installed (`ls -d node_modules/eslint-plugin-import`
  returns the directory), so `import/no-restricted-paths` is technically
  reachable. `eslint.config.mjs` (read in full) is only
  `eslint-config-next/core-web-vitals` plus
  `eslint-config-next/typescript` plus a `globalIgnores` block, with no zone
  configuration. But `no-restricted-paths` is **DIRECT-ONLY**, and that ground
  alone is sufficient and decisive: the class this row repairs is transitive,
  and a one-hop rule cannot reach it. **Ruling m1 corrects the first version,
  which also called it "NAME-BASED". It is not.** The rule's own documentation
  matches its `from` attribute against the RESOLVED path, not the literal
  specifier string, which makes it a resolved-path predicate - the same KIND
  as `isForbiddenPath` here, not the kind being withdrawn. The second half of
  that sentence is dropped rather than defended. Rejected on direct-only
  reach, having checked the plugin exists rather than assuming it does not.
- `next build`'s compile stage remains the only TRUE oracle (RES-A23-5) and
  cannot run to completion in this checkout - there is no `.env`, so the gate
  is read as the `Compiled successfully` line and never the exit code
  (`docs/loop/this-repo.md:52-54`).

**So: a test is the only instrument available here.** That is an honest
answer, not a shortfall - but it is a test whose edge extraction is done by
the same compiler that the true oracle uses, which is as close to a build-level
constraint as this repo can get inside vitest.

---

## 4. The construction, and whether the three sites share it

### 4.1 Do they take the same shape? Two do; the third is RETIRED into them

**Instances 1 and 3 - YES, identical shape.** `repoGradesFeedbackAndFiles.wiring.
test.ts:287-305` and `gradingResultsHelpersWiring.test.ts:112-117` ask the same
question about two directories. Both become: derive the root set from the
directory, walk, assert zero violations. Uniformity here is a decision with a
reason - they share the class, the corrective rule AND the object (a directory
of client files) - not a default.

**Instance 2 - NO, it does not get a new shape. It is DELETED, and the walk is
its named replacement enforcer.** `gradingResultsHelpersWiring.test.ts:123-132`'s
walled-set count exists solely to keep the `@/lib/grade/types` exemption at
`:91` honest. Under the walk there is no NAME-BASED exemption left to police:
`types.ts` is judged by its own reachability, not by a carve-out.
`iteration-caps.md:71-72` (disposal (d)) requires that a deletion name the
enforcer it was protecting; the enforcer is the walk, and section 4.3 proves it
fires on five sabotages of types.ts that the deleted guard let through and on
none that it correctly permitted.

**Ruling Z3: `types.ts` IS A NAMED ROOT of the grading-results walk, and the
first version of this section was wrong to rely on it being an ordinary
node.** That sentence ("types.ts is an ordinary node, walked like every other")
described coverage that is INCIDENTAL, not constructed, and it read as an
instruction NOT to name the root. Measured at `d7f69c5` by
`node <scratchpad>/a23-typesedges.mjs`, which walks the closure on runtime
edges only and splits every edge INTO `types.ts` by whether it is erased:

```
closure nodes (runtime edges only) = 93

RUNTIME edges into src/lib/grade/types.ts : 2
  src/app/components/grading-results/ungradedDisclosure.ts:24  "@/lib/grade/types"
  src/lib/grade/class-trends.ts:2  "./types"

TYPE-ONLY edges into it (contribute nothing) : 4
  src/app/components/grading-results/classTrendsEntry.ts:32  "@/lib/grade/types"
  src/lib/grade/postable.ts:70  "./types"
  src/lib/grade/prompts.ts:1  "./types"
  src/lib/grade/utils.ts:1  "./types"

types.ts in the closure? true
```

**Two runtime edges are the whole of the coverage.** Narrow those two to
`import type` - the same narrowing A22 already performed on
`classTrendsEntry.ts:32`, and which the four type-only rows show is this
repo's routine move on this very file - and `types.ts` leaves the closure,
Ruling U3's
protection evaporates, and every gate stays green. That is a live path to
silently losing the requirement, so the requirement gets bound to the object
rather than to a reachability accident.

**The fix is one array entry**, and it is already measured. The
grading-results root set becomes the directory's non-test files, plus
`GradingResults.tsx` (A22's non-local consumer), plus
`src/lib/grade/types.ts`:

```
node <scratchpad>/a23-delta-probe.mjs
===== SITE 2+3 grading-results (dir + GradingResults.tsx + types.ts AS A ROOT [Z3]) =====
roots=13 nodes=93 171ms violations=0 residue=0 unallowed=0
===== Z3 CONTROL: types.ts alone =====
roots=1 nodes=1 1ms violations=0 residue=0 unallowed=0
```

Roots go 12 -> 13; **nodes stay at 93 and violations stay at 0**, because
`types.ts` is in the closure today anyway. Z3 costs one line and zero walk
time, and it buys the requirement a binding that a type-only narrowing cannot
dissolve.

This is the answer to the criteria's own open question at
`docs/a23-criteria.md:858-861`. The three sites do NOT converge on one
construction by fiat - two converge because they share an object, and the third
converges because it turns out to be a degenerate, one-hop, text-shaped case of
the same construction.

### 4.2 The requirement, restated against the right object

**R1 (capability, transitive).** No file in a guarded directory's root set may
reach, through any chain of runtime edges, a server-only leaf. The leaves,
derived from the guards' own stated causal chains rather than from their
denylists:

**REWRITTEN BY RULING Z1 AND RULING m4.** The first version of this section
wrote a deny list and then claimed "There is no list left to be incomplete."
The first sentence falsified the second, and the checker was right to call the
contradiction the row's founding class appearing inside its own replacement.
Under `iteration-caps.md:41-43` that goes to disposal, and the legal disposal
is a change of KIND: **an allow list, not a deny list.** What follows is that
change, with the census that makes it cheap.

**RULING M-1: these four lists have a named home.** The first version of this
section fenced them as a bare `const` block naming no file. `WalkOptions`
(section 5, `:846-856`) takes them as *arguments*, and section 5 itself says
the leaf does not own policy - so leaving them homeless meant each guard file
would carry its own copy, which is drift in the exact mechanism (one idiom
duplicated per directory) this row exists to end, and it breaks two
assertions this document itself requires: the leaf's test asserting
`ALLOWED_BARE_SPECIFIERS` and `FORBIDDEN_BARE_SPECIFIERS` are disjoint
"compared as raw literal arrays" (below), and RES-A23-15's requirement that
the leaf's test assert `BROWSER_SAFE_MODULES` has exactly the listed entries -
neither is checkable if the values live inside two component test files the
leaf's test does not import. **Home: a new sibling file to the leaf,
`src/lib/module-graph/client-boundary-policy.ts`, exporting all five
constants below by name and nothing else.** Both guard files import their
`WalkOptions` fields from it; the leaf's own test imports it for the
disjointness and RES-A23-15 assertions. It is added to the wave's write set
(section 8) and its own line budget (section 6). It is plain string arrays -
no `node:fs`, no `typescript` - so it carries none of section 5's
client-bundle-reachability hazard and needs no guard of its own.

```ts
// src/lib/module-graph/client-boundary-policy.ts
// The hazard, by RESOLVED path. Relative to src/, POSIX, no trailing slash.
export const FORBIDDEN_PATH_PREFIXES = ["lib/supabase"];
// The positively-stated exceptions INSIDE it. An allow list, so a new module
// in src/lib/supabase/ that enters a client closure fails until a human says
// it is browser-safe.
export const BROWSER_SAFE_MODULES = ["lib/supabase/client.ts"];

// Diagnostics only - NOT what completeness rests on (see below).
export const FORBIDDEN_BARE_SPECIFIERS = ["next/headers", "node:async_hooks", "server-only"];

// THE ALLOW LIST. Every literal specifier that is not a walked module and not
// an allowed asset must be on this list, or the guard FAILS.
export const ALLOWED_BARE_SPECIFIERS = [
  "@monaco-editor/react", "@mui/material", "@mui/material/Autocomplete",
  "@mui/material/Button", "@mui/material/Checkbox", "@mui/material/FormControlLabel",
  "@mui/material/IconButton", "@mui/material/MenuItem", "@mui/material/TextField",
  "@supabase/ssr", "jszip", "next/dynamic", "node-html-parser", "react",
];
export const ALLOWED_ASSET_EXTENSIONS = [".css"];
```

Both guard files' own `WalkOptions` argument is built from these named
imports, not from a locally re-declared copy - that is the whole content of
naming the home: one array, two importers, and a third importer (the leaf's
test) that can now assert properties of the exact values in force.

`BANNED_IMPORT_PATTERNS` disappears entirely. `@/lib/grade` is banned not
because it is on a list but because it reaches `lib/supabase/server` - measured
in section 4.3's CONTROL. `@/lib/grade/types` is permitted for the opposite
reason, derived rather than carved out.

The no-trailing-slash rule is inherited from
`classTrendsDraft.not-postable.test.ts:46-53,58`, which records the barrel-file
defect that a trailing slash creates and whose own live value is
`["app/actions", "lib/canvas", "lib/lms-generation", "lib/llm", "lib/gemini"]`
- directory-level prefixes, no slash, which is the idiom `"lib/supabase"`
now follows.

**MINOR m-3 - WITHDRAWN 2026-09-21 BY ORCHESTRATOR RULING. DO NOT APPLY THE
FIX IT PRESCRIBED.** The note below observed that `isForbiddenPath`'s bare
`relToSrc.startsWith(prefix)` has no segment boundary, called that
fail-closed with zero occurrences today, and prescribed
`relToSrc === prefix || relToSrc.startsWith(prefix + "/")` as a one-line fix.

**That prescription is wrong, and the ruling that carried it was mine.** The
no-boundary form is not an oversight being tolerated - it is THE REPO'S
DOCUMENTED IDIOM, stated as a contract in the precedent this design mines
five times (`classTrendsDraft.not-postable.test.ts:64-66`): "the resolved
import target's own path, **character-by-character prefix matched, never
segment-by-segment**". It exists so a SIBLING FILE is caught. Adding the
boundary converts a fail-closed guard to a fail-OPEN one.

Measured on the test seat's own configuration, and the two forms are NOT
nested - each misses what the other catches:

| Form | violations | nodes | `canvas.ts` caught | inside `lib/canvas/` caught |
|---|---|---|---|---|
| WITH `/` boundary | 14 | 45 | no | yes |
| NO boundary (repo idiom) | 2 | 44 | yes | no |

**VIOLATION COUNTS CORRECTED 2026-09-21. The figures first published here were
`15` and `3` - each ONE HIGH, from a systematic off-by-one in the walker I ran.
The test seat measured `14` and `2`, reported that it could not reconcile mine
rather than matching them, and an independent checker then reproduced the
seat's numbers exactly (and the sibling instance too: `app/actions` no-slash
`v=11 n=68 flagged=true`, with-slash `v=53 n=69 flagged=false`). THE SEAT'S
FIGURES STAND AND MINE DO NOT.** The `nodes` column and every boolean were
correct throughout, and no requirement asserts a violation COUNT on this
configuration - which is why the error survived three readings. Recorded rather
than silently overwritten, because the wrong numbers had already travelled into
two other documents.

Real siblings exist for FOUR of that walker's five prefixes - `src/app/actions.ts`,
`src/lib/canvas.ts`, `src/lib/llm.ts`, `src/lib/gemini.ts` - and the precedent's
own header records the defect in the opposite direction: a prefix WITH a
trailing slash MISSED `src/app/actions.ts`.

**THE RULING: match the repo idiom. Character-by-character, no boundary.** The
standing rule m-3 violated is "never ship a loosened guard without the feature
it was loosened for" - and I loosened it on the strength of a ZERO COUNT. A
zero count is a reason to leave a guard alone, never a reason to weaken it:
the occurrence it would have caught has simply not been written yet, which is
exactly who a guard is for. The test seat's R-8 inverts accordingly.

#### The hole Z1 closed: a literal specifier with NO HOME in the returned shape

Section 3.1 says every specifier is either an erased type import or a runtime
edge. That was a two-bucket claim and the code had a third bucket it did not
admit to: `resolveSpecifier` returns `null` for every bare specifier, the walk
did `if (!dep) continue;`, and `null` is neither an edge nor residue. A
LITERAL specifier that resolved to nothing was silently dropped. **Census, at
`d7f69c5`** (`node <scratchpad>/a23-dropped.mjs`, which is the section-4.4
walk probe with the `continue` instrumented):

```
SITE 1+3 repo-grades      DROPPED literal specifiers: instances=56 distinct=16
SITE 2+3 grading-results  DROPPED literal specifiers: instances=33 distinct=11
```

**89 dropped instances, 18 distinct across the union of the two closures** (16
+ 11 with 9 shared). Four of the 18 are relative `*.module.css` paths; the
other 14 are the bare package specifiers listed above. So the allow list
**starts COMPLETE** - it is a transcription of a measurement, not a judgement -
and every one of the 18 is browser-safe on the build's own evidence: they are
in the shipped client closure of a tree that compiles and deploys today, which
is RES-A23-5's oracle speaking.

Every unresolved literal specifier now gets an explicit bucket. No `null`, no
`continue`:

| Bucket | Test | Verdict |
|---|---|---|
| `module` | resolves to a `.ts`/`.tsx` under `src/` | an EDGE - followed |
| `asset` | `@/`- or `.`-relative, exists on disk, non-TS | allowed iff its extension is on `ALLOWED_ASSET_EXTENSIONS` |
| `node-builtin` | `spec.startsWith("node:")` OR `builtinModules.includes(spec)` | **always FAILS** - the set comes from Node itself, not from a human list |
| `missing` | `@/`- or `.`-relative, nothing on disk | **FAILS** (also caught by `tsc`, failed here anyway) |
| `package` | anything else | allowed iff on `ALLOWED_BARE_SPECIFIERS` |

**MINOR m-4: the five buckets are not exhaustive over the filesystem, only
over what a resolvable specifier can name.** A `.ts`/`.tsx` file that exists
on disk but sits OUTSIDE `src/` is neither `module` (the test requires
`resolves to a .ts/.tsx under src/`) nor `asset` (the test requires
non-TS) - it would fall through both. **Zero occurrences today** (every
walked closure is rooted under `src/`, and nothing outside it is ever a
resolution target), so this is recorded rather than fixed: worth one
explicit line in the implementation (route an unmatched `.ts`/`.tsx` outside
`src/` to `missing`, the fail-closed bucket, rather than leaving it
unclassified) the next time either root set is asked to reach outside `src/`.

#### The X4 proof: the deny list is no longer load-bearing

The checker's killer case was that `node:async_hooks` was enumerated and
**`async_hooks` was not** - the same module, the spelling
`src/lib/supabase/owner-context.ts:1` does not happen to use, accepted by
`tsc` with no error. The test of a real change of kind is whether the deny list
can be deleted entirely without opening a hole.
`node <scratchpad>/a23-x4-proof.mjs` runs the classifier with
`FORBIDDEN_BARE_SPECIFIERS = []`:

```
===== X4: FORBIDDEN_BARE_SPECIFIERS = [] (deny list emptied entirely) =====
  "node:async_hooks"             -> FAIL node-builtin
  "async_hooks"                  -> FAIL node-builtin
  "next/headers"                 -> FAIL package not on allow list
  "server-only"                  -> FAIL package not on allow list
  "node:fs"                      -> FAIL node-builtin
  "fs"                           -> FAIL node-builtin
  "crypto"                       -> FAIL node-builtin
  "node:crypto"                  -> FAIL node-builtin
  "react"                        -> ALLOWED package
  "@mui/material/Dialog"         -> FAIL package not on allow list
  "./repo-grades.module.css"     -> ALLOWED asset
```

All three deny-list entries, and both spellings of the X4 module, fail with
the deny list empty. **`FORBIDDEN_BARE_SPECIFIERS` is kept only as a
DIAGNOSTIC** - it produces a named violation with a better message instead of
a generic "not on the allow list" - and it is explicitly NOT what completeness
rests on. The leaf's own test must assert the two lists are disjoint
(`ALLOWED_BARE_SPECIFIERS` and `FORBIDDEN_BARE_SPECIFIERS` share no element),
compared as raw literal arrays, so the diagnostic can never contradict the
allow list. **Ruling M-1: this is checkable because both arrays are imported
from `src/lib/module-graph/client-boundary-policy.ts` (section 4.2's opening),
the same values both guard files use** - not two component-test-local copies
the leaf's test cannot see.

**The cost, stated rather than buried.** `@mui/material/Dialog` failing is not
a bug, it is the design: any NEW bare specifier entering either closure -
including transitively, since the closures are 149 and 93 nodes - reds the
guard until a human adds one line. That is the fail-CLOSED direction the row
exists to buy, and it is a genuinely useful signal (a new third-party package
arriving in a client closure is exactly the event that shipped
REGRESSION-355). It is also real friction; recorded as RES-A23-14 with an
owner and an instrument rather than hidden.

#### Ruling m4: the prefix is widened, but NOT as prescribed - measured

m4 is right that one prefix under `src/lib/supabase/` is thin: that directory
holds **27 non-test modules** (`ls src/lib/supabase/*.ts | grep -v '\.test\.' |
wc -l` -> `27`; m4 said "30+", and I adopt neither number silently), including
`owner-context.ts`, the only `node:async_hooks` importer in `src/`
(`grep -rn "async_hooks" src --include=*.ts --include=*.tsx | grep -v '\.test\.'`
-> seven hits, six of them comments, one real: `src/lib/supabase/owner-context.ts:1`).

**But `FORBIDDEN_PATH_PREFIXES = ["lib/supabase"]` as prescribed turns the
repo-grades walk (file 1, instance 1) RED on the real tree, which would violate AC-12(a).** Measured before adopting
it:

```
A23_PREFIX=lib/supabase node <scratchpad>/a23-dropped.mjs
===== SITE 1+3 repo-grades (whole dir, tree-derived) =====
roots=32  nodes walked=148  420ms
violations=1
  src/app/components/repo-grades/index.tsx
      -> src/app/components/repo-grades/useRepoGradesData.ts
      -> src/context/SupabaseProvider.tsx
      value-imports "@/lib/supabase/client" -> src/lib/supabase/client.ts
```

`src/lib/supabase/client.ts` is the BROWSER client and belongs in a client
closure. So the ruling's direction is taken and its literal form is not:
the prefix widens to `"lib/supabase"` **plus `BROWSER_SAFE_MODULES`, a
positively-stated list of the modules inside a forbidden directory that ARE
browser-safe** - the same fail-closed kind as Z1, applied to the path axis
instead of the specifier axis. It has exactly one entry today, and any new
module in `src/lib/supabase/` that enters a client closure fails loudly until
someone declares it. Verified green in section 4.4.

And the X4 module is no longer caught by transitive luck at all: with the
prefix widened, `owner-context.ts` is a direct hit; with the prefix ignored
entirely, its `node:async_hooks` import fails as a node builtin under the
allow list. Two independent bindings where the first version had one, and that
one was an enumeration.

**R2 (architectural preference, one hop) - OPTIONAL, and it is the owner's
call.** R1 binds the HAZARD, not the NAME. If `@/lib/grade` were ever
refactored so it no longer reached a server leaf, R1 would permit a client file
importing it, where today's name ban would not. That is a deliberate change of
meaning, not a hole, and it is the one respect in which this design is not a
strict strengthening. If the owner wants the barrel banned by name regardless
of reachability, it costs one line off the SAME extractor and no new mechanism:

```ts
expect(directRuntimeSpecifiers(root)).not.toContain("@/lib/grade");
```

an exact-string membership test over PARSED specifiers - no quote style, wrap,
separator or construct can escape it, because it never touches raw text. Put to
the owner as an `iteration-caps.md:63-68` (b) Reduce. **My recommendation: take
R2.** It is free, it preserves the narrowing intent A22 acted on when it moved
`classTrendsEntry.ts` off the barrel, and it removes the only sense in which
this pass loosens anything - which the repo's own standing rule
("never ship a loosened guard without the feature it was loosened for") makes
worth one line.

### 4.3 The design, sabotaged against the REAL graph

Not against synthetic strings. Each construct was injected IN MEMORY into a
real guarded file - the tree was never written; `git status --short` is
unchanged - and the whole walk re-run.

**Instrument.** `<scratchpad>/a23-sabotage-probe.mjs` (section 9, RES-A23-13 -
not yet committed to `docs/a23/`), `node <probe>`
from the repo root. 37 runs.

```
SITE 2/3 object: grading-results, sabotage injected into gradingResultsHelpers.ts
S0  control: unmodified tree                       violations=0   want=false  OK
S1  single-line value import (the ORIGINAL defect) violations=5   want=true   OK
S2  WRAP between from and the specifier            violations=5   want=true   OK
S3  TAB between from and the specifier             violations=5   want=true   OK
S4  bare SIDE-EFFECT import                        violations=5   want=true   OK
S5  require(<literal>)                             violations=5   want=true   OK
S6  dynamic(() => import(<literal>))               violations=5   want=true   OK
S7  DEFAULT binding + inline-type brace            violations=5   want=true   OK
S8  export * from                                  violations=5   want=true   OK
S9  WRAP INSIDE the braces                         violations=5   want=true   OK
S10 inline ALL-TYPE import (MUST NOT FIRE)         violations=0   want=false  OK
S11 keyword type import (MUST NOT FIRE)            violations=0   want=false  OK
S12 banned specifier in a COMMENT (MUST NOT FIRE)  violations=0   want=false  OK
S13 next/headers, bare                             violations=1   want=true   OK
S14 computed import() -> RESIDUE, must be reported residue=1      want=residue OK

SITE 2 object: src/lib/grade/types.ts, sabotaged, reached FROM the grading-results roots
T0  control: unmodified types.ts                          violations=0  want=false  OK
T1  SINGLE-quoted server value import                     violations=1  want=true   OK
T2  require(<literal>)                                    violations=1  want=true   OK
T3  bare side-effect import                               violations=1  want=true   OK
T4  single-quoted export * from                           violations=1  want=true   OK
T5  WRAP between from and specifier                       violations=1  want=true   OK
T6  TYPE-only import of a server module (MUST NOT FIRE)   violations=0  want=false  OK

SITE 1 object: repo-grades, sabotage injected into repoGradesCellEdits.ts
  (S0-S14 repeated; identical verdicts, all OK)

TOTAL DISAGREEMENTS WITH THE WANT COLUMN: 0
(37 sabotage runs)
```

**DELTA: the 37 runs were RE-RUN under the corrected configuration** (widened
prefix + `BROWSER_SAFE_MODULES` + the allow list), because a configuration
change invalidates a measurement even when the verdicts survive.
`node <scratchpad>/a23-sabotage-delta.mjs` at `d7f69c5`:

```
TOTAL DISAGREEMENTS WITH THE WANT COLUMN: 0
(37 sabotage runs)
```

Every `want`/`OK` verdict above is unchanged. **The violation COUNTS change:
the `violations=5` rows become `violations=4`**, because with
`FORBIDDEN_PATH_PREFIXES = ["lib/supabase"]` the walk stops at the supabase
boundary one hop earlier and no longer reports a fifth trail through
`lib/supabase/effective-identity.ts`. The T-rows and S13/S14 are unchanged at
1 and residue=1. Anyone re-deriving the table under the shipping config should
expect 4, not 5; the block above is retained as measured under the narrow
prefix, where the checker independently reproduced it.

Every sabotage is written in **single quotes** - the style guard 2 and
`valueImportSpecifiers` are both blind to. S1-S9 are the five shared holes plus
brace-wrap plus the default-binding trap. S10-S12 are the false-positive
direction: the inline all-type import guard 1 wrongly flags today (AC-2(a)), the
keyword form, and a banned specifier appearing only in a comment - which the
current raw-source sweep reds the file for, and which `classTrendsEntry.ts:28`
and RES-A22-1 exist to work around. **That workaround becomes unnecessary; the
parser does not see comments.** T1-T5 are the constructs that got
`VALUE_IMPORT_PATTERN` withdrawn under Ruling U3, still escaping its
replacement today, now caught through the guarded directory rather than by a
frozen literal.

**The CONTROL that proves the walk discriminates at all**, from
`<scratchpad>/a23-walk-probe.mjs` (RES-A23-13 - not yet committed to
`docs/a23/`; see section 9):

```
===== CONTROL: the @/lib/grade barrel itself (must be NON-ZERO) =====
violations=5 nodes=81 117ms
  src/lib/grade.ts
      -> src/lib/grade/rubric.ts
      -> src/lib/research/rubric-bank.ts
      -> src/lib/research/db.ts
      value-imports "@/lib/supabase/server" -> src/lib/supabase/server.ts
```

That is `gradingResultsHelpersWiring.test.ts:49-61`'s stated causal chain
(**MINOR m-5 correction - the first version of this document cited `:52-56`
twice for this span; the comment runs `:49-61`, as section 2's own citation
of the same comment already has it correctly**), recovered from the tree
rather than quoted from a comment.

### 4.4 The real tree stays green (AC-12(a)), and the roots get WIDER

`<scratchpad>/a23-walk-probe.mjs` (RES-A23-13 - not yet committed to
`docs/a23/`), `node <probe>` from the repo root:

```
===== SITE 1+3 repo-grades (whole dir, tree-derived) =====
roots=32  nodes walked=149  430ms   violations=0   residue=0
===== SITE 2+3 grading-results (whole dir + GradingResults.tsx) =====
roots=12  nodes walked=93   166ms   violations=0   residue=0
===== SITE 2 types.ts alone (the U3 object) =====
roots=1   nodes walked=1    2ms     violations=0   residue=0
```

**DELTA: re-run under the SHIPPING configuration** - Z1's allow list, Z3's
extra root, and m4's widened prefix with `BROWSER_SAFE_MODULES` - because
three of the four inputs to this table changed.
`node <scratchpad>/a23-delta-probe.mjs` at `d7f69c5`:

```
===== SITE 1+3 repo-grades (whole dir, tree-derived) =====
roots=32 nodes=149 441ms violations=0 residue=0 unallowed=0
===== SITE 2+3 grading-results (dir + GradingResults.tsx + types.ts AS A ROOT [Z3]) =====
roots=13 nodes=93 171ms violations=0 residue=0 unallowed=0
===== Z3 CONTROL: types.ts alone =====
roots=1 nodes=1 1ms violations=0 residue=0 unallowed=0
```

`unallowed=0` is the new column and it is the one Z1 bought: **every one of
the 89 dropped literal specifiers now lands in a named bucket and passes**,
rather than being skipped. AC-12(a) holds under the corrected design -
including the widened supabase prefix, which without `BROWSER_SAFE_MODULES`
would be `violations=1` (section 4.2).

Two things to read off this. **First, repo-grades goes from 4 hand-listed roots
(`REPO_GRADES_CLIENT_FILES:265-270`) to all 32 non-test files in the
directory, and is still clean.** That closes F-2 / RES-A23-2 as a side effect:
`repoGradesPosting.ts:56`, the file carrying a banned-specifier value import
that the guard never looks at, becomes a root. It is clean under R1 because
`@/lib/grade/postable` reaches nothing server-only - which is the correct
verdict, and one no name-based list could have produced without a second
exemption entry. **Second, `residue=0`** - and that zero is not untested. The
residue detector fires on injected computed specifiers (S14, both sites), and
over the whole tree:

```
whole-src files=1560 nodes=1560 UNCLASSIFIABLE (computed) import sites=0
```

(`<scratchpad>/a23-reach.mjs`, RES-A23-13 - not yet committed to `docs/a23/`.)
So RES-A23-1's computed-specifier narrowing stops
being an unmeasurable hand-wave: there are no computed import specifiers
anywhere in `src/`, and if one ever appears inside a walked closure the guard
goes RED rather than skipping it. Section 10 re-binds that residual.

F-5 is discharged the same way. The same probe reports
`grading-results walk reaches MonacoFileEditor.tsx: true` - the live
`dynamic(() => import("../MonacoFileEditor"))` at `SubmittedFilesPanel.tsx:25`
is FOLLOWED as a runtime edge, not merely tolerated.

### 4.5 The one rule I must not get wrong, and the measurement that caught me

My first walk probe, written after reading
`canvas-client-boundary.transitive.test.ts:26-44`, omitted its rule 2 and
returned **39 violations on each of the two sites** - client components
legitimately import server actions, and walking through a `"use server"` module
reports most of the app. That is the 339-false-positive incident, reproduced.
Recording it because the header warned me and I built the probe wrong anyway:
**a "use server" module is a wall, and the walk must stop there.**

I detect the wall from the PARSED directive prologue, not from
`hasDirective`'s `source.slice(0, 200).includes('"use server"')`
(`canvas-client-boundary.transitive.test.ts:108-110`), which would fire on a
header comment. I am NOT claiming the shipped heuristic is wrong today -
measured across every node either site walks, the two disagree on **0 files**.
The parsed form is preferred because it costs nothing once the AST exists, not
because the text form was caught failing.

---

## 5. The seam

One plain `.ts` leaf, imported by both guard test files. Not duplicated a third
time: `traps-tests.md:48-50` names `src/lib/count-lines.ts` as the precedent -
a plain leaf shared by two structure tests - and forbids importing a helper
from another `*.test.ts`. `classTrendsDraft.not-postable.test.ts:22-24`
duplicated instead, which is why the idiom is now in five files.

**`src/lib/module-graph/runtime-import-graph.ts`** (new):

```ts
export type RuntimeEdgeKind = "import" | "export-from" | "require" | "dynamic-import";
export interface RuntimeEdge { specifier: string; kind: RuntimeEdgeKind; }
export interface EdgeScan {
  edges: RuntimeEdge[];
  /** Import/require sites whose specifier is NOT a string literal. Never empty-skipped. */
  unresolvable: string[];
  /** The parsed directive prologue, e.g. ["use server"]. */
  directives: string[];
}
/** PURE. Parses with ts.createSourceFile; no file system access. */
export function scanRuntimeEdges(source: string, fileName: string): EdgeScan;

/** Z1: every LITERAL specifier gets a bucket. `null` is not a bucket. */
export type SpecifierDisposition =
  | { kind: "module"; resolved: string }          // a .ts/.tsx under src/ - an edge
  | { kind: "asset"; resolved: string; ext: string } // on disk, not a module
  | { kind: "node-builtin" }                      // node:x, or builtinModules.includes(x)
  | { kind: "missing" }                           // relative/alias, nothing on disk
  | { kind: "package" };                          // a bare npm specifier
export function classifySpecifier(
  specifier: string, importerAbs: string, srcRoot: string,
): SpecifierDisposition;

export interface WalkOptions {
  srcRoot: string;
  forbiddenPathPrefixes: string[];
  /** Positively-stated exceptions inside a forbidden prefix (m4). */
  browserSafeModules: string[];
  /** DIAGNOSTIC ONLY - completeness rests on allowedBareSpecifiers. */
  forbiddenBareSpecifiers: string[];
  /** THE ALLOW LIST. A bare specifier not on it FAILS. */
  allowedBareSpecifiers: string[];
  allowedAssetExtensions: string[];
  treatUseServerAsWall: boolean;
}
export interface Violation { trail: string[]; specifier: string; resolved: string | null; }
/** A literal specifier that is neither a followed edge nor on an allow list. */
export interface Unallowed { trail: string[]; specifier: string; reason: SpecifierDisposition["kind"]; }
export interface WalkResult {
  violations: Violation[];
  /** NON-literal specifier sites. Reported, never skipped. */
  unresolvable: string[];
  /** Z1: literal specifiers that fail the allow list. Reported, never skipped. */
  unallowed: Unallowed[];
  nodes: number;
}
export function walkRuntimeGraph(roots: string[], options: WalkOptions): WalkResult;

/** One hop, for R2. Exact specifier strings, parsed - never raw text. */
export function directRuntimeSpecifiers(absPath: string): string[];

/** The A22 root derivation, generalised: this directory's non-test .ts/.tsx files. */
export function directoryRoots(absDir: string): string[];
```

**Every input each criterion needs is reachable from the object that must
satisfy it**, checked rather than assumed: AC-1 to AC-6 are all properties of a
verdict on a SOURCE STRING, and `scanRuntimeEdges` takes raw source with no
file system, so the full cross-product runs against it directly. AC-11's six
regression canaries are the same. AC-12(a) is a property of `walkRuntimeGraph`
over the real roots. Nothing in the criteria needs an input this seam cannot
receive.

**Z1 re-checked against the same rule.** `classifySpecifier` needs the
importer's absolute path and `srcRoot` to decide `asset` vs `missing`, and
both are already arguments; it needs `builtinModules`, which is a `node:module`
export, not an input. **It does NOT take the allow lists** - it reports a
bucket and the WALK applies policy, so the pure classifier stays testable
against a source string with no configuration. The disjointness assertion
(section 4.2) compares two exported literal arrays and needs nothing else.

**How `typescript` is loaded, and why not a bare import.** Inside the leaf:

```ts
import { createRequire } from "node:module";
const ts = createRequire(import.meta.url)("typescript") as typeof import("typescript");
```

I could not test a plain `import ts from "typescript"` under vitest without
writing a file into `src/`, which this pass may not do (section 11). What IS
measured is that `createRequire` resolution works from outside the package
(every probe in this document loads `typescript` 5.9.3 that way -
`node -e "console.log(require('typescript/package.json').version)"` gives
`5.9.3`, and `"typescript": "^5"` is at `package.json:44`). `createRequire`
bypasses vite's transform pipeline entirely, so it also avoids putting an
8 MB CJS bundle through it on every run. If the implementer measures a plain
default import working, taking it is an improvement, not a requirement.

**Why the leaf is not client-bundle-reachable, and the guard that keeps it so.**
Nothing imports it except tests, and it pulls in `typescript` and `node:fs` -
a value import from any client file would be a real build hazard. A guard
computed from the tree, in the leaf's own test, in the same construction as
everything else here: enumerate every file in `src/` whose parsed edges contain
the leaf's specifier, and assert every one ends in `.test.ts`. A walled set, not
a pattern.

---

## 6. File layout and line budgets

Baselines measured **both ways**, per `this-repo.md:139-151`. The two
instruments agree on every file here, which is itself worth stating.

| File | `wc -l` | `@(Get-Content).Count` | After (estimate) | 1000-line ceiling |
|---|---|---|---|---|
| `src/lib/module-graph/runtime-import-graph.ts` (NEW) | - | - | ~190 | clear |
| `src/lib/module-graph/runtime-import-graph.test.ts` (NEW) | - | - | ~240 | clear |
| `src/lib/module-graph/client-boundary-policy.ts` (NEW, Ruling M-1) | - | - | ~25 | clear |
| `src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts` | 305 | 305 | ~297 | clear |
| `src/app/components/grading-results/gradingResultsHelpersWiring.test.ts` | 241 | 241 | ~247 | clear |

Commands: `wc -l < <file>` (Bash tool) and
`@(Get-Content <file>).Count` (PowerShell), both run at `c458f7a`.

**The "after" column is an ESTIMATE and is labelled one.** Its arithmetic, so a
checker can re-derive rather than trust it. `gradingResultsHelpersWiring.test.ts`
loses `BANNED_IMPORT_PATTERNS` (`:89-94`, 6 lines), its canary (`:96-110`, 15),
the `it.each` sweep (`:112-117`, 6) and the whole U3 block (`:119-132`, 14) =
-41, and gains a walk block of roughly 35 **plus a REPLACEMENT canary of
roughly 12 (Ruling Z2)** = +47. `repoGradesFeedbackAndFiles.wiring.test.ts`
loses `:246-305` (60, which includes its canary at `:272-285`) and gains
roughly 40 **plus its own replacement canary of roughly 12** = +52. **Both
"after" figures went UP in the delta, not down, because Z2 replaces two canary
blocks this plan previously deleted outright.** Neither file is on
`src/file-size-ceiling.structure.test.ts`'s `ALLOWED_OVERAGE` ratchet
(`grep -n -e "repoGradesFeedbackAndFiles" -e "gradingResultsHelpersWiring"
src/file-size-ceiling.structure.test.ts` returns nothing; `LIMIT = 1000` at
`:30`), so only the repo-wide limit applies and both are far under it. **Verify
with `@(Get-Content).Count` at the wave gate; do not ship on these estimates.**

**Runtime cost. CORRECTED BY RULINGS m2 AND m3 - the first version's 0.8% was
low by about a factor of three, because it omitted the leaf's own
client-bundle guard.** Section 5 specifies that guard as a whole-`src` parsed
sweep ("enumerate every file in `src/` whose parsed edges contain the leaf's
specifier"), so its cost is the whole-src parse, not a walk.

| Item | Cost | Instrument |
|---|---|---|
| repo-grades walk | 441ms | `node <scratchpad>/a23-delta-probe.mjs`, `d7f69c5` |
| grading-results walk (13 roots) | 171ms | same run |
| the leaf's own client-bundle guard (whole-`src` parse) | **1800ms / 1847ms** on two consecutive runs | `node <scratchpad>/a23-x4-proof.mjs`, `d7f69c5` |
| the leaf's pure fixtures | not measurable before the file exists | - |

Suite baseline at `c458f7a`, re-measured rather than quoted: `npx vitest run`
gives `Test Files 1092 passed (1092)` / `Tests 21761 passed (21761)`, exit 0,
`Duration 70.73s`. **(441 + 171 + ~1850) / 70730 = about 3.5%**, not 0.8%.

**m2 - the performance ceiling is now RECORDED, not "undetermined".** The
first version deferred it; it was one command. Parsing every non-test
`.ts`/`.tsx` under `src/` with `ts.createSourceFile` - **1560 files, which is
the hard ceiling on any closure this design can ever walk** - takes 1800ms and
1847ms on two runs here, against the `{ timeout: 30000 }` both precedent
walkers carry. **A margin of roughly 16x at the ceiling**, and the walk itself
is O(nodes) with a visited set, so growth is linear in files reached, not
quadratic. The checker independently measured 1929ms for the same sweep; I
report my own two numbers and that one, and adopt none silently - the
conclusion (a 15-16x margin) is identical under all three.

`canvas-client-boundary.transitive.test.ts` and
`classTrendsDraft.not-postable.test.ts` both carry explicit `{ timeout: 30000 }`
on their walks; do the same, on the leaf's whole-src guard as well as on the
two directory walks.

---

## 7. `owns` file list

Derived, with the canary that distinguishes a false absence from a real one -
this row has already had two.

```
# CANARY: a string I KNOW is present. A zero here means the instrument is broken.
grep -rl "gradingResultsHelpersWiring" src docs
src/app/components/grading-results/classTrendsEntry.ts
src/app/components/grading-results/gradingResultsHelpers.test.ts
docs/a22-scope.md
docs/a23/a23-probe.mjs
docs/a23-criteria.md
docs/BACKLOG.md
docs/backlog.yml

# THE SWEEP: every file naming either guard file, guard 1's root constant, or the new leaf
grep -rln -e "repoGradesFeedbackAndFiles" -e "gradingResultsHelpersWiring" \
          -e "REPO_GRADES_CLIENT_FILES" -e "runtime-import-graph" \
          src docs .github | sort
docs/BACKLOG.md
docs/a22-scope.md
docs/a23-criteria.md
docs/a23/a23-probe.mjs
docs/a23/a23-scan.mjs
docs/backlog.yml
src/app/components/grading-results/classTrendsEntry.ts
src/app/components/grading-results/gradingResultsHelpers.test.ts
src/app/components/repo-grades/RepoGradeCellControl.tsx
src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts
src/lib/grade/postable.test.ts

# DELTA, re-run at d7f69c5: the same command now returns TWELVE paths, because
# this document itself exists in the tree and names both guard files. The
# eleven above plus docs/a23-architecture.md. No src/ path changed.

# Does anything read GUARD 2's OBJECT (types.ts) as source text? Only guard 2.
grep -rn 'readFileSync' src --include=*.test.ts | grep -i types
src/lib/prompt-announcement-types.test.ts:2:  (a different file - prompt-announcement-types.ts)
```

| Path | Class | Why |
|---|---|---|
| `src/lib/module-graph/runtime-import-graph.ts` | **OWNED** (new) | the seam |
| `src/lib/module-graph/runtime-import-graph.test.ts` | **OWNED** (new) | its caller and its cross-product |
| `src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts` | **OWNED** | file 1 - instance 1 (guard 1) |
| `src/app/components/grading-results/gradingResultsHelpersWiring.test.ts` | **OWNED** | file 2 - instances 2 and 3 |
| `src/app/components/grading-results/classTrendsEntry.ts:28` | **ADOPTED** - comment correction owed | its comment states the sweep "matches RAW SOURCE, comments included". Under the AST extractor that is false. Opened; it is a comment, not an assertion, so it cannot go red - which is exactly why it will otherwise rot. Correct it in the same wave. |
| `src/app/components/repo-grades/RepoGradeCellControl.tsx:47` | **CHECKED-SAFE** | comment, "bans that alias prefix outright". Still true under R1 (the barrel reaches a server leaf) and under R2. No edit. |
| `src/lib/grade/postable.test.ts:227` | **CHECKED-SAFE** | comment naming guard 1 as the reason for a relative import. Unchanged. |
| `src/app/components/grading-results/gradingResultsHelpers.test.ts:26` | **CHECKED-SAFE** | comment recording the file split. Unchanged. |
| `src/app/components/grading-results/ungradedDisclosure.test.ts:495-515` | **ADOPTED - decision owed, see RES-A23-9** | file 3, **instance 4** of the class (Ruling M5: the first version called this "site 4" while also calling the two workflow files "sites 4 and 5"). Its object, `ungradedDisclosure.ts`, IS one of the twelve `CLIENT_FILES`, so R1 already covers it transitively (measured: zero violations). Leaving a redundant broken guard beside a working one is how the next reader believes the wrong thing. Recommend deleting its two `not.toMatch` assertions and citing R1; that is a scope call, not mine. |
| `src/lib/workflows/course-schedule-docx.test.ts`, `src/lib/workflows/registry/steps.weekly-announcement-schedule.test.ts` | **OUT OF SCOPE** - RES-A23-9 | files 4 and 5, **instances 5 and 6** of the class, different directories, different capability boundary. Not chartered. Severity measured at zero live defects - section 12. |
| `docs/backlog.yml`, `docs/BACKLOG.md` | **ORCHESTRATOR'S** | residuals below must land there or they do not exist |
| `docs/a23/a23-probe.mjs`, `docs/a23/a23-scan.mjs` | **CHECKED-SAFE** | the criteria's measurement instruments. They run the OLD procedures and must keep doing so - they are the AC-7 "before" instrument. Do not update them to the new shape. |

**No file in `src/` reads either guard test file as source text.** All four
`src/` hits above are comments, each opened and quoted. So no correct change to
these files can turn a third-party test red by string collision - the failure
mode the `owns` obligation exists to catch.

---

## 8. Wave plan: ONE WAVE, and that is forced

**One wave, five files** (Ruling M-1, disposal round: the policy home adds one
new file to the four already planned), all written by one implementer:

```
src/lib/module-graph/runtime-import-graph.ts                                    (new)
src/lib/module-graph/runtime-import-graph.test.ts                               (new)
src/lib/module-graph/client-boundary-policy.ts                                  (new)
src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts        (edit)
src/app/components/grading-results/gradingResultsHelpersWiring.test.ts          (edit)
```

plus the one-line comment correction at `classTrendsEntry.ts:28`.

**Why not two waves.** A wave 1 that ships the leaf plus its own test, with the
guards re-pointed in wave 2, ships a library whose only consumer is its own
test - the exact "a library and an endpoint with no surface between them"
failure recorded in this seat's definition, with both waves' gates green.
Independently, **AC-10 forbids it**: "Exactly one of the two paths is touched"
is its failure direction, and a wave boundary between the two guards is that
state, held deliberately, for a commit. Every export this wave adds has its
caller inside the wave: `scanRuntimeEdges`, `walkRuntimeGraph` and
`directoryRoots` are called from all three test files;
`directRuntimeSpecifiers` is called only if the owner takes R2, and if they do
not, **it must not be written** - an unused export is dead code with a green
gate.

**The ORDER inside the wave is not free** - AC-7 requires a red observed before
the procedure changes, and the criteria's own landing order
(`docs/a23-criteria.md:518-523`) puts the fixtures in "the suite that will carry
the fixtures forward" FIRST. Under this shape that suite is
`runtime-import-graph.test.ts`, not the two guard files. Five recorded steps:

0. **MAJOR M-3, RECONCILED: commit all TEN probes to `docs/a23/` and re-run
   every one of them from the repo root**, diffing against sections 3.2, 4.3
   and 4.4 (RES-A23-13). The first version of this step, and RES-A23-13's own
   instrument column, named only the original four
   (`a23-shape-probe.mjs`, `a23-walk-probe.mjs`, `a23-reach.mjs`,
   `a23-sabotage-probe.mjs`); the delta note under RES-A23-13 (section 11)
   already lists the six added for the delta
   (`a23-dropped.mjs`, `a23-delta-probe.mjs`, `a23-x4-proof.mjs`,
   `a23-typesedges.mjs`, `a23-sabotage-delta.mjs`, `a23-sites45-severity.mjs`).
   All three places now name the same ten:
   `a23-shape-probe.mjs`, `a23-walk-probe.mjs`, `a23-reach.mjs`,
   `a23-sabotage-probe.mjs`, `a23-dropped.mjs`, `a23-delta-probe.mjs`,
   `a23-x4-proof.mjs`, `a23-typesedges.mjs`, `a23-sabotage-delta.mjs`,
   `a23-sites45-severity.mjs`. This happens BEFORE any guard file is edited. A
   number that does not reproduce means this design rests on a measurement
   that is not real, and the wave stops.
1. Land `runtime-import-graph.test.ts` with the full cross-product asserted
   against a **duplicated copy of `valueImportSpecifiers`** as the extractor.
   Run `npx vitest run src/lib/module-graph/runtime-import-graph.test.ts` and
   **record the red** - expected 19 failures per section 3.2, which is the
   positive control proving the fixtures discriminate.
2. Land `runtime-import-graph.ts` and re-point the test at `scanRuntimeEdges`.
   Re-run; record green.
3. Re-point both guard files at the leaf, in ONE commit. Record
   `npx vitest run` over both guard files green against the unmodified tree
   (AC-12(a)). **Each guard file lands its OWN canary in this step - see
   below. "Green" is not evidence on its own, and step 3's only recorded
   evidence in the first version of this plan WAS "green".**
4. Wave gate: `git status --short` against exactly the list above, plus
   `npx tsc --noEmit` (one caller only), `npm run lint`
   (`4 problems (0 errors, 4 warnings)` is the baseline), `npx vitest run`.

Step 1's red is the thing AC-7 exists to force, and it is **relocated** from
the two guard files to the leaf's test, per `iteration-caps.md:60-62`
disposal (a): receiver is the test seat, and the obligation it now carries is
to state, for every fixture, whether it is a positive control expected red at
step 1 or a regression canary expected green throughout (AC-8's direction
labels). I am flagging this as a divergence from the criteria's literal
wording rather than reading it away.

### 8.1 Ruling Z2 - each guard file keeps a canary. NOT OPTIONAL.

The first version of this plan deleted **both** guard files' canaries and
specified no replacement: step 3 deletes
`gradingResultsHelpersWiring.test.ts:96-110` (that block IS the canary) and
`repoGradesFeedbackAndFiles.wiring.test.ts:246-305` (which contains the canary
at `:272-285`). Section 9 then lists the canary discipline under REUSE -
"a detector is not evidence until it has found a planted positive" - citing
those very lines, and reused it in NEITHER file. An implementer who passes an
empty root list, or the wrong `srcRoot`, lands both files green, the leaf
green, and every gate green. **That is the same class as the guards this row
is repairing: an assertion that cannot fail.**

**Each guard file carries a canary proving ITS OWN walk finds a PLANTED
POSITIVE**, using the same `walkRuntimeGraph` call with the same options
object the real assertion uses and only the root set replaced. Measured, so
the implementer has an expected number rather than a hope
(`node <scratchpad>/a23-delta-probe.mjs`, `d7f69c5`, SHIPPING configuration):

```
===== Z2 CANARY grade barrel (src/lib/grade.ts) =====
violations=4 nodes=74 unallowed=6 103ms
  first violation trail:
  src/lib/grade.ts
      -> src/lib/grade/rubric.ts
      -> src/lib/research/rubric-bank.ts
      -> src/lib/research/db.ts
      value-imports "@/lib/supabase/server" -> src/lib/supabase/server.ts
  first unallowed:
  src/lib/grade.ts
      -> src/lib/grade/rubric.ts
      -> src/lib/research/rubric-bank.ts
      NODE BUILTIN "node:crypto" - never browser-safe

===== Z2 CANARY owner-context (the X4 path) (src/lib/supabase/owner-context.ts) =====
violations=2 nodes=3 unallowed=0 2ms
  first violation trail:
  src/lib/supabase/owner-context.ts
      value-imports bare "node:async_hooks"
```

**MAJOR M-2, CORRECTED: the assertion is pinned to an unfixed ordering and the
wrong field.** The first version of this table required "the first trail
contains `lib/supabase/server`". Two measured problems. First, `Violation`'s
own shape (section 5: `interface Violation { trail; specifier; resolved }`)
stops the walk BEFORE the forbidden module - `trail` is the chain of files
walked TO reach the violating edge, and never itself contains the forbidden
specifier's resolved path; that string is in `resolved`, not `trail`. Second,
`walkRuntimeGraph`'s contract fixes no traversal order, so which violation
comes first is an implementation accident: an independent DFS over the same
graph returns `effective-identity.ts` as violation 0 where this document's own
probe returns `server.ts` (both real files under `src/lib/supabase/`, both
correctly flagged), so pinning to "the first trail" reds a correct
implementation that happens to visit siblings in a different order. **Corrected
assertion, checking every violation rather than the first and reading the
field that actually carries the resolved path:**

```ts
expect(violations.some((v) => v.resolved?.startsWith("lib/supabase/server"))).toBe(true);
```

| Guard file | Canary root | Assert |
|---|---|---|
| `gradingResultsHelpersWiring.test.ts` | `src/lib/grade.ts` - the barrel its deleted `BANNED_IMPORT_PATTERNS` existed to ban, and the causal chain its own header at `:49-61` states | `violations.length > 0`, and the corrected form above |
| `repoGradesFeedbackAndFiles.wiring.test.ts` | `src/lib/grade.ts` - guard 1's header at `:246-256` names the same barrel and REGRESSION 355 | same |

**Assert `> 0` and the corrected form above, not `=== 4` and not "the first
trail".** The exact count is a property of an unrelated part of the tree and
would make the canary a brittleness source, which is how a canary gets
deleted. `violations.length > 0` plus `.some(...)` over `resolved` is what
proves the walk discriminates, order-independently; a wrong `srcRoot` or an
empty root list cannot produce either.

**The 4 is not the 5 the checker measured**, and the difference is the delta's
own doing: under the narrow prefix the barrel gives `violations=5 nodes=81`,
under the shipping widened prefix it gives `violations=4 nodes=74`. This is
precisely why the assertion is `> 0` and not a frozen count.

`src/lib/supabase/owner-context.ts` is offered as a SECOND canary root for the
grading-results file only if the implementer wants the X4 path covered by an
executed positive as well as by section 4.2's classifier proof; it is cheap
(nodes=3, 2ms) and it is the only file in `src/` that actually imports
`node:async_hooks`. Not required.

**Disjointness.** Write set is three new files under `src/lib/module-graph/`
(a directory that does not exist today) and two existing test files in two
different component directories. Intersected by exact path against the only
other dirty path in the tree (`docs/css-orphans.md`): empty.

---

## 9. Reuse survey

**Reuse - each opened, each line checked:**

| Symbol | `file:line` | What it gives |
|---|---|---|
| `resolveSpecifier` | `classTrendsDraft.not-postable.test.ts:80-94` | the bundler's own resolution order (`.ts`, `.tsx`, `index.ts`, `index.tsx`) for `@/` and relative specifiers. **DELTA: its four-candidate loop is reused verbatim, but NOT its `return null` contract** - under Z1 it becomes the `module` branch of `classifySpecifier`, and the `null` case splits into `asset` / `missing` / `node-builtin` / `package`. Reusing the `null` unchanged is exactly the hole Z1 found. |
| `isForbiddenPath` + the no-trailing-slash rule | `classTrendsDraft.not-postable.test.ts:46-53,67-70` | prefix predicate on the path relative to `src/`, and the recorded barrel-file defect a trailing slash creates |
| the `"use server"` wall | `canvas-client-boundary.transitive.test.ts:147-150` and its rule 2 at `:34-37` | the rule whose omission produced 39 false violations in my own first probe (section 4.5) |
| the memo-before-read ordering | `canvas-client-boundary.transitive.test.ts:132-141` | its comment records the walk blowing its own timeout when the read came first. Keep the ordering. |
| cycle guard | `canvas-client-boundary.transitive.test.ts:151` | import cycles exist here |
| A22's root derivation | `gradingResultsHelpersWiring.test.ts:136-167` | `readdirSync` + predicate for local files, and the computed non-local-consumer set at `:153-166`. **KEPT ENTIRELY, and (Relocation R-2, section 13) named precisely: the walk's root set is the SEAM'S `directoryRoots(dir)` output, unchanged from the delta - the frozen-`CLIENT_FILES`-vs-`readdirSync` comparison at `:136-167` is NOT itself the root set, it is the separate completeness control R-2 requires each guard file to keep alongside `directoryRoots(dir)`.** |
| the canary discipline | `gradingResultsHelpersWiring.test.ts:96-110`, `classTrendsDraft.not-postable.test.ts:150-205` | a detector is not evidence until it has found a planted positive. **DELTA: this row is now actually DISCHARGED, in section 8.1, in BOTH guard files with a measured expected trail.** The first version listed it here and reused it in neither file - citing a discipline is not applying it, which is the class Ruling Z2 names. |

**Do NOT reuse, with the reason:**

| Symbol | Why not |
|---|---|
| `valueImportSpecifiers` (`classTrendsDraft.not-postable.test.ts:98`, `canvas-client-boundary.transitive.test.ts:91`) | measured 19/46 wrong (section 3.2). Not adapted, not "fixed" - adapting it would be the fourth pattern. |
| `BANNED_IMPORT_PATTERNS` (`gradingResultsHelpersWiring.test.ts:89-94`, `repoGradesFeedbackAndFiles.wiring.test.ts:258-263`) | the mechanism being withdrawn. Deleted, not narrowed. |
| the U3 frozen literal (`gradingResultsHelpersWiring.test.ts:131`) | deleted; the walk is the replacement enforcer (section 4.1). `docs/a23-criteria.md`'s F-4 measured that no second test in the tree asserts it, so changing it breaks no landed gate - re-verified: `grep -rn 'CodeRunResult } from "../code-runner"' src` returns 5 hits, one assertion (this line) and four real imports. |
| `hasDirective` (`canvas-client-boundary.transitive.test.ts:108-110`) | a 200-character text slice. The parsed prologue costs nothing once the AST exists. Measured 0 disagreements today - stated so the swap is not sold as a bug fix. |
| `stripComments` (`repoGradesFeedbackAndFiles.wiring.test.ts:39-41`) | needed only because the old mechanism read comments. The parser does not. Keep it for the OTHER blocks in that file, which this pass does not touch. |

**Ruling M2 - RELOCATED, and not built here.** Section 3.2 scores four
extractors over "23 constructs x 2 quote styles = 46 fixtures", and **that
23-construct list appears nowhere in this document**, so its scoreboard
(0 / 19 / 22 / 20) cannot be re-derived by anyone reading it. That is the
"a quantity named but never defined" class, and the legal disposal is
`iteration-caps.md:60-62` (a) Relocate, not another paragraph here.

- **Receiver:** the TEST SEAT (`loop-test-author`).
- **Obligation the receiver now carries:** land the 23 constructs as NAMED
  FIXTURES with an explicit `want` column, in
  `src/lib/module-graph/runtime-import-graph.test.ts` - which section 8 step 1
  already plans to land, so this adds an obligation to an existing artifact
  rather than inventing one. Each fixture is labelled positive control or
  regression canary (AC-8's direction labels), and the step-1 red count is the
  scoreboard, executed rather than quoted.
- **Step at which it is measured:** wave step 1, where the fixtures run
  against a duplicated `valueImportSpecifiers` and the red is recorded.
- **Why not here:** a prose table of 23 constructs in a design document is a
  second, unexecuted copy of an oracle that is about to exist as code. Ruling
  Y5 already found that a fenced block nobody can run is not a measurement.

I am NOT restating section 3.2's four numbers as settled. They came from a
real run and the checker reproduced the design's other numbers, but until the
fixture table exists as code, **the only claim section 3.2 supports is the
one it is used for: `valueImportSpecifiers` fails AC-2(c) and AC-4**, which
is independently visible in its `IMPORT_RE` at
`classTrendsDraft.not-postable.test.ts:96` and its all-braces test at `:108`.

**Instruments this pass produced, and a gap I am naming rather than papering
over.** Every number in sections 3.2, 4.3 and 4.4 came from three scripts I
wrote and ran at `c458f7a`:

- `a23-shape-probe.mjs` - 23 constructs x 2 quote styles against four
  extractors (section 3.2)
- `a23-walk-probe.mjs` - the real-tree dry run, the `"use server"` wall, the
  barrel CONTROL, and the AST-vs-text directive comparison (sections 4.3-4.5)
- `a23-reach.mjs` - F-5 reachability and the whole-`src` residue count
  (section 4.4)
- `a23-sabotage-probe.mjs` - the 37 in-memory sabotage runs (section 4.3)

and SIX more written for the DELTA, at `d7f69c5`:

- `a23-dropped.mjs` - the 89/18 dropped-literal-specifier census (section 4.2)
  and the widened-prefix measurement that showed m4's literal form turning
  the repo-grades walk red
- `a23-delta-probe.mjs` - the shipping configuration end to end: allow list,
  `BROWSER_SAFE_MODULES`, `types.ts` as a root, and the two Z2 canaries
  (sections 4.2, 4.4, 8.1)
- `a23-x4-proof.mjs` - the deny-list-emptied classification table and the
  whole-`src` parse ceiling (sections 4.2, 6)
- `a23-typesedges.mjs` - the two runtime and four type-only edges into
  `types.ts` (section 4.1)
- `a23-sabotage-delta.mjs` - the 37 sabotage runs re-run under the shipping
  configuration (section 4.3)
- `a23-sites45-severity.mjs` - the RES-A23-9 severity number (section 12)

**They are NOT committed, because this pass's write scope is exactly one path
(`docs/a23-architecture.md`), and I am not widening it on my own authority.**
They live in this session's scratchpad. So my quantities name their commands
but a checker cannot re-run them from the repo today - which is precisely the
defect the criteria's round-2 checker raised against a vanished scratchpad
script, and Ruling Y5 answered by committing `docs/a23/a23-probe.mjs` and
`docs/a23/a23-scan.mjs`. I am not re-committing that defect silently:
**RES-A23-13** owns it, and reproducing them as fenced blocks here is the wrong
fix by Ruling Y5's own finding (a block needs an extractor before anyone can
run it). They are measurement instruments, not the implementation; the
implementation is the leaf.

---

## 10. Criteria disposition

Not a restructuring of a prior architecture pass - there is none. This maps the
settled criteria onto the chosen shape, so a checker can see nothing was
dropped. **Id column derived last.**

| Criterion | Under this shape | Evidence |
|---|---|---|
| AC-1 guard 1, wrap position and separator kind | SATISFIED by construction - whitespace is not a token to a parser | probe 1: P2a/P2b/P2c ok, both quote styles; sabotage S2/S3/S9 |
| AC-2 (a) all-type spellings permitted | SATISFIED; the P3 false positive closes | S10/S11 do not fire; repo-grades real tree stays green with `repoGradesCellEdits.ts:30` in the roots |
| AC-2 (b)(c)(d) mixed / default-binding / side-effect still flagged | SATISFIED - `clause.name` is checked explicitly, which is precisely where `valueImportSpecifiers` fails | S7, S4; probe 1 P4/P5/P6 |
| AC-3 guard 1 x five non-`import` constructs x both quotes | SATISFIED | S4/S5/S6/S8 at instance 1, both quote styles in probe 1 (C1/C1n/C2/C3/C4) |
| AC-4 guard 2, quote style | SATISFIED - the parser has no quote preference | T1 |
| AC-5 guard 2 + the `:112-117` sweep, wrap and separator | SATISFIED, both clauses | T5; S2/S3/S9 |
| AC-6 guard 2 + sweep, U3 construct set | SATISFIED, both clauses | T2/T3/T4; S4/S5/S6/S8 |
| AC-7 observed colour change, red-first landing order | **RELOCATED** to the leaf's test file, wave step 1. Receiver: test seat. Obligation: label every fixture as positive control or canary, and record the step-1 red. | section 8 |
| AC-8 fixture direction labels | TEST SEAT'S, unchanged (Ruling X2 (d)) | - |
| policy note (kind not strength) | ARGUED in section 3.1 with the failure-direction table; not gated, per Ruling Y2 | - |
| AC-10 both guards or neither | SATISFIED and STRUCTURALLY ENFORCED - one wave, section 8 | - |
| AC-11 six regression canaries still caught | SATISFIED | probe 1: P1/P4/P5 ok; H1/H6/H10 equivalents are S1/S9 and the `export { x } from` row (C2) |
| AC-12 (a) real tree passes | SATISFIED, and the root set WIDENS from 4 to 32 in repo-grades | section 4.4, both sites zero violations |
| AC-12 (b) option (b) excluded | SATISFIED - this deletes the regexes entirely rather than running them unconditionally | section 4.2 |

**Delta effect on this table.** Three rows change and none is weakened.
**AC-3 / AC-6** gain the allow list: a banned specifier in a spelling nobody
enumerated (the `async_hooks` case) now fails rather than being dropped
(section 4.2's X4 block). **AC-12(a)** is re-measured under the shipping
configuration and still holds at zero violations, zero residue and **zero
unallowed** (section 4.4). **The U3/instance-2 row** is now enforced by a
NAMED root rather than by an incidental one (section 4.1, Ruling Z3). The
policy row's argument is re-stated on two axes and the specifier axis is only
now true (section 3.1).

### 10.1 Delta disposition - every checker finding, by id

`iteration-caps.md` requires that a restructuring ship a disposition table.
This is a delta rather than a restructuring, so the table maps the CHECK's
findings rather than prior requirements. **No prior requirement of this
document was withdrawn in the delta**; two were strengthened (R1's specifier
handling, the U3 enforcer) and one plan step was added (8.1).

| Finding | Disposition | Where |
|---|---|---|
| **B1** deny list inside its own replacement; 89/18 dropped literals; `async_hooks` un-enumerated | **DISPOSED by change of kind** - allow list, five explicit buckets, deny list demoted to diagnostic and proved non-load-bearing with it emptied | 4.2, and the specifier axis added to 3.1 |
| **B2** both guard files' canaries deleted with no replacement | **FIXED** - a measured planted-positive canary specified for each file, asserting `> 0` and a named trail | 8.1, and the line budget in 6 |
| **M1** "worse overall" contradicts its own scoreboard; conflict with `a23-criteria.md:564` unflagged | **CORRECTED and FLAGGED** - rejection re-grounded on AC-2(c)/AC-3/AC-4/AC-6 only | 3.2, and section 1 correction (3) |
| **M2** the 23-construct list exists nowhere | **RELOCATED** to the test seat as named fixtures with a `want` column in `runtime-import-graph.test.ts` | 9 |
| **M3** U3's enforcer is incidental, dissolvable by a type-only narrowing | **FIXED** - `types.ts` is a named root; two runtime edges measured | 4.1 |
| **M4** RES-A23-4 wrongly marked superseded | **LABEL WITHDRAWN** - it keeps its own instrument and its own escalation | 11 |
| **M5** three files under two ordinals | **FIXED** - five files, six instances, three chartered, in one table | 1, 7 |
| **m1** `no-restricted-paths` called "NAME-BASED" | **HALF DROPPED** - direct-only is the whole ground | 3.3 |
| **m2** performance recorded as undetermined | **MEASURED** - 1560 files, 1800/1847ms, 30000ms timeout | 6, 12 |
| **m3** runtime budget omits the leaf's own whole-src guard | **CORRECTED** - 0.8% becomes about 3.5% | 6 |
| **m4** one prefix under a 27-module directory | **DIRECTION TAKEN, LITERAL FORM REFUSED** - prescribed form measured turning the repo-grades walk red; widened prefix plus `BROWSER_SAFE_MODULES` instead | 4.2, 4.4 |
| checker's ask: RES-A23-9 carries no severity estimate | **MEASURED** - zero live defects, one latent construct | 12, RES-A23-9 |

---

## 11. Residual register

Every entry names an **owner**, an **instrument** and a **step**. Any entry
missing one of the three is a deletion and I would say so; none is. Ids follow
`docs/a23-criteria.md:797-804`: RES-A23-3 and RES-A23-6 stay RETIRED and are
not reissued; new entries take fresh numbers from 9.

| Id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-A23-1 | **RE-BOUND, and it stops being unmeasurable.** The criteria narrowed AC-3/AC-6 to static-literal specifiers because a computed `import(pathVar)` "is caught by no construction available in this repo". Under this shape it IS caught - not resolved, but REPORTED: `scanRuntimeEdges` returns it in `unresolvable` and the guard fails rather than skipping. **Disposal round, Relocation R-1: the obligation widens from "the leaf's test" to BOTH guard files as well - see section 13.** | Test seat | `<scratchpad>/a23-reach.mjs` (RES-A23-13, not yet committed) - whole-`src` residue count, measured 0 across 1560 files today; plus sabotage S14, which fires | The leaf's own test AND both guard files assert `unresolvable` is empty over each closure, and the oracle round proves S14 red |
| RES-A23-2 | **CLOSED by the widened root set.** `repoGradesPosting.ts:56`'s coverage-by-omission gap disappears when repo-grades roots are tree-derived (4 -> 32). Its `@/lib/grade/postable` import is then walked and is clean, which is the correct verdict. | Orchestrator, to strike from the row | `node <scratchpad>/a23-walk-probe.mjs` (RES-A23-13, not yet committed) - repo-grades 32 roots, 0 violations | A23's backlog reconciliation |
| RES-A23-4 | `snapshot-grading.structure.test.ts:801` - an instance of the line-filter idiom, different capability boundary, not chartered. **DELTA, Ruling M4: the "superseded in scope by RES-A23-9" label is WITHDRAWN. It was wrong.** RES-A23-9's denominator comes from a sweep for tests asserting a from-clause against a SERVER-ONLY specifier; `:801` asserts about `extractRubricCriteria`, so it is absent from that sweep BY CONSTRUCTION and can never appear in its five files. Two different classes were merged under one id. RES-A23-4 keeps its own instrument and its own escalation. | Repo owner (scope call) | the `Grep` tool for `/^\s*import\b/` over `src`, with a matching-string canary - **not** RES-A23-9's sweep | Escalated in its own right at A23's disposal |
| RES-A23-5 | `next build`'s compile stage is the only TRUE oracle; every guard here is a proxy for it, and this checkout has no `.env` so the gate is the `Compiled successfully` line, never exit 0 (`this-repo.md:52-54`). | Repo owner | `npm run build`, grepping for `Compiled successfully`; then the Vercel deploy log | A23's push |
| RES-A23-7 | **CLOSED as a mechanism.** The `:112-117` sweep's five-hole set is what this design replaces; F-5's live `dynamic(() => import("../MonacoFileEditor"))` is now FOLLOWED (`<scratchpad>/a23-reach.mjs`: reaches `MonacoFileEditor.tsx` = true). What remains is only the computed-specifier case, which is RES-A23-1. | Orchestrator, to fold into RES-A23-1 at the row | `node <scratchpad>/a23-reach.mjs` (RES-A23-13, not yet committed) | A23's backlog reconciliation |
| RES-A23-8 | The bash-grep false absence, trap-card candidate. Unchanged; reproduced a third time in this pass (section 1's canary exists because of it). | Orchestrator (`traps-search.md` is not this seat's to write) | the pair: a bash `grep -rn` for the anchored pattern (empty) against the `Grep` tool (finds every site), with a known-positive canary | A23's backlog reconciliation |
| RES-A23-9 | **NEW. The sweep returns FIVE FILES carrying SIX instances, of which three are chartered** (section 1, ordinals fixed under Ruling M5). Instances 4, 5 and 6 - `ungradedDisclosure.test.ts:495-515`, `course-schedule-docx.test.ts:42-48`, `steps.weekly-announcement-schedule.test.ts:63-69,79-86,100-102` - carry the identical five holes AND are direct-only. Instance 4's object is already covered transitively by R1; instances 5 and 6 guard a different boundary and are not. Not chartered by A23. **DELTA: the escalation now carries a SEVERITY NUMBER - ZERO live defects across all five guarded objects, one latent construct. Section 12.** | Repo owner (scope call), then orchestrator as a backlog row | `node <scratchpad>/a23-sites45-severity.mjs` - the transitive walk over each guarded object, plus a parsed construct census per object; and the canaried sweep in section 1, re-run | Escalated at A23's disposal WITH the number; a row filed if the owner widens scope |
| RES-A23-10 | **NEW. R2 is a product call.** R1 binds the hazard, not the name, so if `@/lib/grade` ever stopped reaching a server leaf, R1 would permit importing it where today's name ban would not. One line of the same extractor restores the name ban. Recommendation: take R2. | Repo owner (an `iteration-caps.md` (b) Reduce) | `directRuntimeSpecifiers(root)` asserted not to contain `"@/lib/grade"`, over both root sets | Answered before the wave lands; if the answer is no, `directRuntimeSpecifiers` must not be written |
| RES-A23-11 | **NEW. `verbatimModuleSyntax` is absent** (`cat tsconfig.json`; `isolatedModules: true` at `:13`). Its absence is why an unmarked `import { X }` is over-approximated as a runtime edge. Safe direction, and measured at zero cost today - but enabling it would make the classifier exact. Repo-wide flag change, out of scope for A23. | Repo owner (scope call) | `npx tsc --noEmit --verbatimModuleSyntax` over the tree; the error count is the cost | Escalated with RES-A23-9 |
| RES-A23-13 | **NEW, and it is a gap in THIS document. MAJOR M-3: reconciled to TEN probes, not four (see the delta note below and section 8 step 0).** None of the probes behind sections 3.2, 4.2, 4.3 and 4.4 are committed - this pass's write scope was one path - so those quantities are stated with their commands but are not re-runnable from the repo. Same class the criteria's Ruling Y5 already closed once. | Implementer (wave step 0), then orchestrator to confirm at the push | commit all ten - `a23-shape-probe.mjs`, `a23-walk-probe.mjs`, `a23-reach.mjs`, `a23-sabotage-probe.mjs`, `a23-dropped.mjs`, `a23-delta-probe.mjs`, `a23-x4-proof.mjs`, `a23-typesedges.mjs`, `a23-sabotage-delta.mjs`, `a23-sites45-severity.mjs` - to `docs/a23/` beside the criteria's two, then re-run each from the repo root and diff the output against sections 3.2/4.2/4.3/4.4 | Wave step 0, BEFORE any guard file is edited - if a number does not reproduce, this design is wrong and must not be built |
| RES-A23-14 | **NEW IN THE DELTA. The allow list's maintenance cost is real and is not zero.** `ALLOWED_BARE_SPECIFIERS` has 14 entries today and covers two closures of 149 and 93 nodes, so ANY new bare specifier entering either closure - including one added in a distant `src/lib/` file - reds the guard until a line is added. That is the fail-closed direction the row bought and it is also friction. **MINOR m-2, stated plainly rather than left decorative: this residual is OBSERVATIONAL by nature - "is the allow list noisy in practice" is a judgement about a trend across future commits, not a property any test or gate in this repo can assert today, so it has no runnable command the way RES-A23-1 or RES-A23-9 do.** Its instrument is "read the guard's own failure messages as they accrue", which is manual review, not automation. And the "never a return to a deny list" clause is, honestly, a STATED INTENT for the owner to enforce by review at that future point - it binds no test and no gate today, and this document does not pretend otherwise. If it is measured as noisy in practice, the legal next move is a narrower CLOSURE (fewer roots), never a return to a deny list. | Repo owner, after the wave lands | manual review of the guard's own failure messages (each names the specifier and the trail) over the rows that follow this one - observational, no automated instrument exists or is proposed | A23's backlog reconciliation, then reviewed at the next row that touches either directory |
| RES-A23-15 | **NEW IN THE DELTA. `BROWSER_SAFE_MODULES` is an allow list with ONE entry and no test that it is minimal.** Nothing fails if a future edit adds a genuinely server-only module to it. The construction bounds the damage (an entry must be added deliberately) but does not prevent it. **Ruling M-1 (disposal round): checkable now that the value has a named home** - `src/lib/module-graph/client-boundary-policy.ts` (section 4.2). | Test seat | the leaf's own test imports `BROWSER_SAFE_MODULES` from that file and asserts it has exactly the entries listed in section 4.2, as a frozen literal array - so widening it is a deliberate, visible, reviewed edit rather than a silent one | Wave step 2, with the leaf's test |
| RES-A23-12 | **NEW. Whether a plain `import ts from "typescript"` resolves under vitest is UNMEASURED** - measuring it needs a file written into `src/`, which this pass may not do. The specified `createRequire` form IS measured working. | Implementer | `npx vitest run src/lib/module-graph/runtime-import-graph.test.ts` with each form | Wave step 2 |

**None of these exist until they are in `docs/BACKLOG.md`**
(`DEV_LOOP.md:79-84`). `docs/backlog.yml` is the orchestrator's file and this
seat may not write it; recording them there is owed at A23's reconciliation.
Specifically owed: **add** RES-A23-9 through RES-A23-15; **re-bind**
RES-A23-1's instrument to the residue check; **strike** RES-A23-2 and
RES-A23-7 as closed by this design, each naming the measurement that closed it;
and **record that RES-A23-4 is escalated on its own instrument**, not folded
into RES-A23-9 (Ruling M4).

**Delta note on RES-A23-13.** It now owns TEN scratchpad probes, not four: the
original four plus `a23-dropped.mjs`, `a23-delta-probe.mjs`, `a23-x4-proof.mjs`,
`a23-typesedges.mjs`, `a23-sabotage-delta.mjs` and `a23-sites45-severity.mjs`
(section 9). **MAJOR M-3, disposal round: this note, RES-A23-13's own
instrument column above, and section 8 step 0 all now name the same ten -
the first version of the document said ten only here.** Wave step 0 commits
and re-runs all ten. The delta did not widen
this pass's write scope to commit them, for the same reason the first version
did not: this pass owns exactly one path.

---

## 12. What I could not determine

- **Whether the guards ever let a real defect through historically.** I
  measured the tree at `c458f7a` only. I did not walk the history, and I am not
  claiming the guards have never been decorative.
- **Whether a bare `import ts from "typescript"` works under vitest**
  (RES-A23-12). The `createRequire` form is measured; the bare form is not, and
  measuring it requires writing into `src/`, which this pass may not do.
- **Whether `next build` accepts the tree after the change.** It cannot run to
  completion here - no `.env`, so the prerender tail always fails
  (`this-repo.md:30-41`). Nothing in this design changes runtime code, so the
  compile line should be unaffected, but that is a reading claim, not a
  measurement.
- ~~**Whether the walk's cost stays acceptable as the two directories
  grow.**~~ **ANSWERED IN THE DELTA under Ruling m2 - this was a measurement I
  owed, not an unknown.** The ceiling is one command: parsing every non-test
  `.ts`/`.tsx` under `src/` (1560 files, the hard upper bound on any closure)
  takes 1800ms / 1847ms here against a 30000ms timeout - a 16x margin at the
  ceiling - and the walk is O(nodes) with a visited set. Section 6 carries the
  numbers and the corrected 3.5% suite figure. What remains genuinely
  unmeasured is only the growth CURVE of the two directories themselves, which
  is a property of future commits, not of this tree.
- ~~**Whether instances 4-6 (RES-A23-9) have live defects.**~~ **ANSWERED IN
  THE DELTA - the escalation now carries a number.** `node
  <scratchpad>/a23-sites45-severity.mjs` at `d7f69c5` walks each guarded object
  transitively under the shipping forbidden set:

  ```
  ===== RES-A23-9 SEVERITY: transitive walk over each guarded object =====
    instance 4  ungradedDisclosure.ts                            nodes=4   violations=0
    instance 5  course-schedule-docx.ts                          nodes=5   violations=0
    instance 6  steps.weekly-announcement-schedule.ts            nodes=90  violations=0
    instance 6  announcement-package-run.ts                      nodes=11  violations=0
    instance 6  steps.weekly-announcement-schedule.shared.ts     nodes=12  violations=0
  ```

  **SEVERITY: ZERO live defects.** All five guarded objects are clean
  transitively today, so instances 4-6 are latent holes, not shipped bugs, and
  the scope call is about prevention rather than repair. **One latent
  construct is live**, from the parsed construct census in the same run:
  `course-schedule-docx.ts` contains `await import("docx")` at `:79` - a
  dynamic import with no `from` token at all, therefore invisible to that
  file's own `/from ["']...["']/` guard. It is harmless today (`docx` is a real
  browser-safe package), but it is the hole standing open: the same line
  spelled `await import("@/lib/supabase/server")` would pass instance 5's guard
  green. Every other object's census is plain `import` declarations only
  (3, 5, 8 and 2 respectively; zero `require`, zero `export ... from`, zero
  wrapped `from`).
- **Whether instances 4-6 would stay clean under their OWN capability
  boundaries.** I walked them against the grading boundary
  (`lib/supabase` + the three bare specifiers). Instance 5's guard also bans
  `@/app/actions`, and instance 6's also bans `@/app/actions/shared`, which are
  different predicates. Running those is part of the scope call, not this pass.

---

## 13. Disposal round (round 3): two blockers relocated

**Caps.** `iteration-caps.md:44-45` - per artifact, two revisions then a
disposal round; round three produces no new requirements, only dispositions.
This document has already had two revision rounds (the original pass at
`c458f7a`, the DELTA at `d7f69c5`). A fresh narrow check of the delta,
measured against `182ecc6`, returned 2 blockers, 3 majors, 5 minors. **Both
blockers are REPEAT classes** - the checker's classification, not re-derived
here (`iteration-caps.md:128-129`: "the author never names the class") - so
under cap 1 they are disposed now rather than taken to a third revision, and
per the caps table (`iteration-caps.md:97-98`) the architect is **not
re-dispatched** for a repeat class. The three majors are applied in place
above (section 4.2 for M-1, section 8.1 for M-2, section 8 step 0 and section
11 for M-3); this section records the two relocations only.

### RELOCATION R-1, disposing blocker B-1

**Finding, as the checker measured it and as re-verified here.** `unallowed`
(`WalkResult.unallowed`, section 5; the five-bucket table and the
`unallowed=0` column, section 4.2 and 4.4) is COMPUTED throughout this
document and never ASSERTED against by any named test.
`grep -n "unallowed" docs/a23-architecture.md` returns **11 hits**
(re-verified on the pre-disposal-round text): five measured output lines
(the walk-probe and delta-probe outputs), two seam-type declarations (the
`Unallowed` interface and the `unallowed: Unallowed[]` field of `WalkResult`,
section 5), and four prose mentions - and not one of the eleven names an
assertion in a file the wave will land. Section 4.1's instruction to the
implementer at `:387` ("derive the root set from the directory, walk, assert
ZERO VIOLATIONS") names violations only. The asymmetry is what makes this an
oversight rather than shorthand: `unresolvable` got an explicit home in
RES-A23-1, the two allow/deny lists got a disjointness assertion, and
`BROWSER_SAFE_MODULES` got RES-A23-15 - the channel Z1 was written to CREATE
got none. Built exactly as specified, `async_hooks`, `@mui/material/Dialog`, a
missing module, and every un-enumerated bare specifier land in `unallowed` and
nothing fails - the two forbidden bare specifiers named in section 4.2 remain
caught only by the diagnostic-only deny list, which section 4.2 itself says
is "explicitly NOT what completeness rests on." That is B1 (section 10.1)
restored one layer down: an allow list nobody's test reads is functionally a
deny list again. The same gap reaches `unresolvable` inside the two guard
files specifically: S14 (section 4.3) measures `residue=1` in the
grading-results closure, and the guard file as specified stays green on that
measurement.

**Disposition: RELOCATE** (`iteration-caps.md:60-62`, disposal (a)).

- **Receiver:** the TEST SEAT (`loop-test-author`), dispatched in parallel
  with this disposal round.
- **Obligation the receiver now carries:** BOTH guard files
  (`repoGradesFeedbackAndFiles.wiring.test.ts`,
  `gradingResultsHelpersWiring.test.ts`) AND the leaf's own test
  (`runtime-import-graph.test.ts`) assert that `unallowed` and `unresolvable`
  are EMPTY over each real-tree closure the guard owns - stating the failure
  direction explicitly (a non-empty array is the FAIL condition, not a warning
  or a count to eyeball). This is in addition to, not instead of, the existing
  `violations.length === 0` / `> 0` assertions (section 4.4, section 8.1).
- **Step:** wave step 3 (section 8) - the same step that lands the Z2 canary
  and re-points both guard files at the leaf against the unmodified tree.

### RELOCATION R-2, disposing blocker B-2

**Finding, as the checker measured it and as re-verified here.** The derived
root set has no control. `grep -n "readdirSync"
src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts`
returns **nothing** (re-verified), so guard 1 has no completeness test today,
and section 8's plan deletes `:246-305`, which contains its only frozen list
(`REPO_GRADES_CLIENT_FILES`, `:265-270`). Its roots become
`directoryRoots(dir)` (section 5's seam) with nothing asserting the
derivation returns anything. **The Z2 canary (section 8.1) cannot catch
this**, because it *replaces* the root set with a hand-picked canary root
(`src/lib/grade.ts`, optionally `src/lib/supabase/owner-context.ts`) rather
than deriving it from the directory: a `directoryRoots` that returns `[]`
would give the real assertion `violations=0` GREEN (nothing to walk) and the
canary GREEN (it supplies its own root independently), so every gate stays
green while all 32 repo-grades files go unguarded.

The precedent for the fix is already in the file this design mines five times
(section 9's reuse survey): `canvas-client-boundary.transitive.test.ts:170-177`
is titled "finds the client entry points at all", commented "Guards the
guard: if the directive scan broke, the walk below would start from nothing
and pass vacuously forever," and asserts `clients.length > 50`. Section 9's
reuse table lists rule 2, the memo ordering, the cycle guard, `hasDirective`
and `resolveSpecifier` from that same file and omits the one control that
addresses exactly this failure mode.

**Disposition: RELOCATE** (`iteration-caps.md:60-62`, disposal (a)).

- **Receiver:** the TEST SEAT (`loop-test-author`), dispatched in parallel
  with this disposal round.
- **Obligation the receiver now carries:** each guard file asserts its
  derived root set (`directoryRoots(dir)`'s output) against a HAND-FROZEN
  list - the non-circular form A22 already ships at
  `gradingResultsHelpersWiring.test.ts:136-167` (a separately-declared literal
  array, `CLIENT_FILES`, compared against `readdirSync`'s output). A
  `directoryRoots(dir)` result compared against a fresh `readdirSync(dir)`
  call inside the same test would be CIRCULAR - both sides derive from the
  same filesystem read with the same predicate, so an empty or wrong result
  agrees with itself - and does NOT discharge this obligation. Counts are
  re-measured at the wave gate, not frozen from this document.
- **Step:** wave step 3, same as R-1.
- **A related gap this relocation also resolves.** Section 9's reuse-survey
  table said A22's root derivation "becomes the walk's root set" without
  saying which of the two forms - `directoryRoots(dir)` alone, or
  `directoryRoots(dir)` checked against a frozen list - leaving even the
  partly-covered grading-results side a guess. Resolved: the walk's root set
  IS `directoryRoots(dir)`'s output (unchanged from the delta), and the
  frozen-list comparison is the separate completeness control this relocation
  requires the test seat to add alongside it, for both guarded directories.
