# WA-POST-RETRY-TAKE scope: re-post after a FAILED take-announcement post

Status: scope + security-seat threat model + fix-shape recommendation. Not a
build, no test code. Authored by the `loop-seat` (Sonnet) for a fresh
`loop-checker` to attack before anything is built from it.

Backlog row: `docs/BACKLOG.md:191` (`WA-POST-RETRY-TAKE`, state `unscoped`, filed
2026-10-04). Sibling shipped fix being mirrored: `bb060dd4` (WA-POST-RETRY W1;
diff read in full with `git show bb060dd4 -- src`). Repo HEAD when measured:
`57c17e28` (`git rev-parse HEAD`, 2026-10-04). `git status --short src` printed
nothing, so every `src` line number below is a HEAD line number. File sizes:
`useTakeAnnouncement.ts` 966 and `takeAnnouncementArming.ts` 34, both by
`@(Get-Content <f>).Count` (PowerShell) and agreeing with `wc -l`.

Where a claim is a READ of code it says READ; nothing was executed. I ran no
test and edited no source; this document is the only file written. Nothing
renders under vitest, there is no live Canvas and no network, so felt behaviour
is an owner walk (section 9).

Triage record (`docs/loop/seats.md` Triage table): bug fix, so no LEVERAGE
CLAIM. Security seat: fired (irreversible outward publish; this document is that
pass). Data/storage seat: not fired (no `ta-` key, no persisted shape change).
UX seat: fires at build for copy only. Reliability seat: FIRED, because the
rejected-promise path is a failure mode that is not a thrown error the UI sees
(section 2.2).

Scope boundary honoured: only `recording/` take-announcement files and their
direct dependencies were read. No grading, `repo-grades`, `walkthrough-
announcement/` (read only as the mirrored precedent) or `src/tools` file is in
the write set.

---

## 1. The bug, confirmed against the tree

Verdict: CONFIRMED by READ at every hop, with ONE correction to the backlog
row's framing (the take path is a different shape; see 1.2 and 3).

### 1.1 Anchors re-verified at HEAD

| Fact | File:line (HEAD) | What is there |
|---|---|---|
| Arm state is a bare `useState` signature, no reducer | `recording/useTakeAnnouncement.ts:355` | `const [armedFor, setArmedFor] = useState<string \| null>(null);` |
| `armed` is DERIVED from the signature | `:736-740` | `currentArmSignature = JSON.stringify([takePostArmSignature(take.id, selectedCourse.id, institution), subject, body])`; `armed = currentArmSignature !== null && isConfirmArmed(armedFor, currentArmSignature)` |
| First click arms | `:762` | `setArmedFor(currentArmSignature)` (after field validation `:750-757`) |
| Second click commits | `:758-761` | `if (armed) { if (mayPostCommit(postUnavailableReason, false, armed)) void commitPost(); return; }` |
| `commitPost` never touches the arm on entry | `:769-774` | sets `posting`, clears `postError`, sets stage `posting`; no `setArmedFor` |
| The server call has NO try/catch | `:788-795` | bare `await createAnnouncementAction(...)`; `grep -n "try {\|catch" useTakeAnnouncement.ts` returns only `:415` and `:432`, both in the courses effect |
| Returned-error exit PRESERVES the arm | `:797-807` | `setPosting(false)`; `if ("error" in result) { ... setStage({phase:"failed", stage:"post", message}); setPostError(message); announce(message); return; }` - no `setArmedFor` |
| Over-claiming copy | `:798` | `` `Canvas refused the announcement - ${result.error}. Nothing was posted.` `` |
| Success is the ONLY place the arm clears (besides new draft and cancel) | `:812` (also `:564` new draft, `:766` cancel) | `setArmedFor(null)` |
| Failed-stage UI offers only "Back to review" | `TakeAnnouncementPanel.tsx:357-388` (button `:381-385`) | the failed alert renders `stage.message`; for `stage === "post"` the ONLY action is `backToReviewAfterPostFailure` |
| "Back to review" keeps the arm | `useTakeAnnouncement.ts:729-732` | `setPostError(null); setStage({ phase: "review" });` - does not touch `armedFor` |
| Review view (with the Post button) renders for `review` and `posting` only | `TakeAnnouncementPanel.tsx:399` | `(stage.phase === "review" \|\| stage.phase === "posting")` |
| Post button is one element, armed label "Confirm post", click goes to the same handler | `TakeAnnouncementPanel.tsx:629-643`; `ui/ConfirmArmButtons.tsx` `onClick={armed ? onConfirm : onArm}`, `loading={loading}` | both `onArm` and `onConfirm` are `handlePostButtonClick` |

### 1.2 The reachable duplicate path (READ, returned-`{error}` exit)

1. Click "Post to Canvas" (arm, `:762`) then "Confirm post" (`:759` -> `commitPost`).
2. `createAnnouncementAction` returns `{error}`. `:797-807` runs: stage becomes
   `failed/post`, the review view (and the Post button) UNMOUNT, the alert shows
   the message and ONE button, "Back to review". `armedFor` is unchanged.
3. Click "Back to review" (`:729-732`). Stage is `review`. `currentArmSignature`
   is a function only of take id, course id, institution, subject and body
   (`:736-739`) - none changed - so `isConfirmArmed(armedFor, sig)` is still
   `true` and the review view renders ALREADY ARMED: primary "Confirm post"
   button, the warning notice (`:597-621`) and the subject/body preview.
4. ONE click on "Confirm post" runs `handlePostButtonClick` -> `armed` true ->
   `mayPostCommit(null, false, true)` -> `true` -> `commitPost()` -> a second
   POST to Canvas.

So the duplicate costs TWO clicks (Back to review, Confirm post), neither of
which is an arm. This is milder than the walkthrough slot (there the armed
button stayed on screen under the error: one click). The mitigating
interposition (a screen change plus the re-shown consequence notice) is real
but is not a confirmation step: the user has not been asked to re-decide.

`mayPostCommit` (`content-tab/modules/postConfirmArming.ts`, bottom of file) is
`!postUnavailableReason && !dirty && armed`. The hook passes `dirty` as the
literal `false` (`:759`) and has NO `posting` or "already failed" term. That is
the same shape as the walkthrough's `mayCommitPost` and the same reasoning
applies: a retry must remain possible, so no term is added.

---

## 2. Two failure exits, and they are not alike

### 2.1 Returned `{error}` (the live duplicate path)

`createAnnouncementAction` (`src/app/actions/canvas-inbox.ts:284-307`) wraps its
whole body in `try/catch` and returns `{ error: err.message }` (`:304-306`). It
never lets a throw escape, so EVERY server-side failure arrives at the hook as
the same untagged `{error: string}`, including the ambiguous ones. The chain
(READ, every hop opened this round):

- `createAnnouncement` (`src/lib/canvas/announcements.ts:329-368`) throws
  `canvasError(status)` on a non-ok response (`:363-365`) and runs
  `(await response.json())` AFTER a 2xx (`:366`): a 5xx from a proxy, or a body
  that fails to parse, is "topic may exist, answer lost".
- `canvasRequest` throws the fixed literal `"Canvas did not respond."`
  (`src/lib/canvas-fetch-response.ts:137`) on `unreachable`; `canvasFetch` maps
  a request error, a response-stream error and the size cap to `network-error`
  (`src/lib/canvas-fetch.ts:417, 432, 436`), i.e. a failure after the request
  body was written.
- Genuinely clean refusals (empty title or message `:337-338`, host refusal
  `canvas-fetch-response.ts:131`, 401/403/404, `requireUser`) arrive in the
  SAME shape.

Classification is the walkthrough scope's (`docs/wa-post-retry-scope.md`
section 2.3): class B (refusal) and class C (ambiguous) are indistinguishable by
anything the hook receives; class A (pre-flight) does not exist on this path
(the field checks at `:750-757` return before arming, and `selectedCourse` is
required to have armed). So the existing copy "Nothing was posted." is FALSE for
class C, exactly as it was on the walkthrough path, and the hook has no
classifier to fix that with. Not adding one is deliberate (section 4, (a')).

### 2.2 REJECTED promise (a DIFFERENT problem here than on the walkthrough path)

The task brief asked whether the rejected-promise case is distinguished. Answer:
it is not handled at all, and on this path that is a stuck-UI defect rather than
a one-click-duplicate defect.

`await createAnnouncementAction(...)` at `:788` is outside any `try`. The caller
discards the promise with `void commitPost()` (`:759`). The action itself never
throws (2.1), so a rejection means the TRANSPORT failed (connection lost,
platform timeout, deployment skew; `src/app/page.tsx` sets no `maxDuration`
per the walkthrough scope's `grep`, I did not re-run it, and Vercel Hobby caps
at 60s per the repo's deployment memory - UNVERIFIED here). On rejection (READ):

- `commitPost` rejects; nothing after `:788` runs: `setPosting(false)` (`:796`)
  is skipped, the stage stays `{phase:"posting"}`, no message is set, the
  rejection surfaces only as an unhandled promise rejection (console / dev
  overlay).
- The review view stays mounted (`TakeAnnouncementPanel.tsx:399` includes
  `posting`) with the Post button `loading`, which MUI renders disabled; Cancel
  is `disabled={loading}` (`ConfirmArmButtons.tsx`); every other control is
  `disabled={busy || posting}` (`TakeAnnouncementPanel.tsx:420, 447, 464, ...`).
- Net: NO one-click re-post is reachable in this state (the confirm button is
  disabled; Escape would disarm but the button stays disabled because
  `loading={posting}` is still true). The user sees a permanent "Posting..."
  spinner and is never told the post may have landed. The only exit is "Back to
  takes", after which reopening remounts the hook (fresh `armedFor = null`,
  `posted` still null because `onPosted` never ran) and a re-post then costs two
  clicks with NO warning that the first attempt may have succeeded.

Consequence for the fix: the "honest copy" cannot reach a transport-failure user
unless a catch is added. Whether to add it is the one real fork in this scope
(section 4.2).

---

## 3. Where the take path's structure differs from the walkthrough slot

| Aspect | Walkthrough slot (`bb060dd4`) | Take path (this scope) | Effect on the fix |
|---|---|---|---|
| State holder | `slotsReducer` over `DraftSlot[]`, pure, exported (`announcement-draft-slots.ts:446`) | Plain `useState` in the hook; `commitPost` is an impure async closure over setters (`useTakeAnnouncement.ts:769-833`) | The walkthrough fix was one reducer line with executed tests. Here nothing is pure and nothing is executable without extraction (see AC instrument note, section 7). |
| Arm mechanism | `slot.postArmedFor` signature, `isConfirmArmed` | `armedFor` signature, `isConfirmArmed` (the same `confirmArming.ts:26-28`), signature also covers subject and body | Same mechanism: setting the stored signature to `null` disarms. The same one-token clear applies: `setArmedFor(null)` on the failure exit. |
| Post button after failure | Stays mounted under the red alert, armed | UNMOUNTS (failed stage hides the review view); only "Back to review" remains | Take path has one extra deliberate click before the armed button reappears, so the live path is 2 clicks, not 1. The fix still matters: without it the re-appearing button is pre-armed. |
| Error text after failure | Persists in `postError` above the idle button | `setPostError(message)` at `:804` is invisible (review view unmounted), then `backToReviewAfterPostFailure` clears it at `:730`. The honest copy therefore EXISTS only in the failed alert and VANISHES when the user clicks "Back to review" | Take-specific. The warning is gone at exactly the moment the user decides whether to re-arm. See H4. |
| Rejection arm | Existing `.then(onOk, onRejected)` (`useAnnouncementDraftSlots.ts:452-465`) already dispatches an error | NONE (2.2) | Take path needs a NEW catch for the honest transport copy to exist. |
| Already-posted lock | `postLocked` (WA-POST-LOCK) | `posted` prop early-return, stronger by construction (section 6) | Not part of this wave. |
| Copy sites | adapter + hook constant | one inline literal `:798` | One site to change. |

Does the same one-line clear apply? YES for the arm (`setArmedFor(null)` on the
returned-error exit, which also covers every future exit that funnels through
it). It is NOT sufficient alone: the honest copy and the rejection exit need the
take-specific changes in section 5.

---

## 4. Fix shapes

Baseline click cost today: normal flow 2 clicks (arm, confirm). Failure then
re-post: 2 clicks (Back to review, Confirm post), neither an arm. Under every
shape below the normal flow stays 2 clicks.

### 4.1 Shape (a), mirrored: clear the arm on EVERY post failure (recommended)

Clear `armedFor` on every failure exit, do NOT hard-block the retry, make the
failure copy honest. After a failure the re-post path becomes Back to review ->
"Post to Canvas" (arm) -> "Confirm post" = 3 clicks (was 2). The added click is
the restored confirmation, which is the point; it is not a new confirm layered
over an existing one. Same reasoning as the walkthrough scope section 4.

### 4.2 Fork: the rejection exit (take-specific; my reading acted on)

- **Reading acted on: INCLUDE a catch** around the server call so a transport
  rejection takes the SAME failure exit (posting false, arm cleared, honest
  "may or may not have gone through - check Canvas" copy). It fixes the stuck
  spinner AND is the only way the honest transport copy can exist here.
- Alternative: split it into its own row (`WA-POST-REJECT-TAKE`) and ship only
  the returned-error fix now. Cost of that answer: the stuck spinner and the
  silent possible-duplicate on reopen stay, and the honest copy covers only the
  returned-error class.
- Owner-confirmable in one line, and EITHER answer ends the activity: "Should
  this wave also make a dropped connection during a take-announcement post show
  a 'may or may not have posted, check Canvas' message instead of a permanent
  spinner, or ship the arm-clear alone and track the spinner separately?" The
  arm-clear work is not wasted by a "separate" answer: hunks H1 and H2 stand
  alone, H3 is deletable.

### 4.3 Shapes NOT recommended

- (a') Clear only on ambiguous failures: needs a classifier. The action returns
  only `{error}` (2.1); none exists; a misclassified "clean" verdict would keep
  the one-click path alive on an irreversible publish. Rejected for the same
  asymmetry as the walkthrough scope (saving a click on a rare path is worth
  less than any chance of one-click mass-republish).
- (b) A separate "I checked Canvas" acknowledgement: +1 state, +1 click, and its
  value over (a) plus persistent honest copy (H4) is marginal.
- (c) Fail-closed lock on rejection: would trap a genuine outage retry and the
  take view has no "already on Canvas" copy to be truthful with.

---

## 5. Recommended wave: one wave, one implementer, one verifier

The change set is small and one atomic behaviour (arm, copy and rejection exit
together), but see the line budget below.

**W1 write set (exact paths)**

- `src/app/components/recording/useTakeAnnouncement.ts` (966 lines now):
  - H1 arm clear: on the failure exit call `setArmedFor` with the arm from the
    leaf's outcome (value is `null`). Happens before the failure `return`.
  - H2 honest copy: the failure `message` (`:798`) is built by the leaf, which
    stops asserting "Nothing was posted." and tells the user to check the
    course's announcements in Canvas before posting again.
  - H3 (fork 4.2, recommended): the server call is wrapped so a rejection takes
    the same failure exit with the transport variant of the copy. Simplest shape
    that avoids duplicating the 11-line exit: `.catch` on the call mapping to a
    tagged transport failure that the single `"error" in result` branch handles.
  - H4 (owner-confirmable, recommended): delete `setPostError(null);` from
    `backToReviewAfterPostFailure` (`:730`) so the already-existing `postError`
    alert (`TakeAnnouncementPanel.tsx:623-627`) shows the honest copy above the
    idle "Post to Canvas" button after the user returns to review - matching the
    walkthrough slot's behaviour, where the alert persists across re-arm.
    `postError` is already cleared when a post starts (`:772`) and on a fresh
    draft (`:566`), so it cannot go stale across a successful retry. Cost if the
    owner declines: the warning is visible only in the failed alert.
- `src/app/components/recording/takeAnnouncementArming.ts` (34 lines): the leaf.
  A pure function `resolveTakePostFailure(failure)` where `failure` is
  `{ error: string } | { transport: true }`, returning `{ message: string;
  armedFor: null }`. The return TYPE is `armedFor: null`, so a non-null arm is
  unrepresentable (a construction, not an assertion; `tsc` fails a mutant that
  returns a string). It lives here, NOT in the hook, because the hook is 966 of
  1000 lines (section 7) and because the leaf imports only `postConfirmArming`
  (verified: `takeAnnouncementArming.ts` imports nothing else), so a test can
  import it without pulling a server action (the hook imports `../../actions`,
  `useTakeAnnouncement.ts:26-34`, which vitest blocks on network). Do NOT import
  the walkthrough's `POST_TRANSPORT_FAILURE_MESSAGE`: that couples `recording/`
  to a walkthrough hook module for one string.
- NEW test file(s) under `src/app/components/recording/` (own file, fixtures
  duplicated, no import from another `*.test.ts`). Name left to the test seat.
- NOT touched: `TakeAnnouncementPanel.tsx`, `ConfirmArmButtons.tsx` (shared),
  `postConfirmArming.ts`, `confirmArming.ts`, `canvas-inbox.ts`, every
  `src/lib/canvas*` file, the walkthrough directory, all grading, repo-grades and
  `src/tools` files. Disjoint from the concurrent RES-FILL-3 (`src/lib/grade/`)
  and A42 (`src/tools`) waves by construction; I did not compute `sort | uniq -d`
  against their lists because I do not hold them - the orchestrator owes that.

**Line budget (ESTIMATE, not measured).** Hook is 966 against
`recording-split.structure.test.ts`'s per-file 1000 ceiling (directory scan, test
file `:` "should keep all recording/*.ts/*.tsx files under 1000 lines"). H1-H4
net: roughly +4 to +10 lines if the `.catch` shape is used and the leaf carries
the copy; the implementer MUST measure with `@(Get-Content <file>).Count` before
and after. If the result exceeds 990, extract rather than squeeze, and never
raise a ceiling (`this-repo.md` section 3: the `ALLOWED_OVERAGE` ratchet rule).

---

## 6. Security seat

Threat: an accidental duplicate announcement to every enrolled student while the
user is confused by an error. Irreversible and outward-facing: the armed notice
itself says "this app cannot recall or delete it afterward"
(`TakeAnnouncementPanel.tsx:600`). A reliability/integrity threat from a trusted
user; no trust boundary is crossed.

Judgement of (a):

- PREVENTS the pre-armed duplicate: after H1 the post-failure state has
  `armedFor === null`, so `isConfirmArmed(null, sig)` is `false`
  (`confirmArming.ts:26-28`: `armedFor !== null && ...`), the button returns to
  idle "Post to Canvas", and the first click only re-arms (`:762`).
- DOES NOT trap a legitimate retry: `mayPostCommit` is untouched and has no
  failure term; `armed` is recomputed from the signature (`:740`), so a fresh
  arm-then-confirm works. A genuine Canvas outage is never refused, only no
  longer free.
- Does not remove or weaken ANY existing confirm: the change adds a confirm back
  on the failure path. The success path (`:812`) is not edited; `postLocked`
  does not exist here; `postConfirmArming.ts`, `ConfirmArmButtons.tsx` and
  `takePostArmSignature` (incl. its course/institution coverage, header of
  `takeAnnouncementArming.ts`) are untouched.
- Residual probability falls from "two non-deliberate clicks" to "three
  deliberate clicks, with the consequence notice re-shown at arm time". With H4
  the honest "check Canvas" text is also in view at that decision. Nothing
  client-side can make a deliberate re-post impossible because the client cannot
  know whether the topic exists.
- Honest rating: this is the LOWER-severity sibling of the walkthrough bug (2
  clicks with a screen change, versus 1 click), same irreversibility class,
  fixed by the same cheap clear. It is NOT a reason to skip: the cost is one
  token.

### Lock-gap check (flagged as a SEPARATE finding, not folded into this wave)

The brief asked whether the take path also has a WA-POST-LOCK-style gap (no
already-posted lock). Finding, READ:

- SUCCESS lock: PRESENT and stronger than the walkthrough's. On success the hook
  calls `onPosted` (`:820`), `RecordingTab` stores it in
  `postedByTakeId` (`RecordingTab.tsx:169, 826-829`), and the panel early-returns
  a "Posted to X" view with NO Post button when `posted` is truthy
  (`TakeAnnouncementPanel.tsx:253-276`). `armedFor` is also cleared (`:812`). So
  the walkthrough's two-click success duplicate has no analogue here.
- GAP F-T3 (cross-reload and library-sourced takes): `postedByTakeId` is plain
  `useState` (`RecordingTab.tsx:169`), in memory. After a reload `posted` is null
  again and the same take can be posted again. A library-sourced take is "built
  fresh" (hook header `:128-130`, about the transcript cache); whether a rebuilt
  library take gets a NEW id, which would also defeat the `postedByTakeId` key,
  I did NOT trace (UNDETERMINED). This is the `WA-POST-DEDUP` class
  (`docs/BACKLOG.md:224`, owner-blocked); client-side state cannot close it.
- GAP F-T4 (ambiguous failure has no lock): after an AMBIGUOUS failure
  (class C returned error, or class D rejection) `posted` is never set, so
  closing and reopening the panel gives a fresh post chance with no memory that
  the first may have landed. Same class as F-T3; closed only by a server-side
  check. This wave must NOT be reported as closing re-publish.
- Double-submit within one mount: `handlePostButtonClick` has no `posting`
  guard (`:758-760` passes `dirty` as literal `false`); protection is that MUI
  `loading` disables the button (`ConfirmArmButtons.tsx`, `loading={loading}`)
  after `setPosting(true)` (`:771`). READ-only, not executed, and out of scope
  here; recorded as a residual.

---

## 7. Canaries and gate

All measured by opening the cited file this round.

| Canary | What it enforces | Tripped by this wave? |
|---|---|---|
| `recording/recording-split.structure.test.ts` "should keep all recording/*.ts/*.tsx files under 1000 lines" (dir scan, includes NEW files) | per-file 1000 ceiling | NOT tripped if the hook stays under 1000. Hook is 966; budget in section 5. |
| same file, `ta-rec-*` exact-set test (`:360-362`, scans `combinedRecordingSource`) | exact persisted-key set | NOT tripped: no key is added; new copy must contain no `ta-rec-` token. |
| same file, strip-count `toHaveLength(9)` (`:147`) | inner-view tab count | NOT touched. Note `docs/loop/this-repo.md` section 3 still says 12 entries; the test says 9 (a stale card, not this wave's to fix). |
| `src/file-size-ceiling.structure.test.ts` | repo-wide 1000 ceiling; excludes files the recording gate covers | NOT tripped under the same condition. |
| `recording/useTakeAnnouncement.drafts-loop.wiring.test.ts` `:48-52` | cleanup call comes after "the failure return" | STAYS GREEN UNEDITED, but note the instrument is weaker than its title: `commitPostBody.indexOf("return;")` resolves to the FIRST `return;`, which is `if (!selectedCourse) return;` at `useTakeAnnouncement.ts:770`, not the failure return at `:806`. Any change that keeps a `return;` before the cleanup call stays green. It does NOT pin the failure exit, so it is not a guard for this wave. Its brace-matching slicer (`bodySlice`, `:19-31`) must still resolve `async function commitPost()`; do not rename or re-signature it. |
| `recording/useTakeAnnouncement.draft-finalize.wiring.test.ts`, `.image-copy-safety.test.ts` | `runDraft` routing; `setSubject/setBody` never reference images | NOT touched (different functions). |
| `components/componentStorageKeys.structure.test.ts` | directory-wide `ta-` token scan | New copy must contain no token matching its regex (`(?<![a-zA-Z0-9_])ta-[a-z0-9-]*[a-z0-9]`). |
| `src/tools/strip-comments-agreement.structure.test.ts` | any new test naming the comment-strip helper literal fails the repo | A new wiring test must name its helper `withoutLineComments` (as the drafts-loop test does at `:19`). |
| `src/tools/vitest-paths/gate-commands.structure.test.ts` (S8) | freezes docs hits of raw multi-path test commands | This document uses only the `npm run test:paths` wrapper form. |
| `src/tools/backlog/backlog-file.structure.test.ts` `EXPECTED_ROW_COUNT = 115` (`:92`) | row count of `docs/backlog.yml` <-> `docs/BACKLOG.md` | NOT tripped by W1. TRIPPED when the orchestrator files the new rows F-T3 / F-T4 below: bump the count and regenerate both files in the same commit. |

Is a new exported constant the right pattern? For the walkthrough path yes
(`POST_TRANSPORT_FAILURE_MESSAGE`, exported from a hook file whose imports a test
could safely load). Here NO: the hook imports `../../actions` and is 966 lines,
so the copy belongs in the leaf (`takeAnnouncementArming.ts`) as a function (the
copy interpolates the Canvas error text). A string constant or function exported
from a non-`"use server"` leaf trips no export canary: `use-server-exports.test.ts`
scans only `"use server"` files.

**Gate command for the wave** (wrapper, one path per argument, per
`docs/loop/this-repo.md` section 1; `<NEW>` stands for the new test file(s) the
test seat names). I did not run it.

`npm run test:paths <NEW> src/app/components/recording/takeAnnouncementArming.test.ts src/app/components/recording/useTakeAnnouncement.test.ts src/app/components/recording/useTakeAnnouncement.drafts-loop.wiring.test.ts src/app/components/recording/useTakeAnnouncement.draft-finalize.wiring.test.ts src/app/components/recording/useTakeAnnouncement.image-copy-safety.test.ts src/app/components/recording/recording-split.structure.test.ts src/file-size-ceiling.structure.test.ts src/app/components/componentStorageKeys.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts`

(every named existing path was confirmed to exist with `test -f`). Then
`npx tsc --noEmit` (single caller; it races on `tsconfig.tsbuildinfo`) and
`npm run lint` with the pass condition from `this-repo.md`: exit 0 and no NEW
warning in files this wave writes, measured against the same command before the
change. Gate the tree with `git status --short` against the three production
paths above plus the new test file(s).

---

## 8. Machine-checkable acceptance criteria

Honest limit first: the take path has no reducer, and `commitPost` is an impure
closure that cannot be called from vitest (no jsdom, no hook rendering,
actions network-blocked). So the criteria split into (i) pure-leaf execution,
which is real, and (ii) source-text wiring that ties the hook to the leaf, which
is a READ-level claim and is stated as such. The walkthrough fix was fully
executable; this one is not, and a verifier must not report (ii) as behaviour.

Each pass condition names object, instrument and direction of failure. Fixtures
are hand-written literals, not derived from the code under test.

- **AC-1 the failure outcome carries no arm.** Object: the value returned by
  `resolveTakePostFailure` for THREE literal inputs: `{ error: "Canvas refused
  access" }`, `{ error: "Canvas did not respond." }`, `{ transport: true }`.
  Instrument: direct import of the leaf (executed). Pass: `armedFor` is strictly
  `null` for all three. Fails RED if any returns a non-null arm (the bug) or
  omits the field.
- **AC-2 the copy is honest and tells the user to check Canvas.** Object: the
  `message` for the same three inputs. Instrument: direct import, regexes.
  Pass: no message matches `/nothing was posted/i`; every message matches
  `/check/i` and `/Canvas/`; the `{ transport: true }` message additionally
  matches `/may or may not/i`; the two `{ error }` messages contain the supplied
  error text verbatim (the error is not swallowed). Fails RED if any message
  regains "Nothing was posted." or drops the check-Canvas direction. Pin the
  fact, not the spelling (repo memory: source-text tests over-specify).
- **AC-3 a retry is not trapped and re-arming still works (executed over the
  REAL arming functions the hook uses).** Object: the pair `isConfirmArmed(
  armedFor, sig)` and `mayPostCommit(null, false, armed)` from
  `postConfirmArming.ts`, with `armedFor` taken from AC-1's outcome and `sig` =
  `JSON.stringify([takePostArmSignature("take-1","course-1","ACME"),"s","b"])`
  (the hook's own composition, `:736-739`). Instrument: executed. Pass:
  `isConfirmArmed(outcome.armedFor, sig) === false` (a click arms, does not
  commit); then with `armedFor = sig`, `isConfirmArmed(sig, sig) === true` and
  `mayPostCommit(null, false, true) === true`. Fails RED if the outcome arm
  still matches the signature (bug), or if arming can no longer produce a
  committable state (trap). Notes that this models the two-click flow, not a
  rendered click.
- **AC-4 the hook applies the leaf on the failure exit (WIRING, READ-level).**
  Object: the comment-stripped, brace-delimited body of `async function
  commitPost()` (same idiom as `useTakeAnnouncement.drafts-loop.wiring.test.ts`
  `:19-31`, helper named `withoutLineComments`). Instrument: raw
  `fs.readFileSync`. Pass: the body contains a call to `resolveTakePostFailure(`
  and a `setArmedFor(` whose argument derives from its result, and that
  `setArmedFor(` appears BEFORE the failure-exit `return;` and BEFORE
  `runTakeDraftPostCleanup(`; the success `setArmedFor(null)` is still present.
  Fails RED if the failure exit no longer disarms. Weakness stated: text, not
  behaviour; AC-1/AC-3 prove the leaf, this proves only that the hook calls it.
  The mutants in AC-8 are what show it can fail.
- **AC-5 the rejection takes the same exit (WIRING, only if fork 4.2 is
  accepted).** Object: the same body slice. Pass: the `createAnnouncementAction(`
  call is guarded (a `.catch(` on it or an enclosing `try` with a `catch`) and
  the guarded branch yields the `{ transport: true }` input to
  `resolveTakePostFailure`, with `setPosting(false)` reachable on that path.
  Fails RED if the call is bare again. If the owner picks "separate", delete
  AC-5 and AC-1/AC-2's `{ transport: true }` cases; nothing else moves.
- **AC-6 nothing removed or weakened.** Object: existing suites run UNEDITED:
  `takeAnnouncementArming.test.ts`, `postConfirmArming.test.ts`,
  `confirmArming.test.ts`, the three `useTakeAnnouncement.*` tests, plus
  `git diff --name-only` showing `postConfirmArming.ts`, `confirmArming.ts`,
  `ConfirmArmButtons.tsx`, `TakeAnnouncementPanel.tsx` and those test files
  absent. Pass: green and unmodified. Fails RED on any edit to them (an edited
  existing assertion is the signal). `takeAnnouncementArming.test.ts` is
  existing and tests `takePostArmSignature` only; the new function's tests go in
  the NEW file.
- **AC-7 no canary moved.** Object: section 7's canaries. Instrument: the
  wrapper line. Pass: green unedited; the hook line count measured by
  `@(Get-Content src/app/components/recording/useTakeAnnouncement.ts).Count` is
  `<= 1000` (the verifier records the actual number). Fails RED on any tripped
  canary.
- **AC-8 (only if H4 accepted) the honest copy survives "Back to review".**
  Object: the body slice of `function backToReviewAfterPostFailure()`.
  Instrument: raw read. Pass: the body does NOT contain `setPostError(`.
  Fails RED if it clears the error again. Negative-pin; stated as a fact about a
  deleted call, not a spelling.

Mutants for the test seat to design against (named so the checker can attack the
sabotage, not built here): M1 remove the `setArmedFor(` from the failure exit
(AC-4 red; AC-1 stays green, which is why AC-4 exists); M2 make the leaf return a
non-null arm (AC-1, AC-3 red, and `tsc` fails on the type); M3 revert the copy to
"Nothing was posted." (AC-2 red); M4 remove the catch (AC-5 red); M5 re-insert
`setPostError(null)` in `backToReviewAfterPostFailure` (AC-8 red). Restore by
copy-backup, never `git checkout --` on an uncommitted file (repo memory:
sabotage-restore-needs-a-copy). AC-4 and AC-5 are text instruments: a mutant that
satisfies the text while breaking behaviour (for example `setArmedFor(sig)` in the
right place) must be tried, and the test seat should say whether AC-4's pass
condition kills it.

---

## 9. What this environment cannot verify

- Rendering. After a failed post: the failed alert shows the honest copy; "Back
  to review" lands on an IDLE "Post to Canvas" button (not "Confirm post"); with
  H4 the honest alert is still visible above it; the first click only re-arms and
  re-shows the consequence notice; the second click posts. All are reading claims
  from `TakeAnnouncementPanel.tsx:357-388, 597-643` and `ConfirmArmButtons.tsx`.
  Owner walk: force a failure (revoke a token, or drop the network after the
  confirm click) and confirm the sequence.
- A real class-C failure ("Canvas did not respond." after the request body was
  written) needs a live Canvas and a network fault.
- The rejected-promise behaviour (section 2.2) is a READ of the code and of MUI
  `loading` semantics, not an observation; whether the unhandled rejection is
  visible to the user is a browser question.
- Vercel Hobby's 60s cap and what a server action rejection looks like on a
  timeout are not reproducible here.

---

## 10. Findings and residual register

New findings (each is a row the orchestrator files; none is a silent
assumption):

- **F-T1 (stuck spinner, take-specific).** Section 2.2: a transport rejection
  leaves the stage at `posting`, the button permanently loading, no message,
  posting state never cleared. Covered by H3 if fork 4.2 is accepted.
- **F-T2 (honest copy disappears on "Back to review").** Section 3: the warning
  lives only in the failed alert and `postError` is cleared at `:730`. Covered
  by H4 if accepted.
- **F-T3 / F-T4 (lock gaps, NOT folded in).** Section 6. Success lock present;
  cross-reload / library-take re-post and ambiguous-failure-no-lock remain, and
  are the `WA-POST-DEDUP` class.

| # | Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R-1 | Cross-reload, library-sourced take and deliberate re-post after an ambiguous failure are NOT closed client-side (F-T3, F-T4). This wave must NOT be reported as closing re-publish. | repo owner (fail-open vs fail-closed policy; `WA-POST-DEDUP`) | `docs/BACKLOG.md:224` row; a live-Canvas duplicate-announcement test | when `WA-POST-DEDUP` is dispatched |
| R-2 | Rendered behaviour after a failed take post (idle button after Back to review, alert persistence, notice re-render, focus, `Escape` while loading) | repo owner | browser walk of a forced failure (section 9) | owner-walk row filed with the W1 ship; the verifier cites it UNVERIFIED, not passed |
| R-3 | The behavioural link from `commitPost` to the leaf is source-text only (AC-4/AC-5); no instrument here executes `commitPost` | orchestrator files; implementer builds when asked | a deps-injected `runTakePost(deps)` leaf in the style of `src/lib/take-draft-lifecycle.ts` (`runTakeDraftSave`/`runTakeDraftPostCleanup`), executed with mocked setters and a mocked action. Not recommended now: it moves a 65-line impure function out of a hook with zero tests on it and a refactor that disarms nothing yet is more than a bug-fix wave should carry. It WOULD relieve the 966-line pressure. | a later extraction row, or when the hook next needs headroom |
| R-4 | A real `posted \| refused \| unknown` classifier at the action layer (as `bulk-course-message.ts:31`) so clean refusals could keep a one-click path and class C get exact copy (shape (a')) | orchestrator files if wanted | action-contract test over `createAnnouncementAction` with `canvasFetch`/`canvasRequest` mocked (never `fetch`; repo memory tests-are-network-blocked) | only if (a') is chosen |
| R-5 | `handlePostButtonClick` has no `posting` guard; double-submit within one mount relies on MUI `loading` disabling the button | orchestrator | read-through plus, if wanted, a pure `mayCommit` extension tested in the leaf | a later row; not a defect proven here |
| R-6 | Fork answers (4.2 include-catch; H4 persistent alert). Either answer ends the activity; the work is H1+H2 regardless | repo owner | the one-line questions in 4.2 and in H4 | owner answer; the activity ships as written with the answer applied |
| R-7 | The stale `docs/loop/this-repo.md` section 3 figures ("exactly 12 sub-tab strip entries") against the test's `toHaveLength(9)` at `recording-split.structure.test.ts:147` | orchestrator (loop-maintenance) | `grep -n "toHaveLength" src/app/components/recording/recording-split.structure.test.ts` | a doc-correction row; not part of this wave |
| R-8 | Filing F-T1..F-T4 as rows requires bumping `EXPECTED_ROW_COUNT` (`backlog-file.structure.test.ts:92`, now 115) and regenerating `docs/BACKLOG.md` in the same commit | orchestrator | `npm run test:paths src/tools/backlog/backlog-file.structure.test.ts` | at the filing commit |

---

## 11. Disposition table

Not applicable: first version of this scope; nothing restructured and no prior
requirement dropped. The only inherited items are the walkthrough scope's R-4 and
F-1 (`docs/wa-post-retry-scope.md` sections 10) and the backlog row
`docs/BACKLOG.md:191`, which this document KEEPS as `WA-POST-RETRY-TAKE` and
settles to shape (a) with the take-specific differences in section 3. One
correction to the row: it says "the arm is preserved ... so one click can
re-post"; on this path it is TWO clicks (Back to review, Confirm post) because
the failed stage unmounts the Post button (1.2), and the rejected-promise case
the row asked to be traced is a stuck-UI defect, not a duplicate path (2.2).

## 12. Commands that produced the quantities

- `git rev-parse HEAD`: `57c17e28...`; `git status --short src`: no output.
- `wc -l` and `@(Get-Content <f>).Count`: `useTakeAnnouncement.ts` 966,
  `takeAnnouncementArming.ts` 34.
- `git show bb060dd4 --stat` and `git show bb060dd4 -- src`: the mirrored fix
  (error arm `postArmedFor: null`; `POST_TRANSPORT_FAILURE_MESSAGE`; adapter
  copy `Canvas did not confirm the announcement - ${result.error}. Check the
  course's announcements in Canvas before posting again.`).
- Grep of `useTakeAnnouncement.ts` for `armedFor|setArmedFor|armed|posting|
  setPosting|catch|try {` (Grep tool): lines `:355`, `:564`, `:740`, `:759`,
  `:762`, `:766`, `:771`, `:796`, `:812`, and `try`/`catch` only at `:415`,
  `:432`.
- `grep -n "return;"` over `useTakeAnnouncement.ts`, filtered to `:765-835`:
  `:770` and `:806` (the basis for the drafts-loop wiring-test weakness note).
- `grep -rn "Nothing was posted" src`: only `useTakeAnnouncement.ts:798` on a
  take path (other hits are unrelated bulk-message and lms-generation copy);
  no test pins the take copy.
- `grep -rn "setArmedFor\|commitPost\|armedFor" src --include=*.test.ts`
  (excluding walkthrough): no test asserts on the take hook's arm or `commitPost`
  other than the drafts-loop wiring test's slice.
- `test -f` over every path in the gate line: all `OK`.
