# A38 - scope and design: grade ONE submission on the recording grader

Architecture seat. **Revision 3, 2026-09-29** (revision 2 was 2026-09-23),
after `docs/a38-rulings.md` (commit 5c99c43) returned revision 1 DEFECTIVE - 6
blockers, 3 majors, 6 minors - and after round-2 rulings
(`docs/a38-rulings-round2.md`), owner decisions
(`docs/owner-decisions-2026-09-23.md`) and the acceptance criteria
(`docs/a38-acceptance-criteria.md`) landed on top of revision 2. This document
decides SHAPE. It writes no production code and no test code. What revision 3
changes, and what it deliberately leaves alone, is in the REVISION 3 section
immediately below.

`docs/a38-rulings.md` OVERRIDES this document. Rulings 1 and 2 are the
orchestrator's calls and are not re-argued here; they are implemented in §2
and §5.

Every quantity names the command that produced it. PowerShell is marked
`PS>`; the rest is Git Bash. `git status --short` at the start of this pass
showed `docs/a29-architecture-small.md` and `docs/css-orphans.md` modified and
`docs/a20-owner-check.md` untracked - other agents' files, none of them mine
and none touched.

**Do not re-escalate `docs/loop/leverage.md` or `docs/loop/seats.md`.** Both
were corrected at 5c99c43 (ruling 5). Revision 1's escalation was right and is
now discharged.

---

## REVISION 3 (2026-09-29) - what changed and why

Revision 3 is a TARGETED refresh, not a re-argument. It applies decisions and
measurements made AFTER revision 2 was written, which the acceptance criteria
(`docs/a38-acceptance-criteria.md`, authored after this scope) recorded as
RES-A38AC-7 (staleness) and RES-A38AC-2 (the extraction decision routed to the
architect). It does three things and leaves every other section standing:

1. **N is corrected to `min(totalCount, maxSubmissions)`** everywhere it read
   `totalCount`, per round-2 Ruling 9 and `owner-decisions-2026-09-23.md`
   DECISION 2, and it states WHERE the min is computed given `maxSubmissions` is
   server-only (§5.2).
2. **Rubric-text persistence is marked SHIPPED (by A39), not planned.** Revision
   2's wave 1 planned to persist `rubricText` under `ta-rec-grade-rubric` and
   bump the persisted-key canary seven -> eight. A39 already shipped both, so a
   wave redoing it would re-litigate a settled key count. Relabelled in §3.5,
   §4.2, §6.2, §6.3, §8 P-10 and RES-A38-7.
3. **The hook's internal shape is decided (§4.6, RES-A38AC-2):** the single-row
   builder, the attempt counter and the lock become PURE, dependency-injected,
   node-drivable units extracted OUT of `useGradingRowGrade`, because this
   repo's vitest drives no hook (AC-1/AC-3/AC-8 instrument preconditions). This
   folds in round-2 Ruling 6 (count on DISPATCH, not classification) and Ruling
   8 (the lock's press-twice instrument), which land on those same units.

**Re-measured at HEAD (2026-09-29), commands shown:**

- Panel size:
  `PS> @(Get-Content src/app/components/grading-recording/GradingRecordingPanel.tsx).Count`
  -> **977** (revision 2 measured 990 at `:101`). The §2.3 block line numbers are
  as of the revision-2 HEAD and MUST be re-measured by the wave-0 implementer at
  the P-8 gate before extracting; the drift changes the extraction ARITHMETIC,
  which §2 already routes to the gate, not the extraction DESIGN.
- Rubric persistence SHIPPED (A39): `GradingRecordingPanel.tsx:197`
  `const STORAGE_KEY_RUBRIC = "ta-rec-grade-rubric";` (commit 3370460b), load at
  `:427,:435`, save at `:969`, via `src/lib/grade/rubric-memory.ts`
  (`loadRubricMemory`/`saveRubricMemory`, scope-keyed, commit 8a977b1a) - NOT
  the `STORAGE_KEY_COURSE` single-value shape revision 2 sketched.
- Key canary already at EIGHT:
  `grep -n "ta-rec-grade-" src/app/components/grading-recording/grading-rows.test.ts`
  -> the exact set at `:689-696` includes `"ta-rec-grade-rubric"` at `:694`, and
  the A4d wiring block at `:762-769` already pins the panel's
  `STORAGE_KEY_RUBRIC` declaration.
- The single-row path still absent:
  `grep -rn "gradeAttempts\|gradedRubricDigest\|useGradingRowGrade\|gradingRowGradeAction\|gradingLockRef" src --include=*.ts --include=*.tsx | grep -v docs/`
  -> no output. Everything §4.6 and §5 build is still NEW.

### Disposition of revision 2 -> revision 3

Re-derived LAST, after all edits.

| Rev-2 element | Disposition in revision 3 |
|---|---|
| §5.2 `N = gradingRows.totalCount` | **CORRECTED** to `min(totalCount, maxSubmissions)` (Ruling 9, DECISION 2). |
| §5.1 count written via `classifyGradingResult` | **CORRECTED** (Ruling 6): the count increments on DISPATCH via a pure unit, never through the classifier (which runs only on success). |
| §4.5 lock as `useRef(false)` check-then-set | **SUPERSEDED** by §4.6 Unit 3's pure `createGradeLock()` atomic check-and-set; the shared-lock + fourth-exit design of §4.5 is KEPT. |
| §4.2 wave-1 `ta-rec-grade-rubric` persistence (STORAGE_KEY_COURSE shape) | **WITHDRAWN as work - SHIPPED by A39.** The divergence-disclosure half (the `gradedRubricDigest` per-row signal, wave 2) is KEPT and still NEW. |
| §3.5 Fence 5 seven -> eight canary bump | **WITHDRAWN as work - already eight** (A39). Fence 5 stays a live gate any NINTH key would trip. |
| §6.3 the 14-line rubric-persistence budget | **REMOVED** (shipped); budget re-based on 977. |
| §8 P-10 (the rubric persists) | **WITHDRAWN** - the behaviour it pinned already ships and is already pinned by the `grading-rows.test.ts` canary (`:689-696`) and the A4d wiring block (`:762-769`). |
| RES-A38-7 (`rubricText` never persisted) | **DISCHARGED for this surface by A39**, not by an A38 wave; the wider-class sweep it named is KEPT as a residual. |
| §8 P-1/P-2/P-4/P-5/P-7/P-13 driving the HOOK | **RE-POINTED** to the §4.6 pure units - no hook is drivable here. |
| §11 Security = NO | **CHANGED to YES for wave 2** - §5.2's `getEffectiveGradeBoundAction` is a new server action. |
| Everything else (leverage §1, extraction DESIGN §2, fences §3, §4.1-§4.4, the offer §7, the residuals) | **KEPT.** Round-2 Rulings 7, 10 and 11 are NOT resolved here - they are outside this refresh's charter and remain open round-2 items (§12). |

---

## 0. Disposition of revision 1

Re-derived LAST, after all renumbering.

| Rev-1 id | Disposition |
|---|---|
| §0 leverage claim | KEPT, **reduced**. The check judged the feature-already-exists case weak and that is right; the claim is narrowed in §1 and the removal test moves to P-1. |
| §1 measured facts | KEPT. All thirteen line counts confirmed byte-exact by the check; not re-derived. |
| §1.1 bound proof | KEPT, confirmed. |
| §1.2 caller census | KEPT, confirmed. |
| §1.3 canary | KEPT. |
| §1.4 dead badge | KEPT, confirmed with a positive control. Grep count CORRECTED: 8 hits, not 4 (ruling 4). |
| §2.1 fence 1 | KEPT, confirmed. |
| §2.2 fence 2 | **SUPERSEDED by ruling 1.** The +9 cap is withdrawn; an extraction wave precedes the feature. Arithmetic corrected: the gate is red at 1001, so today's headroom is +10, not +9. |
| §2.3 fence 3 | **WITHDRAWN AND REPLACED** (B5). It quoted `countStaticContainedPrimaries`, a fixture self-test. The live gate is `countPrimaries`. See §3.3. |
| §2.4 fence 4 | KEPT, confirmed. |
| §2.5 layer diagram | **WITHDRAWN AND REPLACED** (B3). The prop set is re-derived from the eligible-set table in §4.4 and the budget re-costed in §6.3. |
| §3 reuse list | KEPT, with three corrections: the `userEdited` refusal is now cited to CODE not a doc comment (ruling 4); the badge reuse gains a write path (B4); the `Grade` button precedent is unchanged. |
| §3.1 do-not-reuse | KEPT. Both extraction candidates it fenced remain fenced - which is why §2 had to find a THIRD, and did. |
| §4.1 bound | KEPT, but its refusal of a per-row count is **WITHDRAWN** (ruling 2). See §5. |
| §4.2 rubric | KEPT and **corrected** - as written the hint fired on every graded row after every reload (M9). See §4.2. |
| §4.3 cost disclosure | KEPT. |
| §4.4 button | KEPT, prop set re-derived. |
| §4.5 concurrency | KEPT, **corrected**: the lock is three lines and creates a FOURTH non-success exit (ruling 4). See §4.5. |
| §5 the deleted copy | **RESTRUCTURED** (B1, B2). The action and its test enter wave 1, and the OFFER moves off the action's string entirely. See §7. |
| §6 write set | REPLACED - three waves, not two. |
| §7 pass conditions | KEPT and extended. |
| RES-A38-1 (spend cap) | **WITHDRAWN as a residual - BUILT** (ruling 2). Now §5, wave 2. |
| RES-A38-2 (bulk count) | KEPT, unchanged. |
| RES-A38-3 (hash duplication) | **WITHDRAWN - it rested on a false absence** (B6). See §4.2. |
| RES-A38-4 (`fmt` duplication) | **PARTLY DISCHARGED.** `fmt` moves out of the panel in wave 0; the other three copies remain. Re-filed with a corrected baseline. |
| RES-A38-5 (reading claims) | KEPT, widened. |
| RES-A38-6 (panel headroom) | KEPT, re-based on the post-extraction count. |
| §12 minor 13 (stale cards) | **CLOSED** by ruling 5. Not re-escalated. |

---

## 1. The leverage question, answered - and reduced

The trigger fires: A38 builds a capability a user reaches.

**Class: SCALE, INHERITED not earned.** The mechanism is already in the tree:
`gradeCapturedSubmissionsAction` (`src/app/actions/grading-submission-grade.ts:131`)
pins one `systemPrompt` from the rubric (`:154`) and loops it over every
submission (`:157-194`). A38 builds none of that.

**The narrowed claim.** A38 changes the UNIT that pinned rubric can be applied
at, from the whole table to one row. What the user does instead today:
re-press "Grade submissions", which rebuilds the list from
`gradingRows.rawRows` (`GradingRecordingPanel.tsx:580-585`). What that costs:
N model calls to fix 1 - and for a row past the bound it does not work at all,
because the same N are sent and the same first `maxSubmissions` are taken
(`:151-152`).

**The check judged the feature-already-exists case WEAK and that is correct.**
Nothing in this tree grades one recording row today (§2.3's canary), so there
is no "it exists but is unreachable" reading to prefer.

**THE CALL IS THE OWNER'S, and my recommendation is ACCEPT THE COST
EXPLICITLY** - `docs/loop/leverage.md`'s second disposal. Write into the
criteria that A38's advantage is click cost and spend at a smaller unit, and
that it INHERITS SCALE rather than earning it. Do not let a later reader
credit it with integration or persistence it does not have. The claim is
falsifiable: P-1 goes red when the row-scoped projection is removed.

---

## 2. RULING 1 - THE EXTRACTION WAVE

Ruling 1 refuses an `ALLOWED_OVERAGE` entry and requires an extraction wave
before the feature, with the feature's budget measured against the
post-extraction count. A16 answered this exact wall on this exact file
(966 -> 918, comment floor rising).

### 2.1 The arithmetic, corrected

```
PS> @(Get-Content src/app/components/grading-recording/GradingRecordingPanel.tsx).Count
990
grep -n "LIMIT" src/file-size-ceiling.structure.test.ts
41:const LIMIT = 1000;
```

The failure message at `:144` reads "exceeding the repo-wide 1000-line
ceiling", so **1000 is legal and 1001 is red**. Today's headroom is **+10**,
not the +9 revision 1 asserted while also writing "RED at 1001". Ruling 4 is
right that those two numbers disagreed by one on the number the whole shape
turns on.

### 2.2 Both revision-1 candidates stay fenced

Re-confirmed, not inherited:

- The run-log collection block is read out of the panel's own source by
  `GradingRecordingPanel.wiring.test.ts:57,61,71`.
- `fmt()` alone is five lines and is duplicated in three other panels; moving
  it on its own is not an extraction.

### 2.3 THE THIRD CANDIDATE, found by measuring which blocks are unpinned

I enumerated every test that reads the panel as source text and mapped each
one to the block it pins:

```
grep -rln "GradingRecordingPanel.tsx" src --include=*.test.ts
```

| Panel block | Lines | Pinned by |
|---|---|---|
| `<RunLogRow ... />` | 705-718 | `runLogRow.test.ts:16,38-49` (exactly one per named panel, `summary=` and `onDownload=`) |
| notices wrapper | 720-764 | `GradingRecordingPanel.wiring.test.ts:71` (the `droppedFramesTotal > 0 &&` gate) |
| `<GradingCaptureSettings>` | 766-778 | wiring `:108-141` (import, render, ten bound props) |
| declaration controls | 780-786 | `GradingAssessmentDeclarationControls.test.ts:242` |
| Grading fieldset | 788-811 | `buttonVariant.test.ts` (one of the panel's three primaries) |
| Context fieldset | 813-845 | `AddKnowledgePages.test.ts:275-289` - pins the `{knowledgeContext &&` gate, finds its balanced close, and requires `<AddKnowledgePages` to sit AFTER it |
| run row | 847-877 | `buttonVariant.test.ts` (the other two primaries) |
| **capture status display** | **879-931** | **nothing** |
| trends IIFE | 932-960 | wiring `:505-672` |
| `<GradingTable>` | 962-976 | wiring `:596`, `markLate.wiring.test.ts:49` |

The absence for the capture status block, with its canary:

```
grep -rn "composeCaptureLiveSentence\|useThrottledLiveSentence\|previewRef\|statusRow\|visuallyHidden\|throttledLiveSentence\|stalled" src --include=*.test.ts | grep -i "grading\|panel"
# no output
grep -rn "AddKnowledgePages" src --include=*.test.ts | grep -i grading
# 3 lines: AddKnowledgePages.test.ts:275,282,283
```

The instrument finds a real panel pin, so the empty result is a real absence.

**WAVE 0 EXTRACTS `GradingCaptureStatus.tsx`** - the `<video>` preview, the
timer/count/extracting/catching-up status column, the throttled visually
hidden live region, the `stalled` notice, and the readings-merged hint. It is
one cohesive thing: everything the panel shows ABOUT THE CAPTURE, as opposed
to about the table. It is the direct sibling of `GradingCaptureSettings.tsx`,
which A16 wave 1 created against this same ceiling for this same reason
(`GradingRecordingPanel.tsx:114-122` records that decision).

What moves, with the measured cost of each piece:

| Moves | Lines | Evidence it is only used there |
|---|---|---|
| `fmt()` | 188-192 (5) | `grep -n "fmt(" GradingRecordingPanel.tsx` -> `:188` (the definition) and `:900` (the only call) |
| `captureLiveRegion` + `visuallyHidden` imports and their 3 comment lines | 73-77 (5) | `grep -n "visuallyHidden\|composeCaptureLiveSentence\|useThrottledLiveSentence"` -> `:76,:77` (imports), `:682-692` (the two consts), `:911` (the only render use) |
| the two live-sentence consts and their comment | 682-692 (11) | same grep |
| status row, video, live region, stalled notice | 879-918 (40) | the table above |
| readings-merged hint and its comment | 919-931 (13) | the table above |
| **TOTAL OUT** | **74** | |
| import + mount with ~9 props | (12) | |
| **NET** | **-62** | |

**Projected post-extraction panel: 990 - 62 = ~928.** That is a PROJECTION.
P-8 measures the real number at the wave-0 gate with
`PS> @(Get-Content ...).Count`, and wave 1's budget is set from the measured
value, never from this estimate. If the measured number leaves less than the
feature needs (§6.3 costs it at ~45), **the feature waits and a second
extraction is scoped** - ruling 1's own instruction, not a fallback I am free
to skip.

**The comment floor RISES, per ruling 1.** `GradingCaptureStatus.tsx` carries
its own header explaining why the live region is mounted unconditionally
(`GradingRecordingPanel.tsx:884-889`'s reasoning about
`previewRef.current.srcObject` being assigned before `capturing` flips) and
why the readings count is ordinary information rather than a danger notice
(`:919-925`). Wave 0 deletes no comment; it relocates comments with the code
they describe.

### 2.4 Wave 0 is a pure move

No behaviour change, no new state, no prop renamed. Every value the extracted
block reads (`capturing`, `elapsedSec`, `pendingFrames`, `extracting`,
`stalled`, `previewRef`, `gradingRows.totalCount`, `totalReadingsCount`)
becomes a prop. The hooks stay in the panel, exactly as
`GradingCaptureSettings.tsx` did (`GradingRecordingPanel.tsx:116-122`: "No
hook moved with it").

---

## 3. THE FENCES, corrected

### 3.1 Fence 1 - `handleGradeAll`'s binding text is frozen (CONFIRMED)

`GradingRecordingPanel.wiring.test.ts:186-191` locates the handler by the
literal `"const handleGradeAll = useCallback(async () => {"`. If it is not
found the region is `""` and the canary at `:206-209` fails, taking every pin
built on it with it: `:208` (`checkGradingReadiness`), `:259`
(`buildRunCohort(`), `:283` (first argument `result.results`), `:314`
(the identity projection reads `r.assessment`), `:349/:355/:361` (the three
non-success branches clear `lastRunCohort`), `:399/:447` (the `meta` const).

**The handler may not be renamed, may not gain a parameter, and its identity
projection may not be extracted.** Adding lines INSIDE it is safe - every pin
is a positive match over the balanced body, and the two free-identifier
whitelists (`:505-520`, `:612-637`) run over `RENDER_BODY`, not the handler.

### 3.2 Fence 2 - the ceiling. Superseded by §2.

### 3.3 Fence 3 - CORRECTED. The live gate is `countPrimaries`, not the fixture self-test

Revision 1 quoted `countStaticContainedPrimaries` (`buttonVariant.test.ts:52`),
which is only exercised by its own fixture self-test at `:245`. **The live
gate at `:229-236` calls `countPrimaries` (`:148-157`):**

```ts
function countPrimaries(source: string): number {
  let count = 0;
  for (const tag of openingTags(source)) {
    if (!/variant="contained"/.test(tag) && !/variantFor\(/.test(tag) && !/idleVariant="contained"/.test(tag)) continue;
    if (/color="error"/.test(tag) || /color="warning"/.test(tag)) continue;
    count += 1;
  }
  return count;
}
```

It bans three spellings, not one: `variant="contained"`, **`variantFor(`**,
and **`idleVariant="contained"`**. And `variantFor(` is precisely what the
sibling canary in the same file demands - `:218` fails with the message
"spell a state-dependent primary as variantFor(...)".

**So a state-dependent per-row button written the way this repo's own canary
recommends would be counted as a primary and add a key to
`FROZEN_PRIMARY_SITES`, turning `:233-236`'s `toEqual` red.** Revision 1's
design steered an implementer straight into that.

`sectionFourTsxFiles()` (`:130-139`) **WALKS** `SECTION_4_DIRS` with
`readdirSync`, and `src/app/components/grading-recording` is in that list
(`:118-126`). So wave 0's new `.tsx` and every file wave 1 adds to that
directory join this scan automatically.

**THE RULING THAT FOLLOWS.** The per-row control is a **plain
`<button type="button" className={pageStyles.linkButton}>`**, not an MUI
`<Button>` - byte-for-byte the sibling precedent at
`RepoGradeCellControl.tsx:567-576`. It carries no `variant` attribute of any
kind, so both scanners see nothing and `FROZEN_PRIMARY_SITES` is untouched.
Where §5's spend cap uses `ConfirmArmButtons`, it passes
`idleVariant="text"` - **never `idleVariant="contained"`**.

Two stale comments, found and NOT fixed by me: `GradingTableRow.tsx:271-274`
and `GradingTable.tsx:198-202` both claim `FROZEN_PRIMARY_SITES` pins them,
and neither file is a key in that map (read `:39-208` in full). They pass
because `n === 0` keeps them out of `actual`.

### 3.4 Fence 4 - the exact-set structure gates (CONFIRMED)

- `submission-kind-callsites.structure.test.ts:96-113` and `:122-129` -
  `toEqual` over a 9-path and a 3-path set, computed by walking all of `src/`.
  Any new file referencing `suggestedSubmissionKind`, `submissionKindCue`,
  `submissionKindLabel`, `SUBMISSION_KIND_LABELS` or
  `SUBMISSION_KIND_PROMPT_LABELS` turns it red. A38's new files reference only
  `submissionKind`, which is in neither matcher.
- `markLate.wiring.test.ts:92-98` - `GradingTableRow.tsx` contains no
  `new Date()` and no `Date.now(`. The run-log timestamp belongs in the hook.
- `markLate.wiring.test.ts:88-90` slices 1400 characters forward from the
  literal `"D23c. Records THAT the work was late"` and bans
  `row.submissionTimeStatus ===` inside that window. Markup added after that
  comment enters the window.

### 3.5 Fence 5 - the persisted-key canary is an exact set

`grading-rows.test.ts`'s "grading-recording persisted key canary" **walks**
`src/app/components/grading-recording/` and
`src/app/components/assessment-shared/` with `readdirSync`, collects every
`ta-rec-grade-[a-z-]*` literal, and asserts:

```
expect(keys).toEqual([
  "ta-rec-grade-assessment", "ta-rec-grade-course", "ta-rec-grade-declarations",
  "ta-rec-grade-dismissed", "ta-rec-grade-filter", "ta-rec-grade-sort",
  "ta-rec-grade-table",
]);
```

That seven-key literal is the REVISION-2 snapshot. **A39 has since shipped the
eighth key** (`ta-rec-grade-rubric`): the exact set is now
`grading-rows.test.ts:689-696` with `"ta-rec-grade-rubric"` at `:694`, and the
`it.each` wiring case already carries it (commit 3370460b). No A38 wave touches
this canary. Fence 5 stays a live gate: it walks the two directories on every
run, so any NINTH `ta-rec-grade-*` key A38 might add (it adds none) would trip it
and must be bumped in the same commit.

---

## 4. THE FIVE, SETTLED

### 4.1 THE BOUND

**A single-row grade counts against the limit mechanically and is trivially
under it, by construction and on every reachable state.** The action reads
`getGeminiMaxSubmissions()` at `:146` and applies `submissions.slice(0,
maxSubmissions)` at `:151`. `getGeminiMaxSubmissions` (`src/lib/gemini.ts:129`)
calls `parsePositiveInt(process.env.GRADE_MAX_SUBMISSIONS,
DEFAULT_MAX_SUBMISSIONS)` with **no `min` argument**, so `min = 1` and any
parsed value below 1 falls back to `DEFAULT_MAX_SUBMISSIONS = 40`
(`grep -n "DEFAULT_MAX_SUBMISSIONS" src/lib/gemini.ts` -> `:32`). Therefore
`maxSubmissions >= 1` always, and a one-element array is never in the overflow
slice. Confirmed by the check; not re-argued.

That is the bound working as designed at a smaller unit. Its stated purpose
(`grading-submission-grade.ts:50-57`) is Vercel Hobby's 60s function cap
against an unbounded sequential loop; one call is one submission's latency.

**When the table is already past the bound, that is the remedy.** Overflow
rows return through `composeFailedGradingRow` (`:196-208`), so
`classifyGradingResult` (`grading-rows.ts:275-291`) sets `state: "failed"`
with the message in `error`. Pressing that row's own control sends one
submission, which is under the bound, so it grades.

**THE ACCIDENT.** The bound is per-INVOCATION. Forty per-row presses grade
forty rows with no aggregate cap, and the 60s cap never binds because each
press is its own invocation. **A per-row button removes by construction the
only thing that today caps what one screen can spend.**

Revision 1 filed this as a residual and refused a per-row counter because "a
reload clears it". **Ruling 2 withdraws that refusal, and it is right: my own
§4.2 designs a PERSISTED per-row field for exactly that reason.** The cap is
built in §5.

### 4.2 THE RUBRIC

**The Repo Grades hazard does not exist here.** Repo Grades has an async
rubric RESOLVER (`resolveRubricForColumn`), which is what made A26's race
possible. This surface has one piece of state, `rubricText`
(`GradingRecordingPanel.tsx:383`), read synchronously at press time (`:596`).
Both paths read the same state the same way. Nothing is resolved, so nothing
can race.

**The hazard revision 2 named - the rubric is NOT PERSISTED while the rows ARE
- has since been FIXED by A39, so A38 no longer builds it.** Re-measured at
HEAD:

```
grep -n "STORAGE_KEY_RUBRIC\|rubricText" src/app/components/grading-recording/GradingRecordingPanel.tsx
197:const STORAGE_KEY_RUBRIC = "ta-rec-grade-rubric";
401:  const [rubricText, setRubricText] = useState("");
427:      const loaded = loadRubricMemory(STORAGE_KEY_RUBRIC, scope);
435:      if (loaded.entry.rubric !== rubricText) setRubricText(loaded.entry.rubric);
969:            if (scope) saveRubricMemory(STORAGE_KEY_RUBRIC, scope, { rubric: text });
```

`rubricText` still initialises `useState("")`, but a mount effect now REHYDRATES
it from `src/lib/grade/rubric-memory.ts` (`loadRubricMemory`, scope-keyed, commit
8a977b1a) and the editor saves through `saveRubricMemory` (commit 3370460b). This
is NOT the `STORAGE_KEY_COURSE` single-value shape revision 2 sketched; it is
A39's scope-keyed rubric-memory shape, which also records WHICH rubric version
graded a submission (DECISION 3's leverage point). **Revision 2's wave-1 plan to
add this persistence, and its seven -> eight key-canary bump, are WITHDRAWN as
work - both shipped.**

The two consequences revision 2 raised against a non-persisted rubric are now:

1. Overflow rows carrying a remedy offer that is not rendered after a reload:
   handled STRUCTURALLY by §7's placement - the offer renders only inside the
   same condition as the control - independent of persistence, so it holds even
   if a scope has no stored rubric. Still A38's job (§7).
2. The divergence hint firing on every graded row after a reload: mitigated,
   because the rubric now survives the reload; the M9 non-empty guard below is
   KEPT regardless, for rows graded before the digest field existed.

**The divergence disclosure is still A38's, still NEW, and it is a shape
ruling:**

> **THE OFFER BELONGS TO THE SURFACE THAT RENDERS THE CONTROL, NEVER TO THE
> SERVER ACTION THAT CANNOT SEE IT.** `gradeCapturedSubmissionsAction` runs on
> the server and has no way to know whether a rubric is present in the
> browser, whether the row is filtered out, or whether the control renders at
> all. A string it composes can assert what HAPPENED; it can never truthfully
> assert what the instructor CAN DO.

So the offer is rendered by `GradingTableRow.tsx`, adjacent to the control,
inside the same condition that decides whether the control renders. It is then
true on every reachable state by construction rather than by argument -
including after a reload with the rubric cleared, where the control is absent
and so is the offer. See §7.

**The divergence disclosure.** `GradingRow` gains
`gradedRubricDigest?: string` - optional for the reason `grading-row.ts:180-187`
already gives for `assessment` and `submissionTimeStatus` (an already-shipped
type whose existing literals must keep compiling). `GradingResultInput`
(`grading-rows.ts:141`) gains the same field and `classifyGradingResult` takes
it as a second parameter, so there is ONE writer feeding BOTH paths - the A30
shape. `applyGradingResultToRow` passes it through beside `rubricAreas`
(`:175-178`); it is a machine fact about the attempt, so it is not gated by
`userEdited`. It IS persisted (`toWire`, `grading-row-serialization.ts:129`),
because a non-persisted digest would show no warning after a reload while the
divergence is still real.

`GradingTableRow.tsx` renders one `styles.fieldHint` line when
`row.gradedRubricDigest` is a non-empty string AND differs from the current
rubric's digest. **The non-empty guard is what M9 requires**: a row graded
before this field existed, or graded while no digest could be computed, warns
about nothing. Copy, NOT frozen as a test literal per `a31-rulings.md` RULING
1's closing instruction: *"Graded against an earlier rubric."*

**The digest function - B6 corrected.** Revision 1 declared a local FNV-1a
copy because "fnv1aHash has never been imported from a client component". That
was a **FALSE ABSENCE produced by a truncated grep** (`| head` cut the list at
ten lines). Re-measured with no truncation:

```
grep -rn "fnv1aHash" src/ --include=*.ts --include=*.tsx
...
src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx:57:import { fnv1aHash } from "@/lib/lms-generation/generation-diag";
src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx:610:      fnv1aHash(ctx.materialsText),
```

Canary for the same instrument: `grep -rln "redactSensitiveText" src/
--include=*.ts --include=*.tsx` returns four files, so the grep fires.

**`fnv1aHash` is already imported and called from a shipped `"use client"`
panel.** So wave 2 imports
`fnv1aHash` from `@/lib/lms-generation/generation-diag` directly. **RES-A38-3
is withdrawn - the duplication it filed was entirely self-inflicted by that
bad grep.** Its baseline was also off by one:
`grep -rn "0x811c9dc5" src --include=*.ts --include=*.tsx` returns **two**
hits (`client-state-sweep.ts:77`, `generation-diag.ts:46`), not one.

**This is the rule this document's own opening states and revision 1 broke: a
canary before every absence, and never a `| head` on the grep that establishes
one.**

### 4.3 COST DISCLOSURE

One press is one model call (`grading-submission-grade.ts:28-48`).

Measured: this app has no cost-disclosure copy anywhere.

```
grep -rn "model call\|API call\|one call per\|costs one\|will spend" src/app/components --include=*.tsx
# one hit, a CODE COMMENT: courses/AskAiModal.tsx:23
grep -rc "model call" src/lib/grade/*.ts | grep -v ":0"
# 7 files - the instrument fires, so the absence is real
```

The nearest precedent is a count-bearing label,
`RepoGradesGrid.tsx:355`: `Grade all ${gradeTargetCount} repos in ${column.folder}`.

**A38's disclosure is STRUCTURAL.** The control is offered only on a row that
pressing it will actually grade (§4.4), and it renders inside that row's own
Actions cell, one cell from the student's name - so "what will this press
spend" is answered by where the button is. The accessible name states the
unit: `aria-label={`Grade ${row.studentName}'s submission on its own`}`.
§5's cap adds the aggregate half.

**What A38 does not fix.** The BULK press still discloses no count and cannot
honestly gain one: the true number is `min(rowCount, maxSubmissions)`, and
`maxSubmissions` is read from `process.env` on the server
(`getGeminiMaxSubmissions`, `src/lib/gemini.ts:129`) with no client reader
anywhere. "Grade 60 submissions" under a bound of 40 would be a new false
sentence. RES-A38-2.

### 4.4 THE BUTTON - state, placement, disabled, confirm

**Does the row already carry enough state? YES for the whole eligibility
decision.** `GradingRow.state` is the four-member union
(`assessment-shared/assessment-row.ts:73` via `AssessmentRowCore`), and
rubric presence is already computed by the panel as `canGrade`
(`GradingRecordingPanel.tsx:680`). No new row field is needed for eligibility.
The rubric digest (§4.2) and the attempt count (§5) answer different questions.

**Placement.** First control inside `GradingTableRow.tsx`'s existing
right-docked cluster (`:172`), before Remove and Mark late - constructive
action first, destructive last, which is that cluster's own order. No new
column; `GRADING_TABLE_COLUMN_COUNT` is unchanged.

**The eligible set**, computed by a pure leaf,
`gradingRowGradeAction(row, rubricPresent)` in `grading-dispatch.ts`:

| `row.state` | Offered | Visible label |
|---|---|---|
| `pending` | yes | `Grade` |
| `failed` | yes | `Re-grade` |
| `ready` | yes | `Re-grade` |
| `grading` | no - this row is the one in flight | `Grading…`, disabled |

`failed` MUST be in the set: it is where a bound-overflow row lands, and
excluding it (which is what copying Repo Grades' `if (cell.status !==
"ungraded") return;` at `useRepoGradesGradingActions.ts:263` would do) makes
the feature miss the case it exists for. `ready` is in the set because the
row's own note names testing a rubric edit on one submission.

**THE PROP SET, re-derived from this table (B3).** Wave 1, on both
`GradingTable.tsx` and `GradingTableRow.tsx`:

| Prop | Why it cannot be derived in the row |
|---|---|
| `onGrade: (id: string) => void` | the callback |
| `rubricPresent: boolean` | `rubricText` is panel state; the row cannot see it |
| `gradingLocked: boolean` | another row or the bulk run holds the lock; not a property of THIS row |

Derived in the row, **not** a prop: "this row is busy" is `row.state ===
"grading"`, which §1.4's badge reuse already makes true. That is three new
props in wave 1, not revision 1's two - and the derivation is stated so a
checker can falsify it rather than take it on trust.

Wave 2 adds two more: `rubricDigest: string` (current) and
`gradeCapReached: boolean` (§5 - a table-level sum the row cannot compute).
**Five props total across all waves.**

**Disabled states - three reasons, never one silent grey button:**

1. **No rubric.** The control is not rendered at all. The panel already states
   the reason once, globally (`:874-876`, "Add a rubric to grade."), and N
   disabled buttons repeating it is noise. This matches the surface's own
   no-dead-controls rule (`GradingTable.tsx:148-152`,
   `GradingTableRow.tsx:216-231`).
2. **This row is grading.** `disabled`, label `Grading…`, and the shipped
   `AssessmentStateBadge` warning badge reads `Grading` (§1.4).
3. **The lock is held elsewhere.** `disabled`, label unchanged. The instructor
   can see which row IS grading from its badge; a disabled sibling needs no
   explanation of its own.

**No confirm step - and the citation is now to CODE, not a doc comment
(ruling 4).** The real refusal is
`src/app/components/assessment-shared/assessment-row.ts:177-178`:

```ts
if (source.userEdited) {
  return { ...source, state: result.state, error: result.error ?? "" } as unknown as NoPostableIdentity<R>;
}
```

An edited row's four scored fields are structurally untouchable by a machine
result, so a mis-press cannot destroy typed feedback. Revision 1 cited
`grading-rows.ts:158-162`, which is the doc comment ABOVE
`applyGradingResultToRow`, not the code that does it.
`assessment-row.ts` is therefore a **read-only dependency of the no-confirm
argument** and is listed as checked-safe in §6.

The remaining case - replacing a machine result on an UNEDITED row - is
answered by this surface's own shipped sentence
(`GradingTableRow.tsx:120-122`): "re-reading a machine-graded row off a fresh
capture costs nothing to redo, feedback the instructor typed by hand does."
The `Re-grade` label carries the only warning warranted. **Below §5's cap:
one click, no confirm. Above it: arm-then-confirm.**

**Click count.** First use 1, repeat use 1. Today the only route is one press
that grades all N, which for an overflow row does not achieve it at all - so
the honest comparison is 1 click versus no available sequence.

**Every claim in this subsection about rendering, labels, disabled state, DOM
order and accessible names is a READING CLAIM.** `vitest.config.ts` is
`environment: "node"` and collects only `src/**/*.test.ts`; no component is
rendered by any test in this repo. -> RES-A38-5.

### 4.5 CONCURRENCY - corrected

**The A26 lock does not cover it.** `runLockRef` lives at
`useRepoGradesBulkGrade.ts:216`, in a hook this surface does not use. Read in
full, `handleGradeCell` (`useRepoGradesGradingActions.ts:257-459`) claims no
lock at all - its only protection is `disabled={edit.grading}` on the DOM
node. So even the precedent surface can interleave. Confirmed by the check.

This panel's own guard is weaker still: `gradingBusy` (`:561`) is captured
render state, the shape `useRepoGradesBulkGrade.ts:203-215` proves is not a
refusal. It happens to hold today only because MUI's `loading` prop disables
the single button.

**RULING: one lock instance, claimed by both paths, released in `finally`.**
Revision 3 makes the lock a PURE, node-drivable unit (§4.6 Unit 3,
`createGradeLock()`), because AC-8's instrument cannot drive a hook's `useRef`.
The sharing and exit design below is UNCHANGED; only the lock's implementation
moves out of the hook.

- `useGradingRowGrade` holds ONE stable `GradeLock` instance
  (`createGradeLock()` in a `useRef`) and returns it; `handleGradeAll` claims and
  releases the SAME instance via `acquire()` / `release()`.
- **Per-row presses may not interleave with each other.** Measured reason: the
  action paces its own calls with `getGeminiInterRequestDelayMs()` (default
  `1200` ms, `src/lib/gemini.ts:67`) between submissions (`:191-193`). Two
  concurrent invocations defeat the pacing the provider rate limit needs.
- **Per-row presses may not interleave with a bulk run, in either order.** A
  bulk run rebuilds every row's result and would overwrite a concurrently
  graded row with a stale one.
- A refused press is a silent no-op. The pressed button is already `disabled`
  when the lock is held, so the refusal is reachable only from a programmatic
  or double-fire path, and an error for a state the user cannot see is worse
  than nothing.

**THE CORRECTION (ruling 4 + round-2 Ruling 8): the claim in `handleGradeAll`
creates a FOURTH non-success exit, and it must sit where it cannot deadlock.**

```
const readiness = checkGradingReadiness(rubricText, gradingRows.totalCount);
if (!readiness.ok) { ...; setLastRunCohort(null); return; }  <- BEFORE acquire (existing)
if (!lock.acquire()) { setLastRunCohort(null); return; }     <- the FOURTH exit; acquire mutated nothing on refusal
try { ... } finally { lock.release(); setGradingBusy(false); }  <- release always runs
```

**Round-2 Ruling 8 (the B-1 silent-green deadlock) is dissolved by
construction.** Revision 2's snippet claimed the ref ABOVE the readiness refusal
at `GradingRecordingPanel.tsx:575`, before the `try`, so a no-rubric press held
the lock for the life of the component and every later press became a silent
no-op with every gate green. Here `acquire()` is an ATOMIC check-and-set that
mutates nothing when it returns `false` (§4.6 Unit 3), and it is reached only
AFTER the readiness refusal has already returned. A refused press never holds
the lock; a claimed lock always releases in `finally`. The AC-8 instrument is
Ruling 8's mandated one - acquire, refuse-while-held, release, acquire-succeeds -
run against `createGradeLock()` directly (§4.6, P-4), never a claims-the-lock-only
check.

`GradingRecordingPanel.wiring.test.ts:348-366` pins **three** branches that
clear `lastRunCohort` and is blind to a fourth. Left unpinned, the panel would
gain an exit that leaves the previous run's trends on screen while a click did
nothing - the exact defect A16-3 ruling 23 fixed for the readiness refusal
(`:571-574`).

**So the lock refusal clears `lastRunCohort` too, and wave 1 ADDS A FOURTH PIN
to that wiring test in the same commit.** `GradingRecordingPanel.wiring.test.ts`
is therefore an OWNED file in wave 1, not merely checked-safe.

**What the instructor sees while one row grades:** that row's badge reads
`Grading`, its button reads `Grading…` and is disabled, every other row's
button is disabled, and "Grade submissions" is disabled. **No new live region**
- the panel already has two (`:746`, `:911`, the second moving to
`GradingCaptureStatus.tsx` in wave 0) and `seats.md`'s UX checker question
plus `useRepoGradesGradingActionsParams.setPostSummary`'s own doc both say
never add a second.

---

## 4.6 THE HOOK'S INTERNAL SHAPE - three pure units (RES-A38AC-2)

This repo's vitest is `environment: "node"`, renders no component and DRIVES NO
HOOK (`docs/a38-acceptance-criteria.md` "Environment ceilings"; AC-1, AC-3 and
AC-8 INSTRUMENT PRECONDITIONs). A test cannot call `useGradingRowGrade` and
observe its ref, its counter or its dispatched payload. So the three behaviours
the AC's MACHINE instruments bind to are EXTRACTED OUT of the hook into pure,
dependency-injected units the node runtime can `import` and call directly.
`useGradingRowGrade` stays, but holds only React state wiring and the `await` -
no logic a test must reach through it.

This is ONE decision about the hook's internal shape (RES-A38AC-2's (a)-(d)),
not four. The units, their homes and how each AC's test reaches them:

### Unit 1 - the single-row submission builder (AC-1)

- **Signature, AC-1's STRONGER (preferred) form:**
  `buildSingleSubmission(row: GradingRow): { id: string; studentName: string; submissionText: string; submissionKind: GradingSubmissionKind }`
  - it returns exactly ONE submission object, the ELEMENT type of
    `gradeCapturedSubmissionsAction`'s `submissions` array
    (`grading-submission-grade.ts:13`), NOT an array. "Sends more than one row"
    is unrepresentable at the builder: its return type is a single submission.
- **Home:** `grading-dispatch.ts`, beside the existing pure leaves
  `checkGradingReadiness` (`:28`) and `buildRunCohort`; tested by
  `grading-dispatch.test.ts`.
- **The one place multiplicity is introduced** is the hook's single call site:
  `gradeCapturedSubmissionsAction([buildSingleSubmission(row)], ...)` - a
  one-element ARRAY LITERAL, length 1 by construction, never
  `gradingRows.rawRows`.
- **How AC-1's test calls it, no hook:** `buildSingleSubmission(row)` directly in
  `grading-dispatch.test.ts`, asserting the returned object's `id === row.id` and
  that it is a single object mirroring the four fields `handleGradeAll` already
  projects (`GradingRecordingPanel.tsx:638-643`). AC-1's stronger form is then a
  source/type check that the signature admits one row plus this direct-call id
  proof; no runtime length assertion is needed.
- **Why not a scalar single-row ACTION** (the fully-unrepresentable form): that
  adds a new grade endpoint and contradicts §1's leverage claim - A38 REUSES the
  existing array action and builds no new grade mechanism. Builder-returns-one +
  one-element-literal call site is the strongest form reachable WITHOUT a new
  action. LEV-1's removal (send `rawRows` instead) is caught by a reading check
  on that call site (P-1, P-9 shape) plus owner verification.

### Unit 2 - the per-row attempt counter (AC-3, round-2 Ruling 6)

Ruling 6 amended the count to increment when the call is DISPATCHED, not when it
is CLASSIFIED - because `classifyGradingResult` runs only on success
(`GradingRecordingPanel.tsx:657-681`: on `{ error }` the handler returns before
any classify), and a cap that counts only successes lets a FAILING row be
re-pressed forever. So the counter is pure functions, NOT threaded through
`classifyGradingResult`:

- **Pure primitive:** `recordGradeDispatch(count: number | undefined): number`
  = `(count ?? 0) + 1`. Home `grading-dispatch.ts`; tested directly.
- **Dispatch-time application (pure):**
  `beginGradeAttempt(row: GradingRow): GradingRow`
  = `{ ...row, state: "grading", gradeAttempts: recordGradeDispatch(row.gradeAttempts) }`.
  This is the ONE mutation written BEFORE the `await`, so the count survives an
  error, a timeout, or a navigation away mid-call.
- **The outcome path never refunds.** On success `applyGradingResultToRow`
  (`grading-rows.ts:175`) writes the scored fields and MUST PRESERVE
  `gradeAttempts` by spreading `source` - the same B4 preservation that protects
  the feedback fields. On `{ error }` / throw the hook restores the PRIOR state
  with `setGradingRowState(row, priorState)` (§6.2, B4) = `{ ...row, state }`,
  which preserves `gradeAttempts` by spread. Neither path decrements.
- **How AC-3's counter instrument is built, no hook:**
  `beginGradeAttempt({ ...row, gradeAttempts: 0 })` -> assert `gradeAttempts === 1`
  (the DISPATCH increment); then `setGradingRowState(that, "failed")` (the
  error-OUTCOME entry point) -> assert `gradeAttempts` is still `1` (survives the
  error). `recordGradeDispatch(0) === 1` pins the increment primitive alone.
  Both are plain functions under direct call.

### Unit 3 - the per-row lock (AC-8, round-2 Ruling 8)

- **Factory:** `createGradeLock(): GradeLock`, where
  `interface GradeLock { acquire(): boolean; release(): void; isHeld(): boolean }`.
  `acquire()` is an ATOMIC check-and-set: it returns `false` and mutates nothing
  when already held, returns `true` and flips to held otherwise. Home a new tiny
  leaf `grade-lock.ts`; tested by `grade-lock.test.ts`.
- **How AC-8's instrument is built, no hook (Ruling 8's press-twice sequence):**
  ```
  const lock = createGradeLock();
  expect(lock.acquire()).toBe(true);   // acquired
  expect(lock.acquire()).toBe(false);  // refused while held - only one call proceeds
  lock.release();
  expect(lock.acquire()).toBe(true);   // acquire AGAIN succeeds - proves release released
  ```
  AC-8 states a claims-the-lock-ONLY check (no second acquire-after-release) is
  INSUFFICIENT; this is the mandated sequence. P-4's sabotage: replace the
  check-and-set with an always-`true` `acquire()` (or drop the release) and watch
  `grade-lock.test.ts` go RED.
- **The deadlock Ruling 8 found is structurally impossible now** - see §4.5's
  corrected snippet: a refused `acquire()` holds nothing, `release()` is in
  `finally`, and the readiness refusal returns BEFORE `acquire()`.

### The thin hook composes them

`useGradingRowGrade` holds ONE stable lock instance
(`const lockRef = useRef<GradeLock | null>(null); if (!lockRef.current) lockRef.current = createGradeLock();`)
and returns it so `handleGradeAll` shares the SAME lock (§4.5). `gradeRow(id)`:

1. look the row up by id; return if absent;
2. `checkGradingReadiness(rubricText, 1)` (`rowCount = 1`, §4.1) - on refusal set
   the error and return, BEFORE any acquire;
3. `if (!lock.acquire()) return;` - a silent no-op that mutated nothing;
4. capture `prior = row.state`; write the dispatch state through the row mutator,
   BEFORE the await. Wave 1 writes `setGradingRowState(id, "grading")` (state
   only); wave 2 upgrades that ONE call to `beginGradeAttempt(row)` so the same
   pre-await write also increments the count (the `gradeAttempts` field is
   wave 2, §6.4);
5. `await gradeCapturedSubmissionsAction([buildSingleSubmission(row)], rubricText.trim(), knowledgeContext?.text, provider)`;
6. on `"error" in result`: set the error, restore `setGradingRowState(row, prior)`,
   return; otherwise
   `applyGradingResult(id, classifyGradingResult(result.results[0], <wave-2 digest arg>))`;
7. `finally { lock.release(); }`.

Every branch's logic is a pure unit above; the hook adds only the state setters
and the `await`, which no test in this repo claims to cover (RES-A38-5, owner
verification). A wiring test (`useGradingRowGrade.wiring.test.ts`) pins by
READING that the hook composes these units - it calls `buildSingleSubmission`,
`beginGradeAttempt`, `createGradeLock`'s instance and `classifyGradingResult`,
and wraps the payload in a one-element literal - but the MACHINE assertions live
in the pure-unit tests above, not in a driven hook.

---

## 5. RULING 2 - THE SPEND CAP IS BUILT

Ruling 2: build it on §4.2's mechanism, and measure N rather than picking a
round number. The shape of the refusal is mine to design and the owner's to
accept.

### 5.1 The mechanism

`GradingRow` gains `gradeAttempts?: number` - "model calls SPENT on this row",
not "successful grades" (round-2 Ruling 6's renaming, stated at the field so a
later reader cannot read it the other way). It is incremented **only by the
single-row path** (the bulk path is already bounded per invocation) and
persisted on the same wire as the digest, so it survives a reload.

**It increments when the call is DISPATCHED, not when it is classified**
(Ruling 6). The revision-2 design wrote it through
`classifyGradingResult` -> `applyGradingResultToRow`, which runs ONLY on success
- so a failing row, the exact row an instructor re-presses, would never count
toward the cap and could be re-pressed indefinitely. Revision 3 writes it via
`beginGradeAttempt` (§4.6 Unit 2), a pure mutation applied BEFORE the `await`;
the outcome paths (`applyGradingResultToRow` on success, `setGradingRowState` on
error) preserve it by spread and never refund. This is a per-row field, so the
per-row `gradeAttempts` are SUMMED across the table (`sumGradeAttempts`, §5.2)
for the cap.

### 5.2 N, measured rather than chosen - and WHERE the min is computed (Ruling 9, DECISION 2)

The quantity the cap must restore is the one A38 removes: an upper bound on what
one screen can spend. A bulk press spends `min(totalCount, maxSubmissions)` model
calls.

**Revision 2 set `N = gradingRows.totalCount`. Round-2 Ruling 9 and
`owner-decisions-2026-09-23.md` DECISION 2 SUPERSEDE that, and revision 3 binds
to the min:**

> **N = `min(gradingRows.totalCount, effectiveBound)`, per current course scope.
> The cap fires when the table's total per-row attempts,
> `sumGradeAttempts(rows)`, reach N** - at which point per-row grading has spent
> at least what one full re-run would.

`totalCount` alone is wrong in the direction that matters:
`DEFAULT_MAX_SUBMISSIONS = 40` (`gemini.ts:32`), so on 200 rows the old N first
confirmed after 200 per-row calls against a re-run's 40 - it exceeded one press
by `totalCount - 40` EXACTLY in the overflow case A38 exists for.

**The satisfiability problem, and the decision (RES-A38AC-2's (a), the
architect's call the AC routed here).** `totalCount` is client-readable
(`gradingRows.totalCount`, already handed to `checkGradingReadiness`,
`grading-dispatch.ts`). **`maxSubmissions` is NOT:** `getGeminiMaxSubmissions`
reads `process.env.GRADE_MAX_SUBMISSIONS` on the SERVER (`gemini.ts:129,131`) and
has no client component caller
(`grep -rln "getGeminiMaxSubmissions" src --include=*.ts --include=*.tsx` ->
actions, `src/lib/grade/*`, registry, one chat hook; no client component). So the
min cannot be taken purely client-side today. **DECISION: EXPOSE the bound.**
Wave 2 adds a read-only server action
`getEffectiveGradeBoundAction(): Promise<{ bound: number }>` in
`grading-submission-grade.ts` (same `"use server"` module, guarded by
`requireOwner()` exactly like `gradeCapturedSubmissionsAction` at `:65,:141`),
returning `getGeminiMaxSubmissions()`. The panel fetches it once on mount into
`effectiveGradeBound: number | null`.

**Why exposed, not the two alternatives.**

- *Computed server-side and returned FROM the grade action* (the "returned to the
  client" option): the confirm is a PRE-dispatch UI gate, so N is needed before
  the action runs. Caching the bound from a prior grade RETURN leaves a hole on
  RELOAD - persisted `gradeAttempts` can already sit at the threshold on the
  first press of a session, before any grade call this session has returned the
  bound, so the overflow-case confirm would be one ungated model call late after
  every reload. That is a spend-cap hole in exactly the case the cap exists for.
- *A `NEXT_PUBLIC_` mirror of the env var*: two sources of truth for one bound,
  drifting silently. A mount-fetched reader is one source, always fresh.

**The threshold is a PURE, node-testable function, independent of how the bound
is sourced** - three pure leaves in `grading-dispatch.ts`, tested directly by
`grading-dispatch.test.ts`:

- `computeGradeConfirmThreshold(totalCount: number, effectiveBound: number | null): number`
  = `Math.min(totalCount, effectiveBound ?? totalCount)`. While the fetch is in
  flight (`null`), N falls back to `totalCount`, so the confirm can only fire
  LATER, never earlier - no dismissal-training during the brief pre-fetch window.
- `sumGradeAttempts(rows: ReadonlyArray<GradingRow>): number`.
- `requiresGradeConfirm(totalAttempts: number, n: number): boolean`
  = `totalAttempts >= n`.

**How AC-3's "N = min" instrument is built, no hook:** drive
`getEffectiveGradeBoundAction` with `getGeminiMaxSubmissions` mocked low (the
pattern already at `grading-submission-grade.test.ts:288-331`) and assert it
returns the low bound; then `computeGradeConfirmThreshold(200, 3) === 3` (the
min, NOT `totalCount`) and `computeGradeConfirmThreshold(2, 40) === 2`. P-13.
N is derived, scales with the table, and is not the server bound the client
cannot see.

### 5.3 The refusal's shape

**Disclosure plus confirm above N - never a hard stop.** A hard stop on a
legitimate long session is worse than the spend, and it would be unrecoverable
without clearing the table.

The DECISION to require the confirm is a PURE predicate the panel computes and
passes to the row as a prop `gradeCapReached: boolean`
= `requiresGradeConfirm(sumGradeAttempts(rows), computeGradeConfirmThreshold(totalCount, effectiveGradeBound))`
(§5.2) - a table-level sum the row cannot compute itself. This is node-testable
(P-13) without rendering anything. **The RENDER is owner-verification:** above N
the per-row control switches from a bare button to the shipped
`ConfirmArmButtons` arm/confirm idiom with `idleVariant="text"` (fence 3), and
its consequence line names the count:
*"This table has already been graded row by row N times."* The count is a
measured fact about the table, so the sentence holds on every reachable state -
but that it actually appears, arms and announces is RES-A38-5, not machine
-checkable here.

`confirmArmButtons.test.ts:196-208` walks every `.tsx` under
`src/app/components` and bans an `onBlur` paired with a consequence
`aria-describedby` on the same element. This design has no `onBlur`; noted so
the implementer does not add one.

**The owner accepts or rejects the shape.** If the owner prefers a hard stop
or plain disclosure with no confirm, that is a one-value change to this wave
and does not alter the mechanism.

---

## 6. WRITE SET AND WAVE PLAN

**THREE waves, STRICTLY SEQUENTIAL.** They intersect on the panel and the row,
so this item is one implementer at a time - never a parallel fan-out.
Intersection computed, not eyeballed:

```
comm -12 <(printf '%s\n' <wave1 paths> | sort) <(printf '%s\n' <wave2 paths> | sort)
-> src/app/components/grading-recording/GradingRecordingPanel.tsx
   src/app/components/grading-recording/GradingTable.tsx
   src/app/components/grading-recording/GradingTableRow.tsx
   src/app/components/grading-recording/grading-rows.ts
   src/app/components/grading-recording/useGradingRowGrade.ts
```

### 6.1 Wave 0 - the extraction (ruling 1). No behaviour change.

| Path | Change |
|---|---|
| `src/app/components/grading-recording/GradingCaptureStatus.tsx` | **NEW.** §2.3's block plus `fmt`, with its own header. |
| `src/app/components/grading-recording/GradingRecordingPanel.tsx` | 74 lines out, ~12 back. Projected 990 -> ~928, **measured at the gate**. |

**GATE: `PS> @(Get-Content src/app/components/grading-recording/GradingRecordingPanel.tsx).Count`
before wave 1 is briefed.** Wave 1's budget is set from that number. If it
leaves under ~50 lines of headroom, a second extraction is scoped and the
feature waits - ruling 1.

### 6.2 Wave 1 - the single-row path, end to end

Caller-complete: every new export is called inside this wave.

| Path | Change |
|---|---|
| `grading-dispatch.ts` | NEW pure leaves (§4.6): `gradingRowGradeAction(row, rubricPresent)` returning `{ gradeable, label }`; `buildSingleSubmission(row)` (Unit 1). `checkGradingReadiness` unchanged and REUSED with `rowCount = 1`. (Unit 2's counter and §5.2's threshold leaves land in WAVE 2 with the `gradeAttempts` field.) |
| `grade-lock.ts` | **NEW.** `createGradeLock()` -> `GradeLock` with atomic `acquire`/`release`/`isHeld` (§4.6 Unit 3). |
| `grading-rows.ts` | NEW pure `setGradingRowState(row, state)` returning `{ ...row, state }` - **B4's fix**, and the error-outcome entry point for AC-3. |
| `useGradingRows.ts` | NEW `markRowState(id, state)` wrapping it. |
| `useGradingRowGrade.ts` | **NEW.** Holds one `createGradeLock()` instance (returned for `handleGradeAll` to share) and `gradeRow(id)`, which COMPOSES the pure units (§4.6) - no untestable logic of its own. |
| `GradingRecordingPanel.tsx` | Hook call; lock claim/release/cohort-clear in `handleGradeAll` (§4.5); 3 props to `<GradingTable>`. Rubric persistence is NOT here - A39 shipped it (§4.2). |
| `GradingTable.tsx` | 3 props declared and forwarded. |
| `GradingTableRow.tsx` | The button and the adjacent offer line. No `new Date()`, no `variant`. |
| **`src/app/actions/grading-submission-grade.ts`** | **B1.** The header at `:58-63` asserts "there is no control that grades a subset" - false after this wave. Corrected, and the emitted overflow string is left offering nothing (§4.2's shape ruling). |
| **`src/app/actions/grading-submission-grade.test.ts`** | **B1.** P-3's guard over the EMITTED string. |
| `GradingRecordingPanel.wiring.test.ts` | **OWNED** - the fourth cohort-clearing pin (§4.5). |
| `grading-rows.test.ts` | `setGradingRowState` (state-only write; `gradeAttempts` preserved by spread). **NOT the persisted-key canary - already at eight (A39).** |
| `grading-dispatch.test.ts` | The eligibility predicate and `buildSingleSubmission` (P-1). The AC-3 counter and threshold leaves are tested here in wave 2 (§6.4). |
| `grade-lock.test.ts` | **NEW.** AC-8's acquire / refuse-while-held / release / acquire-succeeds (P-4), plus the sabotage. |
| `useGradingRowGrade.wiring.test.ts` | **NEW, READING/wiring only.** Pins that the hook composes the pure units (one-element literal, `beginGradeAttempt` before await, shared lock, `classifyGradingResult` reuse). MACHINE assertions live in the pure-unit tests, not a driven hook. |

**B4 in full, because it is subtle.** The only mutator that reaches a row
today is `applyGradingResult` -> `applyGradingResultToRow` ->
`applyAssessmentResult` (`assessment-row.ts:173-189`). On an unedited row it
writes `totalScore`/`strengths`/`improvements`/`overallComment` from the
input, and `applyGradingResultToRow` then sets `rubricAreas` from the input
too. **Using it to set `state: "grading"` would blank a graded row's feedback
and its rubric areas - permanently, because when the action returns
`{ error }` the handler sets `gradeError` and returns without applying any
result.** Hence `setGradingRowState`: a pure state-only write that touches
nothing else. The hook captures the row's PRIOR state before the press and
restores it with the same function on every non-apply exit.

### 6.3 Wave 1's line budget, re-costed from §4.4's prop set (B3)

| Addition to the panel | Lines |
|---|---|
| import the hook | 1 |
| hook call, multi-line | 6 |
| `handleGradeAll` lock claim, release, cohort clear | 4 |
| 3 props on `<GradingTable>` | 3 |
| hinge comments, house style | ~10 |
| **TOTAL** | **~24** |

The `ta-rec-grade-rubric` const + initializer + setter (revision 2 costed at 14)
is GONE from this budget - A39 shipped it, and those lines are already counted in
the measured 977 (§4.2).

**Re-based projection.** The panel measures 977 at HEAD (not the 990 of revision
2). Wave 0's net -62 (§2, unchanged design, arithmetic to be re-measured at the
gate) projects ~915; wave 1's ~24 projects **~939**; wave 2 adds roughly 6.
Against a legal maximum of 1000 (red at 1001). **These are projections. P-8
measures at every wave gate and is the authority; round-2 Ruling 7 binds the
wave-0 gate to set wave 1's budget from the measured post-extraction count, not
from this estimate.**

### 6.4 Wave 2 - rubric provenance and the spend cap

Both ride the same wire, so they land together.

| Path | Change |
|---|---|
| `grading-row.ts` | `gradedRubricDigest?: string`; `gradeAttempts?: number` (documented AT the field as "model calls SPENT", Ruling 6). |
| `grading-dispatch.ts` | Unit 2's `recordGradeDispatch`/`beginGradeAttempt` (§4.6); §5.2's `computeGradeConfirmThreshold`/`sumGradeAttempts`/`requiresGradeConfirm`. |
| `grade-lock.ts`, `grade-lock.test.ts` | Already landed in wave 1; unchanged here. |
| `grading-rows.ts` | `classifyGradingResult` gains a second parameter carrying the DIGEST ONLY (NOT the count - Ruling 6 keeps the count off this success-only path); `applyGradingResultToRow` passes the digest through AND preserves `gradeAttempts` by spread. Imports `fnv1aHash` from `@/lib/lms-generation/generation-diag` (§4.2). |
| `grading-row-serialization.ts` | `toWire`/`fromWire`: two new keys. |
| **`src/app/actions/grading-submission-grade.ts`** | **NEW** read-only action `getEffectiveGradeBoundAction()` returning `getGeminiMaxSubmissions()`, guarded by `requireOwner()` (§5.2). This is the wave that flips Security to YES (§11). |
| `GradingRecordingPanel.tsx` | The bulk `classifyGradingResult` call at `:677` passes the digest; fetch `getEffectiveGradeBoundAction` once on mount into `effectiveGradeBound`; compute `gradeCapReached` (§5.3); upgrade the hook's dispatch write to `beginGradeAttempt`; 2 props to `<GradingTable>` (`rubricDigest`, `gradeCapReached`). |
| `useGradingRowGrade.ts` | Passes the digest to `classifyGradingResult`; swaps its wave-1 `setGradingRowState(id, "grading")` dispatch write to `beginGradeAttempt(row)` so the count increments on dispatch. |
| `GradingTable.tsx`, `GradingTableRow.tsx` | The 2 props, the divergence hint, the arm/confirm above N. |
| `grading-row-serialization.test.ts` | `EXPECTED_WIRE_KEYS` **19 -> 21** - an ORDERED exact-array pin at `:707-731`, asserted at `:735` and `:740`. |
| `src/app/actions/grading-submission-grade.test.ts` | `getEffectiveGradeBoundAction` returns the bound with `getGeminiMaxSubmissions` mocked low (AC-3 N=min); the `requireOwner` guard. |
| `src/app/actions/action-guard-coverage.test.ts` | `getEffectiveGradeBoundAction` joins the guarded-surface set (§6.5). |
| `grading-dispatch.test.ts` | `recordGradeDispatch`/`beginGradeAttempt` (AC-3 counter), `computeGradeConfirmThreshold`/`sumGradeAttempts`/`requiresGradeConfirm` (P-13). |
| `grading-rows.test.ts`, `grading-row.test.ts` | The new classifier argument and the fixtures. |

Wave 2 changes a PERSISTED shape, so `seats.md`'s Data/storage trigger fires:
an 8-character digest and a small integer per row, against
`useAssessmentRowStore`'s existing reduced/full storage-full fallback
(`useGradingRows.ts:196-198`). **That seat must state the byte figure, not
assert it is small.** Wave 2 also adds `getEffectiveGradeBoundAction`, a new
server action, so `seats.md`'s Security trigger fires (§11): the seat confirms
the guard holds and that a config integer is all that egresses.

### 6.5 The `owns` list, derived - AND ITS BLIND SPOT NAMED (M7)

**Derivation 1 - tests that name an edited file:**

```
grep -rln "GradingRecordingPanel.tsx\|GradingTable.tsx\|GradingTableRow.tsx\|grading-submission-grade.ts\|grading-dispatch\|grading-rows" src --include=*.test.ts | sort
```

```
src/app/actions/grading-submission-grade.test.ts
src/app/components/assessment-shared/assessment-row.test.ts
src/app/components/course-intel/courseIntelOfflineTables.test.ts
src/app/components/grading-recording/GradingAssessmentDeclarationControls.test.ts
src/app/components/grading-recording/GradingRecordingPanel.assessment.test.ts
src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts
src/app/components/grading-recording/classTrendsRunCohort.test.ts
src/app/components/grading-recording/copy-feedback.test.ts
src/app/components/grading-recording/grading-capture-tombstones.test.ts
src/app/components/grading-recording/grading-dispatch.test.ts
src/app/components/grading-recording/grading-feedback-prompt.test.ts
src/app/components/grading-recording/grading-recording-log.test.ts
src/app/components/grading-recording/grading-row-serialization.test.ts
src/app/components/grading-recording/grading-row.test.ts
src/app/components/grading-recording/grading-rows.test.ts
src/app/components/grading-recording/markLate.wiring.test.ts
src/app/components/grading-recording/submission-kind-callsites.structure.test.ts
src/app/components/grading-recording/useGradingRows.wiring.test.ts
src/app/components/module-deck-capture/ModuleDeckCapturePanel.wiring.test.ts
src/app/components/module-deck-capture/module-deck-dispatch.test.ts
src/app/components/recording/AddKnowledgePages.test.ts
src/app/components/recording/discussion-capture.test.ts
src/app/components/recording/discussion-knowledge-context.test.ts
src/app/components/recording/runLogRow.test.ts
src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts
src/app/components/ui/buttonVariant.test.ts
src/app/components/ui/confirmArmButtons.test.ts
src/lib/recording-launch.test.ts
```

**THE BLIND SPOT, which revision 1 did not name.** That grep is FILENAME-based
and cannot see a test that discovers files by walking a directory. Those tests
do not mention any path A38 edits, yet **every new file A38 adds joins their
scan automatically.** Wave 0 adds a `.tsx` and wave 1 adds two `.ts` files to
a walked directory, and wave 1's new client file imports a `"use server"`
module.

**Derivation 2 - the walkers:**

```
grep -rln "readdirSync\|readdir(" src --include=*.test.ts | sort | wc -l
39
```

Thirty-nine. The ones whose root actually reaches A38's new files, each
checked by opening its root constant:

| Walker | Root | What a new A38 file must satisfy |
|---|---|---|
| `src/file-size-ceiling.structure.test.ts` | all of `src/` | each new file <= 1000 lines |
| `src/lib/no-emojis.test.ts` | `src` and `docs` | no emoji - **including in this document** |
| `submission-kind-callsites.structure.test.ts` | `src/` recursively | neither identifier set (fence 4) |
| `grading-rows.test.ts` (key canary) | `grading-recording/`, `assessment-shared/` | fence 5's eight-key exact set |
| `buttonVariant.test.ts` | `SECTION_4_DIRS`, includes `grading-recording` | no `variant="contained"`, no `variantFor(`, no `idleVariant="contained"` (fence 3) |
| `confirmArmButtons.test.ts` | all `.tsx` under `src/app/components` | no `onBlur` beside a consequence `aria-describedby` (§5.3) |
| `src/lib/use-server-exports.test.ts` | walks for `"use server"` files | the action keeps exporting only async functions |
| `src/lib/module-graph/runtime-import-graph.test.ts` | import graph | the new hook's imports |
| `src/lib/canvas-client-boundary.transitive.test.ts` | transitive imports | the new client file pulls in no Canvas server module |
| `src/lib/grade/grade-result-doors.wiring.test.ts` | grade-result boundary | no `GradeResult` reaches this surface (`grading-row.ts`'s R0-2) |
| `src/app/actions/action-guard-coverage.test.ts` | `src/app/actions` | the edited action keeps its `requireOwner()` |
| `src/tools/vitest-paths/gate-commands.structure.test.ts` | all of `docs/**/*.md` | **this document** holds no raw multi-path test command |

The last row is why this document spells its gate as
`npm run test:paths --`. Verified: `npx vitest run
src/tools/vitest-paths/gate-commands.structure.test.ts` exits 0, 28 passed,
with this file present.

**THE VERIFY GATE** is derivation 1 plus the walkers, one command, exit code
read from a file and never from a pipe:

```
npm run test:paths -- src/app/actions/grading-submission-grade.test.ts src/app/components/assessment-shared/assessment-row.test.ts src/app/components/course-intel/courseIntelOfflineTables.test.ts src/app/components/grading-recording/GradingAssessmentDeclarationControls.test.ts src/app/components/grading-recording/GradingRecordingPanel.assessment.test.ts src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts src/app/components/grading-recording/classTrendsRunCohort.test.ts src/app/components/grading-recording/copy-feedback.test.ts src/app/components/grading-recording/grading-capture-tombstones.test.ts src/app/components/grading-recording/grading-dispatch.test.ts src/app/components/grading-recording/grading-feedback-prompt.test.ts src/app/components/grading-recording/grading-recording-log.test.ts src/app/components/grading-recording/grading-row-serialization.test.ts src/app/components/grading-recording/grading-row.test.ts src/app/components/grading-recording/grading-rows.test.ts src/app/components/grading-recording/markLate.wiring.test.ts src/app/components/grading-recording/submission-kind-callsites.structure.test.ts src/app/components/grading-recording/useGradingRows.wiring.test.ts src/app/components/grading-recording/useGradingRowGrade.wiring.test.ts src/app/components/grading-recording/grade-lock.test.ts src/app/components/module-deck-capture/ModuleDeckCapturePanel.wiring.test.ts src/app/components/module-deck-capture/module-deck-dispatch.test.ts src/app/components/recording/AddKnowledgePages.test.ts src/app/components/recording/discussion-capture.test.ts src/app/components/recording/discussion-knowledge-context.test.ts src/app/components/recording/runLogRow.test.ts src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts src/app/components/ui/buttonVariant.test.ts src/app/components/ui/confirmArmButtons.test.ts src/lib/recording-launch.test.ts src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts src/lib/use-server-exports.test.ts src/lib/module-graph/runtime-import-graph.test.ts src/lib/canvas-client-boundary.transitive.test.ts src/lib/grade/grade-result-doors.wiring.test.ts src/app/actions/action-guard-coverage.test.ts src/tools/vitest-paths/gate-commands.structure.test.ts
```

Never a raw multi-path `vitest`/`npm test` - that form silently drops any
argument it does not match and exits 0 (`docs/loop/this-repo.md` section 1).
Typecheck is `npx tsc --noEmit --incremental false`, never the bare form and
never with file arguments.

---

## 7. THE DELETED COPY - restructured (B1, B2)

**The shape ruling from §4.2 governs: the offer belongs to the surface that
renders the control.**

### 7.1 A31's shared sentence does NOT change

`UNGRADED_NOT_ATTEMPTED_MESSAGES` (`src/lib/grade/types.ts:193-195`) is read
by the engine entry points and, since A34, by
`grading-submission-grade.ts:205`. A38 gives one of those consumers a remedy.
`a31-rulings.md` RULING 1: a sentence may assert only what holds on every
caller and every reachable state. **`src/lib/grade/types.ts` is not in any
A38 write set**, and neither are `ungradedDisclosure.ts`, `GradingResults.tsx`
or `DraftedGradesTab.tsx` (`grep -rn "ungradedDisclosure" src/ --include=*.ts
--include=*.tsx` returns four non-test hits, none in `grading-recording/`).

**Revision 1 said A31 established the same shape on "the five engine entry
points". That figure is INHERITED from A31 and I did not measure it** (ruling
4). It is not restated as a measured quantity here, and nothing in this design
depends on the number.

### 7.2 A34's sentence: the file changes, the emitted string does not gain an offer

`grading-submission-grade.ts` and its test are in **wave 1** (B1).

**The emitted overflow string keeps its current text.** It says what happened
and offers nothing - which stays correct, because the action cannot see
whether the control renders. What changes in that file is the HEADER at
`:58-63`, which currently asserts:

> "this action's sole production caller (GradingRecordingPanel.tsx's
> handleGradeAll) always rebuilds its submission list from the whole table, so
> there is no control that grades a subset"

**That becomes false the moment wave 1 lands**, and a comment asserting a
falsehood at instruction authority is how this repo has misled four passes
already. Wave 1 corrects it to name the per-row control and to state the
reason the emitted string still carries no offer.

### 7.3 The offer, where it is true

`GradingTableRow.tsx` renders it inside the same condition that renders the
control, so it cannot be read while the control is absent:

- rubric absent (including a reload with the rubric cleared) -> no control, no
  offer;
- row filtered out -> neither is rendered;
- row in any eligible state -> both render, adjacent, in the same `<tr>`; the
  message is `row.error` in the Status cell (`GradingTableRow.tsx:157`) and
  the control is in the Actions cell.

And the action always succeeds at getting past the bound, because §4.1 proves
`maxSubmissions >= 1` on every reachable state.

Copy, **not frozen as a test literal** (`a31-rulings.md` RULING 1's closing
instruction): *"Grade this row on its own to get past the run limit."*

---

## 8. PASS CONDITIONS

Each names the OBJECT, the INSTRUMENT, and the DIRECTION of failure.

**P-0 (wave 0 is a pure move).** OBJECT: the panel's behaviour.
INSTRUMENT: the full §6.5 gate, which must be green with no test edited in
wave 0. DIRECTION: RED if any assertion needed changing - that would mean the
move was not a move.

**P-1 (the removal test for §1's claim - no hook driven).** OBJECT: the single
submission `buildSingleSubmission(row)` returns (§4.6 Unit 1), and the hook's
call site that wraps it. INSTRUMENT: [MACHINE] call `buildSingleSubmission(row)`
directly in `grading-dispatch.test.ts` and assert it returns one submission with
`id === row.id` mirroring the four projected fields - the STRONGER form, since
the return TYPE is a single submission, not an array. [READING] a source pin in
`useGradingRowGrade.wiring.test.ts` that the action call is
`gradeCapturedSubmissionsAction([buildSingleSubmission(...)], ...)` and never
`gradingRows.rawRows`. DIRECTION: RED when the builder returns more than the one
row or the wrong id (machine); RED on REMOVAL (call site sends `rawRows`) via the
reading pin. Owner verification confirms the render (RES-A38-5).

**P-2 (one classifier, not two - no hook driven).** OBJECT: the classification
the single-row path applies. INSTRUMENT: [MACHINE] `classifyGradingResult` is a
shared pure function with its own unit coverage (`grading-rows.test.ts`); the
single-row path reuses it rather than re-implementing classification. [READING] a
source pin in `useGradingRowGrade.wiring.test.ts` that the hook applies
`classifyGradingResult(result.results[0], ...)` - not a private copy, not a
raw `applyGradingResult`. DIRECTION: RED when the hook does not route the single
result through the shared classifier. **Not a bare grep for the identifier** - a
name pin passes on a file that imports the classifier and ignores it; the pin
must show the classifier's output feeding `applyGradingResult`.

**P-3 (the emitted overflow string offers nothing).** OBJECT: the string
`composeFailedGradingRow` receives in the overflow loop, captured by driving
the real action with `getGeminiMaxSubmissions` mocked low
(`grading-submission-grade.test.ts:287` already does this at 3). DIRECTION:
RED when it contains `Retry`, `Re-run`, `queue`, or any offer of an action.
**Never a grep over the file's source text** - `a31-rulings.md` RULING 4
records that a retired literal kept as an allowlist makes a file grep print
lines on correct code forever.

**P-4 (the lock refuses while held and re-acquires after release - no hook
driven, AC-8).** OBJECT: a `createGradeLock()` instance (§4.6 Unit 3).
INSTRUMENT: [MACHINE] in `grade-lock.test.ts`, Ruling 8's mandated sequence -
`acquire()` -> true, `acquire()` -> false while held, `release()`, `acquire()`
-> true again. A claims-the-lock-only check (no second acquire-after-release) is
INSUFFICIENT per AC-8 and must not be the sole instrument. DIRECTION: RED when
the second acquire returns true while held, or the post-release acquire returns
false. **SABOTAGE PROOF REQUIRED:** replace the atomic check-and-set with an
always-`true` `acquire()`, or drop the `release()`, and watch this go RED. That
the two production paths both route through the shared instance is P-5's reading
pin plus owner verification.

**P-5 (the bulk path shares the lock, and the fourth exit clears the cohort).**
OBJECT: (a) that both `gradeRow` and `handleGradeAll` acquire/release the SAME
lock instance; (b) `lastRunCohort` on `handleGradeAll`'s acquire-refusal exit.
INSTRUMENT: [MACHINE] the new FOURTH cohort-clearing pin in
`GradingRecordingPanel.wiring.test.ts` (§4.5), a source pin over the balanced
handler body. [READING] a pin that both paths call `lock.acquire()`/`release()`
on the instance the hook returns (the exclusivity itself is proven by P-4's lock
unit; that both paths go through it is reading + owner verification). DIRECTION:
RED when the acquire-refusal exit leaves a stale cohort (machine), or when either
path bypasses the shared lock (reading). Non-interleave at runtime is
owner-verification (RES-A38-5).

**P-6 (`failed` rows are eligible).** OBJECT:
`gradingRowGradeAction({ ...row, state: "failed" }, true).gradeable`.
DIRECTION: RED when false. This catches a copy of Repo Grades' guard.

**P-7 (state round trip, and nothing is blanked - no hook driven).** OBJECT: the
pure mutators the hook composes on the error path. INSTRUMENT: [MACHINE] in
`grading-rows.test.ts`, drive the pure functions directly: from a graded row,
`setGradingRowState(row, "grading")` (wave 1) / `beginGradeAttempt(row)` (wave 2)
sets `"grading"`, then `setGradingRowState(that, prior)` restores the prior state;
assert `strengths`/`improvements`/`overallComment`/`totalScore`/`rubricAreas`
(and, wave 2, `gradeAttempts`) are unchanged across the round trip. DIRECTION: RED
when `"grading"` never appears, when the restore does not return the prior state,
**or when any scored field differs from its pre-press value** - which is exactly
what routing the in-flight state through `applyGradingResult` would do (B4).

**P-8 (the ceiling, measured at every wave gate).** OBJECT: each touched
file's line count. INSTRUMENT: `src/file-size-ceiling.structure.test.ts`
(`countLines`), cross-checked with `PS> @(Get-Content ...).Count`. DIRECTION:
RED at 1001. **Run at the END of wave 0 to set wave 1's budget, and again at
the end of each later wave. Never inferred from §2.3's or §6.3's projections.**

**P-9 (the offer is never readable without its control).** OBJECT: the row
markup. INSTRUMENT: a source-text assertion that the offer literal appears
only inside the same conditional expression as the control's tag. DIRECTION:
RED when it is reachable independently. **This is a reading claim about
reachability in SOURCE, and it does not prove the rendered result** - only the
owner's browser does (RES-A38-5).

**P-10 - WITHDRAWN.** The rubric-persistence behaviour it pinned already ships
(A39, commit 3370460b) and is already covered by `grading-rows.test.ts`'s
eight-key canary (`:689-696`) and the A4d wiring block (`:762-769`). No A38 wave
touches it, so it needs no A38 pass condition.

**P-11 (wave 2 - both fields survive the wire).** OBJECT:
`fromWire(toWire(row))`. DIRECTION: RED when either is lost;
`EXPECTED_WIRE_KEYS` 19 -> 21 in the same commit.

**P-12 (wave 2 - the divergence hint does not fire on a legacy row).**
OBJECT: the hint's condition for a row whose `gradedRubricDigest` is
`undefined` or `""`. DIRECTION: RED when it warns. **This is M9's assertion**
and it must be watched failing against a version without the non-empty guard.

**P-13 (N is `min(totalCount, maxSubmissions)`, derived not hardcoded - no hook
driven, AC-3/Ruling 9).** OBJECT: `computeGradeConfirmThreshold` and
`requiresGradeConfirm` (§5.2), and the exposed bound. INSTRUMENT: [MACHINE] in
`grading-dispatch.test.ts`, `computeGradeConfirmThreshold(200, 3) === 3` (the
min, NOT `totalCount`), `computeGradeConfirmThreshold(2, 40) === 2`, and
`computeGradeConfirmThreshold(200, null) === 200` (pre-fetch fallback); in
`grading-submission-grade.test.ts`, `getEffectiveGradeBoundAction` returns the
low bound with `getGeminiMaxSubmissions` mocked (`:288-331` pattern). DIRECTION:
RED when N equals `totalCount` in the overflow case (the Ruling 9 defect), when
the confirm fires below N, or when N does not move with either input. This is the
pass condition that the round-2/DECISION-2 correction actually landed.

**NOT COVERABLE HERE, stated rather than papered over:** that the button
renders, its labels, its disabled appearance, the `Grading` badge, the hint's
wrapping, focus order, and the arm/confirm's announcement. No component is
rendered by any test in this repo. **No requirement in this document names a
render as its enforcer.** -> RES-A38-5.

---

## 9. NOT TRIVIALLY REVERTIBLE

- **Wave 2's two wire keys.** Reverting leaves them in stored JSON. `fromWire`
  reads enumerated keys and does not reject extras, so the revert is safe, but
  the stored data is not cleaned.
- **`classifyGradingResult`'s second parameter** (wave 2) - a shared-function
  signature with two production callers and one test file.
- **`getEffectiveGradeBoundAction`** (wave 2) - a new `"use server"` export;
  reverting removes the endpoint and the panel's mount fetch together (one file
  each), leaving no stored state.
- Wave 0 is a pure move and wave 1's remainder is additive; both revert in one
  file each.

---

## 10. RESIDUAL REGISTER

Each names an OWNER, an INSTRUMENT and the STEP that will measure it. **None
of these exists until it is in `docs/BACKLOG.md`.** I was told to touch only
this document, so the orchestrator carries them across at A38's disposal.

**RES-A38-2 - the bulk press discloses no count and cannot honestly gain one.**
OWNER: the next chunk whose write set includes `src/lib/gemini.ts` or
`GradingRecordingPanel.tsx`. INSTRUMENT: `grep -rn "getGeminiMaxSubmissions"
src --include=*.ts --include=*.tsx` - every caller is server-side today;
discharged when a client-reachable reader of the effective bound exists.
DIRECTION: a label asserting a graded count while `maxSubmissions < rowCount`
is a new false sentence under `a31-rulings.md` RULING 1. STEP: that chunk, and
no later than the next change to the bulk button's label.

**RES-A38-4 - `fmt()` is duplicated across four panels; wave 0 removes one.**
OWNER: the next chunk whose write set includes two or more of
`LegibilityProbeModal.tsx`, `ModuleDeckCapturePanel.tsx`,
`WalkthroughAnnouncementPanel.tsx`, `GradingCaptureStatus.tsx`. INSTRUMENT:
`grep -rn "Math.floor(seconds / 60)" src/ --include=*.ts --include=*.tsx |
grep -v test` - **four hits today** (`GradingRecordingPanel.tsx:189`,
`LegibilityProbeModal.tsx:123`, `ModuleDeckCapturePanel.tsx:118`,
`WalkthroughAnnouncementPanel.tsx:121`), still four after wave 0 with the
first at a new path. DIRECTION: a fifth copy. STEP: that chunk. Not A38's
charter.

**RES-A38-5 - every UI claim in §4.4, §5.3 and §7.3 is a reading claim.**
OWNER: the repo owner, in a real browser. INSTRUMENT: a capture session with
`GRADE_MAX_SUBMISSIONS` set below the row count so at least one row lands in
`failed` with the overflow message; press that row's control; then reload with
the rubric present and again after clearing it; then exceed the cap.
DIRECTION: the control is absent or mislabelled, not disabled while another
row grades, the `Grading` badge does not appear, the offer is readable with no
control beside it, the divergence hint fires on rows it should not, or the
arm/confirm does not announce. STEP: the owner-verification pass, batched with
A31's RES-A31-4 and A36's, which need the same browser session.

**RES-A38-6 - the panel's remaining headroom after A38.**
OWNER: the next chunk whose write set includes `GradingRecordingPanel.tsx`.
INSTRUMENT: `PS> @(Get-Content src/app/components/grading-recording/GradingRecordingPanel.tsx).Count`
against `LIMIT = 1000`. DIRECTION: red at 1001. STEP: that chunk measures
first and owes an extraction before its own code if the margin is thin. §2.3's
table records which blocks are fenced by source-text pins, so the next
extraction is not a free choice - **the capture-status block was the last
unpinned one I could find.**

**RES-A38-7 - the WIDER non-persistence class (rubric field itself now
DISCHARGED by A39).** `rubricText` was never persisted; A39 (commit 3370460b)
fixed it for THIS surface via `rubric-memory.ts`, so A38 builds none of it.
OWNER: the next chunk touching a recording panel's control state. INSTRUMENT:
a sweep for other `useState("")` controls on recording surfaces with no `ta-`
key. DIRECTION: another control that loses the instructor's typing on reload.
STEP: that chunk. Filed because the class is almost certainly wider than the one
field A39 fixed.

---

## 11. SEAT TRIAGE

| Seat | Runs? | Trigger |
|---|---|---|
| Acceptance criteria | YES | Always. |
| Architect + reuse | RAN | This document. |
| Data / storage | **YES, wave 2** | Two new wire keys (`gradedRubricDigest`, `gradeAttempts`). `ta-rec-grade-rubric` is NOT A38's - A39 shipped it. Triaged OUT of waves 0 and 1, which persist nothing new. |
| User experience | YES | A new control, a new confirm above N. |
| Visual / aesthetic | YES | New markup in an existing cluster, plus wave 0's new surface. |
| Accessibility | YES | A new focus stop per row, a disabled state, an arm/confirm consequence line, and wave 0 MOVES A LIVE REGION. Every finding is a reading claim. |
| Security | **YES, wave 2** | Wave 2 adds `getEffectiveGradeBoundAction`, a NEW server action (§5.2). The seat confirms its `requireOwner()` guard holds and that only a config integer egresses; no new model-authored text reaches the DOM. (Waves 0 and 1 fire no Security trigger - wave 1's action change is a comment correction.) |
| Reliability | YES | A lock, an in-flight call, a resource released on every exit - A27's class. |
| Operability / admin | **NO** | Trigger not fired: nothing new to configure, audit, revoke or delete. |
| External-facts research | **NO** | Trigger not fired: nothing rests on behaviour outside this repo. |
| Baseline | YES | Run `grep -a` over `docs/REGRESSION.md` for this surface's grading path BEFORE hand-off. |
| Test seat | YES | Owns §8's oracles and P-4's sabotage. |

---

## 12. WHAT I COULD NOT DETERMINE

- **Whether any control renders, and how it looks.** No component is rendered
  by any test here. -> RES-A38-5.
- **Whether wave 0's re-based projection (~915 from the measured 977) is right.**
  It is arithmetic over a block measured at the REVISION-2 HEAD, not a measurement
  of the current result. P-8 settles it at the gate, and ruling 1 already says
  what happens if it falls short. The §2.3 block line numbers are revision-2
  addresses; the wave-0 implementer re-measures them before extracting.
- **Round-2 Rulings 7, 10 and 11 are NOT resolved in this refresh** and remain
  open, because they are outside RES-A38AC-7 (staleness) and RES-A38AC-2 (the
  extraction decision) - the only two things this revision was asked to close.
  Ruling 7 (state the extraction gate's threshold as ONE derived number) is
  partly overtaken by §6.3's re-based projection but still owed a single stated
  gate number at wave 0. Ruling 10 (the offer sentence's split placement vs
  P-9's "same conditional expression") and Ruling 11 (button-reasoning
  correction, design unchanged) are recorded here so the next A38 activity does
  not treat them as settled.
- **Whether a real model call under a real bound behaves as traced.** No
  `.env`, no API keys; every LLM path runs through mocks.
- **Whether `next build` accepts wave 1's import graph.** The build fails in
  this checkout's prerender tail for unrelated env reasons; the gate is the
  `Compiled successfully` line, read at the wave gate.
- **The byte cost of the two new wire fields against a real full table.** Wave
  2's data seat must measure it.

---

## 13. BACK TO THE OWNER

1. **§5's cap shape and how N reaches the client.** Disclosure plus arm/confirm
   above `N = min(totalCount, maxSubmissions)` (Ruling 9 / DECISION 2, already
   accepted), never a hard stop. Because `maxSubmissions` is server-only, wave 2
   exposes it via a new read-only action `getEffectiveGradeBoundAction`
   (§5.2) - this is the architect's RES-A38AC-2(a) call, not a reopened owner
   decision. If you would rather NOT add an action and can accept ONE ungated
   model call after each reload in the overflow case, the lighter "return the
   bound from the grade action and cache it" option is a one-value change; I
   chose the action because the reload hole sits in exactly the overflow case the
   cap exists for. Say if you prefer a hard stop or plain disclosure - also a
   one-value change to the wave.
2. **Wave 2 changes a persisted shape** (two optional fields, two wire keys).
   The legitimate REDUCE is wave 1 only, with the criteria recording that a
   per-row grade can produce a silently incomparable table and an uncapped
   spend. I recommend shipping wave 2; the surface it protects is a grade a
   student may appeal.
3. **Wave 0 is real work with no user-visible result.** It exists because the
   panel is 990 of 1000 and ruling 1 refuses an overage entry. If wave 0's
   measured result leaves too little room, **the feature waits** rather than
   weakening the gate.
4. **`rubricText` has never persisted** (RES-A38-7). Wave 1 fixes it for this
   surface because the offer sentence is false without it, but the class is
   probably wider.
5. **Three stale comments found in passing, none fixed by me:**
   `GradingTableRow.tsx:271-274` and `GradingTable.tsx:198-202` (both claim
   `FROZEN_PRIMARY_SITES` pins them; neither is a key in that map), and
   `src/lib/gemini.ts:58` ("the default cap of 5 submissions per run",
   inside the file where the constant is 40). A fourth,
   `grading-submission-grade.ts:58-63`, goes stale at wave 1 and is corrected
   there.
6. **The lesson I owe from revision 1, recorded because it is mine.** B6 was a
   false absence produced by `| head` truncating the grep that established it -
   in a document whose own opening rule demands a canary before any absence.
   It cost an entire invented residual and a duplicated hash function. **A
   canary proves the instrument fires; it does not prove the instrument was
   allowed to finish.** Never put `| head` on the grep that proves an absence.
