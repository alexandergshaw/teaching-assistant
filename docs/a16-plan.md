# A16 wave plan: what is left, cut into waves

Seat: WAVE PLAN, **revision 1** (cap of 2). Authored 2026-09-21, revising the
2026-09-21 original against `docs/a16-rulings.md`, which wins where it and this
file conflict.

**Tree state at authoring.** `git rev-parse --short HEAD` returns **`9fa01c3`**
on `main` - the commit that created rows A24 and A25. `git status --short`
returns exactly one path, `M docs/css-orphans.md`, which is **exempt from every
A16 gate** (ruling 3, section 9.0) and which I did not stage, revert or touch.
`git worktree list` shows the stale second worktree at
`.claude/worktrees/friendly-meninsky-8032bc`, detached at `8bc9c64`: **`Glob`
returns that copy FIRST**, so every wave gate is `git status --short` in THIS
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

## 0. Disposition of the check's findings

Entry gate 3: a revision round ships a table mapping each prior finding to
**kept**, **handed over** (naming receiver and obligation) or **withdrawn**
(with reason and any enforcer it protected). Nothing is silently dropped.

| Finding | Disposition | Where |
|---|---|---|
| **B3** - two set-membership rules at one gate | **FIXED.** One rule, stated once, applied to both sides | 3.0, 4.1 |
| **B2 + B4** - intersections not computed from the published sets; canary counted a set nobody published; A18's side read from a history document | **FIXED.** All four published sets re-derived, all six intersections recomputed and pasted, canaries now count published-set sizes | 3.2-3.5, 4.1 |
| **B1** - `docs/css-orphans.md` excused by a dangling pointer | **FIXED.** Ruling 3's exemption written into the gate verbatim | 9.0 |
| **B5 + B6** - both hand-overs pointed at nothing | **DISPOSED BY CREATION.** A24 and A25 exist at `docs/backlog.yml:440` and `:451` | 6, 10 |
| **M4** - the entry META is unpinned, and it is this row's silent-green | **FIXED, and it is the largest addition in this revision** | **5.5**, 9.3 |
| **M5** - the A16-4 exclusion leans on a mixing argument its own RES-P-7 contradicts | **STRUCK.** Only the run-boundary argument survives | 6 |
| **M1** - lint baseline "confirmed" in one section, "not run" in another; the locus is `84:10` not `:83`; the count was a hard pass condition | **FIXED.** Locus corrected, instrument attributed, pass condition re-stated as a comparison rather than a constant | 9.2 |
| **M2** - the A8-R discharge overstates what landed; 12 hinge-comment lines may still be owed | **SETTLED BEFORE WAVE 1, not during.** They are not owed, and the reason is a test, not an argument | 5.2 |
| **M3** - the 9-line margin contradicts its only cited precedent | **WITHDRAWN. Margin is 20**, the precedent's own number, and wave 1's target moves 945 -> **934** | 5.3 |
| Minors: auto-drain `:507-519` / comment `:496-506`; github store path and read line; floor enforcement `:168`; the readdir enumeration; modal-adoption does not belong in the intersection | **ALL CARRIED**, one with a measured conflict reported rather than adopted | 7, 11.2 |
| Tree-state and backlog citations stale | **RE-MEASURED.** Row now reads `state: 'planned'`; `owns: []` and `verify: null` are still stale and stay in the residual | header, RES-P-1 |

**Not reopened**, per the rulings file's own closing section, and not rebuilt
here: the reshaping claim and its three render paths, the shape decision and the
non-recursive `readdirSync`, the 966-line measurement and the discharged "hard
blocker", every A16-3 edit point, the five canary-3 roots and the `it()` title,
the git-bookkeeping finding, and the absence of a layer-B silent-green in the
adapter's four inert fields.

---

## 1. The finding that reshapes the item, and the shape it settles

**A16-1 and A16-2 shipped on 2026-09-20** (`6ecc226`, `e9670d1`). The check
re-traced this independently rather than taking this plan's word, and found
`GradingResults.tsx` rendered by three live panels - `GradingTab.tsx:427`,
`LiveFeedPanel.tsx:430`, `GithubGradingPanel.tsx:852` - covering four modes. Not
a dead mount. So `docs/a16-scope.md` sections 6.1-6.3, 6.5, V1-V28 and S1-S23 are
history. **This document plans A16-3, A16-5, and the disposal of A16-4.**

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
returns **13** on the same file with the same instrument, so the tool fires and
the zero is a real absence. Never `grep -P` here - it exits 0 without checking.

The zero holds because the test reads `RecordingTab.tsx` and `TabShell.tsx` by
name and `readdirSync`s `src/app/components/recording/` **non-recursively**.
The enumeration, corrected (ruling 7 - the original listed ranges the command
does not return, and included `:265`, which is a `path.resolve`, not a read):

```bash
grep -n "readdirSync\|readFileSync" src/app/components/recording/recording-split.structure.test.ts
# 48, 57, 70, 75, 86, 107, 145, 169, 268, 272, 279
```

Eleven hits, two of them `readdirSync` (`:70`, `:268`), both over
`src/app/components/recording/`. The test cannot see
`src/app/components/grading-recording/`, which is where every remaining A16 edit
to a recording surface lands.

**Two reasons the shape is right, in the order that matters.** A thirteenth strip
entry IS a destination, and "stop it being a destination" is what the owner
asked for; the counts are the second reason. And A16-1 already shipped this
shape on four surfaces with the suite green, so it is no longer a prediction.

---

## 2. The waves, and what each exports and who calls it

| # | Wave | What it does | Exports | Caller, IN THE SAME WAVE | Independently gateable? |
|---|---|---|---|---|---|
| **0** | Baseline | `docs/REGRESSION.md` entry **433** | nothing | n/a | **Yes** - docs only |
| **1** | A16-3a, panel headroom | Pure-assembly extraction out of `GradingRecordingPanel.tsx` to **<= 934** lines. No behaviour change | pure functions in a new `grading-recording/` leaf | `GradingRecordingPanel.tsx`, edited in this wave to call them | **Yes** - a line count plus an unchanged suite |
| **2** | A16-3b, the run cohort and the mount | `lastRunCohort` snapshot set once inside `handleGradeAll`; the adapter leaf; the META derivation (5.5); the cohort disclosure line; the gated `<ClassTrendsPanel>` mount | `toRunCohortEntry`, `hasTrendableCohort`, `cohortLabelSpread`, `runCohortMeta` (names are the implementer's; the *set* is fixed) | `GradingRecordingPanel.tsx`, edited in this wave | **Yes** |
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

Applied symmetrically, which is the half the original got wrong:

| Class | Treatment | Which files |
|---|---|---|
| **Certain edits** | In the set | the panel, the new leaves, the wiring test carrying the new assertions |
| **Conditional edits** - this wave's own change can force an edit here | In the set. A conditional edit is still a write, and concurrency does not care about the condition | wave 1's source-text tests that read the panel; `buttonVariant.test.ts`'s per-file pin on the panel |
| **Run-only gates** - the wave runs them and a red means the wave did something it said it would not | Out of every set; listed under gate commands | `file-size-ceiling.structure.test.ts`, `source-bytes.structure.test.ts`, `no-emojis.test.ts`, `modalAdoption.wiring.test.ts`, the CSS-orphan walker |

**Why the original's reading could not stand.** It put the three whole-repo
structural gates in every A16 wave's set while reading A18's set as edits only.
Under the wide reading no two items in this repo can ever be disjoint, because
`no-emojis.test.ts` asserts over the whole tree. The asymmetry alone produced
both of its conclusions.

**Why `modalAdoption.wiring.test.ts` is run-only and not a conditional edit**, a
point the original got wrong twice: `DIALOG_SITES` counts **files matched by
`isDialogSite`'s markers**, stated in the test's own comment at `:197`, and
`importsMuiDialog` (`:161-168`) requires a real MUI `Dialog` import. A plain
extracted `.ts` or `.tsx` leaf with no Dialog does not move it. Neither wave 1
nor wave 3 adds a Dialog.

**Why the two `grading-recording/` directory walkers are run-only for wave 2**,
although wave 2 adds a file to the directory they walk: `grading-rows.test.ts`'s
`ta-rec-grade-*` exact set (array at `:668-676`, walker at `:641-643` over
`grading-recording/` and `assessment-shared/`) moves only if the new leaf carries
a persisted key, and `submission-kind-callsites.structure.test.ts`'s Set A and
Set B exact lists (`:85-100`, `:108-118`, walker at `:42`) move only if it names
a submission-kind identifier. Wave 2 does neither. **The pass is green WITHOUT
editing them**, which is a stronger condition than listing them as editable.

### 3.1 The derivation command, with canaries

```bash
grep -rln "GradingRecordingPanel.tsx" src --include=*.ts --include=*.tsx | sort | wc -l
# 54   (docs/a16-scope.md section 6.4 recorded 51; A8-R added three files since)
grep -c "GradingRecordingPanel.tsx" src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts   # non-zero, must hit
grep -c "GradingRecordingPanel.tsx" src/lib/no-emojis.test.ts                                                   # 0, must miss
```

**The panel is not among the 54** - `grep -n "GradingRecordingPanel.tsx"` on
itself returns nothing; the file does not contain its own name. It is in the set
because it is what the waves edit, not because this command found it.

Of the 54, the subset that reads the panel **as source** or hardcodes its path
was separated by opening every hit:

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
`snapshot-grading/snapshot-autofire.structure.test.ts` (`:28`, `:246`) - the
last of which becomes a conditional edit anyway, for the line-shift reason in
section 7, not for this one.

### 3.2 Wave 0 - PUBLISHED SET (1 path)

```
docs/REGRESSION.md
```

Next entry number, measured rather than inferred - `grep -ac "^## "` does not
agree with this file's numbering and must not be used for it:

```bash
grep -an "^## " docs/REGRESSION.md | tail -1
# 44203:## 432. Snapshot grading fills the Strengths box, and says so when it cannot (A11)
```

**Next entry is 433.** Use the hyphenated `class-trends` when searching this
file: `grep -an "class trends"` (unhyphenated) returns 0 while
`grep -an "class-trends"` hits - an instrument that matches nothing looks exactly
like a clean result. `grep -a` stays the default here.

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

Paths 5-11 are **conditional edits**: wave 1 MOVES source out of the panel, and
each of those reads that source or counts something in it. That is the class
`docs/a16-scope.md` already documented for A16-1, where
`rubricBreakdownPercent.wiring.test.ts` would have gone red on a correct
refactor. Path 12 is the line-shift re-pin of section 7.

### 3.4 Wave 2 - PUBLISHED SET (6 paths)

```
src/app/components/grading-recording/GradingRecordingPanel.tsx
src/app/components/grading-recording/classTrendsRunCohort.ts        [NEW - adapter, predicates, META derivation]
src/app/components/grading-recording/classTrendsRunCohort.test.ts   [NEW - unit]
src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts
src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts
src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts
```

Wave 2 only ADDS to the panel; it moves nothing out, which is why the six
source-text tests that are conditional edits for wave 1 are run-only here.

The last path is not optional. The canary-3 roots array is at **`:213-223`**
(`grep -n "const roots = \[" ...` returns `213`; the closing `];` is at `223`),
currently five entries, the fifth being `classTrendsEntry.ts` which A16-1 added.
Wave 2's adapter leaf is built in render and handed straight to the panel, never
written anywhere, so it must be a **sixth root** or that claim is conventional
rather than checked. **And the `it()` title at `:209-210` enumerates the roots by
name** - adding one without editing the title ships a test whose own description
is false. `{ timeout: 30000 }` at `:211` is the precedent for any new walk.

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

**This is the least-derived of the four sets** - I did not open all 27. Wave 3 is
dispatched only after its own scoping pass re-derives it. Stated as a floor
rather than presented as a set: RES-P-5.

### 3.6 A18's LIVE set - PUBLISHED SET (4 paths)

Ruling 2. The original read A18's set from `docs/a18-scope.md`, a document this
plan's own thesis calls history, enumerated five of its eight file rows, and
dropped both server-action files. **A18's live set is `docs/a18-ac.md` criterion
A8's pass condition (`:408-412`), which `docs/a18-rulings.md` does not override**
(`grep -n "A8\b\|write set\|walkthrough-script-prompt" docs/a18-rulings.md`
returns one hit, at `:65`, and it is about a rendered string, not the write set):

```
src/lib/walkthrough-announcement-prompt.ts
src/lib/walkthrough-announcement-prompt.test.ts
src/lib/walkthrough-script-prompt.ts
src/lib/walkthrough-script-prompt.test.ts
```

A8's own pass condition adds: the diff does **not** touch
`WalkthroughAnnouncementPanel.tsx` (985/1000), and
`src/lib/prompt-announcement-prompt.ts:47` is a named regression surface whose
tests must stay green **without being edited** - a second consumer, not a write.

---

## 4. Disjointness, both senses

### 4.1 Exact path - recomputed under 3.0's rule, from the PUBLISHED sets

Sets written to files verbatim from 3.2-3.6, then intersected:

```bash
for f in w1 w2 w3 a18; do printf "%s = %s paths\n" $f "$(wc -l < $f.txt)"; done
# w1 = 12 paths
# w2 = 6 paths
# w3 = 6 paths
# a18 = 4 paths
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
cat w1.txt a18.txt | sort | uniq -d     # (empty)
cat w2.txt a18.txt | sort | uniq -d     # (empty)
cat w3.txt a18.txt | sort | uniq -d     # (empty)
```

**Canaries that count a set somebody published**, which the original's did not:

```bash
cat w2.txt w2.txt | sort | uniq -d | wc -l     # 6  = w2's published size
cat a18.txt a18.txt | sort | uniq -d | wc -l   # 4  = a18's published size
```

Both self-intersections return their own published cardinality, so `uniq -d`
fires AND its inputs are the sets named above. The empty results mean what they
say.

**What changed under the corrected rule.** The original reported six shared paths
between waves 2 and 3 and concluded they must sequence. **Three of those six were
whole-repo gates that no wave owns, one was `modalAdoption.wiring.test.ts` (which
3.0 shows cannot move for either wave), and one was in wave 3's set and in
neither wave 1 nor wave 2.** The real collision is **exactly one path** - the
canary-3 roots file, which the original had already identified as the only
genuine write collision among the six. The conclusion survives; the derivation
that reached it did not, and now does.

### 4.2 Informational independence

Computed from each side's stated write set.

| Pair | Does either establish a fact the other designs against? | Verdict |
|---|---|---|
| Wave 0 x wave 1 | Wave 0 records the behaviour wave 1 must not change. A baseline written after the change is not a baseline | SEQUENCE. Wave 0 first |
| Wave 1 x wave 2 | Totally. Wave 2's entire line budget is the number wave 1 produces, and both edit the panel | SEQUENCE. Wave 1 first |
| Wave 2 x wave 3 | Both append a root to the canary-3 array and edit the `it()` title; wave 2 fixes the adapter and META shape wave 3 copies | SEQUENCE. Wave 2 first |
| Wave 1 x wave 3 | File-disjoint, and neither establishes a fact the other assumes: wave 1 is a pure refactor of a file wave 3 never reads | **INDEPENDENT in both senses.** May run concurrently |
| **Any A16 wave x A18** | A18 edits two `src/lib` prompt modules and their tests. No A16 wave reads a prompt module; no A18 edit reads the panel, the trends panel or the canary-3 file (A8 explicitly excludes `WalkthroughAnnouncementPanel.tsx` and names its one regression surface as read-only) | **INDEPENDENT in both senses.** May run concurrently with any A16 wave |
| Wave 2 x **N13b** | N13b redefines `AreaTrend` to carry per-student attribution and broadens the signal from "scored below 60" to "missed any points" | **SEQUENCE. A16 first** - section 8 |

**Standing consent applies where it applies.** Wave 1 and wave 3 are disjoint in
both senses, as is A18 against any A16 wave. Cap is 2-3; wave 1 plus A18 is 2,
and idle sequencing costs the queue.

**Re-run all six intersections immediately before each dispatch.**
`parallel-disjointness.md` section 6 names "treating we checked disjointness once
as durable" as a failure mode, and this document is itself the evidence: the
artifact it was built on was computed at `4bd903e` and every number in it had
moved by `1809e71`, and A18's own live set had moved again by `9fa01c3`.

---

## 5. The line budget

### 5.1 The measurement

```powershell
@(Get-Content src/app/components/grading-recording/GradingRecordingPanel.tsx).Count   # 966
```
```bash
wc -l src/app/components/grading-recording/GradingRecordingPanel.tsx                  # 966
```

**966 by both tools. Thirty-four lines free.** `docs/a16-scope.md` section 4.6
calls this "a HARD BLOCKER" on the grounds that the file is 995 with 5 free; A8-R
wave 0 (`58a4254`) extracted it to 963 and `db747cc` added 3. Not reopened.

`LIMIT = 1000` at `src/file-size-ceiling.structure.test.ts:30`, compared with
`lineCount > limit` at `:129`, so exactly 1000 passes. `ALLOWED_OVERAGE` is at
`:64` to its closing `};` (`grep -n "ALLOWED_OVERAGE\|LIMIT = "` returns `30`,
`64`, `126`) and contains none of these files.

### 5.2 M2, settled BEFORE wave 1: the twelve hinge lines are NOT owed

The check is right that the original overstated the discharge. Measured:

```bash
git show db747cc -- src/app/components/grading-recording/GradingRecordingPanel.tsx
# +        submissionKind: r.submissionKind,
# +        onConfirmSubmissionKind={gradingRows.confirmSubmissionKind}
# +        onAcceptSuggestedKinds={gradingRows.acceptSuggestedKinds}
```

**Three lines landed, not fifteen.** `docs/a8r-scope.md` section 7 budgeted "up
to 12" more for a comment block at the grade map "explaining why the CONFIRMED
field and not the suggestion is what reaches the model - the hinge of G-R1/G-R3".
It was never written:

```bash
grep -n "G-R1\|G-R3\|suggestedSubmissionKind" src/app/components/grading-recording/GradingRecordingPanel.tsx
# (no output)
```

Canary on that zero: `grep -c "submissionKind" <same file>` returns a non-zero
count, so the instrument fires on the neighbouring token and the absence is real.

**They are not owed, and the reason is a test rather than an argument.** The
property the comment would have documented is enforced:
`submission-kind-callsites.structure.test.ts:85-100` asserts Set A - every file
naming `suggestedSubmissionKind` or `submissionKindCue` - with `toEqual` against
an **exact list of nine paths that does not include the panel**, and `:102-107`
re-asserts it against the composer files. If the panel ever names the suggestion
instead of the confirmed field, that exact-list assertion goes red. A comment
restating a pinned property is documentation, not an outstanding requirement, and
`docs/a8r-scope.md` section 10's residual register does not list it (its only
comment-related entry, RES-8, is about `grading-submission-grade.ts:109-112`).

**So wave 2's additions budget is 46, not 58**, and section 5.4's target holds.

### 5.3 M3, the margin: 20, not 9

The original halved its own precedent with no reason. Withdrawn. The precedent is
`docs/loop/this-repo.md` section 1's account of extracting a hook out of the
sibling `SnapshotGradingPanel.tsx`: it failed `npm run lint` on React Compiler's
`preserve-manual-memoization` naming a callback nobody touched, while tsc and the
whole suite stayed green, and the shipped workaround keeps a ref and its effect
in the panel and passes the ref into the leaf (roughly 8 lines).
`docs/a8r-scope.md` section 7 priced the margin at **20** on this exact file,
"named, not rounded", as two of those workarounds. **This plan uses 20.**

### 5.4 Wave 2's additions, derived, and wave 1's target

Edit points re-measured today
(`grep -n "handleGradeAll\|const submissions\|<GradingTable\|assessmentId =\|selectedCourse" src/app/components/grading-recording/GradingRecordingPanel.tsx`):

| Addition | Where, today | Lines |
|---|---|---|
| `import ClassTrendsPanel` | top | 1 |
| `import { adapter, predicates, meta }` from the new leaf | top | 1 |
| `import type { GradingRunCohort }` | top | 1 |
| `const [lastRunCohort, setLastRunCohort] = useState<...>(null)` | beside `logGradingRuns` at `:199` | 1 |
| Collect cohort rows in the apply loop; snapshot rows + `courseName` + the label set once | `handleGradeAll` at `:538`; `submissions` at `:551-556`; apply loop at `:578-584` | 5-8 |
| Hinge comment: why the cohort AND the meta come from the run, never from `assessmentLabel`, `selectedCourse` or `gradingRows.rawRows` | same place | 10-14 |
| Gated mount plus the cohort disclosure line | above `<GradingTable>` at `:938` | 8-12 |
| Hinge comment at the mount | same | 6-8 |
| **Total** | | **33-46** |

The comment allowance is not invented:
`grep -c "^\s*\(//\|/\*\|\*\|{/\*\)" src/app/components/grading-recording/GradingRecordingPanel.tsx`
returns **298** against 966 lines - 31 percent comment - and a hinge comment in
this directory runs 6 to 14 lines.

**Wave 1's target: `<= 934` by BOTH tools.** Derived: 1000 - 46 (high-end
additions, M2 settled) - 20 (the precedent's margin) = 934. That is at least
**32 lines removed** from 966.

**32 is demonstrated, not hoped.** A8-R's wave 0 removed exactly 32 from this
same file (995 -> 963), by extracting pure assembly and no hook. So the target is
a repeat of a landed result on the same file, not a new ask.

### 5.5 THE META CONTRACT - ruling 5, and it is this row's silent-green

The original pinned the cohort's **dependency set** and left the entry **meta**
unpinned. An implementer who writes `assignmentName={assessmentLabel}` passes
every gate the original stated - and `assessmentLabel` is the freeSolo
Autocomplete's `onInputChange` value, written on **every keystroke** (`freeSolo`
at `:767`, `onInputChange` at `:770`, `assessmentId = assessmentLabel.trim()` at
`:292`). That is the mid-keystroke mutation owner answer 3 exists to forbid,
arriving through the door the gate left open, and invisible here because nothing
renders.

**Where the three fields actually go, traced rather than assumed:**

```bash
grep -n "entry" src/app/components/drafted-grades/ClassTrendsPanel.tsx
# 77, 80  (prop)   91  computeClassTrends(entry)   101  body: JSON.stringify({ entry })   206  assignmentName={entry.assignmentName}
grep -n "courseName\|canvasUrl\|assignmentName" src/app/api/class-trends-insight/route.ts src/lib/grade/class-trends-insight.ts
```

| Field | Read by the panel? | Where it actually lands |
|---|---|---|
| `assignmentName` | **Yes**, `ClassTrendsPanel.tsx:206` -> `ClassTrendsDraftPanel.tsx:46` -> `composeClassTrendsDraft` | (a) **student-addressed copy**: `class-trends-draft.ts:185` renders `A note on ${assignmentName \|\| "this assignment"}, based on the N submissions graded so far:`; guarded up front by `containsForbiddenCompletenessPhrase(assignmentName)` at `:176`, above which the floor returns `below-floor` at `:168`. (b) **a model prompt**: `class-trends-insight.ts:154` emits `Assignment: ${input.assignmentName \|\| "(untitled assignment)"}` |
| `courseName` | No | crosses the wire: `ClassTrendsPanel.tsx:101` POSTs the WHOLE `{ entry }`, and `route.ts:78` reads it back |
| `canvasUrl` | No | same POST; `route.ts:80` reads it back |

So none of the three is inert, and `assignmentName` reaches students.

**RULING M-1: `courseName` is snapshotted at run time, never read at render.**
Source: `selectedCourse?.name ?? ""`. `selectedCourse` is derived at `:261` from
`courseId`, which the live Course control drives - so reading it at render is the
same live-control class as `gradingRows.rawRows`. Precedent in this same file:
`currentGradingLog` already does `courseName: selectedCourse?.name ?? ""` at
`:612`.

**RULING M-2: `assignmentName` is derived from the COHORT SNAPSHOT's distinct
`assessment` values, never from `assessmentLabel` or `assessmentId`.** Exactly
one distinct non-empty value across the snapshot rows -> that value. Zero, or
more than one -> `""`.

Three reasons, and the third is the one that decides it:

1. `""` is not a hole, it is the shipped fallback. `class-trends-draft.ts:185`
   already renders "A note on this assignment" for it, and `GradingTab.tsx`'s
   zip/canvas mount ships `""` today.
2. A single name is a LIE whenever the run spans labels, which
   `handleGradeAll` permits (RES-P-7). The multi-label case is exactly what the
   cohort disclosure line reports, so the heading stays silent while the
   disclosure speaks.
3. It closes the attack by CONSTRUCTION rather than by discipline: the field is
   a pure function of the snapshot, so there is no live value for an
   implementer to reach for.

**RULING M-3: `canvasUrl` is `""`, and the absence is measured.**

```bash
grep -c "canvasUrl" src/app/components/grading-recording/GradingRecordingPanel.tsx   # 0
grep -rn "canvasUrl" src/app/components/grading-recording/ | wc -l                   # 0
grep -c "gradingRows" src/app/components/grading-recording/GradingRecordingPanel.tsx # 47  (canary: the instrument fires)
```

There is no Canvas assignment on this surface. `""` is the only honest value, and
`route.ts:80` already coerces a non-string to `""`.

**All three fields therefore live on `lastRunCohort` and are produced by the same
pure leaf as the cohort rows.** The gate that pins this is in 9.3; the sabotages
that prove it are P7 and P8.

### 5.6 Two constraints on HOW wave 1 extracts

- **Move pure assembly. Do not move a hook.** `this-repo.md` section 1's
  `preserve-manual-memoization` account; A8-R's wave 0 obeyed it and passed.
  Whether it generalises to this panel is unverified - RES-P-4.
- **`ui/buttonVariant.test.ts:157` pins this panel at exactly 3 primary
  buttons.** Extracting into a `.ts` leaf (pure assembly, no JSX) does not move
  it. If a `.tsx` is unavoidable and carries a Button, the count is bumped in the
  same commit with the reason. `modalAdoption.wiring.test.ts` does **not** move
  for a plain extracted `.tsx` - see 3.0.

Other files a wave writes, all `@(Get-Content).Count` today, none near the
ceiling: `grading-recording/GradingRecordingPanel.tsx` **966**;
`drafted-grades/classTrendsDraft.not-postable.test.ts` 232;
`repo-grades/index.tsx` **913** (wave 3's own squeeze point, inheriting the same
extract-before-adding rule); `repo-grades/RepoGradesGrid.tsx` 643.

---

## 6. A16-4 is disposed to row A24, not planned here

**The load-bearing argument, and now the only one: snapshot grading has no run
boundary.** Re-measured, canary-paired:

```bash
grep -n "assessmentId\|courseScope\|assessmentLabel" src/app/components/snapshot-grading/SnapshotGradingPanel.tsx
# (no output)
grep -c "useState" src/app/components/snapshot-grading/SnapshotGradingPanel.tsx
# 21  - canary: the instrument fires on the same file
```

No course field, no assessment field, and each grade resolves ONE row - there is
no `handleGradeAll` to be the boundary. Every candidate delimiter is an
invention. The check re-verified this independently and the factual ruling is not
reopened.

**STRUCK per ruling 6, and recorded as struck so no later round cites it as
precedent:** the original also argued that mounting there "would ship the
cross-assignment mixing owner answer 1 put out of scope". That contradicts this
plan's own RES-P-7, which ACCEPTS exactly that mixing on the recording surface
and discloses it instead. If mixing is disclosable on one surface it is
disclosable on the other. Only the run-boundary argument stands.

**Disposal, with a receiver that exists.** `docs/backlog.yml:440` is row **A24**,
"TRENDS ON SNAPSHOT GRADING - the owner's second named grading tool", created at
`9fa01c3`. The original's step was "A16-4's own scoping, before any wave", which
was self-referential - nothing scheduled it, and `DEV_LOOP.md` step 0 rules that
closing an item DELETES it, so A16's waves landing would have erased the only
record of half the owner's ask. A24 now holds both halves.

Cross-assignment accumulation goes the same way: **`docs/backlog.yml:451`, row
A25**, created at the same commit. Obligation on its receiver: decide whether it
is a new accumulator or a re-grouping of `GradingDraftPayload.runs`, and whether
`class-trends.ts`'s cohort wording (`FORBIDDEN_COMPLETENESS_PHRASES` at `:27-32`,
and `buildAreaSummary` emitting "Across the N submissions graded so far")
survives it.

---

## 7. The line-shift obligation, priced

Wave 2 inserts 3 imports at the top and one `useState` near `:199`, so everything
below `:199` shifts by **+4**. Wave 1's extraction shifts by a larger, negative,
implementer-determined delta.

| Artifact | Citation | State today | Owner of the re-pin |
|---|---|---|---|
| `snapshot-grading/snapshot-autofire.structure.test.ts:28` and `:246` | `GradingRecordingPanel.tsx:506-518` | **Accurate to within one line, and the ruling's correction is confirmed by my own measurement**: `sed -n '494,522p' \| cat -n` puts the comment at **`:496-506`** and the `useEffect(` at **`:507`**, closing at `}, [pendingFrames, extracting, runExtraction]);` at **`:519`**. So the construct is `:507-519`. The original's `:506-518` was off by one at both ends. | **Wave 1, then wave 2 again after its own +4.** In both published sets for this reason alone; it is a comment, not an assertion, so it never goes red and will be missed unless named |
| `module-deck-capture/ModuleDeckCapturePanel.wiring.test.ts:215` | `GradingRecordingPanel.tsx:493-510` as "the run log control" | **ALREADY STALE at HEAD** - that range is the auto-drain effect's comment block. A8-R wave 0 moved it | Not a wave's to fix; wrong before any A16 edit. **RES-P-2** |
| `docs/a16-scope.md` sections 2.2, 4.6, 6.4, 7, 8 | `:537`, `:561-565`, `:598-603`, `:797-806`, `:969` | **ALL STALE.** Today: `handleGradeAll` `:538`; `const submissions` `:551-556`; `freeSolo` `:767` with `onInputChange` `:770`; `<GradingTable` `:938` | **This plan** - section 5.4 re-pins every edit point wave 2 needs |
| `docs/backlog.yml` A16 row | row is now `state: 'planned'`, but `owns: []` and `verify: null` | Partly reconciled; the two fields are genuinely stale | **RES-P-1** |

**The rule this enforces.** Every wave brief cites the panel BY SYMBOL -
`handleGradeAll`, `const submissions`, the `<GradingTable>` call, the assessment
`Autocomplete` - never by line. `docs/a16-scope.md` section 9 correction 9
records an implementer told to delete `grading-submission-grade.test.ts:118`
deleting the `feedback` assertion instead of the `rubricAreas` one, with the
suite staying green.

---

## 8. Sequencing against N13a and N13b

**N13a is independent in both senses and may run in any slot.** Its owed work
(`docs/backlog.yml:139`) is removing `DEFAULT_CLASS_TRENDS_DRAFT_FLOOR = 5` at
`class-trends-draft.ts:18`, its enforcement - **`:168`**, measured
(`sed -n '163,172p'` puts `if (report.totalResults < floor)` there; the original
and `docs/a16-scope.md` both said `:154`) - and the stale comment at `:86-88`. No
A16 wave writes `src/lib/grade/class-trends-draft.ts`; A16 is placement and
disclosure, never computation. Intersection with all four published sets: empty.

Informational check: removing the floor makes layer C compose below 5 graded
submissions, changing what a small run shows on the new mounts. Wave 2's gate is
`hasTrendableCohort`, not the draft floor, so it does not design against it.
Independent in both senses.

**N13b MUST FOLLOW A16.** The exact-path coupling shrank to one path once A16-1
landed (`classTrendsDraft.not-postable.test.ts`); the facts test is what forces
the order:

- N13b's part (b) redefines `AreaTrend` to carry per-student attribution -
  `percentValues` is an anonymous `number[]` today (`class-trends.ts:124-150`).
- N13b's threshold changes what counts as a signal: three or more students who
  MISSED POINTS - any deduction - not the shipped low-score rule.
- Wave 2's cohort line and wave 3's per-folder adapter both design against what
  the panel reports. Building them while N13b concurrently redefines it is
  `parallel-disjointness.md` section 1 case 2: individually coherent, mutually
  incompatible, invisible until integration.

**The coupling is benign rather than blocking**, and that is now a claim about
landed code: `classTrendsEntry.ts`'s `toClassTrendsEntry(run, meta)` returns
`{ ...meta, run }` - `run` by reference - so N13b enriches all four LMS mounts
with no placement work. Wave 2's adapter CONSTRUCTS results from rows, so it must
emit `student: row.studentName` and no `userId` key, which is what keeps N13b's
enrichment reaching the recording mount too. That is a requirement on wave 2, not
a note.

**Recommended order:** N13a concurrent with anything; A18 concurrent with any A16
wave; waves 0 -> 1 -> 2 -> 3, with wave 3 free to run concurrently with wave 1;
N13b after wave 3.

---

## 9. The gate for each wave

### 9.0 The standing gate, every wave

```powershell
git status --short          # in THIS checkout, diffed against the wave's published set
```

**Pass: every path printed is in the wave's published set, OR is
`docs/css-orphans.md`.** Ruling 3: that file has been dirty all session from
outside the loop. **Do not stage it, do not revert it, do not mention it in a
report except to say it was left alone.** The exemption is written here because
an implementer facing an unexplained dirty path either fails the gate or "cleans
up" another agent's file - the recorded class where one agent's repo-wide git
operation reverted every sibling's work.

No path may be under `.claude/worktrees/`. A report is not evidence.

Forbidden in every brief, by name: **`git add -A`** (one swept an implementer's
unverified mid-flight work onto main here) and **`git stash`** (one reverted
every sibling's files here). Stage explicit paths. Never `git checkout --` on an
uncommitted file - it reverts to the index and destroys the wave's work; restore
from a `cp` backup.

**`npx tsc --noEmit` has exactly ONE caller** - the wave gate, run once, after
the wave reports and while nothing is mid-sabotage. It races on
`tsconfig.tsbuildinfo` (`tsconfig.json` sets `"incremental": true`; gitignored at
`.gitignore:41`). No implementer runs it. **No private worktree**: junctioning
`node_modules` into a throwaway worktree empties the real one here.

**No two agents sabotage-verify at once.** During a sabotage window every
concurrent measurement by a sibling is untrustworthy even with a perfect restore.

**Run-only gates, owned by no wave** (3.0), run by every wave, and the pass is
green WITHOUT editing them: `src/file-size-ceiling.structure.test.ts`,
`src/source-bytes.structure.test.ts`, `src/lib/no-emojis.test.ts`,
`src/app/components/ui/modalAdoption.wiring.test.ts`. Never hand-roll the emoji
scan and never paste a gate's own output into a doc - `grep -P` reports clean
here without checking, and gate output carries check and cross marks.

### 9.1 Wave 0 - baseline

| Instrument | Pass |
|---|---|
| `grep -an "^## " docs/REGRESSION.md \| tail -1` before and after | before names 432, after names **433** |
| `npx vitest run src/lib/no-emojis.test.ts` | green - the rule covers `docs/` |
| `npx vitest run src/source-bytes.structure.test.ts` | green - `Write`/`Edit` materialise a `\uXXXX` escape as the literal byte |
| `git status --short` | `docs/REGRESSION.md`, or that plus `docs/css-orphans.md` |

### 9.2 Wave 1 - A16-3a, panel headroom

| Instrument | Pass |
|---|---|
| `@(Get-Content src/app/components/grading-recording/GradingRecordingPanel.tsx).Count` **and** `wc -l` on the same file | both return **<= 934**, and both return the SAME number. A disagreement means one tool is wrong and the count is not a fact yet |
| `npx vitest run src/file-size-ceiling.structure.test.ts` | green, without editing `ALLOWED_OVERAGE` |
| `npx vitest run src/app/components/ui/buttonVariant.test.ts` | green. If `FROZEN_PRIMARY_SITES:157` must move, it moves in the same commit with the reason |
| one `npx vitest run` **per path** over the six source-text tests of 3.3 | green. `AddKnowledgePages.test.ts` asserts JSX gate ORDER and is the one an extraction is most likely to move. **Single path per invocation** - a multi-path run silently drops a path that matches nothing and exits 0 |
| `npm run lint` | **no MORE warnings than the count measured on the pre-change tree in this same wave.** Orientation only, not a constant: measured by the orchestrator 2026-09-21 as 4 problems / 0 errors / 4 warnings, at `RecordingTab.tsx:347`, `repoGradesSliceA.guards.test.ts:84:10`, and two in `canvas-modules/new-quiz.test.ts`. **I did not run it.** The original made a transcribed figure a hard pass condition and got the second locus wrong by one line, which is the tell that it was transcribed |
| `npm test` | exit 0, and `Test Files` / `Tests` totals not below the baseline **measured on the pre-change tree in this same wave**. Do not carry `this-repo.md`'s 1017/20200 (2026-09-13) or A8-R's 1076/21444 |
| `npx tsc --noEmit` (wave gate only) | **no output at all**, exit 0 |
| `npm run build` | the line `Compiled successfully` is present. **Do not gate on the exit code** - it exits 1 in the env-dependent prerender tail and the page named varies between runs |

**What a pass does NOT prove:** that the panel still renders. Nothing renders.

### 9.3 Wave 2 - A16-3b, the cohort, the META and the mount

Everything in 9.2 except the `<= 934` row, plus:

| Instrument | Pass |
|---|---|
| `npx vitest run .../classTrendsRunCohort.test.ts` | the per-row mapping over an **enumerated product** of the four `AssessmentRowState` members (`"pending" \| "grading" \| "ready" \| "failed"` - four, not three) x {areas, no areas}. Never a hand-written list of five |
| same file | `Object.keys(emitted)` does not contain `userId`, and `JSON.stringify(emitted)` does not contain `"userId"`. `GradedResult.userId` is optional, so `tsc` permits an adapter that emits it - this is the only runtime enforcer |
| same file | `computeClassTrends(adapter(cohort)).totalResults` equals the count of `"ready"` rows. An inflated N reaches `buildAreaSummary` and a sentence addressed to STUDENTS |
| same file | the cohort line reports "more than one label" when the snapshot rows carry two distinct `assessment` values, counting `undefined` as one |
| **same file - THE META PIN (5.5)** | the meta is a **pure function of the snapshot**, enumerated over {0 distinct labels, 1 distinct label, 2 distinct labels, 1 label plus `undefined`}: `assignmentName` is the single value ONLY in the 1-distinct case and `""` in the other three; `courseName` equals the snapshot's own `courseName`; `canvasUrl` is `""`. **Without this row an implementer ships `assignmentName={assessmentLabel}` and passes everything else** |
| `npx vitest run .../GradingRecordingPanel.wiring.test.ts` | a source-text assertion that the cohort setter's expression mentions none of `assessmentLabel`, `assessmentId`, `filterText`, `sort`, `gradingRows.rows`. Pin the fact and the ordering, never the spelling |
| **same file - THE META SOURCE PIN** | a source-text assertion, **scoped to the adapter/mount call expression only**, that it mentions none of `assessmentLabel`, `assessmentId`, `selectedCourse`, `courseId`, `courses`, `gradingRows.rows`, `gradingRows.rawRows`, `filterText`, `sort`. Every one of those is a live control, and the meta must come from `lastRunCohort` exactly as the rows do |
| same file | a whole-file form of either detector is **RED at HEAD before any wave-2 code exists** - `grep -n "gradingRows\.\(rawRows\|rows\)" src/app/components/grading-recording/GradingRecordingPanel.tsx` returns pre-existing legitimate hits - so an implementer who writes the file-wide form will find it red and loosen it rather than fix it. **The detectors MUST be narrow** |
| same file | the panel imports AND renders `<ClassTrendsPanel` above `<GradingTable>`. **Detector plus canary**: prove the detector returns false on a dead import and on a local reimplementation, in the shape `gradingResultsExtraction.wiring.test.ts` already uses four times |
| `npx vitest run .../classTrendsDraft.not-postable.test.ts` | green with the adapter leaf as a **sixth** root at `:213-223` **and the `it()` title at `:209-210` updated to name it**. Explicit `{ timeout: 30000 }` on any new walk, per `:211` |
| `npx vitest run .../grading-rows.test.ts` and `.../submission-kind-callsites.structure.test.ts` | **green WITHOUT being edited.** Their exact lists (`:668-676`; `:85-100`, `:108-118`) must not move. A red here means wave 2 added a persisted key or named a submission-kind identifier, both of which it said it would not |

**Sabotages, watched failing and restored**, minimum set:

| # | Mutation, IMPLEMENTATION only | Goes red in |
|---|---|---|
| P1 | Delete the `<ClassTrendsPanel .../>` tag | the mount assertion. Also the leverage removal test |
| P2 | Keep the mount, remove the trendable-cohort guard | the guard assertion. Without it the panel renders a Button reading `Trends (0)` |
| P3 | Derive the cohort from `assessmentId` | the dependency-set assertion. The mutation owner answer 3 forbids |
| P4 | Resolve the cohort against `gradingRows.rawRows` by id at render | the narrow snapshot assertion. Proves the detector is narrow enough to discriminate, since the file-wide form is red at HEAD anyway |
| P5 | Emit every cohort row as a `GradedResult` | the `totalResults` assertion |
| **P6** | `assignmentName: assessmentLabel` at the mount | **the META SOURCE pin.** The exact silent-green ruling 5 names |
| **P7** | In the leaf, return the FIRST row's `assessment` instead of the distinct-set rule | **the META unit pin**, 2-distinct and 1-plus-undefined cells |
| P8 | Read `selectedCourse?.name` at render instead of the snapshot's `courseName` | the META SOURCE pin |
| P9 | Add `import { postCanvasGradesAction }` to the adapter leaf | the canary-3 walk. Without this, the root addition is an assertion about code nobody proved is load-bearing |

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
collected, no jsdom, no testing-library, no render call. Therefore: that the
panel APPEARS beside the run, that `defaultExpanded` opens it, that the cohort
line is legible and reads as disclosure rather than as an error, and that the
panel VANISHES after a reload rather than disclosing why, are all reading claims.

**No `.env` and no API key**, so layer B - `src/app/api/class-trends-insight/route.ts` -
cannot be exercised end to end. `vitest.setup.ts` replaces `fetch` with a
throwing stub. Mock `callLlm` on an LLM path and `canvasFetch` on a Canvas path,
never `fetch` - a live 401 once made a sabotage check pass for the wrong reason.

Each routes to owner verification in section 10, with an owner, an instrument and
a step. None is left as an implied assumption.

---

## 10. Residual register

Every entry names an owner, an instrument, and the step that will measure it. An
entry missing any of the three is a deletion and would be called that. **Both
hand-overs now name a backlog row id rather than a hope** (ruling 4).

| ID | Residual | Owner | Instrument | Step that will measure it |
|---|---|---|---|---|
| **RES-P-1** | `docs/backlog.yml:352` now reads `state: 'planned'` but still carries `owns: []` and `verify: null`, and its note records neither landing (`6ecc226`, `e9670d1`) nor the stale panel citations. An entry that stays open after work landed teaches the next session to redo it | The orchestrator, at the next push | `git log --oneline \| grep -i a16` against the row's own text | The push that closes wave 2 |
| **RES-P-2** | `ModuleDeckCapturePanel.wiring.test.ts:215` cites `GradingRecordingPanel.tsx:493-510` as "the run log control"; that range is the auto-drain effect's comment block. **Already wrong at HEAD**, before any A16 wave | The implementer of the next chunk that writes `module-deck-capture/` | `sed -n '493,510p'` on the panel against the comment's claim | That chunk's wave gate. Not widened into an A16 wave - correcting a comment in a file A16 does not touch buys no gate |
| **RES-P-3** | **A16-4 is disposed, not planned.** Snapshot grading has no run boundary (section 6) | **Row A24, `docs/backlog.yml:440`**, created at `9fa01c3` | A24's own `instrument` field, which carries the canary-paired grep | **A24's scoping pass**, scheduled by the backlog like any row - no longer self-referential |
| **RES-P-4** | Whether wave 1's extraction trips React Compiler's `preserve-manual-memoization` is unverified. `this-repo.md` section 1 records it on the sibling panel, naming a callback nobody touched, with tsc and the suite green | Wave 1's implementer | `npm run lint` against the count measured on the pre-change tree in the same wave | Wave 1's gate (9.2). Workaround if it fires: keep the ref and its effect in the panel, pass the ref into the leaf |
| **RES-P-5** | **Wave 3's published set is a FLOOR**, derived without opening all 27 hits. An identifier-shaped zero looks exactly like a real absence | Wave 3's scoping pass | Re-derive by what a grading surface puts ON SCREEN - a per-student score column, a rubric-area breakdown, a "Grade" button - not only by type name; report what this missed | Wave 3's scoping, before dispatch |
| **RES-P-6** | **The recording tool's trends do not survive a reload** - `lastRunCohort` is `useState` and `rubricAreas` is deliberately not persisted (the 16-key wire oracle is unchanged). **Inconsistent across surfaces**: the github path's run IS restored - `loadStoredGithubGradingRun` at `src/lib/github-grading-run-store.ts:354`, reading `localStorage.getItem(RUN_KEY)` at `:357` - so its trends survive, while recording, zip/canvas and livefeed do not | The repo owner | Grade a batch on each of the four surfaces, reload each, compare | An owner observation after wave 2's push. Upgrade path if rejected: persist the resolved cohort rows under a new `ta-rec-grade-*` key, which moves the exact set at `grading-rows.test.ts:668-676` |
| **RES-P-7** | **The recording table is course-scoped but not assessment-scoped**, so one `handleGradeAll` click can grade two assignments' rows against one rubric. Wave 2 DISCLOSES this rather than preventing it, and 5.5's META rule makes the heading go silent while the disclosure speaks. Whether that reads clearly is not checkable here | The repo owner | An owner observation of a run over a table holding two labelled assessments | After wave 2's push |
| **RES-P-8** | **Nothing renders.** Every claim in 5.5, 6 and 9.5 about what the instructor sees is a reading claim | The repo owner | Opening the app in a browser with real env vars | An owner observation after wave 2's push. This checkout has no `.env` |
| **RES-P-9** | **A16-1 and A16-2 shipped with NO `docs/REGRESSION.md` baseline.** Newest entry is 432 (A11's); there is no A16 entry | The baseline seat, in wave 0 | `grep -a` with the **hyphenated** `class-trends`; read the tail for the next number rather than inferring it from `grep -ac "^## "`, which does not agree with the numbering | **Wave 0**, before wave 1 is dispatched |
| **RES-P-10** | **A8-R's wave 2 landed inside `db747cc`, a commit whose message describes only a docs relocation for A18.** The work is present and correct; the bookkeeping is wrong. Named so the next pass does not read the log, conclude A8-R wave 2 is outstanding, and hold `grading-recording/` against A16-3 for nothing | The orchestrator | `git show --stat db747cc` against `docs/a8r-scope.md` section 11's wave 2 list | Before wave 1 is dispatched - it is the fact that FREES `grading-recording/` |
| **RES-P-11** | **A measured conflict with ruling 7, reported rather than adopted.** The ruling states the github store read is `:356`. Measured: `sed -n '353,358p' src/lib/github-grading-run-store.ts \| cat -n` puts `loadStoredGithubGradingRun` at **`:354`**, `try {` at **`:356`**, and `localStorage.getItem(RUN_KEY)` at **`:357`**. I have adopted neither value silently - RES-P-6 cites both symbols with both numbers | The orchestrator | The `sed \| cat -n` command above, re-run | Before the next round adopts either figure |

**Handed over, with receivers that exist:** trends on snapshot grading -> **A24**
(`docs/backlog.yml:440`). Cross-assignment accumulation -> **A25**
(`docs/backlog.yml:451`). Obligations in section 6.

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
| 8 | `grading-rows.ts` 308, `grading-row.ts` 413, `grading-feedback-prompt.ts` 187, `grading-row-serialization.ts` 326, `useGradingRows.ts` 475, `grading-submission-grade.ts` 192, `ClassTrendsPanel.tsx` 201, `offline-payload.ts` 343 | 394, 456, 215, 361, 520, 205, 212, 354 | Every one grew; A16-2 and A8-R both landed through this directory |
| 9 | The scope doc is "1226 lines" (per the backlog row) | **1499** by `@(Get-Content).Count` | The row's description of its own artifact is stale |
| 10 | The `ta-rec-grade-*` set is at `grading-rows.test.ts:508-516`; `docs/a8r-scope.md` says `:425-437` | **`:668-676`**; the walker is at `:641-643` | Two documents, two different wrong numbers, one array |
| 11 | Floor enforcement at `class-trends-draft.ts:154` | **`:168`** | Carried into section 8 |
| 12 | `this-repo.md` section 1 says the panel is 964 | 966 now, and 995 when the scope doc corrected the card to 995 | The card has been wrong in both directions. **Re-measure; adopt neither** |

### 11.2 This plan's own revision-0 errors, corrected here

Listed so a later round does not reintroduce them: the six-path wave-2 x wave-3
intersection (three whole-repo gates, one impossible mover, one path in neither
input); the 19-path canary that counted no published set; A18's set taken from a
history document and enumerated 5 of 8; the `docs/css-orphans.md` dangling
pointer; the self-referential A16-4 step; the unpinned META; the mixing sentence;
the `:83` lint locus; the 9-line margin; the `:506-518` auto-drain citation; the
readdir enumeration with a phantom `:265` and invented ranges.

### 11.3 Confirmed correct, so no later round "fixes" them back

- `ALLOWED_OVERAGE` is at `src/file-size-ceiling.structure.test.ts:64`, not
  `:68`. `grep -n "ALLOWED_OVERAGE\|LIMIT = "` returns `30`, `64`, `126`.
- `recording-split.structure.test.ts:219`'s `panelTargets.size === 11` passes
  **falsely** (hardcoded key list, not read from source). No wave reaches it.
- The lint baseline has exactly four warnings and zero errors.

---

## 12. What I could not determine

- **Whether the full suite is green at `9fa01c3`.** I ran
  `npx vitest run src/app/components/ui/buttonVariant.test.ts src/file-size-ceiling.structure.test.ts`
  (2 files, 15 tests, passed) and `npx vitest run src/lib/no-emojis.test.ts
  src/source-bytes.structure.test.ts` (2 files, 21 tests, passed). **I did not
  run `npm test`, `npm run lint`, `npm run build` or `npx tsc --noEmit`** - the
  lint figure in 9.2 is the orchestrator's measurement of 2026-09-21, attributed
  there, and `tsc` has exactly one caller. Wave 0's implementer measures the real
  suite baseline.
- **Wave 1's extraction target is not named.** What to extract is an architecture
  decision. This plan owns the measurable pass condition (<= 934 by both tools,
  a 32-line removal already demonstrated on this file by A8-R wave 0) and the two
  constraints on how (5.6).
- **Wave 3's surface is not enumerated.** 3.5 is a floor and says so.
- **Whether `repo-grades` can produce a `GradingRun` without inventing one.**
  `RepoGradeCellEdit.rubricAreas` exists and `runBulkGrade` is a real batch over
  one folder with one shared rubric, so the ingredients are there - but I did not
  trace its run object to a boundary the way section 6 traces snapshot grading's
  absence. Wave 3's scoping does that, and it may find the same answer A24 got.
- **Whether `db747cc` swept in anything beyond A8-R's wave 2.** Its diffstat
  matches `docs/a8r-scope.md` section 11's wave 2 list path for path, but I did
  not read every hunk.
- **The github-store read line**, where my measurement and ruling 7 disagree by
  one. RES-P-11 carries both with the command.
