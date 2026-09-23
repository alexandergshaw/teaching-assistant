# A39 wave plan - adversarial check, round 1

Subject: `docs/a39-waves.md` at commit `146183f`. I did not author it.

Inputs read: `AGENTS.md`, `docs/DEV_LOOP.md`, `docs/loop/this-repo.md`,
`docs/loop/iteration-caps.md`, `docs/loop/traps-spec.md`, then the plan, then
`docs/a39-architecture.md` (revision 2, closed), `docs/a24-a39-sequencing.md`
RULINGS 32-36, `docs/a39-rulings.md`, `docs/owner-decisions-2026-09-23.md`,
`docs/g4-scope.md`.

**Every quantity below names the command that produced it.** Commands were run
from the repo root on 2026-09-23 at HEAD `146183f`; PowerShell is marked,
everything else is the Bash tool. Every absence claim is paired with a canary
through the same instrument, and no absence grep is piped through `head`.

**This document's write set is exactly `docs/a39-waves-check.md`.** Nothing
else was opened for writing. Proof is section 9.

---

## 1. VERDICT

**NOT BUILDABLE AS WRITTEN.** 5 blockers, 8 majors, 5 minors.

Two of the five blockers are gates that cannot fail; one is an instrument that
cannot be built where the plan puts it; one is a return value with no consumer;
one is a write-set rule that forbids the only shape the plan's own arithmetic
says can reach the target.

The plan's four corrections all HOLD. Its measurement discipline is unusually
good: 26 of 26 line counts reproduced on both counters, 6 of 6 recomputed
`grading.ts` citations opened and correct, and roughly 30 in-repo `file:line`
citations spot-checked without a single stale one. What fails is not the
measurement - it is three gates that were written but never run, and a shape
ruling the plan inherited without noticing it collides with the arithmetic it
briefs.

---

## 2. THE FOUR CORRECTIONS - all four HOLD

### 2.1 (a) The Route Handler body cap - HOLDS, and the architecture's 4.4 is false

```
awk 'NR>=1&&NR<=48' src/lib/upload-budget.ts
```

`:5-7` verbatim: "Vercel caps a serverless function's REQUEST BODY at roughly
4.5MB at the platform layer. `bodySizeLimit` cannot raise it, **and the cap
applies to Route Handlers exactly as it does to Server Actions.**" `:38` is
`VERCEL_BODY_LIMIT_BYTES`, `:41` is `UPLOAD_WIRE_BUDGET_BYTES`. The plan's
citation of `upload-budget.ts:36-41` is accurate.

Against `docs/a39-architecture.md:1138-1140` ("not declared anywhere in this
repo and which I cannot measure in this checkout") and `:1149-1150` ("sending
that run down today's existing Server Action path, which still has the declared
10 MB"), both sentences are FALSE on the tree. `src/app/actions/grading.ts:831`
(opened, `awk 'NR>=818&&NR<=840'`) is the `checkFileWireBudget` refusal that
`a9d9771` added. The plan's disproof is correct.

**The replacement reason, checked on its own merits: it HOLDS.** "The whole-run
path never re-uploads an extracted entry; it grades server-side from the archive
already in the request." Confirmed at `grading.ts:881-883`: `const zipBuffer =
await file.arrayBuffer();` then `gradeSubmissions(zipBuffer, ...)`. The archive
crosses once and entries are produced server-side by `JSZip.loadAsync`. So a
3MB zip holding a 30MB text entry is reachable, the per-item budget is real, and
whole-run is the correct sink. This is the same construction the architecture's
4.8 already defends for four enumerated states - the plan replaced a false
premise without weakening the construction.

### 2.2 (b) `raceWithTimeout` - HOLDS

```
grep -rln "raceWithTimeout" src --include=*.ts | grep -v "\.test\."
  -> src/lib/bounded-race.ts                       (1 file)
grep -rln "raceWithTimeout" src --include=*.ts --include=*.tsx | grep -v "\.test\."
  -> src/app/components/canvas-tab/announcements-panel.tsx
     src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx
     src/lib/bounded-race.ts                       (3 files)
grep -rln "raceWithTimeoutZZZ" src --include=*.ts --include=*.tsx    # canary, exit 1
```

`docs/g4-scope.md`'s "zero production callers" is a false absence caused by
`--include=*.ts`. The plan's refusal is correct and RES-W-2 records it with an
owner.

The two templates the plan points at are real, and I opened both:
`walkthrough-announcement.structure.test.ts:327-352` is exactly the four
assertions described (`:333` import, `:337` passed-in not awaited, `:341` the
named function's body, `:349-352` the shared constant with the count pinned to
2). `src/lib/bounded-race.ts:20-24` and `:26-29` are verbatim as quoted, and
`raceWithTimeout` is at `:31-75`.

### 2.3 (c) The `grading.ts` shift rule - HOLDS, 6 of 6 opened

```
git show a9d9771 -- src/app/actions/grading.ts | grep "^@@"
  -> @@ -16,6 +16,7 @@
     @@ -821,6 +822,17 @@
```

Six recomputed citations, each OPENED rather than arithmetic:

| Plan says | Opened with | What is there | Verdict |
|---|---|---|---|
| `gradeAction` at `:706` | `awk 'NR>=704&&NR<=708'` | `:706` is `export async function gradeAction(` | CORRECT |
| `gradeOneSubmissionAction` at `:598-644` | `awk 'NR>=596&&NR<=600'` and `grep -n` | `:598` declaration, `:644` the closing brace | CORRECT |
| the `effectiveRubric` regenerate defect at `:634-636` | `awk 'NR>=632&&NR<=646'` | `:634-636` is the `meta.rubricText.trim() ? : await generateRubric(...)` ternary | CORRECT |
| rubric synthesis at `:876-878` | `awk 'NR>=874&&NR<=890'` | `:876-878` is `rubric.trim() ? rubric : await generateRubric(...)` | CORRECT |
| the Gemini zip `Promise.all` at `:882-886` | same | `:882` `Promise.all([`, `:886` `]);` | CORRECT |
| "no file, no grade" at `:821-822` | `awk 'NR>=818&&NR<=840'` | `:821-822` is the `!file \|\| file.size === 0` refusal | CORRECT |

MINOR only: the shift table's rows are `1-21 / 22-820 / 827 and above`, which
leaves old lines 822-826 (inside the second hunk) unmapped, and `2.2`'s
equivalent leaves old 730-734 unmapped. Both are covered by the plan's own
binding rule that the brief is written from the tree, so this is a
completeness note, not a defect.

### 2.4 (d) The extraction shape at 989 - the arithmetic HOLDS, the conclusion is unbuildable

The arithmetic first, because it is right:

```powershell
@(Get-Content src/app/components/snapshot-grading/SnapshotGradingPanel.tsx).Count   # 989
```
```
wc -l < src/app/components/snapshot-grading/SnapshotGradingPanel.tsx                # 989
git show 837f2e3 -- .../SnapshotGradingPanel.tsx | grep "^@@"
  -> @@ -58,6 +58,7 @@   and   @@ -729,6 +730,24 @@       (+19 total)
```

RULING 33's figures were 931-938 (five components) and 913-918 (two grouped),
measured against the 970 tree. 931 + 19 = 950; 938 + 19 = 957; 913 + 19 = 932;
918 + 19 = 937. Gate is `-le 940`. **So yes: the many-small-components shape
cannot reach 940 and the grouped shape can, by about 3 to 8 lines.** The plan's
finding is arithmetically correct and RES-W-5 honestly records that it is
arithmetic on a prior measurement of a different extraction's candidates.

What the plan proposes instead is "fewer, larger components". **That is the
blocker - see 3.2.**

---

## 3. BLOCKERS

### BLOCKER 1 - two gate greps cannot match, and one of them is RED on today's tree even when fixed

Class: **an absence check that reports clean without checking.**
NEW.

Two of the plan's gate commands put `|` inside a pattern with neither `-E` nor
BRE `\|`. GNU grep then searches for the literal pipe character. Measured:

```
# the plan's W3-2 GATE form, docs/a39-waves.md:1036
grep -rn "persists it|not persisted|out of localStorage" src/app/components/grading-recording src/app/components/snapshot-grading
  -> no output, EXIT=1

# the plan's own W3-2 BODY form, docs/a39-waves.md:1010 (correct)
grep -rn "persists it\|not persisted\|out of localStorage" ...
  -> 6 lines, EXIT=0   (RubricInputModal.tsx:29, snapshot-grading.structure.test.ts:132,:195,
                        snapshot-row-serialization.ts:92, snapshot-row.ts:136, snapshot-shot.ts:209)
```

So wave 3b's stated PASS - "the W3-2 grep returns **no line** claiming the
rubric is deliberately not stored" - is satisfied today, before anything is
deleted. The watched failure the plan prescribes ("run it first, see the hits")
uses the working form; the gate uses the broken one, so the two halves of W3-2
disagree with each other.

**W4-6 is worse, because it fails in both directions.** The same bare-pipe bug
at `:1440` and again in the wave-4c gate at `:1524`:

```
grep -rn "runDeadlineMs|\"run-deadline\"" src --include=*.ts --include=*.tsx | grep -v "\.test\."
  -> no output, EXIT=1
```

Corrected with `-E`, the grep returns **30 lines across 10 files**, and the
plan's stated PASS ("returns only the five known writers":
`steps.grading-cartridge.ts`, `steps.grading-draft-flow.ts`,
`steps.grading-run.ts`, and the engine's two sites) is **false on today's tree,
before an implementer writes a line**:

```
grep -rnE "runDeadlineMs|\"run-deadline\"" src --include=*.ts --include=*.tsx | grep -v "\.test\."
  -> src/app/actions/grading.ts:728,:729,:730,:731
     src/app/api/cron/run-schedules/route.ts:126,:182,:184,:194,:372,:515
     src/app/components/grading-results/ungradedDisclosure.ts:91,:92,:119,:164
     src/lib/grade/engine.ts:304,:308
     src/lib/grade/types.ts:142,:195,:319
     src/lib/orphan-upload-sweep.ts:37
     src/lib/release-runner.ts:19,:82,:88
     src/lib/workflow-trigger-runner.ts:145,:178
     src/lib/workflows/registry/steps.grading-cartridge.ts:105
     src/lib/workflows/registry/steps.grading-draft-flow.ts:266
     src/lib/workflows/registry/steps.grading-run.ts:479,:547
```

Canary for the instrument, same call: `grep -rnE "runDeadlineMsZZZ"
src --include=*.ts --include=*.tsx` exits 1.

W4-6 is the clause the plan says "proves it rather than watching for it"
(`docs/a39-waves.md:1436-1444`), and section 9.3 leans on its whole-`src/` range
for the slot-4 informational-independence argument. As written it proves
nothing; as corrected it is red against six files no wave touches. The
direction of failure has to be re-specified against the real writer set, not
against a remembered five.

Scan of the whole plan for the same bug, with canary:
`grep -n 'grep ' docs/a39-waves.md | grep -F '|' | grep -v -- '-E'` shows every
other pipe in the document is either `\|`-escaped or a shell pipe. Only `:1036`,
`:1440` and `:1524` are broken.

### BLOCKER 2 - the write set forbids the only shape the plan's own arithmetic reaches

Class: **a design that bans a shape in one section and requires it in another.**
NEW. (`docs/loop/traps-spec.md` names this class; both halves read as correct.)

`docs/a39-waves.md:598` (wave 3a-i write set):

> `src/app/components/snapshot-grading/<new leaf>.ts` (1-2 files) - **new.**
> Plain `.ts`, never `.tsx` - nothing renders under vitest, so logic in a
> `.tsx` cannot be tested at all.

`docs/a39-waves.md:626-637` (the same wave's "THE SHAPE FINDING, and it is the
thing to brief"):

> FIVE separate components land the panel at 931-938 while TWO GROUPED
> components land at 913-918 ... **at 989 the many-small-components shape
> cannot reach 940.** The constraint is fewer, larger components.

RULING 33's measurement (`docs/a24-a39-sequencing.md:37-40`) is explicitly over
JSX components: `<SnapshotShotTray>` 8 lines, `<ConfirmedRubricAreasEditor>` 9,
`<SnapshotCaptureBar>` 15. Those are call sites of `.tsx` components, and all
three already ship in that directory:

```
ls src/app/components/snapshot-grading/
  -> ConfirmedRubricAreasEditor.tsx  SnapshotCaptureBar.tsx  SnapshotResultCard.tsx
     SnapshotRoleSuggestions.tsx  SnapshotRubricCaptureReview.tsx  SnapshotShotTray.tsx
     ... plus 6 use*.ts hooks
```

TypeScript does not permit JSX in a `.ts` file. So the two sections cannot both
be obeyed:

- Obey `6.1` and extract hooks into `.ts` leaves: RULING 33's numbers do not
  apply at all, because they price JSX call sites (8-15 lines each), not hook
  call sites (one destructuring line). The plan then supplies **no arithmetic
  for the shape it actually mandates** - the only target left is "move 49 net
  lines", with no evidence that 49 movable lines of pure logic exist in the
  hooks region.
- Obey `6.2` and group JSX into larger components: the leaves are `.tsx`,
  which `6.1` forbids, and **W3a-i-2** ("the new leaf's own test must fail
  against an empty leaf file", instrument `npx vitest run
  .../<new leaf>.test.ts`) becomes unsatisfiable - `vitest.config.ts` collects
  only `src/**/*.test.ts` in a node environment and renders nothing, so a
  `.tsx` component has no oracle to go red.

`8.1` repeats the identical collision for wave 3a-ii ("1-2 new `.ts` leaves
with their tests" plus "the same grouped-not-scattered constraint from 6.2
applies").

Note that the plan's own canary-safety argument does NOT force `.ts`:
`snapshot-grading.structure.test.ts:178` is
`files.filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"))`, so a
`.tsx` leaf in that directory is inside the haystack exactly as a `.ts` one is.
The `.ts`-only rule comes from `docs/a39-architecture.md:1528-1531`, which is
closed and terminal - which is why this is an owner question (section 8) and
not a round-2 revision.

The failure this ships if unresolved: an implementer reads 6.2's bolded "the
thing to brief", builds two grouped `.tsx` components, lands the panel at ~935,
writes no leaf test because none is possible, and every gate in 6.5 passes -
because `test:paths` will not be given a path that does not exist and the
ceiling gate only counts lines.

### BLOCKER 3 - W4-9, the press-twice instrument, cannot be built where the plan puts it

Class: **an instrument whose object is unreachable by its stated instrument.**
NEW.

`docs/a39-waves.md:1415-1422`:

> **OBJECT:** the TOTAL number of dispatches - `prepareGradingRunAction` calls
> PLUS item `fetch`es PLUS `formAction` calls - after `handleStartReview` is
> invoked TWICE with no tick between.
> **INSTRUMENT:** `npx vitest run
> src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts`.

But `handleStartReview` is defined inside `GradingTab.tsx` - step S5, points
2-7 (`:1461-1473`) - and `formAction` is a PROP reaching that component from
`page.tsx:63`'s `useActionState` (the plan states this itself at `:1456`).
`GradingTab.tsx` is a `.tsx` component and nothing in this repo renders one.
A test in `useIncrementalGradingRun.lifecycle.test.ts` can neither invoke
`handleStartReview` nor observe a `formAction` call.

The shipped precedent works for the opposite reason. Opened:

```
grep -n "^import" src/app/components/repo-grades/useRepoGradesBulkGrade.lifecycle.test.ts
  -> :70  import { useRepoGradesGradingActions, ... } from "./useRepoGradesGradingActions";
ls src/app/components/repo-grades/ | grep -i gradingactions
  -> useRepoGradesGradingActions.ts
```

`handleGradeColumn` is RETURNED BY A `.ts` HOOK, which is what lets `:329`'s
"A26b: a second click from the SAME render" exist at all. Everything the plan
cites about that file is accurate - `:26` vitest import, `:28-56` the hoisted
slot-based stubs, `:58-60` the `vi.mock("react", ...)`, `:312-314` the counter
semantics, `:329` the double-click test verbatim - but the technique does not
transfer unless `handleStartReview` also lives in a `.ts` hook.

As specified, the implementer's only satisfiable reading is to count pool
dispatches inside the hook, which leaves the thing the instrument exists for -
the `action={formAction}` deletion at `GradingTab.tsx:228` plus the
`startLockRef`, i.e. the double-spend - measured by nothing. The gate goes
green. This is the plan's own named "silent-green failure" shape.

Secondary, and it will bite in the same wave: the harness's `vi.mock("react")`
at `:58-60` supplies ONLY `useState` and `useRef`. `useRepoGradesBulkGrade.ts`
can be driven by it because `:51` is `import { useRef, useState } from "react";`
and `:45` says "NO useEffect here." The plan's ported hook adds cancellation and
says nothing about staying inside that two-hook budget; a `useCallback` or
`useEffect` in `useIncrementalGradingRun.ts` makes the harness throw.

### BLOCKER 4 - `prepareGradingRunAction`'s `mode: "whole-run"` return has no consumer

Class: **an export (here, a return branch) whose caller is in no wave.**
REPEAT-OF the repo's `assignment-must-include-wiring-file` class - the same
corrective rule fixes both: a capability does not land until the code that
consumes it lands with it. Naming it REPEAT rather than NEW because the plan's
own section 10 exists to enforce exactly this rule and it does not range over
return branches.

Step S5 (`:1469-1472`) routes on the **client-side, synchronous**
`routeGradingRun(fd, selectedProvider, pickedFileSize)`: whole-run calls
`formAction(fd)`, incremental calls `prepareGradingRunAction(fd)` and starts
the pool.

W4-12 clause 2 (`:1360-1361`) asserts a **server-side** decision:
"`prepareGradingRunAction` returns `{ mode: "whole-run", reason }` when ANY
single extracted entry exceeds the budget."

`docs/a39-architecture.md:1357-1363` names four states that route to whole-run,
and two of them - any single entry over budget, and a run that yields zero
tickets - are knowable only AFTER `prepareGradingRunAction` has run server-side
and opened the archive (`:1115-1119`: entries can only be produced by opening
the archive server-side).

The plan never says what `handleStartReview` does with that return. And its own
A5 replacement closes the obvious fix: `:1486-1487` rules that A5 becomes
"every `formAction(` occurrence lies strictly inside a `startTransition(` paren
span, **and there are exactly two**" - `GradingTab.tsx:148` plus step 6's
fallback. A third `formAction(fd)` for the server-decided whole-run turns A5
red; routing both through one shared call keeps it at two but is not specified.

The silent-green shape: `incrementalRunPlan.test.ts` and
`grading-incremental.test.ts` assert the action returns whole-run, W4-12 is
green, and in the app a run containing one oversized submission starts the pool
anyway - which is the precise failure W4-12's own "DIRECTION OF FAILURE"
paragraph says it exists to make impossible.

### BLOCKER 5 - the S1 guard canary proves one of its three checks

Class: **a control narrower than the set it is claimed to cover.**
NEW. (Adjacent to `docs/loop/traps-spec.md`'s "a pass condition narrower than
the defect it closes goes green on a partial fix", but the corrective rule is
different - here the negative control, not the pass condition, is the narrow
one.)

The premise is correct and I verified it:

```
awk 'NR>=118&&NR<=132' src/app/actions/action-guard-coverage.test.ts
  -> :118 function collectActionExports(): ActionExport[] {
     :121   for (const filePath of collectCandidateFiles(APP_DIR)) {
     :122     const text = fs.readFileSync(filePath, "utf8");
     :123     if (!isUseServerModule(text)) continue;
```

`:123` does skip every non-`"use server"` file, so a Route Handler is invisible
and the ratchet is green either way. `:65-67` does say `requireOwner()` "is a
bare `return requireUser()` alias ... that admits ANY active account", so the
plan's choice of `requireUser` over a false owner claim is right.
`find src/app/api -name "route.ts" | wc -l` -> 20, and a per-file
`grep -qE "require(Owner|User|AppOwner)\s*\("` counts 12 with no guard - both
of the plan's numbers reproduce exactly.

The defect is the control. `docs/a39-waves.md:1172-1176`:

> The same three checks run in the same file against a **fixture string with
> the guard removed**, and are expected to FAIL.

The three checks are (1) `requireUser(` present AND its index below the first
`gradeEntries(`; (2) a `content-type` check is present; (3)
`export const maxDuration = 60` is present. A fixture with the guard removed
fails (1) only. Checks (2) and (3) pass on that fixture unchanged, so **two of
the three assertions ship with no proof that they can fail** - which is the
exact "a check whose assertion cannot fail" class the step's own text (`:1178`)
cites RULING 28 for. Three negative fixtures are needed, not one.

Compounding it: the plan calls all three "presence-then-comparison pairs"
(`:1164`), but only (1) has a comparison. (2) is a bare substring presence -
the string `content-type` anywhere in the file satisfies it, including inside
the comment that explains the check. The plan applies a strictly higher
standard to W2-7 in the same document (`:943`: "each clause is a PRESENCE
assertion followed by a comparison ... which is how revision 1's version passed
by construction").

---

## 4. MAJORS

### MAJOR 1 - no wave gate runs the full suite

`grep -n "npm test" docs/a39-waves.md` returns nothing, exit 1 (canary: the
same grep for `npm run test:paths` returns 10 lines). Section 5's standing gate
table lists Typecheck, Lint, Named tests, One test, Ceiling and Tree - and omits
the `npm test` gate that `docs/loop/this-repo.md:27` records at 63.6s for 1017
files. Every wave's test coverage is therefore a hand-enumerated `test:paths`
list, against `docs/loop/traps-spec.md`'s rule that "the orchestrator's
enumeration is a FLOOR, never the set."

It already leaks. Wave 4b edits `src/lib/grade.ts` (barrel export of
`reconcileRun`). Its real source-text readers, derived:

```
grep -rl "grade.ts" src --include="*.test.ts"   # then each hit opened, false
                                                # positives on snapshot-grade.ts discarded
  -> src/app/components/grading-results/gradingResultsHelpersWiring.test.ts:154
     src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts:367
     src/lib/module-graph/runtime-import-graph.test.ts:572
```

Wave 4b's write set (`:1078-1080`) carries only the third. Opened, the other
two are not what section 3.3 says they are: `gradingResultsHelpersWiring.
test.ts:153-158` and `repoGradesFeedbackAndFiles.wiring.test.ts:366-378` walk
`src/lib/grade.ts`'s REAL runtime import graph as a planted positive, asserting
`violations.length > 0` and that the trail contains `lib/supabase/server`.
Section 3.3 characterised those two files only by their fixture strings at
`:216` and `:445,:453` - which I confirmed exist and are indeed inert, but they
are a different assertion in the same files.

The conclusion survives (a re-export of a leaf importing only `./types` and
`./rubric` cannot remove the supabase reach), but the files belong in the write
set and in the gate, and with no full-suite gate nothing else would have
noticed.

### MAJOR 2 - waves 3b, 4 and 5's file sets were never derived

Section 9.2 states the instrument and then names where it was run: "pasted in
sections 6.1, 7.1, 8.1, 8.2". Those are waves 3a-i, 1, 3a-ii and 2. **Wave 4's
set has no derivation grep anywhere in the document**, and 3b's and 5's are
assembled by reference. The disjointness output in 9.1 - which grants the only
two concurrency licences - is computed over a `w4.txt` whose contents the
document does not establish.

I re-derived and intersected the two licensed pairs myself, from the reader
sets produced by

```
for n in "GradingRecordingPanel.tsx" "SnapshotGradingPanel.tsx" "RubricInputModal.tsx" \
         "GradingTab.tsx" "actions/grading.ts" "grade/engine.ts" "app/actions.ts" \
         "LiveFeedPanel.tsx" "CartridgeDropPanel.tsx" "grade/types.ts" \
         "grading-drafts.ts" "github-grading-run-store.ts"; do
  echo "### $n"; grep -rl "$n" src --include="*.test.ts" | sort; echo; done
grep -rl "GradingRecordingPanelZZZ.tsx" src --include="*.test.ts"   # canary, exit 1
```

- **`w1` vs `w3ai` (plan says empty): EMPTY.** Confirmed. w1 is
  `single-file-entry.{ts,test.ts}`, `actions/grading.ts`, `GradingTab.tsx` and
  its 3 readers, `actions/grading.ts`'s 4 readers; w3ai is
  `SnapshotGradingPanel.tsx`, its 4 readers, and the new leaf. No shared path.
- **`w3b` vs `w4` (plan says empty, and this is the slot-4 licence): EMPTY.**
  Confirmed. w3b is the three panels/modal plus the 17 + 4 + 6 reader sets;
  none of those 27 paths appears in w4's set even after adding the two
  `grade.ts` readers MAJOR 1 identifies.
- **`w2` vs `w4` (plan says 11 files): 11, exactly as pasted.** Confirmed:
  `GradingTab.tsx`, `autoGradeTransition.wiring.test.ts`,
  `gradingResultsExtraction.wiring.test.ts`,
  `gradingResultsHelpersEditState.test.ts`, `ungradedDisclosure.test.ts`,
  `code-runner.test.ts`, `engine.test.ts`, `engine.ts`,
  `engine.ungraded.test.ts`, `grouping-zip-parents.wiring.test.ts`,
  `runtime-import-graph.test.ts`.

**So both licences hold.** The finding is that the document's evidence does not
establish them - a reader cannot check an intersection against a set that was
never printed, and `9.2`'s own closing line ("a derivation that cannot range
over the set it claims is an enumeration in a command's clothes") is the rule
this breaks.

### MAJOR 3 - two of the architecture's pass conditions are dropped with no disposition

```
grep -oE "\*\*W[0-9a-z-]+-[0-9]+[a-z]?" docs/a39-architecture.md | sort -u | tr -d '*'
grep -oE "W[0-9a-z-]+-[0-9]+[a-z]?\b" docs/a39-waves.md | sort -u
```

In the architecture and not in the plan: **W4-7** and **W2-6**.

- **W4-7** (`docs/a39-architecture.md:2143-2145`) is the owner-only measurement
  of "wall-clock elapsed from Start Review to the first readable row, before and
  after" - the only instrument for A39's whole leverage claim. The architecture
  marks it KEPT VERBATIM in its own disposition table at `:2251`. The plan
  carries the residual it points at (RES-A39A-4, via RES-W-12) but not the pass
  condition, while carrying the structurally identical owner-only W1-3 and
  W5-2. Inconsistent, and it is the one that measures whether the feature
  worked.
- **W2-6** is the combined `test:paths` run over the four keys and both
  parsers; its paths are all inside 8.2's gate, so it is absorbed rather than
  lost - but it is absorbed silently.

The plan restructured wave 3 into 3a-i / 3a-ii / 3b and wave 4 into 4a / 4b /
4c and ships **no disposition table** mapping the architecture's conditions to
kept / handed over / withdrawn. `docs/loop/iteration-caps.md` entry gate 3
requires one for exactly this reason: "a restructuring silently dropped four
requirements that had executing tests behind them."

### MAJOR 4 - RES-A39A-15's step lands in this plan's wave 3 and no wave carries it

`docs/a39-architecture.md:2369`, STEP column: "**in wave 3, as a read-only
check over the two panels it writes**; elsewhere, at the next chunk touching
that file." The instrument is `grep -n "multiline" <file>` against
`grep -n "maxRows" <file>` plus the index of the file's primary action control.

Wave 3b's pass conditions are W3-1 (ceiling), W3-2 (the policy grep), W3-3 (the
key canary) and W3-4 (lint). None is that check. Section 12 rules that
architecture residuals "stand as written", which leaves an owed instrument with
a named step inside this plan's own wave and no wave carrying it. That is the
shape `iteration-caps.md` calls a deletion.

### MAJOR 5 - a pasted quantity does not reproduce from the pasted command

Sections 2.3 and RES-W-9 both state "**12 of them point at line 703 or above**"
with the command
`... | sed 's/.*://' | sort -n | awk '$1>=703' | wc -l`.

Measured at the plan's own stated HEAD:

```
git grep -hoE "SnapshotGradingPanel\.tsx:[0-9]+(-[0-9]+)?" 1a9021f -- 'docs/*.md' \
  | sed 's/.*://' | sort -n | awk '$1>=703' | wc -l      ->  13
```

The extra hit is `REGRESSION.md:43197`'s `SnapshotGradingPanel.tsx:73-80`.
`awk '$1>=703'` compares the field `73-80` as a STRING, because it is not a
numeric-looking value, and `"73-80" > "703"` is true on the third character.
A numerically correct count:

```
... | sed 's/.*://' | sed 's/-.*//' | awk '$1+0>=703' | wc -l   ->  12
```

So the reported 12 is the right answer and the pasted command is not the one
that produced it. The two totals in the same sentences DO reproduce exactly
(56 and 75 at `1a9021f`; canary `SnapshotGradingPanelZZZ\.tsx:[0-9]+` exits 1),
which is why this is a MAJOR rather than a blocker - but the broken `awk`
idiom appears twice and would propagate into the wave-3a-i brief.

### MAJOR 6 - nine new files in wave 4c ship with no line budget

8.4.4's ceiling table bounds `GradingTab.tsx`, `src/app/actions.ts` and
`src/lib/grade.ts`. It bounds none of:
`src/app/api/grade-run-item/route.ts`, `route.test.ts`,
`src/app/actions/grading-incremental.ts`, `.test.ts`,
`src/app/components/grading/incrementalRunPlan.ts`, `.test.ts`,
`useIncrementalGradingRun.ts`, `.lifecycle.test.ts`.

`useIncrementalGradingRun.ts` is a port of a 489-line hook
(`wc -l src/app/components/repo-grades/useRepoGradesBulkGrade.ts` -> 489;
`@(Get-Content ...).Count` -> 489) that the plan then ADDS cancellation to, and
its lifecycle harness precedent is 706 lines. The only bound on any of them is
the repo-wide 1000 (`src/file-size-ceiling.structure.test.ts:41`, verified by
`grep -n "LIMIT" ...`; note `docs/loop/this-repo.md` still says `:30`, which the
plan correctly re-measured). The same gap exists for wave 1's
`single-file-entry.ts` and wave 2's four new modules.

### MAJOR 7 - three of wave 3b's five ceiling gates are dropped, and the one that moved is near its bound

`docs/a39-architecture.md:1503-1505` sets, for wave 3:
`RubricInputModal.tsx -le 420`, `grading-rows.test.ts -le 790`,
`snapshot-grading.structure.test.ts -le 890`. Section 8.3's gate block counts
only `SnapshotGradingPanel.tsx` and `GradingRecordingPanel.tsx`.

The last one is live. The architecture estimated +26 against a file it measured
at 822; the plan measured it at **863** (both counters) and did not re-derive
the bound. 863 + 26 = 889 against 890. And 8.3 specifies each new key gets "a
block modelled on `snapshot-grading.structure.test.ts:141-174`" - a 34-line
template - for two keys, which is nearer +68 than +26 and lands the file around
931. Nothing between 890 and 1000 would go red.

### MAJOR 8 - wave 2's write set is not in this plan

8.2 says "The architecture's section 8 list, adopted with three additions this
pass derived and one removal it already ruled." The plan's own statement of
purpose is "what each may write". The paths for
`src/app/components/grading-results/RubricProvenance.tsx` and
`src/lib/research/rubric-fingerprint.ts` - both new files wave 2 must create,
both named in `docs/a39-architecture.md:1913,1928` - appear **nowhere** in
`docs/a39-waves.md`; the only trace is the JSX literal `<RubricProvenance` in
W2-7 and the test path `.../grading-results/rubricProvenanceLeaf.test.ts` in
the gate.

This also contradicts the plan's own 0.3 finding, which forbids writing a wave
3b brief from the architecture's reader list precisely because that list is now
stale by one - while wave 2's brief is delegated to a neighbouring list in the
same document.

---

## 5. MINORS

1. Wave 5's gate names `src/lib/canvas-credential-cta.test.ts` without the
   `[created by this wave]` marker that the plan's own section 3.4 requires.
   Run as written (PowerShell, exit code read from a file):
   `PRE-CHECK FAILED / does not exist on disk: src/lib/canvas-credential-cta.test.ts`,
   **exit 1**. Harmless once the file exists; inconsistent with 3.4.
2. Section 3.3 says "Three test files pin the string `"@/lib/grade"`" and names
   two files (three citations).
3. The shift tables in 2.1 and 2.2 leave the lines inside each hunk unmapped
   (old 822-826 and old 730-734).
4. Slots 1 and 4 name a single `tsc` owner and a sabotage ordering but no
   mechanism by which two concurrently-running agents observe either. "Gates run
   sequentially" is an instruction to an orchestrator that is not in either
   agent's brief.
5. Wave 4b's barrel re-export of `reconcileRun` from `src/lib/grade.ts` has no
   importer in any wave - the caller named in section 10 is `engine.ts`, which
   imports the leaf directly, not the barrel.

---

## 6. WHAT IS SOUND - one line each, not padded

- **Gate paths.** All 68 distinct arguments across the plan's 10 `test:paths`
  commands are `*.test.ts`; **no production source path appears in any gate**;
  every MISSING path is a file a wave creates. The sibling-plan failure mode is
  absent here.
- **No raw multi-path vitest.** All 11 `npx vitest run` occurrences are
  single-path (`grep -on "npx vitest run [^\`]*" docs/a39-waves.md`; canary
  `npx vitest runZZZ` exits 1). The silent-drop hazard is clean.
- **Three gates actually run**, exit codes read from files in the scratchpad,
  not from a pipe:
  - wave 3a-ii's gate (8.1) as written, 20 paths: 20 `COVERED` lines,
    `Test Files 20 passed (20)`, **EXIT=0**.
  - wave 3a-i's gate (6.5) minus the created leaf, 7 paths: 7 `COVERED`,
    **EXIT=0**.
  - wave 5's gate (8.5) as written: **EXIT=1**, `PRE-CHECK FAILED` (minor 1).
- **Line counts.** All 26 rows of section 1 reproduce on both mandated
  counters. `Measure-Object -Line` was not used.
- **W4-13 is constructible in both directions.** `bounded-race.ts:67` returns
  `timedOut ? {kind:"timedout"} : result`, so a stub resolving at
  `TOTAL_BUDGET_MS - 1` settles and a bound of 0 reports it timed out - the
  over-eager-guard control the plan specifies does discriminate. Both
  `TOTAL_BUDGET_MS` precedents verified: `class-trends-insight/route.ts:47` is
  `50_000`, `course-intel/ask/route.ts:145` is `54_000`, and the plan's ruling
  names both.
- **Residual register.** All 13 `RES-W-` entries carry owner, instrument,
  object, direction of failure and step. RES-A39A-3's superseded premise is
  handled **honestly and explicitly** (section 0.1's "I am correcting a
  premise, not a decision", and RES-W-1's supersession clause), not silently
  dropped.
- **Q1-Q4** are faithful restatements of `docs/a39-architecture.md:2383-2437`,
  with the recommendations unchanged and a proceed-if-unanswered branch each.
- **The three named test files are in the right waves.**
  `grading.budget.test.ts` -> wave 1 (it reads `actions/grading.ts`, and
  `:123-128` pins the boundary at `2752512` against `upload-budget.ts`'s own
  export, which is the block wave 1 routes through);
  `course-lms-options.test.ts` -> wave 2 (sole reader of
  `CartridgeDropPanel.tsx`, which only wave 2 edits);
  `grade-result-allowlist-coverage.test.ts` -> wave 2 (reads both persistence
  modules wave 2 edits, and its header at `:1-20` states the
  three-allowlists/`submissionTruncated` class the plan describes). The
  `Object.keys(` canary returns 0 with exit 1, as claimed.
- **The 4c one-commit decision is RIGHT.** `src/app/api/grade-run-item/route.ts`
  exports a live `POST` whose only caller is the pool; splitting it ships a
  model-spending endpoint nothing reaches. No cut avoids that without leaving a
  dead export, which the same rule forbids. Reviewability is the cost, and
  MAJOR 6 is where it bites - the mitigation should be per-file line budgets,
  not a split.
- **Citations spot-checked and accurate**, beyond those already named:
  `action-guard-coverage.test.ts:41-47, :60-70, :123`;
  `useRepoGradesBulkGrade.ts:216, :228-229, :234-247, :466-478` and
  `repoGradesBulkGrade.ts:143`; `class-trends-insight/route.ts:4, :33, :39-45,
  :47-51, :96-100`; `autoGradeTransition.wiring.test.ts:159-162, :183,
  :192-202`; `snapshot-grading.structure.test.ts:177-186, :188, :195, :196-202,
  :351-362` (including that `:354`'s `toBeGreaterThan(-1)` makes the anchor go
  RED rather than vacuous); `engine.ts:332-344, :379, :395-399, :437, :489`;
  `no-emojis.test.ts:254`; `package.json:21`; `SnapshotGradingPanel.tsx:703`
  and `:968`; `GradingRecordingPanel.tsx:694`; 20 route handlers of which 12
  unguarded; `gradeOneSubmissionAction`'s three reference lines.

---

## 7. THE WEAKEST REQUIREMENT

Not a blocker, so it is named separately: **W3-3**, the new-key canary in wave
3b.

Implemented exactly as written it produces a bad result, because its
satisfaction condition and its haystack are different objects. The exact-set
`toEqual` at `snapshot-grading.structure.test.ts:196-202` scans
`SNAPSHOT_GRADING_DIR`'s non-test files (`:177-186`), so a key literal anywhere
in that directory satisfies it - including in a new leaf, including in a dead
constant nothing reads. The wiring half is the separate A4d-shaped block, and
the plan describes it only as "modelled on `:141-174`". So the cheapest green
is: add the literal to the panel, add it to the expected set, write an A4d
block that finds the literal and a `getItem`/`setItem` pair in
`rubric-memory.ts` - with nothing proving the panel's call and the store's call
are the same key at runtime. The plan's own text at `:1017` gestures at this
("Equally RED if a key is added to an expected set while its A4d-shaped block
cannot find the panel's call") but does not make it a clause with a direction
of failure.

---

## 8. FOR THE OWNER - a terminating question, not a round 2

**BLOCKER 2 cannot be settled by revising the plan**, because it is a collision
between two artifacts that are both closed to this activity:

- `docs/a39-architecture.md:1528-1531` (revision 2, terminal) rules the
  extraction shape is FIXED as "a plain `.ts` leaf, never a `.tsx`".
- `docs/a24-a39-sequencing.md` RULING 33 (the orchestrator's own ruling)
  supplies the only arithmetic that reaches the 940 gate, and it is measured
  over `.tsx` component boundaries.

The plan seat cannot overturn either, and a round 2 would only restate the
collision. `docs/loop/iteration-caps.md`'s routing table sends a stopping point
of *rulings* to the orchestrator - but here the orchestrator's own ruling is
one of the two colliding parties, which is the case the owner rule exists for.

The question, shaped so every answer terminates:

> **At 989 lines, does wave 3a-i reach `-le 940` by extracting `.tsx`
> components (RULING 33's measured shape, which has no testable oracle under
> this repo's vitest), or by extracting `.ts` hook leaves (the architecture's
> fixed shape, for which no arithmetic exists and which may not have 49 movable
> lines)?**
>
> - **(A) `.tsx` components.** Wave 3a-i ships two grouped components, W3a-i-2
>   is withdrawn naming the enforcer it protected (nothing - no `.tsx` has a
>   test here), and the wave's only instruments become the ceiling gate, lint
>   and the structure test's existing anchors. Cost: an extraction with no unit
>   oracle, which is what the architecture's rule was avoiding.
> - **(B) `.ts` hook leaves.** Section 6.2's shape finding is withdrawn as
>   inapplicable, wave 3a-i enumerates the hooks region (`:84-702`, 619 lines,
>   40 hook declarations by
>   `grep -c "^  const .* = useCallback\|^  useEffect(\|^  const .* = useMemo\|^  const \["`)
>   and re-derives its own target BEFORE moving a line, and if 940 is
>   unreachable that is a finding reported to RULING 32 rather than a shape
>   change. Cost: the gate may be unreachable, which delays A24.
> - **(C) Relax the 940 gate.** Both A24 and A39 re-derive against a single
>   re-costed target; RULING 32's sequencing is unchanged.

**Recommendation: (B) with a reported-finding escape.** It preserves the only
oracle the wave can have, it keeps the architecture's terminal ruling intact,
and RES-W-5 already obliges the wave to re-derive both target and shape. If the
enumeration shows 940 is unreachable by hook extraction, that is exactly the
"re-cost the SHAPE, not just the number" clause RULING 33 already wrote.

Everything else in this check is ordinary round-2 material: four blockers and
eight majors that a revision can fix without a decision.

---

## 9. STOPPING POINT AND CLASSIFICATION

**Stopping point: DESIGN, plus one owner decision.**

- The owner decision is section 8 (BLOCKER 2). It is the only finding no
  revision can close.
- BLOCKERS 1, 3, 4 and 5 and MAJORS 1-8 are design and measurement defects a
  round-2 revision of this plan closes. None is a ruling defect: I re-derived
  both concurrency licences and both RULING 32/33/34 obligations the plan
  carries, and the orchestrator's rulings are sound where this plan uses them -
  the single exception is that RULING 33's arithmetic is being applied to a
  shape it did not measure, which is BLOCKER 2.
- Nothing here is *measurement* in the iteration-caps sense: every quantity I
  could not settle was settled by running the command.

### Blockers by class

| # | Class | NEW / REPEAT |
|---|---|---|
| 1 | An absence check that reports clean without checking (and a pass condition red on today's tree) | **NEW** |
| 2 | A document that bans a shape in one section and requires it in another | **NEW** |
| 3 | An instrument whose object is unreachable by its stated instrument | **NEW** |
| 4 | A capability (here a return branch) whose consumer is in no wave | **REPEAT-OF `assignment-must-include-wiring-file`** - the same corrective rule fixes both: name the consumer and put it in the same commit. Not relabelled to buy a round; section 10 of the plan exists to enforce this class and simply does not range over return branches |
| 5 | A control narrower than the set of assertions it is claimed to cover | **NEW** |

### Counts

| Severity | Count |
|---|---|
| BLOCKER | 5 |
| MAJOR | 8 |
| MINOR | 5 |

**Verdict: NOT BUILDABLE AS WRITTEN.** Do not dispatch an implementer against
this plan for wave 3a-i, wave 3b or wave 4c until BLOCKERS 1, 3, 4 and 5 are
revised and BLOCKER 2 is answered. Waves 1 and 2 are closest to buildable: wave
1's only finding is MAJOR 6 (no budget on `single-file-entry.ts`), and wave 2's
are MAJOR 8 (its write set is in the neighbouring document) and MAJOR 3's W2-6.

---

## 10. Gates run over this file

```
npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
tr -d -c '\000' < docs/a39-waves-check.md | wc -c
LC_ALL=C grep -c '[^ -~\t]' docs/a39-waves-check.md
LC_ALL=C grep -c '[^ -~\t]' docs/REGRESSION.md      # canary, must be non-zero
git status --short
```

Exit codes read from a file rather than a pipe. Recorded values are in this
pass's hand-off.
