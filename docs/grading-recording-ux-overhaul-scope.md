# Grading-from-a-recording UX + workflow overhaul - scope and wave plan

Architect seat (Opus). Authored 2026-10-06. Consumer: a `loop-checker` first,
then the wave-plan / implementer seats.

Owner request (direct chat, 2026-10-06, verbatim): "the ux and workflow on the
grading from a recording needs an overhaul, in terms of ease of use and click
distance and scroll distance and click numbers". Clarified: the RECORDING GRADER
in the GRADING tab (`gradingView === "recording"`), not the standalone Recording
tab. Primary requirement added by the owner the same day: "that grading from
recording needs to be very easy to use for grading discussion posts." So
GRADING DISCUSSION POSTS is the headline use case this overhaul optimizes, and
"very easy to use" is the bar.

This document is an audit first, a redesign second, and a phased wave plan third.
It writes no production code.

---

## 0. Two places where the brief disagrees with the tree - reported, not adopted

The seat rule is to measure and refuse a ruling the tree disproves. Two:

- **The brief lists `LegibilityProbeModal.tsx` as a child of this surface. It is
  not.** `GradingRecordingPanel.tsx` (read in full, 1000 lines) neither imports
  nor renders it. The only mounts of `LegibilityProbeModal` are
  `AiChatFab.tsx:932`, `WalkthroughAnnouncementPanel.tsx:838`, and
  `ModuleDeckCapturePanel.tsx:840`
  (`grep -rn "<LegibilityProbeModal" src`). It merely shares the
  `grading-recording/` directory. There is therefore NO "Check screen
  legibility" step in the recording-grader workflow today, and none is counted
  in the inventory below. (It is a plausible *additive* for this surface - OCR
  quality is load-bearing for discussion posts - but that is a residual, not a
  current step.)

- **The coordinator's framing names "a posted/declared grade per student" as the
  end of the path. This surface never posts or declares a grade to any student
  record.** `GradingRecordingPanel.tsx:14-17` states it structurally: "this
  panel never writes a grade anywhere ... there is nothing here TO post even by
  accident". `grading-submission-grade.ts:11,25` confirms the action carries
  "nothing that could bind this result to a Canvas record". The on-screen
  header says so to the user (`:769-772`: "Nothing here is bound to a student
  record or posted to an LMS; it is a working surface to review, edit, and copy
  from."). **The terminal per-student action is "Copy feedback" on each row**
  (`GradingTableRow.tsx:422-431` -> `AssessmentFeedbackFields`), not a post.
  The word "declare" on this surface refers to a *different* thing - the
  assessment deadline + authoritative-tool declaration for missing-work
  tracking (`GradingAssessmentDeclarationControls.tsx`), which is orthogonal to
  grading the posts. Consequence for this overhaul: there is **no post/declare
  confirm step to preserve**, because there is no posting. The necessary
  confirms that DO exist and must be preserved are enumerated in section 6.

---

## 1. Measured facts (every quantity names its command)

Line counts, `@(Get-Content <file>).Count` (PowerShell), 2026-10-06:

| File | Lines |
|---|---|
| `GradingRecordingPanel.tsx` | **1000** |
| `GradingCaptureSettings.tsx` | 132 |
| `GradingRecordingCaptureStatus.tsx` | 117 |
| `GradingRecordingContextPanel.tsx` | 73 |
| `GradingAssessmentDeclarationControls.tsx` | 258 |
| `GradingTable.tsx` | 322 |
| `GradingTableRow.tsx` | 439 |
| `RubricInputModal.tsx` | 389 |
| `LegibilityProbeModal.tsx` | 424 (NOT in this surface - see section 0) |

**The ceiling is live and headroom is ZERO.** `src/file-size-ceiling.structure.test.ts`:
`LIMIT = 1000` (`:41`); the comparison is `lineCount > limit` with
`limit = override ? override.maxLines : LIMIT` (`:137-138`), so a file at exactly
1000 passes and 1001 fails. `GradingRecordingPanel.tsx` is **not** in
`ALLOWED_OVERAGE` (its four entries are other files;
`grep -n "grading-recording" src/file-size-ceiling.structure.test.ts` returns
nothing). Therefore **any wave that adds a single net line to
`GradingRecordingPanel.tsx` must pair it with an extraction in the same wave.**
This test walks all of `src/` and is carried unconditionally in every wave gate
and verify.

Persisted `ta-` keys already in force for this surface (so most "defaults" are
not re-entered on repeat use):
- `ta-rec-grade-course` (`GradingRecordingPanel.tsx:183`), `ta-rec-grade-assessment` (`:193`),
  `ta-rec-grade-rubric` (scoped per course+assessment via `rubric-memory.ts`, `:209,216-218`).
- `ta-rec-grade-filter`, `ta-rec-grade-sort`, `ta-rec-grade-table`
  (`useGradingRows.ts:175-189`).
- Plus the declarations store and the per-course dismissed/tombstone set
  (`useGradingAssessmentDeclarations.ts`, `grading-capture-tombstones.ts`).
The directory's exact-set `ta-` key canary lives in `grading-rows.test.ts`
("has exactly the expected set of persisted keys"), so a NEW `ta-` key must be
added to that canary in the same commit.

---

## 2. How discussion posts get INTO the recording grader (traced)

**There is no direct Canvas / app-data ingest of discussion posts. Ingest is
screen-capture + a vision model that reads posts off the instructor's screen.**
Trace:

1. Capture is `useDiscussionCapture()` (`GradingRecordingPanel.tsx:231-232`) -
   a shared screen-capture hook (`navigator.mediaDevices.getUserMedia` /
   `MediaRecorder`, the CAPTURE leverage class). `start({ saveVideo: false })`
   grabs frames from whatever window/tab the instructor shares.
2. Frames drain through `useGradingRecordingExtraction.ts:61-136`, which calls
   `extractGradingSubmissionsAction` with batches of up to
   `GRADING_EXTRACT_BATCH_SIZE = 6` frames (`grading-extraction-prompt.ts:26`).
3. The vision prompt, `buildSubmissionExtractionPrompt`
   (`grading-extraction-prompt.ts:64-110`), is **discussion-aware by
   construction**: `:95-98` classify each read submission as
   `"initial-post" | "reply" | "other"` from Canvas reply markers (`@Name`,
   "Replying to", "Re:", quoted excerpt, indentation) and return a `kindCue`
   quoting the exact on-screen evidence. So a Canvas discussion board is a
   first-class input, but the data arrives as OCR of the screen, never as
   structured post objects.
4. Each extracted submission becomes a `GradingRow` via `capture.advance(...)`
   -> `gradingRows.setAllRows(...)` (`useGradingRecordingExtraction.ts:97-100`),
   id-correlated to the capture accumulator (`grading-capture-sync.ts`).
5. The read name is matched to the selected course's roster by
   `matchNameAgainstRoster` (`grading-roster-match.ts`), producing one of
   matched / ambiguous / unmatched / no-roster (`:32-38`, `grading-row.ts`), on
   every new row (`useGradingRecordingExtraction.ts:119-123`) and whenever the
   roster text changes (`GradingRecordingPanel.tsx:398-411`). The read name is
   never overwritten by a roster name (`grading-roster-match.ts:40-45`).
6. Grading scores each row against the rubric via
   `gradeCapturedSubmissionsAction` (bulk, `GradingRecordingPanel.tsx:658-663`)
   or `rowGrade.gradeRow` (one row, `:975`). Output lands in the row's editable
   feedback fields. **The feedback is copied out per row; nothing is posted.**

Implication for "very easy to use for discussion posts": the hard, inherent cost
is the screen-record-and-scroll loop (step 1-3) plus the per-post review/grade/
copy at the bottom of a long panel. The overhaul can cut the panel's own click
and scroll cost; it cannot by itself remove the screen-capture model (that is
FORK 1, section 7).

---

## 3. Current workflow inventory - the DISCUSSION-POST path, end to end

Vertical DOM order of the panel (from `GradingRecordingPanel.tsx` return,
`:764-998`), which drives every scroll claim below:

1. Header: title + subtitle (`:766-773`)
2. Run-log download row (`RunLogRow`, `:785-788`)
3. Notices region (conditional, `:815-840`)
4. **Capture** fieldset - course select + assessment autocomplete (`GradingCaptureSettings`, `:843-854`)
5. **Deadline and grading tool** fieldset (`GradingAssessmentDeclarationControls`, `:856-862`)
6. **Grading** fieldset - Add/Edit rubric button + hint + origin (`:864-888`)
7. **Context** fieldset - carried Knowledge pages + Add a page (`GradingRecordingContextPanel`, `:890`)
8. Run row - **Start capture** / **Grade submissions** (`:899-918`)
9. Capture status - hints, preview `<video>`, timer, count, stalled, merged-readings (`GradingRecordingCaptureStatus`, `:919-930`)
10. Class-trends panel (conditional, after a run, `:939-959`)
11. **Grading table** - the captured posts, scored (`GradingTable`, `:961-980`)
12. Rubric modal (conditional overlay, `:982-997`)

The grading table - the thing the instructor actually works in to grade posts -
is item **11 of 12**, below five control fieldsets, the run row, the status
block, and the trends panel.

### Click / scroll inventory, discussion board of P posts

Legend: C = app click; T = typing; B = browser-native (not an app control);
S = scroll traversal; M = modal round-trip (open + context loss + close).
"First use" = new course + new discussion assessment, nothing persisted.
"Repeat use" = same course + assessment, rubric/nav persisted.

| # | Step | Control / file | First use | Repeat | Notes |
|---|---|---|---|---|---|
| N1 | Reach the Tools tab | top-level tab (`activeTab="manual"`, `page.tsx:734`) | 1 C | 0 | persisted via `ta-active-tab` |
| N2 | Pick "Grading" rail chip | `ManualRail` / `tab-rails` (`manual-rail.ts:219`) | 1 C | 0 | persisted via `ta-manual-view` |
| N3 | Pick "Grading (from a recording)" inner chip | `ManualRail` dest `grading-recording` (`manual-rail.ts:180`) | 1 C | 0 | persisted via gradingView |
| S1 | Choose Course (roster) | Course select (`GradingCaptureSettings.tsx:70-85`) | 2 C | 0 | persisted `ta-rec-grade-course` |
| S2 | Type Assessment label (optional) | Autocomplete (`:111-123`) | 1 C + T | 0 | persisted `ta-rec-grade-assessment` |
| S3 | Declare deadline + tool (optional, NOT grading) | `GradingAssessmentDeclarationControls.tsx:194-242` | 4-6 C + T | 0 | missing-work tracking only; pure scroll cost for grading |
| S4 | Add rubric | "Add rubric" -> `RubricInputModal` (`:873-880`, `:982-997`) | 2 C + T, **1 M** | 0 (persisted) | modal: open, paste/review, "Use this rubric" (auto-closes) |
| S5 | Add Knowledge context (optional) | `GradingRecordingContextPanel` / `AddKnowledgePages` | 1-2 C | varies | optional |
| C1 | Start capture | "Start capture" (`:900-907`) | 1 C | 1 C | - |
| C2 | Share the discussion-board window | browser share picker | 2 B | 2 B | native; not an app control |
| C3 | Scroll slowly through every post | other window | P+ S | P+ S | the LIVE-LOOP; OCR reads posts into rows in the background |
| C4 | Return to app, Stop capture | "Stop capture" (`:900-907`) | 1 C | 1 C | window switch + click |
| R1 | Scroll down to the table | past items 4-10 | **1 big S** | **1 big S** | table is item 11/12 |
| R2 | Accept suggested post kinds | "Accept suggested kinds" batch (`GradingTable.tsx:231-235`) | 1 C | 1 C | batches all eligible; else 1 C/row |
| R3 | Scroll back UP to Grade, click Grade submissions | run row item 8 (`:908-917`) | **1 big S** + 1 C (+2 C if above N) | same | Grade button is ABOVE the table |
| R4 | Per post: review, edit, Copy feedback | `GradingTableRow` (`:422-431`) | P C (+T) | P C | terminal output; no LMS post |

**Headline totals (app clicks, excluding T / B / S):**
- First use: N(3) + S1(2) + S4(2) + C1/C4(2) + R2(1) + R3(1) + R4(P) = **~11 + P**,
  plus **1 modal round-trip**, **2 browser-native**, and **two large scroll
  traversals that cross the whole panel** (down to the table, back up to Grade),
  on top of the capture scroll-through.
- Repeat use (persisted): C1/C4(2) + R2(1) + R3(1) + R4(P) = **~4 + P**, still
  with the **two large scroll traversals** and the modal gone only because the
  rubric persisted.

The repeat number is the one that decides re-use (seats.md, User experience).
What survives on repeat use is exactly the two things this overhaul targets:
**the scroll distance between the captured posts and the grading controls**, and
(for any new discussion assessment) **the rubric modal round-trip**.

---

## 4. Ranked cost hotspots (discussion-post path first)

1. **SCROLL - the grading table is item 11/12, buried under one-time setup.**
   After Stop capture, the instructor must scroll past Capture, Deadline/tool,
   Grading, Context, the run row, status, and trends to reach the rows (R1), and
   then scroll back UP to the run row to press Grade (R3). These two traversals
   recur on every use, including repeat use. This is the single biggest
   discussion-post cost and the headline target. (`GradingRecordingPanel.tsx:843-980`.)

2. **CLICK/CONTEXT - the rubric modal round-trip (S4) on every new discussion
   assessment.** For discussion posts the rubric is usually the same
   participation rubric. It persists per course+assessment (`:209,434-455`), but
   a new assessment label re-opens the modal and loses panel context while open
   (`RubricInputModal.tsx`, overlay via `ModalShell`). First-use and every new
   discussion gets the full open/paste/confirm/close cycle.

3. **SCROLL/NOISE - the Deadline-and-tool fieldset (item 5, 258 lines) sits
   between Capture and the grade flow but is not part of grading the posts.** It
   serves missing-work tracking (`GradingAssessmentDeclarationControls.tsx:3-14`).
   For the "grade these posts" task it is pure vertical distance and visual
   noise directly above the rubric and run row.

4. **CLICK - per-post kind confirmation.** Each OCR'd post arrives
   `submissionKind === "unknown"` with a suggestion; confirming is one click per
   row (`GradingTableRow.tsx:386-395`). Already mitigated by the batch "Accept
   suggested kinds" button (`GradingTable.tsx:231-235`), but that button lives
   inside the table toolbar (item 11), reachable only after the R1 scroll.

5. **CLICK - per-post Copy feedback (R4) is inherent** (P posts -> P copies) and
   is the real terminal action, since nothing posts. Not reducible without a
   batch-copy / batch-export affordance (candidate, section 6).

---

## 5. Proposed redesign (per change: files, extraction, check type, confirms)

Design principle applied: the common discussion-post path should run
**top-to-bottom with no backtracking**, and the one-time setup should not sit
between the instructor and the rows once posts exist. Reuse the app's existing
visual language - the `<details>/<summary>` collapsible house pattern
(`GeneratedRubricCard.tsx:16-17`; also the content-tab modules sections,
`grep -rln "<details" src/app/components` = widespread), the `controls.section`
fieldset/legend idiom, `styles.ghActions`/`controls.runRow`, and `styles.adaptRow`.
No new magic widths; new classes must be referenced same-commit (orphan-CSS
ratchet is EXACT) or use inline token styles.

### Move A (headline, scroll) - Setup collapses; action and table rise

- **What:** Wrap the one-time setup (Capture, Deadline/tool, Context, the rubric
  control) in a single collapsible "Setup" region built from the house
  `<details>/<summary>` pattern. Default it OPEN on first use and auto-collapse
  once a capture has begun or `totalCount > 0`, so after Stop the instructor
  lands on the action + table without scrolling past setup. Reorder the run row
  (Start/Grade) to sit **directly above** the capture-status and the table, so
  Grade and the rows are adjacent (kills the R1-down / R3-up double traversal).
- **Files:** `GradingRecordingPanel.tsx` (reorder + wrap); a NEW pure leaf
  `grading-recording-setup-collapse.ts` holding the collapse-state decision
  (unit-testable); a NEW `GradingRecordingNotices.tsx` and/or move the
  ClassTrends block into a leaf for the headroom (see wave plan); updated
  `GradingRecordingPanel.wiring.test.ts` (it pins placement, e.g. `:55`) -
  updated DELIBERATELY in-wave; `AddKnowledgePages.test.ts` re-point if Context's
  mount ancestor changes (RULING 34: an anchor an extraction crosses joins its
  write set).
- **Extraction needed: YES (mandatory).** The wrap + reorder is line-positive on
  a file at exactly 1000. See wave plan for the specific leaf(s).
- **Machine-checkable:** DOM order of run row vs table; existence of the
  collapsible; the pure collapse-decision function and its inputs; a persisted
  `ta-rec-grade-setup-open` key if the open/closed state persists (add to the
  `grading-rows.test.ts` key canary same-commit). **Owner-walk:** the felt scroll
  reduction, and whether auto-collapse feels right vs abrupt.
- **Confirms preserved:** Clear table, Remove-edited-row, and Grade-above-N all
  live in `GradingTable.tsx`/`GradingTableRow.tsx`/`grading-dispatch.ts` and are
  untouched by Move A.
- **Trap to heed:** a localStorage-seeded `useState` initializer for a
  `<details open>` never shows on reload without a mount effect (memory:
  "Persisted details open needs a mount effect"); React only warns on the
  hydration mismatch. The test seat owns an assertion that the open-state is
  applied after mount, not just initialized.

### Move B (clicks) - Rubric without the round-trip, with a discussion default

- **What:** Surface the rubric for the common paste/edit case as a compact inline
  field inside the Setup region, keeping the modal as the "upload a file"
  affordance (the modal's upload/extraction path is real value -
  `RubricInputModal.tsx:168-237`). Add a per-course **discussion-post rubric
  default/template** so a new discussion assessment starts from a usable rubric
  instead of empty. The rubric already persists per course+assessment; this adds
  a course-level discussion default that seeds a new assessment's rubric.
- **Files:** `GradingRecordingPanel.tsx` (or the extracted rubric leaf),
  `rubric-input.ts`, `RubricInputModal.tsx` (retained for upload), `rubric-memory.ts`
  (seed/default read), `grading-rows.test.ts` key canary if a new `ta-` key lands.
- **Extraction:** spends headroom created in wave 1; re-measure
  `@(Get-Content GradingRecordingPanel.tsx).Count` before and after.
- **Machine-checkable:** inline rubric field present; modal still reachable for
  upload; the default-seed pure function; the persisted key in the canary.
  **Owner-walk:** whether the inline field reads as this app's voice and whether
  the default rubric is actually what they want for discussions.
- **Confirms preserved:** unchanged (none of these are outward-facing).
- **FORK 2** (section 7): inline-plus-modal vs modal-with-default-only.

### Move C (clicks) - Fewer per-post steps in the table

- **What:** Keep the explicit "Accept suggested kinds" batch (do NOT auto-apply
  silently - the kind confirm is a data-accuracy step, section 6), but raise its
  prominence for a discussion run and consider a batch "Copy all feedback" /
  export so P copies (R4) become one. Copy-all is additive, not a removal of any
  confirm.
- **Files:** `GradingTable.tsx`, `GradingTableRow.tsx`, `grading-rows.ts`,
  `copy-feedback.ts`, the a8r kind tests.
- **Extraction:** these files are well under the ceiling (322 / 439); no
  extraction expected, but re-measure if lines are added.
- **Machine-checkable:** presence/position of the batch controls; the batch-copy
  pure join. **Owner-walk:** felt reduction over P posts.
- **FORK 3** (section 7): auto-apply high-confidence kinds vs keep explicit batch.

---

## 6. Necessary confirms - preserved, with the reason each stays

House rule: minimize clicks WITHOUT trading away a confirm that guards an
outward-facing or hard-to-reverse action. On this surface:

- **Clear table** (`GradingTable.tsx:240-261`, `ConfirmArmButtons`,
  signature-armed on row count) - destroys all captured rows irreversibly. KEEP.
- **Remove an edited row** (`GradingTableRow.tsx:283-300`) - arms only when the
  row holds hand-typed feedback (`row.userEdited`); a machine-only row removes on
  first click. KEEP the arm for edited rows.
- **Grade above N** (`GradingTableRow.tsx:244-261`, `GradingRecordingPanel.tsx:602-604`,
  `grading-dispatch.ts`) - spends model calls; arm-then-confirm above the spend
  threshold. KEEP; it is a cost gate, not UI friction.

Not a confirm, and therefore NOT protected as one: the per-post **kind
confirmation** is a data-accuracy affordance (does this post's classification
look right), not an irreversible/outward action. Batching it (Move C) is legal;
silently auto-applying it is a product call (FORK 3).

There is **no post/declare-to-LMS confirm** on this surface to preserve (section
0). Do not invent one.

---

## 7. Forks (each with a recommended reading; the owner decides)

- **FORK 1 - Does the overhaul add a direct discussion-post ingest (Canvas API
  pull) so the instructor need not screen-record scrolling?**
  Recommended reading: **NO for this overhaul.** A Canvas discussion pull is a
  large new mechanism (new server action, Canvas pagination/auth, a new ingest
  surface and roster join), not a UX/workflow change to the existing
  screen-capture flow. It is a separate feature with its own leverage claim.
  This overhaul optimizes the EXISTING screen-capture path (sections 5). File
  FORK 1 as its own backlog row. Cost of being wrong: if the owner wants the
  pull, waves here are still valid (they improve the panel regardless), so the
  rework risk is low - the pull would be additive, not a redo.

- **FORK 2 - Rubric: inline field + retained upload modal, vs modal-with-default
  only.** Recommended: **inline + retained modal** (Move B as written) - it
  removes the round-trip for the common paste/edit case while keeping the upload
  path's real value. Cost of the other reading: keeping modal-only leaves the S4
  round-trip on every new discussion assessment.

- **FORK 3 - Submission kinds: keep explicit batch-accept (prominent) vs
  auto-apply high-confidence `initial-post`/`reply`.** Recommended: **keep
  explicit batch-accept**, raise its prominence. Auto-applying removes a
  data-accuracy checkpoint on OCR output whose failure (wrong kind) is silent;
  the batch button already makes it one click.

Per AGENTS.md, FORK 1 (the only one that could waste built work if guessed
wrong) should be filed by the orchestrator as a backlog row in the same turn it
is surfaced, with the recommended reading as its disposition; it is NOT a gate on
starting wave 1, which improves the panel under either answer.

---

## 8. Wave plan (phased; wave 1 is the single highest-leverage win + its headroom)

The 1000-line ceiling forbids any line-positive change to `GradingRecordingPanel.tsx`
without a same-wave extraction. Each wave below re-measures the panel with
`@(Get-Content src/app/components/grading-recording/GradingRecordingPanel.tsx).Count`
before and after, and every wave gate and verify carries
`npm run test:paths -- <the wave's test paths>` plus
`src/file-size-ceiling.structure.test.ts` unconditionally. Multi-path runs use
`npm run test:paths` (never a raw multi-path `vitest`, which silently drops
unmatched args).

### Wave 1 - "Setup collapses; action and table rise" (headline scroll win)

This wave bundles the mandatory extraction WITH the highest-leverage UX change,
because the extraction alone delivers no user value and the ceiling forbids the
UX change without it. All edits are in one file plus new leaves, so this is one
sequential write set (not concurrent sub-items).

Write set:
- `src/app/components/grading-recording/GradingRecordingPanel.tsx` - reorder run
  row to sit directly above capture-status + table; wrap Capture / Deadline-tool
  / Context / rubric control in the collapsible Setup region; delegate extracted
  blocks to the new leaves below.
- NEW `src/app/components/grading-recording/GradingRecordingNotices.tsx` - the
  notices region (`GradingRecordingPanel.tsx:815-840`) as a presentational leaf
  (headroom; mirrors the `GradingRecordingContextPanel`/`...CaptureStatus`
  extraction precedent). Includes its caller in this file (the panel).
- NEW `src/app/components/grading-recording/grading-recording-setup-collapse.ts`
  - the PURE collapse-state decision (open on first use; collapsed once
  `capturing || totalCount > 0`), unit-testable; plus `ta-rec-grade-setup-open`
  handling if the state persists.
- NEW `grading-recording-setup-collapse.test.ts` - unit test of the decision.
- `GradingRecordingPanel.wiring.test.ts` - update the pinned placements
  deliberately (run row above table; notices extracted); re-point any anchor the
  extraction crosses.
- `AddKnowledgePages.test.ts` - re-point only if Context's mount ancestor moved.
- `grading-rows.test.ts` - add `ta-rec-grade-setup-open` to the exact-set key
  canary IF that key is introduced (same commit).
- `runLogRow.test.ts` - check it still resolves `GradingRecordingPanel.tsx`'s
  RunLogRow usage after reorder (it references this file).

Pass condition: panel count strictly `< 1000` after the wave
(`@(Get-Content).Count`), run row rendered above the table in DOM order (wiring
test), collapse decision unit test green, whole suite + tsc + lint green, build
compile line present. Direction of failure: panel `>= 1001`, or run row still
below the table, or the collapse decision not covered.

Independently pushable. Delivers the scroll win on its own.

### Wave 2 - "Rubric without the round-trip" (click win for new discussions)

Depends on wave 1's headroom. Write set:
- `GradingRecordingPanel.tsx` (or a NEW `GradingRubricField.tsx` leaf if
  line-positive) - inline compact rubric field in the Setup region; retain the
  modal for upload.
- `rubric-input.ts`, `rubric-memory.ts` - discussion-default seed (pure).
- `RubricInputModal.tsx` - retained; adjust only its entry affordance.
- `grading-rows.test.ts` - key canary if a new `ta-` key (e.g. a per-course
  discussion-rubric default) lands.
- Resolve FORK 2 before building (recommended reading in section 7).

### Wave 3 - "Fewer per-post steps" (batch kinds + batch copy)

Independent of waves 1-2 by behaviour but touches sibling files. Write set:
- `GradingTable.tsx`, `GradingTableRow.tsx`, `grading-rows.ts`, `copy-feedback.ts`
  - raise batch-accept prominence; add batch "Copy all feedback".
- The a8r kind tests, `copy-feedback.test.ts`.
- Resolve FORK 3 before building.

Waves 2 and 3 edit disjoint files (2 touches the panel/rubric; 3 touches the
table/row leaves) and could run concurrently AFTER wave 1 lands, subject to the
usual `git status --short` gate and a `sort | uniq -d` path-intersection check at
dispatch time. They are NOT concurrent with wave 1 (all three share the panel's
gate on `tsc`, and wave 1 restructures the file waves 2-3 build on).

---

## 9. The `owns` file set (command + pasted output)

The scope's owns set = the files the waves edit PLUS every test that reads any
grading-recording source file AS SOURCE TEXT (a greps-a-string test goes red when
the string moves). Derived with:

```
grep -rln "grading-recording/" src --include=*.test.ts | sort
```

Output (2026-10-06):

```
src/app/actions/grading-submission-extract.test.ts
src/app/actions/legibility-probe.test.ts
src/app/components/course-intel/courseIntelHistory.wiring.test.ts
src/app/components/course-intel/courseIntelOfflineTables.test.ts
src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts
src/app/components/grading-recording/GradingAssessmentDeclarationControls.test.ts
src/app/components/grading-recording/GradingCaptureSettings.wiring.test.ts
src/app/components/grading-recording/GradingRecordingPanel.assessment.test.ts
src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts
src/app/components/grading-recording/copy-feedback.test.ts
src/app/components/grading-recording/grading-rows.test.ts
src/app/components/grading-recording/submission-kind-callsites.structure.test.ts
src/app/components/grading-recording/useGradingRowGrade.wiring.test.ts
src/app/components/grading-recording/useGradingRows.wiring.test.ts
src/app/components/recording/AddKnowledgePages.test.ts
src/app/components/recording/runLogRow.test.ts
src/app/components/ui/buttonVariant.test.ts
src/app/components/ui/modalAdoption.wiring.test.ts
src/lib/course-intel/cross-course.test.ts
src/lib/course-intel/offline-assembly.test.ts
src/lib/grade/prompts-praise-routing.test.ts
src/tools/strip-comments-agreement.structure.test.ts
```

This list is a FLOOR, not the set: the implementer must re-derive it with its own
instrument and report what the floor missed. Notes on the load-bearing members
each wave must keep green or update deliberately in-wave:
- `GradingRecordingPanel.wiring.test.ts` pins placement/wiring inside the panel -
  wave 1 WILL touch it (reorder + extraction). Update deliberately.
- `buttonVariant.test.ts` (`FROZEN_PRIMARY_SITES`) pins the primary-button count
  per file; moving the rubric/run buttons must not change the count, or update
  the frozen entry same-commit.
- `grading-rows.test.ts` owns the directory's exact-set `ta-` key canary - any
  new `ta-rec-grade-*` key is added here same-commit.
- `submission-kind-callsites.structure.test.ts` pins where `suggestedSubmissionKind`
  may be read - wave 3's kind changes must respect it.
- `modalAdoption.wiring.test.ts` / `runLogRow.test.ts` / `AddKnowledgePages.test.ts`
  read these files by path; an extraction that moves a mounted modal/row/section
  re-points them (RULING 34).
- The `course-intel/*` and `drafted-grades/classTrendsDraft.not-postable.test.ts`
  members reference grading-recording paths incidentally; a wave that does not
  move the cited symbols leaves them untouched, but they are in the gate so a
  stray move is caught.

Nothing here renders a component under vitest (node-env, network-blocked), so the
STRUCTURE (which block renders where, which modal became inline, the collapse
decision, the persisted keys, the extraction) is machine-checkable via
source-text/structure tests, and the FELT ease-of-use, the real click count and
the scroll feel are OWNER/BROWSER walks - stated as such per change in section 5.

---

## 10. Residual register (owner / instrument / step - each present or it is a deletion)

| Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|
| FORK 1 (direct Canvas discussion-post ingest) | owner (product decision) | n/a (new feature) | orchestrator files it as a backlog row this turn; a future scope builds it if chosen |
| FORK 2 (inline rubric vs modal-only) | owner | wiring test on the rubric field shape | decided before wave 2 build |
| FORK 3 (auto-apply high-confidence kinds vs batch) | owner | a8r kind tests | decided before wave 3 build |
| Felt scroll/click reduction for the discussion path | owner | BROWSER WALK (no component renders under vitest) | owner walk after each wave ships; recorded in the wave's verify as a leverage/UX finding, not a gate |
| Auto-collapse feel (abrupt vs right) | owner | BROWSER WALK | owner walk after wave 1 |
| Legibility probe as a pre-capture step for discussions | owner | n/a (additive) | separate backlog row if wanted; NOT a current step (section 0) |
| Discussion-rubric default content | owner | owner review of the seeded default | wave 2 owner walk |

Every entry above must be present in `docs/BACKLOG.md` (owner to file FORK 1, and
the owner-walk residuals) or it does not exist per the loop rules. This scope
itself is a design artifact under `docs/`; it changes no runtime behaviour, so it
is gated by the docs gate (`no-emojis`, `source-bytes`, `gate-commands`) only.

---

## 11. Disposition table

No prior version of THIS scope exists (`docs/grading-recording-ux-overhaul-scope.md`
is new; `git status` shows it untracked-to-be). Nothing to map from a prior
requirement set. The related shipped feature docs
(`grading-via-recording-acceptance-criteria.md`, `a16-*`, `a38-*`, `a39-*`) are
the AS-BUILT record this scope audits, not prior versions of it; their
requirements remain in force and this overhaul must keep their guards green
(section 9).
