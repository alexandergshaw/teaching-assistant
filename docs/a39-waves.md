# A39: the wave plan - REVISION 2, TERMINAL

**This is revision 2 and there is no revision 3** (`AGENTS.md`, "Two rounds,
then ask"). It is written under `docs/a39-waves-rulings.md` (e7cabc4), which
ruled on `docs/a39-waves-check.md`'s round-1 findings. Everything the rulings
recorded as HELD is carried unchanged and is NOT re-argued below: all four of
revision 1's corrections, every gate argument being a `.test.ts` path, the
absence of any raw multi-path `vitest`, the 26 line counts on both counters, the
13 residuals' five fields, RES-A39A-3's honest supersession, roughly 30
citations, and the one-commit decision for wave 4c.

**One thing in this document is NOT dispatchable and says so in place: wave
3a-i** (section 6). RULING 37 escalated its shape to the owner as a terminating
question. Section 6 is written so that it can be executed under **any** of the
three answers, with the branch-specific deltas isolated in 6.7 and the arithmetic
for each consequence measured. No branch is adopted here.

Consumes, in order: `docs/a39-waves-rulings.md` (e7cabc4),
`docs/a39-waves-check.md`, `docs/a39-architecture.md` **revision 2** (commit
1a9021f - FINAL, its activity is closed, nothing below re-argues it),
`docs/a39-rulings.md` (6ccacf4), `docs/a39-check.md`,
`docs/owner-decisions-2026-09-23.md` DECISION 3 and DECISION 6 (7c5a75b),
`docs/a24-a39-sequencing.md` RULING 32/33/34, `docs/g4-scope.md` Wave A
(a229bf7), and the loop cards `AGENTS.md`, `docs/DEV_LOOP.md`,
`docs/loop/this-repo.md`, `docs/loop/iteration-caps.md`,
`docs/loop/parallel-disjointness.md`.

**This document's write set is exactly `docs/a39-waves.md`.** Nothing else was
opened for writing. Proof is section 13.

**What this document is for.** The architecture decided SHAPE and used both of
its rounds. This decides SCHEDULE: which waves land in which order, what each
may write, which export each wave's own caller is, the exact runnable gate for
each, and the failure each new instrument must be WATCHED producing before the
fix. It re-decides nothing. Where the architecture left a terminating question
(its section 12, four of them), the question is carried as a gate on the one
wave it touches, with what that wave does under each answer - section 11.

**Every quantity below names the command that produced it.** All commands were
run from the repo root on 2026-09-23 at HEAD `1a9021f`; PowerShell is marked,
everything else is the Bash tool. Every absence claim is paired with a canary
through the same instrument in the same call, and **no absence grep is piped
through `head`**. Nothing renders under vitest (`docs/loop/this-repo.md`
sections 2 and 6), so no gate below claims UI coverage and every such claim is
routed to the owner in section 12.

---

## 0. Three things changed under the architecture, and they bind waves

The architecture closed at 1a9021f. Two commits that landed before it, and one
document that landed after it, carry facts it does not have. None of them
changes a decision; all three change a brief. Each is measured here rather than
inherited.

### 0.1 `src/lib/upload-budget.ts` exists, declares the cap the architecture
### called undeclared, and says it applies to Route Handlers

```
git log --diff-filter=A --format="%h %ad %s" --date=short -- src/lib/upload-budget.ts
  -> c853a9c 2026-08-10 fix: upload caps measured in the unit the platform actually enforces

grep -c "upload-budget\|checkFileWireBudget\|UPLOAD_WIRE_BUDGET" docs/a39-architecture.md
  -> 0   (exit 1)
grep -c "bodySizeLimit" docs/a39-architecture.md
  -> 6   (canary, same instrument, same call: the instrument fires on this file)
```

The module predates the architecture by six weeks and the architecture never
names it. Its header, opened:

```
awk 'NR>=1&&NR<=44' src/lib/upload-budget.ts
```

- `:5-7`: "Vercel caps a serverless function's REQUEST BODY at roughly 4.5MB at
  the platform layer. `bodySizeLimit` cannot raise it, **and the cap applies to
  Route Handlers exactly as it does to Server Actions.**"
- `:38` `export const VERCEL_BODY_LIMIT_BYTES = 4.5 * 1024 * 1024;`
- `:41` `export const UPLOAD_WIRE_BUDGET_BYTES = 3.5 * 1024 * 1024;`
- `:12-21` names the error the module exists to prevent: measuring FILE bytes
  against a WIRE limit, since base64 rides at 4/3.
- `:82-107` `checkWireBudget` / `checkFileWireBudget`.

```
grep -rn "upload-budget\|checkFileWireBudget" src --include=*.ts --include=*.tsx | wc -l
  -> 103 lines across the repo
grep -rn "checkFileWireBudgetZZZ" src                       # canary, exit 1
```

`next.config.ts:13-14` does set `serverActions: { bodySizeLimit: "10mb" }`
(`grep -n "bodySizeLimit\|serverActions" next.config.ts`), which is what the
architecture's 4.4 rested on. Measured against `upload-budget.ts:5-7`, that
10mb is not enforceable: the platform rejects a body over ~4.5MB before the
function runs.

**What this disproves, reported and not silently adopted.** Two sentences in
the architecture are false against the tree:

1. 4.4: the platform request-body cap "is not declared anywhere in this repo and
   which I cannot measure in this checkout". It is declared, at
   `upload-budget.ts:36-41`, with 103 reference lines and its own test file.
2. 4.4's escape justification: an over-budget entry routes to
   `mode: "whole-run"`, "sending that run down today's existing Server Action
   path, **which still has the declared 10 MB**". That path does not have 10 MB
   and, since `a9d9771`, it REFUSES over-budget zips at `grading.ts:831`.

**What this does NOT disprove: the construction.** `mode: "whole-run"` is still
correct, for a different measured reason - the whole-run path never re-uploads
an extracted entry; it grades server-side from the archive already in the
request. A 3MB zip can hold a 30MB text entry, so a per-item budget is real and
reachable, and the whole-run escape is the right sink for it. The wave records
the corrected reason in the comment beside the constant. See W4-12 and the gate
in 8.4.3.

This also rewrites **RES-A39A-3** from "owner-measurable, undeclared" to a
residual with an in-repo instrument. Carried as **RES-W-1** in section 12,
superseding A39A-3's premise. I am correcting a premise, not a decision.

### 0.2 `docs/g4-scope.md` Wave A: the per-item call needs a wall-clock
### deadline, INSIDE the wave that introduces the handler

`docs/g4-scope.md:482-506` records this as a requirement A39's own acceptance
criteria must carry, by inclusion and not by sequencing. Without it,
`maxDuration = 60` makes the kill point KNOWN, not graceful: the platform kill
"cannot be intercepted from in here, so it produces no response at all, not a
worded error" (`src/app/api/class-trends-insight/route.ts:39-45`, opened and
verbatim). It lands as a named step of wave 4c, not as a later row - section
8.4.3, step S2b, pass condition **W4-13**.

Three of g4's facts were re-measured here rather than inherited. Two hold; one
is a false absence and is refused.

**HOLDS - `callLlm` has exactly one branch.**

```
awk 'NR>=375&&NR<=386' src/lib/llm.ts
  ->  export async function callLlm(req, provider = DEFAULT_PROVIDER): Promise<LlmResult> {
        ... void provider;
        return callGemini(req);
      }
```

`:385` is `void provider;` and `:386` is `return callGemini(req);`. There is no
per-provider timing divergence to design around, and no wave below plans for
one. **No wave below changes `callLlm`'s signature**, which `docs/backlog.yml`
rules is a repo-wide seam needing its own chunking.

**HOLDS - both retry loops swallow any throw as transient.**

```
awk 'NR>=457&&NR<=463' src/lib/llm.ts
awk 'NR>=617&&NR<=623' src/lib/llm.ts
```

Both are byte-identical: `catch (err) { // Network/transport error - always
transient, retry with backoff. ... await sleep(backoffDelay(attempt, null));
continue; }`.

**REFUSED, with the measurement - "`raceWithTimeout` has zero production
callers today" is a FALSE ABSENCE.** `docs/g4-scope.md:321-328` states it and
prints the command it used. Re-run verbatim, then corrected:

```
# g4-scope.md:324, verbatim
grep -rln "raceWithTimeout" src --include=*.ts | grep -v "\.test\."
  -> src/lib/bounded-race.ts                         (exit 0)

# the same search with .tsx restored
grep -rln "raceWithTimeout" src --include=*.ts --include=*.tsx | grep -v "\.test\."
  -> src/app/components/canvas-tab/announcements-panel.tsx
     src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx
     src/lib/bounded-race.ts                          (exit 0)

grep -rln "raceWithTimeoutZZZ" src --include=*.ts --include=*.tsx   # canary, exit 1
```

`--include=*.ts` excludes `.tsx`, and all three production call sites are
`.tsx`: `announcements-panel.tsx:128`,
`WalkthroughAnnouncementPanel.tsx:303` and `:358`. This is the exclusion-filter
false absence `docs/loop/parallel-disjointness.md` section 6 names.

**It does not change g4's recommendation; it strengthens the brief.** Wave 4c is
NOT `raceWithTimeout`'s first production caller. There is a shipped call-site
template AND a shipped source-text instrument to copy:
`src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts:327-352`,
four assertions (imports the leaf; the call is passed INTO the wrapper, not
awaited directly; the named-function body contains the wrapped call; the bound
is the shared constant at both sites, count pinned to 2). Wave 4c ports that
shape instead of inventing one. Recorded so nobody writes a brief claiming a
first-caller risk that does not exist.

### 0.3 `837f2e3` grew `SnapshotGradingPanel.tsx` after the architecture
### measured it, and added a sixth source-text reader to `RubricInputModal.tsx`

Full arithmetic in section 2. The one consequence that changes a wave's write
set: `RubricInputModal.tsx` had five source-text readers when the architecture
measured (`docs/a39-architecture.md:489-494`); it now has six.

```
grep -rl "RubricInputModal.tsx" src --include="*.test.ts" | sort
  -> src/app/actions/syllabus-upload.rubric-reuse.test.ts
     src/app/components/grading-recording/rubric-input.test.ts
     src/app/components/snapshot-grading/snapshot-grading.structure.test.ts
     src/app/components/ui/buttonVariant.test.ts
     src/app/components/ui/modalAdoption.wiring.test.ts
     src/lib/syllabus-upload-source.test.ts

git show 0f52301:src/app/components/snapshot-grading/snapshot-grading.structure.test.ts | grep -c "RubricInputModal"
  -> 0        (it was NOT a reader before 837f2e3)
grep -n "RubricInputModal" src/app/components/snapshot-grading/snapshot-grading.structure.test.ts
  -> 856, 858
```

The new reader is `snapshot-grading.structure.test.ts`, which wave 3b already
writes, so no new file enters any write set - but a brief that says "the five
files naming RubricInputModal.tsx" is now wrong by one, and a wave 3b brief
must not be copied from the architecture's list.

---

## 1. Measurement preamble

Both mandated counters, run over every file any wave writes or owns as a
primary. `Measure-Object -Line` is never used
(`docs/loop/this-repo.md:160-173`; RULING 36 re-measured its gap at 15 to 138
across 13 files, so 42 is the smallest recorded gap and not a bound).

PowerShell:
`foreach ($f in $files) { "{0}`t{1}" -f @(Get-Content $f).Count, $f }`
Bash: `for f in ...; do printf "%s\t%s\n" "$(wc -l < $f)" "$f"; done`

**The two counters agree on every row below.** Where a row differs from
`docs/a39-architecture.md:1614-1635`, the delta and its cause are named.

| File | `@(Get-Content).Count` | `wc -l` | vs architecture 1.10 | 1000 minus count |
|---|---|---|---|---|
| `src/app/components/grading-recording/GradingRecordingPanel.tsx` | **990** | 990 | same | **10** |
| `src/app/components/snapshot-grading/SnapshotGradingPanel.tsx` | **989** | 989 | **+19 (837f2e3)** | **11** |
| `src/app/actions/grading.ts` | **917** | 917 | same | 83 |
| `src/app/components/GradingResults.tsx` | 906 | 906 | same | 94 |
| `src/app/components/snapshot-grading/snapshot-grading.structure.test.ts` | **863** | 863 | **+41 (837f2e3)** | 137 |
| `src/app/components/grading-recording/grading-rows.test.ts` | 733 | 733 | same | 267 |
| `src/app/components/LiveFeedPanel.tsx` | 719 | 719 | same | 281 |
| `src/app/components/repo-grades/useRepoGradesBulkGrade.lifecycle.test.ts` | **706** | 706 | not in that table | 294 |
| `src/app/page.tsx` | 703 | 703 | same | 297 |
| `src/app/actions/action-guard-coverage.test.ts` | **647** | 647 | not in that table | 353 |
| `src/app/components/CartridgeDropPanel.tsx` | 544 | 544 | same | 456 |
| `src/lib/github-grading-run-store.ts` | 501 | 501 | same | 499 |
| `src/lib/grade/engine.ts` | 498 | 498 | same | 502 |
| `src/app/components/repo-grades/useRepoGradesBulkGrade.ts` | 489 | 489 | same | 511 |
| `src/app/components/GradingTab.tsx` | 476 | 476 | same | 524 |
| `src/lib/grade/types.ts` | 406 | 406 | same | 594 |
| `src/app/components/grading-recording/RubricInputModal.tsx` | 375 | 375 | same | 625 |
| `src/lib/grading-drafts.ts` | 370 | 370 | same | 630 |
| `src/lib/grade-result-allowlist-coverage.test.ts` | 298 | 298 | same | 702 |
| `src/app/components/autoGradeTransition.wiring.test.ts` | **241** | 241 | not in that table | 759 |
| `src/app/api/class-trends-insight/route.ts` | 187 | 187 | same | 813 |
| `src/app/actions/grading.budget.test.ts` | **130** | 130 | not in that table | 870 |
| `src/lib/research/rubric-bank.ts` | 120 | 120 | same | 880 |
| `src/app/actions.ts` | 77 | 77 | same | 923 |
| `src/lib/course-lms-options.test.ts` | **49** | 49 | not in that table | 951 |
| `src/lib/grade.ts` | 19 | 19 | same | 981 |

`src/file-size-ceiling.structure.test.ts:41` is `const LIMIT = 1000;`
(`grep -n "LIMIT\b" src/file-size-ceiling.structure.test.ts`); `:138` applies it
and `:143-144` are the two failure messages. **No wave below proposes an
`ALLOWED_OVERAGE` entry.**

Tree state at the start of this pass:

```
git status --short   ->  M docs/css-orphans.md
git log --oneline -3 ->  1a9021f, f18994e, 837f2e3
```

`docs/css-orphans.md` was already modified at session start and this pass did
not touch it.

---

## 2. The moving targets, measured, with the delta and the owner

Two files in this plan's scope moved under the documents that describe them.
**Every line citation into either, in every A39 document, is stale by a
measured amount.** This section prices it; the rule at the end of each is
binding on the wave's brief.

### 2.1 `src/app/actions/grading.ts` - EVERY architecture citation is off

The architecture's 0.8 saw the count go 905 -> 917 and said "I read the line
counts and the diffstat, not the diff". The diff is `a9d9771`:

```
git log -1 --format=%h -- src/app/actions/grading.ts | xargs -I{} git show {} -- src/app/actions/grading.ts | grep "^@@"
  -> @@ -16,6 +16,7 @@
     @@ -821,6 +822,17 @@ export async function gradeAction(
```

**The shift rule, derived from those two hunk headers:**

| Old line (the 905 tree every A39 doc cites) | New line (the 917 tree) |
|---|---|
| 1 - 21 | unchanged |
| 22 - 820 | **+1** |
| 827 and above | **+12** |

Confirmed against the tree by
`grep -n "export async function gradeAction\|export async function gradeOneSubmissionAction\|effectiveRubric\|gradeSubmissions(\|synthesizeFullCreditChecklist(" src/app/actions/grading.ts`:

| Architecture cites | Measured now | Delta |
|---|---|---|
| `gradeAction` at `:705` | **`:706`** | +1 |
| `gradeOneSubmissionAction` at `:597-643` | **`:598-644`** | +1 |
| the `effectiveRubric` regenerate defect at `:633-635` | **`:634-636`** | +1 |
| the rubric synthesis at `:864-866` | **`:876-878`** | +12 |
| the Gemini zip `Promise.all` at `:870-874` | **`:882-886`** | +12 |
| "no file, no grade" at `:820-821` | **`:821-822`** | +1 |

**OWNER: wave 1's implementer.** **THE RULE, binding:** wave 1's brief is
written from the tree at dispatch time - `git status --short`, then
`@(Get-Content src/app/actions/grading.ts).Count`, then `grep -n` for the
anchor it is about to edit. It NEVER takes a `grading.ts` line number from
`docs/a39-architecture.md`, `docs/a39-check.md`, `docs/a39-census.md` or this
file. A concurrent writer took this file once inside one session; nothing
guarantees it will not happen again.

### 2.2 `SnapshotGradingPanel.tsx` - +19, and the shift is not uniform

```
git show 837f2e3 -- src/app/components/snapshot-grading/SnapshotGradingPanel.tsx | grep "^@@"
  -> @@ -58,6 +58,7 @@ import { snapshotRowCodec } from "./snapshot-row-serialization";
     @@ -729,6 +730,24 @@ export default function SnapshotGradingPanel({ active }: SnapshotGradingPanelPro
```

| Old line (the 970 tree) | New line (the 989 tree) |
|---|---|
| 1 - 63 | unchanged |
| 64 - 734 | **+1** |
| 735 and above | **+19** |

Confirmed by opening the region
(`awk 'NR>=138&&NR<=165' src/app/components/snapshot-grading/SnapshotGradingPanel.tsx`)
and by `grep -n 'onSubmit={(text) => {'`:

| Cited | Measured now | Delta |
|---|---|---|
| the dropped-policy comment, `:143-147` (architecture 1.4, 6.1) | **`:144-148`** | +1 |
| the instructor-instructions discriminator, `:150-157` | **`:151-158`**, with the `const` at `:159` | +1 |
| the hydration note, `:159-160` | **`:160-161`** | +1 |
| `onSubmit={(text) => {`, `:949` (RULING 34) | **`:968`** | +19 |
| the JSX tail `881-967` (RULING 34) | **`:703-989`**; `return (` measured at `:703` by `grep -n "^  return ("` | - |

**`snapshot-grading.structure.test.ts` did NOT shift.** 837f2e3's only hunk
there is `@@ -820,3 +820,44 @@` - a pure append. Every citation below 820 is
intact, verified by opening them:

```
awk 'NR>=120&&NR<=135' ...structure.test.ts   -> the U10 comment block, :124-133
awk 'NR>=141&&NR<=150' ...structure.test.ts   -> the MAJOR-1 / A4d header, :141-149
awk 'NR>=175&&NR<=205' ...structure.test.ts   -> dir scan :177-186; regex :188;
                                                 the U10 test NAME :195; exact set :196-202
awk 'NR>=206&&NR<=226' ...structure.test.ts   -> strippedCombinedSource :209; toMatch blocks :211-224
awk 'NR>=345&&NR<=362' ...structure.test.ts   -> the onSubmit-anchored test, :351-362
```

**OWNER: wave 3a-i's and wave 3b's implementers**, each writing from the tree.

### 2.3 The line-shift obligations THIS PLAN creates, with owners

| Shift | Who it lands on | Delta | Who re-pins |
|---|---|---|---|
| Wave 3a-i shrinks `SnapshotGradingPanel.tsx` (target per the branch chosen in 6.7), so every line in the extracted region and below moves by the extracted amount | **64** line-pinned citations into that file across `docs/*.md`, of which **13** point at line 703 or above - see the corrected derivation under this table | not yet known; the wave measures it | **Wave 3a-i's implementer records the delta in its own commit message and re-pins NOTHING in `docs/`.** Those are historical design documents; RULING 34 already rules the next brief is written from the post-extraction tree, never from them. What it MUST re-pin is the two in-source citations below |
| `src/app/components/snapshot-grading/snapshot-keys.ts:21` cites `SnapshotGradingPanel.tsx:73-80`; `:158` cites `SnapshotGradingPanel.tsx:550` | measured: panel `:73` is now `import panelStyles from "./SnapshotGrading.module.css";` and `:550` is `if (!items) return;` | already stale | **NOBODY, and this is a ruling.** Both comments say "moved verbatim from" / "matching ... original lookup verbatim" - they are PROVENANCE citations to a file state that no longer exists, not live pins. **No wave re-pins them to a new number**, because the line they describe is not in that file at all any more. Recorded so a later pass does not "fix" them into a false pin |
| Wave 3a-ii shrinks `GradingRecordingPanel.tsx`, moving whatever sits below the extraction | `src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts:39` and `:258` cite `GradingRecordingPanel.tsx:532-544` as the anti-pattern shape. Opened: `awk 'NR>=530&&NR<=546' src/app/components/grading-recording/GradingRecordingPanel.tsx` is exactly the `useEffect` + async-IIFE + `cancelled` block. The citation is ACCURATE today | 0 if the extraction stays below `:544`; otherwise the extraction's own delta | **Wave 3a-ii's implementer.** It is a COMMENT, so it cannot go red - which is exactly the silent-staleness class. Wave 3a-ii either leaves `:532-544` in place (preferred) or re-pins both comments in the same commit. Pass condition **W3a-ii-3** |
| Wave 1 edits `src/app/actions/grading.ts` around `:821-838` | **79** line-pinned citations into `GradingRecordingPanel.tsx` across `docs/*.md` are unaffected; `grading.ts` citations across `docs/*.md` are already stale per 2.1 | +20 estimated | **Wave 1's implementer** states the resulting count in its commit message. It re-pins nothing in `docs/` for the reason above |

#### 2.3.1 The citation counts, RE-DERIVED - revision 1's `awk` idiom was a string comparison

Revision 1 pasted `... | sed 's/.*://' | sort -n | awk '$1>=703' | wc -l -> 12`.
**That command does not produce 12.** `awk` compares `$1` against the string
`"703"` whenever `$1` is not a numeric-looking value, and a RANGE citation such
as `73-80` is not numeric-looking, so `"73-80" > "703"` is true on the third
character. Measured at HEAD `e7cabc4`, working tree:

```
grep -rnoE "SnapshotGradingPanel\.tsx:[0-9]+(-[0-9]+)?" docs --include=*.md | wc -l
  -> 64
grep -rnoE "SnapshotGradingPanelZZZ\.tsx:[0-9]+" docs --include=*.md     # canary, exit 1

# revision 1's command, re-run verbatim
grep -rhoE "SnapshotGradingPanel\.tsx:[0-9]+(-[0-9]+)?" docs --include=*.md \
  | sed 's/.*://' | sort -n | awk '$1>=703' | wc -l
  -> 17
# the values it wrongly admits, pasted (sort -u):
#   703  707-723  73-80  765-775  800-804  930  930-931  930-932  931  948  949
#   -> "73-80" is the false admission; it occurs 4 times, hence 17 - 4 = 13

# the CORRECTED command: take each range's START, then force numeric
grep -rhoE "SnapshotGradingPanel\.tsx:[0-9]+(-[0-9]+)?" docs --include=*.md \
  | sed 's/.*://' | sed 's/-.*//' | awk '$1+0>=703' | wc -l
  -> 13

grep -rnoE "GradingRecordingPanel\.tsx:[0-9]+(-[0-9]+)?" docs --include=*.md | wc -l
  -> 79
```

**These three counts are a SNAPSHOT, not an invariant, and the brief says so.**
Revision 1 measured 56 / 12 / 75 at `1a9021f`; three A39 documents have been
written since (`docs/a39-waves.md`, `docs/a39-waves-check.md`,
`docs/a39-waves-rulings.md`), and this revision changes the count again. The
BINDING part is unchanged and does not depend on the number: **no wave re-pins
any of them, and every downstream brief is written from the post-extraction
tree** (RULING 34). The count is carried only so that RES-W-9's direction of
failure - a brief written FROM one of those citations - stays legible. **The
broken `awk '$1>=703'` idiom appeared twice in revision 1 and is replaced at
both sites; it must not be copied into a wave brief.**

---

## 3. Findings that bind a wave and are not in the architecture

Reported, not re-argued. Each was produced by the command shown.

### 3.1 `a9d9771` put a wire-budget refusal in the exact region wave 1 edits

```
awk 'NR>=818&&NR<=838' src/app/actions/grading.ts
```

`:821-823` is the "Please upload a student submissions zip file." refusal.
`:825-830` is a six-line comment about the platform request-body cap.
`:831-834` is:

```
const zipBudgetCheck = checkFileWireBudget(file.size, "The student submissions zip");
if (!zipBudgetCheck.ok) {
  return { run: null, error: zipBudgetCheck.error ?? "That zip file is too large to upload." };
}
```

Wave 1 routes a non-zip upload through this same block. **If it routes around
the check, it ships an unbudgeted intake three commits after one was added for
zips.** Pass condition **W1-4**, and its watched failure is named in 8.1.

`src/app/actions/grading.budget.test.ts:123-128` already pins that boundary
against `upload-budget.ts`'s own export, so wave 1 owns that file - which is
one of the three files the architecture found missing from revision 1's lists.

### 3.2 No exact-key-set assertion over a `GradingRun` exists, so wave 2's two
### new optional fields turn nothing red by that route

```
grep -rn "Object.keys(" src --include=*.test.ts | grep -iE "run|draft|grade" | sort
```

30 hits, all opened. The only exact-key `.sort()` set near this work is
`src/app/actions/grading-submission-grade.test.ts:128-130`, and it ranges over
`result.results[0]` - a `GradeResult`, not a `GradingRun`. Wave 2 adds no
`GradeResult` field. **Canary on the same instrument:**
`grep -rc "Object.keys(" src/lib/grade-result-allowlist-coverage.test.ts`
returns 0, i.e. the coverage file uses a type-level exhaustiveness assertion
rather than `Object.keys` - which is precisely why W2-4 must add a run-level
one. Confirms the architecture's 6.4 diagnosis from the opposite direction.

Both rebuilders were opened and are exactly as the architecture measured:

```
awk 'NR>=161&&NR<=178' src/lib/grading-drafts.ts
  -> coerceGradingRun at :161, returning exactly
     {results, rubricAreaNames, fullCreditChecklist, speedGraderUrl, sampleAnswer}
awk 'NR>=270&&NR<=290' src/lib/github-grading-run-store.ts
  -> parseGradingRun at :270, returning the same five at :290
```

### 3.3 `src/lib/grade.ts` is a 52-importer barrel, and wave 4 only ADDS to it

```
grep -rnE 'from "(@/lib/grade|\.\./grade|\./grade)"' src --include=*.ts --include=*.tsx | sort | wc -l
  -> 52
grep -rnE 'from "(@/lib/gradeZZZ)"' src --include=*.ts    # canary, exit 1
cat src/lib/grade.ts                                      # 19 lines, pure re-exports
```

Wave 4b adds one export (`reconcileRun`). Additive; no existing importer
changes.

**CORRECTED, and it changes wave 4b's write set.** Revision 1 said "three test
files pin the string `"@/lib/grade"` as a runtime-graph fixture" and then named
two files, and characterised both only by their INERT fixture strings. Measured,
those two files do something else as well, and it is not inert:

```
grep -rn 'join(SRC, "lib", "grade.ts")' src --include="*.test.ts"
  -> src/app/components/grading-results/gradingResultsHelpersWiring.test.ts:154
     src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts:367
     src/lib/module-graph/runtime-import-graph.test.ts:572
grep -rn 'join(SRC, "lib", "gradeZZZ.ts")' src --include="*.test.ts"   # canary, exit 1
```

All three WALK the real `src/lib/grade.ts` runtime import graph as a **planted
positive**. Opened:

- `gradingResultsHelpersWiring.test.ts:153-159` - "R-5: a PLANTED POSITIVE proves
  this walk actually discriminates (the barrel this row exists to ban)":
  `canary.violations.length` > 0, `canary.unallowed.length` > 0, and
  `canary.violations.some((v) => v.resolved?.includes("lib/supabase/server"))`.
- `repoGradesFeedbackAndFiles.wiring.test.ts:366-378` - the same three
  assertions, as R-5a / R-5b / R-5c.
- `runtime-import-graph.test.ts:571-580` - R-15, the computed path form over the
  same grade-barrel canary walk.

**The conclusion survives and only the evidence changes**: `reconcileRun` is a
PURE leaf importing only `./types` and `./rubric`, so a re-export of it cannot
REMOVE the barrel's reach into `lib/supabase/server`, and all three planted
positives stay green. But the two files ARE readers of the file wave 4b edits,
so they belong in wave 4b's write set and in its gate. Both are added in 8.4.2.

The wider derivation, with its false positives discarded by opening each hit:

```
grep -rl "grade\.ts" src --include="*.test.ts" | sort
  -> src/app/actions/snapshot-parse-rubric.test.ts                       (discarded: :10 names snapshot-grade.ts)
     src/app/components/grading-recording/submission-kind-callsites.structure.test.ts (discarded: grading-submission-grade.ts)
     src/app/components/grading-results/gradingResultsHelpersWiring.test.ts          (KEPT)
     src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts        (KEPT)
     src/app/components/snapshot-grading/p11-containment-snapshot.test.ts (discarded: snapshot-grade.ts)
     src/app/components/snapshot-grading/snapshot-grading.structure.test.ts (discarded: snapshot-grade.ts, :377,:803-804)
     src/lib/grade/grade-result-doors.wiring.test.ts                     (KEPT as owned read-only: :127 names "grade.ts's own barrel" in a COMMENT)
     src/lib/module-graph/runtime-import-graph.test.ts                   (KEPT)
grep -rl "gradeZZZ\.ts" src --include="*.test.ts"                        # canary, exit 1
```

### 3.4 The `test:paths` wrapper, verified working before any gate below cites it

```powershell
npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
```

```
 Test Files  2 passed (2)
      Tests  21 passed (21)
COVERED src/lib/no-emojis.test.ts files=1 passed=18
COVERED src/source-bytes.structure.test.ts files=1 passed=3
EXIT=0
```

`package.json:21` defines `test:paths`. **Every multi-path gate below uses
`npm run test:paths -- <paths>`**, never a raw multi-path `vitest run`, which
silently drops unmatched arguments and exits 0
(`docs/loop/this-repo.md:30-45`). **Every argument to every `test:paths` gate
below is a `*.test.ts` file, never a production source path** - a gate passing
production source exits 1 on `NOT COVERED` before an implementer writes a line.
Where a gate names a test file the wave CREATES, it is marked `[created by this
wave]`; that gate is the wave's EXIT gate and is expected to fail until the
file exists.

---

## 4. The wave table

Six waves. `3a` is split because RULING 32 makes its first half an unblocker
for another backlog row, and because the two halves are not disjoint from each
other (section 9).

| # | Name | What it EXPORTS | Where that export is CALLED, in the same wave | Independently gateable? |
|---|---|---|---|---|
| **3a-i** | Snapshot panel extraction, headroom only. **RULING 32's unblocker: A24 is gated on this commit** | 1-2 new `.ts` leaves under `src/app/components/snapshot-grading/` | `SnapshotGradingPanel.tsx`, same commit | **YES** |
| **1** | One submission needs no zip | `classifyGradingUpload`, `buildSingleFileEntry` (`src/lib/grade/single-file-entry.ts`) | `src/app/actions/grading.ts` (server) and `src/app/components/GradingTab.tsx` (the intake control), same commit | **YES** |
| **3a-ii** | Recording panel extraction, headroom only | 1-2 new `.ts` leaves under `src/app/components/grading-recording/` | `GradingRecordingPanel.tsx`, same commit | **YES** |
| **2** | The rubric is remembered on A and H; the run records its version | `rubricFingerprint` (moved), `loadRubricMemory`/`saveRubricMemory`/`describeRubricOrigin`, `describeRunRubricProvenance`, `RubricProvenance`, `GradingRun.rubricUsed`/`.rubricFingerprint` | `engine.ts` (stamps), `GradingTab.tsx` (memory on A + the provenance mount), `CartridgeDropPanel.tsx` (memory on H), `grading-drafts.ts` + `github-grading-run-store.ts` (both carry the pair forward) - all same commit | **YES** |
| **3b** | The policy is deleted where it is asserted; F and G persist | nothing new; it is a second CALLER of wave 2's `rubric-memory.ts` | n/a - it exports nothing | **YES** |
| **4a** | The frozen oracle, captured from TODAY's implementation | nothing (test-only) | n/a | **YES, and it must go RED against the mutating code before 4b lands** |
| **4b** | Reconciliation becomes a projection | `reconcileRun` (`src/lib/grade/reconcile.ts`), re-exported by `src/lib/grade.ts` | `src/lib/grade/engine.ts:332-393` becomes the call, same commit | **YES** |
| **4c** | The run delivers row 1 while row 7 is still running | `prepareGradingRunAction`, the `POST` at `/api/grade-run-item`, `buildRunItemRequests`/`mergeArrivedResults`/`routeGradingRun`/`classifyItemFailure`/`INCREMENTAL_CONCURRENCY`/`ITEM_REQUEST_BYTE_BUDGET`, `useIncrementalGradingRun` | `GradingTab.tsx`'s `handleStartReview` calls `prepareGradingRunAction` and starts the pool; `useIncrementalGradingRun` is the only caller of the Route Handler - **all in the same commit** | **YES, and only as ONE commit.** See 4.1 |
| **5** | The credential has a route; the receipt reaches Live Feed | `isCanvasCredentialRequired`, `CANVAS_CREDENTIAL_CTA_HREF` | `GradingTab.tsx` and `LiveFeedPanel.tsx`, same commit | **YES** |

### 4.1 Why 4c cannot be cut between the handler and its caller

`src/app/api/grade-run-item/route.ts` exports a live `POST`. Its ONLY caller is
`useIncrementalGradingRun.ts`'s pool. **Committing the handler without the pool
ships a live POST endpoint that spends model calls and that nothing in the app
reaches** - which is this repo's most repeated structural failure
(`docs/a39-architecture.md` names it; the memory entry
`assignment-must-include-wiring-file` records it; the coordinator's own brief
names two POST endpoints that shipped with no surface). 4c is therefore ONE
commit with ordered STEPS, and the security instrument is step S1 of that
commit with its own watched failure - section 8.4.3. **Splitting 4c is the
defect, not the caution.**

The same rule applied to the rest: no wave above exports anything whose caller
is in a later wave. Wave 2's `rubric-memory.ts` is exported and called by
`GradingTab.tsx` and `CartridgeDropPanel.tsx` in wave 2 itself; wave 3b being a
SECOND caller later is an addition, not a deferred first caller. **No type-only
module exception is claimed anywhere in this plan.**

### 4.2 Ordering: what makes each edge necessary

| Edge | Why, from the stated write sets |
|---|---|
| 3a-i before any A24 wave | **RULING 32.** Two extraction targets on one 989-line file is arithmetic, not priority; whichever lands second measured against a tree that no longer exists, and a ceiling gate passes silently either way |
| 3a-i before 3a-ii | Not a dependency - a WRITE-SET COLLISION. Both own `snapshot-autofire.structure.test.ts` (section 9.1) |
| 1 before 2 before 4c before 5 | All four write `src/app/components/GradingTab.tsx` and `src/app/components/autoGradeTransition.wiring.test.ts` (section 9.1, pasted) |
| 2 before 4b | Both write `src/lib/grade/engine.ts` and its three source-text readers (section 9.1) |
| 2 before 3b | 3b is a caller of `src/lib/grade/rubric-memory.ts`, which wave 2 creates. Also a one-file collision (section 9.1) |
| 3a-i before 3b, 3a-ii before 3b | 3b adds ~+14 and ~+10 to panels at 989 and 990. Without the extraction the ceiling gate is red at the first feature line |
| 4a before 4b | **An oracle authored by the wave that writes the new function is a restatement.** `docs/a39-architecture.md` 5.1; this repo's `guard-before-migration` discipline |
| 4b before 4c | 4c's per-item call needs reconciliation to be idempotent under a growing canonical set, which is what 4b constructs |
| **3b and 4 are independent and run CONCURRENTLY** | Intersection empty, pasted in 9.1. The architecture ruled the same; this plan re-derived it on today's tree |
| **3a-i and 1 are independent and run CONCURRENTLY** | Intersection empty, pasted in 9.1 |

### 4.3 The dispatch schedule

| Slot | Concurrent items | Cap 2-3? | tsc owner in the window |
|---|---|---|---|
| 1 | **3a-i** + **1** | 2 | gates run sequentially; 3a-i's gate first (it is the A24 release), then wave 1's |
| 2 | **3a-ii** | 1 | 3a-ii |
| 3 | **2** | 1 | 2 |
| 4 | **3b** + **4a/4b/4c** | 2 | wave 4's gate, then wave 3b's. Neither may sabotage-verify while the other is mid-gate |
| 5 | **5** | 1 | 5 |

**Slot 2 alternative, stated with its tripwire and NOT recommended.** 3a-ii and
2 share exactly one file, `src/app/actions/grading-submission-grade.test.ts`
(9.1). Opened: it names `GradingRecordingPanel.tsx` only inside a COMMENT at
`:313` ("GradingRecordingPanel.tsx's handleGradeAll"), and imports
`@/lib/grade/types` at `:30` for `UNGRADED_NOT_ATTEMPTED_MESSAGES`; its
exact-key assertion at `:128-130` is over a `GradeResult`, which wave 2 does not
touch. So both sides are read-only in practice. An orchestrator MAY run
3a-ii and 2 concurrently if and only if 3a-ii's brief pins `handleGradeAll` in
place inside `GradingRecordingPanel.tsx`. **Recommendation: sequence them.** 3a-ii is a small
mechanical wave; `docs/loop/parallel-disjointness.md` section 6's last failure
mode is parallelising because you can, and here it buys minutes and reopens a
risk class.

### 4.4 DISPOSITION of every architecture pass condition - the table revision 1 owed

This plan restructured wave 3 into 3a-i / 3a-ii / 3b and wave 4 into 4a / 4b /
4c. `docs/loop/iteration-caps.md` entry gate 3 requires a disposition table for
exactly that, and revision 1 shipped none - which is how **W4-7**, the ONLY
measurement behind A39's whole leverage claim, went missing without anybody
having to decide to drop it. Derived, not recalled:

```
comm -23 <(grep -oE "\*\*W[0-9a-z-]+-[0-9]+[a-z]?" docs/a39-architecture.md | sort -u | tr -d '*') \
         <(grep -oE "W[0-9a-z-]+-[0-9]+[a-z]?\b" docs/a39-waves.md | sort -u)
  -> W2-6
     W4-7
grep -coE "\*\*W[0-9a-z-]+-[0-9]+[a-z]?" docs/a39-architecture.md    # canary: 38 bold ids, the instrument fires
```

Two were missing at revision 1. **Both are restored below.** Every one of the
architecture's 29 ids now has a row, and the four ids this plan ADDED are listed
after it.

| Architecture id | Disposition in this plan | Carried by |
|---|---|---|
| W1-1 `.docx` never classifies as zip | KEPT verbatim | wave 1, 7.3 |
| W1-2 single entry, no `groupSubmissionsByStudent` | KEPT verbatim | wave 1, 7.3 |
| W1-3 owner-only cold count | KEPT, routed to RES-W-6 | wave 1, 7.3 |
| W2-1 rubric memory returns nothing before a file name | KEPT verbatim | wave 2, 8.2 |
| W2-2 scope keying | KEPT verbatim | wave 2, 8.2 |
| W2-3 removal test for claim 1 | KEPT verbatim | wave 2, 8.2 |
| W2-4 run-level sentinel through both rebuilders + `tsc` half | KEPT verbatim | wave 2, 8.2 |
| W2-5 import graph did not widen | KEPT verbatim | wave 2, 8.2 |
| **W2-6** multi-path gate over the four keys and both parsers | **ABSORBED, and now stated as absorbed.** Its five paths (`rubric-memory.test.ts`, `rubricProvenance.test.ts`, `grade-result-allowlist-coverage.test.ts`, `github-grading-run-store.test.ts`, `grading-drafts.test.ts`) are all arguments of wave 2's gate in 8.2, which is a superset. **Absorption is only legitimate because `npm run test:paths` prints `COVERED` per argument**, so each of the five is individually accounted for and a silently-dropped path exits 1. Under a raw multi-path `vitest run` the absorption would be a deletion | wave 2's gate, 8.2 |
| W2-7 three presence-then-comparison clauses | KEPT verbatim | wave 2, 8.2 |
| W2-8 the `Rubric used` spelling | KEPT verbatim | wave 2, 8.2 |
| W3-1 extraction first, post-3b gate | KEPT, and the post-3b bound is **RE-DERIVED** in 8.3 because 3b's real addition is larger than the architecture's estimate | waves 3a-i / 3a-ii / 3b |
| W3-2 policy grep | KEPT, **and its command is FIXED** (it could not match) and its PASS re-derived from what the corrected command returns - 8.3 | wave 3b, 8.3 |
| W3-3 the new-key canaries bind | KEPT verbatim | wave 3b, 8.3 |
| W3-4 lint baseline | KEPT verbatim | wave 3b, 8.3 |
| W4-1 the engine-test FLOOR | KEPT, and explicitly named a floor | wave 4b, 8.4.2 |
| W4-2 / W4-2b the frozen oracle and idempotence | KEPT verbatim | wave 4a, 8.4.1 |
| W4-3 removal test for claim 2 | KEPT verbatim | wave 4c |
| W4-4 no regeneration in the seam | KEPT verbatim | wave 4c, S2 |
| W4-5 ordering | KEPT verbatim | wave 4c |
| W4-6 cancellation costs nothing already paid, and adds no `run-deadline` writer | KEPT as to the accumulator clauses; **the source-text clause is SPLIT into W4-6a and W4-6b and both commands are FIXED** - the pasted one could not match, and corrected it was red on today's tree against a remembered writer set. 8.4.3, step S4 | wave 4c, S4 |
| **W4-7** owner-only wall-clock elapsed, before and after | **RESTORED VERBATIM as an owner-verification pass condition.** It is the only measurement of A39's leverage claim, and revision 1 carried the residual it points at (RES-A39A-4 via RES-W-12) while dropping the condition itself - which is exactly how a leverage claim becomes unmeasured. Stated in 8.4.5 alongside the structurally identical W1-3 and W5-2 | wave 4c, **8.4.5** |
| W4-8 stop control placement | KEPT verbatim | wave 4c, S5 |
| W4-9 press twice | KEPT as to object and direction; **its SEAM MOVES** so the instrument can reach it (RULING 39) - 8.4.3, step S4 | wave 4c, S4 |
| W4-10 the Route Handler guard | KEPT, **and its negative control is rebuilt** from one fixture to three (RULING 41) - 8.4.3, step S1 | wave 4c, S1 |
| W4-11 concurrency floor | KEPT verbatim, named a pure-predicate claim | wave 4c, RES-W-11 |
| W5-1 predicate by identity | KEPT verbatim | wave 5, 8.5 |
| W5-2 owner-only | KEPT, routed to RES-W-6 | wave 5, 8.5 |
| W5-3 provenance on the Live Feed surface | KEPT verbatim | wave 5, 8.5 |

**Conditions this plan ADDS, each with the reason it did not exist upstream:**

| New id | Why it exists | Where |
|---|---|---|
| W1-4 | `a9d9771` put a wire-budget refusal in the exact block wave 1 edits, after the architecture measured (3.1) | 7.3 |
| W3a-i-1/2/3, W3a-ii-1/2/3 | The architecture treated the extraction as one commit; this plan splits it, and a split needs its own watched failures and the line-shift obligation (2.3) | 6.4, 8.1 |
| **W3-5** | **RES-A39A-15's STEP says "in wave 3, as a read-only check over the two panels it writes" and revision 1 carried no such check** (8.3) | 8.3 |
| W4-6a / W4-6b | W4-6's single grep conflated two different objects, and neither was measurable through the pattern as written | 8.4.3 S4 |
| W4-9b / W4-9c | The `.tsx` half of W4-9's object, and the react-hook budget the shipped harness imposes | 8.4.3 S4 |
| W4-12 | The per-item byte cap, asserted rather than declared | 8.4.3 S3 |
| W4-13 | `docs/g4-scope.md` Wave A's wall-clock deadline, by inclusion | 8.4.3 S2b |

---

## 5. Gates: the standing form, and what a pass looks like

Run from **PowerShell** (`docs/loop/this-repo.md` section 1). Bash is not on
PATH from PowerShell.

| Gate | Command | Passing looks like |
|---|---|---|
| Typecheck | `npx tsc --noEmit --incremental false` | **No output at all**, exit 0. Any output is a failure. `--incremental false` is required here: `tsconfig.json` sets `"incremental": true` and every run writes `tsconfig.tsbuildinfo` at the repo root, which two concurrent agents race on (`docs/loop/this-repo.md:135-141`). **Exactly one caller per window** - named per slot in 4.3 |
| Lint | `npm run lint` | `4 problems (0 errors, 4 warnings)`, exit 0. A fifth warning or any error is a regression introduced by the wave (`docs/loop/this-repo.md:82-87`) |
| Named tests | `npm run test:paths -- <p1> <p2> ...` | `COVERED <path> files=N passed=M` for **every** argument, exit 0. A `NOT COVERED` line is a failure even when the suite is green |
| **Full suite** | **`npm test`** | **`Test Files N passed (N)` with ZERO failed, exit 0.** See 5.1 - this gate was missing from revision 1 entirely and it is the only thing that ranges over readers no wave enumerated |
| One test | `npx vitest run <one path>` | exit 0. Legitimate for a single path only (`docs/loop/this-repo.md:44-45`) |
| Ceiling | `@(Get-Content <file>).Count` (PowerShell) AND `wc -l < <file>` (Bash) | both agree, and both at or under the wave's stated bound. The repo-wide test compares `lineCount > limit` (`src/file-size-ceiling.structure.test.ts:138`, opened), so **1000 exactly PASSES and 1001 is RED** - a bound stated as "at 1000" is not a bound |
| Tree | `git status --short` in the MAIN checkout | exactly the wave's assignment, nothing else. `.claude/worktrees` holds a copy Glob returns FIRST (`docs/loop/this-repo.md:246-253`); a report is not evidence |

### 5.1 The full-suite gate, and why an enumerated `test:paths` list is not enough

Revision 1 had no `npm test` gate anywhere
(`grep -n "npm test" docs/a39-waves.md` returned nothing, exit 1, against a
canary of 10 lines for `npm run test:paths`). Every wave's coverage was a
hand-enumerated list, against `docs/loop/traps-spec.md`'s rule that **the
orchestrator's enumeration is a FLOOR, never the set**. It leaked immediately:
wave 4b edits `src/lib/grade.ts` and two of that file's three real source-text
readers were in no wave at all (3.3).

**`npm test` is a gate on EVERY wave**, run after the wave's `test:paths` gate
and before the tree check. Measured today, at HEAD `e7cabc4` with
`M docs/css-orphans.md` in the tree, exit code read from a file:

```powershell
npm test 2>&1 | Select-Object -Last 25 | Out-File -Encoding utf8 $out
"EXIT=$LASTEXITCODE" | Out-File -Encoding utf8 -Append $out
```
```
 Test Files  1111 passed (1111)
      Tests  22454 passed (22454)
   Duration  107.40s
EXIT=0
```

**Three things a wave must know before it reads that output.**

1. **`docs/loop/this-repo.md:27` records `Test Files 1017 passed (1017)` /
   `Tests 20200 passed (20200)` / 63.6s.** Measured here: **1111 / 22454 /
   107.40s.** The card is stale by +94 files, +2254 tests and +44s. **This plan
   does not write `docs/loop/this-repo.md`** and does not correct it; the delta
   is recorded as **RES-W-16** with an owner. A wave that expects 1017 and sees
   1111 must not read that as a defect.
2. **The PASS is "zero failed", never a pinned file count.** Every wave here
   creates test files, so the count RISES by design. Pinning it would make each
   wave's gate red for the reason the wave exists.
3. **The run's stderr is not clean and that is not this repo's failure.** This
   run emitted `fatal: invalid gitfile format:
   C:/Users/alexa/AppData/Local/Temp/shipped-uncited-test-OSCQPH/.git` and two
   `LF will be replaced by CRLF` warnings, from a concurrent sibling's temporary
   worktree - not from vitest. **Read the `Test Files` line and the exit code
   from a file; do not grade the gate on stderr being empty.**

**`npm run lint` is a gate on wave 3a-i, 3a-ii and 3b** - every wave that
touches `SnapshotGradingPanel.tsx` or removes hooks from either panel.
`docs/loop/this-repo.md:89-104` records the measured trap: moving a ref cache
out of `SnapshotGradingPanel.tsx` typechecked and passed 311 tests, then failed
`npm run lint` with 2 new errors naming `handleNextStudentConfirm`, a callback
touching none of the moved code. The rule is React Compiler's
`preserve-manual-memoization`, not `exhaustive-deps`. The shipped workaround:
keep the ref and its effect declared in the panel and pass the ref into the new
hook as a parameter. `handleNextStudentConfirm` is at
`SnapshotGradingPanel.tsx:406` today (`grep -n "const handleNextStudentConfirm"`).

**`npx tsc --noEmit --incremental false` is a gate on every wave that changes a
type**: 1 (new module), 2 (**required** - it is half of W2-4), 4b, 4c, 5. It is
run anyway on 3a-i, 3a-ii and 3b because an extraction moves types across a
module boundary.

**Three repo-wide gates run on every wave**, because they walk directories and
collect new files automatically: `src/file-size-ceiling.structure.test.ts`,
`src/lib/no-emojis.test.ts` (`roots = ["src", "docs"]` at `:254` - it scans
`docs/` too, so it is the gate over THIS file) and
`src/source-bytes.structure.test.ts`. They are owned READ-ONLY by every wave.

---

## 6. Wave 3a-i - the Snapshot panel extraction (RULING 32's unblocker)

**GOAL: headroom only. No feature line lands in this commit.**

> ### NOT DISPATCHABLE UNTIL RULING 37'S QUESTION IS ANSWERED
>
> `docs/a39-waves-rulings.md` RULING 37 escalated this wave's SHAPE to the owner
> as a terminating question, because it collides a CLOSED architecture's
> `.ts`-only rule against the orchestrator's own RULING 33 arithmetic, which was
> measured over JSX component boundaries that must be `.tsx`. **A `.ts` file
> cannot hold JSX; a `.tsx` component has no oracle, because nothing renders
> under vitest here.** The rulings file states three answers - (a) `.tsx`
> components with no oracle, (b) `.ts` leaves with oracles, (c) ship the feature
> without the extraction - with a recommendation of (a).
>
> **This plan adopts NO branch.** Sections 6.1 through 6.6 are the parts that are
> IDENTICAL under all three answers and are briefable today. **Section 6.7 is the
> branch table**: what the write set, the target, the watched failures and the
> gate become under each answer, and what each answer costs wave 3b. An
> implementer is dispatched against 6.1-6.6 PLUS exactly one column of 6.7, and
> not before.
>
> **The consequence that makes this urgent:** RULING 32 gates A24 on this same
> commit, so an unanswered question blocks two backlog rows, not one.

### 6.1 Write set, derived

```
grep -rl "SnapshotGradingPanel.tsx" src --include="*.test.ts" | sort
```

```
src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts
src/app/components/snapshot-grading/snapshot-grading.structure.test.ts
src/app/components/snapshot-grading/snapshot-role-setrole-callsites.structure.test.ts
src/loop-docs.structure.test.ts
```

Canary, same instrument, same call:
`grep -rl "SnapshotGradingPanelZZZ.tsx" src --include="*.test.ts"` -> exit 1.

| Path | Role |
|---|---|
| `src/app/components/snapshot-grading/SnapshotGradingPanel.tsx` | **edit.** The file that shrinks, and **THE CALLER** of every new leaf |
| `src/app/components/snapshot-grading/<new leaf>` (1-2 files) | **new.** **The EXTENSION is the open question - see 6.7 and do not assume one.** Under branch (b) it is `.ts` (shipped example in this directory: `useSnapshotKeyboardShortcuts.ts`); under branch (a) it is `.tsx` (shipped examples in this directory: `SnapshotShotTray.tsx`, `ConfirmedRubricAreasEditor.tsx`, `SnapshotCaptureBar.tsx`); under branch (c) no leaf is created at all. **Line budget under (a) and (b): `-le 300` per leaf**, both counters, stated because revision 1 gave every new file in this plan no bound at all and the only backstop was the repo-wide 1000 |
| `src/app/components/snapshot-grading/<new leaf>.test.ts` | **new UNDER BRANCH (b) ONLY.** The leaf's own oracle. Under (a) no such file can exist - `vitest.config.ts` collects `src/**/*.test.ts` in a node environment and renders nothing, so a `.tsx` component has no oracle to go red. Under (c) there is no leaf. **Line budget `-le 300`** |
| `src/app/components/snapshot-grading/snapshot-grading.structure.test.ts` | **edit if and only if** the extraction crosses one of its anchors - see 6.3 |
| `src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts` | **owned.** Reads the panel as source (`:54`: `path.join(SNAPSHOT_GRADING_DIR, "SnapshotGradingPanel.tsx")`) |
| `src/app/components/snapshot-grading/snapshot-role-setrole-callsites.structure.test.ts` | **owned** |
| `src/loop-docs.structure.test.ts` | **owned, read-only.** It matched the grep because it contains the STRING; opened, `:247-273` asserts that `docs/loop/this-repo.md` still records the lint trap between the lint-baseline paragraph and `## 2. Tests`. No wave edits `this-repo.md`, so it stays green - named so nobody "tidies" that trap entry |
| `src/file-size-ceiling.structure.test.ts`, `src/lib/no-emojis.test.ts`, `src/source-bytes.structure.test.ts` | **owned, read-only.** The gates |

### 6.2 The ceiling arithmetic, re-derived at 989

```powershell
@(Get-Content src/app/components/snapshot-grading/SnapshotGradingPanel.tsx).Count   # 989
```
```
wc -l < src/app/components/snapshot-grading/SnapshotGradingPanel.tsx                # 989
grep -n "^  return (" src/app/components/snapshot-grading/SnapshotGradingPanel.tsx  # 703
```

Hooks region `:84-702` (619 lines), JSX tail `:703-989` (287 lines).

| Bound | Value | Where it comes from |
|---|---|---|
| Gate at 3a-i | **`-le 940`**, both counters, **under branches (a) and (b)** | `docs/a39-architecture.md` 5.3. Kept |
| Net lines to move | **49** | 989 - 940 |
| Gate after 3b | **`-le 958`, re-derived** | 940 + 3b's real addition - see 8.3, which re-prices it. The architecture's `-le 955` came from a +14 estimate that does not include W3-5's `maxRows` caps |
| Headroom to the repo ceiling after 3b | 42 | 1000 - 958 |

**THE SHAPE ARITHMETIC, and it is branch-dependent - do not brief it as settled.**
RULING 33 measured, against the 970 tree, that FIVE separate components land the
panel at **931-938** while TWO GROUPED components land at **913-918**, because
each extraction boundary costs its own call site and at this headroom the call
sites are the budget. The panel is now 989. Adding 837f2e3's measured +19 to
those outcomes gives **950-957** for the five-component shape and **932-937** for
the grouped shape.

**Those figures price JSX COMPONENT call sites**
(`docs/a24-a39-sequencing.md:37-40`: `<SnapshotShotTray>` 8 lines,
`<ConfirmedRubricAreasEditor>` 9, `<SnapshotCaptureBar>` 15), **so they apply to
branch (a) and to branch (a) only.** A hook leaf's call site is one destructuring
line, not 8-15, so the same arithmetic cannot be transferred to branch (b)
without re-measuring - and no such measurement exists in any A39 document. That
is precisely the collision RULING 37 escalated, and 6.7 carries the consequence
for each branch instead of resolving it.

**What IS unambiguous under (a) and must be briefed there:** at 989 the
many-small-components shape cannot reach 940. The constraint is fewer, larger
components - the opposite of what an extraction pass instinctively does.

The 940 target and 3b's +14 are both provisional. `docs/a39-architecture.md`
section 10 admits neither panel was read line by line, and this repo's own
`modulesview-at-ceiling` memory records a dedicated agent sizing an extraction
against the 1000 limit rather than the feature's additions and still leaving
the file bigger. **The gate is `@(Get-Content).Count` on the real tree at the
wave, never a number in any document.**

### 6.3 The two anchors an extraction can break silently

Both measured, both in `snapshot-grading.structure.test.ts`, which is NOT
shifted by 837f2e3 (2.2):

1. **`:351-362`** anchors on `panelSource.indexOf("onSubmit={(text) => {")`,
   a literal at panel `:968` (`grep -n 'onSubmit={(text) => {'`). Moving that
   JSX out of the panel makes the index `-1`; the test does assert
   `toBeGreaterThan(-1)` at `:354`, so it goes RED rather than vacuous - which
   is good. If the extraction touches `{rubricModalOpen && (` at the tail,
   that test file is in the write set (RULING 34).
2. **`:141-174`**, the A4d cross-directory block for `ta-snap-table`, and
   **`:177-224`**, the directory scan + exact key set + three `toMatch` wiring
   blocks. The scan is `fs.readdirSync(SNAPSHOT_GRADING_DIR)` non-test files
   (`:177-186`), so **a new leaf in this directory is automatically inside the
   haystack.** If the extraction moves a `ta-snap-*` literal or a
   `localStorage.getItem(CONST)` call into the new leaf, the exact set at
   `:196-202` still passes (same directory) and the `toMatch` blocks at
   `:211-224` still pass (same `combinedSource`). Verified by opening both.
   **So an extraction inside this directory is canary-safe** - and that is the
   reason the leaf must stay in this directory rather than moving to
   `src/lib/`.

   **Canary safety does NOT depend on the extension, and this is measured, not
   assumed** - so it is not an argument for either branch of 6.7. Opened,
   `snapshot-grading.structure.test.ts:178` is
   `const nonTestFiles = files.filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"));`,
   and `:180-182` asserts `nonTestFiles.length` is greater than 3 - a real
   presence assertion, so a scan over an empty or renamed directory fails rather
   than passing vacuously. **A `.tsx` leaf in this directory is inside the
   haystack exactly as a `.ts` one is.** Recorded so nobody reaches for canary
   safety as a reason to pick branch (b).

### 6.4 Watched failures - what this wave must see fail before it is done

| id | The failure, watched | How |
|---|---|---|
| **W3a-i-1** | The ceiling gate RED at 989 | Run `npx vitest run src/file-size-ceiling.structure.test.ts` BEFORE the extraction and confirm the panel is NOT named (it is at 989, under 1000, so this gate is green today). **This one is a control, not a failure**: it establishes that the gate is not already red for an unrelated reason. Then run the new leaf's own test before the leaf exists and watch `NOT COVERED` |
| **W3a-i-2** | The extraction is not merely a move. **BRANCH (b) ONLY** | The new leaf's own test must fail against an empty leaf file. Write the test first, run `npx vitest run src/app/components/snapshot-grading/<new leaf>.test.ts`, watch it go RED, then move the code. **Under branch (a) this condition is WITHDRAWN and 6.7 names the enforcer it protected** |
| **W3a-i-3** | **`npm run lint` is the one that bites.** Watch for the React Compiler `preserve-manual-memoization` error on a callback the wave did not touch | Run `npm run lint` after the move. If a fifth warning or any error appears naming a callback outside the moved code, apply the shipped workaround (`docs/loop/this-repo.md:100-104`): keep the ref and its effect in the panel, pass the ref into the leaf as a parameter. **Do NOT silence the rule** |

### 6.5 Gate

```powershell
npm run test:paths -- src/app/components/snapshot-grading/snapshot-grading.structure.test.ts src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts src/app/components/snapshot-grading/snapshot-role-setrole-callsites.structure.test.ts src/loop-docs.structure.test.ts src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
```

**Under branch (b) ONLY**, that command gains one more argument,
`src/app/components/snapshot-grading/<new leaf>.test.ts`, marked
`[created by this wave]`. **Under branch (a) it must NOT be appended**: no such
file can exist, and `test:paths` exits 1 on `PRE-CHECK FAILED / does not exist
on disk` for a path that is not on disk - measured by the round-1 check running
wave 5's gate as written.

```powershell
npm test
npx tsc --noEmit --incremental false
npm run lint
@(Get-Content src/app/components/snapshot-grading/SnapshotGradingPanel.tsx).Count
git status --short
```
```
wc -l < src/app/components/snapshot-grading/SnapshotGradingPanel.tsx
```

**PASS:** every `test:paths` argument prints `COVERED`, exit 0; `npm test` shows
zero failed and exits 0 (5.1); `tsc` prints nothing; lint prints
`4 problems (0 errors, 4 warnings)`; both counters agree and both are `<= 940`
under branches (a) and (b); `git status --short` shows only this wave's paths.
**Under branch (c) this whole section does not run** - see 6.7.

### 6.6 The A24 release

**Until this commit lands, no A24 wave touching
`src/app/components/snapshot-grading/SnapshotGradingPanel.tsx` or
`src/app/components/snapshot-grading/snapshot-grading.structure.test.ts` may be
dispatched** (`docs/a24-a39-sequencing.md` RULING 32). On landing, A24 wave 0's
target is **RE-DERIVED, not adjusted**: measure the panel with
`@(Get-Content ...).Count` on the post-extraction tree, add A24's re-costed
addition, and state the new target with the command that produced it. RULING
33's corollary binds the re-derivation too: re-cost the SHAPE, not just the
number, and if this wave already grouped the same region A24 may need no
extraction at all.

### 6.7 THE BRANCH TABLE - what 6.1-6.6 become under each of RULING 37's answers

**Nothing here picks a branch.** Each column is what an implementer is handed
IN ADDITION to 6.1-6.6, once the answer arrives. The rows are the only things
that differ; everything not in this table is identical under all three answers.

| | **(a) `.tsx` components, no oracle** | **(b) `.ts` leaves with oracles** | **(c) no extraction** |
|---|---|---|---|
| **New leaf extension** | `.tsx`, 1-2 files, `-le 300` each | `.ts`, 1-2 files, `-le 300` each | none |
| **New leaf test** | **none is possible.** `vitest.config.ts` collects `src/**/*.test.ts` in a node environment; nothing renders | `<new leaf>.test.ts`, `-le 300`, `[created by this wave]` | none |
| **W3a-i-2** | **WITHDRAWN.** Enforcer it protected: **NOTHING.** No `.tsx` file in this repo has a unit test, so withdrawing it removes no executing assertion - it removes an assertion that was never constructible. Stated explicitly because `iteration-caps.md` calls an undeclared withdrawal a deletion | **KEPT verbatim** as written in 6.4 | **WITHDRAWN**, same enforcer: nothing |
| **What replaces the oracle** | The three instruments that remain, and the brief says these are ALL of them: (1) the ceiling gate on both counters; (2) `snapshot-grading.structure.test.ts`'s existing anchors, which the extraction must leave green - notably `:351-362`'s `onSubmit={(text) => {` index, which goes RED rather than vacuous because `:354` asserts `toBeGreaterThan(-1)`; (3) `npm run lint` at 4/0 | The leaf's own oracle, plus all three of (a)'s | n/a |
| **Target** | `-le 940`, reachable per RULING 33's grouped figure of **932-937** (989-tree arithmetic, 6.2) | `-le 940`, **reachability UNKNOWN.** RULING 33's figures priced JSX call sites and do not transfer. The wave ENUMERATES the hooks region FIRST - `:84-702`, 619 lines - and re-derives its own target BEFORE moving a line | no target; the panel stays at 989 |
| **If the target is unreachable** | Not expected; if it happens, it is RES-W-5's direction of failure and the wave stops and reports | **A FINDING REPORTED TO RULING 32, not a shape change.** The wave does NOT silently switch to `.tsx` to hit the number - that would resolve the owner's question by implementation. It stops, states the enumerated candidate regions and their line counts, and hands the number back | n/a |
| **Gate** | 6.5 exactly as printed, with NO appended leaf-test argument | 6.5 plus the leaf test argument | 6.5 does not run |
| **Cost to wave 3b, MEASURED** | none. 940 + 3b's addition is inside 8.3's re-derived `-le 958` | none if 940 is reached; if it is not, 3b inherits the shortfall line for line | **3b's Snapshot half CANNOT LAND.** `989 + 14 = 1003`, and `src/file-size-ceiling.structure.test.ts:138` fails on `lineCount > 1000`, so 1003 is RED with no `ALLOWED_OVERAGE` entry - and section 1 rules that no wave here proposes one. `GradingRecordingPanel.tsx` at `990 + 10 = 1000` passes by exactly zero lines, which is not headroom, it is a coincidence |
| **Cost to A24 (RULING 32)** | A24 re-derives against the post-extraction tree, and may need no extraction of its own if this wave already grouped the region | same, but A24 waits on the enumeration result first | **A24 is not unblocked at all.** RULING 32's premise was that the extraction lands first; under (c) there is no extraction, so A24's own target must be re-costed against 989 from scratch |

**Two things bind under ALL THREE branches and are not negotiable by the answer:**

1. **`npm run lint` is a gate and the React Compiler workaround is the shipped
   one.** `docs/loop/this-repo.md:89-104` records that moving a ref cache out of
   this exact panel typechecked, passed 311 tests, and then failed lint with two
   new errors naming `handleNextStudentConfirm` - a callback touching none of the
   moved code. The rule is `preserve-manual-memoization`. Keep the ref and its
   effect declared in the panel and pass the ref into the new leaf as a
   parameter. **Do not silence the rule.** This is a property of moving code out
   of a React component and is indifferent to the extension of the destination.
2. **The wave measures with BOTH counters and re-derives before moving a line**
   (RES-W-5). The two counters disagree by 15 to 138 across 13 files in this repo
   (RULING 36), so a single-counter number is not a measurement.

---

## 7. Wave 1 - one submission needs no zip

### 7.1 Write set, derived

```
for n in "GradingTab.tsx" "actions/grading.ts"; do echo "### $n"; grep -rl "$n" src --include="*.test.ts" | sort; echo; done
```

```
### GradingTab.tsx
src/app/components/autoGradeTransition.wiring.test.ts
src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts
src/app/components/grading-results/gradingResultsHelpersEditState.test.ts

### actions/grading.ts
src/app/actions/grading-missing-submissions.test.ts
src/app/actions/grading-run-mapping.test.ts
src/app/actions/grading.budget.test.ts
src/lib/grade/postable.test.ts
```

Canary: `grep -rl "GradingTabZZZ.tsx" src --include="*.test.ts"` -> exit 1.

| Path | Role |
|---|---|
| `src/lib/grade/single-file-entry.ts` | **new.** PURE. `classifyGradingUpload(name): "zip" \| "single" \| "unsupported"` and `buildSingleFileEntry(name, buffer): StudentSubmissionEntry \| null`. Reuses `getFileExtension`, `TEXT_EXTENSIONS`, `DOCUMENT_EXTENSIONS`, `extractTextFromBuffer` (`office-extract.ts:80,13,55,179`), `IMAGE_EXTENSIONS`, `getMimeType` (`grade/constants.ts:41,62`), `toPreviewContent` (`grade/utils.ts:49`). **No new dependency** |
| `src/lib/grade/single-file-entry.test.ts` | **new.** The oracle |
| `src/app/actions/grading.ts` | **edit. THE CALLER (server).** Routes a non-zip upload to `gradeEntries([entry], ...)` instead of `gradeSubmissions`. **Write this brief from the tree - see 2.1. Every line number for this file in every A39 document is off by +1 or +12** |
| `src/app/components/GradingTab.tsx` | **edit. THE CALLER (the control).** `accept` at `:238`, copy at `:240` - both verified open today by `awk 'NR>=226&&NR<=242'` |
| `src/app/components/autoGradeTransition.wiring.test.ts` | **owned.** A5 `:159-162`, A6 `:164-190`, A7 `:192-202`, `gtSource` built at `:99`. All four verified open today |
| `src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts`, `.../gradingResultsHelpersEditState.test.ts` | **owned.** Same file, source text |
| `src/app/actions/grading-missing-submissions.test.ts`, `src/app/actions/grading-run-mapping.test.ts`, **`src/app/actions/grading.budget.test.ts`**, `src/lib/grade/postable.test.ts` | **owned.** Name `actions/grading.ts`. The budget test is one of the three files the architecture found missing and it is in THIS wave, because this wave edits the file it names AND the block it guards (3.1) |
| `src/file-size-ceiling.structure.test.ts`, `src/lib/no-emojis.test.ts`, `src/source-bytes.structure.test.ts` | **owned, read-only** |

### 7.2 Ceiling arithmetic

| File | Now | Est. delta | Est. after | Gate |
|---|---|---|---|---|
| `src/app/actions/grading.ts` | **917** | +20 | 937 | **`-le 945`, re-derived at the wave against the real file** |
| `src/app/components/GradingTab.tsx` | 476 | +12 | 488 | `-le 520` |
| `src/lib/grade/single-file-entry.ts` | **new, 0** | a pure classifier plus one builder, reusing six existing helpers | ~120 | **`-le 200`** |
| `src/lib/grade/single-file-entry.test.ts` | **new, 0** | W1-1's six-extension table plus W1-2 | ~150 | **`-le 300`** |

**Every new file in this plan now carries a bound.** Revision 1 gave none of
them one, which left the repo-wide 1000 as the only backstop - and 1000 is a
ceiling for a file that GREW into it, not a budget for a file being born. The
numbers above and in 8.1, 8.2, 8.4.2 and 8.4.4 are budgets a wave may spend, not
predictions; a wave that needs more states the measured reason in its commit
message rather than silently exceeding one.

### 7.3 Watched failures

| id | Object | Instrument | The failure, watched before the fix |
|---|---|---|---|
| **W1-1** | `classifyGradingUpload` over `{"a.zip", "essay.docx", "paper.pdf", "notes.txt", "shot.png", "x.exe"}` | `npx vitest run src/lib/grade/single-file-entry.test.ts` | **RED if `.docx` classifies as `"zip"`.** This is the live hazard, not a hypothetical: a `.docx` IS a zip, `JSZip.loadAsync` (`extraction.ts:117`) opens it, `TEXT_EXTENSIONS` (`office-extract.ts:13-52`) contains `"xml"` at `:18`, so `word/document.xml` is "supported" and `leafStemFallback` (`utils.ts:121-126`) names the student `document`. **Write the test first and watch it fail against an empty `classifyGradingUpload` that returns `"zip"` for everything** |
| **W1-2** | `buildSingleFileEntry("essay.docx", buf)` | same | RED if it returns more than one entry, if the entry's `student` is the empty string, or if it routes through `groupSubmissionsByStudent`. **Watched by asserting against a first implementation that DOES call `groupSubmissionsByStudent` and seeing the student come back as `document`** |
| **W1-4** | the single-file path's request size | `npx vitest run src/app/actions/grading.budget.test.ts` | **RED if a single non-zip upload reaches `gradeEntries` without passing `checkFileWireBudget`** (3.1). **Watched by adding the assertion first, against today's code where the non-zip path does not exist, then against a first implementation that routes around the check at `grading.ts:831`.** The refusal label must name the thing being refused ("That submission file", not "The student submissions zip"), because `checkWireBudget` interpolates it into the user-facing message (`upload-budget.ts:90-93`) |
| **W1-3** | interactions from a cold app to a first graded single submission, before and after | **the owner, in a real browser** | RED if the count does not fall, or if any removed interaction reappears after the result. **NOT a suite claim - nothing renders under vitest.** RES-A39A-1 / RES-W-6 |

### 7.4 What wave 1 must NOT do

- It must not change `formAction` wiring. **A5 (`autoGradeTransition.wiring.test.ts:159-162`) still asserts `/formAction\(/` matches EXACTLY ONCE in `GradingTab.tsx`**, and `action={formAction}` at `:228` does not match that regex. Wave 1 adds no `formAction(` call. A5 changes in wave 4c and nowhere else.
- It must not touch `src/lib/grade/utils.ts`. The multi-submission zip mis-grouping is **RES-A39A-8**, a different chunk.
- It must not add a zip-magic sniff. A `.docx` renamed to `.zip` is **RES-A39A-9** and stays open; W1-1 stops the app CLASSIFYING a `.docx` as a zip, which is a different and smaller claim.

### 7.5 Gate

```powershell
npm run test:paths -- src/lib/grade/single-file-entry.test.ts src/app/actions/grading-missing-submissions.test.ts src/app/actions/grading-run-mapping.test.ts src/app/actions/grading.budget.test.ts src/lib/grade/postable.test.ts src/app/components/autoGradeTransition.wiring.test.ts src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts src/app/components/grading-results/gradingResultsHelpersEditState.test.ts src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
```
`src/lib/grade/single-file-entry.test.ts` is `[created by this wave]`.
```powershell
npm test
npx tsc --noEmit --incremental false
@(Get-Content src/app/actions/grading.ts).Count
@(Get-Content src/app/components/GradingTab.tsx).Count
@(Get-Content src/lib/grade/single-file-entry.ts).Count
@(Get-Content src/lib/grade/single-file-entry.test.ts).Count
git status --short
```

**PASS:** eleven `COVERED` lines, exit 0; `npm test` zero failed, exit 0 (5.1);
`tsc` silent; `grading.ts` `<= 945`, `GradingTab.tsx` `<= 520`, and both new
files `<= 200` / `<= 300` on both counters; `git status --short` matches the list
in 7.1 exactly.

---

## 8. The remaining waves

### 8.1 Wave 3a-ii - the Recording panel extraction

**Write set, derived:**

```
grep -rl "GradingRecordingPanel.tsx" src --include="*.test.ts" | sort
```

17 files; pasted in full in section 9.2's `w3aii.txt`. Canary
`grep -rl "GradingRecordingPanelZZZ.tsx" src --include="*.test.ts"` -> exit 1.

Plus `src/app/components/grading-recording/GradingRecordingPanel.tsx` (**edit,
and THE CALLER** of the new leaves) and 1-2 new `.ts` leaves with their tests.

**Ceiling:** `@(Get-Content).Count` -> **990**, `wc -l` -> 990. `return (` at
`:694` (`grep -n "^  return ("`), so roughly 600 lines of hooks precede ~296
lines of JSX. Gate `-le 940` at 3a-ii (50 lines to move); **`-le 950` after 3b**
(940 + 3b's +10 for this panel; see 8.3, which re-prices the Snapshot side only).
New leaves and their tests carry the same `-le 300` budget as 6.1's.

**RULING 37's branch question binds this wave TOO, and it is not separately
escalated.** 8.1's own text inherits 6.2's grouped-not-scattered constraint and
6.1's shape rule, so the identical `.ts`-versus-`.tsx` collision exists here.
**Wave 3a-ii is dispatched on whichever branch the owner's answer to RULING 37
selects, applied unchanged**, with one measured difference recorded so nobody
re-litigates it: this panel's hooks region is ~600 lines against the Snapshot
panel's 619, and RULING 33's arithmetic was never run against this file at all -
so under branch (b) the "reachability UNKNOWN" row of 6.7 applies here a fortiori,
and under branch (a) there is no pre-existing per-component measurement to lean
on either. **Either way this wave enumerates its own candidate regions and
re-derives its own target before moving a line**, exactly as RES-W-5 obliges
3a-i.

**Watched failures:**

- **W3a-ii-1** - the new leaf's test RED against an empty leaf, before the move.
- **W3a-ii-2** - `npm run lint` at `4 problems (0 errors, 4 warnings)`. The
  React Compiler trap is recorded for `SnapshotGradingPanel.tsx` specifically,
  but the rule reacts to a component's whole hook count and shape, so it is a
  gate here too.
- **W3a-ii-3 - the line-shift obligation (2.3).**
  `snapshot-autofire.structure.test.ts:39` and `:258` cite
  `GradingRecordingPanel.tsx:532-544`, which is accurate today
  (`awk 'NR>=530&&NR<=546'`). **It is a COMMENT and cannot go red.** Preferred:
  leave `:532-544` in place. Otherwise the wave re-pins both comments in the
  same commit. **Watched by**: `grep -n "GradingRecordingPanel.tsx:" src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts`
  before and after, and `awk` over the cited range on the post-extraction tree
  to confirm it still shows the `useEffect` + async-IIFE + `cancelled` block.

**Gate:**

```powershell
npm run test:paths -- src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts src/app/components/grading-recording/GradingRecordingPanel.assessment.test.ts src/app/components/grading-recording/GradingAssessmentDeclarationControls.test.ts src/app/components/grading-recording/grading-recording-log.test.ts src/app/components/grading-recording/grading-rows.test.ts src/app/components/grading-recording/markLate.wiring.test.ts src/app/components/grading-recording/submission-kind-callsites.structure.test.ts src/app/actions/grading-submission-grade.test.ts src/app/components/module-deck-capture/ModuleDeckCapturePanel.wiring.test.ts src/app/components/module-deck-capture/module-deck-dispatch.test.ts src/app/components/recording/AddKnowledgePages.test.ts src/app/components/recording/discussion-capture.test.ts src/app/components/recording/discussion-knowledge-context.test.ts src/app/components/recording/runLogRow.test.ts src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts src/app/components/ui/buttonVariant.test.ts src/lib/recording-launch.test.ts src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
```
plus, **under branch (b) only**, the new leaf's own test `[created by this wave]`
- and under branch (a) NOT appended, for the reason 6.5 gives.
```powershell
npm test
npx tsc --noEmit --incremental false
npm run lint
@(Get-Content src/app/components/grading-recording/GradingRecordingPanel.tsx).Count
git status --short
```
```
wc -l < src/app/components/grading-recording/GradingRecordingPanel.tsx
```

**PASS:** every argument `COVERED`, exit 0; `npm test` zero failed, exit 0;
`tsc` silent; lint at `4 problems (0 errors, 4 warnings)`; both counters agree
and both `<= 940`; new leaves and their tests `<= 300`; `git status --short`
shows only this wave's paths.

### 8.2 Wave 2 - the rubric is remembered on A and H, and the run records its version

**Write set. STATED AS PATHS IN THIS DOCUMENT, not delegated.** Revision 1 said
"the architecture's section 8 list, adopted with three additions" and left the
paths of the two files wave 2 must CREATE appearing nowhere in this plan - their
only trace was the JSX literal `<RubricProvenance` inside W2-7 and one test path
in the gate. That contradicts this plan's own statement of purpose ("what each
may write") and its own 0.3 finding, which forbids writing a wave 3b brief from
the architecture's reader list because that list is now stale by one. A brief
cannot be stale in a direction nobody looked.

**The files wave 2 CREATES, each with a bound:**

| Path | Role | Budget, both counters |
|---|---|---|
| `src/lib/grade/rubric-memory.ts` | **new.** `loadRubricMemory` / `saveRubricMemory` / `describeRubricOrigin`. Called by `GradingTab.tsx` (path A) and `CartridgeDropPanel.tsx` (path H), same commit | `-le 250` |
| `src/lib/grade/rubric-memory.test.ts` | **new.** W2-1, W2-2 | `-le 350` |
| `src/lib/research/rubric-fingerprint.ts` | **new.** `rubricFingerprint`, MOVED out of `rubric-bank.ts`, which re-exports it so `rubric-bank.ts:70`'s own upsert is unchanged. The move is what W2-5 exists for: importing `rubric-bank.ts` into `engine.ts` would widen the engine's runtime closure to a Supabase client | `-le 120` |
| `src/lib/grade/rubricProvenance.ts` | **new.** `describeRunRubricProvenance`, reading `run.rubricUsed` / `run.rubricFingerprint`. Called by `RubricProvenance.tsx` | `-le 150` |
| `src/lib/grade/rubricProvenance.test.ts` | **new.** W2-3 | `-le 300` |
| `src/app/components/grading-results/RubricProvenance.tsx` | **new.** The leaf. Mounted by `GradingTab.tsx` above the `<GradingResults` mount at `:427`, same commit; wave 5 adds `LiveFeedPanel.tsx` as a second mount | `-le 150` |
| `src/app/components/grading-results/rubricProvenanceLeaf.test.ts` | **new.** W2-8, the spelling half. **It reads the `.tsx` as SOURCE TEXT** - it does not render it, and the brief says so, because nothing renders here | `-le 200` |

`src/lib/research/rubric-fingerprint.ts` and
`src/app/components/grading-results/RubricProvenance.tsx` are the two paths
`docs/a39-architecture.md:1913,1928` names and revision 1 omitted.

**W2-6 IS THIS WAVE'S GATE, absorbed and now stated so** (4.4). The architecture's
W2-6 is a `test:paths` run over `rubric-memory.test.ts`, `rubricProvenance.test.ts`,
`grade-result-allowlist-coverage.test.ts`, `github-grading-run-store.test.ts` and
`grading-drafts.test.ts`. All five are arguments of the gate below. The
absorption is legitimate ONLY because `npm run test:paths` prints a `COVERED`
line per argument and exits 1 on any `NOT COVERED`, so each of the five is still
individually accounted for; under a raw multi-path `vitest run` the same
absorption would be a silent deletion (`docs/loop/this-repo.md:30-45`).

Derivation for the two persistence modules and the type:

```
for n in "grade/types.ts" "grading-drafts.ts" "github-grading-run-store.ts" "CartridgeDropPanel.tsx"; do echo "### $n"; grep -rl "$n" src --include="*.test.ts" | sort; echo; done
```

```
### grade/types.ts
src/app/actions/grading-submission-grade.test.ts
src/app/components/grading-recording/copy-feedback.test.ts
src/app/components/grading-results/gradingResultsHelpers.test.ts
src/app/components/grading-results/gradingResultsHelpersWiring.test.ts
src/app/components/repo-grades/repoGradePostScore.test.ts
src/app/components/repo-grades/repoGradeScoreDisplay.test.ts
src/app/components/repo-grades/repoGradesCodeExecution.wiring.test.ts
src/lib/github-grading-run-store.test.ts
src/lib/grading-drafts.test.ts

### grading-drafts.ts
src/lib/grade-result-allowlist-coverage.test.ts
src/lib/repo-grading-log.test.ts

### github-grading-run-store.ts
src/lib/github-grading-run-store.test.ts
src/lib/grade-result-allowlist-coverage.test.ts
src/lib/grading-drafts.test.ts

### CartridgeDropPanel.tsx
src/lib/course-lms-options.test.ts
```

Canary: `grep -rl "grade/typesZZZ.ts" src --include="*.test.ts"` -> exit 1.

**`src/lib/course-lms-options.test.ts` (49 lines) is the ONLY source-text reader
of `CartridgeDropPanel.tsx`** - the second of the three files the architecture
found missing. It is in this wave.

**`src/lib/grade-result-allowlist-coverage.test.ts` (298 lines) is the third,
and it is the most important file in wave 2.** Its header, opened
(`awk 'NR>=1&&NR<=20'`), states the class: three modules each hold their own
explicit allowlist of `GradeResult` fields, `submissionTruncated` was silently
dropped by one of them once, and the file exists so a FUTURE field gets the same
treatment automatically on two levels - a compile-time
`ALL_GRADE_RESULT_FIELDS` exhaustiveness assertion that fails
`npx tsc --noEmit`, and a runtime sentinel pushed through each function.
**It covers `GradeResult`. There is no sibling for `GradingRun`.** Wave 2 adds
`ALL_GRADING_RUN_FIELDS` and a run-level sentinel.

Three additions this pass derived and the architecture's list does not carry:

- `src/lib/research/rubric-bank.test.ts` - **owned.** `rubric-bank.ts` has NO
  source-text reader (`grep -rl "rubric-bank.ts" src --include="*.test.ts"`
  returns nothing, exit 1, against a canary of 4 hits for
  `grep -rl "upload-budget" src --include="*.test.ts"`), but its test imports
  the module by path (`grep -rn "from \"./rubric-bank\"" src`). Wave 2 moves
  `rubricFingerprint` out and re-exports it; the import-based reader must stay
  green.
- `src/lib/grade.strip.test.ts` - **owned.** It imports `GradingRun` from
  `"./grade"` (`grep -rnE 'from "(@/lib/grade|\./grade)"' src | grep strip`),
  and the barrel re-exports the type wave 2 widens.
- `src/lib/workflows/grading-review-rows.ts` - **owned, READ-ONLY.**
  `stripGradingRunForDraft:90-92` uses a spread and therefore PRESERVES a new
  field. Named so a later pass does not "tidy" its spread into a rebuild.

`src/app/components/GradingResults.tsx` is **NOT in this wave** (architecture
2.2), which removes its 18 source-text readers from the list.

**Ceiling:**

| File | Now | Est. delta | Gate |
|---|---|---|---|
| `src/lib/grade/engine.ts` | 498 | +6 (three stamp sites) | `-le 520` |
| `src/lib/grade/types.ts` | 406 | +6 | `-le 430` |
| `src/app/components/GradingTab.tsx` | 488 after wave 1 | +36 | `-le 560` |
| `src/app/components/CartridgeDropPanel.tsx` | 544 | +16 | `-le 600` |
| `src/lib/grading-drafts.ts` | 370 | +4 | `-le 400` |
| `src/lib/github-grading-run-store.ts` | 501 | +4 | `-le 530` |
| `src/lib/grade-result-allowlist-coverage.test.ts` | 298 | +40 | `-le 380` |
| `src/lib/research/rubric-bank.ts` | 120 | -8 | must not rise |

**The three engine stamp sites, verified open today:**

```
grep -n "rubricAreaNames:" src/lib/grade/engine.ts   -> :379 (a declaration), :437, :489
awk 'NR>=393&&NR<=400' src/lib/grade/engine.ts       -> return { at :395, }; at :399
```

`:395-399` is the result-carrying return; `:437` and `:489` are the two empty
`GradingRun` literals. **All three, or "every run carries the pair" is false on
two of them.**

**Watched failures:**

| id | The failure, watched before the fix |
|---|---|
| **W2-1** | `loadRubricMemory` returns something for path A **before a file name is supplied**. Watched by writing the assertion first against a first implementation that restores the last-used entry unconditionally - which is the cheapest green and the exact wrong-grades-that-look-right trap RULING 31 names. The condition ranges over the PAIR (text + origin string), never the text alone |
| **W2-2** | scope B returns scope A's text with an empty or absent `describeRubricOrigin`. Watched against an implementation whose label function returns `""` |
| **W2-3** | **THE REMOVAL TEST for claim 1.** Sabotage: make `describeRunRubricProvenance` read the CURRENT store instead of `run.rubricUsed`/`run.rubricFingerprint`. Mutate the store's rubric text. **Watch the run's reported fingerprint change, i.e. the test go RED.** Restore |
| **W2-4** | **THE PROVENANCE-DROP INSTRUMENT, both rebuilders.** A run-level sentinel `GradingRun` with distinctive `rubricUsed` and `rubricFingerprint` values is pushed through `coerceGradingRun` (`grading-drafts.ts:161`) and through the `serializeGithubGradingRun` / `parseStoredGithubGradingRun` round trip (`github-grading-run-store.ts:270`). **Watched FIRST against today's code: both rebuilders return exactly five fields (opened, `awk 'NR>=161&&NR<=178'` and `awk 'NR>=270&&NR<=290'`), so the sentinel values do NOT survive and the test is RED before either module is edited.** That is the whole point - optional fields do not stop a field-by-field rebuild dropping them. Then, independently: `npx tsc --noEmit --incremental false` RED if a field is added to `GradingRun` without being added to `ALL_GRADING_RUN_FIELDS`. **Watched by adding a third throwaway field to `GradingRun`, seeing tsc fail, removing it.** Second sabotage: delete `rubricUsed` from `coerceGradingRun`'s literal, watch RED, restore |
| **W2-5** | the engine's runtime import closure widened to include a Supabase client via the fingerprint import. Watched by importing `rubric-bank.ts` (not `rubric-fingerprint.ts`) into `engine.ts` first and seeing `runtime-import-graph.test.ts` go RED, then doing the extraction |
| **W2-7** | **each clause is a PRESENCE assertion followed by a comparison.** `indexOf` returns `-1` for an absent literal and `-1` is less than every index, which is how revision 1's version passed by construction (RULING 28). Three clauses: (1) `id="assignment-instructions"`, `id="rubric"` and `id="cartridge-rubric"` are each present AND each carries a `maxRows` prop inside its own `<TextField ...>` tag; (2) `indexOf("<RubricProvenance")` in `GradingTab.tsx` is `>= 0` AND less than `indexOf("<GradingResults")`, which is itself `>= 0`; (3) `indexOf("<RubricProvenance")` in `GradingResults.tsx` is `-1`. **Watched by running clause 2 against a tree where `RubricProvenance` is not yet mounted and confirming it FAILS on the presence half, not the comparison half** |
| **W2-8** | the literal `Rubric used` absent from `RubricProvenance.tsx`, or any of `Rubric applied` / `Rubric source` / `Graded against` present. Watched against a stub containing `Rubric applied` |

Verified anchors for W2-7 clause 1, opened today
(`awk 'NR>=293&&NR<=322' src/app/components/GradingTab.tsx`): `minRows={10}` at
`:297` and `:313`, `id="assignment-instructions"` at `:299`, `id="rubric"` at
`:315`, neither with `maxRows`; the conditional render at `:308` is
`{(source === "zip" || rubric.trim()) && (`; `readOnly: source === "canvas"` at
`:301` and `:317`. `CartridgeDropPanel.tsx:409` is `minRows={4}` with no
`maxRows` (`grep -n "minRows\|maxRows" src/app/components/CartridgeDropPanel.tsx`
returns exactly those three lines, canary `minRowsZZZ` exit 1). The
`<GradingResults` mount is at `GradingTab.tsx:427` inside the gate at `:426`
(`awk 'NR>=424&&NR<=428'`).

**Gate:**

```powershell
npm run test:paths -- src/lib/grade/rubric-memory.test.ts src/lib/grade/rubricProvenance.test.ts src/lib/grade-result-allowlist-coverage.test.ts src/lib/github-grading-run-store.test.ts src/lib/grading-drafts.test.ts src/lib/repo-grading-log.test.ts src/lib/research/rubric-bank.test.ts src/lib/grade.strip.test.ts src/lib/module-graph/runtime-import-graph.test.ts src/lib/grade/engine.test.ts src/lib/grade/engine.ungraded.test.ts src/lib/code-runner.test.ts src/lib/grade/grouping-zip-parents.wiring.test.ts src/app/components/grading-results/ungradedDisclosure.test.ts src/app/components/grading-results/rubricProvenanceLeaf.test.ts src/app/components/autoGradeTransition.wiring.test.ts src/lib/course-lms-options.test.ts src/app/actions/grading-submission-grade.test.ts src/app/components/grading-recording/copy-feedback.test.ts src/app/components/grading-results/gradingResultsHelpers.test.ts src/app/components/grading-results/gradingResultsHelpersWiring.test.ts src/app/components/repo-grades/repoGradePostScore.test.ts src/app/components/repo-grades/repoGradeScoreDisplay.test.ts src/app/components/repo-grades/repoGradesCodeExecution.wiring.test.ts src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts src/app/components/grading-results/gradingResultsHelpersEditState.test.ts src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
```
`rubric-memory.test.ts`, `rubricProvenance.test.ts` and
`rubricProvenanceLeaf.test.ts` are `[created by this wave]`.
```powershell
npm test
npx tsc --noEmit --incremental false
git status --short
```
plus `@(Get-Content <file>).Count` and `wc -l < <file>` for the eight files in
the ceiling table **and for the seven new files in the write-set table above**.

**`npx tsc --noEmit --incremental false` is not optional on this wave.** It is
half of W2-4's direction of failure, and the only thing that catches a
`GradingRun` field added without an `ALL_GRADING_RUN_FIELDS` entry.

### 8.3 Wave 3b - the policy is deleted where it is asserted, F and G persist

**Write set:** `RubricInputModal.tsx` (**edit**, delete the asserted policy),
`GradingRecordingPanel.tsx` (**edit, THE CALLER** - declares
`STORAGE_KEY_RUBRIC = "ta-rec-grade-rubric"`, calls `rubric-memory`),
`SnapshotGradingPanel.tsx` (**edit, THE CALLER** - declares both `ta-snap-*`
constants; **delete the policy at `:144-148`, NOT `:143-147` - see 2.2**),
`grading-rows.test.ts` (**edit, required**), `snapshot-grading.structure.test.ts`
(**edit, required**), `src/lib/grade/rubric-memory.ts` (**owned, READ-ONLY** -
wave 2 wrote it; wave 3b is a second caller and must not change its shape), the
17 readers of `GradingRecordingPanel.tsx`, the 4 of `SnapshotGradingPanel.tsx`,
and the **6** of `RubricInputModal.tsx` (0.3 - not 5).

**The canary work, and why it is satisfiable.** Verified open today:

| Directory | Exact-set scan | Its haystack | Wiring assertion |
|---|---|---|---|
| `grading-recording/` | regex `/ta-rec-grade-[a-z-]*/g` at `grading-rows.test.ts:678`; the 7-key `toEqual` at `:679-687` | `combined` = `grading-recording/` non-test files PLUS `assessment-shared/` (`:650-658`) | `isWired` at `:697-716`, driven by `it.each` at `:718-732` |
| `snapshot-grading/` | regex at `snapshot-grading.structure.test.ts:188`; the 4-key `toEqual` at `:196-202`; the test NAME at `:195` asserts the dropped policy in prose | `SNAPSHOT_GRADING_DIR` non-test files only (`:177-186`) | three `toMatch` blocks at `:211-224` over `strippedCombinedSource` (`:209`) |

**The exact-set scans gain the new keys. The directory-local wiring lists do
NOT** - `src/lib/grade/` is in neither haystack and extending them would ship a
wave whose gate cannot go green (RULING 28, architecture 6.3). Each new key
instead gets a block modelled on `snapshot-grading.structure.test.ts:141-174`,
whose own header at `:142-148` states the hazard verbatim: "A4d can be unwired
with every other gate green." Its three assertions are the template: the panel
declares the constant; the panel actually CALLS the store with that constant,
comment-stripped; the store passes its key parameter through to both
`localStorage.getItem` and `localStorage.setItem`.

**CEILING - all FIVE bounds, three of which revision 1 dropped.** The
architecture set five for wave 3 (`docs/a39-architecture.md:1503-1505`) and
revision 1's gate block counted only two panels. Both counters, measured today:

| File | Measured now | 3b's addition | Est. after | Gate |
|---|---|---|---|---|
| `src/app/components/snapshot-grading/SnapshotGradingPanel.tsx` | **989** (both) | +14 feature, **+2 for W3-5's two `maxRows` caps** | 940 + 16 = 956 | **`-le 958`, RE-DERIVED** (the architecture's 955 came from +14 alone) |
| `src/app/components/grading-recording/GradingRecordingPanel.tsx` | **990** (both) | +10 feature; W3-5 adds nothing here (it has zero `multiline` fields - see W3-5) | 940 + 10 = 950 | **`-le 950`, RE-DERIVED** and tighter than the architecture's 955 |
| `src/app/components/grading-recording/RubricInputModal.tsx` | **375** (both) | -7 deleted policy, +12 replacement | 380 | **`-le 420`.** Architecture's bound, KEPT - it reproduces |
| `src/app/components/grading-recording/grading-rows.test.ts` | **733** (both) | +1 key in the 7-key `toEqual` at `:679-687`, plus ONE A4d-shaped block modelled on `snapshot-grading.structure.test.ts:141-174` (34 lines) | ~769 | **`-le 790`.** Architecture's bound, KEPT - it survives the re-pricing with 21 lines of slack |
| `src/app/components/snapshot-grading/snapshot-grading.structure.test.ts` | **863** (both) | **+2 keys in the exact set, plus TWO A4d-shaped blocks at 34 lines each = ~+70**, plus the rewritten test NAME at `:195` (net 0) | ~933 | **`-le 940`, RE-DERIVED. The architecture's `-le 890` is RED before the wave starts.** See below |

**Why `-le 890` had to be re-derived, stated rather than quietly widened.** The
architecture estimated `822 + 26 = 848` against a bound of 890. That file is
**863 today** - `837f2e3` appended 41 lines to it (2.2: its only hunk there is
`@@ -820,3 +820,44 @@`, a pure append, which is also why every citation below
820 is intact). And 8.3's own instruction is that each new key gets "a block
modelled on `snapshot-grading.structure.test.ts:141-174`" - a **34-line**
template - for TWO keys. `863 + 68 = 931`, not 848. The architecture's +26 was
not an estimate of this work; it was an estimate of a smaller one against a
smaller file. **A bound of 890 would go red at the wave's second A4d block, and
a bound of 1000 would catch nothing between 890 and 1000** - which is how a
ceiling gate stops being a measurement. `-le 940` is 7 lines above the estimate
and leaves 60 to the repo ceiling. **The wave re-measures before it estimates**
(RES-W-7's discipline, applied to a test file).

**Watched failures:**

- **W3-1** - both panels over their bound. Watched by running the ceiling gate
  after the first feature line and before the wave's own arithmetic, at 989 and
  990 pre-extraction, to confirm the gate is the thing stopping the feature.
- **W3-2 - THE POLICY GREP, WITH A WORKING PATTERN AND A PASS RE-DERIVED FROM
  WHAT IT ACTUALLY RETURNS.** Revision 1's gate form put `|` in a pattern with
  neither `-E` nor BRE `\|`, so GNU grep searched for a literal pipe character,
  returned nothing and exited 1 - **which made wave 3b's gate PASS today, before
  anything was deleted.** Measured, both forms and a pattern-validity canary:

  ```
  # revision 1's GATE form, verbatim
  grep -rn "persists it|not persisted|out of localStorage" src/app/components/grading-recording src/app/components/snapshot-grading
    -> no output, EXIT=1

  # THE CORRECTED FORM - this is the gate
  grep -rnE "persists it|not persisted|out of localStorage" src/app/components/grading-recording src/app/components/snapshot-grading
    -> 6 lines, EXIT=0

  # PATTERN-VALIDITY CANARY, same instrument, same call: proves the ALTERNATION
  # is being parsed, not merely that the files were read
  grep -rnE "persists itZZZ|not persistedZZZ|out of localStorageZZZ" src/app/components/grading-recording src/app/components/snapshot-grading
    -> no output, EXIT=1
  ```

  **The six lines today, pasted, each with its disposition** - because three of
  them are NOT about the rubric and must not be deleted:

  | Line | Text | Disposition |
  |---|---|---|
  | `RubricInputModal.tsx:29` | `// and NOTHING here persists it - no localStorage, no persisted-control key of` | **DELETED and replaced** (the policy) |
  | `snapshot-grading.structure.test.ts:132` | `// still keeps out of localStorage for the same sensitivity reason as before.` | **DELETED and replaced** (the policy, in the U10 comment block `:124-133`) |
  | `snapshot-grading.structure.test.ts:195` | the exact-set test NAME, `"... U10 keeps shot bytes and rubric/assignment text out of localStorage"` | **REWRITTEN**, and it may still match: it must keep the shot-bytes clause and lose the rubric clause |
  | `snapshot-row-serialization.ts:92` | `// (useAssessmentRowStore.ts) is a useState, not persisted, so the` | **LEGITIMATE, SURVIVES.** Its subject is `persistError`, not the rubric |
  | `snapshot-row.ts:136` | `* gap where persistError (a useState, not persisted) would otherwise` | **LEGITIMATE, SURVIVES.** Same subject |
  | `snapshot-shot.ts:209` | `* and persists it that way (Ruling R1-B) - strictly worse than the defect` | **LEGITIMATE, SURVIVES.** Its subject is shot bytes, which 3b does NOT start persisting |

  **PASS, re-derived from the measurement and NOT from the remembered
  sentence:** the corrected grep returns **exactly four lines** -
  `snapshot-row-serialization.ts:92`, `snapshot-row.ts:136`,
  `snapshot-shot.ts:209`, and the REWRITTEN `snapshot-grading.structure.test.ts`
  test name. **RED if `RubricInputModal.tsx:29` or the U10 comment survives; RED
  if the rewritten test name still claims rubric text is kept out of
  localStorage; RED if any of the three legitimate lines is gone**, because
  deleting a true comment about `persistError` or about shot bytes is a
  different defect wearing this gate's clothes. **A pass condition of "no line"
  would have been false: three of the six are supposed to be there.**

  **WATCHED:** run the corrected form first, see all six, then delete and
  replace. The watched failure and the gate now use the SAME command; revision
  1's two halves used different ones and disagreed with each other.

  **The narrow companion, for the claim the broad grep cannot make.** The broad
  pattern cannot distinguish "the rubric is not persisted" from "`persistError`
  is not persisted", which is why its PASS is an enumerated set rather than
  zero. The sharp claim gets its own command with its own canary:

  ```
  grep -rniE "rubric.{0,80}(not persisted|out of localStorage)|nothing here persists it" \
    src/app/components/grading-recording src/app/components/snapshot-grading
    -> src/app/components/grading-recording/RubricInputModal.tsx:29
       src/app/components/snapshot-grading/snapshot-grading.structure.test.ts:195
       EXIT=0                                      (the watched presence, today)

  grep -rniE "rubricZZZ.{0,80}(not persisted|out of localStorage)|nothing here persists itZZZ" \
    src/app/components/grading-recording src/app/components/snapshot-grading
    -> no output, EXIT=1                           (canary: BOTH alternation branches exercised)
  ```

  **PASS: no output, exit 1 - and the wave must have WATCHED the same command
  return those two lines before the deletion**, which is what proves the pattern
  fires. An absence with no watched presence is the defect class RULING 38
  exists to close.

  **One trap in that pattern, found by running it rather than by reading it, and
  it is the FOURTH instrument defect of this exact shape on this item.** The
  first draft of this command used `[^\n]{0,80}` for "any 80 characters". In an
  ERE bracket expression `\n` is not a newline - it is the two characters
  backslash and `n` - **so `[^\n]` excludes the LETTER `n`**, and the pattern
  silently missed `:195` because the intervening text contains "assignment".
  Demonstrated:

  ```
  printf 'rubric assignment out of localStorage\n' | grep -cE "rubric[^\n]{0,80}out of localStorage"  -> 0
  printf 'rubric assignment out of localStorage\n' | grep -cE "rubric.{0,80}out of localStorage"      -> 1
  ```

  `grep` is line-based, so `.` is already "any character except newline" and
  `[^\n]` buys nothing while costing a letter. **Use `.`; do not write `[^\n]`
  in a grep gate in this repo.**

  **The one way this gate can go wrong, stated with its escape.** If the
  rewritten `:195` test name places the word "rubric" within 80 characters before
  an "out of localStorage" clause - for example by naming the NEW rubric key in
  the same breath as the surviving shot-bytes limit - the narrow gate stays red
  for a legitimate reason. **The wave does NOT widen the pattern to make that
  green.** It either words the name so the two clauses are apart, or it reports
  that it could not, drops this companion, and relies on the enumerated-set form
  above. Tuning the command until it agrees with the sentence is the thing
  RULING 38 forbids.
- **W3-3** - a new key present in a panel's source and absent from its
  directory's expected set. **Watched by adding the key literal to the panel
  and running `npx vitest run src/app/components/snapshot-grading/snapshot-grading.structure.test.ts`
  BEFORE touching the expected set, and seeing the exact-set `toEqual` fail
  with a 5-element actual against a 4-element expected.** Equally RED if a key
  is added to an expected set while its A4d-shaped block cannot find the
  panel's call or `rubric-memory.ts`'s `getItem`/`setItem` pair.
- **W3-4** - `npm run lint` at a fifth warning or any error.
- **W3-5 - RES-A39A-15's OWED CHECK, which lands in THIS wave and which revision
  1 did not carry.** `docs/a39-architecture.md:2369`'s STEP column reads, of
  RES-A39A-15: "**in wave 3, as a read-only check over the two panels it
  writes**; elsewhere, at the next chunk touching that file." Revision 1's wave
  3b had W3-1 through W3-4 and none of them was that check - an owed instrument
  with a named step inside this plan's own wave, carried by no wave. That is
  what `iteration-caps.md` calls a deletion.

  **OBJECT:** for each of the two panels wave 3b writes, the index of every
  `multiline` prop against the index of that file's primary action control, and
  whether each such field carries a `maxRows` in its own tag.
  **INSTRUMENT:** the architecture's own -
  `grep -n "multiline" <file>` against `grep -n "maxRows" <file>`, plus the
  index of the file's primary action control.
  **DIRECTION OF FAILURE:** an action control whose index in source is greater
  than that of an UNCAPPED `multiline` field.

  **Measured today, and one panel is RED while the other is not applicable:**

  ```
  grep -n "multiline" src/app/components/grading-recording/GradingRecordingPanel.tsx   -> no output, EXIT=1
  grep -n "maxRows"   src/app/components/grading-recording/GradingRecordingPanel.tsx   -> no output, EXIT=1
  grep -n "multiline" src/app/components/snapshot-grading/SnapshotGradingPanel.tsx     -> 809, 844, 935
  grep -n "maxRows"   src/app/components/snapshot-grading/SnapshotGradingPanel.tsx     -> no output, EXIT=1
  grep -n "minRows"   src/app/components/snapshot-grading/SnapshotGradingPanel.tsx     -> 810, 845, 936
  grep -rn "maxRows" src --include=*.tsx | head -5        # canary: AiChatWindow.tsx:567,
                                                          # CopilotChatPanel.tsx:123,
                                                          # ModuleDeckSettings.tsx:129 - the prop
                                                          # exists in this codebase, so the two
                                                          # empty results above are facts, not a
                                                          # broken instrument
  ```

  - **`GradingRecordingPanel.tsx`: NOT APPLICABLE, and the brief must say that
    word rather than "pass".** It has ZERO `multiline` fields, so the check is
    vacuously clean for a reason unrelated to the claim. A green report here
    would be the same shape as the gate RULING 38 just fixed.
  - **`SnapshotGradingPanel.tsx`: RED TODAY, before the wave starts.** Its
    primary action control is the Grade button at `:871-873`
    (`<Button variant="contained" onClick={() => void handleGrade()}`, opened at
    `awk 'NR>=866&&NR<=880'`). Two uncapped `multiline` fields sit ABOVE it:
    `:805-814` ("Assignment instructions (optional ...)", `multiline` at `:809`,
    `minRows={2}` at `:810`, no `maxRows`) and `:841-849` ("Instructions for
    grading (optional)", `multiline` at `:844`, `minRows={2}` at `:845`, no
    `maxRows`). `871 > 844 > 809`, which is the stated direction of failure.

  **RULED: wave 3b CAPS both, and this is not scope creep - it is the same
  contradiction the architecture already removed once.** RES-A39A-15's own text
  records that revision 1 "scoped its own fix out with 'in scope only if that
  wave already writes it' while wave 2 DID write the file - that contradiction
  is removed". Wave 3b DOES write `SnapshotGradingPanel.tsx`. Leaving it as a
  report would recreate the identical contradiction one wave later. The cost is
  **+2 lines**, which is why 8.3's ceiling table re-derives that panel's post-3b
  bound to `-le 958` rather than inheriting 955.

  **`:935` is OUT OF SCOPE and named so nobody tidies it in.** It is the
  transcription field inside the region below the action control
  (`935 > 871`), so it does not satisfy the stated direction of failure.
  Capping it is neither required nor forbidden; if the wave does it anyway, that
  is +1 more line and the wave says so in its commit message.

  **WATCHED:** run the two `grep -n` commands and the action-control index
  BEFORE the caps, record `809 / 844 / 871` with no `maxRows`, apply the caps,
  re-run, and confirm every `multiline` index below `871` now has a `maxRows`
  inside the same tag. **RED if a `maxRows` is added to the file but not inside
  the tag of the field it is meant to cap** - the file-level presence of the
  string proves nothing, which is the same lesson as W2-7 clause 1.

**A replacement, not a deletion.** Each removed comment gets one naming
`docs/owner-decisions-2026-09-23.md` DECISION 3, the key, the canary that now
covers it, the A4d-shaped block, and the one surviving limit: **shot bytes and
transcribed capture still do not persist.** `SnapshotGradingPanel.tsx`'s own
live distinction at `:151-158` (`instructorInstructions` persists because it is
"not captured or transcribed material") becomes the rule for the whole file
rather than an exception inside it.

**Gate:**

```powershell
npm run test:paths -- src/app/components/grading-recording/grading-rows.test.ts src/app/components/snapshot-grading/snapshot-grading.structure.test.ts src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts src/app/components/snapshot-grading/snapshot-role-setrole-callsites.structure.test.ts src/app/components/grading-recording/rubric-input.test.ts src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts src/app/components/grading-recording/GradingRecordingPanel.assessment.test.ts src/app/components/grading-recording/GradingAssessmentDeclarationControls.test.ts src/app/components/grading-recording/grading-recording-log.test.ts src/app/components/grading-recording/markLate.wiring.test.ts src/app/components/grading-recording/submission-kind-callsites.structure.test.ts src/app/actions/grading-submission-grade.test.ts src/app/actions/syllabus-upload.rubric-reuse.test.ts src/lib/syllabus-upload-source.test.ts src/app/components/ui/buttonVariant.test.ts src/app/components/ui/modalAdoption.wiring.test.ts src/app/components/module-deck-capture/ModuleDeckCapturePanel.wiring.test.ts src/app/components/module-deck-capture/module-deck-dispatch.test.ts src/app/components/recording/AddKnowledgePages.test.ts src/app/components/recording/discussion-capture.test.ts src/app/components/recording/discussion-knowledge-context.test.ts src/app/components/recording/runLogRow.test.ts src/lib/recording-launch.test.ts src/loop-docs.structure.test.ts src/lib/grade/rubric-memory.test.ts src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
```
```powershell
npm test
npx tsc --noEmit --incremental false
npm run lint
@(Get-Content src/app/components/snapshot-grading/SnapshotGradingPanel.tsx).Count
@(Get-Content src/app/components/grading-recording/GradingRecordingPanel.tsx).Count
@(Get-Content src/app/components/grading-recording/RubricInputModal.tsx).Count
@(Get-Content src/app/components/grading-recording/grading-rows.test.ts).Count
@(Get-Content src/app/components/snapshot-grading/snapshot-grading.structure.test.ts).Count
git status --short
```

The two W3-2 greps and the W3-5 greps are run from **Bash**, because `grep` with
`-E` is not the PowerShell `Select-String` this repo forbids hand-rolling and is
not on PATH from PowerShell:

```
grep -rnE "persists it|not persisted|out of localStorage" src/app/components/grading-recording src/app/components/snapshot-grading
grep -rnE "persists itZZZ|not persistedZZZ|out of localStorageZZZ" src/app/components/grading-recording src/app/components/snapshot-grading
grep -rniE "rubric.{0,80}(not persisted|out of localStorage)|nothing here persists it" src/app/components/grading-recording src/app/components/snapshot-grading
grep -rniE "rubricZZZ.{0,80}(not persisted|out of localStorage)|nothing here persists itZZZ" src/app/components/grading-recording src/app/components/snapshot-grading
grep -n "multiline" src/app/components/snapshot-grading/SnapshotGradingPanel.tsx
grep -n "maxRows"   src/app/components/snapshot-grading/SnapshotGradingPanel.tsx
wc -l < src/app/components/snapshot-grading/SnapshotGradingPanel.tsx
wc -l < src/app/components/grading-recording/GradingRecordingPanel.tsx
wc -l < src/app/components/grading-recording/RubricInputModal.tsx
wc -l < src/app/components/grading-recording/grading-rows.test.ts
wc -l < src/app/components/snapshot-grading/snapshot-grading.structure.test.ts
```

**PASS:** every `test:paths` argument `COVERED`, exit 0; `npm test` zero failed,
exit 0; `tsc` silent; lint at `4 problems (0 errors, 4 warnings)`; the broad
W3-2 grep returns **exactly the four enumerated survivors** and its ZZZ canary
exits 1; the narrow W3-2 companion returns **nothing and exits 1**, having been
watched returning two lines first; every `multiline` index below `871` in
`SnapshotGradingPanel.tsx` carries a `maxRows` in its own tag (W3-5); and all
FIVE ceiling bounds hold on both counters - `SnapshotGradingPanel.tsx <= 958`,
`GradingRecordingPanel.tsx <= 950`, `RubricInputModal.tsx <= 420`,
`grading-rows.test.ts <= 790`, `snapshot-grading.structure.test.ts <= 940`.

### 8.4 Wave 4 - the run delivers row 1 while row 7 is still running

Three commits, in this order. The order is not cosmetic.

#### 8.4.1 Commit 4a - the frozen oracle, captured from TODAY's implementation

**Write set:** `src/lib/grade/reconcile.test.ts` (**new, test-only**,
**`-le 400`** on both counters - a frozen literal of one run's `results` plus
`rubricAreaNames` is the bulk of it, and a literal that needs more than 400
lines is a fixture the wave should narrow rather than a budget it should
raise).

Run today's `gradeStudentEntries` over a fixture whose rubric parses to NO
criteria and whose rows disagree on area names - the `engine.ts:337-344` branch
(`awk 'NR>=330&&NR<=336' src/lib/grade/engine.ts` shows the canonical-from-
richest fallback and its own comment). Transcribe its `results` and
`rubricAreaNames` as a **frozen literal**.

**WATCHED FAILURE, and this commit does not land without it:** run the
double-reconcile case (W4-2b) against the **mutating** implementation at
`engine.ts:332-393` (`:371` is `result.overallComment = ...`, `:373` is
`result.rubricAreas = reconciled`) with the canonical set GROWING between the
two calls, and **watch it go RED against the frozen literal.** A literal
authored by the wave that writes the new function is a restatement; a literal
captured from the old one, proven to catch the divergence, is an oracle.

**Gate:** `npx vitest run src/lib/grade/reconcile.test.ts` - single path, so
`npx vitest run` is legitimate. PASS: the frozen-literal case green, the
double-reconcile case demonstrated RED and then quarantined behind the
projection that 4b lands.

#### 8.4.2 Commit 4b - reconciliation becomes a projection

**Write set:** `src/lib/grade/reconcile.ts` (**new**, PURE `reconcileRun`,
imports only `./types` and `./rubric`, **`-le 250`**),
`src/lib/grade/engine.ts` (**edit, THE CALLER** - `:332-393` becomes a call;
**must SHRINK**), `src/lib/grade.ts` (**edit**, barrel export), plus the owned
readers.

**The owned readers, derived rather than recalled** - revision 1 carried one of
`src/lib/grade.ts`'s three real readers and characterised the other two wrongly
(3.3). Both instruments, with canaries:

```
grep -rl "grade/engine.ts" src --include="*.test.ts" | sort
  -> src/app/components/grading-results/ungradedDisclosure.test.ts
     src/lib/code-runner.test.ts
     src/lib/grade/grouping-zip-parents.wiring.test.ts
grep -rn 'join(SRC, "lib", "grade.ts")' src --include="*.test.ts"
  -> src/app/components/grading-results/gradingResultsHelpersWiring.test.ts:154
     src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts:367
     src/lib/module-graph/runtime-import-graph.test.ts:572
grep -rn 'join(SRC, "lib", "gradeZZZ.ts")' src --include="*.test.ts"   # canary, exit 1
grep -rl "grade/engineZZZ.ts" src --include="*.test.ts"                # canary, exit 1
```

| Path | Role |
|---|---|
| `src/lib/grade/engine.test.ts`, `src/lib/grade/engine.ungraded.test.ts` | **owned.** Import-based readers of `engine.ts` in the same directory - not found by the source-text instrument, which is why the second instrument exists |
| `src/app/components/grading-results/ungradedDisclosure.test.ts`, `src/lib/code-runner.test.ts`, `src/lib/grade/grouping-zip-parents.wiring.test.ts` | **owned.** Source-text readers of `grade/engine.ts` |
| `src/lib/module-graph/runtime-import-graph.test.ts` | **owned.** `:572` walks the barrel; it also sees the new `./reconcile` edge |
| **`src/app/components/grading-results/gradingResultsHelpersWiring.test.ts`** | **owned. ADDED THIS REVISION.** `:153-159` is "R-5: a PLANTED POSITIVE proves this walk actually discriminates (the barrel this row exists to ban)", asserting `violations.length > 0`, `unallowed.length > 0` and a trail containing `lib/supabase/server`. **Direction of failure: RED if wave 4b's re-export somehow REMOVED the barrel's supabase reach**, which would silently disarm this canary in two other files |
| **`src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts`** | **owned. ADDED THIS REVISION.** `:366-378`, the same three assertions as R-5a/R-5b/R-5c |
| `src/lib/grade/grade-result-doors.wiring.test.ts` | **owned, read-only. ADDED THIS REVISION.** `:127` names "grade.ts's own barrel" in a COMMENT. It is in the gate as a floor, not because a defect is expected |

**Why the conclusion still holds.** `reconcileRun` is PURE and imports only
`./types` and `./rubric`, so a re-export of it cannot remove the barrel's reach
into `lib/supabase/server` and all three planted positives stay green. **The
finding was never that they would break - it was that two of the three files
were in no wave at all, and with no full-suite gate nothing else would have
noticed.** 5.1 closes the general case; this table closes this one.

**The invariant:** `gradeStudentEntries` returns byte-identical results before
and after. It is reached by `gradeSubmissions` (`:403`), `gradeEntries`
(`:457`) and `gradeCanvasUrl` (`:473`), and through them by
`steps.grading-run.ts`, `steps.grading-draft-flow.ts` and
`steps.grading-cartridge.ts`.

**W4-1 is a FLOOR, not the oracle, and the brief says so.** Measured:

```
grep -c "rubricAreas\|canonical\|rubricAreaNames" src/lib/grade/engine.test.ts             -> 0
grep -c "gradeSubmissions\|gradeEntries\|gradeCanvasUrl\|gradeStudentEntries" src/lib/grade/engine.test.ts -> 16   (canary: the instrument fires on this file)
grep -c "rubricAreas\|canonical\|rubricAreaNames" src/lib/grade/engine.ungraded.test.ts    -> 20
```

Those two files **cannot** detect a change to stray-folding, renaming or area
ORDER. That is W4-2's job, over the 4a oracle.

**Gate:**
```powershell
npm run test:paths -- src/lib/grade/reconcile.test.ts src/lib/grade/engine.test.ts src/lib/grade/engine.ungraded.test.ts src/app/components/grading-results/ungradedDisclosure.test.ts src/lib/code-runner.test.ts src/lib/grade/grouping-zip-parents.wiring.test.ts src/lib/module-graph/runtime-import-graph.test.ts src/app/components/grading-results/gradingResultsHelpersWiring.test.ts src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts src/lib/grade/grade-result-doors.wiring.test.ts src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
npm test
npx tsc --noEmit --incremental false
@(Get-Content src/lib/grade/engine.ts).Count
@(Get-Content src/lib/grade/reconcile.ts).Count
@(Get-Content src/lib/grade/reconcile.test.ts).Count
git status --short
```
```
wc -l < src/lib/grade/engine.ts
```
PASS: all thirteen `COVERED`, exit 0; `npm test` zero failed, exit 0; `tsc`
silent; `engine.ts` count **must not rise** above 504 and should land near 459,
on both counters; `reconcile.ts <= 250` and `reconcile.test.ts <= 400`.

#### 8.4.3 Commit 4c - the transport, the pool and the seam

**ONE commit. Five ordered steps. Step S1 is the security instrument and it has
its own watched failure.**

**Write set:**

| Path | Role |
|---|---|
| `src/app/api/grade-run-item/route.ts` | **new.** The per-item Route Handler |
| `src/app/api/grade-run-item/route.test.ts` | **new.** W4-10, W4-13 |
| `src/app/actions/grading-incremental.ts` | **new.** `prepareGradingRunAction`, a `"use server"` module |
| `src/app/actions/grading-incremental.test.ts` | **new.** W4-4 |
| `src/app/actions.ts` | **edit.** `export * from "./actions/grading-incremental"` |
| `src/app/actions/action-guard-coverage.test.ts` | **owned.** It binds `prepareGradingRunAction`; **it CANNOT see the route handler** - see below |
| `src/app/components/grading/incrementalRunPlan.ts` | **new.** PURE plan leaf |
| `src/app/components/grading/incrementalRunPlan.test.ts` | **new.** W4-3, W4-5, W4-11, W4-12 |
| `src/app/components/grading/useIncrementalGradingRun.ts` | **new.** The pool, PORTED from `useRepoGradesBulkGrade.ts` |
| `src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts` | **new.** W4-9 |
| `src/app/components/GradingTab.tsx` | **edit. THE CALLER** |
| `src/app/components/autoGradeTransition.wiring.test.ts` | **owned, EXPECTED TO CHANGE.** A5 becomes strictly stronger, in this commit |
| `src/lib/use-server-exports.test.ts` | **owned, read-only.** `"use server"` files export only async functions |
| `src/lib/module-graph/runtime-import-graph.test.ts`, `src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts` | **owned.** Name `app/actions.ts`; the first sees a new barrel edge |
| `src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts`, `.../gradingResultsHelpersEditState.test.ts` | **owned.** Read `GradingTab.tsx` as source text |
| `src/file-size-ceiling.structure.test.ts`, `src/lib/no-emojis.test.ts`, `src/source-bytes.structure.test.ts` | **owned, read-only** |

---

**STEP S1 - THE ROUTE HANDLER'S GUARD. Its own step, its own watched failure.**

**DECISION 6 says "the action-guard coverage test that pins the guarded surface
list is in the write set". Measured, THAT TEST CANNOT SEE A ROUTE HANDLER:**

```
awk 'NR>=118&&NR<=130' src/app/actions/action-guard-coverage.test.ts
```

```
function collectActionExports(): ActionExport[] {
  const found: ActionExport[] = [];
  for (const filePath of collectCandidateFiles(APP_DIR)) {
    const text = fs.readFileSync(filePath, "utf8");
    if (!isUseServerModule(text)) continue;
```

`:123` skips every file for which `isUseServerModule(text)` is false. A Route
Handler is not a `"use server"` module, **so the ratchet is green whether or not
the new handler has a guard.** The security a Server Action got for free must be
BUILT and ENFORCED by a new instrument. That instrument is this step.

Also measured, and it is why the guard is `requireUser` and not `requireOwner`:
`awk 'NR>=60&&NR<=70' src/app/actions/action-guard-coverage.test.ts` records
that `requireOwner()` is "a bare `return requireUser()` alias ... that admits
ANY active account". A comment claiming an owner check would be false.

**S1 lands BEFORE the handler body, as a test against the route's source text.**
`src/app/api/grade-run-item/route.test.ts` asserts three
**presence-then-comparison pairs**. Revision 1 called all three that and only
the first one was; two were bare substring presences, and a bare substring is
satisfied by the COMMENT that explains the check. All three are rewritten so that
each has a real comparison:

1. **AUTH ORDER.** `idxGuard = src.indexOf("requireUser(")` is `>= 0`, AND
   `idxGrade = src.indexOf("gradeEntries(")` is `>= 0`, AND
   `idxGuard < idxGrade`.
2. **CSRF FLOOR, BEFORE THE BODY IS PARSED.**
   `idxCt = src.indexOf('req.headers.get("content-type")')` is `>= 0`, AND
   `idxJson = src.indexOf("req.json(")` is `>= 0`, AND `idxCt < idxJson`, AND
   `idxCt < idxGrade`. **The anchor is the CALL EXPRESSION, not the bare string
   `content-type`**, so a comment that merely mentions the header does not
   satisfy it. The precedent is uniform: `parse-calendar/route.ts:14`,
   `prose/route.ts:20` and `research/route.ts:30` are each byte-identical -
   `const contentType = req.headers.get("content-type") ?? "";` - and
   `class-trends-insight/route.ts` orders it the same way, with
   `await requireUser();` at `:97` and `body = (await req.json())` at `:104`.
3. **THE SOFT BUDGET IS UNDER THE HARD CAP.**
   `src.match(/export const maxDuration = (\d+)/)` is non-null, AND
   `src.match(/TOTAL_BUDGET_MS = ([\d_]+)/)` is non-null, AND the second value
   (underscores stripped, parsed) is **strictly less** than the first times
   1000. This is the clause that matters: `maxDuration = 60` alone declares
   where the platform kills the function, and `class-trends-insight/route.ts:36-51`
   is explicit that the kill "cannot be intercepted from in here, so it produces
   no response at all, not a worded error". A presence check on `maxDuration`
   proves nothing about whether the handler stops itself first.

**THE NEGATIVE CONTROL: THREE FIXTURES, ONE PER CHECK.** Revision 1 used a
single fixture with the guard removed. Measured against the three checks above,
that fixture fails check 1 and **PASSES checks 2 and 3 unchanged** - so two of
the three assertions would ship with no proof they can fail, which is the exact
"a check whose assertion cannot fail" class RULING 28 names and which this step
cites RULING 28 to prevent. And because `action-guard-coverage.test.ts:123`
skips every non-`"use server"` file, this canary is the ONLY thing standing
behind the handler's guard - so a narrow control here is not a small defect.

| Fixture | The one mutation | Must FAIL | Must still PASS |
|---|---|---|---|
| **F1** | `await requireUser();` deleted from the body | check 1 | checks 2 and 3 |
| **F2** | the `req.headers.get("content-type")` read deleted | check 2 | checks 1 and 3 |
| **F3** | `TOTAL_BUDGET_MS` set to `60_000` - equal to `maxDuration * 1000`, not below it | check 3 | checks 1 and 2 |

**The "must still PASS" column is the half that makes these controls and not
noise.** A fixture that fails everything proves only that the test file runs. A
fixture that fails EXACTLY ONE check proves that check is the thing discriminating.

**A fourth fixture, F1b, for the ordering half of check 1**, because deleting
the guard tests presence and not order: `await requireUser();` MOVED to after the
first `gradeEntries(` call. It must fail check 1 and pass 2 and 3. Without it,
check 1's comparison clause is unproven and a handler that authenticates after
it has already spent a model call goes green.

**THE WATCHED FAILURE.** Run S1's test before the handler exists: all four real
checks are RED (the file is absent), and all four fixture assertions are GREEN
(they fire against strings, not against the tree). Only then write the handler.

**Do NOT comment-strip the route source for these assertions.** `docs/backlog.yml`
A42 (`f18994e`) records that this repo's 64 independently duplicated comment
strippers eat source from a MIME wildcard - a literal such as `image/*` opens a
block comment that runs to the next unrelated `*/`, and an assertion anchored
past that point silently matches a different element. A route that validates
content types is precisely a file likely to hold a MIME literal. The call-expression
anchors above make stripping unnecessary: a comment would have to contain
`req.headers.get("content-type")` verbatim to false-positive, and F2 is the
control that would catch it if one did.

The handler's guard lines, each with its in-repo precedent, all opened:

- **AUTH.** `await requireUser()` is the FIRST statement of the body, before
  the body is read, returning `401` on throw -
  `class-trends-insight/route.ts:96-100` verbatim
  (`awk 'NR>=94&&NR<=104'`: `try { await requireUser(); } catch (err) { return
  NextResponse.json({...}, { status: 401 }); }`).
- **CSRF FLOOR.** Reject any request whose `content-type` is not
  `application/json`, with `400`. Not decoration: a cross-origin HTML form
  cannot produce that header, and a cross-origin `fetch` that sets it triggers
  a preflight this app answers with no CORS headers. Three routes already read
  the header this way, each verified by `awk` at the cited line:
  `parse-calendar/route.ts:14`, `prose/route.ts:20`, `research/route.ts:30` -
  all three are `const contentType = req.headers.get("content-type") ?? "";`.
- **INPUT VALIDATION.** `pinned` and `ticket` arrive from the client and are
  spent on model calls, so they are validated as untrusted input, not
  destructured: `rubric` non-empty and length-bounded, `criteriaNames` an array
  of strings, `provider` through `normalizeProvider` (already imported by
  `class-trends-insight/route.ts:4`), `ticket.kind` one of the two members,
  the whole body `400` otherwise. A malformed body must never reach
  `gradeEntries`.

**The wider gap is NOT fixed here.** `find src/app/api -name "route.ts" | wc -l`
-> **20**, of which 12 call no guard. A repo-wide route ratchet with a 12-entry
allowlist is a real instrument and a scoping question, not a wave-4 line:
**RES-A39A-17**, carried in section 12.

---

**STEP S2 - the handler body, at `maxDuration = 60`, with the soft budget.**

Modelled on `src/app/api/class-trends-insight/route.ts`, which was opened for
this plan:

```
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
```

`maxDuration = 60` is at `class-trends-insight/route.ts:33` and at
`course-intel/ask/route.ts:134`. 60 is Hobby's hard cap and also the highest
value that still builds there (`ask/route.ts:59`).

**The soft budget under the hard one.** `class-trends-insight/route.ts:36-51`,
opened: the platform kill "cannot be intercepted from in here, so it produces
no response at all, not a worded error. The only way this handler can hand back
a readable message instead of silence is to stop itself, on its own clock,
before the platform's clock runs out." Its constants: `TOTAL_BUDGET_MS = 50_000`
at `:47`, `MODEL_WAIT_MIN_MS = 8_000` at `:48`, `MODEL_WAIT_MAX_MS = 24_000` at
`:49`, `MODEL_WAIT_RESERVE_MS = 2_000` at `:51`.

**Two precedents exist and they disagree by 4 seconds.** `ask/route.ts:145` is
`TOTAL_BUDGET_MS = 54_000`. **RULED: follow `class-trends-insight/route.ts`, the
file the architecture named as the line-for-line model - `TOTAL_BUDGET_MS =
50_000` with a 2-second reserve.** Both numbers are named here so an
implementer does not invent a third.

The handler contains **no `generateRubric` call and no `fetchCanvasMeta` call** -
the constructed prevention of the `grading.ts:634-636` defect (note the line
numbers, corrected per 2.1). Pass condition W4-4.

---

**STEP S2b - THE WALL-CLOCK DEADLINE (`docs/g4-scope.md` Wave A). W4-13.**

Without it, `maxDuration = 60` makes the kill point known, not graceful.

**RULED: `raceWithTimeout` (`src/lib/bounded-race.ts:31-75`), not
`withDeadline`.** The model file `class-trends-insight/route.ts:5` imports
`withDeadline` from `@/lib/course-intel/fetch`, so this is a deliberate
divergence from the model and the wave records the reason in a comment beside
the call, or a later pass will "align" it back. The three reasons, measured:

1. **`withDeadline` cannot be proven to fire here.**
   `awk 'NR>=316&&NR<=325' src/lib/course-intel/fetch.ts` shows
   `const signal = AbortSignal.timeout(ms);`. `bounded-race.ts:20-24`, opened:
   "`vi.useFakeTimers()` patches `setTimeout` but does not patch
   `AbortSignal.timeout`, so a bound built on the latter cannot be driven
   synchronously in this repo's tests and would need real wall-clock waits to
   exercise." A gate that needs a real 50-second wait is not a gate.
2. **It does not throw.** It returns a tagged
   `{ kind: "settled" | "timedout" | "failed" }`, which fits the `{ error }`
   JSON body the handler owes the pool better than an exception a pool loop
   must catch per item.
3. **It costs nothing at any other call site.** This is a caller-side wrapper
   at ONE new call site, not a `callLlm` signature change. **A `callLlm`
   signature change would touch 125 call sites across 62 files and is
   explicitly NOT this work; if any brief below implies one, that is a defect.**

**CORRECTION to `docs/g4-scope.md:321-328`, measured in 0.2:
`raceWithTimeout` does NOT have zero production callers.** It has three, all in
`.tsx` files the document's `--include=*.ts` grep excluded. So wave 4c is not
its first production caller, and it ports two shipped templates rather than
inventing them:

- the call-site shape at `WalkthroughAnnouncementPanel.tsx:303` and `:358`;
- the source-text instrument at
  `walkthrough-announcement.structure.test.ts:327-352`, four assertions:
  imports the leaf; the call is passed INTO the wrapper, not awaited directly;
  the named function's body contains the wrapped call; the bound is the shared
  constant at every call site, with the occurrence count pinned.

A second, older template for the same idea is
`src/lib/course-intel/fetch.test.ts:627-638` - `matchAll(/callLlm\s*\(/g)`,
assert `callSites.length > 0`, then for each site assert the preceding 200
characters contain `withDeadline(`. **Note its first line: `expect(callSites.
length).toBeGreaterThan(0)` is the presence assertion that stops the loop
passing vacuously over zero sites.** Wave 4c's version must keep it.

**DOES THIS WAVE ABORT THE UNDERLYING FETCH? NO, and it says so.**
`bounded-race.ts:26-29`, opened and verbatim: "Losing the race does not cancel
`work`. `Promise.race` has no way to stop the loser from running - it can only
stop the caller from waiting on it. `work` keeps executing." So **wave 4c bounds
the caller's wait and does not abort the work**, therefore it produces no
`AbortError`, therefore it does **not** walk into the latent trap at
`llm.ts:457-463` and `:617-623` (both opened, both byte-identical, both treating
any throw as transient and retrying). That trap stays dead, and
`docs/g4-scope.md` Wave B stays out of A39's scope. **Stating this is the
requirement; the answer is "does not abort", with the evidence above.**

**W4-13's WATCHED FAILURES - both halves, and the second is the one that
matters:**

| Half | Watched |
|---|---|
| The deadline fires | `vi.useFakeTimers()`, a stubbed `callLlm`/`gradeEntries` that **never resolves**, advance the fake clock past `TOTAL_BUDGET_MS`, assert the wrapped call settles to `{ kind: "timedout" }` **synchronously, with zero real elapsed time**. Watched by running it against an UNWRAPPED call first and seeing the test hang / time out rather than settle |
| **A call finishing UNDER the deadline is not cut short** | Same fake clock, a stub that resolves at `TOTAL_BUDGET_MS - 1`, assert `{ kind: "settled" }` and that the returned value is the stub's. **Watched by setting the bound to 0 and seeing a call that would have succeeded reported as timed out.** This is the same defect class as an over-eager size guard, which this repo shipped a fix for on 2026-09-23 (`a9d9771`'s own commit message: "a size guard that refuses work which would have succeeded is a denial of service on your own users, and nothing else would have caught it") |
| The wiring, not just the import | The source-text assertion: every `gradeEntries(` / `callLlm(` occurrence in the route's source sits inside a `raceWithTimeout(` argument, with the presence assertion first. Watched against a fixture where the wrapper is imported but the call is awaited directly |

On `{ kind: "timedout" }` or `{ kind: "failed" }` the handler returns a normal
JSON error response with a worded body, never a thrown or unhandled error, so
the pool's own `fetch` gets something to parse.

---

**STEP S3 - the pure plan leaf, and the body-size cap.**

`src/app/components/grading/incrementalRunPlan.ts` holds
`buildRunItemRequests`, `mergeArrivedResults`, `routeGradingRun`,
`classifyItemFailure`, `INCREMENTAL_CONCURRENCY = 3` (matching
`BULK_GRADE_CONCURRENCY`, `repoGradesBulkGrade.ts:143`) and
`ITEM_REQUEST_BYTE_BUDGET`.

**THE BODY-SIZE CAP - the gate, with both branches, because 0.1 disproved the
architecture's premise for it.**

`serverActions.bodySizeLimit` governs Server Actions only
(`next.config.ts:13-14`), so moving the per-item call to a Route Handler takes
it off that key. The architecture concluded the replacement cap is undeclared.
**Measured, it is declared** (0.1): `upload-budget.ts:5-7` states the ~4.5MB
platform cap and that it "applies to Route Handlers exactly as it does to
Server Actions"; `:41` is `UPLOAD_WIRE_BUDGET_BYTES = 3.5 * 1024 * 1024`; 103
reference lines across the repo; its own test file.

**THE GATE ON THIS STEP, which the implementer rules with the tree open:**

- **(A) RECOMMENDED - `ITEM_REQUEST_BYTE_BUDGET` is DERIVED FROM
  `UPLOAD_WIRE_BUDGET_BYTES`**, and the per-item check measures WIRE bytes via
  `checkWireBudget` / `sumBase64WireBytes` rather than FILE bytes. Reason: the
  architecture's stated ground for a bespoke constant was that the handler's cap
  is undeclared, and that ground is gone; and a9d9771's own commit message rules
  the point - "two thresholds that disagree is a bug nobody sees until a real
  upload lands between them". `upload-budget.ts:28-33` says the same: one owner,
  no drift, and the module is dependency-free so a client leaf may import it.
- **(B) a separate constant**, which requires the wave to state in the comment
  beside it why two thresholds in this repo may disagree, and to name what
  catches it when they drift.

**Under EITHER answer the wave ships and W4-12 is the same instrument.** This is
a gate on one step, not a block on the plan.

**W4-12 - the cap is asserted, not merely declared.** Object: `routeGradingRun`
and `prepareGradingRunAction`'s mode decision. Instrument:
`npx vitest run src/app/components/grading/incrementalRunPlan.test.ts` plus
`npx vitest run src/app/actions/grading-incremental.test.ts`. Three clauses:

1. `routeGradingRun` returns `"whole-run"` for a picked file whose WIRE size
   exceeds the budget, and `"incremental"` for one below it;
2. `prepareGradingRunAction` returns `{ mode: "whole-run", reason }` when ANY
   single extracted entry exceeds the budget - **and its CONSUMER is asserted in
   the same wave, not merely its producer.** The lifecycle test stubs
   `prepareGradingRunAction` to return `{ mode: "whole-run", reason }` and
   asserts the injected `submitWholeRun` stub is called exactly once and the
   pool is never started (zero item `fetch`es). **Without this half, clause 2
   asserts a return value nothing reads**, which is the shape S5 and RULING 40
   exist to close. WATCHED: against a `startReview` that ignores the returned
   mode, the pool starts and `submitWholeRun` is never called;
3. the budget constant is compared against `UPLOAD_WIRE_BUDGET_BYTES` (branch A)
   or asserted to be strictly below `VERCEL_BODY_LIMIT_BYTES` (branch B), by
   IMPORTING the constant, never by a copied number.

**WATCHED FAILURE:** write clause 2 first, against a `prepareGradingRunAction`
that always returns `mode: "incremental"`, and watch the over-budget fixture come
back as incremental. **The direction of failure this exists to make impossible,
stated rather than discovered later: a run in which every image-bearing
submission fails transport and every text submission succeeds, with each failure
isolated by the pool's `.catch` into an ordinary failed row so the run reports
complete.**

**The corrected reason for `mode: "whole-run"`, which the wave records in
source.** Not "the Server Action path still has 10 MB" - it does not, and since
`a9d9771` it refuses over-budget zips at `grading.ts:831`. The reason that
holds: **the whole-run path never re-uploads an extracted entry; it grades
server-side from the archive already in the request.** A 3MB zip can hold a 30MB
text entry, so the per-item budget is real and reachable, and the whole-run path
is the correct sink for an entry that exceeds it.

---

**STEP S4 - the pool, and the press-twice instrument.**

`useIncrementalGradingRun.ts` is PORTED from
`src/app/components/repo-grades/useRepoGradesBulkGrade.ts`: a `useRef` run lock
(`:216`, claimed `:228-229`, released in `finally` `:234-247`), a shared cursor
with `INCREMENTAL_CONCURRENCY` workers (`runWorker` `:466-478`), per-item
`.catch` mapping a transport rejection to the same `{ error }` shape (`:291`).
It ADDS cancellation, which that hook lacks.

**W4-9 - THE PRESS-TWICE INSTRUMENT. This is a PORT of a proven technique, not
a new one.** `src/app/components/repo-grades/useRepoGradesBulkGrade.lifecycle.test.ts`
(706 lines, both counters) is a **shipped no-render harness that drives a React
hook**, and it already tests exactly this case. Opened and verified:

- `:26` imports vitest; `vi.hoisted` slot-based `useState`/`useRef` stubs at
  **`:28-56`**; `vi.mock("react", () => ({ useState: h0.useState, useRef:
  h0.useRef, ...` at **`:58-60`**.
- Its header at `:10-22` states the technique: "Nothing renders in this repo's
  vitest ... so the harness below stands in for React: one call of
  useRepoGradesGradingActions is one 'render' ... useRef returns the SAME object
  on every call, which is what makes a ref-based lock (unlike a state-based one)
  visible to an ALREADY-RETURNED closure without waiting for a new render".
- `:329` is the shipped double-click test verbatim: **"A26b: a second click from
  the SAME render, same task, must still be refused, and the render taken with
  no tick after click 1 already shows the run disabled"**, with `:312-314`
  recording the counter semantics ("resolvesStarted: 1, R-5: 0 for a refused
  click").

**Copy that file, never import from it** - `no-cross-test-file-imports`:
importing a helper from another `*.test.ts` re-runs its `describe` blocks.

**THE SEAM MOVES SO THE INSTRUMENT CAN REACH ITS OBJECT (RULING 39). This is
the choice, stated: the handler moves behind a `.ts` seam.**

Revision 1 put the object - `handleStartReview` and a counted `formAction` -
inside `GradingTab.tsx`, **and nothing in this repo renders a `.tsx`.** A test in
`useIncrementalGradingRun.lifecycle.test.ts` could neither invoke
`handleStartReview` nor observe a `formAction` call, so the only satisfiable
reading was to count pool dispatches inside the hook - leaving the double spend
that deleting `action={formAction}` exists to close measured by nothing, with the
gate green. The shipped precedent works for the opposite reason: `handleGradeColumn`
is RETURNED BY A `.ts` HOOK (`useRepoGradesBulkGrade.lifecycle.test.ts:70` imports
`useRepoGradesGradingActions` from `./useRepoGradesGradingActions`, and
`ls src/app/components/repo-grades/ | grep -i gradingactions` -> `useRepoGradesGradingActions.ts`),
which is what lets `:329`'s "A26b: a second click from the SAME render" exist.

**So `useIncrementalGradingRun.ts` RETURNS `startReview`, and `GradingTab.tsx`'s
`onSubmit` becomes a three-line wrapper that owns no decision.** The hook's
contract:

```
useIncrementalGradingRun({ selectedProvider, submitWholeRun })
  -> { startReview(fd), cancel(), incrementalRunning, ... }
```

`startReview(fd)`, in order, and every branch inside the `.ts` file:

1. claims `startLockRef` (a `useRef(false)`) **before doing anything else**; if
   already claimed, it returns immediately;
2. calls `routeGradingRun(fd, selectedProvider, pickedFileSize)` - PURE and
   SYNCHRONOUS;
3. on `"whole-run"` it calls the INJECTED `submitWholeRun(fd)`, releases, returns;
4. on `"incremental"` it awaits `prepareGradingRunAction(fd)`;
5. **if that returns `{ mode: "whole-run", reason }` it calls the SAME injected
   `submitWholeRun(fd)`, releases, returns** - this is RULING 40's named consumer;
6. otherwise it starts the pool over the returned tickets.

`GradingTab.tsx` supplies `submitWholeRun` and nothing else:

```
const submitWholeRun = (fd: FormData) => { startTransition(() => { formAction(fd); }); };
```

**This is what makes W4-9 constructible**, because in the lifecycle harness
`submitWholeRun` and `prepareGradingRunAction` are both stubs the test owns, and
`startReview` is a returned function the test calls twice from one render.

**OBJECT:** the TOTAL number of dispatches - `prepareGradingRunAction` stub calls
PLUS item `fetch` calls PLUS `submitWholeRun` stub calls - after `startReview` is
invoked TWICE from the SAME render with no tick between.
**INSTRUMENT:**
`npx vitest run src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts`.
**DIRECTION OF FAILURE: RED if the total is anything other than 1.**
**Not an assertion that a flag is set.**
**WATCHED:** delete the `startLockRef` check, run, **watch the total become 2**,
restore **from a `cp` backup, never with `git checkout --`**, which on an
uncommitted file reverts to the index and destroys the chunk's work. Only one
agent may sabotage-verify on the tree at a time
(`docs/loop/parallel-disjointness.md` section 5), which section 9.3 schedules.

**W4-9b - the `.tsx` half, which the hook cannot observe and which is therefore
a SOURCE-TEXT condition, not a claim borrowed from W4-9.** OBJECT: the source of
`GradingTab.tsx`. INSTRUMENT: `autoGradeTransition.wiring.test.ts` (already in
this wave's set). As a presence-then-comparison set: `<form` is present; the
opening `<form ...>` tag span contains `onSubmit={`; that same span contains **no
`action=`**; and `preventDefault()` is present in the file. Measured today,
`GradingTab.tsx:228` is `<form className={styles.form} action={formAction}>`
(`grep -n "formAction\|<form" src/app/components/GradingTab.tsx` -> `:29` the
prop type, `:52` the destructure, `:148` the one call, `:228` the form).
**WATCHED:** write W4-9b first and run it against today's unchanged file; it must
go RED on the `action=` clause and GREEN on the `<form` presence clause, which
proves the tag span is being found rather than the whole assertion failing for
want of an anchor.

**W4-9c - the react budget, because the shipped harness is not a general one.**
`useRepoGradesBulkGrade.lifecycle.test.ts:58-60` is
`vi.mock("react", () => ({ useState: h0.useState, useRef: h0.useRef, default: { useState: h0.useState, useRef: h0.useRef } }))` -
it supplies **exactly two hooks**. `useRepoGradesBulkGrade.ts:51` is
`import { useRef, useState } from "react";` and `:45` says "NO useEffect here",
which is why that hook can be driven at all. **`useIncrementalGradingRun.ts` adds
cancellation and must stay inside the same two-hook budget.** OBJECT: that file's
`from "react"` import list. INSTRUMENT: a source-text clause in the lifecycle test
itself. DIRECTION OF FAILURE: RED if the import names anything other than
`useRef` and `useState` - because a `useCallback`, `useEffect` or `useMemo` makes
the harness THROW rather than fail, and a thrown harness is not a red gate, it is
an unread one. The `cancelledRef` is a `useRef` and costs nothing against this
budget.

**WHAT REMAINS UNMEASURABLE HERE, and it is routed to the owner rather than
covered by a green gate.** W4-9 measures two invocations of a `.ts` function;
W4-9b measures that the form no longer carries a second dispatch path in source.
**Neither is two real presses of a real button in a real browser.** Nothing here
renders, so that claim has no in-repo instrument and this plan does not pretend
one. It is **RES-W-14**, with an owner, an instrument and a step.

**Cancellation.** A `cancelledRef` checked by `runWorker` at the top of each
iteration, **before it claims the next index**. It stops further spend (each
un-started item is one model call not made), so it is added without a
confirmation; it keeps every row already graded, with at most
`INCREMENTAL_CONCURRENCY - 1` items in flight when it is pressed; the
end-of-run line is `"Stopped. N of M submissions were graded; the rest were not
started."`, run-level, **not editable and not persisted**, and true on every
reachable state by that mechanism; and it never leaves the lock held, released
in the same `finally` `useRepoGradesBulkGrade.ts:234-247` uses.

**A pending submission produces NO ROW AT ALL** (RULING 30). W4-6's source-text
clause proves it rather than watching for it - **but revision 1's command could
not match, and corrected it was RED on today's tree against a writer set that was
remembered rather than measured.** Both defects are fixed here, and the single
clause is SPLIT into two, because it was asking two different questions through
one pattern.

**First, what revision 1 printed, and what it does:**

```
# revision 1's form, verbatim, at :1440 and again in the 4c gate at :1524
grep -rn "runDeadlineMs|\"run-deadline\"" src --include=*.ts --include=*.tsx | grep -v "\.test\."
  -> no output, PIPELINE_EXIT=1
```

No `-E`, no BRE `\|`, so grep searched for a literal pipe character. **The gate
could not fail.**

**Corrected with `-E`, it is red before an implementer writes a line:**

```
grep -rnE "runDeadlineMs|\"run-deadline\"" src --include=*.ts --include=*.tsx | grep -v "\.test\."
  -> 29 lines across 11 files, PIPELINE_EXIT=0
grep -rlE "runDeadlineMs|\"run-deadline\"" src --include=*.ts --include=*.tsx | grep -v "\.test\." | wc -l
  -> 11
grep -rnE "runDeadlineMsZZZ|\"run-deadlineZZZ\"" src --include=*.ts --include=*.tsx | grep -v "\.test\."
  -> no output, PIPELINE_EXIT=1                    # pattern-validity canary
```

The 11 files: `app/actions/grading.ts` (4 lines),
`app/api/cron/run-schedules/route.ts` (6), `grading-results/ungradedDisclosure.ts`
(4), `lib/grade/engine.ts` (2), `lib/grade/types.ts` (3),
`lib/orphan-upload-sweep.ts` (1), `lib/release-runner.ts` (3),
`lib/workflow-trigger-runner.ts` (2), `steps.grading-cartridge.ts` (1),
`steps.grading-draft-flow.ts` (1), `steps.grading-run.ts` (2).

**The stated PASS - "only the five known writers" - is false against that, and
the sentence is what changes, not the command.** Six of those files are nothing
to do with A31's writer question: `ungradedDisclosure.ts` and `types.ts` are the
mechanism's READERS and its copy table; `orphan-upload-sweep.ts`,
`release-runner.ts` and `run-schedules/route.ts` are a DIFFERENT deadline whose
comments merely mention `runDeadlineMs`; `workflow-trigger-runner.ts` computes
its own. **One pattern was being asked two questions.** Split:

**W4-6a - the ROW WRITER.** This is RULING 30's actual claim: no site constructs
an ungraded row stamped `run-deadline`. Measured:

```
grep -rnE 'stoppedBy: *"run-deadline"' src --include=*.ts --include=*.tsx | grep -v "\.test\."
  -> src/lib/grade/engine.ts:304        (exactly ONE line, PIPELINE_EXIT=0)

# canary, same call: the pattern IS an alternation and IS being parsed
grep -rnE 'stoppedBy: *"run-deadlineZZZ"|stoppedBy: *"submission-count-bound"' src --include=*.ts --include=*.tsx | grep -v "\.test\."
  -> src/lib/grade/engine.ts:317
     src/lib/grade/types.ts:142         (PIPELINE_EXIT=0 - the instrument fires)
```

**PASS: exactly one line, `src/lib/grade/engine.ts:304`. RED on a second.**

**W4-6b - the DEADLINE INPUT**, which is the fifth-writer watch `docs/backlog.yml`
A31 owns. Measured:

```
grep -rnE '"runDeadlineMs"' src --include=*.ts --include=*.tsx | grep -v "\.test\."
  -> src/app/actions/grading.ts:728                                  (the READ)
     src/lib/workflows/registry/steps.grading-cartridge.ts:105       (a write)
     src/lib/workflows/registry/steps.grading-draft-flow.ts:266      (a write)
     src/lib/workflows/registry/steps.grading-run.ts:479             (a write)
     src/lib/workflows/registry/steps.grading-run.ts:547             (a write)
     PIPELINE_EXIT=0
grep -rnE '"runDeadlineMsZZZ"' src --include=*.ts --include=*.tsx | grep -v "\.test\."
  -> no output, PIPELINE_EXIT=1                                      # canary
```

**PASS: exactly those five lines - one read in `grading.ts` and four writes
across three workflow step files. RED on a sixth.** Revision 1's "five known
writers" was nearly this set, but it named the engine's two sites as members of
it, which conflated the row writer (W4-6a) with the form field (W4-6b). They are
different objects in different files and they now have different commands.

**The broad 29-line form is retained as an INFORMATIONAL baseline only**, run
before and after, with its count and file list pasted above. It is not a PASS
condition: it is too broad to state one honestly, and a count that moves because
a sibling edited a comment about a different deadline is not a signal. **Both
narrow greps range over the whole of `src/`** and that crossing is named in both
briefs - section 9.3.

**Wave 4c adds NEITHER.** Its cancellation path produces no row for an
un-started item (RULING 30) and it does not touch the `runDeadlineMs` form
field. Both greps must return the pasted sets unchanged at the wave's gate, and
**the wave must have run both BEFORE it starts**, so that a difference at the
gate is attributable to the wave rather than to the tree.

---

**STEP S5 - the seam in `GradingTab.tsx`. THE CALLER.**

Verified open today (`awk 'NR>=226&&NR<=242'`, `awk 'NR>=341&&NR<=358'`,
`awk 'NR==148'`, `awk 'NR>=58&&NR<=70' src/app/page.tsx`):

- `GradingTab.tsx:228` is `<form className={styles.form} action={formAction}>`.
- `:148` is the one `formAction(fd);` call, inside `handleAutoGrade`.
- `:347` is `disabled={pending || (source === "canvas" && !canvasRetrieved)}`.
- `formAction` and `pending` are PROPS, from `page.tsx:63`'s `useActionState`.

The seam, exactly - **and note that the DECISIONS have moved into the `.ts` hook
(S4) and what remains in this `.tsx` file is wiring only**:

1. **`action={formAction}` is DELETED from the `<form>` at `:228`.** This is the
   single line that closes the double-spend; nothing else in this step works
   without it. Asserted by **W4-9b**.
2. The form gains
   `onSubmit={(event) => { event.preventDefault(); void startReview(new FormData(event.currentTarget)); }}`.
   `new FormData(event.currentTarget)` is reachable now precisely because the
   dispatch is ours.
3. `startReview` comes from `useIncrementalGradingRun` (S4). **The `startLockRef`
   claim, the `routeGradingRun` call and BOTH whole-run branches live inside that
   `.ts` hook**, where W4-9 can count them.
4. **`submitWholeRun` is declared here and is the ONLY `formAction(` call this
   step adds:**
   `const submitWholeRun = (fd: FormData) => { startTransition(() => { formAction(fd); }); };`
   It is passed into the hook.
5. `disabled={pending || incrementalRunning || (source === "canvas" && !canvasRetrieved)}`.

**RULING 40 - `prepareGradingRunAction`'s `mode: "whole-run"` return, ITS NAMED
CONSUMER, AND WHY THAT DOES NOT BREAK A5.**

Revision 1 asserted a server-side whole-run decision in W4-12 clause 2 and never
said what the client does with it. Two of the four states
`docs/a39-architecture.md:1357-1363` routes to whole-run - any single entry over
budget, and a run that yields zero tickets - are knowable ONLY after the action
has run server-side and opened the archive (`:1115-1119`). So the return is not
decorative: without a consumer, a run containing one oversized submission starts
the pool anyway, which is the precise failure W4-12's own direction-of-failure
paragraph exists to make impossible. **An export whose caller is in no wave is
this repo's most repeated structural failure, and a return BRANCH is an export.**

**THE CONSUMER, NAMED:** `useIncrementalGradingRun.ts`'s `startReview`, step 5
of its contract in S4. On `{ mode: "whole-run", reason }` it calls the injected
`submitWholeRun(fd)` - **the same injected function the client-side synchronous
route already calls.**

**That is also what keeps A5 at exactly two.** `/formAction\(/` counts
occurrences in `GradingTab.tsx`'s source:

| Occurrence | Where | Inside a `startTransition(` span? |
|---|---|---|
| `:148` | `handleAutoGrade`, unchanged by this wave | yes, today |
| the one inside `submitWholeRun` | new in this step | yes, by construction |

**BOTH whole-run routes - the client-side synchronous one and the server-decided
one - go through `submitWholeRun`, so there is ONE call site for two routes and
the count is two, not three.** Revision 1's A5 replacement pinned it to exactly
two and a third fallback would have broken it; the shared helper is what makes
the pin and the consumer compatible rather than a choice between them. **Any
brief that writes a second `formAction(fd)` for the server-decided branch turns
A5 red, and that is the intended behaviour, not a bug in A5.**

Measured today, so the wave knows what "two" is counted against:
`grep -n "formAction\|<form" src/app/components/GradingTab.tsx` returns `:29`
(the prop type, `formAction: (payload: FormData) => void;` - no `(` immediately
after the identifier, so `/formAction\(/` does not match it), `:52` (the
destructure), `:148` (the ONE matching call) and `:228` (the form attribute, no
paren). **Exactly one match today**, which is what
`autoGradeTransition.wiring.test.ts:159-162` asserts.

**A5 CHANGES IN THIS COMMIT, and the reason is recorded in the test file in the
same commit.** Measured today: `autoGradeTransition.wiring.test.ts:159-162` is

```
it("A5: formAction( is called exactly once in the whole file, and it is the transition's call", () => {
  const wholeFileMatches = [...gtSource.matchAll(/formAction\(/g)];
  expect(wholeFileMatches.length).toBe(1);
});
```

`/formAction\(/` will now match **twice**: `:148` and the one inside
`submitWholeRun` (step 4 above).
**A5 becomes: every `formAction(` occurrence lies strictly inside a
`startTransition(` paren span, and there are exactly two.** That is strictly
stronger than a bare count - it constrains WHERE each call is, not just how
many there are. **WATCHED: change the test first, run it against the unchanged
`GradingTab.tsx`, and confirm it still passes on one call inside a transition;
then add the second call OUTSIDE a transition and watch it go RED; then move it
inside.**

**The count is two under BOTH whole-run routes** because both go through
`submitWholeRun`. A brief that gives the server-decided branch its own
`formAction(fd)` makes it three and turns A5 red - which is the pin doing its
job, not a conflict between A5 and RULING 40.

**A6 and A7 are NOT touched.** A6 (`:164-190`) requires SOME occurrence of
`source !== "livefeed"` whose innermost enclosing brace span is a live
conjunction containing `pending` and `styles.loadingState` and **containing no
`||` anywhere** (`:183`: `!spanText.includes("||")`). **The progress line must
be a SEPARATE sibling region and must not be folded into that span**, because a
single `||` anywhere inside fails A6. A7 (`:192-202`) pins
`disabled={pending}` to exactly 3 occurrences in `LiveFeedPanel.tsx` on three
named anchors; wave 4c does not touch that file.

**W4-8** - the stop control is not buried under its own results. As a PAIR:
`indexOf("Stop grading")` and the progress region's anchor are each `>= 0`, AND
each is less than `indexOf("<GradingResults")`, which is itself `>= 0`. Also RED
if the stop literal is spelled anything other than `Stop grading`.

#### 8.4.4 Wave 4c ceiling and gate

**Edited files:**

| File | Before | Est. delta | Gate |
|---|---|---|---|
| `src/app/components/GradingTab.tsx` | 524 after wave 2 | +45 | `-le 620` |
| `src/app/actions.ts` | 77 (both counters) | +1 | `-le 90` |
| `src/lib/grade.ts` | 19 (both counters) | +2 (4b) | `-le 30` |

**THE NINE NEW FILES, each with a bound. Revision 1 gave them none**, so the only
backstop was the repo-wide 1000 - and 1000 is the ceiling a file grows INTO, not
a budget a file is born with. This is the wave where it bites, because 4.1 rules
4c is ONE commit and cannot be split (the handler's only caller is the pool, so
splitting ships a live model-spending POST with no surface). **Per-file budgets
are the mitigation for that reviewability cost; a split is not available.**

| New file | Bound, both counters | The measured basis |
|---|---|---|
| `src/app/api/grade-run-item/route.ts` | **`-le 260`** | `src/app/api/class-trends-insight/route.ts` is **187** (both counters) and is the line-for-line model; this handler adds the S1 validation block and the S2b `raceWithTimeout` wrapper |
| `src/app/api/grade-run-item/route.test.ts` | **`-le 400`** | four negative fixtures (F1, F1b, F2, F3) plus W4-10 and W4-13 |
| `src/app/actions/grading-incremental.ts` | **`-le 250`** | a `"use server"` module holding `prepareGradingRunAction` only |
| `src/app/actions/grading-incremental.test.ts` | **`-le 350`** | W4-4, W4-12 clause 2 |
| `src/app/components/grading/incrementalRunPlan.ts` | **`-le 300`** | four pure functions and two constants |
| `src/app/components/grading/incrementalRunPlan.test.ts` | **`-le 450`** | W4-3, W4-5, W4-11, W4-12 clauses 1 and 3 |
| `src/app/components/grading/useIncrementalGradingRun.ts` | **`-le 560`** | **the one that needs saying.** It is a PORT of `useRepoGradesBulkGrade.ts`, measured at **489** on both counters, and it then ADDS cancellation and the `startReview` seam of S4. 560 is 489 + ~70 and leaves 440 to the repo ceiling. **If the port lands above 560 the wave states the measured reason in its commit message; it does not raise the number silently** |
| `src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts` | **`-le 760`** | its precedent `useRepoGradesBulkGrade.lifecycle.test.ts` is **706** on both counters, and this one adds W4-9b, W4-9c and W4-12 clause 2's consumer half |
| `src/lib/grade/reconcile.ts` / `.test.ts` (wave 4b) | `-le 250` / `-le 400` | stated in 8.4.2 |

`src/file-size-ceiling.structure.test.ts:41` is `const LIMIT = 1000;` and `:138`
compares `lineCount > limit`, so a new file at 1001 is the FIRST value that goes
red. **Nothing between a wave's own bound and 1000 would be caught by the
repo-wide gate**, which is the whole reason these bounds exist. **No wave in this
plan proposes an `ALLOWED_OVERAGE` entry.**

```powershell
npm run test:paths -- src/app/api/grade-run-item/route.test.ts src/app/actions/grading-incremental.test.ts src/app/components/grading/incrementalRunPlan.test.ts src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts src/app/actions/action-guard-coverage.test.ts src/lib/use-server-exports.test.ts src/app/components/autoGradeTransition.wiring.test.ts src/lib/module-graph/runtime-import-graph.test.ts src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts src/app/components/grading-results/gradingResultsHelpersEditState.test.ts src/lib/grade/reconcile.test.ts src/lib/grade/engine.test.ts src/lib/grade/engine.ungraded.test.ts src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
```
The first four are `[created by this wave]`.
```powershell
npm test
npx tsc --noEmit --incremental false
@(Get-Content src/app/components/GradingTab.tsx).Count
git status --short
```
plus `@(Get-Content <file>).Count` AND `wc -l < <file>` for the nine new files
in the table above. The W4-6 greps are run from Bash, both before the wave starts
and at the gate:

```
grep -rnE 'stoppedBy: *"run-deadline"' src --include=*.ts --include=*.tsx | grep -v "\.test\."
grep -rnE 'stoppedBy: *"run-deadlineZZZ"|stoppedBy: *"submission-count-bound"' src --include=*.ts --include=*.tsx | grep -v "\.test\."
grep -rnE '"runDeadlineMs"' src --include=*.ts --include=*.tsx | grep -v "\.test\."
grep -rnE '"runDeadlineMsZZZ"' src --include=*.ts --include=*.tsx | grep -v "\.test\."
grep -rnE "runDeadlineMs|\"run-deadline\"" src --include=*.ts --include=*.tsx | grep -v "\.test\." | wc -l
wc -l < src/app/components/GradingTab.tsx
```

**PASS:** every `test:paths` argument `COVERED`, exit 0; `npm test` zero failed,
exit 0; `tsc` silent; `GradingTab.tsx` `<= 620` and all nine new files at or
under their stated bounds, on both counters; **W4-6a returns exactly
`src/lib/grade/engine.ts:304` and its canary returns two lines; W4-6b returns
exactly the five enumerated lines and its canary exits 1**; the broad
informational grep returns the same count it returned before the wave started
(**29** at this pass's HEAD) or, if it differs, the wave attributes the
difference to a named sibling before proceeding.

**`npm run build` is NOT a gate here and must not be `&&`-chained.** It compiles
and then fails in the prerender tail because there is no `.env`
(`docs/loop/this-repo.md:47-74`). **The gate is the
`Compiled successfully` line, grepped for, not the exit code.** It is worth
running once on 4c because `next build` is the ONLY gate that catches a
`"use server"` file exporting a non-async binding - which
`src/app/actions/grading-incremental.ts` is, and which
`src/lib/use-server-exports.test.ts` covers only partially.

#### 8.4.5 W4-7 - the owner-verification pass condition revision 1 dropped

**RESTORED VERBATIM from `docs/a39-architecture.md:2143-2145`**, where its own
disposition table at `:2251` marks it KEPT VERBATIM. Revision 1 carried the
residual it points at (RES-A39A-4, via RES-W-12) and dropped the condition
itself, while carrying the structurally identical owner-only W1-3 and W5-2 -
inconsistent, and the one it dropped is **the only measurement of whether A39
worked at all.**

> **W4-7, owner-only.** OBJECT: wall-clock elapsed from Start Review to the
> first readable row, before and after. INSTRUMENT: the owner, with real keys,
> against a clock. **No API key exists here.** RES-A39A-4.

**Why it cannot be built in this checkout, stated rather than assumed.** The
claim is about elapsed time to a rendered row. Nothing renders under vitest
(`docs/loop/this-repo.md` sections 2 and 6) and `vitest.setup.ts` throws on any
real `fetch`, so there is no way to produce either a row or a real model latency
here. **A green suite on this wave says nothing about W4-7**, and no gate in
8.4.4 should be read as covering it.

**Its five fields, so it is a pass condition and not a hope:**

| Field | Value |
|---|---|
| **OWNER** | repo owner |
| **INSTRUMENT** | one real grading run of at least five submissions on the default provider, timed from the Start Review press to the first row a reader could act on, run once on the pre-4c build and once after |
| **OBJECT** | elapsed milliseconds to the first readable row, before and after |
| **DIRECTION OF FAILURE** | **the after value not lower than the before value** - the feature's entire premise is that row 1 arrives while row 7 is still running, and an unchanged time to first row means the pool was built and the wait was not moved |
| **STEP** | the owner verification pass after wave 4, in the SAME sitting as RES-A39A-4's timing run, RES-W-11's throttle count and RES-W-12's budget check - one run answers all four, and splitting them costs four runs |

**Carried in the register as RES-W-12's companion**; W4-7 is the condition,
RES-A39A-4 is the residual, and neither substitutes for the other.

### 8.5 Wave 5 - the credential has a route, and the receipt reaches Live Feed

**Write set:** `src/lib/canvas-credential-cta.ts` (new, PURE),
`src/lib/canvas-credential-cta.test.ts` (new),
`src/app/components/GradingTab.tsx` (**THE CALLER**, its `state.error` region),
`src/app/components/LiveFeedPanel.tsx` (**THE CALLER**, and the second
`RubricProvenance` mount), `src/app/components/autoGradeTransition.wiring.test.ts`
(**owned** - **its A7 pins `disabled={pending}` to exactly 3 occurrences in
`LiveFeedPanel.tsx`, and neither a CTA nor a mounted leaf may become a
fourth**), `src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts`
and `.../gradingResultsHelpersEditState.test.ts` (**owned**), the three
repo-wide gates (owned, read-only).

**Ceiling:** `GradingTab.tsx` 569 -> 579, gate `-le 620`; `LiveFeedPanel.tsx`
719 -> 735, gate `-le 760`.

**Watched failures:**

- **W5-1** - the predicate compares BY IDENTITY
  (`message === CANVAS_CREDENTIAL_REQUIRED_MESSAGE`, importing the constant
  from `canvas-credentials.ts:77`), never by a copied literal. **Watched by
  writing the module with a copied literal first, changing the constant in the
  test's import, and seeing the test go RED** - so a drift fails here rather
  than silently.
- **W5-3** - `indexOf("<RubricProvenance")` in `LiveFeedPanel.tsx` is `>= 0`
  AND less than `indexOf("<GradingResults")`, which is itself `>= 0`. RED if
  the Live Feed surface renders a run with no provenance line - claim 1 shipped
  on one of two surfaces, which is the reachability gap this whole item exists
  to avoid creating. **Watched against today's tree, where the presence half
  fails.**
- **W5-2, owner-only** - whether the link appears and is keyboard reachable.
  Nothing renders. RES-W-6.

**New files, with bounds:** `src/lib/canvas-credential-cta.ts` **`-le 120`**
(a predicate and a constant), `src/lib/canvas-credential-cta.test.ts`
**`-le 200`**.

**Gate:**
```powershell
npm run test:paths -- src/lib/canvas-credential-cta.test.ts src/app/components/autoGradeTransition.wiring.test.ts src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts src/app/components/grading-results/gradingResultsHelpersEditState.test.ts src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
npm test
npx tsc --noEmit --incremental false
@(Get-Content src/app/components/LiveFeedPanel.tsx).Count
@(Get-Content src/app/components/GradingTab.tsx).Count
git status --short
```
```
wc -l < src/app/components/LiveFeedPanel.tsx
```
**`src/lib/canvas-credential-cta.test.ts` is `[created by this wave]`** - the
marker section 3.4 requires and revision 1 omitted here. Run as written against
today's tree the gate exits 1 with `PRE-CHECK FAILED / does not exist on disk`,
which is correct behaviour for an EXIT gate and is harmless once the file
exists; the marker is what stops a reader treating that exit 1 as a defect.

**PASS:** every argument `COVERED`, exit 0; `npm test` zero failed, exit 0;
`tsc` silent; `LiveFeedPanel.tsx <= 760` and `GradingTab.tsx <= 620` on both
counters; both new files at or under their bounds.

---

## 9. Disjointness, computed in BOTH senses

### 9.1 Half one - exact path, computed not eyeballed

Each wave's file set (edits PLUS the tests asserting on the behaviour it
changes) was written to a file in the scratchpad and intersected mechanically.
The three repo-wide read-only gates (`src/file-size-ceiling.structure.test.ts`,
`src/lib/no-emojis.test.ts`, `src/source-bytes.structure.test.ts`) are filtered
out of the printed result because **no wave WRITES them**; they are section
9.3's business instead.

```
for a in w3ai w3aii w1 w2 w3b w4 w5; do
  for b in w3ai w3aii w1 w2 w3b w4 w5; do
    if [ "$a" \< "$b" ]; then
      echo "--- $a vs $b ---"
      comm -12 <(sort $a.txt) <(sort $b.txt) \
        | grep -vE "^src/(file-size-ceiling\.structure\.test\.ts|lib/no-emojis\.test\.ts|source-bytes\.structure\.test\.ts)$"
    fi
  done
done
```

Canary on the same instrument, in the same session:
`comm -12 <(sort w1.txt) <(sort w1.txt) | wc -l` -> **14** (a set intersected
with itself is non-empty, so `comm -12` is doing its job).

**Output, pasted:**

```
--- w3ai vs w3aii ---
src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts
--- w3ai vs w3b ---
src/app/components/snapshot-grading/SnapshotGradingPanel.tsx
src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts
src/app/components/snapshot-grading/snapshot-grading.structure.test.ts
src/app/components/snapshot-grading/snapshot-role-setrole-callsites.structure.test.ts
src/loop-docs.structure.test.ts
--- w3ai vs w4 ---
--- w3ai vs w5 ---
--- w3aii vs w3b ---
src/app/actions/grading-submission-grade.test.ts
src/app/components/grading-recording/GradingAssessmentDeclarationControls.test.ts
src/app/components/grading-recording/GradingRecordingPanel.assessment.test.ts
src/app/components/grading-recording/GradingRecordingPanel.tsx
src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts
src/app/components/grading-recording/grading-recording-log.test.ts
src/app/components/grading-recording/grading-rows.test.ts
src/app/components/grading-recording/markLate.wiring.test.ts
src/app/components/grading-recording/submission-kind-callsites.structure.test.ts
src/app/components/module-deck-capture/ModuleDeckCapturePanel.wiring.test.ts
src/app/components/module-deck-capture/module-deck-dispatch.test.ts
src/app/components/recording/AddKnowledgePages.test.ts
src/app/components/recording/discussion-capture.test.ts
src/app/components/recording/discussion-knowledge-context.test.ts
src/app/components/recording/runLogRow.test.ts
src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts
src/app/components/ui/buttonVariant.test.ts
src/lib/recording-launch.test.ts
--- w3aii vs w4 ---
--- w3aii vs w5 ---
--- w1 vs w3ai ---
--- w1 vs w3aii ---
--- w1 vs w2 ---
src/app/components/GradingTab.tsx
src/app/components/autoGradeTransition.wiring.test.ts
src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts
src/app/components/grading-results/gradingResultsHelpersEditState.test.ts
--- w1 vs w3b ---
--- w1 vs w4 ---
src/app/components/GradingTab.tsx
src/app/components/autoGradeTransition.wiring.test.ts
src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts
src/app/components/grading-results/gradingResultsHelpersEditState.test.ts
--- w1 vs w5 ---
src/app/components/GradingTab.tsx
src/app/components/autoGradeTransition.wiring.test.ts
src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts
src/app/components/grading-results/gradingResultsHelpersEditState.test.ts
--- w2 vs w3ai ---
--- w2 vs w3aii ---
src/app/actions/grading-submission-grade.test.ts
--- w2 vs w3b ---
src/app/actions/grading-submission-grade.test.ts
--- w2 vs w4 ---
src/app/components/GradingTab.tsx
src/app/components/autoGradeTransition.wiring.test.ts
src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts
src/app/components/grading-results/gradingResultsHelpersEditState.test.ts
src/app/components/grading-results/ungradedDisclosure.test.ts
src/lib/code-runner.test.ts
src/lib/grade/engine.test.ts
src/lib/grade/engine.ts
src/lib/grade/engine.ungraded.test.ts
src/lib/grade/grouping-zip-parents.wiring.test.ts
src/lib/module-graph/runtime-import-graph.test.ts
--- w3b vs w4 ---
--- w3b vs w5 ---
--- w4 vs w5 ---
src/app/components/GradingTab.tsx
src/app/components/autoGradeTransition.wiring.test.ts
src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts
src/app/components/grading-results/gradingResultsHelpersEditState.test.ts
```

**Ten pairs are EMPTY, and empty is the only pass:** `w3ai/w4`, `w3ai/w5`,
`w3aii/w4`, `w3aii/w5`, `w1/w3ai`, `w1/w3aii`, `w1/w3b`, `w2/w3ai`,
**`w3b/w4`**, `w3b/w5`.

**The two concurrency licences this plan grants, and only these two:**

- **3a-i + 1** (slot 1) - `w1 vs w3ai` empty.
- **3b + 4** (slot 4) - `w3b vs w4` empty. This re-derives the architecture's
  own claim on today's tree.

**Both licences survive this revision's write-set corrections, checked and not
assumed.** Wave 4b gained three paths in 8.4.2
(`gradingResultsHelpersWiring.test.ts`, `repoGradesFeedbackAndFiles.wiring.test.ts`,
`grade-result-doors.wiring.test.ts`) and wave 2 gained seven explicit new-file
paths in 8.2. None of the three appears in w3b's 27 paths (9.2's pasted lists),
and wave 2 is not in either licensed pair. **`w3b vs w4` is still EMPTY and
`w1 vs w3ai` is still EMPTY.** A write-set correction that is not re-intersected
is how a licence outlives the set it was computed over.

**HOW THE SEQUENCING INSIDE A CONCURRENT SLOT IS ACTUALLY ENFORCED, because
"gates run sequentially" is an instruction to an orchestrator and not to either
agent.** Slots 1 and 4 name a single `tsc` owner and a sabotage ordering, and
neither concurrent agent can observe the other. **The mechanism is that these are
ORCHESTRATOR obligations, discharged by the orchestrator and written into neither
brief:**

| Obligation | Who discharges it | How |
|---|---|---|
| Exactly one `npx tsc --noEmit` caller per window | **the orchestrator** | Each brief's gate block runs `tsc` with `--incremental false`, which removes the `tsconfig.tsbuildinfo` race entirely; the "one owner" rule is the belt to that brace, and the orchestrator holds it by not dispatching the second wave's gate until the first has returned |
| No two agents sabotage-verify at once | **the orchestrator** | Each brief states that its sabotage window must be reported as started and finished; the orchestrator does not dispatch the sibling's gate inside that window. **Each brief carries the RULE ("report the window"), not the SCHEDULE ("wait for the other agent"), because a brief that names a sibling makes an agent try to observe one** |
| Restore after sabotage | **each implementer** | `cp` backup, never `git checkout --` on an uncommitted file, which reverts to the index and destroys the chunk's work |

**Every non-empty pair is sequenced**, per 4.2. The one-file pairs `w2/w3aii`
and `w2/w3b` are discussed in 4.3; `w3ai/w3aii` sharing
`snapshot-autofire.structure.test.ts` is why the two extraction halves are
sequential rather than concurrent.

### 9.2 The derivation behind the sets

Each wave's set is its edits plus the output of

```
for n in <every file that wave edits>; do echo "### $n"; grep -rl "$n" src --include="*.test.ts" | sort; echo; done
```

pasted in sections 6.1, 7.1, 8.1, 8.2 - **and, as of this revision, for waves 3b,
4 and 5 as well.** Revision 1 named those three sets by reference and never ran
the instrument over them, which meant the disjointness output in 9.1 - the only
thing granting the two concurrency licences - was computed over sets a reader
could not check. **The licences were independently re-derived by the round-1
check and both hold; what was missing was the evidence, so here it is.**

**Wave 3b's edits and their readers:**

```
for n in "RubricInputModal.tsx" "GradingRecordingPanel.tsx" "SnapshotGradingPanel.tsx"; do
  echo "### $n"; grep -rl "$n" src --include="*.test.ts" | sort; echo; done
grep -rl "RubricInputModalZZZ.tsx" src --include="*.test.ts"      # canary, exit 1
```
```
### RubricInputModal.tsx
src/app/actions/syllabus-upload.rubric-reuse.test.ts
src/app/components/grading-recording/rubric-input.test.ts
src/app/components/snapshot-grading/snapshot-grading.structure.test.ts
src/app/components/ui/buttonVariant.test.ts
src/app/components/ui/modalAdoption.wiring.test.ts
src/lib/syllabus-upload-source.test.ts                             (SIX - 0.3's finding reproduces)

### GradingRecordingPanel.tsx
src/app/actions/grading-submission-grade.test.ts
src/app/components/grading-recording/GradingAssessmentDeclarationControls.test.ts
src/app/components/grading-recording/GradingRecordingPanel.assessment.test.ts
src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts
src/app/components/grading-recording/grading-recording-log.test.ts
src/app/components/grading-recording/grading-rows.test.ts
src/app/components/grading-recording/markLate.wiring.test.ts
src/app/components/grading-recording/submission-kind-callsites.structure.test.ts
src/app/components/module-deck-capture/ModuleDeckCapturePanel.wiring.test.ts
src/app/components/module-deck-capture/module-deck-dispatch.test.ts
src/app/components/recording/AddKnowledgePages.test.ts
src/app/components/recording/discussion-capture.test.ts
src/app/components/recording/discussion-knowledge-context.test.ts
src/app/components/recording/runLogRow.test.ts
src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts
src/app/components/ui/buttonVariant.test.ts
src/lib/recording-launch.test.ts                                   (SEVENTEEN)

### SnapshotGradingPanel.tsx
src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts
src/app/components/snapshot-grading/snapshot-grading.structure.test.ts
src/app/components/snapshot-grading/snapshot-role-setrole-callsites.structure.test.ts
src/loop-docs.structure.test.ts                                    (FOUR)
```

**Wave 4's and wave 5's edits and their readers:**

```
for n in "grade/engine.ts" "grade.ts" "GradingTab.tsx" "app/actions.ts" "LiveFeedPanel.tsx"; do
  echo "### $n"; grep -rl "$n" src --include="*.test.ts" | sort; echo; done
grep -rl "LiveFeedPanelZZZ.tsx" src --include="*.test.ts"          # canary, exit 1
```
```
### grade/engine.ts
src/app/components/grading-results/ungradedDisclosure.test.ts
src/lib/code-runner.test.ts
src/lib/grade/grouping-zip-parents.wiring.test.ts

### grade.ts        (raw; false positives on snapshot-grade.ts / grading-submission-grade.ts
                     discarded by opening each hit - see 3.3 for the discard table)
src/app/actions/snapshot-parse-rubric.test.ts                      (discarded)
src/app/components/grading-recording/submission-kind-callsites.structure.test.ts (discarded)
src/app/components/grading-results/gradingResultsHelpersWiring.test.ts           (KEPT)
src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts         (KEPT)
src/app/components/snapshot-grading/p11-containment-snapshot.test.ts             (discarded)
src/app/components/snapshot-grading/snapshot-grading.structure.test.ts           (discarded)
src/lib/grade/grade-result-doors.wiring.test.ts                    (KEPT, comment only)
src/lib/module-graph/runtime-import-graph.test.ts                  (KEPT)

### GradingTab.tsx
src/app/components/autoGradeTransition.wiring.test.ts
src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts
src/app/components/grading-results/gradingResultsHelpersEditState.test.ts

### app/actions.ts
src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts
src/lib/module-graph/runtime-import-graph.test.ts

### LiveFeedPanel.tsx
src/app/components/autoGradeTransition.wiring.test.ts
src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts
src/app/components/grading-results/gradingResultsHelpersEditState.test.ts
```

**Consequence for 9.1's two licences, checked against these sets rather than
asserted.**

- **`w3b` vs `w4` - the slot-4 licence.** `w3b` is the three panels plus the
  modal plus the 17 + 4 + 6 reader paths above; `w4` is `grade/engine.ts`,
  `grade.ts`, `GradingTab.tsx`, `app/actions.ts`, their readers above, and 4c's
  nine new files. **The two `grade.ts` readers this revision ADDS to wave 4b**
  (`gradingResultsHelpersWiring.test.ts`,
  `repoGradesFeedbackAndFiles.wiring.test.ts`) **appear in neither of w3b's
  three reader lists**, so the intersection is still EMPTY and the licence
  survives the correction. This is the check the round-1 check performed
  independently; it is pasted here because a reader cannot verify an
  intersection against a set that was never printed.
- **`w1` vs `w3ai`.** `w3ai` is `SnapshotGradingPanel.tsx` plus the four paths
  above plus the new leaf; `w1` is `single-file-entry.{ts,test.ts}`,
  `actions/grading.ts`, `GradingTab.tsx` and their readers. No shared path.
  EMPTY.

**`9.2`'s own closing rule is what this section was breaking:** a derivation that
cannot range over the set it claims is an enumeration in a command's clothes -
and a set stated by reference, with no command ever run over it, is the purest
form of that.

The instrument is **source-text** reader discovery, which is the right one for
this repo's 68 `*.wiring.test.ts` and 17 `*.structure.test.ts` files - they assert
by `readFileSync`. It does **NOT** find import-based readers, which is why three
additions were derived separately in 8.2, two more in 8.4.2, and a second
instrument is named here:

```
grep -rnE 'from "(@/lib/grade|\.\./grade|\./grade)"' src --include=*.ts --include=*.tsx | sort
  -> 52 lines
grep -rnE 'from "(@/lib/gradeZZZ)"' src --include=*.ts      # canary, exit 1
```

**A derivation that cannot range over the set it claims is an enumeration in a
command's clothes**, so both instruments are named and both canaries fired.

### 9.3 Half two - informational independence, and the shared things no file list shows

> List the facts each item must assume to start. Who establishes each fact?

**Pair 1: 3a-i + 1.** 3a-i establishes the post-extraction shape and line
numbering of `SnapshotGradingPanel.tsx`. Wave 1 designs against
`GradingTab.tsx:238,:240`, `grading.ts:821-838`, `office-extract.ts`,
`grade/constants.ts`, `grade/utils.ts`. **Neither appears in the other's stated
write set and neither pins a fact the other changes.** The only crossing is
arithmetic on a shared gate: both shrink-or-grow a file the repo-wide ceiling
test walks, and neither's number depends on the other's. **INDEPENDENT.**

**Pair 2: 3b + 4.** 3b designs against `src/lib/grade/rubric-memory.ts`, which
wave 2 froze and which 3b holds READ-ONLY, and against the two directory
canaries' haystacks. Wave 4 designs against `engine.ts`'s reconciliation, the
`GradingTab.tsx` dispatch, the `src/lib/grade.ts` barrel and the Route Handler
precedents. **Does either establish a fact the other designs against?** No - with
one crossing that is NOT visible in any file list and is therefore stated:
**W4-6a's and W4-6b's greps range over the whole of `src/`.** A concurrent
sibling that introduced `stoppedBy: "run-deadline"` or the form field
`"runDeadlineMs"` anywhere under `src/` would turn wave 4's gate red.
**3b introduces neither**, verified by inspection of its write set (it adds
`ta-snap-*` / `ta-rec-grade-*` key literals, a `rubric-memory` call, two
`maxRows` props and replacement comments). **INDEPENDENT, with that crossing
named in both briefs.**

**The crossing is SMALLER than revision 1's, and that is a consequence of
RULING 38's split rather than a coincidence.** The broad
`runDeadlineMs|"run-deadline"` pattern matched 29 lines across 11 files
including comments about an unrelated deadline, so almost any sibling editing
`release-runner.ts`, `orphan-upload-sweep.ts` or `run-schedules/route.ts` could
have moved it. The two narrow patterns match a construction site and a form-field
name, which almost nothing else in this repo writes. **A gate that is red for a
reason unrelated to the claim is not just uninformative under concurrency - it is
a false crossing that makes two independent waves look coupled.**

**Shared resources that no file list shows** (`docs/loop/parallel-disjointness.md`
section 5), each binding on every concurrent slot:

| Resource | Rule |
|---|---|
| `npx tsc --noEmit` | **Exactly ONE caller per window.** It writes `tsconfig.tsbuildinfo` at the repo root (`.gitignore:41`); two agents racing on it produce results neither can trust. Named per slot in 4.3. `--incremental false` is required in every gate above |
| Sabotage verification | **No two agents sabotage-verify at once.** W2-3, W2-4, W4-2, W4-9 and W4-12 all mutate the shared tree and restore. During that window every concurrent measurement by a sibling - a test run, a line count - is untrustworthy even if the restore is perfect. In slot 4, wave 4's sabotage window and wave 3b's gate are sequenced |
| `git stash` | **Forbidden in every brief.** One agent's stash reverts every sibling's files |
| `git add -A` | **Forbidden in every brief. Every wave stages EXPLICIT PATHS.** A repo-wide add has pushed an implementer's unverified mid-flight work to main here |
| `.claude/worktrees` | A stale copy is returned FIRST by `Glob`. An agent can edit the copy, pass every gate and change nothing real. **`git status --short` in the MAIN checkout is required proof on every wave** |
| `src/file-size-ceiling.structure.test.ts` | Walks all of `src/`. A sibling that grows any file past 1000 turns THIS wave's gate red. Read the failure message before assuming it is yours |
| `src/lib/no-emojis.test.ts` | `roots = ["src", "docs"]` at `:254` - **it scans `docs/` too**, so a doc-only wave shares it with every code wave. It also owns the ONE authorized exception (`CHECKLIST_DONE_PREFIX`). **Never hand-roll an emoji scan**: `grep -P` is broken here and exits 0 without checking (`docs/loop/this-repo.md:210-216`) |
| `src/source-bytes.structure.test.ts` | Walks source for BOM and control bytes. A single materialised NUL makes a file grep as binary and silently drop out of every source-text test while passing tsc, eslint, vitest and the build |
| W4-6a's and W4-6b's greps | Range over all of `src/`. Named above. **Also: revision 1's single broad pattern is retained as an informational baseline whose 29-line count a sibling CAN move; it is explicitly not a PASS condition, for that reason** |
| **`npm test`** | Walks all of `src/` (5.1: 1111 files, 22454 tests, 107.4s measured here). **A sibling's red test turns THIS wave's gate red.** Read the failing file's path before assuming it is yours - the same rule as the ceiling test's, and the reason this gate is worth more than it costs is that it is the only thing ranging over readers no wave enumerated. Its stderr also carries a concurrent sibling's git noise (5.1, point 3) |
| `docs/BACKLOG.md` | A file like any other. If a wave's brief lets it write there, the orchestrator may not, in that window |

**Cap check:** no slot exceeds 2 items. Cap is 2-3.

---

## 10. Every export, and the wave that calls it

Restated as a single table, because a wave that ships an export whose caller is
in a later wave is this repo's most repeated structural failure and a wave table
that buries the answer is how it recurs.

| Export | Declared in | Called in | Same wave? |
|---|---|---|---|
| new snapshot leaf(s) | 3a-i | `SnapshotGradingPanel.tsx` | **YES** |
| new recording leaf(s) | 3a-ii | `GradingRecordingPanel.tsx` | **YES** |
| `classifyGradingUpload`, `buildSingleFileEntry` | 1 | `src/app/actions/grading.ts`; the widened intake in `GradingTab.tsx` | **YES** |
| `rubricFingerprint` (moved to `rubric-fingerprint.ts`) | 2 | `rubric-bank.ts` re-export (so `:70`'s own upsert is unchanged) AND `engine.ts`'s three stamp sites | **YES** |
| `loadRubricMemory` / `saveRubricMemory` / `describeRubricOrigin` | 2 | `GradingTab.tsx` (path A), `CartridgeDropPanel.tsx` (path H) | **YES.** 3b is a SECOND caller, not a deferred first one |
| `describeRunRubricProvenance` | 2 | `RubricProvenance.tsx` | **YES** |
| `RubricProvenance` | 2 | `GradingTab.tsx`, above the `<GradingResults` mount at `:427` | **YES.** Wave 5 adds `LiveFeedPanel.tsx` as a second mount |
| `GradingRun.rubricUsed` / `.rubricFingerprint` | 2 | `engine.ts` writes; `coerceGradingRun` and `parseGradingRun` carry forward; `describeRunRubricProvenance` reads | **YES** |
| `reconcileRun` | 4b | `engine.ts:332-393` becomes the call - **and `engine.ts` imports the LEAF (`./reconcile`) directly, not the barrel.** See the note below | **YES** |
| **The `src/lib/grade.ts` BARREL re-export of `reconcileRun`** | 4b | **NOTHING, in any wave.** See the note below | **NO - and it is either justified or deleted** |
| `prepareGradingRunAction`, including its `mode: "whole-run"` return branch | 4c | `GradingTab.tsx`'s form calls `startReview`, which is `useIncrementalGradingRun.ts`'s. **`startReview` consumes BOTH shapes of the return**: the ticket list starts the pool, and `{ mode: "whole-run", reason }` calls the injected `submitWholeRun` (S5, RULING 40) | **YES, both branches** |
| `POST /api/grade-run-item` | 4c | `useIncrementalGradingRun.ts`'s pool - **the only caller** | **YES, and it cannot be otherwise** (4.1) |
| `buildRunItemRequests`, `mergeArrivedResults`, `routeGradingRun`, `classifyItemFailure`, `INCREMENTAL_CONCURRENCY`, `ITEM_REQUEST_BYTE_BUDGET` | 4c | `useIncrementalGradingRun.ts` and `GradingTab.tsx` | **YES** |
| `useIncrementalGradingRun` | 4c | `GradingTab.tsx` | **YES** |
| `isCanvasCredentialRequired`, `CANVAS_CREDENTIAL_CTA_HREF` | 5 | `GradingTab.tsx`, `LiveFeedPanel.tsx` | **YES** |

**No type-only-module exception is claimed.** Every row above is a runtime
export with a runtime caller in its own wave - **with one exception, which is
named here rather than left for a reader to notice.**

### 10.1 The one export in this plan whose caller is in NO wave

`src/lib/grade.ts` is a 19-line barrel of pure re-exports with 52 importers
(3.3). Wave 4b adds `reconcileRun` to it. **But `engine.ts` - the caller section
10 names - imports the leaf directly** (`./reconcile`), because that is what
keeps 4b's runtime-import-graph story intact and what makes `reconcile.ts`'s
"imports only `./types` and `./rubric`" claim checkable. **So the barrel line
itself has no importer in any of the six waves.**

That is a smaller version of the class this whole section exists to police, and
this plan does not get to wave its own rule. The disposition, ruled:

**RULED: the barrel line is KEPT, and here is what makes it different from a
dead export rather than an exception to the rule.** `src/lib/grade.ts` is not a
module with behaviour; it is this repo's declared public surface for
`src/lib/grade/`, and 52 importers reach the package through it. A new leaf that
is reachable only by deep path is the thing the barrel exists to prevent, and
`grade-result-doors.wiring.test.ts:127` already names "grade.ts's own barrel" as
a door in that argument. **The cost of keeping it is two lines and one new edge
in a graph three tests already walk; the cost of omitting it is a leaf that the
next chunk imports by deep path because the barrel did not offer it.**

**What makes this honest rather than a loophole:** the line is not claimed to be
COVERED by anything. `runtime-import-graph.test.ts:572` sees the new edge, which
proves the line parses and resolves - it does not prove anybody wanted it.
**If the reviewer prefers the strict reading, the remedy is one line: delete the
barrel export.** Nothing in waves 1-5 breaks, because no wave imports it.
**Carried as RES-W-15** with an owner and a step, so the decision is recorded
rather than inherited.

---

## 11. The four terminating questions, carried as per-wave gates

`docs/a39-architecture.md` section 12 leaves four. **None blocks this plan.**
Each is a gate on exactly one wave, with what that wave does under each answer.
The recommendations are the architecture's; they are repeated, not re-argued.

**There is a FIFTH open question and it is NOT in this table, because it is the
only one that BLOCKS a wave.** `docs/a39-waves-rulings.md` RULING 37 escalated
wave 3a-i's extraction SHAPE - `.tsx` components that reach the ceiling but have
no oracle, versus `.ts` leaves that carry an oracle but for which no arithmetic
exists - with a recommendation of (a). **This plan adopts no branch**, structures
wave 3a-i so it executes under any of the three answers (6.7), and marks 3a-i not
dispatchable until the answer arrives. Every other wave proceeds. RULING 32 gates
A24 on the same commit, so the answer unblocks two backlog rows.

**This is revision 2 and it is terminal.** Nothing below is deferred to a next
round; what could not be settled here is either an owner question shaped so every
answer ends the activity, or a residual in section 12 with all five fields.

| Q | Gates which wave | (A) | (B) | Recommendation | What the wave does if unanswered at dispatch |
|---|---|---|---|---|---|
| **Q1** - does wave 4 ship inside A39, or as its own row? | **the dispatch of slot 4's wave-4 half.** Waves 3a-i, 1, 3a-ii, 2, 3b and 5 are unaffected and proceed either way | five waves, A39 lands complete | waves 1, 2, 3, 5 ship as A39; wave 4 becomes its own row, scoped from section 4 unchanged | **(A).** 3b and 4 are disjoint (9.1) and run concurrently, so (B) buys sequencing this plan does not need | **Proceed on (A).** Slot 4 dispatches both. If the owner later takes (B), wave 4's commits are already independently gateable and lift out whole - nothing in waves 1, 2, 3 or 5 depends on them |
| **Q2** - the two `ta-` keys with no exact-key-set canary | **wave 2** (`ta-grading-rubric-memory`, `ta-cartridge-rubric`) | ship with two uncovered keys; RES-A39A-11 is the record | scope a root-level canary over `src/app/components/` non-recursively plus `CartridgeDropPanel.tsx` as its own row, landing before or with wave 2 | **(A).** This is `iteration-caps.md` disposal (b), and the residual's instrument is real either way. Inventing a root-level canary inside a feature wave is the hand-rolling that card forbids | **Proceed on (A).** Wave 2 lands both keys and its gate does NOT include a root-level canary. RES-W-4 records the uncovered pair with a direction of failure that transitions on a SIXTH key |
| **Q3** - the rubric lingering on this device while signed in | **wave 3b's replacement comments** | accept; the comments say so in source, RES-A39A-13 records it | add a "Forget this rubric" control on each surface - a named extra line in waves 2 and 3, persisting nothing new | **(A).** It is the cost DECISION 3 buys; the sweep at `client-state-sweep.ts:45` already answers the cross-user half | **Proceed on (A).** Wave 3b's replacement comment states the cost explicitly. If (B) arrives later it is an additive control on four surfaces and touches no gate above |
| **Q4** - is the Server Action form of the per-item call needed by anything else? | **wave 4c, step S2** | no other caller; the per-item call is the Route Handler only | something else needs it; wave 4c adds a thin `"use server"` wrapper around the same body, guarded by `requireUser()`, which `action-guard-coverage.test.ts` then DOES cover | **(A)**, on the measurement: `grep -rn "gradeOneSubmissionAction" src` returns three lines - its declaration at `grading.ts:598` and `steps.grading-singles.ts:3,238`, an unattended workflow step not on this seam | **Proceed on (A).** If (B) arrives, the wrapper is additive: the handler body is already a function, and the wrapper adds one file plus one `action-guard-coverage.test.ts` entry. **Step S1's instrument is required under BOTH answers**, because under (B) the Route Handler still exists and the coverage test still cannot see it |

---

## 12. Residual register

Every entry names an **OWNER**, an **INSTRUMENT**, an **OBJECT**, a **DIRECTION
OF FAILURE** and a **STEP**. **Missing any of the five it is a deletion, and I
would call it that.** None below is.

**Seventeen entries in revision 2, up from thirteen.** The four added
(RES-W-14 through RES-W-17) are each the honest remainder of a ruling this
revision applied rather than a new concern: what W4-9's moved seam still cannot
measure, the barrel line nothing imports, the stale full-suite figure in a card
this plan may not write, and the one uncapped field W3-5 deliberately does not
reach. **A ruling applied without recording what it did not reach is how the
next round inherits a silence.**

Entries prefixed `RES-W-` are this plan's own. Entries the architecture's
section 11 already carries are NOT restated here; they stand as written, except
**RES-A39A-3**, whose premise section 0.1 disproved and which **RES-W-1**
replaces.

**A residual that is not in `docs/BACKLOG.md` does not exist**
(`docs/DEV_LOOP.md` step 0). Each below is owed an entry there **at disposal, by
the wave that disposes of it** - not deferred to "whoever lands the next chunk".
**This plan does not write `docs/BACKLOG.md`**; another agent may hold it.

| id | Residual | Owner | Instrument | Object | Direction of failure | Step |
|---|---|---|---|---|---|---|
| **RES-W-1** | **The Route Handler's request-body cap IS declared in this repo, at `src/lib/upload-budget.ts:36-41`, and that module states the cap applies to Route Handlers exactly as to Server Actions. This SUPERSEDES RES-A39A-3's premise, which was that the cap is undeclared and owner-measurable.** What remains unproven is whether the declared ~4.5MB figure matches the deployment today | **wave 4c's implementer** for the in-repo half; **repo owner** for the platform half | in-repo: `awk 'NR>=36&&NR<=41' src/lib/upload-budget.ts` plus `npx vitest run src/lib/upload-budget.test.ts`. Platform: one real POST to `/api/grade-run-item` with a body at `UPLOAD_WIRE_BUDGET_BYTES` and one above it | the largest per-item request body the deployment accepts, against the constant the repo declares | **a per-item request that the repo's own budget passes and the platform rejects** - which surfaces as a transport failure isolated into an ordinary failed row, so the run reports complete | wave 4c writes the constant with `RES-W-1` in the comment beside it; the owner's POST pair is due at the same verification run as RES-A39A-4 |
| **RES-W-2** | **`docs/g4-scope.md:321-328` states `raceWithTimeout` has zero production callers. It has three** (`announcements-panel.tsx:128`, `WalkthroughAnnouncementPanel.tsx:303,:358`), missed by an `--include=*.ts` filter that excludes `.tsx`. The document is not in this plan's write set and is not corrected here | **whoever next edits `docs/g4-scope.md`**, or the G4-proper chunk that consumes it | `grep -rln "raceWithTimeout" src --include=*.ts --include=*.tsx \| grep -v "\.test\."`, canary `raceWithTimeoutZZZ` exit 1 | the set of production call sites of `raceWithTimeout` | **another A39 or G4 brief repeating "your wave is its first production caller"**, which would make a wave build an instrument two shipped templates already provide | at the next edit of `docs/g4-scope.md`, or at the G4 Wave C scoping, whichever is first. **Wave 4c does NOT wait on it** - section 8.4.3 already carries the corrected fact and the two templates |
| **RES-W-3** | **Wave 4c bounds the caller's wait and does NOT abort the underlying fetch** (`bounded-race.ts:26-29`), so the `AbortError`-retried-as-transient defect at `llm.ts:457-463` and `:617-623` stays a dead path. It becomes live the moment any caller passes a real `AbortSignal` | the G4-proper implementer (g4 Wave B), sequenced before any signal threading | a test stubbing `fetch` to reject with an `AbortError` under `vi.useFakeTimers()`, asserting zero `sleep()` calls and an immediate `{ok: false}` | `postGenerateContent`'s returned result | **RED if the stub is invoked more than once** - a retry occurred past a caller's own deadline | before G4 Wave C, if Wave C's chosen shape is signal threading. **Not inside A39** |
| **RES-W-4** | **Two of the four new `ta-` keys are covered by NO exact-key-set canary**: `ta-grading-rubric-memory` (`src/app/components/` root) and `ta-cartridge-rubric` (`CartridgeDropPanel.tsx`). Neither location has one; a canary over the components root would scan hundreds of files - a scoping question, not a wave-2 line. This is what ships under Q2 answer (A). Carries RES-A39A-11 forward with a measured baseline | the chunk that next adds a persisted key outside `grading-recording/`, `snapshot-grading/`, `recording/` and `repo-grades/` | `grep -rln "ta-" src --include=*.structure.test.ts` re-run, against `grep -rno "ta-[a-z-]*" src/app/components/*.tsx \| sort -u` | the set of persisted keys in the two uncovered locations | **a SIXTH persisted key appearing in either uncovered location** - a TRANSITION from the two wave 2 lands, not a restatement of today's state | measured at the wave-2 gate to establish the baseline count of two; re-run by the next chunk that adds a key there |
| **RES-W-5** | **The 3a-i extraction target of 940 and the shape needed to reach it are derived arithmetic, not a measurement of the panel's actual extractable regions.** RULING 33's 931-938 / 913-918 figures were measured against the 970 tree for a DIFFERENT extraction's candidates; adding 837f2e3's +19 gives 950-957 / 932-937 (section 6.2). The panel was not read line by line by this pass or by the architecture | **wave 3a-i's implementer** | `@(Get-Content src/app/components/snapshot-grading/SnapshotGradingPanel.tsx).Count` AND `wc -l`, after enumerating the actual candidate regions with `grep -n "^ *<[A-Z]"` and `grep -n "^  const .* = useCallback"` | the panel's count after the extraction, and the number of new call sites the chosen shape costs | **a chosen shape of five or more components landing the panel above 940**, which the gate catches - and, worse, **a shape that clears 940 by moving code A24 also needs to move**, which no gate catches | wave 3a-i re-derives both the target and the shape BEFORE moving a line, and states the shape in its commit message so A24's re-derivation (RULING 32) can read it |
| **RES-W-6** | **No instrument in this repo can tell whether an affordance is discoverable**, and this plan ships five new ones (widened intake copy, restored rubric field, "Rubric used", the progress line, "Stop grading"). W1-3, W2-7, W2-8, W4-8, W5-2 and W5-3 pin DOM order, a height cap and two label spellings. **They cannot see a label the instructor does not recognise, a control hidden by CSS, or a closed habit.** Carries RES-A39A-1 and RES-A39A-14 | **repo owner**, and the chunk that next adds a control to a grading surface | the owner opening each surface cold and saying what they looked for first; plus W2-7 / W2-8 / W4-8 / W5-3 as the buildable floor | whether each new affordance is found without being told where it is | **an affordance that is present, wired, gate-green and reported as missing** - the exact A17 outcome | escalated ONCE with wave 2's result, never re-raised. **Do not let those six pass conditions be read as discoverability coverage** |
| **RES-W-7** | **`src/app/actions/grading.ts` took a second writer inside one session** (905 -> 917, `a9d9771`), and every line citation into it across the A39 documents is stale by +1 or +12 (section 2.1). Wave 1 adds ~20 against 83 lines of headroom | wave 1's implementer, then the next chunk needing more than 60 lines there | `@(Get-Content src/app/actions/grading.ts).Count` (PowerShell) AND `wc -l` AND `git status --short` BEFORE the wave starts | that file's line count, and whether another agent is writing it | **greater than 945 at any wave gate**, or a wave-1 diff that also contains lines the wave did not author | at every wave gate from wave 1 onward; **wave 1 re-measures BEFORE it estimates, because 905 is no longer the number and 917 may not be either** |
| **RES-W-8** | **Two in-source comments cite `SnapshotGradingPanel.tsx` line numbers that no longer describe anything in that file**: `snapshot-keys.ts:21` ("moved verbatim from SnapshotGradingPanel.tsx:73-80") and `:158` ("matching SnapshotGradingPanel.tsx:550's original lookup verbatim"). Measured, panel `:73` is an import and `:550` is `if (!items) return;`. They are PROVENANCE citations to a file state that no longer exists | **nobody re-pins them**, and that is the ruling. Owner of the rule: this plan | `awk 'NR>=19&&NR<=23' src/app/components/snapshot-grading/snapshot-keys.ts` and `awk 'NR>=156&&NR<=160'`, read against the panel at those lines | the two comments' claims | **a later wave "fixing" them to a new line number**, which would convert an honest historical reference into a false live pin | stated here; re-read by any wave that touches `snapshot-keys.ts`. No wave above touches it |
| **RES-W-9** | **`docs/*.md` holds 56 line-pinned citations into `SnapshotGradingPanel.tsx` and 75 into `GradingRecordingPanel.tsx`; 12 of the former point at line 703 or above and move when 3a-i extracts.** No wave re-pins them | the wave that writes each document next; **nobody re-pins them in bulk** | `grep -rnoE "SnapshotGradingPanel\.tsx:[0-9]+(-[0-9]+)?" docs --include=*.md \| wc -l` -> 56; `... \| sed 's/.*://' \| sort -n \| awk '$1>=703' \| wc -l` -> 12; canary `SnapshotGradingPanelZZZ\.tsx:[0-9]+` exit 1 | the count of stale panel citations in `docs/` | **a brief written FROM one of those citations rather than from the tree**, which is the failure RULING 34 already ruled against and which this plan restates because the count has grown from RULING 34's measured 47 to 56 | 3a-i records the extraction's delta in its commit message. **Every downstream brief is written from the post-extraction tree**; the documents are not rewritten |
| **RES-W-10** | **`snapshot-autofire.structure.test.ts:39,:258` cite `GradingRecordingPanel.tsx:532-544` in a COMMENT, so a 3a-ii extraction can make it false with every gate green** | wave 3a-ii's implementer | `grep -n "GradingRecordingPanel.tsx:" src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts` plus `awk 'NR>=530&&NR<=546' src/app/components/grading-recording/GradingRecordingPanel.tsx` on the post-extraction tree | whether the cited range still holds the `useEffect` + async-IIFE + `cancelled` block | **the cited range describing something else after the extraction, with no test red** | wave 3a-ii, in the same commit: either leave `:532-544` in place (preferred) or re-pin both comments. Pass condition W3a-ii-3 |
| **RES-W-11** | **`INCREMENTAL_CONCURRENCY = 3` with no inter-request spacer is evidence-backed, not proven.** The engine's 1200ms sleep (`gemini.ts:67`) never fires for a single-element call (`engine.ts:277`), and path E has run at 3 with no spacing since A26 - but `vitest.setup.ts` throws on any real fetch, so no 429 can be produced here. Carries RES-A39A-18 | **repo owner**, on a real run; then the chunk that owns `gemini.ts` | one real run of 40 on the default provider, with the run's status line read | the count of items failing with a provider-throttle message in one run | **more than one throttle failure in a single run**, which is the signal the bound is wrong for this provider | the owner verification pass after wave 4, together with RES-A39A-4's timing run. W4-11 is the in-repo floor and is a PURE-PREDICATE claim, named as one |
| **RES-W-12** | **Whether `TOTAL_BUDGET_MS = 50_000` is generous enough for a real Gemini grading call.** No API key, no network. Two in-repo precedents disagree by 4 seconds (`class-trends-insight/route.ts:47` = 50_000; `ask/route.ts:145` = 54_000) and this plan ruled for the first because it is the file the architecture named as the model. Carries g4 R4 | **repo owner**, live key required | one real timed grading run of at least five submissions, with the per-item elapsed read | elapsed ms for one item's model call against the budget | **an item timing out under the soft budget that would have completed under the 60s hard cap** - the over-eager-guard defect class, applied to time | the owner verification pass after wave 4, together with RES-A39A-4. **Raising the constant above 54_000 requires re-reading `ask/route.ts:59`'s note that 60 is both the cap and the highest value that builds** |
| **RES-W-14** | **Two real presses of the real Start Review button cannot be observed in this checkout.** W4-9 counts two invocations of a `.ts` function through a mocked-React harness; W4-9b asserts in SOURCE TEXT that the `<form>` no longer carries `action={formAction}`. **Neither is a browser.** Nothing renders under vitest, so the end-to-end claim - one press, one run; two fast presses, still one run - has no in-repo instrument, and this plan does not let the two green conditions above be read as one | **repo owner**, in a real browser | press Start Review twice as fast as possible on a run of at least three submissions, then read the resulting run's row count and the model-call count in the provider console if one is available | the number of grading runs started by two fast presses | **two runs started, or one run whose items are graded twice** - the double spend `action={formAction}`'s deletion exists to close, which would be invisible to every gate in 8.4.4 | the owner verification pass after wave 4, in the SAME sitting as W4-7, RES-A39A-4, RES-W-11 and RES-W-12. **One run answers five things; splitting them costs five runs** |
| **RES-W-15** | **`src/lib/grade.ts`'s barrel re-export of `reconcileRun` has no importer in any of the six waves** (10.1). `engine.ts` imports the leaf directly. The line is KEPT on the argument that the barrel is the package's declared surface for 52 importers, not on the argument that something calls it - and that distinction is recorded rather than blurred | **wave 4b's implementer** states the decision in the commit message; the reviewer may overrule it with a one-line deletion | `grep -rnE 'from "(@/lib/grade\|\.\./grade\|\./grade)"' src --include=*.ts --include=*.tsx \| grep -c reconcile`, run after any later chunk | whether anything ever imports `reconcileRun` through the barrel | **no importer through the barrel by the time the next chunk touching `src/lib/grade/` lands** - at which point the line is dead weight and is deleted, not defended | at wave 4b, and re-read by the next chunk whose write set includes `src/lib/grade.ts` |
| **RES-W-16** | **`docs/loop/this-repo.md:27` records the full suite at `Test Files 1017 passed (1017)` / `Tests 20200 passed (20200)` / 63.6s. Measured here at HEAD `e7cabc4`: 1111 / 22454 / 107.40s, EXIT=0** (5.1). The card is stale by +94 files, +2254 tests and +44 seconds. **This plan's write set is `docs/a39-waves.md` only and it does not correct the card** | **whoever next edits `docs/loop/this-repo.md`**, or the loop-card maintenance chunk | `npm test`, with the last 25 lines and `$LASTEXITCODE` written to a file and read from it, never from a pipe | the full suite's file count, test count and duration | **a wave reading 1017 in the card, seeing 1111, and treating the difference as a defect it caused** - or, worse, a wave budgeting 63.6s for a gate that takes 107 | at the next edit of `docs/loop/this-repo.md`. **No wave here waits on it**; 5.1 carries the corrected figures and the rule that the PASS is "zero failed", never a pinned count |
| **RES-W-17** | **`SnapshotGradingPanel.tsx:935`'s transcription field is `multiline` with `minRows={4}` and no `maxRows`**, and it is BELOW the panel's primary action control at `:871`, so it does not satisfy RES-A39A-15's stated direction of failure and W3-5 does not require it to be capped (8.3). It remains an auto-growing field | the chunk that next writes `SnapshotGradingPanel.tsx` after wave 3b | `grep -n "multiline" src/app/components/snapshot-grading/SnapshotGradingPanel.tsx` against `grep -n "maxRows"` on the post-3b tree | that one field's growth bound | **a control moving ABOVE `:935` in a later wave**, which converts it from out-of-scope into the exact defect RES-A39A-15 describes, with no test red - it is a JSX prop's absence, and nothing asserts an absence | re-read by any wave that reorders that panel's JSX tail; **explicitly NOT wave 3b's work**, so that a later pass does not read W3-5's green as covering it |
| **RES-W-13** | **`action-guard-coverage.test.ts` cannot see a Route Handler** (`:123` skips every non-`"use server"` file). `find src/app/api -name "route.ts" \| wc -l` -> **20**, of which 12 call no guard. W4-10 binds the ONE handler this plan adds; nothing binds the rest. Carries RES-A39A-17 | the chunk that next adds a route handler, or a security chunk | a structural test walking `src/app/api/**/route.ts` asserting each exported `POST`/`GET` calls a guard, with a 12-entry allowlist that may only SHRINK - the ratchet shape `action-guard-coverage.test.ts:41-47` already describes for actions | the set of unguarded route handlers | **a thirteenth unguarded route handler**, or any handler that spends a model call with no guard | before or alongside any later chunk that adds a route handler. **NOT inside wave 4c**, which would be hand-rolling a repo-wide ratchet inside a feature wave |

---

## 13. Gates run over this file

```
npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
```

Exit code read from a file rather than a pipe, plus `git status --short`
proving the write set is `docs/a39-waves.md` and nothing else, and the NUL /
ASCII scans:

```
tr -d -c '\000' < docs/a39-waves.md | wc -c
LC_ALL=C grep -c '[^ -~\t]' docs/a39-waves.md
LC_ALL=C grep -c '[^ -~\t]' docs/REGRESSION.md      # canary, must be non-zero
```

Recorded values are in this pass's hand-off.

**This revision's write set is EXACTLY `docs/a39-waves.md`.** It did not open
`docs/a39-waves-check.md`, `docs/a39-waves-rulings.md`, any other `docs/a*.md`,
`docs/backlog.yml`, `docs/BACKLOG.md`, `src/tools/backlog/*` or anything under
`src/` for writing. `docs/css-orphans.md` was already modified at session start,
by another agent, and this pass did not touch it. Proof is the `git status
--short` in the hand-off.

**The full suite was RUN once during this pass** to establish 5.1's baseline
(`npm test`, 1111 / 22454 / EXIT=0). That is a read-only measurement and it is
the only command in this pass that touched anything outside `docs/`.

### 13.1 Instrument defects found and fixed in this revision, as a class

Four commands in revision 1 or in this revision's own first draft returned
nothing, or the wrong thing, for a reason unrelated to the claim they supported.
They are listed together because the class matters more than any one of them:

| The command | What was wrong | Where |
|---|---|---|
| `grep -rn "persists it\|not persisted\|..."` written with a BARE `\|` | no `-E`, no BRE escape: grep searched for a literal pipe and exited 1, so wave 3b's gate PASSED before anything was deleted | 8.3, W3-2 |
| the same bare-pipe bug in W4-6, twice (`:1440` and the 4c gate) | same, and corrected with `-E` the PASS sentence was FALSE against 29 lines in 11 files | 8.4.3, S4 |
| `awk '$1>=703'` | a STRING comparison: `"73-80" > "703"` is true on the third character, so the count was 17 and not the 12 that was pasted | 2.3.1 |
| `[^\n]{0,80}` in an ERE bracket expression - **found in this revision's own first draft** | `\n` inside `[...]` is backslash-and-`n`, so the class excludes the LETTER `n` and the pattern silently missed a line containing "assignment" | 8.3, W3-2's narrow companion |

**The common shape is a command that returns nothing, or the wrong set, for a
reason unrelated to the claim.** Every absence claim in this revision is
therefore paired with a canary that proves **the pattern is valid and the
alternation is being parsed**, not merely that the file was read - which is a
strictly stronger control than revision 1's canaries, three of which would have
fired happily over a broken pattern. Where an alternation is asserted, the canary
exercises **both branches**, because a canary that only ever tests one branch
proves half a pattern.
