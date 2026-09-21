# A22 - close the `KNOWN_UNREGISTERED_LOCAL_FILES` carve-out

Architecture seat, 2026-09-20. Row A22 in `docs/backlog.yml:418-427`
(`kind: 'chore'`, `area: 'grading-run-survival-and-disclosure'`).

This document is the design artifact a `loop-checker` reads before an
implementer does. Sections 1-4 and 11-14 are argument addressed to the checker
and the orchestrator. Sections 5-10 are the build packet.

No prior version of this file exists (`ls docs/ | grep -i a22` returned
nothing before this file was written), so there is no restructuring
disposition table in the sense `iteration-caps.md:119-122` means. Section 12
instead dispositions the three questions the BACKLOG row itself posed, which
is the closest thing to a prior requirement set here, and says plainly that
that is what it is.

---

## 0. The disposition, in one paragraph

**Take fix (1): change the import specifier in
`src/app/components/grading-results/classTrendsEntry.ts` from `@/lib/grade`
to `@/lib/grade/types`.** Both symbols it needs are declared in `types.ts`
(measured, section 2.2), so the row's stated precondition holds and nothing
new has to flow through the walled type surface. **Reject fix (2)** - teaching
the guard to classify type-only imports - on measured grounds, not taste: the
population it would serve inside this guard's scope is one file, and that file
is the one fix (1) removes; and this repo's only existing implementation of
that idea, 60 lines away in a sibling directory, is defeated today by a
multi-line import (section 3.3, executed). **Fix (1) is not a one-line change**
and an implementer told otherwise will land a red suite: the guard scans RAW
SOURCE, and `classTrendsEntry.ts:22` carries the banned character sequence
inside a doc comment (section 2.4, executed). The comment must be reworded in
the same edit. **Delete `KNOWN_UNREGISTERED_LOCAL_FILES` entirely**, and
replace the completeness sweep's containment assertion with a SET EQUALITY so
that an exemption is not representable at all rather than merely absent
(section 4).

---

## 1. Leverage

**No claim. Trigger fired and recorded, per `docs/loop/leverage.md` and
`docs/loop/seats.md`'s Acceptance-criteria brief ("On a bug fix, a refactor, a
doc correction or an owner verification there is no claim to make; record that
as the fired trigger and move on").**

The fired trigger: A22 builds and changes no capability a user reaches. Its
entire write set is one import specifier, one source comment, and one test
file. `docs/backlog.yml:425` classifies the row `kind: 'chore'`. `DEV_LOOP.md`
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
`C:\Users\alexa\OneDrive\Documents\Projects\teaching-assistant` on 2026-09-20.

### 2.1 Where the carve-out actually lives NOW - the row's own pointer is stale

`docs/backlog.yml:424` and `docs/BACKLOG.md:62` both say the carve-out is in
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
moves no declaration, adds no import TO `types.ts`, and cannot disturb Ruling
U3's walled-set guard, which asserts a property of `types.ts`'s OWN imports
(`gradingResultsHelpersWiring.test.ts:122-131`: exactly one non-comment line
containing ` from "`, frozen to
`import type { CodeRunResult } from "../code-runner";`). Verified by reading
that assertion and `src/lib/grade/types.ts:1`.

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
would face the same wall.

### 2.3 What the sweep currently enumerates, and what it exempts

Filter replicated verbatim from
`gradingResultsHelpersWiring.test.ts:137-142`:

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
carve-out at `:84` is exactly what keeps that omission from reddening `:135`.

**The brief handed to this seat said a sibling had found this filter missing
`.test.tsx` and `.d.ts`. Measured, that is not true of THIS filter.** Line 139
reads:

```
(n) => /\.(ts|tsx)$/.test(n) && !n.endsWith(".test.ts") && !n.endsWith(".test.tsx") && !n.endsWith(".d.ts")
```

Both exclusions are present. I am refusing that handed-down fact rather than
adopting it, per this seat's standing instruction. What the filter DOES miss
is a different thing, and it is real: the extension test is `/\.(ts|tsx)$/`,
so a `.js`, `.jsx`, `.mjs` or `.cjs` file placed in this directory is never
enumerated and therefore never registered, silently. There is no such file
today (the `ls` above is the whole directory's `.ts`/`.tsx` population and
`ls -la src/app/components/grading-results/` shows no other extension), and
`find src/app/components/grading-results -mindepth 1 -type d | wc -l` returns
`0`, so the non-recursive `readdirSync` at `:137` has nothing to miss below it
either. Recorded as RES-A22-3, not fixed here.

### 2.4 THE FINDING THAT CHANGES THE SHAPE OF FIX (1)

The banned-import assertion at `:111-116` reads the file's RAW source and
matches the patterns against the whole string:

```
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
node -e '...'   # print every line of classTrendsEntry.ts matching /from ["']@\/lib\/grade["']/
```

```
22: // Type-only imports from "@/lib/grade" only - see GradingResults.tsx's own
25: import type { GradingRun, GradingRunEntry } from "@/lib/grade";
```

Executed, changing ONLY the import on line 25 and leaving line 22 alone:

```
node -e '...'   # apply the specifier change to line 25 only, re-run all four BANNED_IMPORT_PATTERNS
```

```
line 22 raw: "// Type-only imports from \"@/lib/grade\" only - see GradingResults.tsx's own"
line 25 raw: "import type { GradingRun, GradingRunEntry } from \"@/lib/grade\";"
pattern0 matches line 22 ? true
--- Fix 1 = change ONLY the import line 25 ---
  raw-source match count      : 1   (0 = green, >0 = RED)
  comment-line-filtered count : 0
--- Fix 1 + reword the comment on line 22 ---
  raw-source match count      : 0
```

**Fix (1) applied to the import alone leaves the file failing the guard.** The
comment is part of the fix, and section 5 specifies it rather than leaving it
to the implementer.

I nearly published the opposite of this. A first pass used a non-global
`String.replace`, which rewrote the FIRST match - the comment - and left the
real import untouched, producing a reading that looked like "fix 1 does not
help at all". The line-indexed run above is the one this document relies on.
Stated because the caps card's entry gate is about the command, and a
plausible command can still be the wrong command.

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

### 2.6 Line counts, both instruments

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

Both instruments agree on all seven. Neither edited file is near the 1000-line
ceiling enforced by `src/file-size-ceiling.structure.test.ts` (`LIMIT = 1000`
at `:30`), and
`grep -n "grading-results" src/file-size-ceiling.structure.test.ts` returns
nothing, so no file in this directory sits on the `ALLOWED_OVERAGE` ratchet
and none can be tripped by shrinking.

Projected after the section-5 edits, to be re-measured by the wave gate:
`gradingResultsHelpersWiring.test.ts` about 218 - 5 (carve-out block and its
filter line) + 5 (one `CLIENT_FILES` entry, the equality assertion's extra
lines, the editor note) = about 218, and `classTrendsEntry.ts` about 46 + 3 =
about 49. Estimates, flagged as such; the gate measures.

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

### 3.2 Fix (2) is a REPEAT of a class this repo already disposed

`docs/a12-a13-scope.md:813-828` records Ruling U3 withdrawing
`VALUE_IMPORT_PATTERN` (`/^import(?!\s+type\b)\s/m`) after it was executed
against the real tree and found to miss `export { X } from "..."`,
`export * from "..."`, `require("...")` and `await import("...")`. The
replacement was deliberately NOT a better classifier - it was a walled-set
count (`gradingResultsHelpersWiring.test.ts:122-131`).

`iteration-caps.md:40-42` forbids answering a repeat failure by strengthening
the same mechanism, and `:13-16` lists the three moves that have ever ended a
chain here: RELOCATE, ESCALATE, or replace the assertion with a CONSTRUCTION
that makes the bad state unrepresentable. Fix (1) is the third of those: the
safe module is a DIFFERENT PATH, and `types.ts` is itself walled by U3, so the
exemption cannot quietly become false. Fix (2) is a fourth round of the
classifier.

### 3.3 And the classifier is already broken here, measured

This repo does have a type-only classifier, in the adjacent directory:
`src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts:287-291`
filters to lines matching `/^\s*import\b/` and not `/^\s*import\s+type\b/`,
then tests the banned patterns against those lines.

Executed against three fixtures:

```
node -e '...'   # replicate the repo-grades line filter, run the banned patterns over three import shapes
```

```
single-line VALUE import flagged (want true) : true
MULTI-LINE VALUE import flagged (want true)  : false
inline all-type import flagged (want false)  : true
```

Two defects, one in each direction. A **multi-line** value import -

```
import {
  composeOverallComment,
} from "@/lib/grade";
```

- escapes entirely, because the `from` clause sits on a line that does not
begin with `import`, so it is never collected and never tested. That is a
FALSE NEGATIVE in a live guard whose whole purpose is catching the one defect
`next build` alone catches. And `import { type A, type B } from "@/lib/grade"`
- an all-type inline-modifier import, which is erased at build exactly like
`import type` - is flagged, a false positive.

Nobody noticed either. This is the strongest available evidence about what fix
(2) costs: the version of it this repo already runs has been wrong in both
directions since it landed. Relocated to RES-A22-2; A22 does not own that
file.

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
freedom in comments. That trade is the wrong way round.

**Chosen: reword the one comment, and document the constraint at both ends.**
The residual failure mode is a FALSE POSITIVE - loud, immediate at the wave
gate, trivially fixed, and safe in direction. It is recorded as RES-A22-1
rather than machined away.

I record this as a deliberate acceptance of a sharp edge, not as an absence of
one. A checker should attack it: the counter-argument is that making source
prose bend to an instrument is the seam pointing the wrong way. My answer is
that the guard's crudeness is its only defence against the section-3.3 class,
and one reworded sentence is a cheaper price than a false-negative channel.

---

## 4. Should `KNOWN_UNREGISTERED_LOCAL_FILES` continue to exist?

**Recommendation: DELETE it, and go further - make an exemption
unrepresentable rather than merely empty.**

Three reasons, in order of weight.

**(a) It is not the idiom it claims to follow.** The carve-out's comment cites
this repo's `DELIBERATELY_UNREGISTERED` precedent. That structure is
`Record<string, string>` - key to a DEFENDED REASON -
(`src/lib/client-state-sweep.registry.test.ts:86-96`) and a dedicated test
iterates it and asserts on each reason:
`:137-143`, `expect(reason.trim().length, ...).toBeGreaterThan(10)` plus
`expect(known.has(key), "...is listed as a deliberate exception but no longer
exists").toBe(true)` - so a stale exemption for a deleted cache FAILS.
`KNOWN_UNREGISTERED_LOCAL_FILES` is a bare `string[]` whose reason floats in a
comment at `:81-83` and is asserted on by nothing; a stale entry for a deleted
file would sit there forever, green. It is a weaker imitation of the idiom,
and the gap is exactly the "instrument that reads clean while measuring less
than it claims" class.

**(b) An empty list with a live `.filter()` reads as sanctioned capacity.** The
mechanism survives its one justified use and becomes a one-line, review-free
way to make any future red go away. The row's own text names this ("an empty
escape hatch invites use") and I agree with it.

**(c) Deletion can be made stronger than deletion.** Today `:143` asserts
containment:

```
for (const name of localFiles) expect(CLIENT_FILES).toContain(name);
```

Containment permits a stale `CLIENT_FILES` entry for a file that no longer
exists, and it is the shape an exemption list attaches to. Replacing it with a
SET EQUALITY against the `./`-prefixed entries makes both failures impossible
by construction - you cannot exempt a file without removing it from the
directory, and you cannot leave a dead registration behind. Verified that the
two sets coincide after fix (1) and do not before it:

```
node -e '...'   # compare the sweep's enumerated set to the ./-prefixed CLIENT_FILES entries
```

```
localFiles (sweep) count: 11
proposed CLIENT_FILES ./ count: 11
SET EQUAL AFTER FIX: true
SET EQUAL TODAY (10 entries): false
```

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
cheaper answer would be to widen the type surface once rather than to
re-open the exemption; that is a decision for whoever hits it, with Ruling
U3's walled-set guard as the constraint to satisfy.

---

## 5. The build packet - exact edits

Two files, one wave. Section 6 explains why they cannot be split.

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
the next editor. Suggested text, and the implementer may reword it provided
constraints (i)-(iii) hold and AC-1 stays green:

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

**Edit C - register the file.** Add to `CLIENT_FILES` (`:62-79`), after the
`./ungradedRowLabel.ts` entry:

```ts
  "./classTrendsEntry.ts", // A22: the ClassTrendsPanel adapter, narrowed off the barrel onto @/lib/grade/types.
```

**Edit D - delete the carve-out.** Remove lines 81-84 entirely (the
`KNOWN GAP` comment block and the `KNOWN_UNREGISTERED_LOCAL_FILES`
declaration), and remove the `.filter(...)` line at `:142` that consumes it.
After this edit `grep -n "KNOWN_UNREGISTERED" src/app/components/grading-results/gradingResultsHelpersWiring.test.ts`
must return nothing.

**Edit E - upgrade containment to equality.** Replace `:143`:

```ts
    for (const name of localFiles) expect(CLIENT_FILES).toContain(name);
```

with a set equality over the local (`./`) entries only, leaving
`../GradingResults.tsx` out of the comparison because it is not in this
directory:

```ts
    expect(localFiles.slice().sort()).toEqual(
      CLIENT_FILES.filter((p) => p.startsWith("./")).slice().sort()
    );
```

Update the surrounding `it(...)` title so it says "exactly" rather than
"every", since the assertion is now bidirectional.

**Edit F - the constraint note.** Immediately above `BANNED_IMPORT_PATTERNS`
(`:88`), add a comment recording that this scan reads RAW source, so a banned
specifier appearing only in a comment reds the file, and that the accepted
mitigation is prose discipline in the scanned files rather than comment
stripping (RES-A22-1, this document section 3.4). Two or three lines.

**Do not** add a `readStrippedSource` call to the `it.each(CLIENT_FILES)`
block. That is the rejected companion in section 3.4 and is out of scope; if a
later round wants it, it goes through RES-A22-1.

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
| `src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts` | **AS SOURCE TEXT.** `:222` makes `classTrendsEntry.ts` a canary-3 walk root; `walkForForbiddenImports` `readFileSync`s it and follows VALUE imports only (`valueImportSpecifiers`, which skips `match[1] === "type "`). | **adopted - must stay green, never edited** | Its `IMPORT_RE` is `/^\s*(?:import\|export)\s+(type\s+)?...from\s+"([^"]+)"/gm`, single-quote-blind and single-line. Edit A keeps `import type` and keeps the clause on one line with double quotes, so the walker classifies it identically before and after. **If an implementer drops the `type` keyword, the walker resolves `@/lib/grade/types` and descends into it; `types.ts:1` imports `../code-runner`, which is on NO forbidden prefix, so this test stays GREEN on that mistake. It is not a backstop for AC-1.** |
| `src/app/components/grading-results/classTrendsEntry.test.ts` | Value-imports the module (`:5`). Not source text. | adopted - must stay green | A specifier change is invisible to it. It cannot detect AC-1 either way. |
| `src/app/components/GradingResults.tsx` | Value-imports the module (`:20`). Not a test. | checked-safe, not edited | `tsc` covers it. |
| `src/file-size-ceiling.structure.test.ts` | Reads every file under `src/` for its line count. | adopted | Only a growth past 1000 reds it; section 2.6 shows both files far under. |
| `src/source-bytes.structure.test.ts` | Reads every file under the repo root (`ROOT = process.cwd()`, `SKIP_DIRS` at `:38`) with `TEXT_EXTENSIONS` including `.md` (`:39`). **Reads this document too.** | adopted | A BOM or a stray control byte in either source file OR in `docs/a22-scope.md` reds it. |
| `src/lib/no-emojis.test.ts` | `roots = ["src", "docs"]` (`:243`). **Reads this document too.** | adopted | An emoji anywhere reds it. |
| `src/lib/client-state-sweep.registry.test.ts` | Walks all of `SRC_DIR` with `readdirSync` (`:49`) looking for module-scope caches; reads `classTrendsEntry.ts` as text. | adopted | Neither edit adds a module-scope binding, so its `EXPECTED_REGISTERED_FILES` equality (`:113-119`) is untouched. |

No test in the tree reads `gradingResultsHelpersWiring.test.ts` as source text;
the only external mention is a prose reference in a comment at
`src/app/components/grading-results/gradingResultsHelpers.test.ts:26`
(`grep -rn "gradingResultsHelpersWiring" src docs` minus self-matches), which
asserts nothing.

---

## 8. Acceptance criteria

Each names the OBJECT under comparison, the INSTRUMENT that produces each
quantity, and the DIRECTION of failure.

**AC-1. `classTrendsEntry.ts` carries no banned specifier, in code or in
prose.**
Object: the raw UTF-8 contents of
`src/app/components/grading-results/classTrendsEntry.ts`.
Instrument: `BANNED_IMPORT_PATTERNS` (all four,
`gradingResultsHelpersWiring.test.ts:88-93`) applied by the
`it.each(CLIENT_FILES)` block at `:111-116` once Edit C registers the file.
Direction of failure: the test goes RED if ANY of the four patterns matches
anywhere in the file. It goes GREEN if none does. Today's value is one match
(section 2.4); the required post-state is zero.

**AC-2. The file is genuinely IN the scanned set, not merely passing.**
Object: the `CLIENT_FILES` array as evaluated at runtime.
Instrument: `expect(CLIENT_FILES).toContain("./classTrendsEntry.ts")` -
add this as an explicit `it(...)`, because AC-1 is vacuously satisfiable by a
file that is not in the list at all, which is precisely today's state.
Direction of failure: RED if the entry is absent. This criterion exists to
close the silent-success path named in section 6.

**AC-3. No exemption mechanism remains, and none is representable.**
Object: the completeness sweep's two sets - the directory enumeration at
`:137-141` and the `./`-prefixed subset of `CLIENT_FILES`.
Instrument: the set equality of Edit E.
Direction of failure: RED if the directory holds a `.ts`/`.tsx` non-test file
absent from `CLIENT_FILES` (the old direction), AND RED if `CLIENT_FILES`
holds a `./` entry with no corresponding file (the new direction). A
name-shaped `grep -n "KNOWN_UNREGISTERED"` returning zero lines is a
SUPPLEMENTARY check only and must not stand in for this one - a rename would
defeat it, and this seat's own standing warning is that a name-shaped grep
does not answer a channel-shaped question.

**AC-4. Ruling U3's walled-set guard is untouched and still green.**
Object: `src/lib/grade/types.ts`'s non-comment lines containing ` from "`.
Instrument: `gradingResultsHelpersWiring.test.ts:122-131`, frozen literal
`['import type { CodeRunResult } from "../code-runner";']`.
Direction of failure: RED if the array is anything other than that exact
one-element list. A22 must not edit `types.ts` at all; this criterion is the
proof that fix (1) did not smuggle a widening in.

**AC-5. The whole suite stays green and the count does not shrink.**
Object: `npm test` totals.
Instrument: vitest, `Test Files N passed (N)` / `Tests M passed (M)`, exit 0.
Direction of failure: any failure, and separately any DROP in M relative to
the pre-change run measured in the same session - a deletion that removes
assertions passes a naive "all green" reading. Baseline M must be captured
BEFORE the wave, by the wave gate, not quoted from `this-repo.md` (whose
20,200 is dated 2026-09-13 and has moved).

**AC-6. The three other gates pass at their documented shapes.**
Object: `npx tsc --noEmit`, `npm run lint`, `npm run build`.
Instrument and direction: tsc - any output at all is failure; lint - exit 0
with the four baseline warnings named in `this-repo.md` section 1, a fifth is
a regression; build - the presence of the `Compiled successfully` line, NOT
the exit code, which is expected to be 1 in this envless checkout.

**AC-7. The document gates pass over this file.**
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

| # | Criterion | Mutation | Expected result | Discriminates? |
|---|---|---|---|---|
| S1 | AC-1 | Revert Edit A only: put `@/lib/grade` back on `classTrendsEntry.ts:25`, leaving the reworded comment. | `it.each` case `./classTrendsEntry.ts` RED on pattern 0. | YES |
| S2 | AC-1 | Revert Edit B only: restore the original comment on line 22, leaving the narrowed import. | RED on pattern 0. **This is the mutant that proves section 2.4's finding is load-bearing** - without it, a reader could believe Edit B is cosmetic. | YES |
| S3 | AC-1 | Change `:25` to `from "@/lib/grade/typesFoo"`. | RED on pattern 1 (the negative lookahead `(?!types["'])` requires the closing quote). Proves Ruling R part 2's exemption is a specifier match, not a prefix match. | YES |
| S4 | AC-2 | Apply Edits A, B, D, E but NOT C - fix the file and delete the carve-out without registering it. | AC-3's equality RED (11 local vs 10 registered). AC-2's explicit containment RED. | YES |
| S5 | AC-2 | Apply everything, then delete the `"./classTrendsEntry.ts"` line from `CLIENT_FILES` and re-add `KNOWN_UNREGISTERED_LOCAL_FILES` with that one entry and its filter. | AC-3 equality RED - the filter now removes the file from `localFiles`, so `localFiles` is 10 and `CLIENT_FILES` `./` entries are 10, which WOULD be equal. **Therefore this mutant needs the filter restored AND the entry absent from both sides; under Edit E as specified it is NOT killed.** See the note below the table. | **NO - see note** |
| S6 | AC-3 | Add a fabricated `"./nonexistent.ts"` entry to `CLIENT_FILES`. | Equality RED on the new direction (containment alone would have passed, and does today). | YES |
| S7 | AC-3 | Create `src/app/components/grading-results/scratch.ts` containing one export and nothing else, do not register it. | Equality RED. Delete the file afterwards. | YES |
| S8 | AC-3 | Create `src/app/components/grading-results/scratch.mjs`. | Equality GREEN - the `/\.(ts\|tsx)$/` filter never enumerates it. **Expected NOT to discriminate; this is RES-A22-3, recorded rather than credited.** | **NO, by design** |
| S9 | AC-4 | Add a second import line to `src/lib/grade/types.ts` (a COPY-restore is mandatory - this file is outside `owns` and the mutation is transient). | `:122-131` RED: `fromLines` has two elements. | YES |
| S10 | AC-1 backstop check | Drop the `type` keyword from `classTrendsEntry.ts:25`, making it a real VALUE import of `@/lib/grade/types`. | `BANNED_IMPORT_PATTERNS` GREEN (the exemption is specifier-shaped, not kind-shaped). `classTrendsDraft.not-postable.test.ts` GREEN (`types.ts` reaches only `../code-runner`, not a forbidden prefix). `tsc` GREEN. **Nothing in the suite catches it.** | **NO - and no criterion is credited with catching it.** |

**On S5.** The equality in Edit E compares `localFiles` (post-filter) to the
`./` entries. A reinstated filter shrinks BOTH sides symmetrically, so the
equality does not detect the restoration of an exemption mechanism - it
detects an unregistered FILE. This is an honest limit of the construction and
I am not going to paper over it with a `grep`-for-the-identifier assertion
dressed up as a criterion, because that is the name-shaped answer to a
channel-shaped question this seat is warned about. The real defence against
S5 is that it is a visible, arguable diff in a guard file, which is the
property section 4(b) actually asks for. AC-3's supplementary `grep` is
recorded as supplementary for the same reason. **A checker should decide
whether that is sufficient; it is the weakest point in this artifact.**

**On S10.** Dropping `type` from a `@/lib/grade/types` import is not a
client-bundle hazard today (`types.ts` transitively reaches only
`../code-runner`), so the absence of a catcher is not a live defect. It is
recorded so no criterion is credited with a discrimination it does not have -
this repo has shipped exactly that inflation before.

---

## 10. Wave plan

One wave, one implementer, two files, both in
`src/app/components/grading-results/`.

| Step | Action | Gate |
|---|---|---|
| 0 | `git status --short` - must be clean before starting. Capture `npm test` totals as the AC-5 baseline. | clean tree, recorded M |
| 1 | Edits A and B in `classTrendsEntry.ts`; Edits C, D, E, F in `gradingResultsHelpersWiring.test.ts`. | - |
| 2 | `npx vitest run src/app/components/grading-results/ src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts` | all green |
| 3 | Sabotage pass S1-S4, S6, S7, S9, and record S5, S8, S10 as expected non-discriminators. Restore each mutation from a COPY. | each named kill observed |
| 4 | `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` | AC-5, AC-6 |
| 5 | `git status --short` against the two-path assignment; confirm no `.claude/worktrees` copy was edited. | exactly two paths |

`npx tsc --noEmit` has exactly one caller here and it is this wave gate
(`this-repo.md` section 2). Do not run it concurrently with another agent.

Disjointness: A22's write set is two files in `grading-results/`. It does not
intersect A21 (announcement surfaces) or any docs-only work. The one shared
resource that no file list shows is `tsconfig.tsbuildinfo` at step 4.

---

## 11. Residual register

`iteration-caps.md` and this seat's definition: an entry missing an owner, an
instrument or a step is a DELETION, and a residual not in `docs/BACKLOG.md`
does not exist. **None of the four below is in `docs/BACKLOG.md` yet. This
document does not own that file. Until the orchestrator adds them at the push,
they are deletions, and I am calling them that rather than implying otherwise.**

| id | Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| RES-A22-1 | `BANNED_IMPORT_PATTERNS` is applied to RAW source at `gradingResultsHelpersWiring.test.ts:111-116`, so a correct file that merely DISCUSSES the barrel in a comment goes red. Measured live risk: `ungradedDisclosure.ts:14,18` already name the barrel in prose and pass only on phrasing (section 2.5). A22 mitigates with a note at both ends (Edits B and F), not by changing the instrument (section 3.4 says why). | Orchestrator, as a new backlog row | The guard itself - it fails LOUD and in the safe direction | The next wave that edits any file under `src/app/components/grading-results/`; if it reds on a comment, this residual converts to a chunk |
| RES-A22-2 | **A live FALSE NEGATIVE in a sibling guard, measured this session, not hypothetical.** `src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts:287-291` collects only lines matching `/^\s*import\b/`, so a multi-line value import of `@/lib/grade` is never tested. It also false-positives on an all-type inline-modifier import. Executed output in section 3.3. Out of A22's `owns` (different directory). | Orchestrator, as its own backlog row - this is a real defect, not a nicety | The three-fixture node script in section 3.3, frozen into that file as a canary with the multi-line fixture as a positive control | Its own chunk. The test to write first is the multi-line fixture: it must go RED against today's filter before any fix is applied |
| RES-A22-3 | The completeness sweep's extension test is `/\.(ts\|tsx)$/` (`:139`), so a `.js`/`.jsx`/`.mjs`/`.cjs` file in this directory is never enumerated and never registered. No such file exists today (section 2.3). Sabotage S8 is the expected non-discriminator that pins it. | Orchestrator, as a low-priority backlog row | Widen the extension test and add S8's `scratch.mjs` fixture as a canary | The next wave that adds a non-`.ts` file anywhere under `src/app/components/` |
| RES-A22-4 | 16 non-test files outside this directory still type-only import the `@/lib/grade` barrel (17 total, minus `classTrendsEntry.ts`). List produced by `grep -rn 'import type .* from "@/lib/grade"' src --include=*.ts --include=*.tsx \| grep -v "\.test\."`. None is a bundle hazard (type-only erases) and none is inside a completeness sweep today, so nothing is broken. But the next directory to grow its own sweep hits this wall exactly as `grading-results` did. | Orchestrator, as a note on whichever row adds the next sweep | The same `grep` command, re-run | Whenever a second directory-completeness sweep is proposed |

---

## 12. Disposition of the questions the BACKLOG row posed

Not a restructuring table in `iteration-caps.md:119`'s sense - no prior
`docs/a22-scope.md` existed. This maps the row's own three named items to
this artifact's answer, so a checker can see nothing the row asked was
dropped. The id column was derived last, after sections 8 and 11 were
finalised.

| Row item (`docs/backlog.yml:427`) | Disposition | Where it landed |
|---|---|---|
| Fix (1) - change the import to `@/lib/grade/types`, "check first that every symbol the file needs actually lives in types.ts" | **ADOPTED**, precondition verified | Section 2.2 (both symbols, `types.ts:308` and `:329`); Edit A, section 5.1; AC-1 |
| Fix (1)'s stated caution - "the A12/A13 round also added a guard that types.ts itself stays free of value imports, so widening what flows through it is not free" | **DOES NOT FIRE**, with the structural reason stated rather than asserted | Section 2.2: the barrel already sources both symbols from `types.ts`, so nothing moves; AC-4 is the standing proof |
| Fix (2) - teach the guard to distinguish type-only from value imports | **REJECTED (d), with the enforcer it would have protected named** | Section 3.2 (repeat of the disposed `VALUE_IMPORT_PATTERN` class) and 3.3 (the repo's existing implementation measured broken in both directions). The protection it would have offered - catching a genuine VALUE barrel import - is unaffected: `BANNED_IMPORT_PATTERNS` keeps that whole-file, and section 3.3 notes the crude form is the reason it cannot have the multi-line hole. The measured shortfall goes to RES-A22-2 rather than being absorbed |
| "decide whether the carve-out list should exist at all once the one entry is gone" | **ANSWERED: delete, and upgrade the assertion so an exemption is unrepresentable** | Section 4, with the set-equality verification pasted, and the two things that would change the call stated concretely |
| The row's `instrument` field naming `gradingResultsHelpers.test.ts` as the carve-out's home | **CORRECTED - the row is stale** | Section 2.1. The carve-out is in `gradingResultsHelpersWiring.test.ts:81-84,142`. The orchestrator should fix the row at the push |
| The brief's claim that the sweep filter "misses `.test.tsx` and `.d.ts`" | **REFUSED - disproved against the tree** | Section 2.3: `:139` excludes both explicitly. A different, real gap (non-`.ts` extensions) is recorded as RES-A22-3 instead |

---

## 13. What I could not determine

- **Whether `npm test`, `npx tsc --noEmit`, `npm run lint` or `npm run build`
  pass on the current tree.** I did not run them. This seat writes a design
  artifact and shares `tsconfig.tsbuildinfo` with whatever else is running;
  `this-repo.md` section 2 gives `tsc` exactly one caller and it is the wave
  gate. Every gate expectation in AC-5 and AC-6 is a REQUIREMENT on the wave,
  not a measurement I made. The AC-5 baseline test count must be captured by
  the wave gate itself - I am deliberately not quoting `this-repo.md`'s 20,200,
  which is dated 2026-09-13 and has certainly moved.
- **Whether `next build` actually fails on a VALUE barrel import from this
  directory today.** That is the incident the whole guard exists for
  (`gradingResultsHelpersWiring.test.ts:48-61`) and it is recorded as having
  happened, but reproducing it needs a build in an envless checkout whose
  prerender tail fails for an unrelated reason. I read the record; I did not
  re-stage the incident.
- **Whether any ESLint rule would be a better home for this guard.** There is
  no `no-restricted-imports` configuration in `eslint.config.mjs`
  (`grep -rn "no-restricted-imports\|restricted-import" eslint.config.mjs`
  returned nothing), so adopting one would be a new mechanism with a repo-wide
  blast radius. I did not investigate whether the installed ESLint version
  supports the `allowTypeImports` option that would make it a genuine
  alternative to fix (2), because that alternative is out of A22's scope
  either way. Naming it so a later round does not think it was overlooked.
- **Nothing here is verified by rendering.** No criterion in section 8 depends
  on a component being rendered, because no component is rendered by any test
  in this repo.

---

## 14. Summary for the orchestrator

- Recommended fix: **(1), narrow the specifier** - plus a mandatory comment
  reword that the row did not anticipate and that section 2.4 measured.
- Carve-out: **delete**, and replace containment with set equality.
- Two files, one wave, one implementer. The build packet is sections 5-10.
- The row's own address for the carve-out is stale and should be corrected.
- Four residuals, none yet in `docs/BACKLOG.md`. **RES-A22-2 is a measured
  live false negative in a different directory's guard and deserves its own
  row, not a footnote.**
- The weakest point in this artifact, named so a checker does not have to find
  it: sabotage S5 is not killed by the specified construction (section 9's
  note).
