# A16 wave plan: what is left, cut into waves

Seat: WAVE PLAN, **revision 2** (the cap). Authored 2026-09-21, revising
revision 1 against `docs/a16-rulings.md` rounds 1 and 2, which win where they
and this file conflict.

**Tree state at authoring.** `git rev-parse --short HEAD` returns **`bd94c60`**
on `main`. `git status --short` returns exactly one path, `M docs/css-orphans.md`,
which I did not stage, revert or touch. `git worktree list` shows the stale
second worktree at `.claude/worktrees/friendly-meninsky-8032bc`, detached at
`8bc9c64`: **`Glob` returns that copy FIRST**, so every wave gate runs in THIS
checkout. I edited only this file.

**Measurement instrument for every line count below**, both tools, because this
repo's two line counters disagree by 42 on one file:

```powershell
@(Get-Content <path>).Count     # PowerShell, the mandated one
```
```bash
wc -l <path>                    # Bash tool, cross-check
```

Every other quantity names its own command inline. Every absence below is paired
with a canary. Nothing here is recalled.

---

## 0. Disposition

### 0.1 Round 2

| Finding | Disposition | Where |
|---|---|---|
| **BL-1 + BL-2** - purity does not launder provenance; `row.assessment` is the same live control's value, and the clause and its gate stated different rules | **REBUILT on the shipped pattern.** `assignmentName` is captured at RUN TIME from `assessmentLabel`, mirroring `GithubGradingPanel.tsx:398/:861`. One rule, stated once, quoted verbatim by the unit test, the source-text pins and the sabotages | **5.5**, 9.3 |
| **BL-3** - a whole-repo gate plus concurrency authorised by the same document | **FIXED BY CONSTRUCTION.** The gate is now `git status --short -- <the wave's published paths>`, tested and canaried | **9.0** |
| **MJ-3** - the reuse question was never asked in 893 lines | **REUSE, no do-not-reuse justification offered.** Wave 2 imports `ClassTrendsEntryMeta` and `hasTrendableResults` from the shipped leaf; its own export set shrinks by one predicate | 3.4, 5.5, 9.3 |
| **MJ-1** - A18's set stale by two files, its supporting grep falsified at HEAD | **RE-DERIVED** from A18 ruling 11's six-file A8, and all three intersections recomputed | 3.6, 4.1 |
| **MJ-4** - RES-P-2 owned by a chunk that does not exist | **DISPOSED AS A REDUCTION**, per ruling 12: owner the orchestrator, instrument the grep, step the next A16 wave gate | RES-P-2 |
| **MJ-2** - the disposition table collapsed eight minors into one row | **ENUMERATED**, 0.3 | 0.3 |
| **m** - transcription slips in the two sections that settle the membership rule and the hinge question | **RE-CITED BY SYMBOL** | 3.0, 5.2 |
| **m** - the `modalAdoption` conclusion is right, its one-marker argument is not | **REPLACED BY MEASUREMENT** of all five branches, canaried | 3.0 |
| **m** - RES-P-11 | **CLOSED, not carried.** Ruling 13 settles it and the plan's measurement was the right one | 0.3, 11.3 |

### 0.2 Round 1, carried forward unchanged

Membership rule stated once and applied to both sides (3.0); intersections
computed from the published sets with self-intersection canaries (4.1); the
`css-orphans` exemption, now a belt rather than the mechanism (9.0); A24 and A25
as real receivers (6, 10); the mixing sentence struck (6); lint locus `84:10`
with the pass condition re-stated as a comparison (9.2); the hinge lines settled
as NOT owed (5.2); margin 20 and target 934 (5.3, 5.4).

### 0.3 The eight minors, enumerated

Revision 1 collapsed these into one unenumerated row. A true claim that cannot
be checked is not a disposition.

| # | Minor | Disposition |
|---|---|---|
| 1 | Auto-drain effect cited `:506-518` | **FIXED**: comment `:496-506`, `useEffect(` at `:507`, closing at `:519`. Measured by `sed -n '494,522p' \| cat -n`. Section 7 |
| 2 | `github-grading-run-store` read line | **CLOSED.** `loadStoredGithubGradingRun` `:354`, `try {` `:356`, `getItem` `:357`. Ruling 13 settles it in the plan's favour; no longer a residual | RES-P-6, 11.3 |
| 3 | Floor enforcement cited `:154` | **FIXED**: `:168`, measured. Section 8 |
| 4 | The readdir enumeration listed a phantom `:265` and invented ranges | **FIXED**: 11 real hits, two of them `readdirSync`. Section 1 |
| 5 | `modalAdoption` argued from one marker | **FIXED**: all five branches measured at zero with canaries. 3.0 |
| 6 | Set A / Set B / composer ranges slipped | **FIXED, and re-cited by SYMBOL** rather than by range. 3.0, 5.2 |
| 7 | `grading-rows.test.ts` `readdirSync` cited `:641-643` | **FIXED**: two calls at `:642-643`; `:582` is a comment naming the mechanism. 3.0 |
| 8 | The disposition table itself | **FIXED** by this section |

### 0.4 Not reopened

Per both rulings files' closing sections, and not rebuilt here: the reshaping
claim and its three render paths; the shape decision and the non-recursive
`readdirSync`; the 966-line measurement and the discharged "hard blocker"; the
934 target, its 46-line addition table and the 32-line precedent; section 1 in
full; every wave-2 edit point; the five canary-3 roots and the `it()` title; the
button-variant entry; the file-size gate's line-counting semantics; the
git-bookkeeping finding; all six revision-1 intersections and their canaries; and
the honesty of the owner-verification routing. **The check also confirmed A16-3
is genuinely unbuilt** - the recording panel renders its own table and imports
nothing from `grading-results/`, which I re-confirmed:
`grep -rn "grading-results" src/app/components/grading-recording/` returns
nothing, canary `grep -rn "@/lib/grade" src/app/components/grading-recording/*.ts`
returns hits at `grading-feedback-prompt.ts:25,:32,:33` and elsewhere, so the
instrument fires.

---

## 1. The finding that reshapes the item, and the shape it settles

**A16-1 and A16-2 shipped on 2026-09-20** (`6ecc226`, `e9670d1`). The check
re-traced this independently and found `GradingResults.tsx` rendered by three
live panels - `GradingTab.tsx:427`, `LiveFeedPanel.tsx:430`,
`GithubGradingPanel.tsx:852` - covering four modes. Not a dead mount. So
`docs/a16-scope.md` sections 6.1-6.3, 6.5, V1-V28 and S1-S23 are history.
**This document plans A16-3, A16-5, and the disposal of A16-4.**

**The shape: a panel within each grading tool, no new strip entry.** The strip's
hardcoded counts do not move, measured on both sides:

```bash
grep -n "toHaveLength(12)\|toHaveLength(11)\|panelTargets.size" src/app/components/recording/recording-split.structure.test.ts
# 132:      expect(entries).toHaveLength(12);
# 187:      expect(matches).toHaveLength(11);
# 219:      expect(panelTargets.size).toBe(11);
grep -c 'role="tabpanel"' src/app/components/RecordingTab.tsx                                 # 11, agreeing with :187
grep -c "grading-recording" src/app/components/recording/recording-split.structure.test.ts    # 0
```

That last zero is load-bearing, so it is canary-paired:
`grep -c "RecordingTab" src/app/components/recording/recording-split.structure.test.ts`
returns **13** on the same file with the same instrument. Never `grep -P` here -
it exits 0 without checking.

The zero holds because the test reads `RecordingTab.tsx` and `TabShell.tsx` by
name and `readdirSync`s `src/app/components/recording/` **non-recursively**:

```bash
grep -n "readdirSync\|readFileSync" src/app/components/recording/recording-split.structure.test.ts
# 48, 57, 70, 75, 86, 107, 145, 169, 268, 272, 279
```

Eleven hits, two of them `readdirSync` (`:70`, `:268`), both over
`src/app/components/recording/`. The test cannot see
`src/app/components/grading-recording/`, where every remaining A16 edit to a
recording surface lands.

**Two reasons the shape is right, in the order that matters.** A thirteenth strip
entry IS a destination, and "stop it being a destination" is what the owner
asked for; the counts are the second reason. And A16-1 already shipped this shape
on four surfaces with the suite green, so it is no longer a prediction.

---

## 2. The waves, and what each exports and who calls it

| # | Wave | What it does | Exports | Caller, IN THE SAME WAVE | Independently gateable? |
|---|---|---|---|---|---|
| **0** | Baseline | `docs/REGRESSION.md` entry **433** | nothing | n/a | **Yes** - docs only |
| **1** | A16-3a, panel headroom | Pure-assembly extraction out of `GradingRecordingPanel.tsx` to **<= 934** lines. No behaviour change | pure functions in a new `grading-recording/` leaf | `GradingRecordingPanel.tsx`, edited in this wave to call them | **Yes** - a line count plus an unchanged suite |
| **2** | A16-3b, the run cohort and the mount | `lastRunCohort` (rows + `courseName` + `assignmentName`) set once inside `handleGradeAll`; the cohort leaf; the disclosure line; the gated `<ClassTrendsPanel>` mount | `toRunCohortEntry`, `runCohortMeta`, `cohortLabelSpread`. **No new predicate and no new meta type** - ruling 10 | `GradingRecordingPanel.tsx`, edited in this wave | **Yes** |
| **3** | A16-5, Repo Grades | Per-folder adapter and mount | a folder-entry adapter leaf | `repo-grades/index.tsx` or `RepoGradesGrid.tsx`, edited in this wave | **Yes**, after its own scoping |
| - | **A16-4** | **NOT A WAVE. Disposed to row A24** - section 6 | - | - | n/a |

**The caller rule, per wave rather than assumed.** Every wave adds its caller in
its own file list. There is **no type-only module** in this plan, so `seats.md`'s
single legal exception is not invoked and an implementer must not invoke it to
justify a wave without a caller. Wave 1 is the one to watch: an extraction that
moves code into a leaf and forgets to call it from the panel is a green gate over
dead code, which is why wave 1's gate is the panel's own count *dropping*, not a
leaf merely existing.

---

## 3. Write sets

### 3.0 THE MEMBERSHIP RULE, stated once and applied to every set below

Ruling 1. **A write set contains only files a wave EDITS.** A file this wave's
own change can force an edit to is an edit and is in; a file the wave merely RUNS
is a gate command and is out, however whole-repo it is.

| Class | Treatment | Which files |
|---|---|---|
| **Certain edits** | In the set | the panel, the new leaves, the wiring test carrying the new assertions |
| **Conditional edits** - this wave's own change can force an edit here | In the set. A conditional edit is still a write, and concurrency does not care about the condition | wave 1's source-text tests that read the panel; `buttonVariant.test.ts`'s per-file pin on the panel |
| **Run-only gates** - the wave runs them, and a red means the wave did something it said it would not | Out of every set; listed under gate commands | `file-size-ceiling.structure.test.ts`, `source-bytes.structure.test.ts`, `no-emojis.test.ts`, `modalAdoption.wiring.test.ts`, the CSS-orphan walker |

**Why the original's reading could not stand.** It put the three whole-repo
structural gates in every A16 wave's set while reading A18's set as edits only.
Under the wide reading no two items in this repo can ever be disjoint, because
`no-emojis.test.ts` asserts over the whole tree.

**Why `modalAdoption.wiring.test.ts` is run-only - MEASURED, not argued.**
Revision 1 reasoned from one marker; the predicate is a five-way OR
(`isDialogSite`, `modalAdoptionScan.ts:294-302`), and `adoptsSharedMechanism`
(`:190-192`) is itself two more. All six underlying markers measured on the panel,
each paired with a canary counting files in `src/` where the same instrument DOES
hit:

| Branch | On `GradingRecordingPanel.tsx` | Canary: files in `src/**/*.tsx` |
|---|---|---|
| `styles.previewBackdrop` | **0** | 9 |
| `role="dialog"` | **0** | 20 |
| `role="alertdialog"` | **0** | 2 |
| `importsMuiDialog` (`:159-163`) | **0** | 6 |
| `importsModalShellComponent` (`:170-172`) | **0** | 33 |
| `importsUseModalDismissHook` (`:177-179`) | **0** | 7 |

Every branch is false and every instrument fires, so `isDialogSite` is false on
this panel and nothing wave 1 extracts out of it can carry a marker that is not
there. Wave 3 adds no Dialog either.

**Why the two `grading-recording/` directory walkers are run-only for wave 2**,
although wave 2 adds a file to the directory they walk - **cited by symbol**, per
ruling 13, since the ranges are what slipped:

- `grading-rows.test.ts`'s `ta-rec-grade-*` exact set moves only if the new leaf
  carries a persisted key. Its two `fs.readdirSync` calls are at **`:642-643`**
  (`grading-recording/` and `assessment-shared/`); `:582` is a comment naming the
  mechanism, not a call.
- `submission-kind-callsites.structure.test.ts`'s `SET_A_MATCHER` (`:66`) and
  `SET_B_MATCHER` (`:67`) exact lists, asserted by the four `it(` blocks at
  `:86`, `:103` (the `COMPOSER_FILES` re-assertion, `COMPOSER_FILES` declared at
  `:69`), `:110` and `:121`, over the walk whose `fs.readdirSync` is at `:42`.
  These move only if the new leaf names a submission-kind identifier.

Wave 2 does neither. **The pass is green WITHOUT editing them**, which is a
stronger condition than listing them as editable.

### 3.1 The derivation command, with canaries

```bash
grep -rln "GradingRecordingPanel.tsx" src --include=*.ts --include=*.tsx | sort | wc -l
# 54   (docs/a16-scope.md section 6.4 recorded 51; A8-R added three files since)
grep -c "GradingRecordingPanel.tsx" src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts   # non-zero, must hit
grep -c "GradingRecordingPanel.tsx" src/lib/no-emojis.test.ts                                                   # 0, must miss
```

**The panel is not among the 54** - `grep -n "GradingRecordingPanel.tsx"` on
itself returns nothing. It is in the set because it is what the waves edit, not
because this command found it.

Of the 54, the subset that reads the panel **as source** or hardcodes its path,
separated by opening every hit:

| Path | How it reaches the panel |
|---|---|
| `grading-recording/GradingRecordingPanel.wiring.test.ts` | `PANEL_PATH` at `:35` |
| `grading-recording/GradingRecordingPanel.assessment.test.ts` | `PANEL_PATH` at `:37` |
| `grading-recording/GradingAssessmentDeclarationControls.test.ts` | `PANEL_PATH` at `:242` |
| `grading-recording/markLate.wiring.test.ts` | `read("GradingRecordingPanel.tsx")` at `:33`; pair list at `:104` |
| `grading-recording/submission-kind-callsites.structure.test.ts` | path list at `:72`, negative assertion at `:124`. NEW since the scope doc, landed with A8-R |
| `recording/AddKnowledgePages.test.ts` | `GRADING_PANEL_PATH` at `:237`; asserts JSX gate ORDER |
| `recording/runLogRow.test.ts` | `RUN_BEARING_PANELS` at `:16`; counts `<RunLogRow` per panel |
| `ui/buttonVariant.test.ts` | `FROZEN_PRIMARY_SITES` at `:157` pins this panel at **3** primary buttons |

Prose-only, excluded, each opened: `grading-rows.test.ts` (`:601`, `:621`),
`module-deck-capture/ModuleDeckCapturePanel.wiring.test.ts` (`:215`),
`recording/discussion-knowledge-context.test.ts` (`:81`),
`snapshot-grading/snapshot-autofire.structure.test.ts` (`:28`, `:246`) - the last
becomes a conditional edit anyway, for the line-shift reason in section 7.

### 3.2 Wave 0 - PUBLISHED SET (1 path)

```
docs/REGRESSION.md
```

```bash
grep -an "^## " docs/REGRESSION.md | tail -1
# 44203:## 432. Snapshot grading fills the Strengths box, and says so when it cannot (A11)
```

**Next entry is 433.** Use the hyphenated `class-trends` on this file:
`grep -an "class trends"` returns 0 while `grep -an "class-trends"` hits - an
instrument that matches nothing looks exactly like a clean result. `grep -a`
stays the default here.

### 3.3 Wave 1 - PUBLISHED SET (12 paths)

```
src/app/components/grading-recording/GradingRecordingPanel.tsx
src/app/components/grading-recording/gradingRecordingPanelExtracted.ts        [NEW - name is the implementer's]
src/app/components/grading-recording/gradingRecordingPanelExtracted.test.ts   [NEW]
src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts
src/app/components/grading-recording/GradingRecordingPanel.assessment.test.ts
src/app/components/grading-recording/GradingAssessmentDeclarationControls.test.ts
src/app/components/grading-recording/markLate.wiring.test.ts
src/app/components/grading-recording/submission-kind-callsites.structure.test.ts
src/app/components/recording/AddKnowledgePages.test.ts
src/app/components/recording/runLogRow.test.ts
src/app/components/ui/buttonVariant.test.ts
src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts
```

Paths 5-11 are **conditional edits**: wave 1 MOVES source out of the panel and
each reads that source or counts something in it. That is the class
`docs/a16-scope.md` documented for A16-1, where
`rubricBreakdownPercent.wiring.test.ts` would have gone red on a correct
refactor. Path 12 is section 7's line-shift re-pin.

### 3.4 Wave 2 - PUBLISHED SET (6 paths)

```
src/app/components/grading-recording/GradingRecordingPanel.tsx
src/app/components/grading-recording/classTrendsRunCohort.ts        [NEW - cohort -> GradingRun, meta projection, label-spread predicate]
src/app/components/grading-recording/classTrendsRunCohort.test.ts   [NEW - unit]
src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts
src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts
src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts
```

Wave 2 only ADDS to the panel; it moves nothing out, which is why the six
source-text tests that are conditional edits for wave 1 are run-only here.

**`grading-results/classTrendsEntry.ts` is IMPORTED, not edited** (ruling 10,
section 5.5), so it is not in the set - an import is not a write. It is safe to
import from here: its only non-local dependency is
`import type { GradingRun, GradingRunEntry } from "@/lib/grade/types"`, a
type-only edge with no runtime import, and cross-directory imports out of
`grading-recording/` are already normal
(`grading-feedback-prompt.ts:25,:32,:33`).

The last path is not optional. The canary-3 roots array is at **`:213-223`**
(`grep -n "const roots = \[" ...` returns `213`; the closing `];` is at `223`),
currently five entries, the fifth being `classTrendsEntry.ts` which A16-1 added.
Wave 2's cohort leaf is built in render and handed straight to the panel, never
written anywhere, so it must be a **sixth root** - and it needs its own root even
though it now imports one, because the walk is rooted at named files. **The
`it()` title at `:209-210` enumerates the roots by name**; adding one without
editing the title ships a test whose own description is false.
`{ timeout: 30000 }` at `:211` is the precedent for any new walk.

### 3.5 Wave 3 - PUBLISHED SET (6 paths), a FLOOR

```
src/app/components/repo-grades/index.tsx
src/app/components/repo-grades/RepoGradesGrid.tsx
src/app/components/repo-grades/classTrendsFolderEntry.ts        [NEW]
src/app/components/repo-grades/classTrendsFolderEntry.test.ts   [NEW]
src/app/components/repo-grades/repoGrades.wiring.test.ts
src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts
```

```bash
grep -rln "repo-grades/" src --include=*.ts --include=*.tsx | sort | wc -l   # 27
grep -rn "rubricAreas" src/app/components/repo-grades/ | head
# RepoGradeCellControl.tsx:292,:362,:416,:418 ; repoGradesCellEdits.ts:28 ; repoGradesCellEdits.test.ts:234,:243
```

**The least-derived of the four sets** - I did not open all 27. Wave 3 is
dispatched only after its own scoping pass re-derives it. RES-P-5.

### 3.6 A18's LIVE set - PUBLISHED SET (6 paths)

Ruling 11. Revision 1 published four files from `docs/a18-ac.md` criterion A8's
pass condition and stated that `docs/a18-rulings.md` did not override it. **That
grep was falsified in the same commit as the revision**: A18 ruling 11
(`docs/a18-rulings.md:243-265`, in a round 3 that now takes the file to 369 lines
by `wc -l`) records that A8's own document contradicted itself - A8 named four
files and went RED on any fifth, while the same document's R-6 and the P5 guard
required two test files A8 excluded.

**A8's write set is now SIX files**, re-derived from that ruling and verified to
exist (`ls -1` on all six returns all six):

```
src/lib/walkthrough-announcement-prompt.ts
src/lib/walkthrough-announcement-prompt.test.ts
src/lib/walkthrough-script-prompt.ts
src/lib/walkthrough-script-prompt.test.ts
src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts
src/app/actions/walkthrough-announcement.test.ts
```

Ruling 11 also holds the boundary: **no production file beyond the two prompt
modules**, `WalkthroughAnnouncementPanel.tsx` (985/1000) stays untouched, and
`src/lib/prompt-announcement-prompt.ts:47` remains a named regression surface
whose tests must stay green **without being edited** - a second consumer, not a
write.

---

## 4. Disjointness, both senses

### 4.1 Exact path - computed from the PUBLISHED sets

Sets written to files verbatim from 3.2-3.6, then intersected:

```bash
for f in w1 w2 w3 a18; do printf "%s = %s paths\n" $f "$(wc -l < $f.txt)"; done
# w1 = 12 paths / w2 = 6 paths / w3 = 6 paths / a18 = 6 paths
```

```bash
cat w1.txt w2.txt | sort | uniq -d
```
```
src/app/components/grading-recording/GradingRecordingPanel.tsx
src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts
src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts
```
```bash
cat w2.txt w3.txt | sort | uniq -d
```
```
src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts
```
```bash
cat w1.txt w3.txt | sort | uniq -d      # (empty)
cat w1.txt a18.txt | sort | uniq -d     # (empty)   <- re-derived against the SIX-file set
cat w2.txt a18.txt | sort | uniq -d     # (empty)
cat w3.txt a18.txt | sort | uniq -d     # (empty)
```

**Canaries that count a set somebody published:**

```bash
cat w2.txt w2.txt | sort | uniq -d | wc -l     # 6  = w2's published size
cat a18.txt a18.txt | sort | uniq -d | wc -l   # 6  = a18's published size
```

Both self-intersections return their own published cardinality, so `uniq -d`
fires AND its inputs are the sets named above.

**The A18 conclusion now rests on a derivation rather than on luck for the third
round running.** The two files ruling 11 added
(`walkthrough-announcement.structure.test.ts`,
`src/app/actions/walkthrough-announcement.test.ts`) are in
`walkthrough-announcement/` and `src/app/actions/`; no A16 wave writes either
directory, which is why the widening did not change the answer. That is the
reason, and it is worth stating because it is also the reason the NEXT widening
probably will not either - unless A18 gains a production file outside the two
prompt modules, which ruling 11 forbids.

**Waves 2 and 3 collide on exactly one real path**, the canary-3 roots file.

### 4.2 Informational independence

| Pair | Does either establish a fact the other designs against? | Verdict |
|---|---|---|
| Wave 0 x wave 1 | Wave 0 records the behaviour wave 1 must not change. A baseline written after the change is not a baseline | SEQUENCE. Wave 0 first |
| Wave 1 x wave 2 | Totally. Wave 2's line budget is the number wave 1 produces, and both edit the panel | SEQUENCE. Wave 1 first |
| Wave 2 x wave 3 | Both append a root and edit the `it()` title; wave 2 fixes the meta and cohort shape wave 3 copies | SEQUENCE. Wave 2 first |
| Wave 1 x wave 3 | File-disjoint, and neither establishes a fact the other assumes: wave 1 is a pure refactor of a file wave 3 never reads | **INDEPENDENT in both senses.** May run concurrently |
| **Any A16 wave x A18** | A18 edits two `src/lib` prompt modules and four test files. No A16 wave reads a prompt module; no A18 edit reads the panel, the trends panel or the canary-3 file, and ruling 11 bars A18 from any further production file | **INDEPENDENT in both senses.** May run concurrently |
| Wave 2 x **N13b** | N13b redefines `AreaTrend` to carry per-student attribution and broadens the signal | **SEQUENCE. A16 first** - section 8 |

**Standing consent applies where it applies.** Wave 1 and wave 3 are disjoint in
both senses, as is A18 against any A16 wave. Cap is 2-3; wave 1 plus A18 is 2,
and idle sequencing costs the queue. **That authorisation is what makes 9.0's
path-scoped gate mandatory rather than tidy** - see ruling 9.

**Re-run all six intersections immediately before each dispatch**, and re-derive
A18's set from `docs/a18-ac.md` as overridden by every round of
`docs/a18-rulings.md` rather than trusting this section. That file has grown a
round between each of this plan's revisions.

---

## 5. The line budget and the entry contract

### 5.1 The measurement

```powershell
@(Get-Content src/app/components/grading-recording/GradingRecordingPanel.tsx).Count   # 966
```
```bash
wc -l src/app/components/grading-recording/GradingRecordingPanel.tsx                  # 966
```

**966 by both tools. Thirty-four lines free.** `LIMIT = 1000` at
`src/file-size-ceiling.structure.test.ts:30`, compared with `lineCount > limit`
at `:129`, so exactly 1000 passes. `ALLOWED_OVERAGE` is at `:64`
(`grep -n "ALLOWED_OVERAGE\|LIMIT = "` returns `30`, `64`, `126`) and contains
none of these files.

### 5.2 The twelve hinge lines are NOT owed - settled before wave 1

```bash
git show db747cc -- src/app/components/grading-recording/GradingRecordingPanel.tsx
# +        submissionKind: r.submissionKind,
# +        onConfirmSubmissionKind={gradingRows.confirmSubmissionKind}
# +        onAcceptSuggestedKinds={gradingRows.acceptSuggestedKinds}
```

**Three lines landed, not fifteen.** `docs/a8r-scope.md` section 7 budgeted "up
to 12" more for a comment block at the grade map. It was never written:

```bash
grep -n "G-R1\|G-R3\|suggestedSubmissionKind" src/app/components/grading-recording/GradingRecordingPanel.tsx
# (no output)
grep -c "submissionKind" src/app/components/grading-recording/GradingRecordingPanel.tsx   # non-zero: canary, the instrument fires
```

**They are not owed, and the reason is a test rather than an argument**, cited by
symbol per ruling 13: `submission-kind-callsites.structure.test.ts`'s `it(` block
at **`:86`** asserts `relFiles(SET_A_MATCHER)` with `toEqual` against an exact
nine-path array **that does not include the panel**, and the block at **`:103`**
re-asserts it against `COMPOSER_FILES` (declared `:69`). If the panel ever names
the suggestion instead of the confirmed field, that exact-list assertion goes red.
A comment restating a pinned property is documentation, not an outstanding
requirement, and `docs/a8r-scope.md` section 10's register does not list it - its
only comment-related entry, RES-8, is about `grading-submission-grade.ts:109-112`.

**So wave 2's additions budget is 46, not 58.**

### 5.3 The margin is 20

`docs/loop/this-repo.md` section 1 records extracting a hook out of the sibling
`SnapshotGradingPanel.tsx` failing `npm run lint` on React Compiler's
`preserve-manual-memoization`, naming a callback nobody touched, while tsc and
the whole suite stayed green; the shipped workaround keeps a ref and its effect
in the panel and passes the ref into the leaf, roughly 8 lines.
`docs/a8r-scope.md` section 7 priced the margin at **20** on this exact file,
"named, not rounded", as two of those workarounds. This plan uses 20.

### 5.4 Wave 2's additions, derived, and wave 1's target

Edit points re-measured today
(`grep -n "handleGradeAll\|const submissions\|<GradingTable\|assessmentId =\|selectedCourse" src/app/components/grading-recording/GradingRecordingPanel.tsx`):

| Addition | Where, today | Lines |
|---|---|---|
| `import ClassTrendsPanel` | top | 1 |
| `import { toClassTrendsEntry, hasTrendableResults, type ClassTrendsEntryMeta }` from the shipped leaf, re-exported through the cohort leaf | top | 1 |
| `import { toRunCohortEntry, cohortLabelSpread }` and the cohort type | top | 1 |
| `const [lastRunCohort, setLastRunCohort] = useState<...>(null)` | beside `logGradingRuns` at `:199` | 1 |
| Capture rows + `courseName` + `assignmentName` once inside the handler | `handleGradeAll` `:538`; `submissions` `:551-556`; apply loop `:578-584` | 5-8 |
| Hinge comment: why the cohort AND both meta strings are captured at run time, citing `GithubGradingPanel.tsx:398/:861` | same place | 10-14 |
| Gated mount plus the disclosure line | above `<GradingTable>` at `:938` | 8-12 |
| Hinge comment at the mount | same | 6-8 |
| **Total** | | **33-46** |

`grep -c "^\s*\(//\|/\*\|\*\|{/\*\)" src/app/components/grading-recording/GradingRecordingPanel.tsx`
returns **298** against 966 lines - 31 percent comment - and a hinge comment in
this directory runs 6 to 14 lines.

**Wave 1's target: `<= 934` by BOTH tools.** 1000 - 46 - 20 = 934, i.e. at least
**32 lines removed** from 966. **32 is demonstrated**: A8-R wave 0 removed exactly
32 from this same file (995 -> 963) by extracting pure assembly and no hook.

### 5.5 THE ENTRY CONTRACT - rebuilt on the shipped pattern (ruling 8), with reuse (ruling 10)

Revision 1 made `assignmentName` a pure function of the cohort rows' `assessment`
field and called the attack closed by construction. **Purity does not launder
provenance**, and the check traced what revision 1 did not.

**The provenance, measured.** `stampGradingRowsWithAssessment`
(`grading-row.ts:408-418`) returns
`{ ...r, assessment: prior ? prior.assessment : assessmentScope }` - a row that
already exists keeps its PRIOR value and only a NEW row takes the current scope.
Its own doc comment names "adopt an already-attributed row into whichever scope is
selected now" as the defect it exists to prevent. Its one call site is
`useGradingRows.ts:379`, where `assessmentScope` is
`assessmentId.length > 0 ? assessmentId : undefined` (`:310`), and `assessmentId`
is `assessmentLabel.trim()` (panel `:292`) - seeded from `localStorage` at
`:274-276` and rewritten on **every keystroke** through `onInputChange` at `:770`.

So `row.assessment` IS the same live control's value, frozen at that row's mint.
Revision 1's rule was reachable-broken twice, both passing every gate it wrote:

- Rows minted while the box read `Essa` carry `assessment: "Essa"` for good. A
  run over only those rows has exactly one distinct value, so `Essa` reaches
  **student-addressed copy** at `class-trends-draft.ts:185` and a **model
  prompt** at `class-trends-insight.ts:154`.
- **The silent-green:** rows minted before the label was ever typed carry
  `undefined` permanently and persist that way. Under revision 1's counting, ONE
  legacy row forces `""` for every future run on that table - "A note on this
  assignment" and "(untitled assignment)" forever, on the one surface A16-3
  exists to serve.

**THE ANSWER IS ALREADY IN THIS TREE, AND IT IS A16-1'S OWN.**
`GithubGradingPanel.tsx:398` calls `setLastGradedFolder(gradingFolder)` **inside
the grade handler**, and `:861` passes
`assignmentName={lastGradedFolder ? normalizeGradingFolder(lastGradedFolder) : ""}`
into `<GradingResults>`, with the comment at `:855-860` saying it is the folder
"this RUN actually covered ... tied to what this run covered even if the folder
box above has since been edited". A16-1 solved this exact problem on a sibling
surface and revision 1 did not cite it.

> **THE RULE, stated once. Every field on `lastRunCohort` - the rows,
> `courseName` and `assignmentName` - is CAPTURED INSIDE `handleGradeAll`, on
> the branch that reaches the apply loop, and is NEVER read from a live control
> or a row field at render time.**
>
> - `courseName` <- `selectedCourse?.name ?? ""` at capture. Precedent in this
>   same file: `currentGradingLog` already does exactly this at `:612`.
> - `assignmentName` <- `assessmentId` (which is `assessmentLabel.trim()`) at
>   capture, or `""`. Precedent: `GithubGradingPanel.tsx:398/:861`.
> - `canvasUrl` <- `""`. Measured: `grep -c "canvasUrl"` on the panel returns
>   **0** and `grep -rn "canvasUrl" src/app/components/grading-recording/ | wc -l`
>   returns **0**, while the canary `grep -c "gradingRows"` on the panel returns
>   **47**, so the instrument fires and the absence is real. There is no Canvas
>   assignment on this surface, and `route.ts:80` already coerces a non-string
>   to `""`.
> - `row.assessment` is used for **ONE** thing and it is not the heading: the
>   disclosure predicate `cohortLabelSpread`, true when the captured rows carry
>   **more than one distinct `assessment` value, counting `undefined` as one**.

**Why the asymmetry revision 1 created is gone.** It snapshotted `courseName` from
a live control at run time and derived `assignmentName` from row data. Both now
take the same treatment, at the same moment, onto the same object. There is no
second rule left to disagree with the first - which is what BL-2 was.

**What this does and does not fix, stated rather than overclaimed.** Failure (b),
the silent-green, disappears: `row.assessment` no longer reaches the heading, so
no legacy row can force `""` forever. Failure (a) is bounded, not eliminated: a
typo in the box at the moment of the click still ships into the heading. That is
an instructor input error visible on screen at the moment they act, it is frozen
at the click so it cannot mutate mid-keystroke, and it is the same behaviour the
github surface already ships and A16-1 already accepted. The mutation owner answer
3 forbids is closed; the typo is not, and RES-P-12 routes it.

**REUSE (ruling 10), with no do-not-reuse justification offered because none
exists.** `grading-results/classTrendsEntry.ts` already exports:

- `ClassTrendsEntryMeta` = `{ courseName, assignmentName, canvasUrl }` - exactly
  the three fields above. **Wave 2 imports this type; it declares no second one.**
- `hasTrendableResults(entry)` =
  `entry.run.results.some((r) => !r.ungraded && r.rubricAreas.length > 0)`, and
  it is already unit-tested over the enumerated product of {graded, ungraded} x
  {areas, no areas} in `classTrendsEntry.test.ts:64-91`. Wave 2's adapter
  produces a `GradingRunEntry` - the same type this predicate takes - so one
  predicate serves both surfaces. **Wave 2 declares no second predicate.** Two
  predicates gating the same panel is the recorded class where consolidating them
  later makes the comparing test a tautology.
- `toClassTrendsEntry(run, meta)` - reused; wave 2's leaf builds the `GradingRun`
  from the captured rows and hands it to this.

So wave 2's own exports reduce to three: `toRunCohortEntry(cohort)` (builds the
run and calls `toClassTrendsEntry`), `runCohortMeta(cohort): ClassTrendsEntryMeta`
(a pure projection of the captured fields), and `cohortLabelSpread(cohort)`.

### 5.6 Two constraints on HOW wave 1 extracts

- **Move pure assembly. Do not move a hook.** `this-repo.md` section 1's
  `preserve-manual-memoization` account; A8-R wave 0 obeyed it and passed.
  Whether it generalises here is unverified - RES-P-4.
- **`ui/buttonVariant.test.ts:157` pins this panel at exactly 3 primary
  buttons.** A `.ts` leaf does not move it. If a `.tsx` is unavoidable and carries
  a Button, the count is bumped in the same commit with the reason.
  `modalAdoption.wiring.test.ts` cannot move - 3.0's six-branch measurement.

Other files a wave writes, `@(Get-Content).Count` today, none near the ceiling:
the panel **966**; `classTrendsDraft.not-postable.test.ts` 232;
`repo-grades/index.tsx` **913** (wave 3's own squeeze point, inheriting the same
extract-before-adding rule); `repo-grades/RepoGradesGrid.tsx` 643.

---

## 6. A16-4 is disposed to row A24, not planned here

**The load-bearing argument, and the only one: snapshot grading has no run
boundary.** Canary-paired:

```bash
grep -n "assessmentId\|courseScope\|assessmentLabel" src/app/components/snapshot-grading/SnapshotGradingPanel.tsx
# (no output)
grep -c "useState" src/app/components/snapshot-grading/SnapshotGradingPanel.tsx
# 21  - canary: the instrument fires on the same file
```

No course field, no assessment field, and each grade resolves ONE row - there is
no `handleGradeAll` to be the boundary. The check re-verified this and the factual
ruling is not reopened.

**STRUCK per ruling 6, recorded as struck so no later round cites it as
precedent:** revision 0 also argued that mounting there "would ship the
cross-assignment mixing owner answer 1 put out of scope". That contradicts
RES-P-7, which ACCEPTS that mixing on the recording surface and discloses it. If
mixing is disclosable on one surface it is disclosable on the other.

**Receivers that exist:** `docs/backlog.yml:440` row **A24** (trends on snapshot
grading) and `:451` row **A25** (cross-assignment accumulation), both created at
`9fa01c3`. A25's obligation: decide whether it is a new accumulator or a
re-grouping of `GradingDraftPayload.runs`, and whether `class-trends.ts`'s cohort
wording (`FORBIDDEN_COMPLETENESS_PHRASES` at `:27-32`, `buildAreaSummary`
emitting "Across the N submissions graded so far") survives it.

---

## 7. The line-shift obligation, priced

Wave 2 inserts 3 imports at the top and one `useState` near `:199`, so everything
below `:199` shifts by **+4**. Wave 1's extraction shifts by a larger, negative,
implementer-determined delta.

| Artifact | Citation | State today | Owner of the re-pin |
|---|---|---|---|
| `snapshot-autofire.structure.test.ts:28` and `:246` | `GradingRecordingPanel.tsx:506-518` | `sed -n '494,522p' \| cat -n` puts the comment at **`:496-506`** and the `useEffect(` at **`:507`**, closing at `}, [pendingFrames, extracting, runExtraction]);` at **`:519`**. The construct is `:507-519`; revision 0's `:506-518` was off by one at both ends | **Wave 1, then wave 2 again after its own +4.** In both sets for this reason; it is a comment, so it never goes red and will be missed unless named |
| `ModuleDeckCapturePanel.wiring.test.ts:215` | `GradingRecordingPanel.tsx:493-510` as "the run log control" | **ALREADY STALE at HEAD** - that range is the auto-drain effect's comment block | **RES-P-2**, disposed as a reduction |
| `docs/a16-scope.md` sections 2.2, 4.6, 6.4, 7, 8 | `:537`, `:561-565`, `:598-603`, `:797-806`, `:969` | Today: `handleGradeAll` `:538`; `const submissions` `:551-556`; `freeSolo` `:767`, `onInputChange` `:770`; `<GradingTable` `:938` | **This plan** - 5.4 re-pins every edit point wave 2 needs |
| `docs/backlog.yml` A16 row | `state: 'planned'`, but `owns: []` and `verify: null` | Partly reconciled; the two fields are genuinely stale | **RES-P-1** |

**The rule this enforces.** Every wave brief cites the panel BY SYMBOL -
`handleGradeAll`, `const submissions`, the `<GradingTable>` call, the assessment
`Autocomplete` - never by line. `docs/a16-scope.md` section 9 correction 9 records
an implementer told to delete `grading-submission-grade.test.ts:118` deleting the
`feedback` assertion instead of the `rubricAreas` one, with the suite green.

---

## 8. Sequencing against N13a and N13b

**N13a is independent in both senses and may run in any slot.** Its owed work
(`docs/backlog.yml:139`) is removing `DEFAULT_CLASS_TRENDS_DRAFT_FLOOR = 5` at
`class-trends-draft.ts:18`, its enforcement at **`:168`** - measured;
`sed -n '163,172p'` puts `if (report.totalResults < floor)` there, and both
revision 0 and `docs/a16-scope.md` said `:154` - and the stale comment at
`:86-88`. No A16 wave writes that file. Intersection with all four published
sets: empty.

Informational check: removing the floor makes layer C compose below 5 graded
submissions, changing what a small run shows on the new mounts. Wave 2's gate is
`hasTrendableResults`, not the draft floor, so it does not design against it.

**N13b MUST FOLLOW A16.** The exact-path coupling shrank to one path once A16-1
landed; the facts test forces the order:

- N13b's part (b) redefines `AreaTrend` to carry per-student attribution -
  `percentValues` is an anonymous `number[]` today (`class-trends.ts:124-150`).
- N13b's threshold broadens the signal to three or more students who MISSED
  POINTS - any deduction - not the shipped low-score rule.
- Wave 2's disclosure line and wave 3's per-folder adapter both design against
  what the panel reports. Building them while N13b redefines it is
  `parallel-disjointness.md` section 1 case 2: individually coherent, mutually
  incompatible, invisible until integration.

**The coupling is benign rather than blocking**, and that is a claim about landed
code: `toClassTrendsEntry(run, meta)` returns `{ ...meta, run }` - `run` by
reference - so N13b enriches all four LMS mounts with no placement work. Wave 2's
adapter CONSTRUCTS results from rows, so it must emit `student: row.studentName`
and no `userId` key, which is what keeps N13b's enrichment reaching the recording
mount. A requirement on wave 2, not a note.

**Recommended order:** N13a concurrent with anything; A18 concurrent with any A16
wave; waves 0 -> 1 -> 2 -> 3, with wave 3 free to run concurrently with wave 1;
N13b after wave 3.

---

## 9. The gate for each wave

### 9.0 The standing gate - PATH-SCOPED (ruling 9)

Ruling 3 exempted one filename; ruling 9 names the class - a whole-repo gate
combined with concurrency authorised by the same document. Revision 1 copied the
narrow exemption while independently authorising wave 1 beside A18 in 4.2, and a
concurrent sibling dirties paths in no wave's set and in no exemption, so **every
A16 wave gate would have failed** and pushed the implementer toward exactly the
cleanup ruling 3 existed to prevent. At the moment of the check,
`git status --short` printed a concurrent A18 agent's live work.

```powershell
git status --short -- <every path in this wave's published set>
```

**Pass: every path printed is in this wave's published set.** Equivalently, a
diff against a pre-wave snapshot. Verified here, with a canary proving the
scoping is real and not merely silent:

```bash
git status --short -- docs/a16-plan.md docs/css-orphans.md   # prints " M docs/css-orphans.md"
git status --short -- src/lib/no-emojis.test.ts              # prints nothing
```

The first shows the scoped form still reports a dirty path it is asked about; the
second shows it excludes one it is not. A form that printed nothing in both cases
would be a gate that never fires.

**`docs/css-orphans.md` stays exempt as a belt**, no longer load-bearing: it has
been dirty all session from outside the loop. **Do not stage it, do not revert
it, do not mention it in a report except to say it was left alone.**

No path may be under `.claude/worktrees/`. A report is not evidence.

Forbidden in every brief, by name: **`git add -A`** (one swept an implementer's
unverified mid-flight work onto main here) and **`git stash`** (one reverted every
sibling's files here). Stage explicit paths. Never `git checkout --` on an
uncommitted file - it reverts to the index and destroys the wave's work; restore
from a `cp` backup.

**`npx tsc --noEmit` has exactly ONE caller** - the wave gate, run once, after the
wave reports and while nothing is mid-sabotage. It races on
`tsconfig.tsbuildinfo` (`tsconfig.json` sets `"incremental": true`; gitignored at
`.gitignore:41`). No implementer runs it. **No private worktree**: junctioning
`node_modules` into a throwaway worktree empties the real one here.

**No two agents sabotage-verify at once.**

**Run-only gates, owned by no wave** (3.0), run by every wave, pass = green
WITHOUT editing them: `src/file-size-ceiling.structure.test.ts`,
`src/source-bytes.structure.test.ts`, `src/lib/no-emojis.test.ts`,
`src/app/components/ui/modalAdoption.wiring.test.ts`. Never hand-roll the emoji
scan and never paste a gate's own output into a doc.

### 9.1 Wave 0 - baseline

| Instrument | Pass |
|---|---|
| `grep -an "^## " docs/REGRESSION.md \| tail -1` before and after | before names 432, after names **433** |
| `npx vitest run src/lib/no-emojis.test.ts` | green - the rule covers `docs/` |
| `npx vitest run src/source-bytes.structure.test.ts` | green - `Write`/`Edit` materialise a `\uXXXX` escape as the literal byte |
| `git status --short -- docs/REGRESSION.md` | that path only |

### 9.2 Wave 1 - A16-3a, panel headroom

| Instrument | Pass |
|---|---|
| `@(Get-Content <panel>).Count` **and** `wc -l <panel>` | both **<= 934**, and both the SAME number. A disagreement means one tool is wrong and the count is not a fact yet |
| `npx vitest run src/file-size-ceiling.structure.test.ts` | green, without editing `ALLOWED_OVERAGE` |
| `npx vitest run src/app/components/ui/buttonVariant.test.ts` | green. If `FROZEN_PRIMARY_SITES:157` must move, it moves in the same commit with the reason |
| one `npx vitest run` **per path** over the six source-text tests of 3.3 | green. `AddKnowledgePages.test.ts` asserts JSX gate ORDER and is the one an extraction is most likely to move. **Single path per invocation** - a multi-path run silently drops a path that matches nothing and exits 0 |
| `npm run lint` | **no MORE warnings than the count measured on the pre-change tree in this same wave.** Orientation only, not a constant: measured by the orchestrator 2026-09-21 as 4 problems / 0 errors / 4 warnings, at `RecordingTab.tsx:347`, `repoGradesSliceA.guards.test.ts:84:10`, and two in `canvas-modules/new-quiz.test.ts`. **I did not run it.** Revision 0 made a transcribed figure a hard pass condition and got the second locus wrong by one line, which is the tell that it was transcribed |
| `npm test` | exit 0, totals not below the baseline **measured on the pre-change tree in this same wave**. Do not carry `this-repo.md`'s 1017/20200 or A8-R's 1076/21444 |
| `npx tsc --noEmit` (wave gate only) | **no output at all**, exit 0 |
| `npm run build` | the line `Compiled successfully` is present. **Do not gate on the exit code** - it exits 1 in the env-dependent prerender tail and the page named varies between runs |

**What a pass does NOT prove:** that the panel still renders. Nothing renders.

### 9.3 Wave 2 - the cohort, the entry contract and the mount

Everything in 9.2 except the `<= 934` row, plus the following. **Every row that
touches provenance quotes 5.5's rule rather than paraphrasing it** - that
paraphrase drift was BL-2.

| Instrument | Pass |
|---|---|
| `npx vitest run .../classTrendsRunCohort.test.ts` | the per-row mapping over an **enumerated product** of the four `AssessmentRowState` members (`"pending" \| "grading" \| "ready" \| "failed"` - four, not three) x {areas, no areas} |
| same file | `Object.keys(emitted)` does not contain `userId`, and `JSON.stringify(emitted)` does not contain `"userId"`. `GradedResult.userId` is optional, so `tsc` permits an adapter that emits it - this is the only runtime enforcer |
| same file | `computeClassTrends(toRunCohortEntry(cohort)).totalResults` equals the count of `"ready"` rows. An inflated N reaches `buildAreaSummary` and a sentence addressed to STUDENTS |
| **same file - THE META PROJECTION** | `runCohortMeta(cohort)` returns `{ courseName: cohort.courseName, assignmentName: cohort.assignmentName, canvasUrl: "" }` and reads **no row field**. Enumerated over {cohort.assignmentName is `""`; is a label; rows carry a DIFFERENT single label; rows carry `undefined`}: the returned `assignmentName` equals `cohort.assignmentName` in **all four** cells. **This is the cell revision 1 got wrong, and the row that makes the rule checkable rather than stated** |
| **same file - THE DISCLOSURE PREDICATE** | `cohortLabelSpread(cohort)` is true exactly when the captured rows carry more than one distinct `assessment` value, **counting `undefined` as one**. Enumerated over {all one label; label + `undefined`; two labels; all `undefined`}: true in cells 2 and 3, false in 1 and 4 |
| same file | wave 2 declares **no second trendable predicate and no second meta type**. `hasTrendableResults` and `ClassTrendsEntryMeta` are imported from `grading-results/classTrendsEntry.ts`. RED if the leaf exports a predicate of its own (ruling 10) |
| `npx vitest run .../GradingRecordingPanel.wiring.test.ts` - **THE PROVENANCE PIN, POSITIVE HALF** | the `setLastRunCohort(` expression inside `handleGradeAll` **MUST mention** `assessmentId` (or `assessmentLabel`) **and** `selectedCourse`. This is the half revision 1 inverted: its detectors banned `assessmentLabel` outright and would have made the precedented solution FAIL. A run-time capture is REQUIRED, not forbidden |
| **same file - THE PROVENANCE PIN, NEGATIVE HALF** | the adapter/mount call expression, **scoped to that expression only**, mentions **none** of `assessmentLabel`, `assessmentId`, `selectedCourse`, `courseId`, `courses`, `gradingRows.rows`, `gradingRows.rawRows`, `filterText`, `sort`. Together with the positive half this forbids a render-time read while permitting the capture |
| same file | a whole-file form of either detector is **RED at HEAD before any wave-2 code exists** - `grep -n "gradingRows\.\(rawRows\|rows\)" <panel>` returns pre-existing legitimate hits - so an implementer who writes the file-wide form finds it red and loosens it rather than fixing it. **The detectors MUST be narrow** |
| same file | the panel imports AND renders `<ClassTrendsPanel` above `<GradingTable>`. **Detector plus canary**: prove it returns false on a dead import and on a local reimplementation, in the shape `gradingResultsExtraction.wiring.test.ts` already uses four times |
| `npx vitest run .../classTrendsDraft.not-postable.test.ts` | green with the cohort leaf as a **sixth** root at `:213-223` **and the `it()` title at `:209-210` updated to name it**. Explicit `{ timeout: 30000 }` on any new walk, per `:211` |
| `npx vitest run .../grading-rows.test.ts` and `.../submission-kind-callsites.structure.test.ts` | **green WITHOUT being edited.** `SET_A_MATCHER`/`SET_B_MATCHER`'s exact lists and the `ta-rec-grade-*` set must not move. A red means wave 2 added a persisted key or named a submission-kind identifier, both of which it said it would not |

**Sabotages, watched failing and restored.** Each names which of 5.5's clauses it
attacks, so the clause, the unit test and the mutation cannot drift apart.

| # | Mutation, IMPLEMENTATION only | Attacks | Goes red in |
|---|---|---|---|
| P1 | Delete the `<ClassTrendsPanel .../>` tag | the mount | the mount assertion. Also the leverage removal test |
| P2 | Remove the `hasTrendableResults(...)` guard | the gate | the guard assertion. Without it the panel renders a Button reading `Trends (0)` |
| P3 | Capture the cohort rows from `gradingRows.rawRows` at render instead of in the handler | rule, rows clause | the negative provenance pin |
| P4 | Resolve the cohort against `gradingRows.rawRows` by id at render | rule, rows clause | the negative provenance pin. Proves the detector is narrow enough to discriminate, since the file-wide form is red at HEAD anyway |
| P5 | Emit every cohort row as a `GradedResult` | the mapping | the `totalResults` assertion |
| **P6** | `assignmentName={assessmentLabel}` at the MOUNT | rule, `assignmentName` clause | **the negative provenance pin.** The door revision 1 closed |
| **P7** | Derive `assignmentName` from the rows' `assessment` values - revision 1's own rule | rule, `assignmentName` clause | **the META PROJECTION row, cell 3 (rows carry a different single label) and cell 4 (rows carry `undefined`).** Under revision 1's rule this mutation was the specification, which is why it did not kill; under 5.5 it does |
| **P8** | Delete `assessmentId` from the `setLastRunCohort(` expression, defaulting `assignmentName` to `""` | rule, capture clause | **the POSITIVE provenance pin.** The half that makes the precedented solution mandatory rather than merely permitted |
| P9 | Read `selectedCourse?.name` at render instead of the captured field | rule, `courseName` clause | the negative provenance pin |
| **P10** | `cohortLabelSpread` treats `undefined` as absent rather than as a distinct value | the disclosure clause | the DISCLOSURE row, cell 2 |
| P11 | Declare a local `hasTrendableCohort` in the leaf and gate on it | ruling 10 | the no-second-predicate row |
| P12 | Add `import { postCanvasGradesAction }` to the cohort leaf | the canary-3 claim | the canary-3 walk. Without this, the root addition is an assertion about code nobody proved is load-bearing |

Procedure per row: run and record PASS with exact `Test Files` / `Tests` counts;
mutate; re-run and record FAIL and which assertion fired; restore from the `cp`
backup; re-run and record PASS with the **same** counts. A differing step-5 count
means the restore was not clean. **Pipe vitest output through `tr -d '\000'` or
use `grep -a` before grepping it** - vitest output carries NUL bytes, so a plain
`grep` prints "Binary file matches" and a failing run reads as a silent pass.

### 9.4 Wave 3 - A16-5

Not specified beyond 9.0 and the run-only gates. Wave 3 gets its own scoping pass
first, for the reason 3.5 gives.

### 9.5 What no gate above can check

**No component is rendered by any test in this repo.** vitest is
`environment: "node"` and collects only `src/**/*.test.ts` - `.test.tsx` is not
collected, no jsdom, no testing-library, no render call. So: that the panel
APPEARS beside the run, that `defaultExpanded` opens it, that the disclosure line
is legible and reads as disclosure rather than as an error, and that the panel
VANISHES after a reload rather than disclosing why, are all reading claims.

**BL-1 was not one of them**, and that distinction is ruling 8's: the field's
provenance is a source-level fact, instrumentable today by asserting on where the
value comes from rather than on what an instructor sees. 9.3's two provenance
pins are that instrument.

**No `.env` and no API key**, so layer B - `src/app/api/class-trends-insight/route.ts` -
cannot be exercised end to end. `vitest.setup.ts` replaces `fetch` with a throwing
stub. Mock `callLlm` on an LLM path and `canvasFetch` on a Canvas path, never
`fetch` - a live 401 once made a sabotage check pass for the wrong reason.

---

## 10. Residual register

Every entry names an owner, an instrument, and the step that will measure it. An
entry missing any of the three is a deletion and would be called that.

| ID | Residual | Owner | Instrument | Step that will measure it |
|---|---|---|---|---|
| **RES-P-1** | `docs/backlog.yml:352` reads `state: 'planned'` but still carries `owns: []` and `verify: null`, and its note records neither landing (`6ecc226`, `e9670d1`) nor the stale panel citations | The orchestrator, at the next push | `git log --oneline \| grep -i a16` against the row's own text | The push that closes wave 2 |
| **RES-P-2** | `ModuleDeckCapturePanel.wiring.test.ts:215` cites `GradingRecordingPanel.tsx:493-510` as "the run log control"; that range is the auto-drain effect's comment block. Already wrong at HEAD. **Disposed as a REDUCTION per ruling 12** - the object is a stale comment in a file A16 never touches, and revision 1's owner ("the next chunk that writes `module-deck-capture/`") returns ZERO from the backlog | **The orchestrator**, recorded in the A16 backlog row so it survives this plan | `grep -c "module-deck-capture" docs/backlog.yml` - **returns 0 today**, canary `grep -c "A24" docs/backlog.yml` returns 1 on the same file, so the instrument fires | **The next A16 wave gate** |
| **RES-P-3** | A16-4 is disposed, not planned. Snapshot grading has no run boundary (section 6) | **Row A24, `docs/backlog.yml:440`** | A24's own `instrument` field, which carries the canary-paired grep | **A24's scoping pass**, scheduled by the backlog like any row |
| **RES-P-4** | Whether wave 1's extraction trips React Compiler's `preserve-manual-memoization` is unverified. `this-repo.md` section 1 records it on the sibling panel | Wave 1's implementer | `npm run lint` against the count measured on the pre-change tree in the same wave | Wave 1's gate (9.2). Workaround if it fires: keep the ref and its effect in the panel, pass the ref into the leaf |
| **RES-P-5** | **Wave 3's published set is a FLOOR**, derived without opening all 27 hits | Wave 3's scoping pass | Re-derive by what a grading surface puts ON SCREEN - a per-student score column, a rubric-area breakdown, a "Grade" button - not only by type name; report what this missed | Wave 3's scoping, before dispatch |
| **RES-P-6** | **The recording tool's trends do not survive a reload** - `lastRunCohort` is `useState` and `rubricAreas` is deliberately not persisted. **Inconsistent across surfaces**: the github path's run IS restored - `loadStoredGithubGradingRun` at `src/lib/github-grading-run-store.ts:354`, `try {` at `:356`, `localStorage.getItem(RUN_KEY)` at `:357` (settled by ruling 13) - so its trends survive, while recording, zip/canvas and livefeed do not | The repo owner | Grade a batch on each of the four surfaces, reload each, compare | An owner observation after wave 2's push. Upgrade path: persist the captured cohort under a new `ta-rec-grade-*` key, which moves the exact set in `grading-rows.test.ts` |
| **RES-P-7** | **The recording table is course-scoped but not assessment-scoped**, so one `handleGradeAll` click can grade two assignments' rows against one rubric. Wave 2 DISCLOSES this via `cohortLabelSpread` rather than preventing it. Whether that reads clearly is not checkable here | The repo owner | An owner observation of a run over a table holding two labelled assessments | After wave 2's push |
| **RES-P-8** | **Nothing renders.** Every claim in 6 and 9.5 about what the instructor sees is a reading claim | The repo owner | Opening the app in a browser with real env vars | An owner observation after wave 2's push. This checkout has no `.env` |
| **RES-P-9** | **A16-1 and A16-2 shipped with NO `docs/REGRESSION.md` baseline.** Newest entry is 432 (A11's); there is no A16 entry | The baseline seat, in wave 0 | `grep -a` with the **hyphenated** `class-trends`; read the tail for the next number rather than inferring it from `grep -ac "^## "`, which does not agree with the numbering | **Wave 0**, before wave 1 is dispatched |
| **RES-P-10** | **A8-R's wave 2 landed inside `db747cc`**, a commit whose message describes only a docs relocation for A18. The work is present and correct; the bookkeeping is wrong. Named so the next pass does not read the log, conclude A8-R wave 2 is outstanding, and hold `grading-recording/` against A16-3 for nothing | The orchestrator | `git show --stat db747cc` against `docs/a8r-scope.md` section 11's wave 2 list | Before wave 1 is dispatched - it is the fact that FREES `grading-recording/` |
| **RES-P-12** | **5.5 bounds failure (a) rather than eliminating it**: a typo in the assessment box at the moment of the click ships into the panel heading, the student-facing draft opening (`class-trends-draft.ts:185`) and the model prompt (`class-trends-insight.ts:154`). Frozen at the click, so it cannot mutate mid-keystroke, and identical to the behaviour `GithubGradingPanel.tsx:861` already ships. Whether an instructor notices is not checkable here | The repo owner | Type a partial label, click Grade All, read the panel heading and the composed draft | An owner observation after wave 2's push |

**Closed this round, not carried:** RES-P-11 (the github-store read line). Ruling
13 settles it in this plan's favour - `:354` / `:356` / `:357`, the ruling's
`:356` was the `try {`. Carrying a settled fact with a step that names nothing
scheduled is the deletion class this register exists to prevent.

---

## 11. Where the documents and the tree disagree

### 11.1 `docs/a16-scope.md` vs the tree

| # | The scope doc says | The tree says | Consequence |
|---|---|---|---|
| 1 | A16-1 and A16-2 are work to dispatch concurrently | Both landed: `6ecc226`, `e9670d1` | Sections 6.1-6.3, 6.5, V1-V28, S1-S23 are history |
| 2 | The panel is **995**, "5 free", "a HARD BLOCKER" | **966**, both tools, 34 free | The extraction is owed but is sized against 46 lines of additions, not a wall |
| 3 | `GradingResults.tsx` is **916** with a standing extraction debt | **892** - discharged by A16-1 | No wave owes it |
| 4 | `gradingResultsHelpers.test.ts` is **963**, "37 from the ceiling" | **505** - split by `e1a6782` | The named squeeze is gone |
| 5 | `handleGradeAll` `:537`; `submissions` `:561-565`; `<GradingTable>` `:969`; Autocomplete `:797-806` | `:538`; `:551-556`; `:938`; `freeSolo` `:767`, `onInputChange` `:770` | **-10 to -31 at the edit points.** 5.4 re-pins; every brief cites by symbol |
| 6 | 6.2 returns **41** paths; 6.4 returns **51** | **50** and **54** | 6.4 misses `submission-kind-callsites.structure.test.ts`, which A8-R added and which asserts on the panel |
| 7 | Four canary-3 roots at `:213-218` | **Five**, at `:213-223`, the fifth being A16-1's `classTrendsEntry.ts`; the `it()` title at `:209-210` names them | Wave 2 adds a sixth AND edits the title |
| 8 | `grading-rows.ts` 308, `grading-row.ts` 413, `grading-feedback-prompt.ts` 187, `grading-row-serialization.ts` 326, `useGradingRows.ts` 475, `grading-submission-grade.ts` 192, `ClassTrendsPanel.tsx` 201, `offline-payload.ts` 343 | 394, 456, 215, 361, 520, 205, 212, 354 | Every one grew |
| 9 | The scope doc is "1226 lines" (per the backlog row) | **1499** by `@(Get-Content).Count` | The row's description of its own artifact is stale |
| 10 | Floor enforcement at `class-trends-draft.ts:154` | **`:168`** | Carried into section 8 |
| 11 | `this-repo.md` section 1 says the panel is 964 | 966 now, and 995 when the scope doc corrected the card to 995 | The card has been wrong in both directions. **Re-measure; adopt neither** |

### 11.2 This plan's own earlier errors, corrected here

Listed so a later round does not reintroduce them.

**Revision 0:** the six-path wave-2 x wave-3 intersection (three whole-repo gates,
one impossible mover, one path in neither input); the 19-path canary that counted
no published set; A18's set taken from a history document and enumerated 5 of 8;
the `docs/css-orphans.md` dangling pointer; the self-referential A16-4 step; the
unpinned META; the mixing sentence; the `:83` lint locus; the 9-line margin; the
`:506-518` auto-drain citation; the readdir enumeration with a phantom `:265`.

**Revision 1:** `assignmentName` derived from `row.assessment`, which is the same
live control's value frozen at mint - purity laundering provenance (5.5); the two
detectors that banned `assessmentLabel` outright and would have made the
precedented solution fail (9.3); the clause and its gate stating different
membership rules and disagreeing on `{label, undefined}`, so sabotage P7 did not
kill; a repo-wide `git status --short` beside an authorisation to run concurrently
(9.0); the reuse question never asked in 893 lines (5.5); A18's four-file set,
falsified in the same commit (3.6); RES-P-2 owned by a chunk that does not exist;
`modalAdoption` argued from one branch of a five-way OR; the Set A/B and
`readdirSync` ranges; eight minors collapsed into one row.

### 11.3 Confirmed correct, so no later round "fixes" them back

- `ALLOWED_OVERAGE` is at `src/file-size-ceiling.structure.test.ts:64`, not `:68`.
- `recording-split.structure.test.ts:219`'s `panelTargets.size === 11` passes
  **falsely** (hardcoded key list, not read from source). No wave reaches it.
- The lint baseline has exactly four warnings and zero errors.
- The auto-drain effect is `:507-519`, comment `:496-506` - the ruling's
  correction of revision 0, confirmed by my own measurement.
- `loadStoredGithubGradingRun` `:354`, `try {` `:356`, `getItem` `:357`.

---

## 12. What I could not determine

- **Whether the full suite is green at `bd94c60`.** I ran
  `npx vitest run src/app/components/ui/buttonVariant.test.ts src/file-size-ceiling.structure.test.ts`
  (2 files, 15 tests, passed) and `npx vitest run src/lib/no-emojis.test.ts
  src/source-bytes.structure.test.ts` (2 files, 21 tests, passed). **I did not run
  `npm test`, `npm run lint`, `npm run build` or `npx tsc --noEmit`** - the lint
  figure in 9.2 is the orchestrator's measurement of 2026-09-21, attributed there,
  and `tsc` has exactly one caller. Wave 0's implementer measures the real suite
  baseline.
- **Wave 1's extraction target is not named.** What to extract is an architecture
  decision. This plan owns the pass condition (<= 934 by both tools, a 32-line
  removal already demonstrated on this file) and the two constraints on how (5.6).
- **Wave 3's surface is not enumerated.** 3.5 is a floor and says so.
- **Whether `repo-grades` can produce a `GradingRun` without inventing one.**
  `RepoGradeCellEdit.rubricAreas` exists and `runBulkGrade` is a real batch over
  one folder with one shared rubric, so the ingredients are there - but I did not
  trace its run object to a boundary the way section 6 traces snapshot grading's
  absence. Wave 3's scoping does that, and it may find the same answer A24 got.
- **Whether `db747cc` swept in anything beyond A8-R's wave 2.** Its diffstat
  matches `docs/a8r-scope.md` section 11's wave 2 list path for path, but I did not
  read every hunk.
- **Whether wave 3 also needs a run-time capture rule.** 5.5 is written for the
  recording surface. Repo Grades fixes one shared rubric before the worker pool
  opens (`useRepoGradesBulkGrade.ts:299-318`), which LOOKS like a natural capture
  point, but I did not trace whether its folder label is a live control the way
  `assessmentLabel` is. Wave 3's scoping must ask 5.5's question of its own
  surface rather than assuming the answer.
