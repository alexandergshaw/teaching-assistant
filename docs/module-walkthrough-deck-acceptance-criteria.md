# Record a module walkthrough, get a lecture deck - acceptance criteria

Requested 2026-09-01: *"a recording feature which allows me to screenshare and
record all of a module's content and then get a lecture slide deck out of the
deal."*

Two decisions were put to the owner and answered:

1. **The deck is read off the screen.** The recording is the SOURCE of the
   deck's content, not merely emphasis over module text. This was recommended
   against - the module's authored text is available at full fidelity and
   already produces a deck today - and the owner reaffirmed it. That is their
   decision; it is recorded here so nobody relitigates it, and its costs are
   stated plainly in section 5 rather than hidden.
2. **Segmentation comes from the template.** The slide templates already in the
   app fix the deck's structure, and the model distributes the captured visible
   material into that structure. **No narration-derived segmentation, no live
   slide markers.** This is the existing deck flow's own mechanism and it
   removes the hardest open problem in the design.

---

## 1. What this feature is

The instructor picks a module, opens a walkthrough recorder, optionally types
context, picks a deck template, and starts a screen share. They scroll through
the module's content. The app samples frames, extracts what is visible as text,
and when they stop, generates a lecture deck from that extracted material using
the chosen template - landing in the same artifact/`.pptx` path the existing
"Lecture deck" bulk action already uses.

**It is NOT:** a video producer, a narration transcriber, or a replacement for
the existing module-content deck button. Those exist or are out of scope.

---

## 2. The reuse survey (verified before this document was written)

A prior survey read each of these in source, and read a call site for every row
marked "def + call site". **Rows marked UNVERIFIED must be confirmed by the
implementer before being relied on.**

| Need | Reuse | Where | Verified |
| --- | --- | --- | --- |
| Screen capture, system audio, mic | `requestScreenShareStream`, `classifyDisplayAudioGrant` | `recording/screen-source.ts:82,47` | def + call site |
| Frame sampling, change detection, backpressure | `useDiscussionCapture` | `recording/useDiscussionCapture.ts:92` | def + call site |
| Frame encode params, **legibility floor** | `resolveTargetWidth`, `FRAME_*`, `packFrameBatch` | `recording/discussion-capture.ts:87,66-76,188` | def + call site |
| Vision extraction shape (prompt + action) | `extractGradingSubmissionsAction`, `buildSubmissionExtractionPrompt` | `actions/grading-submission-extract.ts:71`; `grading-recording/grading-extraction-prompt.ts:64` | def + call site |
| **Deck from arbitrary text** | `generateDeckFromTemplateAction`, `DeckGenContext.materials` | `actions/media.ts:567`; `lib/decks/generate.ts:23`, interpolated ~`:112` | def + call site |
| Deck-from-module, end to end | `decksKindConfig`, bulk-bar button | `lib/lms-generation/kinds.ts:670`; `GenerateFromSelectionSection.tsx:249` | both read |
| Module selection to materials text | `gatherSelectionMaterials`, `MATERIALS_CAP=20000` | `lib/lms-generation/materials.ts:318,75` | def + one call site |
| Launch a recording view with context | `openRecordingTool`, `navigateToRecordingTool` | `lib/recording-launch.ts:162,196` | def read in full |
| Context-before-capture precedent | `videoContext` @ `ta-slides-video-context` | `slide-studio/useVideoMode.ts:83,129,197` | def + call site |
| Wire budget enforcement | `checkWireBudget`, `UPLOAD_WIRE_BUDGET_BYTES=3.5MB` | `lib/upload-budget.ts:41,113` | def + enforcement site |
| Downloadable run log convention | 5-function bespoke pattern; only `escapeCsvValue` is shared | `grading-recording/grading-recording-log.ts:213,247,357,426,453` | subagent-verified |
| `.pptx` render | `buildSlidesPptx` | `lib/pptx.ts` | **UNVERIFIED - confirm first** |
| pptx download gating | `artifactDownloadFormats` | `lib/lms-generation/artifact-download.ts:57-65` | **UNVERIFIED - confirm first** |

**Do not write a second frame sampler, a second vision-extraction action, a
second deck generator, or a second run-log shape.** Every one of those exists.

---

## 3. Acceptance criteria

**AC1 - Entry points, and the destination owns its context.**
Reachable from (a) the Recording tab as its own inner view, and (b) a Modules
bulk-bar action on a module selection, which pre-fills the module but does NOT
discharge the context obligation. Per `DEV_LOOP.md`, *"the obligation belongs
to the DESTINATION, never to a launcher"*: the panel itself always offers the
context box, whichever route reached it.

**AC2 - Context goes in BEFORE the capture.** A free-text context box reachable
**before** the record button, optional, persisted under a `ta-`-prefixed key
added to the ordinal canary in the same commit, and it must **actually reach
the extraction and/or deck prompt** - the AC names where. Precedent to copy:
`videoContext`.

**AC3 - The template is chosen before recording, and it fixes the deck's
shape.** Reuse the existing template picker. The template's expansion fixes the
slide count and the generator's prompt demands exactly N slides; the model
distributes captured material into that structure. **No other segmentation
mechanism is built.**

**AC4 - Frames must be legible or the run is worthless.** Use
`resolveTargetWidth` and respect `FRAME_MIN_SCALE`. **The 640px
`extractVideoFrames` path is explicitly rejected**: a 4K source arriving at
4.8px was the R1 crisis in the grading AC, and 640px from a 1920+ source is
below the floor that crisis established. The panel offers the existing
legibility probe before a long capture, and says plainly that a failed probe
means the deck will be built from unreadable frames.

**AC5 - Cost is stated to the user before the run, not discovered after.**
Section 5's numbers are shown in the panel: an estimate of frames and model
calls for the elapsed/expected duration, updating live during capture. An
instructor must never learn the cost of a 20-minute walkthrough by paying it.

**AC6 - Backpressure is honest.** `useDiscussionCapture` already caps pending
frames at `MAX_PENDING_FRAMES=16` and drops beyond it. Dropped frames are
**counted and surfaced**, both live and in the run log. REGRESSION 379 defect 4
is exactly this failure going unreported. A deck built from a run that dropped
40% of its frames must say so.

**AC7 - The deck generation reuses the shipping path.** Extracted material
becomes `DeckGenContext.materials`; the deck is produced by
`generateDeckFromTemplateAction` and lands in the same artifact record with the
same `.pptx` download the "Lecture deck" bulk action already produces. No new
export path.

**AC8 - Every failure carries its real reason.** Capture denied, display audio
refused, a batch rejected for wire budget, a vision call failing, the deck
generation failing - each surfaces its own reason, never a generic state. This
repo's most-caught defect class is distinct failures collapsing into one
indistinguishable message.

**AC9 - Downloadable run log, and it is a step-1 obligation.** This feature has
a run, so it has a log. It must answer, in the instructor's words: *"why did my
deck only cover half the module"*, *"why is slide 4 nonsense"*. So it records
what the code THREW AWAY, not just what it kept: frames sampled, frames kept,
frames **dropped to backpressure**, batches sent, batches rejected and why,
per-batch extraction outcomes, the settings in force, and the exact material
handed to the deck generator. Header block with feature, start/end, settings,
capture resolution. Follow the 5-function pure shape at
`grading-recording-log.ts`; **no clock reads inside** - timestamps are passed
in as data so tests can pin exact output. Download control on this panel,
labelled with real text stating what it holds.

**AC10 - States.** Idle, probing, capturing, extracting (with progress),
generating, done, and each failure. A capture that produced no legible material
must say that rather than generating a deck from nothing.

**AC11 - Attended only.** No workflow step. `headless.test.ts` forces every
registry type into exactly one bucket, and a live `MediaStream` is the
attended-only case one degree stronger than `extract-pptx-slides`. Do not add a
`"record"` `requireInput` kind.

**AC12 - Repo invariants.** No emojis. No new dependency. Every new control
persists under a `ta-` key with both a read and a write, added to the canary in
the same commit. 1000-line ceiling, and `recording/` has **no headroom** (five
files at 841-978) - **this feature lives in a NEW directory**, exactly as
`grading-recording/` did.

**AC13 - Nothing crosses a Server Action that cannot fit.** 3.5MB wire budget
under Vercel's 4.5MB cap; frame batches separately capped at 3.0MB. A recording
blob never crosses a Server Action. Prod is Vercel Hobby with a **hard 60s
ceiling** regardless of any `maxDuration` a route requests, so long work is
chunked client-side - which the live-capture path already does.

---

## 4. Explicitly NOT in scope

- Narration, transcription, audio-derived segmentation, live slide markers.
- Replacing or changing the existing "Lecture deck" bulk action.
- A workflow step (AC11).
- Any change to `lib/decks/generate.ts`'s prompt beyond passing `materials`.

---

## 5. The costs of the chosen design, stated plainly

Derived from constants in the tree, not estimated:

- `FRAME_MIN_KEEP_INTERVAL_MS = 1200` gives a ceiling of ~50 kept frames per
  minute: **~1000 frames for a 20-minute walkthrough**, or ~100 if the
  instructor pauses on each page.
- Batches of `GRADING_EXTRACT_BATCH_SIZE = 6` give **~167 vision calls** worst
  case, ~17 best case.
- **Backpressure will bite.** The queue drains at 6 frames per round trip
  against a 0.83/s keep rate, so break-even is a **7.2s round trip**. A 6-image
  call plausibly exceeds that, so a continuously-scrolling walkthrough WILL
  drop frames. AC6 exists because of this.
- `packFrameBatch` will often send fewer than 6 images, because a text-heavy
  1920px JPEG is large against the 3.0MB batch budget.
- **Token cost: UNMEASURED.** No measurement exists anywhere in this repo. Do
  not invent one; measure it or say it is unmeasured.

The cheaper alternative (24 keyframes, one call) is rejected by AC4 on
legibility grounds. **These two facts together - the legible path costs ~167
calls, and the 1-call path cannot read a module page - are the central cost
finding of this feature, and they are the reason the owner was advised to
ground the deck on module text instead.** The owner chose this path knowingly.

---

## 6. Architect amendments (folded back before any code)

A fresh architect read this document against the source and returned the design,
the file split, and twelve things this AC failed to say. Each is folded in
below. **These override section 3 where they conflict.**

**AM-A. The `.pptx` gate is on the PARSED RESULT, not the kind.** VERIFIED:
`artifactDownloadFormats` (`lib/lms-generation/artifact-download.ts:57`) always
returns `["md","docx"]` and pushes `"pptx"` **only when
`parseDeckSlidesFromStructured(artifact.structured).length > 0`**. So AC7 is
satisfiable exactly one way: save through `saveGeneratedArtifactVersion` with
`structured: decksKindConfig.renderStructured(deck)`. Save it as a Files-tab
blob or with `structured: null` and the PowerPoint button vanishes with every
gate green. `buildSlidesPptx` (`lib/pptx.ts:199`) is reusable as-is and
client-safe (dynamic `pptxgenjs` import).

**AM-B. `DeckGenContext.materials` is genuinely uncapped.** `buildDeckPrompt`
interpolates `${ctx.materials}` with no slice or guard; `MATERIALS_CAP = 20000`
is applied INSIDE `gatherSelectionMaterials`, which this path does not call. So
this feature owns the only cap on the path. **`WALKTHROUGH_MATERIALS_CAP =
60000` characters** - 20000 is wrong here because it was sized for a
multi-item selection sharing one budget, whereas this is one module at full
fidelity, which is the whole point of the owner's decision 1. **This number is
UNMEASURED and is a reasoned bound, not an observed one.** The run log records
characters before and after every run, which is what turns it into a measured
number after the first real walkthrough.

**AM-C. THE SLIDE COUNT IS FIXED BY THE TEMPLATE, NOT BY THE CAPTURE.** With
every shipped preset, `buildDeckGenContext` gives runtime loop groups an empty
item list and `expandTemplate` emits the loop block once - so **a 20-minute
walkthrough of a large module yields a 7-slide deck** (Classic Lecture: 7
content slides plus a title). This follows correctly from the owner's decision
2, and an instructor will not expect it. **The panel MUST show the resolved
slide count next to the template picker, before the capture starts**, computed
client-side with `expandTemplate`.

**AM-D. Strike display audio from AC8, and strike row 1 of the reuse table.**
`useDiscussionCapture` calls `getDisplayMedia({video:{frameRate:{ideal:5}},
audio:false})` directly - it does NOT use `requestScreenShareStream`, and there
is no display-audio grant on this path at all. `classifyDisplayAudioGrant`
belongs to `useRecorder`'s screen branch and is unreachable here. AC8's
"display audio refused" requirement was unbuildable as written.

**AM-E. "Walkthrough" is taken.** `recording/useWalkthrough.ts` and
`WalkthroughPanel.tsx` are an unrelated shipped feature and `ta-rec-walk-*` are
live keys. Directory: **`src/app/components/module-deck-capture/`**. Key
prefix: **`ta-rec-mod-`**. That directory needs **its own ordinal canary** -
`recording-split.structure.test.ts` scans only `recording/` plus
`RecordingTab.tsx`, so a new prefix outside it is invisible to that test.

**AM-F. `frames sampled` is NOT obtainable - AC9 asked for the impossible.**
`useDiscussionCapture` exposes no tick count, and reaching it means editing a
hook with six consumers. **Drop the field**, and have the log's header say
`Frames sampled: not recorded (the capture hook does not expose the tick
count)`. Frames KEPT and frames DROPPED are both available and are the two
numbers the instructor's questions actually turn on. Reporting a derived guess
as a measurement is precisely what AC8 and AC9 exist to prevent.

**AM-G. `droppedFrames` resets on every `start()` - and the SHIPPED grading
panel under-reports because of it.** `useDiscussionCapture.start()` zeroes its
own counter, and `GradingRecordingPanel.tsx:464` reads the live value at
download time, so a session with two Start/Stop cycles loses every frame
dropped in the first. This panel must own a monotone session accumulator as a
pure, tested function. **The defect in the grading panel is real, pre-existing,
and out of scope here - record it as a follow-up rather than fixing it in this
feature's commit.**

**AM-H. De-duplication is a SEAM OVERLAP-JOIN, never a global set.** Three
layers: the prompt's own overlap rule (free, kills most of it), a
suffix/prefix join across consecutive batches taking the LARGEST match
(`OVERLAP_WINDOW = 12`), then a seam-only longer-text-wins merge for a
paragraph read half in one batch and fully in the next. Reuse
`normalizeForMatch` (`discussion-capture.ts:218`) for comparison only, never
for output.
**A global `Set<normalizedText>` is REJECTED and is the trap here**: a module
legitimately repeats short lines - "Learning objective", "Read the following",
"Due Sunday", a repeated table value - and a global set silently deletes the
second and third REAL occurrences with no record, surfacing only as a deck
missing a section. Do not reuse `isSamePost`/`postSimilarityDistance` either:
they are author-anchored and run a token-Levenshtein per pair over thousands of
blocks.

**AM-I. Extraction runs DURING capture, not after.** Deferring means holding
~1000 frames of base64 in memory then firing ~167 sequential calls in one
burst. Extracting during capture is what makes this fit prod at all: each
Server Action is one short call, the queue drains as it fills, and nothing
approaches the 60s ceiling. It is also what makes AC5's live cost display
possible - a count that only exists after the run is not a warning.

**AM-J. One deck call, and a new Route Handler.** `POST
/api/lms-generation/deck-from-capture`, a sibling of the existing deck route
with `gatherSelectionMaterials` replaced by a `materialsText` body field.
Widening the existing route is rejected: its contract is "a selection becomes
materials", it refuses on an empty selection, and it is shared by three other
features. `saveGeneratedArtifactVersion` must stay the LAST statement of the
success path so a platform kill fails clean rather than saving a truncated
deck, and the client must treat a non-JSON response as a clean error (a
timeout returns HTML and `JSON.parse` would throw).

**AM-K. AC5's "cost" means FRAMES AND MODEL CALLS, never tokens or currency.**
Section 5 records token cost as UNMEASURED, so the panel must never display a
token count or a dollar figure. Live line:
`"N frames kept, M model calls so far. At this rate a 20-minute capture costs
about K calls."`

**AM-L. Smaller gaps, all folded in:** the context box needs a character cap
(2000) with a visible counter, since it rides in every extraction call and in
the deck prompt; the bulk-bar prefill needs a new field on the launch event's
`detail` and is ADVISORY only - the panel's own controls stay authoritative;
nothing about a capture survives a reload and the panel must say so before the
capture starts; the legibility probe runs its OWN capture session so it needs a
separate grant and must be disabled while capturing; capture resolution is a
per-frame fact, so the log reports it GROUPED via the existing
`summarizeFrameEncodeParameters` rather than presenting one frame's value as
the session's; and the deck is not previewable from the Recording tab
(`GeneratedPreviewModal` lives at ModulesView's root), so the panel must state
plainly where the deck was saved and offer the `.pptx` download in place.
---

## 7. Data-engineer corrections (MEASURED - these override sections 5 and 6)

Measured on this machine 2026-09-01 with the repo's own `@napi-rs/canvas`,
deliberately the same method `docs/discussion-reply-capture-acceptance-criteria.md:278`
used so the numbers are comparable. **Calibration: the renderer reproduces that
AC's own real-page figures to within 1%.** Where this section disagrees with
section 5 or with the architect's amendments, THIS SECTION WINS - it is
measured and they were derived.

**DE1. The keep interval is 1500ms, not 1200ms, and section 5's frame counts
are 25% too high.** `startFrameTicker` is a plain 500ms `setInterval`
(`frame-ticker.ts:12,14`), so a keep can only happen ON a tick. After a keep at
T, the ticks at T+500 and T+1000 both fail the 1200ms gate; T+1500 is the first
that passes. **Real ceiling: 40 kept frames/minute, and 801 frames for 20
minutes - not ~1000.**

**DE2. Break-even is 9.0s, not 7.2s.** Same root cause. It is 6.0s for a tall
(1920x2400) window, where the byte budget cuts the batch to 4.

**DE3. "~17 calls best case" was wrong by 6x.** In the pause-on-each-page
behaviour the queue never accumulates, so `packFrameBatch` sends **1.0 frames
per call on average** - 101 frames cost **101 calls**, not 17, and the ~4,900
character prompt is re-sent for every one. Batch size 6 is only reached in the
narrow band where round trip is 8-12s. **Call count is governed by drain rate,
not by the batch constant.** Measured 20-minute continuous scroll: 301 calls at
a 4s round trip, 151 at 8s, 103 at 12s (24% dropped), 63 at 20s (54% dropped).

**DE4. Section 5's "token cost is UNMEASURED, no measurement exists anywhere in
this repo" is FALSE in three ways.** A live token readout exists and is shown to
the user (`github-models.ts:16-22` -> `CopilotChatPanel.tsx:114`), on the GitHub
Models path. A per-image rule is documented and dated: **a Gemini 3.x image
costs a flat 1,120 tokens regardless of resolution**
(`discussion-reply-capture-acceptance-criteria.md:507`, checked 2026-08-31).
Prices are written down (`gemini.ts:29`, input $0.125-$0.25/M).

**What IS genuinely unmeasured:** per-call token consumption on the **Gemini**
path - `usageMetadata` has ZERO occurrences repo-wide and is discarded from
every 200 response - and **per-call latency**, which no timer wraps.

**DE5. Derived input cost, from the repo's own documented rule.** The prompt is
~4,900 chars (~1,225 tokens), re-sent per call. Per call:
`1,225 + 1,120 x images`. **A 20-minute continuous walkthrough at an 8s round
trip is ~1.06M input tokens: $0.13-$0.26 of input.** Output is unmeasured;
*if* each call returned 1,500 output tokens the run would total roughly
**$0.47-$0.60** - that figure is an ASSUMPTION, labelled as one, and must not
be shown to the user as a measurement.

**DE6. AC5 has a prerequisite.** AC5 requires cost shown BEFORE the run. It
cannot be shown honestly until per-call tokens and latency are actually read.
**One change in one file closes both:** add `usageMetadata` to the Gemini
response type (`llm.ts:422-431`) and a `Date.now()` delta around the fetch,
surfacing them on `LlmResult` (`llm.ts:164-166`). Gemini returns
`usageMetadata` on every 200 already - nothing extra is requested and the
measurement costs zero. **This is a prerequisite, not a follow-up.**

**DE7. A THIRD loss channel, which sections 5 and 6 both missed.** Content that
scrolls past BETWEEN kept frames is never photographed by anything - it does
not arrive late, is not dropped, and leaves no trace in `droppedFrames`.
**Maximum safe scroll speed = content viewport height / 1.5s = 683 px/s at
1080p.** A normal skim is 500-800 px/s, so an ordinary skim sits at the edge and
the top of that range **silently loses 15% of the module**. This needs its own
treatment: surface the scroll rate live, or state the speed limit in the panel.
It is not AC6's backpressure and must not be reported as it.

**DE8. Bytes: a 4K page produces the SMALLEST frames measured.** Both 1920 and
3840 sources encode to 1920x1080 (`resolveTargetWidth`), and a 4K fixed-column
LMS page comes to **181KB wire/frame - 33% smaller** than the same page at
1080p (272KB), because the 2:1 downscale low-passes detail and the extra area is
whitespace. **Bytes are not the 4K problem; legibility is** - a 14.5px glyph
arrives at 7.25px. This strengthens AC4 and removes any byte-based argument for
a different target width.

**DE9. For the common case `packFrameBatch` sends the full 6.** A text-heavy
1920x1080 module page is 1.60MB of a 3.0MB budget. The byte cap binds only for a
tall window (>=2200px content height -> 4 or fewer), a fluid full-width doc on a
4K panel (5), or a window over ~2800px (3). **The far more common reason fewer
than 6 are sent is an empty queue, not bytes.**

**DE10. A latent outage in a SHIPPED feature's documented numbers.**
`discussion-reply-capture-acceptance-criteria.md:485-494` reports its frame
sizes as wire bytes; they are **file bytes**. The wire figures are 4/3 larger,
so its "1920x3000 x6 = 3.48MB against the 3.5MB budget" is really **4.55MB** -
over the batch budget, over the wire budget, and over Vercel's 4.5MB platform
cap. Its conclusion was right and is more urgent than stated. **Do not copy
those numbers into this feature.** Recorded as a follow-up against that AC.

**DE11. Frame change detection contributes essentially NOTHING at the text
level.** Measured: a **one-line scroll scores 12.02** against
`FRAME_CHANGE_THRESHOLD = 6` - double the threshold - while repeating **98% of
the text**. The diff is flat at 11-13 across scrolls from 1 to 42 lines, because
at a 32x32 signature any vertical text misalignment decorrelates nearly every
cell. **It is a static-screen detector, not a redundancy filter.** Text-level
dedupe is entirely unbuilt.

**DE12. CHROME SUPPRESSION FIRST - it is the single biggest win and it is
free.** Nav rail plus breadcrumb measured at **182 chars in EVERY frame**; over
801 frames that is **146,000 characters of pure noise - 7x the entire
`MATERIALS_CAP`** on its own. Any normalized line appearing in more than ~60% of
frames is page furniture. **Nothing in the repo does this today.** Do it before
any similarity work.

**DE13. NEVER similarity-match a short heading.** Measured against the existing
0.25 token-Levenshtein rule, **6 of 8 distinct module headings collapse**:
"Week 4: Abstraction and Representation" vs "**Week 5**: ..." merges at 0.200;
"Lab 2 ... Part 1" vs "Part 2" at 0.167; "Quiz 1 opens Monday" vs "Quiz 2" at
0.143. The failure is structural - the threshold is a FRACTION of token count,
so one differing token in a 5-token heading scores 0.20 and passes, while the
same difference in a 40-token paragraph scores 0.025. The rule's behaviour
flips at exactly 4 tokens (`MIN_TOKENS_FOR_SIMILARITY`), and most module
headings are 4-8 tokens - the danger zone.
**Symptom: a module with "Week 4" and "Week 5" pages produces a deck covering
one of them, with no error and every gate green.**
Headings are **exact-normalized only**, and additionally act as SEGMENT
BOUNDARIES that block cross-page merging. The prompt's verbatim-heading clause
is the model-side half of this rule; both halves are needed.

**DE14. The cap is 120,000 characters, not 60,000 and not 20,000.**
`DECK_MATERIALS_CAP = 120_000`, its own constant in the new directory. Grounded:
~30K tokens, under 3% of the 1,048,576-token window, leaving room for the deck
prompt and its 12,288 `maxOutputTokens`; and the repo already set a directly
comparable precedent at **400,000 characters** for a single graded submission
(`gemini.ts:59`) explicitly because the previous 12,000 *"silently discarded up
to ~95%"* of its input. Measured raw output is **2.0M characters for a
20-minute scroll** (range 1.2M-4.2M); deduped is a BOUNDED ESTIMATE of
50K-150K, labelled as a bound because unique content is a property of the
module, not of any constant.

**DE15. `materials` is uncapped AND crosses a Server Action - an AC13 violation
waiting to happen.** `generateDeckFromTemplateAction` performs no
`checkWireBudget` and no size check of any kind. An uncapped 2.0M-character
string is a 2MB request body; a fluid-4K 20-minute run at 4.2M chars **exceeds
Vercel's 4.5MB platform cap outright**, so the platform rejects it before the
action runs and the action's own error handling never executes - the exact
opaque failure `upload-budget.ts:1-11` exists to prevent. **Cap client-side and
`checkWireBudget` before dispatch.**

**DE16. Never tail-truncate.** `gatherSelectionMaterials` uses
`joined.slice(0, MATERIALS_CAP)` - head-keep, tail-drop - which for a
walkthrough means silently discarding the END of the module: verbatim the
complaint AC9 exists to answer. Drop in this order instead, and **record every
stage's counts in the run log**: (1) repeated chrome, lossless; (2) exact and
near-duplicate blocks, lossless; (3) non-content control text; (4) only then
**proportional downsampling across the whole run**, keeping the first N
characters of every heading-anchored block so every part of the module survives
at reduced depth and no part vanishes.

**DE17. The `ta-` key warning in DEV_LOOP is stale by 6x.** Measured: **234
distinct static `ta-` keys** plus ~11 dynamic families, not "40-plus". Also: the
ordinal canary is NOT repo-wide - `recording-split.structure.test.ts` harvests
only `recording/*` plus `RecordingTab.tsx`, which is why `grading-recording/`
carries its own. **The new directory gets neither for free and must ship its own
ordinal canary in the same commit** - ordinal, not set equality.

**DE18. A closed tab loses everything, silently, including a billed call.**
There is **no `beforeunload` handler anywhere** in `recording/` or
`grading-recording/`, no resume path, no restore flow. On close: the stream
dies, the queue goes, **all extracted text goes** (it lives in a ref), the
in-flight vision call still completes and is billed server-side, and nothing
tells the instructor. Given a 20-minute run is up to ~$0.60 and 20 minutes of
their time, **a `beforeunload` guard while `capturing || pendingFrames > 0` is
the cheap correct answer** and is a genuinely new obligation this feature has.
Do NOT build half-persistence: the grading feature persists its rows but not its
accumulator, and its next session positionally overwrites restored rows from
index 0. Persist settings only, or add the guard - not a partial middle.

**DE19. Storage failure gets the TWO-TIER shape.** Copy
`useGradingRows.ts:189-203` (retry with a reduced payload, two distinct
messages), not `useReplyRows.ts:379-388` (throws, saves nothing). AC8 requires
distinct failures to stay distinguishable.

**DE20. The grading prompt's name rule, applied to module content, instructs
the model to return NOTHING.** *"If you cannot actually SEE a name ... SKIP THAT
SUBMISSION ENTIRELY"* - module body text has no student name, so a parameterised
reuse yields an empty deck with no error. Three further clauses invert: the
grading prompt tells the model to IGNORE rubrics, assignment panels and
instructions, which on a module page ARE the content; and
`MAX_SUBMISSION_CHARS = 4000` would silently dock the tail of every long page.
**Use `MAX_BLOCK_CHARS = 12000`.** The full replacement prompt text is in the
data-engineer report and must be pinned in this AC before implementation.

**DE21. Restate student privacy explicitly.** The grading prompt's name rule
accidentally provided it; deleting that rule removes it. A walkthrough can pass
over a gradebook or a discussion thread in transit, so the new prompt must
carry an explicit clause: return no student work, no student name, no grade, no
instructor comment on student work. Compare commit `fef3dbb`, "stop leaking
student names".