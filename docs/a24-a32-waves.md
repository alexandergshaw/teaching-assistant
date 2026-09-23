# Wave plan: A24 and A32

Build-ready. Two accepted designs (`docs/a24-scope.md`, `docs/a32-scope.md`,
revision 2, commit 530800e) plus two binding owner decisions
(`docs/owner-decisions-2026-09-23.md` DECISIONS 4 and 5, commit 0dd1a33) turned
into waves an implementer executes without a judgement call.

**What this document may not do.** Both scopes have used their two rounds.
Under `AGENTS.md`'s "Two rounds, then ask" and `iteration-caps.md` cap 2 there
is no round 3, so nothing here re-argues either design. Where the scopes and
`docs/a24-a32-check.md` disagree, the revision already adjudicated it and this
plan carries the revision. Where something is genuinely still undecided, it is
named in section 9 and routed to the owner rather than chosen silently.

**What this document adds that neither scope has.** Six things, each measured
in this pass and each of a kind that has shipped a green gate over a broken
build in this repo before:

1. A hard EXACT-PATH collision between A24 and A39 on two files (section 3).
2. The directory-sweep and count-pin tests that no file list shows, and which
   turn red when a wave merely ADDS a file (section 4).
3. A third instrument inside `snapshot-row-serialization.test.ts` that an 18th
   row field moves, which neither scope named (section 5.3).
4. The measured call-site cost that makes A24 wave 0's 928 target unreachable
   by per-block extraction (section 5.1).
5. The mechanical consequence of the A32 naming contract: the existing
   structure test anchors on the literal substring `label="Timing"`, so the
   naming decision is enforced by an already-landed assertion (section 6.4).
6. The line-shift price of both wave 0s, computed, with an owner (section 7).

Every quantity below names the command that produced it. No file under `src/`
was edited to produce any measurement here; `git status --short` at the end
proves the write set, which is exactly this one new file.

---

## 1. Measurement preamble

Two line-counting instruments disagree in this checkout. `this-repo.md`
section 3 records a 42-line gap on one file. Measured this pass with all three
available counters, the gap is different on every file, and two of these are
larger than any figure previously recorded here:

```powershell
$files=@("src/app/components/snapshot-grading/SnapshotGradingPanel.tsx",
         "src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx",
         "src/app/components/walkthrough-announcement/AnnouncementDraftSlot.tsx",
         "src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.ts",
         "src/app/components/walkthrough-announcement/announcement-draft-slots.ts",
         "src/app/components/snapshot-grading/snapshot-row-serialization.ts",
         "src/app/components/snapshot-grading/useSnapshotGrade.ts",
         "src/app/actions/walkthrough-announcement.ts")
foreach ($f in $files) {
  $a=@(Get-Content $f).Count
  $b=(Get-Content $f | Measure-Object -Line).Lines
  Write-Output "$f GetContent=$a MeasureObject=$b diff=$($a-$b)"
}
```

| File | `@(Get-Content).Count` | `wc -l` (Bash tool) | `Measure-Object -Line` | gap |
|---|---|---|---|---|
| `src/app/components/snapshot-grading/SnapshotGradingPanel.tsx` | **970** | 970 | 908 | 62 |
| `src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx` | **985** | 985 | 918 | 67 |
| `src/app/components/walkthrough-announcement/AnnouncementDraftSlot.tsx` | **295** | 295 | 274 | 21 |
| `src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.ts` | **416** | 416 | 384 | 32 |
| `src/app/components/walkthrough-announcement/announcement-draft-slots.ts` | **513** | 513 | 482 | 31 |
| `src/app/components/snapshot-grading/snapshot-row-serialization.ts` | **253** | 253 | 238 | 15 |
| `src/app/components/snapshot-grading/useSnapshotGrade.ts` | **310** | 310 | 292 | 18 |
| `src/app/actions/walkthrough-announcement.ts` | **608** | 608 | 565 | 43 |
| `src/app/components/snapshot-grading/snapshot-grading.structure.test.ts` | **822** | 822 | 711 | **111** |
| `src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts` | **807** | 807 | 669 | **138** |
| `src/app/components/snapshot-grading/snapshot-row-serialization.test.ts` | **476** | 476 | 441 | 35 |
| `src/app/actions/walkthrough-announcement.test.ts` | **623** | 623 | 548 | 75 |
| `src/app/components/canvas-tab/announcements-panel.tsx` | **533** | 533 | 504 | 29 |

`@(Get-Content).Count` and `wc -l` agree on all thirteen files.
`Measure-Object -Line` is low on all thirteen, by between 15 and 138.
**Every line-count exit criterion in this plan is `@(Get-Content <file>).Count`
and no other instrument.** `LIMIT = 1000` at
`src/file-size-ceiling.structure.test.ts:41`; red at 1001.

One citation correction, because a wave is built from it. The scope places the
wave-1 argument assertion at `walkthrough-announcement.test.ts:565-571`; the
check places it at `:566-571`. Measured -
`grep -n "createAnnouncementFromMarkdown" src/app/actions/walkthrough-announcement.test.ts`
returns `:36, :61, :552, :553, :566, :575`, canary with a nonsense name exits 1
- the `toHaveBeenCalledWith` opens at **`:566`** and closes at `:571`. There is
exactly one such assertion in the file. Use `:566-571`.

---

## 2. Disjointness of A24 against A32, both senses

### 2.1 Exact-path, computed

File sets are edits PLUS the tests asserting on the changed behaviour, derived
by grep rather than from the descriptions:

```
grep -rln "SnapshotGradingPanel" src --include=*.test.ts
  -> snapshot-autofire.structure.test.ts, snapshot-grading.structure.test.ts,
     snapshot-role-setrole-callsites.structure.test.ts, src/loop-docs.structure.test.ts
canary: grep -rln "SnapshotGradingPanelXYZNOPE" src --include=*.test.ts  -> exit 1

grep -rlnE "SnapshotAssessmentRow|snapshot-row" src --include=*.test.ts
  -> snapshot-grade.test.ts, snapshot-auto-grade-decision.test.ts,
     snapshot-grading.structure.test.ts, snapshot-role-suggestion.test.ts,
     snapshot-row-serialization.test.ts, snapshot-row.test.ts,
     useSnapshotGrade.wiring.test.ts

grep -rlnE "snapshot-row-serialization|snapshotRowCodec|toWire|fromWire" src --include=*.test.ts
  -> grading-submission-extract.test.ts, assessment-row-store.test.ts,
     grading-row-serialization.test.ts, snapshot-grading.structure.test.ts,
     snapshot-row-serialization.test.ts, snapshot-row.test.ts
```

Two of those hits are CHECKED-SAFE rather than owned, and both were opened:

- `src/app/components/assessment-shared/assessment-row-store.test.ts:173` is an
  exact ten-key `Object.keys(wire)` oracle, but over `fixtureCodec`, not
  `snapshotRowCodec` (its own header at `:158-165` says why it cannot be the
  real codec). An 18th snapshot field does not move it.
- `src/app/components/grading-recording/grading-row-serialization.test.ts:735,740`
  pins `EXPECTED_WIRE_KEYS` for `gradingRowCodec`, a different surface's codec.

`src/loop-docs.structure.test.ts` reads `docs/loop/this-repo.md`, not the panel;
excluded deliberately, as the scope also does.

The two sets, and the mechanical intersection:

```
cat a24.txt a32.txt | sort | uniq -d
<no output>
control: cat a24.txt a24.txt | sort | uniq -d | wc -l   -> 10
```

Empty intersection; the control proves the pipeline prints duplicates when they
exist. All 19 paths were confirmed to exist on disk in the same pass. **A24 and
A32 are exact-path disjoint.**

### 2.2 Informational independence

The facts each item must assume to start, and who establishes each:

| Fact | Established by | Assumed by |
|---|---|---|
| React Compiler `preserve-manual-memoization` fires on hook extraction from a panel (`this-repo.md:85-100`) | already landed, neither item | both |
| 1.57x estimate-overrun factor from A16 (`git show --numstat --format="" cbe84e2`) | already landed, neither item | both |
| `LIMIT = 1000` at `file-size-ceiling.structure.test.ts:41` | already landed | both |
| the `ta-snap-*` exact key set | **A39, concurrently** (section 3) | A24 |
| the walkthrough `ta-` key COUNT (`distinctKeys.size === 5`) | neither, if both stay at 5 | A32 |
| `modalAdoption.wiring.test.ts` count pins (section 4) | **either wave that adds a .tsx** | both |

**A24 and A32 do not establish facts for each other.** They may run
concurrently, subject to section 4's shared instruments. That is a real saving
and it should be taken: idle sequencing costs the queue, and standing consent
covers disjoint work.

**A24 and A39 are NOT independent.** Section 3.

---

## 3. BLOCKING: A24 collides with A39 on two exact paths

`docs/a39-architecture.md` is in flight (its check landed this session as
`docs/a39-check.md`, untracked at the time of writing). Its own write-set table
claims, verbatim from the file:

```
grep -n "SnapshotGradingPanel\|snapshot-grading.structure" docs/a39-architecture.md
:889   | 3 | src/app/components/snapshot-grading/SnapshotGradingPanel.tsx | 970 |
         extraction FIRST, then +14 | target <= 940 | -le 940, same rule |
:1316  | src/app/components/snapshot-grading/SnapshotGradingPanel.tsx | edit |
         DELETE the asserted policy at :142-147 ... THE CALLER for
         ta-snap-rubric / ta-snap-assignment |
:1318  | src/app/components/snapshot-grading/snapshot-grading.structure.test.ts |
         edit, required | the exact set at :195-205 AND the test NAME at :195 |
:308   ... YES - add ta-snap-rubric and ta-snap-assignment, and rewrite that
         test NAME, which asserts the dropped policy in prose
```

canary: `grep -c "SnapshotGradingPanelXYZNOPE" docs/a39-architecture.md` returns 0.

Both items therefore write **`src/app/components/snapshot-grading/SnapshotGradingPanel.tsx`**
and **`src/app/components/snapshot-grading/snapshot-grading.structure.test.ts`**
by exact path. That is failure mode 1 in `parallel-disjointness.md` section 1:
one silently loses, and it does not surface as a conflict.

Three specific conflicts, not one:

1. **Two different numeric exit criteria on the same file.** A24 wave 0 exits
   at `<= 928` (derived: 1000 minus A16's measured +72). A39 wave 3 exits at
   `<= 940`. Both derivations are internally sound and only one extraction will
   happen. **I adopt neither silently.** If both features land, the arithmetic
   that satisfies both is `1000 - 72 (A24's feature) - 14 (A39's stated
   addition) = 914`, i.e. the extraction must reach **914 or lower**, not 928
   and not 940. Whether both land in one window is the orchestrator's call, not
   mine.
2. **A39 rewrites the exact `ta-snap-*` key set at
   `snapshot-grading.structure.test.ts:195-201`** (adding `ta-snap-rubric` and
   `ta-snap-assignment`) and rewrites the `it()` NAME. DECISION 4 is still true
   - A24's digest adds no key and needs no canary bump - but A24's wave gates
   RUN that file, so whichever item lands second inherits a changed expectation
   and must re-run, not re-derive.
3. **A39 also orders an extraction from the same panel.** Two extractions
   designed independently against the same 970 lines will each be correct and
   jointly wrong.

**Ruling for this plan: A24 and A39 are sequenced, never concurrent.** The
establisher runs first and the second is re-briefed with its output
(`parallel-disjointness.md` section 3, option 1). A32 is disjoint from both and
can run alongside whichever of the two goes first. Which of A24/A39 goes first
is a queue decision and belongs to the orchestrator; residual RES-W-1 carries
it with an owner and a step.

---

## 4. Shared instruments that no file list shows

These are not in either item's write set and they gate both. Each was opened
this pass.

| Instrument | What triggers it | Which waves must run it |
|---|---|---|
| `src/file-size-ceiling.structure.test.ts` (`LIMIT = 1000` at `:41`) | any file in `src/` crossing 1000 | every wave that adds lines to either panel, and every wave that creates a file |
| `src/app/components/ui/modalAdoption.wiring.test.ts` | walks EVERY `.tsx` under `src/app` (`ALL_TSX_FILES.length` floor at `:192-193`); hard pins `DIALOG_SITES.length === 53` at `:290` and `ADOPTING_PATHS.size === 38` at `:358`. Its own comment at `:284-289` records that this pin "WENT RED ON MAIN rather than being bumped in the chunk that added the site" | every wave that CREATES a `.tsx` file under `src/app` - that is A24 wave 0 and A32 wave 0 |
| `src/app/components/courses/page-module-css-orphan-classes.test.ts` | reads `docs/css-orphans.md` as its oracle and ratchets the orphan count upward-only | every wave that moves JSX carrying `styles.` / `controls.` class references, i.e. both wave 0s |
| `src/lib/no-emojis.test.ts` | walks `src` AND `docs` (`roots = ["src", "docs"]` at `:254`) | every wave, including doc-only ones |
| `src/source-bytes.structure.test.ts` | BOM / control bytes | every wave |
| `src/tools/vitest-paths/gate-commands.structure.test.ts` | walks `docs/**/*.md` and freezes the exact set of raw multi-path test-command hits (S8, `:256-275`) | any wave that writes a `docs/*.md` file containing a test command |

`src/app/components/ui/buttonVariant.test.ts` is CHECKED-SAFE, not owned: its
`SECTION_4_DIRS` at `:96-105` lists `recording`, `grading-recording`,
`module-deck-capture`, `caption-studio`, `slide-studio`, `ui` and
`message-replies`. Neither `snapshot-grading` nor `walkthrough-announcement` is
in that list, so a new `.tsx` in either directory is outside its fence.

Two further shared resources, from `parallel-disjointness.md` section 5,
re-confirmed here:

- **`npx tsc --noEmit` has exactly one caller**, because it races on
  `tsconfig.tsbuildinfo`. In this plan the single owner is the WAVE GATE. No
  implementer runs it outside its own gate, and two waves never gate at once.
- **`npm run test:paths` itself loads `src/tools/backlog/resolve-ts-hook.ts`**
  (`grep -n '"test:paths"' package.json` -> `:21`). Verified this pass that
  neither that loader nor `src/tools/vitest-paths/cli.ts` imports
  `src/tools/backlog/yaml-codec.ts` at runtime (the only mention is a comment at
  `resolve-ts-hook.ts:3`), so a concurrent agent editing `yaml-codec.ts` does
  not poison these gates. An agent editing `resolve-ts-hook.ts` or
  `src/tools/vitest-paths/*` WOULD, and every gate in this plan would become
  unreliable without going red. Named because no file list shows it.
- **No repo-wide git operation in any wave.** No `git add -A`, no `git stash`.
  Every wave stages the explicit paths in its own write set and nothing else.
  A `git stash` reverts every sibling's files; a `git add -A` has already
  pushed another agent's mid-flight work to main in this repo.

---

## 5. PART ONE - A24

DECISION 4 binds: **the digest**. A derived, non-reversible value. No
assignment text stored, no new instructor-facing control, no new `ta-snap-*`
key, no key-canary bump. `cohortLabelSpread`'s equivalent needs only `Set`
distinctness over the digest.

The scope's section 7 wave 1 ("absorb the owner's answer") is **discharged by
DECISION 4 and is deleted from this plan.** It existed to receive an answer
that now exists. What remains of it - the `RubricAreaResult.comment` mapping
decision, R-A24-1 - is folded into wave A24-2 as a stated obligation of the
adapter's own unit test, not a separate wave.

### 5.0 Wave table

| Wave | Purpose | Exports | Where called | Independently gateable |
|---|---|---|---|---|
| **A24-0** | extraction, headroom only | one or more new components under `src/app/components/snapshot-grading/` | `SnapshotGradingPanel.tsx`, in the same wave | **YES** |
| **A24-2** | pure leaves + the row field | `snapshotCohortKey.ts`, `classTrendsSnapshotEntry.ts`, plus one field on `SnapshotAssessmentRow` | **nowhere until A24-3** | **NO** - see 5.3 |
| **A24-3** | capture, mount, disclosure | nothing new | the render file named by A24-0's report | **YES** |

**A24-2 and A24-3 are ONE SHIPPING UNIT.** A24-2 exports two pure functions
whose only caller is A24-3. `seats.md`'s single legal exception is a type-only
module and neither leaf is one, so A24-2 is NOT independently gateable and this
plan says so rather than letting a green gate imply otherwise. They are
dispatched as two units so no implementer is handed ten files at once; they
land in one commit and one push, and A24-3's gate carries the reachability
assertion that proves the leaves are reached (5.4).

### 5.1 Wave A24-0 - extraction

**Goal, numeric:**
`@(Get-Content src/app/components/snapshot-grading/SnapshotGradingPanel.tsx).Count`
returns **928 or lower** (1000 minus A16's measured +72, derived in the scope's
section 3). Currently **970**. If section 3's A24/A39 sequencing puts A39 in the
same window, the target is **914 or lower** instead; the wave is told which
number before it starts and exits on exactly one of them.

**Write set, derived:**

```
grep -rln "SnapshotGradingPanel" src --include=*.test.ts     (above, canary exits 1)
```

- `src/app/components/snapshot-grading/SnapshotGradingPanel.tsx` - the file
  shrinking, and **the caller of every component this wave creates**
- the new component file(s) under `src/app/components/snapshot-grading/`
- `src/app/components/snapshot-grading/snapshot-grading.structure.test.ts` -
  **required, and this is the finding that made round 1 NOT BUILDABLE.** Its
  assertion at `:351-360` anchors on `panelSource.indexOf("onSubmit={(text) => {")`,
  and that literal lives at `SnapshotGradingPanel.tsx:949`, inside the
  `{rubricModalOpen && (` block at `:947-957`. Moving that block makes the start
  anchor `-1` and the block goes red. Before ordering any extraction, grep the
  directory's structure test for assertions whose source handle is the file
  being extracted FROM; the result is this write-set entry.
- `src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts` and
  `src/app/components/snapshot-grading/snapshot-role-setrole-callsites.structure.test.ts`
  - in the GATE, and in the write set only if the chosen extraction moves what
  they pin (5.1.1 says what they pin).

**5.1.1 What must STAY in `SnapshotGradingPanel.tsx`.** Each opened this pass.
An extraction that moves any of these is red on arrival:

| Pinned text | Asserted at | Lives at |
|---|---|---|
| `const STORAGE_KEY_TABLE = "ta-snap-table";` | `snapshot-grading.structure.test.ts:158` | panel `:209` |
| `useAssessmentRowStore<SnapshotAssessmentRow>(STORAGE_KEY_TABLE, snapshotRowCodec` | same file `:161-165` | panel `:219` |
| `const seedConfirmedAreas = useCallback(async (text: string) => {` ... `}, []);` | `:263-264` | panel body |
| `onSubmit={(text) => {` ... `setRubricModalOpen(false);` | `:352-353` | panel `:949-953` |
| `const handleNextStudentConfirm = useCallback(() => {` ... `}, [clearPerStudentShots, announce, clearPendingAutoGrade]);` | `:364-365`, `:746-747`, `:779-780` | panel body |
| `const studentGenerationRef = useRef(0);`, `const { handleGrade } = useSnapshotGrade({` | `:783-797` | panel body |
| `<Checkbox checked={autoGradeArmed}`, its `onChange` | `:723-731` | panel `:840-847` |
| `onClick={() => void handleRead()}`, `onClick={() => void handleGrade()}` | `snapshot-autofire.structure.test.ts:158-159` | panel `:849`, `:852` |
| the networking-disclosure `<p>` opening `Reading, grading, and the Alt+R rubric-capture chord each upload` | `:679-682` | panel body |
| `triggerAutoGradeIfDue(added, shotsIncludingArrivals(shots, added));` and the useCallback brace scan | `:589-640` | panel body |

**Round 1's candidate - moving `STORAGE_KEY_TABLE` and the
`useAssessmentRowStore` call into a `useSnapshotSessionRows.ts` mirroring
`useGradingRows.ts:171,317` - is exactly what rows 1 and 2 forbid.** It is not
re-opened. Re-pointing those two assertions at a new hook file would weaken the
one instrument that catches persistence silently stopping (the block's own
header at `:141-149` says so) and is out of scope for this wave.

**5.1.2 The measured candidate menu.** Every boundary below was confirmed by
`grep -n` on the block's opening line and by reading its closing `)}`:

| Block | Lines | Size | Pinned by an assertion? |
|---|---|---|---|
| `{pinnedRubricAreas !== null && (` | 881-907 | 27 | no |
| `{shotReads.size > 0 && (` (the transcription TextField) | 911-922 | 12 | no |
| `{sessionRows.length > 0 && (` (completed assessments) | 928-945 | 18 | no |
| `{rubricModalOpen && (` | 947-957 | 11 | **YES** - `:352-353` |
| `{rubricCaptureReview && (` | 959-967 | 9 | no |

Token census proving the "no"s, each with the canary
(`grep -rn "pinnedRubricAreasXYZNOPE" src --include=*.test.ts` exits 1):
`grep -rn "Graded these confirmed rubric areas" src --include=*.test.ts`,
`"Transcription (editable"`, `"Completed assessments"`, `"rubricCaptureReview"`
each return **nothing, exit 1**. `"SnapshotRubricCaptureReview"` returns hits,
but they are `snapshot-grading.structure.test.ts:478-479` reading
`SnapshotRubricCaptureReview.tsx`'s OWN source, not the panel's mount of it.

**5.1.3 The arithmetic, and why per-block extraction does not reach 928.**
A new call site is not free. Measured, in this same file:

```
grep -n "^ *<[A-Z]" src/app/components/snapshot-grading/SnapshotGradingPanel.tsx
```

`<SnapshotShotTray` at `:757-764` costs **8** source lines, `<ConfirmedRubricAreasEditor`
at `:870-878` costs **9**, `<SnapshotCaptureBar` at `:742-756` costs **15**.
Budget 8-15 lines per new call site, plus one import line each.

All five candidate blocks total 77 lines. Extracted as five separate
components, the five call sites plus five imports cost roughly 38-45 lines
back: net removal about 32-39, landing near 931-938 - **above 928**.
Extracted as TWO grouped components (for example, everything at `881-922` into
one and everything at `928-967` into another), the two call sites plus two
imports cost roughly 20-25: net removal about 52-57, landing near 913-918 -
**below 928, and below 914**.

**Therefore: the number of new components matters more than the number of lines
moved, and this wave prefers FEWER, LARGER components.** That is the
constraint; which blocks group with which is the architect's call, bounded by
5.1.1 and 5.1.2. The estimate above is an estimate; **the exit criterion is the
measured number and nothing else.**

**5.1.4 The judgement call this wave still contains, and where it is routed.**
The scope says "the extraction target is the architect's, subject to the above".
No architect pass is currently scheduled for A24. This plan does not choose the
target silently. It is RES-W-2 in section 8, with an owner, and it is the ONE
remaining judgement call in A24. If it is dispatched to an implementer without
an architect pass, the default is the two-group split named in 5.1.3, which is
inside every constraint in 5.1.1 and 5.1.2.

**5.1.5 The wave's report must name, by path, which file ends up owning the
`{sessionRows.length > 0 && (` block.** That file is A24-3's render target.
Without this line, A24-3's write set is not determinate and the wave that
mounts the trends panel is guessing which file to edit.

**Gate (every path below is a test file; no production source path is ever
passed to `test:paths`, which credits arguments against executed TEST files and
reports `NOT COVERED ... files=0 passed=0` and exits 1 otherwise):**

```
npx tsc --noEmit
npm run lint
npm run test:paths -- src/app/components/snapshot-grading/snapshot-grading.structure.test.ts src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts src/app/components/snapshot-grading/snapshot-role-setrole-callsites.structure.test.ts src/file-size-ceiling.structure.test.ts src/app/components/ui/modalAdoption.wiring.test.ts src/app/components/courses/page-module-css-orphan-classes.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts <each new component's own test>
@(Get-Content src/app/components/snapshot-grading/SnapshotGradingPanel.tsx).Count
git status --short
```

A pass looks like: `npx tsc --noEmit` prints **nothing** and exits 0;
`npm run lint` ends `4 problems (0 errors, 4 warnings)` and exits 0 (a fifth
warning is this wave's regression, not drift); `test:paths` prints `COVERED`
for **every** argument and exits 0, with the exit code read from a file rather
than a pipe; the count returns **928 or lower**; `git status --short` lists
exactly this wave's write set and nothing under `.claude/worktrees`.

**`npm run lint` is a gate for this wave specifically.**
`this-repo.md:85-100` records that moving a ref-freshness cache out of THIS
file typechecked, passed all 311 tests, and then failed lint with two React
Compiler `preserve-manual-memoization` errors naming `handleNextStudentConfirm`
- a callback nowhere near the moved code. tsc and the suite stay green, so it
reads as somebody else's regression. Preferring a JSX extraction over a hook
extraction is the mitigation; running lint is the detection.

**The failure this wave must be WATCHED producing.** Not "add a test":

> **Sabotage:** after the extraction lands and the gate is green, DELETE the
> `<NewComponent ... />` call site from `SnapshotGradingPanel.tsx`'s JSX while
> leaving the import and the new file intact.
> **Expected red:** the new mount assertion this wave adds to
> `snapshot-grading.structure.test.ts` - the A4d idiom, `expect(panelSource).toMatch(/<NewComponent\b/)`
> - fails.
> **Why it is mandatory:** without that assertion the sabotage is GREEN.
> `walkthrough-announcement.structure.test.ts`'s own G2 block exists because an
> earlier wave in this repo shipped 2,711 lines of fully-tested leaves that
> nothing called. An extraction with no mount assertion reproduces that exactly.
> **Restore from a `cp` backup, never `git checkout --`**, which reverts to the
> index and destroys the wave's uncommitted work in the same file.

### 5.2 Wave A24-2 - the pure leaves and the row field

**Write set, derived by the greps in 2.1:**

- `src/app/components/snapshot-grading/snapshotCohortKey.ts` (new) - one
  exported pure function turning `assignmentText` into the stored digest. A
  plain `.ts` leaf, because vitest here is node-env with
  `include: ["src/**/*.test.ts"]` and logic inline in a `.tsx` cannot be tested
  at all.
- `src/app/components/snapshot-grading/classTrendsSnapshotEntry.ts` (new) -
  converts `SnapshotAssessmentRow[]` into a `GradingRunEntry` and exposes the
  spread predicate. It REUSES `toClassTrendsEntry` / `hasTrendableResults` from
  `src/app/components/grading-results/classTrendsEntry.ts`; a second copy is
  forbidden, the same rule `classTrendsRunCohort.ts:34-38` states for its own
  surface. Size precedent: `classTrendsRunCohort.ts` is **181** lines by both
  `@(Get-Content).Count` and `wc -l`.
- both new files' own tests
- `src/app/components/snapshot-grading/snapshot-row.ts` - the field on
  `SnapshotAssessmentRow`, declared at `:122`
- `src/app/components/snapshot-grading/snapshot-row-serialization.ts` -
  `toWire` (`:57-114`) AND `fromWire` (`:124-246`), both of which enumerate
  every field by hand
- `src/app/components/snapshot-grading/snapshot-row-serialization.test.ts` -
  three instruments, section 5.3
- `src/app/components/snapshot-grading/snapshot-row.test.ts` and
  `src/app/components/snapshot-grading/useSnapshotGrade.wiring.test.ts` - in
  the gate; in the write set only if the field's shape moves them

**R-A24-1, folded in here rather than left to a deleted wave.**
`RubricAreaResult` is `{area, score, comment}` at `src/lib/grade/types.ts:39-43`;
`SnapshotRubricAreaEvidence` at `snapshot-row.ts:89-100` carries `quote` and has
no `comment`. The adapter must choose a value and its own unit test must assert
the chosen value for a fixture row. Direction of failure: FAIL if the adapter
emits a silent `""`, which renders every snapshot-graded area's commentary
blank.

**The digest's derivation must be stated in this wave's own source comment and
pinned by an assertion**, because U10 has no enforcer. Measured:
`grep -n "U10\|assignmentText\|rubricText" src/app/components/snapshot-grading/snapshot-grading.structure.test.ts`
returns 2 lines - `:131` (a comment) and `:195` (an `it()` description) - and
**zero assertions**, against a canary of `grep -c "expect"` returning **122** on
the same file. So an implementer who stores raw assignment text ships green
through tsc, lint, the build's compile line and the whole suite. This wave adds
a source-text assertion in `snapshot-grading.structure.test.ts` pinning the
cohort field's value to the digest function, using the anchored-slice idiom that
file already runs at `:263-264`, `:322-323`, `:352-353` and `:364-365` (each
pairs a start `indexOf` with an end `indexOf`, asserts BOTH anchors resolved,
then asserts on the slice).

**Gate:**

```
npx tsc --noEmit
npm run test:paths -- src/app/components/snapshot-grading/snapshot-row-serialization.test.ts src/app/components/snapshot-grading/snapshot-row.test.ts src/app/components/snapshot-grading/useSnapshotGrade.wiring.test.ts src/app/components/snapshot-grading/snapshot-grading.structure.test.ts src/app/components/assessment-shared/assessment-row-store.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts <the two new leaf tests>
git status --short
```

A pass looks like `COVERED` on every argument, exit 0 read from a file, and
`tsc` printing nothing. `assessment-row-store.test.ts` is in the gate as a
control: it holds a ten-key oracle over a FIXTURE codec and must stay GREEN,
which is how the wave proves its own change is confined to the snapshot codec.

### 5.3 The three instruments an 18th field moves, and the failure to watch

This is the part DECISION 4 calls out by name and it is the reason a per-row
field is not free even without a key canary.
`snapshot-row-serialization.ts:60` casts `row as unknown as SnapshotAssessmentRow`,
so **tsc will NOT flag a field added to the type and forgotten in the codec.**
These assertions are the only place it fails loudly. All three were opened this
pass:

1. **`snapshot-row-serialization.test.ts:93-113`** - `expect(Object.keys(result).sort()).toEqual([...].sort())`
   over `snapshotRowCodec.toWire`, listing exactly **17** field names: `id`,
   `studentName`, `state`, `error`, `userEdited`, `totalScore`, `strengths`,
   `improvements`, `overallComment`, `shotReports`, `rubricAreas`,
   `missingRoles`, `instructionLikeContent`, `instructionLikeContentQuote`,
   `imageFallbackNote`, `evidenceDropped`, `strengthsNotice`.
2. **`snapshot-row-serialization.test.ts:368-392`** - the degradation-coverage
   block. `excluded` is built at `:368-378`; `actualKeysToDegrade` at `:379-381`
   is `Object.keys(full).filter(k => !excluded.has(k)).sort()` over what
   `fromWire` RETURNS; `tableCoveredFields` at `:382-391` is an exact list of 8
   names; `:392` asserts they are equal. An 18th field that `fromWire` returns
   moves `actualKeysToDegrade` and this goes red unless the field is added to
   `excluded` OR to `tableCoveredFields`, deliberately and with a reason.
3. **`snapshot-row-serialization.test.ts:395-407`** - the `it.each` degradation
   table, eight rows today. **Neither scope named this one.** The `it()` at
   `:347` says the table "covers every top-level string/optional-string field
   fromWire coerces", and `tableCoveredFields` at `:382-391` is a hand-written
   mirror of it. If the cohort digest is a string coerced to a safe default,
   this wave owes a row here too; if it is put in `excluded` instead, the wave
   states why in the same commit.

**Canary that this file's instrument fires:** `grep -c "expect"` returns **49**;
the file is **476** lines by `@(Get-Content).Count` and `wc -l`, 441 by
`Measure-Object -Line`.

**The failure this wave must be WATCHED producing, in this exact order:**

> **Step 1, the control that proves why the rest matters.** Add the cohort
> field to `SnapshotAssessmentRow` in `snapshot-row.ts` and to NOTHING ELSE.
> Run `npx tsc --noEmit`. **Expected: no output, exit 0.** Watch tsc say
> nothing about a field that will silently fail to survive a reload. That is
> the `as unknown as` cast at `snapshot-row-serialization.ts:60` doing exactly
> what its own header warns about, observed rather than quoted.
> **Step 2, the mandatory red.** Now add the field to `fromWire` but NOT to
> `toWire`. Run
> `npm run test:paths -- src/app/components/snapshot-grading/snapshot-row-serialization.test.ts`.
> **Expected red: `:93-113` fails with a 17-vs-18 key-set diff, and `:392`
> fails because `actualKeysToDegrade` gained a key `tableCoveredFields` does
> not have.** Read the failure text; do not infer it.
> **Step 3.** Add the field to `toWire`, then bump `:93-113` to 18 keys and
> settle `:368-392` deliberately per instrument 2 above, and add the `it.each`
> row per instrument 3 if the field is a coerced string. Re-run; expect green.
> **Step 4, the restore rule.** Every intermediate state above is a real edit
> to a real file. Back up with `cp` before each step and restore from the copy.
> `git checkout -- <file>` reverts to the index and destroys the wave's own
> uncommitted work in the same file.
> **Step 5.** No sibling agent may sabotage-verify on this tree in the same
> window; during steps 1-3 every concurrent measurement by a sibling is
> untrustworthy even if the restore is perfect.

### 5.4 Wave A24-3 - the capture, the mount, the disclosure

**Write set:**

- `src/app/components/snapshot-grading/useSnapshotGrade.ts` - the capture, inside
  the `merged` object at `:262-271`, committed at `:272` via
  `commitSessionRows(upsertSnapshotRow(sessionRowsRef.current, merged))`.
  `assignmentText` is in lexical scope there: measured,
  `grep -n "assignmentText" src/app/components/snapshot-grading/useSnapshotGrade.ts`
  returns `:37` (the params type), `:84` (destructured), `:152`, `:230`
  (`pastedTextCorpus`), `:241` (`hasAssignmentText`), `:290` (the dependency
  array). Opened, not inferred.
- **the render file named by wave A24-0's report** (5.1.5) - the mount of
  `ClassTrendsPanel` gated on `hasTrendableResults`, the disclosure line, and
  the heading requirement below. **This is the caller.** If A24-0 left the
  `{sessionRows.length > 0 && (` block in the panel, this is
  `SnapshotGradingPanel.tsx`; if A24-0 moved it, this is the new component AND
  `SnapshotGradingPanel.tsx` stays in the set as the file that renders it.
- `src/app/components/snapshot-grading/snapshot-grading.structure.test.ts` -
  the removal-test assertion below
- `src/app/components/snapshot-grading/useSnapshotGrade.wiring.test.ts` - the
  capture's own assertion

**Two decisions this wave must make explicitly, neither a copied default.**

1. **`defaultExpanded`.** Measured: `grep -rn "<ClassTrendsPanel" src --include=*.tsx --include=*.ts | grep -v "\.test\."`
   returns four mounts - `DraftedGradesTab.tsx:655` with `entry={entry}` and
   **no `defaultExpanded`**, `GradingRecordingPanel.tsx:946`,
   `GradingResults.tsx:607` and `repo-grades/index.tsx:856` all with it. Three
   of four pass it; Drafted Grades deliberately omits it
   (`ClassTrendsPanel.tsx:78,81-86`). On a surface whose whole problem is that
   cohort membership is invisible, expanded shows the blend immediately and
   collapsed hides it behind a click. The wave picks one and says why in the
   commit body.
2. **The heading.** `assignmentName` is read exactly once, at
   `ClassTrendsPanel.tsx:206`; `courseName` is never read past the type import.
   A fixed string such as "Screenshot grading" renders a literally true and
   informationally empty heading over trends averaging three assignments.
   **Requirement: the heading carries the same information the disclosure line
   carries, or the disclosure line sits above the fold of the panel.** Shipping
   neither is not an option.

**One placement constraint, measured.** `snapshot-grading.structure.test.ts:679-682`
already anchors a slice on the panel's networking-disclosure paragraph, opening
at the literal `Reading, grading, and the Alt+R rubric-capture chord each upload`
and closing at the next `</p>`. The new cohort disclosure paragraph must not be
inserted between those two anchors and must not begin with that text.

**Gate:**

```
npx tsc --noEmit
npm run lint
npm run test:paths -- src/app/components/snapshot-grading/snapshot-grading.structure.test.ts src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts src/app/components/snapshot-grading/snapshot-role-setrole-callsites.structure.test.ts src/app/components/snapshot-grading/useSnapshotGrade.wiring.test.ts src/app/components/snapshot-grading/snapshot-row-serialization.test.ts src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts <the two leaf tests from A24-2>
@(Get-Content src/app/components/snapshot-grading/SnapshotGradingPanel.tsx).Count
git status --short
```

The count must be reported as a NUMBER against 1000, never as "under the
limit". **This gate is also A24-2's reachability proof**: the two leaf tests
from A24-2 are named here, and the new anchored-slice assertion below fails if
the panel does not reference the spread predicate - so a leaf that ships with
no caller cannot pass this gate.

**The failure this wave must be WATCHED producing:**

> **Sabotage:** delete the `cohortSpread` call that gates the disclosure line in
> the render file's JSX.
> **Expected red:** the new anchored-slice assertion in
> `snapshot-grading.structure.test.ts`. **Object** - the slice bounded by the
> disclosure paragraph's own opening text and its closing `</p>`.
> **Instrument** - `fs.readFileSync` plus paired `String.indexOf` anchors, both
> asserted to resolve before the slice is asserted on. **Direction of failure**
> - RED when the slice does not reference the spread predicate, and RED when
> either anchor fails to resolve.
> **Why it must be watched and not assumed:** with the call deleted, the start
> anchor still resolves and only the slice's content changes, so an assertion
> that checks only that the anchors resolved would stay green. Watching the red
> is what distinguishes the two.
> Restore from a `cp` backup, not `git checkout --`.

---

## 6. PART TWO - A32

DECISION 5 binds: **per-slot**, and the precedent is `choose-timing`, NOT the
`edit` action. All four citations re-verified this pass with a canary
(`grep -rn "chooseTimingXYZNOPE" src/app/components/walkthrough-announcement/`
exits 1):

```
announcement-draft-slots.ts:364   | { type: "choose-timing"; id: string; timing: AnnouncementTiming }
announcement-draft-slots.ts:408   case "choose-timing": {
useAnnouncementDraftSlots.ts:238  const chooseTiming = useCallback((id, timing) => dispatch({...}), []);
walkthrough-announcement.structure.test.ts:745-763   the anchored-slice test
```

**Three further sites in the same precedent that neither scope named, and they
are the wiring half:** `useAnnouncementDraftSlots.ts:401` (the hook's return
object exposing `chooseTiming`), `WalkthroughAnnouncementPanel.tsx:666` (the
panel destructuring it) and `WalkthroughAnnouncementPanel.tsx:916`
(`onChooseTiming={chooseTiming}` passed into `<AnnouncementDraftSlot`). A
per-slot control that copies `choose-timing` and stops at the reducer ships
dead. **`:916` is the caller** and it is why the panel is in wave A32-3's write
set.

Carried from the check and NOT reopened: the scheduled time is **not
persisted** (Branch A). No `ta-` key is added, so the walkthrough directory's
count canary at `walkthrough-announcement.structure.test.ts:123`
(`expect(distinctKeys.size).toBe(5)` - a COUNT, not an exact set; the five names
live only in the `it()` description at `:117`) does not move.

### 6.0 Wave table

| Wave | Purpose | Exports | Where called | Independently gateable |
|---|---|---|---|---|
| **A32-0** | extraction, headroom only | new component(s) under `src/app/components/walkthrough-announcement/` | `WalkthroughAnnouncementPanel.tsx`, same wave | **YES** |
| **A32-1** | action layer | a 5th `delayedPostAt` parameter on `postWalkthroughAnnouncementAction` | **nowhere until A32-3** | **NO** |
| **A32-2** | the pure leaf | `resolveScheduledVisibility` | **nowhere until A32-3** | **NO** |
| **A32-3** | reducer, hook, control, copy, labels | nothing new | `WalkthroughAnnouncementPanel.tsx:916` and `useAnnouncementDraftSlots.ts:332` | **YES** |

**A32-1, A32-2 and A32-3 are ONE SHIPPING UNIT.** A 5th parameter no caller
supplies is inert, and a pure leaf nothing imports is dead. Neither is a
type-only module, so neither is independently gateable and this plan says so
rather than letting two green gates imply a shipped capability. They land in one
commit and one push. A32-0 is genuinely independent and ships on its own.

**A32-1 and A32-2 are file-disjoint from each other** (`src/app/actions/*`
against `src/app/components/walkthrough-announcement/scheduled-visibility.ts`
plus its test) and may be built concurrently after A32-0, provided only one of
them owns `npx tsc --noEmit` at a time. That is the wave gate, run once, after
both land.

### 6.1 Wave A32-0 - extraction. Which branch, and is it required?

**Per-slot is Branch C**, in the scope's section 3 table. The answer to "is the
extraction therefore required" has two halves and both must be stated:

- **By plain arithmetic, NO.** Branch C adds roughly 5-10 lines to the panel
  (985 + 5 to 985 + 10 = 990-995, under `LIMIT = 1000`).
- **Under the only measured overrun factor this repo has, YES, by one line.**
  A16 wave 2 budgeted 46 lines and landed 72
  (`git show cbe84e2^:src/app/components/grading-recording/GradingRecordingPanel.tsx | wc -l`
  -> 918; `git show cbe84e2:... | wc -l` -> 990), a 1.57x overrun. Applied to
  Branch C's worst case: 10 x 1.57 = 16, giving **1001**, which is red.

**Ruling: the extraction is REQUIRED, and the reason is not the one line.** It
is that `WalkthroughAnnouncementPanel.tsx` has **15 lines of headroom** and
**23 separate source-text assertions pinned to its own text** (6.1.1). A wave
that lands red at the ceiling on a file that heavily pinned cannot be
remediated cheaply mid-wave: the emergency extraction would be designed under
time pressure against a constraint set nobody had enumerated. Extraction first
is the cheap order, and this plan's rule is that extractions precede features
when a file is near the ceiling.

**The number.** Wave A32-0's exit criterion is
`@(Get-Content src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx).Count`
returning **940 or lower**. Currently **985**. That number is the scope's,
already accepted: 1000 minus Branch C's calibrated worst case of 16 leaves 984,
and 940 leaves a further 44 lines for the next feature. **The 44 is a policy
choice, not a measurement**, and the architect may move it - but the wave exits
on a number, never on "comfortably under".

**6.1.1 What must STAY in `WalkthroughAnnouncementPanel.tsx`.** Derived, not
recalled:

```
grep -n "panelSource" src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts
grep -n "indexOf(" src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts
```

| Pinned text | Asserted at |
|---|---|
| `postWalkthroughAnnouncementAction(` | `:151` |
| absence of `createAnnouncementAction` | `:155` |
| `<AnnouncementDraftSlot` | `:176` |
| `useAnnouncementDraftSlots(` | `:180` |
| `emojiPolicy: ctx.emojiOn`, `researchOutcome: ctx.researchOutcome` | `:288`, `:292` |
| `<AnnouncementCourseFieldset`, `emojiOn={emojiOn}`, `researchOn={researchOn}` | `:309`, `:313`, `:314` |
| the `raceWithTimeout` import and `raceWithTimeout(Promise.all(` | `:334`, `:338` |
| `const loadSavedExemplars = useCallback` ... `}, [courseId]);` | `:342-344` |
| the `raceWithTimeout(...EXEMPLAR_FETCH_TIMEOUT_MS` occurrence count | `:350` |
| `onRetryOptions=` plus the 300 characters after it | `:400-402` |
| `disabled={` / `savedFormatsState === "loading"` plus 250 characters around | `:415-418` |
| absence of `[savedExemplarsLoading,` / `[savedExemplarsFailed,`; `useState<SavedFormatsState>("loaded")` | `:431-436` |
| the `localStorage.getItem(STORAGE_KEY_COURSE)` occurrence count | `:465` |
| an `ANCHOR_RE` match and two `</p>` slices | `:486-506` |
| `Video script draft`, `Generate video script`, `"walkthrough-video-script.txt"`, `read aloud while`, `re-recording` | `:640-656` |
| the `record button` occurrence count | `:674` |
| `const draftOne = useCallback(` ... | `:697-698` |
| `const researchFingerprint = useCallback(` ... `}, []);` | `:771-772` |

**The `slots.map` block at `:895-937` contains `<AnnouncementDraftSlot` and is
therefore exactly what `:176` forbids moving.** The block's own header at
`:159-167` records why it exists. Extract something else.

**6.1.2 The one large candidate, and its honest cost.** The video-script block
at `WalkthroughAnnouncementPanel.tsx:939-981` is **43** contiguous lines
(`grep -n "^      <\|^      {"` on the panel gives its bounds), and it is the
only block of that size that is not pinned by a structural assertion. It IS
pinned by five CONTENT assertions at `:640-656`.

That is a write-set consequence, not a veto:
`src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts`
is **in A32-0's write set**, and the five assertions are re-pointed at the new
file's source in the same commit. **Re-pointing is only legal if the wave also
adds a mount assertion on the panel** (`expect(panelSource).toMatch(/<NewComponent\b/)`,
the G2 idiom two describes above it), because a content assertion moved to the
extracted file no longer proves the panel reaches it. Without the mount
assertion this is a weakening dressed as a move.

43 lines out, roughly 10 back for the call site and its import, lands near
**952** - short of 940. A second, smaller extraction is needed, or one grouped
component. The measured call-site costs from 5.1.3 apply here too: prefer
fewer, larger components. As with A24, this plan does not choose the target
silently; it is RES-W-3.

**Gate:**

```
npx tsc --noEmit
npm run lint
npm run test:paths -- src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.test.ts src/app/components/walkthrough-announcement/announcement-draft-slots.test.ts src/file-size-ceiling.structure.test.ts src/app/components/ui/modalAdoption.wiring.test.ts src/app/components/courses/page-module-css-orphan-classes.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts <each new component's own test>
@(Get-Content src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx).Count
git status --short
```

Pass: `tsc` silent and exit 0; lint at `4 problems (0 errors, 4 warnings)` and
exit 0; `COVERED` on every `test:paths` argument with exit 0 read from a file;
the count **940 or lower**, reported as a number; `git status --short` matching
the write set exactly. `npm run lint` is named for the same
`preserve-manual-memoization` reason as A24-0.

**The failure this wave must be WATCHED producing:** identical in shape to
A24-0's. Delete the `<NewComponent ... />` call site from the panel, leaving the
import and the file; the new G2-style mount assertion must go RED. Restore from
a `cp` backup.

### 6.2 Wave A32-1 - the action layer

**Write set:** `src/app/actions/walkthrough-announcement.ts` (a 5th
`delayedPostAt` parameter on `postWalkthroughAnnouncementAction`, declared
`:595-600`, forwarded to `createAnnouncementFromMarkdown` at `:603`) and
`src/app/actions/walkthrough-announcement.test.ts`. No change to
`src/lib/canvas/announcements.ts`, whose `delayedPostAt` is already consumed at
`:436-442`.

**The test file is not optional.** `:566-571` is
`expect(createAnnouncementFromMarkdown).toHaveBeenCalledWith(...)` with exactly
four arguments, and `toHaveBeenCalledWith` checks the full argument list, so a
fifth - even `undefined` - fails it.

**The failure this wave must be WATCHED producing:**

> **Sabotage:** it is not a sabotage, it is the wave's first step. Forward the
> 5th argument at `:603` and change NOTHING in the test file.
> **Expected red:** `walkthrough-announcement.test.ts:566-571` fails with a
> four-vs-five argument diff.
> Read that failure, then update the expectation deliberately and add the two
> new cases the wave owes: the argument forwarded verbatim, and the library's
> `NaN` message ("Could not read the scheduled visibility time.",
> `announcements.ts:438-440`) neither swallowed nor reworded by the action's
> catch at `:605-607`.

**Gate:**

```
npx tsc --noEmit
npm run test:paths -- src/app/actions/walkthrough-announcement.test.ts src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts src/lib/use-server-exports.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
git status --short
```

`walkthrough-announcement.structure.test.ts` is in this gate because `:716`
reads the ACTION's source directly (`const actionSource = fs.readFileSync(ACTION_PATH, ...)`)
and `:718-741` slices `draftWalkthroughAnnouncementAction`'s body.
`use-server-exports.test.ts` is in the gate because the action file is a
`"use server"` module and only that test plus `next build` see a non-async
export there.

### 6.3 Wave A32-2 - the pure leaf

**Write set:**
`src/app/components/walkthrough-announcement/scheduled-visibility.ts` (new) and
its own test. Nothing else.

REQ-A32-1's construction, carried verbatim from the accepted scope:

```
export type ScheduledVisibility =
  | { kind: "immediate" }
  | { kind: "scheduled"; iso: string; label: string }
  | { kind: "invalid" };

export function resolveScheduledVisibility(raw: string, now: number): ScheduledVisibility;
```

- empty or whitespace `raw` -> `immediate`
- `Number.isNaN(new Date(raw).getTime())` -> `invalid`
- `when.getTime() > now` -> `scheduled`, `iso = when.toISOString()` (REQ-A32-2),
  `label = when.toLocaleString()`
- a valid but non-future time -> `immediate`, preserving the sibling's actual
  behaviour while making it impossible for the copy to disagree with it

`now` is INJECTED, never read from the clock inside the function. The test is a
table over empty, whitespace, malformed, past, exactly-now and future.

Import `toDatetimeLocalValue` from `src/app/components/canvas-tab/utils.ts`
(exported at `:46`) for the `min` attribute. **Do not copy that file.**
`utils.ts:1` declares `COURSE_URL_KEY = "ta-canvas-course-url"`, and the
walkthrough directory's key canary at
`walkthrough-announcement.structure.test.ts:111` matches
`/(?<![a-zA-Z])ta-[a-z-]*[a-z]/g` over RAW source INCLUDING COMMENTS across every
non-test file in that directory. Copying the file, or merely writing a comment
in that directory that mentions any `ta-` literal, takes `distinctKeys.size`
from 5 to 6 and turns `:123` red. Importing is safe: the canary reads only files
inside the directory.

**This new file is swept by that canary**, because the sweep is
`fs.readdirSync(WALKTHROUGH_ANNOUNCEMENT_DIR)` at `:104` filtered to non-test
`.ts`/`.tsx`. So the canary is in this wave's gate even though no key is added.

**Gate:**

```
npx tsc --noEmit
npm run test:paths -- src/app/components/walkthrough-announcement/scheduled-visibility.test.ts src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
git status --short
```

### 6.4 Wave A32-3 - reducer, hook, control, copy, labels. And the naming contract.

**Write set:**

- `src/app/components/walkthrough-announcement/announcement-draft-slots.ts` -
  the new slot field and a new action, mirroring `choose-timing` at `:364`
  (action type) and `:408` (reducer case)
- `src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.ts` -
  the callback mirroring `:238`, its entry in the returned object mirroring
  `:401`, and `commitPost` at `:328-340`, which is where `slot` is in scope at
  `:332` and where the resolved value reaches `postDraft`. `postDraft`'s type at
  `:148-151` gains a third parameter.
- `src/app/components/walkthrough-announcement/AnnouncementDraftSlot.tsx` - the
  new control, the consequence paragraph at `:221-229`, and the labels at
  `:239`, `:240`, `:244`, `:250`, `:251`
- `src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx`
  - `postDraft` at `:644-657` forwarding the new argument to
  `postWalkthroughAnnouncementAction` at `:647`; the hook destructure near
  `:666`; and `:916`, where the new prop is passed into `<AnnouncementDraftSlot`.
  **`:916` is THE CALLER.** Its `useCallback` deps at `:656`, currently
  `[selectedCourse]`, gain whatever the new closure reads.
- `src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts`
  - the new anchored-slice assertions, and the re-pointed `label="Timing"`
  anchor (below)
- `src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.test.ts`
  and `announcement-draft-slots.test.ts` - the reducer and hook cases

**6.4.1 THE NAMING CONTRACT (DECISION 5, and a requirement of this wave).**

`AnnouncementDraftSlot.tsx:117` renders `label="Timing"` on a select whose
options are `beginning-of-week` / `midweek` (`:33-36`, type
`AnnouncementTiming` at `src/lib/walkthrough-announcement-prompt.ts:64`). It is
CONTENT FRAMING. It has nothing to do with Canvas visibility. A per-slot Canvas
schedule control sits directly beside it in the same row. Two adjacent controls,
one called "Timing" and the other deciding when Canvas actually posts, is the
five-labels-for-one-act defect `docs/a17-discovery.md` measured in this app
today, reproduced deliberately.

**Specified, both of them:**

| Control | Name | Why |
|---|---|---|
| the existing content-framing select at `:117` | **"Written for"**, options unchanged ("Beginning of week", "Midweek check-in") | an instructor reads "Written for: Midweek check-in" and cannot mistake it for a publication time. It must contain neither the substring `Timing` nor the word `Schedule`. |
| the new Canvas-visibility control | **"Visible to students (optional)"**, with the hint "Leave blank to post immediately. Pick a future date and time to schedule when students can see it." | verbatim the sibling's own label and hint at `src/app/components/canvas-tab/announcements-panel.tsx:463` and `:477-478`, which already ship this exact control. Reusing a shipped label is the cheapest way to be unambiguous. |

**The UX seat may substitute a different word for the content-framing control**,
subject to two mechanical constraints, but may not leave it called "Timing".

**6.4.2 The mechanical consequence, which is what makes the naming a gate
rather than a preference.** `walkthrough-announcement.structure.test.ts:748`
reads:

```
const startIdx = source.indexOf('label="Timing"');
const endIdx = source.indexOf("</TextField>", startIdx);
```

Two things follow, both measured:

1. **Renaming the existing select makes that start anchor `-1`**, and `:752-754`
   asserts it is greater than `-1`. So the rename CANNOT ship silently; the test
   file is in this wave's write set and the anchor is re-pointed at the new name
   in the same commit. This is the good direction.
2. **`indexOf` is substring matching and takes the FIRST occurrence.** A new
   control labelled with anything that has `Timing` as a prefix - and placed
   earlier in the file - would silently re-bind this existing assertion to the
   wrong control. Hence the hard constraint: neither control's label may contain
   the substring `Timing` after this wave, and the new control's label must be
   unique in the file so its own anchored slice binds to one place.

**6.4.3 Five label strings need a scheduled variant, not three.** Measured:

```
grep -n "wta-post-consequence\|idleLabel=\|confirmLabel=\|loadingLabel=\|idleAriaLabel=\|confirmAriaLabel=\|consequenceId=" src/app/components/walkthrough-announcement/AnnouncementDraftSlot.tsx
```

| Line | Prop |
|---|---|
| `:239` | `idleLabel="Post to Canvas"` |
| `:240` | `confirmLabel="Confirm post"` |
| `:244` | `loadingLabel` |
| `:250` | `idleAriaLabel` (a template string, `Post draft ${ordinal} to Canvas`) |
| `:251` | `confirmAriaLabel` (`Confirm posting draft ${ordinal} to Canvas`) |

The scopes name three. **`:250` and `:251` are the accessible names** - if the
visible label gains a scheduled variant and the aria label does not, a screen
reader user hears "Post draft 2 to Canvas" on a control that schedules. All
five get a variant driven by the same resolved value.

**Two traps in this exact region, both measured:**

- `:244`'s value ends with a single **U+2026** horizontal ellipsis character,
  not three ASCII dots. Do not retype it as `...`; that is a silent copy change
  that no gate reads. Preserve the existing byte.
- A SECOND `ConfirmArmButtons` block immediately follows at `:255-264` for
  Regenerate, with its own `consequenceId={...wta-regenerate-consequence-...}`
  at `:262`. Any anchored slice must anchor on the literal
  `wta-post-consequence`, never on a bare `consequenceId=`, or it binds the
  wrong block.

**6.4.4 THE MANDATORY WATCHED FAILURE. A past-dated pick must be observed
producing "scheduled" copy while the post decision posts immediately, BEFORE
the one-predicate fix lands.** Otherwise the predicate's test is a tautology:
if copy and decision read the same function from the first commit, a test that
they agree can never have failed.

Nothing renders under vitest here, so the observation is split in two and BOTH
halves are watched:

> **Half A - the predicate disagreement, in code.**
> **Step 1.** Build the split-predicate version deliberately, in the working
> tree, not shipped: derive the consequence copy and the labels from a
> length-derived boolean (`raw.trim().length > 0`, the sibling's own shape at
> `announcements-panel.tsx:296`) and derive the post decision from
> `resolveScheduledVisibility(raw, Date.now()).kind === "scheduled"` (the
> sibling's own shape at `:247`).
> **Step 2.** Write the agreement test: over a table that INCLUDES a past-dated
> value such as `"2020-01-01T09:00"`, assert that the predicate driving the copy
> and the predicate driving the post decision return the same answer.
> **Expected red, and this is the one to watch:** the past-dated row fails -
> copy says scheduled, decision says immediate. Read the failure text and record
> the exact row.
> **Step 3.** Collapse to ONE call to `resolveScheduledVisibility` read by the
> consequence copy, all five labels and the post decision. Re-run; green, and
> now green by construction rather than by assertion. `iteration-caps.md`
> records that what ends a defect chain is "replacing an assertion with a
> construction that makes the bad state unrepresentable"; this is that.
> **Step 4.** Restore every intermediate from a `cp` backup, never
> `git checkout --`.
>
> **Half B - the copy, which only a source-text instrument can see.**
> **Sabotage:** write the consequence paragraph at
> `AnnouncementDraftSlot.tsx:221-229` against a separate length-derived boolean
> instead of the resolved value.
> **Expected red:** the new anchored-slice assertion. **Object** - the slice of
> `AnnouncementDraftSlot.tsx` bounded by the literal `wta-post-consequence` and
> the next `</p>`. **Instrument** - `fs.readFileSync` plus paired
> `String.indexOf`, both anchors asserted to resolve before the slice is
> asserted on, matching the idiom already running at `:745-763` and `:788-806`.
> **Direction of failure** - RED when the slice does not reference the resolved
> visibility value, RED when it references a separate length-derived boolean,
> RED when either anchor fails to resolve.
> A second assertion of the same shape pins the same value to the five labels at
> `:239-251`.

**Why this matters more here than on the sibling.** The paragraph at `:221-229`
is an arm-then-confirm CONSEQUENCE statement, wired to the confirm button by
`consequenceId` at `:249`. Its job is to say what pressing Confirm will do, and
it currently says the post is immediate and that the app "cannot recall or
delete it afterward". The sibling's split predicate is cosmetic and partly
redeemed by success copy that branches correctly. Here it is not cosmetic: the
`min` attribute blocks PICKING a past time in the native widget and does not
block typing or pasting one, so the sequence is a past-dated value, a line
saying "scheduled", and a Confirm that publishes to every student immediately
and irrevocably. The first observer would be a student.

**Gate:**

```
npx tsc --noEmit
npm run lint
npm run test:paths -- src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.test.ts src/app/components/walkthrough-announcement/announcement-draft-slots.test.ts src/app/components/walkthrough-announcement/scheduled-visibility.test.ts src/app/actions/walkthrough-announcement.test.ts src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
@(Get-Content src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx).Count
@(Get-Content src/app/components/walkthrough-announcement/AnnouncementDraftSlot.tsx).Count
git status --short
```

Both counts reported as numbers against 1000.
`AnnouncementDraftSlot.tsx` is **295** today and takes most of this wave's
growth, so it is measured too. **This gate is A32-1's and A32-2's reachability
proof**: `walkthrough-announcement.test.ts` and `scheduled-visibility.test.ts`
are named here, and the two new anchored-slice assertions fail if the slot does
not reference the resolved value - so neither the inert 5th parameter nor the
unimported leaf can pass this gate while dead.

---

## 7. Line-shift obligations these waves create

Both wave 0s move code and therefore invalidate line-number citations in
artifacts nobody is editing. Computed rather than asserted:

```
grep -rho "SnapshotGradingPanel\.tsx:[0-9]\+" docs/*.md | wc -l          -> 47
grep -rho "SnapshotGradingPanel\.tsx:[0-9]\+" docs/*.md | sed 's/.*://' | awk '$1>=881' | wc -l   -> 6
grep -rho "WalkthroughAnnouncementPanel\.tsx:[0-9]\+" docs/*.md | wc -l  -> 61
canary: grep -rho "SnapshotGradingPanelXYZNOPE\.tsx:[0-9]\+" docs/*.md   -> exit 1
```

**A24-0.** 47 line-pinned citations to `SnapshotGradingPanel.tsx` exist across
`docs/*.md`. If the extraction is confined to the JSX tail at `881-967` - which
5.1.2's candidate menu already is - **exactly 6 of them shift**, all of them the
`:930` and `:931` pair (the completed-assessments disclosure), appearing three
times each. Every citation below line 881 is untouched. **That bound is a
reason to confine the extraction to the tail** and it should be treated as a
soft constraint on the architect's choice, not merely an accounting note.
Files carrying those citations: `docs/BACKLOG.md`, `docs/REGRESSION.md`,
`docs/a16-scope.md`, `docs/a18-scope.md`, `docs/a24-a32-check.md`,
`docs/a24-scope.md`, `docs/a39-architecture.md`, `docs/a39-census.md`,
`docs/owner-decisions-2026-09-23.md`,
`docs/snapshot-grading-acceptance-criteria.md`.

**A32-0.** 61 line-pinned citations to `WalkthroughAnnouncementPanel.tsx` exist
across 13 `docs/*.md` files. The video-script candidate at `:939-981` is near
the end of the file, so citations above it survive; the count that shifts
depends on the final target and cannot be computed before the target is chosen.

**Owner of the re-pin, named:** the wave-0 implementer's own report states the
new line numbers for every anchor its wave moved, and the brief for the NEXT
wave is written from the post-wave-0 tree, never from `docs/a24-scope.md` or
`docs/a32-scope.md`. **Nobody rewrites the historical scope documents.** They
are a record of what was decided on the tree as it stood; silently re-pinning
them would destroy the audit trail and is not requested here. What is requested
is that no later brief inherits a stale number. This obligation is real and has
been dropped in this repo before: an item's edits shifted the lines another
item's plan pinned, manufacturing a stale citation in a document nobody had
touched.

**The structure tests do not carry this obligation**, and that is by design:
every assertion enumerated in 5.1.1 and 6.1.1 uses a text anchor
(`indexOf` / `toMatch`), not a line number. They survive any shift, and they
fail loudly when the anchored text itself moves out of the file. That is the
whole reason the constraint tables above are expressed as text, not as ranges.

---

## 8. Residual register

Every entry names an object, an owner, an instrument, a direction of failure and
the step that will measure it. An entry missing any of those is a DELETION and
is called that.

**RES-W-1: A24 and A39 write the same two files.** Object:
`src/app/components/snapshot-grading/SnapshotGradingPanel.tsx` and
`src/app/components/snapshot-grading/snapshot-grading.structure.test.ts`, each
claimed by `docs/a39-architecture.md:1316,1318` and by A24 waves 0/2/3. Owner:
**the orchestrator**, who owns queue order; this seat owns one item's waves and
cannot sequence two items. Instrument: the intersection in section 2.1 re-run
with A39's write set added, `sort | uniq -d`, empty being the only pass.
Direction of failure: non-empty output means they must not be dispatched in the
same window; dispatching anyway loses one silently, as a requirement that
mysteriously is not implemented rather than as a conflict. Step: before either
item's first implementer is dispatched.

**RES-W-2: A24 wave 0's extraction target.** Object: which of the five blocks in
5.1.2 group into how many components. Owner: **a `loop-architect` pass for A24**;
if none is dispatched, the A24-0 implementer, using 5.1.3's two-group default.
Instrument: `@(Get-Content src/app/components/snapshot-grading/SnapshotGradingPanel.tsx).Count`
plus the gate in 5.1. Direction of failure: FAIL if the count exceeds 928 (or
914 under section 3), FAIL if `npm run lint` gains a fifth warning or any error,
FAIL if any assertion in 5.1.1 goes red. Step: wave A24-0's gate.

**RES-W-3: A32 wave 0's extraction target.** Object: what leaves the walkthrough
panel to reach 940, given that the only 40-plus-line unpinned-by-structure
candidate is the video-script block at `:939-981` and it carries five content
assertions. Owner: **a `loop-architect` pass for A32**; if none, the A32-0
implementer. Instrument:
`@(Get-Content src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx).Count`
plus the gate in 6.1. Direction of failure: FAIL above 940; FAIL if any
assertion in 6.1.1 goes red; FAIL if a content assertion is re-pointed to the
new file without a paired mount assertion on the panel. Step: wave A32-0's gate.

**RES-W-4: the 928-vs-940-vs-914 conflict.** Object: the numeric exit criterion
for `SnapshotGradingPanel.tsx`. A24 derives 928, A39 derives 940, and the
arithmetic that satisfies both is 914. Owner: **the repo owner or the
orchestrator**, whoever decides whether A24 and A39 ship in one window.
Instrument: the same `@(Get-Content).Count`. Direction of failure: adopting 940
when both ship means the second feature lands the file at 1000-plus and red;
adopting 928 when only A39 ships means a larger extraction than needed, which
costs time and nothing else. **This plan adopts neither silently.** Step: stated
to the wave-0 implementer as a single number before it starts.

**RES-W-5: `modalAdoption.wiring.test.ts`'s hard count pins.** Object:
`DIALOG_SITES.length === 53` at `:290` and `ADOPTING_PATHS.size === 38` at
`:358`, over a walk of every `.tsx` under `src/app`. Owner: whichever wave
creates a `.tsx` file - A24-0 and A32-0. Instrument: that test, named in both
wave-0 gates. Direction of failure: RED if the new component matches
`isDialogSite`'s markers; the pin's own comment at `:284-289` records that it
"WENT RED ON MAIN rather than being bumped in the chunk that added the site",
so the failure mode is a later, unrelated wave inheriting the red. Step: each
wave-0 gate.

**RES-W-6: `docs/REGRESSION.md` has no baseline for either area.** Object: for
A24, today's two-sentence completed-assessments disclosure at
`SnapshotGradingPanel.tsx:930-931` and the fact that the table never shrinks;
for A32, today's unconditional immediate-post consequence copy at
`AnnouncementDraftSlot.tsx:221-229`. Owner: the baseline seat, per
`DEV_LOOP.md`'s Baseline step. Instrument, measured this pass:
`grep -ac "snapshot.grading.*trend\|snapgrade.*trend\|A24" docs/REGRESSION.md`
returns **0**, exit 1;
`grep -ac "walkthrough.*announcement.*schedul\|delayed_post_at.*walkthrough\|A32" docs/REGRESSION.md`
returns **0**, exit 1; canary `grep -ac "^## "` on the same file returns
**389**. Direction of failure: without an entry, a later regression pass cannot
distinguish the new disclosure or the new control appearing from a regression.
Step: before A24-3's and A32-3's implementers start. **`docs/REGRESSION.md` is
one file and both baselines append to it** - if two baseline seats run at once
they collide, so they are sequenced or merged into one seat.

**RES-W-7: every UI claim in this plan is a reading claim.** Object: the
disclosure line's rendered text, the expanded/collapsed default, the two
walkthrough control labels side by side, the consequence paragraph, the five
button and aria labels, focus order and what a screen reader announces. Owner:
**the repo owner**, in a real browser, after each item ships. Instrument: manual
check against the deployed app. There is no alternative: vitest here is
`environment: "node"` with `include: ["src/**/*.test.ts"]`, **no component is
rendered by any test in this repo**, and no wave in this plan may claim UI
coverage from the suite. Direction of failure: a source reading can be right
about what the code says and wrong about what paints, focuses or announces.
Step: the next owner verification pass after each item's push.

**RES-W-8: the instructor-browser-timezone assumption.** Object: the Canvas-side
reveal instant against the instructor's intended local time.
`delayed_post_at` goes to Canvas as UTC via `.toISOString()`
(`announcements.ts:441`), and a `datetime-local` value is wall-clock with no
offset. Owner: **the repo owner** - it needs a real browser against a real
Canvas course and this checkout has no `.env`, no API key and a blocked network.
Instrument: post a scheduled walkthrough announcement in a real session and
compare the revealed time to the picked time. Direction of failure: FAIL if they
differ by anything other than rounding to the minute. Step: the owner's manual
verification pass after A32 ships.

**RES-W-9: the digest's confirmable-match weakness.** Object: whether it matters
that someone holding a candidate assignment text can confirm a match against a
stored digest, though they cannot recover the text. Owner: **the repo owner**,
who has already seen this and chose the digest with it recorded (DECISION 4's
closing paragraph). Instrument: none in code; it is a threat-model judgement.
Direction of failure: none available here, which is exactly why it is recorded
rather than gated. Step: closed by DECISION 4; listed so a later reader does not
re-open it as an oversight.

**RES-W-10: the `image` parameter.** Object:
`createAnnouncementFromMarkdown`'s 6th parameter (`announcements.ts:426`),
unreached from both its production callers. Owner: **the repo owner** - whether
a markdown-drafting surface should attach an image is a product decision and no
capture path exists there. Instrument:
`grep -rn "createAnnouncementFromMarkdown(" src --include=*.ts --include=*.tsx | grep -v "\.test\."`,
confirming no call site passes a 6th argument; canary with a nonsense name exits
1. Direction of failure: it becomes a deletion the moment it stops appearing in
`docs/BACKLOG.md` with an owner and a step. Step: a future row, or the owner's
next pass over the walkthrough or prompt-announcement surfaces. Not blocking
A32.

---

## 9. What this pass could not determine, and what it routes rather than decides

- **Whether A24 or A39 goes first.** RES-W-1 and RES-W-4. This seat owns one
  item's waves; it does not own queue order, and choosing silently is exactly
  the failure it exists to prevent.
- **The two extraction targets.** RES-W-2 and RES-W-3. The constraint sets are
  complete and pasted, the arithmetic is done, and a default is stated for each
  - but the choice belongs to an architect and this plan does not pretend
  otherwise.
- **Anything about rendered output.** RES-W-7. No component renders here.
- **Whether either wave-0 extraction trips React Compiler's
  `preserve-manual-memoization`.** `this-repo.md:85-100` records it happening on
  `SnapshotGradingPanel.tsx` specifically, on a callback nowhere near the moved
  code, with tsc and the whole suite green. Only `npm run lint` after the move
  can say, which is why lint is a named gate on both wave 0s and both wave 3s.
- **Whether Canvas honours `delayed_post_at` as the existing callers assume,
  and what it does with a past one.** No live Canvas, no API key.

---

## Verification of this document's own write set

Every multi-path test command in this document uses `npm run test:paths --`.
None uses a raw multi-path vitest invocation, in any spelling, deliberately:
`src/tools/vitest-paths/gate-commands.structure.test.ts` walks `docs/**/*.md`
and freezes the exact set of such hits (S8, `:256-275`), so a single example of
the forbidden form written into this file would turn that test red - and the
form itself silently drops any argument it does not match and exits 0, which is
why it is forbidden in the first place.

```
npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
```

Result recorded in the section below, with the exit code read from a file rather
than from a pipe, and `git status --short` proving the write set is exactly
`docs/a24-a32-waves.md`.
