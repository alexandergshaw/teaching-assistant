# A22 - close the `KNOWN_UNREGISTERED_LOCAL_FILES` carve-out

Architecture seat, 2026-09-20. **Round 3 - disposal round.** Row A22 in
`docs/backlog.yml:418-428` (`kind: 'chore'` at `:427`,
`area: 'grading-run-survival-and-disclosure'` at `:426`, the design note at
`:428`).

Round 1 was committed at `1406726` and checked NOT CLEAN: 2 blockers, 2 majors,
7 minors. Round 2 disposed those and was itself checked NOT CLEAN: 2 blockers,
2 majors, 6 minors. **Both round-2 blockers are REPEAT classes** under
`iteration-caps.md:41-43`, so per the caps they are disposed HERE, by
orchestrator ruling, rather than by a third revision round on the same class.
Section 12.1 is the disposition table over every round-1 finding; section 12.2
is the original table over the BACKLOG row's own questions. Section 12.3 is
the disposition table over every round-2 finding, added by this round.

**Hand-off blocker discharged.** Round 2's check also flagged that the
wave-plan's step-0 "`git status --short` clean" gate was failing because of
the orchestrator's own uncommitted corrections. Those corrections landed at
`a9740f0` and `894fae8`, and `git status --short` was clean for this document
at the start of this round (`git status --short` run before any edit here).
That blocker is discharged, not left open.

**What this round applies, in one paragraph.** Ruling R1 disposes BL-2:
the non-`./` half of the completeness sweep (section 4(c), section 5.2 Edit
E2) moves from a hand-maintained frozen literal to a PREDICATED COMPUTED
ORACLE - the parent directory, enumerated non-recursively with the same
extension filter as the local half, filtered to files whose source imports
from this directory. Ruling R2 disposes BL-1: A22 and A23 intersect BY EXACT
PATH on `gradingResultsHelpersWiring.test.ts` (section 10), RES-A22-5 is
struck because A23 already carries its obligation verbatim (section 11, the
same treatment RES-A22-2 already got), and the two rows are sequenced -
A22 strictly first - rather than left concurrently dispatchable. MA-1, MA-2
and the six minors are applied at the sections named in section 12.3. No new
design is introduced beyond what the ruling specifies; where a ruling could
not be applied as stated, that is said in place rather than silently
improvised.

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
`./` entries against the directory enumeration, and, as of Ruling R1 in this
round's disposal, a SECOND SET EQUALITY over the non-`./` entries against a
PREDICATED COMPUTED ORACLE of the parent directory's actual consumers - not
the hand-frozen literal round 2 proposed (section 4(c), rewritten after
blocker B1, then again after blocker BL-2).

**What that construction does and does not make unrepresentable, stated
precisely because round 1 overstated it (minor m4), and extended twice
since.** It makes an unregistered local file unrepresentable **with two
NAMED exceptions that stay representable and are not silently absorbed into
that claim (major MA-1):** a non-`.ts`/`.tsx` extension (`.js`/`.jsx`/`.mjs`/
`.cjs`, sabotage S8) and a file inside a SUBDIRECTORY of this directory,
because the enumeration is non-recursive (RES-A22-3 owns both, and its
instrument is extended in section 11 to name the subdirectory case
explicitly, not just the extension). Beyond that exception pair, it makes
unrepresentable: a dead `./` registration, the silent deregistration of
`../GradingResults.tsx` (blocker B1), an undeclared second non-local entry,
and - as of Ruling R1 - an unregistered REAL non-local consumer (sabotage
S14), a state the frozen literal could not even pose as a question. It does
**not** make an exemption mechanism unrepresentable - a reinstated filter
shrinks both sides of the local equality symmetrically and survives
(sabotage S5, executed in section 9). Round 1's section 0 claimed "an
exemption is not representable at all"; that sentence was false against its
own section 9, and this paragraph replaces it.

---

## 1. Leverage

**No claim. Trigger fired and recorded, per `docs/loop/leverage.md` and
`docs/loop/seats.md`'s Acceptance-criteria brief ("On a bug fix, a refactor, a
doc correction or an owner verification there is no claim to make; record that
as the fired trigger and move on").**

The fired trigger: A22 builds and changes no capability a user reaches. Its
entire write set is one import specifier, one source comment, and one test
file. `docs/backlog.yml:427` classifies the row `kind: 'chore'`. `DEV_LOOP.md:102`
scopes the claim to "a capability a user reaches - not a bug fix, a refactor,
a doc correction or an owner verification" (corrected in round 3, minor
m-ii: the phrase opens at `:102`, not the `:103-105` an earlier draft cited -
`:103` continues the same sentence but does not open it). Nothing in this row's
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
and `wc -l docs/BACKLOG.md` returns 76). **This is the NINTH stale citation
this seat has found across its own rounds - corrected in round 3, minor
m-i, from an earlier draft of this sentence that called it the sixth,
inconsistent with section 12.1's and section 14's own count of eight
corrected plus this one.** It was found in round 2, not among the five the
round-1 checker listed (M1's eight = five it listed plus three marginal this
seat found on its own), and not among those eight either - it is the ninth,
full stop. It is recorded rather than quietly fixed, because the count of
stale citations is itself evidence about this seat's citation discipline.

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

**Corrected in round 3 (minor m-v): the margin here is wider than round 2
claimed, not narrower, and the risk is real for a different reason than
"one word away."** `ungradedDisclosure.ts:13-14` reads across the line break
as `// imports isUngraded (and the NotAttemptedOutcome type) from` then
`// "@/lib/grade/types" ONLY - never the "@/lib/grade" barrel or any other`.
The word `from` IS the immediately preceding word here - it is not one word
away, it already sits exactly where a hazard would need it. **This site
still cannot fire under any reflow, but for a structural reason, not a
lucky phrasing one: the quoted specifier is `@/lib/grade/types`, which
`BANNED_IMPORT_PATTERNS`' own exemption (`/from ["']@\/lib\/grade\/(?!types["'])/`,
Ruling R part 2) excludes by construction.** No rewording of this comment
makes it fire unless the specifier itself changes to name a non-`types`
submodule. `:18` is safe for an unrelated, also-structural reason: its
phrase is `// the "@/lib/grade" alias, exactly as`, with no trailing slash
after `@/lib/grade`, so neither `BANNED_IMPORT_PATTERNS` pattern matches it
regardless of what precedes the quote - pattern 0 requires the word `from`
immediately before the quote (here it is `the`, two words after `not`) and
pattern 1 requires a trailing `/lib/grade/`. **"One word away from firing"
overstated the risk in the direction that would have implementers
distrusting a comment that is, on both counts, safe by construction rather
than by accident.** RES-A22-1 remains a residual - the guard's raw-source,
comment-sensitive scan is still real, and a DIFFERENT future comment
(one naming, say, `@/lib/grade/rubric` right after the word `from`) would
fire - but this section's own two cited examples are not evidence of a
close call. Section 5 still mitigates with a note at both ends, not by
changing the instrument (section 3.4 says why).

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
| `gradingResultsHelpersWiring.test.ts` | 218 | **241** | +23 | Materialised into `/tmp/a22disposal/proj/final.ts` from section 5's literal text (all four edits, in the descending-line order the order-dependency table requires) and counted `wc -l` 241, `awk 'END{print NR}'` 241, and a Node `split(/\r\n|\n/).length` count 241 - three instruments, one answer |

Arithmetic for `classTrendsEntry.ts`: Edit B replaces 3 comment lines with the
10-line block in section 5.1, Edit A is 1-for-1. 46 - 3 + 10 = 53. Round 1 said
"about 49", which was wrong in the direction of understating a growth - the
less safe direction, though at 53 against a 1000-line ceiling it changes no
conclusion. **Unchanged by round 3 - Ruling R1 touches only the test file.**

**The test file, re-measured in round 3.** Round 2 measured 228 against Edit E
replacing 3 lines with 12 (+9): 218 + 1 - 5 + 5 + 9 = 228. **Ruling R1
rewrites Edit E2 to the predicated computed oracle in section 5.2, which is
25 lines, not 12** - a net of +22 rather than +9 for that one edit. Edit C
+1, Edit D -5, Edit F +5 are unchanged by R1 (they sit before the U3 block
and before Edit E's own location, per the order-dependency table in section
5, so R1 does not shift their addresses). The arithmetic (218 + 1 - 5 + 5 +
22 = 241) and the materialised count above agree.

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
`iteration-caps.md:41-43` (corrected in round 3, minor m-ii: `:40` is a blank
line, the rule itself runs `:41-43`) forbids answering a repeat failure by
strengthening the same mechanism; fix (2) is a fourth round of the classifier
that U3 already withdrew. The enforcer the withdrawal protects is named in
section 12.2: the
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
escape its replacement, and single-quoting defeats the other two. **Round 1
adopted, without running it, a claim in `docs/a12-a13-scope.md` (at the
address round 1 gave, `:863-864`) that the replacement "can only be defeated
by an unusually-formatted comment"; that claim was FALSE.** That adoption was
the defect; the corrective rule is section 2's opening paragraph. **The
citation is now stale for a second reason, and a better one: the false
sentence itself no longer sits at `:863-864`.** It was corrected in place at
`a9740f0` (`docs: correct a false guard claim I authored, and A22 stale
instrument`), which inserted the same five-hazard table reproduced above and
the same positive-control instruction, now at `docs/a12-a13-scope.md:864-899`.
This document's own measurement (the round above) is what that commit acted
on; nothing here needs to change to stay consistent with it, only the
citation, which now points at a correction rather than at the defect.

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
  **Backlog row A23 records that** (widened at `48907e4` to carry this
  obligation verbatim - round 2's RES-A22-5 is struck as a residual of this
  document, section 11 says why).

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
its own backlog row: A23, filed at `ef99101`.** As filed, A23 covered
`src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts`
only - **A22 does not own that file**, and this document does not restate the
row. **CORRECTION, round 3: A23 was later widened (at `48907e4`) to also
cover Ruling U3's walled-set guard, which lives at
`gradingResultsHelpersWiring.test.ts:122-131` (pre-A22 addressing) - and that
file IS one of A22's two owned files.** So the sentence above is true only of
the repo-grades file; the file A23 now ALSO covers is one A22 edits directly.
Section 10 corrects the resulting intersection and sequencing; section 11
strikes RES-A22-5 because A23 already carries its obligation. One correction
A22 owes the receiving row regardless, because round 1's residual would have
mis-specified it:

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

**THE FIX, CORRECTED IN ROUND 3 BY RULING R1.** Round 2 pinned the non-local
entries with a SECOND assertion against a hand-maintained frozen literal:

```ts
expect(CLIENT_FILES.filter((p) => !p.startsWith("./"))).toEqual(["../GradingResults.tsx"]);
```

**That justification was a non-sequitur, and the round-2 check was right to
call it one.** The argument for the frozen literal was "the `../` half has no
directory to enumerate ... so enumerating it would be wrong and its expected
value must be a FROZEN LITERAL". A BARE enumeration of `..` (`src/app/
components/`) would indeed be wrong - that directory holds many files
correctly outside this guard's scope. But a PREDICATED enumeration is not a
bare one: it is a computed oracle, one grep away, and it yields the right
answer today. Measured:

```
ls src/app/components | grep -E '\.(ts|tsx)$' | grep -v '\.test\.ts$' | grep -v '\.test\.tsx$' | grep -v '\.d\.ts$' | wc -l
```

```
83
```

Of those 83 direct, non-test `.ts`/`.tsx` files in `src/app/components`,
exactly ONE imports from `./grading-results/` or
`@/app/components/grading-results/`:

```
for f in <the 83 files>; do grep -qE "from ['\"]\./grading-results/|from ['\"]@/app/components/grading-results/" "src/app/components/$f" && echo "$f"; done
```

```
GradingResults.tsx
```

**RULING: ADOPT THE PREDICATED COMPUTED ORACLE.** Read the parent directory
non-recursively, apply the SAME extension filter already used for the local
half, filter to files whose raw source imports from this directory, and map
to `../{name}`. Edit E2 in section 5.2 is rewritten to this shape.

**Why this and not the frozen literal, stated as the round-2 check's own
argument turned against its own conclusion.** The argument FOR the local
half's computed equality was that a computed expectation is
SELF-MAINTAINING - "adding a file to this directory moves the expectation and
the requirement together". The frozen literal denied the non-local half
exactly that property, leaving one state representable that should not be:
delete the entry from `CLIENT_FILES` AND from the literal in the same diff -
green, silent, and the file the whole block exists to protect is
deregistered. **The predicated computed oracle makes that state
UNREPRESENTABLE**, because the expectation is re-derived from the tree and
cannot be edited into agreement without also deleting the consumer file
itself. `iteration-caps.md:41-43` rules that strengthening the same mechanism
never ends a chain; a construction does, and this is a construction, not a
strengthened literal.

**This is still two separate assertions, not one folded comparison** - that
part of round 2's reasoning survives unchanged: one failure message per
cause, and no coupling of a legitimate directory change to an unrelated
non-local check (adding a file to `grading-results/` still reds only the
local equality, never the non-local one, and vice versa). What does not
survive is the HAND-MAINTAINED expected value in the second assertion.

**This widens the requirement, deliberately, and the widening is named
here rather than left implicit.** The requirement is no longer "the one
known non-local entry stays present" - it is now **"every non-local consumer
of this directory is registered in `CLIENT_FILES`"**. That is a real scope
call, not an accident of the rewrite: it means a FUTURE file elsewhere under
`src/app/components` that starts importing from `grading-results/` will red
this assertion until it is added to `CLIENT_FILES`, exactly as a new LOCAL
file already does.

**`src/app/components/repo-grades/RepoGradesGrid.tsx` also imports from
`grading-results/`** (`import type { FeedbackField } from
"../grading-results/gradingResultsHelpers";` at its own `:52`), and it is in
NEITHER guard's list. Under the widened requirement this is worth stating
explicitly rather than leaving to be discovered by a future red: **the
predicate is scoped to the PARENT directory only, non-recursively** - it
walks `readdirSync(src/app/components)`, the same non-recursive idiom the
local half already uses on `grading-results/` itself. `RepoGradesGrid.tsx`
lives in a subdirectory (`src/app/components/repo-grades/`), not as a direct
entry of `src/app/components`, so it is never enumerated by this predicate
and **stays out of scope**. It is not exempted because its import is
type-only (the predicate does not classify type-only versus value, by
design - section 3.2's whole argument is that classifying import kind from
text is the class of guard that keeps breaking); it is out of scope purely
because of directory depth, the same reason the local half's own
`readdirSync` would never see a hypothetical
`grading-results/nested/Foo.ts` either. If a second directory ever wants this
completeness property recursively, that is new scope for a new row, not an
implicit widening of A22.

**Correcting the inherited ruling one case past its warrant.** Section 9's
note on sabotage S5 adopts the round-1 checker's ruling that "no in-file
assertion can kill it, since any assertion can be edited in the same diff".
**That is TRUE of S5** - a reinstated exemption filter is a code change an
implementer can make in the same diff as anything guarding against it, so no
assertion of this shape defends against it, and naming it is the right
disposal. **It is FALSE of the non-local case that blocker B1 raised and
this ruling now fixes.** A frozen literal COULD be edited into agreement with
a deletion in the same diff - that was exactly B1's hole. A COMPUTED
assertion cannot: deleting `../GradingResults.tsx` from `CLIENT_FILES` without
also deleting the file leaves the computed set still containing it, so the
equality reds. Round 2 applied the S5-shaped ruling to the non-local case
too, one case past its warrant, and that over-application is what let B1's
hole stand. Section 9's note is corrected below to say so.

Executed, both directions, against the code AS PROPOSED in round 2 (the
frozen literal), before this ruling replaced it:

```
Proposed non-local equality, present:              GREEN
Proposed non-local equality, deleted:              RED - HOLE CLOSED
Proposed non-local equality, extra '../Foo.tsx':   RED - caught
```

Those three outcomes hold unchanged for the predicated computed oracle too,
by construction: today's tree has exactly one non-local consumer, so
`nonLocalConsumers` computes to `["../GradingResults.tsx"]` and the equality
behaves identically to the frozen literal on today's tree. The computed
oracle's advantage is not a different result today; it is that the RIGHT-HAND
SIDE tracks reality instead of needing a human to keep it in sync, which is
exactly the property the frozen literal lacked and the local half already
had.

And the whole post-round-2 assertion pair against every mutant, as it stood
BEFORE this round replaced the second assertion (section 9's table was
generated from this run, and it is kept as the historical record of the
frozen literal's behaviour rather than re-run, since R1 does not change the
column's name only its right-hand side; renamed `nonLocalEquality` in section
9 to match the code that now exists):

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

Every RED/GREEN outcome above holds unchanged under the predicated computed
oracle, because today's tree computes to the same single-element set the
literal was frozen to (`["../GradingResults.tsx"]`) - see the equivalence
argument just above. **What changes is S14, new in this round, which the
frozen literal could not represent as a test at all:** add a real file under
`src/app/components` that imports from `./grading-results/` and do NOT add it
to `CLIENT_FILES`. Against the frozen literal this state was simply never
examined - the literal only ever compared to itself. Against the computed
oracle, `nonLocalConsumers` includes the new file and the equality reds. This
is the improvement the widened requirement (above) buys, not a restatement of
S11/S12.

**What the pair makes unrepresentable, stated exactly** (round 1's overclaim
was corrected as minor m4; this round adds one more state to the list): an
unregistered local file (S4, S7), a dead `./` registration (S6), a silently
deregistered non-local entry (S11), an undeclared second non-local entry
(S12), and, as of this round, **an unregistered REAL non-local consumer**
(S14) - a state the frozen literal could not even pose as a question.
**Still representable, and named explicitly rather than left for major MA-1
to catch (section 0 corrects the same omission):** a reinstated exemption
filter that shrinks both sides of the local equality symmetrically (S5); a
non-`.ts`/`.tsx` file in the directory - `.js`/`.jsx`/`.mjs`/`.cjs` - because
the extension test is `/\.(ts|tsx)$/` (S8, RES-A22-3); and a file placed in a
SUBDIRECTORY of this directory, because `readdirSync` here is non-recursive
and RES-A22-3's instrument now names this case too, not just the extension
one. All three are named rather than papered over.

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
round 1 said it was, so backlog row A23 (which now carries this obligation -
see section 11) must be settled first.**

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
the next editor. **Constraint (i) alone is enforced - AC-1 fails RED if it is
violated. Constraints (ii) and (iii) have NO instrument (minor m-iv,
corrected in round 3): nothing checks that the reworded prose still explains
the hazard or still warns the next editor, and section 2.6 explicitly waives
the line count as a proxy for content. State this as what it is - (ii) and
(iii) are UNENFORCED, resting on implementer and reviewer judgment - rather
than implying, as an earlier draft did, that some instrument holds
RES-A22-1's mitigation together.** This exact 10-line text is what section
2.6's measurement of 53 lines was taken over; the implementer may reword it
provided constraint (i) holds (the only one a gate can check) and AC-1 stays
green, and the wave gate re-measures either way:

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
  it("CLIENT_FILES lists EXACTLY this directory's non-test .ts/.tsx files, plus exactly its parent's non-local consumers (Ruling R part 4; A22)", () => {
```

Reworded again in round 3 from round 2's "plus exactly the known non-local
entry" - Ruling R1 replaces the hand-known entry with a computed set of
consumers, so the title should not promise a single known name.

*E2, the body at `:141-143`.* **Rewritten in round 3 by Ruling R1**, disposing
blocker BL-2: round 2 pinned the non-local half with a frozen literal (quoted
in section 4(c) as the disposed version); this round replaces it with a
predicated computed oracle, per that section's argument. Replace these three
lines -

```ts
      .map((n) => `./${n}`)
      .filter((n) => !KNOWN_UNREGISTERED_LOCAL_FILES.includes(n));
    for (const name of localFiles) expect(CLIENT_FILES).toContain(name);
```

with these twenty-five:

```ts
      .map((n) => `./${n}`);
    expect(localFiles.slice().sort()).toEqual(
      CLIENT_FILES.filter((p) => p.startsWith("./")).slice().sort()
    );
    // A22 (B1, then Ruling R1 in the round-3 disposal): the non-local
    // entries have no directory of their own to enumerate, but "which files
    // elsewhere import from this directory" IS a computable question.
    // Re-derive it from the parent directory rather than freezing it by
    // hand, so a deleted or unregistered consumer cannot be edited into
    // agreement with CLIENT_FILES without also deleting the consumer file
    // itself - see docs/a22-scope.md section 4(c).
    const parentDir = fileURLToPath(new URL("..", import.meta.url));
    const nonLocalConsumers = readdirSync(parentDir)
      .filter(
        (n) => /\.(ts|tsx)$/.test(n) && !n.endsWith(".test.ts") && !n.endsWith(".test.tsx") && !n.endsWith(".d.ts")
      )
      .filter((n) =>
        /from ["']\.\/grading-results\/|from ["']@\/app\/components\/grading-results\//.test(
          readFileSync(fileURLToPath(new URL(`../${n}`, import.meta.url)), "utf8")
        )
      )
      .map((n) => `../${n}`);
    expect(CLIENT_FILES.filter((p) => !p.startsWith("./")).slice().sort()).toEqual(
      nonLocalConsumers.slice().sort()
    );
```

Twenty-five lines, measured by `wc -l` over the literal text above written to
a scratch file (`wc -l` and `@(Get-Content).Count` both name the same count
for this block since it contains no line the two tools disagree over - the
42-line disagreement this repo has measured elsewhere is file-specific, not a
property of every file). `readdirSync` and `readFileSync` are already
imported at the top of this file (`:71`); `fileURLToPath` likewise (`:72`).
No new import is added.

Note the semicolon moves onto the `.map` line. **Lines `:136-140` are not
touched** - in particular the `/\.(ts|tsx)$/` filter expression at `:139` is
never retyped, because a retyped regex is a defect channel this repo has paid
for twice (the `/s` dotAll flag, `TS1501`); Edit E2's own new extension filter
is a literal copy of that same expression, not a retyping.

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
measures a real hole there, and closing it is backlog row A23's obligation,
not A22's - see section 11 for the disposition and section 10 for why the two
rows must now be sequenced rather than folded together.

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
| `src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts` | **AS SOURCE TEXT.** `:222` makes `classTrendsEntry.ts` a canary-3 walk root; `walkForForbiddenImports` `readFileSync`s it and follows VALUE imports only (`valueImportSpecifiers` at `:98-101`, corrected in round 3, minor m-vi, from an earlier draft's `:98-100`: the function opens at `:98` and its skip line is `:101` - `if (match[1]) continue;`, a TRUTHY check on the captured `type\s+` group, not the earlier draft's misdescribed `match[1] === "type "` equality test). | **adopted - must stay green, never edited** | Its `IMPORT_RE` (`:96`) is `/^\s*(?:import\|export)\s+(type\s+)?(?:[\w*{}\s,]*?)\s*from\s+"([^"]+)"/gm`. It is **SINGLE-QUOTE-blind and MULTI-line** (corrected in round 3, minor m-vi: an earlier draft called it "double-quote-blind", which reads as the opposite of what it means - the pattern's `from\s+"([^"]+)"` clause requires a literal double quote, so it is blind to a SINGLE-quoted import, not to a double-quoted one): `\s` and the `[\w*{}\s,]*?` class both match newlines, so a clause split across lines IS matched. Round 1 called it "single-line", which was wrong in the conservative direction and changed no conclusion (minor m5, confirmed sound and not re-litigated here). Edit A keeps `import type`, double quotes and one line, so the walker classifies it identically before and after. **If an implementer drops the `type` keyword, the walker resolves `@/lib/grade/types` and descends into it; `types.ts:1` imports `../code-runner`, which is on NO forbidden prefix, so this test stays GREEN on that mistake. It is not a backstop for AC-1.** |
| `src/app/components/grading-results/classTrendsEntry.test.ts` | Value-imports the module (`:5`). Not source text. | adopted - must stay green | A specifier change is invisible to it. It cannot detect AC-1 either way. |
| `src/app/components/GradingResults.tsx` | Value-imports the module (`:20`). Not a test. | checked-safe, not edited | `tsc` covers it. |
| `src/file-size-ceiling.structure.test.ts` | Reads every file under `src/` for its line count. | adopted | Only a growth past 1000 reds it; section 2.6 measures 53 and 241. |
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
dead registration, and no unregistered or silently deregistered non-local
consumer.** **Object and instrument corrected in round 3 by Ruling R1**: the
non-local half moved from a frozen literal to a predicated computed oracle
(section 4(c)).
Object: two pairs. (i) the directory enumeration at `:137-141` against the
`./`-prefixed subset of `CLIENT_FILES`; (ii) the non-`./` subset of
`CLIENT_FILES` against `nonLocalConsumers` - the parent directory, enumerated
non-recursively with the same extension filter as (i), kept only where the
file's raw source imports from this directory (today computing to exactly
`["../GradingResults.tsx"]`, section 4(c)'s 83/1 measurement).
Instrument: the two assertions of Edit E2.
Direction of failure: RED if the directory holds a `.ts`/`.tsx` non-test file
absent from `CLIENT_FILES`; RED if `CLIENT_FILES` holds a `./` entry with no
corresponding file; RED if the non-local subset of `CLIENT_FILES` differs from
`nonLocalConsumers` in either direction - which covers deletion (blocker B1),
undeclared addition (S12), AND an unregistered real consumer (S14, new in
round 3, a state the round-2 frozen literal could not even pose as a
question). A name-shaped `grep -n "KNOWN_UNREGISTERED"` returning zero lines
is a SUPPLEMENTARY check only and must not stand in for this one - a rename
would defeat it, and this seat's own standing warning is that a name-shaped
grep does not answer a channel-shaped question.

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
be credited with that stronger property; backlog row A23 owns it. Note also
the addresses here are PRE-A22: once A22 lands they move to `:123-132`
(assertion) and `:128-130` (filter) - section 10's line-shift obligation.**

**AC-4. The whole suite stays green and the count does not shrink.**
Object: `npm test` totals.
Instrument: vitest, `Test Files N passed (N)` / `Tests M passed (M)`, exit 0.
Direction of failure: any failure, and separately any DROP in M relative to
the pre-change run measured in the same session - a deletion that removes
assertions passes a naive "all green" reading. Baseline M must be captured
BEFORE the wave, by the wave gate, not quoted from `this-repo.md` (whose
20,200 is dated 2026-09-13 and has moved). **Expected direction for A22: M
RISES by exactly 1.** Edit D removes no `it`; Edit E2 adds a second assertion
inside an existing `it`, which does not move M. **Edit C adds one `it.each`
case to the `CLIENT_FILES` block, reworded in round 3 for clarity (minor
m-iii): that block is 11 cases today and 12 after Edit C** - measured by
`CLIENT_FILES.length` before and after registering `./classTrendsEntry.ts`.
A drop, or a rise other than 1, is a finding.

**AC-5. The three other gates pass at their documented shapes.** **Lint
clause corrected in round 3 (major MA-2): this criterion previously quoted
`this-repo.md`'s dated warning list as an absolute, the very thing AC-4's own
paragraph refuses to do for the test count one paragraph above it - and the
list has, in fact, moved.** `this-repo.md:61-64` names
`repoGradesSliceA.guards.test.ts:83` as one of today's four baseline
warnings; measured this round, that line is now
`function openingTags(source: string): string[] {`'s doc-comment closer (`*
count. */`), a comment line, which cannot carry an
`react-hooks/exhaustive-deps`-class warning. The anchor has moved exactly as
AC-4 warns `this-repo.md` itself does.
Object: `npx tsc --noEmit`, `npm run lint`, `npm run build`.
Instrument and direction: tsc - any output at all is failure; build - the
presence of the `Compiled successfully` line, NOT the exit code, which is
expected to be 1 in this envless checkout. **Lint - capture the pre-wave
warning COUNT and the exact `(file, rule)` pairs at wave-plan step 0, the
same step that captures AC-4's baseline M, rather than trusting `this-repo.md`'s
list. Compare DELTA: exit 0 and the SAME COUNT with the SAME set of
`(file, rule)` pairs is GREEN; any new pair, or a changed count, is a
regression, regardless of whether it matches a stale list from a different
document.**

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
| S11 | AC-2 | Delete the `"../GradingResults.tsx"` line from `CLIENT_FILES`. | Local equality GREEN, non-local equality **RED**. Overall RED. **This is blocker B1's mutant and it SURVIVED round 1's Edit E** (executed, section 4(c)) - the reason AC-2 has two assertions rather than one. Renamed `nonLocalFreeze` -> `nonLocalEquality` in round 3, matching the computed oracle Ruling R1 put in its place; the RED/GREEN outcome is unchanged, since `nonLocalConsumers` still computes to `["../GradingResults.tsx"]` and no longer contains it once the file is deleted from `CLIENT_FILES` alone. | YES (new in round 2) |
| S12 | AC-2 | Add a second non-local entry `"../Foo.tsx"` to `CLIENT_FILES` that is NOT backed by an actual file importing from this directory. | Non-local equality RED, because `nonLocalConsumers` never included `"../Foo.tsx"` in the first place. **Reasoning corrected in round 3**: round 2 called this "deliberate-act friction" whose correct response was to edit a frozen literal after arguing for the entry. Under the computed oracle there is nothing to argue for by editing this assertion - a fabricated `CLIENT_FILES` entry with no real importing file is simply wrong, and the fix is to remove it (or, if the entry names a real intended future consumer, to first make that file actually import from this directory, at which point the oracle picks it up on its own). | YES (new in round 2) |
| S13 | AC-3, NEGATIVE control | Append the SAME server import to `types.ts` **single-quoted**; separately, a `require()`, a dynamic `await import()`, and a single-quoted `export *`. | All four GREEN - U3's filter tests `line.includes(' from "')`, double quotes only. Executed as H2-H5 in section 3.2. **Expected NOT to discriminate.** An implementer must record these four as expected survivors, NOT as failed kills. **The U3 hole itself is now backlog row A23's obligation, not a residual of this document (section 11) - see also the sequencing correction in section 10.** | **NO, by measurement - see A23** |
| S14 | AC-2 | **NEW in round 3.** Create `src/app/components/ScratchConsumer.tsx` containing `import { x } from "./grading-results/gradingResultsHelpers";` and do NOT add it to `CLIENT_FILES`. Delete the file afterwards. | Non-local equality RED - `nonLocalConsumers` now includes `"../ScratchConsumer.tsx"` and `CLIENT_FILES`'s non-local subset does not. **This state was UNCHECKABLE under round 2's frozen literal** - the literal only ever compared to itself, never to the tree, so a real new consumer left unregistered was invisible to AC-2 entirely. This is the improvement the widened requirement (section 4(c)) buys, not a restatement of S11/S12. | YES (new in round 3, and newly REPRESENTABLE as a test at all) |

**On S5.** The local equality compares `localFiles` (post-filter) to the
`./` entries. A reinstated filter shrinks BOTH sides symmetrically, so it does
not detect the restoration of an exemption mechanism - it detects an
unregistered FILE. This is an honest limit of the construction and I am not
going to paper over it with a `grep`-for-the-identifier assertion dressed up as
a criterion, because that is the name-shaped answer to a channel-shaped
question this seat is warned about. **The round-1 checker ruled that NAMING it
is sufficient and that no in-file assertion can kill it, since any assertion
can be edited in the same diff. That ruling is adopted and this note stands
unchanged for S5.** The real defence against S5 is that it is a visible,
arguable diff in a guard file, which is the property section 4(b) asks for.

**Round 3 correction: that ruling does not extend to the non-local half, and
round 2 applied it one case past its warrant.** "No in-file assertion can
kill it, since any assertion can be edited in the same diff" is true of an
exemption FILTER (S5) - the filter is code, and code can always be rewritten
alongside whatever it would otherwise trip. It is not true of a value a test
merely FREEZES, which is what blocker B1 exploited: a frozen literal could be
edited into agreement with a deletion in the very same diff that performed
the deletion, because the literal carries no information the tree could
contradict it with. Ruling R1 (section 4(c)) replaces that frozen literal
with a computed oracle for exactly this reason - a computed assertion cannot
be edited into agreement with a stale `CLIENT_FILES` without also deleting
the consumer file the assertion reads from. S11 and the new S14 are the
executed proof.

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
| 0 | `git status --short` - must be clean before starting. Capture `npm test` totals as the AC-4 baseline, and `npm run lint`'s warning count plus its `(file, rule)` pairs as the AC-5 baseline (major MA-2). | clean tree, recorded M and recorded lint baseline |
| 1 | Edits A then B in `classTrendsEntry.ts`; Edits E, F, D, C in `gradingResultsHelpersWiring.test.ts` - **in that order**, per section 5's order-dependency table. | - |
| 2 | `npx vitest run src/app/components/grading-results/ src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts` | all green |
| 3 | Sabotage pass S1-S4, S6, S7, S9, S11, S12, S14 as kills; record S5, S8, S10, S13 as expected non-discriminators. Restore each mutation from a COPY. | each named kill observed; each named survivor observed to SURVIVE |
| 4 | `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` | AC-4, AC-5 |
| 5 | Re-measure both edited files with `@(Get-Content <f>).Count` and `wc -l`, against section 2.6's projected 53 and 241. | both instruments agree; a disagreement is a finding, not a rounding |
| 6 | `git status --short` against the two-path assignment; confirm no `.claude/worktrees` copy was edited. | exactly two paths |

`npx tsc --noEmit` has exactly one caller here and it is this wave gate
(`this-repo.md` section 2). Do not run it concurrently with another agent.

**Disjointness, CORRECTED IN ROUND 3 BY RULING R2 - the original claim in
this section was wrong, and the collision it missed is the orchestrator's,
not either author's.** This section previously said A22's write set "does not
intersect ... A23 (`repo-grades/`)". That was true when it was written, in the
sense that A23 as FILED covered only
`repoGradesFeedbackAndFiles.wiring.test.ts`. It stopped being true at
`48907e4`, which widened A23 to also cover Ruling U3's walled-set guard - and
that guard lives at `gradingResultsHelpersWiring.test.ts:122-131`
(pre-A22 addressing), **one of A22's own two owned files.** `48907e4` is an
ancestor of the commit that carried the stale sentence forward, so the fact
was in the tree; the miss is real, and it is the orchestrator's, because
widening a backlog row's file coverage without re-deriving every other row's
intersection against it is exactly the failure `parallel-disjointness.md`
exists to prevent.

**A22 and A23 INTERSECT BY EXACT PATH** on
`gradingResultsHelpersWiring.test.ts`, which `parallel-disjointness.md:12-14`
makes disqualifying on its own. They also intersect in the SECOND sense
`parallel-disjointness.md:30-32` describes - informational coupling that
passes every file-level check and is invisible until integration: AC-3 pins
U3's frozen literal as a criterion A22 must not disturb, so A22 designs
against a fact (the shape of the U3 assertion) that A23 is chartered to
change. Two agents working both rows at once would each be internally
correct and mutually incompatible the moment either one lands.

**RULING: A22 and A23 are NOT CONCURRENTLY DISPATCHABLE. A22 is sequenced
STRICTLY FIRST.** A23 must not start until A22's wave gate (step 6) is
green and pushed.

**Line-shift obligation, owed by the orchestrator, not by A22 or A23.** This
document's own edits net **+1** for every pre-A22 line at or past `:86`
(Edit C +1, Edit D -5, Edit F +5 - Edit E sits after all of them and does not
change this count, per section 5's order-dependency table). So once A22
lands, Ruling U3's block moves from `:122-131` to `:123-132`, and its filter
from `:127-129` to `:128-130`. **A23's row pins `:127-130` today; those
addresses are pre-A22 and must be re-pinned after A22 lands, before A23 is
dispatched.** That re-pin is recorded here as an orchestrator obligation, not
as A22 scope - A22 does not write `docs/backlog.yml`.

The one shared resource that no file list shows is `tsconfig.tsbuildinfo` at
step 4; it has exactly one caller regardless of sequencing.

---

## 11. Residual register

`iteration-caps.md` and this seat's definition: an entry missing an owner, an
instrument or a step is a DELETION, and a residual not in `docs/BACKLOG.md`
does not exist. **RES-A22-2 has since become backlog row A23 (`ef99101`) and is
therefore no longer a residual - it is struck from this table and carried in
section 3.3 only as the correction A22 owes that row.**

**RES-A22-5 is struck the same way, by Ruling R2 in this round.** A23 was
widened at `48907e4` to cover Ruling U3's walled-set guard verbatim -
including the single-quoted case as a positive control, exactly what
RES-A22-5 specified - so the obligation has a live receiver and is no longer
a residual of THIS document. It is not restated in the table below; section
10 carries the sequencing correction (A22 and A23 now intersect by exact
path and are not concurrently dispatchable) and the line-shift obligation the
orchestrator owes A23's row once A22 lands.

**Of the remaining two (RES-A22-1, RES-A22-3), NEITHER is in `docs/BACKLOG.md`
yet.** RES-A22-4's own instrument, below, still exists as a note for the next
sweep but is unaffected by this round. This document does not own
`docs/backlog.yml` or `docs/BACKLOG.md`. Until the orchestrator adds these at
the push, they are deletions, and I am calling them that rather than implying
otherwise.

| id | Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| RES-A22-1 | `BANNED_IMPORT_PATTERNS` is applied to RAW source at `gradingResultsHelpersWiring.test.ts:111-116`, so a correct file that merely DISCUSSES the barrel in a comment goes red. Measured live risk: `ungradedDisclosure.ts:14,18` name the barrel in prose; section 2.5 (corrected in round 3, minor m-v) shows neither actually fires under any reflow today. A22 mitigates with a note at both ends (Edits B and F) anyway, not by changing the instrument (section 3.4 says why). | Orchestrator, as a new backlog row | The guard itself - it fails LOUD and in the safe direction | The next wave that edits any file under `src/app/components/grading-results/`; if it reds on a comment, this residual converts to a chunk |
| RES-A22-3 | The completeness sweep's extension test is `/\.(ts\|tsx)$/` (`:139`), so a `.js`/`.jsx`/`.mjs`/`.cjs` file, OR any file in a SUBDIRECTORY of this directory, is never enumerated and never registered - both are the same class, "an unregistered local file", that section 0's summary paragraph must now name explicitly (major MA-1). No such file or subdirectory exists today: 21 entries, 15 `.ts` + 6 `.tsx`, 0 subdirectories (section 2.3). Sabotage S8 is the expected non-discriminator that pins the extension half. | Orchestrator, as a low-priority backlog row | Widen the extension test to `/\.(ts\|tsx\|js\|jsx\|mjs\|cjs)$/` **and** make the enumeration recursive (`readdirSync` with `withFileTypes: true`, walking into subdirectories) **or** add an explicit assertion that the directory has zero subdirectories, so a future nested file cannot silently escape either. Add S8's `scratch.mjs` fixture and a nested-file fixture as canaries that must go RED before the widening lands. | **Narrowed in round 2 (minor m6): the next wave that adds a non-`.ts`/`.tsx` file, or a subdirectory, to `src/app/components/grading-results/` specifically - that is the only directory this non-recursive filter enumerates - OR the next wave that copies this sweep idiom into another directory.** Round 1's step was "anywhere under `src/app/components/`", which is hundreds of files this filter never reads |
| RES-A22-4 | 16 non-test files outside this directory still type-only import the `@/lib/grade` barrel (17 total, minus `classTrendsEntry.ts`; re-measured this round, and 0 single-quoted variants). None is a bundle hazard (type-only erases) and none is inside a completeness sweep today, so nothing is broken. But the next directory to grow its own sweep hits this wall exactly as `grading-results` did. **Amendment, carried through round 3: that next directory must NOT inherit round 1's belief that `@/lib/grade/types` is a walled destination - see backlog row A23. The wall is the constraint it will design against, and the wall is measured porous.** | Orchestrator, as a note on whichever row adds the next sweep | `grep -rn 'import type .* from "@/lib/grade"' src --include=*.ts --include=*.tsx \| grep -v "\.test\."` (17) and its single-quoted twin (0), re-run | Whenever a second directory-completeness sweep is proposed |

**RES-A22-5's underlying obligation is not just relocated - part of it is
already discharged.** The claim it existed to correct - that Ruling U3's
replacement "can only be defeated by an unusually-formatted comment" - was
itself fixed in `docs/a12-a13-scope.md` at `a9740f0`, which inserted the same
five-hazard table this document independently measured (section 3.2) and the
same single-quoted-positive-control instruction, now at
`docs/a12-a13-scope.md:864-899`. What A23 still owes is the FIX to the
walled-set filter itself (section 3.3's "THE HONEST OPTIONS"), not the
correction of the false claim about it, which is done.

---

## 12. Disposition tables

### 12.1 Round-1 findings, every one disposed

The id column was re-derived LAST, after sections 8 and 9 were renumbered.

| Finding | Class | Disposition | Where it landed |
|---|---|---|---|
| **B1** - Edit E leaves `../GradingResults.tsx` in no set on either side; deleting it keeps every gate green, and nothing else in the repo guards that file | "a check whose assertion cannot fail for the object it most needs to protect" | **REVISED - accepted in full, blocker confirmed by my own execution. Round 2's chosen fix (a frozen literal) was ITSELF superseded in round 3 by Ruling R1 for a narrower version of the same class - see section 12.3's BL-2 row.** | Section 4(c): the hole reproduced (`GREEN - HOLE CONFIRMED`), the two-banned-guard census pasted, the fix chosen at the time as a SEPARATE frozen-literal assertion with the oracle argument for why not folded; Edit E2 in section 5.2 (now a computed oracle, not a literal); AC-2's second pair; sabotage S11 and S12, both executed kills. Round 1's false sentence in 4(c) is quoted and retracted in place |
| **B2** - section 3.2 justified fix (1) on a U3 wall that is measured false; four of five hazards escape | "an obligation discharged by citing a document without opening it" | **REVISED (a), plus (c) RESIDUAL for the underlying hole** | (a) Section 3.2 withdraws the construction claim, re-executes the five hazards, and states the disposal fix (2) actually gets: **(d) Delete on the caps' repeat rule alone**, with `BANNED_IMPORT_PATTERNS`' whole-file scan named as the enforcer it protects. Fix (1) is re-characterised as a SCOPE REDUCTION resting on a separately measured fact, not a construction. (b) **RES-A22-5** added with owner, instrument and step. (c) Sabotage **S9 respecified double-quoted** and **S13** added as the measured non-discriminator |
| **M1** - five real stale citations plus three marginal | "a citation carried forward without opening it" | **REVISED - all eight corrected, and a ninth found** | `backlog.yml:418-428` / `:424` / `:427` / `:428` (sections 0 header, 1, 2.1, 12.2); `registry.test.ts` `:86-95` and `:136-142` and the equality at `it(` `:116` / assertion `:120` (sections 4(a), 7.2); repo-grades filter `:295-297` (section 3.3); Edit F's insertion point `:86` (section 5.2, also minor m2). **Ninth, found in round 2 and not on the checker's list: `docs/BACKLOG.md:62` is the table separator; the A22 row is `:63`** (section 2.1) |
| **M2** - delete AC-2; it cannot fail except when AC-3's equality already fails | "a criterion with no independent failure mode" | **(d) DELETE, with the enforcer named and the claim measured** | Section 8: round-1 AC-2 deleted, **AC-2 (formerly AC-3) named as the enforcer it was protecting**, and the four-state execution added showing its only independent firing is a FALSE POSITIVE on legitimate file deletion. Ids re-derived last: old AC-3..AC-7 became AC-2..AC-6 |
| **m1** - Edits D and E cite pre-edit line numbers that shift | "an instruction whose addresses are invalidated by its own earlier steps" | **REVISED** | Section 5's ORDER DEPENDENCY table: descending line order per file, with all addresses declared pre-edit against `ef99101` |
| **m2** - Edit F's insertion point is `:86`, not above `:88` | same class as M1 | **REVISED** | Section 5.2's Edit F, with the reason (it would split the Ruling R part 2 comment from its declaration) stated in the packet so an implementer cannot re-introduce it |
| **m3** - `classTrendsEntry.ts` projects to 53, not about 49 | "an unmeasured number in an artifact" | **REVISED - estimate replaced by measurement** | Section 2.6: both files materialised into `%TEMP%\a22proj\` from section 5's literal text and counted with both instruments - 53 and 228, agreeing. Arithmetic shown. Wave-plan step 5 re-measures |
| **m4** - section 0 claims an exemption is not representable; section 9's S5 concedes it is | "an artifact contradicting itself between its summary and its evidence" | **REVISED - section 9 was right, section 0 rewritten** | Section 0's second paragraph now enumerates the three states that ARE unrepresentable and the one that is not, citing S5. Section 4(c) does the same in full after the mutant table |
| **m5** - the not-postable walker's `IMPORT_RE` is not single-line; `\s` spans newlines | "a claim about a regex made by reading it" | **REVISED, and not re-litigated in round 3** | Section 7.2's first row: the pattern is quoted from `:96` and re-described as MULTI-line. Conservative direction, conclusion unchanged, and said so. (Round 3, minor m-vi, separately corrected that same row's "double-quote-blind" wording to "single-quote-blind" - a labelling fix on top of m5's finding, not a re-opening of it.) |
| **m6** - RES-A22-3's step is far broader than the directory it protects | "a residual whose step will not actually fire on the thing it guards" | **REVISED - narrowed** | RES-A22-3's step column in section 11, narrowed to this one non-recursive directory plus any copy of the idiom, with the old wording quoted |
| **m7** | - | **NOT RECEIVED - cannot be disposed** | The checker's counts say 7 minors. Six reached me (m1-m6 above); the brief transmitted no seventh. **I am not inventing a finding to fill the row.** The orchestrator should either forward m7 or correct the count. Flagged here rather than in section 13 so it sits inside the table the caps card requires to be complete |

### 12.2 Disposition of the questions the BACKLOG row posed

Not a restructuring table in `iteration-caps.md:119`'s sense. This maps the
row's own named items to this artifact's answer, so a checker can see nothing
the row asked was dropped. The id column was derived last.

| Row item (`docs/backlog.yml:428`, the `note:` field) | Disposition | Where it landed |
|---|---|---|
| Fix (1) - change the import to `@/lib/grade/types`, "check first that every symbol the file needs actually lives in types.ts" | **ADOPTED**, precondition verified | Section 2.2 (both symbols, `types.ts:308` and `:329`); Edit A, section 5.1; AC-1 |
| Fix (1)'s stated caution - "the A12/A13 round also added a guard that types.ts itself stays free of value imports, so widening what flows through it is not free" | **DOES NOT FIRE for A22 - and the guard it names is WEAKER than the row believes** | Section 2.2: the barrel already sources both symbols from `types.ts`, so nothing moves; AC-3 is the standing proof that A22 widened nothing. **But section 3.2 measures that guard passing four of five hazards, so the row's premise that `types.ts` is protected is false going forward - backlog row A23 owns it (round 2's RES-A22-5, struck in round 3, section 11)** |
| Fix (2) - teach the guard to distinguish type-only from value imports | **REJECTED, (d) DELETE, with the enforcer it would have protected named** | Section 3.2: a repeat of the disposed `VALUE_IMPORT_PATTERN` class under `iteration-caps.md:41-43`. The protection it would have offered - catching a genuine VALUE barrel import - is unaffected: `BANNED_IMPORT_PATTERNS` keeps that whole-file, and section 3.3 notes the crude form is the reason it cannot have the multi-line hole. The measured shortfall in the sibling implementation is backlog row A23 (`ef99101`) rather than being absorbed |
| "decide whether the carve-out list should exist at all once the one entry is gone" | **ANSWERED: delete, and upgrade the assertion so the WHOLE array is pinned** | Section 4, with the set-equality and frozen-literal verification pasted, the executed mutant matrix, and the two things that would change the call stated concretely |
| The row's `instrument` field (`:424`) naming `gradingResultsHelpers.test.ts` as the carve-out's home | **CORRECTED - the row is stale** | Section 2.1. The carve-out is in `gradingResultsHelpersWiring.test.ts:81-84,142`. The orchestrator should fix the row at the push, and also `docs/BACKLOG.md:63` |
| The brief's claim that the sweep filter "misses `.test.tsx` and `.d.ts`" | **REFUSED - disproved against the tree, and the refusal was confirmed by the round-1 checker** | Section 2.3: `:139` excludes both explicitly. A different, real gap (non-`.ts` extensions) is recorded as RES-A22-3, and the checker measured it to have no live instance |

---

### 12.3 Round-2 findings, every one disposed (added in this round)

The round-2 check returned 2 blockers, 2 majors, 6 minors. Both blockers are
REPEAT classes and go to disposal by orchestrator ruling rather than a third
authoring round, per `iteration-caps.md`'s routing table ("Any REPEAT class -
that class goes to disposal now").

| Finding | Class | Disposition | Where it landed |
|---|---|---|---|
| **BL-2** - section 4(c) justified the non-local frozen literal with a non-sequitur ("no directory to enumerate, therefore frozen literal"); a PREDICATED enumeration was never run | REPEAT of "an obligation discharged by citing a document without opening it" / "a check whose assertion cannot fail for the object it most needs to protect" (the same B1/B2 family - a construction proposed without executing the alternative that defeats it) | **Ruling R1 (orchestrator): ADOPT THE PREDICATED COMPUTED ORACLE, disposal by construction, not by another revision** | Section 4(c) rewritten in full: the 83/1 measurement, the self-maintaining argument turned against round 2's own frozen literal, the `RepoGradesGrid.tsx` scope call (parent-directory-only, non-recursive - stays out), the S5-versus-non-local correction to the inherited ruling. Section 5.2 Edit E2 rewritten to the computed oracle (25 lines). Section 2.6's projection re-measured to 241 (materialised, three instruments agreeing). AC-2 and the sabotage table (S11, S12 reworded; S14 added) updated to match |
| **BL-1** - section 10 claimed A22 does not intersect A23; `48907e4` widened A23 to cover a file A22 owns, and the claim was never re-derived | REPEAT of "a citation carried forward without opening it" / stale-fact class (M1/B2 family) - here a STALE DISJOINTNESS CLAIM rather than a stale line number | **Ruling R2 (orchestrator): sequence, do not merge; strike the now-redundant residual; the collision is the orchestrator's own miss, recorded as such** | Section 10 rewritten: exact-path intersection on `gradingResultsHelpersWiring.test.ts`, the second-sense intersection via AC-3, NOT CONCURRENTLY DISPATCHABLE with A22 strictly first, and the line-shift obligation (`:122-131`/`:127-129` -> `:123-132`/`:128-130`) owed by the orchestrator. Section 11 strikes RES-A22-5, treated exactly as RES-A22-2 was. Section 3.3 corrected to name which file A23 now also covers. Section 3.2's `:863-864` citation corrected to note `a9740f0` already fixed the cited document |
| **MA-1** - section 0 claimed three unrepresentable states while section 4/S8 concede a `.mjs` survives, AND the subdirectory case (non-recursive `readdirSync`) had no owner anywhere | "a residual whose guarding statement contradicts its own evidence" (m4-adjacent) plus "an obligation named nowhere" (a new class - a gap with no residual, no sabotage row and no representability note is a deletion per `iteration-caps.md:36-37`, cited in the finding as MA-1's own text) | **REVISED** | Section 0's summary paragraph now names both exceptions (extension, subdirectory) explicitly. Section 4(c)'s "Still representable" list does the same. RES-A22-3's row (section 11) extended to name the subdirectory case in its own text AND its instrument (`withFileTypes` recursive walk, or an explicit zero-subdirectories assertion) |
| **MA-2** - AC-5 mandated `this-repo.md`'s dated warning list as an absolute, one paragraph after AC-4 refuses to do exactly that for the test count; the anchor list has moved (`repoGradesSliceA.guards.test.ts:83` is now a comment line) | "an artifact contradicting itself between adjacent criteria" (m4-family, applied to a sibling AC pair rather than a summary-versus-evidence pair) | **REVISED** | AC-5 rewritten to capture its own pre-wave baseline (count plus `(file, rule)` pairs) at wave-plan step 0 and compare DELTA, exactly as AC-4 does for M. Wave-plan step 0 updated to capture both baselines |
| **m-i** - section 2.1 called the ninth stale citation the "sixth"; sections 12.1 and 14 called it the "ninth" | "an artifact contradicting itself between its own sections" | **REVISED** | Section 2.1 corrected to "ninth" throughout, with the inconsistency named in place rather than silently fixed |
| **m-ii** - two off-by-ones, each cited more than once: `DEV_LOOP.md` "lines 103-105" (phrase opens at `:102`) and `iteration-caps.md:40-42` (`:40` is blank, rule runs `:41-43`) | "a citation carried forward without opening it" (M1-family, found again) | **REVISED** | Section 1's leverage paragraph re-cited to `DEV_LOOP.md:102`. Both `iteration-caps.md:40-42` citations (section 3.2, section 12.2) corrected to `:41-43` |
| **m-iii** - AC-4's "taking that block from 12 to 11-plus-1" was garbled prose over a correct fact | "a claim garbled in the writing, not the measurement" | **REVISED** | AC-4 reworded: 11 cases today, 12 after Edit C, measured by `CLIENT_FILES.length` |
| **m-iv** (NEW) - Edit B's constraints (ii) "still explain the hazard" and (iii) "warn the next editor" have no instrument, and section 2.6 waives the line count as a proxy, but the packet implied RES-A22-1's mitigation was held together by something | "an obligation implied to be enforced when nothing enforces it" (new class this round) | **REVISED** | Section 5.1 states plainly that only constraint (i) is instrument-checked (AC-1); (ii) and (iii) are UNENFORCED, resting on implementer/reviewer judgment |
| **m-v** - section 2.5 overstated risk: `ungradedDisclosure.ts:13-14`'s `from` IS the immediately preceding word, and the specifier there is the EXEMPT `@/lib/grade/types`, so it cannot fire under any reflow; "one word away from firing on a second correct file already" was not supported | "a claim about proximity made without checking what the guard actually exempts" (new class this round, though it is the section 2's opening paragraph's corrective rule - run the thing - applied to a claim this document itself made) | **REVISED** | Section 2.5 rewritten: both cited lines are safe by CONSTRUCTION (the exemption pattern for `:13-14`, the missing trailing slash for `:18`), not by narrow phrasing luck. RES-A22-1 itself is unchanged - it is still a real residual, just not evidenced by these two examples |
| **m-vi** - section 7.2 cited `valueImportSpecifiers` at `:98-100` "which skips `match[1] === "type "`" (function opens `:98`, skip is `if (match[1]) continue;` at `:101`, outside the cited range and not an equality test); and "double-quote-blind" reads as the opposite of what it means | "a claim about code made by reading an adjacent line, not the one doing the work" (regex/code-reading class, sibling to m5) | **REVISED, m5 itself not re-litigated** | Section 7.2's first row: citation corrected to `:98-101`, the skip described as a truthy check rather than a string equality, and "double-quote-blind" corrected to "single-quote-blind" (the pattern requires a literal double quote, so it MISSES single-quoted imports). m5's own disposition-table cell (section 12.1) updated to drop the same backwards term without reopening m5's finding |

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
- **Whether the two edited files actually land at 53 and 241 lines.** Section
  2.6's figures are counts of MATERIALISED PROJECTIONS built from section 5's
  literal text in a temp directory, not of the real files, which I did not
  touch. If the implementer rewords Edit B's comment - which section 5.1
  permits - the 53 moves, and the same is true of the 241 if the implementer
  reformats Edit E2's comment (section 5.1's constraint (i) is enforced;
  (ii) and (iii) are not, per minor m-iv; Edit E2 carries no equivalent
  wording constraint at all, only the behaviour the code must have). Wave-plan
  step 5 measures the real files
  with both instruments.
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
  well not be. Backlog row A23 owes that analysis (it inherits this
  obligation from round 2's RES-A22-5, struck in section 11); A22 asserts only
  that the guard's stated coverage is false.
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

- **Round 3 is a disposal round: both round-2 blockers were REPEAT classes and
  are disposed here by orchestrator ruling, not by a fourth authoring round.**
  Rulings R1 and R2 are applied in place, not merely referenced; nothing below
  restates round 2's since-superseded design.
- Recommended fix: **(1), narrow the specifier** - plus a mandatory comment
  reword that the row did not anticipate and that section 2.4 measured.
- Carve-out: **delete**, and replace containment with TWO comparisons - a
  computed set equality over the `./` entries and, per Ruling R1, a SECOND
  COMPUTED equality over the non-`./` entries (the parent directory's actual
  consumers), not the frozen literal round 2 proposed. Both blocker B1's hole
  and its round-2 successor (a hand-frozen value that could still be edited
  into agreement with a deletion) are closed by construction rather than by a
  value a human must remember to update.
- **Fix (2)'s disposal is (d) DELETE on the caps' repeat rule alone.** The
  "construction that makes the bad state unrepresentable" claim is WITHDRAWN:
  U3 does not wall `types.ts` (four of five hazards escape, executed). Fix (1)
  is a SCOPE REDUCTION onto a path whose safety is a separately measured fact,
  not an enforced invariant.
- Two files, one wave, one implementer, edits applied in DESCENDING line order.
  The build packet is sections 5-10. **`gradingResultsHelpersWiring.test.ts`'s
  projected size moved from 228 (round 2) to 241 (round 3), materialised and
  confirmed by three counting instruments, because Edit E2 grew from 12 lines
  to 25.**
- The row's own address for the carve-out is stale in both `docs/backlog.yml`
  (`:424`) and `docs/BACKLOG.md` (`:63`) and should be corrected at the push.
- **A22 and A23 are NOT concurrently dispatchable and must be sequenced, A22
  first (Ruling R2).** They intersect by exact path on
  `gradingResultsHelpersWiring.test.ts`, a fact this document missed until
  this round because A23 was widened at `48907e4` after this document's
  disjointness claim was written. The orchestrator owes A23's row a re-pin of
  its `:127-130` address to `:128-130` after A22 lands (section 10).
- **Two residuals remain undischarged (RES-A22-1, RES-A22-3), none yet in
  `docs/BACKLOG.md`.** RES-A22-2 became row A23 at `ef99101`; RES-A22-5 is
  struck this round for the same reason - A23 was widened to carry it
  verbatim, including the single-quoted positive control. RES-A22-4 stays as
  a note for whichever row adds the next sweep, unaffected by this round.
  Section 3.3 still carries the one correction A22 owes A23's fixtures - each
  must state the DIRECTION it pins, because fixture 3 currently pins wrong
  behaviour - plus the newer correction that A23 now also owns the U3 filter,
  with the line-shift obligation above.
- The weakest points in this artifact, named so a checker does not have to find
  them: sabotage S5 is not killed by the computed construction either, for a
  different and narrower reason than the non-local half (section 9's note,
  corrected in round 3 to say the round-1 ruling does not extend past S5); the
  full-file 241 projection is arithmetic-plus-materialisation over section 5's
  literal text, not a count of a file that exists yet; and the seventh round-1
  minor was never transmitted, so section 12.1's table still has one row I
  could not fill honestly.
