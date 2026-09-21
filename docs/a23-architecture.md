# A23 - architecture pass (the SHAPE)

**Row:** `docs/backlog.yml:429` (`id: 'A23'`), `kind: 'bug'` at `:438`.
**Seat:** architecture (`loop-architect`). **Date:** 2026-09-20.
**Tree:** every quantity below was measured at `c458f7a`
(`git log --oneline -1`), the session HEAD when this pass ran. Working tree at
the start and end of this pass: `M docs/css-orphans.md` only
(`git status --short`), which is outside this loop and was not touched.
**Consumes:** `docs/a23-criteria.md` at `c458f7a` (round 3, disposal round).
The criteria are settled; this document decides mechanism only, which is the
lane section 10 of that document explicitly leaves open
("Which of the three C-2 shapes each fix should take ... that is the
architect's lane", `docs/a23-criteria.md:851-857`).

---

## 0. Leverage - FIRED AND DECLINED

`docs/backlog.yml:438` carries `kind: 'bug'`. `seats.md:70-75` rules that on a
bug fix "there is no claim to make; record that as the fired trigger and move
on." **Trigger fired: bug fix. No leverage claim.** This row repairs three
shipped guards and builds no capability a user reaches, so there is no removal
test to hand the test seat and no class in `docs/loop/leverage.md` this work
could earn. Recording the fired trigger rather than omitting the line.

---

## 1. Two corrections to my own brief, measured

`loop-architect.md:64-66` requires refusing a ruling the tree disproves. Two.

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

**(2) The class has FIVE sites in this tree, not three.** A23 charters three
and I am not widening it. But an `owns` list that says "three" is wrong, and a
residual that says "a third site" names the wrong denominator. Command, with
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

Sites 4 and 5 are the identical mechanism, opened and read:
`course-schedule-docx.test.ts:42-48` and
`steps.weekly-announcement-schedule.test.ts:63-69,79-86,100-102`. Both are
whole-source regex bans requiring the literal token `from` plus a quote, so
both carry the same five holes, and both are DIRECT-ONLY (each reads one
file's own source), so both additionally miss every transitive case.
`steps.weekly-announcement-schedule.test.ts:89-94`'s own comment records that
its list was hand-extended once already after a leaf extraction opened a gap -
the lengthening-the-denylist history this row forbids repeating. Registered as
RES-A23-9; not chartered here.

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

| | The three broken guards | This design |
|---|---|---|
| What is enumerated | the spellings of a BANNED import | nothing - the grammar is the TypeScript parser's |
| Object under test | one line, or one file's raw text | the resolved module graph |
| An un-enumerated syntax | is not matched, so the file is **PERMITTED** - silent green | is not an erased import, so it is **an edge to follow** - loud |
| Completeness rests on | a human having listed every form | `ts.createSourceFile` covering the language |

The default flips. That is the whole argument, and it is the only kind of
change `iteration-caps.md:13-16` records as ever ending a chain here: replace
the assertion with a CONSTRUCTION that makes the bad state unrepresentable.
The bad state here is "a runtime dependency nobody enumerated". Under a parser
there is no such state to be in - every module specifier in the file is either
an erased type import or a runtime edge, and the classifier's own residue
bucket catches the one remaining case (a non-literal specifier) by REPORTING
it rather than skipping it.

I am not claiming the result cannot be wrong. I am claiming it cannot be
**silently permissive by omission**, which is the specific failure this family
has now committed three times.

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
that is exactly what makes it a trap: it is better on the axis the row's title
names and worse overall.

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
  configuration. But `no-restricted-paths` is DIRECT-ONLY and NAME-BASED,
  which is the mechanism being withdrawn. Strictly weaker than the walk;
  rejected on that ground, having checked it exists rather than assuming it
  does not.
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

**Sites 1 and 3 - YES, identical shape.** `repoGradesFeedbackAndFiles.wiring.
test.ts:287-305` and `gradingResultsHelpersWiring.test.ts:112-117` ask the same
question about two directories. Both become: derive the root set from the
directory, walk, assert zero violations. Uniformity here is a decision with a
reason - they share the class, the corrective rule AND the object (a directory
of client files) - not a default.

**Site 2 - NO, it does not get a new shape. It is DELETED, and the walk is its
named replacement enforcer.** `gradingResultsHelpersWiring.test.ts:123-132`'s
walled-set count exists solely to keep the `@/lib/grade/types` exemption at
`:91` honest. Under the walk there IS no exemption: `types.ts` is an ordinary
node, walked like every other, and its own reachability is what decides the
verdict. `iteration-caps.md:71-72` (disposal (d)) requires that a deletion name the
enforcer it was protecting; the enforcer is the walk, and section 4.3 proves it fires on
five sabotages of types.ts that the deleted guard let through and on none that
it correctly permitted.

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

```ts
const FORBIDDEN_PATH_PREFIXES = ["lib/supabase/server"];          // resolved, relative to src/, POSIX, no trailing slash
const FORBIDDEN_BARE_SPECIFIERS = ["next/headers", "node:async_hooks", "server-only"];
```

`BANNED_IMPORT_PATTERNS` disappears entirely. `@/lib/grade` is banned not
because it is on a list but because it reaches `lib/supabase/server` - measured
in section 4.3's CONTROL. `@/lib/grade/types` is permitted for the opposite
reason, derived rather than carved out. **There is no list left to be
incomplete.**

The no-trailing-slash rule is inherited from
`classTrendsDraft.not-postable.test.ts:46-53`, which records the barrel-file
defect that a trailing slash creates. `FORBIDDEN_BARE_SPECIFIERS` is an exact
set-membership test on a parsed specifier string, not a pattern, and exists
because `next/headers` and `node:async_hooks` resolve to nothing under
`resolveSpecifier` - the shipped walkers return `null` for a bare specifier and
would silently skip them. That is a hole in the precedent I am building on, and
I am closing it rather than inheriting it.

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

**Instrument.** `docs/a23/a23-sabotage-probe.mjs` (section 9), `node <probe>`
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
`docs/a23/a23-walk-probe.mjs`:

```
===== CONTROL: the @/lib/grade barrel itself (must be NON-ZERO) =====
violations=5 nodes=81 117ms
  src/lib/grade.ts
      -> src/lib/grade/rubric.ts
      -> src/lib/research/rubric-bank.ts
      -> src/lib/research/db.ts
      value-imports "@/lib/supabase/server" -> src/lib/supabase/server.ts
```

That is `gradingResultsHelpersWiring.test.ts:52-56`'s stated causal chain,
recovered from the tree rather than quoted from a comment.

### 4.4 The real tree stays green (AC-12(a)), and the roots get WIDER

`docs/a23/a23-walk-probe.mjs`, `node <probe>` from the repo root:

```
===== SITE 1+3 repo-grades (whole dir, tree-derived) =====
roots=32  nodes walked=149  430ms   violations=0   residue=0
===== SITE 2+3 grading-results (whole dir + GradingResults.tsx) =====
roots=12  nodes walked=93   166ms   violations=0   residue=0
===== SITE 2 types.ts alone (the U3 object) =====
roots=1   nodes walked=1    2ms     violations=0   residue=0
```

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

(`docs/a23/a23-reach.mjs`.) So RES-A23-1's computed-specifier narrowing stops
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

export interface WalkOptions {
  srcRoot: string;
  forbiddenPathPrefixes: string[];
  forbiddenBareSpecifiers: string[];
  treatUseServerAsWall: boolean;
}
export interface Violation { trail: string[]; specifier: string; resolved: string | null; }
export interface WalkResult { violations: Violation[]; unresolvable: string[]; nodes: number; }
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
| `src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts` | 305 | 305 | ~285 | clear |
| `src/app/components/grading-results/gradingResultsHelpersWiring.test.ts` | 241 | 241 | ~235 | clear |

Commands: `wc -l < <file>` (Bash tool) and
`@(Get-Content <file>).Count` (PowerShell), both run at `c458f7a`.

**The "after" column is an ESTIMATE and is labelled one.** Its arithmetic, so a
checker can re-derive rather than trust it. `gradingResultsHelpersWiring.test.ts`
loses `BANNED_IMPORT_PATTERNS` (`:89-94`, 6 lines), its canary (`:96-110`, 15),
the `it.each` sweep (`:112-117`, 6) and the whole U3 block (`:119-132`, 14) =
-41, and gains a walk block of roughly 35. `repoGradesFeedbackAndFiles.wiring.
test.ts` loses `:246-305` (60) and gains roughly 40. Neither file is on
`src/file-size-ceiling.structure.test.ts`'s `ALLOWED_OVERAGE` ratchet
(`grep -n -e "repoGradesFeedbackAndFiles" -e "gradingResultsHelpersWiring"
src/file-size-ceiling.structure.test.ts` returns nothing; `LIMIT = 1000` at
`:30`), so only the repo-wide limit applies and both are far under it. **Verify
with `@(Get-Content).Count` at the wave gate; do not ship on these estimates.**

**Runtime cost.** 430ms + 166ms for the two walks, plus the leaf's own pure
fixtures. Suite baseline at `c458f7a`, re-measured rather than quoted:
`npx vitest run` gives `Test Files 1092 passed (1092)` /
`Tests 21761 passed (21761)`, exit 0, `Duration 70.73s`. Roughly 0.8% added.
`canvas-client-boundary.transitive.test.ts` and
`classTrendsDraft.not-postable.test.ts` both carry explicit `{ timeout: 30000 }`
on their walks; do the same.

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

# Does anything read GUARD 2's OBJECT (types.ts) as source text? Only guard 2.
grep -rn 'readFileSync' src --include=*.test.ts | grep -i types
src/lib/prompt-announcement-types.test.ts:2:  (a different file - prompt-announcement-types.ts)
```

| Path | Class | Why |
|---|---|---|
| `src/lib/module-graph/runtime-import-graph.ts` | **OWNED** (new) | the seam |
| `src/lib/module-graph/runtime-import-graph.test.ts` | **OWNED** (new) | its caller and its cross-product |
| `src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts` | **OWNED** | site 1 |
| `src/app/components/grading-results/gradingResultsHelpersWiring.test.ts` | **OWNED** | sites 2 and 3 |
| `src/app/components/grading-results/classTrendsEntry.ts:28` | **ADOPTED** - comment correction owed | its comment states the sweep "matches RAW SOURCE, comments included". Under the AST extractor that is false. Opened; it is a comment, not an assertion, so it cannot go red - which is exactly why it will otherwise rot. Correct it in the same wave. |
| `src/app/components/repo-grades/RepoGradeCellControl.tsx:47` | **CHECKED-SAFE** | comment, "bans that alias prefix outright". Still true under R1 (the barrel reaches a server leaf) and under R2. No edit. |
| `src/lib/grade/postable.test.ts:227` | **CHECKED-SAFE** | comment naming guard 1 as the reason for a relative import. Unchanged. |
| `src/app/components/grading-results/gradingResultsHelpers.test.ts:26` | **CHECKED-SAFE** | comment recording the file split. Unchanged. |
| `src/app/components/grading-results/ungradedDisclosure.test.ts:495-515` | **ADOPTED - decision owed, see RES-A23-9** | site 4 of the class. Its object, `ungradedDisclosure.ts`, IS one of the twelve `CLIENT_FILES`, so R1 already covers it transitively (measured: zero violations). Leaving a redundant broken guard beside a working one is how the next reader believes the wrong thing. Recommend deleting its two `not.toMatch` assertions and citing R1; that is a scope call, not mine. |
| `src/lib/workflows/course-schedule-docx.test.ts`, `src/lib/workflows/registry/steps.weekly-announcement-schedule.test.ts` | **OUT OF SCOPE** - RES-A23-9 | sites 4/5 of the class, different directories, different capability boundary. Not chartered. |
| `docs/backlog.yml`, `docs/BACKLOG.md` | **ORCHESTRATOR'S** | residuals below must land there or they do not exist |
| `docs/a23/a23-probe.mjs`, `docs/a23/a23-scan.mjs` | **CHECKED-SAFE** | the criteria's measurement instruments. They run the OLD procedures and must keep doing so - they are the AC-7 "before" instrument. Do not update them to the new shape. |

**No file in `src/` reads either guard test file as source text.** All four
`src/` hits above are comments, each opened and quoted. So no correct change to
these files can turn a third-party test red by string collision - the failure
mode the `owns` obligation exists to catch.

---

## 8. Wave plan: ONE WAVE, and that is forced

**One wave, four files**, all written by one implementer:

```
src/lib/module-graph/runtime-import-graph.ts                                    (new)
src/lib/module-graph/runtime-import-graph.test.ts                               (new)
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

0. **Commit the four probes to `docs/a23/` and re-run every one of them from
   the repo root**, diffing against sections 3.2, 4.3 and 4.4 (RES-A23-13).
   This happens BEFORE any guard file is edited. A number that does not
   reproduce means this design rests on a measurement that is not real, and
   the wave stops.
1. Land `runtime-import-graph.test.ts` with the full cross-product asserted
   against a **duplicated copy of `valueImportSpecifiers`** as the extractor.
   Run `npx vitest run src/lib/module-graph/runtime-import-graph.test.ts` and
   **record the red** - expected 19 failures per section 3.2, which is the
   positive control proving the fixtures discriminate.
2. Land `runtime-import-graph.ts` and re-point the test at `scanRuntimeEdges`.
   Re-run; record green.
3. Re-point both guard files at the leaf, in ONE commit. Record
   `npx vitest run` over both guard files green against the unmodified tree
   (AC-12(a)).
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

**Disjointness.** Write set is two new files under `src/lib/module-graph/`
(a directory that does not exist today) and two existing test files in two
different component directories. Intersected by exact path against the only
other dirty path in the tree (`docs/css-orphans.md`): empty.

---

## 9. Reuse survey

**Reuse - each opened, each line checked:**

| Symbol | `file:line` | What it gives |
|---|---|---|
| `resolveSpecifier` | `classTrendsDraft.not-postable.test.ts:80-94` | the bundler's own resolution order (`.ts`, `.tsx`, `index.ts`, `index.tsx`) for `@/` and relative specifiers. Move into the leaf verbatim. |
| `isForbiddenPath` + the no-trailing-slash rule | `classTrendsDraft.not-postable.test.ts:46-53,67-70` | prefix predicate on the path relative to `src/`, and the recorded barrel-file defect a trailing slash creates |
| the `"use server"` wall | `canvas-client-boundary.transitive.test.ts:147-150` and its rule 2 at `:34-37` | the rule whose omission produced 39 false violations in my own first probe (section 4.5) |
| the memo-before-read ordering | `canvas-client-boundary.transitive.test.ts:132-141` | its comment records the walk blowing its own timeout when the read came first. Keep the ordering. |
| cycle guard | `canvas-client-boundary.transitive.test.ts:151` | import cycles exist here |
| A22's root derivation | `gradingResultsHelpersWiring.test.ts:136-167` | `readdirSync` + predicate for local files, and the computed non-local-consumer set at `:153-166`. **KEPT ENTIRELY** - it becomes the walk's root set. |
| the canary discipline | `gradingResultsHelpersWiring.test.ts:96-110`, `classTrendsDraft.not-postable.test.ts:150-205` | a detector is not evidence until it has found a planted positive |

**Do NOT reuse, with the reason:**

| Symbol | Why not |
|---|---|
| `valueImportSpecifiers` (`classTrendsDraft.not-postable.test.ts:98`, `canvas-client-boundary.transitive.test.ts:91`) | measured 19/46 wrong (section 3.2). Not adapted, not "fixed" - adapting it would be the fourth pattern. |
| `BANNED_IMPORT_PATTERNS` (`gradingResultsHelpersWiring.test.ts:89-94`, `repoGradesFeedbackAndFiles.wiring.test.ts:258-263`) | the mechanism being withdrawn. Deleted, not narrowed. |
| the U3 frozen literal (`gradingResultsHelpersWiring.test.ts:131`) | deleted; the walk is the replacement enforcer (section 4.1). `docs/a23-criteria.md`'s F-4 measured that no second test in the tree asserts it, so changing it breaks no landed gate - re-verified: `grep -rn 'CodeRunResult } from "../code-runner"' src` returns 5 hits, one assertion (this line) and four real imports. |
| `hasDirective` (`canvas-client-boundary.transitive.test.ts:108-110`) | a 200-character text slice. The parsed prologue costs nothing once the AST exists. Measured 0 disagreements today - stated so the swap is not sold as a bug fix. |
| `stripComments` (`repoGradesFeedbackAndFiles.wiring.test.ts:39-41`) | needed only because the old mechanism read comments. The parser does not. Keep it for the OTHER blocks in that file, which this pass does not touch. |

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
| AC-3 guard 1 x five non-`import` constructs x both quotes | SATISFIED | S4/S5/S6/S8 at site 1, both quote styles in probe 1 (C1/C1n/C2/C3/C4) |
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

---

## 11. Residual register

Every entry names an **owner**, an **instrument** and a **step**. Any entry
missing one of the three is a deletion and I would say so; none is. Ids follow
`docs/a23-criteria.md:797-804`: RES-A23-3 and RES-A23-6 stay RETIRED and are
not reissued; new entries take fresh numbers from 9.

| Id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-A23-1 | **RE-BOUND, and it stops being unmeasurable.** The criteria narrowed AC-3/AC-6 to static-literal specifiers because a computed `import(pathVar)` "is caught by no construction available in this repo". Under this shape it IS caught - not resolved, but REPORTED: `scanRuntimeEdges` returns it in `unresolvable` and the guard fails rather than skipping. | Test seat | `docs/a23/a23-reach.mjs` - whole-`src` residue count, measured 0 across 1560 files today; plus sabotage S14, which fires | The leaf's own test asserts `unresolvable` is empty over both root closures, and the oracle round proves S14 red |
| RES-A23-2 | **CLOSED by the widened root set.** `repoGradesPosting.ts:56`'s coverage-by-omission gap disappears when repo-grades roots are tree-derived (4 -> 32). Its `@/lib/grade/postable` import is then walked and is clean, which is the correct verdict. | Orchestrator, to strike from the row | `node docs/a23/a23-walk-probe.mjs` - repo-grades 32 roots, 0 violations | A23's backlog reconciliation |
| RES-A23-4 | `snapshot-grading.structure.test.ts:801` - a fourth instance of the line-filter idiom, different capability boundary, not chartered. Superseded in scope by RES-A23-9, which names the real denominator. | Repo owner (scope call) | the `Grep` tool for `/^\s*import\b/` over `src`, with a matching-string canary | Escalated with RES-A23-9 |
| RES-A23-5 | `next build`'s compile stage is the only TRUE oracle; every guard here is a proxy for it, and this checkout has no `.env` so the gate is the `Compiled successfully` line, never exit 0 (`this-repo.md:52-54`). | Repo owner | `npm run build`, grepping for `Compiled successfully`; then the Vercel deploy log | A23's push |
| RES-A23-7 | **CLOSED as a mechanism.** The `:112-117` sweep's five-hole set is what this design replaces; F-5's live `dynamic(() => import("../MonacoFileEditor"))` is now FOLLOWED (`a23-reach.mjs`: reaches `MonacoFileEditor.tsx` = true). What remains is only the computed-specifier case, which is RES-A23-1. | Orchestrator, to fold into RES-A23-1 at the row | `node docs/a23/a23-reach.mjs` | A23's backlog reconciliation |
| RES-A23-8 | The bash-grep false absence, trap-card candidate. Unchanged; reproduced a third time in this pass (section 1's canary exists because of it). | Orchestrator (`traps-search.md` is not this seat's to write) | the pair: a bash `grep -rn` for the anchored pattern (empty) against the `Grep` tool (finds every site), with a known-positive canary | A23's backlog reconciliation |
| RES-A23-9 | **NEW. The class has FIVE sites, not three** (section 1). Sites 4 and 5 - `ungradedDisclosure.test.ts:495-515`, `course-schedule-docx.test.ts:42-48`, `steps.weekly-announcement-schedule.test.ts:63-69,79-86,100-102` - carry the identical five holes AND are direct-only. Site 4's object is already covered transitively by R1; sites 5a/5b guard a different boundary and are not. Not chartered by A23. | Repo owner (scope call), then orchestrator as a backlog row | the canaried sweep in section 1, re-run; then `walkRuntimeGraph` over each site's roots with that site's own forbidden set | Escalated at A23's disposal; a row filed if the owner widens scope |
| RES-A23-10 | **NEW. R2 is a product call.** R1 binds the hazard, not the name, so if `@/lib/grade` ever stopped reaching a server leaf, R1 would permit importing it where today's name ban would not. One line of the same extractor restores the name ban. Recommendation: take R2. | Repo owner (an `iteration-caps.md` (b) Reduce) | `directRuntimeSpecifiers(root)` asserted not to contain `"@/lib/grade"`, over both root sets | Answered before the wave lands; if the answer is no, `directRuntimeSpecifiers` must not be written |
| RES-A23-11 | **NEW. `verbatimModuleSyntax` is absent** (`cat tsconfig.json`; `isolatedModules: true` at `:13`). Its absence is why an unmarked `import { X }` is over-approximated as a runtime edge. Safe direction, and measured at zero cost today - but enabling it would make the classifier exact. Repo-wide flag change, out of scope for A23. | Repo owner (scope call) | `npx tsc --noEmit --verbatimModuleSyntax` over the tree; the error count is the cost | Escalated with RES-A23-9 |
| RES-A23-13 | **NEW, and it is a gap in THIS document.** The four probes behind sections 3.2, 4.3 and 4.4 are not committed - this pass's write scope was one path - so those quantities are stated with their commands but are not re-runnable from the repo. Same class the criteria's Ruling Y5 already closed once. | Implementer (wave step 0), then orchestrator to confirm at the push | commit `a23-shape-probe.mjs`, `a23-walk-probe.mjs`, `a23-reach.mjs` and `a23-sabotage-probe.mjs` to `docs/a23/` beside the criteria's two, then re-run each from the repo root and diff the output against sections 3.2/4.3/4.4 | Wave step 0, BEFORE any guard file is edited - if a number does not reproduce, this design is wrong and must not be built |
| RES-A23-12 | **NEW. Whether a plain `import ts from "typescript"` resolves under vitest is UNMEASURED** - measuring it needs a file written into `src/`, which this pass may not do. The specified `createRequire` form IS measured working. | Implementer | `npx vitest run src/lib/module-graph/runtime-import-graph.test.ts` with each form | Wave step 2 |

**None of these exist until they are in `docs/BACKLOG.md`**
(`DEV_LOOP.md:79-84`). `docs/backlog.yml` is the orchestrator's file and this
seat may not write it; recording them there is owed at A23's reconciliation.
Specifically owed: **add** RES-A23-9 through RES-A23-13; **re-bind**
RES-A23-1's instrument to the residue check; **strike** RES-A23-2 and
RES-A23-7 as closed by this design, each naming the measurement that closed it.

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
- **Whether the walk's cost stays acceptable as the two directories grow.**
  430ms and 166ms today, against a 70.73s suite. Both precedent walkers carry
  `{ timeout: 30000 }` and one of them has already blown its own timeout once
  (`canvas-client-boundary.transitive.test.ts:132-141`). I specified the
  memo-before-read ordering that fixed it; I did not measure the growth curve.
- **Whether sites 4 and 5 (RES-A23-9) have live defects.** I characterised
  their mechanism by opening them and established that they share the holes. I
  did not run the construct list against them - that is the scope call's job,
  not this pass's.
