# Recording-grader discussion-post DETECTION reliability - diagnosis, fix scope, wave plan

Architect seat (Opus, `loop-architect`). Authored 2026-10-06, HEAD d08d0fc4.
Consumer: a `loop-checker` first, then the wave-plan / implementer seats. This
document writes NO production code.

Owner signal (direct chat, 2026-10-06, verbatim): "one of the biggest pain
points is having the app try and often fail to detect discussion posts via
recording". The owner has DECIDED to keep the OCR/screen-capture ingest (they
declined a direct-Canvas-API pull - this is also FORK 1 of
`docs/grading-recording-ux-overhaul-scope.md`). The job is to make the EXISTING
OCR detection RELIABLE, not to replace it. "Posts are missed or mis-detected
during a recording" is the primary defect to drive down.

## 0. Leverage trigger (recorded, not claimed)

This is a RELIABILITY / bug-fix item, not a new user-reachable capability, so
per `DEV_LOOP.md` "The loop / Criteria" there is NO leverage claim to make;
that is the fired trigger. What the work DEFENDS is three already-shipped
classes from `docs/loop/leverage.md`: CAPTURE (`useRecorder`/`getDisplayMedia`
reading posts off the screen - the whole ingest), ATTRIBUTION
(`grading-roster-match.ts`, the right feedback reaching the right student), and
GUARANTEED (the receipt shape). ONE change below - the coverage receipt
(Change 1 / Change 3) - is itself a GUARANTEED-class mechanism: a computed
"N posts detected; this capture window was unread" receipt the model's prose
cannot fabricate. If the orchestrator wants it credited as leverage it has a
buildable removal test (named in Change 1); I am not forcing the claim, only
noting it is available, because the honest default for a reliability item is
"no claim".

---

## 1. The pipeline, traced end to end (every entry point opened)

Frames flow: shared-window capture -> a pending queue -> batched extraction ->
a merge/accumulator -> rows -> roster match -> notices. The files, in order:

1. **Capture** - `useDiscussionCapture()` is mounted in
   `GradingRecordingPanel.tsx:233-234` (the SHARED hook, also used by the
   discussion-reply surface; `GradingRecordingPanel.tsx:6,65`). It samples the
   detached sampling video on a Worker ticker and keeps a frame only when two
   gates both pass (`useDiscussionCapture.ts:244-258`), pushing kept frames to a
   bounded queue (`:318-324`). The timing/threshold constants it reads live in
   `discussion-capture.ts:66-75`.
2. **Extraction drain** - `useGradingRecordingExtraction.ts:61-136`:
   `takeFrameBatch(GRADING_EXTRACT_BATCH_SIZE, EXTRACT_BATCH_WIRE_BUDGET)`
   (`:62`), one `extractGradingSubmissionsAction` call per batch (`:74-77`),
   then merge via `capture.advance` (`:97-100`) and per-row roster match
   (`:119-123`). The drain effect re-fires whenever `pendingFrames > 0`
   (`:149-161`).
3. **The prompt** - `grading-extraction-prompt.ts:64-110`
   (`buildSubmissionExtractionPrompt`), discussion-aware at `:95-98`.
4. **The action** - `src/app/actions/grading-submission-extract.ts:89-207`:
   `requireOwner`, frame-count + wire-budget caps, one `callLlm`, lenient-JSON
   parse, and the three-outcome collapse (confirmed-empty / skipped-unnamed /
   hard error).
5. **Merge** - `grading-submission-merge.ts` (identity + dedup) consumed by
   `grading-capture-sync.ts` (`advanceGradingCapture`, id-correlated rows) via
   `useGradingCaptureTracking.ts`.
6. **Outcome -> notices** - `grading-extraction-outcome.ts` ->
   `GradingRecordingNotices.tsx` (Wave-1-owned, see section 5).
7. **Roster match** - `grading-roster-match.ts:108-129`.
8. **Status surface** - `GradingRecordingCaptureStatus.tsx` (117 lines) shows
   `stalled`, `pendingFrames`, `totalReadingsCount`.

### Measured facts (each names its command)

Line counts, `wc -l` (Bash tool, agrees with `@(Get-Content).Count` per
`this-repo.md`), 2026-10-06:

| File | Lines |
|---|---|
| `GradingRecordingPanel.tsx` | 996 (ceiling 1000; was 1000 before the in-flight UX Wave 1 began) |
| `discussion-capture.ts` | 836 |
| `useDiscussionCapture.ts` | 579 |
| `grading-submission-merge.ts` | 459 |
| `grading-row-serialization.ts` | 389 |
| `grading-submission-extract.ts` | 207 |
| `useGradingRecordingExtraction.ts` | 164 |
| `GradingRecordingCaptureStatus.tsx` | 117 |
| `grading-extraction-prompt.ts` | 110 |
| `grading-extraction-outcome.ts` | 88 |

Capture constants (`discussion-capture.ts`):
- `FRAME_SAMPLE_INTERVAL_MS = 500` (`:66`) - the SAMPLE rate (2 ticks/sec).
- `FRAME_MIN_KEEP_INTERVAL_MS = 1200` (`:67`) - the KEEP floor, decoupled from
  sampling.
- `FRAME_CHANGE_THRESHOLD = 6` (`:72`) - mean-abs-diff over a 32x32 signature.
- `MAX_PENDING_FRAMES = 16` (`:73`) - backpressure queue depth.
- `STALL_NOTICE_TICKS = 60` (`:75`) - 60 x 500ms = 30s of NO new frames.
- `getDisplayMedia` requests `frameRate: { ideal: 5 }`
  (`useDiscussionCapture.ts:411`).

---

## 2. Failure-mode diagnosis (each grounded; confirmed or rejected)

### FM-1 (TOP) - Between-keep scroll loss, and a user signal that cannot see it

**Confirmed, and it is the worst, because it combines a real gap with a signal
that lies about covering it.**

A frame is KEPT only when BOTH gates pass in `handleTick`: content differs
enough (`framesDifferEnough(..., FRAME_CHANGE_THRESHOLD)`,
`useDiscussionCapture.ts:244-246`) AND at least `FRAME_MIN_KEEP_INTERVAL_MS`
(1200ms) has elapsed since the last kept frame (`:249-254`). The keep gate is
**purely time + change**; nothing couples it to SCROLL DISTANCE. So while the
instructor scrolls continuously, at most one frame is kept per 1.2s regardless
of how far the board moved in that 1.2s. At a brisk scroll, a post that both
enters and leaves the viewport inside a 1.2s inter-keep interval is never
sampled into a kept frame and is **never seen by the model**. The "300px of
overlap" reassurance in the tick comment (`:197-198`) is about the 500ms SAMPLE
rate feeding change-detection, NOT about the 1200ms KEPT-frame spacing - the
kept frames that actually reach the model are 1.2s apart, with no overlap
guarantee between them.

The only user-facing signal that purports to cover this is the notice
`"Some of the screen scrolled past faster than it could be read."`
(`GradingRecordingNotices.tsx:45-49`). It is bound to `droppedFramesTotal`
(`GradingRecordingPanel.tsx:811`), which is the BACKPRESSURE counter - it only
increments when the pending queue is already full at 16
(`useDiscussionCapture.ts:318-321`), i.e. when EXTRACTION fell behind CAPTURE.
A post lost to between-keep scrolling produces ZERO dropped frames (it was
never a candidate frame at all) and therefore ZERO notice. **The one signal
whose text claims to detect fast-scroll loss cannot observe the dominant
fast-scroll loss mechanism.** The `stalled` signal does not help either: it
fires only after 30s of NO frames (`STALL_NOTICE_TICKS = 60`,
`useDiscussionCapture.ts:223-228`) - the opposite failure (a frozen/ muted
source), not fast scrolling.

Risk line: `discussion-capture.ts:67` (the time-only keep floor) +
`useDiscussionCapture.ts:249-254` (keep gate, no distance term) +
`GradingRecordingNotices.tsx:45-49` bound to `droppedFramesTotal`
(`GradingRecordingPanel.tsx:811`).

### FM-2 (SECOND) - Per-batch extraction failure silently drops that batch's posts

**Confirmed.** `useGradingRecordingExtraction.ts:62` takes the batch, which
REMOVES those frames from the queue (`takeFrameBatch` slices them off,
`useDiscussionCapture.ts:553-559`). The `extractGradingSubmissionsAction` call
runs at `:74-77`. On `"error" in result` (`:78-85`) the hook logs the batch and
pushes a notice, then `return`s - the frames are already gone and are **never
re-enqueued or retried**. Every post visible in that ~6-frame window is lost.
The error path covers real, expected-at-scale failures: an LLM/transport
failure (`grading-submission-extract.ts:139`), a blank/unparseable response
(`:140,152`), a wire-budget refusal (`:122-123`), and "outcome 3" where the
model returned neither a submission nor the confirmation marker (`:192-197`).
The owner's Gemini path has a real inter-request delay
(`DEFAULT_INTER_REQUEST_DELAY_MS`, per leverage.md) and real rate limits, so
transient per-batch failures are expected during a long scroll. The per-batch
notice is ephemeral and dismissable, and there is NO aggregate "N of M windows
could not be read" ledger - so a run with several failed batches looks
substantively complete.

Risk line: `useGradingRecordingExtraction.ts:62` (frames consumed) + `:78-85`
(error -> return, no re-queue, no coverage accounting).

### FM-3 (THIRD) - Batch-boundary / cropped-name split: one post read as two (or its tail dropped)

**Confirmed, partially mitigated.** The merge has a continuation-splice path for
a submission split across two batches (`grading-submission-merge.ts:260-272`,
used at `:328-333`), but it fires ONLY when the name match is `"exact"`
(`:329`). When the later batch's reading starts mid-document, the name is often
NOT re-read there (it scrolled off above): if the name is absent, extraction
SKIPS the fragment entirely (`grading-extraction-prompt.ts:83-85`,
`grading-submission-extract.ts:166-173`, counted as `skippedUnnamed`) - the
tail is lost; if the name is present but cropped to a surname, confidence is
`"weak"` (`:151`), the continuation path is refused (needs `"exact"`), and the
text-similarity windows do not align (different document regions), so the
fragment becomes a SEPARATE row - one post mis-detected as two. The shared-prompt
boilerplate over-merge vector FM could otherwise fear is already closed by the
divergence-point window (`:214-230`) and the `"weak"`-name tightening
(`WEAK_NAME_SIMILARITY_THRESHOLD = 0.05`, `:85,325`), so over-merge of two
DIFFERENT students needs an actual name collision (same first+last) - a genuine
but narrow residual, not a top driver.

Risk line: `grading-submission-merge.ts:328-333` (continuation gated on
`"exact"`) + `grading-extraction-prompt.ts:83-85` (unnamed fragment skipped).

### FM-4 - OCR misread / empty: handled loudly, not silently (REJECTED as a top driver)

The action already refuses a bare `[]` and forces the model to emit a
`noSubmissionsVisible` marker, turning "returned nothing and said why" into a
hard `{ error }` (`grading-submission-extract.ts:192-197`,
`grading-extraction-prompt.ts:92-93`). A blank or unparseable response is an
error (`:140,152`). So an empty/garbled read is surfaced, not a silent success.
This is good design and stays; its only weakness is that the surfaced error is
the ephemeral per-batch notice of FM-2, with no coverage ledger.

### FM-5 - Classification error (initial-post vs reply) (REJECTED as a detection driver)

`submissionKind` is a suggestion the instructor confirms
(`grading-prompt :95-98`; row minted `submissionKind: "unknown"`,
`grading-capture-sync.ts:89-91`); a mislabel never DROPS a post, so it is a
data-accuracy nuisance (owned by UX-overhaul Wave 3 / FORK 3), not a detection
failure.

### FM-6 - Roster-match failure reading as "not detected" (REJECTED as detection loss)

An unmatched/ambiguous name still produces a VISIBLE row
(`grading-roster-match.ts:126-128`; the row is never dropped) - the student
simply shows as unmatched, which is a correctness/attribution concern, not a
missed post. The only roster-adjacent DETECTION loss is the name being
UNREADABLE, which is FM-3's skip path, already counted.

### Ranking

| Rank | FM | Why it ranks here | Fix leverage |
|---|---|---|---|
| 1 | FM-1 between-keep scroll loss + lying signal | Most likely cause of "often fails"; the user gets no true signal and cannot tell a complete run from a gappy one | HIGH - a computed coverage signal + recover path |
| 2 | FM-2 per-batch failure drops posts, no ledger | Expected at scale on a rate-limited model; silent and un-retried | HIGH - pure ledger + resurface, leaf-local |
| 3 | FM-3 cropped-name continuation split | Real but narrower; needs a long post split exactly at a batch edge with the name off-screen | MEDIUM - pure merge change, over-merge risk |

---

## 3. Fix scope (per change: files, machine-checkable vs owner-walk, direction of failure)

Design stance (FORK A, section 4): KEEP the OCR cadence, make detection
reliability come from an HONEST COVERAGE RECEIPT plus RECOVERY affordances
(re-scan guidance + manual add), not from capturing more frames. Rationale is in
FORK A; the short version is that the capture constants are SHARED with the
discussion-reply feature, and capturing more multiplies the rate-limit failures
of FM-2.

### Change 1 - Honest coverage-gap detector (addresses FM-1)

- **What:** A computed signal that a kept-frame boundary skipped content. Two
  parts: (a) attach the already-computed 32x32 signature to each `CapturedFrame`
  so a downstream consumer can compare consecutive KEPT frames; (b) a pure
  grading leaf that flags a gap when two consecutive kept-frame signatures differ
  by MORE than an overlap threshold (meaning the view jumped further than a
  normal skim between keeps), accumulating a session gap count.
- **Files:** NEW `grading-recording/grading-coverage.ts` (pure: `detectCoverageGap`,
  a session accumulator, and a coverage-line composer) + NEW
  `grading-coverage.test.ts`; `recording/discussion-capture.ts`
  (`CapturedFrame` gains an optional `signature`, ADDITIVE exactly as the LP3
  fields were added at `:149-166`); `recording/useDiscussionCapture.ts`
  (populate it at the existing keep site `:257` / push `:323`).
- **Machine-checkable:** `detectCoverageGap` against a FROZEN oracle of synthetic
  signature pairs (identical -> no gap; maximally different -> gap; near-overlap
  -> no gap); the accumulator's monotonicity; `CapturedFrame.signature` populated
  on every kept frame (wiring). **Removal test for the GUARANTEED claim (if
  credited):** delete the `detectCoverageGap` call that feeds the coverage line
  and assert the composed coverage line no longer reports a gap on an input pair
  the oracle says is a gap - that assertion goes RED on removal, not merely on a
  value a chat could not produce.
- **Owner-walk-only:** whether the overlap threshold catches real fast scrolls
  on a live Canvas board without false alarms. NO test here renders a video or
  runs the model (`this-repo.md` section 6).
- **Direction of failure:** `detectCoverageGap` returns "no gap" on a
  signature pair the oracle marks as a jump, OR `signature` is absent on a kept
  frame.

### Change 2 - Make the fast-scroll notice tell the truth (addresses FM-1 display)

- **What:** Split the two meanings the one notice currently conflates. Keep the
  BACKPRESSURE notice (`droppedFramesTotal > 0`) but retext it to its true cause
  (the reader fell behind), and add a SEPARATE coverage-gap notice fed by Change
  1's session gap count ("Some sections scrolled past between captured frames -
  scroll back over them").
- **Files:** `grading-recording/GradingRecordingNotices.tsx` (Wave-1-owned - see
  serialization), `GradingRecordingCaptureStatus.tsx` (surface the gap count in
  the status line), `GradingRecordingPanel.tsx` (pass the new prop), and their
  wiring tests.
- **Machine-checkable:** the notice's binding (the coverage notice reads the gap
  signal, not `droppedFramesTotal`) via `GradingRecordingPanel.wiring.test.ts`.
  **Owner-walk:** the wording and whether it reads as this app's voice.
- **Direction of failure:** the gap notice still bound to `droppedFramesTotal`,
  or the backpressure and gap notices collapsed back into one.

### Change 3 - Per-batch failure ledger + coverage line (addresses FM-2)

- **What:** Count failed batches and total batches this session; compose a
  coverage line "N of M capture windows could not be read - scroll back over
  those sections." No retry (see FORK C). Pure accounting fed from the existing
  error branch.
- **Files:** `grading-recording/grading-coverage.ts` (the ledger + composer live
  with Change 1's leaf), `useGradingRecordingExtraction.ts` (increment
  failed/total at `:78-85` and on success), and the display via Change 2's
  surfaces.
- **Machine-checkable:** the ledger fold against a frozen sequence of
  success/error batches -> expected coverage line (pure, unit-testable in
  `grading-coverage.test.ts`); that the error branch increments the ledger
  (wiring on `useGradingRecordingExtraction.ts`). **Owner-walk:** none for the
  accounting; whether the line helps is a walk.
- **Direction of failure:** a failed batch does not increment the ledger, or the
  coverage line reports full coverage when a batch errored.

### Change 4 - Manual add / correct a missed post (addresses FM-1, FM-2, FM-3 recovery)

- **What:** An affordance to add a row by hand (typed name + pasted text) for a
  post the capture missed, and to edit a mis-read name. The architecture already
  PRESERVES a row no accumulator entry consumed
  (`grading-capture-sync.ts:199`), so a manually-added row with an id absent from
  `tracked` survives the next capture merge untouched - no new preservation
  mechanism is needed, which is why this is the cheap, high-value recovery.
- **Files:** `useGradingRows.ts` / `grading-rows.ts` (a pure row-mint for a
  manual row) + `grading-row-serialization.ts` (serialize any new flag through
  the EXISTING `ta-rec-grade-table` key - add NO new `ta-` key, so the
  `grading-rows.test.ts` exact-set key canary is untouched); the BUTTON in
  `GradingTable.tsx` / `GradingTableRow.tsx` or the panel.
- **Machine-checkable:** the row-mint pure function; serialization round-trips
  the manual flag; the manual row is not clobbered by a subsequent
  `advanceGradingCapture` (pure test against `grading-capture-sync`).
  **Owner-walk:** the button placement, field UX, felt recovery.
- **Direction of failure:** a manual row is dropped by the next capture merge, or
  a new `ta-` key appears without a canary bump.

### Change 5 - Prompt: ask the model to report a capture-boundary signal (addresses FM-1/FM-3 input)

- **What:** Add one clause to `buildSubmissionExtractionPrompt` asking the model
  to set a per-batch flag when content clearly continues beyond the captured
  frames (a post cut off at the top/bottom edge, a "Show more" left unexpanded,
  visible "more posts below"), and parse that flag in the action into the
  result.
- **Files:** `grading-extraction-prompt.ts` (clause) + its test;
  `grading-submission-extract.ts` (parse the flag into the returned shape, near
  the existing field handling at `:142-203`) + its test.
- **Machine-checkable:** the prompt STRUCTURE contains the clause
  (`grading-extraction-prompt.test.ts`); the action PARSES the flag from a
  fixture response and surfaces it (`grading-submission-extract.test.ts`).
  **Owner-walk-only:** whether the model actually obeys - no model runs here
  (`this-repo.md` section 6; `vitest.setup.ts` throws on real fetch).
- **Direction of failure:** the clause absent from the prompt string, or the
  action ignores the flag a fixture response sets.

### Change 6 (RESIDUAL, not a wave) - cropped-name continuation (addresses FM-3)

Allowing the continuation-splice path on a `"weak"` name when a splice is
present, or letting an unnamed later-batch fragment attach to an `"exact"`
earlier reading via splice BEFORE the R3 skip discards it
(`grading-submission-merge.ts:329`, `grading-submission-extract.ts:166-173`).
Pure and testable, but it loosens an identity rule the repo hardened
deliberately (entry 367 / the post-review hardening header at
`grading-submission-merge.ts:38-46`), so it carries real over-merge risk and
needs its own oracle and sabotage. Filed as a residual (section 7), not
bundled into a wave.

### Machine-checkable vs owner-walk, summarised

- **Verifiable in-repo (pure/structure/wiring):** the gap detector and its oracle
  (Change 1a/b decision); the failure ledger fold (Change 3); the manual row-mint
  + serialization + non-clobber (Change 4); the prompt clause presence and the
  action's parse of the boundary flag (Change 5); every notice/status BINDING
  (Change 2) via the wiring tests.
- **Owner/browser-walk ONLY:** actual OCR accuracy on a live board; whether the
  model obeys the boundary clause; whether the gap threshold catches real fast
  scrolls without false alarms; whether a human reads the coverage line and
  re-scans. These are stated, never filled in - no component renders and no model
  call runs here.

---

## 4. Forks (each with a recommended reading; the owner decides)

- **FORK A - Cadence vs coverage-signal.** (A1) Shorten
  `FRAME_MIN_KEEP_INTERVAL_MS` / add distance-based keeping to physically capture
  more, vs (A2) keep cadence and DETECT + SURFACE gaps and let the user re-scan /
  add. **Recommended: A2.** The keep constants live in `discussion-capture.ts`
  which is REUSED WHOLE by the discussion-reply surface
  (`GradingRecordingPanel.tsx:6`), so changing them changes a second feature;
  and capturing more frames multiplies extraction calls, directly feeding FM-2's
  rate-limit failures. A2 is leaf-local and unit-testable. Cost of the other
  reading: if A2's signal proves insufficient, cadence tuning is still additive
  later - no rework of A2.

- **FORK B - Where the gap detector reads its input.** (B1) compute the gap
  inside the shared `useDiscussionCapture` hook and return it; (B2) attach the
  kept-frame signature to `CapturedFrame` and compute the gap in a grading leaf;
  (B3) derive a weak proxy from already-exposed state only (no capture plumbing).
  **Recommended: B2.** It keeps the DECISION in a unit-testable grading leaf,
  touches the shared `recording/` files only ADDITIVELY (one optional field + its
  populate line, exactly the LP3 precedent at `discussion-capture.ts:149-166`),
  and the discussion-reply feature ignores a field it does not read. Cost of
  wrong: if a per-frame signature is too coarse, B1 is the fallback; B3 cannot
  distinguish a true gap from backpressure and is rejected.

- **FORK C - Failed-batch recovery.** (C1) re-enqueue failed frames for a bounded
  retry, vs (C2) a ledger + resurface (count, tell the user where, rely on
  re-scan + manual add). **Recommended: C2.** Re-enqueue reorders the
  oldest-first queue the continuation-merge relies on
  (`grading-submission-merge.ts:256-259`) and risks a retry loop on a
  persistently failing region; C2 is pure and composes with Change 4. A
  bounded single retry (C1) is a reasonable future middle and is filed as a
  residual. Cost of wrong: C2 leaves transient failures needing a manual
  re-scroll - but the ledger now tells the user that happened and where,
  which today it does not.

FORK A is the only one that could waste built work if guessed wrong (it decides
whether DET-Wave 2 touches shared constants). Per AGENTS.md it is filed as a
backlog row THIS turn with A2 as its disposition; it is NOT a gate on starting
DET-Wave 1, which is leaf-only and valid under either reading.

---

## 5. Collision with the in-flight UX overhaul, and the serialization

A recording-grader UX overhaul is CURRENTLY building from
`docs/grading-recording-ux-overhaul-scope.md`. Its **Wave 1 write set** (that
doc, section 8):
`GradingRecordingPanel.tsx`, NEW `GradingRecordingNotices.tsx`, NEW
`grading-recording-setup-collapse.ts` (+ test), `GradingRecordingPanel.wiring.test.ts`,
`grading-rows.test.ts`, and possibly `AddKnowledgePages.test.ts` /
`runLogRow.test.ts`. Its Waves 2 (panel + rubric leaves) and 3
(`GradingTable.tsx` / `GradingTableRow.tsx` / `grading-rows.ts` /
`copy-feedback.ts`) are planned but not built.

**Rule for this work: keep detection fixes in the extraction / merge / prompt /
coverage LEAVES; touch `GradingRecordingPanel.tsx`, `GradingRecordingNotices.tsx`,
`grading-rows.test.ts` and the table files only in a wave that lands AFTER the UX
waves that own them.** The panel is at 996/1000 and the UX waves are already
restructuring it; a detection display change that also edits the panel would
both collide and force a second extraction on a ceiling file.

---

## 6. Wave plan (enumerated write-sets, named guards, serialization)

Every wave gate and verify carries `src/file-size-ceiling.structure.test.ts`
UNCONDITIONALLY (walks all of `src/`), and runs its named tests with
`npm run test:paths <p1> <p2> ...` (NEVER a raw multi-path `vitest`, which
silently drops unmatched args - `this-repo.md` section 1). Quantities
re-measured in-wave with `@(Get-Content <file>).Count`.

### DET-Wave 1 - coverage leaf + prompt boundary + ledger accounting (LEAF-ONLY)

Highest leverage, zero collision with UX Wave 1. One sequential write set.

Write set:
- NEW `src/app/components/grading-recording/grading-coverage.ts` - pure:
  `detectCoverageGap`, the session gap accumulator, the failed/total-batch
  ledger fold, and the coverage-line composer. Its CALLER is
  `useGradingRecordingExtraction.ts` (below), included in this wave.
- NEW `src/app/components/grading-recording/grading-coverage.test.ts`.
- `src/app/components/grading-recording/grading-extraction-prompt.ts` - add the
  capture-boundary clause (Change 5).
- `src/app/components/grading-recording/grading-extraction-prompt.test.ts`.
- `src/app/actions/grading-submission-extract.ts` - parse the boundary flag into
  the returned shape (Change 5).
- `src/app/actions/grading-submission-extract.test.ts`.
- `src/app/components/grading-recording/useGradingRecordingExtraction.ts` -
  increment the ledger on the error branch (`:78-85`) and on success; compute no
  display here (additive outputs only, not yet wired to the panel).
- `src/app/components/grading-recording/grading-extraction-outcome.ts` (+ its
  test) IF the coverage line is composed through the outcome describer rather
  than the coverage leaf - decide in the plan, keep to one home.

Named guards this wave must run: `file-size-ceiling.structure.test.ts`
(always); `grading-extraction-prompt.test.ts`; `grading-submission-extract.test.ts`;
`grading-extraction-outcome.test.ts`; and
`submission-kind-callsites.structure.test.ts` - because the boundary field is
added near the kind-field handling in the action and prompt; the clause must NOT
reference `suggestedSubmissionKind`/`submissionKindCue` in a way that trips that
canary's Set-A prohibition (`submission-kind-callsites.structure.test.ts:39-48`).

Pass condition: object under comparison = the coverage leaf's outputs and the
action's parsed result; instruments = `grading-coverage.test.ts` (gap oracle +
ledger fold), `grading-extraction-prompt.test.ts` (clause present),
`grading-submission-extract.test.ts` (flag parsed from fixture); direction of
failure = gap oracle green but detector returns no-gap on a jump, OR clause
absent, OR flag ignored, OR any named guard red, OR any touched file `>= 1001`.

Disjointness from UX Wave 1: exact-path `sort | uniq -d` against UX Wave 1's set
is EMPTY (none of the leaves above is in {panel, Notices, setup-collapse,
grading-rows.test}). Informational independence holds: this wave reads no panel
DOM and UX Wave 1 reads none of these leaves. **May run concurrently with UX
Wave 1.**

### DET-Wave 2 - carry the kept-frame signature (SHARED recording/ files, ADDITIVE)

Consumes DET-Wave 1's `detectCoverageGap`. Serialize AFTER DET-Wave 1.

Write set:
- `src/app/components/recording/discussion-capture.ts` - `CapturedFrame` gains an
  optional `signature` field (additive, LP3 precedent `:149-166`); the signature
  type already exists (`FrameSignature`, `:99`).
- `src/app/components/recording/useDiscussionCapture.ts` - populate `signature`
  at the keep site (`:257`) onto the pushed frame (`:323`).
- `src/app/components/grading-recording/useGradingRecordingExtraction.ts` - feed
  consecutive kept-frame signatures to `detectCoverageGap` and accumulate the
  session gap count (additive output; still NOT wired to the panel).
- `discussion-capture.dedupe.test.ts`, `discussion-capture.test.ts`,
  `useDiscussionCapture.wiring.test.ts` - updated if the `CapturedFrame` shape
  assertion moves.

Named guards: `file-size-ceiling.structure.test.ts` (discussion-capture.ts is
836; the field + populate line add a handful of lines - re-measure, stays well
under 1000); `recording-split.structure.test.ts` - it scans `recording/`
non-recursively and holds hardcoded sub-tab/tabpanel counts and the `ta-rec-*`
ordinal canary; this wave adds NO new `recording/` ROOT file and NO sub-tab, so
the counts are unaffected, but RUN it (per the "directory canary" memory rule),
and DO NOT add a new file under `recording/` - the coverage leaf lives in
`grading-recording/`. Also run the cross-feature consumers of `CapturedFrame`:
`module-deck-capture/ModuleDeckCapturePanel.wiring.test.ts`,
`module-deck-capture/module-deck-dispatch.test.ts`, and the
`message-replies/message-extraction-loop.test.ts` + `discussion-*` members of
the owns set (section 8) - they import `discussion-capture` and go red if the
shape assertion is not additive.

Pass condition: object = `CapturedFrame` shape + the extraction hook's gap
output; instruments = the recording capture tests (shape still satisfied) +
`useGradingRecordingExtraction` wiring; direction of failure = an existing
`CapturedFrame` consumer red (the change was not additive), or the gap output
absent.

Disjointness from UX Wave 1: exact-path EMPTY (recording/ files + the extraction
hook are not in UX Wave 1's set). Informational independence holds only because
this wave's gap output is NOT consumed by the panel yet. **May run concurrently
with UX Wave 1**, subject to the standing `git status --short` gate and the
single-`tsc`-caller rule.

### DET-Wave 3 - surface coverage + manual add (PANEL / NOTICES / TABLE - SERIALIZED LAST)

The only wave that touches panel/notices/table. **Serialize strictly AFTER UX
Wave 1 lands** (it owns `GradingRecordingNotices.tsx`, `grading-rows.test.ts`,
`GradingRecordingPanel.tsx`, `GradingRecordingPanel.wiring.test.ts`) and
SHOULD land after UX Waves 2-3 settle the panel and table, OR be merged into a
single coordinated panel/table wave with them to avoid a second extraction on
the 1000-line panel. Do not dispatch it concurrently with any UX wave.

Write set:
- `GradingRecordingNotices.tsx` - split the backpressure vs coverage-gap notices
  (Change 2); add the ledger coverage line.
- `GradingRecordingCaptureStatus.tsx` - show the gap count / coverage line.
- `GradingRecordingPanel.tsx` - pass the gap/ledger props from the extraction
  hook; mount the manual-add control. **Line-positive on a ceiling file ->
  pair with a same-wave extraction** (re-measure before/after).
- `useGradingRows.ts` / `grading-rows.ts` - the manual row-mint (Change 4).
- `grading-row-serialization.ts` (+ test) - serialize the manual flag through the
  EXISTING `ta-rec-grade-table` key (NO new `ta-` key).
- `GradingTable.tsx` / `GradingTableRow.tsx` - the add/correct button (overlaps
  UX Wave 3's files - coordinate or merge).

Named guards: `file-size-ceiling.structure.test.ts`;
`GradingRecordingPanel.wiring.test.ts` (placement/props - update deliberately);
`buttonVariant.test.ts` (`FROZEN_PRIMARY_SITES` pins the primary-button count per
file - a new add button must not change a primary count, or bump the frozen
entry same-commit); `grading-rows.test.ts` (exact-set `ta-` key canary - MUST
stay unchanged because Change 4 adds no key; if any key is introduced, bump it
same-commit); `grading-row-serialization.test.ts`;
`submission-kind-callsites.structure.test.ts` if any kind reference moves.

Pass condition: object = the notice bindings + the manual row's survival;
instruments = `GradingRecordingPanel.wiring.test.ts` (coverage notice reads the
gap signal, not `droppedFramesTotal`), the serialization round-trip test, and a
`grading-capture-sync` test proving a manual row survives the next
`advanceGradingCapture`; direction of failure = coverage notice still bound to
`droppedFramesTotal`, or a manual row clobbered by a capture merge, or the panel
`>= 1001`, or a new `ta-` key without a canary bump.

### Serialization summary

```
UX Wave 1 (in flight) ----------------+
                                      |  (disjoint by path; concurrent OK)
DET-Wave 1 (leaves) --> DET-Wave 2 (shared recording/, additive) --+
                                      |                            |
                              UX Waves 2-3 (panel/rubric/table) ---+
                                                                   |
                                                       DET-Wave 3 (panel/notices/table)
                                                       STRICTLY AFTER UX Wave 1,
                                                       and after UX Waves 2-3 or merged with them
```

---

## 7. Residual register (owner / instrument / step - each present or it is a deletion)

| Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|
| FORK A (cadence vs signal) | owner | n/a (design decision) | orchestrator files it as a backlog row THIS turn with A2 as disposition; DET-Wave 1 proceeds regardless |
| FORK B (gap input location) | orchestrator/plan | the recording capture tests (shape additivity) | decided at DET-Wave 2 plan time; recommended B2 |
| FORK C (failed-batch recovery) | owner | `grading-coverage.test.ts` ledger fold | decided before DET-Wave 3; recommended C2, C1-bounded retry as its own residual |
| Change 6 cropped-name continuation | owner/test-author | a new oracle + sabotage over `grading-submission-merge.ts` | a separate backlog row if FM-3 remains material after DET-Waves 1-3; NOT bundled |
| C1-bounded single retry of a failed batch | owner | a test over `useGradingRecordingExtraction` re-enqueue semantics | separate backlog row; declined for now per FORK C |
| Gap-threshold accuracy on a live board | owner | BROWSER WALK (no video/model runs here) | owner walk after DET-Wave 2/3 ship; recorded in verify as a reliability finding, not a gate |
| Model obedience to the boundary clause | owner | BROWSER WALK (`vitest.setup.ts` throws on fetch) | owner walk; the in-repo test only pins the clause + the parse |
| Legibility probe as a pre-capture step for discussions | owner | n/a (additive; `LegibilityProbeModal` exists but is not mounted in this panel - UX scope section 0) | separate backlog row if wanted |

Every entry above must be present in `docs/BACKLOG.md` or it does not exist per
the loop rules. This scope is a `docs/` artifact; it changes no runtime behaviour
and is gated by the docs gate (`no-emojis`, `source-bytes`) only.

---

## 8. The `owns` file set (command + pasted output)

The scope's owns set = the files the waves edit PLUS every test that reads any of
the detection leaves AS SOURCE TEXT (a greps-a-string test goes red when the
string moves). Derived with:

```
grep -rln -e "grading-submission-merge" -e "grading-extraction-prompt" \
  -e "grading-submission-extract" -e "grading-extraction-outcome" \
  -e "useGradingRecordingExtraction" -e "grading-capture-sync" \
  -e "grading-roster-match" -e "discussion-capture" -e "useDiscussionCapture" \
  src --include=*.test.ts --include=*.test.tsx | sort
```

Output (2026-10-06):

```
src/app/actions/grading-submission-extract.test.ts
src/app/actions/grading-submission-grade.test.ts
src/app/actions/legibility-probe.test.ts
src/app/actions/module-content-extract.test.ts
src/app/actions/wholesale-auth-mock-population.structure.test.ts
src/app/components/canvas-tab/announcements-panel.wiring.test.ts
src/app/components/grading-recording/GradingRecordingPanel.wiring.test.ts
src/app/components/grading-recording/grading-capture-sync.test.ts
src/app/components/grading-recording/grading-capture-tombstones.test.ts
src/app/components/grading-recording/grading-extraction-outcome.test.ts
src/app/components/grading-recording/grading-extraction-prompt.test.ts
src/app/components/grading-recording/grading-roster-match.test.ts
src/app/components/grading-recording/grading-submission-merge.test.ts
src/app/components/grading-recording/submission-kind-callsites.structure.test.ts
src/app/components/message-replies/message-extraction-loop.test.ts
src/app/components/module-deck-capture/ModuleDeckCapturePanel.wiring.test.ts
src/app/components/module-deck-capture/module-deck-dispatch.test.ts
src/app/components/recording/discussion-capture.dedupe.test.ts
src/app/components/recording/discussion-capture.resources.test.ts
src/app/components/recording/discussion-capture.rows.test.ts
src/app/components/recording/discussion-capture.test.ts
src/app/components/recording/discussion-capture.thread.test.ts
src/app/components/recording/discussion-draft-loop.questions.test.ts
src/app/components/recording/discussion-draft-loop.test.ts
src/app/components/recording/discussion-replies-log.questions.test.ts
src/app/components/recording/discussion-replies-log.test.ts
src/app/components/recording/discussion-serialization.test.ts
src/app/components/recording/discussion-table-view.test.ts
src/app/components/recording/discussion-thread.test.ts
src/app/components/recording/redraftRow.wiring.test.ts
src/app/components/recording/useDiscussionCapture.wiring.test.ts
src/app/components/recording/useDiscussionReplies.wiring.test.ts
src/app/components/recording/useReplyResources.test.ts
```

This list is a FLOOR, not the set: the implementer must re-derive it with its own
instrument and report what the floor missed. Load-bearing members, by wave:
- DET-Wave 1 owns `grading-extraction-prompt.test.ts`,
  `grading-submission-extract.test.ts`, `grading-extraction-outcome.test.ts`, and
  the new `grading-coverage.test.ts`; `submission-kind-callsites.structure.test.ts`
  must stay green (the boundary clause must not reference the kind suggestion).
- DET-Wave 2 is the dangerous one: the `discussion-capture.*` tests and the
  cross-feature `module-deck-capture/*` and `message-replies/*` members all
  import `discussion-capture` and go red if the `CapturedFrame` change is not
  strictly additive. Run them all.
- DET-Wave 3 owns `GradingRecordingPanel.wiring.test.ts`,
  `grading-rows.test.ts` (key canary, kept unchanged), `buttonVariant.test.ts`
  (primary-count), and the serialization test; these overlap UX Waves 1-3, which
  is why DET-Wave 3 is serialized last.

Nothing here renders a component under vitest (node-env, network-blocked,
`this-repo.md` section 6), so the STRUCTURE (the gap decision, the ledger fold,
the prompt clause, the parse, the notice bindings, the manual-row survival) is
machine-checkable via pure/structure/wiring tests, and the FELT reliability -
real OCR accuracy, model obedience, threshold tuning, whether a human re-scans -
is OWNER/BROWSER walk, stated as such per change in section 3.

---

## 9. Disposition table

No prior version of THIS scope exists
(`docs/grading-recording-detection-reliability-scope.md` is new). Nothing to map
from a prior requirement set. The related shipped docs
(`grading-via-recording-acceptance-criteria.md`, `a8r-scope.md`, `a9`/REGRESSION
428, `a38-*`) are the AS-BUILT record this scope audits, not prior versions of
it; their guards remain in force and every wave above keeps them green or updates
them deliberately in-wave (section 8). The concurrently-authored
`docs/grading-recording-ux-overhaul-scope.md` is a SIBLING scope on the same
surface, not a predecessor; this scope defers to it on the panel/table/notices
ownership (section 5) and reuses its FORK 1 (Canvas pull) disposition rather than
re-deciding it.
