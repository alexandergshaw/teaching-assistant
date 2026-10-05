# N15-rubric-picture WAVE 3 scope: the SURFACE (picture-to-text intake on the assignment-upload grading tool)

This document scopes ONLY wave 3 (W3 / the N15-3 wave) of N15-rubric-picture:
the client surface that makes the already-shipped, currently-DEAD transcription
library reachable. It is an architecture artifact (AC + architecture + wave
plan + forks + residual register), not code. A fresh `loop-checker` reads it
before any build.

It consumes, and does not re-derive, the already-checked waves-1-2 scope
`docs/n15-rubric-picture-scope.md` (sections 5-8, which already analysed W3 in
depth and recommended the `GradingTab.tsx`-direct reading). Where this document
adds or sharpens a decision, it says so and gives the command that measured it.

Every quantity below names the command that produced it, run in this checkout
on 2026-10-05. Two line-counting tools in this repo disagree by up to 138 on
some files (`docs/loop/this-repo.md` section 3), so every line count names its
tool and, where load-bearing, reports both.

---

## 0. The one shape decision this wave makes, and the conflict it resolves

**The surface is `src/app/components/GradingTab.tsx` and its two existing
inline text fields (Assignment Instructions and Rubric), NOT
`RubricInputModal.tsx`.** This is the load-bearing shape choice; everything
else follows from it. It is stated first because it CONTRADICTS the dispatch
brief's recommended reading, and "refuse a ruling you can disprove"
(`.claude/agents/loop-architect.md`) requires me to measure, report the
conflict, and not adopt either value silently.

The dispatch brief leaned: "support paste + file-picker of an image file in
RubricInputModal." Three measured facts disprove that as the surface for THIS
feature:

1. **The owner asked for a picture of the rubric AND of the assignment
   description** (backlog row `N15-rubric-picture`, `docs/BACKLOG.md:210`, title
   verbatim: "Snap / paste / upload a PICTURE of the rubric and of the
   assignment description, on the assignment-upload grading tool").
   `RubricInputModal.tsx` is rubric-ONLY: it has one textarea
   (`RubricInputModal.tsx:367-375`) and its `onSubmit` carries one string
   (`:133`). It has no assignment-description field and never did. A requirement
   (assignment description) cannot be reached from the object
   (`RubricInputModal`) the brief would bind it to - the exact "requirement
   bound to the wrong object" failure this seat exists to catch.

2. **`RubricInputModal.tsx` is not on the assignment-upload tool.** Its only two
   consumers are `GradingRecordingPanel.tsx:983` (the "Grading from a recording"
   tool) and `SnapshotGradingPanel.tsx:929` (snapshot grading)
   (`grep -rn "RubricInputModal" src --include=*.tsx`, both call sites opened).
   `GradingTab.tsx` - the tool whose "Grade from" selector offers "Upload ZIP"
   and "Single Assignment" (`GradingTab.tsx:290-291`), i.e. the assignment-upload
   tool in the owner's words - does NOT import or render it
   (`grep -n "RubricInputModal" src/app/components/GradingTab.tsx` returns
   nothing). Widening `RubricInputModal` would add an image path to the wrong
   two tools and still not reach the upload tool.

3. **The waves-1-2 scope already reached this reading independently.** Its
   section 1 (`docs/n15-rubric-picture-scope.md:31-44`) flags the row's
   `RubricInputModal.tsx` citation as a stale pointer and names the real surface
   as `GradingTab.tsx`; its section 3 of the test notes
   (`docs/n15-rubric-picture-scope.md:560-579`) binds W3's routing to the
   `assignmentInstructions`/`rubric` state setters - GradingTab's two fields,
   not a modal's one.

**This is not me overruling the owner - it is me declining to build the owner's
request on an object that cannot hold half of it.** The surface choice remains
an owner-facing fork (RES-N15-11, carried below) because the owner may still
prefer a modal-based intake; but the recommended reading this document scopes on
is `GradingTab.tsx`-direct, because it is the only reading that can carry both
the rubric AND the assignment-description picture the row asks for. If the owner
picks the modal reading instead, W3's new prompt-agnostic pieces (the pure
routing leaf and the intake component) are still reusable; only their mount
host changes, and the assignment-description half would need a second host
regardless.

### How the two fields enter today (measured, `GradingTab.tsx` opened in full)

- **Assignment Instructions**: `GradingTab.tsx:426-440` - a MUI `TextField`
  `multiline`, `name="assignmentInstructions"`, value `assignmentInstructions`
  (state at `:116`), setter `setAssignmentInstructions`
  (handler `handleAssignmentInstructionsChange`, `:247-249`).
- **Rubric**: `GradingTab.tsx:442-461` - a MUI `TextField` `multiline`,
  `name="rubric"`, value `rubric` (state at `:117`), setter `setRubric`
  (handler `handleRubricChange`, `:251-252`).
- Both render only when `showContextFields` is true
  (`source === "zip" || canvasRetrieved`, `:276`, gate at `:424`). The rubric
  field additionally requires `source === "zip" || rubric.trim()` (`:442`).
- **Neither field has any non-text intake today.** No paste handler, no file
  input, no image helper for these two fields
  (`grep -n "onPaste\|clipboardData\|readFileBase64\|inlineData" src/app/components/GradingTab.tsx`
  returns nothing). This is the gap W3 closes.

---

## 1. The library this wave makes reachable (shipped waves 1-2, currently DEAD)

Both files opened directly this pass.

- `src/lib/grade/rubric-picture-prompt.ts` - `buildRubricPicturePrompt(kind)`
  at `:27-29`, pure leaf, no React, no server imports.
  `RubricPictureKind = "rubric" | "assignment description"` at `:13`.
- `src/app/actions/grading-picture-transcribe.ts` -
  `transcribeGradingPictureAction(base64: string, kind: RubricPictureKind,
  provider: LlmProvider): Promise<{ text: string } | { error: string }>` at
  `:24-28`. It is `"use server"` (`:1`), calls `requireUser()` (`:29`),
  rejects a non-image via `detectImageMimeFromBase64` (`:36-39`), checks
  `checkWireBudget` on wire bytes (`:41-42`), makes exactly one `callLlm` with
  one `inlineData` part using the detected mime (`:44-58`), and returns a
  trimmed transcript string or an error string (`:60-65`).

**Proof it is dead:** no production caller.
`grep -rn "transcribeGradingPictureAction\|grading-picture-transcribe" src --include=*.ts --include=*.tsx`
outside the action's own file and its test returns only documentation. It is
NOT exported from the `../actions` barrel either
(`grep -n "grading-picture-transcribe\|transcribeGradingPictureAction" src/app/actions.ts`
returns nothing) - so a surface that imports it through the barrel would ship
dead. **W3 must import it directly from `@/app/actions/grading-picture-transcribe`**,
exactly as the N14 precedent imports its sibling action directly
(`useSnapshotRubricCapture.ts:21`:
`import { snapshotTranscribeRubricAction } from "@/app/actions/snapshot-transcribe-rubric"`).
No barrel change is in W3's write set.

---

## 2. Leverage claim (carried from the waves-1-2 scope, re-confirmed)

**Class: click-cost reduction, named as such - NOT a categorical advantage over
a chat window.** A plain LLM chat with image upload already transcribes a
photographed rubric or assignment page today, so the transcription step itself
earns no categorical class (`docs/loop/leverage.md`, the struck "Click cost"
row and the `AskAiModal.tsx` negative example). What this feature earns is the
collapse of "leave the app, paste the photo into a chat, read the answer, copy
it, paste it into the right box, and get the copy right" into one
paste/drop/pick inside the box the instructor is already filling, with the text
landing in the exact field that already feeds `extractRubricCriteria`
(`src/lib/grade/rubric.ts:27-31`) and the SCALE-guaranteed batch grader
(`engine.ts`). The SCALE property is INHERITED from the existing pipeline, not
earned here, and is not claimed as this feature's own. No CORPUS (nothing
persists past the page), no CAPTURE (a file paste is a channel a chat already
has), no INTEGRATION.

**Removal test for a click-cost advantage is not buildable in this environment**
(its advantage is clicks/attention, which no vitest test can observe because no
component renders - `docs/loop/this-repo.md` section 6). Recorded as an OV
residual (RES-N15-8 / RES-N15W3-6), not fabricated.

---

## 3. Acceptance criteria

Each criterion names its object, its instrument, and the direction of failure.
Machine-checkable criteria (3.1) are source-text or pure-function pins, because
no component renders under vitest here. Owner-verification criteria (3.2) are
the look and the felt flow and anything needing a live provider key.

### 3.1 Machine-checkable (source-text wiring + pure functions; no render, no live call)

**AC1 - the library is no longer dead (the ships-dead reachability guard).**
- Object: the new intake component / hook under `src/app/components/grading/`.
- Instrument: a `*.wiring.test.ts` (new,
  `src/app/components/grading/gradingPictureWiring.wiring.test.ts`) that reads
  source with `readFileSync` and asserts the new client file(s) contain a
  direct import of `transcribeGradingPictureAction` from
  `@/app/actions/grading-picture-transcribe` AND a call to it.
- Direction of failure: RED if no new source file imports and calls
  `transcribeGradingPictureAction` - i.e. RED if the library stays dead.

**AC2 - both fields reach the action, with the correct `kind` (the surface is a
layer; both halves of the owner's request are wired).**
- Object: `GradingTab.tsx`'s two mount sites.
- Instrument: the same `*.wiring.test.ts`, asserting `GradingTab.tsx` mounts the
  new intake component twice - once bound to the Rubric field
  (`kind="rubric"`, onExtracted routing to `setRubric`) and once bound to the
  Assignment Instructions field (`kind="assignment description"`, onExtracted
  routing to `setAssignmentInstructions`). Because the two `kind` literals are
  the only two members of `RubricPictureKind` (`rubric-picture-prompt.ts:13`),
  assert BOTH literals appear at a GradingTab mount site.
- Direction of failure: RED if either field lacks a picture-intake mount, or if
  both mounts use the same `kind` (proving one field is unwired or
  mis-parameterised).

**AC3 - the result routes to the correct setter and an error never corrupts a
field (the two-target ambiguity, pinned as a pure function).**
- Object: a pure routing leaf (new,
  `src/app/components/grading/gradingPictureIngest.ts`), e.g.
  `routeExtractedText(result, onText)` or
  `applyExtractedText(kind, result, { onRubric, onInstructions })` - the exact
  shape is the implementer's, but it MUST be an exported pure function, not
  inline JSX-handler logic, so it is testable (no component renders here).
- Instrument: a unit test (new,
  `src/app/components/grading/gradingPictureIngest.test.ts`) asserting a
  `{ text }` result is passed unchanged to the correct field's setter and an
  `{ error }` result reaches NEITHER setter (it never blanks or overwrites
  existing field text).
- Direction of failure: RED if an error result mutates a field, or if a
  rubric-field result is routed to the instructions setter or vice versa.

**AC4 - the client pre-flight refuses an over-budget or non-image file BEFORE a
wasted round trip, with a named message (never a silent no-op).**
- Object: a pure pre-flight decision in `gradingPictureIngest.ts`, e.g.
  `describeIngestRejection(file)` returning `null` (accept) or a message
  string, reusing `checkFileWireBudget` (`src/lib/upload-budget.ts:101`) for
  size and an image-type test for kind.
- Instrument: a unit test asserting (a) a file over
  `maxFileBytesForWireBudget()` (= 3.5MB / (4/3) = 2752512 bytes,
  `upload-budget.ts:65`) returns a non-null, non-empty message naming the size
  limit; (b) a non-image file (e.g. `application/pdf`, deferred per RES-N15W-3)
  returns a non-null message; (c) a within-budget image returns `null`.
- Direction of failure: RED if an over-budget or non-image file returns `null`
  (would reach the action and waste the call, or appear to do nothing).

**AC5 - the drag/paste harvest happens before any `await` (the
drag-store-closes-at-first-await trap), and a click-to-browse path exists
(not drop/paste-only).**
- Object: the drop and paste handlers in the new client file(s).
- Instrument: a comment-stripped source-text assertion (in the
  `*.wiring.test.ts`) that no `await` textually precedes the
  `dataTransfer.files` / `clipboardData.items` harvest in those handlers, plus
  an assertion that a `<input type="file">` exists in the component (a browse
  path, not drag-only - WCAG 2.2 SC 2.5.7).
- Direction of failure: RED if an `await` precedes the harvest, or if no file
  input is present. Honest limit: this is a source-order proxy, not an executed
  render (RES-N15W3-3).

**AC6 - the wave touches nothing outside its declared write set, and does not
collide with a concurrent A39-FILL or N15a edit to `GradingTab.tsx`.**
- Object: `git status --short` after the wave, against section 6's write set.
- Instrument: the wave gate (`wave-gate-git-status.md`), plus a direct diff read
  of `GradingTab.tsx` against the last A39-FILL and N15a commits touching it.
- Direction of failure: RED if any file outside the write set is touched, or if
  the `GradingTab.tsx` diff conflicts with an A39-FILL or N15a wave landed in
  the same window. (A39 FILL is a LIVE co-writer of this file - section 5.)

**AC7 - no gate that reads the files W3 edits goes red.**
- Object: the source-text tests that read `GradingTab.tsx`
  (`autoGradeTransition.wiring.test.ts`, `componentStorageKeys.structure.test.ts`,
  `canvas-client-boundary.runtime-graph.test.ts`) and the unconditional size
  ceiling (`file-size-ceiling.structure.test.ts`).
- Instrument: those tests, run in the wave gate (section 6).
- Direction of failure: RED if the GradingTab edit adds a `ta-` key
  `componentStorageKeys` must enumerate (W3 adds none - RES-N15-10), if a new
  client file imports a server-only module (boundary test), if the autoGrade
  wiring assertions break, or if `GradingTab.tsx` exceeds its size ratchet.

### 3.2 Owner-verification only (OV) - not provable in this environment

Per `docs/loop/this-repo.md` section 6: no live DB, no API key, no network, no
rendered component.

- **OV-A - OCR accuracy on a real photographed page** (handwriting, glare,
  skew, multi-column). Owner tests with a real photo and a real key.
- **OV-B - the look and the felt capture flow**: whether the two-field paste
  ambiguity resolves correctly for a real user pasting while focused in one
  field vs the other; whether the busy/error notice is visible, legible, and
  announced (`role="status"`/`role="alert"`); whether the affordance reads as
  this app's visual language (professional, minimal, no emoji; recommend the
  outlined-button + field-hint pattern of `RubricInputModal.tsx:311-335`).
- **OV-C - the click-cost leverage claim in practice** (section 2).
- **OV-D - the phone-photo size reality** (RES-N15-5 / fork F4): whether the
  owner's actual phone photo fits the 2752512-byte file ceiling without a
  downscale step (section 5.4).

---

## 4. Architecture

### 4.1 New files (all under `src/app/components/grading/` - GradingTab's own helper dir)

Placement rationale, measured: `src/app/components/grading/` already holds
GradingTab's leaves (`incrementalRunPlan.ts`, `runProgressCopy.ts`,
`useIncrementalGradingRun.ts` - `ls src/app/components/grading/`). It is the
correct tool's directory. It is also OUTSIDE two canary fences that
`grading-recording/` sits inside, so putting the files here avoids springing a
gate the brief's suggested `grading-recording/` location would trip:

- `src/app/components/ui/buttonVariant.test.ts:105-113` (`SECTION_4_DIRS`)
  walks `grading-recording` but NOT `grading` - so a new Button-using component
  under `grading-recording/` would force a `FROZEN_PRIMARY_SITES` map edit
  (`:164-210`); under `grading/` it does not. (Verified by reading the walk.)
- `GradingTab.tsx` itself is not in `SECTION_4_DIRS` nor in
  `SECTION_4_EXTRA_FILES` (`:114`), so adding mounts to it does not touch that
  canary either.

| New file | Kind | Holds |
|---|---|---|
| `src/app/components/grading/gradingPictureIngest.ts` | pure leaf, no React, no server-only imports | The pure routing function (AC3) and the pre-flight decision (AC4). Trivially unit-testable; this is where logic lives so it is not stranded inline in a `.tsx` that no test can render. |
| `src/app/components/grading/GradingPictureField.tsx` | `"use client"` component | The affordance: an outlined "Add from a picture" control, a file input (`accept="image/*"` - images only, matching the shipped action; see RES-N15W-3 for PDF), a drop zone, and a paste listener SCOPED to this field's own container (not `document`), plus a busy/error notice (`role="status"`/`role="alert"`). Props `{ kind, provider, onExtracted }`. Reads a File to base64 via `readFileBase64` (`src/lib/courses-tab-helpers.ts:246-256`, confirmed to strip the `data:` prefix at `:251`), runs the pre-flight leaf, calls `transcribeGradingPictureAction(base64, kind, provider)` directly, and on `{ text }` calls `onExtracted(text)`. Mounted once per field. |
| `src/app/components/grading/gradingPictureIngest.test.ts` | unit test | AC3 + AC4. |
| `src/app/components/grading/gradingPictureWiring.wiring.test.ts` | source-text test | AC1 + AC2 + AC5 (the ships-dead reachability guard). |

The intake MECHANISM is built once and parameterised by field, per the
waves-1-2 scope section 5 reading (i): the two fields are structurally
identical, so the paste/drop/pick wiring, the budget check, and the action call
live in the new files; `GradingTab.tsx` gains only two mounts. Intake idiom
copied from `TextbookPhotoModal.tsx:159-176` (paste scoped to a ref, not
`document`), response shape from the N14 action (plain transcript, not JSON).

### 4.2 Edited files

| Edited file | Edit | Size impact |
|---|---|---|
| `src/app/components/GradingTab.tsx` | One import of `GradingPictureField`; two mounts - one inside the Assignment Instructions field block (`:426-440`, `kind="assignment description"`, `onExtracted={setAssignmentInstructions}`), one inside the Rubric field block (`:442-461`, `kind="rubric"`, `onExtracted={setRubric}`), each passing `provider={selectedProvider}` (state at `:98`). No other new inline logic. | +3 to +9 lines (section 5). |
| `src/file-size-ceiling.structure.test.ts` | The RES-GRAD-5 / RES-N15-14 size ratchet on `GradingTab.tsx`, pinned at the TRUE measured post-wave count (section 5). | a few lines in `ALLOWED_OVERAGE`. |

### 4.3 Data flow, end to end (proving the surface is a real layer)

1. Instructor is on GradingTab, `source === "zip"` (upload tool), both context
   fields visible (`:424` gate true).
2. In the Rubric field's `GradingPictureField`, the instructor pastes / drops /
   picks a photo. The handler harvests the File synchronously (AC5), runs the
   pre-flight leaf (AC4). If rejected, a named notice renders; no call is made.
3. Accepted: `readFileBase64(file)` -> base64 (no `data:` prefix) ->
   `transcribeGradingPictureAction(base64, "rubric", selectedProvider)`.
4. The action validates the mime server-side (`detectImageMimeFromBase64`),
   re-checks the wire budget, calls the vision model once, returns `{ text }` or
   `{ error }`.
5. `routeExtractedText` (AC3): `{ text }` -> `setRubric(text)` (fills the exact
   field already wired into the grading form, `name="rubric"`, which feeds
   `extractRubricCriteria` and the grader). `{ error }` -> a notice, field
   untouched.
6. The Assignment Instructions field's `GradingPictureField` is identical with
   `kind="assignment description"` and `onExtracted={setAssignmentInstructions}`.

This is why the library is no longer dead: step 3 is the only production call
site of `transcribeGradingPictureAction` that will exist, and AC1 pins it.

---

## 5. The `GradingTab.tsx` size measurement and the A39 block (the brief's constraint 1)

### 5.1 Measurement (both instruments; they agree)

```
@(Get-Content src/app/components/GradingTab.tsx).Count   -> 617
wc -l src/app/components/GradingTab.tsx                   -> 617
```

### 5.2 Which ceiling is operative (measured - this disproves "blocked on A39")

- **The only MECHANICALLY ENFORCED ceiling on this file is 1000.**
  `src/file-size-ceiling.structure.test.ts:41` sets `LIMIT = 1000`; it walks all
  of `src/` recursively (`listSourceFiles`, `:101-111`). `GradingTab.tsx` is
  absent from its `ALLOWED_OVERAGE` map
  (`grep -n "GradingTab" src/file-size-ceiling.structure.test.ts` returns
  nothing), so its enforced limit is 1000. At 617, it has 383 lines of HARD
  headroom.
- **The "<= 620" precondition has NO enforcer anywhere in the tree.**
  `grep -rn "620" src --include=*.test.ts` returns exactly one hit, an unrelated
  viewport clamp (`src/app/components/fab-menu-logic.test.ts:33`). The `<= 620`
  bound lives only in A39's own design docs
  (`docs/a39-fill-waves.md:69,1163,1225`;
  `docs/a39-incremental-fill-architecture.md:86,1903-1924`) as the self-imposed
  budget A39 FILL W7's flag flip wants `GradingTab.tsx` to sit under. It is a
  planning number, not a gate.

**Conclusion: W3 is NOT blocked on A39.** The brief's "STOP and report blocked
on A39" branch is for a HARD ceiling W3 cannot avoid; the hard ceiling is 1000,
and W3 lands at ~620-626, 374+ lines clear of it. I therefore do NOT take the
"sequence after A39 W7" path (which is impossible anyway - A39 W7 is unscoped,
owner-blocked, "not agent-startable"). I take the brief's other path: route all
new code into new files, GradingTab gets only two mounts.

### 5.3 What the GradingTab edit costs, precisely

The edit is 1 import + 2 mounts. In the smallest correct form (single-line
mounts) that is ~3 lines net, landing GradingTab at ~620; in a readable
multi-line form, ~6-9 lines, landing at ~623-626. Either way:
- **Hard 1000 gate: passes with ~374+ lines to spare.**
- **Soft 620 A39 budget: at or just over its boundary.** If W3 lands over 620,
  A39 FILL W7 (when it is eventually scoped) inherits a baseline of ~623-626
  instead of 620 and must extract or re-baseline - which A39's own docs already
  anticipate ("if it lands above 620, the extraction is named and it is not a
  judgement call", `docs/a39-incremental-fill-architecture.md:1924`). This is a
  non-gating, owner-facing consequence, not a blocker. Recorded as RES-N15W3-1.

I cannot drive GradingTab to <= 620 net WITHOUT extracting something out of it,
and extraction is A39's job, not W3's; the brief forbids doing A39's work. So
the honest statement is: **W3 adds ~3-9 lines to GradingTab, lands it at
~620-626, passes every enforced gate, and spends a few lines of an unenforced
A39 planning budget.** The implementer measures the true count after the wave
and pins the ratchet at THAT number (next item).

### 5.4 The RES-N15-14 ratchet (what to add to `file-size-ceiling.structure.test.ts`)

RES-GRAD-5 (the A39 residual, cited in the backlog row) assigns "whichever
chunk next writes `GradingTab.tsx`" the obligation to add a mechanical size
ratchet on it. W3 is that chunk. Mechanism (read from the test, `:75-92,137-138`):
`ALLOWED_OVERAGE[path] = { maxLines, reason }` sets that file's limit to
`maxLines` even BELOW 1000 (the limit is `override ? override.maxLines : LIMIT`),
so it CAN express a sub-1000 ratchet.

- Add `"src/app/components/GradingTab.tsx": { maxLines: <true post-wave count>,
  reason: "RES-GRAD-5 sub-1000 size ratchet; next writer re-pins" }`, with
  `maxLines` set to the measured `@(Get-Content).Count` AFTER the wave, never a
  number guessed from this document.
- **Because W3's own edit lands above 620, W3 CANNOT honestly pin `maxLines: 620`
  - its own commit would fail the gate it adds.** It pins the true count. This
  discharges RES-GRAD-5's "add a mechanical ratchet" obligation; it does NOT
  deliver A39's intended `<= 620`, which only A39 W7 can restore by extracting
  (RES-N15W3-1). The `ALLOWED_OVERAGE` header comment (`:64-74`) currently says
  "Files already over the 1000-line ceiling"; the implementer updates that
  comment to acknowledge a sub-1000 ratchet entry, or the entry contradicts its
  own doc.
- If A39 FILL W7 lands on `GradingTab.tsx` BEFORE W3, coordinate: re-measure and
  pin against the then-current tree (RES-N15-3 / RES-N15W3-2 race).

This ratchet edit is itself a structure-test change, so the wave gate MUST run
`src/file-size-ceiling.structure.test.ts` (it is on the unconditional list
anyway - `docs/loop/this-repo.md:41-49`).

---

## 6. Wave plan

W3 is ONE wave, independently gateable and pushable (waves 1-2 already shipped
at `9f5f1fd3`; W3 depends only on their landed library).

| Wave | What it does | Write set | Gated on |
|---|---|---|---|
| **N15-3 (W3)** | The surface: `GradingPictureField` + `gradingPictureIngest` leaf under `grading/`, mounted twice in `GradingTab.tsx`, routing transcripts into the two existing setters; plus the RES-N15-14 ratchet | the four new `grading/` files (4.1), `src/app/components/GradingTab.tsx` (two mounts + import), `src/file-size-ceiling.structure.test.ts` (ratchet) | waves 1-2 (landed). Must `git status --short` against A39 FILL's and N15a's live write sets on `GradingTab.tsx` before landing (AC6). |

### Wave gate (run from PowerShell; multi-path form per `test-paths-wrapper.md`, one path per arg)

```
npm run test:paths -- src/app/components/grading/gradingPictureIngest.test.ts src/app/components/grading/gradingPictureWiring.wiring.test.ts src/file-size-ceiling.structure.test.ts src/app/components/autoGradeTransition.wiring.test.ts src/app/components/componentStorageKeys.structure.test.ts src/lib/canvas-client-boundary.runtime-graph.test.ts
```

Why each path is in the gate:
- the two new `grading/` test files - the wave's own AC1-AC5 instruments.
- `src/file-size-ceiling.structure.test.ts` - UNCONDITIONAL (the brief and
  `docs/loop/this-repo.md:41-49`), and it carries the RES-N15-14 ratchet edit.
- `autoGradeTransition.wiring.test.ts`, `componentStorageKeys.structure.test.ts`,
  `canvas-client-boundary.runtime-graph.test.ts` - these READ `GradingTab.tsx`
  (and, for the boundary test, govern whether a new client file may import a
  module) as SOURCE TEXT
  (`grep -rln "GradingTab" src --include=*.test.ts`), so a GradingTab edit or a
  new client import can turn one of them red. A gate that omits a test which
  greps the file being changed is how a correct change ships red
  (`gate-must-include-directory-canary.md`,
  `assignment-must-include-the-wiring-file.md`).

NOT in the test:paths gate, and why: `src/app/components/ui/buttonVariant.test.ts`
- its `SECTION_4_DIRS` walk excludes `grading/` and `GradingTab.tsx` (section
  4.1), so W3's files are outside its fence by construction. This is a
  deliberate placement choice, not an omission; if the implementer instead puts
  a Button-using file under `grading-recording/`, that test MUST be added and a
  `FROZEN_PRIMARY_SITES` entry bumped.

### Full gates at the chunk push (PowerShell)

```
npx tsc --noEmit            # no output, exit 0
npm run lint                # exit 0; no NEW warning in W3's written files (compare to baseline run)
npm run build               # grep for "Compiled successfully"; the prerender tail exit 1 is expected (no .env)
npm test                    # full suite, catches the structure/enumeration canaries the pre-push gate skips
```

The wave gate also runs `git status --short` against the write set above (AC6),
and a direct diff of `GradingTab.tsx` against the last A39-FILL / N15a commit
that touched it.

---

## 7. Owner forks (recommend a reading, do not gate; each ride alongside started work)

All five are owner-facing and non-gating. W3 is scoped so it is buildable on the
recommended reading of each; a different answer changes copy or a flag, not the
wave's shape (except F1, which changes the mount host). Per the SHAPE-5 disposal
rule, these questions ride ALONGSIDE the started work, they do not block it.

**F1 - the surface (RES-N15-11). RECOMMEND: build on `GradingTab.tsx` (this
document).** The alternative is widening `RubricInputModal.tsx` and rendering it
from GradingTab as a third caller. Cost of picking the modal reading: it cannot
carry the assignment-description half (section 0, fact 1), so that half needs a
separate host regardless; and the modal's two existing callers would gain an
image path they did not ask for. Cost of being wrong on the GradingTab reading:
a rewrite of the two mounts' host, with the prompt leaf and routing leaf reused
as-is. **This is the one fork that changes the wave's shape, so it is the one
most worth an answer before the build dispatches.**

**F2 - fill-in-place vs a review step (RES-N15-2). RECOMMEND: fill the field
directly** (no gated review modal), because GradingTab's fields have no sibling
state to protect and the transcript lands in an editable, visible box the
instructor is about to submit - the same trust model `RubricInputModal.tsx`'s
upload path already ships. Cost of the other answer (N14's explicit
confirm/edit step): a review surface per field, worth it only if the owner finds
OCR of a photographed (vs screen-shared) page too error-prone to land unseen.

**F3 - what "Snap" means (RES-N15-4). RECOMMEND: a file-picker's camera
shortcut** (`<input type="file" accept="image/*" capture>` - a one-attribute
addition), NOT a live in-app camera preview (a materially larger build that
could newly earn the CAPTURE class). Cost of the live-camera answer: a real
build, out of W3's scope.

**F4 - phone-photo size / downscale (RES-N15-5, ELEVATED this pass).
RECOMMEND: ship W3 now with a named oversize message, and treat a client-side
downscale as an immediate fast-follow gated on the owner's own photo
measurement.** This is a reachability-of-VALUE finding, not just a residual:
`maxFileBytesForWireBudget()` = 3.5MB / (4/3) = 2752512 bytes
(`upload-budget.ts:65`), and the owner's stated primary input is a phone photo,
which is routinely 3-5MB - so the oversize path (AC4) will fire for the owner's
own files, and W3 as scoped (no downscale) will transcribe a screenshot or a
small image but REFUSE a typical phone photo with a clear message. No reusable
"downscale an upload to fit a byte budget" helper exists today
(`grep -rln "createImageBitmap\|downscale\|toDataURL" src/lib src/app/components`
returns only caption/video canvas code for other features), and a downscale
step does not execute under vitest (no canvas in node), so it is a real,
owner-verifiable build. Cost of shipping without it: the feature looks done and
is green, yet fails on the owner's primary input - exactly the "ships reachable
but dead for the real case" trap. Cost of including a minimal downscale now: a
new leaf + an OV-only verification. The owner decides after measuring one real
photo (RES-N15-5).

**F5 - the stale "no OCR" copy (RES-N15-12). RECOMMEND: a standalone
doc-accuracy fix, NOT in W3's write set.** `rubric-input.ts:87,99` and
`RubricInputModal.tsx` still assert "this app has no OCR", now false. W3 does
not touch those files; named so it is not lost.

---

## 8. Residual register

Every entry names an owner, an instrument, and the step that will measure it
(missing any of the three, it is a deletion - `.claude/agents/loop-architect.md`).
IDs `RES-N15-*` are carried unchanged from the waves-1-2 scope's section 8 so
they do not collide; `RES-N15W3-*` are new or sharpened this pass. **This
register, and any residual it carries forward, must be reflected in
`docs/BACKLOG.md`'s `N15-rubric-picture` row at disposal - a residual that lives
only here does not exist** (`docs/DEV_LOOP.md:109-114`).

| ID | Object | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-N15W3-1 (new) | Whether W3's GradingTab edit lands at/under 620 (unlikely given 617 + 2 mounts) and, if over, that A39 FILL W7 inherits the higher baseline and must extract per its own rule | The N15-3 implementer; then A39 W7's owner | `@(Get-Content src/app/components/GradingTab.tsx).Count` after the wave, vs 620 | At the wave gate; the ratchet (5.4) pins the true count, and this consequence is noted in the push's backlog reconciliation |
| RES-N15W3-2 (sharpens RES-N15-3) | A39 FILL W7 or N15a landing on `GradingTab.tsx` concurrently, racing W3 for the same field blocks | Whichever of the three lands second | `git status --short` + direct diff against the other's last commit | The wave that lands second, before it pushes (AC6) |
| RES-N15W3-3 (sharpens RES-N15-6) | AC5 is a source-ORDER proxy for the drag-store-at-first-await trap and the browse-path requirement; not an executed render | The owner | Manual click-through: paste a photo, drop a folder (must name-refuse, not silent no-op), tab to the browse control | Owner verification post-W3 |
| RES-N15W3-4 (= RES-N15-13) | HEIC decode: `detectImageMimeFromBase64` sniffs only jpeg/png/webp, but a phone may hand a `image/heic` File; the client must surface the server's refusal as a named message, never a silent no-op | The owner | Drop an iPhone HEIC photo on the built surface; report whether it previews/transcribes or shows a clear message | Owner verification post-W3 |
| RES-N15W3-5 (= RES-N15W-3, carried) | PDF intake is deferred - the shipped action is images-only (`detectImageMimeFromBase64` returns null for PDF); W3's client pre-flight refuses PDF with a message | The owner / a later wave | the pre-flight unit test (AC4b) + an owner decision on whether PDF is wanted | Named now; a later wave adds the PDF-inline path if the owner wants it |
| RES-N15W3-6 (= RES-N15-8) | OCR accuracy and the dollar cost of one real vision call at the action's `maxOutputTokens` (4096) | The owner | A real photo, a real key, a real call, read against the Gemini console usage report | Owner verification post-ship; also the leverage-claim removal test, unbuildable here (section 2) |
| RES-N15-5 (carried; the measurement behind F4) | A real phone photo's size vs the 2752512-byte ceiling | The owner | Photograph one real rubric on the phone actually used; report the MB | Before deciding whether the F4 downscale fast-follow is load-bearing |
| RES-N15-10 (carried) | W3's affordance needs NO persisted `ta-` key - a paste/pick is a momentary action, not a stored choice (`persist-ui-control-state.md` is about choices) | This scope, as a reasoned exemption | N/A | Revisit only if W3 adds a genuine persisted toggle (nothing in section 4 does) - and if it ever does, `componentStorageKeys.structure.test.ts` must enumerate it |
| RES-N15-12 (carried; = F5) | The stale "this app has no OCR" copy in `rubric-input.ts`/`RubricInputModal.tsx` | Whoever next touches those files | `grep -n "no OCR" src/app/components/grading-recording/rubric-input.ts src/app/components/grading-recording/RubricInputModal.tsx` | Not W3's write set; named so it is not lost again |
| RES-N15-14 (carried; the ratchet obligation) | The RES-GRAD-5 sub-1000 size ratchet on `GradingTab.tsx` | The N15-3 implementer (or whoever writes GradingTab first) | The `ALLOWED_OVERAGE` entry, pinned at the true measured post-wave count (section 5.4) | Same commit as the GradingTab mount edit |

---

## 9. `owns` file list (derived by command; output pasted)

New files W3 creates (all under `src/app/components/grading/`):
- `src/app/components/grading/gradingPictureIngest.ts`
- `src/app/components/grading/GradingPictureField.tsx`
- `src/app/components/grading/gradingPictureIngest.test.ts`
- `src/app/components/grading/gradingPictureWiring.wiring.test.ts`

Existing files W3 edits:
- `src/app/components/GradingTab.tsx`
- `src/file-size-ceiling.structure.test.ts`

Existing tests that READ an edited file as SOURCE TEXT (a change to
`GradingTab.tsx` can redden these even though W3 does not edit them - they
belong in the wave gate, section 6):

```
$ grep -rln "GradingTab" src --include=*.test.ts
src/app/components/autoGradeTransition.wiring.test.ts
src/app/components/componentStorageKeys.structure.test.ts
src/app/components/grading-results/gradingResultsExtraction.wiring.test.ts
src/app/components/grading-results/gradingResultsHelpersEditState.test.ts
src/app/components/grading-results/gradingResultsHelpersWiring.test.ts
src/app/components/grading-results/rubricProvenanceLeaf.test.ts
src/lib/canvas-client-boundary.runtime-graph.test.ts
```

Of these, the three that read `GradingTab.tsx` directly for structure/wiring
(`autoGradeTransition.wiring.test.ts`, `componentStorageKeys.structure.test.ts`,
`canvas-client-boundary.runtime-graph.test.ts`) are in the wave gate; the four
`grading-results/` files read `GradingResults`/helpers, not the two fields or
mounts W3 touches, and are covered by the full `npm test` at push (the
implementer confirms none asserts on the field blocks W3 edits before calling
them unaffected).

Repo-wide size test that reads every `src/` file (so it reads both the new files
and the edited `GradingTab.tsx`): `src/file-size-ceiling.structure.test.ts`
(walks `src/` recursively, `:101-111`) - already in the wave gate.

Also applicable and already accounted for in section 4.1: no `*.structure.test.ts`
has a frozen-roots/basename canary over `src/app/components/grading/`
(`ls src/app/components/grading/` shows only the incremental-run leaves and
their tests; no structure test there), so ADDING new files to that directory
trips no directory canary - unlike `grading-recording/`, which `buttonVariant.test.ts`
fences.

---

## 10. What this environment could not verify

Per `docs/loop/this-repo.md` section 6: no live DB, no API key, no network, no
rendered component under vitest. Specifically for W3:

- **No component renders**, so AC1/AC2/AC5 are source-text claims and AC3/AC4
  are pure-function claims; whether the real surface paints, whether the paste
  target disambiguates per focused field, whether notices are announced - all
  OV (RES-N15W3-3, OV-B).
- **No live vision call**, so OCR quality and dollar cost are OV
  (RES-N15W3-6). `callLlm` is network-blocked under vitest; the action's logic
  is exercised only through mocks (waves 1-2 already did this).
- **The phone-photo size reality (F4 / RES-N15-5)** can be stated arithmetically
  (2752512-byte ceiling) but whether a specific owner's photo exceeds it must be
  measured by the owner on the real device.
- **I could not and did not resolve the surface fork (F1 / RES-N15-11)** - it is
  the owner's product decision. This document scopes on the reading the owner's
  own words (rubric AND assignment description, on the upload tool) make the
  only workable one, and says so, but the owner may still choose the modal
  reading and accept that the assignment-description half needs a second host.

---

## 11. Verification run for this document

Run from the Bash tool after writing this file (ASCII/BOM sweep + the committed
emoji/source-bytes gate that scans `docs/`), plus `git status --short`. Actual
outputs are pasted in the hand-off report, not predicted here - the file is the
artifact; the report records that the gate was run and what it returned.
