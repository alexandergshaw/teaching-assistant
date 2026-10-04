# Recording-announcement owner walk: does the take route work, and why did it feel "not off the ground"?

Author seat: `loop-seat` (authoring, docs only). Consumer: the repo owner, after a
fresh `loop-checker` reads this. Written 2026-10-04 at HEAD `c542441e`
(`git log -1 --format=%h`). The working tree is dirty with sibling waves
(`git status --short`: `page.tsx`, `recording-launch.ts`, grader and A29 files);
none of those edits touch the take route's files, and every click path below was
read from the tree as it stands (the one `page.tsx` diff changes only how a
recording-launch event routes, not any label used here).

Scope source: `docs/announcement-from-recording-scope.md` (defects G1-G11, ARC-*
criteria, residuals R1-R10) and `docs/rec-w1b-test-notes.md` (residuals
R-W1b-1..4). Shipped code under test: W1a = commit `347d532c`, W1b = commit
`65da662c`.

## READ THIS FIRST: why this is a walk and not a test

None of the checks below can be machine-verified in this repo. Nothing renders
under vitest (it is node-env and collects only `src/**/*.test.ts`), there is no
recorder, no Gemini key, no Canvas and no network here
(`docs/loop/this-repo.md` section 6). A green suite proves nothing about what the
screen shows. Every check below is OWNER-ONLY: it needs your browser, your
microphone, your Gemini key and a Canvas course. They are listed so they are not
forgotten, never so an agent can pick one up or fill in a result.

How to read each check:

- **Click path** = what to do. **Look at** = the one thing to inspect.
- **Pass / Fail / Void** are written so exactly one applies. If none applies,
  mark **VOID**, write down why, and do not guess. A VOID is a result.
- **Closes** names the defect or criterion the check bears on.
- Record the deployed build hash next to every result (PF-1).

## What the machine already covers (so you do not re-check it)

Measured at HEAD with the wrapper, per-argument lines quoted verbatim:

```
npm run test:paths -- src/lib/take-announcement-draft.test.ts src/app/components/recording/useTakeAnnouncement.draft-finalize.wiring.test.ts src/lib/take-transcript.test.ts src/app/components/recording/takeAnnouncementTranscription.test.ts
COVERED src/lib/take-announcement-draft.test.ts files=1 passed=16
COVERED src/app/components/recording/useTakeAnnouncement.draft-finalize.wiring.test.ts files=1 passed=4
COVERED src/lib/take-transcript.test.ts files=1 passed=27
COVERED src/app/components/recording/takeAnnouncementTranscription.test.ts files=1 passed=15
```

(4 files, 62 tests, all passed.) That proves the pure leaves and that
`runDraft` calls `finalizeTakeDraft` (source-text). It does NOT prove: that a real
recorder produces an oversize segment, that Gemini accepts the split pieces, what
any screen shows, or anything about Canvas. Those are the checks below.

## Pre-flight (do once; about 5 minutes)

| Step | Do | Pass |
|---|---|---|
| PF-1 | Record the deployed commit hash. Confirm it contains both ships: `git merge-base --is-ancestor 347d532c <deployed-hash>` and `git merge-base --is-ancestor 65da662c <deployed-hash>` (exit code 0 = contained). For reference both are on `origin/main` as of this writing (`git branch -r --contains <hash>` lists `origin/main` for each). | You have a hash and both commands exit 0. If either exits 1, WK-2 (W1a) or WK-3 to WK-7 (W1b) will FAIL by design: the build is stale, not the walk wrong. |
| PF-2 | Signed in as the app owner, `GEMINI_API_KEY` set in the deployment, microphone permission granted to the site. Transcription always calls Gemini, whatever the provider toggle says (`transcribeLiveAudioAction` goes through `callLlm`, which discards its provider argument: `src/lib/llm.ts:384-385`, `void provider; return callGemini(req)`); drafting calls Gemini under **Gemini** and **Other API** and calls no model under **Embedded Deterministic Engine** (`messaging.ts:417-419`). | A short test take transcribes (that is WK-1). If it does not, that IS the WK-1 result, not a pre-flight failure. |
| PF-3 | A TEST Canvas course in the app that has a Canvas URL. The course picker lists only courses with a `canvasUrl` (`useTakeAnnouncement.ts:412-419`). Final "Confirm post" publishes to every student in the course and the app cannot recall it (`TakeAnnouncementPanel.tsx:597`); use a test course or stop at the armed confirm. | Course appears in the picker on WK-1 step 7. |
| PF-4 | Use a Chromium-based browser, keep the tab in the foreground and do not resize or sleep the machine mid-take. | n/a |

### Click path to the take surface (opened, not recalled)

1. Top tab **Tools** (`src/app/components/tabs/tab-sections.ts:40`).
2. Rail chip **Recording** (`src/app/components/manual/manual-rail.ts:200`).
3. Strip tab **Record announcement** (`RecordingTab.tsx:596`). Shows "Record a new
   take, or pick an existing one below ..." (`RecordingTab.tsx:645`) until a take
   exists.
4. Stage buttons, in order: **Start preview**, then **Record**
   (`StagePanel.tsx:724-731`). While recording: **Pause** and **Stop**
   (`:738-749`). While paused: **Resume** and **Stop** (`:754-771`).
5. After Stop: **Draft announcement** on the take's row (`TakesPanel.tsx:253-255`)
   or on the latest take in the stage (`StagePanel.tsx:456-458`). The panel opens
   titled "Announcement from <take name>" and drafting auto-starts
   (`useTakeAnnouncement.ts:660-675`).
6. Provider toggle (needed for WK-3): top bar **Settings**, section **LLM
   provider**, radio group with options **Gemini**, **Other API**, **Embedded
   Deterministic Engine** (`TopBar.tsx:416-422`, `ProviderToggle.tsx:10-14`).
7. Lecture Script context (needed for WK-5 and WK-6): disclosure **Lecture script
   and teleprompter**, fields **Topic** and **Objectives / notes (optional)**
   (`LectureScriptPanel.tsx:89,94,134`). This panel is hidden while the
   announcement panel is open (`RecordingTab.tsx:655`), so edit it BEFORE opening
   the panel, or press **Back to takes**, edit, and reopen.

### Two facts that change how you run this

- **The run log is per panel-open and is lost when you leave the panel.** It is
  collected inside the hook (`useTakeAnnouncement.ts:849-851`), the panel is
  mounted with `key={take.id}` (`RecordingTab.tsx:818`), and the scope records it
  as not persisted (scope section 1.5). Download it BEFORE pressing **Back to
  takes**. Download buttons: **Download run log (CSV)** and **Download run log
  (JSON)** (`RunLogRow.tsx:27`), directly under the panel heading
  (`TakeAnnouncementPanel.tsx:299`), also present after a post (`:261`). File
  name: `announcement-log-<take-name-slug>-<YYYYMMDD-HHMMSS>.json`
  (`announcement-log.ts:318`).
- **A reopened take skips transcription.** A finished transcript is cached on the
  take (`Take.transcript`, `takeAnnouncementTranscription.ts:322-325`), so reopening
  runs the draft only and the log says `"transcriptionPath": "cached"`
  (`useTakeAnnouncement.ts:641-645`). Use this to run WK-3 to WK-6 on the take from
  WK-1 without paying for transcription again. WK-2 needs its own fresh paused take.

### What the run log can and cannot tell you (read before WK-1)

JSON fields (`announcement-log.ts:290`, `:130-133`, `:118-124`): `exportedAt`,
`takeName`, `takeDurationSec`, `transcriptionPath` (`""`, `"cached"`,
`"segments"`, `"real-time"`), `chunkRetries[]` (`at`, `chunkNumber`, `restart`),
`draftAttempts[]` (`at`, `ok`, `error`), `imageAttempts[]` (`at`, `outcome`,
`error`), `postAttempts[]` (`at`, `ok`, `error`, `imageUploadFailed`, `course`).

The on-screen summary line above the download buttons has the exact shape
`Transcription: segments. 1 draft attempt, 0 failed. Image: 1 generated, 0 failed, 0 discarded. 0 post attempts, 0 failed.`
(`announcement-log.ts:217-226`; before the pipeline starts it reads
`Transcription: not started.`).

**Blind spots, from reading `announcement-log.ts` end to end:** the log does NOT
record the transcription failure message, a "No speech was found" outcome, an
audio-preparation failure, capture failures, or what the course picker showed.
`chunkRetries` only gains an entry if YOU click **Retry from chunk N** or **Start
over** (`useTakeAnnouncement.ts:695-709`), and `transcriptionPath` is set when
drafting STARTS, not when transcription succeeds (`:638-653`). So
`"segments"` plus an empty `draftAttempts` means "transcription did not finish",
and WHY is only on screen in the red alert text. For every failure, copy the
red alert text verbatim as well as downloading the log.

---

## WK-1: THE DIAGNOSTIC (G11 / O1). Run this first. If you do only one thing, do this.

**Closes:** scope G11 (why the route is "not off the ground"), escalation O1
(`docs/announcement-from-recording-scope.md:293-301,561-566,574`); discharges
residuals R2 (real transcription, scope section 11) and the plain-post part of R3.

**Why a clean take:** no pause, no toggle change, no URL tricks, default
provider **Gemini**. This isolates what stops the route for you from the fixes
the other checks test.

**Click path:**

1. Settings > LLM provider: confirm **Gemini** is selected.
2. Tools > Recording > **Record announcement** > **Start preview** > **Record**.
   Speak continuously for about 45 seconds about anything with a deadline in it
   (for example "Lab 5 is due Friday, bring your laptop"). Press **Stop**.
3. Press **Draft announcement** on the take. Watch the panel; write down each
   stage text you see, in order: `Preparing audio`, `Transcribing - chunk N of M`,
   `Writing the announcement`, then the review form (Course, Announcement style,
   Subject, Message, Image) or a red alert.
4. Whichever happens, BEFORE pressing **Back to takes**: press **Download run log
   (JSON)**. If a red alert is showing, copy its text verbatim.
5. If you reached review: Subject and Message are populated, then wait for the
   Image section (a companion image auto-generates once a draft reaches review,
   `useTakeAnnouncement.ts:611-636`; it failing does not block posting).
6. In **Course** under "Post to" choose your TEST course
   (`TakeAnnouncementPanel.tsx:407-432`). If the list is empty or the line
   "Choose a course to post to." / "Could not load your courses - try again."
   shows, write that down (`useTakeAnnouncement.ts:731-735`).
7. Press **Post to Canvas**. This ARMS only: it shows "Posting publishes this
   announcement to every student in <course> immediately ..." with the Subject
   and Body that will be sent (`TakeAnnouncementPanel.tsx:594-618`). Stopping
   here still counts as "reached the post step". Press **Confirm post** only
   against a test course.
8. Download the run log again after step 7 (the log row is also on the posted
   view, `:261`).

**Look at (record all five):**

| Record | Where |
|---|---|
| a. Deployed hash | PF-1 |
| b. Last step reached: capture / transcription / draft / review / post | the stage texts from step 3 and the decision table below |
| c. The red alert text, verbatim, if any | on screen (not in the log) |
| d. `transcriptionPath`, `chunkRetries`, every `draftAttempts[].ok` and `.error`, `postAttempts` | the downloaded JSON |
| e. The summary line | on screen under the heading |

**Pass:** you reached the armed post confirm (step 7) with a populated Subject
and Message, and the JSON shows `transcriptionPath` `"segments"`, at least one
`draftAttempts` entry with `ok: true`, and no `ok: false` entry. The route works
end to end for you. Then "not off the ground" was one of the shipped defects
(now fixed) or a state you have since changed; say which, using the table.

**Fail:** the route stops before step 7. That is not a fail of the walk; it is the
answer. Read the stop point off the decision table below, send back (a)-(e), and
do not run WK-3 to WK-6 on a stopped route until the stop is understood.

**Void:** you never got a take (record failed before the panel could open). Record
the red alert above the Record panel (`RecordingTab.tsx:641`) and the browser
console line `Could not start the audio sidecar:` if present
(`audio-sidecar.ts:160`); that IS a capture-stage finding, not a void in the
diagnostic sense.

### Decision table: "it stopped at X" maps to which defect or residual

Rows are ordered by pipeline step. "Status" says whether the shipped waves
address it.

| Stops at | What you see on screen | Run log signature | Means | Status |
|---|---|---|---|---|
| Capture | No take row; red alert above the Record panel; or a take exists but the log (once the panel opens) says `"real-time"` for a take you just recorded in this session | none (panel may never open); `transcriptionPath: "real-time"` on a fresh take means no audio segments existed (`useRecorder.ts:715-738` sets them only when the sidecar produced at least one) | Capture or sidecar defect. Not in G1-G11 as scoped for fresh takes; NEW finding | NOT covered by W1a/W1b. Report it |
| Transcription, oversize chunk | Red alert starting `Transcription failed on chunk N of M - ` and containing `is too large to upload in one request`, buttons **Retry from chunk N** / **Start over** (`takeAnnouncementTranscription.ts:303`, `upload-budget.ts:90-92`, `TakeAnnouncementPanel.tsx:363-371`) | `"segments"`, `draftAttempts` empty, `chunkRetries` empty unless you clicked retry | G3: a paused take's segment exceeded the wire budget. This is the case W1a was built to fix | Fixed by `347d532c` if deployed. Seeing it on a deployed W1a build = W1a ineffective (WK-2 FAIL). Seeing it on a stale build = PF-1 |
| Transcription, upstream refusal | `Transcription failed on chunk N of M - Transcription failed: HTTP <status>.` (`live-class.ts:179`) | same as above | Gemini rejected the request: key, quota, model or audio format. Scope G11 candidate 1 | NOT a W1 defect. Residual R2 / O3. Send the status number |
| Transcription, server size cap | `... Audio clip is too large to transcribe (~X MB, limit ~7 MB per request). Send a shorter clip.` (`live-class.ts:158`) | same | A request over the 7 MB server cap. Should be impossible after W1a (sub-chunks are at most about 2.6 MB of audio file) | UNEXPECTED. Report with the take duration |
| Transcription, no speech | `No speech was found in this recording.` with a **Try again** button (`TakeAnnouncementPanel.tsx:387-394`) | `"segments"`, `draftAttempts` empty; NOT logged as a stage | Every chunk came back empty: silent mic, wrong device, or you were muted | Capture-side. NOT covered. Check the mic level while recording |
| Transcription, real-time refusal | `This recording is about N minutes long, which is too long to prepare this way ...` or `Could not determine this recording's length ...` (`takeAnnouncementTranscription.ts:102,106`) | `"real-time"` | A library file or a take with no captured audio; scope G7 candidate 3 | NOT covered (W5, gated on forks). Applies only to library files over 20 minutes |
| Draft, embedded refusal | Red alert: `The deterministic engine can't draft an announcement from a recording. Switch to the AI engine and try again.` (`take-announcement-draft.ts:12-13`) | one `draftAttempts` entry, `ok: false`, that text in `error` | G1 under the **Embedded Deterministic Engine** toggle, now refused instead of drafted | Fixed by `65da662c`. Residual R-W1b-2 (route blocked until you switch the toggle). See WK-3, WK-4 |
| Draft, prompt as draft | Review opens with Subject `Write a short announcement for students about this recording` and a Message containing `TRANSCRIPT:` | `draftAttempts` entry with `ok: true` | G1 NOT fixed: build predates `65da662c`, or `runDraft` is not calling the leaf | Defect. PF-1 first; if the hash contains `65da662c`, report it as a W1b wiring failure |
| Draft, blank | Red alert `Generated announcement is empty. Try again.` (`take-announcement-draft.ts:16`) with **Try again** | `draftAttempts` `ok: false` with that text | G2 (blank model result), now refused with a retry | Fixed by `65da662c`. See WK-7 |
| Draft, model or action error | `Draft failed: HTTP <status> - ...` or `Could not parse the draft from the model response.` (`messaging.ts:449,454`) | `draftAttempts` `ok: false` with that text | Gemini failed at the draft call, or answered something that was not the expected JSON | NOT a W1 defect (`draftAnnouncementAction` was deliberately not edited, scope F2=a). Send the text |
| Review, no course | Course select empty or `Choose a course to post to.` / `Could not load your courses - try again.` with **Post to Canvas** disabled | `draftAttempts` ok, `postAttempts` empty | Scope G11 candidate 4: no course has a Canvas URL, or the course list failed to load (`useTakeAnnouncement.ts:408-423,731-735`) | NOT a code defect on the route; owner data/config. Link a course to Canvas |
| Post | Red alert `Canvas refused the announcement - <reason>. Nothing was posted.` (`useTakeAnnouncement.ts:788`) | `postAttempts` `ok: false` with that text, `course` set | Canvas rejected it: token, permissions, course URL. Scope G11 candidate 6 | NOT covered; residual R3 / O2. Send the reason |

If you stop at a row marked NOT covered, the shipped waves did not address what
stopped you, and the scope's wave plan should be re-prioritised on that row.

---

## WK-2: A paused take transcribes (G3 / ARC-T2, shipped W1a `347d532c`)

**Closes:** G3 (pause leaves a segment over the wire budget; scope
`:197-220`); ARC-T2 (scope `:369`); discharges residual R1 (scope `:619`, O4 at
`:577`).

**Why the recipe is exact:** on resume the sidecar restarts a FULL 60 s rotation
timer but keeps the pre-pause audio in the open segment (`audio-sidecar.ts:110-123`),
so one segment grows to (seconds before the pause) + (up to 60 s after). The
largest segment that fits one request is 86.0146 s of audio
(`node -e "const q=Math.floor(3.5*1024*1024/4);const n=Math.floor((3*q-44)/2);console.log(n,n/16000)"`
prints `1376234 86.014625`; derived from `upload-budget.ts:41` and
`take-transcript.ts:101`). A pause under about 26 s in produces a segment that
still fits, so the test would pass VACUOUSLY. Do not use a shorter recipe.

**Click path:**

1. Tools > Recording > **Record announcement** > **Start preview** > **Record**.
2. Speak continuously for about 40 seconds. Press **Pause**. Wait a few seconds.
   Press **Resume**.
3. Speak continuously for about 100 more seconds (total spoken about 140 s). Press
   **Stop**. Expected segmentation: segment 1 = about 40 + 60 = about 100 s
   (over 86.01 s, so it must split into 2 requests: ceil(1,600,000 /
   1,376,234) = 2, ARITHMETIC from `take-transcript.ts:101,114`), segment 2 =
   about 40 s.
4. Press **Draft announcement** on this take. Watch the progress text
   `Transcribing - chunk N of M` (M is the number of rotation segments, expected
   2; the sub-chunk split is invisible in that text and only appears inside an
   error label as "(part 1 of 2)", `takeAnnouncementTranscription.ts:262`).
5. Before leaving the panel, download the run log (JSON).

**Look at:** the stage the panel reaches, any red alert, and the JSON.

**Pass:** the panel reaches `Writing the announcement` and then the review form
with a populated Subject and Message, with NO red alert containing `is too large
to upload in one request`; AND the JSON shows `transcriptionPath` `"segments"`,
`chunkRetries` `[]`, and at least one `draftAttempts` entry. (An empty
`chunkRetries` alone is NOT enough: a stuck take also shows it, per the blind
spots above; the draft attempt is what proves transcription finished.)

**Fail:** a red alert `Transcription failed on chunk N of 2 - ... is too large to
upload in one request`. That is the pre-W1a signature; W1a is absent or
ineffective on the deployed build. Record the exact text and the take length
shown on the take row.

**Void:** (a) you paused earlier than about 30 s in, or recorded under about 50 s
after resuming (segment under 86 s, vacuous); (b) a different red alert from the
decision table (key, quota, no speech, HTTP status); (c) no stage change for
longer than you are willing to wait (your bound, not a code value - there is no
timeout constant on this loop; write down the seconds). In (b) and (c) record the
text; the take is useless for this check, record a new one.

---

## WK-3: Embedded engine refuses instead of drafting the prompt (G1 / ARC-D2, shipped W1b `65da662c`)

**Closes:** G1 (scope `:170-183`); ARC-D2 (scope `:371`). The machine already
asserts the leaf returns the refusal for the real embedded scaffold and that the
mutant (prompt-as-draft) is real: `src/lib/take-announcement-draft.test.ts` tests
"precondition: the real embedded scaffold really carries the prompt" and
"refuses the embedded scaffold with the embedded refusal" (16 passed above). What
only you can see is the screen.

**Click path:**

1. Use the take from WK-1 (transcript cached) or any take.
2. Settings > LLM provider > **Embedded Deterministic Engine**.
3. Tools > Recording > **Draft announcement** on that take. A take with no cached
   transcript transcribes first (Gemini, regardless of the toggle, `llm.ts:384-385`)
   and refuses at the draft step; a cached one goes straight to the draft step
   (`"transcriptionPath": "cached"`).
4. Look at the panel. Download the run log (JSON) before leaving.

**Look at:** the red alert text, whether a review form appears, and the Subject.

**Pass (all three):** (i) a red alert reading exactly `The deterministic engine
can't draft an announcement from a recording. Switch to the AI engine and try
again.` with a **Try again** button (`TakeAnnouncementPanel.tsx:373-377`); (ii) NO
review form (no Subject/Message fields); (iii) the JSON has one `draftAttempts`
entry with `ok: false` and that text in `error`. (The status line above the alert
may read `Could not draft the announcement - ` followed by the same text; that is
the screen-reader announcement, `useTakeAnnouncement.ts:548`, and is fine.)

**Fail:** the review form opens, OR Subject is `Write a short announcement for
students about this recording`, OR Message contains `TRANSCRIPT:` or the
standing instruction text. That is G1 live. Copy the Subject and the first 300
characters of Message.

**Void:** the provider radio did not actually change (re-open Settings and confirm
**Embedded Deterministic Engine** shows selected), or the failure was a different
red alert (see decision table).

**Non-gating observation to record (feeds residual R-WK-1):** the refusal says
"Switch to the AI engine" but the toggle has no option by that name (its labels
are Gemini, Other API, Embedded Deterministic Engine). Write down whether you
knew which one to pick without guessing.

## WK-4: Recovery from the refusal (R-W1b-2)

**Closes:** residual R-W1b-2 (`docs/rec-w1b-test-notes.md:135`): refusing
"embedded" blocks the route until the toggle is switched. This check measures
how bad that is for you.

**Click path:** with the WK-3 red alert still showing, open Settings > LLM
provider > **Gemini**, close Settings, press **Try again** in the panel
(`TakeAnnouncementPanel.tsx:373-377`). `retryDraft` re-reads the provider at call
time (`useTakeAnnouncement.ts:529,711-713`) and does not retranscribe.

**Look at:** the panel after **Try again**.

**Pass:** the panel goes to `Writing the announcement`, then the review form with
a Subject that is a short specific subject line and a Message addressed to
students. The JSON then shows two `draftAttempts` entries: first `ok: false` (the
refusal), then `ok: true`.

**Fail:** **Try again** refuses again with the same text after the toggle shows
**Gemini**, or the panel cannot be recovered without closing it. Record which.

**Void:** the red alert was not the embedded refusal (WK-3 did not pass).

## WK-5: A permitted URL survives byte for byte (G4c / ARC-D3 kept half)

**Closes:** G4c (scope `:228-233`); ARC-D3, kept half (scope `:372`). The guard
permits only URLs found in the transcript, Topic, Objectives, title card title and
title card subtitle (`take-announcement-draft.ts:30-36`). Spoken URLs are an
unreliable carrier (a transcript rarely contains one), so this check puts the
URL in **Objectives / notes (optional)**, which is a carrier and is inserted in
the prompt as `Learning objectives: ...` (`take-announcement.ts:231-233`).

**Click path:**

1. Provider: **Gemini** (Settings > LLM provider).
2. Before opening the panel: expand **Lecture script and teleprompter** and in
   **Objectives / notes (optional)** type exactly
   `Lab 5 handout: https://example.edu/cs101/lab5`.
3. Use the WK-1 take (cached transcript) and press **Draft announcement**. If the
   transcript does not mention the lab, that is fine; the model may still include
   the handout line. If the Message has no URL, press **Regenerate announcement**
   up to 3 times (do not edit the fields first; editing arms a confirm step).

**Look at:** the **Message** field, and the download JSON.

**Pass:** the Message contains the string `https://example.edu/cs101/lab5`
exactly as typed, character for character (no trailing character changed, no
markdown link wrapping).

**Fail:** the URL appears but altered, OR the Message reads as though the URL was
cut out (for example "the handout is at ." with nothing after "at") on a draft
where the model clearly meant to give it. Copy the sentence.

**Void:** after 3 attempts the Message contains no URL at all. The model chose
not to write it; the machine test "keeps the transcript URL byte for byte"
(`take-announcement-draft.test.ts`) is the real instrument for this half and
already passes.

## WK-6: An unpermitted URL is stripped (G4c / ARC-D3 stripped half, ARC-L1)

**Closes:** G4c; ARC-D3 stripped half; the removal test ARC-L1 (scope `:372-373`).
The take prompt tells the model not to invent links
(`take-announcement.ts:115`), so the model rarely writes one and this check is
frequently VOID. Honest expectation: the unit test is the strong instrument; this
is a best-effort screen check.

**Click path:**

1. Provider **Gemini**. Clear Topic and Objectives. Record a NEW short take
   (about 30 s) saying: "This week read the Python documentation page on for
   loops, and the official style guide." (a resource named with no URL). Stop.
2. **Draft announcement**. In review, under "Announcement style", open **This
   announcement should include** and select **two or three relevant resources**.
3. Press **Regenerate announcement** (up to 3 times, no field edits).
4. Read the Message for any string starting `http://` or `https://`.

**Pass:** the Message contains NO `http://` or `https://` string (every URL the
model tried to add was removed), OR every such string appears in your own
transcript/Topic/Objectives. (Because stripping is silent, a Pass here cannot
distinguish "model wrote none" from "guard removed it"; see Void.)

**Fail:** the Message contains an `http://` or `https://` URL that is in none of
your carriers (you never said or typed it). That is an invented URL that reached
review: G4c live.

**Void:** you cannot tell whether the model tried to write a URL. This is the
common outcome. Record "no URL appeared in 3 regenerations" and rely on the unit
test. Do not mark it Pass if you cannot tell; Pass here means only "nothing
unpermitted reached review".

**Non-gating observation (feeds residual R-WK-3):** the guard's bare-URL pattern
requires `http://` or `https://` (`walkthrough-announcement-link-guard.ts:57`), so
a scheme-less `www.example.com` in plain text is NOT touched. If you see one in
the Message, record it; it is a READ-derived gap, not observed in a browser.

## WK-7: A blank model draft becomes a failed-draft stage (G2 / ARC-D1)

**Closes:** G2 (scope `:185-195`); ARC-D1 (scope `:370`). The machine asserts the
blank cross-product (title and message, empty / whitespace / present) in
`take-announcement-draft.test.ts` ("ARC-D1: a blank model result never reaches
review", 16 passed above).

**Not forceable from the UI.** No control makes Gemini return a blank title or
message, and I found no non-code way to induce it; the server action's reply is
produced inside `messaging.ts:462`. I did not invent a recipe (the only option I
can think of, rewriting the server-action response in browser DevTools, is
untested here and fragile, so it is not offered). The failed-draft stage's
RENDERING (red alert plus **Try again**) is already exercised by WK-3, which uses
the same `{phase: "failed", stage: "draft"}` path (`useTakeAnnouncement.ts:547`,
`TakeAnnouncementPanel.tsx:373-377`). So this check is opportunistic.

**Click path:** none. Watch for it during ANY draft in WK-1 to WK-6.

**Pass:** you see a red alert reading exactly `Generated announcement is empty.
Try again.` with a **Try again** button, and NO review form with empty Subject or
Message fields, and the JSON `draftAttempts` has an `ok: false` entry with that
text.

**Fail:** you land on a review form whose Subject or Message is empty.

**Void (the expected result):** it never occurred. Record "not observed in N
drafts". It is NOT a failure and does not block shipping W1b; the unit test
carries it. It stays a residual (R-WK-2).

---

## Results sheet (copy, fill in, send back)

| Check | Result (Pass / Fail / Void) | Deployed hash | Evidence (alert text, JSON file name) |
|---|---|---|---|
| WK-1 diagnostic (last step reached: ____) | | | |
| WK-2 paused take | | | |
| WK-3 embedded refuses | | | |
| WK-4 recovery | | | |
| WK-5 permitted URL kept | | | |
| WK-6 unpermitted URL stripped | | | |
| WK-7 blank draft | | | |

Count: 7 checks (WK-1 to WK-7) and 4 pre-flight steps (PF-1 to PF-4).

Send back: the results sheet, every downloaded run-log JSON, the verbatim red
alert text for each failure, and the deployed hash. Do not paraphrase an alert.

## Residual register (not proven by this walk; each has owner, instrument, step)

| Id | Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R-W1b-1 | The client-side leaf cannot see the writing-style sample (fetched server-side in `messaging.ts:421` and never returned), so a URL present ONLY in your style sample is stripped as unpermitted. Source: `docs/rec-w1b-test-notes.md:134` | architect (confirm acceptable); repo owner (product: must style-sample links survive?) | READ of `messaging.ts:421`; owner observation: if a draft ever loses a link you expected from your own past announcements, note the link and where it came from. No check in this walk can force it | architect pass on the W1b seam; owner decision recorded in `docs/BACKLOG.md` |
| R-W1b-2 | Refusing "embedded" blocks the route until the toggle is switched. Source: `docs/rec-w1b-test-notes.md:135` | UX seat (W3 copy); repo owner | WK-3 and WK-4 on a real browser; no render exists under vitest | W3 UX pass, then WK-3/WK-4 re-run on the deployed build |
| R-WK-1 | The refusal text says "AI engine" while the toggle labels are Gemini / Other API / Embedded Deterministic Engine (`take-announcement-draft.ts:12-13` vs `ProviderToggle.tsx:10-14`); the copy may not map to a visible option | UX seat (W3 copy) | WK-3 non-gating observation (could you tell which to pick) | W3 UX pass |
| R-WK-2 | G2 blank draft cannot be forced from the UI, so the rendered blank-draft stage is only inferred from the shared `failed:draft` path | repo owner (opportunistic watch); orchestrator (files the row if it is wanted forced) | WK-7 watch during normal use; the leaf unit test for the logic | WK-7 watch on every future owner-run draft; after the WK-1 results the orchestrator decides whether a force-it row is wanted |
| R-WK-3 | The URL guard does not touch a scheme-less `www.` link in plain text (regex needs `http://` or `https://`, `walkthrough-announcement-link-guard.ts:57`); READ-derived, never observed in a browser | architect / security seat | WK-6 non-gating observation; a unit test over `stripUnpermittedUrls("see www.example.com", new Set())` would measure it (not written) | next security pass on the take route |
| R-WK-4 | The run log omits transcription failure text, no-speech outcomes, audio-stage failures and course-picker state, so a stalled run needs the on-screen text as well as the log (`announcement-log.ts:118-124`) | orchestrator (files the row after WK-1) | WK-1 itself: if the blind spots cost you the diagnosis, say so | decide after WK-1 whether a log-extension chunk is wanted |
| R-W1b-3 / R-W1b-4 | Normalizer drift between collector and stripper; D2 input built from live producers | implementer / checker | machine tests (`take-announcement-draft.test.ts`, 16 passed above). NOT part of this walk | every future run of `npm run test:paths -- src/lib/take-announcement-draft.test.ts` (machine-owned; no owner step) |
| R3-rest | Scheduled post, `delayed_post_at`, image-in-post beyond what WK-1 step 7-8 touches | repo owner | Canvas UI (scope O2) | after W3 ships; not in this walk (W3 is not built) |

## Measured quantities and the commands that produced them

| Quantity | Value | Command |
|---|---|---|
| HEAD | `c542441e` | `git log -1 --format=%h` |
| Max sub-chunk, samples / seconds | 1,376,234 / 86.014625 | `node -e "const q=Math.floor(3.5*1024*1024/4);const n=Math.floor((3*q-44)/2);console.log(n,n/16000)"` |
| Sub-chunks for a 100 s segment | 2 | ARITHMETIC: ceil(1,600,000 / 1,376,234); from `take-transcript.ts:101,114`, not observed in a browser |
| Machine coverage of the shipped leaves | 4 files, 62 tests passed | `npm run test:paths -- <the 4 paths above>` (lines quoted above) |
| W1a / W1b contained in `origin/main` | yes / yes | `git branch -r --contains 347d532c` and `git branch -r --contains 65da662c` (each listed `origin/main`) |
| W1a / W1b write sets | W1a: `take-transcript.ts`, `take-transcript.test.ts`, `takeAnnouncementTranscription.ts`; W1b: `take-announcement-draft.ts`, its test, the wiring test, `useTakeAnnouncement.ts`, `walkthrough-announcement-link-guard.ts` | `git show --stat --format=%h 347d532c 65da662c` |

## What I could not determine

- Whether a real browser produces a segment over 86 s after a pause (arithmetic
  from source only; WK-2 is the instrument).
- Whether Gemini accepts each split piece or returns text for it (WK-1/WK-2 are
  the instruments; needs your key).
- Why the route felt "not off the ground": WK-1 is the instrument; I did not and
  cannot observe it.
- Whether the deployed build contains `347d532c` and `65da662c` (PF-1; I can only
  say both are on `origin/main`, not what Vercel built).
- Anything about how any screen renders. Every UI string above was read from
  source, not seen.
