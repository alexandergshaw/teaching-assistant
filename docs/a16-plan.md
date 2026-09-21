# A16 wave plan: what is left, cut into waves

Seat: WAVE PLAN. Authored 2026-09-21.

**Tree state at authoring.** `git rev-parse --short HEAD` returns **`1809e71`**
on `main`; `git status --short` returns exactly one path, `M docs/css-orphans.md`
(a walker artifact, section 9.3 - not anybody's live edit). `git worktree list`
shows the stale second worktree at `.claude/worktrees/friendly-meninsky-8032bc`,
detached at `8bc9c64`: **`Glob` returns that copy FIRST**, so every wave gate is
`git status --short` in THIS checkout. I edited only this file.

**Measurement instrument for every line count below**, both tools, because this
repo's two line counters disagree by 42 on one file:

```powershell
@(Get-Content <path>).Count     # PowerShell, the mandated one
```
```bash
wc -l <path>                    # Bash tool, cross-check
```

Every other quantity names its own command inline. Nothing here is recalled.

---

## 0. THE FINDING THAT RESHAPES THIS PLAN: two of the five chunks have shipped

`docs/a16-scope.md` (revision 3, 1499 lines by `@(Get-Content docs/a16-scope.md).Count`)
plans five chunks A16-1..A16-5 and describes A16-1 and A16-2 as work to dispatch
concurrently. **Both landed on 2026-09-20.** Measured:

```bash
git log --oneline 4bd903e..HEAD | grep -i a16
```
```
6ecc226 feat(grading): trends panel reaches every LMS Grading mount (A16-1)
e9670d1 feat(grading-recording): A16-2 - restore rubric areas through the recording grader's data path
```

Confirmed against the tree, not the log:

| Claim | Command | Result |
|---|---|---|
| A16-1's mount exists | `grep -rn "<ClassTrendsPanel" src --include=*.tsx` | `DraftedGradesTab.tsx:627` **and `GradingResults.tsx:593`** - two sites, not one |
| A16-1's adapter exists | `cat src/app/components/grading-results/classTrendsEntry.ts` | `toClassTrendsEntry` and `hasTrendableResults` both exported and both called at `GradingResults.tsx:589,591` |
| A16-2's data fix exists | `grep -n "rubricAreas" src/app/components/grading-recording/grading-feedback-prompt.ts` | returned at `:181`, `[]` on the failure branch at `:213` |
| `GradingRow` carries it | `grep -n "rubricAreas" src/app/components/grading-recording/grading-row.ts` | `:224`, required |

**So `docs/a16-scope.md` sections 6.1, 6.2, 6.3, 6.5, 7 (V1-V28) and 8 (S1-S23)
are HISTORY, not a plan.** They describe work in the tree. This document plans
only what is left: **A16-3, A16-5, and the A16-4 blocker.**

The backlog row (`docs/backlog.yml:352`, located by `grep -n "id: 'A16'" docs/backlog.yml`)
still reads `state: 'unscoped'`, `owns: []`, and its note ends at "round-3 check
in flight". It records neither landing. That is a row reconciliation this plan
does not own; it is RES-P-1.

---

## 1. The shape, decided and now PROVEN by landed code

The brief asks which shape the plan takes: a new sub-tab strip entry, or a panel
WITHIN each existing grading tool.

**A panel within each grading tool. No new strip entry. The strip's hardcoded
counts do not move, and that is measured on both sides.**

```bash
grep -n "toHaveLength(12)\|toHaveLength(11)\|panelTargets.size" src/app/components/recording/recording-split.structure.test.ts
```
```
132:      expect(entries).toHaveLength(12);
187:      expect(matches).toHaveLength(11);
219:      expect(panelTargets.size).toBe(11);
```
```bash
grep -c 'role="tabpanel"' src/app/components/RecordingTab.tsx     # 11, agreeing with :187
grep -c "grading-recording" src/app/components/recording/recording-split.structure.test.ts   # 0
```

That last zero is the load-bearing one. `recording-split.structure.test.ts` reads
`RecordingTab.tsx` and `TabShell.tsx` by name and `readdirSync`s
`src/app/components/recording/` **non-recursively**
(`grep -n "readdirSync\|readFileSync" src/app/components/recording/recording-split.structure.test.ts`
returns `:48`, `:57`, `:70`, `:74-75`, `:86-87`, `:107-108`, `:145-146`, `:169-170`,
`:265`, `:268`, `:272`, `:279`). It **cannot see `src/app/components/grading-recording/`**,
which is where every remaining A16 edit to a recording surface lands.

Canary on that zero, because an identifier-shaped zero looks exactly like a real
absence: `grep -c "RecordingTab" src/app/components/recording/recording-split.structure.test.ts`
returns a non-zero count on the same file with the same instrument, so the tool
fires. Never `grep -P` here; it exits 0 without checking.

**Two independent reasons the shape is right, in the order that matters.**

1. A thirteenth strip entry IS a destination, and "stop it being a destination"
   is literally what the owner asked for. The counts are the second reason, not
   the first.
2. A16-1 already shipped this shape on four surfaces and the whole suite is
   green on it, so the shape is no longer a prediction.

**What the shape does NOT buy.** It does not make the strip test irrelevant to
A16 forever - it makes it irrelevant to *these waves*. Any future A16-adjacent
work that adds a `role="tabpanel"` to `RecordingTab.tsx` puts `:132`, `:187` and
`:219` in its write set, and this repo's own card records that `:219` passes
**falsely** (the key array at `:203-216` is the test's own hardcoded list, not
read from source). No wave below touches it.

---

## 2. What is left, and what each wave exports and who calls it

| # | Wave | What it does | Exports | Caller of those exports, IN THE SAME WAVE | Independently gateable? |
|---|---|---|---|---|---|
| **0** | Baseline | `docs/REGRESSION.md` entry 433: the pre-A16-3 behaviour of the recording grading surface, plus the A16-1/A16-2 behaviour that shipped with no baseline at all | nothing | n/a | **Yes** - docs only |
| **1** | A16-3a, panel headroom | Pure-assembly extraction out of `GradingRecordingPanel.tsx` so wave 2's additions fit under 1000. No behaviour change | one or more pure functions in an existing or new `grading-recording/` leaf | `GradingRecordingPanel.tsx`, edited in this wave to call them | **Yes** - gate is a line count plus an unchanged suite |
| **2** | A16-3b, the run cohort and the mount | `lastRunCohort` snapshot set once inside `handleGradeAll`; the adapter leaf; the cohort disclosure line; the gated `<ClassTrendsPanel>` mount | `toRunCohortEntry`, `hasTrendableCohort`, `cohortLabelSpread` (names are the implementer's; the *set* is fixed) in a new `grading-recording/` leaf | `GradingRecordingPanel.tsx`, edited in this wave | **Yes** |
| **3** | A16-5, Repo Grades | Per-folder adapter and mount in Repo Grades | a folder-entry adapter leaf | `src/app/components/repo-grades/index.tsx` or `RepoGradesGrid.tsx`, whichever holds the folder column, edited in this wave | **Yes** |
| - | **A16-4, snapshot grading** | **NOT A WAVE. Blocked, routed out - section 6.** | - | - | **No, and no wave below pretends otherwise** |

**The caller rule, stated per wave rather than assumed.** Every wave above adds
its caller in its own file list. There is no type-only module in this plan, so
`seats.md`'s single legal exception is not invoked and must not be invoked by an
implementer to justify a wave without a caller. Wave 1 is the one to watch: an
extraction that moves code into a leaf and forgets to call it from the panel is a
green gate over dead code, which is why wave 1's gate includes the panel's own
line count *dropping* rather than a leaf merely existing.

---

## 3. Write sets, derived

### 3.1 The derivation commands, with canaries

```bash
cd /c/Users/alexa/OneDrive/Documents/Projects/teaching-assistant

# Every file naming the panel by path (wave 1 and wave 2's root instrument)
grep -rln "GradingRecordingPanel.tsx" src --include=*.ts --include=*.tsx | sort | wc -l
# -> 54   (docs/a16-scope.md section 6.4 recorded 51; A8-R added three files since)

# canary that the instrument HITS
grep -c "GradingRecordingPanel.tsx" src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts   # non-zero
# canary that the instrument can MISS
grep -c "GradingRecordingPanel.tsx" src/lib/no-emojis.test.ts                                                   # 0
```

**The panel itself is not among the 54.** `grep -n "GradingRecordingPanel.tsx"
src/app/components/grading-recording/GradingRecordingPanel.tsx` returns nothing -
the file does not contain its own name. It is in the write set because it is the
file the waves edit, not because this command found it. Stated so the figure and
the command agree.

Of the 54, the subset that **asserts** - reads the panel as source text, or
hardcodes its path in a list - was separated by opening every hit, not by a
second grep:

| Path | How it reaches the panel |
|---|---|
| `grading-recording/GradingRecordingPanel.wiring.test.ts` | `PANEL_PATH` at `:35` |
| `grading-recording/GradingRecordingPanel.assessment.test.ts` | `PANEL_PATH` at `:37` |
| `grading-recording/GradingAssessmentDeclarationControls.test.ts` | `PANEL_PATH` at `:242` |
| `grading-recording/markLate.wiring.test.ts` | `read("GradingRecordingPanel.tsx")` at `:33`; pair list at `:104` |
| `grading-recording/submission-kind-callsites.structure.test.ts` | path list at `:72`, **negative** assertion at `:124`. **NEW since the scope doc** - landed with A8-R |
| `recording/AddKnowledgePages.test.ts` | `GRADING_PANEL_PATH` at `:237`; asserts JSX gate ORDER |
| `recording/runLogRow.test.ts` | `RUN_BEARING_PANELS` at `:16`; counts `<RunLogRow` per panel |
| `ui/buttonVariant.test.ts` | `FROZEN_PRIMARY_SITES` at `:157` pins this panel at **3** primary buttons |

Prose-only, excluded, each opened: `grading-rows.test.ts` (`:601`, `:621`),
`module-deck-capture/ModuleDeckCapturePanel.wiring.test.ts` (`:215`),
`recording/discussion-knowledge-context.test.ts` (`:81`),
`snapshot-grading/snapshot-autofire.structure.test.ts` (`:28`, `:246`).

**Two directory walkers a by-name grep cannot find, and both collect a NEW FILE
added to `grading-recording/` automatically** - which both waves do:

```bash
grep -n "readdirSync" src/app/components/grading-recording/grading-rows.test.ts
# :642 (grading-recording/), :643 (assessment-shared/)
grep -n "readdirSync" src/app/components/grading-recording/submission-kind-callsites.structure.test.ts
# :42
```

- `grading-rows.test.ts:641-671` scans both directories for the exact set of
  `ta-rec-grade-*` keys. **Checked-safe, conditionally:** neither wave adds a
  persisted key (section 5's ruling), so the set at `:668-676` does not move. It
  is in the write set anyway, because it walks the directory the new leaf lands
  in and a single `ta-rec-grade-` literal in that leaf turns it red.
- `submission-kind-callsites.structure.test.ts:42` walks the same directory and
  asserts SET_A/SET_B membership (`:66-67`). **Checked-safe:** the cohort
  snapshot carries no submission-kind field. In the set for the same reason.

### 3.2 Wave 0 - baseline

```
docs/REGRESSION.md
```

Next entry number, measured rather than inferred (`grep -ac "^## "` does not
agree with the numbering in this file and must not be used for it):

```bash
grep -an "^## " docs/REGRESSION.md | tail -1
# 44203:## 432. Snapshot grading fills the Strengths box, and says so when it cannot (A11)
```

**Next entry is 433.** `@(Get-Content docs/REGRESSION.md).Count` returns 44259.
Use `grep -a` on this file as the standing default.

`grep -an "class-trends" docs/REGRESSION.md | wc -l` returns hits; `grep -an
"class trends"` (unhyphenated) returns 0 - use the hyphenated form, the
unhyphenated one is an instrument that matches nothing.

### 3.3 Wave 1 - A16-3a, panel headroom

```
src/app/components/grading-recording/GradingRecordingPanel.tsx
src/app/components/grading-recording/<extraction destination leaf>.ts       [name decided by the implementer]
src/app/components/grading-recording/<extraction destination leaf>.test.ts
src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts
src/app/components/grading-recording/GradingRecordingPanel.assessment.test.ts
src/app/components/grading-recording/GradingAssessmentDeclarationControls.test.ts
src/app/components/grading-recording/markLate.wiring.test.ts
src/app/components/grading-recording/submission-kind-callsites.structure.test.ts
src/app/components/grading-recording/grading-rows.test.ts
src/app/components/recording/AddKnowledgePages.test.ts
src/app/components/recording/runLogRow.test.ts
src/app/components/ui/buttonVariant.test.ts
src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts      [comment re-pin only - section 7]
src/file-size-ceiling.structure.test.ts
src/source-bytes.structure.test.ts
src/lib/no-emojis.test.ts
```

Most of these are files the wave must RUN and may have to adjust, not files it
intends to rewrite. They are in the set because `parallel-disjointness.md`
section 2 defines a file set as edits **plus the tests asserting on the behaviour
being changed**, and a source-text test that reads the panel is asserting on
exactly what an extraction moves.

### 3.4 Wave 2 - A16-3b, the run cohort and the mount

Everything in 3.3 except the extraction leaf, plus:

```
src/app/components/grading-recording/classTrendsRunCohort.ts        [NEW - adapter + predicates]
src/app/components/grading-recording/classTrendsRunCohort.test.ts   [NEW - unit]
src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts
```

That last one is not optional and the reason is specific. Its canary-3 roots
array is at **`:213-223`** (`grep -n "const roots = \[" ...` returns `213`; the
closing `];` is at `223`), currently five entries, the fifth being
`app/components/grading-results/classTrendsEntry.ts` which A16-1 added. Wave 2's
adapter leaf is built in render and handed straight to the panel, never written
anywhere, so it must be a **sixth** root or that claim is conventional rather
than checked.

**And the `it()` TITLE at `:209-210` enumerates the roots by name.** Adding a
root without editing the title ships a test whose own description is false.
`{ timeout: 30000 }` at `:211` is the precedent for the timeout any new
import-graph walk must set.

### 3.5 Wave 3 - A16-5, Repo Grades

```
src/app/components/repo-grades/index.tsx
src/app/components/repo-grades/RepoGradesGrid.tsx
src/app/components/repo-grades/classTrendsFolderEntry.ts        [NEW]
src/app/components/repo-grades/classTrendsFolderEntry.test.ts   [NEW]
src/app/components/repo-grades/repoGrades.wiring.test.ts
src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts
src/app/components/ui/modalAdoption.wiring.test.ts
src/app/components/ui/buttonVariant.test.ts
src/file-size-ceiling.structure.test.ts
src/source-bytes.structure.test.ts
src/lib/no-emojis.test.ts
```

Derivation, with canary:

```bash
grep -rln "repo-grades/" src --include=*.ts --include=*.tsx | sort | wc -l   # 27
grep -rn "rubricAreas" src/app/components/repo-grades/ | head
# RepoGradeCellControl.tsx:292,:362,:416,:418 ; repoGradesCellEdits.ts:28 ; repoGradesCellEdits.test.ts:234,:243
```

**This list is a FLOOR and is the least-derived of the three**, because wave 3
has not been scoped and I did not open all 27. Wave 3 is dispatched only after
its own scoping pass re-derives it. Stated as a floor rather than presented as a
set - RES-P-5.

---

## 4. Disjointness, computed in both senses

### 4.1 Exact path

Lists written to the scratchpad and intersected mechanically.

```bash
cat w1.txt w2.txt | sort | uniq -d        # wave 2 (A16-3b) x wave 3 (A16-5)
```
```
src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts
src/app/components/ui/buttonVariant.test.ts
src/app/components/ui/modalAdoption.wiring.test.ts
src/file-size-ceiling.structure.test.ts
src/lib/no-emojis.test.ts
src/source-bytes.structure.test.ts
```

**Six shared paths. NOT EMPTY. Empty is the only pass, so waves 2 and 3 may NOT
run concurrently.** The one that is a genuine write collision rather than a
shared gate is `classTrendsDraft.not-postable.test.ts`: both waves append a root
to the array at `:213-223` and both must edit the title at `:209-210`. Two agents
appending to one array in one file is precisely the failure
`parallel-disjointness.md` section 1 case 1 names - it does not surface as a
conflict, it surfaces later as a root that is quietly not in the list.

```bash
cat w1.txt a18.txt | sort | uniq -d       # A16 waves x A18 (the other live row)
```
```
(empty)
```

Instrument canary, because an empty result from a broken instrument is
indistinguishable from a real pass:

```bash
cat w1.txt w1.txt | sort | uniq -d | wc -l    # 19 - every path in w1.txt
```

It prints all 19, so the intersection instrument fires. The empty A18 result
means what it says.

A18's own write set was read from `docs/a18-scope.md` section 3's owns table
(`:412-419`): `walkthrough-announcement/WalkthroughAnnouncementPanel.tsx`,
`walkthrough-announcement/AnnouncementCourseFieldset.tsx`,
`walkthrough-announcement/walkthrough-announcement.structure.test.ts`,
`RecordingTab.tsx`, and the new `recording/recording-tab-header.structure.test.ts`.
It lists `classTrendsDraft.not-postable.test.ts` as **read-only, no edit**, and
its citation there is `:185-195` (canary 2a), which is ABOVE the roots array at
`:213-223` - so wave 2's append shifts nothing A18 reads.

**Re-run all three intersections immediately before each dispatch.**
`parallel-disjointness.md` section 6 names "treating we checked disjointness once
as durable" as a failure mode, and this plan is itself an instance of the cost:
the artifact it builds on was computed at `4bd903e` and every number in it had
moved by `1809e71`.

### 4.2 Informational independence

Computed from each side's STATED write set, not from any intermediate.

| Pair | Does either establish a fact the other designs against? | Verdict |
|---|---|---|
| Wave 1 x wave 2 | **Yes, totally.** Wave 2's entire line budget is the number wave 1 produces. | SEQUENCE. Wave 1 first. |
| Wave 2 x wave 3 | **Yes.** Both extend the canary-3 root list, and wave 2 fixes the shape of the `GradingRunEntry` adapter that wave 3 copies. | SEQUENCE. Wave 2 first. |
| Wave 0 x wave 1 | Wave 0 records the behaviour wave 1 must not change. A baseline written *after* the change is not a baseline. | SEQUENCE. Wave 0 first. |
| A16 waves x A18 | A18 changes copy in `walkthrough-announcement/` and the shared `TabShell` header in `RecordingTab.tsx`. No A16 wave reads either; no A18 edit reads the panel or the trends panel. | **INDEPENDENT in both senses. May run concurrently with any A16 wave.** |
| A16 waves x A8-R | A8-R is fully landed (section 9.1). No live coupling. | Discharged by measurement. |
| Wave 2 x **N13b** | N13b redefines `AreaTrend` to carry per-student attribution (`docs/backlog.yml` N13b note, part (b): "AreaTrend (class-trends.ts:124-150) carries percentValues as an ANONYMOUS number[]"). Wave 2 would be designing its cohort against a shape N13b is chartered to change. | **SEQUENCE. A16 first.** Section 8. |

**The standing consent applies where it applies.** A18 and any A16 wave are
disjoint in both senses and should run in the same turn rather than in sequence -
idle sequencing costs the queue and the owner's rule grants this without asking.
Cap remains 2-3; one A16 wave plus A18 is 2.

---

## 5. The line budget, and why wave 1 exists at all

This is the single number the scope doc got most wrong, and it changes the plan.

**`docs/a16-scope.md` section 4.6 calls A16-3's line budget "a HARD BLOCKER" on
the grounds that `GradingRecordingPanel.tsx` is 995 with 5 lines free.** Measured
today, both tools agreeing:

```powershell
@(Get-Content src/app/components/grading-recording/GradingRecordingPanel.tsx).Count   # 966
```
```bash
wc -l src/app/components/grading-recording/GradingRecordingPanel.tsx                  # 966
```

**966, not 995. Thirty-four lines free, not five.** A8-R's wave 0 (`58a4254`)
extracted the log-download assembly and three run-log builders and left it at
963; `db747cc` added 3. The "5 lines of headroom" framing is stale by 29 lines.

`LIMIT = 1000` at `src/file-size-ceiling.structure.test.ts:30`, compared with
`lineCount > limit` at `:129`, so exactly 1000 passes. `ALLOWED_OVERAGE` is at
**`:64`** to its closing `};` (`grep -n "ALLOWED_OVERAGE\|LIMIT = "` returns
`30`, `64`, `126`) and contains none of these files. This confirms the scope
doc's section 9 correction 13 and refuses the round-2 checker's `:68-85`, which
this plan therefore does not "fix" back.

**A8-R's reservation on that headroom is discharged.** `docs/a8r-scope.md`
section 7 reserved 15 lines of additions plus a 20-line margin, the margin
justified by "A8-P is sequenced immediately behind this chunk". Measured: A8-R's
15 lines already landed (`git show db747cc -- src/app/components/grading-recording/GradingRecordingPanel.tsx`
shows `+submissionKind: r.submissionKind` at the grade map and
`+onConfirmSubmissionKind` / `+onAcceptSuggestedKinds` at the `<GradingTable>`
call), and A8-P is **not** this file - `docs/a8r-scope.md:184,:226` name it as
`src/app/actions/grading.ts:871` `gradeSubmissions`, the zip-upload path. The 34
lines are A16-3's.

**Wave 2's additions, derived rather than estimated**, at the edit points
re-measured today (`grep -n "handleGradeAll\|const submissions\|<GradingTable\|assessmentId ="
src/app/components/grading-recording/GradingRecordingPanel.tsx`):

| Addition | Where, today | Lines |
|---|---|---|
| `import ClassTrendsPanel` | top | 1 |
| `import { adapter, predicates }` from the new leaf | top | 1 |
| `import type { GradingRunCohort }` | top | 1 |
| `const [lastRunCohort, setLastRunCohort] = useState<...>(null)` | beside `logGradingRuns` at `:199` | 1 |
| Collect the cohort rows in the apply loop and set the snapshot once | inside `handleGradeAll`, loop at `:578-584`, `submissions` built at `:551-556` | 5-8 |
| The hinge comment on WHY the cohort is the run and not `assessmentLabel`, `assessmentId` or `gradingRows.rawRows` | same place | 10-14 |
| The gated mount plus the cohort disclosure line | above `<GradingTable>` at `:938` | 8-12 |
| The hinge comment at the mount | same | 6-8 |
| **Total** | | **33-46** |

The comment allowance is not invented: `grep -c "^\s*\(//\|/\*\|\*\|{/\*\)"
src/app/components/grading-recording/GradingRecordingPanel.tsx` returns **298**
against 966 lines - this file is 31 percent comment - and a hinge comment in this
directory runs 6 to 14 lines.

**33-46 against 34 free is a coin flip that loses at the high end.** That is the
whole argument for wave 1 existing as its own gated wave rather than as a
paragraph in wave 2's brief: it turns the budget into a measured pass condition
instead of a hope. It is also exactly the pattern A8-R already ran successfully
on this same file.

**Wave 1's target: `<= 945` by BOTH tools.** Derived: 1000 - 46 (high-end
additions) - 9 (margin) = 945. That is at least **21 lines removed**, which is
sized against wave 2's additions, not against the wall.

**Two constraints on HOW wave 1 extracts, and both are measured facts, not
preferences.**

- **Move pure assembly. Do not move a hook.** `docs/loop/this-repo.md` section 1
  records that extracting a hook out of the sibling `SnapshotGradingPanel.tsx`
  failed `npm run lint` on React Compiler's `preserve-manual-memoization` naming
  a callback nobody touched, while tsc and the full suite stayed green. The rule
  reacts to the component's hook count and shape. A8-R's wave 0 obeyed this and
  passed. Whether it generalises to this panel is unverified - RES-P-4.
- **`ui/buttonVariant.test.ts:157` pins this panel at exactly 3 primary buttons.**
  An extraction that moves a Button into a new `.tsx` moves that number and adds
  a `FROZEN_PRIMARY_SITES` entry. If wave 1 extracts into a `.ts` leaf (pure
  assembly, no JSX) the number does not move. Prefer the `.ts` leaf; if a `.tsx`
  is unavoidable, `ui/modalAdoption.wiring.test.ts`'s `DIALOG_SITES` walk over
  all `.tsx` files moves too, and both counts are bumped **in the same commit**.

Other files any wave writes, all measured today with `@(Get-Content).Count`,
none within 200 lines of the ceiling:

| File | Lines | Free |
|---|---|---|
| `grading-recording/GradingRecordingPanel.tsx` | **966** | 34 |
| `grading-recording/grading-rows.test.ts` | 722 | 278 |
| `grading-recording/GradingRecordingPanel.wiring.test.ts` | measure at dispatch | - |
| `drafted-grades/classTrendsDraft.not-postable.test.ts` | 232 | 768 |
| `repo-grades/index.tsx` | 913 | **87** |
| `repo-grades/RepoGradesGrid.tsx` | 643 | 357 |
| `ui/buttonVariant.test.ts` | measure at dispatch | - |
| `GradingResults.tsx` (not written by any wave) | 892 | 108 |

`repo-grades/index.tsx` at 913 is wave 3's own squeeze point and its scoping pass
inherits the same extract-before-adding rule.

---

## 6. A16-4, snapshot grading: not a wave, and why saying so is the point

`docs/a16-scope.md` section 2.3 rules that snapshot grading has no run boundary
and must not get a panel until one exists. **Re-measured today, still true:**

```bash
grep -n "assessmentId\|courseScope\|assessmentLabel" src/app/components/snapshot-grading/SnapshotGradingPanel.tsx
# (no output)
grep -c "assessment\|course" src/app/components/snapshot-grading/SnapshotGradingPanel.tsx
# 8   - all "assessment" as a synonym for "a graded row", plus assessment-shared imports
```

Both halves of the rule hold: there is no course field, no assessment field, and
`useSnapshotGrade.ts` upserts ONE row per grade, so there is no `handleGradeAll`
to be the boundary. Every candidate delimiter is an invention.

**Mounting a panel here would ship the cross-assignment mixing owner answer 1 put
out of scope, and it would ship green**, because nothing renders and no test
would see it. So A16-4 is not planned as a wave. Its first requirement is a
boundary design, not a mount, and that is a scoping item routed to the owner's
queue - RES-P-3, with an owner, an instrument and a step.

This is the "say so rather than letting the gate imply otherwise" case, stated
explicitly so nobody reads four green waves as A16 being finished.

---

## 7. The line-shift obligation this plan creates, priced

Wave 2 inserts 3 import lines at the top of `GradingRecordingPanel.tsx` and one
`useState` near `:199`. **Everything below line 199 shifts by +4.** Wave 1's
extraction shifts by a larger, negative, implementer-determined delta.

Artifacts that pin line numbers in that file:

| Artifact | Citation | State today | Owner of the re-pin |
|---|---|---|---|
| `snapshot-grading/snapshot-autofire.structure.test.ts:28` and `:246` | `GradingRecordingPanel.tsx:506-518` | **Currently ACCURATE** - `sed -n '493,518p'` shows the auto-drain `useEffect(` opening at `:507`. Wave 2's +4 makes it stale. | **Wave 2's implementer, in the same commit.** The file is in wave 1's and wave 2's write sets for this reason alone; it is a comment, not an assertion, so it never goes red and will be missed unless named. |
| `module-deck-capture/ModuleDeckCapturePanel.wiring.test.ts:215` | `GradingRecordingPanel.tsx:493-510` as "the run log control sits immediately under the header" | **ALREADY STALE at HEAD.** `:493-510` is the auto-drain effect's comment block, not a run-log control. A8-R's wave 0 moved it. | Not wave 2's to fix - it is wrong before wave 2 touches anything, and adding the file to a write set to correct a comment buys no gate. **RES-P-2**, with owner and step. |
| `docs/a16-scope.md` sections 2.2, 4.6, 6.4, 7 (V29-V34), 8 | `:537`, `:561-565`, `:598-603`, `:797-806`, `:969` | **ALL STALE.** Measured today: `handleGradeAll` is `:538` (+1), `const submissions` is `:551` (-10), the freeSolo Autocomplete is `:767` with `onInputChange` at `:770` (-30), `<GradingTable` is `:938` (-31). | **This plan.** Section 5's table re-pins every edit point wave 2 needs. An implementer handed the scope doc's `:969` edits the wrong place. |
| `docs/backlog.yml:352` A16 note | the same numbers, plus "revision 3 ... round-3 check in flight" | Stale, and additionally does not record that A16-1 and A16-2 landed. | **RES-P-1.** |

**The rule this enforces.** Every wave brief cites the panel BY SYMBOL -
`handleGradeAll`, `const submissions`, the `<GradingTable>` call, the assessment
`Autocomplete` - and never by line. This repo has already paid for the other way:
`docs/a16-scope.md` section 9 correction 9 records an implementer told to delete
`grading-submission-grade.test.ts:118` deleting the `feedback` assertion instead
of the `rubricAreas` one, with the suite staying green.

---

## 8. Sequencing against N13a and N13b

**N13a is independent and may run in any wave slot, including concurrently.**
Its owed work (`docs/backlog.yml:139`) is removing
`DEFAULT_CLASS_TRENDS_DRAFT_FLOOR = 5` at `class-trends-draft.ts:18`, its
enforcement at `:154`, and correcting the stale comment at `:86-88`. No A16 wave
writes `src/lib/grade/class-trends-draft.ts` - A16 is placement and disclosure,
never computation. Exact-path intersection with every wave list above: empty.

Informational check, because file-disjoint is not enough: removing the floor
makes layer C compose below 5 graded submissions, which changes what the
instructor sees on a *small* run - including the new mounts. That is a fact N13a
establishes and wave 2 does not design against (wave 2's gate is
`hasTrendableResults`, not the draft floor). **Independent in both senses.**

**N13b MUST FOLLOW A16, and this plan does not merely restate that - it holds
after re-measurement.**

```bash
cat w1.txt n13b.txt | sort | uniq -d
```
The scope doc computed four shared paths at `4bd903e`
(`ClassTrendsPanel.tsx`, `classTrends.wiring.test.ts`,
`classTrendsDraft.wiring.test.ts`, `classTrendsDraft.not-postable.test.ts`).
Only the last of those is in any remaining wave's set - A16-1 already landed the
other three. **So the exact-path coupling has SHRUNK to one path.** The facts
test is what still forces the order:

- N13b's part (b) redefines `AreaTrend` to carry per-student attribution
  (`class-trends.ts:124-150`, `percentValues` an anonymous `number[]` today).
- N13b's threshold changes what counts as a signal: the owner's rule is three or
  more students who MISSED POINTS - any deduction - not the shipped
  `LOW_PERCENT_THRESHOLD` rule.
- Wave 2's cohort line and wave 3's per-folder adapter both design against what
  the panel reports. Building them while N13b is concurrently redefining it is
  case 2 of `parallel-disjointness.md` section 1: individually coherent, mutually
  incompatible, invisible until integration.

**And the coupling is now BENIGN rather than blocking, which is a claim this plan
can make because the code landed.** `classTrendsEntry.ts`'s
`toClassTrendsEntry(run, meta)` returns `{ ...meta, run }` - `run` by reference,
verified by reading the file - so N13b enriches all four LMS mounts with no
placement work. Wave 2's adapter must hold the same property for the recording
surface: it CONSTRUCTS results from rows, so it must emit
`student: row.studentName` and no `userId` key. That is what keeps N13b's
enrichment reaching the recording mount too, and it is a requirement on wave 2,
not a note.

**Recommended order:** N13a concurrent with anything; waves 0 -> 1 -> 2 -> 3;
N13b after wave 3 (or after wave 2, if wave 3 slips - N13b and wave 3 share
`classTrendsDraft.not-postable.test.ts` and must themselves be sequenced).

---

## 9. The gate for each wave

### 9.0 The standing gate, every wave

```powershell
git status --short          # in THIS checkout, diffed against the wave's file list
```

Pass: every path printed is in the wave's list, and **no path is under
`.claude/worktrees/`**. A report is not evidence - `Glob` returns the worktree
copy of a path first, and this repo has had an agent edit the copy, pass every
gate, and change nothing real.

Forbidden in every brief, by name: **`git add -A`** (one swept an implementer's
unverified mid-flight work onto main here) and **`git stash`** (one reverted
every sibling's files here). Stage explicit paths.

**`npx tsc --noEmit` has exactly ONE caller** - the wave gate, run once, after
the wave reports and while nothing is mid-sabotage. It races on
`tsconfig.tsbuildinfo` (`tsconfig.json` sets `"incremental": true`; the file is
gitignored at `.gitignore:41`). No implementer runs it. **No private worktree
either**: junctioning `node_modules` into a throwaway worktree empties the real
one in this checkout.

**No two agents sabotage-verify at once.** During a sabotage window every
concurrent measurement by a sibling is untrustworthy even with a perfect restore.
Restore from a `cp` backup, never `git checkout --`, which reverts an
uncommitted file to the index and destroys the wave's work.

### 9.1 Wave 0 - baseline

| Instrument | Pass |
|---|---|
| `grep -an "^## " docs/REGRESSION.md \| tail -1` before and after | before names 432, after names **433** |
| `npx vitest run src/lib/no-emojis.test.ts` | green - the emoji rule covers `docs/` and this wave writes prose. Never hand-roll the scan; `grep -P` reports clean here without checking |
| `npx vitest run src/source-bytes.structure.test.ts` | green - `Write`/`Edit` materialise a `\uXXXX` escape as the literal byte |
| `git status --short` | `docs/REGRESSION.md` only |

### 9.2 Wave 1 - A16-3a, panel headroom

| Instrument | Pass |
|---|---|
| `@(Get-Content src/app/components/grading-recording/GradingRecordingPanel.tsx).Count` **and** `wc -l` on the same file | both return **<= 945**, and both return the SAME number. A disagreement means one tool is wrong and the count is not a fact yet |
| `npx vitest run src/file-size-ceiling.structure.test.ts` | green |
| `npx vitest run src/app/components/ui/buttonVariant.test.ts` | green **without** editing `FROZEN_PRIMARY_SITES:157`. If it must be edited, the count is bumped in the same commit with the reason |
| `npx vitest run src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts` | green. One path per invocation - a multi-path vitest run silently drops a path that matches nothing and exits 0 |
| the same, one call each, for `GradingRecordingPanel.assessment.test.ts`, `GradingAssessmentDeclarationControls.test.ts`, `markLate.wiring.test.ts`, `submission-kind-callsites.structure.test.ts`, `grading-rows.test.ts`, `recording/AddKnowledgePages.test.ts`, `recording/runLogRow.test.ts` | green. `AddKnowledgePages.test.ts` asserts JSX gate ORDER in the panel and is the one an extraction is most likely to move |
| `npm run lint` | **exactly 4 warnings** - `RecordingTab.tsx:347`, `repoGradesSliceA.guards.test.ts:83`, two in `canvas-modules/new-quiz.test.ts`. A fifth is this wave's regression, most likely `preserve-manual-memoization` |
| `npm test` | exit 0, and `Test Files` / `Tests` totals **not below the baseline measured on the pre-change tree in this same wave**. Do not carry `this-repo.md`'s 1017/20200 (2026-09-13) or A8-R's 1076/21444 - measure it |
| `npx tsc --noEmit` (wave gate only) | **no output at all**, exit 0 |
| `npm run build` | the line `Compiled successfully` is present. **Do not gate on the exit code** - it exits 1 in the env-dependent prerender tail and the page named varies between runs |

**What a pass does NOT prove:** that the panel still renders. Nothing renders.
Wave 1 is a refactor whose only user-visible risk is invisible here.

### 9.3 Wave 2 - A16-3b, the cohort and the mount

Everything in 9.2, plus:

| Instrument | Pass |
|---|---|
| `npx vitest run src/app/components/grading-recording/classTrendsRunCohort.test.ts` | the adapter's per-row mapping over an **enumerated product** of the four `AssessmentRowState` members (`"pending" \| "grading" \| "ready" \| "failed"`, four not three) x {areas, no areas}. Never a hand-written list of five cases |
| same file | `Object.keys(emitted)` does not contain `userId`, and `JSON.stringify(emitted)` does not contain `"userId"`. `GradedResult.userId` is optional, so `tsc` permits an adapter that emits it - this is the only runtime enforcer |
| same file | `computeClassTrends(adapter(cohort)).totalResults` equals the count of `"ready"` rows. An inflated N reaches `buildAreaSummary` and a sentence addressed to STUDENTS |
| same file | the cohort line reports "more than one label" when the snapshot rows carry two distinct `assessment` values, counting `undefined` as one |
| `npx vitest run src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts` | a source-text assertion that the cohort setter's expression mentions none of `assessmentLabel`, `assessmentId`, `filterText`, `sort`, `gradingRows.rows`. **Pin the fact and the ordering, never the spelling** |
| same file | a source-text assertion, **scoped to the new adapter/mount call expression only, never the whole file**, that it reads the snapshot and not a live array. A whole-file form of this detector is RED at HEAD before any wave-2 code exists - `grep -n "gradingRows\.\(rawRows\|rows\)" src/app/components/grading-recording/GradingRecordingPanel.tsx` returns pre-existing legitimate hits - so an implementer who writes the file-wide form will find it red and loosen it rather than fix it |
| same file | the panel imports AND renders `<ClassTrendsPanel` above `<GradingTable>`. **Detector plus canary**: prove the detector returns false on a dead import and on a local reimplementation, in the shape `gradingResultsExtraction.wiring.test.ts` already uses four times |
| `npx vitest run src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts` | green with the adapter leaf as a SIXTH root at `:213-223` **and the `it()` title at `:209-210` updated to name it**. Set an explicit `{ timeout: 30000 }` on any new walk, per `:211` |
| `npx vitest run src/app/components/grading-recording/grading-rows.test.ts` | green. The `ta-rec-grade-*` exact set at `:668-676` must be UNCHANGED - wave 2 adds no persisted key |

**Sabotages that must be watched failing and restored**, minimum set:

| # | Mutation, IMPLEMENTATION only | Goes red in |
|---|---|---|
| P1 | Delete the `<ClassTrendsPanel .../>` tag from the panel | the mount assertion. This is also the leverage removal test |
| P2 | Keep the mount, remove the trendable-cohort guard | the guard assertion. Without it the panel renders a Button reading `Trends (0)` |
| P3 | Derive the cohort from `assessmentId` instead of the run | the dependency-set assertion. This is the mutation owner answer 3 exists to forbid |
| P4 | Resolve the cohort against `gradingRows.rawRows` by id at render time | the narrow snapshot assertion. This is the one that proves the detector is narrow enough to discriminate, since the file-wide form is red at HEAD anyway |
| P5 | Emit every cohort row as a `GradedResult` regardless of state | the `totalResults` assertion |
| P6 | Add `import { postCanvasGradesAction }` to the adapter leaf | the canary-3 walk. Without this, the root addition is an assertion about code nobody proved is load-bearing |

Procedure per row: run and record PASS with exact `Test Files` / `Tests` counts;
mutate; re-run and record FAIL and which assertion fired; restore from the `cp`
backup; re-run and record PASS with the **same** counts. A differing step-5 count
means the restore was not clean. **Pipe vitest output through `tr -d '\000'` or
use `grep -a` before grepping it** - vitest output carries NUL bytes and a plain
`grep` prints "Binary file matches", so a failing run reads as a silent pass.

### 9.4 Wave 3 - A16-5

Not specified here beyond 9.0 and the structural gates. Wave 3 gets its own
scoping pass first, for the reason section 3.5 gives: its write set is the least
derived of the three and `repo-grades/index.tsx` at 913 lines carries the same
extract-before-adding debt.

### 9.5 What no gate above can check, stated plainly

**No component is rendered by any test in this repo.** vitest is `environment:
"node"` and collects only `src/**/*.test.ts` - `.test.tsx` is not collected,
there is no jsdom, no testing-library, no render call. Therefore:

- That the panel APPEARS beside the run is a reading claim.
- That `defaultExpanded` actually opens it is a reading claim.
- That the cohort disclosure line is legible, or is read as disclosure rather
  than as an error, is a reading claim.
- That the panel VANISHES after a reload rather than disclosing why (the cohort
  is `useState`) is a reading claim - and it is the one most likely to be read as
  a bug by the instructor.

**There is no `.env` and no API key**, so layer B - the insight route at
`src/app/api/class-trends-insight/route.ts` - cannot be exercised end to end.
`vitest.setup.ts` replaces `fetch` with a throwing stub. On any LLM path mock
`callLlm`; on a Canvas path mock `canvasFetch`, not `fetch` - a live 401 once
made a sabotage check pass for the wrong reason.

Each of these routes to owner verification in section 10, with an owner, an
instrument and a step. None is left as an implied assumption.

---

## 10. Residual register

Every entry names an owner, an instrument, and the step that will measure it. An
entry missing any of the three is a deletion and would be called that.

| ID | Residual | Owner | Instrument | Step that will measure it |
|---|---|---|---|---|
| **RES-P-1** | `docs/backlog.yml:352` records neither that A16-1 landed (`6ecc226`) nor that A16-2 landed (`e9670d1`), still says `state: 'unscoped'` and `owns: []`, and its note's panel line citations are stale by -10 to -31. An entry that stays open after the work landed teaches the next session to redo it. | The orchestrator, at the next push | `git log --oneline \| grep -i a16` against the row's own text | The push that closes wave 2 |
| **RES-P-2** | `module-deck-capture/ModuleDeckCapturePanel.wiring.test.ts:215` cites `GradingRecordingPanel.tsx:493-510` as "the run log control"; `sed -n '493,510p'` shows the auto-drain effect's comment block. **Already wrong at HEAD**, before any A16 wave. Fourth stale comment in this area to mislead a pass. | The implementer of the next chunk that writes `module-deck-capture/` | `sed -n '493,510p' src/app/components/grading-recording/GradingRecordingPanel.tsx` compared against the comment's claim | That chunk's wave gate. Not widened into an A16 wave, because correcting a comment in a file A16 otherwise does not touch buys no gate |
| **RES-P-3** | **A16-4 is not planned.** Snapshot grading has no run boundary: no course field, no assessment field, one row per grade, no batch click. Mounting a panel there would ship the cross-assignment mixing owner answer 1 put out of scope, and would ship green. | A scoping pass for A16-4, dispatched by the orchestrator | `grep -n "assessmentId\|courseScope\|assessmentLabel" src/app/components/snapshot-grading/SnapshotGradingPanel.tsx` paired with a canary; then a unit test over a cohort predicate once a boundary exists | A16-4's own scoping, before any wave |
| **RES-P-4** | Whether wave 1's extraction trips React Compiler's `preserve-manual-memoization` is unverified. `this-repo.md` section 1 records it happening on the sibling `SnapshotGradingPanel.tsx`, naming a callback nobody touched, with tsc and the whole suite green. | Wave 1's implementer | `npm run lint` against the exact four-warning baseline | Wave 1's gate (9.2). Shipped workaround if it fires: keep the ref and its effect in the panel and pass the ref into the leaf |
| **RES-P-5** | **Wave 3's write set is a FLOOR** derived from `grep -rln "repo-grades/"` (27 paths) without opening all 27, and from a `rubricAreas` grep. An identifier-shaped zero looks exactly like a real absence. | Wave 3's scoping pass | Re-derive by what a grading surface puts ON SCREEN - a per-student score column, a rubric-area breakdown, a "Grade" button - not only by type name; report what this list missed | Wave 3's scoping, before dispatch |
| **RES-P-6** | **The recording tool's trends do not survive a reload** - `lastRunCohort` is `useState` and `rubricAreas` is deliberately not persisted (`toWire`'s 16-key oracle is unchanged). An instructor who grades, reloads, and sees graded rows with no trends may read that as a bug. **And it is inconsistent across surfaces**: the github path's run IS restored from `localStorage` (`github-grading-run-store.ts:357`), so its trends survive, while the recording, zip/canvas and livefeed surfaces' do not. | The repo owner | Grade a batch on each of the four surfaces, reload each, compare | An owner observation after wave 2's push. Named upgrade path if rejected: persist the resolved cohort rows under a new `ta-rec-grade-*` key, which moves the exact set at `grading-rows.test.ts:668-676` |
| **RES-P-7** | **The recording table is course-scoped but not assessment-scoped**, so one `handleGradeAll` click can grade two assignments' rows against one rubric. Wave 2 DISCLOSES this rather than preventing it. Whether the disclosure reads clearly is not checkable here. | The repo owner | An owner observation of a run over a table holding two labelled assessments | After wave 2's push |
| **RES-P-8** | **Nothing renders.** Every claim in sections 5, 9.3 and 9.5 about what the instructor sees - the panel appearing, `defaultExpanded` opening it, the cohort line being legible, the panel vanishing on reload - is a reading claim. | The repo owner | Opening the app in a browser with real env vars | An owner observation after wave 2's push. This checkout has no `.env` |
| **RES-P-9** | **A16-1 and A16-2 shipped with NO `docs/REGRESSION.md` baseline.** `grep -an "^## " docs/REGRESSION.md \| tail -1` names 432 (A11's); there is no A16 entry. So there is no recorded pre-change behaviour for either landed chunk. | The baseline seat, in wave 0 | `grep -a` over `docs/REGRESSION.md` using the **hyphenated** `class-trends`; read the tail for the next number rather than inferring it from `grep -ac "^## "`, which does not agree with the numbering | Wave 0, before wave 1 is dispatched |
| **RES-P-10** | **A8-R's wave 2 landed inside commit `db747cc`, whose message describes only a docs relocation for A18** and does not mention A8-R at all. The WORK is present and correct in the tree (`GradingTable.tsx`, `GradingTableRow.tsx`, `grading-rows.ts`, `useGradingRows.ts`, `submission-kind-callsites.structure.test.ts` all landed there); the git bookkeeping is wrong. Named so the next pass does not read the log, conclude A8-R wave 2 is outstanding, and hold `grading-recording/` against A16-3 for no reason. | The orchestrator | `git show --stat db747cc` against `docs/a8r-scope.md` section 11's wave 2 list | Before wave 1 is dispatched - it is the fact that FREES `grading-recording/` |

**Handed over, not residual:** cross-assignment trend accumulation. Receiver: a
new backlog row. Obligation: decide whether it is a new accumulator or a
re-grouping of `GradingDraftPayload.runs`, and whether `class-trends.ts`'s cohort
wording (`FORBIDDEN_COMPLETENESS_PHRASES` at `:27-32`, and `buildAreaSummary`
emitting "Across the N submissions graded so far") survives it.

---

## 11. Where the scope doc and the tree disagree

Every row measured today on `1809e71`. The scope doc was authored on `4bd903e`
with a clean tree; it is not wrong about its own moment, it is out of date, and
an implementer handed it would edit the wrong lines.

| # | `docs/a16-scope.md` says | The tree says | Consequence |
|---|---|---|---|
| 1 | A16-1 and A16-2 are work to dispatch concurrently (6.1) | Both landed: `6ecc226`, `e9670d1` | **Sections 6.1-6.3, 6.5, V1-V28, S1-S23 are history.** The largest single divergence |
| 2 | `GradingRecordingPanel.tsx` is **995**, "5 lines free", a "HARD BLOCKER" (4.6) | **966** by both `@(Get-Content).Count` and `wc -l`; 34 free | The extraction is still owed but is sized against 46 lines of additions, not against a wall |
| 3 | `GradingResults.tsx` is **916** with a standing extraction debt (4.4) | **892** - the debt was discharged by A16-1 | No wave owes it |
| 4 | `gradingResultsHelpers.test.ts` is **963**, "37 from the ceiling" | **505** - split by `e1a6782` | The named squeeze is gone |
| 5 | `handleGradeAll` at `:537`; `submissions` at `:561-565`; `<GradingTable>` at `:969`; the Autocomplete at `:797-806` | `:538`; `:551-556`; `:938`; `freeSolo` at `:767`, `onInputChange` at `:770` | **-10 to -31 at the edit points.** Every wave brief cites by symbol; section 5 re-pins |
| 6 | 6.2's derivation returns **41** paths; 6.4's returns **51** | **50** and **54** | Both lists grew; 6.4's misses `submission-kind-callsites.structure.test.ts`, which A8-R added and which asserts on the panel |
| 7 | The canary-3 roots are four, at `:213-218` | **Five**, at `:213-223`, the fifth being A16-1's `classTrendsEntry.ts`; the `it()` title at `:209-210` names them | Wave 2 adds a sixth AND edits the title |
| 8 | `grading-rows.ts` 308, `grading-row.ts` 413, `grading-feedback-prompt.ts` 187, `grading-row-serialization.ts` 326, `useGradingRows.ts` 475, `grading-submission-grade.ts` 192, `ClassTrendsPanel.tsx` 201, `offline-payload.ts` 343 | 394, 456, 215, 361, 520, 205, 212, 354 | Every one grew. A16-2 and A8-R both landed through this directory |
| 9 | `docs/a16-scope.md` is "1226 lines" (backlog row note) | **1499** by `@(Get-Content).Count` | The row's own description of its artifact is stale |
| 10 | The seven-key `ta-rec-grade-*` set is at `grading-rows.test.ts:508-516`; `docs/a8r-scope.md` says `:425-437` | `:668-676` in the current file; the walker is at `:641-643` | Two documents, two different wrong numbers, for one array |
| 11 | `this-repo.md` section 1 says the panel is 964 | 966, and it was 995 when the scope doc corrected the card to 995 | The card has been wrong in both directions. **Re-measure; do not adopt either** |

**Three things the scope doc got RIGHT and that this plan confirms rather than
re-litigates**, so a later round does not "fix" a correct citation back:

- `ALLOWED_OVERAGE` is at `src/file-size-ceiling.structure.test.ts:64`, not
  `:68`. `grep -n "ALLOWED_OVERAGE\|LIMIT = "` returns `30`, `64`, `126`.
- `recording-split.structure.test.ts:219`'s `panelTargets.size === 11` passes
  **falsely** (hardcoded key list, not read from source). No wave reaches it.
- The four-warning lint baseline is exactly `RecordingTab.tsx:347`,
  `repoGradesSliceA.guards.test.ts:83`, and two in `canvas-modules/new-quiz.test.ts`.

---

## 12. What I could not determine

- **Whether the full suite is green at `1809e71`.** I ran
  `npx vitest run src/app/components/ui/buttonVariant.test.ts
  src/file-size-ceiling.structure.test.ts` (2 files, 15 tests, all passed) and
  nothing else. I did **not** run `npm test`, `npm run lint`, `npm run build` or
  `npx tsc --noEmit` - the first is the wave gate's, and `tsc` has exactly one
  caller. Wave 0's implementer measures the real baseline totals; do not carry
  `this-repo.md`'s 1017/20200 or A8-R's 1076/21444.
- **Wave 1's extraction target is not named.** What to extract is an architecture
  decision and belongs to the architect or the implementer working from
  `this-repo.md`'s hook constraint, not to a wave plan. What this plan owns is
  the measurable pass condition (<= 945 by both tools) and the two constraints on
  how.
- **Wave 3's surface is not enumerated.** Section 3.5 is a floor and says so.
- **Whether `repo-grades` can produce a `GradingRun` without inventing one.**
  `RepoGradeCellEdit.rubricAreas` exists and `runBulkGrade` is a real batch over
  one folder with one shared rubric, so the ingredients are there - but I did not
  trace the folder run object to a boundary the way section 6 traces snapshot
  grading's absence. Wave 3's scoping does that, and it may find the same
  answer A16-4 got.
- **Whether `db747cc` swept in anything beyond A8-R's wave 2.** I compared its
  diffstat against `docs/a8r-scope.md` section 11's wave 2 list and every path
  matched, but I did not read every hunk.
