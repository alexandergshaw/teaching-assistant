# A20 scope: auto-download the recording on stop

Backlog row: `docs/backlog.yml:396-407` (`id: 'A20'`, `state: 'unscoped'`).
Owner ruling, 2026-09-20 (row `note`, `docs/backlog.yml:406`): **"JUST THE TWO
THAT ALREADY RECORD - discussion replies and message replies. GROUP 2 IS OUT
OF SCOPE AND STAYS OUT."** This document treats that as a hard boundary, not a
starting point. It is the first `docs/a20-scope.md` - `ls docs/a20-scope.md`
before this session found nothing, so there is no prior version of this
artifact and no disposition table is owed against one. Section 10 disposes of
the row's own group-2 analysis instead, since that is the only prior scoping
text that exists.

This is a scope/acceptance-criteria document. No code is written here, and no
sabotage described below has been run against real code, because the code
does not exist yet - each sabotage is a specified recipe for the test seat and
implementer to execute once it does. Where I *could* run something read-only
against the tree as it stands today (the two structure tests this row's
change must keep green), I ran it and say so with the command and output.

---

## 1. Leverage claim

Per `docs/loop/leverage.md`, a capability change owes one paragraph naming a
mechanism class, or an explicit statement that none applies. Checked against
the six-class taxonomy: auto-download is not CORPUS (no later act reads
anything back), not CAPTURE (the capture pipeline already exists and is
untouched by this row), not LIVE-LOOP, INTEGRATION, SCALE, or GUARANTEED. It
removes exactly one click - clicking the "Download recording" link that
already renders after a save-video capture stops
(`DiscussionRepliesPanel.tsx:771-775`, `MessageRepliesPanel.tsx:362-366`,
both confirmed open below). That is the taxonomy's **struck class, click
cost**: "real and worth counting... but not a categorical advantage over a
chat... real leverage only when named explicitly as click-cost, never dressed
up as integration or persistence it does not have"
(`docs/loop/leverage.md:64`). Per the worked negative example at
`docs/loop/leverage.md:98-125`, the three legal calls are Redesign / Accept
the cost explicitly / Reject. **This row takes Accept the cost explicitly**:
the advantage is one click saved per capture, nothing more, and no reader
should credit it with persistence or integration it does not have.

Per `docs/loop/leverage.md:172-178` ("Honest limit"), no removal test is
buildable here: the advantage is a click that nothing in this suite can
observe, since no component is rendered by any test in this repo
(`docs/loop/this-repo.md` section 2). Recorded as **Residual R1** (section 9)
rather than an unfalsifiable criterion.

---

## 2. Scope boundary - what this row does and does not touch

**IN SCOPE**, confirmed against HEAD (git commands below):
- Discussion replies capture path: `useDiscussionReplies.ts`,
  `discussion-persisted-controls.ts`, `DiscussionCaptureSettings.tsx`,
  `DiscussionRepliesPanel.tsx`, `useDiscussionCapture.ts`,
  `discussion-capture.ts` (all under `src/app/components/recording/`), plus
  `recording-split.structure.test.ts` (the canary this row's new key must
  keep green) and `discussion-capture.test.ts` (new unit test cases for the
  new pure helper, section 5.3).
- Message replies capture path: `useMessageReplies.ts`,
  `useMessagePersistedControls.ts`, `MessageCaptureSettings.tsx`,
  `MessageRepliesPanel.tsx` (all under `src/app/components/message-replies/`),
  plus `message-replies.structure.test.ts` (same reason).
- `useDiscussionCapture.ts` is **shared** by both surfaces (see 5.1) - it is
  one touch point serving two owners, not a third surface.

**OUT OF SCOPE, AND MUST STAY OUT** - re-measured against HEAD, not copied
from the row:

```
grep -rn "saveVideo" src --include=*.ts --include=*.tsx | grep -v .test
```

confirms all four still pass `saveVideo: false` unconditionally with no
persisted control and no blob:

| Surface | Line (re-measured) | Row said |
|---|---|---|
| `GradingRecordingPanel.tsx` | `:531` `void start({ saveVideo: false });` | `:531` - matches |
| `LegibilityProbeModal.tsx` | `:168` `void start({ saveVideo: false });` | `:168` - matches |
| `ModuleDeckCapturePanel.tsx` | `:455` `await start({ saveVideo: false });` | `:455` - matches |
| `WalkthroughAnnouncementPanel.tsx` | `:515` `await start({ saveVideo: false });` | `:515` - matches |

`ModuleDeckCapturePanel.tsx`'s AC13 point 3 comments, re-opened at HEAD:
- `:30` `//   - AC13/point 3: \`start({ saveVideo: false })\` always - never a blob.`
- `:126` `// AC13/point 3: saveVideo is ALWAYS false below - a recording blob never`

Both present, unchanged, matching the row's citation exactly. **This artifact
proposes no edit to `ModuleDeckCapturePanel.tsx`, `GradingRecordingPanel.tsx`,
`LegibilityProbeModal.tsx`, or `WalkthroughAnnouncementPanel.tsx`.** No
acceptance criterion below widens `saveVideo` on any of them. An implementer
who touches any of these four files has exceeded this row regardless of what
else they built correctly.

---

## 3. Re-measured instrument (every citation opened at HEAD, 2026-09-20)

The row's `instrument` field (`docs/backlog.yml:402`) and the task's own
citations were opened directly rather than trusted. All matched, with one
precision correction noted below.

**Discussion side:**
- `useDiscussionCapture.ts:382` - `const start = useCallback(async (opts: { saveVideo: boolean }) => {` - matches.
- `useDiscussionCapture.ts:465` - `if (opts.saveVideo) {` - matches.
- **Correction to the row's `:466-479` range.** Opened `:466-494` in full. The
  MediaRecorder is constructed at `:468`; `ondataavailable` (chunk
  accumulation) is `:469-471`; `recorder.onstop` (blob construction,
  `URL.createObjectURL`, and the mounted/unmounted branch) is `:472-482`;
  `recorder.start()` is `:483`. The row's claim that this block "constructs a
  Blob, calls URL.createObjectURL, and sets recordingUrl/recordingBytes -
  with an explicit revokeObjectURL when the component has already unmounted"
  is correct in substance; the line range undersells it by one line at the
  end (`:480` is the revoke, inside the `else` at `:479-481`, not `:479`
  itself). Cited precisely above for anyone implementing this.
- `useDiscussionReplies.ts:619` - `await captureRef.current.start({ saveVideo: saveVideoRef.current });` - matches.
- `discussion-persisted-controls.ts:139` - `const [saveVideo, setSaveVideoState] = useState<boolean>(` (declaration opens here; `readLocalStorage("ta-rec-disc-save-video") === "1"` is the initializer on `:140`) - matches.
- `discussion-persisted-controls.ts:198` - `saveVideo,` inside the hook's returned object - matches.

**Message side:**
- `useMessageReplies.ts:592` - `await captureRef.current.start({ saveVideo: saveVideoRef.current });` - matches.
- `MessageCaptureSettings.tsx:117` - `control={<Checkbox size="small" checked={saveVideo} onChange={(e) => setSaveVideo(e.target.checked)} />}` - matches.
- `useMessagePersistedControls.ts:104` - `const [saveVideo, setSaveVideoState] = useState<boolean>(() => readLocalStorage(STORAGE_KEY_SAVE_VIDEO) === "1");` - matches.

**Download precedent, re-checked (this is where the row's picture needed
correcting, not just confirming):**
- `useTakes.ts:106-120` is the whole `handleDownload` function. `:116` is
  specifically `a.download = \`${safeName}.${ext}\`;`. Critically,
  **`:114 a.href = take.url;` reuses an ALREADY-EXISTING object URL** - this
  function never calls `URL.createObjectURL` itself, and never revokes
  afterward (a sibling `handleDelete` owns that revoke elsewhere). The
  extension is computed at `:107-112` by branching on `take.mimeType`,
  video's branch being `ext = take.mimeType.includes("mp4") ? "mp4" : "webm"`.
- `courses-tab-helpers.ts:297-310` (`downloadDocx`) is the opposite shape: it
  is HANDED a base64 payload, mints its OWN `Blob` and `createObjectURL`
  (`:298-302`), clicks, and revokes immediately after (`:309`).
- `announcementImagePipeline.ts:107-126` (`downloadImage`) does **not**
  hand-roll the dance at all - its own comment at `:115-116` says so
  ("never a hand-rolled createObjectURL/anchor/click/revoke dance") and the
  function body at `:121-126` calls a shared helper,
  **`triggerFileDownload(blob, filename)`**, defined at
  `src/app/components/course-planning/utils.ts:19-28`. That helper mints its
  own URL and revokes it after the click - same shape as `downloadDocx`.
  **This is a fourth location the row did not name**, and it is the real
  "canonical" helper the row's prose was gesturing at when it said
  `announcementImagePipeline.ts:116` "documents the ... dance" - `:116` is
  describing why the shared helper exists, not showing an inline dance.

**Which one this row reuses, and why:** `useTakes.ts`'s pattern, not
`triggerFileDownload`. Discussion and message replies already hold a live,
long-lived object URL in `recordingUrl` state by the time a download would
fire - the same situation `useTakes.ts`'s `take.url` is in, not the
base64-in-hand situation `downloadImage`/`downloadDocx` are in.
`triggerFileDownload` would mint a **second** URL over the same blob purely
to immediately revoke it, which is extra ceremony for no benefit and adds a
second URL lifetime to reason about right where trap 2 (section 6) already
requires care. Section 5.2 gives the exact mechanism.

---

## 4. Baseline measurement of the two structure tests this row must keep green

```
npx vitest run src/app/components/recording/recording-split.structure.test.ts src/app/components/message-replies/message-replies.structure.test.ts
```
Output, 2026-09-20: `Test Files  2 passed (2)` / `Tests  62 passed (62)`.

Independently re-derived the two exact counts these tests freeze, with a
Node one-liner over the real files (not by reading the test's own comment):

```
node -e "... combined.match(/(?<![a-zA-Z])ta-[a-z-]*[a-z]/g) over message-replies/*.ts,*.tsx non-test files ..."
-> count 14, the same 14 keys message-replies.structure.test.ts:101 freezes.

node -e "... combined.match(/ta-rec-disc-[a-z-]*/g) over recording/*.ts,*.tsx non-test files ..."
-> count 16, the same 16 keys recording-split.structure.test.ts:515-517 freezes.
```

Both counts are real today, not stale documentation. Both will need to move
by exactly one (section 7, AC2/AC3) the moment a new `ta-rec-*-auto-download`
key is added.

---

## 5. Design decisions

### 5.1 One new persisted control, or ride on "Save video"?

**Decision: a new, separate persisted control per surface** ("Download
automatically when recording stops" - wording taken verbatim from the row's
own note, `docs/backlog.yml:406`), not a repurposing of `saveVideo`.

Argument: `saveVideo` answers "keep the recording at all"; auto-download
answers "in addition, push it to the instructor's downloads folder without
being asked." An instructor who wants to review a recording in-browser via
the existing link, but not have every capture silently land in Downloads, is
a real and distinct preference from one who wants both. Collapsing the two
into one checkbox removes that choice. The new control **defaults to off** -
silently writing a file to disk on every stop is a bigger behavior change
than showing a link, and an opt-in default is the safer one when introducing
a new automatic side effect.

### 5.2 One shared implementation, or two independent ones?

**Decision: two independent persisted-control implementations** (one added
to `discussion-persisted-controls.ts`, one to `useMessagePersistedControls.ts`),
matching each file's own existing convention rather than extracting a shared
helper - **but the actual download mechanism and the mime-to-extension
mapping live once**, inside the already-shared `useDiscussionCapture.ts` /
`discussion-capture.ts` (section 5.1's opening line: message-replies imports
`useDiscussionCapture` directly, confirmed at
`useMessageReplies.ts:39,257` - `import { useDiscussionCapture } from
"../recording/useDiscussionCapture";` / `const capture = useDiscussionCapture();`).
So this is not "duplicate everything" - it is "duplicate exactly the ~10-line
persisted-boolean plumbing each surface already duplicates for every one of
its other simple controls, and share the one piece that is genuinely shared
today."

Reasons against a new cross-directory helper for the persisted-control state
itself:
- `discussion-persisted-controls.ts`'s own header states its keys must be
  **whole string literals**, because `recording-split.structure.test.ts`'s
  canary derives its key set with a regex over literal source
  (`discussion-persisted-controls.ts:26-28`). `useMessagePersistedControls.ts`
  instead uses named `STORAGE_KEY_*` consts
  (`useMessagePersistedControls.ts:29-37`), and its own canary
  (`message-replies.structure.test.ts:91-108`) is ordinal (count-only), not
  set-based, specifically because this directory "has no canary anywhere
  else" (`:80-85` comment). A shared cross-directory helper would have to
  pick one convention, breaking the other file's own documented reason for
  its convention.
- Worse: a helper living in neither `src/app/components/recording/` nor
  `src/app/components/message-replies/` would put its `localStorage` key
  **outside both directory-scoped canaries entirely** - invisible to both,
  not just one. `docs/loop/this-repo.md`'s own recorded instance
  (`useGradingRows.ts`'s three `ta-rec-grade-*` keys being absent from
  `recording-split.structure.test.ts`'s expected set because that test
  doesn't reach sibling directories) is exactly this failure, and a shared
  helper reproduces it for BOTH directories instead of just one.

Cost, both sides: ~10-12 lines each (one `useState` + one `useCallback`
setter + one interface field + one returned field), following the pattern
already at `discussion-persisted-controls.ts:139-145` /
`useMessagePersistedControls.ts:104-108` line for line. Cheap enough that the
duplication argument above is not a false economy.

**The actual download call and the mime-to-extension mapping are not
duplicated.** Both surfaces call into the one `useDiscussionCapture.ts`
instance's `start()` (section 5.3), so the browser-facing mechanism is
written once and shared, which is the one place duplication would have been
a real defect (two independently-maintained anchor/click blocks silently
drifting apart).

### 5.3 The mechanism (where the download actually happens)

`useDiscussionCapture.ts`'s public interface (`UseDiscussionCaptureReturn`,
`:33-69`) gains:
- `start`'s options: `(opts: { saveVideo: boolean; autoDownload?: boolean; downloadFileNameBase?: string }) => Promise<void>` (was `{ saveVideo: boolean }`, `:58`).
- A new field, `recordingMimeType: string | null` (alongside `recordingUrl`/`recordingBytes`, `:49-50`), because **today nothing exposes the negotiated mime type at all** - the hook computes `recorder.mimeType || mimeType || "video/webm"` inline as the `Blob`'s `type` argument (`:473`) and never stores it. Neither consumer can currently tell mp4 from webm. This is a real gap the row did not call out: it assumed `useTakes.ts`'s mime-based extension logic could simply be "reused," but the value it needs to branch on is not exposed by the hook these two surfaces actually use.

Inside `recorder.onstop` (`:472-482`), name the existing inline expression:
```
const resolvedMimeType = recorder.mimeType || mimeType || "video/webm";
```
used for the `Blob`'s `type` (replacing the inline expression at `:473`) and
for the new `recordingMimeType` state, set alongside `recordingUrl`/
`recordingBytes` in the same `if (mountedRef.current)` branch (`:475-478`).
**In the same branch**, when `opts.autoDownload` is true, click a
synthesized anchor against the **same `url` variable already in scope** at
that point (`:474`) - the one already becoming `recordingUrlRef.current` /
`recordingUrl` state one line later. No second `URL.createObjectURL` call.
Filename: `` `${opts.downloadFileNameBase ?? "recording"}.${ext}` ``, `ext`
from a new pure helper (below). This never runs in the `else` branch
(component already unmounted, `:479-481`) - there is no consumer left to
receive a file, and the URL there is revoked immediately rather than reused.

New pure helper, placed in `discussion-capture.ts` (the existing
"React-free, DOM-free" leaf both surfaces already import from, header at
`discussion-capture.ts:1-12`, already the home of `coerceReplyComposition`
and friends):
```
export function videoExtensionFromMimeType(mimeType: string): "mp4" | "webm" {
  return mimeType.includes("mp4") ? "mp4" : "webm";
}
```
This is the same two-way branch `useTakes.ts:111` already uses for its own
video case - not a new convention, a one-line lift of an existing one into a
shared, unit-testable location. New test cases go in the existing
`discussion-capture.test.ts` (no new test file).

Each orchestrator threads its own `downloadFileNameBase`, matching the
**existing hardcoded manual-link names** exactly (so the auto-downloaded
file and the manually-downloaded file share a base name, differing only in
whether the extension was ever hardcoded - see AC7):
- `useDiscussionReplies.ts:619` becomes `start({ saveVideo: saveVideoRef.current, autoDownload: autoDownloadRef.current, downloadFileNameBase: "discussion-capture" })` - `"discussion-capture"` matches the existing literal at `DiscussionRepliesPanel.tsx:773` (`download="discussion-capture.webm"`) minus its hardcoded extension.
- `useMessageReplies.ts:592` becomes the same shape with `downloadFileNameBase: "message-replies-capture"`, matching `MessageRepliesPanel.tsx:364`'s existing `download="message-replies-capture.webm"`.

`autoDownloadRef` mirrors the existing `saveVideoRef` exactly
(`useDiscussionReplies.ts:295-298`, `useMessageReplies.ts:318-321`): a
`useRef` seeded from the persisted value, kept current by a one-line
`useEffect`. Same reason as the original - `start()` is a `useCallback` that
must read the latest toggle value without depending on it (a stale closure
over the boolean would freeze the setting at whatever it was when `start`
was first created).

### 5.4 What happens when "Save video" is off

**Decision: disabled, not hidden.** The new checkbox always renders, with
`disabled={!saveVideo}` and a `styles.fieldHint` paragraph explaining the
dependency when disabled, e.g. `Requires "Also save the screen recording."`
This is an established house pattern, not invented for this row -
`disabled={!canCopyReply}` at `DiscussionReplyRow.tsx:665` and
`disabled={!canSaveOrSend}` at `MessageThreadRowActions.tsx:219,230` are the
same "control disabled by an unmet dependency, not removed from the DOM"
shape already used twice in these two directories. Hiding it would require a
conditional layout (a Visual/aesthetic-seat concern this document is not
authorized to resolve, per `seats.md`'s wave-3 boundary) and would make the
control's own persisted value invisible while `saveVideo` is off, which reads
worse than a greyed-out, explained checkbox.

### 5.5 Zero-byte or failed blob

Two distinct failure shapes exist in `:466-494` today, and they get two
different answers:

- **MediaRecorder construction or `.start()` throws** (the existing
  `catch` at `:485-494`, which sets `recordingError` and leaves
  `recorderRef.current = null`). `recorder.onstop` is never assigned to a
  live recorder in this path, so it **never fires** - auto-download cannot
  run here by construction, not by an added guard. Nothing to specify.
- **`onstop` fires normally but `chunksRef.current` is empty** (stop called
  before any `ondataavailable` event, or the source produced nothing) -
  `new Blob([], { type: resolvedMimeType })` has `size === 0`, and
  **today's code already sets `recordingUrl` and renders the manual
  "Download recording (0.0 MB)" link in this case** (`:475-478`'s branch is
  unconditional on blob size). **Decision: auto-download uses the identical
  gate the manual link already uses** - it fires whenever `onstop` completes
  while mounted, with no added byte-size check. Making auto-download stricter
  than the manual link it is meant to automate would make the two links
  disagree about whether a "download" happened for the same event, which is
  a worse inconsistency than a occasional empty file. This zero-byte
  behavior is **pre-existing**, not introduced or worsened by this row - see
  Residual R2 (section 9) if the owner wants it tightened later.

---

## 6. The four traps, addressed explicitly

**Trap 1 - browser may silently refuse the download.** `recorder.onstop` is
an event callback, not a click handler; nothing in this repo can observe
whether a given browser honors a programmatic `a.click()` download issued
from it. **No acceptance criterion below claims this works via any executing
gate.** The visible fallback already exists and needs no new code: the
"Download recording" link (`DiscussionRepliesPanel.tsx:771-775`,
`MessageRepliesPanel.tsx:362-366`) renders whenever `recordingUrl` is set,
regardless of whether auto-download fired, succeeded, or was silently
dropped by the browser - so a user whose browser blocks the auto-download
still has a one-click manual path with no additional code. **Owner
verification row is section 8**, first-class, not a footnote.

**Trap 2 - object URL ownership.** Resolved in 5.3 by construction: there is
still exactly one object URL for the whole session's recording (the one
already in `recordingUrlRef.current` / `recordingUrl` state), created once
in `onstop`, revoked only on the pre-existing triggers (`revokeRecordingUrl()`
at the top of the next `start()`, `:419`, or on unmount, `:377`, per the
comment at `:375-376` - "revoked on unmount, but NOT on a plain session
stop"). The auto-download anchor **borrows** that URL for one synchronous
`click()` and never creates or revokes a URL of its own - the same relationship
`useTakes.ts:114`'s `a.href = take.url` already has to its own long-lived URL.
No second consumer, no second lifetime to manage.

**Trap 3 - extension is not always webm.** Addressed by
`videoExtensionFromMimeType` (5.3) branching on the actual negotiated
`resolvedMimeType`, not a literal. Worth stating precisely why this is real
and not theoretical here: `RECORDER_MIME_TYPES`
(`useDiscussionCapture.ts:73`) lists only `video/webm` variants, so
`pickRecorderMimeType()` (`:75-81`) returns `""` on any browser that
supports none of them (e.g. Safari) - `new MediaRecorder(stream, undefined)`
is then constructed with **no forced mime type**, and the browser picks its
own default, which is not guaranteed to be a webm variant. `recorder.mimeType`
(read after the fact) is the only place this is knowable, which is exactly
why `resolvedMimeType` must be read from `recorder.mimeType` first, not from
the `RECORDER_MIME_TYPES` candidate list.

**A related, pre-existing defect this trap also exposes:** both manual
review links hardcode the extension today - `DiscussionRepliesPanel.tsx:773`
(`download="discussion-capture.webm"`) and `MessageRepliesPanel.tsx:364`
(`download="message-replies-capture.webm"`) - regardless of the actual
recorded mime type. This predates A20 and is not something the owner asked
this row to fix. **AC7 (section 7) bundles the one-line fix on both files
anyway**, flagged as optional and separable, because it costs nothing extra
once `recordingMimeType` is threaded to the panel for the new checkbox's own
disabled-state reasoning (section 5.4 needs `saveVideo`, already threaded;
`recordingMimeType` threading is the only new wiring AC7 needs, described in
its own row). If the owner or checker wants a strictly minimal diff, AC7 is
the one criterion to drop - nothing else here depends on it.

**Trap 4 - persistence and the hydration mount-effect concern.** The new
control's `useState` initializer is written in the **identical shape**
`saveVideo`'s already is (`discussion-persisted-controls.ts:139-141`,
`useMessagePersistedControls.ts:104`) - a lazy initializer reading
`localStorage` directly, no separate mount effect. I read both files in full
and found **no mount effect anywhere in either** correcting a
server/client mismatch for any of their existing controls. I cannot
determine from here whether that is because these components never take the
SSR path at all (both are `"use client"` and reached only from an
already-mounted, tab-based recording UI, never part of `next build`'s
prerendered set) or because a hydration bug already exists on `saveVideo`
itself and has gone unnoticed - **no test renders this component, so this is
not decidable by measurement in this environment** (`docs/loop/this-repo.md`
section 6). The instruction here is: **copy `saveVideo`'s exact mechanism for
the new key, do not invent a different one for consistency's sake, and if a
future pass adds a mount effect to fix a real hydration bug on `saveVideo`,
apply the identical fix to the new key in the same commit.** Recorded as
Residual R3.

---

## 7. Acceptance criteria

Numbering is fresh to this document (no prior A20 AC numbering exists to
collide with). Each names the object under comparison, the instrument, and
the direction of failure, plus a sabotage.

**AC1 - both new persisted keys exist and are read/write-wired.**
- Object: `ta-rec-disc-auto-download` (in `discussion-persisted-controls.ts`) and `ta-rec-msg-auto-download` (in `useMessagePersistedControls.ts`).
- Instrument: `recording-split.structure.test.ts`'s "every ta-rec-disc-* key is wired to both a read and a write (C5c)" block (`:470-517`, derives its own key list from source, needs no new hardcoded name to find this key) for the discussion key; a new equivalent assertion is NOT needed on the message side since that directory's canary is ordinal only (`message-replies.structure.test.ts:91-108`) - the wiring itself is checked implicitly by the ordinal count moving from 14 to 15 only if the key is actually present in a non-test file.
- Direction of failure: RED if either the read or the write call for `ta-rec-disc-auto-download` is missing; RED (count assertion) if `ta-rec-msg-auto-download` is present in fewer or more than the expected distinct-key set.
- Sabotage: delete the `writeLocalStorage("ta-rec-disc-auto-download", ...)` call from the new setter, leaving the read. Expected: the per-key write assertion for that one key goes RED, no other key's assertion is affected - this exact shape was already proven to discriminate on a sibling key (`ta-rec-disc-address-name`), documented at `recording-split.structure.test.ts:496-501`. Restore the write: GREEN.

**AC2 - discussion side's exact-set canary is updated in the same commit.**
- Object: the literal array at `recording-split.structure.test.ts:342-403` (currently 16 `ta-rec-disc-*` entries, measured section 4) and the count assertion at `:515-517` ("finds exactly sixteen").
- Instrument: `npx vitest run src/app/components/recording/recording-split.structure.test.ts`.
- Direction of failure: RED (`toEqual`/`toHaveLength` mismatch) if `ta-rec-disc-auto-download` is added to the source without adding it to the array (alphabetically between `"ta-rec-disc-audience"` at `:364` and `"ta-rec-disc-course"` at `:365`) and bumping `16` to `17` at `:516`.
- Sabotage: add the new key to `discussion-persisted-controls.ts` without touching the test. Expected RED by construction - a fixed-length array compared against a set that just grew by one cannot pass; this is mechanical, not something that needs to be run to believe, but the test seat should run it once real code exists rather than taking this document's word for it.

**AC3 - message side's ordinal canary is updated in the same commit.**
- Object: `message-replies.structure.test.ts:101-103` ("finds exactly fourteen distinct ta- keys").
- Instrument: `npx vitest run src/app/components/message-replies/message-replies.structure.test.ts`.
- Direction of failure: RED if the count is not bumped to 15 in the same commit that adds `ta-rec-msg-auto-download`.
- Sabotage: same shape as AC2 - add the key, leave `14`. Expected RED by construction (same reasoning).

**AC4 - the new checkbox is disabled when "Save video" is off, on both surfaces.**
- Object: the new `FormControlLabel`'s `Checkbox` in `DiscussionCaptureSettings.tsx` and `MessageCaptureSettings.tsx`.
- Instrument: **none executable.** No component is rendered by any test in this repo (`docs/loop/this-repo.md` section 2), so `disabled` state cannot be asserted mechanically here.
- Direction of failure: n/a - this is a reading claim, not a measured one.
- This is not a criterion with a sabotage; it is **Residual R4** (section 9), an owner/browser verification item, not a gap in this document.

**AC5 - the download fires exactly once per stop, using the recorder's already-live URL, and never after unmount.**
- Object: the new branch inside `useDiscussionCapture.ts`'s `recorder.onstop` (5.3).
- Instrument: **none executable** for the same reason as AC4 - this requires a real `MediaRecorder`, a real DOM, and a real click; nothing in `vitest` (node-env, no jsdom) can construct any of those. `docs/loop/this-repo.md` section 2 and section 6 both name this ceiling directly.
- Direction of failure: n/a.
- Also **Residual R4** (folded into the same owner-verification item as AC4 - both need a real browser to see at all, and separating them would only duplicate the same unmeasurable claim).

**AC6 - the extension matches the real recorded format.**
- Object: `videoExtensionFromMimeType(mimeType: string): "mp4" | "webm"` in `discussion-capture.ts`.
- Instrument: a new `describe`/`it` pair in `discussion-capture.test.ts` (existing file, no new file needed) asserting `videoExtensionFromMimeType("video/webm;codecs=vp9") === "webm"` and `videoExtensionFromMimeType("video/mp4") === "mp4"`.
- Direction of failure: RED if either assertion returns the wrong branch.
- Sabotage: invert the ternary (`mimeType.includes("mp4") ? "webm" : "mp4"`). Expected: both assertions flip and go RED. Restore: GREEN. This is a plain pure function with no rendering dependency, so this is the one part of the whole feature a unit test can fully pin - unlike AC4/AC5, this sabotage **is** expected to discriminate and should be treated as a real gate, not a residual.

**AC7 - OPTIONAL, bundled, separable: the manual review-link's filename also uses the real extension, not a hardcoded `.webm`.**
- Object: the `download=` attribute at `DiscussionRepliesPanel.tsx:773` and `MessageRepliesPanel.tsx:364`.
- Instrument: a new source-text assertion (in a `*.wiring.test.ts` or an extension of the existing panel-level test, implementer's choice of file) checking that the JSX's `download` prop is **not** the literal string `"discussion-capture.webm"` / `"message-replies-capture.webm"`, but references a computed expression involving the panel's own `recordingMimeType` (threaded down alongside the existing `recordingUrl`/`recordingBytes` destructuring at `DiscussionRepliesPanel.tsx:136-137` and `MessageRepliesPanel.tsx:94-95`). Per the source-text-tests-over-specify trap (`docs/loop/traps-tests.md`), this pins the **fact** (extension is computed, not a literal `.webm` suffix) and not the exact expression spelling.
- Direction of failure: RED if either panel reverts to a hardcoded `.webm` suffix.
- Sabotage: hardcode `.webm` back onto one panel only. Expected: RED on that panel's assertion only, GREEN on the other. Restore: both GREEN.
- **This criterion is the one to drop first if the checker or the owner wants a smaller diff** - nothing else in this document depends on it, and dropping it leaves the pre-existing hardcoded-extension behavior on the manual link exactly as it is today (Residual R2 already covers that state either way).

---

## 8. Owner verification (trap 1) - first-class, not a footnote

**Item:** does the auto-download actually produce a file in a real browser
when triggered from inside `recorder.onstop`, on at least Chrome and Safari
(the two engines this row's own mime-type divergence, section 6, already
distinguishes)?

**Why no instrument here can answer it:** `vitest` here is `environment:
"node"`, collects `src/**/*.test.ts` only, and renders no component
(`docs/loop/this-repo.md` section 2). There is no jsdom, no `MediaRecorder`,
no real anchor-click-to-download browser behavior available to any test in
this repo. The Browser pane can load this app, but "the app cannot be
meaningfully driven without env vars" for anything auth- or data-backed
(`docs/loop/this-repo.md` section 6), and a discussion/message capture
session needs a real course and a real screen-share permission grant a
sandboxed preview cannot supply.

**What settles it:** a person, in a real browser, with real Canvas data,
turning on both "Also save the screen recording" and "Download automatically
when recording stops," running a short capture, clicking Stop, and checking
whether a file lands in Downloads without further interaction. Repeat once
on a browser known to negotiate a non-webm mime type if one is available, to
exercise AC6 end to end (not just the pure function).

**Owner:** whoever accepts this row (checked with the person who filed it,
2026-09-20, per the row's own `from` field).
**Step:** after Build and before this row is marked closed in
`docs/BACKLOG.md` - this is not a gate any other step in the loop can
substitute for.

---

## 9. Residual register

| # | What is not proven now | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R1 | No removal test exists for the click-cost leverage claim (section 1) - unbuildable here since nothing observes clicks | Test seat | None available in this repo (`docs/loop/leverage.md:172-178`) | Recorded permanently as unbuildable, not deferred - re-examine only if this repo ever gains a render-capable test runner |
| R2 | A zero-byte capture already renders a "Download recording (0.0 MB)" manual link today, and auto-download will match that behavior rather than fix it (section 5.5) | Owner | A scope decision, not a measurement | Owner call at or after this row's disposal - separate backlog entry if they want it tightened |
| R3 | Whether the existing `saveVideo` persisted-control pattern has a live SSR/hydration mismatch that the new `autoDownload` key would inherit unchanged (section 6, trap 4) | Owner / a future render-capable check | None - no component renders under any test here | A real browser reload check, same owner-verification session as section 8, or whenever this repo gains a render-capable test |
| R4 | Whether the new checkbox actually disables/enables correctly (AC4) and whether the download actually fires once, from the live URL, never post-unmount (AC5) | Owner | Real browser, manual interaction | Same owner-verification session as section 8 |

---

## 10. Disposition of the row's own group-2 analysis

The backlog row's `note` field (`docs/backlog.yml:406`) already carried a
full group-2 analysis (grading-from-a-recording, legibility probe, module
deck capture, walkthrough announcement) recommending it be put to the owner
as a batched non-gating question. The owner's own ruling in the same note
field already answered it ("JUST THE TWO THAT ALREADY RECORD... GROUP 2 IS
OUT OF SCOPE AND STAYS OUT"), so there is nothing left open to dispose of -
group 2 is **(d) Delete** from this row's own scope, with the reason stated
by the owner and the enforcer it protects named explicitly: `ModuleDeckCapturePanel.tsx`'s
AC13 point 3 (`:30`, `:126`, re-confirmed section 2). Nothing in this
document reopens that question.

---

## 11. Collision surface with A18 / A19 / A8-R

Computed mechanically, not eyeballed, per `docs/loop/parallel-disjointness.md`'s
"intersect the sets with `sort | uniq -d`" rule:

```
sort a20_files.txt a18_files.txt | uniq -d   -> (empty)
sort a20_files.txt a8r_files.txt | uniq -d   -> src/app/components/recording/discussion-capture.ts
```

The one hit is a false positive on inspection: `a8r-scope.md:307-309` cites
`discussion-capture.ts` only to rule that `grading-submission-merge.ts:9-13`'s
"do not reuse `mergeCapturedPosts`/`isSamePost` from
`.../recording/discussion-capture.ts`" header comment is "Not on point" for
A8-R's own question - A8-R reads this file as evidence, it does not edit it,
and it is not in A8-R's own write set. **No real intersection.**
`docs/a19-scope.md` does not exist yet (checked: `ls docs/a19-scope.md` at
the start of this session found nothing), so there is nothing to intersect
against; if it lands before this row is implemented, re-run the same check
against its file list before dispatching a wave.

The concurrently in-flight, uncommitted work at session start
(`GradingResults.tsx`, `src/app/components/grading-results/*`, per the
session's own git status) and the in-flight files observed mid-session
(`GradingRecordingPanel.tsx`, `grading-recording-log.ts`) are both entirely
outside `src/app/components/recording/*` (excluding `grading-recording/`,
a different directory despite the similar name) and
`src/app/components/message-replies/*`. No overlap with this row's file set.

---

## 12. `owns` - derived, not asserted

Command used to derive the full touch set (re-run before dispatching a
build wave, since this document may age):

```
grep -rn "saveVideo" src --include=*.ts --include=*.tsx | grep -v .test
```

Files this row's implementation will edit:

- `src/app/components/recording/useDiscussionCapture.ts` (538 lines - `@(Get-Content).Count` and `wc -l` agree)
- `src/app/components/recording/discussion-capture.ts` (807 lines, both instruments agree)
- `src/app/components/recording/discussion-capture.test.ts` (new cases only, not measured - existing file)
- `src/app/components/recording/discussion-persisted-controls.ts` (208 lines, both instruments agree)
- `src/app/components/recording/DiscussionCaptureSettings.tsx` (191 lines, both instruments agree)
- `src/app/components/recording/useDiscussionReplies.ts` (898 lines, both instruments agree - **102 lines of headroom under the 1000-line ceiling; not in `file-size-ceiling.structure.test.ts`'s `ALLOWED_OVERAGE` list, so the flat 1000 applies**)
- `src/app/components/recording/DiscussionRepliesPanel.tsx` (933 lines, both instruments agree - **only 67 lines of headroom, the tightest file this row touches; the implementer should keep this file's own diff to prop-threading only and push any new logic into `DiscussionCaptureSettings.tsx` or the hook instead**)
- `src/app/components/recording/recording-split.structure.test.ts` (590 lines, both instruments agree)
- `src/app/components/message-replies/useMessagePersistedControls.ts` (126 lines, both instruments agree)
- `src/app/components/message-replies/MessageCaptureSettings.tsx` (254 lines, both instruments agree)
- `src/app/components/message-replies/useMessageReplies.ts` (775 lines, both instruments agree - 225 lines headroom)
- `src/app/components/message-replies/MessageRepliesPanel.tsx` (466 lines, both instruments agree - 534 lines headroom)
- `src/app/components/message-replies/message-replies.structure.test.ts` (125 lines, both instruments agree)

Line counts measured with:
```
@(Get-Content <file>).Count     # PowerShell, mandated instrument
wc -l <file>                    # Bash, cross-check
```
run 2026-09-20 against every file above; both agreed on every one (no
42-line-style discrepancy found on any file this row touches - stated because
`docs/loop/this-repo.md` records that disagreement exists on at least one
file elsewhere in the repo, not because it was expected here).

Not in `owns`: any of the four out-of-scope files (section 2), `docs/a18-scope.md`,
`docs/a19-scope.md`, `docs/a8r-scope.md`, or anything under `src/app/components/GradingResults.tsx`
/ `src/app/components/grading-results/*` / `src/app/components/grading-recording/*`.

---

## 13. What I could not do, or think may still be wrong

- I did not write or run any implementation code, and no sabotage above was
  executed against real feature code, because none exists yet - AC1-AC3's
  sabotages are argued from the enforcing test's own mechanism (a fixed-length
  array or count compared against a source-derived set cannot silently
  absorb a new match) rather than demonstrated by mutating a real file. AC6's
  sabotage is the one true exception - it is a pure function with no
  rendering dependency, describable and provably discriminating without a
  browser, and should be the one the test seat treats as non-negotiable.
- AC4 and AC5 have no instrument in this repo at all, by construction, not by
  gap in this document - restated in the residual register rather than
  hidden inside a criterion that reads as if it were checked.
- I could not determine whether `saveVideo`'s existing persisted-control
  pattern already has a live hydration bug (trap 4, section 6, Residual R3).
  No component renders here, so this is not decidable by any measurement
  available to me; I chose to mirror the existing pattern exactly rather than
  guess at a fix for a bug I cannot confirm exists.
- AC7 is bundled opportunistically because it shares a dependency
  (`recordingMimeType` threading) with the required work, not because the
  owner asked for it - flagged as the first thing to cut if a checker or the
  owner wants the smallest possible diff on this row.
- `DiscussionRepliesPanel.tsx` has only 67 lines of headroom under the
  1000-line ceiling (measured section 12). If the implementer's prop-threading
  diff there exceeds that, the wave needs a companion extraction, which this
  document does not scope - flagging it now so a future architect pass is not
  surprised by it.
