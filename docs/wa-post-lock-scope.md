# WA-POST-LOCK scope: re-publish after a successful walkthrough announcement post

Status: scope + security-seat threat model + fix-shape recommendation. Not a
build, no test code. Authored by the `loop-seat` (Sonnet) for a fresh
`loop-checker` to attack before anything is built from it.

Backlog row: `docs/backlog.yml:1112-1123` (`WA-POST-LOCK`, state `unscoped`,
kind `bug`). Repo HEAD when measured: `b404cb02` (2026-10-04). Working tree has
unrelated uncommitted docs only (`git status --short`: three `M docs/*`, three
`?? docs/*`; nothing under `src/`).

Every quantity below names the command or `file:line` that produced it. Where a
claim is a READ of the code rather than an executed result, it says READ.
Nothing renders under vitest here and there is no live Canvas, so the felt
behaviour is an owner walk (section 9).

Triage record (`docs/loop/seats.md` Triage table): this is a bug fix, so no
LEVERAGE CLAIM (`DEV_LOOP.md` "The loop / Criteria": not for a bug fix) - the
fired trigger is "bug fix". Data/storage seat: trigger NOT fired (nothing
persisted, section 5). Security seat: fired (irreversible outward publish; this
document is that pass). UX seat: fires at the build (a user-visible disabled
control and a hint line); copy is proposed in section 6 for the checker.
Accessibility: fires (focus on a control that becomes disabled), as a READ
claim only.

---

## 1. The bug, confirmed against the tree

Verdict: CONFIRMED by READ. The backlog row's line numbers have shifted; the
current ones are given. The row's claim about what is missing is exact.

### 1.1 The trace (READ, every hop opened)

State after a successful post, from `slotsReducer`'s `"post-result"` success
arm, `src/app/components/walkthrough-announcement/announcement-draft-slots.ts:538-551`
(success return at `:543-549`):

| Field | After success | Source line |
|---|---|---|
| `posting` | `false` | `:545` |
| `postedTo` | course name | `:546` |
| `postedScheduledLabel` | label or `null` | `:547` |
| `postArmedFor` | `null` | `:548` |
| `draft` | UNCHANGED - still `{phase: "drafted", draft: <same title/message>}` | not touched by the arm |

Nothing in that arm, or anywhere else in the reducer, records "this exact
content went out" in a form that blocks a second post. `postedTo` is only READ
for display (`AnnouncementDraftSlot.tsx:360-377`) and for the run-complete
decision (`walkthrough-run-decisions.ts:43-45`).

Then the second post is reachable by the normal two clicks:

1. Post button's `disabled` expression is
   `AnnouncementDraftSlot.tsx:278-283`: `!courseName || !title.trim() ||
   !message.trim() || visibility.kind === "invalid"`. FOUR conditions, none
   reads `slot.postedTo`, `slot.posting` or any posted flag. With a course
   chosen and the text unchanged, it evaluates `false` (enabled). (The backlog
   row cited `:296-309`; that was the pre-`4207f23d` position.)
2. Click 1 (`onArm`, `:284`) -> `onPostArm(slot.id)` -> `armPost`
   (`useAnnouncementDraftSlots.ts:467-480`). `postSignatureFor(slot)`
   (`:205-214`) is non-null for a drafted slot; `slot.postArmedFor` is `null`
   (cleared by `:548`), so it is not equal -> dispatch `arm-post`
   (`:477`) -> `postArmedFor` set (`announcement-draft-slots.ts:523-528`).
3. Click 2 (`onConfirm`, `:285`, which is ALSO `onPostArm`) -> `armPost` again;
   `slot.postArmedFor === signature` -> `commitPost(id)` (`:473-476`).
4. `commitPost` (`:423-465`): requires only `slot` found and
   `slot.draft.phase === "drafted"` (`:426`); resolves visibility; calls
   `argsRef.current.postDraft(title, message, postArgsFor(decision))` (`:443`).
   It never reads `slot.postedTo` or `slot.posting`.

So the second `postDraft` runs with identical title and message. Confirmed.

### 1.2 The gap, exact citation

The missing lock has two coupled absences, both citable:

- GAP-A (state): the `"post-result"` success arm,
  `announcement-draft-slots.ts:543-549`, sets no flag that means "this content
  is already on Canvas, do not post it again".
- GAP-B (enforcement): neither the UI gate (`AnnouncementDraftSlot.tsx:278-283`)
  nor the commit layer (`useAnnouncementDraftSlots.ts:423-426` and `:467-472`)
  consults any posted signal.

An adjacent fact that shapes the fix (READ): the `"edit"` arm
(`announcement-draft-slots.ts:453-466`) does NOT clear `postedTo` (it clears
`postArmedFor`, `regenerateArmed`, `copyError`, `copied` only). Only the
`"result"` success arm (a fresh Regenerate result, `:510-520`) clears `postedTo`.
So `postedTo !== null` already means "this slot has posted at some point in this
draft lineage", NOT "the draft on screen is the draft that was posted". That is
why the lock cannot simply be `postedTo !== null` (section 3, shape (a-naive)).

### 1.3 Blast radius (READ, the post action opened)

- `postWalkthroughAnnouncementAction`, `src/app/actions/walkthrough-announcement.ts:595-609`:
  `requireUser()` then `createAnnouncementFromMarkdown(courseUrl, title,
  markdownBody, acronym, delayedPostAt)`. No dedupe, no idempotency key, no
  "already posted" read.
- `createAnnouncementFromMarkdown`, `src/lib/canvas/announcements.ts:420-458`:
  one `POST ${baseUrl}/api/v1/courses/${courseId}/discussion_topics` with
  `is_announcement=true` (`:432-452`). Each call creates a NEW topic. The only
  server-side variation is `delayed_post_at` (`:436-442`).
- Reach: a course-wide announcement. The arm notice itself says it publishes
  "to every student in {courseName}" and that the app "cannot recall or delete
  it afterward" (`AnnouncementDraftSlot.tsx:340-349`). A second call therefore
  produces a second visible announcement to the same audience. On the scheduled
  path it produces a second scheduled announcement.
- NOT verified here (no live Canvas, tests are network-blocked per
  `vitest.setup.ts`): whether Canvas sends a second notification per
  announcement, and its student-side presentation of duplicate topics. Do not
  state either as measured. The student COUNT (the "N" in the task prompt) is
  not available on the slot or in the arm notice as I read them; I did not
  search the panel for a roster count, so any shape that needs "N" carries an
  unmeasured data-source cost (section 3, shape (b)).

Severity: irreversible and outward-facing, as the row says. Required click
count to trigger from the post-success state: 2 (Post, Confirm post) - the
same cost as the first post.

---

## 2. Adjacent findings from the same READ (filed as residuals, not fixed here)

These are the same threat class (a second POST of the same content). They are
reported because the security seat's job is the threat, not just the row's
named path. None is in this wave's recommended write set except where stated.

- ADJ-1, one-click retry after an AMBIGUOUS failure. The `"post-result"` error
  arm, `announcement-draft-slots.ts:540-542`, sets `posting: false` and
  `postError` and leaves `postArmedFor` untouched. The panel derives
  `postArmed` as `isConfirmArmed(slot.postArmedFor, postSignatureFor(slot))`
  (`WalkthroughAnnouncementPanel.tsx:765`); the draft is unchanged so the
  signature still matches, so the button still reads "Confirm post" and ONE
  click re-posts. For a Canvas refusal the message says "Nothing was posted"
  (`useWalkthroughGenerationAdapters.ts:90`), so retry is safe. For a rejected
  promise the message is "the post may or may not have gone through"
  (`useAnnouncementDraftSlots.ts:460`) - there the one-click retry can
  duplicate. Fixing it needs a decision (clear the arm on rejection only, or an
  "uncertain" state), which is a product fork, so it is a separate row (R-3).
- ADJ-2, in-flight guard. Neither `armPost` nor `commitPost` reads
  `slot.posting`. The mouse/keyboard double-click window is believed closed
  because `ConfirmArmButtons` passes `loading` to a MUI `Button`
  (`src/app/components/ui/ConfirmArmButtons.tsx:96-108`; per the repo's own
  memory note, MUI `loading` disables the button) and because React flushes
  effects before the next discrete input. But `slotsRef.current` is refreshed
  only in a `useEffect` (`useAnnouncementDraftSlots.ts:269-272`), and the file's
  own comment concedes the guard is "NOT safe against two ... clicks landing
  inside the same event-processing tick" (`:264-266`, written about Generate;
  the same stale-ref read feeds `armPost`). Likelihood low, cost to harden is a
  one-line check that the recommended wave already touches (section 4, D3).
  Unproven in a browser; owner-walk cannot reproduce a same-tick double event
  either, so it is hardened rather than measured.
- ADJ-3, scope of "same session". Everything above is per-tab React state. A
  second browser tab, a second device, or a reload-then-regenerate cannot be
  seen by any client-side lock. Only a server-side check closes that (shape
  (d)). See section 3 and R-2.

---

## 3. Fix shapes

Legend. "Prevents" = after the shape ships, the bug's path cannot publish the
unchanged draft again without a deliberate, different act. "Warns" = the same
two clicks still publish.

Common constraints every shape must respect (each verified by reading the
pinned artefact named):

- Keep arm-then-confirm: `onArm`/`onConfirm` both call `onPostArm`
  (`AnnouncementDraftSlot.tsx:284-285`); `armPost` posts only on the second call
  with a matching signature (`useAnnouncementDraftSlots.ts:473-476`). Pinned by
  `walkthrough-announcement-timing.structure.test.ts` and
  `useAnnouncementDraftSlots.test.ts` per the backlog row; I read the
  `commitPost` forwarding pin at `useAnnouncementDraftSlots.test.ts:236-258`
  and the label pins at `walkthrough-announcement-timing.structure.test.ts:219-243`.
  None of them may be loosened.
- Do not change the meaning of `postedTo` (row note; `isRunComplete`,
  `walkthrough-run-decisions.ts:43-45`, and the panel's fresh-run decision at
  `WalkthroughAnnouncementPanel.tsx:500-515` read it).
- Do not touch the idle/confirm LABELS' ternary shape: the label pins regex on
  `idleLabel={isScheduled ? "..." : "..."}` and the sibling props
  (`walkthrough-announcement-timing.structure.test.ts:219-243`). Do not add a
  `useEffect` to `AnnouncementDraftSlot.tsx`: its count is frozen at 1
  (`AnnouncementDraftSlot.structure.test.ts:51-52`; `grep -c "useEffect("
  AnnouncementDraftSlot.tsx` = 1).
- Do not insert a nested `)}` inside the `{slot.postedTo && (` block: the A32
  pin slices from that anchor to the first `)}` after it
  (`walkthrough-announcement-timing.structure.test.ts:276-277`). Add any new JSX
  as a SIBLING block, not inside it.

### Shape (a): hard lock flag, cleared by edit or Regenerate  [RECOMMENDED]

A new in-memory boolean on `DraftSlot`, `postLocked`, true after a successful
post, cleared whenever the content changes.

- Reducer (`announcement-draft-slots.ts`): add `postLocked: boolean` to
  `DraftSlot` (near `:129`) and `makeSlot` (`:367-383`, `false`); `"post-result"`
  success sets `true` (`:543-549`); `"edit"` sets `false` (`:457-464`);
  `"result"` success sets `false` (`:510-520`, beside the existing clears).
  `"choose"`, `"choose-timing"`, `"set-scheduled-at"`, `"arm-post"`,
  `"cancel-post"`, `"copy-result"`, `"posting"`, `"post-result"` error do NOT
  clear it (none change what would be posted; a schedule-only change is still a
  duplicate announcement).
- Pure leaf decision (new, exported from `announcement-draft-slots.ts`):
  `mayCommitPost(slot): boolean` = drafted AND not locked AND not posting. This
  is the same "pull the decision into a pure function so a test can execute it"
  idiom as `resolvePostCommit`/`postArgsFor`/`postResultFor`
  (`useAnnouncementDraftSlots.ts:147-193`).
- Enforcement, two layers (belt and braces, the repo's cannot-overwrite pattern
  in `walkthrough-run-decisions.ts:23-25`): the hook's `armPost`
  (`:467-480`) returns early unless `mayCommitPost(slot)` (covers BOTH the arm
  and the commit click; also closes ADJ-2); the component adds
  `|| slot.postLocked` to the Post `ConfirmArmButtons` `disabled=`
  (`AnnouncementDraftSlot.tsx:278-283`).
- Hint (UX): a SIBLING conditional after the `{slot.postedTo && (` block
  (`:360-377`) telling the instructor how to post again (copy, section 6).
- Files touched: `announcement-draft-slots.ts`, `AnnouncementDraftSlot.tsx`,
  `useAnnouncementDraftSlots.ts`. NOT the panel (the lock is read off `slot`
  directly, unlike `postArmed`, which needs the panel's signature).
- New persisted state: NO. In-memory, same lifetime as `postedTo`. No `ta-`
  key, so the directory key canary stays at `size===6`
  (`walkthrough-announcement.structure.test.ts:107-114`). No new phase: the
  lock is an orthogonal flag, NOT a member of `SlotDraft["phase"]`
  (`announcement-draft-slots.ts:91-96`), so `shouldScrollDraftIntoView` and its
  oracle are untouched. No new action type, so the 17-member `Record`
  canary stays (`announcement-draft-slots.test.ts:772-797`).
- Canaries that DO move: the frozen reset oracle
  `announcement-draft-slots.test.ts:829-847` is a full-object `toEqual` of the
  initial slot; adding a field makes it RED until `postLocked: false` is added
  in the same commit. This is the intended behaviour of a frozen oracle, not a
  collision to avoid; the implementer must update it, and the checker must see
  that the literal was edited by hand to `false`, not derived from `makeSlot`.
- Click cost: normal post-once flow = unchanged (Post, Confirm post = 2 clicks;
  `AnnouncementDraftSlot.tsx:270-292` same elements). Re-post of an EDITED
  draft = unchanged from today (edit, then 2 clicks). Re-post of an UNCHANGED
  draft = blocked. Re-post by Regenerate = 2 clicks to regenerate (existing
  arm/confirm at `:293-305`) + 2 to post, same as today.
- Prevents or warns: PREVENTS, for the same tab and session.
- Known behaviours (accepted, each pinned in section 7):
  - edit-then-revert: typing a character and deleting it unlocks. That is two
    deliberate keystrokes in a text field; the threat is accidental or
    double-submit, not deliberate.
  - edit during an in-flight post: `"edit"` clears a flag that is still
    `false`; then `"post-result"` sets `true` against the NEWER text. The lock
    lands on text that was not the posted text. Fail-safe (the instructor edits
    once more to unlock), never fail-open.

### Shape (a-signature): signature-keyed lock

Store the content signature at commit time and derive the lock by comparing it
to the current signature, in the style of `isConfirmArmed`
(`content-tab/modules/confirmArming.ts:26`, and its header argument against
boolean-plus-effect flags at `postConfirmArming.ts:8-14`).

- Eliminates the edit-during-post and edit-then-revert quirks (reverting to the
  posted text re-locks, correctly).
- Costs: the `post-result` payload must carry the signature, so
  `postResultFor` (`useAnnouncementDraftSlots.ts:188-193`) and its pinned call
  site (`useAnnouncementDraftSlots.test.ts:248-257`, the regex
  `result:\s*postResultFor\(decision,\s*result\)`) and four reducer tests
  (`announcement-draft-slots.test.ts:605-627`, `:638-643`, plus `:816`) change;
  a content-only signature function is new; the panel needs a new prop beside
  `postArmed` (`WalkthroughAnnouncementPanel.tsx:765`), and the panel is at 839
  lines (`@(Get-Content ...).Count`; `wc -l` agrees). Four prod files instead of
  three, and it edits tests that are currently green and load-bearing (A32
  forwarding pins).
- Prevents. Rejected as the first wave: the extra surface buys only two quirks
  that fail safe. If the checker disagrees with that weighing, this is the
  upgrade path and it does not change the lock's meaning.

### Shape (a-naive): `postedTo !== null` as the lock

Rejected. Because `"edit"` does not clear `postedTo` (section 1.2) it would
lock the slot even after the instructor fixes a typo, and the only escape would
be Regenerate, which DISCARDS the hand edit (`AnnouncementDraftSlot.tsx:354-358`
says "anything typed above will be lost"). That traps the legitimate correction
re-post behind a destructive action. Changing `"edit"` to clear `postedTo`
instead would change `postedTo`'s meaning, which the row forbids.

### Shape (b): arm notice names the earlier post, distinct confirm

Keep Post enabled; when posted-and-unchanged, show "already posted at HH:MM -
posting again will re-publish to all N students" and require a further confirm.

- Files: `AnnouncementDraftSlot.tsx` (notice at `:335-353`), `announcement-draft-slots.ts`
  (needs a posted timestamp, which is not stored today - `postedTo` and
  `postedScheduledLabel` only, `:129-139`), the hook (a third click state), tests.
- The advantage claimed for (b), "no new state", is false: to tell an unchanged
  re-post from an edited re-post it needs the same new state as (a) (the
  `postedTo` flag cannot distinguish them, section 1.2). And "N students" has no
  source on the slot (section 1.3).
- Click cost: a re-post of unchanged content costs an extra click (a third).
  If it does NOT distinguish edited from unchanged, every legitimate correction
  pays that click too, violating minimize-clicks.
- Prevents or warns: WARNS. Still publishes after a deliberate extra
  confirmation; it does nothing for an accidental double-submit that carries the
  extra click with it (a user who has learned "click, click" will click three
  times). Also adds a THIRD confirm step beside the two already pinned.

### Shape (c): hard lock plus an explicit "Post again" unlock control

(a) plus a text button that clears the lock, so the escape is discoverable
rather than "type a character".

- Needs a new reducer action, so `SlotsAction` goes 17 -> 18: the `Record`
  canary (`announcement-draft-slots.test.ts:778-797`) and its "17" count and
  the comment at `announcement-draft-slots.ts:415` change; `useAnnouncementDraftSlots.ts`
  gains a callback; the panel passes a prop (`:775` neighbourhood).
- Click cost: 1 extra click, only on the rare "re-send identical content" path.
- Prevents (the unlock is a deliberate separate control, not part of the
  arm/confirm pair).
- Not recommended for wave 1: the lock hint already names the two escapes
  (edit, Regenerate), it adds an action, a prop and a canary bump, and the
  only case it serves that (a) does not is "re-send byte-identical content".
  It is the right answer if the owner reads that case as common (section 8).

### Shape (d): server-side duplicate refusal

In `postWalkthroughAnnouncementAction` (`walkthrough-announcement.ts:595-609`),
read the course's recent announcements (`listAnnouncements`,
`src/lib/canvas/announcements.ts:210`) and refuse an exact title+message match.

- Closes what no client lock can: second tab, second device, reload (ADJ-3),
  and the ambiguous-failure retry (ADJ-1) when the first POST did succeed.
- Costs: an extra Canvas read per post (latency, rate-limit exposure); a new
  failure mode (read fails: fail open defeats it, fail closed blocks the post);
  a false-positive class (instructors reuse titles weekly; title+message is
  safer than title alone but identical weekly boilerplate would be refused);
  and it cannot be verified here at all (no live Canvas; tests are
  network-blocked, so only a mocked `canvasFetch` could drive it).
- Prevents (server-side) but is a larger, different, unverifiable-here change.
  Not this wave. Recorded as residual R-2.

Precedent for hard locks in this repo (READ): the sibling surface
`TakeAnnouncementPanel`/`useTakeAnnouncement` already enforces "no second post"
by replacing the whole form with an "Announcement posted" view once `posted` is
set (`useTakeAnnouncement.ts:119-126` names it the AC25f guarantee;
`TakeAnnouncementPanel.tsx:253-269`). A hard lock on the walkthrough surface is
consistent with how this app already treats the same irreversible act.

---

## 4. Security-seat threat model

Threat: an accidental or double-submit mass re-publish of the same announcement
to every student in a course. Asset: the course's student-facing announcement
feed and (unverified here) Canvas notifications. Property wanted: after a
successful post, the same unchanged content cannot be published again by an
accident-prone path.

Attack/accident paths traced (all READ):

| # | Path | Closed by (a) | Closed by (b) | (c) | (d) |
|---|---|---|---|---|---|
| T1 | Post -> Confirm -> (success) -> Post -> Confirm, same tab (the row's bug) | Yes, hard | No, warns | Yes | Yes |
| T2 | Habitual click-click after success (muscle memory) | Yes | No (learns the third click) | Yes | Yes |
| T3 | Double-click on Confirm while posting (ADJ-2) | Yes via `mayCommitPost` posting check | No | Yes | Partly |
| T4 | One-click retry after ambiguous network failure (ADJ-1) | NO | NO | NO | Yes if first POST landed |
| T5 | Second tab / device / reload then regenerate-same-text and post | NO | NO | NO | Yes |
| T6 | Legitimate correction re-post (edited text) | Allowed: edit clears lock | Allowed (but pays extra click unless new state) | Allowed | Allowed (different message) |
| T7 | Legitimate identical re-send | Blocked; escape = type a character or Regenerate | Allowed after extra confirm | Allowed via Post again | Blocked server-side, no client escape |

Judgement:

- (a) CLOSES the named threat (T1-T3) for a single tab. It does NOT close T4,
  T5 (those are mitigated only by (d) or by a separate decision on T4); say so
  in the owner note rather than letting "locked" read as "safe".
- (b) only MITIGATES (T1/T2 still one confirm away). It fails the
  irreversible-publish bar because the cost of a miss is a mass publish while
  the protection is one more click a habitual user will make.
- Does a hard lock trap a legitimate re-post? T6 no (any edit unlocks). T7 yes,
  mildly: the escape is an edit or Regenerate, and the hint names both, so the
  instructor is never stuck without a way forward. Regenerate is NOT disabled
  by the lock (it is the escape): its `ConfirmArmButtons` (`:293-305`) carries no
  `disabled` today and must not gain one.
- Fail direction check: every quirk of (a) fails SAFE (a lock that stays too
  long needs one edit; a lock that is too short does not exist because the
  reducer sets it only on confirmed success). The one fail-open edge is not the
  lock's: a failed `postDraft` (error arm) leaves the slot unlocked by design,
  because a Canvas refusal means nothing was posted (T4 is that edge's ambiguous
  sibling, ADJ-1).
- Auth: `postWalkthroughAnnouncementAction` calls `requireUser()`
  (`walkthrough-announcement.ts:603`), which is the established gate for this
  file (header comment `:19-21` names why not `requireOwner`). No change to
  authorization is needed or proposed; the lock is client-side UX state, not an
  access control, and I do not claim it protects against a caller who invokes
  the server action directly (a signed-in user can already post any text; that
  is the feature).

---

## 5. Data / storage

Nothing persisted. `postLocked` lives in reducer state like `postedTo`,
`postArmedFor` and `scheduledAt` (the latter's non-persistence is deliberate,
`announcement-draft-slots.ts:112-122`). No `ta-` key added; the directory
canary `walkthrough-announcement.structure.test.ts:107-114` (distinct keys
===6) is unaffected and need not move. Lifetime: lost on reload, as the draft
itself is today.

COUPLING (R-1): `WA-DRAFT-LOSS` (`docs/backlog.yml:1124-1135`) may persist
drafts (its shape (b)). If it does, the lock MUST persist with the restored
draft or a reload would restore an UNLOCKED copy of a posted announcement - the
bug reappearing through the other row. That is the same hazard from the other
side that row's note already names for `postedTo`. It binds that row's scope,
not this wave.

---

## 6. Proposed copy (for the UX checker; READ-level, nothing renders)

A SIBLING element, after the `{slot.postedTo && (` block, shown only while
`slot.postLocked`:

    This draft is already on Canvas. Edit the subject or message, or
    Regenerate, to post it again.

- Uses the existing `styles.fieldHint` paragraph class, `role="status"
  aria-live="polite"`, matching the neighbouring status lines
  (`AnnouncementDraftSlot.tsx:246`, `:258`, `:361`).
- Accurate on both the immediate and scheduled paths ("on Canvas" is true of
  both; the existing success sentence carries the scheduled/immediate
  specifics).
- No emoji (`src/lib/no-emojis.test.ts` scans `src` and `docs`).
- The Post button's own labels do not change (pins, section 3).

Accessibility, READ claim only: a MUI `Button` that becomes `disabled` after
the user's own click may drop keyboard focus to `<body>`. Not measurable here.
Already true of the in-flight `loading` state (`ConfirmArmButtons.tsx:103-104`).
Owner walk item (R-4).

---

## 7. Recommendation, wave plan and machine-checkable AC

Recommend shape (a) (hard `postLocked` flag, cleared by `"edit"` and by a fresh
`"result"`, enforced in the reducer's consumers by a pure `mayCommitPost` and
in the Post button's `disabled=`) - because it is the only candidate that
closes the named double-publish path without adding a click to the post-once
flow, without changing `postedTo`'s meaning, and without trapping a correction
(any edit unlocks).

Product fork flag (one line, owner-confirmable, NOT blocking, proceed on (a)):
hard lock with edit/Regenerate escape (recommended) vs hard lock plus an
explicit "Post again" control (shape (c), +1 reducer action, 17 -> 18). Reading
acted on: (a). Answering (c) costs one added action, one prop and one canary
bump layered on the same wave; no rework of anything in (a).

### Wave plan: ONE wave, W1

Single implementer (`loop-implementer`), one small write set. Write set (exact
paths):

Production:
1. `src/app/components/walkthrough-announcement/announcement-draft-slots.ts`
2. `src/app/components/walkthrough-announcement/AnnouncementDraftSlot.tsx`
3. `src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.ts`

Tests (the files that assert on the behaviour being changed; the frozen reset
oracle is in the first):
4. `src/app/components/walkthrough-announcement/announcement-draft-slots.test.ts`
5. `src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.test.ts`
6. a source-pin location chosen by the test-author seat: either
   `AnnouncementDraftSlot.structure.test.ts` (frozen counts live there; a new
   describe is legitimate) or `walkthrough-announcement-timing.structure.test.ts`.

Caller coverage ("every wave includes the file that CALLS each new export"):
`mayCommitPost` (new export, file 1) is called by `armPost` in file 3;
`postLocked` is read by file 2 and file 3. No export is left without a caller
inside the write set. `WalkthroughAnnouncementPanel.tsx` is deliberately NOT in
the write set (it needs no new prop); its `slot` already flows to
`AnnouncementDraftSlot` unchanged (`:753-779`).

Disjointness: no other open row owns these files besides `WA-DRAFT-LOSS`
(`owns` at `docs/backlog.yml:1129` lists the panel, the hook and the slots leaf,
so it SHARES files 1 and 3 with this wave). Compute: this wave's prod set
intersected with WA-DRAFT-LOSS's `owns` = `announcement-draft-slots.ts` and
`useAnnouncementDraftSlots.ts`. Non-empty, so do NOT run them simultaneously;
serialize. Order: WA-POST-LOCK first (smaller, a safety bug, and WA-DRAFT-LOSS's
persistence decision must then carry `postLocked`, R-1).

Collision with recently shipped work (measured, `git log --oneline -5 --
.../AnnouncementDraftSlot.tsx`): the file's last commit is `4207f23d`
(WALKTHROUGH-OVERHAUL S2+M8, COMPLETE) preceded by `494826ec` (SMOOTH-WALKTHROUGH
W3, COMPLETE). SMOOTH-WALKTHROUGH and WALKTHROUGH-OVERHAUL are finished, so the
file is settled; the backlog's "scope this before W3" ordering is moot. Current
line numbers (shifted from the row's `:296-309`, `:342-359`, and from
`:528-539` in the leaf): post `disabled=` `AnnouncementDraftSlot.tsx:278-283`;
post `ConfirmArmButtons` `:270-292`; arm notice `:335-353`; posted status
`:360-377`; the one `useEffect` `:106-111`; leaf `"post-result"`
`announcement-draft-slots.ts:538-551`. Sizes (`@(Get-Content <f>).Count`,
`wc -l` agrees): `AnnouncementDraftSlot.tsx` 392, `announcement-draft-slots.ts`
567, `useAnnouncementDraftSlots.ts` 534, `announcement-draft-slots.test.ts` 866,
panel 839 (untouched). None approaches 1000 after the expected additions
(~25-40 lines across the three prod files).

Confirm step involved: YES, two existing confirms are in play and NEITHER may be
weakened. The Post arm-then-confirm (`AnnouncementDraftSlot.tsx:284-285`;
`armPost` second-call commit `useAnnouncementDraftSlots.ts:473-476`) and the
Regenerate arm-then-confirm (`:293-305`) stay byte-identical in behaviour. This
change ADDS a lock; it removes and loosens no guard. It is distinct from
`GR-POST-ONE-CONFIRM` (`docs/backlog.yml:1136-`; grader per-row Post, shared
`GradingResults.tsx`) and `RG-GRADEALL-CONFIRM`, which add a confirm where one
is missing; no shared file with either (`GradingResults.tsx` is not in the write
set).

### Machine-checkable acceptance criteria

Form: object under comparison, instrument, direction of failure. Gate commands
use the wrapper, one path per argument, never a raw multi-path `vitest`:

    npm run test:paths src/app/components/walkthrough-announcement/announcement-draft-slots.test.ts src/app/components/walkthrough-announcement/useAnnouncementDraftSlots.test.ts src/app/components/walkthrough-announcement/AnnouncementDraftSlot.structure.test.ts src/app/components/walkthrough-announcement/walkthrough-announcement-timing.structure.test.ts src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts src/app/components/walkthrough-announcement/walkthrough-run-decisions.test.ts
    npx tsc --noEmit
    npx eslint src/app/components/walkthrough-announcement

(plus the repo's `docs:gate` line from `package.json:22` if `docs/` changes.)
The last six test paths are the existing tests that assert on this behaviour;
the wave gate must run all of them, not only the edited ones.

- AC-1 (state is set on success). Object: `slotsReducer` output slot after
  `post-result` with `{course, scheduledLabel}`. Instrument: reducer test in
  `announcement-draft-slots.test.ts`, for BOTH `scheduledLabel: null` and a
  label. Fails RED if `postLocked` is not `true` (`false`/`undefined`).
- AC-2 (failure stays re-postable). Object: slot after `post-result {error}`.
  Instrument: same file. Fails RED if `postLocked` becomes `true` (a refused or
  failed post must not lock the draft).
- AC-3 (what unlocks and what does not), table-driven over every action type.
  Object: `postLocked` on a locked drafted slot after each of the 17 action
  types. Instrument: an expected-value table typed
  `Record<SlotsAction["type"], "clears" | "keeps" | "n/a">` in the test, so tsc
  refuses a missing key (the C1 pattern, `announcement-draft-slots.test.ts:778-797`);
  the axes come from the type, the expectations are hand-written. Pass:
  `edit` and `result` (success) clear; `choose`, `choose-timing`,
  `set-scheduled-at`, `arm-post`, `cancel-post`, `copy-result`, `posting`,
  `post-result` (error), `arm-regenerate`, `cancel-regenerate`,
  `regenerate-started` keep. Fails RED if any clears when it should keep (a
  schedule change must NOT unlock) or keeps when it should clear (an edit must).
- AC-4 (`postedTo` meaning unchanged). Object: `postedTo`/`postedScheduledLabel`
  after (post -> edit). Instrument: reducer test. Fails RED if `postedTo`
  becomes `null` on edit. Plus `isRunComplete` (`walkthrough-run-decisions.ts:43`)
  still `true` for that slot, driven through the real function. This is the F4
  guard the backlog row names.
- AC-5 (frozen reset oracle). Object: the literal at
  `announcement-draft-slots.test.ts:829-847`. Instrument: the existing test with
  `postLocked: false` added BY HAND in the same commit. Fails RED if the field is
  absent from `makeSlot` or defaults truthy. Checker: confirm the literal was not
  rewritten to derive from `makeSlot`.
- AC-6 (the pure decision). Object: `mayCommitPost(slot)` over the 2x2x3 grid
  `{locked, posting, phase in (empty, drafting, drafted)}`. Instrument: unit
  test with a generator for the axes and a hand-written expected table (true only
  for drafted, unlocked, not posting). Fails RED if any locked, posting or
  non-drafted cell returns `true`.
- AC-7 (enforced at the commit layer). Object: source of `armPost` in
  `useAnnouncementDraftSlots.ts`, sliced between `const armPost = useCallback(`
  and `const cancelPost` (the same slice-and-pin technique as
  `useAnnouncementDraftSlots.test.ts:239`). Instrument: source-text pin. Fails
  RED if `armPost` does not call `mayCommitPost` before reaching `arm-post` or
  `commitPost`. NAMED sabotage: delete that call; the pin must go red on the REAL
  file (restore from a `cp` backup, not `git checkout`).
- AC-8 (enforced at the control). Object: the Post `ConfirmArmButtons`
  `disabled=` expression, bounded from `idleLabel={isScheduled ? "Schedule post"`
  to `onArm=` in `AnnouncementDraftSlot.tsx`. Instrument: source-text pin that
  it contains `slot.postLocked` AND still contains the four existing conditions.
  Fails RED if `postLocked` is dropped or any of the four is removed.
- AC-9 (Regenerate is the escape, never disabled by the lock). Object: the
  Regenerate `ConfirmArmButtons` block (`idleLabel="Regenerate"` to its closing
  tag). Instrument: source-text pin that the block does not contain
  `postLocked`. Fails RED if the lock leaks onto Regenerate (that would trap a
  re-post).
- AC-10 (no confirm weakened). Object: both `ConfirmArmButtons` wirings. Instrument:
  source pin that `onArm={() => onPostArm(slot.id)}` and
  `onConfirm={() => onPostArm(slot.id)}` are still both present, plus the
  existing `armPost` commit-on-second-call logic (`:473-476`) still reachable.
  Fails RED if either handler is removed or `armPost` commits on the first call.
- AC-11 (hint is a sibling, not inside the pinned block). Object:
  `AnnouncementDraftSlot.tsx` source. Instrument: a pin that the string
  `slot.postLocked && (` occurs OUTSIDE the slice that starts at
  `{slot.postedTo && (` and ends at the first `)}` after it; and the existing
  A32 describe (`walkthrough-announcement-timing.structure.test.ts:273-301`)
  stays green UNCHANGED. Fails RED if the hint is nested in that block.
- AC-12 (in-flight edit fails safe). Object: slot after the sequence
  `posting` -> `edit` -> `post-result` success. Instrument: reducer sequence
  test. Pass: `postLocked === true`. Documents the accepted quirk of section 3;
  a future change to the signature shape (a-signature) would revise this
  assertion deliberately.
- AC-13 (frozen counts untouched). Object: `useEffect(` count in
  `AnnouncementDraftSlot.tsx` and the 17-member canary and the `size===6` key
  canary. Instrument: the three existing tests, unedited except AC-5. Fails RED if
  an effect, an action type or a `ta-` key is added.
- AC-14 (no emoji, bytes clean). Instrument: `src/lib/no-emojis.test.ts` and
  `src/source-bytes.structure.test.ts` (the docs:gate pair).

Removal test: none (bug fix; no leverage claim, section 0). Not buildable and
not owed.

What cannot be asserted by any test here, and is an owner walk: that the Post
button actually renders disabled after a real post; that the hint line reads and
is announced; where focus lands (section 9).

---

## 8. Open product forks (non-blocking, reading acted on)

- F-1: hard lock with edit/Regenerate escape (acted on) vs hard lock plus an
  explicit "Post again" control (shape (c)). Alternative cost: +1 action
  (17 -> 18), +1 prop, canary bump; zero rework of (a).
- F-2: whether to ALSO harden T4 (ambiguous-failure retry) in this wave.
  Recommended reading acted on: NO, file separately (R-3), because its fix has
  its own fork (clear the arm on rejection vs an "uncertain" state) and it is
  independent of the lock.

---

## 9. Residual register

Each: owner, instrument, step. A residual missing any is a deletion.

- R-1 `WA-DRAFT-LOSS` must persist the lock with a restored draft.
  Owner: the scoper of `WA-DRAFT-LOSS`. Instrument: its own scope's
  acceptance criteria - a reducer/persistence test that a restored posted draft
  has `postLocked === true` (or that restore refuses posted drafts). Step: that
  row's scoping round, which must read this section; the orchestrator adds the
  cross-reference to that row's note when closing this wave.
- R-2 Cross-tab / cross-device / reload re-publish (ADJ-3, T5; shape (d)).
  Owner: orchestrator files a new backlog row (suggested id `WA-POST-DEDUP`).
  Instrument: a source test on `postWalkthroughAnnouncementAction` plus a mocked
  `canvasFetch` (never real fetch; `vitest.setup.ts` throws on it) driving
  `listAnnouncements`. Step: that row's scope, which decides the fail-open vs
  fail-closed and the title+message false-positive question. Cannot be verified
  against live Canvas here.
- R-3 One-click retry after an AMBIGUOUS post failure (ADJ-1).
  Owner: orchestrator files a new backlog row (suggested id `WA-POST-RETRY`).
  Instrument: a reducer test that a rejected-promise failure does not leave the
  slot one click from re-posting (exact assertion depends on the fork). Step:
  that row's scope, deciding between clearing `postArmedFor` on rejection only
  and an "uncertain" state; `useAnnouncementDraftSlots.ts:456-461` and
  `announcement-draft-slots.ts:540-542` are the sites.
- R-4 Felt behaviour: Post disabled after a real post, hint visible and
  announced, focus after the button disables, edit-one-character re-enables.
  Owner: repo owner. Instrument: owner walk. Step: add four lines to the
  existing owner-walk residual `WA-S2M8-WALK` (`docs/backlog.yml:1316`) or
  its successor, run at the next walkthrough walk.
- R-5 Canvas-side behaviour of a duplicate topic (second notification,
  student presentation). Owner: repo owner. Instrument: observation on a
  throwaway course. Step: only needed if the owner wants to size the severity
  for the shape (d) decision; not a blocker for (a).
- R-6 `postLocked` and the edit-during-post/edit-then-revert quirks are
  accepted behaviours of shape (a), pinned by AC-12 (not residual) and the
  edit-then-revert case by AC-3's `edit` row. If the checker rules those
  quirks unacceptable, the response is the (a-signature) upgrade, not a
  second flag.

Disposition table: not applicable. This is a first scope for the row, not a
restructuring of a prior version; the only prior text is the backlog row's two
candidates, dispositioned as (a) = recommended, (b) = rejected as warn-only, with
the evidence in section 3.

## 10. What I could not determine

- Whether Canvas notifies students per announcement and how it presents
  duplicates (R-5). No live Canvas, no network.
- The student count "N" for any warn-style notice; I did not search the panel
  for a roster source.
- Browser behaviour of focus after a button disables, and of a same-tick double
  event (ADJ-2); reading claims only, nothing renders here.
- Whether `walkthrough-announcement-timing.structure.test.ts` and
  `walkthrough-announcement.structure.test.ts` contain any further pin on the
  Post `disabled=` expression beyond those I opened. I grepped
  `disabled` across `walkthrough-announcement/*.test.ts` and found only the
  Generate button's pin (`walkthrough-announcement.structure.test.ts:422-423`)
  and the Start button's (`:949-953`); the wave gate runs all six paths above
  and will surface any I missed.
- I did not execute a reducer trace; section 1 is a READ. The first RED test of
  the build (AC-1 written first, expecting failure at HEAD) is the executing
  confirmation of the bug and should be the implementer's first run.
