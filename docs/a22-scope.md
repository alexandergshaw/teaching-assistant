# A22 - close the `KNOWN_UNREGISTERED_LOCAL_FILES` carve-out

Architecture seat, 2026-09-20. **Round 2.** Row A22 in `docs/backlog.yml:418-428`
(`kind: 'chore'` at `:427`, `area: 'grading-run-survival-and-disclosure'` at
`:426`, the design note at `:428`).

Round 1 was committed at `1406726` and checked NOT CLEAN: 2 blockers, 2 majors,
7 minors. This round disposes them. Section 12.1 is the disposition table over
every round-1 finding; section 12.2 is the original table over the BACKLOG row's
own questions.

This document is the design artifact a `loop-checker` reads before an
implementer does. Sections 1-4 and 11-14 are argument addressed to the checker
and the orchestrator. Sections 5-10 are the build packet.

**Every quantity below was re-measured in this round.** Round 1 adopted one
fact from a sibling document without executing it, and that was blocker B2. The
corrective rule applied here is not "cite more carefully" but "run the thing":
every claim about what an instrument catches is now backed by an executed
mutant, including the claims that say an instrument catches NOTHING.

---

## 0. The disposition, in one paragraph

**Take fix (1): change the import specifier in
`src/app/components/grading-results/classTrendsEntry.ts` from `@/lib/grade`
to `@/lib/grade/types`.** Both symbols it needs are declared in `types.ts`
(measured, section 2.2). **Reject fix (2)** - teaching the guard to classify
type-only imports - as a **(d) Delete** under the caps' repeat rule, with the
enforcer it would have protected named (section 3.2). **Fix (1) is not a
one-line change** and an implementer told otherwise will land a red suite: the
guard scans RAW SOURCE, and `classTrendsEntry.ts:22` carries the banned
character sequence inside a doc comment (section 2.4, executed again this
round). The comment must be reworded in the same edit. **Delete
`KNOWN_UNREGISTERED_LOCAL_FILES` entirely**, and replace the completeness
sweep's containment assertion with **two** comparisons: a SET EQUALITY over the
`./` entries against the directory enumeration, and a FROZEN LITERAL over the
non-`./` entries (section 4(c), rewritten after blocker B1).

**What that construction does and does not make unrepresentable, stated
precisely because round 1 overstated it (minor m4).** It makes three states
unrepresentable: an unregistered local file, a dead `./` registration, and the
silent deregistration of `../GradingResults.tsx`. It does **not** make an
exemption mechanism unrepresentable - a reinstated filter shrinks both sides of
the local equality symmetrically and survives (sabotage S5, executed in section
9). Round 1's section 0 claimed "an exemption is not representable at all";
that sentence was false against its own section 9, and this paragraph replaces
it.

---

## 1. Leverage

**No claim. Trigger fired and recorded, per `docs/loop/leverage.md` and
`docs/loop/seats.md`'s Acceptance-criteria brief ("On a bug fix, a refactor, a
doc correction or an owner verification there is no claim to make; record that
as the fired trigger and move on").**

The fired trigger: A22 builds and changes no capability a user reaches. Its
entire write set is one import specifier, one source comment, and one test
file. `docs/backlog.yml:427` classifies the row `kind: 'chore'`. `DEV_LOOP.md`
lines 103-105 scope the claim to "a capability a user reaches - not a bug fix,
a refactor, a doc correction or an owner verification". Nothing in this row's
diff is reachable from any surface: `classTrendsEntry.ts`'s two exports are
already mounted by `GradingResults.tsx:20,589,591,593` and A22 changes neither
their signatures nor their behaviour.

Recording this line rather than omitting it is itself the obligation - a
sibling artifact on this backlog was docked for leaving the leverage line out
entirely, and a second for labelling it wrongly. An honest "no claim" is a
legitimate result; an absent line is not.

---

## 2. Measured facts

Every quantity below names the command that produced it. Commands were run in
`C:\Users\alexa\OneDrive\Documents\Projects\teaching-assistant` on 2026-09-20,
re-executed in round 2.

### 2.1 Where the carve-out actually lives NOW - the row's own pointer is stale

`docs/backlog.yml:424` (the row's `instrument` field) and `docs/BACKLOG.md:63`
both say the carve-out is in
`src/app/components/grading-results/gradingResultsHelpers.test.ts`. **It is
not.** The tests in that directory were split after the row was written.

```
grep -rn "KNOWN_UNREGISTERED_LOCAL_FILES\|DELIBERATELY_UNREGISTERED" src/ docs/
```

```
src/app/components/grading-results/gradingResultsHelpersWiring.test.ts:84:  const KNOWN_UNREGISTERED_LOCAL_FILES = ["./classTrendsEntry.ts"];
src/app/components/grading-results/gradingResultsHelpersWiring.test.ts:142:      .filter((n) => !KNOWN_UNREGISTERED_LOCAL_FILES.includes(n));
src/lib/client-state-sweep.registry.test.ts:26: * defended reason - in DELIBERATELY_UNREGISTERED below. A cache added later
src/lib/client-state-sweep.registry.test.ts:86:const DELIBERATELY_UNREGISTERED: Record<string, string> = {
src/lib/client-state-sweep.registry.test.ts:99: *  DELIBERATELY_UNREGISTERED above for the opposite decision - this is what
src/lib/client-state-sweep.registry.test.ts:127:      .filter((key) => !(key in DELIBERATELY_UNREGISTERED));
src/lib/client-state-sweep.registry.test.ts:132:        "nor has a defended entry in DELIBERATELY_UNREGISTERED above - decide which it should be"
src/lib/client-state-sweep.registry.test.ts:138:    for (const [key, reason] of Object.entries(DELIBERATELY_UNREGISTERED)) {
```

**The carve-out lives at
`src/app/components/grading-results/gradingResultsHelpersWiring.test.ts:81-84`
(declaration and its explaining comment) and `:142` (the filter that consumes
it).** The whole `"grading-results client files stay client-bundle-safe"`
describe block moved with it: it is now `:48-145` of that file, not of
`gradingResultsHelpers.test.ts`. The moved file's own header
(`gradingResultsHelpersWiring.test.ts:1-10`) records the split and asserts it
was a pure move; `gradingResultsHelpers.test.ts:26` corroborates it from the
other side.

An implementer given the backlog row's address and no re-measurement would
open the wrong file. **This is the row's own `instrument` field being wrong,
and the orchestrator should correct it at the push rather than leaving two
addresses in the tree.**

**Round-2 correction to this section's own citation.** Round 1 gave the
generated mirror as `docs/BACKLOG.md:62`. Line 62 is the table's separator row
(`awk 'NR==62' docs/BACKLOG.md` prints `|---|---|---|---|---|---|---|---|---|---|`);
the A22 row is line 63
(`grep -an "KNOWN_UNREGISTERED_LOCAL_FILES" docs/BACKLOG.md` returns `63:`,
and `wc -l docs/BACKLOG.md` returns 76). This is a **sixth** stale citation,
found in this round and not among the five the checker listed. It is recorded
rather than quietly fixed, because the count of stale citations is itself
evidence about this seat's citation discipline.

### 2.2 Both symbols the file needs ARE in `types.ts` - fix (1)'s precondition holds

```
grep -rn "GradingRun\b\|GradingRunEntry\b" src/lib/grade/types.ts
```

```
308:export interface GradingRun {
321: * One assignment's grading run in workflow context: the GradingRun plus the
329:export interface GradingRunEntry {
333:  run: GradingRun;
```

`GradingRun` is declared at `src/lib/grade/types.ts:308`; `GradingRunEntry` at
`:329`. `classTrendsEntry.ts:25` imports exactly those two and nothing else.

**The row's stated caution about widening `types.ts` does not fire here, and
the reason is structural rather than lucky.** The barrel already sources both
symbols FROM `types.ts` - `src/lib/grade.ts:2` is a single
`export { ... type GradingRun, type GradingRunEntry ... } from "./grade/types";`
line. Changing a consumer's specifier from the barrel to `types.ts` therefore
moves no declaration and adds no import TO `types.ts`. Ruling U3's walled-set
guard (`gradingResultsHelpersWiring.test.ts:122-131`) consequently stays green,
and AC-3 pins that. **What round 1 additionally claimed - that U3 makes the
exemption safe going forward - is false and is corrected in section 3.2.**

For the counterfactual - what a future file in this directory might need that
would NOT be reachable this way:

```
node -e '...'   # parse src/lib/grade.ts's export-from clauses, partition by source module
```

```
symbols reachable via @/lib/grade/types : 22
symbols ONLY via the barrel             : 38
getMimeType, IMAGE_EXTENSIONS, GEMINI_IMAGE_MIME_TYPES, normalizeAreaName,
buildSystemPrompt, extractRubricCriteria, generateRubric,
synthesizeFullCreditChecklist, deriveFullCreditChecklist, generateSampleAnswer,
buildSampleAnswerPrompt, inferFileNameConvention, RubricCriterion,
parseRubricResponse, parseEarnedPossibleScore, pointsWereDeducted,
deriveTotalScore, scaleResultToPoints, formatFeedback, normalizeGeminiError,
extractSubmissions, extractStudentEntries, extractCanvasEntries,
canvasWorkToEntry, truncateSubmission, sleep, getBaseFileName,
removeLastExtension, toPreviewContent, parseSubmissionFileName,
getFileExtension, inferStudentPrefix, groupSubmissionsByStudent,
buildCodeExecutionNote, gradeSubmissions, gradeEntries, gradeCanvasUrl,
GradingRunOptions
```

22 of the barrel's 60 re-exported names are reachable through
`@/lib/grade/types`; 38 are not. This is the number that decides section 4's
"what would change my mind": fix (1) is not universally available, it is
available for THIS file, and a future file needing one of those 38 as a type
would face the same wall. (The 22/38/60 partition was re-derived independently
by the round-1 checker and agreed.)

### 2.3 What the sweep currently enumerates, and what it exempts

Filter replicated verbatim from
`gradingResultsHelpersWiring.test.ts:137-141`:

```
ls src/app/components/grading-results | grep -E '\.(ts|tsx)$' | grep -v '\.test\.ts$' | grep -v '\.test\.tsx$' | grep -v '\.d\.ts$' | sed 's|^|./|'
```

```
./FeedbackExpandModal.tsx
./FilesCell.tsx
./ResultsTableHeaderRow.tsx
./RowFeedbackBoxes.tsx
./SubmittedFilesPanel.tsx
./classTrendsEntry.ts
./gradingResultsHelpers.ts
./icons.tsx
./ungradedDisclosure.ts
./ungradedRowLabel.ts
./useResultsSort.ts
```

Eleven files. `CLIENT_FILES` (`:62-79`) holds ten of them plus
`../GradingResults.tsx`. The one omission is `./classTrendsEntry.ts`, and the
carve-out at `:84` is exactly what keeps that omission from reddening `:143`.

**The brief handed to this seat said a sibling had found this filter missing
`.test.tsx` and `.d.ts`. Measured, that is not true of THIS filter.** Line 139
reads:

```
(n) => /\.(ts|tsx)$/.test(n) && !n.endsWith(".test.ts") && !n.endsWith(".test.tsx") && !n.endsWith(".d.ts")
```

Both exclusions are present. I refused that handed-down fact rather than
adopting it, and the round-1 checker confirmed the refusal against the same
line. What the filter DOES miss is a different thing: the extension test is
`/\.(ts|tsx)$/`, so a `.js`, `.jsx`, `.mjs` or `.cjs` file placed in this
directory is never enumerated and therefore never registered, silently.

**That gap has no live instance, measured this round:**

```
ls -1 src/app/components/grading-results | wc -l
ls -1 src/app/components/grading-results | sed 's/.*\.//' | sort | uniq -c
find src/app/components/grading-results -mindepth 1 -type d | wc -l
```

```
21
     15 ts
      6 tsx
0
```

Twenty-one entries, every one `.ts` or `.tsx`, and no subdirectory for the
non-recursive `readdirSync` at `:137` to miss below it. Recorded as RES-A22-3,
not fixed here, with its step narrowed in section 11 per minor m6.

### 2.4 THE FINDING THAT CHANGES THE SHAPE OF FIX (1)

The banned-import assertion at `:111-116` reads the file's RAW source and
matches the patterns against the whole string:

```ts
const source = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
for (const pattern of BANNED_IMPORT_PATTERNS) {
  expect(source).not.toMatch(pattern);
}
```

It does NOT strip comments, although two other describe blocks in the same
file define a `readStrippedSource` helper for their own patterns
(`:159-163` and `:197-201`, two identical copies).

`classTrendsEntry.ts` contains the banned sequence TWICE, once in a comment:

```
22: // Type-only imports from "@/lib/grade" only - see GradingResults.tsx's own
25: import type { GradingRun, GradingRunEntry } from "@/lib/grade";
```

Round 2 re-ran this against a materialised projection of the post-edit file
rather than against a string substitution, so the measurement is over the exact
bytes section 5 specifies:

```
node /tmp/full.cjs   # apply Edits A and B to a temp copy, run all four BANNED_IMPORT_PATTERNS
```

```
projected classTrendsEntry.ts raw-source matches: 0 (0 = AC-1 GREEN)
current  classTrendsEntry.ts raw-source matches: 1
import-only fix (comment left alone) matches: 1 (>0 = RED, Edit B is load-bearing)
```

**Fix (1) applied to the import alone leaves the file failing the guard.** The
comment is part of the fix, and section 5 specifies it rather than leaving it
to the implementer.

I nearly published the opposite of this in round 1. A first pass used a
non-global `String.replace`, which rewrote the FIRST match - the comment - and
left the real import untouched, producing a reading that looked like "fix 1
does not help at all". Stated because the caps card's entry gate is about the
command, and a plausible command can still be the wrong command.

### 2.5 No registered file is affected by the guard's comment sensitivity today

```
node -e '...'   # run all four BANNED_IMPORT_PATTERNS over every registered CLIENT_FILE, raw source
```

```
ok   ./gradingResultsHelpers.ts
ok   ./RowFeedbackBoxes.tsx
ok   ./SubmittedFilesPanel.tsx
ok   ./icons.tsx
ok   ./useResultsSort.ts
ok   ./ResultsTableHeaderRow.tsx
ok   ./FeedbackExpandModal.tsx
ok   ./FilesCell.tsx
ok   ./ungradedDisclosure.ts
ok   ./ungradedRowLabel.ts
ok   ../GradingResults.tsx
```

Worth noting how narrow that margin is. `ungradedDisclosure.ts:14` and `:18`
both discuss the barrel in prose - `// "@/lib/grade/types" ONLY - never the
"@/lib/grade" barrel or any other` and `// the "@/lib/grade" alias, exactly as
GradingResults.tsx already does for` - and pass only because neither phrasing
puts the word `from` immediately before the quoted specifier. The guard's
comment sensitivity is one word away from firing on a second correct file
already. That is RES-A22-1, and section 5 mitigates it with a note at both
ends rather than by changing the instrument (section 3.4 says why).

### 2.6 Line counts, both instruments - projections now MEASURED, not estimated

`docs/loop/this-repo.md` section 3 records that two line-counting tools here
disagree by 42 on one file, so both are run.

| File | `@(Get-Content <f>).Count` | `wc -l <f>` | Agree |
|---|---|---|---|
| `src/app/components/grading-results/gradingResultsHelpersWiring.test.ts` | 218 | 218 | yes |
| `src/app/components/grading-results/classTrendsEntry.ts` | 46 | 46 | yes |
| `src/app/components/grading-results/gradingResultsHelpers.test.ts` | 505 | 505 | yes |
| `src/app/components/grading-results/gradingResultsHelpersEditState.test.ts` | 311 | 311 | yes |
| `src/app/components/grading-results/gradingResultsHelpers.ts` | 691 | 691 | yes |
| `src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts` | 232 | 232 | yes |
| `src/lib/grade/types.ts` | 382 | 382 | yes |

Both instruments agree on all seven (re-confirmed this round for the two
edited files; the round-1 checker independently confirmed all seven).

**Round 1 estimated the post-edit sizes and was four low on one of them (minor
m3). Round 2 replaces the estimates with a measurement.** The projections were
built by materialising the post-edit files from section 5's literal text into
`%TEMP%\a22proj\` and counting them with both instruments:

| File | Now | Projected | Delta | Instruments |
|---|---|---|---|---|
| `classTrendsEntry.ts` | 46 | **53** | +7 | `@(Get-Content).Count` 53, `wc -l` 53 |
| `gradingResultsHelpersWiring.test.ts` | 218 | **228** | +10 | `@(Get-Content).Count` 228, `wc -l` 228 |

Arithmetic for `classTrendsEntry.ts`: Edit B replaces 3 comment lines with the
10-line block in section 5.1, Edit A is 1-for-1. 46 - 3 + 10 = 53. Round 1 said
"about 49", which was wrong in the direction of understating a growth - the
less safe direction, though at 53 against a 1000-line ceiling it changes no
conclusion.

Arithmetic for the test file: Edit C +1, Edit D -5, Edit F +5 (four comment
lines plus a blank), Edit E replaces 3 lines with 12 (+9). 218 + 1 - 5 + 5 + 9
= 228, confirmed by counting the materialised file.

Neither file is near the 1000-line ceiling enforced by
`src/file-size-ceiling.structure.test.ts` (`LIMIT = 1000` at `:30`), and
`grep -n "grading-results" src/file-size-ceiling.structure.test.ts` returns
nothing, so no file in this directory sits on the `ALLOWED_OVERAGE` ratchet
and none can be tripped by shrinking. **The projections are still projections;
the wave gate measures the real files.**

---

## 3. The design call: fix (1) over fix (2)

### 3.1 What each fix actually is

- **Fix (1) - narrow the SPECIFIER at the call site.** The consumer names
  `@/lib/grade/types`, which `BANNED_IMPORT_PATTERNS` already exempts by
  construction (`:90`, `/from ["']@\/lib\/grade\/(?!types["'])/`, Ruling R
  part 2). The guard keeps its crude whole-file substring form and classifies
  nothing.
- **Fix (2) - teach the GUARD to classify.** The instrument grows a notion of
  "this occurrence is type-only, therefore erased at build, therefore safe".

### 3.2 What the disposal of fix (2) actually is, and the claim round 1 must withdraw

`docs/a12-a13-scope.md:813-828` records Ruling U3 withdrawing
`VALUE_IMPORT_PATTERN` (`/^import(?!\s+type\b)\s/m`) after it was executed
against the real tree and found to miss `export { X } from "..."`,
`export * from "..."`, `require("...")` and `await import("...")`. The
replacement was deliberately NOT a better classifier - it was a walled-set
count (`gradingResultsHelpersWiring.test.ts:122-131`).

**Fix (2) is disposed as (d) DELETE, on the caps' repeat rule alone.**
`iteration-caps.md:40-42` forbids answering a repeat failure by strengthening
the same mechanism; fix (2) is a fourth round of the classifier that U3 already
withdrew. The enforcer the withdrawal protects is named in section 12.2: the
whole-file `BANNED_IMPORT_PATTERNS` scan keeps catching a genuine VALUE barrel
import exactly as it does today, and A22 removes nothing from it.

**WITHDRAWN, and this is the correction blocker B2 demanded.** Round 1's
section 3.2 additionally justified fix (1) as the caps' third chain-ender - a
CONSTRUCTION that makes the bad state unrepresentable - on the grounds that
"`types.ts` is itself walled by U3, so the exemption cannot quietly become
false." **That is measured FALSE.** U3's filter
(`gradingResultsHelpersWiring.test.ts:127-129`) is

```ts
const fromLines = source
  .split(/\r?\n/)
  .filter((line) => line.includes(' from "') && !/^\s*(\*|\/\/)/.test(line.trim()));
expect(fromLines).toEqual(['import type { CodeRunResult } from "../code-runner";']);
```

`line.includes(' from "')` is **double quotes only**. Executed this round
against the REAL `src/lib/grade/types.ts`, appending one hazard line at a time
and re-running the frozen-literal comparison:

```
node /tmp/u3.cjs   # filter replicated verbatim from :127-129; frozen literal from :130
```

```
baseline real types.ts fromLines: ["import type { CodeRunResult } from \"../code-runner\";"]
baseline GREEN (equals frozen literal)? true
H1 double-quoted VALUE server import: fromLines=2 -> U3 RED (caught)
H2 SINGLE-quoted VALUE server import: fromLines=1 -> U3 GREEN (ESCAPES)
H3 require() of the server module: fromLines=1 -> U3 GREEN (ESCAPES)
H4 dynamic await import(): fromLines=1 -> U3 GREEN (ESCAPES)
H5 SINGLE-quoted export *: fromLines=1 -> U3 GREEN (ESCAPES)
```

**Four of five hazards escape.** Two of the four constructs that got
`VALUE_IMPORT_PATTERN` withdrawn - `require()` and dynamic `import()` - still
escape its replacement, and single-quoting defeats the other two. The claim at
`docs/a12-a13-scope.md:863-864` that the replacement "can only be defeated by
an unusually-formatted comment" is FALSE, and round 1 adopted it without
running it. That adoption is the defect; the corrective rule is section 2's
opening paragraph.

**This matters because `types.ts` is not a pure types file.** It ships value
exports today:

```
grep -n "^export \(const\|function\|class\|async function\)\|^export default" src/lib/grade/types.ts
```

```
3:export const MAX_NESTED_ZIP_DEPTH = 3;
11:export const GRADING_FAILURE_PREFIX = "This submission could not be graded: ";
15:export const RESUBMIT_NOTICE =
28:export function composeOverallComment(
93:export const GRADE_DETERMINATIONS: readonly GradeDetermination[] = Object.keys(
113:export function coerceGradeDetermination(value: unknown): GradeDetermination | undefined {
176:export function isUngraded(result: GradeResult): result is UngradedResult {
180:export function gradedResults(results: readonly GradeResult[]): GradedResult[] {
184:export function ungradedResults(results: readonly GradeResult[]): UngradedResult[] {
285:export function coerceUngradedOutcome(value: unknown): UngradedOutcome | undefined {
```

**Ten, not five.** The orchestrator's ruling cited
`docs/a12-a13-scope.md:820-824` for "five value exports"; that document names
five (`composeOverallComment`, `RESUBMIT_NOTICE`, `isUngraded`,
`gradedResults`, `ungradedResults`) and the tree has ten. I am reporting the
conflict rather than adopting either number silently, per this seat's standing
instruction. The direction is toward the ruling's conclusion, not against it:
`types.ts` is twice as much of a value module as the cited document says.

**So what IS fix (1), if not a construction?** It is a **scope reduction**, and
the difference is load-bearing:

- A construction makes the bad state unrepresentable. Fix (1) does not. A value
  import of `@/lib/grade/types` from `classTrendsEntry.ts` remains
  representable, passes `BANNED_IMPORT_PATTERNS`, passes the not-postable
  walker and passes `tsc` (sabotage S10, unchanged and still uncredited).
- What fix (1) does is remove THIS file from the classifier's scope entirely,
  onto a path the guard already exempts by a literal specifier match. The
  exemption's soundness rests on a separately measured fact, not on U3:
  `src/lib/grade/types.ts:1` is that file's only import and it is type-only, so
  `@/lib/grade/types` transitively reaches only `../code-runner`, which is on
  no forbidden prefix.
- That fact is TRUE TODAY and is held by NO instrument that covers all the ways
  of making it false - four of the five hazards above are exactly those ways.
  **RES-A22-5 records that, with an owner, an instrument and a step.**

**Fix (1) is still the right call, and B2 does not change that.** Fix (2) is
independently a repeat of a disposed class, and A22 creates no new exposure:
the import is type-only and erased at build both before and after, so the
post-A22 tree is no more reachable from server-only code than the pre-A22 tree.
What changes is the argument's honesty - A22 narrows a specifier onto a wall it
does not itself verify, and says so.

### 3.3 And the classifier is already broken here, measured - now backlog row A23

This repo does have a type-only classifier, in the adjacent directory:
`src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts:295-297`
filters to lines matching `/^\s*import\b/` and not `/^\s*import\s+type\b/`,
then tests the banned patterns against those lines. (Round 1 cited `:287-291`;
that was stale - major M1.)

Executed against three fixtures:

```
node -e '...'   # replicate the repo-grades line filter, run the banned patterns over three import shapes
```

```
single-line VALUE import flagged (want true) : true
MULTI-LINE VALUE import flagged (want true)  : false
inline all-type import flagged (want false)  : true
```

A **multi-line** value import escapes entirely, because the `from` clause sits
on a line that does not begin with `import`. That is a FALSE NEGATIVE in a live
guard whose whole purpose is catching the one defect `next build` alone
catches. And `import { type A, type B } from "@/lib/grade"` - an all-type
inline-modifier import, erased at build exactly like `import type` - is
flagged, a false positive.

**This execution reproduced byte-for-byte in the round-1 check, and it now has
its own backlog row: A23, filed at `ef99101`.** A22 does not own that file and
this document does not restate the row. One correction A22 owes the receiving
row, because round 1's residual would have mis-specified it:

> Round 1 said to freeze all three fixtures as canaries. **Fixture 3 currently
> pins WRONG behaviour.** The receiving row must state the DIRECTION each
> fixture pins: fixture 1 (single-line value import flagged) pins CORRECT
> behaviour and is a regression canary; fixture 2 (multi-line value import NOT
> flagged) pins the FALSE NEGATIVE and must go RED against today's filter
> before any fix, as a positive control; fixture 3 (inline all-type import
> flagged) pins the FALSE POSITIVE and must be asserted in the FIXED direction
> (not flagged), which is also RED today. Freezing all three as-is would
> immortalise two defects as expectations.

Note by contrast that the grading-results guard under A22 CANNOT have the
multi-line hole, precisely because it is crude - it matches the whole file
string, so a `from` clause on any line is seen. Fix (2) would have to be both
whole-file AND syntax-aware, which in practice means the TypeScript compiler
API. That is a large mechanism for a population of one.

### 3.4 The rejected companion: stripping comments instead of rewording one

Section 2.4 shows the comment must stop matching. There are two ways.

**Rejected: make the guard comment-insensitive.** Two variants were executed.
Reusing the file's own `readStrippedSource` helper
(`.replace(/\/\*[\s\S]*?\*\//g,"").replace(/\/\/.*$/gm,"")`) gives the right
answer for `/* c */ import { x } from "@/lib/grade";` (still flagged) but the
WRONG answer for a line where a string containing `//` precedes the import:

```
node -e '...'   # run the in-file stripper over all 12 files, then over two hazard fixtures
```

```
  /* c */ import banned  -> 1 (want 1)
  url-then-import same line -> 0 (want 1)
  comment-only banned line -> 0 (want 0)
```

A whole-comment-line filter (`/^\s*(\/\/|\/\*|\*)/`, the U3 idiom from `:129`)
inverts which hazard it fails: it handles the URL case but drops a
`/* c */ import ...` line entirely.

Both variants introduce a FALSE-NEGATIVE direction into a guard that has none
today. This repo's recorded failure mode is "an instrument that reads clean
while measuring less than it claims", and the benefit purchased is prose
freedom in comments. That trade is the wrong way round. The round-1 checker
confirmed this rejection.

**Chosen: reword the one comment, and document the constraint at both ends.**
The residual failure mode is a FALSE POSITIVE - loud, immediate at the wave
gate, trivially fixed, and safe in direction. It is recorded as RES-A22-1
rather than machined away.

I record this as a deliberate acceptance of a sharp edge, not as an absence of
one. The counter-argument is that making source prose bend to an instrument is
the seam pointing the wrong way. My answer is that the guard's crudeness is its
only defence against the section-3.3 class, and one reworded sentence is a
cheaper price than a false-negative channel.

---

## 4. Should `KNOWN_UNREGISTERED_LOCAL_FILES` continue to exist?

**Recommendation: DELETE it, and go further - replace containment with two
comparisons that between them pin the whole array.**

Three reasons, in order of weight.

**(a) It is not the idiom it claims to follow.** The carve-out's comment cites
this repo's `DELIBERATELY_UNREGISTERED` precedent. That structure is
`Record<string, string>` - key to a DEFENDED REASON -
(`src/lib/client-state-sweep.registry.test.ts:86-95`) and a dedicated test
iterates it and asserts on each reason (`:136-142`):
`expect(reason.trim().length, ...).toBeGreaterThan(10)` plus
`expect(known.has(key), "...is listed as a deliberate exception but no longer
exists").toBe(true)` - so a stale exemption for a deleted cache FAILS.
`KNOWN_UNREGISTERED_LOCAL_FILES` is a bare `string[]` whose reason floats in a
comment at `:81-83` and is asserted on by nothing; a stale entry for a deleted
file would sit there forever, green. It is a weaker imitation of the idiom,
and the gap is exactly the "instrument that reads clean while measuring less
than it claims" class. (Round 1 cited `:86-96` and `:137-143` for those two
spans; both were one off - major M1. The declaration opens at `:86` and closes
at `:95`; the `it(` opens at `:136` and closes at `:142`.)

**(b) An empty list with a live `.filter()` reads as sanctioned capacity.** The
mechanism survives its one justified use and becomes a one-line, review-free
way to make any future red go away. The row's own text names this ("an empty
escape hatch invites use") and I agree with it.

**(c) Deletion can be made stronger than deletion - but round 1's version of
this left the highest-value entry unpinned. BLOCKER B1.**

Today `:143` asserts containment:

```ts
for (const name of localFiles) expect(CLIENT_FILES).toContain(name);
```

Containment permits a stale `CLIENT_FILES` entry for a file that no longer
exists, and it is the shape an exemption list attaches to. Round 1 replaced it
with a set equality over the `./`-prefixed entries only. **That equality never
mentions `../GradingResults.tsx`, which is therefore in NO SET ON EITHER
SIDE.** Executed:

```
node /tmp/b1.cjs   # round-1 Edit E, with and without the ../ entry
```

```
CLIENT_FILES post-Edit-C length: 12 | localFiles: 11
Edit E (round 1) with ../GradingResults.tsx PRESENT : GREEN
Edit E (round 1) with ../GradingResults.tsx DELETED : GREEN - HOLE CONFIRMED
  it.each case count falls from 12 to 11
```

Deleting that one entry keeps every assertion green; `it.each` simply drops
from 12 cases to 11 and all pass. And **nothing else in the repo guards that
file against a banned import.** There are exactly two banned-import guards in
the tree:

```
grep -rn "BANNED_IMPORT_PATTERNS" src --include=*.ts --include=*.tsx
```

```
src/app/components/grading-results/gradingResultsHelpersWiring.test.ts:88,104,113
src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts:258,281,283,299
```

and the repo-grades list is four repo-grades files
(`REPO_GRADES_CLIENT_FILES` at `:265-270`: `RepoGradeCellControl.tsx`,
`repoGradesCellEdits.ts`, `useRepoGradesGradingActions.ts`,
`useRepoGradesBulkGrade.ts`) - not `GradingResults.tsx`. Every other test that
reads `GradingResults.tsx` as source text
(`grep -rn "GradingResults\.tsx" src --include=*.test.ts --include=*.test.tsx`)
asserts WIRING patterns - `<FilesCell`, `sortedResults.map(`,
`checkRowPostability`, `formatScorePercent` - never an import ban.

So round 1's own sentence, "you cannot leave a dead registration behind", was
measurably false for exactly one entry, and it is the entry whose Pages Router
bundle incident this whole guard exists to prevent
(`gradingResultsHelpersWiring.test.ts:48-61`). The hole pre-dates A22, but A22
is the round rewriting this assertion specifically to close this family of
hole.

**THE FIX, and why this shape rather than the other one the ruling offered.**
Add a SECOND assertion pinning the non-local entries to a frozen literal,
rather than folding them into the existing equality:

```ts
expect(CLIENT_FILES.filter((p) => !p.startsWith("./"))).toEqual(["../GradingResults.tsx"]);
```

The reason is that the two halves have **different oracles, and mixing them
would weaken the better one.** The `./` half's expected value is COMPUTED from
the directory by `readdirSync`, so it is self-maintaining: adding a file to
this directory moves the expectation and the requirement together, which is
the whole point of a completeness sweep. The `../` half has no directory to
enumerate - `..` is `src/app/components/`, which holds many files that are
correctly NOT in this guard's scope - so enumerating it would be wrong and its
expected value must be a FROZEN LITERAL, maintained by hand. Folding a frozen
literal into a `toEqual` whose other operand is computed would (i) make one
failure message cover two unrelated causes, and (ii) couple a legitimate
directory change to an unrelated freeze, so that adding a file to
`grading-results/` reds an assertion about `GradingResults.tsx`. Two
assertions, two oracles, two failure messages.

The frozen literal is deliberate friction in the `DELIBERATELY_UNREGISTERED`
direction: adding a legitimate second non-local entry is a real design decision
and must edit that line, which is precisely the "visible, arguable diff in a
guard file" property reason (b) asks for.

Executed, both directions:

```
Proposed non-local equality, present:              GREEN
Proposed non-local equality, deleted:              RED - HOLE CLOSED
Proposed non-local equality, extra '../Foo.tsx':   RED - caught
```

And the whole post-A22 assertion pair against every mutant (section 9's table
is generated from this run):

```
node /tmp/mut.cjs
```

```
BASELINE post-A22 (all edits applied)    {"localEquality":"GREEN","nonLocalFreeze":"GREEN","overall":"GREEN"}
S4  Edits A,B,D,E but NOT C              {"localEquality":"RED","nonLocalFreeze":"GREEN","overall":"RED"}
S5  carve-out reinstated + entry removed {"localEquality":"GREEN","nonLocalFreeze":"GREEN","overall":"GREEN"}
S6  fabricated ./nonexistent.ts          {"localEquality":"RED","nonLocalFreeze":"GREEN","overall":"RED"}
S7  unregistered scratch.ts on disk      {"localEquality":"RED","nonLocalFreeze":"GREEN","overall":"RED"}
S8  unregistered scratch.mjs on disk     {"localEquality":"GREEN","nonLocalFreeze":"GREEN","overall":"GREEN"}
S11 ../GradingResults.tsx DELETED (B1)   {"localEquality":"GREEN","nonLocalFreeze":"RED","overall":"RED"}
S12 second non-local ../Foo.tsx added    {"localEquality":"GREEN","nonLocalFreeze":"RED","overall":"RED"}
```

**What the pair makes unrepresentable, stated exactly** (and this replaces
round 1's overclaim, minor m4): an unregistered local file (S4, S7), a dead
`./` registration (S6), a silently deregistered non-local entry (S11), and an
undeclared second non-local entry (S12). **Still representable:** a reinstated
exemption filter that shrinks both sides of the local equality symmetrically
(S5), and a non-`.ts`/`.tsx` file in the directory (S8, RES-A22-3). Both are
named rather than papered over.

**What would change my mind, stated concretely rather than as a hedge.** A
second file in this directory that legitimately cannot route through
`@/lib/grade/types` - i.e. one needing a type among the 38 barrel-only names
measured in section 2.2 (`GradingRunOptions` and `RubricCriterion` are the two
real candidates, both types, both declared outside `types.ts`). If that lands,
an exemption becomes necessary, and at that point it must be rebuilt in the
REAL `DELIBERATELY_UNREGISTERED` shape - `Record<string, string>`, with a test
that asserts every key still names an existing file and every reason is
non-trivial - not as a bare array. A second thing that would change my mind:
if moving one of those 38 names into `types.ts` were shown to be safe, the
cheaper answer would be to widen the type surface once rather than to re-open
the exemption; that is a decision for whoever hits it, **and section 3.2's
measurement changes what "safe" has to mean there - U3 is not the constraint
round 1 said it was, so RES-A22-5 must be settled first.**

---

## 5. The build packet - exact edits

Two files, one wave. Section 6 explains why they cannot be split.

**ORDER DEPENDENCY, and it is not optional (minor m1).** Every line number in
this section is PRE-EDIT, against the files as they stand at commit `ef99101`.
Apply the edits to each file in DESCENDING line order, so no earlier edit
shifts a later one's address:

| File | Order | Edits, by pre-edit line |
|---|---|---|
| `classTrendsEntry.ts` | 1st then 2nd | **A** (`:25`), then **B** (`:22-24`) |
| `gradingResultsHelpersWiring.test.ts` | 1st to 4th | **E** (`:135` title and `:141-143` body), then **F** (insert above `:86`), then **D** (delete `:81-85`), then **C** (insert after `:77`) |

Round 1 cited `:142`/`:143` for Edits D and E without saying this, so an
implementer working top-down would have hit shifted lines. The literal text
below makes every edit recoverable by search, but the order removes the need.

### 5.1 `src/app/components/grading-results/classTrendsEntry.ts`

**Edit A - the import, line 25.**

From:

```ts
import type { GradingRun, GradingRunEntry } from "@/lib/grade";
```

To:

```ts
import type { GradingRun, GradingRunEntry } from "@/lib/grade/types";
```

Keep `import type`. It is still the correct form and the `not-postable`
walker depends on it (section 7).

**Edit B - the comment, lines 22-24.** The existing three lines are:

```
// Type-only imports from "@/lib/grade" only - see GradingResults.tsx's own
// header comment on gradingResultsHelpers.ts for why a VALUE import from
// that barrel is a client-bundle hazard this file must never introduce.
```

Replace with prose that (i) never places the word `from` immediately before
the quoted barrel specifier, (ii) still explains the hazard, and (iii) warns
the next editor. This exact 10-line text is what section 2.6's measurement of
53 lines was taken over; the implementer may reword it provided constraints
(i)-(iii) hold and AC-1 stays green, and the wave gate re-measures either way:

```
// Imports the two GradingRun types through the narrow type surface,
// "@/lib/grade/types", and never through the "@/lib/grade" barrel: a VALUE
// import of that barrel is a client-bundle hazard (see GradingResults.tsx's
// own header comment on gradingResultsHelpers.ts for the shipped incident).
//
// NOTE FOR FUTURE EDITORS: the client-bundle guard in
// gradingResultsHelpersWiring.test.ts matches RAW SOURCE, comments included.
// Do not write the word "from" immediately before the quoted barrel
// specifier anywhere in this file - name the barrel without that preceding
// word, as this comment does.
```

Do not touch lines 1-21 or 26-46. In particular the canary-3 note at `:16-20`
is load-bearing for `classTrendsDraft.not-postable.test.ts` and must survive.

### 5.2 `src/app/components/grading-results/gradingResultsHelpersWiring.test.ts`

**Edit E - retitle and replace the sweep's assertion.** Two parts, both in the
Ruling R part 4 block.

*E1, the title at `:135`.* From:

```ts
  it("CLIENT_FILES lists every non-test .ts/.tsx file in this directory (Ruling R part 4)", () => {
```

To:

```ts
  it("CLIENT_FILES lists EXACTLY this directory's non-test .ts/.tsx files, plus exactly the known non-local entry (Ruling R part 4; A22)", () => {
```

*E2, the body at `:141-143`.* Replace these three lines -

```ts
      .map((n) => `./${n}`)
      .filter((n) => !KNOWN_UNREGISTERED_LOCAL_FILES.includes(n));
    for (const name of localFiles) expect(CLIENT_FILES).toContain(name);
```

with these twelve:

```ts
      .map((n) => `./${n}`);
    expect(localFiles.slice().sort()).toEqual(
      CLIENT_FILES.filter((p) => p.startsWith("./")).slice().sort()
    );
    // A22 (B1): the non-local entries have no directory to enumerate, so no
    // computed oracle is available for them - they are pinned by a FROZEN
    // LITERAL instead. Without this line, deleting "../GradingResults.tsx"
    // from CLIENT_FILES leaves the equality above GREEN and deregisters the
    // one file whose Pages Router bundle incident this block exists for
    // (:48-61). Adding a second non-local entry is a deliberate act and
    // must edit this line.
    expect(CLIENT_FILES.filter((p) => !p.startsWith("./"))).toEqual(["../GradingResults.tsx"]);
```

Note the semicolon moves onto the `.map` line. **Lines `:136-140` are not
touched** - in particular the `/\.(ts|tsx)$/` filter expression at `:139` is
never retyped, because a retyped regex is a defect channel this repo has paid
for twice (the `/s` dotAll flag, `TS1501`).

**Edit F - the constraint note.** Insert **immediately above line 86** - that
is, above the `// Ruling R part 2:` comment, NOT above the
`BANNED_IMPORT_PATTERNS` declaration at `:88`. Round 1 said "immediately above
`:88`", which would have split the Ruling R part 2 comment at `:86-87` from
the declaration it explains (minor m2). Four comment lines plus one blank:

```ts
  // A22: this scan reads RAW SOURCE - comments included, nothing stripped.
  // A banned specifier appearing only in a comment reds the file. The
  // accepted mitigation is prose discipline in the scanned files, not
  // comment stripping (RES-A22-1, docs/a22-scope.md section 3.4).

```

**Edit D - delete the carve-out.** Remove lines **81-85** entirely: the
three-line `KNOWN GAP` comment (`:81-83`), the
`KNOWN_UNREGISTERED_LOCAL_FILES` declaration (`:84`), and the blank line at
`:85` (removing only `:81-84` would leave two consecutive blank lines, since
`:80` is already blank). After this edit
`grep -n "KNOWN_UNREGISTERED" src/app/components/grading-results/gradingResultsHelpersWiring.test.ts`
must return nothing - verified 0 occurrences in the materialised projection.

**Edit C - register the file.** Insert after the `./ungradedRowLabel.ts` entry
(`:77`), inside `CLIENT_FILES` (`:62-79`):

```ts
    "./classTrendsEntry.ts", // A22: the ClassTrendsPanel adapter, narrowed off the barrel onto @/lib/grade/types.
```

**Do not** add a `readStrippedSource` call to the `it.each(CLIENT_FILES)`
block. That is the rejected companion in section 3.4 and is out of scope; if a
later round wants it, it goes through RES-A22-1.

**Do not** touch `:118-131` (Ruling U3's comment and assertion). Section 3.2
measures a real hole there, and closing it is RES-A22-5's row, not A22's - see
section 11 for why folding it in here would be wrong.

---

## 6. Why these two files are ONE wave and cannot be split

Each edit alone leaves the tree in a state a gate would accept or reject for
the wrong reason:

- **5.1 alone** (specifier plus comment, carve-out left in place) leaves the
  suite GREEN and `classTrendsEntry.ts` still exempted, so it is still scanned
  by nothing. This is the silent-success direction and it is the one that
  matters: a wave that did only this would report "A22 done" with the hole
  intact.
- **5.2 alone** (register the file, delete the carve-out, import unchanged)
  reds `it.each(CLIENT_FILES)` on the real import at `:25`. The new equality
  assertion is satisfied - the file IS registered - but the per-file scan
  fails. A legitimate red, and a broken tree, but not a silent one.

`docs/loop/seats.md`'s non-negotiable - every wave's file list must contain the
file that CALLS each new export - is satisfied vacuously: A22 adds no export.
`classTrendsEntry.ts`'s two existing exports already have their caller at
`src/app/components/GradingResults.tsx:20` (import) and `:589,591,593` (both
call sites), unchanged by this row.

---

## 7. `owns`, derived and pasted

### 7.1 Files the implementer WRITES

```
src/app/components/grading-results/classTrendsEntry.ts
src/app/components/grading-results/gradingResultsHelpersWiring.test.ts
```

Nothing else. `git status --short` after the wave must show exactly these two
paths (plus this document, already committed separately).

### 7.2 Files that read the written files, derived with a stated command

Command:

```
grep -rln "classTrendsEntry\|gradingResultsHelpersWiring\|grading-results" src --include=*.test.ts --include=*.test.tsx | sort
```

Output, pasted in full:

```
src/app/actions/githubRepoGrading.wiring.test.ts
src/app/components/GithubGradingPanel.wiring.test.ts
src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts
src/app/components/grading-results/classTrendsEntry.test.ts
src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts
src/app/components/grading-results/gradingResultsHelpers.test.ts
src/app/components/grading-results/gradingResultsHelpersEditState.test.ts
src/app/components/grading-results/gradingResultsHelpersWiring.test.ts
src/app/components/grading-results/ungradedDisclosure.test.ts
src/app/components/grading-results/ungradedRowLabel.test.ts
src/app/components/repo-grades/repoGrades.wiring.test.ts
src/app/components/repo-grades/repoGradesCellEdits.test.ts
src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts
src/app/components/ui/modalAdoption.wiring.test.ts
src/lib/client-state-sweep.test.ts
src/lib/github-grading-run-store.test.ts
src/lib/github.digest.test.ts
src/lib/grade.strip.test.ts
src/lib/grade/engine.test.ts
src/lib/grading-drafts.test.ts
```

That command matches the directory name too, so it is deliberately over-broad.
The ones that actually read a WRITTEN file, narrowed by
`grep -rn "classTrendsEntry" src --include=*.test.ts --include=*.test.tsx`:

```
src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts:210
src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts:222
src/app/components/grading-results/classTrendsEntry.test.ts:1
src/app/components/grading-results/classTrendsEntry.test.ts:5
src/app/components/grading-results/gradingResultsHelpersWiring.test.ts:81
src/app/components/grading-results/gradingResultsHelpersWiring.test.ts:84
```

| Reader | How it reads a written file | Classification | Direction it can go wrong |
|---|---|---|---|
| `src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts` | **AS SOURCE TEXT.** `:222` makes `classTrendsEntry.ts` a canary-3 walk root; `walkForForbiddenImports` `readFileSync`s it and follows VALUE imports only (`valueImportSpecifiers` at `:98-100`, which skips `match[1] === "type "`). | **adopted - must stay green, never edited** | Its `IMPORT_RE` (`:96`) is `/^\s*(?:import\|export)\s+(type\s+)?(?:[\w*{}\s,]*?)\s*from\s+"([^"]+)"/gm`. It is **double-quote-blind and MULTI-line**: `\s` and the `[\w*{}\s,]*?` class both match newlines, so a clause split across lines IS matched. Round 1 called it "single-line", which was wrong in the conservative direction and changed no conclusion (minor m5). Edit A keeps `import type`, double quotes and one line, so the walker classifies it identically before and after. **If an implementer drops the `type` keyword, the walker resolves `@/lib/grade/types` and descends into it; `types.ts:1` imports `../code-runner`, which is on NO forbidden prefix, so this test stays GREEN on that mistake. It is not a backstop for AC-1.** |
| `src/app/components/grading-results/classTrendsEntry.test.ts` | Value-imports the module (`:5`). Not source text. | adopted - must stay green | A specifier change is invisible to it. It cannot detect AC-1 either way. |
| `src/app/components/GradingResults.tsx` | Value-imports the module (`:20`). Not a test. | checked-safe, not edited | `tsc` covers it. |
| `src/file-size-ceiling.structure.test.ts` | Reads every file under `src/` for its line count. | adopted | Only a growth past 1000 reds it; section 2.6 measures 53 and 228. |
| `src/source-bytes.structure.test.ts` | Reads every file under the repo root (`ROOT = process.cwd()`, `SKIP_DIRS` at `:38`) with `TEXT_EXTENSIONS` including `.md` (`:39`). **Reads this document too.** | adopted | A BOM or a stray control byte in either source file OR in `docs/a22-scope.md` reds it. |
| `src/lib/no-emojis.test.ts` | `roots = ["src", "docs"]` (`:243`). **Reads this document too.** | adopted | An emoji anywhere reds it. |
| `src/lib/client-state-sweep.registry.test.ts` | Walks all of `SRC_DIR` with `readdirSync` (`:49`) looking for module-scope caches; reads `classTrendsEntry.ts` as text. | adopted | Neither edit adds a module-scope binding, so its `EXPECTED_REGISTERED_FILES` equality (`it(` at `:116`, assertion at `:120`) is untouched. |

No test in the tree reads `gradingResultsHelpersWiring.test.ts` as source text;
the only external mention is a prose reference in a comment at
`src/app/components/grading-results/gradingResultsHelpers.test.ts:26`
(`grep -rn "gradingResultsHelpersWiring" src docs` minus self-matches), which
asserts nothing.

---

## 8. Acceptance criteria

Each names the OBJECT under comparison, the INSTRUMENT that produces each
quantity, and the DIRECTION of failure.

**Round 1's AC-2 was deleted (major M2) and the remaining ids were re-derived
LAST, after section 9's table was rewritten.** The old-to-new map is in section
12.1.

**AC-1. `classTrendsEntry.ts` carries no banned specifier, in code or in
prose.**
Object: the raw UTF-8 contents of
`src/app/components/grading-results/classTrendsEntry.ts`.
Instrument: `BANNED_IMPORT_PATTERNS` (all four,
`gradingResultsHelpersWiring.test.ts:88-93`) applied by the
`it.each(CLIENT_FILES)` block at `:111-116` once Edit C registers the file.
Direction of failure: RED if ANY of the four patterns matches anywhere in the
file; GREEN if none does. Today's value is one match (section 2.4); the
required post-state is zero, measured at zero on the materialised projection.

**AC-2. The sweep pins the WHOLE of `CLIENT_FILES` - no unregistered file, no
dead registration, and no silently deregistered non-local entry.**
Object: two pairs. (i) the directory enumeration at `:137-141` against the
`./`-prefixed subset of `CLIENT_FILES`; (ii) the non-`./` subset of
`CLIENT_FILES` against the frozen literal `["../GradingResults.tsx"]`.
Instrument: the two assertions of Edit E2.
Direction of failure: RED if the directory holds a `.ts`/`.tsx` non-test file
absent from `CLIENT_FILES`; RED if `CLIENT_FILES` holds a `./` entry with no
corresponding file; RED if the non-local subset is anything other than exactly
`["../GradingResults.tsx"]` - which covers both deletion (blocker B1) and
undeclared addition. A name-shaped `grep -n "KNOWN_UNREGISTERED"` returning
zero lines is a SUPPLEMENTARY check only and must not stand in for this one - a
rename would defeat it, and this seat's own standing warning is that a
name-shaped grep does not answer a channel-shaped question.

**AC-2 is also the enforcer that AC-2-of-round-1 was protecting.** That
criterion was `expect(CLIENT_FILES).toContain("./classTrendsEntry.ts")`, added
on the reasoning that AC-1 is vacuously satisfiable by an unregistered file.
The reasoning is true of AC-1 alone and false once the equality exists, because
the equality forces membership by construction. Executed over every state:

```
node -e '...'   # AC-2-of-round-1 vs AC-2-of-round-2 across four tree states
```

```
today (pre-A22): entry absent, file on disk    old AC-2: RED    new AC-2: RED
post-A22 correct                               old AC-2: GREEN  new AC-2: GREEN
entry removed, file still on disk              old AC-2: RED    new AC-2: RED
FILE DELETED from disk AND from CLIENT_FILES   old AC-2: RED    new AC-2: GREEN
```

The only state where the deleted criterion fires alone is the last one - a
legitimate deletion of `classTrendsEntry.ts` - where it is a FALSE POSITIVE
demanding the registration of a file that no longer exists. It was not merely
redundant; it was redundant in the green direction and wrong in the red one.

**AC-3. Ruling U3's walled-set guard is untouched and still green.**
Object: `src/lib/grade/types.ts`'s non-comment lines containing ` from "`.
Instrument: `gradingResultsHelpersWiring.test.ts:122-131`, frozen literal
`['import type { CodeRunResult } from "../code-runner";']`.
Direction of failure: RED if the array is anything other than that exact
one-element list. A22 must not edit `types.ts` at all; this criterion is the
proof that fix (1) did not smuggle a widening in. **Scope note, after B2: this
criterion proves A22 did not WIDEN `types.ts`. It does not prove `types.ts` is
walled - section 3.2 measures four constructs that pass it. Nothing in A22 may
be credited with that stronger property; RES-A22-5 owns it.**

**AC-4. The whole suite stays green and the count does not shrink.**
Object: `npm test` totals.
Instrument: vitest, `Test Files N passed (N)` / `Tests M passed (M)`, exit 0.
Direction of failure: any failure, and separately any DROP in M relative to
the pre-change run measured in the same session - a deletion that removes
assertions passes a naive "all green" reading. Baseline M must be captured
BEFORE the wave, by the wave gate, not quoted from `this-repo.md` (whose
20,200 is dated 2026-09-13 and has moved). **Expected direction for A22: M
RISES by exactly 1.** Edit D removes no `it`; Edit E2 adds a second assertion
inside an existing `it`, which does not move M; Edit C adds one `it.each` case,
taking that block from 12 to 11-plus-1 - measured at 12 cases post-edit against
11 today. A drop, or a rise other than 1, is a finding.

**AC-5. The three other gates pass at their documented shapes.**
Object: `npx tsc --noEmit`, `npm run lint`, `npm run build`.
Instrument and direction: tsc - any output at all is failure; lint - exit 0
with the four baseline warnings named in `this-repo.md` section 1, a fifth is
a regression; build - the presence of the `Compiled successfully` line, NOT
the exit code, which is expected to be 1 in this envless checkout.

**AC-6. The document gates pass over this file.**
Object: `docs/a22-scope.md`.
Instrument: `src/lib/no-emojis.test.ts` (`roots = ["src","docs"]`, `:243`) and
`src/source-bytes.structure.test.ts` (`ROOT = process.cwd()`, `.md` in
`TEXT_EXTENSIONS` at `:39`).
Direction of failure: RED on any emoji, any BOM, or any control byte other
than TAB/LF/CR.

---

## 9. Sabotage per criterion

`docs/loop/seats.md`'s Test-seat brief requires each assertion name the
mutation that breaks it, and requires saying which mutants are expected NOT to
discriminate. Restore from a COPY, never `git checkout --` (that reverts to
the index and destroys uncommitted work in the same file).

Every row's Expected result below was EXECUTED this round against the real
directory and the real `types.ts`, not predicted. The script outputs are in
sections 3.2 and 4.

| # | Criterion | Mutation | Expected result | Discriminates? |
|---|---|---|---|---|
| S1 | AC-1 | Revert Edit A only: put `@/lib/grade` back on `classTrendsEntry.ts:25`, leaving the reworded comment. | `it.each` case `./classTrendsEntry.ts` RED on pattern 0. | YES |
| S2 | AC-1 | Revert Edit B only: restore the original comment on line 22, leaving the narrowed import. | RED on pattern 0. Executed: raw-source match count 1. **This mutant proves section 2.4's finding is load-bearing** - without it, a reader could believe Edit B is cosmetic. | YES |
| S3 | AC-1 | Change `:25` to `from "@/lib/grade/typesFoo"`. | RED on pattern 1 (the negative lookahead `(?!types["'])` requires the closing quote). Proves Ruling R part 2's exemption is a specifier match, not a prefix match. | YES |
| S4 | AC-2 | Apply Edits A, B, D, E but NOT C - fix the file and delete the carve-out without registering it. | Local equality RED (11 local vs 10 registered); non-local freeze GREEN. | YES |
| S5 | AC-2 | Apply everything, then delete the `"./classTrendsEntry.ts"` line from `CLIENT_FILES` and re-add `KNOWN_UNREGISTERED_LOCAL_FILES` with that one entry and its filter. | Both assertions GREEN. The filter removes the file from `localFiles`, so both sides shrink to 10 symmetrically. **Expected NOT to discriminate.** See the note below the table. | **NO - see note** |
| S6 | AC-2 | Add a fabricated `"./nonexistent.ts"` entry to `CLIENT_FILES`. | Local equality RED on the new direction (containment alone would have passed, and does today). | YES |
| S7 | AC-2 | Create `src/app/components/grading-results/scratch.ts` containing one export and nothing else, do not register it. | Local equality RED. Delete the file afterwards. | YES |
| S8 | AC-2 | Create `src/app/components/grading-results/scratch.mjs`. | Both GREEN - the `/\.(ts\|tsx)$/` filter never enumerates it. **Expected NOT to discriminate; this is RES-A22-3, recorded rather than credited.** Measured to have no live instance: 21 entries in the directory, 15 `.ts` and 6 `.tsx`, zero subdirectories (section 2.3). | **NO, by design** |
| S9 | AC-3 | Append `import { createServiceClient } from "@/lib/supabase/server";` - **DOUBLE-QUOTED, and the quote style is the whole point** - to `src/lib/grade/types.ts` (a COPY-restore is mandatory; this file is outside `owns` and the mutation is transient). | `:122-131` RED: `fromLines` has two elements. Executed as hazard H1 in section 3.2. | YES |
| S10 | AC-1 backstop check | Drop the `type` keyword from `classTrendsEntry.ts:25`, making it a real VALUE import of `@/lib/grade/types`. | `BANNED_IMPORT_PATTERNS` GREEN (the exemption is specifier-shaped, not kind-shaped). `classTrendsDraft.not-postable.test.ts` GREEN (`types.ts` reaches only `../code-runner`, not a forbidden prefix). `tsc` GREEN - `tsconfig.json` sets `isolatedModules: true` with no `verbatimModuleSyntax`. **Nothing in the suite catches it.** | **NO - and no criterion is credited with catching it.** |
| S11 | AC-2 | Delete the `"../GradingResults.tsx"` line from `CLIENT_FILES`. | Local equality GREEN, non-local freeze **RED**. Overall RED. **This is blocker B1's mutant and it SURVIVED round 1's Edit E** (executed, section 4(c)) - the reason AC-2 has two assertions rather than one. | YES (new in round 2) |
| S12 | AC-2 | Add a second non-local entry `"../Foo.tsx"` to `CLIENT_FILES` without editing the frozen literal. | Non-local freeze RED. This is the deliberate-act friction, not a defect - the correct response to this red is to edit the literal, after arguing for the entry. | YES (new in round 2) |
| S13 | AC-3, NEGATIVE control | Append the SAME server import to `types.ts` **single-quoted**; separately, a `require()`, a dynamic `await import()`, and a single-quoted `export *`. | All four GREEN - U3's filter tests `line.includes(' from "')`, double quotes only. Executed as H2-H5 in section 3.2. **Expected NOT to discriminate. This is where the U3 hole becomes visible instead of assumed, and it is RES-A22-5.** An implementer must record these four as expected survivors, NOT as failed kills. | **NO, by measurement - RES-A22-5** |

**On S5.** The local equality compares `localFiles` (post-filter) to the
`./` entries. A reinstated filter shrinks BOTH sides symmetrically, so it does
not detect the restoration of an exemption mechanism - it detects an
unregistered FILE. This is an honest limit of the construction and I am not
going to paper over it with a `grep`-for-the-identifier assertion dressed up as
a criterion, because that is the name-shaped answer to a channel-shaped
question this seat is warned about. **The round-1 checker ruled that NAMING it
is sufficient and that no in-file assertion can kill it, since any assertion
can be edited in the same diff. That ruling is adopted and this note stands
unchanged.** The real defence against S5 is that it is a visible, arguable diff
in a guard file, which is the property section 4(b) asks for.

**On S10.** Dropping `type` from a `@/lib/grade/types` import is not a
client-bundle hazard today (`types.ts` transitively reaches only
`../code-runner`), so the absence of a catcher is not a live defect. It is
recorded so no criterion is credited with a discrimination it does not have -
this repo has shipped exactly that inflation before. **The round-1 checker
confirmed recording it uncredited was correct, and confirmed the `tsc` half:
`tsconfig.json` has `isolatedModules: true` and no `verbatimModuleSyntax`.**

**On S9 versus S13, and why the split matters.** Round 1's S9 said only "add a
second import line". Written single-quoted - a perfectly ordinary thing for an
implementer to type - it stays GREEN, and the implementer would record a failed
kill against a criterion that is in fact fine. Specifying the quote style turns
one ambiguous row into one real kill (S9) and one measured, expected
non-discrimination (S13) that surfaces the U3 hole at the bench instead of
leaving it to the next round to rediscover.

---

## 10. Wave plan

One wave, one implementer, two files, both in
`src/app/components/grading-results/`.

| Step | Action | Gate |
|---|---|---|
| 0 | `git status --short` - must be clean before starting. Capture `npm test` totals as the AC-4 baseline. | clean tree, recorded M |
| 1 | Edits A then B in `classTrendsEntry.ts`; Edits E, F, D, C in `gradingResultsHelpersWiring.test.ts` - **in that order**, per section 5's order-dependency table. | - |
| 2 | `npx vitest run src/app/components/grading-results/ src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts` | all green |
| 3 | Sabotage pass S1-S4, S6, S7, S9, S11, S12 as kills; record S5, S8, S10, S13 as expected non-discriminators. Restore each mutation from a COPY. | each named kill observed; each named survivor observed to SURVIVE |
| 4 | `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` | AC-4, AC-5 |
| 5 | Re-measure both edited files with `@(Get-Content <f>).Count` and `wc -l`, against section 2.6's projected 53 and 228. | both instruments agree; a disagreement is a finding, not a rounding |
| 6 | `git status --short` against the two-path assignment; confirm no `.claude/worktrees` copy was edited. | exactly two paths |

`npx tsc --noEmit` has exactly one caller here and it is this wave gate
(`this-repo.md` section 2). Do not run it concurrently with another agent.

Disjointness: A22's write set is two files in `grading-results/`. It does not
intersect A21 (announcement surfaces), A23 (`repo-grades/`), or any docs-only
work. The one shared resource that no file list shows is
`tsconfig.tsbuildinfo` at step 4.

---

## 11. Residual register

`iteration-caps.md` and this seat's definition: an entry missing an owner, an
instrument or a step is a DELETION, and a residual not in `docs/BACKLOG.md`
does not exist. **RES-A22-2 has since become backlog row A23 (`ef99101`) and is
therefore no longer a residual - it is struck from this table and carried in
section 3.3 only as the correction A22 owes that row. Of the remaining four,
NONE is in `docs/BACKLOG.md` yet. This document does not own that file. Until
the orchestrator adds them at the push, they are deletions, and I am calling
them that rather than implying otherwise.**

| id | Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| RES-A22-1 | `BANNED_IMPORT_PATTERNS` is applied to RAW source at `gradingResultsHelpersWiring.test.ts:111-116`, so a correct file that merely DISCUSSES the barrel in a comment goes red. Measured live risk: `ungradedDisclosure.ts:14,18` already name the barrel in prose and pass only on phrasing (section 2.5). A22 mitigates with a note at both ends (Edits B and F), not by changing the instrument (section 3.4 says why). | Orchestrator, as a new backlog row | The guard itself - it fails LOUD and in the safe direction | The next wave that edits any file under `src/app/components/grading-results/`; if it reds on a comment, this residual converts to a chunk |
| RES-A22-3 | The completeness sweep's extension test is `/\.(ts\|tsx)$/` (`:139`), so a `.js`/`.jsx`/`.mjs`/`.cjs` file in this ONE directory is never enumerated and never registered. No such file exists today: 21 entries, 15 `.ts` + 6 `.tsx`, 0 subdirectories (section 2.3). Sabotage S8 is the expected non-discriminator that pins it. | Orchestrator, as a low-priority backlog row | Widen the extension test to `/\.(ts\|tsx\|js\|jsx\|mjs\|cjs)$/` and add S8's `scratch.mjs` fixture as a canary that must go RED before the widening lands | **Narrowed in round 2 (minor m6): the next wave that adds a non-`.ts`/`.tsx` file to `src/app/components/grading-results/` specifically - that is the only directory this non-recursive filter enumerates - OR the next wave that copies this sweep idiom into another directory.** Round 1's step was "anywhere under `src/app/components/`", which is hundreds of files this filter never reads |
| RES-A22-4 | 16 non-test files outside this directory still type-only import the `@/lib/grade` barrel (17 total, minus `classTrendsEntry.ts`; re-measured this round, and 0 single-quoted variants). None is a bundle hazard (type-only erases) and none is inside a completeness sweep today, so nothing is broken. But the next directory to grow its own sweep hits this wall exactly as `grading-results` did. **Round-2 amendment: that next directory must NOT inherit round 1's belief that `@/lib/grade/types` is a walled destination - see RES-A22-5. The wall is the constraint it will design against, and the wall is measured porous.** | Orchestrator, as a note on whichever row adds the next sweep | `grep -rn 'import type .* from "@/lib/grade"' src --include=*.ts --include=*.tsx \| grep -v "\.test\."` (17) and its single-quoted twin (0), re-run | Whenever a second directory-completeness sweep is proposed |
| **RES-A22-5** | **NEW in round 2, from blocker B2. Ruling U3's walled-set guard does not wall `types.ts`.** Its filter at `gradingResultsHelpersWiring.test.ts:127-129` tests `line.includes(' from "')` - double quotes only. Executed against the real `src/lib/grade/types.ts`: a double-quoted server import is CAUGHT; a SINGLE-QUOTED server import, a `require()`, a dynamic `await import()` and a single-quoted `export *` all PASS (section 3.2, H1-H5). Two of the four constructs that got `VALUE_IMPORT_PATTERN` withdrawn still escape its replacement, and single-quoting defeats the other two. `docs/a12-a13-scope.md:863-864` claims the replacement "can only be defeated by an unusually-formatted comment"; that sentence is false and should be corrected in that document too. This is not academic: `types.ts` ships TEN value exports (section 3.2), so it is a live module, not a declaration file. | Orchestrator, as its own backlog row **against Ruling U3** - not as a note on A22 | The five-hazard script of section 3.2, frozen into `gradingResultsHelpersWiring.test.ts` beside the U3 assertion, **with the single-quoted case as a POSITIVE CONTROL**: it must go RED against today's filter before any fix lands, exactly as A23's multi-line fixture must | The next chunk that touches `src/lib/grade/types.ts`, or that proposes a second directory sweep (which would inherit the wall as a premise - see RES-A22-4) |

**Why RES-A22-5 is a residual and not folded into A22's Edit set**, since it
would be roughly ten lines in a file A22 already writes. Two reasons, and the
second is the real one. (i) A22's AC-3 exists to prove A22 did not disturb U3;
bundling a U3 change into the same diff makes that proof circular. (ii) **A
canary that merely PINS the hole freezes a defect as an expectation** - the
same mistake round 1 would have made with A23's fixture 3 (section 3.3). The
five-hazard script is only meaningful next to a FIX, and fixing U3's filter is
a revision of a ruling: it needs its own scoping, because the obvious repair
(match both quote styles) still misses `require()` and dynamic `import()`, and
the non-obvious repair is a different mechanism entirely. Shipping the control
without the fix would convert a measured hole into a green test that says the
hole is expected.

---

## 12. Disposition tables

### 12.1 Round-1 findings, every one disposed

The id column was re-derived LAST, after sections 8 and 9 were renumbered.

| Finding | Class | Disposition | Where it landed |
|---|---|---|---|
| **B1** - Edit E leaves `../GradingResults.tsx` in no set on either side; deleting it keeps every gate green, and nothing else in the repo guards that file | "a check whose assertion cannot fail for the object it most needs to protect" | **REVISED - accepted in full, blocker confirmed by my own execution** | Section 4(c): the hole reproduced (`GREEN - HOLE CONFIRMED`), the two-banned-guard census pasted, the fix chosen as a SEPARATE frozen-literal assertion with the oracle argument for why not folded; Edit E2 in section 5.2; AC-2's second pair; sabotage S11 and S12, both executed kills. Round 1's false sentence in 4(c) is quoted and retracted in place |
| **B2** - section 3.2 justified fix (1) on a U3 wall that is measured false; four of five hazards escape | "an obligation discharged by citing a document without opening it" | **REVISED (a), plus (c) RESIDUAL for the underlying hole** | (a) Section 3.2 withdraws the construction claim, re-executes the five hazards, and states the disposal fix (2) actually gets: **(d) Delete on the caps' repeat rule alone**, with `BANNED_IMPORT_PATTERNS`' whole-file scan named as the enforcer it protects. Fix (1) is re-characterised as a SCOPE REDUCTION resting on a separately measured fact, not a construction. (b) **RES-A22-5** added with owner, instrument and step. (c) Sabotage **S9 respecified double-quoted** and **S13** added as the measured non-discriminator |
| **M1** - five real stale citations plus three marginal | "a citation carried forward without opening it" | **REVISED - all eight corrected, and a ninth found** | `backlog.yml:418-428` / `:424` / `:427` / `:428` (sections 0 header, 1, 2.1, 12.2); `registry.test.ts` `:86-95` and `:136-142` and the equality at `it(` `:116` / assertion `:120` (sections 4(a), 7.2); repo-grades filter `:295-297` (section 3.3); Edit F's insertion point `:86` (section 5.2, also minor m2). **Ninth, found in round 2 and not on the checker's list: `docs/BACKLOG.md:62` is the table separator; the A22 row is `:63`** (section 2.1) |
| **M2** - delete AC-2; it cannot fail except when AC-3's equality already fails | "a criterion with no independent failure mode" | **(d) DELETE, with the enforcer named and the claim measured** | Section 8: round-1 AC-2 deleted, **AC-2 (formerly AC-3) named as the enforcer it was protecting**, and the four-state execution added showing its only independent firing is a FALSE POSITIVE on legitimate file deletion. Ids re-derived last: old AC-3..AC-7 became AC-2..AC-6 |
| **m1** - Edits D and E cite pre-edit line numbers that shift | "an instruction whose addresses are invalidated by its own earlier steps" | **REVISED** | Section 5's ORDER DEPENDENCY table: descending line order per file, with all addresses declared pre-edit against `ef99101` |
| **m2** - Edit F's insertion point is `:86`, not above `:88` | same class as M1 | **REVISED** | Section 5.2's Edit F, with the reason (it would split the Ruling R part 2 comment from its declaration) stated in the packet so an implementer cannot re-introduce it |
| **m3** - `classTrendsEntry.ts` projects to 53, not about 49 | "an unmeasured number in an artifact" | **REVISED - estimate replaced by measurement** | Section 2.6: both files materialised into `%TEMP%\a22proj\` from section 5's literal text and counted with both instruments - 53 and 228, agreeing. Arithmetic shown. Wave-plan step 5 re-measures |
| **m4** - section 0 claims an exemption is not representable; section 9's S5 concedes it is | "an artifact contradicting itself between its summary and its evidence" | **REVISED - section 9 was right, section 0 rewritten** | Section 0's second paragraph now enumerates the three states that ARE unrepresentable and the one that is not, citing S5. Section 4(c) does the same in full after the mutant table |
| **m5** - the not-postable walker's `IMPORT_RE` is not single-line; `\s` spans newlines | "a claim about a regex made by reading it" | **REVISED** | Section 7.2's first row: the pattern is quoted from `:96` and re-described as double-quote-blind and MULTI-line. Conservative direction, conclusion unchanged, and said so |
| **m6** - RES-A22-3's step is far broader than the directory it protects | "a residual whose step will not actually fire on the thing it guards" | **REVISED - narrowed** | RES-A22-3's step column in section 11, narrowed to this one non-recursive directory plus any copy of the idiom, with the old wording quoted |
| **m7** | - | **NOT RECEIVED - cannot be disposed** | The checker's counts say 7 minors. Six reached me (m1-m6 above); the brief transmitted no seventh. **I am not inventing a finding to fill the row.** The orchestrator should either forward m7 or correct the count. Flagged here rather than in section 13 so it sits inside the table the caps card requires to be complete |

### 12.2 Disposition of the questions the BACKLOG row posed

Not a restructuring table in `iteration-caps.md:119`'s sense. This maps the
row's own named items to this artifact's answer, so a checker can see nothing
the row asked was dropped. The id column was derived last.

| Row item (`docs/backlog.yml:428`, the `note:` field) | Disposition | Where it landed |
|---|---|---|
| Fix (1) - change the import to `@/lib/grade/types`, "check first that every symbol the file needs actually lives in types.ts" | **ADOPTED**, precondition verified | Section 2.2 (both symbols, `types.ts:308` and `:329`); Edit A, section 5.1; AC-1 |
| Fix (1)'s stated caution - "the A12/A13 round also added a guard that types.ts itself stays free of value imports, so widening what flows through it is not free" | **DOES NOT FIRE for A22 - and the guard it names is WEAKER than the row believes** | Section 2.2: the barrel already sources both symbols from `types.ts`, so nothing moves; AC-3 is the standing proof that A22 widened nothing. **But section 3.2 measures that guard passing four of five hazards, so the row's premise that `types.ts` is protected is false going forward - RES-A22-5** |
| Fix (2) - teach the guard to distinguish type-only from value imports | **REJECTED, (d) DELETE, with the enforcer it would have protected named** | Section 3.2: a repeat of the disposed `VALUE_IMPORT_PATTERN` class under `iteration-caps.md:40-42`. The protection it would have offered - catching a genuine VALUE barrel import - is unaffected: `BANNED_IMPORT_PATTERNS` keeps that whole-file, and section 3.3 notes the crude form is the reason it cannot have the multi-line hole. The measured shortfall in the sibling implementation is backlog row A23 (`ef99101`) rather than being absorbed |
| "decide whether the carve-out list should exist at all once the one entry is gone" | **ANSWERED: delete, and upgrade the assertion so the WHOLE array is pinned** | Section 4, with the set-equality and frozen-literal verification pasted, the executed mutant matrix, and the two things that would change the call stated concretely |
| The row's `instrument` field (`:424`) naming `gradingResultsHelpers.test.ts` as the carve-out's home | **CORRECTED - the row is stale** | Section 2.1. The carve-out is in `gradingResultsHelpersWiring.test.ts:81-84,142`. The orchestrator should fix the row at the push, and also `docs/BACKLOG.md:63` |
| The brief's claim that the sweep filter "misses `.test.tsx` and `.d.ts`" | **REFUSED - disproved against the tree, and the refusal was confirmed by the round-1 checker** | Section 2.3: `:139` excludes both explicitly. A different, real gap (non-`.ts` extensions) is recorded as RES-A22-3, and the checker measured it to have no live instance |

---

## 13. What I could not determine

- **Whether `npm test`, `npx tsc --noEmit`, `npm run lint` or `npm run build`
  pass on the current tree.** I did not run them. This seat writes a design
  artifact and shares `tsconfig.tsbuildinfo` with whatever else is running;
  `this-repo.md` section 2 gives `tsc` exactly one caller and it is the wave
  gate. Every gate expectation in AC-4 and AC-5 is a REQUIREMENT on the wave,
  not a measurement I made. The AC-4 baseline test count must be captured by
  the wave gate itself - I am deliberately not quoting `this-repo.md`'s 20,200,
  which is dated 2026-09-13 and has certainly moved.
- **Whether the two edited files actually land at 53 and 228 lines.** Section
  2.6's figures are counts of MATERIALISED PROJECTIONS built from section 5's
  literal text in a temp directory, not of the real files, which I did not
  touch. If the implementer rewords Edit B's comment - which section 5.1
  permits - the 53 moves. Wave-plan step 5 measures the real files with both
  instruments.
- **Whether `next build` actually fails on a VALUE barrel import from this
  directory today.** That is the incident the whole guard exists for
  (`gradingResultsHelpersWiring.test.ts:48-61`) and it is recorded as having
  happened, but reproducing it needs a build in an envless checkout whose
  prerender tail fails for an unrelated reason. I read the record; I did not
  re-stage the incident.
- **Whether the four U3-escaping constructs in section 3.2 would actually
  break `next build` if someone wrote one.** I proved the GUARD does not catch
  them. I did not prove the resulting tree is broken, and for `require()` and
  dynamic `import()` in a `types.ts` that no client file value-imports, it may
  well not be. RES-A22-5's row owes that analysis; A22 asserts only that the
  guard's stated coverage is false.
- **Whether any ESLint rule would be a better home for this guard.** There is
  no `no-restricted-imports` configuration in `eslint.config.mjs`
  (`grep -rn "no-restricted-imports\|restricted-import" eslint.config.mjs`
  returned nothing), so adopting one would be a new mechanism with a repo-wide
  blast radius. I did not investigate whether the installed ESLint version
  supports the `allowTypeImports` option. Out of A22's scope either way; named
  so a later round does not think it was overlooked.
- **The seventh minor.** See section 12.1's last row. Six of seven reached me.
- **Nothing here is verified by rendering.** No criterion in section 8 depends
  on a component being rendered, because no component is rendered by any test
  in this repo.

---

## 14. Summary for the orchestrator

- Recommended fix: **(1), narrow the specifier** - plus a mandatory comment
  reword that the row did not anticipate and that section 2.4 measured.
- Carve-out: **delete**, and replace containment with TWO comparisons - a
  computed set equality over the `./` entries and a frozen literal over the
  non-`./` entries. The second one is blocker B1's fix and it closes a hole
  that pre-dates A22.
- **Fix (2)'s disposal is (d) DELETE on the caps' repeat rule alone.** The
  "construction that makes the bad state unrepresentable" claim is WITHDRAWN:
  U3 does not wall `types.ts` (four of five hazards escape, executed). Fix (1)
  is a SCOPE REDUCTION onto a path whose safety is a separately measured fact,
  not an enforced invariant.
- Two files, one wave, one implementer, edits applied in DESCENDING line order.
  The build packet is sections 5-10.
- The row's own address for the carve-out is stale in both `docs/backlog.yml`
  (`:424`) and `docs/BACKLOG.md` (`:63`) and should be corrected at the push.
- **Four residuals, none yet in `docs/BACKLOG.md`. RES-A22-5 is new and is the
  most consequential: it is a row against Ruling U3 itself, and RES-A22-4 hands
  U3's false premise forward to whichever directory grows the next sweep.**
  RES-A22-2 is gone, having become row A23 at `ef99101`; section 3.3 carries the
  one correction A22 owes that row - each fixture must state the DIRECTION it
  pins, because fixture 3 currently pins wrong behaviour.
- The weakest points in this artifact, named so a checker does not have to find
  them: sabotage S5 is not killed by the specified construction (section 9's
  note, and the round-1 checker ruled naming it sufficient), and the seventh
  minor was never transmitted so section 12.1's table has one row I could not
  fill honestly.
