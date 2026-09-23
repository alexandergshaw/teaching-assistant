# A20 owner check: does the auto-download actually produce a file?

Row: `A20`, `state: 'verification'`, read with
`python -c "import yaml,io; d={r['id']:r for r in yaml.safe_load(io.open('docs/backlog.yml',encoding='utf-8'))}; print(d['A20'])"`.
Shipped at `13cef3b` (feature), `36aaad3` (aria fix), `bab26ad` (UX pass doc).
Scope: `docs/a20-scope.md`; its Section 8 is the item this document replaces
with something runnable.

**Everything below was measured against the working tree at HEAD, not against
`docs/a20-scope.md`.** The scope document is a pre-build design; where the two
disagree, the tree is what this document reports. Every citation in Sections 1
to 5 was opened. Every number names the command that produced it (Section 7).

**Nothing in this checkout can answer the question.** `vitest` here is
node-env and renders no component, so every claim below about what the
instructor SEES is a reading claim from JSX source, not an observation of a
rendered screen. What the browser does with `a.click()` is not observable from
here at all.

---

## 0. The short version - what to actually do

Ten minutes, four captures, in whichever browser you normally use.

**Before you start (about one minute, and it may pre-explain a failure):**

1. Open `chrome://settings/content/automaticDownloads` (Edge:
   `edge://settings/content/automaticDownloads`). Note the global setting and
   whether the app's origin already has an Allow or Block entry.
2. Open `chrome://settings/downloads`. Note the Downloads folder path and
   whether "Ask where to save each file" is on.
3. Open `chrome://downloads` in a second tab and leave it open.
4. Open DevTools on the app tab (F12), Console panel, before you press Start.

**Then, on the Recording tab, "Discussion replies" sub-tab:**

| # | Case | What you do |
|---|---|---|
| 1 | Page Stop button, first download of the tab's life | Tick "Also save the screen recording", tick "Download automatically when recording stops", press "Start capture", share any window, wait about 10 seconds, press "Stop capture" in the app |
| 2 | Page Stop button, SECOND download in the same tab | Without reloading, immediately repeat case 1 |
| 3 | Browser sharing-bar stop | Without reloading, start a third capture, then stop it from the browser's own "Stop sharing" bar instead of the app's button |
| 4 | Other surface, wiring only | Switch to the "Message replies" sub-tab, tick both boxes, run one short capture, stop from the app's button |

Record, for each: did a file appear, and did the app show the extra line
"This should already be in your Downloads folder". Section 2 says exactly how
to read those. Section 6 maps every combination of answers onto the work it
routes to.

You do not need Canvas, a course, a real discussion board, or any credential.
Neither Start button carries a `disabled` prop
(`DiscussionRepliesPanel.tsx:703-710`, `MessageRepliesPanel.tsx:327-334`) and
neither `start()` wrapper has a precondition that returns early - checked by
reading both function bodies end to end (`useDiscussionReplies.ts:584-632`,
`useMessageReplies.ts:602-614`; no `return` or `throw` before the
`captureRef.current.start(...)` call in either). Share any
window at the picker. The recording is of your screen; its contents are
irrelevant to this question.

---

## 1. The exact trace, both surfaces

### 1.1 The path is shared - one function, two orchestrators

Both surfaces call the same hook. `useMessageReplies.ts` imports
`useDiscussionCapture` directly, so there is exactly ONE place where the
download is fired:

```
src/app/components/recording/useDiscussionCapture.ts:513
```

Everything that differs between the two surfaces differs only in (a) which
panel renders the result and (b) the filename stem.

### 1.2 Press "Start capture"

Discussion replies:

- `DiscussionRepliesPanel.tsx:707` - `onClick={handleStartStop}` on the
  Start/Stop `Button`.
- `DiscussionRepliesPanel.tsx:533-539` - `handleStartStop` calls `start()`
  when not capturing.
- `useDiscussionReplies.ts:628-632` - the orchestrator's `start()` calls:
  ```
  await captureRef.current.start({
    saveVideo: saveVideoRef.current,
    autoDownload: autoDownloadRef.current,
    downloadFileNameBase: "discussion-capture",
  });
  ```
- `useDiscussionReplies.ts:304-307` - `autoDownloadRef` is a `useRef` mirroring
  the persisted checkbox, updated by a `useEffect`.

Message replies is the same shape: `MessageRepliesPanel.tsx:331` ->
`MessageRepliesPanel.tsx:239-245` -> `useMessageReplies.ts:610-614` with
`downloadFileNameBase: "message-replies-capture"`, ref at
`useMessageReplies.ts:336-339`.

**Consequence you must respect when testing: the value that matters is the
checkbox state at the moment you press Start, not at the moment you press
Stop.** `opts` is captured when `start()` is called, and `recorder.onstop`
closes over that same `opts` object (`useDiscussionCapture.ts:497`). Ticking
the box mid-capture does nothing for that capture.

### 1.3 Inside `start()`

- `useDiscussionCapture.ts:490` - `if (opts.saveVideo) {`. With "Also save the
  screen recording" off, no `MediaRecorder` is ever constructed and there is
  no blob and no download. This is why case 1 requires BOTH boxes.
- `useDiscussionCapture.ts:492-493` - `pickRecorderMimeType()` then
  `new MediaRecorder(stream, ...)`.
- `useDiscussionCapture.ts:92` - the negotiation list is
  `["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]`. Three
  entries, all webm. On a browser supporting none of them,
  `pickRecorderMimeType()` returns `""` (`:94-100`) and the browser picks its
  own container.
- `useDiscussionCapture.ts:497` - `recorder.onstop = () => { ... }` is
  ASSIGNED here, inside the `try` at `:491`. It EXECUTES later, after the
  `catch` at `:524` is out of scope. An exception thrown inside `onstop` is
  therefore not caught by that handler and does not reach `setRecordingError`.
- `useDiscussionCapture.ts:522` - `recorder.start()`.
- `useDiscussionCapture.ts:451` -
  `track.addEventListener("ended", () => teardownRef.current(), { once: true });`
  This is the second stop path. See 1.5.

### 1.4 Press "Stop capture" in the app - where gesture adjacency is lost

1. `DiscussionRepliesPanel.tsx:533-536` - the click handler calls `stop()`.
   This runs synchronously inside the click event.
2. `useDiscussionReplies.ts:641-644` - `setLogEndedAt(...)` then
   `captureRef.current.stop()`. Still synchronous.
   (Message side: `useMessageReplies.ts:620-625`, which additionally fires
   `void runMatchPass(...)` after the stop - a network call, not in the
   download's path.)
3. `useDiscussionCapture.ts:542-544` - `stop` calls `teardownRef.current()`.
   Still synchronous.
4. `useDiscussionCapture.ts:330-387` - `teardown()`. Note the ORDER: it stops
   every track at `:339` FIRST, then calls `recorderRef.current.stop()` at
   `:354`. Both are synchronous calls inside the click.
5. **This is where adjacency is lost.** `MediaRecorder.stop()` does not run
   `onstop` synchronously. Per the spec it queues a task that fires the final
   `dataavailable` and then `stop`. So `onstop` runs in a LATER task, after
   the click event handler has returned and the click's call stack has
   unwound.
6. `useDiscussionCapture.ts:497-521` - `onstop` builds the blob at `:499`,
   creates the long-lived object URL at `:500`, and inside
   `if (mountedRef.current)` at `:501` sets `recordingUrl`, `recordingBytes`,
   `recordingMimeType` and `lastSessionAutoDownload` (`:502-506`) BEFORE the
   download at `:512-517`:
   ```
   if (opts.autoDownload) {
     triggerFileDownload(
       blob,
       `${opts.downloadFileNameBase ?? "recording"}.${videoExtensionFromMimeType(resolvedMimeType)}`
     );
   }
   ```
7. `src/app/components/course-planning/utils.ts:19-28` -
   `triggerFileDownload` creates its own object URL, creates an `<a>`, sets
   `href` and `download`, appends it to `document.body`, calls `a.click()`,
   removes it, and revokes the URL - all synchronously inside one call.

**So: the download is one task removed from the click.** The gap is a single
queued task, with no `await`, no timer and no network in between. That is as
close to gesture-adjacent as this design can get without restructuring, and it
is much closer than the app's own already-shipped precedent (Section 5.4). It
is still not "inside the click handler", which is the thing a browser policy
could care about, and nothing in this repo can tell you whether it does.

### 1.5 The second stop path - the one the scope document never names

`useDiscussionCapture.ts:451` registers `track.addEventListener("ended", ...)`
on the video track. When you stop the share from the browser's own sharing
bar, that listener fires `teardown()` -> `recorder.stop()` -> the same
`onstop` -> the same `triggerFileDownload`. **There is no page click anywhere
in that path.**

This is not a corner case the instructor has to discover. Both panels
advertise it, in identical copy:

- `DiscussionRepliesPanel.tsx:712` - `You can also stop from your browser's sharing bar.`
- `MessageRepliesPanel.tsx:336` - the same sentence.

Case 3 exists because of this. It is the only case where the difference
between "gesture-adjacent" and "not" is isolated: same code, same session,
same everything, minus the click. If case 1 passes and case 3 fails, you have
found the answer exactly, and the fix is narrow (Section 5, option F).

`docs/a20-scope.md` Section 8 asks only for "clicking Stop". Testing only that
would leave an advertised path unchecked.

---

## 2. What a pass looks like, and what a fail looks like

The hazard is that a fail and a "nothing ran" look identical if you only look
at the Downloads folder. The app has a built-in discriminator; use it.

### 2.1 The discriminator - the extra line in the app

`DiscussionRepliesPanel.tsx:791-795`:

```
{lastSessionAutoDownload && recordingBytes > 0 && (
  <p className={styles.fieldHint}>
    This should already be in your Downloads folder - if it isn&apos;t there, use the link above.
  </p>
)}
```

`MessageRepliesPanel.tsx:378-382` is identical. `lastSessionAutoDownload` is
set at `useDiscussionCapture.ts:506` from `opts.autoDownload === true` inside
the same mounted branch, so it records what the STOPPED session asked for, not
the live checkbox.

That line renders on the exact condition that the download code ran.
Therefore:

- **Line present, no file** = the app did its part and the browser did not
  write the file. That is the FAIL this row is about.
- **Line absent** = the download code never ran. That is NOT the browser's
  fault and NOT this question's answer. It means `autoDownload` was false at
  Start, or `saveVideo` was off, or `recordingBytes` was 0. Re-run the case
  rather than reporting a browser refusal.

Read this line BEFORE you go looking in the Downloads folder.

### 2.2 The file itself - exact expected names

Filename is `downloadFileNameBase` + "." + `videoExtensionFromMimeType(...)`
(`useDiscussionCapture.ts:513-516`). Mapping at
`src/app/components/recording/discussion-capture.ts:433-440`:

```
matroska -> mkv ; quicktime -> mov ; ogg -> ogv ; webm -> webm ; mp4 -> mp4 ; else webm
```

On Chrome or Edge, `RECORDER_MIME_TYPES` (`useDiscussionCapture.ts:92`) will
match `video/webm;codecs=vp9`, so expect:

- Discussion replies: `discussion-capture.webm`
- Message replies: `message-replies-capture.webm`

**Case 2's pass evidence is a file named `discussion-capture (1).webm`, not a
changed timestamp on the first one.** Chrome de-duplicates by appending a
counter; the original is not overwritten. If you only check for
`discussion-capture.webm` you will read a successful second download as a
failure.

If the extension is not `.webm`, note what it is. That is a real finding about
`pickRecorderMimeType` on your browser, and it exercises the extension mapping
end to end.

### 2.3 Where to look, in order of authority

1. **The file system.** The folder from `chrome://settings/downloads`. A file
   with the expected stem, non-zero size, that plays.
2. **`chrome://downloads`.** A new row. Whether a REFUSED download leaves a
   row here (and whether it is labelled "Blocked") is something I could not
   verify from this checkout - see Section 8. Note what you see either way;
   it is the cheapest signal to capture and it is the one that distinguishes
   "blocked" from "saved somewhere I wasn't looking".
3. **The download bubble / shelf** in the toolbar, and any icon that appears
   at the right-hand end of the address bar. Chrome surfaces a blocked
   automatic download there. I could not verify the exact affordance in your
   browser version.
4. **The DevTools console**, which is why it must be open before you press
   Start. Note any message that appears at the moment you press Stop, verbatim,
   including intervention or policy notices. `triggerFileDownload` itself
   never logs anything (`utils.ts:19-28`), so anything you see came from the
   browser, not the app.

### 2.4 One instrument trap - "0.0 MB" does not mean empty

The manual link's label is
`` `Download recording (${(recordingBytes / 1048576).toFixed(1)} MB)` ``
(`DiscussionRepliesPanel.tsx:780`, `MessageRepliesPanel.tsx:372`). Anything
under about 50 KB displays as "0.0 MB". The gate on the extra line is
`recordingBytes > 0`, not a rounded MB figure, so a recording that displays
"0.0 MB" can still be a real, non-empty file. Do not read "0.0 MB" as "the
capture produced nothing"; a 10-second capture with visible motion will
comfortably exceed that anyway.

### 2.5 PASS and FAIL, stated

**PASS for a case**: the extra line from 2.1 is present in the app, AND a new
file with the expected stem exists in the Downloads folder within about 10
seconds of pressing Stop, AND it opens and plays.

**FAIL for a case**: the extra line from 2.1 is present, AND after 10 seconds
no new file with that stem exists in the Downloads folder, AND no new row
appeared in `chrome://downloads`.

**VOID (re-run, do not report)**: the extra line is absent. Nothing about the
browser was measured.

**PARTIAL - worth distinguishing**: a "Save as" dialog appeared instead of a
silent save. That is a pass for "the browser honoured the download" and a
separate UX problem (it interrupts the instructor). It happens if "Ask where
to save each file" is on. That is why you read that setting first.

---

## 3. What varies, and which variations are worth running

| Variable | Worth testing? | Why |
|---|---|---|
| Stop path: app button vs sharing bar | **Yes - cases 1 and 3** | The only variable in this feature that changes gesture adjacency at all. Same code both ways (`useDiscussionCapture.ts:451` vs `:542`), so the comparison is clean. The app advertises the sharing-bar path in copy on both panels. |
| First vs later automatic download in the same tab | **Yes - case 2** | The classic silent-block shape: the first automatic download is allowed and later ones are gated behind a per-origin permission. If this is the failure, a one-shot check PASSES and the feature still fails in real use, because an instructor does several captures per sitting. Testing only case 1 would produce a false all-clear. |
| Surface: discussion vs message replies | **Once, for wiring only - case 4** | Not a browser variable. The download line is literally the same function call in the same file for both (`useDiscussionCapture.ts:513`). The one-minute run confirms the message side's checkbox is actually bound and its stem is right; it adds nothing to the browser question. |
| Chrome vs Edge | **Only if case 1 or 2 fails** | Both Chromium, same download policy engine, but the automatic-downloads permission is per-profile and per-origin. A second Chromium browser is then useful precisely to tell "this is the engine's policy" from "this is my profile's stored choice for this site". Running it first tells you nothing new. |
| Firefox / Safari | **No, unless you use them** | A different answer there would be real but would not change what ships for your own use, and Safari also changes the container (`.mp4` or `.mov` rather than `.webm`) which mixes two questions in one run. |
| Default folder vs "Ask where to save each file" | **Read the setting, do not run both** | It changes what a pass LOOKS like (dialog vs silent save), not whether the download is permitted. Section 2.5 covers it as PARTIAL. |
| Short vs long recording | **No - noise** | The delay between the Stop click and `triggerFileDownload` is one queued task regardless of recording length (`useDiscussionCapture.ts:497-517`); nothing in the path scales with duration. Use about 10 seconds with visible motion, purely so the blob is comfortably non-empty and the extra line's `recordingBytes > 0` gate is satisfied. |
| localhost vs the deployed app | **Test where you will use it** | The automatic-downloads permission is per-origin, so a grant on `localhost` says nothing about `teaching-assistant-pi.vercel.app` or the reverse. Pick the one that matters and note which you used. |

**Minimum set: 4 captures (cases 1-4) plus 2 settings reads.** Cases 1 to 3
must be in the same tab with no reload between them - reloading resets the
"how many automatic downloads has this page done" state that case 2 exists to
probe.

One more reason not to reload mid-run: the checkbox's state is a
localStorage-seeded `useState` initializer with no mount effect
(`discussion-persisted-controls.ts:153-155`,
`useMessagePersistedControls.ts:115`), which in this repo has previously meant
a persisted value does not re-show after a reload. That is residual R3 in
`docs/a20-scope.md` Section 9 and it is still unproven. Tick the boxes by hand
in the live page and do not reload after ticking, so a hydration question
cannot contaminate a download answer.

---

## 4. What the app does if the browser refuses

Read from the tree, not from the scope document.

**It cannot tell.** `triggerFileDownload` returns `void`
(`utils.ts:19-28`), `a.click()` on an anchor produces no success or failure
signal and no completion event, and the call's result is never examined -
`grep -rn "= triggerFileDownload\|await triggerFileDownload" src` returns 0
lines (Section 7). There is no `try`/`catch` around the call either: the
handler at `useDiscussionCapture.ts:524` wraps only the recorder's
construction and `start()`, and `onstop` executes in a later task, outside it.
**A refusal is undetectable in JavaScript as this is written, and I found no
API in the tree that would make it detectable** (`showSaveFilePicker` appears
nowhere; the single `FileSystemFileHandle` hit is `src/lib/backup-dir.ts:94`,
reading an existing directory handle, unrelated).

This is what makes your answer load-bearing: the app cannot ever learn this
for itself, so whatever you observe is the only source of truth the project
will get.

**There is a fallback, and it survives a refusal.** The manual link block at
`DiscussionRepliesPanel.tsx:777-783` / `MessageRepliesPanel.tsx:369-375` is
gated only on `recordingUrl`, which is set at `useDiscussionCapture.ts:503` -
BEFORE the download call at `:513`. So even if the download throws, the link
is already rendered and the recording is still one click away. Nothing is
lost.

**There is no retry.** `triggerFileDownload` appears exactly twice in
`useDiscussionCapture.ts`: the import at `:36` and the single call at `:513`.
No second attempt, no backoff, no re-arm on a later gesture.

**The scope document's "the post-stop UI must differ" requirement IS met as
built.** I checked, because a scope requirement is not evidence that the code
does it. Two structurally separate blocks exist on each panel: the
unconditional `{recordingUrl && (...)}` link, and the narrower
`{lastSessionAutoDownload && recordingBytes > 0 && (...)}` element
(`DiscussionRepliesPanel.tsx:777` and `:791`; `MessageRepliesPanel.tsx:369`
and `:378`). The second is bound to the stopped session's own recorded
request, not the live checkbox, exactly as the scope required.

**But the copy asserts success.** "This should already be in your Downloads
folder" is an affirmative claim, rescued only by its trailing clause "if it
isn't there, use the link above". If refusal turns out to be the normal
outcome rather than the exception, that sentence is wrong on every run and
becomes the thing to change first (Section 5, option A). If refusal is rare,
the sentence is fine as written. **Which way that goes is exactly what your
answer decides**, and it is the cheapest possible remediation either way.

---

## 5. If the answer is bad, what changes - one line each

- **A. Reword only.** Change the extra line from an assertion to a pointer
  ("If it did not download automatically, use the link above"), two files, two
  lines, no behaviour change. Correct response to "works sometimes".
- **B. Promote the manual link.** Render the recording download as a
  contained `Button` rather than a text link inside a `fieldHint` paragraph,
  and focus it after stop - one guaranteed click instead of one unreliable
  zero-click. Correct response to "never works".
- **C. Grant the per-origin permission.** Set Automatic downloads to Allow for
  the app's origin in browser site settings - zero code, but it only fixes
  your own machine, so it ships as a documented setup step plus an in-app hint
  when the feature is enabled. Correct response to "case 1 passes, case 2
  fails".
- **D. Gesture-adjacent re-arm.** Keep the blob, and fire the download from
  the instructor's NEXT click anywhere in the panel rather than from `onstop`.
  Preserves "no hunting for a link" without depending on a non-gesture
  download. Real work in `useDiscussionCapture.ts` plus one panel affordance.
- **E. File System Access API.** Call `showSaveFilePicker` at Start (which IS
  inside the click) and write the blob to the handle on stop. Chromium only,
  needs a capability check and a fallback to B, and it puts a file dialog in
  front of every capture. Only worth it if the download is reliably refused
  and B is judged too lossy.
- **F. Fix only the sharing-bar path.** If case 1 passes and case 3 fails,
  record which stop path ended the session (the `"ended"` listener at
  `useDiscussionCapture.ts:451` versus `stop()` at `:542`) and show different
  copy for the non-gesture path, or stop advertising the sharing bar as an
  equivalent stop at `DiscussionRepliesPanel.tsx:712` /
  `MessageRepliesPanel.tsx:336`. Narrow, and it is what the evidence would
  actually support.

---

## 6. Decision table - each result routes straight to work

| Cases 1 / 2 / 3 | Reading | Routes to |
|---|---|---|
| pass / pass / pass | The browser honours it on every path | Close A20. Optionally A, to soften the copy. Add the behaviour to `docs/REGRESSION.md`, which currently has no A20 entry (Section 7). |
| pass / pass / FAIL | Only the non-gesture path is refused | **F**, plus **A**. Narrow chunk, both panels plus the hook. |
| pass / FAIL / FAIL | The first automatic download per page is allowed, later ones are not | **C** first (confirm by granting the permission and re-running case 2), then **A**. If C fixes it, the residual is "every instructor needs this setting", which is a setup-doc item plus an in-app hint. |
| pass / FAIL / pass | Unexpected - report it verbatim before anyone designs against it | New scoping round; do not guess. |
| FAIL / FAIL / FAIL | The download is refused outright on this origin | **B** (make the link the primary affordance) plus **A**, and consider whether the checkbox should exist at all. **E** only if the zero-click property is worth a save dialog per capture. |
| any PARTIAL (Save as dialog) | Permitted, but interrupts | Not a browser refusal. A UX call: either accept it or document that the feature assumes "Ask where to save each file" is off. |
| any VOID (extra line absent) | The feature did not run | Re-run. If it stays absent with both boxes ticked, it is an app defect, not this question - file it separately against the wiring, not against browser policy. |

Case 4 is orthogonal: if the message-replies surface does not show the extra
line or writes the wrong stem, that is a wiring defect on that surface alone
and does not change any row above.

---

## 7. What I measured, and the command for each number

| Quantity | Command | Result |
|---|---|---|
| A20's own test files all pass | `npm run test:paths -- src/app/components/message-replies/MessageCaptureSettings.wiring.test.ts src/app/components/message-replies/MessageRepliesPanel.wiring.test.ts src/app/components/message-replies/message-replies.structure.test.ts src/app/components/message-replies/useMessagePersistedControls.wiring.test.ts src/app/components/message-replies/useMessageReplies.wiring.test.ts src/app/components/recording/DiscussionCaptureSettings.wiring.test.ts src/app/components/recording/discussion-capture.test.ts src/app/components/recording/recording-split.structure.test.ts src/app/components/recording/useDiscussionCapture.wiring.test.ts src/app/components/recording/useDiscussionReplies.wiring.test.ts` (PowerShell, exit code written to and read from a file) | exit code `0`; `Test Files  10 passed (10)` / `Tests  186 passed (186)` |
| Per-path coverage (the wrapper's own lines, so no path was silently dropped) | same command | `COVERED ...MessageCaptureSettings.wiring.test.ts files=1 passed=14`; `COVERED ...MessageRepliesPanel.wiring.test.ts files=1 passed=15`; `COVERED ...message-replies.structure.test.ts files=1 passed=10`; `COVERED ...useMessagePersistedControls.wiring.test.ts files=1 passed=4`; `COVERED ...useMessageReplies.wiring.test.ts files=1 passed=19`; `COVERED ...DiscussionCaptureSettings.wiring.test.ts files=1 passed=3`; `COVERED ...discussion-capture.test.ts files=1 passed=48`; `COVERED ...recording-split.structure.test.ts files=1 passed=53`; `COVERED ...useDiscussionCapture.wiring.test.ts files=1 passed=9`; `COVERED ...useDiscussionReplies.wiring.test.ts files=1 passed=11` |
| Files in the shipping commit | `git show --name-only --format="" 13cef3b` | 21 paths |
| `triggerFileDownload` references in non-test source | `grep -rn "triggerFileDownload" src --include=*.ts --include=*.tsx \| grep -v "\.test\." \| wc -l` | `61` lines (imports and call sites together, not 61 call sites) |
| `triggerFileDownload` in the capture hook | `grep -n "triggerFileDownload" src/app/components/recording/useDiscussionCapture.ts` | 2 lines: import `:36`, call `:513`. No retry path. |
| The call's result is never read | `grep -rn "= triggerFileDownload\|await triggerFileDownload" src --include=*.ts --include=*.tsx \| wc -l` | `0` |
| No user-activation check anywhere | `grep -rn "userActivation" src --include=*.ts --include=*.tsx \| wc -l` | `0` |
| No save-picker alternative in the tree | `grep -rn "showSaveFilePicker\|FileSystemFileHandle" src --include=*.ts --include=*.tsx` | `1` line, `src/lib/backup-dir.ts:94`, reading an existing handle - unrelated |
| Recorder mime candidates | `grep -n -A16 "^const RECORDER_MIME_TYPES" src/app/components/recording/useDiscussionCapture.ts` | 3 entries, all webm, at `:92` |
| A20 is absent from the regression baseline | `grep -an "A20\|auto-download\|autoDownload" docs/REGRESSION.md` | 2 lines, `:4611` and `:8499`, both about the workflow lecture-zip download, neither about A20. Canary on the same file: `grep -ac "" docs/REGRESSION.md` returns `44544`, so the file was read. |
| This document passes the repo's own byte guards | `npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts` (exit code read from a file) | exit `0`; `Test Files  2 passed (2)` / `Tests  21 passed (21)`; `COVERED src/lib/no-emojis.test.ts files=1 passed=18`, `COVERED src/source-bytes.structure.test.ts files=1 passed=3` |
| Tree state | `git status --short` | Before: ` M docs/css-orphans.md`. After: that line unchanged, plus `?? docs/a20-owner-check.md` (this file) and ` M docs/a29-architecture-small.md`, which belongs to a concurrent seat and which I did not open or write. I touched no source file and no other document. |

Canary discipline: each absence above was run in the same command as a search
that does hit (`triggerFileDownload` at 61, `readLocalStorage` at 13 in
`discussion-persisted-controls.ts`, `44544` lines read in `REGRESSION.md`), so
none of the zeros is a silently broken grep.

---

## 8. What I could not determine, stated plainly

- **Whether any browser actually refuses this download.** No dev server, no
  built app, no rendered component, no network. This is the whole question and
  I cannot answer any part of it.
- **What a refusal looks like in the UI of your browser** - whether a blocked
  automatic download leaves a row in `chrome://downloads`, whether it is
  labelled, whether an address-bar icon appears, and whether anything is
  written to the console. Section 2.3 asks you to record what you see rather
  than to look for something I have asserted will be there, precisely because
  I could not verify any of it.
- **Whether the persisted checkbox survives a page reload** (residual R3 in
  `docs/a20-scope.md` Section 9). The initializer pattern at
  `discussion-persisted-controls.ts:153-155` has bitten this repo before. I
  worked around it in the case list (tick by hand, do not reload) rather than
  claiming either way.
- **Whether `chunksRef` reliably receives a chunk for a very short capture.**
  `recorder.start()` is called with no timeslice (`:522`), so the spec says
  one `dataavailable` fires at stop. I have not observed it. The 10-second
  recommendation exists so this cannot confound the result.
- **Anything about markup, focus or keyboard behaviour.** No component renders
  under any test here. Every statement in Sections 1, 2 and 4 about what the
  instructor sees is read from JSX source.

**On using a browser tool from this session.** I did not, and I do not believe
one would settle this. There is no dev server and no build to point it at; the
capture path requires a real `getDisplayMedia` picker and a user permission
grant; an automation-driven browser runs under a fresh profile whose
automatic-downloads permission state is not yours, and automation harnesses
routinely set an explicit allow-downloads behaviour, which is the exact policy
under test. A green result from here would prove only that a throwaway profile
configured to allow downloads allowed one - which is the failure mode this
whole row exists to avoid. The narrow thing such a check COULD establish is a
generic browser fact ("an `a.click()` from a queued task is honoured in
build X under automation"), and that fact does not route to any work, because
it does not describe the machine or the profile the instructor uses.

---

## 9. Residual register

Each entry names an owner, an instrument and the step that measures it. An
entry missing one of those three would be a deletion, so it is not here.

| # | Not proven now | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| OC1 | Whether the download is honoured from the app's Stop button, first download of the tab | Owner | A real browser; the Downloads folder plus `chrome://downloads` plus the extra line at `DiscussionRepliesPanel.tsx:791` | Case 1, Section 0 |
| OC2 | Whether a SECOND automatic download in the same tab is honoured | Owner | Same, plus the ` (1)` filename convention in 2.2 | Case 2, Section 0 |
| OC3 | Whether the sharing-bar stop path (`useDiscussionCapture.ts:451`) is honoured, given it has no page gesture at all | Owner | Same | Case 3, Section 0 |
| OC4 | Whether the message-replies surface writes `message-replies-capture.<ext>` and shows its extra line | Owner | `MessageRepliesPanel.tsx:378-382` plus the Downloads folder | Case 4, Section 0 |
| OC5 | Whether a refused download is visible anywhere in the browser UI (the assumption Section 2.3 rests on) | Owner | Observation during cases 1-3; record verbatim | Same session; no separate step |
| OC6 | A20's shipped behaviour is not in `docs/REGRESSION.md` (measured, Section 7) | Whoever runs this group's regression pass | `grep -an` on `docs/REGRESSION.md` | The next regression pass covering `recording-capture-surfaces` - not this document, which may edit only itself |
| OC7 | Residual R3 from `docs/a20-scope.md` Section 9 (reload persistence of the new checkbox) is still open and is deliberately side-stepped rather than answered here | Owner | A real browser reload with the key set | Any later session; Section 3 explains why this check avoids it rather than folding it in |

---

## 10. Disposition against `docs/a20-scope.md` Section 8

Section 8 is the prior version of this item. This document does not withdraw
it; it replaces its single case with a runnable set.

| Section 8 said | Disposition |
|---|---|
| "record, stop, and check that a file actually arrives" on both surfaces | **Kept and split.** Cases 1 and 4. |
| "on at least Chrome and Safari" | **Narrowed, with reason.** Section 3: a second browser is diagnostic only after a failure, and Safari mixes the container question into the policy question. Run it if you use Safari; it is not in the minimum set. |
| "Repeat once on a browser known to negotiate a non-webm mime type" | **Handed over to the reader's judgement.** It tests AC6 (the extension mapping), which already has executing unit coverage (`discussion-capture.test.ts`, 48 tests passing, Section 7). It is not part of the browser-refusal question and does not belong in its minimum set. |
| "with real Canvas data" | **Withdrawn.** Measured: neither Start button is gated and neither `start()` wrapper has a precondition (Section 0). Requiring Canvas made the check more expensive than it needs to be, which is part of why it sat for two days. |
| Nothing about the sharing-bar stop path | **Added.** Case 3. It is the only path with no gesture at all, and the app advertises it in copy on both panels. |
| Nothing about a second download in the same page | **Added.** Case 2. Without it, a one-shot pass would be a false all-clear. |
| "Does the new differing-state element read correctly" | **Kept and repurposed.** It is now the discriminator (2.1) that tells a browser refusal from a feature that never ran, not just a copy review. |
