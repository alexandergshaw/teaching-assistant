# Recording split: "analyzing" loading indicator - scope

Seat: UX + scoping (loop-seat). READ-ONLY artifact: no production file was
edited producing it. Nothing in this document was executed as a test; every
test/gate command named below is a command the BUILD must run, not one this
seat ran. A fresh `loop-checker` reads this before any build consumes it.

Owner request (verbatim): "the recording split also needs a loading indicator
while analyzing."

Trigger record: User-experience seat fires (user-visible change). Visual seat:
no new surface and no CSS (section 4), so it triages out. Accessibility seat:
touches no markup in the recommended reading (section 4), so it triages out,
but section 9 records a pre-existing live-region observation. Documentation-only
chunk exemption does NOT apply (the recommended build edits `src/`).
Leverage claim: none - a presentational fix to a feature that ships dark, not a
new capability a user reaches. Diagnostics representation: none, stated - the
change adds no data path and no failure mode (it re-routes already-held state
into already-rendered text); the classify phase's own diagnostics shipped in
4781ac07 (operations `classify_recording_single` / `classify_recording_multiple`,
`src/app/components/grading/gradingDiagnosticLog.ts:39-40`; recorded via
`recordClassifyRecordingSettled`, imported at
`src/app/components/grading-chat/recordingSplitDriver.ts:17`) and are untouched.

---

## 0. The finding that reframes the request (read first)

**A visual spinner indicator ALREADY renders during the classify phase.** The
owner's premise ("surfaced only as TEXT") is true of how the commit READS, and
false of what the component renders:

- `GradingChatPanel.tsx:779` passes the text as `intakeNote` into
  `describeRunStatus(...)` (`:775-784`), whose result is the `status` prop of
  `<GradingProgress>` (`:774`).
- `GradingProgress` (`GradingChatPanel.tsx:199-210`) renders, for any non-null
  status, a `div.loadingState` with `role="status" aria-live="polite"
  aria-busy="true"` containing `<span className={styles.spinner}
  aria-hidden="true" />` and the title/detail text (`:202-207`).
- The classify branch runs inside `handleSubmitFiles`, which is wrapped in
  `withPreparing` (`GradingChatPanel.tsx:456`; `withPreparing` sets
  `preparing=true` for the whole awaited submit at `:324-331`). So `preparing`
  is true while `classifyingRecording` is true.
- With `preparing=true` and no pending rows, `describeRunStatus` reaches
  `runStatus.ts:53` (`if (intakeNote !== null) return { title: intakeNote,
  detail: "" }`) and returns "Analyzing the recording..." with an EMPTY detail.
  Result: spinner plus one title line. (Reading claim; no component is rendered
  by any test here.)

**What is genuinely wrong (the real defect behind the owner's request):**

1. **The analyzing state is MASKED whenever any row is pending.**
   `runStatus.ts:51` gates the whole `intakeNote` path on `pendingCount <= 0`.
   When a recording is classified while other rows are queued or grading (the
   second video of a multi-file drop, or a video dropped while a prior
   submission is still grading), `pendingCount > 0` and `describeRunStatus`
   falls through to `runStatus.ts:59-67` and shows "Grading now: ..." - the
   spinner is there but it says nothing about the recording being analyzed, and
   the composer is disabled (`GradingChatPanel.tsx:788`) with no stated reason.
   `pendingCount` is `Math.max(driver.pendingStudents.size, driver.dispatchedCount
   - driver.completedCount)` (`:780`). Determined by reading, not by running.
2. **The title has no detail line**, so the one phase that can be slow (a model
   call over the video) reads as a bare label, unlike every other phase that
   explains what is happening (`runStatus.ts:55-57`).
3. **The copy lives in the panel as an inline ternary** (`:779`), outside the
   pure leaf `runStatus.ts` whose stated purpose is "so the wording is testable"
   (`runStatus.ts:1-2`). So the wording, and its precedence over other states,
   has no behavioural test at all - only the source-text pin
   `video-w4.wiring.test.ts:100`, which asserts the substring
   `driver.classifyingRecording` is present (existence of the read, not what it
   does).

**What I could not determine:** what the owner actually saw. Candidate
explanations, none verified: (a) they read the diff and saw only a string being
passed; (b) they exercised it with other rows pending (defect 1); (c)
`RECORDING_SPLIT_ENABLED` is `false` (`src/lib/grade/constants.ts:57`) so in any
shipped build the phase never runs at all and no indicator of any kind can have
appeared. This environment has no rendered component and no live model call
(`docs/loop/this-repo.md` section 6), so none of this can be settled here.

---

## 1. Where `classifyingRecording` / `intakeNote` is consumed today

Commands: `Grep "classifyingRecording|intakeNote|Analyzing the recording"` over
`src/`.

| Site | file:line | What it does |
|---|---|---|
| State | `useContinuousGradingRun.ts:251` | `useState(false)` |
| Interface | `useContinuousGradingRun.ts:181` | `readonly classifyingRecording: boolean` |
| Set true | `useContinuousGradingRun.ts:518` | immediately before the `classifyVideoEntry` await, inside `if (RECORDING_SPLIT_ENABLED && videoRefOf(prepared.entry) !== null)` (`:517`) |
| Set false | `useContinuousGradingRun.ts:526-528` | `finally` - cleared on success, failure or throw; also cleared at `:806` (reset). The flag cannot stick on. |
| Exposed | `useContinuousGradingRun.ts:834` | returned from the hook |
| Consumed | `GradingChatPanel.tsx:779` | `intakeNote: driver.classifyingRecording ? "Analyzing the recording..." : intakeNote` |
| Panel state | `GradingChatPanel.tsx:224` | `intakeNote` is the panel's own `useState` (Canvas fetch note, set at `:346`) |
| Pure leaf | `runStatus.ts:15,44,53` | `intakeNote` field; consumed only under `pendingCount <= 0` |
| Existing pin | `video-w4.wiring.test.ts:100` | `expect(panel).toContain("driver.classifyingRecording")` |

## 2. The existing idiom to reuse (do NOT invent a new one)

- **Canonical spinner:** `styles.spinner` / `styles.loadingState` /
  `styles.loadingTitle` / `styles.loadingText` in `src/app/page.module.css`
  (`:105-146`). The rule's own comment (`:115-124`) says it is "THE canonical
  spinner recipe for the whole app" and not to fork it. Used from 45 `.tsx`
  sites (`grep -rn "styles.spinner" src --include=*.tsx | wc -l`).
- **The grading-chat instance of it:** `GradingProgress`
  (`GradingChatPanel.tsx:199-210`), fed by `describeRunStatus`
  (`runStatus.ts:43-68`). This is the run-status affordance the owner referred
  to; every other phase of this view (session setup, reading a submission, zip
  upload/prepare, Canvas fetch, grading) already uses it.
- **Per-row spinner:** `RegradeButton.tsx:14-16` (MUI `CircularProgress
  size={14}` plus "Regrading..."). Per-button, not per-phase; not the right
  model for a panel-level phase.
- **Not reused:** MUI `LinearProgress` exists in one file only
  (`grep -rln LinearProgress src` -> `recording/TakeAnnouncementPanel.tsx`); a
  determinate or indeterminate bar here would be a second affordance beside the
  spinner for one phase out of seven. The classify call has no known duration or
  total, and `runStatus.ts:3-4` states the view never invents an "N of M".

## 3. Recommended indicator (Reading A - build this)

Keep the one existing affordance (spinner + title + detail in `GradingProgress`)
and make the analyzing state reliable and self-explaining:

1. **Move the analyzing state into the pure leaf and give it precedence.**
   `RunStatusInput` gains `readonly classifyingRecording: boolean`.
   `describeRunStatus` handles it right after the `zipPhase` branch
   (`runStatus.ts:45-50`) and BEFORE the `pendingCount <= 0` branch
   (`:51`), returning:
   - title: `Analyzing the recording...` (unchanged wording, now owned by the leaf);
   - detail, nothing else pending: `Checking whether it holds one submission or several`;
   - detail, rows pending: `${completedCount} finished so far, ${pendingCount} still grading`
     (same voice as `runStatus.ts:61`) - so the grading counts are not lost when
     the title changes.
   It must NOT depend on `preparing`: the flag alone drives it (defence in
   depth if a future caller classifies outside `withPreparing`).
   Proposed copy is the UX seat's; no new quantity is asserted, and nothing
   promises a duration (the call has none known).
2. **Panel: stop special-casing the text.** At `GradingChatPanel.tsx:779`
   replace the ternary with `intakeNote,` and add one line
   `classifyingRecording: driver.classifyingRecording,` to the
   `describeRunStatus({...})` object. `GradingProgress` and its position are
   unchanged.
3. **Placement (unchanged, and consistent with the confirm card).**
   `GradingProgress` sits in `chatStyles.stickyComposer` at
   `GradingChatPanel.tsx:764-792`, after `<RecordingSplitConfirm>` (`:771-773`)
   and before `<ChatComposer>` (`:787`). When classification ends with
   "multiple", the spinner block unmounts and the confirm card mounts in the
   same sticky slot (`pendingSplit` is set at `useContinuousGradingRun.ts:541`
   and `preparing` clears when the submit settles), so the card replaces the
   spinner rather than appearing beside it. No layout shift beyond that swap.
4. **No new CSS, no new class.** `styles.spinner` etc. are already imported and
   used. This also keeps the unrelated `docs/css-orphans.md` and the
   `styles.*` class-set pins (e.g. `rubric-origin.test.ts:359`, which scans a
   different file, `CartridgeDropPanel.tsx`) out of play.

Net behaviour: during classification the user always sees spinner +
"Analyzing the recording..." + a line saying what is being decided, whether or
not other rows are grading.

## 4. Size, ceiling and extraction

Commands and results:

- `git show HEAD:src/app/components/grading-chat/GradingChatPanel.tsx | wc -l`
  -> 738 (the "~738" in the brief is the committed file).
- Working tree: `wc -l` and `@(Get-Content <file>).Count` both -> 797 (the two
  tools agree on this file, 2026-10-12). The +59 net is the UNCOMMITTED
  copyable-fields diff in the tree (`git diff --stat`: 61 insertions, 3
  deletions in this file; `git diff` shows the `COPY_KEY_*` constants and the
  locked-field copy blocks). Whether copyable-fields adds more is not known to
  this seat.
- Ceiling: `LIMIT = 1000` at `src/file-size-ceiling.structure.test.ts:41`
  (`docs/loop/this-repo.md:173`). Headroom now: 1000 - 797 = 203.
- This change adds +1 line to the panel (net: the ternary line becomes two
  lines) and ~+30 lines to `runStatus.ts` (68 -> ~98, `@(Get-Content).Count`).

**Recommendation: no extraction.** Both files stay far below 1000 and this
reading moves logic OUT of the panel into the leaf, the opposite of growth.
The copyable-fields build cannot plausibly consume 200 lines; the wave gate
already includes `src/file-size-ceiling.structure.test.ts`. If the build wave
finds the panel above ~950 after both land, extraction owed to whichever lands
second (record, do not pre-build).

Second structural constraint the build must respect, measured:
`GradingChatPanel.structure.test.ts:371-382` requires
`mountIdx - classIdx < 1500` characters from `chatStyles.stickyComposer` to
`<ChatComposer`. Raw distance now: 961 chars (Python `s.rindex(...)`/`s.index`
on the raw file); the test measures a comment-stripped copy, so its number is
smaller. Reading A adds none inside that window (the edit is in the
`describeRunStatus({...})` argument, ~50 chars) - the window is not at risk. Any
alternative that adds a sibling element inside the sticky wrapper (Reading B)
would be.

## 5. Write set

Expected by the brief: `GradingChatPanel.tsx` + its structure test only.
**The real minimal set is four files**, because the precedence fix belongs in
the pure leaf (section 3.1) and a leaf change needs its own test:

| File | Why | Existing/ new |
|---|---|---|
| `src/app/components/grading-chat/runStatus.ts` | new input field + branch + copy | existing (68 lines) |
| `src/app/components/grading-chat/runStatus.test.ts` | behavioural pins P1-P4; update the `input()` helper default (`classifyingRecording: false`) or tsc fails | existing (53 lines) |
| `src/app/components/grading-chat/GradingChatPanel.tsx` | pass the flag; drop the ternary (the CALLER of the new field) | existing, shared with copyable-fields |
| `src/app/components/grading-chat/GradingChatPanel.structure.test.ts` | source-text pins S1-S3 | existing, shared with copyable-fields |

Not in the write set: `page.module.css`, `grading-chat.module.css` (no new
class - section 3.4), `useContinuousGradingRun.ts` (flag already exposed),
`video-w4.wiring.test.ts` (its `:100` pin still passes - the substring
`driver.classifyingRecording` survives in `classifyingRecording:
driver.classifyingRecording`).

**Disjointness with the copyable-fields build** (also editing the panel and its
structure test): NOT disjoint. Exact shared paths: `GradingChatPanel.tsx`,
`GradingChatPanel.structure.test.ts`. They must be SEQUENCED, not run
simultaneously (`docs/loop/parallel-disjointness.md`). Hunks are far apart
(copyable-fields is at `:611-670`, this at `:779`), so a merge is mechanical, but
the wave gate is `git status --short` and two agents in one file is the stated
hazard. Recommendation: land copyable-fields first (it is already in the tree),
then this one. Both new files this seat names (`runStatus.*`) are unshared.

## 6. Acceptance criteria

Each criterion names the object compared, the instrument, and the direction of
failure.

- **AC1 (precedence, behavioural).** Object: `describeRunStatus(input)` return
  value. Instrument: `runStatus.test.ts`, real function, no mock. With
  `classifyingRecording: true, preparing: true, pendingCount: 0` the title is
  exactly `Analyzing the recording...`. FAILS (red) if the title is anything else
  or the result is null.
- **AC2 (not masked, behavioural).** Same instrument. With
  `classifyingRecording: true, pendingCount: 3, inFlightCount: 2,
  inFlightStudents: ["Ada","Grace"], completedCount: 4` the title is still
  `Analyzing the recording...` and the detail is exactly `4 finished so far, 3
  still grading`. FAILS if the title is `Grading now: ...` (the masking defect).
- **AC3 (flag alone drives it, behavioural).** With `classifyingRecording:
  true, preparing: false, headerState: "ready", pendingCount: 0` the result is
  non-null with the Analyzing title. FAILS if null.
- **AC4 (no regression, behavioural).** With `classifyingRecording: false` every
  existing assertion in `runStatus.test.ts:19-52` holds unchanged. FAILS if any
  existing case changes.
- **AC5 (wired, source text).** Object: the text of the
  `describeRunStatus({...})` call in `GradingChatPanel.tsx`. Instrument:
  structure-test pin S1. Contains `classifyingRecording: driver.classifyingRecording`
  and no `"Analyzing the recording..."` literal in the panel. FAILS if the field
  is absent, hard-coded, or negated.
- **AC6 (the affordance the owner asked for is pinned).** Object: the
  `GradingProgress` function body. Instrument: pin S2. Contains
  `styles.spinner`, `role="status"` and `aria-busy`. FAILS if the spinner span
  is removed. (This affordance is currently UNPINNED: the only structure-test
  mention is a comment, `GradingChatPanel.structure.test.ts:378`.)
- **AC7 (placement).** Object: panel source order inside the sticky wrapper.
  Instrument: pin S3. `stickyComposer` < `<RecordingSplitConfirm` <
  `<GradingProgress` < `<ChatComposer`. FAILS on any reorder. (Order and
  presence only, not attribute spelling.)
- **AC8 (dark).** Object: `RECORDING_SPLIT_ENABLED`. Instrument: existing
  `video-w4.wiring.test.ts:79-81`. Remains `false`. This change must not touch
  the constant; the indicator is unreachable in a shipped build until the owner
  flips it.
- **AC9 (reading claim, owner).** In a real browser with the flag temporarily
  true: dropping a multi-segment recording shows the spinner and the Analyzing
  title; dropping a second video while the first is grading also shows the
  Analyzing title (not "Grading now"). No instrument exists here (no component
  renders); recorded as residual R1.

## 7. Structure pins (source-text, in `GradingChatPanel.structure.test.ts`)

Use the file's existing `read(PANEL)` / `withoutLineComments` helpers
(`:8`, `:130`). Pin the fact and the order, not the spelling (house lesson:
source-text pins that over-specify force contorted code).

- S1: slice from `describeRunStatus(` to its matching `)`; assert it matches
  `/classifyingRecording:\s*driver\.classifyingRecording\b/`; assert the panel
  source (comments stripped) does NOT contain `Analyzing the recording`.
- S2: slice `function GradingProgress` to the next top-level `}`; assert it
  contains `styles.spinner`, `role="status"` and `aria-busy`.
- S3: assert the four `indexOf` values in AC7 are all > -1 and strictly
  increasing.

Behavioural pins P1-P4 (= AC1-AC4) go in `runStatus.test.ts`; these are real
function calls and are STRONGER than the source-text pins, which is why the
logic moved into the leaf.

Run (the build, not this seat). Per-argument coverage for the multi-file check:
`npm run test:paths src/app/components/grading-chat/runStatus.test.ts
src/app/components/grading-chat/GradingChatPanel.structure.test.ts
src/app/components/grading-chat/video-w4.wiring.test.ts
src/file-size-ceiling.structure.test.ts` and quote its `COVERED`/`NOT COVERED`
line per argument. Plus `npx tsc --noEmit` (one caller only) and `npx eslint
src/app/components/grading-chat`. Also the source-bytes/emoji structure tests
(`src/source-bytes.structure.test.ts`, `src/lib/no-emojis.test.ts`) since a
copy string is added.

## 8. Sabotage mutations (each must turn a named pin red)

| # | Mutation | Expected red |
|---|---|---|
| M1 | In `runStatus.ts`, move the classifying branch BELOW the `pendingCount <= 0` branch (restores the masking) | AC2 (title becomes `Grading now: ...`) |
| M2 | Delete `classifyingRecording: driver.classifyingRecording,` from the panel call | S1 (and tsc if the field is required) |
| M3 | Replace with `classifyingRecording: false,` | S1 |
| M4 | Replace with `classifyingRecording: !driver.classifyingRecording,` | S1 (regex requires the property value to start at `driver.`) |
| M5 | Remove the `<span className={styles.spinner} .../>` from `GradingProgress` | S2 |
| M6 | Change `role="status"` to `role="alert"` (or delete `aria-busy`) | S2 |
| M7 | Swap `<GradingProgress` above `<RecordingSplitConfirm` | S3 |
| M8 | Make the new branch unconditional (`if (true)`) | AC4 (`runStatus.test.ts:19-21`, idle -> null) |
| M9 | Detail uses `inFlightCount` instead of `pendingCount` | AC2 exact detail string |
| M10 | Gate the new branch on `preparing &&` | AC3 |

Mutation hazards from this repo: sabotage by copying the file first (never `git
checkout --` an uncommitted file - the panel has uncommitted copyable-fields
work in it right now and a checkout would destroy it); do not run two
sabotage-verifies on the tree at once; do not run `tsc` concurrently.

## 9. Forks and residuals

### Fork (terminating shape)

This activity produces ONE of:

- **A (RECOMMENDED, acted on as my reading):** reuse the one existing spinner
  card, fix the masking, move the copy to the pure leaf, add a detail line, pin
  the affordance. 4 files, about +35 lines total. Cost if wrong: the owner wants
  something more prominent than the app's canonical spinner - one message and a
  small follow-up; nothing here is wasted because B would sit on top of it.
- **B:** A plus a second, new element (for example an indeterminate bar) for this
  phase only. Requires a new CSS class (`grading-chat.module.css`), adds an
  element inside the sticky wrapper (eats the 1500-char window,
  `GradingChatPanel.structure.test.ts:381`), and breaks the reuse rule (the
  spinner recipe comment at `page.module.css:115-124` says do not fork it; one
  affordance for seven phases). Not recommended.

Either answer ends the activity: A ships as written; if B is chosen, A still
ships and B becomes a new backlog item with the owner's described look. A third
reading, "already satisfied, build nothing", is NOT recommended: defect 1
(masking) is real by reading `runStatus.ts:51`, independent of what the owner
saw. The flag is OFF (`constants.ts:57`), so A ships dark with the rest of
recording-one-vs-many and flipping the flag is the owner's one-line action.

### Residual register

| # | Not proven now | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R1 | The spinner + Analyzing title actually render, in both the idle and rows-pending cases, and read well (AC9) | repo owner | a real browser with `RECORDING_SPLIT_ENABLED` temporarily true and a real multi-segment recording | the owner's post-deploy walk when the flag is flipped (this env has no render and no live model) |
| R2 | What the owner saw originally (candidate explanations a-c, section 0) | repo owner | the owner's own recollection/reproduction | answered by R1's walk; if (c), the walk cannot happen until the flag is on |
| R3 | `GradingProgress` is mounted conditionally (`:200`), so its `aria-live` region appears at the same moment its first message does and may not be announced (pre-existing, affects every phase, not new here) | repo owner (decides whether to open an accessibility row) | reading `GradingChatPanel.tsx:199-210`; no test can render it | a separate accessibility backlog row for grading-chat, if wanted; NOT part of this chunk |
| R4 | The phase BEFORE classify (video upload + prepare) shows the generic "Reading your submission..." (`runStatus.ts:57`); a long upload has no video-specific wording | repo owner | `runStatus.test.ts` once wording is chosen | separate backlog row if wanted; out of this request's scope |
| R5 | Panel line-count headroom if copyable-fields grows further | the wave-gate verifier | `src/file-size-ceiling.structure.test.ts` + `@(Get-Content src/app/components/grading-chat/GradingChatPanel.tsx).Count` | the build wave's gate; extraction is owed by whichever change lands second if the count exceeds ~950 |
| R6 | Classify duration is unknown, so no determinate progress or time estimate can be honest | repo owner | none (needs live model timings) | owner observation after the flag is on; a duration claim must be measured then, not guessed now |

## 10. Measurement log (every quantity, with its command)

| Quantity | Value | Command |
|---|---|---|
| Panel lines, HEAD | 738 | `git show HEAD:src/app/components/grading-chat/GradingChatPanel.tsx \| wc -l` |
| Panel lines, working tree | 797 | `wc -l <file>` and `@(Get-Content <file>).Count` (agree) |
| Panel diff vs HEAD | 61 insertions, 3 deletions | `git diff --stat -- src docs/css-orphans.md` |
| `runStatus.ts` / `runStatus.test.ts` lines | 68 / 53 | `wc -l` (and `@(Get-Content).Count` for runStatus.ts/test: 68, 53) |
| Structure test lines | 856 | `@(Get-Content src/app/components/grading-chat/GradingChatPanel.structure.test.ts).Count` |
| Ceiling | 1000 | `src/file-size-ceiling.structure.test.ts:41` |
| Sticky-window raw distance | 961 chars (test limit 1500 on comment-stripped text) | Python: `s.index('<ChatComposer') - s.rindex('chatStyles.stickyComposer',0,i)` |
| `styles.spinner` .tsx call sites | 45 | `grep -rn "styles.spinner" src --include=*.tsx \| wc -l` |
| `LinearProgress` files | 1 (`recording/TakeAnnouncementPanel.tsx`) | `grep -rln LinearProgress src` |
| `RECORDING_SPLIT_ENABLED` | `false` | `src/lib/grade/constants.ts:57` |

Not run: `npx tsc --noEmit`, `npx eslint`, any vitest file. This seat did not
sabotage-verify; section 8 is a design for the build's sabotage pass.
