# Announcements from a recording: recon and scope

Status: SCOPE, authored by a `loop-seat` (Sonnet) on 2026-10-04. Not yet checked.
Owner priority being served (verbatim): "getting the llm like grader and
announcements from recording off the ground and fully functional." This
document covers the ANNOUNCEMENTS-FROM-RECORDING half only. The sibling agent
scoping the LLM grader owns `grade-engine`, `grading-results` and rubric code;
nothing here touches them.

How to read the evidence tags used below:

- `[MEASURED <cmd>]` a command was run in this checkout and its output is quoted.
- `[READ file:line]` I opened that file at that line and read the claim off it.
  Nothing in this repo renders a component, so every UI claim is a READ claim.
- `[ARITHMETIC]` computed from constants I read; the runtime was not observed.
- `[UNDETERMINED]` I could not establish it here and say so.

What I could not do, stated once: run the app, call Gemini, post to Canvas,
record audio, or observe why the path has not "gotten off the ground" for the
owner. `docs/loop/this-repo.md` section 6 lists these as unverifiable here; I
have not filled any of them in.

---

## 0. Triage: which question was asked

"Announcements from recording" maps to TWO routes in the tree, and only one of
them involves a recording:

| Route | Entry | Input | Drafter | Recording involved? |
|---|---|---|---|---|
| TAKE route (this scope) | Recording tab > "Record announcement" tab, or "Draft announcement" on a take / library file | a recorded take's audio, transcribed in chunks | `draftAnnouncementAction` | YES - mic or screen capture, in-app |
| WALKTHROUGH route (adjacent, NOT in this scope) | Recording tab > "Announcement from a walkthrough" | frames read off a shared screen, then discarded | `draftWalkthroughAnnouncementAction` | NO - `docs/backlog.yml` A18 records that it reads frames and records nothing |

I treat the TAKE route as "announcements from recording". The walkthrough route
is used below only as a donor of reusable leaves and as the comparison that
shows what the take route lacks. Whether the walkthrough route is in scope is
fork F5 (section 8); I have acted on "no".

Seats triaged (trigger that fired, per `docs/loop/seats.md` triage table):
acceptance criteria (always), architect + reuse (new module and more than two
files touched), UX (user-visible change), security (model-authored and
transcript text reaches a prompt and Canvas HTML; a possible new server
action), reliability (a chunked, retried, multi-call pipeline), accessibility
(markup changes in waves W2/W3), external-facts research (Gemini audio
acceptance, Canvas `delayed_post_at`), baseline (PARTIAL coverage - section
10). Data/storage runs only if fork F2/R5 adds a persisted shape; W1-W3 add none
(`savedDraftId` is held in component state).

---

## 1. Current state, end to end

Every row is `[READ]` unless tagged. This is the path as it exists at HEAD.

### 1.1 Capture

| Step | What happens | Cite |
|---|---|---|
| Entry controls | Strip entry "Record announcement" (key `announcement`) shares the Record tabpanel; per-take button "Draft announcement" in `TakesPanel`, and on the latest take in `StagePanel`; "Draft announcement" for a library file | `RecordingTab.tsx:596`, `:635-647`, `recording/TakesPanel.tsx:253`, `recording/StagePanel.tsx:456`, `RecordingTab.tsx:794-805` |
| Recording | `MediaRecorder` on the composited stream; on stop builds the `Take` and calls `addRecordedTake(newTake, blob)` | `recording/useRecorder.ts:681-740` |
| Audio sidecar | A second `MediaRecorder` on the mixed audio track rotates every 60 s; the segments become `Take.audioSegments` | `recording/audio-sidecar.ts:28,96`; `useRecorder.ts:659,711-738`; type at `recording/types.ts:23` |
| Persisted copy | The VIDEO blob is saved to the `recordings` bucket and a `recording_files` row; `audioSegments` is never persisted | `recording/useTakes.ts:150-163`, `lib/recording-files.ts:68-118`, `recording/types.ts:14-22` |
| "Upload" | NO file input exists on the take route. The only way to announce from a file made elsewhere is two hops: Files tab upload (`FilesTab.tsx:545-573` -> `saveRecordingFile`) then the Recording tab's "Library recording" picker | `RecordingTab.tsx:751-809`. `grep -n 'type="file"' src/app/components/recording/*.tsx` [MEASURED] returns only `SourceDevicesPanel.tsx` (background image) and `SpeedPanel.tsx` (speed re-encode) |

### 1.2 Transcription

| Step | What happens | Cite |
|---|---|---|
| Path choice | cached transcript, else `audioSegments` ("segments"), else real-time fallback | `recording/useTakeAnnouncement.ts:622-637` |
| Segments path | each segment is decoded to 16 kHz mono, WAV-encoded WHOLE, base64'd, wire-checked against `UPLOAD_WIRE_BUDGET_BYTES`, then sent | `recording/takeAnnouncementTranscription.ts:197-208,245-252`; budget `lib/upload-budget.ts:41` |
| Real-time fallback | `extractAudioOnly` plays the file at 1x; refused above `20 * 60` s AFTER the instructor has clicked | `takeAnnouncementTranscription.ts:82,100-109,323-406`; `lib/strip-audio.ts:116-127`; `docs/REGRESSION.md:34975-34978` records the cap as known |
| Action | `transcribeLiveAudioAction(base64, {provider})` -> ONE `callLlm` with `inlineData` `audio/wav`; silence normalised to "" | `app/actions/live-class.ts:142-186` (`:170` mime) |
| Hint terms | the action supports `hintTerms` (course vocabulary); the take route does not pass it | `live-class.ts:130-132` vs `takeAnnouncementTranscription.ts:252`; the live-class caller does pass it, `live-class/useLiveTranscription.ts:350` |
| Join + cache | chunks joined; `Take.transcript` and `RecordingTab`'s `transcriptCache` written ONLY on a complete pass | `takeAnnouncementTranscription.ts:291-308`; `RecordingTab.tsx:214-217` |

### 1.3 Draft

| Step | What happens | Cite |
|---|---|---|
| Prompt | `buildTakeAnnouncementInstruction(transcript, {takeName, durationSec, topic, objectives, cardTitle, cardSubtitle}, composition)` composes ONE instruction string; transcript truncated to `TRANSCRIPT_PROMPT_CAP = 8000` chars | `lib/take-announcement.ts:21,193-244` |
| Context | topic/objectives come from the Lecture Script panel, NOT from the course | `RecordingTab.tsx:403-408` |
| Controls | ingredients (insight, resources) + formality, persisted `ta-rec-ann-ingredients`, `ta-rec-ann-formality` | `useTakeAnnouncement.ts:308-320`; `recording/announcement-composition.ts` |
| Action | `draftAnnouncementAction(instruction, getStoredProvider())`: `requireOwner()`, writing-style block, ONE `callLlm`, `maxOutputTokens: 1024`, returns the trimmed model title/message | `useTakeAnnouncement.ts:528`; `app/actions/messaging.ts:405-466` (`:410`, `:443`, `:462`) |
| Timing | drafting auto-starts when the panel opens; the COURSE is chosen only afterwards, in the review view | `useTakeAnnouncement.ts:644-659`; picker `TakeAnnouncementPanel.tsx:407-432` |
| Image | a companion image auto-generates once a draft reaches review; not persisted | `useTakeAnnouncement.ts:605-620`; `recording/announcementImagePipeline.ts` |

### 1.4 Review, post, save

| Step | What happens | Cite |
|---|---|---|
| Review | editable Subject + Message `TextField`s; Regenerate (arm-then-confirm only after an edit) | `TakeAnnouncementPanel.tsx:455-504` |
| Course | picker lists only courses with a `canvasUrl`; choice persisted `ta-rec-ann-course` | `useTakeAnnouncement.ts:401-428,298-301` |
| Post | arm then confirm; signature covers take, course, institution, subject, body; `createAnnouncementAction(courseUrl, subject, body, institution, undefined, image)` | `useTakeAnnouncement.ts:708-737,743-795`; the `undefined` is `delayedPostAt`, at `:767`; action `app/actions/canvas-inbox.ts:284-307` |
| HTML | plain text becomes HTML via `textToHtml`; image appended with alt text | `lib/canvas/announcements.ts:309-313,329-368` |
| After post | success view; `postedByTakeId` blocks a second post | `TakeAnnouncementPanel.tsx:250-274`; `RecordingTab.tsx:170,824-827` |
| Save to drafts | `saveMessageDraftAction("Announcement from <take>", {kind:"announcement", title, body, courseUrl, hubCourseId, institution})`; the returned `{id}` is discarded | `useTakeAnnouncement.ts:797-826` (`:818` call, `:824` `setDraftSaved(true)`); `messaging.ts:218-232`; payload shape `lib/message-drafts.ts:21-33` |
| Drafts surface | Manual > Workflows > Drafts renders `MessageDraftsTab`: Edit (title/body only), Send (Canvas post), Send by email (Outlook BCC, only when `hubCourseId`), Delete | `components/home/WorkflowsPanel.tsx:5,38`; `MessageDraftsTab.tsx:171-175,407-424,415`; `messaging.ts:272-320`; `messaging-outlook.ts:128-197` |
| Run log | downloadable CSV/JSON of transcription path, chunk retries, draft/image/post attempts | `recording/announcement-log.ts:126-318`; mounted `TakeAnnouncementPanel.tsx:243-248,261,299` |

### 1.5 What persists, what does not

| Thing | Where it lives | Survives reload? |
|---|---|---|
| Video | `recordings` bucket + `recording_files` | yes |
| `audioSegments` | memory (`Take`) | no (`types.ts:14-22`) |
| Transcript | `Take.transcript` / `transcriptCache` React state | no (`RecordingTab.tsx:214`) |
| "Already posted" guard | `postedByTakeId` React state | no (`RecordingTab.tsx:170`) |
| Draft subject/body | component state until Save to drafts | no, then a `message_drafts` row |
| Image | component state | no (`useTakeAnnouncement.ts:326-340`) |
| Course choice, composition | localStorage `ta-rec-ann-course`, `-ingredients`, `-formality` | yes |
| Run log | built on demand | no |

Baseline of the area as it stands [MEASURED]: `npm run test:paths --` over 16
take-route files: `Test Files 16 passed (16)`, `Tests 235 passed (235)`. The
wrapper's per-argument lines:

```
COVERED src/lib/take-announcement.test.ts files=1 passed=35
COVERED src/lib/take-transcript.test.ts files=1 passed=13
COVERED src/app/components/recording/useTakeAnnouncement.test.ts files=1 passed=7
COVERED src/app/components/recording/useTakeAnnouncement.image-copy-safety.test.ts files=1 passed=5
COVERED src/app/components/recording/takeAnnouncementTranscription.test.ts files=1 passed=15
COVERED src/app/components/recording/takeAnnouncementArming.test.ts files=1 passed=5
COVERED src/app/components/recording/announcement-composition.test.ts files=1 passed=11
COVERED src/app/components/recording/announcement-log.test.ts files=1 passed=10
COVERED src/app/components/recording/announcementImagePipeline.test.ts files=1 passed=4
COVERED src/app/components/recording/announcementImagePipeline.wiring.test.ts files=1 passed=7
COVERED src/app/components/recording/announcement-image-filename.test.ts files=1 passed=6
COVERED src/app/actions/announcement-image.test.ts files=1 passed=15
COVERED src/app/actions/announcement-image.wiring.test.ts files=1 passed=9
COVERED src/lib/message-drafts.test.ts files=1 passed=21
COVERED src/app/components/message-drafts-helpers.test.ts files=1 passed=18
COVERED src/app/components/recording/recording-split.structure.test.ts files=1 passed=54
```

That the suite is green says nothing about gaps G1-G3 below: it contains no
test for the hook's pipeline (`useTakeAnnouncement.test.ts` has 7 tests, all
`decideRealTimeGuard`, `grep -n "describe(\|  it("` [MEASURED]), none for
`audio-sidecar.ts` (`git ls-files | grep -i sidecar` [MEASURED] returns the
source file only), and none for `draftAnnouncementAction`,
`saveMessageDraftAction`, `postMessageDraftAction` or
`sendMessageDraftByEmailAction` (`git ls-files src | grep -E "actions/messaging"`
[MEASURED] returns three source files and zero test files).

---

## 2. The gap to "fully functional"

Classes: DEFECT (it does the wrong thing), MISSING (the capability does not
exist on this route), DEAD (a capability exists in the tree and no control on
this route reaches it), UNDETERMINED.

### Reachability verdict (the rule that has bitten this repo)

Traced from control to code: the take route itself is NOT dead. The chain
"Record announcement" tab / "Draft announcement" button -> `openAnnouncement`
-> `<TakeAnnouncementPanel>` -> `useTakeAnnouncement` -> transcription -> draft
-> post is wired end to end (`RecordingTab.tsx:727,740,816-831`;
`TakesPanel.tsx:253`; `StagePanel.tsx:456`). I did not find a shipped-but-
unreachable feature INSIDE the route. What is dead is the capability next to
it, listed as G5 and G10. The A29 action `sendBulkCourseMessageAction`
(`app/actions/bulk-course-message.ts:47`) is also dead today (W2 shipped, W3
surface not built; `grep -rln sendBulkCourseMessageAction src` [MEASURED]
returns only the action, its test and a structure test) - it is A29's, and I
do not touch it.

### The gaps

**G1 - DEFECT, MEASURED. Under the "Embedded Deterministic Engine" provider the
draft is the prompt.** `ProviderToggle.tsx:13` exposes `embedded` as a user
choice; `draftAnnouncementAction` returns `scaffoldAnnouncement(instruction)` for
it with no model call (`messaging.ts:417-419`); the take route passes the whole
built prompt as `instruction` (`useTakeAnnouncement.ts:516-528`). Probe
[MEASURED, method in section 11]: for a 628-character instruction built from a
two-sentence transcript, the returned title was "Write a short announcement for
students about this recording" and the body began "Hi all," then contained the
standing instruction, the "This is a transcript of a screen recording titled"
framing, the literal "TRANSCRIPT:" marker, and only then the instructor's two
sentences. The instructor reviews before posting, but the draft they are shown
is wrong by construction. Transcription itself already ignores the provider
(`callLlm` discards its `provider` argument and always calls Gemini,
`lib/llm.ts:375-386`), so "embedded" was never honoured on this route.

**G2 - DEFECT, READ. A blank model result is accepted as a draft.**
`messaging.ts:462` returns `{ title: (parsed.title ?? "").trim(), message: ... }`
with no emptiness check; `useTakeAnnouncement.ts:536-537,552` then sets blank
`subject`/`body` and enters `review`. The auto-image effect skips a blank draft
(`:608`), and Post refuses blank (`:724-731`), so nothing posts - but the
instructor lands on an empty form with no error and no obvious next step. The
sibling drafters check: `walkthrough-announcement.ts:473-477` returns "Generated
announcement is empty. Try again." `docs/screen-recording-and-walkthrough-
acceptance-criteria.md` AC23 explicitly deferred improving
`draftAnnouncementAction` to "a correctly-scoped follow-up with its own AC";
this scope is that follow-up for the take route only.

**G3 - DEFECT, ARITHMETIC. Pausing during a take can make the take
un-transcribable, with no recovery.** `audio-sidecar.ts:110-123`: `pause()`
stops the 60 s rotation ticker and pauses the open segment's recorder;
`resume()` resumes that recorder and starts a FRESH full-period ticker
(`:122`). The open segment keeps its pre-pause audio, so after resume it
accumulates up to 60 s more: a pause `p` seconds into a segment yields a
segment of `p + 60` s. The route then encodes each segment whole
(`takeAnnouncementTranscription.ts:245-247`). The wire budget is
`UPLOAD_WIRE_BUDGET_BYTES = 3.5 * 1024 * 1024` (`upload-budget.ts:41`),
base64 inflation is 4/3 (`live-class/wav.ts:44`), WAV is 16 kHz mono 16-bit =
32,000 B/s (`wav.ts:20,84-106`). [MEASURED `python3 -c "print(3.5*1024*1024*3/4/32000)"`]
= 86.016 s is the longest segment that fits. So any pause landing more than
about 26 s into a 60 s window produces a segment over budget, the chunk fails
`checkWireBudget`, and `Retry from chunk N` / `Start over` re-send the same
bytes. Because `take.audioSegments` is non-empty, `start()` always takes the
segments path (`useTakeAnnouncement.ts:630-634`) and the real-time fallback is
unreachable for that take. A 120 s segment is 3,840,000 B WAV, 5,120,000 B
base64. This is arithmetic from source; the recorder cannot run here
(`[UNDETERMINED]` whether browsers report the segment longer, but nothing in
the code shortens it). `docs/screen-recording-and-walkthrough-acceptance-
criteria.md` AC22a says rotation is "SUSPENDED while the recorder is paused"
and AC22b states "roughly 82 seconds of audio per request"; the code
suspends by RESTARTING the period, and 82 s is `3.5e6` where the repo
constant gives 86.0 s. Neither number rescues a 120 s segment.

**G4 - MISSING. The draft is course-blind, template-blind and link-unguarded.**
(a) Drafting starts before a course exists (`useTakeAnnouncement.ts:644-659`
vs picker at review), and the only context is the Lecture Script panel's
topic/objectives (`RecordingTab.tsx:403-408`); no course name, module or
schedule. (b) The instructor's saved announcement exemplars
(`lib/announcement-exemplars.ts:91,116`) are not offered. (c) No URL guard:
`stripUnpermittedUrls` has exactly two production call sites
(`prompt-announcement-draft.ts:123`, `walkthrough-announcement.ts:496`
[MEASURED `grep -rn "stripUnpermittedUrls(" src ... | grep -v test`]); the take
route, `lms-generation.ts:495`, the weekly drafters and the workflow steps do
not have it. The take prompt's "resources" ingredient asks the model not to
invent a link (`take-announcement.ts:114-116`) but nothing enforces it.
(d) `hintTerms` unused (see 1.2). (e) Output budget is a flat 1024
(`messaging.ts:443`) where the walkthrough drafter computes one from the
outline (`walkthrough-announcement.ts:437-440`).

**G5 - DEAD capability. The take route cannot schedule a post.**
`createAnnouncementAction` already takes `delayedPostAt` as parameter 5
(`canvas-inbox.ts:290`); the hook passes `undefined` (`useTakeAnnouncement.ts:767`).
The walkthrough and prompt routes schedule; the pure resolver is
`walkthrough-announcement/scheduled-visibility.ts:38`. Consequence copy on the
take route says "Canvas has no unpublished state for an announcement"
(`TakeAnnouncementPanel.tsx:597`), which is true of an immediate post and
silent about scheduling; it must change when scheduling lands.

**G6 - DEFECT/MISSING. The "save for later" loop is open.**
(a) Second "Save to drafts" click creates a second row: the button is disabled
only by `busy || posting` (`TakeAnnouncementPanel.tsx:641`) and the hook
discards the `{id}` (`useTakeAnnouncement.ts:818-824`).
(b) Post-then-Drafts duplicates: after a successful post (`:794`) the saved
row stays `pending` and `Send` in Drafts (`MessageDraftsTab.tsx:407-414` ->
`messaging.ts:289-298`) posts a second copy to the same class; and the image is
not in the draft payload (`message-drafts.ts:21-33`) so that copy is text-only.
(c) No handoff: "Saved to drafts." is plain text (`TakeAnnouncementPanel.tsx:644`);
`openMessageDrafts` (`lib/drafts-nav.ts:44`) exists and is used by
`message-replies/MessageThreadRow.tsx:238` for exactly this; the Drafts badge
refreshes on mount (`DraftedGradesInbox.tsx:41-43`), when the Drafts view is
shown (`page.tsx:225-241`) and inside the Drafts tab - `grep -rn
"useDraftedGradesInbox\|refreshBadge" src --include=*.ts --include=*.tsx |
grep -v test` [MEASURED] returns no hit under `components/recording/` - so a
just-saved draft does not move the badge until the instructor opens Drafts.
(d) A draft saved with no course (allowed: `saveDraft` does not require one,
`useTakeAnnouncement.ts:797-826`; AC25e makes this the only path with no
linked course) cannot be posted: `postMessageDraftAction` returns "Invalid or
missing course URL for announcement." (`messaging.ts:290-292`) and the Drafts
editor changes only title and body (`MessageDraftsTab.tsx:171-175`).
(e) A course that is not Canvas-linked can never be chosen (picker filters on
`canvasUrl`, `useTakeAnnouncement.ts:411-418`), so Drafts' "Send by email"
(needs `hubCourseId`, `MessageDraftsTab.tsx:415`) is unreachable from a take.

**G7 - MISSING. Long and uploaded recordings.** A library or uploaded file has
no `audioSegments`, so it goes through real-time playback and is refused above
20 minutes after the click (`takeAnnouncementTranscription.ts:82,100-109`).
There is no upload control on the route (1.1). `docs/REGRESSION.md:34975-34978`
already records the cap and a proposed fix ("Gemini now accepts WebM/Opus
directly"); that external claim is uncited there and I have not verified it
(`[UNDETERMINED]`, residual R4).

**G8 - MISSING. Nothing durable links recording, transcript and announcement.**
Transcript and posted-guard are session state (1.5). Reload, reopen the same
library file, and it re-transcribes (real time) and can be announced twice.

**G9 - TEST GAP.** No instrument today for G1, G2, G3 or G6 (section 1.5
baseline). The hook is covered only by reading and by source-text tests such as
`useTakeAnnouncement.image-copy-safety.test.ts`.

**G10 - DEAD capability.** `hintTerms` (G4d), `describeMessageDraftRecipients`
(`message-drafts-helpers.ts:63-86`, which names course and student count and
refuses to guess 0) is not used by the take route's confirm text
(`TakeAnnouncementPanel.tsx:597` says only "every student in <course>").

**G11 - UNDETERMINED. Why the route is not "off the ground" for the owner.** I
cannot observe it. Ranked candidate failure points, each distinguishable by the
downloadable run log (section 9, O1): (1) transcription HTTP failure (no key,
model or audio-format rejection; log shows `transcriptionPath` and the chunk
error); (2) G3 on any take that was paused; (3) real-time fallback refusal on a
library file over 20 minutes; (4) an empty course picker because no tile has a
`canvasUrl` (`useTakeAnnouncement.ts:411-418`); (5) G2 blank draft; (6)
Canvas refusal at post (log `postAttempts`). I rank by what the code allows, not
by evidence.

---

## 3. Leverage claim (docs/loop/leverage.md)

Class claimed: CAPTURE (already earned) plus GUARANTEED (to be earned by W1b).
Stated plainly where it is thin.

What the instructor does instead today: record in the app, or elsewhere; get a
transcript from another tool; paste it into a chat; prompt for an announcement;
copy the text into Canvas's editor; attach any image by hand. The cost is the
copy-paste relay and, specifically, that nothing checks the chat's output: a
model-invented link or a blank answer reaches Canvas through the instructor's
eyes only.

Mechanisms: CAPTURE is real and earned - the app records the audio in the same
gesture as the video and holds 60 s segments so transcription needs no replay
(`audio-sidecar.ts`; the chat has no microphone). GUARANTEED is to be built:
the drafted text returned to review is passed through the same
`collectPermittedUrls` / `stripUnpermittedUrls` pair the walkthrough and prompt
drafters use, so a link in neither the transcript, the typed context nor the
style sample is removed by code, not by the model's good behaviour.

Earned versus inherited: Canvas posting is INHERITED across the announcement
family: every announcement surface posts through `createAnnouncementAction`
(5 non-test call sites: `lms-generation-writers.ts:64`, `messaging.ts:293`,
`announcements-panel.tsx:266`, `useTakeAnnouncement.ts:762`,
`steps.announcements.ts:532`) or `createAnnouncementFromMarkdown` (2:
`prompt-announcement-post.ts:27`, `walkthrough-announcement.ts:604`)
[MEASURED `grep -rn "createAnnouncementAction(\|createAnnouncementFromMarkdown("
src --include=*.ts --include=*.tsx | grep -v "\.test\." | grep -v "export async
function"`], so I do not claim it.
The Writing-style block is INHERITED (it lives inside the shared drafter). The
URL guard is earned by the take route only because the take route lacks it
today; two siblings built it separately (2 call sites, above), so it is not
platform-free, but it is also not novel to this app.

Honest verdict: thin today beyond CAPTURE. It becomes a real reason to use the
app over a chat only with W4 (the draft is grounded in the course the app can
read and in the instructor's own saved exemplar, neither of which a chat
holds). W1-W3 make the route correct and complete; they do not by themselves
add a differentiator. This is a click-cost-plus-safety claim and should be read
as one.

Removal test: ARC-L1 below (the single assertion that goes red when the claimed
advantage is removed). The "no render" ceiling applies to everything about how
the surface FEELS; the owner decides whether the thin version suffices
(fork F2 and the leverage disposal in `leverage.md` "Disposal").

---

## 4. Proposed acceptance criteria for "fully functional"

An instructor can: (1) record or bring a file, (2) get a transcript, (3) get a
course-addressed draft, (4) review/edit, (5) post now or at a chosen time, or
save and finish later, with no duplicate and no lost work. Each criterion names
its object, instrument and direction of failure. Mechanism is the architect's;
I name the seam only where an instrument needs one. "Machine" means a vitest
assertion over a pure leaf or a source-text test; "Owner" means the owner in a
real browser with a real key.

Pass-condition format: OBJECT under comparison / INSTRUMENT producing each
quantity / FAILS when.

| Id | Requirement | Object / instrument / fails when | Mode |
|---|---|---|---|
| ARC-T1 | No transcription request carries a clip over the wire budget, for any segment length, and no audio is dropped by splitting | OBJECT: the sub-chunk plan for a segment of N decoded samples. INSTRUMENT: a pure leaf `planSegmentSubchunks(sampleCount, sampleRate)`; per-sub-chunk wire size = `base64FromArrayBuffer(encodeWav(slice, 16000)).length` (the production encoders), compared with `UPLOAD_WIRE_BUDGET_BYTES`; coverage = sum of sub-chunk samples vs `sampleCount`. AXES from a different source than the generator: an independent literal list of segment lengths in seconds {0, 1, 60, 86, 87, 119, 600} and expected sub-chunk counts computed by hand from `ceil(samples / (maxSeconds*rate))`. FAILS when any sub-chunk wire length exceeds the budget, or the samples do not sum, or the 0 s case returns a chunk | Machine |
| ARC-T2 | A take paused and resumed mid-window transcribes | OBJECT: a real take paused at about 40 s into a window then recorded 100 s more. INSTRUMENT: the run log JSON, `chunkRetries` empty and `transcriptionPath = "segments"`. FAILS when a "too large" chunk failure appears | Owner |
| ARC-D1 | A blank or whitespace title or message from the drafter never reaches review; the instructor sees a named draft failure with Try again | OBJECT: the return of a pure `finalizeTakeDraft(rawResult, ...)`. INSTRUMENT: unit test over {blank title, blank message, both blank, both present}. FAILS when a blank-field result is `ok` | Machine; the stage transition is READ |
| ARC-D2 | Under every provider value, neither the title nor the body contains `TAKE_ANNOUNCEMENT_INSTRUCTION` or the literal `TRANSCRIPT:` | OBJECT: the drafted text returned for provider in {gemini, other, embedded}. INSTRUMENT: frozen-literal oracle; the pre-fix mutant is `scaffoldAnnouncement(buildTakeAnnouncementInstruction(...))`, whose body I measured to contain both strings (section 11). FAILS when either string is present. How a provider is resolved (coerce versus refuse) is fork-free: the criterion binds the outcome | Machine |
| ARC-D3 | A URL absent from every permitted carrier is removed from the draft; a URL present in the transcript is kept byte-for-byte | OBJECT: `finalizeTakeDraft` output. INSTRUMENT: unit test with a model reply carrying one invented and one transcript URL, via the real `collectPermittedUrls` / `stripUnpermittedUrls`. FAILS when the invented URL survives or the transcript URL is altered | Machine |
| ARC-L1 | REMOVAL TEST for the leverage claim | OBJECT: `finalizeTakeDraft`'s returned message for a reply containing an invented URL. INSTRUMENT: delete the `stripUnpermittedUrls` call inside the leaf; the assertion's observed value changes from "URL absent" to "URL present". PLUS a source-text assertion that `useTakeAnnouncement.ts` `runDraft` calls the leaf (deleting THAT call is what the source-text test catches, following `useTakeAnnouncement.image-copy-safety.test.ts`). FAILS on either deletion | Machine |
| ARC-S1 | Saving to drafts twice for the same take yields one `message_drafts` row, updated in place | OBJECT: the sequence of persistence calls for two saves. INSTRUMENT: a pure state-transition leaf returning `create` then `update(id)`, with the action mocked (`messaging.ts:218,237`). FAILS when two creates occur | Machine |
| ARC-S2 | After a successful post, the row this panel saved is no longer `pending` | OBJECT: the cleanup the leaf returns on post success when a `savedDraftId` exists. INSTRUMENT: unit test; mocked cleanup called exactly once with the id; zero calls when no draft was saved. FAILS when a saved id is left pending | Machine |
| ARC-S3 | "Saved to drafts" offers a way to the Drafts tab and the badge reflects the new draft | OBJECT: `TakeAnnouncementPanel.tsx` and the hook source. INSTRUMENT: source-text test for `openMessageDrafts` import and an onClick binding, and for a `useDraftedGradesInbox` refresh call after a successful save. FAILS when either is absent. Actual navigation and badge value are READ claims | Machine (wiring) + Owner |
| ARC-S4 | A draft saved with no course says so at save time and names what to do | OBJECT: the post-save copy for `courseId === ""`. INSTRUMENT: pure copy leaf, frozen literal. FAILS when the copy is the same as the with-course copy | Machine |
| ARC-P1 | A future "visible at" time becomes the fifth argument of `createAnnouncementAction`; blank or past posts now; malformed refuses and posts nothing | OBJECT: the argument tuple built for the call. INSTRUMENT: pure `buildTakePostCall(state, now)` over a table, reusing `resolveScheduledVisibility` (`scheduled-visibility.ts:38`); `now` injected. FAILS when index 4 is wrong for any row, or a malformed row yields a tuple | Machine |
| ARC-P2 | The post confirm names the course and the roster count, or says "recipients unknown", never a guessed 0 or 1 | OBJECT: the confirm sentence. INSTRUMENT: `describeMessageDraftRecipients` (`message-drafts-helpers.ts:63`) over frozen literals incl. unknown and unrecognised courses. FAILS on a guessed count | Machine |
| ARC-P3 | KEPT: one take cannot be posted twice in a session | OBJECT: `postedByTakeId` behaviour. INSTRUMENT: existing AC25f reading plus ARC-S2 above. FAILS when a second arm is possible after success | Machine (existing) + Owner |
| ARC-C1 | GATED on F1/F2. With a course chosen before drafting, the drafting input contains the course label, and the transcription call carries course vocabulary as `hintTerms` | OBJECT: the instruction string and the `transcribeLiveAudioAction` argument. INSTRUMENT: pure builder tests; action mocked, argument inspected. This asserts what REACHES the model, not what the model does. FAILS when the label or hint is absent | Machine |
| ARC-R1 | GATED on F3. A library recording over the real-time limit is refused BEFORE the "Draft announcement" click is spent, or is transcribed without replay | OBJECT: the picker's copy / the pipeline choice for a file of known duration. INSTRUMENT: `decideRealTimeGuard` (`takeAnnouncementTranscription.ts:100`) applied at pick time; frozen literal for the copy. FAILS when the refusal first appears after the click | Machine for copy; Owner for no-replay |
| ARC-K1 | KEPT: nothing in the 16-file baseline regresses and no `recording/` file exceeds 1000 lines | INSTRUMENT: `npm run test:paths --` over the 16 paths above, every `COVERED` line present; `recording-split.structure.test.ts` "keep all recording/*.ts/*.tsx files under 1000 lines" (`:76-91`). FAILS on any `NOT COVERED` or any ceiling failure | Machine |

Notes the checker should hold me to:

- I deliberately did NOT write a style criterion ("warm", "concise") because no
  instrument here measures prose style; `seats.md` AC checker question 2.
- ARC-D2 binds an outcome, not a mechanism, so the architect may coerce the
  provider or refuse it. That choice is not an owner fork because both satisfy
  the criterion and neither changes what the instructor can do except that a
  refusal blocks the route under "embedded".
- ARC-C1's removal-style strength is weaker than ARC-L1's; it proves input
  composition, not model use. It is not offered as the removal test.

---

## 5. The leverage question, asked of each capability

`docs/loop/leverage.md` classes against what recording-to-announcement INSIDE
this app does that transcribe-and-paste-into-a-chat cannot:

| Capability | Class | Earned or inherited | Chat cannot because | Honest note |
|---|---|---|---|---|
| In-app capture + sidecar segments | CAPTURE | earned (`audio-sidecar.ts`) | no microphone; no 60 s segment hold | Only true for in-app takes. For a LIBRARY or uploaded file the app is WORSE than a chat that accepts a file (real-time replay, 20 min cap, G7) |
| Post to Canvas, image upload | INTEGRATION (outbound) | inherited by every announcement surface | n/a | do not claim |
| Writing-style block | CORPUS | inherited (inside shared `draftAnnouncementAction`; the prompt drafter calls `getWritingStyleBlock` too) | n/a | do not claim |
| Saved exemplar format | CORPUS | earned if W4 reads it back (`announcement-exemplars.ts:116`) | a chat does not hold the instructor's past announcements | not wired on the take route today |
| URL guard | GUARANTEED | earned by W1b | the chat output is prose all the way down | 2 siblings already have it; catching up, not novel |
| Course label + live module materials | INTEGRATION (read) | earned if W4 builds it (reuse `fetchModuleContentForWeeks`, `announcement-module-content.ts:58,109`) | a chat cannot read this instructor's Canvas modules | The strongest differentiator and the most expensive; gated on F1 |
| Roster count on the confirm | click-cost / disclosure | reuse of Drafts helper | a chat does not know the roster | small, real, cheap |
| Weekly cadence | SCALE | not present on the take route | a chat does not hold the schedule | the weekly schedule exists elsewhere (`lib/announcement-schedule.ts`); a recording feeding it is NOT proposed here |

---

## 6. Wave proposal

Principle: pure leaves, then the action/hook caller, then the surface. Each
wave includes the file that CALLS each new export (`seats.md` architect rule).
Waves named W1.. are the plan seat's to confirm; I give write sets so
disjointness is checkable.

Disjointness (computed, `cat a b | sort | uniq -d`, canary
`printf 'a\nb\n' / 'b\nc\n'` returned `b`):

```
W1a cap W1b  (sort|uniq -d):   (empty)
```

| Wave | Delivers | Write set (exact paths) | Caller of each new export | Verification |
|---|---|---|---|---|
| W1a | ARC-T1, G3 fix by splitting oversize segments (not by changing the recorder, which cannot be tested here) | `src/lib/take-transcript.ts`, `src/lib/take-transcript.test.ts`, `src/app/components/recording/takeAnnouncementTranscription.ts`, `src/app/components/recording/takeAnnouncementTranscription.test.ts` | `getChunkMono` / `runTranscriptionLoop` (`takeAnnouncementTranscription.ts:197,220`) call the new planner | Machine for the planner; Owner for ARC-T2 |
| W1b | ARC-D1, D2, D3, L1: `finalizeTakeDraft` leaf | NEW `src/lib/take-announcement-draft.ts`, NEW `src/lib/take-announcement-draft.test.ts`, `src/app/components/recording/useTakeAnnouncement.ts`, NEW `src/app/components/recording/useTakeAnnouncement.draft-finalize.wiring.test.ts` | `runDraft` (`useTakeAnnouncement.ts:513`) | Machine; the failed:draft stage rendering is READ |
| W2 | ARC-S1..S4: drafts loop. FIRST STEP is an extraction (see size note), then the leaf, then wiring | `src/app/components/recording/useTakeAnnouncement.ts` (SEQUENTIAL after W1b - same file), `src/app/components/recording/TakeAnnouncementPanel.tsx`, NEW `src/app/components/recording/takeDraftLifecycle.ts` (+ test), NEW extraction target for save/post (new hook file in `recording/`), a wiring test; `src/app/actions/messaging.ts` ONLY if a cleanup action is chosen over the client-side `deleteMessageDraft` the Drafts tab already uses (`MessageDraftsTab.tsx:132`) | the hook calls the leaf; the panel renders the link | Machine for leaf + wiring; Owner for navigation/badge |
| W3 | ARC-P1, P2: schedule and recipient disclosure | the post section of the hook (or its W2 extraction target), `TakeAnnouncementPanel.tsx`, NEW `takePostCall.ts` (+ test); a new persisted control would add a `ta-rec-ann-*` key and MUST update `recording-split.structure.test.ts:584` (`toHaveLength(3)`) in the same wave | `commitPost` calls the builder | Machine; Owner for real Canvas `delayed_post_at` |
| W4 | ARC-C1: course grounding, exemplar choice, `hintTerms` - GATED on F1 and F2 | depends on F2 (see 8). If F2 = (a): hook, panel, `take-announcement.ts`, `takeAnnouncementTranscription.ts`. If F2 = (b): same plus the A21 files, which belong to a row in `verification` | builders | Machine for composition; Owner for model use |
| W5 | ARC-R1: long and uploaded recordings - GATED on F3; research BEFORE code (R4) | not written until the Gemini audio fact is established | n/a | Owner (needs a key) |

Size and canaries the plan seat must respect:

- `@(Get-Content src/app/components/recording/useTakeAnnouncement.ts).Count` =
  915 [MEASURED PowerShell]; `TakeAnnouncementPanel.tsx` 656; `RecordingTab.tsx`
  909; `takeAnnouncementTranscription.ts` 432; `MessageDraftsTab.tsx` 525;
  `messaging.ts` 522; `WalkthroughAnnouncementPanel.tsx` 991. The `recording/`
  directory is scanned non-recursively at 1000 per file
  (`recording-split.structure.test.ts:76-91`) and repo-wide by
  `src/file-size-ceiling.structure.test.ts:41`. The hook has 85 lines of
  headroom, so W2 must extract before it adds, sized against the feature's own
  additions rather than against the 1000-line wall (the failure message of
  `file-size-ceiling.structure.test.ts:143-144` already points at
  `takeAnnouncementTranscription.ts` as the shipped example of this split).
- `recording-split.structure.test.ts` pins the strip at 10 entries (`:147`), 9
  tabpanel occurrences (`:208`) and `panelTargets.size` 9 (`:238`) - NOT the 12/11/11
  that `this-repo.md` section 3 and `docs/a21-scope.md:185` quote; those are
  stale (measured with `grep -n "toHaveLength\|panelTargets.size"`, and
  `grep -o '\["[a-z]*", "[^"]*"\]' RecordingTab.tsx` returns 10 pairs). I propose
  NO new tab.
- A29 W3's host file is undecided between `CanvasTab.tsx` and
  `MessageDraftsTab.tsx` (`docs/a29-w3-surface-ac.md:8-15,111-145`, untracked,
  written concurrently by a sibling). My waves therefore DO NOT write
  `MessageDraftsTab.tsx`. The course-assignment gap in G6(d) is left as a
  residual (R7) rather than risk that collision.
- `draftAnnouncementAction` has 8 non-test call sites in 5 files
  (`lms-generation.ts:495`; `weekly-announcement-drafting.ts:90,258`;
  `useTakeAnnouncement.ts:528`; `steps.announcements.ts:236,294,425`;
  `steps.weekly-announcements.ts:107`; [MEASURED grep, filtered by hand]).
  `docs/a21-scope.md:778` counted 9 including `announcements-panel.tsx:87`,
  which has since moved to the prompt drafter. THIS SCOPE DOES NOT EDIT
  `draftAnnouncementAction`. Its blank-result weakness (G2) is closed in the
  consumer's leaf instead, so none of the other 7 call sites changes behaviour.
- Server actions touched by this route use `requireOwner()` (an alias of
  `requireUser()`): `draftAnnouncementAction` `messaging.ts:410`,
  `saveMessageDraftAction` `:225`, `postMessageDraftAction` `:276`. Row R2
  (reclassify 411 call sites) owns those lines; W2 must not "fix" them in
  passing.

Not trivially revertible: none of W1-W3 writes a migration or changes a
persisted shape. W4 under F2(b) changes a shared drafter's contract and is the
only wave with a non-trivial revert.

---

## 7. What is machine-verifiable and what is owner-only

No component renders under vitest (`this-repo.md` section 2); `callLlm` and
transcription are mocked, never real `fetch` (`vitest.setup.ts` throws on it).

Machine: ARC-T1, D1-D3, L1, S1, S2, S4, P1, P2, C1, K1; the source-text halves of
S3 and P3; copy leaves.

Owner only (needs a key, a microphone, a Canvas course or a browser): ARC-T2,
the navigation and badge halves of S3, real `delayed_post_at` visibility, whether
the transcript is accurate, whether Gemini accepts a given audio format, the
real-time fallback on a real file, and every focus/keyboard/layout reading.

---

## 8. Open forks for the owner

Each is shaped so that EVERY answer terminates the activity: the scope ships as
it stands with the answer applied and the remainder recorded as residuals with
an owner, instrument and step. The orchestrator should file the recommended
reading as a backlog row (`area: announcement-composition-surfaces`, with
`owns` set to the W1a and W1b write sets) in the same turn it asks, per the
SHAPE 5 control in `AGENTS.md`; W1a and W1b do not depend on any fork and can
start now.

**F1 - Does drafting wait for a course?**
(a) Course first: use the persisted `ta-rec-ann-course` when it is still a
valid Canvas-linked tile, otherwise show the picker before drafting begins (one
extra step the first time only); the draft and the transcription are grounded
in that course. (b) Keep draft-first: the course is used only for posting.
Recommendation: (a). It is the precondition for the only real differentiator
(section 5). Cost if wrong: W4 grounding is wasted work; W1-W3 are unaffected.
Answer (a) -> W4 ships with grounding; (b) -> W4 shrinks to exemplar choice and
`hintTerms` from the Lecture Script panel only.

**F2 - Which drafter does the take route use?**
(a) Keep `draftAnnouncementAction`, add the `finalizeTakeDraft` guard leaf, add
exemplar/course input by composing the instruction string (no shared-code edit).
(b) Move the route to the hardened A21 drafter `draftPromptAnnouncementAction`
(nonce-framed input, URL strip inside the action, deterministic embedded route,
exemplar outlines, markdown poster). Measured costs of (b): the brief cap is
`PROMPT_ANNOUNCEMENT_MAX_CHARS = 4000` (`prompt-announcement-prompt.ts:54`)
against the take route's `TRANSCRIPT_PROMPT_CAP = 8000` (`take-announcement.ts:21`),
so a 40-minute recording's transcript would be silently cut by more than half
or the shared cap raised (both numbers re-measured by grep this pass, as
`seats.md` requires before claiming a collision); the prompt route's poster
`postPromptAnnouncementAction` (`prompt-announcement-post.ts:18`) takes no image,
so the companion image would be dropped unless that A21-owned file changes; and
A21 is in `verification`, not closed. Recommendation: (a) now, revisit (b) after
A21 is owner-verified. Cost if wrong: W1b's URL-strip becomes redundant under (b)
(its blank-draft and provider rules survive); W4 template work moves to the A21
files. I acted on (a) in the wave plan above.

**F3 - Long and uploaded recordings.**
(a) Accept the 20-minute real-time limit and move the refusal to pick time with
honest copy (ARC-R1, no new capability). (b) Also fund a no-replay path
(research Gemini direct-audio acceptance, then build); under (b) the upload
control also becomes worth building. Recommendation: (a) now plus the research
item R4 started in the same turn; (b) only after the fact is established.
Cost if wrong: (a) leaves the route weaker than a chat for long files.
Answer (a) -> W5 is the copy leaf only; (b) -> W5 is gated on R4 and owner-verified.

**F4 - Is an unattended path in scope?** A headless `transcribe-recording`
workflow step so a saved library recording can feed the existing
`draft-announcement` + `save-message-draft` steps (`steps.announcements.ts:214`,
`steps.messaging.ts:235`). It needs server-side transcription of a stored file,
which depends on R4, and adding a headless-safe step bumps the
`headless.test.ts` canary. (a) Out of scope now (recorded as a candidate row).
(b) In scope after F3. Recommendation: (a). Cost if wrong: one extra row and
a delay; nothing built is wasted.

**F5 - Is the walkthrough route part of "announcements from recording"?**
(a) No: it records nothing (A18) and already has schedule, exemplars and URL
guard; leave it. (b) Yes: add a wave bringing its remaining gaps in. Its panel
is 991 of 1000 lines (`@(Get-Content ...).Count`), so any further control there
needs an extraction in the same chunk (A19 row). Recommendation: (a). Cost if
wrong: one more scoped item; no rework here.

Not a fork, an escalation: the owner is the only instrument for "why is it not
working" (G11). One request, owed once, answerable in one action: run one real
take through "Draft announcement", press the run-log download
(`RunLogRow`, `TakeAnnouncementPanel.tsx:243-248`), and send the file or say
which step stopped. That names the failing stage among the six candidates in G11
without waiting for any wave.

---

## 9. Owner-only and escalations

| Id | Needs | Unblocks | Cost of leaving |
|---|---|---|---|
| O1 | one real run + the downloaded run log | G11 diagnosis | the waves fix what I could read, not necessarily what stopped the owner |
| O2 | a Canvas course: post, scheduled post, image | ARC-P1 real behaviour | schedule ships on reading only |
| O3 | a key: one transcription of a real recording | transcript quality, audio format | accuracy unobserved |
| O4 | a real browser: pause/resume take, then draft | ARC-T2 | G3 fix proven by arithmetic only |

---

## 10. Baseline and prior requirements

Baseline coverage in `docs/REGRESSION.md` is PARTIAL, not absent
(`grep -a -n -i "TakeAnnouncement|Record announcement|Draft announcement"`
[MEASURED] hits `:842,:861,:881,:34979,:36477,:36600,:36826,:36891`; the group
entry is `### 2026-08-30 - Screen recording, Loom bubble, walkthrough takes,
announcements from a recording` at `:34878`). Its line addresses are stale: `:36600`
says `useTakeAnnouncement.ts` is 681 lines; it is 915 [MEASURED]. A baseline
DELTA pass should run before W2, writing a disposition table rather than
superseding (the A9 precedent in `seats.md`).

Disposition of the prior criteria this scope inherits
(`docs/screen-recording-and-walkthrough-acceptance-criteria.md`, Group D):

| Prior | Disposition |
|---|---|
| AC21 every take has "Draft announcement" | KEPT, unchanged |
| AC22 flow audio -> transcript -> draft -> review -> post | KEPT |
| AC22a sidecar rotates, suspended on pause | KEPT as intent; its implementation is G3; handed to W1a (split) for the failure it allows |
| AC22b chunking and wire pre-flight | KEPT; extended by ARC-T1 |
| AC23 stage-specific failures | KEPT; AC23's deferred "improve `draftAnnouncementAction`" is HANDED to W1b (consumer-side leaf), receiver: this scope's W1b, obligation: ARC-D1 |
| AC24 transcript cached on the take | KEPT; durable version is residual R5 |
| AC25/25b/25c post two-step, cap, signature | KEPT |
| AC25e Save to drafts, no-course limitation, `delayedPostAt` dropped by `postMessageDraftAction` | KEPT as shipped; the duplicate/handoff defects are G6; the `delayedPostAt` drop for a DRAFT is left (residual R8) |
| AC25f no second post | KEPT as ARC-P3 |
| AC26 reach library recordings | KEPT; limits are G7 |

Nothing in the prior set is withdrawn.

---

## 11. Residual register

Every entry has an owner, an instrument and the step that measures it. An entry
missing any of the three would be a deletion; none is.

| Id | Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R1 | G3 proven by arithmetic, not by a browser | repo owner | run log JSON after a paused take (O4) | W1a owner-verify |
| R2 | Real transcription output and Gemini audio acceptance | repo owner | one real recording + key (O3) | W1a/W4 owner-verify |
| R3 | Real Canvas post, scheduled post, image upload | repo owner | Canvas UI (O2) | W3 owner-verify |
| R4 | External fact: does Gemini accept WebM/Opus inline, size limits | external-facts seat | one API call with a key; read the installed SDK/docs | before W5; `docs/REGRESSION.md:34975-34978` claim is the unverified source |
| R5 | Durable transcript and "announced from this recording" ledger across reload (G8) | orchestrator (files the row); data seat designs | data-engineer pass + a migration, a `message_drafts`/`recording_files` shape decision | after F1-F3; would be its own chunk |
| R6 | Every UI/a11y claim in W2/W3 is a reading claim | accessibility seat | read the markup; no render exists | wave 3 a11y pass |
| R7 | Assign a course to a course-less draft inside Drafts (G6d) | A29 W3 plan owner | `sort|uniq -d` of write sets at dispatch against the A29 host decision (Q-1) | after A29 Q-1 is answered |
| R8 | `postMessageDraftAction` drops `delayedPostAt` for saved drafts (`messaging.ts:293-298`) | orchestrator (row) | a unit test of the post action with a mocked store | not scheduled; AC25e already records it as a stated limit |
| R9 | `createAnnouncementAction` takes a client-supplied `courseUrl` behind `requireUser()` (`canvas-inbox.ts:284-294`); I did not trace `resolveCanvasCredential` per-user scoping | security seat | open `src/lib/canvas-core.ts:204-215` and the credential resolver | wave 2 security pass |
| R10 | Coordination with R2 (`requireOwner` reclassification) on `messaging.ts` | plan seat | `git status --short` and row R2's owns at dispatch | each wave gate |

---

## 12. Measured quantities and the commands that produced them

| Quantity | Value | Command |
|---|---|---|
| Take-route baseline | 16 files, 235 tests, all passed | `npm run test:paths -- <16 paths>` (lines in 1.5) |
| `useTakeAnnouncement.ts` / `TakeAnnouncementPanel.tsx` / `RecordingTab.tsx` / `takeAnnouncementTranscription.ts` / `MessageDraftsTab.tsx` / `messaging.ts` / `WalkthroughAnnouncementPanel.tsx` lines | 915 / 656 / 909 / 432 / 525 / 522 / 991 | PowerShell `@(Get-Content <file>).Count`. Cross-check: `wc -l` gave the same 915, 656 and 432 for the first, second and fourth, and `wc -l` gave 909 for `RecordingTab.tsx`; not cross-checked on the other three |
| Longest segment that fits the wire budget | 86.016 s | `python3 -c "print(3.5*1024*1024*3/4/32000)"` |
| 120 s segment | 3,840,000 B WAV / 5,120,000 B base64 | same script |
| `draftAnnouncementAction` non-test call sites | 8 sites, 5 files | `grep -rn "draftAnnouncementAction" src --include=*.ts --include=*.tsx \| grep -v "\.test\.ts"` then counted by hand |
| `stripUnpermittedUrls` production call sites | 2 | `grep -rn "stripUnpermittedUrls(" src --include=*.ts --include=*.tsx \| grep -v "\.test\.ts" \| grep -v "export function"` |
| Sub-tab strip | 10 entries; canaries 10/9/9 | `grep -o '\["[a-z]*", "[^"]*"\]' src/app/components/RecordingTab.tsx`; `grep -n "toHaveLength\|panelTargets.size" src/app/components/recording/recording-split.structure.test.ts` |
| `ta-rec-ann-*` keys | 3 | test at `recording-split.structure.test.ts:584` |
| Messaging action tests | 0 | `git ls-files src \| grep -E "actions/messaging"` returned 3 source files |
| Sidecar tests | 0 | `git ls-files \| grep -i sidecar` returned `audio-sidecar.ts` only |
| Caps that could collide | 4000 vs 8000 | `grep -n "PROMPT_ANNOUNCEMENT_MAX_CHARS = " src/lib/prompt-announcement-prompt.ts`; `grep -n "TRANSCRIPT_PROMPT_CAP = " src/lib/take-announcement.ts` |

Embedded-provider probe (G1). The repo's vitest config includes only
`src/**/*.test.ts`, so the probe ran from the session scratchpad with a
plain-object config (an `import` of `vitest/config` from outside the repo fails
to resolve). Config: `resolve.alias["@"]` = the repo `src`, `test.include` = the
scratchpad `*.probe.test.ts`, `test.root` = the repo, run as
`npx vitest run --config <scratchpad>/probe.config.mjs`. Test body:

```ts
import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { scaffoldAnnouncement } from "@/lib/embedded/communication";
import { buildTakeAnnouncementInstruction } from "@/lib/take-announcement";
it("probe", () => {
  const instr = buildTakeAnnouncementInstruction(
    "Today we covered loops. Remember the lab is due Friday.",
    { takeName: "Take 1", durationSec: 90 });
  writeFileSync(OUT_PATH, JSON.stringify({ len: instr.length, out: scaffoldAnnouncement(instr) }, null, 1));
});
```

Result: `len` 628; `out.title` = "Write a short announcement for students about this
recording"; `out.message` began "Hi all," followed by the standing instruction text.
The probe file lives only in the scratchpad; nothing was added to the repo tree
other than this document. `git status --short` at the end of the pass shows only
this file as new from me (`docs/a29-w3-surface-ac.md` and
`docs/loop-retro-roles-acceptance-criteria.md` are siblings' untracked files).

Things I did not verify and that a checker should not assume I did: that the
sidecar segments are longer than 86 s in a real browser (R1); that
`transcribeLiveAudioAction`'s chunking works end to end with a real key (R2);
any Canvas behaviour (R3); that Gemini accepts WebM/Opus (R4); per-user scoping
of the Canvas credential behind `createAnnouncementAction` (R9).
