# WA-POST-RETRY scope: one-click re-post after a FAILED walkthrough announcement post

Status: scope + security-seat threat model + fix-shape recommendation. Not a
build, no test code. Authored by the `loop-seat` (Sonnet) for a fresh
`loop-checker` to attack before anything is built from it.

Backlog row: `docs/BACKLOG.md:189` (`WA-POST-RETRY`, state `unscoped`, filed
2026-10-04, blocked_by `WA-POST-LOCK`, which has since landed: `b7931c4d`,
verify SHIP at `9a73295b`). Repo HEAD when measured: `9a73295b`
(`git rev-parse HEAD`, 2026-10-04). `git diff --stat HEAD -- src` printed
nothing, so the working tree under `src/` equals HEAD and every line number
below is a HEAD line number. File sizes by `@(Get-Content <f>).Count`
(PowerShell): `announcement-draft-slots.ts` 583, `useAnnouncementDraftSlots.ts`
539, `AnnouncementDraftSlot.tsx` 398, `useWalkthroughGenerationAdapters.ts` 99,
`announcement-draft-slots.test.ts` 867, `announcement-post-lock.test.ts` 230.

Where a claim is a READ of code rather than an executed result it says READ.
Nothing renders under vitest here, there is no live Canvas and no network, so
felt behaviour is an owner walk (section 9). I ran no test and edited no
source; this document is the only file written.

Triage record (`docs/loop/seats.md` Triage table): bug fix, so no LEVERAGE
CLAIM. Security seat: fired (irreversible outward publish; this document is
that pass). Data/storage seat: not fired (nothing persisted; the fix adds no
key and no field). UX seat: fires at the build for copy only (section 7).
Reuse survey: done in section 5.3 (the repo already has the shape).

Scope boundary honoured: only announcement files were read for the fix. Two
read-only look-ups outside the three named files (`src/lib/canvas-fetch*.ts`,
`src/lib/canvas/announcements.ts`, `src/lib/canvas-core.ts`) were needed to
decide the discrimination question; none is edited by this plan. No grading,
repo-grades or ingestion file was opened.

---

## 1. The bug, confirmed against the tree

Verdict: CONFIRMED by READ, every hop opened.

### 1.1 The trace

| Hop | File:line (HEAD) | What it does |
|---|---|---|
| Arm click | `AnnouncementDraftSlot.tsx:285` -> `useAnnouncementDraftSlots.ts:470-485` | First `armPost` call: `postSignatureFor(slot)` (`:206-215`), `slot.postArmedFor !== signature`, so dispatches `arm-post` (`:482`); reducer stores the signature (`announcement-draft-slots.ts:538-543`) |
| Armed render | `WalkthroughAnnouncementPanel.tsx:765` | `postArmed={isConfirmArmed(slot.postArmedFor, postSignatureFor(slot) ?? "")}`; `isConfirmArmed` is `armedFor !== null && armedFor === current` (`content-tab/modules/confirmArming.ts:26-28`) |
| Armed button | `ConfirmArmButtons.tsx` (`label`/`onClick` lines): `onClick={armed ? onConfirm : onArm}` | The ONE button becomes "Confirm post" and its click calls `onConfirm`, wired to `onPostArm` again (`AnnouncementDraftSlot.tsx:286`) |
| Confirm click | `useAnnouncementDraftSlots.ts:478-481` | `slot.postArmedFor === signature` -> `commitPost(id)` |
| Commit | `useAnnouncementDraftSlots.ts:424-468` | Pre-flight errors at `:441-449`; then `dispatch({type:"posting"})` at `:451`, then `promise.then(onOk, onRejected)` at `:452-465`. **Nothing in commitPost or the `posting` case clears `postArmedFor`** (`announcement-draft-slots.ts:550-552` sets only `posting:true, postError:null`) |
| Error arm | `announcement-draft-slots.ts:553-557` | `if ("error" in action.result) { return { ...slot, posting: false, postError: action.result.error }; }` - **PRESERVES `postArmedFor` by the spread**. The success arm at `:558-565` is the only place the arm is cleared (`postArmedFor: null` at `:564`) |

### 1.2 State left after each failure kind (READ)

| Failure | Where dispatched | `postArmedFor` after | `postLocked` after | `postError` | `posting` |
|---|---|---|---|---|---|
| Invalid scheduled time (pre-flight) | `useAnnouncementDraftSlots.ts:442-445` | unchanged (still armed) | `false` | set | unchanged `false` |
| No course (pre-flight) | `:447-450` | unchanged (still armed) | `false` | set | unchanged |
| Server action RETURNED `{error}` (wrapped by adapter) | `:453-458` via `useWalkthroughGenerationAdapters.ts:89-91` | **still armed** | `false` | set | `false` |
| Server action promise REJECTED | `:459-464` | **still armed** | `false` | "Could not reach the server - the post may or may not have gone through." (`:463`) | `false` |

### 1.3 The one-click re-post, confirmed

After any of the four rows: `postSignatureFor(slot)` depends only on slot id,
draft title, draft message and `scheduledAt` (`:206-215`), none of which the
error arm changes, so `isConfirmArmed(slot.postArmedFor, sig)` stays `true`
(`WalkthroughAnnouncementPanel.tsx:765`). The slot re-renders with the
"Confirm post" button, the warning consequence notice
(`AnnouncementDraftSlot.tsx:336-354`) AND the red error alert above it
(`:263-267`). One click on "Confirm post" runs `armPost` -> `mayCommitPost` ->
`slot.postArmedFor === signature` -> `commitPost` -> a second POST to Canvas.

### 1.4 WA-POST-LOCK's new guard does NOT block this (confirmed)

`mayCommitPost` is `slot.draft.phase === "drafted" && !slot.postLocked &&
!slot.posting` (`announcement-draft-slots.ts:394-396`). After a failure
`phase` is `"drafted"`, `postLocked` is `false` (the error arm never sets it;
pinned as WA-POST-LOCK AC-2, `announcement-post-lock.test.ts:51-55`) and
`posting` is `false` (`:556`). So `mayCommitPost` returns `true`, both early
returns in `armPost` (`:475`) and `commitPost` (`:429`) pass, and the
one-click path is open. `postLocked` sets only on success (`:563`).

Claim made by the backlog row: confirmed. Row's line hint (`~:540-542`) is
stale; the real arm is `:555-557`.

---

## 2. Can the two failure modes be told apart? NO, not today

This is the crux the WA-POST-LOCK scope flagged. Finding: **the code does not
carry a discriminator, and the "clean refusal" path is not actually clean.**

### 2.1 What the reducer sees

`"post-result"` carries `result: { course; scheduledLabel } | { error: string }`
(`announcement-draft-slots.ts:421-425`). There is no kind, no flag; the only
difference between a refusal and a rejection is the English text.

### 2.2 What the layers below it do (READ, every hop opened)

1. `postWalkthroughAnnouncementAction` (`src/app/actions/walkthrough-announcement.ts:595-609`)
   wraps EVERYTHING in `try/catch` and returns `{ error: err.message }`. It
   never lets a throw escape, so the client "rejected promise" arm
   (`:459-464`) is reached only when the action transport itself fails
   (connection lost, platform timeout, deployment skew), not when Canvas
   misbehaves. `src/app/page.tsx` sets no `maxDuration`
   (`grep -n maxDuration src/app/page.tsx src/app/layout.tsx` printed
   nothing); `src/app/actions/command-interface.ts:28` states the same.
2. The adapter (`useWalkthroughGenerationAdapters.ts:88-91`) turns EVERY
   returned `{error}` into: `Canvas refused the announcement - ${result.error}.
   Nothing was posted.`
3. But `createAnnouncementFromMarkdown`
   (`src/lib/canvas/announcements.ts:420-458`, body at `:428-457`) can throw AFTER Canvas created
   the topic or when it is unknown whether it did:
   - `canvasRequest` throws `"Canvas did not respond."`
     (`src/lib/canvas-fetch-response.ts:137`) on `kind: "unreachable"`, and
     `canvasFetch` maps a `network-error` to `unreachable`
     (`src/lib/canvas-fetch.ts:312-314`). `network-error` is produced from the
     request error handler (`:436`), the response-stream error handler
     (`:432`) and the response-size cap (`:417`) - i.e. a timeout or reset
     AFTER the request body was written (`req.end(init.body)` at `:439`).
     The 15 s default deadline is `DEFAULT_TIMEOUT_MS` (`:161`).
   - A non-2xx that is not 401/403/404 becomes `Canvas request failed (HTTP N).`
     (`src/lib/canvas-core.ts:101-115`, `default` arm). A 502/504 from a proxy
     in front of Canvas is exactly the "created but the answer was lost" shape.
   - `(await response.json())` at `announcements.ts:456` runs AFTER a 2xx; a
     body-parse failure there throws, the topic exists, and the user is told
     "Nothing was posted."
4. Genuinely clean refusals also arrive as the same `{error}` string: empty
   title/message (`announcements.ts:428-429`), host not allowed
   (`canvas-fetch-response.ts:131-133`), 401/403/404, and `requireUser` failure.

### 2.3 Classification

| Class | Examples | Nothing was posted? | Distinguishable in code today? |
|---|---|---|---|
| A. Pre-flight, never sent | `useAnnouncementDraftSlots.ts:443`, `:448` | Provably yes | Yes (different call site) but both dispatch the same untagged `post-result {error}` |
| B. Canvas/user refusal | 401/403/404, validation, host refusal | Yes in practice | No: same `{error}` shape as C |
| C. Ambiguous, returned as `{error}` | "Canvas did not respond.", HTTP 5xx, post-2xx parse failure | **UNKNOWN**, yet the adapter says "Nothing was posted." | No, and the copy over-claims |
| D. Ambiguous, transport rejection | action promise rejects | UNKNOWN; copy already says so (`:463`) | Yes (own `.then` arm) but untagged in the reducer |

Consequence: the premise "a clean Canvas refusal may keep the arm" cannot be
implemented safely without first adding a classifier through four layers
(action, adapter, hook, reducer payload). And the existing copy is itself a
defect in the user's moment of confusion (class C is told "Nothing was
posted"). That second point is a NEW finding (F-3 in section 10).

---

## 3. Fix shapes

Baseline click cost today: normal flow 2 clicks (arm, confirm). Failure then
retry, current behaviour: 1 click (the dangerous path). A normal flow must not
gain a click in any shape.

| | (a) Clear the arm on every post error | (a') Clear on ambiguous only (needs classifier) | (b) Explicit "uncertain" state + acknowledgement | (c) Fail-closed: set `postLocked` on rejection |
|---|---|---|---|---|
| Files | `announcement-draft-slots.ts` (+1 line at `:556`), new test file; copy in `useAnnouncementDraftSlots.ts:463` and `useWalkthroughGenerationAdapters.ts:90` | (a) PLUS `src/app/actions/walkthrough-announcement.ts`, the adapter, the hook, the reducer payload type, and the tests that build `post-result` | `announcement-draft-slots.ts` (new `DraftSlot` key + action), hook, `AnnouncementDraftSlot.tsx` (notice + gating), `WalkthroughAnnouncementPanel.tsx` if a prop is added | `announcement-draft-slots.ts`, hook (needs a rejection tag), `AnnouncementDraftSlot.tsx` hint copy (currently says "This draft is already on Canvas", `:379-383`, which would be false) |
| New state / action / canary | None. No new `DraftSlot` key, no new action type | Payload type widening; no new action type; every existing `post-result` literal in tests (`announcement-draft-slots.test.ts:608,621,631,639`; `announcement-post-lock.test.ts:43,53,59,131,160,175,181`) must adapt | +1 `DraftSlot` key (the frozen reset oracle `announcement-draft-slots.test.ts:829-848` must be edited) AND, if the acknowledgement is its own action, an 18th `SlotsAction` member (canary `announcement-draft-slots.test.ts:772-799` and the 17-cell table `announcement-post-lock.test.ts:79-143` must grow; both are `Record<SlotsAction["type"], ...>` and fail `tsc`) | A discriminator in the payload (as a'), or a rejection-only action |
| Prevents the one-click duplicate? | YES (first click after a failure only re-arms) | YES for C/D only if the classifier is right; a mis-classified ambiguous failure keeps the one-click path | YES if `mayCommitPost` gains a term; only WARNS if the notice is advisory | YES and stronger: no second post until an edit or Regenerate |
| Traps a legitimate retry? | No: `mayCommitPost` stays `true`; retry = arm + confirm | No for A/B; same as (a) for C/D | No if the ack is folded into arm (2 clicks); 3 clicks if a separate ack button | **YES**: a true Canvas outage leaves the user with a locked draft and a false "already on Canvas" hint; escape is a pointless edit |
| Click cost of the retry | 2 (was 1). Normal flow unchanged | 1 for A/B (kept arm), 2 for C/D | 2 or 3 | 2 plus a forced edit |
| Honesty about the unknown | Copy-only (section 7) | Copy can be exact per class | Dedicated notice | Wrong copy unless rewritten |
| Reuse | Same shape as the repo's bulk-message panel (section 5.3) | Same shape as `outcome.status === "unknown"` in the bulk path (`bulk-course-message.ts:31,112`) | None | Reuses `postLocked` |

---

## 4. Security-seat threat model

Threat: an ACCIDENTAL one-click duplicate publish to every enrolled student, at
the moment the user is confused by an error. The act is irreversible and
outward-facing: the confirm notice itself says "this app cannot recall or
delete it afterward" (`AnnouncementDraftSlot.tsx:347-349`). It is a
reliability/integrity threat from a trusted user, not an attacker; no new
trust boundary is crossed.

Why it is worse than WA-POST-LOCK's two-click case: it needs ONE click, the
armed "Confirm post" button is already on screen and visually primary, and it
is triggered when the user's attention is on the red error text, not on
whether the post landed. For class C/D the post probably DID land; the
re-post is then a duplicate with high probability.

Judgement per shape:

- (a) Closes the one-click path. The confirm step is restored, with a fresh
  consequence notice re-rendered on re-arm (`:336-354`) while the error alert
  stays visible (the `arm-post` case does not touch `postError`,
  `announcement-draft-slots.ts:538-543`; only `posting` clears it, `:551`).
  It converts an accidental duplicate into a deliberate one; it cannot make a
  deliberate two-click re-post impossible, and nothing client-side can, because
  the client cannot know whether the topic exists. It adds no trap.
  Residual probability falls from "any confused click" to "two deliberate clicks".
- (a') Same protection, but its safety depends on a classifier that does not
  exist, and a wrong "clean" verdict re-opens exactly the irreversible path.
  The asymmetry decides: saving one click on a RARE failure path is worth less
  than any chance of one-click mass-republish. Not recommended now.
- (b) Prevents only if it gates; it costs a new state, an action or a click,
  and its extra value over (a)+copy is a more insistent message. Marginal.
- (c) Strongest prevention, false-safe: it frustrates a genuine outage retry
  and makes the UI state a lie ("already on Canvas"). Rejected.

Does clearing the arm block a legitimate retry? No. It does not touch
`postLocked` or `mayCommitPost`; the button returns to idle "Post to Canvas",
one click re-arms (the same click a first post takes) and the next confirms.
The retry is never refused, it is only no longer free.

Interaction with `WA-POST-DEDUP` (`docs/BACKLOG.md:224`, owner-blocked):
client state is in-memory per slot, so a reload loses both the draft and any
lock, and a second tab has its own slots. (a) reduces the one-tab blast radius;
the cross-tab, cross-reload and "user deliberately re-posts after a class C/D
failure" cases are closed only by a server-side check. This fix must not be
reported as "re-publish is fixed".

---

## 5. Recommendation

### 5.1 Shape and why (one line)

**(a): clear `postArmedFor` in the `"post-result"` error arm for EVERY error,
plus honest "check Canvas before posting again" copy** - it closes the one-click
duplicate with a one-line reducer change, no new state, no new action type, no
canary movement, and it needs no failure classifier, which the code cannot
supply (section 2).

### 5.2 Fork statement (product fork, my reading acted on in this scope)

Reading acted on: (a). Owner-confirmable in one line, and EITHER answer ends
the activity: "After a failed announcement post, is a fresh Post-then-Confirm
(plus a 'check Canvas first' message) enough, or do you want a separate 'I
checked Canvas' acknowledgement before it can post again?" If (b), the cost is
section 3's (b) column: one `DraftSlot` key, possibly an 18th action, a frozen
oracle edit, +1 click. The (a) work is not wasted by a (b) answer: the clear in
the error arm stays, (b) layers a flag on top. Nothing is blocked on the answer.

### 5.3 Reuse survey (grep, not recall)

The repo already contains this exact shape. `BulkCourseMessagePanel.tsx`
clears its confirm on BOTH outcomes of a send, success and the ambiguous catch
(`setConfirmed(null)` at `:131` and `:137`), and its ambiguous-copy reads
"Canvas did not confirm the message. It may or may not have gone out. Check your
Canvas Inbox before trying again, so it is not posted twice." (`:135`, and
`bulk-message-model.ts:127-133`). The send there also has a tri-state
`accepted | unknown | error` at the action layer (`bulk-course-message.ts:31`,
`:112`) - the classifier that option (a') would need; the announcement action
has none. Message replies carry a `checkSent` re-check
(`message-replies/useMessageDelivery.ts:60`, `useMessageReplies.ts:217`),
i.e. the repo's strongest answer to the same problem; out of scope here.

### 5.4 What is NOT removed or weakened

- No confirm is removed. The change ADDS a confirm back on the failure path.
- Success path untouched: the success arm (`:558-565`) is not edited; normal
  flow stays 2 clicks.
- `postLocked` untouched (sets at `:563`, clears at `:473` and `:527`).
- `mayCommitPost` untouched and needs no new term (section 6).
- Pinned existing behaviour: the existing source pin that commit happens only
  on the second call (`useAnnouncementDraftSlots.test.ts:270-274`,
  `/postArmedFor\s*===\s*signature/` in the `armPost` slice) is NOT edited.

---

## 6. Collision and composition with WA-POST-LOCK (`b7931c4d`)

Current line numbers (HEAD `9a73295b`), shifted from the WA-POST-LOCK scope's:

| Item | File:line |
|---|---|
| `DraftSlot.postArmedFor`, `.postError`, `.postLocked` | `announcement-draft-slots.ts:125`, `:128`, `:144` |
| `mayCommitPost` | `:394-396` |
| `SlotsAction` union (17 members; `post-result` at `:421-425`) | `:406-427` |
| `edit` clears lock and arm | `:466-480` (`postLocked:false` `:473`, `postArmedFor:null` `:474`) |
| `result` (fresh draft) clears lock and arm | `:511-537` (`:527`, `:528`) |
| `arm-post`, `cancel-post` | `:538-549` |
| `posting` | `:550-552` |
| `post-result` (error arm `:555-557`; success arm `:558-565`) | `:553-567` |
| `commitPost` (mayCommitPost guard `:429`, pre-flight errors `:441-449`, `posting` `:451`, rejection copy `:463`) | `useAnnouncementDraftSlots.ts:424-468` |
| `armPost` (guard `:475`, commit-on-armed `:478-481`) | `:470-485` |
| Adapter "Nothing was posted." | `useWalkthroughGenerationAdapters.ts:89-91` |
| Post button `disabled=` (reads `postLocked`) | `AnnouncementDraftSlot.tsx:278-284` |
| Already-posted hint | `:379-383` |

Composition: clearing `postArmedFor` is ENOUGH; `mayCommitPost` needs no new
term. Reason: `armPost` decides arm-vs-commit by `postArmedFor === signature`
(`:478`), independent of `mayCommitPost`, which only gates lock, in-flight and
phase. Adding "no `postError`" to `mayCommitPost` would turn a failure into a
hard block (a trap) and would break WA-POST-LOCK's 12-cell grid
(`announcement-post-lock.test.ts:189-` AC-6). Interaction cases, all executed
by reducer in section 8:

- error on a locked slot: stays locked AND arm cleared (fail-safe both ways);
- edit after failure: `edit` already clears the arm (`:474`), unchanged;
- regenerate/new draft after failure: `result` success already clears arm
  (`:528`) and `postError` (`:531`), unchanged;
- success after an earlier failure: success arm unchanged.

Existing assertions that pass BECAUSE the error arm preserves the arm:
**none found.** `grep -n postArmedFor` over every `*.test.ts` (output read in
full): `announcement-draft-slots.test.ts:400-404, 515-530, 573-579, 605-619,
837`, `announcement-post-lock.test.ts:116`, `useAnnouncementDraftSlots.test.ts:272`.
None asserts the arm after a `post-result` error (`:629-634` builds a slot with
no arm; `announcement-post-lock.test.ts:51-61` asserts only `postLocked`).
Classification: no caller owned, adopted or at risk; the change is additive.

---

## 7. Wave plan

One wave, one implementer, one verifier. Single wave because the reducer line,
its copy and its tests are one atomic behaviour.

**W1 write set (exact paths)**

- `src/app/components/walkthrough-announcement/announcement-draft-slots.ts`:
  add `postArmedFor: null` to the error return at `:556`. No new field, no new
  action, no phase change.
- `src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.ts`:
  the rejection message at `:463` gains a short "check the course's
  announcements in Canvas before posting again" clause, keeping the existing
  "may or may not have gone through" wording. Prefer exporting it as a named
  constant so the test can import it (this file already exports pure helpers
  the hook test imports, e.g. `postResultFor` `:189`).
- `src/app/components/walkthrough-announcement/useWalkthroughGenerationAdapters.ts`:
  OWNER-CONFIRMABLE (F-2). Recommended: the `{error}` message at `:90` stops
  asserting "Nothing was posted." unconditionally (class C false assurance) and
  instead tells the user to check Canvas before posting again if the failure
  was a timeout or server error. No string-prefix classifier.
- NEW `src/app/components/walkthrough-announcement/announcement-post-retry.test.ts`
  (own file; fixtures duplicated, never imported from another test file;
  `announcement-draft-slots.test.ts` is 867 lines and WA-POST-LOCK set the
  own-file precedent).
- NOT touched: `AnnouncementDraftSlot.tsx` (the armed state is derived from
  `postArmedFor`, so the UI follows with no edit), `ConfirmArmButtons.tsx`
  (shared across other surfaces), `WalkthroughAnnouncementPanel.tsx`, any
  `src/lib/canvas*` file, `walkthrough-announcement.ts` action, any grading,
  repo-grades or ingestion file.

**Canaries (all stay green unedited under the recommended shape)**

- `SlotsAction` has 17 members: `announcement-draft-slots.test.ts:772-799` and
  the 17-cell table `announcement-post-lock.test.ts:79-143`. No action added.
- Frozen reset oracle (14-key `DraftSlot`): `announcement-draft-slots.test.ts:829-848`.
  No key added.
- Directory `ta-` key canary `distinctKeys.size === 6`:
  `walkthrough-announcement.structure.test.ts:114` (scans every NON-test
  `.ts`/`.tsx` in the directory with `/(?<![a-zA-Z])ta-[a-z-]*[a-z]/`, `:98-105`).
  New copy must contain no token that starts `ta-` after a non-letter.

**Gates for the wave.** `git status --short` against the four paths above
(plus the orchestrator's disjointness `sort | uniq -d` against RES-FILL-3's
list; I could not compute it, I do not have that list, and no grading file was
modified in `git status --short` at HEAD). Then the wrapper, one line, per the
repo's multi-path rule:

`npm run test:paths src/app/components/walkthrough-announcement/announcement-post-retry.test.ts src/app/components/walkthrough-announcement/announcement-draft-slots.test.ts src/app/components/walkthrough-announcement/announcement-post-lock.test.ts src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.test.ts src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts src/app/components/walkthrough-announcement/AnnouncementDraftSlot.structure.test.ts`

plus `npx tsc --noEmit` (single caller) and the repo's lint and the emoji and
source-bytes gate. Not run by me.

---

## 8. Machine-checkable acceptance criteria

Every pass condition names object, instrument, and direction of failure.
Fixtures are hand-written literals, not derived from the reducer under test.
All instruments are reducer or pure-function executions; none renders anything.

- **AC-1 error clears the arm.** Object: the slot returned by `slotsReducer` for
  `[drafted(posting:true, postArmedFor:"sig")]` + `post-result {error}`.
  Instrument: `slotsReducer` (`announcement-draft-slots.ts:446`). Pass: the
  returned slot has `postArmedFor === null`, `posting === false`, `postError`
  equal to the dispatched string, `postLocked === false`. Fails RED if the arm
  is preserved (the bug) or if the error locks. Run for THREE literal error
  strings (a refusal-like string, the rejection string, "Canvas did not
  respond.") - the reducer is blind to text, so all three must behave alike.
- **AC-2 the one-click path is gone.** Object: the predicate `armPost` evaluates
  at `useAnnouncementDraftSlots.ts:478`. Instrument: `postSignatureFor`
  (exported `:206`) and the slot after AC-1. Pass: BEFORE the error
  `slot.postArmedFor === postSignatureFor(slot)` is `true` (the test first
  proves it is armed, so it cannot pass vacuously); AFTER the error it is
  `false`. Fails RED if the arm survives. This restates `armPost`'s predicate,
  so it is tied to the real code by the existing source pin
  (`useAnnouncementDraftSlots.test.ts:270-274`), which must remain green
  unedited. Without that pin AC-2 is a mirror; with it, it is a chain.
- **AC-3 a legitimate retry is not trapped, and costs exactly two clicks.**
  Object: slot after error, then `arm-post` with its own signature. Instrument:
  `slotsReducer` + `mayCommitPost` + `postSignatureFor`. Pass:
  `mayCommitPost(afterError) === true`; after `arm-post` the predicate of AC-2
  is `true` (the second click would commit). Fails RED if the error arm locks
  the slot or leaves `mayCommitPost` false.
- **AC-4 WA-POST-LOCK undisturbed.** Object: a locked slot with `posting:true`
  and `postArmedFor:"sig"` + `post-result {error}`. Instrument: `slotsReducer`.
  Pass: `postLocked === true` (kept) AND `postArmedFor === null`. Plus
  `announcement-post-lock.test.ts` AC-1..AC-12 green UNEDITED. Fails RED in
  either direction (lock dropped, or arm kept).
- **AC-5 success path and edits unchanged.** Object: existing tests
  `announcement-draft-slots.test.ts:605-627` (success sets postedTo, clears arm)
  and `:400-404` (edit clears arm). Instrument: the wrapper line in section 7,
  run unedited. Pass: green and `git diff` shows those files unmodified. Fails
  RED on any edit to them (an edited existing assertion is the signal).
- **AC-6 no canary moved.** Object: the three canaries named in section 7.
  Instrument: the wrapper line. Pass: `Object.keys(memberTypes).length === 17`,
  the frozen reset oracle equal, `distinctKeys.size === 6`, all green unedited.
  Fails RED if any action, field or `ta-` key was added.
- **AC-7 copy is honest (executed, loosely pinned).** Object: the exported
  rejection constant (and the adapter message builder if F-2 is accepted and
  it is extracted into a pure function in a leaf with no server import).
  Instrument: direct call/import in the new test. Pass: the rejection text
  matches `/may or may not/` and `/check/i`; if F-2 accepted, the refused text
  for the input "Canvas did not respond." does not match `/nothing was posted/i`.
  Fails RED if either regains an unconditional "nothing was posted". Pin the
  fact, not the spelling (memory: source-text tests over-specify).
- **AC-8 mutation (sabotage design for the test seat).** M1: remove
  `postArmedFor: null` from the error arm -> AC-1, AC-2 must go RED. M2: make
  the error arm also set `postLocked: true` -> AC-1 and AC-3 must go RED. M3:
  clear the arm only in the success arm, as today -> same as M1. M4: add
  "no postError" to `mayCommitPost` -> AC-3 and the existing 12-cell grid
  (`announcement-post-lock.test.ts:189`) must go RED. Restore by copy-backup,
  never `git checkout --` on the uncommitted file (memory:
  sabotage-restore-needs-a-copy).

Not machine-checkable here, by construction: that the rendered confirm button
actually reverts to idle, that the error alert stays visible across re-arm, and
that the notice re-renders. Those follow from `WalkthroughAnnouncementPanel.tsx:765`
and `ConfirmArmButtons` (READ), not executed. See section 9.

---

## 9. What this environment cannot verify

- Rendering: no component is rendered by any test. After a failed post the
  button must be idle "Post to Canvas" with the red alert still above it.
  Owner walk: force a failure (disconnect network mid-post, or a course with a
  revoked token), confirm one click only re-arms, the second click posts.
- A real class C failure ("Canvas did not respond." after the request was
  written) needs a live Canvas and a network fault; unobservable here.
- Server-action transport rejection behaviour on Vercel Hobby (60 s cap) is not
  reproducible here; the description in section 2.2 is a READ of the code and
  of `command-interface.ts:28`, not an observation.

---

## 10. Findings and residual register

Findings routed out of this plan (each a row the orchestrator files; none is a
silent assumption):

- **F-1 (class sibling, same one-click bug).** `recording/useTakeAnnouncement.ts`:
  `armed` at `:740`, set at `:762`, cleared by `setArmedFor(null)` only on the
  success path (`:812`); the error return (`:796-806`) leaves it set, and it
  carries the same "Nothing was posted." copy at `:798`. READ only; I opened
  `:736-775` and `:785-815` and did not trace the whole function. Whether it has
  its own hole in the rejected-promise path (an `await` with no visible
  `try/catch` at `:777-795`) is UNDETERMINED by me.
- **F-2 (owner-confirmable, product).** Soften the over-claiming "Nothing was
  posted." in the walkthrough adapter. Recommended yes. Declined = ship the arm
  clear and rejection copy only; F-3 then carries the class C copy defect.
- **F-3 (new defect).** Class C ambiguous failures are reported as "Nothing was
  posted." (section 2.2). Covered by W1 if F-2 is accepted.

| # | Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R-1 | Cross-tab, cross-reload and deliberate two-click re-post after an ambiguous failure are NOT closed client-side | repo owner (policy: fail-open or fail-closed, title-reuse tolerance) | `WA-POST-DEDUP` row `docs/BACKLOG.md:224`; a live-Canvas duplicate-announcement test | when WA-POST-DEDUP is dispatched; this scope must not be cited as closing it |
| R-2 | Rendered behaviour after a failed post (idle button, alert persists, notice re-renders, focus) | repo owner | browser walk of a forced failure (section 9) | owner-walk row filed with the W1 ship; verifier cites it as UNVERIFIED, not passed |
| R-3 | A real classifier (`posted | refused | unknown` at the action layer, like `bulk-course-message.ts:31`) so a clean refusal can keep its arm and class C gets exact copy | orchestrator files; implementer builds when asked | new action-contract test over `postWalkthroughAnnouncementAction` outcomes (needs the network-blocked Canvas path mocked via `canvasFetch`/`canvasRequest`, per memory: tests-are-network-blocked) | a later row if (a') is wanted; cost in section 3 column (a') |
| R-4 | Sibling surface `useTakeAnnouncement.ts` (F-1) | orchestrator files a row | read-through of the whole post path + a reducer/decision test | new row `WA-POST-RETRY-TAKE` (suggested id); dispatchable independently, disjoint from W1 |
| R-5 | (b) acknowledgement gate, if the owner picks it | repo owner (fork answer, section 5.2) | the (b) column of section 3 | only if (b) is chosen; ends the activity either way |
| R-6 | `mayCommitPost` needs no term (my claim) - the verifier should attack it | the loop-checker of this scope | AC-4 and the 12-cell grid under M4 | the check of this document |

---

## 11. Disposition table

Not applicable: this is the first version of this scope; nothing was
restructured and no prior requirement was dropped. The only inherited items
are `WA-POST-LOCK` scope R-3 and F-2 (`docs/wa-post-lock-scope.md`, ADJ-1),
which this document KEEPS as the row `WA-POST-RETRY` and settles to the
recommended reading above.

## 12. Commands that produced the quantities

- `git rev-parse HEAD`, `git status --short`, `git diff --stat HEAD -- src`
  (no output): HEAD `9a73295b`, tree under `src/` clean.
- `@(Get-Content <file>).Count` (PowerShell): the six file sizes in the header.
- `grep -n "postArmedFor\|postLocked\|mayCommitPost\|postError\|\"post-result\"\|\"post-start\"" announcement-draft-slots.ts`: reducer hops, section 1 and 6.
- `grep -n "commitPost\|armPost\|postDraft\|post-result\|\"posting\"\|catch\|mayCommitPost\|cancelPost\|cancel-post\|arm-post" useAnnouncementDraftSlots.ts`: hook hops.
- `grep -rn postArmedFor --include=*.test.ts src`: the "no assertion depends on the preserved arm" claim.
- `grep -n 'network-error' src/lib/canvas-fetch.ts` (lines `312, 349, 417, 432, 436`) and `grep -n "Canvas did not respond" src/lib/canvas-fetch-response.ts` (`:137`): the ambiguity chain.
- `grep -n 'topic = (await response.json\|if (!response.ok)\|canvasRequest(' src/lib/canvas/announcements.ts`: `:444`, `:453`, `:456`.
- `grep -n "setConfirmed(null)\|Canvas did not confirm\|catch {" BulkCourseMessagePanel.tsx`: `:131`, `:135`, `:137`.
- `grep -n maxDuration src/app/page.tsx src/app/layout.tsx`: no output.
